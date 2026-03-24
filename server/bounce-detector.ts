import { google, gmail_v1 } from 'googleapis';
import { db } from './db';
import { eq, and, or, sql, isNull, lt, ilike, desc } from 'drizzle-orm';
import { 
  bouncedEmails, 
  customers, 
  customerContacts,
  leads,
  userGmailConnections,
  emailSends,
  labelPrints,
  customerActivityEvents,
  dripCampaignAssignments,
  dripCampaignStepStatus,
  leadActivities,
  InsertBouncedEmail 
} from '@shared/schema';
import { normalizeEmail } from '@shared/email-normalizer';
import { getGmailClientForUser as getOAuthGmailClient } from './user-gmail-oauth';

const BOUNCE_SENDERS = [
  'mailer-daemon@',
  'postmaster@',
  'mail-daemon@',
  'mail delivery subsystem',
  'mailerdaemon@',
  'noreply@google.com',
  'mailer-daemon@googlemail.com',
];

const BOUNCE_SUBJECT_PATTERNS = [
  /delivery.*(?:fail|status|notification)/i,
  /undelivered/i,
  /undeliverable/i,
  /bounce.*notification/i,
  /mail.*delivery.*(?:failed|error)/i,
  /message.*(?:not|could not).*delivered/i,
  /returned.*mail/i,
  /address.*rejected/i,
  /recipient.*rejected/i,
  /delivery.*permanent.*failure/i,
];

const BOUNCE_BODY_PATTERNS = [
  /(?:address|mailbox|recipient|user).*(?:rejected|unknown|invalid|does not exist|not found)/i,
  /550.*(?:no such user|user unknown|mailbox not found)/i,
  /(?:permanent|hard).*(?:error|failure|bounce)/i,
  /this.*(?:account|address).*(?:disabled|suspended|deleted)/i,
  /The email account that you tried to reach does not exist/i,
  /delivery to the following (?:recipient|address).*failed/i,
];

const EMAIL_EXTRACTION_PATTERNS = [
  /<([^>]+@[^>]+)>/g,
  /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
];

interface BounceInfo {
  bouncedEmail: string;
  originalSubject?: string;
  bounceReason?: string;
}

// Patterns that directly name the bounced address in context — checked first for precision.
const CONTEXTUAL_BOUNCE_PATTERNS = [
  // "Your message wasn't / wasn't delivered to foo@bar.com because..."
  /your message (?:wasn[''\u2019]t|was not) delivered to\s+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  // "Your message to foo@bar.com couldn't / couldn't be delivered"
  /your message to\s+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\s+(?:couldn[''\u2019]t|could not) be delivered/i,
  // "Delivery has failed to these recipients or groups:\n foo@bar.com"
  /delivery has failed to these recipients or groups:[\s\S]{0,200}?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  // "The email account that you tried to reach does not exist"  — email is then on a separate line
  /tried to reach\s+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  // Generic: "to: foo@bar.com" in delivery-status plain text sections
  /^to:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/im,
];

function extractBouncedEmails(body: string, subject: string, ourEmail: string): BounceInfo[] {
  const results: BounceInfo[] = [];
  const ourEmailNormalized = normalizeEmail(ourEmail);
  const seenEmails = new Set<string>();
  
  const systemEmails = new Set([
    'mailer-daemon',
    'postmaster',
    'noreply',
    'no-reply',
    'mail-daemon',
  ]);
  
  const domainBlacklist = new Set([
    'googlemail.com',
    'google.com',
  ]);

  const cleanedSubject = subject.replace(/^(?:Re:|Fwd:|Delivery Status Notification.*)/i, '').trim();

  function addEmail(rawEmail: string) {
    const email = rawEmail.toLowerCase().trim();
    const normalized = normalizeEmail(email);
    if (seenEmails.has(normalized)) return;
    if (normalized === ourEmailNormalized) return;
    const localPart = email.split('@')[0];
    const domain = email.split('@')[1];
    if (systemEmails.has(localPart)) return;
    if (!domain || domainBlacklist.has(domain)) return;
    seenEmails.add(normalized);

    let reason: string | undefined;
    if (/(?:unknown|not found|does not exist)/i.test(body)) {
      reason = 'Address does not exist';
    } else if (/(?:rejected|refused)/i.test(body)) {
      reason = 'Address rejected';
    } else if (/(?:disabled|suspended)/i.test(body)) {
      reason = 'Account disabled or suspended';
    } else if (/(?:mailbox full|over quota)/i.test(body)) {
      reason = 'Mailbox full';
    }

    results.push({ bouncedEmail: email, originalSubject: cleanedSubject, bounceReason: reason });
  }

  // 1. Try contextual patterns first — these are the most precise
  for (const pattern of CONTEXTUAL_BOUNCE_PATTERNS) {
    const match = pattern.exec(body);
    if (match?.[1]) addEmail(match[1]);
  }

  // 2. Fall back to general email extraction if nothing found yet
  if (results.length === 0) {
    for (const pattern of EMAIL_EXTRACTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(body)) !== null) {
        if (match[1]) addEmail(match[1]);
      }
    }
  }
  
  return results;
}

function isBounceMessage(from: string, subject: string, body: string): boolean {
  const fromLower = from.toLowerCase();
  
  const isFromBouncer = BOUNCE_SENDERS.some(sender => fromLower.includes(sender));
  if (isFromBouncer) {
    const hasRelevantSubject = BOUNCE_SUBJECT_PATTERNS.some(pattern => pattern.test(subject));
    if (hasRelevantSubject) return true;
  }
  
  const hasSubjectIndicator = BOUNCE_SUBJECT_PATTERNS.some(pattern => pattern.test(subject));
  const hasBodyIndicator = BOUNCE_BODY_PATTERNS.some(pattern => pattern.test(body));
  
  return isFromBouncer && (hasSubjectIndicator || hasBodyIndicator);
}

interface MatchResult {
  type: 'customer' | 'contact' | 'lead' | 'none';
  customerId?: string;
  contactId?: number;
  leadId?: number;
}

// BUG-01 FIX: Use ilike on the actual email column for case-insensitive matching.
// emailNormalized may be null for older records, making eq() lookups miss real matches.
function classifyBounceType(bounceReason?: string): string {
  if (!bounceReason) return 'unknown';
  const lower = bounceReason.toLowerCase();
  if (/does not exist|no such user|user unknown|account.*(?:disabled|suspended|deleted)|mailbox not found/.test(lower)) {
    return 'person_gone';
  }
  if (/(?:bad|invalid).*domain|no.*mx.*record|domain.*not.*found|host.*not.*found/.test(lower)) {
    return 'domain_dead';
  }
  if (/typo|misspell/.test(lower)) {
    return 'typo';
  }
  if (/rejected|refused/.test(lower)) {
    return 'person_gone';
  }
  return 'unknown';
}

async function captureOutreachHistory(customerId: string | null | undefined, leadId: number | null | undefined): Promise<string | null> {
  if (!customerId && !leadId) return null;
  try {
    let emailCount = 0;
    let lastEmailSubject: string | null = null;
    let swatchBookCount = 0;
    let pressTestKitCount = 0;
    let callCount = 0;
    let quoteCount = 0;

    if (customerId) {
      const emailResults = await db
        .select({ subject: emailSends.subject, sentAt: emailSends.sentAt })
        .from(emailSends)
        .where(eq(emailSends.customerId, customerId))
        .orderBy(desc(emailSends.sentAt))
        .limit(50);
      emailCount = emailResults.length;
      lastEmailSubject = emailResults[0]?.subject || null;

      const swatchBooks = await db
        .select({ count: sql<number>`count(*)` })
        .from(labelPrints)
        .where(and(eq(labelPrints.customerId, customerId), eq(labelPrints.labelType, 'swatch_book')));
      swatchBookCount = Number(swatchBooks[0]?.count || 0);

      const pressKits = await db
        .select({ count: sql<number>`count(*)` })
        .from(labelPrints)
        .where(and(eq(labelPrints.customerId, customerId), eq(labelPrints.labelType, 'press_test_kit')));
      pressTestKitCount = Number(pressKits[0]?.count || 0);

      const activityEvents = await db
        .select({ eventType: customerActivityEvents.eventType, count: sql<number>`count(*)` })
        .from(customerActivityEvents)
        .where(eq(customerActivityEvents.customerId, customerId))
        .groupBy(customerActivityEvents.eventType);
      for (const event of activityEvents) {
        if (/call/i.test(event.eventType)) callCount += Number(event.count);
        if (/quote/i.test(event.eventType)) quoteCount += Number(event.count);
      }
    } else if (leadId) {
      const emailResults = await db
        .select({ subject: emailSends.subject, sentAt: emailSends.sentAt })
        .from(emailSends)
        .where(eq(emailSends.leadId, leadId))
        .orderBy(desc(emailSends.sentAt))
        .limit(50);
      emailCount = emailResults.length;
      lastEmailSubject = emailResults[0]?.subject || null;
    }

    const snapshot = {
      emailCount,
      lastEmailSubject,
      swatchBookCount,
      pressTestKitCount,
      callCount,
      quoteCount,
      capturedAt: new Date().toISOString(),
    };
    return JSON.stringify(snapshot);
  } catch (err) {
    console.error('[Bounce Detector] Error capturing outreach history:', err);
    return null;
  }
}

async function matchEmailToRecord(email: string): Promise<MatchResult> {
  const customerMatch = await db.select({ id: customers.id })
    .from(customers)
    .where(ilike(customers.email, email))
    .limit(1);
  
  if (customerMatch.length > 0) {
    return { type: 'customer', customerId: customerMatch[0].id };
  }
  
  const contactMatch = await db.select({ 
    id: customerContacts.id, 
    customerId: customerContacts.customerId 
  })
    .from(customerContacts)
    .where(ilike(customerContacts.email, email))
    .limit(1);
  
  if (contactMatch.length > 0) {
    return { 
      type: 'contact', 
      contactId: contactMatch[0].id,
      customerId: contactMatch[0].customerId?.toString(),
    };
  }
  
  const leadMatch = await db.select({ id: leads.id })
    .from(leads)
    .where(ilike(leads.email, email))
    .limit(1);
  
  if (leadMatch.length > 0) {
    return { type: 'lead', leadId: leadMatch[0].id };
  }
  
  return { type: 'none' };
}

async function getGmailClientForUser(userId: string): Promise<{ gmail: gmail_v1.Gmail; email: string } | null> {
  console.log(`[Bounce Detector] Looking for Gmail connection for user ${userId}`);
  
  try {
    const gmail = await getOAuthGmailClient(userId);
    const connection = await db.select()
      .from(userGmailConnections)
      .where(and(
        eq(userGmailConnections.userId, userId),
        eq(userGmailConnections.isActive, true)
      ))
      .limit(1);
    
    const email = connection[0]?.gmailAddress || connection[0]?.email || '';
    console.log(`[Bounce Detector] Found Gmail connection for ${email}`);
    return { gmail, email };
  } catch (error: any) {
    console.log(`[Bounce Detector] No active Gmail connection for user ${userId}: ${error.message}`);
    return null;
  }
}

async function getAnyActiveGmailClient(): Promise<{ gmail: gmail_v1.Gmail; email: string } | null> {
  try {
    const activeConnections = await db.select()
      .from(userGmailConnections)
      .where(eq(userGmailConnections.isActive, true))
      .limit(5);
    
    for (const conn of activeConnections) {
      try {
        const gmail = await getOAuthGmailClient(conn.userId);
        console.log(`[Bounce Detector] Using Gmail connection from ${conn.gmailAddress} (user ${conn.userId})`);
        return { gmail, email: conn.gmailAddress || conn.email };
      } catch {
        continue;
      }
    }
    
    console.log('[Bounce Detector] No working Gmail connections found across any users');
    return null;
  } catch (error) {
    console.error('[Bounce Detector] Error finding active Gmail connections:', error);
    return null;
  }
}

async function getSharedGmailClient(): Promise<{ gmail: gmail_v1.Gmail; email: string } | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken || !hostname) {
      return null;
    }

    const connectionSettings = await fetch(
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

    if (!accessToken) {
      return null;
    }
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    return {
      gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
      email,
    };
  } catch (error) {
    console.error('[Bounce Detector] Failed to get shared Gmail client:', error);
    return null;
  }
}

export async function scanForBouncedEmails(userId: string): Promise<number> {
  console.log(`[Bounce Detector] Scanning for bounced emails for user ${userId}`);
  
  let client = await getGmailClientForUser(userId);
  if (!client) {
    client = await getAnyActiveGmailClient();
  }
  if (!client) {
    client = await getSharedGmailClient();
  }
  
  if (!client) {
    console.log('[Bounce Detector] No Gmail client available');
    return 0;
  }
  
  const { gmail, email: userEmail } = client;
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '/');
    
    const query = `("couldn't be delivered" OR "address not found" OR "delivery has failed" OR "wasn't delivered" OR "DSN" OR from:mailer-daemon OR from:postmaster) after:${dateStr}`;
    
    const messageList = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      includeSpamTrash: true,
    });
    
    if (!messageList.data.messages || messageList.data.messages.length === 0) {
      console.log('[Bounce Detector] No bounce messages found');
      return 0;
    }
    
    console.log(`[Bounce Detector] Found ${messageList.data.messages.length} potential bounce messages`);
    
    let bouncesDetected = 0;
    let skippedAlreadyProcessed = 0;
    let skippedNotBounce = 0;
    let skippedNoEmailExtracted = 0;
    let skippedNoRecord = 0;
    let skippedExistingBounce = 0;
    
    for (const msgInfo of messageList.data.messages) {
      if (!msgInfo.id) continue;
      
      const existing = await db.select({ id: bouncedEmails.id })
        .from(bouncedEmails)
        .where(eq(bouncedEmails.gmailMessageId, msgInfo.id))
        .limit(1);
      
      if (existing.length > 0) {
        skippedAlreadyProcessed++;
        continue;
      }
      
      try {
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: msgInfo.id,
          format: 'full',
        });
        
        const headers = message.data.payload?.headers || [];
        const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
        const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';
        
        // Recursively collect all text parts and delivery-status parts
        type MimePart = gmail_v1.Schema$MessagePart;
        function collectParts(part: MimePart, plain: string[], html: string[], deliveryStatus: string[]): void {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            plain.push(Buffer.from(part.body.data, 'base64').toString('utf-8'));
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            const raw = Buffer.from(part.body.data, 'base64').toString('utf-8');
            html.push(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
          } else if (part.mimeType === 'message/delivery-status' && part.body?.data) {
            deliveryStatus.push(Buffer.from(part.body.data, 'base64').toString('utf-8'));
          }
          if (part.parts) {
            for (const child of part.parts) collectParts(child, plain, html, deliveryStatus);
          }
        }

        const plainParts: string[] = [];
        const htmlParts: string[] = [];
        const deliveryStatusParts: string[] = [];
        const payload = message.data.payload;
        if (payload?.body?.data) {
          plainParts.push(Buffer.from(payload.body.data, 'base64').toString('utf-8'));
        }
        if (payload?.parts) {
          for (const part of payload.parts) collectParts(part, plainParts, htmlParts, deliveryStatusParts);
        }

        // Extract Final-Recipient from delivery-status for precision
        let finalRecipient: string | null = null;
        for (const ds of deliveryStatusParts) {
          const match = /Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i.exec(ds);
          if (match?.[1]) { finalRecipient = match[1].trim().toLowerCase(); break; }
        }

        const bodyText = plainParts.join('\n') || htmlParts.join('\n');
        
        console.log(`[Bounce Detector] Message ${msgInfo.id}: from="${fromHeader.substring(0, 60)}" subject="${subjectHeader.substring(0, 60)}"`);

        if (!isBounceMessage(fromHeader, subjectHeader, bodyText)) {
          console.log(`[Bounce Detector]   → SKIP: not classified as bounce`);
          skippedNotBounce++;
          continue;
        }
        
        let bouncedEmailsFound = extractBouncedEmails(bodyText, subjectHeader, userEmail);

        // If body parsing found nothing, use the Final-Recipient from delivery-status (most reliable)
        if (bouncedEmailsFound.length === 0 && finalRecipient) {
          const ourNorm = normalizeEmail(userEmail);
          const frNorm = normalizeEmail(finalRecipient);
          if (frNorm !== ourNorm) {
            bouncedEmailsFound = [{ bouncedEmail: finalRecipient, originalSubject: subjectHeader, bounceReason: 'Address rejected or does not exist' }];
          }
        }

        console.log(`[Bounce Detector]   → IS bounce. finalRecipient=${finalRecipient ?? 'none'}, extracted emails: [${bouncedEmailsFound.map(b => b.bouncedEmail).join(', ')}]`);
        
        if (bouncedEmailsFound.length === 0) {
          skippedNoEmailExtracted++;
          console.log(`[Bounce Detector]   → SKIP: no email extracted from body or delivery-status`);
          continue;
        }

        for (const bounce of bouncedEmailsFound) {
          const match = await matchEmailToRecord(bounce.bouncedEmail);
          console.log(`[Bounce Detector]   → matchEmailToRecord(${bounce.bouncedEmail}): type=${match.type}`);
          
          if (match.type === 'none') {
            skippedNoRecord++;
            continue;
          }
          
          const existingBounce = await db.select({ id: bouncedEmails.id })
            .from(bouncedEmails)
            .where(and(
              eq(bouncedEmails.bouncedEmailNormalized, normalizeEmail(bounce.bouncedEmail)),
              eq(bouncedEmails.status, 'pending')
            ))
            .limit(1);
          
          if (existingBounce.length > 0) {
            skippedExistingBounce++;
            continue;
          }
          
          const bounceType = classifyBounceType(bounce.bounceReason);
          const outreachHistorySnapshot = await captureOutreachHistory(match.customerId, match.leadId);

          const insertData: InsertBouncedEmail = {
            bouncedEmail: bounce.bouncedEmail,
            bouncedEmailNormalized: normalizeEmail(bounce.bouncedEmail),
            bounceSubject: bounce.originalSubject?.substring(0, 500),
            bounceDate: dateHeader ? new Date(dateHeader) : new Date(),
            bounceReason: bounce.bounceReason,
            gmailMessageId: msgInfo.id,
            detectedBy: userId,
            customerId: match.customerId || null,
            contactId: match.contactId || null,
            leadId: match.leadId || null,
            matchType: match.type,
            status: 'pending',
            bounceType,
            outreachHistorySnapshot,
          };
          
          await db.insert(bouncedEmails).values(insertData);
          bouncesDetected++;
          
          console.log(`[Bounce Detector] Detected bounce for ${bounce.bouncedEmail} (${match.type})`);

          // Cancel any active drip campaign assignments for this lead/customer
          try {
            const conditions: any[] = [eq(dripCampaignAssignments.status, 'active')];

            if (match.type === 'lead' && match.leadId) {
              conditions.push(eq(dripCampaignAssignments.leadId, match.leadId));
            } else if (match.type === 'customer' && match.customerId) {
              conditions.push(eq(dripCampaignAssignments.customerId, match.customerId));
            } else {
              conditions.length = 0; // no valid match to cancel
            }

            if (conditions.length > 0) {
              const activeAssignments = await db
                .select({ id: dripCampaignAssignments.id, leadId: dripCampaignAssignments.leadId })
                .from(dripCampaignAssignments)
                .where(and(...conditions));

              for (const assignment of activeAssignments) {
                await db
                  .update(dripCampaignStepStatus)
                  .set({ status: 'skipped' })
                  .where(
                    and(
                      eq(dripCampaignStepStatus.assignmentId, assignment.id),
                      eq(dripCampaignStepStatus.status, 'scheduled')
                    )
                  );

                await db
                  .update(dripCampaignAssignments)
                  .set({ status: 'cancelled', cancelledAt: new Date() })
                  .where(eq(dripCampaignAssignments.id, assignment.id));

                if (assignment.leadId) {
                  await db.insert(leadActivities).values({
                    leadId: assignment.leadId,
                    activityType: 'note',
                    summary: 'Drip campaign stopped — email bounced',
                    details: 'Email address bounced. All remaining drip steps have been cancelled automatically.',
                  });
                }

                console.log(`[Bounce Detector] Drip assignment #${assignment.id} cancelled due to email bounce`);
              }
            }
          } catch (err) {
            console.error('[Bounce Detector] Failed to cancel drip on bounce:', err);
          }
        }
      } catch (msgError) {
        console.error(`[Bounce Detector] Failed to process message ${msgInfo.id}:`, msgError);
      }
    }
    
    console.log(`[Bounce Detector] Scan complete — stored: ${bouncesDetected}, skipped (already processed): ${skippedAlreadyProcessed}, skipped (not bounce): ${skippedNotBounce}, skipped (no email extracted): ${skippedNoEmailExtracted}, skipped (no matching record): ${skippedNoRecord}, skipped (existing bounce): ${skippedExistingBounce}`);
    return bouncesDetected;
    
  } catch (error) {
    console.error('[Bounce Detector] Error scanning for bounces:', error);
    return 0;
  }
}

// BUG-04 FIX: Apply userId to WHERE clause so users only see their own detected bounces.
// BUG-05 FIX: Include 'investigating' bounces whose investigateUntil date has passed.
export async function getPendingBounces(userId?: string): Promise<any[]> {
  const now = new Date();

  const bounces = await db.select({
    id: bouncedEmails.id,
    bouncedEmail: bouncedEmails.bouncedEmail,
    bounceSubject: bouncedEmails.bounceSubject,
    bounceDate: bouncedEmails.bounceDate,
    bounceReason: bouncedEmails.bounceReason,
    customerId: bouncedEmails.customerId,
    contactId: bouncedEmails.contactId,
    leadId: bouncedEmails.leadId,
    matchType: bouncedEmails.matchType,
    status: bouncedEmails.status,
    customerFirstName: customers.firstName,
    customerLastName: customers.lastName,
    customerEmail: customers.email,
  })
    .from(bouncedEmails)
    .leftJoin(customers, eq(bouncedEmails.customerId, customers.id))
    .where(and(
      or(
        eq(bouncedEmails.status, 'pending'),
        and(
          eq(bouncedEmails.status, 'investigating'),
          or(
            isNull(bouncedEmails.investigateUntil),
            lt(bouncedEmails.investigateUntil, now)
          )
        )
      ),
      userId ? eq(bouncedEmails.detectedBy, userId) : undefined
    ))
    .orderBy(bouncedEmails.bounceDate);

  return bounces.map(b => ({
    ...b,
    displayName: `${b.customerFirstName || ''} ${b.customerLastName || ''}`.trim()
      || b.customerEmail
      || null,
  }));
}

// BUG-03 FIX: Perform actual record actions (delete / DNC) after marking the bounce resolved.
// BUG-06 FIX: Add 'fix_email' resolution path to update the customer or lead email address.
export async function resolveBounce(
  bounceId: number,
  resolution: 'delete' | 'mark_dnc' | 'keep' | 'fix_email',
  userId: string,
  correctedEmail?: string
): Promise<void> {
  const [bounceRecord] = await db.select()
    .from(bouncedEmails)
    .where(eq(bouncedEmails.id, bounceId))
    .limit(1);

  if (!bounceRecord) return;

  if (resolution === 'delete') {
    if (bounceRecord.customerId) {
      await db.delete(customers).where(eq(customers.id, bounceRecord.customerId));
    }
    if (bounceRecord.leadId) {
      await db.delete(leads).where(eq(leads.id, bounceRecord.leadId));
    }
  }

  if (resolution === 'mark_dnc') {
    if (bounceRecord.customerId) {
      await db.update(customers)
        .set({ doNotContact: true, doNotContactReason: 'Email bounced' })
        .where(eq(customers.id, bounceRecord.customerId));
    }
    if (bounceRecord.leadId) {
      await db.update(leads)
        .set({ doNotContact: true, lostReason: 'Email bounced' })
        .where(eq(leads.id, bounceRecord.leadId));
    }
  }

  if (resolution === 'fix_email' && correctedEmail) {
    if (bounceRecord.customerId) {
      await db.update(customers)
        .set({ email: correctedEmail })
        .where(eq(customers.id, bounceRecord.customerId));
    }
    if (bounceRecord.contactId) {
      await db.update(customerContacts)
        .set({ email: correctedEmail })
        .where(eq(customerContacts.id, bounceRecord.contactId));
    }
    if (bounceRecord.leadId) {
      await db.update(leads)
        .set({ email: correctedEmail })
        .where(eq(leads.id, bounceRecord.leadId));
    }
  }

  await db.update(bouncedEmails)
    .set({
      status: 'resolved',
      resolution,
      resolvedAt: new Date(),
      resolvedBy: userId,
    })
    .where(eq(bouncedEmails.id, bounceId));
}
