import { db } from "./db";
import { gmailSyncState, gmailMessages, gmailInsights, customers, shipmentFollowUpTasks, userGmailConnections, leads, followUpTasks } from "@shared/schema";
import { eq, and, desc, sql, inArray, lt, isNull, or, ne } from "drizzle-orm";
import { getMessages, getMessage } from "./gmail-client";
import { getImapMessages, getImapMessage, hasAnyImapCredentials } from "./imap-client";
import { getUserGmailConnection, getUserGmailMessages, getUserGmailMessage } from "./user-gmail-oauth";
import { syncGmailMessages as syncGmailMessagesWorker } from "./gmail-sync-worker";
import { processUnanalyzedMessages, createFollowUpTasksFromEvents } from "./email-event-extractor";
import { syncUserSentMailActivities } from "./gmail-sent-activity-sync";
import OpenAI from "openai";
import { logApiCost } from "./cost-tracker";
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from "./advisory-lock";
import { isAIEmailAnalysisEnabled } from "./admin-settings";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Domains to exclude from email analysis (marketing, notifications, internal systems)
const EXCLUDED_EMAIL_DOMAINS = [
  // Google/System notifications
  'google.com',
  'accounts.google.com',
  'calendar-notification.google.com',
  'notifications.google.com',
  
  // Banks & Financial (transactional only)
  'regions.com',
  'alert.regions.com',
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'paypal.com',
  'americanexpress.com',
  'welcome.americanexpress.com',
  'amex.com',
  
  // Accounting/Business tools notifications
  'intuit.com',
  'notification.intuit.com',
  'quickbooks.com',
  
  // Personal/Internal (user-specific)
  'technovaindia.com',
  'polyplex.com',
  'meruaccounts.com',
  
  // Telecom
  'verizon.com',
  'vzwpix.com',
  
  // Government/Public notifications
  'public.govdelivery.com',
  'govdelivery.com',
  
  // Common marketing/transactional senders
  'sunpass.com',
  'microsoft.com',
  'microsoftstore.microsoft.com',
  'apple.com',
  'amazon.com',
  'noreply.github.com',
  'replit.com',
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  
  // Billing/SaaS notifications
  'nutshell.com',
  'leadforensics.com',
  'afternic.com',
  'mailmc.afternic.com',
  'sam.gov',
  
  // Marketing/spam patterns
  '163.com',
];

// Check if an email should be excluded based on sender domain
function shouldExcludeEmail(fromEmail: string): boolean {
  if (!fromEmail) return true;
  const domain = fromEmail.toLowerCase().split('@')[1] || '';
  return EXCLUDED_EMAIL_DOMAINS.some(excluded => 
    domain === excluded || domain.endsWith('.' + excluded)
  );
}

function parseEmailAddress(raw: string): { email: string; name: string } {
  const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
  if (match) {
    return { name: match[1]?.trim() || '', email: match[2]?.trim() || raw };
  }
  return { name: '', email: raw };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getSyncState(userId: string) {
  const [state] = await db.select().from(gmailSyncState).where(eq(gmailSyncState.userId, userId));
  return state;
}

export async function createOrUpdateSyncState(userId: string, updates: Partial<typeof gmailSyncState.$inferSelect>) {
  const existing = await getSyncState(userId);
  if (existing) {
    await db.update(gmailSyncState)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gmailSyncState.userId, userId));
  } else {
    await db.insert(gmailSyncState).values({
      userId,
      ...updates,
    });
  }
}

export async function syncGmailMessages(userId: string, userEmail: string, maxMessages: number = 50, afterDate?: Date) {
  console.log(`[Gmail Intelligence] Starting sync for user ${userId}${afterDate ? ` (after ${afterDate.toISOString().slice(0,10)})` : ''}`);
  
  await createOrUpdateSyncState(userId, { syncStatus: 'syncing' });

  try {
    let inboxMessages: any[];
    let sentMessages: any[];
    let useMethod: 'per-user-oauth' | 'imap' | 'shared-gmail' = 'shared-gmail';
    
    // Priority 1: Check for per-user Gmail OAuth connection
    const userGmailConn = await getUserGmailConnection(userId);
    if (userGmailConn && userGmailConn.isActive) {
      useMethod = 'per-user-oauth';
      console.log(`[Gmail Intelligence] Using per-user OAuth for: ${userGmailConn.gmailAddress}`);
      inboxMessages = await getUserGmailMessages(userId, 'INBOX', maxMessages, afterDate);
      sentMessages = await getUserGmailMessages(userId, 'SENT', maxMessages, afterDate);
      
      // Update last sync time on user's connection
      await db.update(userGmailConnections)
        .set({ lastSyncAt: new Date(), lastError: null })
        .where(eq(userGmailConnections.userId, userId));
    } 
    // Priority 2: Fall back to IMAP if configured
    else if (await hasAnyImapCredentials()) {
      useMethod = 'imap';
      console.log('[Gmail Intelligence] Using IMAP client for email sync');
      inboxMessages = await getImapMessages('INBOX', maxMessages);
      sentMessages = await getImapMessages('SENT', maxMessages);
    } 
    // Priority 3: Fall back to shared Gmail API (may have limited permissions)
    else {
      console.log('[Gmail Intelligence] Using shared Gmail API client');
      inboxMessages = await getMessages('INBOX', maxMessages);
      sentMessages = await getMessages('SENT', maxMessages);
    }
    
    console.log(`[Gmail Intelligence] Method: ${useMethod}, Inbox: ${inboxMessages.length}, Sent: ${sentMessages.length}`);
    
    const allMessages = [
      ...inboxMessages.map(m => ({ ...m, direction: 'inbound' as const })),
      ...sentMessages.map(m => ({ ...m, direction: 'outbound' as const }))
    ];

    const existingMsgIds = await db.select({ gmailMessageId: gmailMessages.gmailMessageId })
      .from(gmailMessages)
      .where(eq(gmailMessages.userId, userId));
    const existingSet = new Set(existingMsgIds.map(m => m.gmailMessageId));

    const newMessages = allMessages.filter(m => m.id && !existingSet.has(m.id));
    console.log(`[Gmail Intelligence] Found ${newMessages.length} new messages to process`);

    // Build customer lookup maps - email-based and domain-based
    const customerData = await db.select({ 
      id: customers.id, 
      email: customers.email,
      website: customers.website 
    }).from(customers);
    
    const emailToCustomer: Record<string, string> = {};
    const domainToCustomer: Record<string, string> = {};
    
    customerData.forEach(c => {
      // Exact email match
      if (c.email) {
        emailToCustomer[c.email.toLowerCase()] = c.id;
        // Also extract domain from customer email for domain matching
        const emailDomain = c.email.toLowerCase().split('@')[1];
        if (emailDomain && !domainToCustomer[emailDomain]) {
          domainToCustomer[emailDomain] = c.id;
        }
      }
      // Website domain matching (extract domain from website URL)
      if (c.website) {
        try {
          const website = c.website.toLowerCase();
          const urlMatch = website.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
          if (urlMatch && urlMatch[1]) {
            const websiteDomain = urlMatch[1];
            if (!domainToCustomer[websiteDomain]) {
              domainToCustomer[websiteDomain] = c.id;
            }
          }
        } catch (e) {
          // Ignore malformed URLs
        }
      }
    });

    let processed = 0;
    let skipped = 0;
    for (const msg of newMessages) {
      if (!msg.id) continue;
      
      let fullMessage;
      if (useMethod === 'per-user-oauth') {
        fullMessage = await getUserGmailMessage(userId, msg.id);
      } else if (useMethod === 'imap') {
        fullMessage = await getImapMessage(msg.id);
      } else {
        fullMessage = await getMessage(msg.id);
      }
      const fromParsed = parseEmailAddress(fullMessage.from);
      const toParsed = parseEmailAddress(fullMessage.to);
      
      // Skip emails from excluded domains (marketing, notifications, banks, etc.)
      if (shouldExcludeEmail(fromParsed.email)) {
        skipped++;
        console.log(`[Gmail Intelligence] Skipping email from excluded domain: ${fromParsed.email}`);
        continue;
      }
      
      const contactEmail = msg.direction === 'inbound' ? fromParsed.email : toParsed.email;
      const contactEmailLower = contactEmail.toLowerCase();
      const contactDomain = contactEmailLower.split('@')[1] || '';
      
      // Try exact email match first, then fall back to domain matching
      let customerId = emailToCustomer[contactEmailLower] || null;
      let matchMethod = customerId ? 'email' : null;
      
      if (!customerId && contactDomain) {
        customerId = domainToCustomer[contactDomain] || null;
        matchMethod = customerId ? 'domain' : null;
      }
      
      if (customerId && matchMethod) {
        console.log(`[Gmail Intelligence] Matched ${contactEmail} to customer via ${matchMethod}`);
      }
      
      const bodyText = stripHtml(fullMessage.body);

      const truncate = (val: string | null | undefined, maxLen: number) => val ? val.substring(0, maxLen) : null;

      const [insertedMessage] = await db.insert(gmailMessages).values({
        userId,
        gmailMessageId: msg.id,
        threadId: truncate(msg.threadId, 100),
        direction: msg.direction,
        fromEmail: truncate(fromParsed.email, 255),
        fromName: truncate(fromParsed.name, 255),
        toEmail: truncate(toParsed.email, 255),
        toName: truncate(toParsed.name, 255),
        subject: truncate(fullMessage.subject, 1000),
        snippet: fullMessage.snippet || null,
        bodyText: bodyText.substring(0, 10000),
        sentAt: msg.date ? new Date(msg.date) : null,
        customerId,
        analysisStatus: 'pending',
      }).returning();
      
      // Auto-assign unassigned contacts to this user when there's email communication
      if (customerId) {
        const [customer] = await db.select({ salesRepId: customers.salesRepId })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);
        
        if (customer && !customer.salesRepId) {
          // Get user's name for salesRepName
          const userResult = await db.execute(sql`
            SELECT first_name, last_name, email FROM users WHERE id = ${userId} LIMIT 1
          `);
          const user = userResult.rows?.[0] as any;
          const userName = user?.first_name && user?.last_name 
            ? `${user.first_name} ${user.last_name}` 
            : (user?.email || 'Unknown');
          
          await db.update(customers)
            .set({ 
              salesRepId: userId,
              salesRepName: userName as string,
              updatedAt: new Date()
            })
            .where(eq(customers.id, customerId));
          
          console.log(`[Gmail Intelligence] Auto-assigned customer ${customerId} to user ${userId}`);
        }
      }
      
      // Detect shipment emails and create follow-up tasks
      if (msg.direction === 'outbound') {
        await detectAndCreateShipmentFollowUp(insertedMessage, userId);
      } else {
        // Check if this is a reply to a shipment email
        await checkForReplyAndCloseTask(insertedMessage, userId);
      }
      
      processed++;
    }

    const currentState = await getSyncState(userId);
    await createOrUpdateSyncState(userId, { 
      syncStatus: 'idle',
      lastSyncedAt: new Date(),
      messagesProcessed: (currentState?.messagesProcessed || 0) + processed,
      lastError: null
    });

    console.log(`[Gmail Intelligence] Sync complete. Processed ${processed} new messages, skipped ${skipped} (excluded domains)`);
    return { success: true, processedCount: processed, skippedCount: skipped };
  } catch (error: any) {
    console.error('[Gmail Intelligence] Sync error:', error);
    await createOrUpdateSyncState(userId, { 
      syncStatus: 'error',
      lastError: error.message 
    });
    throw error;
  }
}

// Batch size for email analysis - process multiple emails per API call
const BATCH_SIZE = 5;

export async function analyzeMessagesForInsights(userId: string, limit: number = 20, analyzeAll: boolean = false) {
  console.log(`[Gmail Intelligence] Analyzing messages for user ${userId}${analyzeAll ? ' (analyzing all users)' : ''}`);
  
  const pendingMessages = await db.select()
    .from(gmailMessages)
    .where(analyzeAll 
      ? eq(gmailMessages.analysisStatus, 'pending')
      : and(
          eq(gmailMessages.userId, userId),
          eq(gmailMessages.analysisStatus, 'pending')
        )
    )
    .limit(limit);

  if (pendingMessages.length === 0) {
    console.log('[Gmail Intelligence] No pending messages to analyze');
    return { analyzed: 0, insights: 0 };
  }

  let totalInsights = 0;
  let analyzed = 0;

  // Process in batches to reduce API calls
  for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
    const batch = pendingMessages.slice(i, i + BATCH_SIZE);
    
    try {
      // Mark batch as processing
      for (const message of batch) {
        await db.update(gmailMessages)
          .set({ analysisStatus: 'processing' })
          .where(eq(gmailMessages.id, message.id));
      }

      // Extract insights from batch in single API call
      const batchInsights = await extractInsightsFromBatch(batch);
      
      // Process results for each message
      for (const { messageId, insights } of batchInsights) {
        const message = batch.find(m => m.id === messageId);
        if (!message) continue;
        
        for (const insight of insights) {
          await db.insert(gmailInsights).values({
            messageId: message.id,
            userId,
            customerId: message.customerId,
            insightType: insight.type,
            summary: insight.summary,
            details: insight.details,
            confidence: insight.confidence.toString(),
            dueDate: insight.dueDate,
            priority: insight.priority,
            status: 'pending',
          });
          totalInsights++;
          
          if (message.customerId && insight.confidence >= 0.70 && 
              ['sales_opportunity', 'follow_up', 'promise', 'task'].includes(insight.type)) {
            try {
              const existingTask = await db.select({ id: followUpTasks.id })
                .from(followUpTasks)
                .where(and(
                  eq(followUpTasks.customerId, message.customerId),
                  eq(followUpTasks.sourceType, 'gmail_insight'),
                  eq(followUpTasks.status, 'pending'),
                  eq(followUpTasks.title, insight.summary.substring(0, 255)),
                ))
                .limit(1);
              
              if (existingTask.length === 0) {
                const taskDue = insight.dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000);
                const priorityMap: Record<string, string> = { urgent: 'urgent', high: 'high', medium: 'normal', low: 'normal' };
                const taskTypeMap: Record<string, string> = {
                  sales_opportunity: 'opportunity_follow_up',
                  follow_up: 'ai_follow_up',
                  promise: 'promise_follow_up',
                  task: 'ai_task',
                };
                await db.insert(followUpTasks).values({
                  customerId: message.customerId,
                  title: insight.summary.substring(0, 255),
                  description: `AI Insight: ${insight.details || insight.summary}`,
                  taskType: taskTypeMap[insight.type] || 'ai_follow_up',
                  priority: priorityMap[insight.priority || 'medium'] || 'normal',
                  status: 'pending',
                  dueDate: taskDue,
                  sourceType: 'gmail_insight',
                  sourceId: message.id.toString(),
                  isAutoGenerated: true,
                  assignedTo: userId,
                });
              }
            } catch (bridgeErr) {
              console.error('[Gmail Intelligence] Error bridging insight to follow-up task:', bridgeErr);
            }
          }
        }
        
        await db.update(gmailMessages)
          .set({ analysisStatus: 'completed', analyzedAt: new Date() })
          .where(eq(gmailMessages.id, message.id));
        analyzed++;
      }
      
      console.log(`[Gmail Intelligence] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} emails processed`);
    } catch (error: any) {
      console.error(`[Gmail Intelligence] Batch error:`, error);
      // Mark batch as failed
      for (const message of batch) {
        await db.update(gmailMessages)
          .set({ analysisStatus: 'failed' })
          .where(eq(gmailMessages.id, message.id));
      }
    }
  }

  const finalState = await getSyncState(userId);
  await createOrUpdateSyncState(userId, {
    insightsExtracted: (finalState?.insightsExtracted || 0) + totalInsights,
  });

  console.log(`[Gmail Intelligence] Analysis complete. Analyzed ${analyzed} messages, extracted ${totalInsights} insights`);
  return { analyzed, insights: totalInsights };
}

interface ExtractedInsight {
  type: 
    | 'sales_opportunity' 
    | 'promise' 
    | 'follow_up' 
    | 'task' 
    | 'question'
    | 'unanswered_quote'
    | 'stale_negotiation'
    | 'urgent_request'
    | 'competitor_mention'
    | 'budget_timing'
    | 'decision_maker'
    | 'repeat_inquiry'
    | 'meeting_followup'
    | 'complaint'
    | 'reengagement'
    | 'thank_you'
    | 'attachment_request';
  summary: string;
  details: string;
  confidence: number;
  dueDate: Date | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface BatchInsightResult {
  messageId: number;
  insights: ExtractedInsight[];
}

// Batch extraction - processes multiple emails in a single OpenAI call
async function extractInsightsFromBatch(messages: typeof gmailMessages.$inferSelect[]): Promise<BatchInsightResult[]> {
  if (messages.length === 0) return [];
  
  // Format all emails for batch processing
  const emailsContent = messages.map((message, idx) => `
=== EMAIL ${idx + 1} (ID: ${message.id}) ===
Subject: ${message.subject}
From: ${message.fromName} <${message.fromEmail}>
To: ${message.toName} <${message.toEmail}>
Date: ${message.sentAt?.toISOString() || 'Unknown'}
Direction: ${message.direction === 'outbound' ? 'Sent by me' : 'Received'}

Content:
${message.bodyText?.substring(0, 2000) || message.snippet || 'No content'}
`).join('\n');

  const systemPrompt = `You are a sales intelligence assistant analyzing business emails for a printing/packaging supplies company. Extract actionable insights from MULTIPLE emails.

INSIGHT TYPES TO DETECT:
1. PROMISE: Commitments made to customers
2. FOLLOW_UP: Required follow-up actions
3. SALES_OPPORTUNITY: Buying signals
4. TASK: Specific action items
5. QUESTION: Unanswered customer questions
6. UNANSWERED_QUOTE: Customer asked for pricing but no response yet
7. STALE_NEGOTIATION: Price discussions needing follow-up
8. URGENT_REQUEST: Time-sensitive requests
9. COMPETITOR_MENTION: Competitor or shopping mentions
10. BUDGET_TIMING: Budget cycle or approval timing mentions
11. DECISION_MAKER: Escalation to decision makers
12. REPEAT_INQUIRY: Repeated interest in products
13. MEETING_FOLLOWUP: Meeting discussions without calendar invite
14. COMPLAINT: Customer frustration or issues
15. REENGAGEMENT: Opportunity to reconnect
16. THANK_YOU: Positive feedback
17. ATTACHMENT_REQUEST: Request for materials

Return JSON: {"results": [{"emailId": <number>, "insights": [...]}]}

Each insight: {type, summary (max 100 chars), details, confidence (0.0-1.0), dueDate (ISO or null), priority}
Only include insights with confidence >= 0.6.
Return empty insights array [] for emails with no actionable insights.`;

  try {
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Cost-optimized: 16x cheaper, highly capable for email analysis
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze these ${messages.length} emails:\n${emailsContent}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    });
    const duration = Date.now() - startTime;

    await logApiCost({
      userId: messages[0].userId,
      apiProvider: 'openai',
      model: 'gpt-4o-mini',
      operation: 'gmail_batch_analysis',
      functionName: 'extractInsightsFromBatch',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      requestDurationMs: duration,
      success: true,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[Gmail AI] No batch response content');
      return messages.map(m => ({ messageId: m.id, insights: [] }));
    }

    const parsed = JSON.parse(content);
    const results = parsed.results || [];
    
    console.log(`[Gmail AI] Batch processed ${messages.length} emails in single API call`);
    
    // Map results back to message IDs
    return messages.map(message => {
      const result = results.find((r: any) => r.emailId === message.id);
      const rawInsights = result?.insights || [];
      
      const insights: ExtractedInsight[] = rawInsights
        .filter((i: any) => i.confidence >= 0.6)
        .map((i: any) => ({
          type: i.type,
          summary: i.summary?.substring(0, 200) || '',
          details: i.details?.substring(0, 1000) || '',
          confidence: parseFloat(i.confidence) || 0.7,
          dueDate: i.dueDate ? new Date(i.dueDate) : null,
          priority: i.priority || 'medium',
        }));
      
      return { messageId: message.id, insights };
    });
  } catch (error: any) {
    console.error('[Gmail Intelligence] Batch OpenAI error:', error);
    // Return empty results for all messages on error
    return messages.map(m => ({ messageId: m.id, insights: [] }));
  }
}

async function extractInsightsFromEmail(message: typeof gmailMessages.$inferSelect): Promise<ExtractedInsight[]> {
  const emailContent = `
Subject: ${message.subject}
From: ${message.fromName} <${message.fromEmail}>
To: ${message.toName} <${message.toEmail}>
Date: ${message.sentAt?.toISOString() || 'Unknown'}
Direction: ${message.direction === 'outbound' ? 'Sent by me' : 'Received'}

Content:
${message.bodyText?.substring(0, 4000) || message.snippet || 'No content'}
`;

  const systemPrompt = `You are a sales intelligence assistant analyzing business emails for a printing/packaging supplies company. Extract actionable insights from emails.

INSIGHT TYPES TO DETECT:

**Core Sales Actions:**
1. PROMISE: Commitments made to customers (e.g., "I'll send you a quote by Friday")
2. FOLLOW_UP: Required follow-up actions (e.g., "touch base next month")
3. SALES_OPPORTUNITY: Buying signals (e.g., "interested in pricing", "looking to order")
4. TASK: Specific action items (e.g., "send samples", "check inventory")
5. QUESTION: Unanswered customer questions requiring response

**High-Priority Detections:**
6. UNANSWERED_QUOTE: Customer asked for pricing/quote but this is an INBOUND email with no apparent response yet. Look for: "what's the price", "can you quote", "need pricing on", "how much for"
7. STALE_NEGOTIATION: Email discusses pricing negotiation, discounts, or terms that needs follow-up. Look for: price discussions, "can you do better", "need approval", negotiation language
8. URGENT_REQUEST: Emails with urgent language needing quick action. Look for: "ASAP", "urgent", "rush", "deadline tomorrow", "need by [near date]", "emergency"
9. COMPETITOR_MENTION: Customer mentions competitors or shopping around. Look for: competitor names, "shopping around", "comparing quotes", "other suppliers", "your competition"

**Opportunity Signals:**
10. BUDGET_TIMING: Mentions of budget cycles or approval timing. Look for: "end of quarter", "budget approval", "fiscal year", "spending before", "Q1/Q2/Q3/Q4 budget"
11. DECISION_MAKER: Escalation to decision makers. Look for: "forwarding to my boss", "need approval from", "running by management", "our purchasing team"
12. REPEAT_INQUIRY: Indicates repeat interest in same product category. Look for: "asking again about", "still interested in", "following up on my previous"

**Promise & Commitment Tracking:**
13. MEETING_FOLLOWUP: Discussion of meetings/calls without clear calendar invite. Look for: "let's schedule a call", "should we meet", "want to discuss on the phone"

**Customer Health:**
14. COMPLAINT: Customer frustration or issues. Look for: quality issues, delivery problems, frustrated tone, "disappointed", "unacceptable", "problem with"
15. REENGAGEMENT: Opportunity to reconnect with inactive customer. Look for: "been a while", "last ordered", "haven't heard from you", "what's new"
16. THANK_YOU: Positive feedback indicating satisfaction. Look for: "thank you", "great job", "appreciate", "excellent service", "happy with"

**Attachment Tracking:**
17. ATTACHMENT_REQUEST: Customer requested materials that may need follow-up. Look for: "send me the spec sheet", "can I get a catalog", "need technical data", "product info"

Return JSON: {"insights": [...]}

Each insight must have:
- type: one of the types above in lowercase with underscores (e.g., "unanswered_quote", "competitor_mention")
- summary: brief 1-sentence description (max 100 chars)
- details: fuller context from the email
- confidence: 0.0-1.0 how confident this is actionable
- dueDate: ISO date string if deadline mentioned, null otherwise
- priority: "low", "medium", "high", or "urgent"

PRIORITY GUIDELINES:
- urgent: unanswered_quote, urgent_request, complaint
- high: stale_negotiation, competitor_mention, decision_maker, budget_timing
- medium: promise, follow_up, sales_opportunity, meeting_followup, attachment_request
- low: task, question, thank_you, reengagement, repeat_inquiry

Only extract insights with confidence >= 0.6. Return empty array [] if no actionable insights.
Ignore auto-replies, newsletters, spam, and marketing emails.`;

  try {
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Cost-optimized: 16x cheaper, highly capable for email analysis
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: emailContent }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });
    const duration = Date.now() - startTime;

    await logApiCost({
      userId: message.userId,
      apiProvider: 'openai',
      model: 'gpt-4o-mini',
      operation: 'gmail_analysis',
      functionName: 'extractInsightsFromEmail',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      requestDurationMs: duration,
      success: true,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log(`[Gmail AI] No response content for message ${message.id}`);
      return [];
    }

    const parsed = JSON.parse(content);
    const rawInsights = parsed.insights || parsed || [];
    console.log(`[Gmail AI] Message ${message.id} "${message.subject?.substring(0, 40)}": AI found ${rawInsights.length} raw insights`);
    
    if (rawInsights.length > 0) {
      console.log(`[Gmail AI] Raw insights:`, JSON.stringify(rawInsights.slice(0, 2)));
    }
    
    const insights: ExtractedInsight[] = rawInsights
      .filter((i: any) => i.confidence >= 0.6)
      .map((i: any) => ({
        type: i.type,
        summary: i.summary?.substring(0, 200) || '',
        details: i.details?.substring(0, 1000) || '',
        confidence: parseFloat(i.confidence) || 0.7,
        dueDate: i.dueDate ? new Date(i.dueDate) : null,
        priority: i.priority || 'medium',
      }));

    console.log(`[Gmail AI] After confidence filter: ${insights.length} insights`);
    return insights;
  } catch (error: any) {
    console.error('[Gmail Intelligence] OpenAI error:', error);
    return [];
  }
}

export async function getInsightsForUser(userId: string, filters?: { 
  status?: string; 
  type?: string; 
  customerId?: string;
  limit?: number;
  showAll?: boolean;
}) {
  let query = db.select({
    insight: gmailInsights,
    message: gmailMessages,
    customer: customers,
  })
    .from(gmailInsights)
    .leftJoin(gmailMessages, eq(gmailInsights.messageId, gmailMessages.id))
    .leftJoin(customers, eq(gmailInsights.customerId, customers.id))
    .orderBy(desc(gmailInsights.createdAt))
    .limit(filters?.limit || 50);
  
  if (!filters?.showAll) {
    query = query.where(eq(gmailInsights.userId, userId)) as typeof query;
  }

  const results = await query;
  
  return results.map(r => ({
    ...r.insight,
    email: r.message ? {
      subject: r.message.subject,
      from: r.message.fromEmail,
      to: r.message.toEmail,
      date: r.message.sentAt,
      direction: r.message.direction,
    } : null,
    customer: r.customer ? {
      id: r.customer.id,
      firstName: r.customer.firstName,
      lastName: r.customer.lastName,
      company: r.customer.company,
      email: r.customer.email,
    } : null,
  }));
}

export async function updateInsightStatus(insightId: number, status: string, userId: string, reason?: string) {
  const updates: any = { 
    status, 
    updatedAt: new Date() 
  };
  
  if (status === 'completed') {
    updates.completedAt = new Date();
    updates.completedBy = userId;
  } else if (status === 'dismissed') {
    updates.dismissedAt = new Date();
    updates.dismissedReason = reason;
  }

  await db.update(gmailInsights)
    .set(updates)
    .where(and(
      eq(gmailInsights.id, insightId),
      eq(gmailInsights.userId, userId)
    ));
}

export async function getInsightsSummary(userId: string, showAll: boolean = false) {
  let query = db.select({
    status: gmailInsights.status,
    type: gmailInsights.insightType,
    count: sql<number>`count(*)::int`,
  })
    .from(gmailInsights)
    .groupBy(gmailInsights.status, gmailInsights.insightType);
  
  if (!showAll) {
    query = query.where(eq(gmailInsights.userId, userId)) as typeof query;
  }
  
  const stats = await query;

  const pending = stats.filter(s => s.status === 'pending');
  const byType: Record<string, number> = {};
  pending.forEach(s => {
    byType[s.type] = (byType[s.type] || 0) + s.count;
  });

  const urgent = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailInsights)
    .where(and(
      eq(gmailInsights.userId, userId),
      eq(gmailInsights.status, 'pending'),
      eq(gmailInsights.priority, 'urgent')
    ));

  const overdueCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(gmailInsights)
    .where(and(
      eq(gmailInsights.userId, userId),
      eq(gmailInsights.status, 'pending'),
      sql`${gmailInsights.dueDate} < NOW()`
    ));

  return {
    totalPending: pending.reduce((sum, s) => sum + s.count, 0),
    byType,
    urgent: urgent[0]?.count || 0,
    overdue: overdueCount[0]?.count || 0,
  };
}

// Shipment Follow-up Detection
const SHIPMENT_KEYWORDS = [
  'swatchbook', 'swatch book', 'swatches sent', 'sending swatches',
  'press test kit', 'press-test kit', 'test kit sent', 'sending test kit',
  'samples sent', 'sending samples', 'shipped samples', 'mailing samples',
  'shipped out', 'sending out', 'mailed out', 'package sent',
  'tracking number', 'tracking info', 'shipped via', 'shipping via',
];

const CARRIER_PATTERNS: { pattern: RegExp; carrier: string }[] = [
  { pattern: /\b(ups|united parcel)\b/i, carrier: 'ups' },
  { pattern: /\b(fedex|fed[-\s]?ex)\b/i, carrier: 'fedex' },
  { pattern: /\b(usps|postal service|usmail)\b/i, carrier: 'usps' },
  { pattern: /\b(dhl)\b/i, carrier: 'dhl' },
];

const TRACKING_PATTERNS = [
  /\b(1Z[A-Z0-9]{16})\b/i, // UPS
  /\b(\d{12,22})\b/, // FedEx
  /\b(\d{20,22})\b/, // USPS
  /\b(9[0-4]\d{20,21})\b/, // USPS
];

function detectShipmentType(subject: string, body: string): string | null {
  const text = `${subject} ${body}`.toLowerCase();
  if (text.includes('swatchbook') || text.includes('swatch book') || text.includes('swatches')) return 'swatchbook';
  if (text.includes('press test') || text.includes('test kit')) return 'press_test_kit';
  if (text.includes('sample') || text.includes('samples')) return 'samples';
  if (SHIPMENT_KEYWORDS.some(kw => text.includes(kw))) return 'package';
  return null;
}

function detectCarrier(text: string): string | null {
  for (const { pattern, carrier } of CARRIER_PATTERNS) {
    if (pattern.test(text)) return carrier;
  }
  return null;
}

function extractTrackingNumber(text: string): string | null {
  for (const pattern of TRACKING_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function detectAndCreateShipmentFollowUp(message: typeof gmailMessages.$inferSelect, userId: string) {
  if (message.direction !== 'outbound') return null;

  const subject = message.subject || '';
  const body = message.bodyText || message.snippet || '';
  const fullText = `${subject} ${body}`;

  const shipmentType = detectShipmentType(subject, body);
  if (!shipmentType) return null;

  // Check if we already have a follow-up task for this thread
  if (message.threadId) {
    const existing = await db.select().from(shipmentFollowUpTasks)
      .where(and(
        eq(shipmentFollowUpTasks.threadId, message.threadId),
        eq(shipmentFollowUpTasks.userId, userId),
        eq(shipmentFollowUpTasks.status, 'pending')
      ))
      .limit(1);
    if (existing.length > 0) return null;
  }

  const carrier = detectCarrier(fullText);
  const trackingNumber = extractTrackingNumber(fullText);

  // Get customer info
  let customerCompany = '';
  if (message.customerId) {
    const [customer] = await db.select().from(customers)
      .where(eq(customers.id, message.customerId));
    if (customer) {
      customerCompany = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    }
  }

  const followUpDueDate = new Date();
  followUpDueDate.setDate(followUpDueDate.getDate() + 4); // Follow up in 4 days

  const [task] = await db.insert(shipmentFollowUpTasks).values({
    userId,
    customerId: message.customerId,
    gmailMessageId: message.id,
    threadId: message.threadId,
    shipmentType,
    carrier,
    trackingNumber,
    subject,
    recipientEmail: message.toEmail,
    recipientName: message.toName,
    customerCompany,
    sentAt: message.sentAt,
    followUpDueDate,
    status: 'pending',
  }).returning();

  console.log(`[Shipment Follow-up] Created task for ${shipmentType} to ${customerCompany || message.toEmail}`);
  return task;
}

export async function checkForReplyAndCloseTask(message: typeof gmailMessages.$inferSelect, userId: string) {
  if (message.direction !== 'inbound' || !message.threadId) return;

  // Find any pending shipment follow-up tasks for this thread
  const pendingTasks = await db.select().from(shipmentFollowUpTasks)
    .where(and(
      eq(shipmentFollowUpTasks.threadId, message.threadId),
      eq(shipmentFollowUpTasks.userId, userId),
      eq(shipmentFollowUpTasks.status, 'pending')
    ));

  for (const task of pendingTasks) {
    await db.update(shipmentFollowUpTasks)
      .set({
        status: 'completed',
        replyReceived: true,
        replyReceivedAt: message.sentAt || new Date(),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipmentFollowUpTasks.id, task.id));
    
    console.log(`[Shipment Follow-up] Auto-closed task ${task.id} - reply received`);
  }
  
  // Update lead's firstEmailReplyAt if this is a reply from a lead
  try {
    if (message.senderEmail) {
      const normalizedSender = message.senderEmail.toLowerCase().trim();
      const leadByEmail = await db.select().from(leads)
        .where(sql`LOWER(${leads.email}) = ${normalizedSender} AND ${leads.firstEmailReplyAt} IS NULL`)
        .limit(1);
      
      if (leadByEmail.length > 0) {
        await db.update(leads)
          .set({ firstEmailReplyAt: message.sentAt || new Date() })
          .where(eq(leads.id, leadByEmail[0].id));
        console.log(`[Lead Trust] Marked firstEmailReplyAt for lead ${leadByEmail[0].id} - reply received`);

        // Auto-create follow-up task when Gmail reply detected
        try {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 1);
          await db.insert(followUpTasks).values({
            leadId: leadByEmail[0].id,
            taskType: 'follow_up',
            title: `Follow up — lead replied to your email`,
            description: `Gmail detected a reply from this lead. Follow up personally.`,
            priority: 'high',
            status: 'pending',
            dueDate,
            isAutoGenerated: true,
            sourceType: 'gmail_reply',
          });
        } catch (taskErr) {
          console.error('[Lead Trust] Failed to create follow-up task:', taskErr);
        }
      }
    }
  } catch (leadError: any) {
    console.error("[Lead Trust] Error updating firstEmailReplyAt (non-critical):", leadError.message);
  }
}

export async function getShipmentFollowUpTasks(userId: string, status?: string) {
  let query = db.select().from(shipmentFollowUpTasks)
    .where(eq(shipmentFollowUpTasks.userId, userId));
  
  if (status) {
    query = db.select().from(shipmentFollowUpTasks)
      .where(and(
        eq(shipmentFollowUpTasks.userId, userId),
        eq(shipmentFollowUpTasks.status, status)
      ));
  }

  return await query.orderBy(desc(shipmentFollowUpTasks.followUpDueDate));
}

export async function getPendingShipmentReminders(userId: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return await db.select().from(shipmentFollowUpTasks)
    .where(and(
      eq(shipmentFollowUpTasks.userId, userId),
      eq(shipmentFollowUpTasks.status, 'pending'),
      lt(shipmentFollowUpTasks.followUpDueDate, now),
      or(
        isNull(shipmentFollowUpTasks.lastReminderAt),
        lt(shipmentFollowUpTasks.lastReminderAt, today)
      )
    ))
    .orderBy(shipmentFollowUpTasks.followUpDueDate);
}

export async function updateShipmentTaskStatus(
  taskId: number, 
  userId: string, 
  status: 'completed' | 'dismissed',
  reason?: string
) {
  const updates: Partial<typeof shipmentFollowUpTasks.$inferSelect> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'completed') {
    updates.completedAt = new Date();
  } else if (status === 'dismissed') {
    updates.dismissedAt = new Date();
    updates.dismissedReason = reason;
  }

  await db.update(shipmentFollowUpTasks)
    .set(updates)
    .where(and(
      eq(shipmentFollowUpTasks.id, taskId),
      eq(shipmentFollowUpTasks.userId, userId)
    ));
}

export async function markReminderSent(taskId: number) {
  await db.update(shipmentFollowUpTasks)
    .set({
      lastReminderAt: new Date(),
      reminderCount: sql`${shipmentFollowUpTasks.reminderCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(shipmentFollowUpTasks.id, taskId));
}

// Retroactively match unmatched gmail messages to customers using improved matching
export async function rematchUnmatchedMessages(): Promise<{ matched: number; total: number }> {
  console.log('[Gmail Intelligence] Starting rematch for unmatched messages...');
  
  // Get all messages without a customerId
  const unmatchedMessages = await db.select({
    id: gmailMessages.id,
    fromEmail: gmailMessages.fromEmail,
    toEmail: gmailMessages.toEmail,
    direction: gmailMessages.direction,
  })
    .from(gmailMessages)
    .where(isNull(gmailMessages.customerId));
  
  console.log(`[Gmail Intelligence] Found ${unmatchedMessages.length} unmatched messages`);
  
  if (unmatchedMessages.length === 0) {
    return { matched: 0, total: 0 };
  }
  
  // Build customer lookup maps - email-based and domain-based
  const customerData = await db.select({ 
    id: customers.id, 
    email: customers.email,
    website: customers.website 
  }).from(customers);
  
  const emailToCustomer: Record<string, string> = {};
  const domainToCustomer: Record<string, string> = {};
  
  customerData.forEach(c => {
    if (c.email) {
      emailToCustomer[c.email.toLowerCase()] = c.id;
      const emailDomain = c.email.toLowerCase().split('@')[1];
      if (emailDomain && !domainToCustomer[emailDomain]) {
        domainToCustomer[emailDomain] = c.id;
      }
    }
    if (c.website) {
      try {
        const website = c.website.toLowerCase();
        const urlMatch = website.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
        if (urlMatch && urlMatch[1]) {
          const websiteDomain = urlMatch[1];
          if (!domainToCustomer[websiteDomain]) {
            domainToCustomer[websiteDomain] = c.id;
          }
        }
      } catch (e) {
        // Ignore malformed URLs
      }
    }
  });
  
  let matched = 0;
  
  for (const msg of unmatchedMessages) {
    const contactEmail = msg.direction === 'inbound' ? msg.fromEmail : msg.toEmail;
    if (!contactEmail) continue;
    
    const contactEmailLower = contactEmail.toLowerCase();
    const contactDomain = contactEmailLower.split('@')[1] || '';
    
    // Try exact email match first, then domain match
    let customerId = emailToCustomer[contactEmailLower] || null;
    if (!customerId && contactDomain) {
      customerId = domainToCustomer[contactDomain] || null;
    }
    
    if (customerId) {
      await db.update(gmailMessages)
        .set({ customerId })
        .where(eq(gmailMessages.id, msg.id));
      matched++;
    }
  }
  
  console.log(`[Gmail Intelligence] Rematched ${matched}/${unmatchedMessages.length} messages to customers`);
  
  // Also update email_sales_events that have matching gmail_messages now with customerIds
  if (matched > 0) {
    await db.execute(sql`
      UPDATE email_sales_events e
      SET customer_id = m.customer_id
      FROM gmail_messages m
      WHERE e.gmail_message_id = m.id
        AND e.customer_id IS NULL
        AND m.customer_id IS NOT NULL
    `);
    console.log(`[Gmail Intelligence] Updated orphan events with customer IDs`);
  }
  
  // Auto-assign unassigned contacts to the first user who communicated with them
  const autoAssignResult = await db.execute(sql`
    WITH first_communicators AS (
      SELECT DISTINCT ON (m.customer_id)
        m.customer_id,
        m.user_id,
        u.first_name,
        u.last_name,
        u.email as user_email
      FROM gmail_messages m
      JOIN users u ON m.user_id = u.id
      JOIN customers c ON m.customer_id = c.id
      WHERE m.customer_id IS NOT NULL
        AND c.sales_rep_id IS NULL
      ORDER BY m.customer_id, m.sent_at ASC
    )
    UPDATE customers c
    SET 
      sales_rep_id = fc.user_id,
      sales_rep_name = COALESCE(fc.first_name || ' ' || fc.last_name, fc.user_email, 'Unknown'),
      updated_at = NOW()
    FROM first_communicators fc
    WHERE c.id = fc.customer_id
      AND c.sales_rep_id IS NULL
  `);
  console.log(`[Gmail Intelligence] Auto-assigned unassigned contacts to first communicators`);
  
  return { matched, total: unmatchedMessages.length };
}

// Check if current time is within business hours (8 AM - 6 PM local time)
function isWithinBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  // Business hours: 8:00 AM (8) to 6:00 PM (18)
  return hour >= 8 && hour < 18;
}

// Automatic sync for all connected Gmail users with guardrails
export async function syncAllConnectedUsers(): Promise<{ synced: number; failed: number; skipped: number }> {
  // Skip sync during off-hours (6 PM to 8 AM) to reduce costs
  if (!isWithinBusinessHours()) {
    const now = new Date();
    console.log(`[Gmail Sync] Outside business hours (${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}), skipping sync`);
    return { synced: 0, failed: 0, skipped: 0 };
  }
  
  // Prevent concurrent syncs
  if (isSyncing) {
    console.log('[Gmail Sync] Sync already in progress, skipping');
    return { synced: 0, failed: 0, skipped: 0 };
  }
  
  isSyncing = true;
  
  try {
    // Only sync users with active Gmail connections (guardrail)
    const activeConnections = await db.select()
      .from(userGmailConnections)
      .where(eq(userGmailConnections.isActive, true));
    
    if (activeConnections.length === 0) {
      console.log('[Gmail Sync] No active Gmail connections, skipping sync');
      return { synced: 0, failed: 0, skipped: 0 };
    }
    
    console.log(`[Gmail Sync] Found ${activeConnections.length} active Gmail connections`);
    
    let synced = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const connection of activeConnections) {
      // Check exponential backoff
      if (shouldSkipUser(connection.userId)) {
        const failure = userFailureCounts.get(connection.userId);
        console.log(`[Gmail Sync] Skipping user ${connection.userId} (backoff until ${failure?.nextRetryAt.toISOString()})`);
        skipped++;
        continue;
      }
      
      try {
        // Use delta sync with historyId when available
        const result = await syncUserGmailMessagesDelta(connection.userId, 50);
        console.log(`[Gmail Sync] User ${connection.userId}: ${result.newMessages} new emails (${result.syncType})`);
        
        // Process emails for sales events (PO, approval, samples, opportunities, etc.)
        // This uses fast keyword/regex matching - no API costs
        const eventsExtracted = await processUnanalyzedMessages(connection.userId, 100);
        if (eventsExtracted > 0) {
          console.log(`[Gmail Sync] User ${connection.userId}: ${eventsExtracted} sales events detected`);
          
          // Create follow-up tasks from the detected events
          const tasksCreated = await createFollowUpTasksFromEvents(connection.userId, 50);
          if (tasksCreated > 0) {
            console.log(`[Gmail Sync] User ${connection.userId}: ${tasksCreated} follow-up tasks created`);
          }
        }
        
        // Run AI insight extraction on select messages (limit to 20 per cycle to reduce costs)
        // Check admin setting to see if AI analysis is enabled (cost optimization toggle)
        const aiAnalysisEnabled = await isAIEmailAnalysisEnabled();
        const currentHour = new Date().getHours();
        const isBusinessHours = currentHour >= 7 && currentHour < 20;
        if (result.newMessages > 0 && aiAnalysisEnabled && isBusinessHours) {
          const analysisResult = await analyzeMessagesForInsights(connection.userId, 20);
          if (analysisResult.insights > 0) {
            console.log(`[Gmail Sync] User ${connection.userId}: ${analysisResult.insights} AI insights extracted`);
          }
        } else if (result.newMessages > 0 && !aiAnalysisEnabled) {
          console.log(`[Gmail Sync] User ${connection.userId}: Skipping AI analysis (disabled in admin settings)`);
        } else if (result.newMessages > 0 && aiAnalysisEnabled && !isBusinessHours) {
          console.log(`[Gmail Sync] User ${connection.userId}: Skipping AI analysis outside business hours (${currentHour}:xx)`);
        }
        
        // Sync sent mail and log as email_sent activities on customers/leads
        try {
          const sentStats = await syncUserSentMailActivities(connection.userId);
          if (sentStats.activitiesCreated > 0) {
            console.log(`[Gmail Sync] User ${connection.userId}: ${sentStats.activitiesCreated} sent-mail activities logged`);
          }
        } catch (sentErr: any) {
          console.warn(`[Gmail Sync] Sent mail activity sync failed for user ${connection.userId}:`, sentErr.message);
        }

        recordSuccess(connection.userId);
        synced++;
      } catch (error: any) {
        recordFailure(connection.userId, error.message);
        
        // Update connection status with error
        await db.update(userGmailConnections)
          .set({ 
            lastError: error.message,
            updatedAt: new Date()
          })
          .where(eq(userGmailConnections.userId, connection.userId));
        
        failed++;
      }
    }
    
    console.log(`[Gmail Sync] Complete. Synced: ${synced}, Failed: ${failed}, Skipped (backoff): ${skipped}`);
    return { synced, failed, skipped };
  } finally {
    isSyncing = false;
  }
}

// Delta sync using Gmail historyId for incremental updates
async function syncUserGmailMessagesDelta(userId: string, maxMessages: number): Promise<{ newMessages: number; syncType: 'delta' | 'full' }> {
  // Get the last historyId from sync state
  const [syncState] = await db.select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.userId, userId))
    .limit(1);
  
  const lastHistoryId = syncState?.lastHistoryId;
  const lastSyncedAt = syncState?.lastSyncedAt;
  
  // If we have a recent sync (within 2 hours) and historyId, skip full 30-day scan
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const hasRecentSync = lastSyncedAt && new Date(lastSyncedAt) > twoHoursAgo;
  
  if (lastHistoryId && hasRecentSync) {
    // Delta sync - only fetch new messages since last sync
    console.log(`[Gmail Sync] Delta sync for user ${userId} from historyId ${lastHistoryId}`);
    const result = await syncGmailMessagesWorker(userId);
    return { newMessages: result.messagesStored, syncType: 'delta' };
  }
  
  // Full sync (first time or stale sync state)
  console.log(`[Gmail Sync] Full sync for user ${userId} (no recent historyId)`);
  const result = await syncGmailMessagesWorker(userId);
  return { newMessages: result.messagesStored, syncType: 'full' };
}

// Gmail sync configuration - optimized for cost (30 minutes instead of 15)
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes (cost-optimized)
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour max backoff
const BASE_BACKOFF_MS = 60 * 1000; // 1 minute base backoff

let syncInterval: NodeJS.Timeout | null = null;
let hasGmailSyncLock = false;
let isSyncing = false;

// Track failure counts per user for exponential backoff
const userFailureCounts: Map<string, { count: number; nextRetryAt: Date }> = new Map();

function calculateBackoff(failureCount: number): number {
  // Exponential backoff: 1min, 2min, 4min, 8min, 16min, 32min, 60min max
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, failureCount), MAX_BACKOFF_MS);
}

function shouldSkipUser(userId: string): boolean {
  const failure = userFailureCounts.get(userId);
  if (!failure) return false;
  return new Date() < failure.nextRetryAt;
}

function recordFailure(userId: string, error: string) {
  const current = userFailureCounts.get(userId);
  const count = (current?.count || 0) + 1;
  const backoffMs = calculateBackoff(count);
  userFailureCounts.set(userId, {
    count,
    nextRetryAt: new Date(Date.now() + backoffMs)
  });
  console.log(`[Gmail Sync] User ${userId} failure #${count}, backoff ${Math.round(backoffMs / 1000)}s - ${error}`);
}

function recordSuccess(userId: string) {
  userFailureCounts.delete(userId);
}

export async function startDailyEmailSync() {
  if (syncInterval) {
    console.log('[Gmail Sync] Already running');
    return;
  }
  
  hasGmailSyncLock = await tryAcquireAdvisoryLock('GMAIL_SYNC_WORKER');
  if (!hasGmailSyncLock) {
    console.log('[Gmail Sync] Another instance holds the lock, skipping start');
    return;
  }
  
  console.log(`[Gmail Sync] Starting with ${SYNC_INTERVAL_MS / 1000 / 60}min interval`);
  
  // Run first sync after 1 minute delay to let server stabilize
  setTimeout(() => {
    syncAllConnectedUsers();
  }, 60 * 1000);
  
  // Then run at regular intervals
  syncInterval = setInterval(() => {
    syncAllConnectedUsers();
  }, SYNC_INTERVAL_MS);
  
  console.log('[Gmail Sync] Periodic sync scheduler started');
}

export async function stopDailyEmailSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (hasGmailSyncLock) {
    await releaseAdvisoryLock('GMAIL_SYNC_WORKER');
    hasGmailSyncLock = false;
  }
  console.log('[Gmail Sync] Periodic sync stopped');
}
