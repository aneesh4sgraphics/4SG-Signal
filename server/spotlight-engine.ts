import { db } from "./db";
import { customers, followUpTasks, users, customerActivityEvents, spotlightEvents } from "@shared/schema";
import { eq, and, isNull, or, ne, sql, desc, asc, lt, lte, gte, isNotNull, inArray, notInArray } from "drizzle-orm";

export type TaskBucket = 'calls' | 'follow_ups' | 'outreach' | 'data_hygiene' | 'enablement';

export interface BucketQuota {
  bucket: TaskBucket;
  target: number;
  completed: number;
  skipped: number;
}

export interface SpotlightTask {
  id: string;
  customerId: string;
  bucket: TaskBucket;
  taskSubtype: string;
  priority: number;
  whyNow: string;
  outcomes: TaskOutcome[];
  customer: {
    id: string;
    company: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
    website: string | null;
    salesRepId: string | null;
    salesRepName: string | null;
    pricingTier: string | null;
  };
  context?: {
    followUpId?: number;
    followUpTitle?: string;
    followUpDueDate?: string;
    lastContact?: string;
  };
}

export interface TaskOutcome {
  id: string;
  label: string;
  icon?: string;
  nextAction?: {
    type: 'schedule_follow_up' | 'send_email' | 'mark_complete' | 'no_action' | 'mark_dnc';
    daysUntil?: number;
    taskType?: string;
  };
}

export interface SpotlightSession {
  userId: string;
  date: string;
  buckets: BucketQuota[];
  totalTarget: number;
  totalCompleted: number;
  skippedCustomerIds: string[];
  lastTaskAt: Date | null;
  dayComplete: boolean;
  isPaused: boolean;
  pausedAt: Date | null;
  cardsBeforePause: number;
  lastActivityAt: Date | null;
  efficiencyScore: number;
  currentStreak: number;
}

const DAILY_QUOTAS: Record<TaskBucket, number> = {
  calls: 2,
  follow_ups: 3,
  outreach: 10,
  data_hygiene: 10,
  enablement: 5,
};

const TOTAL_DAILY_QUOTA = Object.values(DAILY_QUOTAS).reduce((a, b) => a + b, 0);

const TASK_OUTCOMES: Record<string, TaskOutcome[]> = {
  hygiene_sales_rep: [
    { id: 'assigned', label: 'Assign to Me', icon: 'user-check', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Not My Territory', icon: 'x', nextAction: { type: 'no_action' } },
  ],
  hygiene_pricing_tier: [
    { id: 'retail', label: 'Retail', icon: 'tag', nextAction: { type: 'mark_complete' } },
    { id: 'wholesale', label: 'Wholesale', icon: 'building', nextAction: { type: 'mark_complete' } },
    { id: 'distributor', label: 'Distributor', icon: 'truck', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Need More Info', icon: 'help-circle', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'research' } },
  ],
  hygiene_email: [
    { id: 'found', label: 'Email Found', icon: 'mail', nextAction: { type: 'mark_complete' } },
    { id: 'no_email', label: 'No Email Available', icon: 'x', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  hygiene_name: [
    { id: 'found', label: 'Name Added', icon: 'user', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  hygiene_company: [
    { id: 'found', label: 'Company Added', icon: 'building', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  hygiene_phone: [
    { id: 'found', label: 'Phone Added', icon: 'phone', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  sales_call: [
    { id: 'connected', label: 'Connected', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'follow_up' } },
    { id: 'voicemail', label: 'Left Voicemail', icon: 'voicemail', nextAction: { type: 'schedule_follow_up', daysUntil: 2, taskType: 'call' } },
    { id: 'no_answer', label: 'No Answer', icon: 'phone-missed', nextAction: { type: 'schedule_follow_up', daysUntil: 1, taskType: 'call' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
  ],
  sales_follow_up: [
    { id: 'completed', label: 'Done', icon: 'check', nextAction: { type: 'mark_complete' } },
    { id: 'rescheduled', label: 'Reschedule +3 Days', icon: 'calendar', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'not_interested', label: 'Not Interested', icon: 'x', nextAction: { type: 'mark_complete' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
  ],
  sales_quote_follow_up: [
    { id: 'completed', label: 'Got Response', icon: 'check', nextAction: { type: 'mark_complete' } },
    { id: 'rescheduled', label: 'Follow Up Again +3 Days', icon: 'calendar', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'quote_follow_up' } },
    { id: 'lost', label: 'Lost / No Interest', icon: 'x', nextAction: { type: 'mark_complete' } },
  ],
  outreach_no_contact: [
    { id: 'email_sent', label: 'Sent Email', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 5, taskType: 'follow_up' } },
    { id: 'called', label: 'Called', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
    { id: 'skip', label: 'Skip for Now', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  outreach_drip: [
    { id: 'sent', label: 'Email Sent', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'follow_up' } },
    { id: 'already_engaged', label: 'Already Engaged', icon: 'check', nextAction: { type: 'mark_complete' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
    { id: 'skip', label: 'Not Now', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  enablement_swatchbook: [
    { id: 'sent', label: 'Sent SwatchBook', icon: 'package', nextAction: { type: 'schedule_follow_up', daysUntil: 10, taskType: 'follow_up' } },
    { id: 'not_ready', label: 'Not Ready', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 14, taskType: 'outreach' } },
    { id: 'already_has', label: 'Already Has One', icon: 'check', nextAction: { type: 'mark_complete' } },
  ],
  enablement_press_test: [
    { id: 'sent', label: 'Sent Press Test', icon: 'package', nextAction: { type: 'schedule_follow_up', daysUntil: 10, taskType: 'follow_up' } },
    { id: 'not_ready', label: 'Not Ready', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 14, taskType: 'outreach' } },
    { id: 'skip', label: 'Skip', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  enablement_price_list: [
    { id: 'sent', label: 'Sent Price List', icon: 'file-text', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'follow_up' } },
    { id: 'not_ready', label: 'Not Ready Yet', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'outreach' } },
  ],
};

const BUCKET_LABELS: Record<TaskBucket, string> = {
  calls: 'Call',
  follow_ups: 'Follow-up',
  outreach: 'Outreach',
  data_hygiene: 'Data Hygiene',
  enablement: 'Enablement',
};

function bucketInfo(bucket: TaskBucket): string {
  return BUCKET_LABELS[bucket] || bucket;
}

const WHY_NOW_MESSAGES: Record<string, string> = {
  hygiene_sales_rep: 'This customer has no assigned sales rep - claim them now!',
  hygiene_pricing_tier: 'Set the pricing tier so quotes are accurate.',
  hygiene_email: 'Missing primary email - essential for follow-ups.',
  hygiene_name: 'Add the contact name for personalized outreach.',
  hygiene_company: 'Company name is missing - add it for better organization.',
  hygiene_phone: 'No phone number on file - add it for call outreach.',
  sales_call: 'Time for a call - build the relationship!',
  sales_follow_up: 'Follow-up is due - keep the momentum going.',
  sales_quote_follow_up: 'Quote sent but no response - time to check in.',
  outreach_no_contact: 'No recent contact - reach out before they forget you.',
  outreach_drip: 'Send a nurture email to stay top of mind.',
  enablement_swatchbook: 'Send a SwatchBook to showcase your products.',
  enablement_press_test: 'Send a Press Test Kit to demonstrate quality.',
  enablement_price_list: 'They have samples - now send the price list!',
};

interface DataReadiness {
  callsReady: number;
  outreachReady: number;
  hygieneNeeded: number;
  totalCustomers: number;
}

class SpotlightEngine {
  private sessions: Map<string, SpotlightSession> = new Map();
  private streakCache: Map<string, { streak: number; lastChecked: string }> = new Map();
  private readinessCache: Map<string, { data: DataReadiness; checkedAt: Date }> = new Map();

  private getTodayKey(): string {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 18) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    return now.toISOString().split('T')[0];
  }

  private async calculateDataReadiness(userId: string): Promise<DataReadiness> {
    const cacheKey = `${userId}_${this.getTodayKey()}`;
    const cached = this.readinessCache.get(cacheKey);
    if (cached && (Date.now() - cached.checkedAt.getTime()) < 30 * 60 * 1000) {
      return cached.data;
    }

    try {
      const result = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE phone IS NOT NULL AND do_not_contact = false 
            AND (sales_rep_id IS NULL OR sales_rep_id = ${userId})) as calls_ready,
          COUNT(*) FILTER (WHERE email IS NOT NULL AND pricing_tier IS NOT NULL AND do_not_contact = false
            AND (sales_rep_id IS NULL OR sales_rep_id = ${userId})) as outreach_ready,
          COUNT(*) FILTER (WHERE (phone IS NULL OR pricing_tier IS NULL OR email IS NULL OR sales_rep_id IS NULL)
            AND do_not_contact = false) as hygiene_needed,
          COUNT(*) as total_customers
        FROM customers
      `);
      
      const data: DataReadiness = {
        callsReady: Number(result.rows[0]?.calls_ready || 0),
        outreachReady: Number(result.rows[0]?.outreach_ready || 0),
        hygieneNeeded: Number(result.rows[0]?.hygiene_needed || 0),
        totalCustomers: Number(result.rows[0]?.total_customers || 0),
      };
      
      this.readinessCache.set(cacheKey, { data, checkedAt: new Date() });
      return data;
    } catch (e) {
      console.error('[Spotlight] Error calculating data readiness:', e);
      return { callsReady: 100, outreachReady: 100, hygieneNeeded: 0, totalCustomers: 0 };
    }
  }

  private calculateAdaptiveQuotas(readiness: DataReadiness): Record<TaskBucket, number> {
    const quotas = { ...DAILY_QUOTAS };
    let hygieneBonus = 0;

    if (readiness.callsReady < DAILY_QUOTAS.calls * 3) {
      const deficit = DAILY_QUOTAS.calls;
      quotas.calls = Math.min(quotas.calls, Math.max(0, readiness.callsReady));
      hygieneBonus += deficit - quotas.calls;
    }

    if (readiness.outreachReady < DAILY_QUOTAS.outreach * 2) {
      const deficit = Math.min(DAILY_QUOTAS.outreach, DAILY_QUOTAS.outreach - Math.floor(readiness.outreachReady / 2));
      quotas.outreach = Math.max(0, quotas.outreach - deficit);
      hygieneBonus += deficit;
    }

    if (readiness.hygieneNeeded > 100 && readiness.callsReady + readiness.outreachReady < 50) {
      hygieneBonus += 5;
      quotas.enablement = Math.max(0, quotas.enablement - 3);
      quotas.outreach = Math.max(0, quotas.outreach - 2);
    }

    quotas.data_hygiene = Math.min(quotas.data_hygiene + hygieneBonus, 25);

    console.log(`[Spotlight] Adaptive quotas - readiness: calls=${readiness.callsReady}, outreach=${readiness.outreachReady}, hygiene=${readiness.hygieneNeeded} -> quotas: calls=${quotas.calls}, outreach=${quotas.outreach}, hygiene=${quotas.data_hygiene}`);

    return quotas;
  }

  private async getSessionAsync(userId: string): Promise<SpotlightSession> {
    const today = this.getTodayKey();
    const sessionKey = `${userId}_${today}`;
    
    let session = this.sessions.get(sessionKey);
    if (!session || session.date !== today) {
      const readiness = await this.calculateDataReadiness(userId);
      const adaptiveQuotas = this.calculateAdaptiveQuotas(readiness);
      const totalTarget = Object.values(adaptiveQuotas).reduce((a, b) => a + b, 0);

      session = {
        userId,
        date: today,
        buckets: Object.entries(adaptiveQuotas).map(([bucket, target]) => ({
          bucket: bucket as TaskBucket,
          target,
          completed: 0,
          skipped: 0,
        })),
        totalTarget,
        totalCompleted: 0,
        skippedCustomerIds: [],
        lastTaskAt: null,
        dayComplete: false,
        isPaused: false,
        pausedAt: null,
        cardsBeforePause: 0,
        lastActivityAt: new Date(),
        efficiencyScore: 0,
        currentStreak: 0,
      };
      this.sessions.set(sessionKey, session);
    }
    return session;
  }

  private getSession(userId: string): SpotlightSession {
    const today = this.getTodayKey();
    const sessionKey = `${userId}_${today}`;
    
    let session = this.sessions.get(sessionKey);
    if (!session || session.date !== today) {
      session = {
        userId,
        date: today,
        buckets: Object.entries(DAILY_QUOTAS).map(([bucket, target]) => ({
          bucket: bucket as TaskBucket,
          target,
          completed: 0,
          skipped: 0,
        })),
        totalTarget: TOTAL_DAILY_QUOTA,
        totalCompleted: 0,
        skippedCustomerIds: [],
        lastTaskAt: null,
        dayComplete: false,
        isPaused: false,
        pausedAt: null,
        cardsBeforePause: 0,
        lastActivityAt: new Date(),
        efficiencyScore: 0,
        currentStreak: 0,
      };
      this.sessions.set(sessionKey, session);
    }
    return session;
  }

  async calculateEfficiencyScore(userId: string): Promise<{ score: number; breakdown: Record<string, number>; streak: number }> {
    const session = this.getSession(userId);
    const breakdown: Record<string, number> = {};
    let score = 0;

    score += session.totalCompleted * 10;
    breakdown.completedMoments = session.totalCompleted * 10;

    const bucketsWithProgress = session.buckets.filter(b => b.completed > 0).length;
    const varietyBonus = bucketsWithProgress >= 3 ? 15 : bucketsWithProgress >= 2 ? 8 : 0;
    score += varietyBonus;
    breakdown.varietyBonus = varietyBonus;

    const totalSkipped = session.buckets.reduce((sum, b) => sum + b.skipped, 0);
    const skipPenalty = totalSkipped > 5 ? (totalSkipped - 5) * -5 : 0;
    score += skipPenalty;
    breakdown.skipPenalty = skipPenalty;

    try {
      const overdueResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM follow_up_tasks 
        WHERE (assigned_to = ${userId} OR assigned_to IS NULL)
        AND status != 'completed'
        AND due_date < NOW() - INTERVAL '1 day'
      `);
      const overdueCount = Number(overdueResult.rows[0]?.count || 0);
      const overduePenalty = overdueCount > 0 ? Math.min(overdueCount * -3, -15) : 0;
      score += overduePenalty;
      breakdown.overduePenalty = overduePenalty;

      const complianceResult = await db.execute(sql`
        SELECT COUNT(*) as compliant FROM follow_up_tasks
        WHERE assigned_to = ${userId}
        AND status = 'completed'
        AND completed_at <= due_date + INTERVAL '1 day'
        AND completed_at >= NOW() - INTERVAL '7 days'
      `);
      const compliantCount = Number(complianceResult.rows[0]?.compliant || 0);
      const complianceBonus = Math.min(compliantCount * 2, 20);
      score += complianceBonus;
      breakdown.complianceBonus = complianceBonus;
    } catch (e) {
      console.error('[Spotlight] Error calculating efficiency bonuses:', e);
    }

    const streak = await this.calculateStreak(userId);
    const streakBonus = streak >= 5 ? 25 : streak >= 3 ? 10 : streak >= 2 ? 5 : 0;
    score += streakBonus;
    breakdown.streakBonus = streakBonus;

    session.efficiencyScore = Math.max(0, score);
    session.currentStreak = streak;

    return { score: Math.max(0, score), breakdown, streak };
  }

  private async calculateStreak(userId: string): Promise<number> {
    const today = this.getTodayKey();
    const cached = this.streakCache.get(userId);
    if (cached && cached.lastChecked === today) {
      return cached.streak;
    }

    try {
      const result = await db.execute(sql`
        WITH daily_completions AS (
          SELECT DISTINCT DATE(created_at) as activity_date
          FROM spotlight_events
          WHERE user_id = ${userId}
          AND event_type = 'completed'
          ORDER BY activity_date DESC
        ),
        streak_calc AS (
          SELECT activity_date,
            activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date DESC))::int AS streak_group
          FROM daily_completions
        )
        SELECT COUNT(*) as streak_length
        FROM streak_calc
        WHERE streak_group = (SELECT streak_group FROM streak_calc LIMIT 1)
      `);
      const streak = Number(result.rows[0]?.streak_length || 0);
      this.streakCache.set(userId, { streak, lastChecked: today });
      return streak;
    } catch (e) {
      console.error('[Spotlight] Error calculating streak:', e);
      return 0;
    }
  }

  pauseSession(userId: string): void {
    const session = this.getSession(userId);
    session.isPaused = true;
    session.pausedAt = new Date();
    session.cardsBeforePause = session.totalCompleted;

    db.insert(spotlightEvents).values({
      eventType: 'paused',
      userId,
      bucket: 'calls',
      metadata: { cardsBeforePause: session.cardsBeforePause, remaining: session.totalTarget - session.totalCompleted },
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours(),
    }).catch(e => console.error('[Spotlight] Failed to log pause event:', e));
  }

  resumeSession(userId: string): void {
    const session = this.getSession(userId);
    session.isPaused = false;
    session.pausedAt = null;
    session.lastActivityAt = new Date();

    db.insert(spotlightEvents).values({
      eventType: 'resumed',
      userId,
      bucket: 'calls',
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours(),
    }).catch(e => console.error('[Spotlight] Failed to log resume event:', e));
  }

  updateActivity(userId: string): void {
    const session = this.getSession(userId);
    session.lastActivityAt = new Date();
  }

  private getNextBucket(session: SpotlightSession): TaskBucket | null {
    const incomplete = session.buckets.filter(b => b.completed < b.target);
    if (incomplete.length === 0) return null;
    
    const bucketPriority: TaskBucket[] = ['calls', 'follow_ups', 'data_hygiene', 'outreach', 'enablement'];
    
    for (const bucket of bucketPriority) {
      const bucketData = incomplete.find(b => b.bucket === bucket);
      if (bucketData && bucketData.completed < bucketData.target) {
        return bucket;
      }
    }
    
    return incomplete[0]?.bucket || null;
  }

  async getNextTask(userId: string): Promise<{ task: SpotlightTask | null; session: SpotlightSession; allDone: boolean; isPaused?: boolean }> {
    const session = await this.getSessionAsync(userId);
    
    if (session.isPaused) {
      return { task: null, session, allDone: false, isPaused: true };
    }
    
    session.lastActivityAt = new Date();
    
    if (session.totalCompleted >= session.totalTarget) {
      session.dayComplete = true;
      return { task: null, session, allDone: true };
    }
    
    try {
      const nextBucket = this.getNextBucket(session);
      if (!nextBucket) {
        session.dayComplete = true;
        return { task: null, session, allDone: true };
      }

      let task: SpotlightTask | null = null;
      
      switch (nextBucket) {
        case 'calls':
          task = await this.findCallTask(userId, session.skippedCustomerIds);
          break;
        case 'follow_ups':
          task = await this.findFollowUpTask(userId, session.skippedCustomerIds);
          break;
        case 'outreach':
          task = await this.findOutreachTask(userId, session.skippedCustomerIds);
          break;
        case 'data_hygiene':
          task = await this.findHygieneTask(userId, session.skippedCustomerIds);
          break;
        case 'enablement':
          task = await this.findEnablementTask(userId, session.skippedCustomerIds);
          break;
      }

      if (!task) {
        const bucketData = session.buckets.find(b => b.bucket === nextBucket);
        if (bucketData) {
          bucketData.completed = bucketData.target;
        }
        return this.getNextTask(userId);
      }
      
      return { task, session, allDone: false };
    } catch (error) {
      console.error('[Spotlight] Error getting next task:', error);
      return { task: null, session, allDone: true };
    }
  }

  private async findCallTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    let conditions = [
      eq(customers.doNotContact, false),
      isNotNull(customers.phone),
      or(
        isNull(customers.salesRepId),
        eq(customers.salesRepId, userId)
      ),
    ];
    
    if (skippedIds.length > 0) {
      conditions.push(notInArray(customers.id, skippedIds));
    }

    const result = await db
      .select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        address1: customers.address1,
        address2: customers.address2,
        city: customers.city,
        province: customers.province,
        zip: customers.zip,
        country: customers.country,
        website: customers.website,
        salesRepId: customers.salesRepId,
        salesRepName: customers.salesRepName,
        pricingTier: customers.pricingTier,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.updatedAt))
      .limit(1);

    if (result.length > 0) {
      const customer = result[0];
      return this.buildTask(customer, 'calls', 'sales_call');
    }
    return null;
  }

  private async findFollowUpTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    const now = new Date();
    
    let conditions = [
      or(
        eq(followUpTasks.assignedTo, userId),
        isNull(followUpTasks.assignedTo)
      ),
      ne(followUpTasks.status, 'completed'),
      lte(followUpTasks.dueDate, now),
    ];

    if (skippedIds.length > 0) {
      conditions.push(notInArray(followUpTasks.customerId, skippedIds));
    }

    const result = await db
      .select({
        taskId: followUpTasks.id,
        customerId: followUpTasks.customerId,
        title: followUpTasks.title,
        taskType: followUpTasks.taskType,
        dueDate: followUpTasks.dueDate,
        customer: {
          id: customers.id,
          company: customers.company,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
          address1: customers.address1,
          address2: customers.address2,
          city: customers.city,
          province: customers.province,
          zip: customers.zip,
          country: customers.country,
          website: customers.website,
          salesRepId: customers.salesRepId,
          salesRepName: customers.salesRepName,
          pricingTier: customers.pricingTier,
        },
      })
      .from(followUpTasks)
      .leftJoin(customers, eq(followUpTasks.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(asc(followUpTasks.dueDate))
      .limit(1);

    if (result.length > 0 && result[0].customer) {
      const task = result[0];
      const subtype = task.taskType === 'quote_follow_up' ? 'sales_quote_follow_up' : 'sales_follow_up';
      const baseTask = this.buildTask(task.customer, 'follow_ups', subtype);
      return {
        ...baseTask,
        id: `follow_ups::${task.taskId}::${task.customer.id}::${subtype}`,
        context: {
          followUpId: task.taskId,
          followUpTitle: task.title || undefined,
          followUpDueDate: task.dueDate?.toISOString(),
        },
      };
    }
    return null;
  }

  private async findOutreachTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let conditions = [
      eq(customers.doNotContact, false),
      isNotNull(customers.email),
      isNotNull(customers.pricingTier),
      or(
        isNull(customers.salesRepId),
        eq(customers.salesRepId, userId)
      ),
      or(
        isNull(customers.updatedAt),
        lt(customers.updatedAt, thirtyDaysAgo)
      ),
    ];
    
    if (skippedIds.length > 0) {
      conditions.push(notInArray(customers.id, skippedIds));
    }

    const result = await db
      .select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        address1: customers.address1,
        address2: customers.address2,
        city: customers.city,
        province: customers.province,
        zip: customers.zip,
        country: customers.country,
        website: customers.website,
        salesRepId: customers.salesRepId,
        salesRepName: customers.salesRepName,
        pricingTier: customers.pricingTier,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.updatedAt))
      .limit(1);

    if (result.length > 0) {
      const customer = result[0];
      return this.buildTask(customer, 'outreach', 'outreach_no_contact');
    }
    return null;
  }

  private async findHygieneTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    const priorityOrder = [
      { subtype: 'hygiene_sales_rep', condition: isNull(customers.salesRepId) },
      { subtype: 'hygiene_pricing_tier', condition: isNull(customers.pricingTier) },
      { subtype: 'hygiene_email', condition: isNull(customers.email) },
      { subtype: 'hygiene_name', condition: and(isNull(customers.firstName), isNull(customers.lastName)) },
      { subtype: 'hygiene_company', condition: isNull(customers.company) },
      { subtype: 'hygiene_phone', condition: isNull(customers.phone) },
    ];

    for (let i = 0; i < priorityOrder.length; i++) {
      const { subtype, condition } = priorityOrder[i];
      
      let whereConditions = [
        condition,
        eq(customers.doNotContact, false),
      ];
      
      if (skippedIds.length > 0) {
        whereConditions.push(notInArray(customers.id, skippedIds));
      }
      
      if (subtype !== 'hygiene_sales_rep') {
        whereConditions.push(
          or(
            isNull(customers.salesRepId),
            eq(customers.salesRepId, userId)
          )
        );
      }

      const result = await db
        .select({
          id: customers.id,
          company: customers.company,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
          address1: customers.address1,
          address2: customers.address2,
          city: customers.city,
          province: customers.province,
          zip: customers.zip,
          country: customers.country,
          website: customers.website,
          salesRepId: customers.salesRepId,
          salesRepName: customers.salesRepName,
          pricingTier: customers.pricingTier,
        })
        .from(customers)
        .where(and(...whereConditions))
        .orderBy(desc(customers.updatedAt))
        .limit(1);

      if (result.length > 0) {
        const customer = result[0];
        return this.buildTask(customer, 'data_hygiene', subtype, i + 1);
      }
    }

    return null;
  }

  private async findEnablementTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    let conditions = [
      eq(customers.doNotContact, false),
      isNotNull(customers.email),
      isNotNull(customers.address1),
      or(
        isNull(customers.salesRepId),
        eq(customers.salesRepId, userId)
      ),
    ];
    
    if (skippedIds.length > 0) {
      conditions.push(notInArray(customers.id, skippedIds));
    }

    const result = await db
      .select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        address1: customers.address1,
        address2: customers.address2,
        city: customers.city,
        province: customers.province,
        zip: customers.zip,
        country: customers.country,
        website: customers.website,
        salesRepId: customers.salesRepId,
        salesRepName: customers.salesRepName,
        pricingTier: customers.pricingTier,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.updatedAt))
      .limit(1);

    if (result.length > 0) {
      const customer = result[0];
      return this.buildTask(customer, 'enablement', 'enablement_swatchbook');
    }
    return null;
  }

  private buildTask(customer: any, bucket: TaskBucket, subtype: string, priority: number = 1): SpotlightTask {
    return {
      id: `${bucket}_${customer.id}_${subtype}`,
      customerId: customer.id.toString(),
      bucket,
      taskSubtype: subtype,
      priority,
      whyNow: WHY_NOW_MESSAGES[subtype] || 'Take action on this customer.',
      outcomes: TASK_OUTCOMES[subtype] || [
        { id: 'done', label: 'Done', icon: 'check', nextAction: { type: 'mark_complete' } },
        { id: 'skip', label: 'Skip', icon: 'x', nextAction: { type: 'no_action' } },
      ],
      customer: {
        id: customer.id.toString(),
        company: customer.company,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        address1: customer.address1,
        address2: customer.address2,
        city: customer.city,
        province: customer.province,
        zip: customer.zip,
        country: customer.country,
        website: customer.website,
        salesRepId: customer.salesRepId,
        salesRepName: customer.salesRepName,
        pricingTier: customer.pricingTier,
      },
    };
  }

  async completeTask(
    userId: string, 
    taskId: string, 
    outcomeId: string,
    field?: string, 
    value?: string,
    notes?: string
  ): Promise<{ success: boolean; nextFollowUp?: { date: Date; type: string } }> {
    const session = this.getSession(userId);
    
    let bucket: TaskBucket;
    let customerId: string;
    let subtype: string;
    let followUpId: number | null = null;
    
    if (taskId.includes('::')) {
      const parts = taskId.split('::');
      bucket = parts[0] as TaskBucket;
      followUpId = parseInt(parts[1]);
      customerId = parts[2];
      subtype = parts[3];
    } else {
      const parts = taskId.split('_');
      bucket = parts[0] as TaskBucket;
      customerId = parts[1];
      subtype = parts.slice(2).join('_');
    }

    const outcomes = TASK_OUTCOMES[subtype] || [];
    const selectedOutcome = outcomes.find(o => o.id === outcomeId);
    
    if (bucket === 'data_hygiene' && field && value) {
      const subtypeAllowedFields: Record<string, string[]> = {
        'hygiene_sales_rep': ['salesRepId'],
        'hygiene_pricing_tier': ['pricingTier'],
        'hygiene_email': ['email'],
        'hygiene_name': ['firstName', 'lastName'],
        'hygiene_company': ['company'],
        'hygiene_phone': ['phone'],
      };

      const allowedFields = subtypeAllowedFields[subtype] || [];
      if (allowedFields.includes(field)) {
        const updateData: Record<string, any> = {
          updatedAt: new Date(),
          [field]: value,
        };

        if (field === 'salesRepId') {
          const [rep] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users)
            .where(eq(users.id, value));
          if (rep) {
            updateData.salesRepName = rep.firstName && rep.lastName 
              ? `${rep.firstName} ${rep.lastName}` 
              : rep.email;
          }
        }

        await db.update(customers)
          .set(updateData)
          .where(eq(customers.id, customerId));
      }
    }

    if (bucket === 'follow_ups' && followUpId) {
      await db.update(followUpTasks)
        .set({ 
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(followUpTasks.id, followUpId));
    }

    if (selectedOutcome?.nextAction?.type === 'mark_dnc') {
      await db.update(customers)
        .set({ 
          doNotContact: true,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId));
      
      await db.update(followUpTasks)
        .set({ 
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(and(
          eq(followUpTasks.customerId, customerId),
          ne(followUpTasks.status, 'completed')
        ));
      
      console.log(`[Spotlight] Customer ${customerId} marked as DNC by user ${userId}`);
    }

    let nextFollowUp: { date: Date; type: string } | undefined;
    if (selectedOutcome?.nextAction?.type === 'schedule_follow_up' && selectedOutcome.nextAction.daysUntil) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + selectedOutcome.nextAction.daysUntil);
      
      await db.insert(followUpTasks).values({
        customerId,
        title: `Follow-up: ${selectedOutcome.label}`,
        description: notes || null,
        taskType: selectedOutcome.nextAction.taskType || 'follow_up',
        dueDate,
        status: 'pending',
        assignedTo: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      nextFollowUp = { date: dueDate, type: selectedOutcome.nextAction.taskType || 'follow_up' };
    }

    const now = new Date();
    const markedDnc = selectedOutcome?.nextAction?.type === 'mark_dnc';
    
    try {
      await db.insert(customerActivityEvents).values({
        customerId,
        eventType: 'spotlight_action',
        title: `Spotlight: ${selectedOutcome?.label || outcomeId}`,
        description: notes || `${bucketInfo(bucket)} task: ${subtype}`,
        sourceType: 'auto',
        sourceTable: 'spotlight',
        createdAt: now,
        updatedAt: now,
        userId,
      });
    } catch (e) {
      console.error('[Spotlight] Failed to log customer activity:', e);
    }

    try {
      await db.insert(spotlightEvents).values({
        eventType: 'completed',
        userId,
        customerId,
        bucket,
        taskSubtype: subtype,
        outcomeId,
        outcomeLabel: selectedOutcome?.label || outcomeId,
        scheduledFollowUpDays: selectedOutcome?.nextAction?.daysUntil || null,
        markedDnc,
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
        metadata: { notes, field, value },
      });
    } catch (e) {
      console.error('[Spotlight] Failed to log spotlight event:', e);
    }

    const bucketData = session.buckets.find(b => b.bucket === bucket);
    if (bucketData) {
      bucketData.completed++;
    }
    session.totalCompleted++;
    session.lastTaskAt = new Date();
    
    const skipIndex = session.skippedCustomerIds.indexOf(customerId);
    if (skipIndex > -1) {
      session.skippedCustomerIds.splice(skipIndex, 1);
    }

    return { success: true, nextFollowUp };
  }

  async skipTask(userId: string, taskId: string, reason: string): Promise<void> {
    const session = this.getSession(userId);
    
    let customerId: string;
    let bucket: TaskBucket;
    let subtype: string;
    
    if (taskId.includes('::')) {
      const parts = taskId.split('::');
      bucket = parts[0] as TaskBucket;
      customerId = parts[2];
      subtype = parts[3];
    } else {
      const parts = taskId.split('_');
      bucket = parts[0] as TaskBucket;
      customerId = parts[1];
      subtype = parts.slice(2).join('_');
    }

    if (!session.skippedCustomerIds.includes(customerId)) {
      session.skippedCustomerIds.push(customerId);
    }

    const bucketData = session.buckets.find(b => b.bucket === bucket);
    if (bucketData) {
      bucketData.skipped++;
    }

    const now = new Date();
    try {
      await db.insert(spotlightEvents).values({
        eventType: 'skipped',
        userId,
        customerId,
        bucket,
        taskSubtype: subtype,
        skipReason: reason,
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
      });
    } catch (e) {
      console.error('[Spotlight] Failed to log skip event:', e);
    }

    console.log(`[Spotlight] User ${userId} skipped task ${taskId}: ${reason}`);
  }

  getSessionStats(userId: string): SpotlightSession {
    return this.getSession(userId);
  }

  resetSession(userId: string): void {
    const today = this.getTodayKey();
    const sessionKey = `${userId}_${today}`;
    this.sessions.delete(sessionKey);
  }
}

export const spotlightEngine = new SpotlightEngine();
