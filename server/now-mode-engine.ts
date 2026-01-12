import { db } from "./db";
import { 
  customers, 
  users,
  nowModeSessions, 
  nowModeActivities,
  nowModeAdminReports,
  customerActivityEvents,
  customerJourney,
  coachingMoments,
  NOW_MODE_BUCKETS,
  BUCKET_QUOTAS,
  CARD_TYPE_BUCKETS,
  HIGH_VALUE_OUTCOMES,
  type NowModeBucket,
  type CardOutcome,
  type NowModeSession,
  type InsertNowModeActivity,
} from "@shared/schema";
import { eq, and, or, isNull, lt, gt, desc, sql, ne, lte } from "drizzle-orm";

const DAILY_TARGET = 10;
const SKIP_PENALTY_THRESHOLD = 3;
const DORMANCY_MINUTES = 90;

interface Customer {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  salesRepId: string | null;
  salesRepName: string | null;
  pricingTier: string | null;
  lastOutboundEmailAt: Date | null;
  swatchbookSentAt: Date | null;
  pressTestSentAt: Date | null;
  priceListSentAt: Date | null;
  doNotContact: boolean | null;
  pausedUntil: Date | null;
}

interface EligibleCard {
  customerId: string;
  customer: Customer;
  cardType: string;
  bucket: NowModeBucket;
  whyNow: string;
  isHardCard: boolean;
  outcomeButtons: OutcomeButton[];
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
        efficiencyScore: 100,
        highValueOutcomes: 0,
        lastActivityAt: new Date(),
        startedAt: new Date(),
      })
      .returning();
    
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

    // Prioritize order: follow_ups > outreach > calls > enablement > data_hygiene
    const priorityOrder: NowModeBucket[] = ["follow_ups", "outreach", "calls", "enablement", "data_hygiene"];
    for (const bucket of priorityOrder) {
      const match = candidates.find(p => p.bucket === bucket);
      if (match) return match.bucket;
    }

    return candidates[0]?.bucket || null;
  }

  async getEligibleCard(userId: string): Promise<{ card: EligibleCard | null; session: NowModeSession; allDone: boolean }> {
    const session = await this.getOrCreateSession(userId);
    
    if ((session.totalCompleted || 0) >= DAILY_TARGET) {
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
    if (!targetBucket) {
      return { card: null, session, allDone: true };
    }

    const skipPenalty = session.skipPenaltyApplied || false;
    
    const card = await this.findCardForBucket(userId, targetBucket, recentCustomerIds, skipPenalty);
    
    if (card) {
      return { card, session, allDone: false };
    }

    for (const bucket of NOW_MODE_BUCKETS) {
      if (bucket === targetBucket) continue;
      const spilloverCard = await this.findCardForBucket(userId, bucket, recentCustomerIds, skipPenalty);
      if (spilloverCard) {
        return { card: spilloverCard, session, allDone: false };
      }
    }

    return { card: null, session, allDone: true };
  }

  private async findCardForBucket(
    userId: string,
    bucket: NowModeBucket,
    excludeCustomerIds: string[],
    skipHardCards: boolean
  ): Promise<EligibleCard | null> {
    const eligibleCustomers = await this.getEligibleCustomers(userId, excludeCustomerIds);
    
    for (const customer of eligibleCustomers) {
      const cardType = this.matchCardType(customer, bucket, skipHardCards);
      if (cardType) {
        return this.buildCard(customer, cardType, bucket);
      }
    }
    
    return null;
  }

  private async getEligibleCustomers(userId: string, excludeIds: string[]): Promise<Customer[]> {
    const now = new Date();
    
    let query = db
      .select()
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

    const result = await query;
    return result.filter((c) => !excludeIds.includes(c.id));
  }

  private matchCardType(customer: Customer, bucket: NowModeBucket, skipHardCards: boolean): string | null {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    switch (bucket) {
      case "data_hygiene":
        if (!customer.pricingTier) return "set_pricing_tier";
        if (!customer.salesRepId) return "set_sales_rep";
        if (!customer.email) return "set_primary_email";
        return null;

      case "calls":
        if (skipHardCards) return null;
        if (!customer.lastOutboundEmailAt || customer.lastOutboundEmailAt < thirtyDaysAgo) {
          return "daily_call";
        }
        return "daily_call";

      case "outreach":
        if (!customer.swatchbookSentAt) return "send_swatchbook";
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

  private buildCard(customer: Customer, cardType: string, bucket: NowModeBucket): EligibleCard {
    const isHardCard = ["daily_call", "follow_up_call", "follow_up_quote"].includes(cardType);
    
    return {
      customerId: customer.id,
      customer,
      cardType,
      bucket,
      whyNow: this.getWhyNow(customer, cardType),
      isHardCard,
      outcomeButtons: this.getOutcomeButtons(cardType),
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
      case "set_primary_email":
        return `Why now: ${name} has no email on file. Email outreach drives 3x more quote requests than cold calls.`;
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
      default:
        return `Why now: Action needed for ${name}.`;
    }
  }

  private getOutcomeButtons(cardType: string): OutcomeButton[] {
    switch (cardType) {
      case "set_pricing_tier":
        return [
          { outcome: "data_updated", label: "Updated", icon: "check", color: "green", assistText: "Check order history to determine appropriate tier level." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];
      case "set_sales_rep":
        return [
          { outcome: "data_updated", label: "Updated", icon: "check", color: "green", assistText: "Assign based on territory or product specialty." },
          { outcome: "marked_dnc", label: "Bad Fit / DNC", icon: "user-x", color: "red", assistText: "Mark if customer is not a good fit for our products." },
        ];
      case "set_primary_email":
        return [
          { outcome: "data_updated", label: "Updated", icon: "check", color: "green", assistText: "Find email on their website or ask during next call." },
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
    const newEfficiency = this.calculateEfficiency(newCompleted, session.totalSkips || 0, newHighValue);

    const updateData: Record<string, any> = {
      totalCompleted: newCompleted,
      highValueOutcomes: newHighValue,
      efficiencyScore: newEfficiency,
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
    }

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
    const newEfficiency = this.calculateEfficiency(session.totalCompleted || 0, newSkips, session.highValueOutcomes || 0);

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

  private calculateEfficiency(completed: number, skips: number, highValueOutcomes: number): number {
    let score = 100;
    
    const completionRatio = completed / DAILY_TARGET;
    score = Math.min(100, 50 + (completionRatio * 50));
    
    score += highValueOutcomes * 5;
    
    if (skips > 2) {
      score -= (skips - 2) * 10;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
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
    return session.efficiencyScore || 100;
  }
}

export const nowModeEngine = new NowModeEngine();
