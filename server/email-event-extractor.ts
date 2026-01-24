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

// Coaching cache with 5-day TTL
// Key format: eventType:customerStage:objectionType (if applicable)
const COACHING_CACHE_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const coachingCache: Map<string, { tip: string; expiresAt: Date }> = new Map();

// Confidence threshold - below this, use templates instead of OpenAI
const COACHING_CONFIDENCE_THRESHOLD = 0.75;

function getCacheKey(eventType: string, customerStage?: string, objectionType?: string): string {
  return `${eventType}:${customerStage || 'unknown'}:${objectionType || 'none'}`;
}

function getCachedCoaching(key: string): string | null {
  const cached = coachingCache.get(key);
  if (!cached) return null;
  if (new Date() > cached.expiresAt) {
    coachingCache.delete(key);
    return null;
  }
  return cached.tip;
}

function setCachedCoaching(key: string, tip: string): void {
  coachingCache.set(key, {
    tip,
    expiresAt: new Date(Date.now() + COACHING_CACHE_TTL_MS),
  });
}

// Clean up expired cache entries periodically
setInterval(() => {
  const now = new Date();
  for (const [key, value] of coachingCache.entries()) {
    if (now > value.expiresAt) {
      coachingCache.delete(key);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

const EVENT_TO_TASK_CONFIG: Record<string, {
  taskType: string;
  titleTemplate: string;
  descriptionTemplate: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDaysFromNow: number;
  minConfidence: number;
}> = {
  po: {
    taskType: 'process_order',
    titleTemplate: 'PO received from {customer}',
    descriptionTemplate: 'Customer has sent a purchase order. Process immediately. Trigger: {trigger}',
    priority: 'urgent',
    dueDaysFromNow: 0,
    minConfidence: 0.80,
  },
  approval: {
    taskType: 'finalize_order',
    titleTemplate: 'Approval received: {customer}',
    descriptionTemplate: 'Customer has approved pricing/quote. Follow up to finalize. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 0,
    minConfidence: 0.80,
  },
  samples: {
    taskType: 'sample_follow_up',
    titleTemplate: 'Sample request from {customer}',
    descriptionTemplate: 'Customer requested samples. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 1,
    minConfidence: 0.75,
  },
  urgent: {
    taskType: 'urgent_response',
    titleTemplate: 'URGENT: {customer} needs immediate attention',
    descriptionTemplate: 'Time-sensitive request from customer. Trigger: {trigger}',
    priority: 'urgent',
    dueDaysFromNow: 0,
    minConfidence: 0.80,
  },
  opportunity: {
    taskType: 'nurture_lead',
    titleTemplate: 'New opportunity: {customer}',
    descriptionTemplate: 'Customer showing interest in products/services. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 1,
    minConfidence: 0.70,
  },
  commitment: {
    taskType: 'track_commitment',
    titleTemplate: 'Commitment from {customer}',
    descriptionTemplate: 'Customer has made a commitment or scheduled something. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 1,
    minConfidence: 0.75,
  },
  action: {
    taskType: 'follow_up_action',
    titleTemplate: 'Action needed for {customer}',
    descriptionTemplate: 'Customer is requesting a specific action. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 1,
    minConfidence: 0.55,
  },
  feedback: {
    taskType: 'review_feedback',
    titleTemplate: 'Feedback from {customer}',
    descriptionTemplate: 'Customer has provided feedback. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 2,
    minConfidence: 0.70,
  },
  sales_win: {
    taskType: 'celebrate_win',
    titleTemplate: 'SALES WIN: {customer}',
    descriptionTemplate: 'Customer confirmed the order! Celebrate this win and ensure smooth fulfillment. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 0,
    minConfidence: 0.80,
  },
  press_test_success: {
    taskType: 'press_test_follow_up',
    titleTemplate: 'Press Test Success: {customer}',
    descriptionTemplate: 'Customer reported positive press test results! Follow up to move toward production order. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 1,
    minConfidence: 0.75,
  },
  swatch_received: {
    taskType: 'swatch_follow_up',
    titleTemplate: 'Swatch Received by {customer}',
    descriptionTemplate: 'Customer confirmed they received the swatch book. Follow up on their interest. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 2,
    minConfidence: 0.80,
  },
  lead: {
    taskType: 'qualify_lead',
    titleTemplate: 'New Lead: {customer}',
    descriptionTemplate: 'New potential customer inquiry. Qualify and nurture. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 0,
    minConfidence: 0.70,
  },
  price_sent: {
    taskType: 'pricing_follow_up',
    titleTemplate: 'Follow up on pricing sent to {customer}',
    descriptionTemplate: 'You sent pricing information to this customer. Follow up to answer questions and close the sale. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 3,
    minConfidence: 0.75,
  },
  pricelist_sent: {
    taskType: 'pricelist_follow_up',
    titleTemplate: 'Follow up on price list sent to {customer}',
    descriptionTemplate: 'You sent a price list PDF to this customer. Check if they found what they need and offer to provide a custom quote. Trigger: {trigger}',
    priority: 'normal',
    dueDaysFromNow: 5,
    minConfidence: 0.80,
  },
  quote_sent: {
    taskType: 'quote_follow_up',
    titleTemplate: 'Follow up on quote sent to {customer}',
    descriptionTemplate: 'A formal quote was sent from Odoo. Follow up to address questions and move toward closing. Trigger: {trigger}',
    priority: 'high',
    dueDaysFromNow: 2,
    minConfidence: 0.85,
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
    eventType: 'po',
    keywords: [
      'purchase order', 'PO', 'po#', 'order number', 'place order',
      'ready to order', 'proceed with order', 'confirm order', 'order confirmed',
      'submit order', 'placing an order', 'order placed', 'invoice',
      'billing', 'payment', 'ready to purchase', 'finalize order'
    ],
    regexPatterns: [
      /PO\s?#?\s?\d+/i,
      /purchase order\s?#?\s?\d*/i,
      /ready to (order|buy|purchase|proceed)/i,
      /go ahead.*(order|purchase)/i,
      /place.*(order|PO)/i,
      /confirm.*(order|purchase)/i,
      /want to (order|buy|purchase)/i,
      /send.*(PO|purchase order)/i,
      /order\s?#\s?\d+/i,
    ],
    baseConfidence: 0.85,
    direction: 'inbound',
  },
  {
    eventType: 'approval',
    keywords: [
      'approved', 'approve', 'approval', 'sign off', 'signed off',
      'green light', 'go ahead', 'confirmed', 'authorization',
      'authorize', 'accepted', 'accept', 'looks good', 'agreed',
      'proceed', 'confirmation', 'authorized'
    ],
    regexPatterns: [
      /(have|got|received).*(approval|authorization)/i,
      /approved.*(pricing|quote|order)/i,
      /(sign|signed)\s*(off|on)/i,
      /give.*(green light|go ahead)/i,
      /(we|I) (approve|accept|confirm)/i,
      /looks good.*(proceed|order)/i,
    ],
    baseConfidence: 0.80,
    direction: 'inbound',
  },
  {
    eventType: 'samples',
    keywords: [
      'sample', 'samples', 'swatch', 'swatchbook', 'press test',
      'test material', 'sample order', 'send samples', 'sample kit',
      'need samples', 'request samples', 'testing', 'trial',
      'test print', 'color sample', 'product sample'
    ],
    regexPatterns: [
      /send.*(sample|swatch)/i,
      /need.*(sample|swatch|test)/i,
      /can (you|we) (get|have|order|send).*(sample|swatch)/i,
      /request.*(sample|swatch)/i,
      /interested in.*(sample|testing)/i,
      /(sample|swatch).*(request|order)/i,
    ],
    baseConfidence: 0.80,
    direction: 'inbound',
  },
  {
    eventType: 'urgent',
    keywords: [
      'urgent', 'asap', 'rush', 'immediately', 'critical', 'emergency',
      'time sensitive', 'deadline', 'eod', 'end of day', 'today',
      'right away', 'priority', 'expedite', 'fast', 'quickly',
      'as soon as possible', 'immediate attention', 'pressing'
    ],
    regexPatterns: [
      /\burgent\b/i,
      /\basap\b/i,
      /need.*(immediately|today|now|asap)/i,
      /deadline.*(today|tomorrow|eod)/i,
      /(rush|expedite).*(order|delivery)/i,
      /critical.*(need|request|issue)/i,
      /time.?sensitive/i,
    ],
    baseConfidence: 0.85,
    direction: 'inbound',
  },
  {
    eventType: 'opportunity',
    keywords: [
      'interested', 'looking for', 'new project', 'expanding',
      'quote', 'pricing', 'price list', 'inquiry', 'considering',
      'evaluate', 'option', 'partnership', 'potential', 'exploring',
      'information about', 'tell me about', 'learn more'
    ],
    regexPatterns: [
      /interested in.*(product|service|pricing|quote)/i,
      /looking for.*(supplier|vendor|partner|product)/i,
      /new.*(project|opportunity|business)/i,
      /can you (send|provide).*(info|pricing|quote)/i,
      /want to (learn|know) more/i,
      /exploring.*(option|solution)/i,
      /considering.*(purchase|order|partnership)/i,
    ],
    baseConfidence: 0.70,
    direction: 'inbound',
  },
  {
    eventType: 'commitment',
    keywords: [
      'scheduled', 'confirmed', 'meeting', 'call', 'appointment',
      'we will', 'timeline', 'delivery date', 'agreed', 'promise',
      'committed', 'follow up', 'next steps', 'plan to', 'intend to',
      'definitely', 'certainly', 'expect to', 'looking forward'
    ],
    regexPatterns: [
      /(scheduled|confirmed).*(meeting|call|delivery)/i,
      /we (will|shall).*(send|follow|deliver|complete)/i,
      /(delivery|timeline).*(confirmed|agreed)/i,
      /plan to.*(order|purchase|proceed)/i,
      /looking forward to.*(working|order)/i,
      /expect.*(delivery|arrival|shipment)/i,
    ],
    baseConfidence: 0.75,
    direction: 'inbound',
  },
  {
    eventType: 'action',
    keywords: [
      'please', 'can you', 'need you to', 'send me', 'follow up',
      'next steps', 'action required', 'to do', 'task', 'request',
      'could you', 'would you', 'update on', 'status of', 'waiting for',
      'reminder', 'don\'t forget', 'make sure'
    ],
    regexPatterns: [
      /please (send|provide|confirm|update|follow)/i,
      /can you (send|check|update|confirm|follow)/i,
      /need you to.*(send|check|update|confirm)/i,
      /waiting for.*(response|update|confirmation)/i,
      /follow up on/i,
      /action (required|needed)/i,
      /update.*(on|regarding|about)/i,
    ],
    baseConfidence: 0.70,
    direction: 'inbound',
  },
  {
    eventType: 'feedback',
    keywords: [
      'feedback', 'review', 'concern', 'issue', 'problem', 'complaint',
      'suggestion', 'love', 'great', 'excellent', 'terrible', 'poor',
      'happy', 'unhappy', 'satisfied', 'dissatisfied', 'impressed',
      'disappointed', 'thank you', 'thanks', 'appreciate'
    ],
    regexPatterns: [
      /(positive|negative|constructive).?feedback/i,
      /(love|like|enjoy).*(product|service|work)/i,
      /(issue|problem|concern).*(with|about|regarding)/i,
      /thank (you|s) for/i,
      /(great|excellent|amazing) (job|work|service)/i,
      /(disappointed|unhappy|frustrated) (with|about)/i,
      /appreciate.*(help|support|service)/i,
    ],
    baseConfidence: 0.70,
    direction: 'inbound',
  },
  {
    eventType: 'sales_win',
    keywords: [
      'order confirmed', 'deal closed', 'won the business', 'contract signed',
      'thank you for the order', 'thanks for your order', 'order has been placed',
      'we have decided to go with', 'selected you', 'chose your company',
      'finalized the order', 'closed the deal', 'awarded', 'won the bid',
      'congratulations on winning', 'accepted your proposal', 'signed the agreement',
      'placed the order', 'confirmed our order', 'moving forward with you'
    ],
    regexPatterns: [
      /thank.*(you|s).*(for|placing).*(order|business)/i,
      /order.*(confirmed|placed|finalized)/i,
      /deal.*(closed|done|finalized)/i,
      /(selected|chose|awarded|going with).*(you|your|4s)/i,
      /contract.*(signed|executed|finalized)/i,
      /won.*(bid|business|contract)/i,
      /moving forward with.*(you|your|order)/i,
      /decided to.*(go with|use|work with|order from)/i,
    ],
    baseConfidence: 0.85,
    direction: 'inbound',
  },
  {
    eventType: 'press_test_success',
    keywords: [
      'press test worked', 'test print looks great', 'print test successful',
      'ran on press', 'ran perfectly', 'printed beautifully', 'looks perfect',
      'test was successful', 'press test results', 'print test results',
      'colors matched', 'color match', 'registration is good', 'ran smoothly',
      'no issues on press', 'great results', 'excellent print quality',
      'press approved', 'ready for production', 'approval to proceed'
    ],
    regexPatterns: [
      /press.?test.*(success|worked|perfect|great|excellent)/i,
      /test.?print.*(success|worked|perfect|great|excellent)/i,
      /(ran|printed).*(perfect|beautiful|smooth|great|well)/i,
      /colors?.*(match|perfect|spot.?on|accurate)/i,
      /(print|press).*(quality|results).*(great|excellent|perfect)/i,
      /ready.*(for|to).*(production|run|proceed)/i,
      /approval.*(press|print|proceed|production)/i,
      /no.*(issues|problems).*(on|with|during).*(press|print)/i,
    ],
    baseConfidence: 0.80,
    direction: 'inbound',
  },
  {
    eventType: 'swatch_received',
    keywords: [
      'received the swatch', 'got the swatch', 'swatch book arrived',
      'swatches arrived', 'samples arrived', 'received the samples',
      'received your samples', 'got your samples', 'swatchbook received',
      'material samples received', 'substrate samples', 'received materials',
      'samples look great', 'love the samples', 'samples received'
    ],
    regexPatterns: [
      /(received|got|arrived).*(swatch|samples?|materials?)/i,
      /swatch.?book.*(received|arrived|got)/i,
      /(samples?|swatch).*(arrived|received|got|here)/i,
      /(love|like|great).*(samples?|swatch)/i,
      /thank.*(you|s).*(for|sending).*(swatch|samples?)/i,
      /(reviewing|looking at|checked).*(swatch|samples?)/i,
    ],
    baseConfidence: 0.85,
    direction: 'inbound',
  },
  {
    eventType: 'lead',
    keywords: [
      'first time', 'new customer', 'just starting', 'looking for a new vendor',
      'searching for a supplier', 'need a quote', 'requesting information',
      'inquiry', 'interested in your products', 'found you online',
      'referred by', 'recommended by', 'heard about you', 'new inquiry',
      'first order', 'potential customer', 'would like to explore',
      'initial order', 'trial order', 'test order', 'getting started'
    ],
    regexPatterns: [
      /first.?(time|order|inquiry|contact)/i,
      /(new|potential).*(customer|client|vendor|supplier)/i,
      /(looking|searching).*(for|to find).*(vendor|supplier|source)/i,
      /referred.?by|recommended.?by|heard.?about/i,
      /found.*(you|your|company).*(online|google|search)/i,
      /(interested|exploring).*(your|products|services|solutions)/i,
      /would like to.*(explore|discuss|learn|know)/i,
      /(initial|trial|test).*(order|purchase)/i,
    ],
    baseConfidence: 0.75,
    direction: 'inbound',
  },
  // OUTBOUND EVENTS - detecting when sales rep sends pricing/quotes
  {
    eventType: 'price_sent',
    keywords: [
      'attached pricing', 'pricing information', 'here is the pricing',
      'price breakdown', 'pricing details', 'pricing attached',
      'sending you pricing', 'prices as requested', 'below are the prices',
      'find the pricing', 'pricing as discussed', 'here are the prices',
      'please see pricing', 'pricing for your review', 'pricing sheet',
      'per your request pricing', 'special pricing', 'custom pricing'
    ],
    regexPatterns: [
      /attach.*(pricing|prices|quote)/i,
      /(here|sending|below).*(pricing|prices)/i,
      /pricing.*(attached|included|below|for your)/i,
      /(please|find).*(attached|see).*(pricing|quote)/i,
      /as (discussed|requested).*(pricing|prices)/i,
      /per.*(your|our).*(conversation|request|discussion).*(pricing|price)/i,
    ],
    baseConfidence: 0.80,
    direction: 'outbound',
  },
  {
    eventType: 'pricelist_sent',
    keywords: [
      'price list pdf', 'price list attached', 'attached price list',
      'sending the price list', 'price list file', 'full price list',
      'current price list', 'updated price list', 'price catalog',
      'product catalog', 'price sheet attached', 'catalog attached',
      'pricing catalog', 'price guide', 'wholesale price list'
    ],
    regexPatterns: [
      /price list.*(pdf|attached|file|enclosed)/i,
      /(attach|send|include).*(price list|pricelist|catalog)/i,
      /(here|below|find).*(price list|catalog|price guide)/i,
      /(full|complete|updated|current).*(price list|pricelist)/i,
      /pdf.*(price list|pricelist|catalog)/i,
      /product.*(catalog|list|guide).*(attached|enclosed)/i,
    ],
    baseConfidence: 0.85,
    direction: 'outbound',
  },
  {
    eventType: 'quote_sent',
    keywords: [
      'attached quote', 'quote attached', 'quotation attached',
      'sending the quote', 'here is your quote', 'formal quote',
      'quote for your review', 'please find the quote', 'quote number',
      'quote from odoo', 'quote as requested', 'prepared a quote',
      'quote reference', 'quotation number', 'quote details',
      'proforma', 'estimate attached', 'proposal attached'
    ],
    regexPatterns: [
      /(attach|send|include).*(quote|quotation|proposal|estimate)/i,
      /quote.*(attached|enclosed|below|for your|number|#)/i,
      /(here|find|please).*(quote|quotation|proposal)/i,
      /(formal|official).*(quote|quotation|proposal)/i,
      /quote.?(#|number|ref|reference)\s?\d*/i,
      /(proforma|estimate|proposal).*(attached|enclosed)/i,
      /prepared.*(quote|quotation|proposal)/i,
    ],
    baseConfidence: 0.85,
    direction: 'outbound',
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
          AND e.event_type = 'action'
          AND e.trigger_text LIKE '%No response%'
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
        eventType: 'action',
        confidence: '0.75',
        triggerText: `No response for ${staleDays}+ days - follow up needed`,
        occurredAt: new Date(),
        isProcessed: false,
      });
      staleCount++;
    }
  }
  
  console.log(`[Email Events] Detected ${staleCount} stale threads`);
  return staleCount;
}

export async function createFollowUpTasksFromEvents(userId: string | null, limit: number = 50): Promise<number> {
  // If userId is null, process all users' events (admin mode)
  const whereConditions = userId 
    ? and(eq(emailSalesEvents.userId, userId), eq(emailSalesEvents.isProcessed, false))
    : eq(emailSalesEvents.isProcessed, false);
    
  const unprocessedEvents = await db.select({
    event: emailSalesEvents,
    customer: customers,
  })
    .from(emailSalesEvents)
    .leftJoin(customers, eq(emailSalesEvents.customerId, customers.id))
    .where(whereConditions)
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
  po: "Purchase order received! Process immediately. Confirm receipt, verify quantities and pricing, and provide expected delivery timeline. This is a committed sale - prioritize fulfillment.",
  approval: "Pricing/quote approval received! Strike while the iron is hot. Reach out within hours to finalize the order. Confirm details and get the PO moving.",
  samples: "Sample request indicates strong interest. Send samples within 24-48 hours. Include pricing information and a personalized note. Schedule follow-up for feedback in 5-7 days.",
  urgent: "Time-sensitive request! Respond immediately. Acknowledge the urgency, provide a realistic timeline, and keep the customer updated throughout. Speed builds trust.",
  opportunity: "New opportunity detected! Research the customer's needs before responding. Ask qualifying questions about volume, timeline, and application to tailor your approach.",
  commitment: "Customer has made a commitment. Document it and set reminders for follow-up. Prepare for the next step and ensure you deliver on time to build trust.",
  action: "Customer needs action from you. Prioritize this request and respond clearly. Confirm what you're doing and when they can expect completion.",
  feedback: "Customer provided feedback. Thank them regardless of sentiment. For positive feedback, ask for testimonial/referral. For concerns, address promptly and document for improvement.",
  sales_win: "Congratulations on the win! Process the order quickly, send a thank-you note, and document what led to this success. Consider asking for a referral or testimonial while the positive momentum is high.",
  press_test_success: "Press test succeeded! The customer is impressed. This is the perfect moment to discuss production quantities and timelines. Strike while the iron is hot - they're ready to move forward.",
  swatch_received: "Customer received and is reviewing samples. Follow up in 2-3 days to discuss their favorites, answer questions, and guide them toward an order. Ask what applications they have in mind.",
  lead: "New lead detected! Respond within 1 hour if possible - speed matters for new inquiries. Ask qualifying questions about their application, volume, and timeline. Send a swatchbook to make a great first impression.",
  price_sent: "Pricing sent! Follow up in 2-3 days to check if they have questions. Ask about their timeline and if the pricing meets their budget. Offer to adjust quantities or suggest alternatives if needed.",
  pricelist_sent: "Price list sent! Follow up in 4-5 days to see if they found what they need. Offer to create a custom quote for their specific products and quantities. Ask about their upcoming projects.",
  quote_sent: "Formal quote delivered! This is a hot opportunity. Follow up within 2 days to walk them through the quote, address any concerns, and ask for the order. Time kills deals - stay proactive!",
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
    
    const customerStage = event.customer?.accountState || 'unknown';
    const objectionType = (event.event as any).objectionType || 'none';
    const cacheKey = getCacheKey(event.event.eventType, customerStage, objectionType);
    
    // Check cache first
    const cachedTip = getCachedCoaching(cacheKey);
    if (cachedTip) {
      console.log(`[AI Coach] Cache hit for ${cacheKey}`);
      await db.update(emailSalesEvents)
        .set({ coachingTip: cachedTip })
        .where(eq(emailSalesEvents.id, eventId));
      return cachedTip;
    }
    
    const confidence = event.event.confidence || 0;
    const customerName = event.customer?.company || 'the customer';
    const triggerText = event.event.triggerText || '';
    
    let coachingTip = template;
    
    // Only call OpenAI if confidence > threshold AND we have an API key
    if (confidence >= COACHING_CONFIDENCE_THRESHOLD && process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const prompt = `You are a sales coach for a specialty printing and graphics company. Based on this detected sales event, provide a brief, actionable coaching tip (2-3 sentences max).

Event Type: ${event.event.eventType}
Customer Stage: ${customerStage}
Trigger Text: "${triggerText}"

Base guidance: ${template}

Personalize this coaching tip for this event type and customer stage. Be concise and action-oriented.`;
        
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.7,
        });
        
        coachingTip = response.choices[0]?.message?.content?.trim() || template;
        
        // Cache the AI-generated tip for this combination
        setCachedCoaching(cacheKey, coachingTip);
        console.log(`[AI Coach] Cached tip for ${cacheKey}`);
      } catch (aiError) {
        console.error('[AI Coach] OpenAI error, using template:', aiError);
      }
    } else if (confidence < COACHING_CONFIDENCE_THRESHOLD) {
      console.log(`[AI Coach] Using template (confidence ${confidence.toFixed(2)} < threshold ${COACHING_CONFIDENCE_THRESHOLD})`);
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
