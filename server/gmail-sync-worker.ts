import { google, gmail_v1 } from 'googleapis';
import { db } from './db';
import { eq, and, sql, desc, isNull, or } from 'drizzle-orm';
import { 
  gmailSyncState, 
  gmailMessages, 
  gmailMessageMatches,
  gmailUnmatchedEmails,
  gmailEmailAliases,
  userGmailConnections,
  customers,
  customerContacts,
  emailSalesEvents,
  users,
  dripCampaignAssignments,
  dripCampaignStepStatus,
  dripCampaigns,
  followUpTasks,
  customerActivityEvents,
  leadActivities,
  InsertGmailMessage,
  InsertEmailSalesEvent,
} from '@shared/schema';
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from './advisory-lock';
import { normalizeEmail, extractEmailDomain, isFreeEmailProvider, FREE_EMAIL_PROVIDERS } from '@shared/email-normalizer';

const SYNC_DAYS = 30;

export interface MatchResult {
  customerId: string | null;
  contactId: number | null;
  matchType: 'exact_email' | 'alias' | 'domain' | 'none';
  confidence: number;
  matchedEmailNormalized: string | null;
}

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

export interface UserContext {
  userId: string;
  userEmail: string;
  isPrivileged: boolean; // Admin or manager with full access
}

export async function matchEmailToCustomer(
  email: string, 
  userContext: UserContext,
  domain?: string
): Promise<MatchResult> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { customerId: null, contactId: null, matchType: 'none', confidence: 0, matchedEmailNormalized: null };
  }
  
  const emailDomain = domain || extractEmailDomain(email);
  const { userId, userEmail, isPrivileged } = userContext;
  
  // Build user scope condition: admins see all, others see own + unassigned
  const buildUserScopeCondition = () => {
    if (isPrivileged) return sql`1=1`; // No restriction for admins
    return or(
      eq(customers.salesRepId, userId),
      eq(customers.salesRepId, userEmail),
      isNull(customers.salesRepId)
    );
  };
  
  // Step 1: Exact normalized email match on customerContacts (scoped via customer join)
  const contactMatch = await db.select({ 
    customerId: customerContacts.customerId,
    contactId: customerContacts.id,
    emailNormalized: customerContacts.emailNormalized,
  })
    .from(customerContacts)
    .innerJoin(customers, eq(customerContacts.customerId, customers.id))
    .where(and(
      eq(customerContacts.emailNormalized, normalized),
      buildUserScopeCondition()
    ))
    .limit(1);
  
  if (contactMatch.length > 0 && contactMatch[0].customerId) {
    return { 
      customerId: contactMatch[0].customerId, 
      contactId: contactMatch[0].contactId,
      matchType: 'exact_email', 
      confidence: 1.00,
      matchedEmailNormalized: normalized,
    };
  }
  
  // Step 2: Exact normalized email match on customers (scoped)
  const customerEmailMatch = await db.select({ 
    id: customers.id,
    emailNormalized: customers.emailNormalized,
    email2Normalized: customers.email2Normalized,
  })
    .from(customers)
    .where(and(
      or(
        eq(customers.emailNormalized, normalized),
        eq(customers.email2Normalized, normalized)
      ),
      buildUserScopeCondition()
    ))
    .limit(1);
  
  if (customerEmailMatch.length > 0) {
    return { 
      customerId: customerEmailMatch[0].id, 
      contactId: null,
      matchType: 'exact_email', 
      confidence: 1.00,
      matchedEmailNormalized: normalized,
    };
  }
  
  // Step 3: Alias lookup (scoped by customer ownership; admins see all aliases)
  const aliasConditions = [
    eq(gmailEmailAliases.aliasEmailNormalized, normalized),
    buildUserScopeCondition() // Verify customer ownership
  ];
  // Non-privileged users also restricted to their own aliases
  if (!isPrivileged) {
    aliasConditions.push(eq(gmailEmailAliases.userId, userId));
  }
  
  const aliasMatch = await db.select({
    customerId: gmailEmailAliases.customerId,
    contactId: gmailEmailAliases.contactId,
    primaryEmailNormalized: gmailEmailAliases.primaryEmailNormalized,
  })
    .from(gmailEmailAliases)
    .innerJoin(customers, eq(gmailEmailAliases.customerId, customers.id))
    .where(and(...aliasConditions))
    .limit(1);
  
  if (aliasMatch.length > 0 && aliasMatch[0].customerId) {
    return {
      customerId: aliasMatch[0].customerId,
      contactId: aliasMatch[0].contactId,
      matchType: 'alias',
      confidence: 0.95,
      matchedEmailNormalized: aliasMatch[0].primaryEmailNormalized,
    };
  }
  
  // Step 4: Domain matching (only for non-free email providers, scoped)
  if (emailDomain && !isFreeEmailProvider(email)) {
    const domainPattern = `%@${emailDomain}`;
    
    const contactDomainMatch = await db.select({
      customerId: customerContacts.customerId,
    })
      .from(customerContacts)
      .innerJoin(customers, eq(customerContacts.customerId, customers.id))
      .where(and(
        sql`${customerContacts.emailNormalized} LIKE ${domainPattern}`,
        buildUserScopeCondition()
      ))
      .limit(1);
    
    if (contactDomainMatch.length > 0 && contactDomainMatch[0].customerId) {
      return {
        customerId: contactDomainMatch[0].customerId,
        contactId: null,
        matchType: 'domain',
        confidence: 0.70,
        matchedEmailNormalized: normalized,
      };
    }
    
    const customerDomainMatch = await db.select({ id: customers.id })
      .from(customers)
      .where(and(
        sql`${customers.emailNormalized} LIKE ${domainPattern}`,
        buildUserScopeCondition()
      ))
      .limit(1);
    
    if (customerDomainMatch.length > 0) {
      return { 
        customerId: customerDomainMatch[0].id, 
        contactId: null,
        matchType: 'domain', 
        confidence: 0.70,
        matchedEmailNormalized: normalized,
      };
    }
  }
  
  return { customerId: null, contactId: null, matchType: 'none', confidence: 0, matchedEmailNormalized: normalized };
}

async function checkDripReply(threadId: string | null, userId: string): Promise<void> {
  if (!threadId) return;

  const matches = await db
    .select({
      assignmentId: dripCampaignAssignments.id,
      customerId: dripCampaignAssignments.customerId,
      leadId: dripCampaignAssignments.leadId,
      assignedBy: dripCampaignAssignments.assignedBy,
      campaignName: dripCampaigns.name,
    })
    .from(dripCampaignStepStatus)
    .innerJoin(dripCampaignAssignments, eq(dripCampaignStepStatus.assignmentId, dripCampaignAssignments.id))
    .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
    .where(
      and(
        eq(dripCampaignStepStatus.gmailThreadId, threadId),
        eq(dripCampaignAssignments.status, 'active')
      )
    )
    .limit(1);

  if (matches.length === 0) return;

  const match = matches[0];
  const { assignmentId, customerId, leadId, assignedBy, campaignName } = match;

  await db
    .update(dripCampaignStepStatus)
    .set({ status: 'skipped' })
    .where(
      and(
        eq(dripCampaignStepStatus.assignmentId, assignmentId),
        eq(dripCampaignStepStatus.status, 'scheduled')
      )
    );

  await db
    .update(dripCampaignAssignments)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(eq(dripCampaignAssignments.id, assignmentId));

  if (customerId) {
    await db.insert(customerActivityEvents).values({
      customerId,
      eventType: 'note',
      title: 'Replied to drip campaign',
      description: `Contact replied to the "${campaignName}" drip campaign. Campaign stopped — follow up personally.`,
      sourceType: 'drip_reply',
      sourceId: String(assignmentId),
    });

    await db.insert(followUpTasks).values({
      customerId,
      taskType: 'drip_reply',
      priority: 'urgent',
      title: 'They replied to your drip — follow up personally',
      description: `A contact replied to the "${campaignName}" campaign. The drip has been stopped. Reach out personally to continue the conversation.`,
      dueDate: new Date(),
      assignedTo: assignedBy || undefined,
      isAutoGenerated: true,
      sourceType: 'drip_reply',
      sourceId: String(assignmentId),
      status: 'pending',
    });
  } else if (leadId) {
    await db.insert(leadActivities).values({
      leadId,
      activityType: 'note',
      summary: 'Replied to drip campaign',
      details: `Lead replied to the "${campaignName}" drip campaign. Campaign stopped — follow up personally.`,
    });

    // Auto-create follow-up task when lead replies to drip
    try {
      if (leadId) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1); // due tomorrow
        await db.insert(followUpTasks).values({
          leadId,
          taskType: 'follow_up',
          title: `Follow up with lead — replied to drip campaign`,
          description: `Lead replied to the "${campaignName}" drip campaign. Reach out personally.`,
          priority: 'high',
          status: 'pending',
          dueDate,
          isAutoGenerated: true,
          sourceType: 'drip_reply',
        });
      }
    } catch (taskErr) {
      console.error('[Drip Reply] Failed to create follow-up task:', taskErr);
    }
  }

  console.log(`[Drip Reply] Assignment #${assignmentId} cancelled — reply detected in thread ${threadId}`);
}

export async function syncGmailMessages(userId: string, afterDateOverride?: Date): Promise<SyncStats> {
  const stats: SyncStats = {
    threadsFound: 0,
    messagesProcessed: 0,
    messagesStored: 0,
    matchedToCustomers: 0,
    unmatchedCount: 0,
    eventsExtracted: 0,
    errors: [],
  };
  
  const cutoff = afterDateOverride ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - SYNC_DAYS);
    return d;
  })();
  const afterDate = cutoff.toISOString().split('T')[0].replace(/-/g, '/');
  
  const inboxQuery = `in:inbox after:${afterDate}`;
  const sentQuery = `in:sent after:${afterDate}`;
  
  try {
    // Fetch user info for user scoping in email matching
    const [user] = await db.select({ email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    const userContext: UserContext = {
      userId,
      userEmail: user?.email || '',
      isPrivileged: user?.role === 'admin' || user?.role === 'manager',
    };
    
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
              const fromEmailNormalized = normalizeEmail(fromEmail);
              const toEmailNormalized = normalizeEmail(toEmail);
              const direction = isInbox ? 'inbound' : 'outbound';
              const relevantEmail = direction === 'inbound' ? fromEmail : toEmail;
              const relevantEmailNormalized = direction === 'inbound' ? fromEmailNormalized : toEmailNormalized;
              const domain = extractEmailDomain(relevantEmail);
              
              const bodyText = extractBodyText(fullMessage.data.payload);
              const sentAt = dateHeader ? new Date(dateHeader) : new Date();
              
              const match = await matchEmailToCustomer(relevantEmail, userContext, domain || undefined);
              
              const newMessage: InsertGmailMessage = {
                userId,
                gmailMessageId: msgRef.id,
                threadId: msgRef.threadId || null,
                direction,
                fromEmail,
                fromEmailNormalized,
                fromName: extractName(fromHeader),
                toEmail,
                toEmailNormalized,
                toName: extractName(toHeader),
                subject: subject.substring(0, 1000),
                snippet: fullMessage.data.snippet?.substring(0, 500) || null,
                bodyText: bodyText.substring(0, 50000),
                sentAt,
                customerId: match.customerId,
                contactId: match.contactId,
                matchConfidence: match.confidence.toFixed(2),
                matchType: match.matchType,
                matchedEmailNormalized: match.matchedEmailNormalized,
                analysisStatus: 'pending',
              };
              
              const [inserted] = await db.insert(gmailMessages).values(newMessage).returning({ id: gmailMessages.id });
              stats.messagesStored++;
              existingIds.add(msgRef.id);

              if (direction === 'inbound' && msgRef.threadId) {
                try {
                  await checkDripReply(msgRef.threadId, userId);
                } catch (dripErr) {
                  console.warn('[Drip Reply] Error checking for drip reply:', dripErr);
                }
              }
              
              if (match.customerId) {
                await db.insert(gmailMessageMatches).values({
                  gmailMessageId: inserted.id,
                  customerId: match.customerId,
                  contactId: match.contactId,
                  matchType: match.matchType,
                  matchedEmail: relevantEmail,
                  matchedEmailNormalized: relevantEmailNormalized,
                  confidence: match.confidence.toFixed(2),
                });
                stats.matchedToCustomers++;
              } else {
                await db.insert(gmailUnmatchedEmails).values({
                  gmailMessageId: inserted.id,
                  userId,
                  email: relevantEmail,
                  emailNormalized: relevantEmailNormalized,
                  domain: domain || null,
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
    
    console.log(`[Gmail Sync] Completed for user ${userId}:`, {
      threadsFound: stats.threadsFound,
      messagesProcessed: stats.messagesProcessed,
      messagesStored: stats.messagesStored,
      matchedToCustomers: stats.matchedToCustomers,
      unmatchedCount: stats.unmatchedCount,
      matchRate: stats.messagesStored > 0 
        ? `${Math.round((stats.matchedToCustomers / stats.messagesStored) * 100)}%`
        : '0%',
      errors: stats.errors.length > 0 ? stats.errors.slice(0, 3) : 'none',
    });
    
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
      eq(gmailMessages.analysisStatus, 'pending')
    ));
  
  const [processedAnalysis] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailMessages)
    .where(and(
      eq(gmailMessages.userId, userId),
      eq(gmailMessages.analysisStatus, 'completed')
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
