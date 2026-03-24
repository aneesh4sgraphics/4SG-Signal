/**
 * Gmail Sent Mail Auto-Activity Sync
 *
 * Polls each connected user's Gmail SENT folder for new outbound emails,
 * matches recipients to known customers/leads, and logs email_sent activity
 * events so reps get a complete email history without sending from within the app.
 *
 * - Uses per-user OAuth connections (user_gmail_connections table)
 * - Idempotent: duplicate gmail message IDs are never logged twice
 * - Activities are tagged sourceType='gmail_external' so the UI can badge them
 * - lastSentSyncAt per connection is updated after each successful run
 */

import { google } from 'googleapis';
import { db } from './db';
import { eq, and, or, sql } from 'drizzle-orm';
import {
  userGmailConnections,
  customers,
  customerContacts,
  customerActivityEvents,
  leads,
  leadActivities,
  users,
} from '@shared/schema';
import { normalizeEmail } from '@shared/email-normalizer';
import { getGmailClientForUser } from './user-gmail-oauth';

const SENT_SYNC_DAYS = 30;
const GMAIL_SENT_LABEL = 'SENT';

interface SentEmailMatch {
  type: 'customer' | 'lead';
  id: string | number;
  displayName: string;
}

function extractEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/) || header.match(/([^\s<]+@[^\s>]+)/);
  return match ? match[1].toLowerCase().trim() : header.toLowerCase().trim();
}

function extractAllRecipients(toHeader: string, ccHeader: string, bccHeader: string): string[] {
  const combined = [toHeader, ccHeader, bccHeader].filter(Boolean).join(',');
  const emails: string[] = [];
  const parts = combined.split(/,\s*/);
  for (const part of parts) {
    const email = extractEmailAddress(part.trim());
    if (email && email.includes('@')) {
      emails.push(email);
    }
  }
  return [...new Set(emails)];
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

/**
 * Match an email address to a known customer or lead in the database.
 * Returns all matches (customer AND lead are both possible).
 */
async function matchEmailToEntities(emailNormalized: string): Promise<SentEmailMatch[]> {
  const matches: SentEmailMatch[] = [];

  // 1. Match customer contacts
  const contactMatches = await db.select({
    customerId: customerContacts.customerId,
    name: customerContacts.name,
  })
    .from(customerContacts)
    .where(eq(customerContacts.emailNormalized, emailNormalized))
    .limit(3);

  for (const c of contactMatches) {
    if (c.customerId) {
      matches.push({ type: 'customer', id: c.customerId, displayName: c.name || emailNormalized });
    }
  }

  // 2. Match customer primary/secondary email
  if (matches.filter(m => m.type === 'customer').length === 0) {
    const customerMatches = await db.select({
      id: customers.id,
      company: customers.company,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
      .from(customers)
      .where(
        or(
          eq(customers.emailNormalized, emailNormalized),
          eq(customers.email2Normalized, emailNormalized),
        )
      )
      .limit(3);

    for (const c of customerMatches) {
      const name = c.company || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || emailNormalized;
      matches.push({ type: 'customer', id: c.id, displayName: name });
    }
  }

  // 3. Match leads by email
  const leadMatches = await db.select({
    id: leads.id,
    name: leads.name,
    email: leads.email,
  })
    .from(leads)
    .where(eq(leads.emailNormalized, emailNormalized))
    .limit(3);

  for (const l of leadMatches) {
    matches.push({ type: 'lead', id: l.id, displayName: l.name || emailNormalized });
  }

  return matches;
}

/**
 * Check if we've already logged an activity event for this Gmail message ID on a customer.
 * We store the gmailMessageId in the sourceId field.
 */
async function isGmailMsgAlreadyLoggedForCustomer(customerId: string, gmailMessageId: string): Promise<boolean> {
  const existing = await db.select({ id: customerActivityEvents.id })
    .from(customerActivityEvents)
    .where(
      and(
        eq(customerActivityEvents.customerId, customerId),
        eq(customerActivityEvents.sourceType, 'gmail_external'),
        eq(customerActivityEvents.sourceId, gmailMessageId),
      )
    )
    .limit(1);
  return existing.length > 0;
}

/**
 * Check if we've already logged an activity for this Gmail message ID on a lead.
 * We store it at the start of the details field as "gmailMsgId=<id>|..." for reliable dedup.
 */
async function isGmailMsgAlreadyLoggedForLead(leadId: number, gmailMessageId: string): Promise<boolean> {
  const prefix = `gmailMsgId=${gmailMessageId}|`;
  const existing = await db.select({ id: leadActivities.id })
    .from(leadActivities)
    .where(
      and(
        eq(leadActivities.leadId, leadId),
        eq(leadActivities.performedBy, 'gmail_external'),
        sql`${leadActivities.details} LIKE ${prefix + '%'}`,
      )
    )
    .limit(1);
  return existing.length > 0;
}

interface SentSyncStats {
  messagesScanned: number;
  activitiesCreated: number;
  duplicatesSkipped: number;
  errors: string[];
}

/**
 * Sync sent mail for a single user's personal Gmail OAuth connection.
 * Returns stats on what was processed.
 */
export async function syncUserSentMailActivities(userId: string): Promise<SentSyncStats> {
  const stats: SentSyncStats = {
    messagesScanned: 0,
    activitiesCreated: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  const [connection] = await db.select()
    .from(userGmailConnections)
    .where(and(
      eq(userGmailConnections.userId, userId),
      eq(userGmailConnections.isActive, true),
    ))
    .limit(1);

  if (!connection) {
    return stats;
  }

  let gmail: ReturnType<typeof google.gmail>;
  try {
    gmail = await getGmailClientForUser(userId);
  } catch (err: any) {
    stats.errors.push(`Auth error: ${err.message}`);
    return stats;
  }

  // Determine the date window: either from lastSentSyncAt or 30-day lookback
  const lastSync: Date | null = connection.lastSentSyncAt || null;
  let afterEpochSec: number;

  if (lastSync) {
    // Use last sync timestamp as the lower bound
    afterEpochSec = Math.floor(lastSync.getTime() / 1000);
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SENT_SYNC_DAYS);
    afterEpochSec = Math.floor(cutoff.getTime() / 1000);
  }

  const query = `label:${GMAIL_SENT_LABEL} after:${afterEpochSec}`;

  let pageToken: string | undefined;
  const now = new Date();

  do {
    try {
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 100,
        pageToken,
      });

      const messages = listResponse.data.messages || [];

      for (const msgRef of messages) {
        if (!msgRef.id) continue;
        stats.messagesScanned++;

        try {
          const fullMsg = await gmail.users.messages.get({
            userId: 'me',
            id: msgRef.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date'],
          });

          const headers = fullMsg.data.payload?.headers || [];
          const fromHeader = getHeader(headers, 'From');
          const toHeader = getHeader(headers, 'To');
          const ccHeader = getHeader(headers, 'Cc');
          const bccHeader = getHeader(headers, 'Bcc');
          const subject = getHeader(headers, 'Subject');
          const dateHeader = getHeader(headers, 'Date');

          const fromEmail = extractEmailAddress(fromHeader).toLowerCase();
          const userGmailAddress = (connection.gmailAddress || '').toLowerCase();

          // Only process emails sent by this user (guard against SENT items from aliases or other senders)
          if (fromEmail && userGmailAddress && fromEmail !== userGmailAddress) {
            continue;
          }

          const sentAt = dateHeader ? new Date(dateHeader) : now;
          const recipients = extractAllRecipients(toHeader, ccHeader, bccHeader);

          for (const recipientEmail of recipients) {
            const normalized = normalizeEmail(recipientEmail);
            if (!normalized) continue;

            const entityMatches = await matchEmailToEntities(normalized);
            if (entityMatches.length === 0) continue;

            for (const match of entityMatches) {
              if (match.type === 'customer') {
                const customerId = match.id as string;
                const alreadyLogged = await isGmailMsgAlreadyLoggedForCustomer(customerId, msgRef.id);
                if (alreadyLogged) {
                  stats.duplicatesSkipped++;
                  continue;
                }

                await db.insert(customerActivityEvents).values({
                  customerId,
                  eventType: 'email_sent',
                  title: subject ? `Email: ${subject.substring(0, 200)}` : 'Email sent via Gmail',
                  description: `Sent to: ${recipientEmail}`,
                  sourceType: 'gmail_external',
                  sourceId: msgRef.id,
                  sourceTable: 'gmail_sent',
                  createdBy: userId,
                  eventDate: sentAt,
                  metadata: {
                    gmailMessageId: msgRef.id,
                    toEmail: recipientEmail,
                    subject: subject || '',
                    sentFrom: connection.gmailAddress || '',
                  },
                });
                stats.activitiesCreated++;
              } else if (match.type === 'lead') {
                const leadId = match.id as number;
                const alreadyLogged = await isGmailMsgAlreadyLoggedForLead(leadId, msgRef.id);
                if (alreadyLogged) {
                  stats.duplicatesSkipped++;
                  continue;
                }

                const summaryText = subject
                  ? `Email sent: ${subject.substring(0, 200)}`
                  : 'Email sent via Gmail';

                await db.execute(sql`
                  INSERT INTO lead_activities
                    (lead_id, activity_type, summary, details, performed_by, performed_by_name, created_at)
                  VALUES
                    (${leadId}, 'email_sent', ${summaryText},
                     ${'gmailMsgId=' + msgRef.id + '|to:' + recipientEmail},
                     'gmail_external', 'Gmail (external)', ${sentAt})
                `);
                stats.activitiesCreated++;
              }
            }
          }
        } catch (msgErr: any) {
          stats.errors.push(`Msg ${msgRef.id}: ${msgErr.message}`);
        }
      }

      pageToken = listResponse.data.nextPageToken || undefined;
    } catch (listErr: any) {
      stats.errors.push(`List error: ${listErr.message}`);
      break;
    }
  } while (pageToken);

  // Only update lastSentSyncAt if there were no list errors.
  // Use now minus a 5-minute overlap so messages at the boundary are re-checked
  // on the next run, preventing gaps from transient per-message fetch failures.
  const hadListErrors = stats.errors.some(e => e.startsWith('List error:'));
  if (!hadListErrors) {
    const watermark = new Date(now.getTime() - 5 * 60 * 1000);
    try {
      await db.update(userGmailConnections)
        .set({ lastSentSyncAt: watermark })
        .where(eq(userGmailConnections.userId, userId));
    } catch (updateErr: any) {
      console.warn('[GmailSentSync] Could not update last_sent_sync_at:', updateErr.message);
    }
  }

  return stats;
}

/**
 * Run the sent mail activity sync for all users with active Gmail connections.
 * Called from the background scheduler in gmail-intelligence.ts.
 */
export async function syncAllUsersSentMailActivities(): Promise<void> {
  let activeConnections: { userId: string }[];

  try {
    activeConnections = await db.select({ userId: userGmailConnections.userId })
      .from(userGmailConnections)
      .where(eq(userGmailConnections.isActive, true));
  } catch (err: any) {
    console.error('[GmailSentSync] Failed to fetch active connections:', err.message);
    return;
  }

  if (activeConnections.length === 0) {
    return;
  }

  console.log(`[GmailSentSync] Running sent mail sync for ${activeConnections.length} users`);

  for (const { userId } of activeConnections) {
    try {
      const stats = await syncUserSentMailActivities(userId);
      if (stats.messagesScanned > 0 || stats.activitiesCreated > 0) {
        console.log(
          `[GmailSentSync] User ${userId}: scanned=${stats.messagesScanned} created=${stats.activitiesCreated} skipped=${stats.duplicatesSkipped}`,
          stats.errors.length > 0 ? `errors=${stats.errors.slice(0, 2).join('; ')}` : ''
        );
      }
    } catch (err: any) {
      console.error(`[GmailSentSync] Error for user ${userId}:`, err.message);
    }
  }
}
