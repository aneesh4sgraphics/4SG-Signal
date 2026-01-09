import { db } from "./db";
import { gmailSyncState, gmailMessages, gmailInsights, customers, shipmentFollowUpTasks } from "@shared/schema";
import { eq, and, desc, sql, inArray, lt, isNull, or } from "drizzle-orm";
import { getMessages, getMessage } from "./gmail-client";
import { getImapMessages, getImapMessage, hasImapCredentials } from "./imap-client";
import OpenAI from "openai";

const USE_IMAP = hasImapCredentials();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export async function syncGmailMessages(userId: string, userEmail: string, maxMessages: number = 50) {
  console.log(`[Gmail Intelligence] Starting sync for user ${userId}, using IMAP: ${USE_IMAP}`);
  
  await createOrUpdateSyncState(userId, { syncStatus: 'syncing' });

  try {
    let inboxMessages: any[];
    let sentMessages: any[];
    
    if (USE_IMAP) {
      console.log('[Gmail Intelligence] Using IMAP client for email sync');
      inboxMessages = await getImapMessages('INBOX', maxMessages);
      sentMessages = await getImapMessages('SENT', maxMessages);
    } else {
      console.log('[Gmail Intelligence] Using Gmail API client for email sync');
      inboxMessages = await getMessages('INBOX', maxMessages);
      sentMessages = await getMessages('SENT', maxMessages);
    }
    
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

    const customerEmails = await db.select({ id: customers.id, email: customers.email })
      .from(customers);
    const emailToCustomer: Record<string, string> = {};
    customerEmails.forEach(c => {
      if (c.email) emailToCustomer[c.email.toLowerCase()] = c.id;
    });

    let processed = 0;
    for (const msg of newMessages) {
      if (!msg.id) continue;
      
      const fullMessage = USE_IMAP 
        ? await getImapMessage(msg.id) 
        : await getMessage(msg.id);
      const fromParsed = parseEmailAddress(fullMessage.from);
      const toParsed = parseEmailAddress(fullMessage.to);
      
      const contactEmail = msg.direction === 'inbound' ? fromParsed.email : toParsed.email;
      const customerId = emailToCustomer[contactEmail.toLowerCase()] || null;
      
      const bodyText = stripHtml(fullMessage.body);

      const [insertedMessage] = await db.insert(gmailMessages).values({
        userId,
        gmailMessageId: msg.id,
        threadId: msg.threadId || null,
        direction: msg.direction,
        fromEmail: fromParsed.email,
        fromName: fromParsed.name,
        toEmail: toParsed.email,
        toName: toParsed.name,
        subject: fullMessage.subject,
        snippet: fullMessage.snippet || null,
        bodyText: bodyText.substring(0, 10000),
        sentAt: msg.date ? new Date(msg.date) : null,
        customerId,
        analysisStatus: 'pending',
      }).returning();
      
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

    console.log(`[Gmail Intelligence] Sync complete. Processed ${processed} new messages`);
    return { success: true, processedCount: processed };
  } catch (error: any) {
    console.error('[Gmail Intelligence] Sync error:', error);
    await createOrUpdateSyncState(userId, { 
      syncStatus: 'error',
      lastError: error.message 
    });
    throw error;
  }
}

export async function analyzeMessagesForInsights(userId: string, limit: number = 20) {
  console.log(`[Gmail Intelligence] Analyzing messages for user ${userId}`);
  
  const pendingMessages = await db.select()
    .from(gmailMessages)
    .where(and(
      eq(gmailMessages.userId, userId),
      eq(gmailMessages.analysisStatus, 'pending')
    ))
    .limit(limit);

  if (pendingMessages.length === 0) {
    console.log('[Gmail Intelligence] No pending messages to analyze');
    return { analyzed: 0, insights: 0 };
  }

  let totalInsights = 0;

  for (const message of pendingMessages) {
    try {
      await db.update(gmailMessages)
        .set({ analysisStatus: 'processing' })
        .where(eq(gmailMessages.id, message.id));

      const insights = await extractInsightsFromEmail(message);
      
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
      }

      await db.update(gmailMessages)
        .set({ analysisStatus: 'completed', analyzedAt: new Date() })
        .where(eq(gmailMessages.id, message.id));

    } catch (error: any) {
      console.error(`[Gmail Intelligence] Error analyzing message ${message.id}:`, error);
      await db.update(gmailMessages)
        .set({ analysisStatus: 'failed' })
        .where(eq(gmailMessages.id, message.id));
    }
  }

  const finalState = await getSyncState(userId);
  await createOrUpdateSyncState(userId, {
    insightsExtracted: (finalState?.insightsExtracted || 0) + totalInsights,
  });

  console.log(`[Gmail Intelligence] Analysis complete. Extracted ${totalInsights} insights`);
  return { analyzed: pendingMessages.length, insights: totalInsights };
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: emailContent }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const insights: ExtractedInsight[] = (parsed.insights || parsed || [])
      .filter((i: any) => i.confidence >= 0.6)
      .map((i: any) => ({
        type: i.type,
        summary: i.summary?.substring(0, 200) || '',
        details: i.details?.substring(0, 1000) || '',
        confidence: parseFloat(i.confidence) || 0.7,
        dueDate: i.dueDate ? new Date(i.dueDate) : null,
        priority: i.priority || 'medium',
      }));

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
}) {
  let query = db.select({
    insight: gmailInsights,
    message: gmailMessages,
    customer: customers,
  })
    .from(gmailInsights)
    .leftJoin(gmailMessages, eq(gmailInsights.messageId, gmailMessages.id))
    .leftJoin(customers, eq(gmailInsights.customerId, customers.id))
    .where(eq(gmailInsights.userId, userId))
    .orderBy(desc(gmailInsights.createdAt))
    .limit(filters?.limit || 50);

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

export async function getInsightsSummary(userId: string) {
  const stats = await db.select({
    status: gmailInsights.status,
    type: gmailInsights.insightType,
    count: sql<number>`count(*)::int`,
  })
    .from(gmailInsights)
    .where(eq(gmailInsights.userId, userId))
    .groupBy(gmailInsights.status, gmailInsights.insightType);

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
