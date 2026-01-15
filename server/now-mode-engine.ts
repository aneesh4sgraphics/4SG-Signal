import { db } from "./db";
import { 
  customers, 
  users,
  nowModeSessions, 
  nowModeActivities,
  nowModeAdminReports,
  nowModeEvents,
  customerActivityEvents,
  customerJourney,
  coachingMoments,
  customerMachineProfiles,
  customerContacts,
  shopifyCustomerMappings,
  sentQuotes,
  NOW_MODE_BUCKETS,
  BUCKET_QUOTAS,
  CARD_TYPE_BUCKETS,
  HIGH_VALUE_OUTCOMES,
  EFFICIENCY_POINTS,
  type NowModeBucket,
  type CardOutcome,
  type NowModeSession,
  type NowModeEventType,
  type InsertNowModeActivity,
} from "@shared/schema";
import { normalizeEmail } from "@shared/email-normalizer";
import { eq, and, or, isNull, lt, gt, gte, desc, asc, sql, ne, lte, count, exists } from "drizzle-orm";

const DAILY_TARGET = 30;
const SKIP_PENALTY_THRESHOLD = 3;
const DORMANCY_MINUTES = 180; // Changed to 3 hours as per user request
const ANEESH_USER_ID = "45980257"; // Aneesh's user ID for load balancing

interface Customer {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  email2: string | null;  // Secondary email
  emailNormalized: string | null;  // Normalized email for Email Intelligence
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  salesRepId: string | null;
  salesRepName: string | null;
  pricingTier: string | null;
  lastOutboundEmailAt: Date | null;
  swatchbookSentAt: Date | null;
  pressTestSentAt: Date | null;
  priceListSentAt: Date | null;
  doNotContact: boolean | null;
  pausedUntil: Date | null;
  hasMachineProfile: boolean;  // Whether customer has any machine profile set
  isHotProspect: boolean | null;  // Priority hot lead status
  odooPartnerId: number | null;  // Odoo partner ID for external link
  shopifyCustomerId: string | null;  // Shopify customer ID from mapping table
  hasUnnormalizedContacts: boolean;  // Has contacts needing email normalization
  hasPrimaryEmailContact: boolean;  // Has a contact marked as primary email
}

// Email hygiene card data for contact-level operations
interface EmailHygieneContact {
  contactId: number;
  customerId: string;
  contactName: string | null;
  email: string | null;
  emailNormalized: string | null;
  suggestedNormalized: string | null;
  isPrimary: boolean;
}

// Recent quote data for follow_up_quote cards
interface RecentQuote {
  id: number;
  quoteNumber: string;
  customerName: string;
  totalAmount: string;
  createdAt: Date;
  status: string;
  outcome: string | null;
  quoteItems: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

interface EligibleCard {
  customerId: string;
  customer: Customer;
  cardType: string;
  bucket: NowModeBucket;
  whyNow: string;
  isHardCard: boolean;
  outcomeButtons: OutcomeButton[];
  emailHygieneContact?: EmailHygieneContact;  // For email hygiene card types
  recentQuote?: RecentQuote;  // For follow_up_quote cards
}

interface OutcomeButton {
  outcome: CardOutcome;
  label: string;
  icon: string;
  color: string;
  schedulesFollowUp?: boolean;
  followUpDays?: number;
  assistText?: string; // Coaching tip shown under button
  updatesCustomerState?: string; // Field to update on customer record
}

interface BucketProgress {
  bucket: NowModeBucket;
  completed: number;
  quota: number;
  remaining: number;
}

export class NowModeEngine {
  private getTodayKey(): string {
    return new Date().toISOString().split("T")[0];
  }

  // Get user's day index (which day of NOW MODE usage, 1-indexed for habit formation tracking)
  private async getUserDayIndex(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(nowModeSessions)
      .where(eq(nowModeSessions.userId, userId));
    return (result?.count || 0) + 1; // Current day is count + 1
  }

  // Log a NOW MODE event for analytics (runs async, doesn't block)
  private async logEvent(
    eventType: NowModeEventType,
    userId: string,
    options: {
      sessionId?: number;
      customerId?: string;
      taskType?: string;
      bucket?: string;
      outcome?: string;
      skipReason?: string;
      timeToActionSeconds?: number;
      efficiencyDelta?: number;
      efficiencyAfter?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    try {
      const dayIndex = await this.getUserDayIndex(userId);
      await db.insert(nowModeEvents).values({
        eventType,
        userId,
        sessionId: options.sessionId || null,
        customerId: options.customerId || null,
        taskType: options.taskType || null,
        bucket: options.bucket || null,
        outcome: options.outcome || null,
        skipReason: options.skipReason || null,
        timeToActionSeconds: options.timeToActionSeconds || null,
        dayIndex,
        efficiencyDelta: options.efficiencyDelta || null,
        efficiencyAfter: options.efficiencyAfter || null,
        metadata: options.metadata || {},
      });
    } catch (error) {
      // Log but don't throw - event logging should never break the main flow
      console.error("[NOW MODE Event] Failed to log event:", eventType, error);
    }
  }

  async getOrCreateSession(userId: string): Promise<NowModeSession> {
    const dateKey = this.getTodayKey();
    
    const existing = await db
      .select()
      .from(nowModeSessions)
      .where(and(eq(nowModeSessions.userId, userId), eq(nowModeSessions.dateKey, dateKey)))
      .limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }

    const [session] = await db
      .insert(nowModeSessions)
      .values({
        userId,
        dateKey,
        totalCompleted: 0,
        dailyTarget: DAILY_TARGET,
        callsCompleted: 0,
        followUpsCompleted: 0,
        outreachCompleted: 0,
        dataHygieneCompleted: 0,
        enablementCompleted: 0,
        totalSkips: 0,
        skipPenaltyApplied: false,
        efficiencyScore: 0, // Start at 0, earn points through actions
        earnedPoints: 0,
        highValueOutcomes: 0,
        dormancyWarningsIgnored: 0,
        pausedIntentionally: false,
        lastActivityAt: new Date(),
        startedAt: new Date(),
      })
      .returning();
    
    // Log session started event
    this.logEvent('now_session_started', userId, {
      sessionId: session.id,
      efficiencyAfter: 0,
    });
    
    return session;
  }

  getBucketProgress(session: NowModeSession): BucketProgress[] {
    return NOW_MODE_BUCKETS.map((bucket) => {
      const completed = this.getBucketCompleted(session, bucket);
      const quota = BUCKET_QUOTAS[bucket];
      return {
        bucket,
        completed,
        quota,
        remaining: Math.max(0, quota - completed),
      };
    });
  }

  private getBucketCompleted(session: NowModeSession, bucket: NowModeBucket): number {
    switch (bucket) {
      case "calls": return session.callsCompleted || 0;
      case "follow_ups": return session.followUpsCompleted || 0;
      case "outreach": return session.outreachCompleted || 0;
      case "data_hygiene": return session.dataHygieneCompleted || 0;
      case "enablement": return session.enablementCompleted || 0;
    }
  }

  private getNextBucket(session: NowModeSession): NowModeBucket | null {
    const progress = this.getBucketProgress(session);
    const unfilled = progress.filter((p) => p.remaining > 0);
    
    if (unfilled.length === 0) return null;

    const totalCompleted = session.totalCompleted || 0;
    const lastBucket = (session as any).lastBucket as NowModeBucket | null;
    const callsInFirstFive = (session as any).callsInFirstFive || 0;

    // Anti-monotony rules:
    // 1. Never show same category twice in a row
    // 2. Max 2 calls in first 5 cards
    // 3. End with easy win (data_hygiene or enablement) for last 2 cards

    // Rule 3: Last 2 cards should be easy wins
    if (totalCompleted >= 8) {
      const easyBuckets = unfilled.filter(p => 
        p.bucket === "data_hygiene" || p.bucket === "enablement"
      );
      if (easyBuckets.length > 0) {
        // Still respect rule 1 (no same bucket twice)
        const nonRepeat = easyBuckets.filter(p => p.bucket !== lastBucket);
        if (nonRepeat.length > 0) return nonRepeat[0].bucket;
        return easyBuckets[0].bucket;
      }
    }

    // Filter out last bucket (Rule 1: no same category twice)
    let candidates = lastBucket 
      ? unfilled.filter(p => p.bucket !== lastBucket)
      : unfilled;

    // If no candidates after filtering, fall back to all unfilled
    if (candidates.length === 0) candidates = unfilled;

    // Rule 2: Max 2 calls in first 5 cards
    if (totalCompleted < 5 && callsInFirstFive >= 2) {
      const nonCallCandidates = candidates.filter(p => p.bucket !== "calls");
      if (nonCallCandidates.length > 0) candidates = nonCallCandidates;
    }

    // Prioritize order: data_hygiene (critical info) > follow_ups > outreach > calls > enablement
    // Data hygiene is critical because pricing tier and sales rep are essential for business operations
    const priorityOrder: NowModeBucket[] = ["data_hygiene", "follow_ups", "outreach", "calls", "enablement"];
    for (const bucket of priorityOrder) {
      const match = candidates.find(p => p.bucket === bucket);
      if (match) return match.bucket;
    }

    return candidates[0]?.bucket || null;
  }

  async getEligibleCard(userId: string): Promise<{ card: EligibleCard | null; session: NowModeSession; allDone: boolean }> {
    const session = await this.getOrCreateSession(userId);
    
    console.log(`[NOW MODE] Session for userId ${userId}: totalCompleted=${session.totalCompleted}, buckets: calls=${session.callsCompleted}, follow_ups=${session.followUpsCompleted}, outreach=${session.outreachCompleted}, data_hygiene=${session.dataHygieneCompleted}, enablement=${session.enablementCompleted}`);
    
    if ((session.totalCompleted || 0) >= DAILY_TARGET) {
      console.log(`[NOW MODE] User ${userId} has completed daily target (${DAILY_TARGET})`);
      return { card: null, session, allDone: true };
    }

    const recentActivities = await db
      .select({ customerId: nowModeActivities.customerId })
      .from(nowModeActivities)
      .where(eq(nowModeActivities.sessionId, session.id))
      .orderBy(desc(nowModeActivities.createdAt))
      .limit(20);
    
    const recentCustomerIds = recentActivities.map((a) => a.customerId);

    const targetBucket = this.getNextBucket(session);
    console.log(`[NOW MODE] Target bucket for userId ${userId}: ${targetBucket || 'NONE'}`);
    
    if (!targetBucket) {
      console.log(`[NOW MODE] All buckets filled for userId ${userId}, marking allDone`);
      return { card: null, session, allDone: true };
    }

    const skipPenalty = session.skipPenaltyApplied || false;
    
    // First attempt: try with current penalty state
    const card = await this.findCardForBucket(userId, targetBucket, recentCustomerIds, skipPenalty);
    
    if (card) {
      return { card, session, allDone: false };
    }

    // Try other buckets with penalty
    for (const bucket of NOW_MODE_BUCKETS) {
      if (bucket === targetBucket) continue;
      const spilloverCard = await this.findCardForBucket(userId, bucket, recentCustomerIds, skipPenalty);
      if (spilloverCard) {
        return { card: spilloverCard, session, allDone: false };
      }
    }

    // FALLBACK: If penalty is applied but no cards found, try again WITHOUT penalty
    // This ensures users always see some cards even after skipping
    if (skipPenalty) {
      console.log(`[NOW MODE] No cards found with skip penalty - trying fallback without penalty`);
      
      const fallbackCard = await this.findCardForBucket(userId, targetBucket, recentCustomerIds, false);
      if (fallbackCard) {
        return { card: fallbackCard, session, allDone: false };
      }

      for (const bucket of NOW_MODE_BUCKETS) {
        if (bucket === targetBucket) continue;
        const spilloverCard = await this.findCardForBucket(userId, bucket, recentCustomerIds, false);
        if (spilloverCard) {
          return { card: spilloverCard, session, allDone: false };
        }
      }
    }

    // LOAD BALANCING: If still no cards found and user is NOT Aneesh, 
    // try Aneesh's customers to balance the workload
    if (userId !== ANEESH_USER_ID) {
      console.log(`[NOW MODE] No cards found for user - trying load balancing from Aneesh's customers`);
      
      const loadBalanceCard = await this.findCardFromAneeshPool(userId, recentCustomerIds);
      if (loadBalanceCard) {
        return { card: loadBalanceCard, session, allDone: false };
      }
    }

    return { card: null, session, allDone: true };
  }

  private async findCardFromAneeshPool(
    userId: string,
    excludeCustomerIds: string[]
  ): Promise<EligibleCard | null> {
    const now = new Date();
    
    console.log(`[NOW MODE] Load balancing: fetching Aneesh's customers for user ${userId}`);
    
    // Use pure raw SQL subqueries to avoid Drizzle column reference type issues
    const machineProfileSubquery = sql<boolean>`EXISTS (
      SELECT 1 FROM customer_machine_profiles cmp
      WHERE cmp.customer_id = customers.id
      LIMIT 1
    )`.as('has_machine_profile');
    
    // Use a subquery to get Shopify customer ID from mapping table
    const shopifyMappingSubquery = sql<string>`(
      SELECT scm.shopify_customer_id 
      FROM shopify_customer_mappings scm 
      WHERE scm.crm_customer_id = customers.id 
      AND scm.is_active = true
      LIMIT 1
    )`.as('shopify_customer_id');
    
    // Get Aneesh's customers that aren't paused or DNC, with machine profile status
    const aneeshCustomers = await db
      .select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        email2: customers.email2,
        phone: customers.phone,
        address1: customers.address1,
        address2: customers.address2,
        city: customers.city,
        state: customers.province,
        zip: customers.zip,
        salesRepId: customers.salesRepId,
        salesRepName: customers.salesRepName,
        pricingTier: customers.pricingTier,
        lastOutboundEmailAt: customers.lastOutboundEmailAt,
        swatchbookSentAt: customers.swatchbookSentAt,
        pressTestSentAt: customers.pressTestSentAt,
        priceListSentAt: customers.priceListSentAt,
        doNotContact: customers.doNotContact,
        pausedUntil: customers.pausedUntil,
        hasMachineProfile: machineProfileSubquery,
        isHotProspect: customers.isHotProspect,
        odooPartnerId: customers.odooPartnerId,
        shopifyCustomerId: shopifyMappingSubquery,
      })
      .from(customers)
      .where(
        and(
          eq(customers.salesRepId, ANEESH_USER_ID),
          or(eq(customers.doNotContact, false), isNull(customers.doNotContact)),
          or(isNull(customers.pausedUntil), lt(customers.pausedUntil, now))
        )
      )
      .orderBy(desc(customers.totalSpent), desc(customers.totalOrders))
      .limit(100);

    const filtered = aneeshCustomers.filter((c) => !excludeCustomerIds.includes(c.id));
    console.log(`[NOW MODE] Load balancing: found ${filtered.length} of Aneesh's customers available`);

    // Try each bucket without penalty
    for (const bucket of NOW_MODE_BUCKETS) {
      for (const customer of filtered) {
        const cardType = this.matchCardType(customer, bucket, false);
        if (cardType) {
          console.log(`[NOW MODE] Load balancing: found card '${cardType}' from Aneesh's pool for customer ${customer.id}`);
          return await this.buildCard(customer, cardType, bucket);
        }
      }
    }

    console.log(`[NOW MODE] Load balancing: no matching cards found in Aneesh's pool`);
    return null;
  }

  private async findCardForBucket(
    userId: string,
    bucket: NowModeBucket,
    excludeCustomerIds: string[],
    skipHardCards: boolean
  ): Promise<EligibleCard | null> {
    const eligibleCustomers = await this.getEligibleCustomers(userId, excludeCustomerIds);
    
    console.log(`[NOW MODE] Searching bucket '${bucket}' with ${eligibleCustomers.length} customers, skipHardCards=${skipHardCards}`);
    
    let matchedCount = 0;
    for (const customer of eligibleCustomers) {
      const cardType = this.matchCardType(customer, bucket, skipHardCards);
      if (cardType) {
        matchedCount++;
        console.log(`[NOW MODE] Found card type '${cardType}' for customer ${customer.id} in bucket '${bucket}'`);
        return await this.buildCard(customer, cardType, bucket);
      }
    }
    
    console.log(`[NOW MODE] No matching card found in bucket '${bucket}' after checking ${eligibleCustomers.length} customers`);
    return null;
  }

  private async getEligibleCustomers(userId: string, excludeIds: string[]): Promise<Customer[]> {
    const now = new Date();
    
    console.log(`[NOW MODE] Getting eligible customers for userId: ${userId} (type: ${typeof userId})`);
    
    // Use pure raw SQL subqueries to avoid Drizzle column reference type issues
    const machineProfileSubquery = sql<boolean>`EXISTS (
      SELECT 1 FROM customer_machine_profiles cmp
      WHERE cmp.customer_id = customers.id
      LIMIT 1
    )`.as('has_machine_profile');
    
    // Use a subquery to get Shopify customer ID from mapping table
    const shopifyMappingSubquery = sql<string>`(
      SELECT scm.shopify_customer_id 
      FROM shopify_customer_mappings scm 
      WHERE scm.crm_customer_id = customers.id 
      AND scm.is_active = true
      LIMIT 1
    )`.as('shopify_customer_id');
    
    // Subquery: Check if customer has contacts with email but no normalized email
    const unnormalizedContactsSubquery = sql<boolean>`EXISTS (
      SELECT 1 FROM customer_contacts cc
      WHERE cc.customer_id = customers.id
      AND cc.email IS NOT NULL 
      AND cc.email != ''
      AND cc.email_normalized IS NULL
    )`.as('has_unnormalized_contacts');
    
    // Subquery: Check if customer has any primary email contact
    const primaryEmailContactSubquery = sql<boolean>`EXISTS (
      SELECT 1 FROM customer_contacts cc
      WHERE cc.customer_id = customers.id
      AND cc.is_primary = true
    )`.as('has_primary_email_contact');
    
    const result = await db
      .select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        email2: customers.email2,
        emailNormalized: customers.emailNormalized,
        phone: customers.phone,
        address1: customers.address1,
        address2: customers.address2,
        city: customers.city,
        state: customers.province,
        zip: customers.zip,
        salesRepId: customers.salesRepId,
        salesRepName: customers.salesRepName,
        pricingTier: customers.pricingTier,
        lastOutboundEmailAt: customers.lastOutboundEmailAt,
        swatchbookSentAt: customers.swatchbookSentAt,
        pressTestSentAt: customers.pressTestSentAt,
        priceListSentAt: customers.priceListSentAt,
        doNotContact: customers.doNotContact,
        pausedUntil: customers.pausedUntil,
        hasMachineProfile: machineProfileSubquery,
        isHotProspect: customers.isHotProspect,
        odooPartnerId: customers.odooPartnerId,
        shopifyCustomerId: shopifyMappingSubquery,
        hasUnnormalizedContacts: unnormalizedContactsSubquery,
        hasPrimaryEmailContact: primaryEmailContactSubquery,
      })
      .from(customers)
      .where(
        and(
          or(eq(customers.doNotContact, false), isNull(customers.doNotContact)),
          or(isNull(customers.pausedUntil), lt(customers.pausedUntil, now)),
          or(eq(customers.salesRepId, userId), isNull(customers.salesRepId))
        )
      )
      .orderBy(desc(customers.totalSpent), desc(customers.totalOrders))
      .limit(100);

    console.log(`[NOW MODE] Found ${result.length} eligible customers (before exclusion), excluding ${excludeIds.length} recently seen`);
    
    if (result.length === 0) {
      console.log(`[NOW MODE] WARNING: No eligible customers found for userId ${userId}. Query filters: salesRepId=${userId} OR salesRepId IS NULL, doNotContact=false/null, pausedUntil is past`);
    } else if (result.length > 0) {
      const sample = result[0];
      console.log(`[NOW MODE] Sample customer: id=${sample.id}, pricingTier=${sample.pricingTier}, salesRepId=${sample.salesRepId}, hasMachineProfile=${sample.hasMachineProfile}`);
    }
    
    const filtered = result.filter((c) => !excludeIds.includes(c.id));
    console.log(`[NOW MODE] After exclusion: ${filtered.length} customers available`);
    
    return filtered;
  }

  private matchCardType(customer: Customer, bucket: NowModeBucket, skipHardCards: boolean): string | null {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Helper to check if customer has a complete mailing address
    const hasMailingAddress = !!(customer.address1 && customer.city && customer.state && customer.zip);

    switch (bucket) {
      case "data_hygiene":
        // Critical data fields in priority order
        if (!customer.pricingTier) return "set_pricing_tier";
        if (!customer.salesRepId) return "set_sales_rep";
        if (!customer.hasMachineProfile) return "set_machine_profile";  // Critical: collect machine info
        if (!customer.email) return "set_primary_email";
        if (!hasMailingAddress) return "set_mailing_address";  // Required before sending samples
        // Email hygiene for Email Intelligence matching (1-2 per day)
        if (customer.hasUnnormalizedContacts) return "hygiene_normalize_email";
        if (!customer.hasPrimaryEmailContact && customer.email) return "hygiene_missing_primary_email";
        // Customer-level email normalization
        if (customer.email && !customer.emailNormalized) return "hygiene_normalize_email";
        return null;

      case "calls":
        if (skipHardCards) return null;
        if (!customer.lastOutboundEmailAt || customer.lastOutboundEmailAt < thirtyDaysAgo) {
          return "daily_call";
        }
        return "daily_call";

      case "outreach":
        // Only show swatchbook if customer has a mailing address
        if (!customer.swatchbookSentAt && hasMailingAddress) return "send_swatchbook";
        if (!customer.pressTestSentAt) return "send_press_test";
        if (!customer.lastOutboundEmailAt || customer.lastOutboundEmailAt < thirtyDaysAgo) {
          return "send_marketing_email";
        }
        return null;

      case "follow_ups":
        if (skipHardCards) return null;
        return "follow_up_quote";

      case "enablement":
        if (customer.swatchbookSentAt && !customer.priceListSentAt) {
          return "send_price_list";
        }
        return "introduce_category";
    }
  }

  private async buildCard(customer: Customer, cardType: string, bucket: NowModeBucket): Promise<EligibleCard> {
    const isHardCard = ["daily_call", "follow_up_call", "follow_up_quote"].includes(cardType);
    
    const card: EligibleCard = {
      customerId: customer.id,
      customer,
      cardType,
      bucket,
      whyNow: this.getWhyNow(customer, cardType),
      isHardCard,
      outcomeButtons: this.getOutcomeButtons(cardType),
    };
    
    // For email hygiene cards, fetch the specific contact needing attention
    if (cardType === "hygiene_normalize_email") {
      const emailHygieneContact = await this.getEmailHygieneContact(customer.id);
      if (emailHygieneContact) {
        card.emailHygieneContact = emailHygieneContact;
      }
    } else if (cardType === "hygiene_missing_primary_email") {
      const primaryCandidate = await this.getPrimaryEmailCandidate(customer.id);
      if (primaryCandidate) {
        card.emailHygieneContact = primaryCandidate;
      }
    } else if (cardType === "follow_up_quote") {
      // Fetch the most recent quote for this customer
      const recentQuote = await this.getRecentQuoteForCustomer(customer);
      if (recentQuote) {
        card.recentQuote = recentQuote;
      }
    }
    
    return card;
  }
  
  // Get the most recent quote for a customer
  private async getRecentQuoteForCustomer(customer: Customer): Promise<RecentQuote | null> {
    try {
      // Query by customer email
      if (!customer.email) return null;
      
      const quotes = await db
        .select()
        .from(sentQuotes)
        .where(eq(sentQuotes.customerEmail, customer.email))
        .orderBy(desc(sentQuotes.createdAt))
        .limit(1);
      
      if (quotes.length === 0) return null;
      
      const quote = quotes[0];
      
      // Parse the quoteItems JSON
      let parsedItems: Array<{ productName: string; quantity: number; unitPrice: number; totalPrice: number }> = [];
      try {
        const items = JSON.parse(quote.quoteItems || '[]');
        parsedItems = items.map((item: any) => ({
          productName: item.productName || item.name || 'Unknown Product',
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice || item.price) || 0,
          totalPrice: Number(item.totalPrice || item.total) || 0,
        }));
      } catch (e) {
        console.error('[NOW MODE] Error parsing quote items:', e);
      }
      
      return {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        customerName: quote.customerName,
        totalAmount: quote.totalAmount,
        createdAt: quote.createdAt,
        status: quote.status,
        outcome: quote.outcome,
        quoteItems: parsedItems,
      };
    } catch (error) {
      console.error('[NOW MODE] Error fetching recent quote:', error);
      return null;
    }
  }
  
  // Get a contact that needs email normalization
  private async getEmailHygieneContact(customerId: string): Promise<EmailHygieneContact | null> {
    const contacts = await db
      .select({
        contactId: customerContacts.id,
        customerId: customerContacts.customerId,
        firstName: customerContacts.firstName,
        lastName: customerContacts.lastName,
        email: customerContacts.email,
        emailNormalized: customerContacts.emailNormalized,
        isPrimary: customerContacts.isPrimary,
      })
      .from(customerContacts)
      .where(and(
        eq(customerContacts.customerId, customerId),
        sql`${customerContacts.email} IS NOT NULL AND ${customerContacts.email} != ''`,
        isNull(customerContacts.emailNormalized)
      ))
      .limit(1);
    
    if (contacts.length === 0) return null;
    
    const contact = contacts[0];
    const suggestedNormalized = normalizeEmail(contact.email);
    
    return {
      contactId: contact.contactId,
      customerId: contact.customerId,
      contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
      email: contact.email,
      emailNormalized: contact.emailNormalized,
      suggestedNormalized,
      isPrimary: contact.isPrimary || false,
    };
  }
  
  // Get a contact candidate to be set as primary email
  private async getPrimaryEmailCandidate(customerId: string): Promise<EmailHygieneContact | null> {
    const contacts = await db
      .select({
        contactId: customerContacts.id,
        customerId: customerContacts.customerId,
        firstName: customerContacts.firstName,
        lastName: customerContacts.lastName,
        email: customerContacts.email,
        emailNormalized: customerContacts.emailNormalized,
        isPrimary: customerContacts.isPrimary,
      })
      .from(customerContacts)
      .where(and(
        eq(customerContacts.customerId, customerId),
        sql`${customerContacts.email} IS NOT NULL AND ${customerContacts.email} != ''`
      ))
      .orderBy(desc(customerContacts.updatedAt))
      .limit(1);
    
    if (contacts.length === 0) return null;
    
    const contact = contacts[0];
    
    return {
      contactId: contact.contactId,
      customerId: contact.customerId,
      contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
      email: contact.email,
      emailNormalized: contact.emailNormalized,
      suggestedNormalized: normalizeEmail(contact.email),
      isPrimary: contact.isPrimary || false,
    };
  }

  private getWhyNow(customer: Customer, cardType: string): string {
    const name = customer.company || `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "This customer";
    const now = new Date();
    
    const daysSince = (date: Date | null): number | null => {
      if (!date) return null;
      return Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
    };
    
    const daysSinceEmail = daysSince(customer.lastOutboundEmailAt);
    const daysSinceSwatchbook = daysSince(customer.swatchbookSentAt);
    const daysSincePressTest = daysSince(customer.pressTestSentAt);
    const daysSincePriceList = daysSince(customer.priceListSentAt);
    
    switch (cardType) {
      case "set_pricing_tier":
        return `Why now: ${name} has no pricing tier. Accounts with tiers convert 34% faster on quotes.`;
      case "set_sales_rep":
        return `Why now: ${name} is unassigned. Unowned accounts have 67% lower engagement rates.`;
      case "set_machine_profile":
        return `Why now: ${name} has no machine info. Knowing their equipment helps target the right products and identify distributors/dealers.`;
      case "set_primary_email":
        return `Why now: ${name} has no email on file. Email outreach drives 3x more quote requests than cold calls.`;
      case "set_mailing_address":
        return `Why now: ${name} has no mailing address. Required before sending swatchbooks or samples.`;
      case "daily_call":
        if (daysSinceEmail !== null && daysSinceEmail > 0) {
          return `Why now: No outbound touch in ${daysSinceEmail} days. Similar accounts convert 22% higher when called within 21 days.`;
        }
        return `Why now: ${name} has had no recent contact. A quick call could uncover opportunities.`;
      case "send_swatchbook":
        if (daysSinceEmail !== null && daysSinceEmail > 14) {
          return `Why now: Last touch was ${daysSinceEmail} days ago. Swatchbooks re-engage 45% of dormant accounts.`;
        }
        return `Why now: ${name} hasn't received samples. Accounts with swatchbooks order 2.3x more often.`;
      case "send_press_test":
        if (daysSinceSwatchbook !== null) {
          return `Why now: Swatchbook sent ${daysSinceSwatchbook} days ago. Press tests convert 28% of sample recipients to buyers.`;
        }
        return `Why now: ${name} might benefit from a press test. Quality validation drives 28% higher close rates.`;
      case "send_marketing_email":
        if (daysSinceEmail !== null) {
          return `Why now: Last email was ${daysSinceEmail} days ago. Re-engagement emails have 18% open rates after 30+ day gaps.`;
        }
        return `Why now: ${name} hasn't received email in 30+ days. Time to re-engage with new offers.`;
      case "send_price_list":
        if (daysSinceSwatchbook !== null) {
          return `Why now: Swatchbook sent ${daysSinceSwatchbook} days ago, but no price list yet. 62% of buyers need pricing within 10 days.`;
        }
        return `Why now: ${name} received samples but no pricing. Send the price list to close the loop.`;
      case "follow_up_quote":
        return `Why now: Open quotes close at 31% when followed up within 7 days vs 8% after 14 days.`;
      case "introduce_category":
        if (daysSinceSwatchbook !== null && daysSinceSwatchbook > 30) {
          return `Why now: ${daysSinceSwatchbook} days since last sample. Cross-selling increases LTV by 40%.`;
        }
        return `Why now: ${name} may be ready for new categories. Cross-sell opportunities increase LTV by 40%.`;
      
      // Email hygiene card types
      case "hygiene_normalize_email":
        return `Why now: ${name} has email data that needs normalization. Fixing this improves Email Intelligence matching and reduces missed messages.`;
      case "hygiene_missing_primary_email":
        return `Why now: ${name} has contacts but no primary email. Setting a primary contact improves outreach accuracy.`;
      
      default:
        return `Why now: Action needed for ${name}.`;
    }
  }

  private getOutcomeButtons(cardType: string): OutcomeButton[] {
    switch (cardType) {
      case "set_pricing_tier":
        return [
          { outcome: "data_updated", label: "Done", icon: "check", color: "green", assistText: "Check order history to determine appropriate tier level." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];
      case "set_machine_profile":
        return [
          { outcome: "data_updated", label: "Done", icon: "check", color: "green", assistText: "Select their equipment type. Distributors/Dealers will be auto-assigned to Aneesh." },
          { outcome: "called_no_answer", label: "Need to Call", icon: "phone-missed", color: "amber", schedulesFollowUp: true, followUpDays: 1, assistText: "Schedule a call to gather machine information." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];
      case "set_sales_rep":
        return [
          { outcome: "data_updated", label: "Done", icon: "check", color: "green", assistText: "Assign based on territory or product specialty." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];
      case "set_primary_email":
        return [
          { outcome: "data_updated", label: "Done", icon: "check", color: "green", assistText: "Find email on their website or ask during next call." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];

      case "set_mailing_address":
        return [
          { outcome: "data_updated", label: "Done", icon: "check", color: "green", assistText: "Enter street address, city, state, and ZIP above." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];

      case "daily_call":
        return [
          { outcome: "called_connected", label: "Connected", icon: "phone", color: "green", assistText: "Ask about current material usage and next print run.", updatesCustomerState: "lastContactAt" },
          { outcome: "called_voicemail", label: "Left Voicemail", icon: "voicemail", color: "yellow", schedulesFollowUp: true, followUpDays: 3, assistText: "Leave your name, company, and a specific reason to call back." },
          { outcome: "called_no_answer", label: "No Answer", icon: "phone-missed", color: "orange", schedulesFollowUp: true, followUpDays: 2, assistText: "Try again at a different time of day." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if number is invalid or customer requests no contact." },
        ];

      case "send_swatchbook":
        return [
          { outcome: "sample_sent", label: "Sent", icon: "send", color: "green", schedulesFollowUp: true, followUpDays: 7, assistText: "Include a personalized note mentioning their business.", updatesCustomerState: "swatchbookSentAt" },
          { outcome: "emailed", label: "Emailed First", icon: "mail", color: "blue", schedulesFollowUp: true, followUpDays: 3, assistText: "Confirm shipping address before sending samples." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];

      case "send_press_test":
        return [
          { outcome: "sample_sent", label: "Sent", icon: "send", color: "green", schedulesFollowUp: true, followUpDays: 7, assistText: "Ask about their current print workflow first.", updatesCustomerState: "pressTestSentAt" },
          { outcome: "emailed", label: "Emailed First", icon: "mail", color: "blue", schedulesFollowUp: true, followUpDays: 3, assistText: "Send specs and confirm they have compatible equipment." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];

      case "send_marketing_email":
        return [
          { outcome: "emailed", label: "Email Sent", icon: "mail", color: "green", schedulesFollowUp: true, followUpDays: 7, assistText: "Reference a recent order or inquiry to personalize.", updatesCustomerState: "lastOutboundEmailAt" },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if email bounced or customer unsubscribed." },
        ];

      case "send_price_list":
        return [
          { outcome: "quote_sent", label: "Price List Sent", icon: "file-text", color: "green", schedulesFollowUp: true, followUpDays: 5, assistText: "Highlight products they've shown interest in.", updatesCustomerState: "priceListSentAt" },
          { outcome: "emailed", label: "Emailed First", icon: "mail", color: "blue", schedulesFollowUp: true, followUpDays: 3, assistText: "Ask about their volume needs to recommend right tier." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];

      case "follow_up_quote":
        return [
          { outcome: "called_connected", label: "Connected", icon: "phone", color: "green", assistText: "Ask if they had questions about specific line items.", updatesCustomerState: "lastContactAt" },
          { outcome: "quote_sent", label: "Re-sent Quote", icon: "file-text", color: "blue", schedulesFollowUp: true, followUpDays: 5, assistText: "Offer to walk them through the quote on a call." },
          { outcome: "scheduled_follow_up", label: "Schedule Later", icon: "calendar", color: "yellow", schedulesFollowUp: true, followUpDays: 7, assistText: "Ask when is a better time to discuss." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer explicitly declined." },
        ];

      case "introduce_category":
        return [
          { outcome: "emailed", label: "Intro Sent", icon: "mail", color: "green", schedulesFollowUp: true, followUpDays: 7, assistText: "Mention how this category complements what they already buy." },
          { outcome: "called_connected", label: "Discussed", icon: "phone", color: "blue", assistText: "Ask about pain points with their current supplier.", updatesCustomerState: "lastContactAt" },
          { outcome: "scheduled_follow_up", label: "Schedule Later", icon: "calendar", color: "yellow", schedulesFollowUp: true, followUpDays: 14, assistText: "Book a specific time to present the category." },
        ];

      // Email hygiene card types
      case "hygiene_normalize_email":
        return [
          { outcome: "data_updated", label: "Apply Fix", icon: "check", color: "green", assistText: "One-click to apply the suggested normalized email." },
          { outcome: "completed", label: "Edit Email", icon: "edit", color: "blue", assistText: "Manually correct the email address." },
          { outcome: "marked_dnc", label: "Mark Invalid", icon: "x-circle", color: "red", assistText: "Email is invalid or contact should be removed." },
        ];
      
      case "hygiene_missing_primary_email":
        return [
          { outcome: "data_updated", label: "Set as Primary", icon: "check", color: "green", assistText: "Set this contact as the primary email contact." },
          { outcome: "completed", label: "Skip", icon: "skip-forward", color: "gray", assistText: "No primary needed at this time." },
        ];

      default:
        return [
          { outcome: "completed", label: "Done", icon: "check", color: "green", assistText: "Mark complete when the action is finished." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];
    }
  }

  async completeCard(
    userId: string,
    customerId: string,
    cardType: string,
    outcome: CardOutcome,
    notes?: string
  ): Promise<{ success: boolean; session: NowModeSession; nextFollowUpAt?: Date }> {
    const session = await this.getOrCreateSession(userId);
    const bucket = CARD_TYPE_BUCKETS[cardType] || "data_hygiene";
    const isHighValue = HIGH_VALUE_OUTCOMES.includes(outcome);
    const outcomeButtons = this.getOutcomeButtons(cardType);
    const button = outcomeButtons.find((b) => b.outcome === outcome);
    
    let nextFollowUpAt: Date | undefined;
    if (button?.schedulesFollowUp && button.followUpDays) {
      nextFollowUpAt = new Date();
      nextFollowUpAt.setDate(nextFollowUpAt.getDate() + button.followUpDays);
    }

    await db.insert(nowModeActivities).values({
      sessionId: session.id,
      userId,
      customerId,
      cardType,
      bucket,
      isHardCard: ["daily_call", "follow_up_call", "follow_up_quote"].includes(cardType),
      outcome,
      outcomeNotes: notes,
      isSkip: false,
      nextFollowUpAt,
      nextFollowUpType: nextFollowUpAt ? "follow_up_" + cardType : undefined,
      completedAt: new Date(),
    });

    const newCompleted = (session.totalCompleted || 0) + 1;
    const newHighValue = (session.highValueOutcomes || 0) + (isHighValue ? 1 : 0);

    // Build updated session for efficiency calculation
    const updatedSessionData = {
      ...session,
      totalCompleted: newCompleted,
      highValueOutcomes: newHighValue,
    };

    const updateData: Record<string, any> = {
      totalCompleted: newCompleted,
      highValueOutcomes: newHighValue,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    };

    switch (bucket) {
      case "calls":
        updateData.callsCompleted = (session.callsCompleted || 0) + 1;
        break;
      case "follow_ups":
        updateData.followUpsCompleted = (session.followUpsCompleted || 0) + 1;
        break;
      case "outreach":
        updateData.outreachCompleted = (session.outreachCompleted || 0) + 1;
        break;
      case "data_hygiene":
        updateData.dataHygieneCompleted = (session.dataHygieneCompleted || 0) + 1;
        break;
      case "enablement":
        updateData.enablementCompleted = (session.enablementCompleted || 0) + 1;
        break;
    }

    // Track lastBucket and calls in first five for anti-monotony
    updateData.lastBucket = bucket;
    if (newCompleted <= 5 && bucket === "calls") {
      updateData.callsInFirstFive = (session.callsInFirstFive || 0) + 1;
      updatedSessionData.callsInFirstFive = (session.callsInFirstFive || 0) + 1;
    }

    // Recalculate efficiency with new bucket counts
    switch (bucket) {
      case "calls":
        updatedSessionData.callsCompleted = (session.callsCompleted || 0) + 1;
        break;
      case "follow_ups":
        updatedSessionData.followUpsCompleted = (session.followUpsCompleted || 0) + 1;
        break;
      case "outreach":
        updatedSessionData.outreachCompleted = (session.outreachCompleted || 0) + 1;
        break;
      case "data_hygiene":
        updatedSessionData.dataHygieneCompleted = (session.dataHygieneCompleted || 0) + 1;
        break;
      case "enablement":
        updatedSessionData.enablementCompleted = (session.enablementCompleted || 0) + 1;
        break;
    }
    updateData.efficiencyScore = this.calculateEfficiency(updatedSessionData as NowModeSession);

    await db.update(nowModeSessions).set(updateData).where(eq(nowModeSessions.id, session.id));

    // Update customer lastContactAt for call outcomes
    if (outcome === "called_connected" || outcome === "called_voicemail" || outcome === "called_no_answer") {
      await db.update(customers).set({ lastContactAt: new Date(), updatedAt: new Date() }).where(eq(customers.id, customerId));
    }

    if (outcome === "marked_dnc") {
      await db.update(customers).set({
        doNotContact: true,
        doNotContactReason: notes || "Marked via NOW MODE",
        doNotContactSetBy: userId,
        doNotContactSetAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(customers.id, customerId));
    }

    if (cardType === "send_swatchbook" && outcome === "sample_sent") {
      await db.update(customers).set({ swatchbookSentAt: new Date(), updatedAt: new Date() }).where(eq(customers.id, customerId));
    } else if (cardType === "send_press_test" && outcome === "sample_sent") {
      await db.update(customers).set({ pressTestSentAt: new Date(), updatedAt: new Date() }).where(eq(customers.id, customerId));
    } else if (cardType === "send_price_list" && outcome === "quote_sent") {
      await db.update(customers).set({ priceListSentAt: new Date(), updatedAt: new Date() }).where(eq(customers.id, customerId));
    }

    if (outcome === "emailed" || outcome === "sample_sent" || outcome === "quote_sent") {
      await db.update(customers).set({ lastOutboundEmailAt: new Date(), updatedAt: new Date() }).where(eq(customers.id, customerId));
    }

    if (nextFollowUpAt) {
      await db.insert(coachingMoments).values({
        customerId,
        assignedTo: userId,
        action: "follow_up_" + cardType,
        whyNow: `Follow up scheduled from NOW MODE ${cardType}`,
        priority: 50,
        scheduledFor: nextFollowUpAt,
        status: "pending",
        sourceType: "now_mode",
      });
    }

    const updatedSession = await this.getOrCreateSession(userId);
    return { success: true, session: updatedSession, nextFollowUpAt };
  }

  async skipCard(
    userId: string,
    customerId: string,
    cardType: string,
    skipReason: string,
    notes?: string
  ): Promise<{ success: boolean; session: NowModeSession; penaltyApplied: boolean }> {
    const session = await this.getOrCreateSession(userId);
    const bucket = CARD_TYPE_BUCKETS[cardType] || "data_hygiene";
    
    await db.insert(nowModeActivities).values({
      sessionId: session.id,
      userId,
      customerId,
      cardType,
      bucket,
      isHardCard: ["daily_call", "follow_up_call", "follow_up_quote"].includes(cardType),
      outcome: "skipped",
      outcomeNotes: notes,
      isSkip: true,
      skipReason,
      completedAt: new Date(),
    });

    const newSkips = (session.totalSkips || 0) + 1;
    const applyPenalty = newSkips >= SKIP_PENALTY_THRESHOLD;
    
    // Calculate new efficiency with updated skip count
    const updatedSessionData = { ...session, totalSkips: newSkips };
    const newEfficiency = this.calculateEfficiency(updatedSessionData as NowModeSession);

    await db.update(nowModeSessions).set({
      totalSkips: newSkips,
      skipPenaltyApplied: applyPenalty,
      efficiencyScore: newEfficiency,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(nowModeSessions.id, session.id));

    const updatedSession = await this.getOrCreateSession(userId);
    return { success: true, session: updatedSession, penaltyApplied: applyPenalty };
  }

  // Calculate efficiency based on earned points from actions
  private calculateEfficiency(session: NowModeSession): number {
    // Points earned from completed actions
    const callPoints = (session.callsCompleted || 0) * EFFICIENCY_POINTS.calls;
    const followUpPoints = (session.followUpsCompleted || 0) * EFFICIENCY_POINTS.follow_ups;
    const outreachPoints = (session.outreachCompleted || 0) * EFFICIENCY_POINTS.outreach;
    const dataHygienePoints = (session.dataHygieneCompleted || 0) * EFFICIENCY_POINTS.data_hygiene;
    const enablementPoints = (session.enablementCompleted || 0) * EFFICIENCY_POINTS.enablement;
    
    // Penalties
    const skipPenalty = (session.totalSkips || 0) * Math.abs(EFFICIENCY_POINTS.skip);
    const dormancyPenalty = (session.dormancyWarningsIgnored || 0) * Math.abs(EFFICIENCY_POINTS.dormancy_ignored);
    
    // Calculate total earned (can go negative from penalties)
    const totalEarned = callPoints + followUpPoints + outreachPoints + dataHygienePoints + enablementPoints;
    const totalPenalty = skipPenalty + dormancyPenalty;
    const rawScore = totalEarned - totalPenalty;
    
    // Cap at 0-100
    return Math.max(0, Math.min(100, rawScore));
  }

  // Calculate rolling 7-day weighted efficiency score
  async getRolling7DayEfficiency(userId: string): Promise<{ score: number; percentile: number; trend: string }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateKey = sevenDaysAgo.toISOString().split("T")[0];

    // Get user's sessions from last 7 days
    const userSessions = await db
      .select()
      .from(nowModeSessions)
      .where(and(
        eq(nowModeSessions.userId, userId),
        gte(nowModeSessions.dateKey, dateKey)
      ))
      .orderBy(desc(nowModeSessions.dateKey));

    // Calculate weighted average (recent days weigh more)
    const weights = [1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9]; // Today = 1.5x, 7 days ago = 0.9x
    let weightedSum = 0;
    let totalWeight = 0;
    
    userSessions.forEach((session, index) => {
      const weight = weights[Math.min(index, weights.length - 1)];
      const dailyScore = this.calculateEfficiency(session);
      weightedSum += dailyScore * weight;
      totalWeight += weight;
    });

    const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    // Calculate percentile compared to other reps
    const allRecentSessions = await db
      .select()
      .from(nowModeSessions)
      .where(gte(nowModeSessions.dateKey, dateKey));

    // Group by user and calculate their averages
    const userScores: Record<string, number[]> = {};
    for (const session of allRecentSessions) {
      if (!userScores[session.userId]) userScores[session.userId] = [];
      userScores[session.userId].push(this.calculateEfficiency(session));
    }

    const averages = Object.values(userScores).map(scores => 
      scores.reduce((a, b) => a + b, 0) / scores.length
    );
    
    const belowCount = averages.filter(avg => avg < score).length;
    const percentile = averages.length > 1 ? Math.round((belowCount / (averages.length - 1)) * 100) : 50;

    // Determine trend
    let trend = "steady";
    if (userSessions.length >= 2) {
      const recentAvg = userSessions.slice(0, 3).reduce((sum, s) => sum + this.calculateEfficiency(s), 0) / Math.min(3, userSessions.length);
      const olderAvg = userSessions.slice(3).reduce((sum, s) => sum + this.calculateEfficiency(s), 0) / Math.max(1, userSessions.length - 3);
      if (recentAvg > olderAvg + 5) trend = "improving";
      else if (recentAvg < olderAvg - 5) trend = "declining";
    }

    return { score, percentile, trend };
  }

  // Get yesterday's completion count for comparison
  async getYesterdayStats(userId: string): Promise<{ completed: number; efficiency: number }> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = yesterday.toISOString().split("T")[0];

    const [session] = await db
      .select()
      .from(nowModeSessions)
      .where(and(eq(nowModeSessions.userId, userId), eq(nowModeSessions.dateKey, dateKey)))
      .limit(1);

    return {
      completed: session?.totalCompleted || 0,
      efficiency: session ? this.calculateEfficiency(session) : 0,
    };
  }

  // Pause session intentionally - no penalty
  async pauseSession(userId: string): Promise<{ success: boolean; session: NowModeSession }> {
    const session = await this.getOrCreateSession(userId);
    
    await db.update(nowModeSessions).set({
      pausedIntentionally: true,
      pausedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(nowModeSessions.id, session.id));

    const updatedSession = await this.getOrCreateSession(userId);
    
    // Log pause event
    this.logEvent('now_session_paused', userId, {
      sessionId: session.id,
      efficiencyAfter: updatedSession.efficiencyScore || 0,
    });
    
    return { success: true, session: updatedSession };
  }

  // Resume from pause
  async resumeSession(userId: string): Promise<{ success: boolean; session: NowModeSession }> {
    const session = await this.getOrCreateSession(userId);
    
    await db.update(nowModeSessions).set({
      pausedIntentionally: false,
      pausedAt: null,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(nowModeSessions.id, session.id));

    const updatedSession = await this.getOrCreateSession(userId);
    
    // Log resume event
    this.logEvent('now_session_resumed', userId, {
      sessionId: session.id,
      efficiencyAfter: updatedSession.efficiencyScore || 0,
    });
    
    return { success: true, session: updatedSession };
  }

  // Record that user ignored dormancy warning
  async recordDormancyIgnored(userId: string): Promise<void> {
    const session = await this.getOrCreateSession(userId);
    
    const newEfficiency = this.calculateEfficiency({
      ...session,
      dormancyWarningsIgnored: (session.dormancyWarningsIgnored || 0) + 1,
    });
    
    await db.update(nowModeSessions).set({
      dormancyWarningsIgnored: (session.dormancyWarningsIgnored || 0) + 1,
      efficiencyScore: newEfficiency,
      updatedAt: new Date(),
    }).where(eq(nowModeSessions.id, session.id));
    
    // Log dormancy ignored event
    this.logEvent('now_session_idle_ignored', userId, {
      sessionId: session.id,
      efficiencyDelta: EFFICIENCY_POINTS.dormancy_ignored,
      efficiencyAfter: newEfficiency,
    });
  }
  
  // Record that user dismissed dormancy popup by taking action
  async recordDormancyDismissed(userId: string): Promise<void> {
    const session = await this.getOrCreateSession(userId);
    
    // Log dormancy dismissed event (took action)
    this.logEvent('now_session_idle_dismissed', userId, {
      sessionId: session.id,
      efficiencyAfter: session.efficiencyScore || 0,
    });
  }

  async checkDormancy(userId: string): Promise<{ isDormant: boolean; minutesSinceActivity: number; session: NowModeSession }> {
    const session = await this.getOrCreateSession(userId);
    
    if (!session.lastActivityAt) {
      return { isDormant: false, minutesSinceActivity: 0, session };
    }

    const now = new Date();
    const lastActivity = new Date(session.lastActivityAt);
    const minutesSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60));
    
    return {
      isDormant: minutesSinceActivity >= DORMANCY_MINUTES,
      minutesSinceActivity,
      session,
    };
  }

  async getAdminReport(dateKey?: string): Promise<any[]> {
    const targetDate = dateKey || this.getTodayKey();
    
    const sessions = await db
      .select({
        session: nowModeSessions,
        user: users,
      })
      .from(nowModeSessions)
      .leftJoin(users, eq(nowModeSessions.userId, users.id))
      .where(eq(nowModeSessions.dateKey, targetDate))
      .orderBy(desc(nowModeSessions.totalCompleted));

    const reports = await Promise.all(
      sessions.map(async ({ session, user }) => {
        const activities = await db
          .select()
          .from(nowModeActivities)
          .where(eq(nowModeActivities.sessionId, session.id));

        const outcomeBreakdown: Record<string, number> = {};
        activities.forEach((a) => {
          outcomeBreakdown[a.outcome] = (outcomeBreakdown[a.outcome] || 0) + 1;
        });

        const totalActions = activities.length;
        const skipRate = totalActions > 0 ? ((session.totalSkips || 0) / totalActions) * 100 : 0;

        return {
          userId: session.userId,
          userEmail: user?.email || "Unknown",
          userName: user?.username || "Unknown",
          dateKey: session.dateKey,
          completions: session.totalCompleted || 0,
          skips: session.totalSkips || 0,
          skipRate: Math.round(skipRate * 10) / 10,
          bucketBreakdown: {
            calls: session.callsCompleted || 0,
            follow_ups: session.followUpsCompleted || 0,
            outreach: session.outreachCompleted || 0,
            data_hygiene: session.dataHygieneCompleted || 0,
            enablement: session.enablementCompleted || 0,
          },
          outcomeBreakdown,
          efficiencyScore: session.efficiencyScore || 100,
          highValueOutcomes: session.highValueOutcomes || 0,
          firstActivityAt: activities.length > 0 ? activities[0].completedAt : null,
          lastActivityAt: session.lastActivityAt,
        };
      })
    );

    return reports;
  }

  async getEfficiencyScore(userId: string): Promise<number> {
    const session = await this.getOrCreateSession(userId);
    return session.efficiencyScore || 0;
  }

  // Get day recap for end-of-day closure - psychological completion
  async getDayRecap(userId: string): Promise<{
    isComplete: boolean;
    dayClosed: boolean;
    totalCompleted: number;
    dailyTarget: number;
    efficiencyScore: number;
    callsMade: number;
    followUpsScheduled: number;
    samplesQuotesSent: number;
    dataHygieneCompleted: number;
    outreachCompleted: number;
    enablementSent: number;
    timeSpent: string;
    motivationalMessage: string;
  }> {
    const session = await this.getOrCreateSession(userId);
    
    // Get today's activities to calculate samples/quotes sent
    const activities = await db
      .select()
      .from(nowModeActivities)
      .where(eq(nowModeActivities.sessionId, session.id));

    // Count samples/quotes sent from outcomes
    const samplesQuotesSent = activities.filter(a => 
      a.outcome === 'send_swatchbook' || 
      a.outcome === 'send_price_list' || 
      a.outcome === 'sample_sent' ||
      a.outcome === 'quote_sent' ||
      a.outcome?.includes('quote') ||
      a.outcome?.includes('sample')
    ).length;

    // Calculate time spent (from first to last activity)
    let timeSpent = "0 min";
    if (session.startedAt && session.lastActivityAt) {
      const start = new Date(session.startedAt);
      const end = new Date(session.lastActivityAt);
      const minutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
      if (minutes < 60) {
        timeSpent = `${minutes} min`;
      } else {
        const hours = Math.floor(minutes / 60);
        const remainingMins = minutes % 60;
        timeSpent = remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
      }
    }

    // Generate motivational message based on performance
    const efficiency = session.efficiencyScore || 0;
    const completed = session.totalCompleted || 0;
    const target = session.dailyTarget || 10;
    
    let motivationalMessage = "";
    if (completed >= target) {
      if (efficiency >= 80) {
        motivationalMessage = "Outstanding work today! You crushed it with high efficiency.";
      } else if (efficiency >= 50) {
        motivationalMessage = "Great job hitting your target! Tomorrow, aim for fewer skips.";
      } else {
        motivationalMessage = "You made it! Every day is a chance to build momentum.";
      }
    } else if (completed >= target * 0.8) {
      motivationalMessage = "Almost there! You're building great habits.";
    } else {
      motivationalMessage = "Progress, not perfection. Tomorrow is a new day.";
    }

    return {
      isComplete: completed >= target,
      dayClosed: session.dayClosed || false,
      totalCompleted: completed,
      dailyTarget: target,
      efficiencyScore: efficiency,
      callsMade: session.callsCompleted || 0,
      followUpsScheduled: session.followUpsCompleted || 0,
      samplesQuotesSent,
      dataHygieneCompleted: session.dataHygieneCompleted || 0,
      outreachCompleted: session.outreachCompleted || 0,
      enablementSent: session.enablementCompleted || 0,
      timeSpent,
      motivationalMessage,
    };
  }

  // End the day - formal closure with psychological completion
  async endDay(userId: string): Promise<{ success: boolean; message: string }> {
    const session = await this.getOrCreateSession(userId);
    
    if (session.dayClosed) {
      return { success: true, message: "Day already closed. See you tomorrow!" };
    }

    // Get recap to snapshot
    const recap = await this.getDayRecap(userId);
    
    // Update session with closure
    await db.update(nowModeSessions).set({
      dayClosed: true,
      endedAt: new Date(),
      recapSnapshot: JSON.stringify(recap),
      updatedAt: new Date(),
    }).where(eq(nowModeSessions.id, session.id));

    // Log day closed event
    this.logEvent('now_session_day_closed', userId, {
      sessionId: session.id,
      efficiencyAfter: recap.efficiencyScore,
      metadata: {
        totalCompleted: recap.totalCompleted,
        dailyTarget: recap.dailyTarget,
        isComplete: recap.isComplete,
      },
    });

    return { 
      success: true, 
      message: recap.isComplete 
        ? "Day complete! Great work. Rest up for tomorrow."
        : "Day ended. Every bit of progress counts. See you tomorrow!"
    };
  }
  
  // Log when a card is served to a rep (called from routes)
  async logCardServed(
    userId: string, 
    customerId: string, 
    cardType: string, 
    bucket: string
  ): Promise<void> {
    const session = await this.getOrCreateSession(userId);
    this.logEvent('now_card_served', userId, {
      sessionId: session.id,
      customerId,
      taskType: bucket,
      bucket,
      efficiencyAfter: session.efficiencyScore || 0,
      metadata: { cardType },
    });
  }
  
  // Log when an action is completed (called from routes)
  async logActionCompleted(
    userId: string,
    customerId: string,
    bucket: string,
    outcome: string,
    timeToActionSeconds: number,
    efficiencyDelta: number,
    newEfficiency: number
  ): Promise<void> {
    const session = await this.getOrCreateSession(userId);
    this.logEvent('now_action_completed', userId, {
      sessionId: session.id,
      customerId,
      taskType: bucket,
      bucket,
      outcome,
      timeToActionSeconds,
      efficiencyDelta,
      efficiencyAfter: newEfficiency,
    });
  }
  
  // Log when an action is skipped (called from routes)
  async logActionSkipped(
    userId: string,
    customerId: string,
    bucket: string,
    skipReason: string,
    efficiencyDelta: number,
    newEfficiency: number
  ): Promise<void> {
    const session = await this.getOrCreateSession(userId);
    this.logEvent('now_action_skipped', userId, {
      sessionId: session.id,
      customerId,
      taskType: bucket,
      bucket,
      skipReason,
      efficiencyDelta,
      efficiencyAfter: newEfficiency,
    });
  }
  
  // Log dormancy popup shown
  async logDormancyPopupShown(userId: string): Promise<void> {
    const session = await this.getOrCreateSession(userId);
    this.logEvent('now_session_idle_popup_shown', userId, {
      sessionId: session.id,
      efficiencyAfter: session.efficiencyScore || 0,
    });
  }

  // Admin Summary - brutally simple metrics
  async getAdminSummary(days: number = 7): Promise<{
    avgTasksPerRepPerDay: number;
    skipRate: number;
    avgTimeToFirstAction: string;
    conversionByTaskType: Record<string, { total: number; converted: number; rate: number }>;
    repCount: number;
    totalSessions: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateKey = startDate.toISOString().split('T')[0];

    // Get all sessions in date range
    const sessions = await db
      .select()
      .from(nowModeSessions)
      .where(gte(nowModeSessions.dateKey, startDateKey));

    if (sessions.length === 0) {
      return {
        avgTasksPerRepPerDay: 0,
        skipRate: 0,
        avgTimeToFirstAction: "N/A",
        conversionByTaskType: {},
        repCount: 0,
        totalSessions: 0,
      };
    }

    // Get all activities for conversion rates
    const sessionIds = sessions.map(s => s.id);
    const activities = await db
      .select()
      .from(nowModeActivities)
      .where(sql`${nowModeActivities.sessionId} = ANY(${sessionIds})`);

    // Calculate metrics - group by user+date for accurate averages
    const userDays = new Map<string, { totalCompleted: number; totalSkips: number }>();
    for (const session of sessions) {
      const key = `${session.userId}-${session.dateKey}`;
      if (!userDays.has(key)) {
        userDays.set(key, { totalCompleted: 0, totalSkips: 0 });
      }
      const ud = userDays.get(key)!;
      ud.totalCompleted += session.totalCompleted || 0;
      ud.totalSkips += session.totalSkips || 0;
    }
    
    const uniqueReps = new Set(sessions.map(s => s.userId));
    const totalCompleted = sessions.reduce((sum, s) => sum + (s.totalCompleted || 0), 0);
    const totalSkips = sessions.reduce((sum, s) => sum + (s.totalSkips || 0), 0);
    const totalActions = totalCompleted + totalSkips;

    // Avg tasks per rep per day (using user-day pairs for accurate calculation)
    const avgTasksPerRepPerDay = userDays.size > 0 
      ? Math.round((totalCompleted / userDays.size) * 10) / 10 
      : 0;

    // Skip rate
    const skipRate = totalActions > 0 
      ? Math.round((totalSkips / totalActions) * 1000) / 10 
      : 0;

    // Time to first action (from session start to first activity)
    let totalMinutesToFirst = 0;
    let sessionsWithActivity = 0;
    for (const session of sessions) {
      const firstActivity = activities.find(a => a.sessionId === session.id);
      if (firstActivity && session.startedAt && firstActivity.completedAt) {
        const start = new Date(session.startedAt);
        const first = new Date(firstActivity.completedAt);
        const minutes = Math.floor((first.getTime() - start.getTime()) / (1000 * 60));
        if (minutes >= 0 && minutes < 120) { // Ignore outliers > 2 hours
          totalMinutesToFirst += minutes;
          sessionsWithActivity++;
        }
      }
    }
    const avgMinutes = sessionsWithActivity > 0 
      ? Math.round(totalMinutesToFirst / sessionsWithActivity) 
      : 0;
    const avgTimeToFirstAction = avgMinutes > 0 ? `${avgMinutes} min` : "N/A";

    // Conversion by task type (exclude skips from totals for accurate conversion rates)
    const conversionByTaskType: Record<string, { total: number; converted: number; rate: number }> = {};
    const highValueOutcomes = ['call_connected', 'voicemail_left', 'follow_up_scheduled', 'quote_sent', 'sample_sent', 'send_swatchbook', 'send_price_list'];
    const skipOutcomes = ['skip', 'skipped'];
    
    for (const activity of activities) {
      // Skip outcomes don't count toward conversion totals
      if (skipOutcomes.includes(activity.outcome?.toLowerCase() || '')) continue;
      
      const bucket = activity.bucket || 'unknown';
      if (!conversionByTaskType[bucket]) {
        conversionByTaskType[bucket] = { total: 0, converted: 0, rate: 0 };
      }
      conversionByTaskType[bucket].total++;
      if (highValueOutcomes.includes(activity.outcome)) {
        conversionByTaskType[bucket].converted++;
      }
    }
    
    for (const bucket in conversionByTaskType) {
      const data = conversionByTaskType[bucket];
      data.rate = data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0;
    }

    return {
      avgTasksPerRepPerDay,
      skipRate,
      avgTimeToFirstAction,
      conversionByTaskType,
      repCount: uniqueReps.size,
      totalSessions: sessions.length,
    };
  }

  // Red Flag Report - patterns that need attention
  async getRedFlags(days: number = 7): Promise<{
    highActivityLowOutcome: Array<{ userId: string; email: string; avgTasks: number; conversionRate: number; recommendation: string }>;
    lowActivity: Array<{ userId: string; email: string; avgTasks: number; daysActive: number; recommendation: string }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateKey = startDate.toISOString().split('T')[0];

    // Get all sessions with user info
    const sessionsWithUsers = await db
      .select({
        session: nowModeSessions,
        user: users,
      })
      .from(nowModeSessions)
      .leftJoin(users, eq(nowModeSessions.userId, users.id))
      .where(gte(nowModeSessions.dateKey, startDateKey));

    // Group by user
    const userStats: Record<string, {
      email: string;
      totalCompleted: number;
      totalSkips: number;
      daysActive: number;
      sessionIds: number[];
    }> = {};

    for (const { session, user } of sessionsWithUsers) {
      const userId = session.userId;
      if (!userStats[userId]) {
        userStats[userId] = {
          email: user?.email || 'Unknown',
          totalCompleted: 0,
          totalSkips: 0,
          daysActive: 0,
          sessionIds: [],
        };
      }
      userStats[userId].totalCompleted += session.totalCompleted || 0;
      userStats[userId].totalSkips += session.totalSkips || 0;
      userStats[userId].daysActive++;
      userStats[userId].sessionIds.push(session.id);
    }

    // Get activities for conversion calculation
    const allSessionIds = sessionsWithUsers.map(s => s.session.id);
    const activities = allSessionIds.length > 0 
      ? await db.select().from(nowModeActivities).where(sql`${nowModeActivities.sessionId} = ANY(${allSessionIds})`)
      : [];

    const highValueOutcomes = ['call_connected', 'voicemail_left', 'follow_up_scheduled', 'quote_sent', 'sample_sent', 'send_swatchbook', 'send_price_list'];

    // Calculate per-user conversion (exclude skips for accurate rates)
    const userConversions: Record<string, { total: number; converted: number }> = {};
    const skipOutcomes = ['skip', 'skipped'];
    
    for (const activity of activities) {
      // Skip outcomes don't count toward conversion
      if (skipOutcomes.includes(activity.outcome?.toLowerCase() || '')) continue;
      
      const session = sessionsWithUsers.find(s => s.session.id === activity.sessionId);
      if (!session) continue;
      const userId = session.session.userId;
      if (!userConversions[userId]) {
        userConversions[userId] = { total: 0, converted: 0 };
      }
      userConversions[userId].total++;
      if (highValueOutcomes.includes(activity.outcome)) {
        userConversions[userId].converted++;
      }
    }

    // Thresholds
    const HIGH_ACTIVITY_THRESHOLD = DAILY_TARGET * 0.8; // 80% of target = 8 tasks/day
    const LOW_OUTCOME_THRESHOLD = 20; // <20% conversion
    const LOW_ACTIVITY_THRESHOLD = DAILY_TARGET * 0.4; // <40% of target = 4 tasks/day

    const highActivityLowOutcome: Array<{ userId: string; email: string; avgTasks: number; conversionRate: number; recommendation: string }> = [];
    const lowActivity: Array<{ userId: string; email: string; avgTasks: number; daysActive: number; recommendation: string }> = [];

    for (const [userId, stats] of Object.entries(userStats)) {
      const avgTasks = stats.daysActive > 0 ? Math.round((stats.totalCompleted / stats.daysActive) * 10) / 10 : 0;
      const conversion = userConversions[userId] || { total: 0, converted: 0 };
      const conversionRate = conversion.total > 0 ? Math.round((conversion.converted / conversion.total) * 100) : 0;

      // High activity but low outcomes
      if (avgTasks >= HIGH_ACTIVITY_THRESHOLD && conversionRate < LOW_OUTCOME_THRESHOLD) {
        highActivityLowOutcome.push({
          userId,
          email: stats.email,
          avgTasks,
          conversionRate,
          recommendation: "Coaching needed: high effort but low conversion. Review call scripts and objection handling.",
        });
      }

      // Low activity
      if (avgTasks < LOW_ACTIVITY_THRESHOLD && stats.daysActive >= 2) {
        lowActivity.push({
          userId,
          email: stats.email,
          avgTasks,
          daysActive: stats.daysActive,
          recommendation: "Workflow issue: not engaging with NOW MODE. Check for blockers or training gaps.",
        });
      }
    }

    return { highActivityLowOutcome, lowActivity };
  }

  // Debug endpoint - explains card selection reasoning (admin only)
  async getDebugInfo(userId: string): Promise<{
    selectionReasoning: {
      targetBucket: string | null;
      bucketProgress: BucketProgress[];
      rulesFired: string[];
      selectedCard: any | null;
    };
    exclusions: {
      totalCustomers: number;
      excludedDNC: number;
      excludedPaused: number;
      excludedNoRep: number;
      excludedNoEmail: number;
      excludedRecent: number;
      available: number;
    };
    sessionState: any;
  }> {
    const session = await this.getOrCreateSession(userId);
    const bucketProgress = this.getBucketProgress(session);
    const targetBucket = this.getNextBucket(session);
    
    // Track rules that fired for bucket selection
    const rulesFired: string[] = [];
    const unfilled = bucketProgress.filter(p => p.remaining > 0);
    
    if (unfilled.length === 0) {
      rulesFired.push("ALL_BUCKETS_FILLED: No remaining quota in any bucket");
    } else {
      const totalCompleted = session.totalCompleted || 0;
      const lastBucket = (session as any).lastBucket as string | null;
      const callsInFirstFive = (session as any).callsInFirstFive || 0;
      
      if (totalCompleted >= 8) {
        rulesFired.push("RULE_3_EASY_FINISH: Last 2 cards should be easy wins (data_hygiene/enablement)");
      }
      if (lastBucket) {
        rulesFired.push(`RULE_1_NO_REPEAT: Avoiding same bucket '${lastBucket}' twice in a row`);
      }
      if (totalCompleted < 5 && callsInFirstFive >= 2) {
        rulesFired.push("RULE_2_CALL_LIMIT: Max 2 calls in first 5 cards reached");
      }
      rulesFired.push(`PRIORITY_ORDER: data_hygiene > follow_ups > outreach > calls > enablement`);
    }
    
    // Get exclusion counts
    const now = new Date();
    const allCustomers = await db
      .select({ 
        id: customers.id,
        doNotContact: customers.doNotContact,
        pausedUntil: customers.pausedUntil,
        salesRepId: customers.salesRepId,
        email: customers.email,
      })
      .from(customers)
      .limit(1000);
    
    const recentActivities = await db
      .select({ customerId: nowModeActivities.customerId })
      .from(nowModeActivities)
      .where(eq(nowModeActivities.sessionId, session.id))
      .limit(50);
    const recentIds = new Set(recentActivities.map(a => a.customerId));
    
    let excludedDNC = 0, excludedPaused = 0, excludedNoRep = 0, excludedNoEmail = 0, excludedRecent = 0;
    
    for (const c of allCustomers) {
      if (c.doNotContact) excludedDNC++;
      else if (c.pausedUntil && new Date(c.pausedUntil) > now) excludedPaused++;
      else if (!c.salesRepId && c.salesRepId !== userId) { /* counted below */ }
      if (!c.email) excludedNoEmail++;
      if (recentIds.has(c.id)) excludedRecent++;
    }
    
    // Get the actual card that would be selected
    const { card } = await this.getEligibleCard(userId);
    
    return {
      selectionReasoning: {
        targetBucket,
        bucketProgress,
        rulesFired,
        selectedCard: card ? {
          customerId: card.customerId,
          customerName: card.customer.company || `${card.customer.firstName} ${card.customer.lastName}`,
          cardType: card.cardType,
          bucket: card.bucket,
          whyNow: card.whyNow,
          isHardCard: card.isHardCard,
        } : null,
      },
      exclusions: {
        totalCustomers: allCustomers.length,
        excludedDNC,
        excludedPaused,
        excludedNoRep,
        excludedNoEmail,
        excludedRecent,
        available: allCustomers.length - excludedDNC - excludedPaused - excludedRecent,
      },
      sessionState: {
        dateKey: session.dateKey,
        totalCompleted: session.totalCompleted,
        totalSkips: session.totalSkips,
        efficiencyScore: session.efficiencyScore,
        skipPenaltyApplied: session.skipPenaltyApplied,
        lastActivityAt: session.lastActivityAt,
      },
    };
  }

  // Per-rep admin stats for dashboard
  async getPerRepStats(): Promise<Array<{
    userId: string;
    email: string;
    completedToday: number;
    skippedToday: number;
    avgTimePerCard: number;
    streak: number;
    efficiencyScore: number;
  }>> {
    const today = this.getTodayKey();
    
    // Get today's sessions with user info
    const todaySessions = await db
      .select({
        session: nowModeSessions,
        user: users,
      })
      .from(nowModeSessions)
      .leftJoin(users, eq(nowModeSessions.userId, users.id))
      .where(eq(nowModeSessions.dateKey, today));
    
    // Get time-to-action from events
    const userIds = todaySessions.map(s => s.session.userId);
    const todayEvents = userIds.length > 0 
      ? await db
          .select()
          .from(nowModeEvents)
          .where(and(
            sql`${nowModeEvents.userId} = ANY(${userIds})`,
            sql`DATE(${nowModeEvents.createdAt}) = ${today}`
          ))
      : [];
    
    // Calculate streaks - consecutive days hitting target (10+)
    const streaks = await this.calculateStreaks(userIds);
    
    // Build per-rep stats
    const repStats: Array<{
      userId: string;
      email: string;
      completedToday: number;
      skippedToday: number;
      avgTimePerCard: number;
      streak: number;
      efficiencyScore: number;
    }> = [];
    
    for (const { session, user } of todaySessions) {
      const userEvents = todayEvents.filter(e => 
        e.userId === session.userId && 
        e.eventType === 'now_action_completed' && 
        e.timeToActionSeconds
      );
      
      const avgTime = userEvents.length > 0
        ? Math.round(userEvents.reduce((sum, e) => sum + (e.timeToActionSeconds || 0), 0) / userEvents.length)
        : 0;
      
      repStats.push({
        userId: session.userId,
        email: user?.email || 'Unknown',
        completedToday: session.totalCompleted || 0,
        skippedToday: session.totalSkips || 0,
        avgTimePerCard: avgTime,
        streak: streaks[session.userId] || 0,
        efficiencyScore: session.efficiencyScore || 0,
      });
    }
    
    return repStats.sort((a, b) => b.completedToday - a.completedToday);
  }

  // Calculate consecutive day streaks (10+ completions)
  private async calculateStreaks(userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};
    
    const streaks: Record<string, number> = {};
    const TARGET_FOR_STREAK = 10;
    
    // Get last 30 days of sessions for each user
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDateKey = thirtyDaysAgo.toISOString().split('T')[0];
    
    const recentSessions = await db
      .select()
      .from(nowModeSessions)
      .where(and(
        sql`${nowModeSessions.userId} = ANY(${userIds})`,
        gte(nowModeSessions.dateKey, startDateKey)
      ))
      .orderBy(desc(nowModeSessions.dateKey));
    
    // Group by user
    const userSessions: Record<string, typeof recentSessions> = {};
    for (const session of recentSessions) {
      if (!userSessions[session.userId]) {
        userSessions[session.userId] = [];
      }
      userSessions[session.userId].push(session);
    }
    
    // Calculate streak for each user
    for (const userId of userIds) {
      const sessions = userSessions[userId] || [];
      let streak = 0;
      let lastDate: Date | null = null;
      
      for (const session of sessions) {
        const sessionDate = new Date(session.dateKey);
        const meetsTarget = (session.totalCompleted || 0) >= TARGET_FOR_STREAK;
        
        if (!meetsTarget) break;
        
        if (lastDate === null) {
          streak = 1;
        } else {
          // Check if consecutive day
          const dayDiff = Math.floor((lastDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
          if (dayDiff === 1) {
            streak++;
          } else {
            break;
          }
        }
        lastDate = sessionDate;
      }
      
      streaks[userId] = streak;
    }
    
    return streaks;
  }
}

export const nowModeEngine = new NowModeEngine();
