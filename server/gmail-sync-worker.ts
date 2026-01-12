import { google, gmail_v1 } from 'googleapis';
import { db } from './db';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import { 
  gmailSyncState, 
  gmailMessages, 
  gmailMessageMatches,
  gmailUnmatchedEmails,
  userGmailConnections,
  customers,
  customerContacts,
  emailSalesEvents,
  InsertGmailMessage,
  InsertEmailSalesEvent,
} from '@shared/schema';
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from './advisory-lock';

const SYNC_DAYS = 30;

export const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com',
  'live.com', 'msn.com', 'protonmail.com', 'mail.com', 'yandex.com', 'gmx.com',
  'zoho.com', 'fastmail.com', 'tutanota.com', 'hey.com'
]);

interface SyncStats {
  threadsFound: number;
  messagesProcessed: number;
  messagesStored: number;
  matchedToCustomers: number;
  unmatchedCount: number;
  eventsExtracted: number;
  errors: string[];
}

let connectionSettings: any = null;

async function getAccessToken(): Promise<{ token: string; email: string; scopes: string[] }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Gmail not connected - missing Replit token');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || 
                      connectionSettings?.settings?.oauth?.credentials?.access_token;
  const email = connectionSettings?.settings?.email || 
                connectionSettings?.settings?.oauth?.email || '';
  const scopes = connectionSettings?.settings?.scope?.split(' ') || 
                 connectionSettings?.settings?.oauth?.scopes || [];

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected - please reconnect in Integrations panel');
  }
  
  return { token: accessToken, email, scopes };
}

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const { token } = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: token });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function extractEmailAddress(emailHeader: string): string {
  const match = emailHeader.match(/<([^>]+)>/) || emailHeader.match(/([^\s<]+@[^\s>]+)/);
  return match ? match[1].toLowerCase() : emailHeader.toLowerCase();
}

export function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase() : '';
}

function extractName(emailHeader: string): string {
  const match = emailHeader.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : '';
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';
  
  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }
  
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        try {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        } catch {
          continue;
        }
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        try {
          const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
          return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        } catch {
          continue;
        }
      }
    }
    for (const part of payload.parts) {
      const nested = extractBodyText(part);
      if (nested) return nested;
    }
  }
  
  return '';
}

export async function matchEmailToCustomer(
  email: string, 
  domain: string
): Promise<{ customerId: string | null; matchType: string; confidence: number }> {
  const normalizedEmail = email.toLowerCase();
  
  const contactMatch = await db.select({ customerId: customerContacts.customerId })
    .from(customerContacts)
    .where(sql`LOWER(${customerContacts.email}) = ${normalizedEmail}`)
    .limit(1);
  
  if (contactMatch.length > 0 && contactMatch[0].customerId) {
    return { customerId: contactMatch[0].customerId, matchType: 'exact_email', confidence: 1.00 };
  }
  
  const customerEmailMatch = await db.select({ id: customers.id })
    .from(customers)
    .where(sql`LOWER(${customers.email}) = ${normalizedEmail}`)
    .limit(1);
  
  if (customerEmailMatch.length > 0) {
    return { customerId: customerEmailMatch[0].id, matchType: 'exact_email', confidence: 1.00 };
  }
  
  if (domain && !FREE_EMAIL_PROVIDERS.has(domain)) {
    const domainMatch = await db.select({ id: customers.id })
      .from(customers)
      .where(sql`LOWER(${customers.email}) LIKE ${'%@' + domain}`)
      .limit(1);
    
    if (domainMatch.length > 0) {
      return { customerId: domainMatch[0].id, matchType: 'domain', confidence: 0.70 };
    }
  }
  
  return { customerId: null, matchType: 'none', confidence: 0 };
}

export async function syncGmailMessages(userId: string): Promise<SyncStats> {
  const stats: SyncStats = {
    threadsFound: 0,
    messagesProcessed: 0,
    messagesStored: 0,
    matchedToCustomers: 0,
    unmatchedCount: 0,
    eventsExtracted: 0,
    errors: [],
  };
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - SYNC_DAYS);
  const afterDate = thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '/');
  
  const inboxQuery = `in:inbox after:${afterDate}`;
  const sentQuery = `in:sent after:${afterDate}`;
  
  try {
    const gmail = await getGmailClient();
    
    await db.update(gmailSyncState)
      .set({ 
        syncStatus: 'syncing', 
        syncStartedAt: new Date(),
        lastQuery: `${inboxQuery} OR ${sentQuery}`,
        lastError: null,
      })
      .where(eq(gmailSyncState.userId, userId));
    
    const existingMessages = await db.select({ gmailMessageId: gmailMessages.gmailMessageId })
      .from(gmailMessages)
      .where(eq(gmailMessages.userId, userId));
    const existingIds = new Set(existingMessages.map(m => m.gmailMessageId));
    
    for (const query of [inboxQuery, sentQuery]) {
      let pageToken: string | undefined;
      const isInbox = query.includes('in:inbox');
      
      do {
        try {
          const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 100,
            pageToken,
          });
          
          const messages = listResponse.data.messages || [];
          stats.threadsFound += messages.length;
          
          for (const msgRef of messages) {
            if (!msgRef.id || existingIds.has(msgRef.id)) {
              stats.messagesProcessed++;
              continue;
            }
            
            try {
              const fullMessage = await gmail.users.messages.get({
                userId: 'me',
                id: msgRef.id,
                format: 'full',
              });
              
              const headers = fullMessage.data.payload?.headers || [];
              const fromHeader = getHeader(headers, 'From');
              const toHeader = getHeader(headers, 'To');
              const subject = getHeader(headers, 'Subject');
              const dateHeader = getHeader(headers, 'Date');
              
              const fromEmail = extractEmailAddress(fromHeader);
              const toEmail = extractEmailAddress(toHeader);
              const direction = isInbox ? 'inbound' : 'outbound';
              const relevantEmail = direction === 'inbound' ? fromEmail : toEmail;
              const domain = extractDomain(relevantEmail);
              
              const bodyText = extractBodyText(fullMessage.data.payload);
              const sentAt = dateHeader ? new Date(dateHeader) : new Date();
              
              const match = await matchEmailToCustomer(relevantEmail, domain);
              
              const newMessage: InsertGmailMessage = {
                userId,
                gmailMessageId: msgRef.id,
                threadId: msgRef.threadId || null,
                direction,
                fromEmail,
                fromName: extractName(fromHeader),
                toEmail,
                toName: extractName(toHeader),
                subject: subject.substring(0, 1000),
                snippet: fullMessage.data.snippet?.substring(0, 500) || null,
                bodyText: bodyText.substring(0, 50000),
                sentAt,
                customerId: match.customerId,
                analysisStatus: 'pending',
              };
              
              const [inserted] = await db.insert(gmailMessages).values(newMessage).returning({ id: gmailMessages.id });
              stats.messagesStored++;
              existingIds.add(msgRef.id);
              
              if (match.customerId) {
                await db.insert(gmailMessageMatches).values({
                  gmailMessageId: inserted.id,
                  customerId: match.customerId,
                  matchType: match.matchType,
                  matchedEmail: relevantEmail,
                  confidence: match.confidence.toFixed(2),
                });
                stats.matchedToCustomers++;
              } else {
                await db.insert(gmailUnmatchedEmails).values({
                  gmailMessageId: inserted.id,
                  email: relevantEmail,
                  domain,
                  senderName: extractName(fromHeader),
                  messageDate: sentAt,
                  subject: subject.substring(0, 500),
                });
                stats.unmatchedCount++;
              }
              
            } catch (msgError: any) {
              stats.errors.push(`Message ${msgRef.id}: ${msgError.message}`);
            }
            
            stats.messagesProcessed++;
          }
          
          pageToken = listResponse.data.nextPageToken || undefined;
          
        } catch (listError: any) {
          stats.errors.push(`List error for ${query}: ${listError.message}`);
          break;
        }
      } while (pageToken);
    }
    
    await db.update(gmailSyncState)
      .set({ 
        syncStatus: 'idle',
        lastSyncedAt: new Date(),
        syncCompletedAt: new Date(),
        threadsFound: stats.threadsFound,
        messagesProcessed: stats.messagesProcessed,
        messagesStored: stats.messagesStored,
        matchedToCustomers: stats.matchedToCustomers,
        unmatchedCount: stats.unmatchedCount,
        lastError: stats.errors.length > 0 ? stats.errors.slice(0, 5).join('; ') : null,
      })
      .where(eq(gmailSyncState.userId, userId));
    
    console.log(`[Gmail Sync] Completed for user ${userId}:`, stats);
    
  } catch (error: any) {
    console.error('[Gmail Sync] Fatal error:', error.message);
    stats.errors.push(error.message);
    
    await db.update(gmailSyncState)
      .set({ 
        syncStatus: 'error',
        lastError: error.message,
        syncCompletedAt: new Date(),
      })
      .where(eq(gmailSyncState.userId, userId));
  }
  
  return stats;
}

export async function getGmailConnectionInfo(): Promise<{
  connected: boolean;
  email: string;
  scopes: string[];
  error?: string;
}> {
  try {
    const { email, scopes } = await getAccessToken();
    return { connected: true, email, scopes };
  } catch (error: any) {
    return { connected: false, email: '', scopes: [], error: error.message };
  }
}

export async function getSyncStatus(userId: string): Promise<any> {
  const connectionInfo = await getGmailConnectionInfo();
  
  const [syncState] = await db.select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.userId, userId))
    .limit(1);
  
  const [messageCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailMessages)
    .where(eq(gmailMessages.userId, userId));
  
  const [matchedCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailMessages)
    .where(and(
      eq(gmailMessages.userId, userId),
      sql`${gmailMessages.customerId} IS NOT NULL`
    ));
  
  const [unmatchedCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailUnmatchedEmails)
    .where(eq(gmailUnmatchedEmails.status, 'pending'));
  
  const [linkedCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailUnmatchedEmails)
    .where(eq(gmailUnmatchedEmails.status, 'linked'));
  
  const [ignoredCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailUnmatchedEmails)
    .where(eq(gmailUnmatchedEmails.status, 'ignored'));
  
  const [pendingAnalysis] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailMessages)
    .where(and(
      eq(gmailMessages.userId, userId),
      eq(gmailMessages.analyzed, false)
    ));
  
  const [processedAnalysis] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailMessages)
    .where(and(
      eq(gmailMessages.userId, userId),
      eq(gmailMessages.analyzed, true)
    ));
  
  const [eventsCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(emailSalesEvents);
  
  return {
    connection: connectionInfo,
    syncState: syncState || null,
    lastSyncAt: syncState?.lastSyncAt || null,
    accountEmail: connectionInfo?.email || null,
    queryUsed: `after:${new Date(Date.now() - SYNC_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
    lastError: syncState?.lastError || null,
    counts: {
      fetched: messageCount?.count || 0,
      stored: messageCount?.count || 0,
      matched: matchedCount?.count || 0,
      unmatched: unmatchedCount?.count || 0,
      linked: linkedCount?.count || 0,
      ignored: ignoredCount?.count || 0,
      pending: pendingAnalysis?.count || 0,
      processed: processedAnalysis?.count || 0,
      events: eventsCount?.count || 0,
    },
  };
}

export async function ensureSyncState(userId: string): Promise<void> {
  const existing = await db.select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.userId, userId))
    .limit(1);
  
  if (existing.length === 0) {
    await db.insert(gmailSyncState).values({ userId });
  }
}
