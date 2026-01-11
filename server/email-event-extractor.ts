import { db } from './db';
import { eq, and, isNull, sql, desc } from 'drizzle-orm';
import { 
  gmailMessages, 
  emailSalesEvents,
  followUpTasks,
  customers,
  InsertEmailSalesEvent,
  InsertFollowUpTask,
  EMAIL_SALES_EVENT_TYPES,
} from '@shared/schema';

const EVENT_TO_TASK_CONFIG: Record<string, {
  taskType: string;
  titleTemplate: string;
  descriptionTemplate: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDaysFromNow: number;
  minConfidence: number;
}> = {
  quote_requested: {
    taskType: 'quote_follow_up',
    titleTemplate: 'Quote requested from {customer}',
    descriptionTemplate: 'Customer requested a quote. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 1,
    minConfidence: 0.75,
  },
  ready_to_buy: {
    taskType: 'close_sale',
    titleTemplate: 'Ready to buy: {customer}',
    descriptionTemplate: 'Customer appears ready to purchase. Trigger: {trigger}',
    priority: 'urgent',
    dueDaysFromNow: 0,
    minConfidence: 0.85,
  },
  sample_requested: {
    taskType: 'sample_follow_up',
    titleTemplate: 'Sample request from {customer}',
    descriptionTemplate: 'Customer requested samples. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 1,
    minConfidence: 0.75,
  },
  objection_price: {
    taskType: 'handle_objection',
    titleTemplate: 'Price objection: {customer}',
    descriptionTemplate: 'Customer raised a price concern. Consider discount or value pitch. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 1,
    minConfidence: 0.80,
  },
  objection_compatibility: {
    taskType: 'handle_objection',
    titleTemplate: 'Compatibility question: {customer}',
    descriptionTemplate: 'Customer has compatibility concerns. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 2,
    minConfidence: 0.70,
  },
  stale_thread: {
    taskType: 'reengagement',
    titleTemplate: 'Follow up: No response from {customer}',
    descriptionTemplate: 'Thread has gone stale. Re-engage customer. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 1,
    minConfidence: 0.55,
  },
};

interface EventRule {
  eventType: typeof EMAIL_SALES_EVENT_TYPES[number];
  keywords: string[];
  regexPatterns: RegExp[];
  baseConfidence: number;
  direction?: 'inbound' | 'outbound' | 'both';
}

const EVENT_RULES: EventRule[] = [
  {
    eventType: 'quote_requested',
    keywords: [
      'quote', 'pricing', 'price list', 'cost', 'how much', 
      'estimate', 'quotation', 'pricing info', 'rates',
      'can you send me pricing', 'need a quote', 'requesting quote'
    ],
    regexPatterns: [
      /can you (send|provide|give).*(quote|pricing|estimate)/i,
      /need.*(quote|pricing|estimate)/i,
      /what.*(price|cost)/i,
      /interested in.*(pricing|quote)/i,
      /please (send|provide).*(quote|pricing)/i,
    ],
    baseConfidence: 0.75,
    direction: 'inbound',
  },
  {
    eventType: 'quote_sent',
    keywords: [
      'attached quote', 'here is your quote', 'quote attached',
      'pricing attached', 'please find attached', 'quotation',
      'as quoted', 'per your request', 'proposal attached'
    ],
    regexPatterns: [
      /attached.*(quote|pricing|proposal)/i,
      /here is.*(quote|pricing|estimate)/i,
      /please (find|see) attached/i,
      /sending.*(quote|pricing)/i,
    ],
    baseConfidence: 0.80,
    direction: 'outbound',
  },
  {
    eventType: 'sample_requested',
    keywords: [
      'sample', 'samples', 'swatch', 'swatchbook', 'press test',
      'test material', 'sample order', 'send samples', 'sample kit',
      'need samples', 'request samples'
    ],
    regexPatterns: [
      /send.*(sample|swatch)/i,
      /need.*(sample|swatch|test)/i,
      /can (you|we) (get|have|order).*(sample|swatch)/i,
      /request.*(sample|swatch)/i,
      /interested in.*(sample|testing)/i,
    ],
    baseConfidence: 0.80,
    direction: 'inbound',
  },
  {
    eventType: 'objection_price',
    keywords: [
      'too expensive', 'too high', 'budget', 'cheaper', 'lower price',
      'price too', 'cost prohibitive', 'out of budget', 'discount',
      'competitive pricing', 'better price', 'price match'
    ],
    regexPatterns: [
      /too (expensive|high|much)/i,
      /out of.*(budget|range)/i,
      /(need|want).*(discount|lower|cheaper)/i,
      /price.*(too|is) (high|expensive)/i,
      /can.*(reduce|lower|discount)/i,
      /competitor.*(cheaper|better price)/i,
    ],
    baseConfidence: 0.85,
    direction: 'inbound',
  },
  {
    eventType: 'objection_compatibility',
    keywords: [
      'compatible', 'compatibility', 'work with', 'printer',
      'won\'t work', 'doesn\'t work', 'not compatible', 'machine',
      'press', 'ink', 'adhesion', 'lamination'
    ],
    regexPatterns: [
      /will.*(work|compatible).*(printer|press|machine)/i,
      /(not|doesn't|won't) (work|compatible)/i,
      /compatibility.*(issue|concern|question)/i,
      /tested.*(printer|press|machine)/i,
      /(adhesion|lamination|ink).*(issue|problem)/i,
    ],
    baseConfidence: 0.75,
    direction: 'inbound',
  },
  {
    eventType: 'ready_to_buy',
    keywords: [
      'purchase order', 'PO', 'order', 'ready to order', 'proceed',
      'go ahead', 'place order', 'confirm order', 'buy', 'purchasing',
      'ready to purchase', 'finalize order', 'submit order'
    ],
    regexPatterns: [
      /ready to (order|buy|purchase|proceed)/i,
      /go ahead.*(order|purchase)/i,
      /place.*(order|PO)/i,
      /purchase order.*#?\d+/i,
      /confirm.*(order|purchase)/i,
      /want to (order|buy|purchase)/i,
      /send.*(PO|purchase order)/i,
    ],
    baseConfidence: 0.90,
    direction: 'inbound',
  },
  {
    eventType: 'timing_delay',
    keywords: [
      'next month', 'next quarter', 'later', 'not now', 'hold off',
      'delay', 'postpone', 'wait', 'busy', 'not ready', 'circle back',
      'touch base later', 'reach out later', 'on hold'
    ],
    regexPatterns: [
      /not (ready|now|yet)/i,
      /next (month|quarter|year|week)/i,
      /(hold|put).*(off|on hold)/i,
      /circle back.*(later|next)/i,
      /reach out.*(later|next|when)/i,
      /(busy|swamped).*(right now|currently)/i,
      /revisit.*(later|next)/i,
    ],
    baseConfidence: 0.70,
    direction: 'inbound',
  },
  {
    eventType: 'stale_thread',
    keywords: [],
    regexPatterns: [],
    baseConfidence: 0.60,
    direction: 'both',
  },
];

function countKeywordMatches(text: string, keywords: string[]): { count: number; matched: string[] } {
  const lowerText = text.toLowerCase();
  const matched: string[] = [];
  
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }
  
  return { count: matched.length, matched };
}

function countRegexMatches(text: string, patterns: RegExp[]): { count: number; matchedText: string[] } {
  const matchedText: string[] = [];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      matchedText.push(match[0]);
    }
  }
  
  return { count: matchedText.length, matchedText };
}

interface ExtractedEvent {
  eventType: typeof EMAIL_SALES_EVENT_TYPES[number];
  confidence: number;
  triggerText: string;
  triggerKeywords: string;
}

export function extractEventsFromEmail(
  subject: string, 
  bodyText: string, 
  direction: 'inbound' | 'outbound'
): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const fullText = `${subject}\n${bodyText}`;
  
  for (const rule of EVENT_RULES) {
    if (rule.eventType === 'stale_thread') continue;
    
    if (rule.direction && rule.direction !== 'both' && rule.direction !== direction) {
      continue;
    }
    
    const keywordResult = countKeywordMatches(fullText, rule.keywords);
    const regexResult = countRegexMatches(fullText, rule.regexPatterns);
    
    if (keywordResult.count === 0 && regexResult.count === 0) {
      continue;
    }
    
    let confidence = rule.baseConfidence;
    confidence += Math.min(keywordResult.count * 0.05, 0.15);
    confidence += Math.min(regexResult.count * 0.05, 0.10);
    confidence = Math.min(confidence, 1.00);
    
    const allMatches = [...keywordResult.matched, ...regexResult.matchedText];
    const triggerText = regexResult.matchedText[0] || keywordResult.matched[0] || '';
    
    events.push({
      eventType: rule.eventType,
      confidence: parseFloat(confidence.toFixed(2)),
      triggerText: triggerText.substring(0, 500),
      triggerKeywords: allMatches.join(', ').substring(0, 500),
    });
  }
  
  return events;
}

export async function processUnanalyzedMessages(userId: string, limit: number = 100): Promise<number> {
  const pendingMessages = await db.select()
    .from(gmailMessages)
    .where(and(
      eq(gmailMessages.userId, userId),
      eq(gmailMessages.analysisStatus, 'pending')
    ))
    .orderBy(desc(gmailMessages.sentAt))
    .limit(limit);
  
  let eventsCreated = 0;
  
  for (const message of pendingMessages) {
    const direction = message.direction as 'inbound' | 'outbound';
    const events = extractEventsFromEmail(
      message.subject || '',
      message.bodyText || '',
      direction
    );
    
    for (const event of events) {
      const eventData: InsertEmailSalesEvent = {
        gmailMessageId: message.id,
        userId: message.userId,
        customerId: message.customerId,
        eventType: event.eventType,
        confidence: event.confidence.toFixed(2),
        triggerText: event.triggerText,
        triggerKeywords: event.triggerKeywords,
        occurredAt: message.sentAt || new Date(),
        isProcessed: false,
      };
      
      await db.insert(emailSalesEvents).values(eventData);
      eventsCreated++;
    }
    
    await db.update(gmailMessages)
      .set({ 
        analysisStatus: 'completed',
        analyzedAt: new Date(),
      })
      .where(eq(gmailMessages.id, message.id));
  }
  
  console.log(`[Email Events] Extracted ${eventsCreated} events from ${pendingMessages.length} messages`);
  return eventsCreated;
}

export async function detectStaleThreads(userId: string, staleDays: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - staleDays);
  
  const staleThreads = await db.execute(sql`
    WITH thread_activity AS (
      SELECT 
        thread_id,
        customer_id,
        MAX(sent_at) as last_activity,
        MAX(CASE WHEN direction = 'inbound' THEN sent_at END) as last_inbound,
        MAX(CASE WHEN direction = 'outbound' THEN sent_at END) as last_outbound
      FROM gmail_messages
      WHERE user_id = ${userId}
        AND thread_id IS NOT NULL
        AND customer_id IS NOT NULL
      GROUP BY thread_id, customer_id
      HAVING MAX(CASE WHEN direction = 'outbound' THEN sent_at END) > 
             COALESCE(MAX(CASE WHEN direction = 'inbound' THEN sent_at END), '1970-01-01')
    )
    SELECT * FROM thread_activity
    WHERE last_activity < ${cutoffDate}
      AND NOT EXISTS (
        SELECT 1 FROM email_sales_events e
        JOIN gmail_messages m ON e.gmail_message_id = m.id
        WHERE m.thread_id = thread_activity.thread_id
          AND e.event_type = 'stale_thread'
          AND e.created_at > ${cutoffDate}
      )
  `);
  
  let staleCount = 0;
  for (const thread of (staleThreads as any).rows || []) {
    const [latestMessage] = await db.select()
      .from(gmailMessages)
      .where(and(
        eq(gmailMessages.threadId, thread.thread_id),
        eq(gmailMessages.userId, userId)
      ))
      .orderBy(desc(gmailMessages.sentAt))
      .limit(1);
    
    if (latestMessage) {
      await db.insert(emailSalesEvents).values({
        gmailMessageId: latestMessage.id,
        userId,
        customerId: thread.customer_id,
        eventType: 'stale_thread',
        confidence: '0.60',
        triggerText: `No response for ${staleDays}+ days`,
        occurredAt: new Date(),
        isProcessed: false,
      });
      staleCount++;
    }
  }
  
  console.log(`[Email Events] Detected ${staleCount} stale threads`);
  return staleCount;
}

export async function createFollowUpTasksFromEvents(userId: string, limit: number = 50): Promise<number> {
  const unprocessedEvents = await db.select({
    event: emailSalesEvents,
    customer: customers,
  })
    .from(emailSalesEvents)
    .leftJoin(customers, eq(emailSalesEvents.customerId, customers.id))
    .where(and(
      eq(emailSalesEvents.userId, userId),
      eq(emailSalesEvents.isProcessed, false),
    ))
    .orderBy(desc(emailSalesEvents.occurredAt))
    .limit(limit);
  
  let tasksCreated = 0;
  
  for (const { event, customer } of unprocessedEvents) {
    const config = EVENT_TO_TASK_CONFIG[event.eventType];
    
    if (!config) {
      await db.update(emailSalesEvents)
        .set({ isProcessed: true })
        .where(eq(emailSalesEvents.id, event.id));
      continue;
    }
    
    const confidence = parseFloat(event.confidence || '0');
    if (confidence < config.minConfidence) {
      await db.update(emailSalesEvents)
        .set({ isProcessed: true })
        .where(eq(emailSalesEvents.id, event.id));
      continue;
    }
    
    if (!event.customerId) {
      await db.update(emailSalesEvents)
        .set({ isProcessed: true })
        .where(eq(emailSalesEvents.id, event.id));
      continue;
    }
    
    const customerName = customer?.company || customer?.email || 'Unknown Customer';
    const title = config.titleTemplate.replace('{customer}', customerName);
    const description = config.descriptionTemplate.replace('{trigger}', event.triggerText || '').replace('{customer}', customerName);
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + config.dueDaysFromNow);
    dueDate.setHours(9, 0, 0, 0);
    
    const existingTask = await db.select()
      .from(followUpTasks)
      .where(and(
        eq(followUpTasks.customerId, event.customerId),
        eq(followUpTasks.taskType, config.taskType),
        eq(followUpTasks.status, 'pending'),
      ))
      .limit(1);
    
    if (existingTask.length > 0) {
      await db.update(emailSalesEvents)
        .set({ isProcessed: true })
        .where(eq(emailSalesEvents.id, event.id));
      continue;
    }
    
    const taskData: InsertFollowUpTask = {
      customerId: event.customerId,
      title,
      description,
      taskType: config.taskType,
      priority: config.priority,
      status: 'pending',
      dueDate,
      sourceType: 'email_event',
      sourceId: event.id.toString(),
      isAutoGenerated: true,
    };
    
    await db.insert(followUpTasks).values(taskData);
    tasksCreated++;
    
    await db.update(emailSalesEvents)
      .set({ 
        isProcessed: true,
        coachingTip: `Auto-created task: ${title}`,
      })
      .where(eq(emailSalesEvents.id, event.id));
  }
  
  console.log(`[Email Events] Created ${tasksCreated} follow-up tasks from ${unprocessedEvents.length} events`);
  return tasksCreated;
}

const AI_COACHING_TEMPLATES: Record<string, string> = {
  quote_requested: "Customer is actively seeking pricing. Respond within 4 hours with a tailored quote. Ask qualifying questions about volume, timeline, and specific needs to customize your offering.",
  quote_sent: "Quote delivered. Schedule a follow-up call in 2-3 days to address questions and move toward close. Prepare answers for common objections.",
  sample_requested: "Sample interest shows purchase intent. Fast sample delivery builds trust. Follow up within a week to gather feedback and convert to order.",
  objection_price: "Price resistance detected. Focus on value, ROI, and total cost of ownership. Consider offering volume discounts, payment terms, or showcasing quality differences.",
  objection_compatibility: "Technical concerns need addressing. Offer free testing, provide spec sheets, or arrange a technical call. Demonstrating compatibility removes a major purchase barrier.",
  ready_to_buy: "Hot lead! Prioritize this customer immediately. Remove any friction from the purchase process. Confirm delivery timeline and payment options.",
  timing_delay: "Customer not ready now. Set a calendar reminder for their stated timeframe. Keep them warm with occasional value-add content without being pushy.",
  stale_thread: "Conversation has stalled. Re-engage with a value-add: new product info, industry news, or a simple check-in. Ask an open-ended question to restart dialogue.",
};

export async function generateAICoachingSummary(eventId: number): Promise<string | null> {
  try {
    const [event] = await db.select({
      event: emailSalesEvents,
      customer: customers,
    })
      .from(emailSalesEvents)
      .leftJoin(customers, eq(emailSalesEvents.customerId, customers.id))
      .where(eq(emailSalesEvents.id, eventId));
    
    if (!event) return null;
    
    const template = AI_COACHING_TEMPLATES[event.event.eventType];
    if (!template) return null;
    
    const customerName = event.customer?.company || 'the customer';
    const triggerText = event.event.triggerText || '';
    
    let coachingTip = template;
    
    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const prompt = `You are a sales coach for a specialty printing and graphics company. Based on this detected sales event, provide a brief, actionable coaching tip (2-3 sentences max).

Event Type: ${event.event.eventType}
Customer: ${customerName}
Trigger Text: "${triggerText}"

Base guidance: ${template}

Personalize this coaching tip for this specific situation. Be concise and action-oriented.`;
        
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.7,
        });
        
        coachingTip = response.choices[0]?.message?.content?.trim() || template;
      } catch (aiError) {
        console.error('[AI Coach] OpenAI error, using template:', aiError);
      }
    }
    
    await db.update(emailSalesEvents)
      .set({ coachingTip })
      .where(eq(emailSalesEvents.id, eventId));
    
    return coachingTip;
  } catch (error) {
    console.error('[AI Coach] Error generating coaching summary:', error);
    return null;
  }
}

export async function enrichEventsWithCoaching(userId: string, limit: number = 20): Promise<number> {
  const eventsNeedingCoaching = await db.select()
    .from(emailSalesEvents)
    .where(and(
      eq(emailSalesEvents.userId, userId),
      isNull(emailSalesEvents.coachingTip),
    ))
    .orderBy(desc(emailSalesEvents.occurredAt))
    .limit(limit);
  
  let enriched = 0;
  for (const event of eventsNeedingCoaching) {
    const tip = await generateAICoachingSummary(event.id);
    if (tip) enriched++;
  }
  
  console.log(`[AI Coach] Enriched ${enriched}/${eventsNeedingCoaching.length} events with coaching tips`);
  return enriched;
}
