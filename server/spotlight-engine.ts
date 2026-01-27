import { db } from "./db";
import { customers, followUpTasks, users, customerActivityEvents, spotlightEvents, customerContacts, spotlightSessionState, spotlightCustomerClaims, spotlightMicroCards, spotlightCoachTips, TASK_ENERGY_COSTS, customerSyncQueue, sentQuotes, territorySkipFlags, gmailMessages, leads } from "@shared/schema";

// Generic email domains to deprioritize in data hygiene tasks
const GENERIC_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'live.com', 'msn.com', 'me.com', 'comcast.net', 'verizon.net',
  'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net'
];
import { eq, and, isNull, or, ne, sql, desc, asc, lt, lte, gte, isNotNull, inArray, notInArray, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { analyzeForHints, SpotlightHint, getCustomerMachineProfiles, getProductSuggestionsForMachines, getMachineLabel, checkMissingMachineProfile } from "./spotlight-heuristics";

// Difficulty mapping for buckets
const BUCKET_DIFFICULTY: Record<TaskBucket, 'easy' | 'medium' | 'hard'> = {
  data_hygiene: 'easy',
  enablement: 'easy',
  outreach: 'medium',
  follow_ups: 'medium',
  calls: 'hard',
};

// Micro-coaching card types
export type MicroCardType = 'product_quiz' | 'objection_practice' | 'customer_story' | 'competitor_intel' | 'machine_profile_check';

export interface MicroCoachingCard {
  id: number;
  cardType: MicroCardType;
  title: string;
  content: string;
  question?: string;
  options?: string[];
  correctAnswer?: number;
  explanation?: string;
  objectionType?: string;
  suggestedResponses?: { id: string; text: string; isRecommended: boolean }[];
  difficulty: string;
}

export interface CoachTip {
  id: number;
  tipType: string;
  content: string;
}

export interface GamificationState {
  comboCount: number;
  comboMultiplier: number;
  currentStreak: number;
  powerUpsAvailable: number;
  hardTasksCompleted: number;
  tasksSinceMicroCard: number;
}

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
  leadId?: number; // If this is a lead task, the lead ID
  isLeadTask?: boolean; // Flag to indicate this is a lead task
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
  lead?: {
    id: number;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    stage: string;
    priority: string | null;
    score: number | null;
    city: string | null;
    state: string | null;
    salesRepId: string | null;
    salesRepName: string | null;
    firstEmailSentAt: Date | null;
    firstEmailReplyAt: Date | null;
    lastContactAt: Date | null;
    totalTouchpoints: number | null;
  };
  context?: {
    followUpId?: number;
    followUpTitle?: string;
    followUpDueDate?: string;
    lastContact?: string;
    machineTypes?: string[];
    machineLabels?: string[];
    suggestedProducts?: string[];
    machineContext?: string;
    sourceType?: string;
  };
  extraContext?: {
    bouncedEmail?: string;
    bounceSubject?: string;
    bounceDate?: string;
    [key: string]: any;
  };
}

export interface TaskOutcome {
  id: string;
  label: string;
  icon?: string;
  nextAction?: {
    type: 'schedule_follow_up' | 'send_email' | 'mark_complete' | 'no_action' | 'mark_dnc' | 'custom_follow_up' | 'delete_record';
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
  consecutiveSkipsPerBucket: Record<TaskBucket, number>;
  lastBucketUsed: TaskBucket | null;
  // Task interleaving
  lastTaskTypes: string[]; // Rolling window of last 4 task types/difficulties
  currentEnergy: number; // 0-100
  // Gamification
  comboCount: number; // Different task types in a row
  comboMultiplier: number;
  hardTasksCompletedToday: number;
  powerUpsAvailable: number;
  powerUpsUsedToday: number;
  // Micro-coaching
  tasksSinceMicroCard: number;
  microCardsShownToday: number[];
  // Session flow
  warmupShown: boolean;
  energyCheckShown: boolean;
  recapShown: boolean;
}

const DAILY_QUOTAS: Record<TaskBucket, number> = {
  calls: 4,           // Increased for lead integration
  follow_ups: 6,      // Increased for lead follow-ups
  outreach: 8,        // Increased for lead outreach
  data_hygiene: 27,   // Increased for data hygiene
  enablement: 5,      // Increased for enablement tasks
};
// Total: 50 tasks per day

const TOTAL_DAILY_QUOTA = Object.values(DAILY_QUOTAS).reduce((a, b) => a + b, 0);

const TASK_OUTCOMES: Record<string, TaskOutcome[]> = {
  hygiene_sales_rep: [
    { id: 'assigned', label: 'Assign to Me', icon: 'user-check', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Not My Territory', icon: 'x', nextAction: { type: 'no_action' } },
  ],
  hygiene_pricing_tier: [
    { id: 'assigned', label: 'Pricing Tier Assigned', icon: 'tag', nextAction: { type: 'mark_complete' } },
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
  hygiene_machines: [
    { id: 'confirmed', label: 'Machines Confirmed', icon: 'settings', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Ask Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 14, taskType: 'research' } },
  ],
  hygiene_bounced_email: [
    { id: 'mark_inactive', label: 'Mark as Do Not Contact', icon: 'user-x', nextAction: { type: 'mark_dnc' } },
    { id: 'keep', label: 'Keep Active', icon: 'check', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Investigate Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  sales_call: [
    { id: 'connected', label: 'Connected', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'follow_up' } },
    { id: 'voicemail', label: 'Left Voicemail', icon: 'voicemail', nextAction: { type: 'schedule_follow_up', daysUntil: 2, taskType: 'call' } },
    { id: 'no_answer', label: 'No Answer', icon: 'phone-missed', nextAction: { type: 'schedule_follow_up', daysUntil: 1, taskType: 'call' } },
    { id: 'custom_followup', label: 'Schedule Follow-up', icon: 'calendar', nextAction: { type: 'custom_follow_up' } },
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
  // Email follow-up for pricing/samples emails sent yesterday
  pricing_samples_followup: [
    { id: 'called', label: 'Called', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'email_sent', label: 'Sent Follow-up Email', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'replied', label: 'They Replied', icon: 'check', nextAction: { type: 'mark_complete' } },
    { id: 'no_response_yet', label: 'No Response Yet', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 2, taskType: 'follow_up' } },
    { id: 'skip', label: 'Skip', icon: 'x', nextAction: { type: 'no_action' } },
  ],
  // Lead-specific task outcomes
  lead_call_hot: [
    { id: 'connected', label: 'Connected', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'voicemail', label: 'Left Voicemail', icon: 'voicemail', nextAction: { type: 'schedule_follow_up', daysUntil: 1, taskType: 'call' } },
    { id: 'no_answer', label: 'No Answer', icon: 'phone-missed', nextAction: { type: 'schedule_follow_up', daysUntil: 1, taskType: 'call' } },
    { id: 'qualified', label: 'Qualified!', icon: 'star', nextAction: { type: 'mark_complete' } },
    { id: 'not_interested', label: 'Not Interested', icon: 'x', nextAction: { type: 'mark_complete' } },
  ],
  lead_call_urgent: [
    { id: 'connected', label: 'Connected', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'voicemail', label: 'Left Voicemail', icon: 'voicemail', nextAction: { type: 'schedule_follow_up', daysUntil: 1, taskType: 'call' } },
    { id: 'no_answer', label: 'No Answer', icon: 'phone-missed', nextAction: { type: 'schedule_follow_up', daysUntil: 1, taskType: 'call' } },
    { id: 'qualified', label: 'Qualified!', icon: 'star', nextAction: { type: 'mark_complete' } },
    { id: 'not_interested', label: 'Not Interested', icon: 'x', nextAction: { type: 'mark_complete' } },
  ],
  lead_call_qualified: [
    { id: 'connected', label: 'Connected', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 5, taskType: 'follow_up' } },
    { id: 'voicemail', label: 'Left Voicemail', icon: 'voicemail', nextAction: { type: 'schedule_follow_up', daysUntil: 2, taskType: 'call' } },
    { id: 'no_answer', label: 'No Answer', icon: 'phone-missed', nextAction: { type: 'schedule_follow_up', daysUntil: 2, taskType: 'call' } },
    { id: 'skip', label: 'Skip for Now', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  lead_outreach_new: [
    { id: 'email_sent', label: 'Sent Email', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'called', label: 'Called', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 2, taskType: 'follow_up' } },
    { id: 'skip', label: 'Skip for Now', icon: 'clock', nextAction: { type: 'no_action' } },
    { id: 'not_interested', label: 'Not a Fit', icon: 'x', nextAction: { type: 'mark_complete' } },
  ],
  lead_outreach_intro: [
    { id: 'email_sent', label: 'Sent Intro Email', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 5, taskType: 'follow_up' } },
    { id: 'skip', label: 'Not Now', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  lead_follow_up_no_reply: [
    { id: 'followed_up', label: 'Followed Up', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 5, taskType: 'follow_up' } },
    { id: 'called', label: 'Called Instead', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'replied', label: 'Got Reply!', icon: 'check', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Give More Time', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  lead_follow_up_nurture: [
    { id: 'sent_content', label: 'Sent Helpful Content', icon: 'file-text', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'follow_up' } },
    { id: 'called', label: 'Called to Check In', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 5, taskType: 'follow_up' } },
    { id: 'progressing', label: 'Moving Forward!', icon: 'trending-up', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Not Now', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  lead_follow_up_stale: [
    { id: 're_engaged', label: 'Re-engaged!', icon: 'check', nextAction: { type: 'schedule_follow_up', daysUntil: 5, taskType: 'follow_up' } },
    { id: 'sent_email', label: 'Sent Re-engagement Email', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'follow_up' } },
    { id: 'lost', label: 'Mark as Lost', icon: 'x', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Try Again Later', icon: 'clock', nextAction: { type: 'no_action' } },
  ],
  lead_follow_up_qualified: [
    { id: 'followed_up', label: 'Followed Up', icon: 'check', nextAction: { type: 'schedule_follow_up', daysUntil: 5, taskType: 'follow_up' } },
    { id: 'called', label: 'Called', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'converting', label: 'Ready to Convert!', icon: 'star', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Skip for Now', icon: 'clock', nextAction: { type: 'no_action' } },
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
  hygiene_machines: 'Find out what machines they use - helps recommend the right products!',
  hygiene_bounced_email: 'Emails to this contact are bouncing - they may have left the company or the business closed.',
  sales_call: 'Time for a call - build the relationship!',
  sales_follow_up: 'Follow-up is due - keep the momentum going.',
  sales_quote_follow_up: 'Quote sent but no response - time to check in.',
  outreach_no_contact: 'No recent contact - reach out before they forget you.',
  outreach_drip: 'Send a nurture email to stay top of mind.',
  enablement_swatchbook: 'Send a SwatchBook to showcase your products.',
  enablement_press_test: 'Send a Press Test Kit to demonstrate quality.',
  enablement_price_list: 'They have samples - now send the price list!',
  // Light fallback tasks when queue is empty
  light_call_check_in: 'Quick check-in call - see how they are doing.',
  light_call_intro: 'Introduce yourself - build the relationship.',
  light_follow_up_confirm: 'Confirm their contact info is still current.',
  light_follow_up_thank: 'Send a quick thank-you for their past business.',
  light_outreach_linkedin: 'Connect with them on LinkedIn.',
  light_outreach_website: 'Review their website for conversation starters.',
  light_hygiene_verify: 'Double-check this record looks complete.',
  light_hygiene_notes: 'Add any notes from past interactions.',
  light_enablement_catalog: 'Share our latest product catalog.',
  light_enablement_newsletter: 'Add them to our newsletter list.',
  // Lead-specific task messages
  lead_call_hot: '🔥 HOT LEAD needs a call NOW - strike while the iron is hot!',
  lead_call_urgent: '⚡ URGENT lead - high probability of conversion, call today!',
  lead_call_qualified: 'Qualified lead ready for a call - move them forward!',
  lead_outreach_new: '🆕 NEW LEAD - make first contact to start trust building!',
  lead_outreach_intro: 'Send intro email to this lead - start the conversation.',
  lead_follow_up_no_reply: 'Lead hasn\'t replied yet - follow up to stay on their radar.',
  lead_follow_up_nurture: 'Time to nurture this lead - send helpful info to build trust.',
  lead_follow_up_stale: 'Lead going cold - re-engage before they lose interest!',
  lead_follow_up_qualified: 'Qualified lead needs attention - keep the momentum going.',
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

  // Get customer IDs that have been contacted within the last N days (auto-skip these)
  private async getRecentlyContactedIds(daysBack: number = 7): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    try {
      const result = await db
        .selectDistinct({ customerId: customerActivityEvents.customerId })
        .from(customerActivityEvents)
        .where(
          and(
            gte(customerActivityEvents.createdAt, cutoffDate),
            inArray(customerActivityEvents.eventType, ['call', 'email', 'quote', 'follow_up_completed'])
          )
        );
      
      return result.map(r => r.customerId);
    } catch (e) {
      console.error('[Spotlight] Error getting recently contacted IDs:', e);
      return [];
    }
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
        consecutiveSkipsPerBucket: { calls: 0, follow_ups: 0, outreach: 0, data_hygiene: 0, enablement: 0 },
        lastBucketUsed: null,
        // Task interleaving
        lastTaskTypes: [],
        currentEnergy: 100,
        // Gamification
        comboCount: 0,
        comboMultiplier: 1.0,
        hardTasksCompletedToday: 0,
        powerUpsAvailable: 0,
        powerUpsUsedToday: 0,
        // Micro-coaching
        tasksSinceMicroCard: 0,
        microCardsShownToday: [],
        // Session flow
        warmupShown: false,
        energyCheckShown: false,
        recapShown: false,
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
        consecutiveSkipsPerBucket: { calls: 0, follow_ups: 0, outreach: 0, data_hygiene: 0, enablement: 0 },
        lastBucketUsed: null,
        // Task interleaving
        lastTaskTypes: [],
        currentEnergy: 100,
        // Gamification
        comboCount: 0,
        comboMultiplier: 1.0,
        hardTasksCompletedToday: 0,
        powerUpsAvailable: 0,
        powerUpsUsedToday: 0,
        // Micro-coaching
        tasksSinceMicroCard: 0,
        microCardsShownToday: [],
        // Session flow
        warmupShown: false,
        energyCheckShown: false,
        recapShown: false,
      };
      this.sessions.set(sessionKey, session);
    }
    return session;
  }

  async generateDailyQueue(userId: string): Promise<number> {
    // Legacy queue-based system removed - SPOTLIGHT uses dynamic task selection via getNextTask()
    console.log(`[Spotlight] generateDailyQueue called for ${userId} - using dynamic task selection instead`);
    return 0;
  }

  private async findCandidatesForMomentType(userId: string, type: string, quota: number): Promise<Array<{
    customerId: string;
    priority: number;
    whyNow: string;
    dueAt?: Date;
    payload?: Record<string, any>;
  }>> {
    const candidates: Array<{ customerId: string; priority: number; whyNow: string; dueAt?: Date; payload?: Record<string, any> }> = [];
    
    switch (type) {
      case 'call':
        const callCustomers = await db.select({ id: customers.id })
          .from(customers)
          .where(and(
            isNotNull(customers.phone),
            eq(customers.doNotContact, false),
            or(isNull(customers.salesRepId), eq(customers.salesRepId, userId))
          ))
          .orderBy(asc(customers.updatedAt))
          .limit(quota);
        
        callCustomers.forEach((c, i) => candidates.push({
          customerId: c.id,
          priority: 100 - i,
          whyNow: 'Time for a call - build the relationship!',
        }));
        break;
        
      case 'follow_up':
        const now = new Date();
        const followUps = await db.select({ 
          customerId: followUpTasks.customerId, 
          dueDate: followUpTasks.dueDate,
          title: followUpTasks.title,
          id: followUpTasks.id 
        })
          .from(followUpTasks)
          .where(and(
            or(eq(followUpTasks.assignedTo, userId), isNull(followUpTasks.assignedTo)),
            ne(followUpTasks.status, 'completed'),
            lte(followUpTasks.dueDate, now)
          ))
          .orderBy(asc(followUpTasks.dueDate))
          .limit(quota);
        
        followUps.forEach((f, i) => {
          if (f.customerId) {
            candidates.push({
              customerId: f.customerId,
              priority: 100 - i,
              whyNow: f.title || 'Follow-up is due - keep the momentum going!',
              dueAt: f.dueDate || undefined,
              payload: { followUpTaskId: f.id },
            });
          }
        });
        break;

      case 'email':
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const emailCustomers = await db.select({ id: customers.id })
          .from(customers)
          .where(and(
            isNotNull(customers.email),
            isNotNull(customers.pricingTier),
            eq(customers.doNotContact, false),
            or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
            or(isNull(customers.updatedAt), lt(customers.updatedAt, thirtyDaysAgo))
          ))
          .orderBy(asc(customers.updatedAt))
          .limit(quota);
        
        emailCustomers.forEach((c, i) => candidates.push({
          customerId: c.id,
          priority: 80 - i,
          whyNow: 'No recent contact - reach out before they forget you.',
        }));
        break;

      case 'data_hygiene':
        const hygieneTypes = [
          { field: 'salesRepId', whyNow: 'This customer has no assigned sales rep - claim them now!' },
          { field: 'pricingTier', whyNow: 'Set the pricing tier so quotes are accurate.' },
          { field: 'phone', whyNow: 'No phone number on file - add it for call outreach.' },
          { field: 'email', whyNow: 'Missing primary email - essential for follow-ups.' },
        ];
        
        // Generic email domains that are harder to investigate - deprioritize these
        const genericEmailDomains = ['gmail.com', 'yahoo.com', 'aol.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'mail.com', 'msn.com', 'live.com', 'ymail.com', 'protonmail.com', 'zoho.com'];
        
        let hygieneCount = 0;
        for (const { field, whyNow } of hygieneTypes) {
          if (hygieneCount >= quota) break;
          
          const condition = field === 'salesRepId' ? isNull(customers.salesRepId)
            : field === 'pricingTier' ? isNull(customers.pricingTier)
            : field === 'phone' ? isNull(customers.phone)
            : isNull(customers.email);
          
          // Order by: business emails first (priority 0), generic emails last (priority 1)
          const genericEmailCase = sql`CASE WHEN ${customers.email} ~* '(gmail|yahoo|aol|hotmail|outlook|icloud|mail\\.com|msn|live|ymail|protonmail|zoho)\\.' THEN 1 ELSE 0 END`;
          
          const hygieneCustomers = await db.select({ id: customers.id, email: customers.email })
            .from(customers)
            .where(and(condition, eq(customers.doNotContact, false)))
            .orderBy(genericEmailCase, asc(customers.createdAt))
            .limit(Math.ceil((quota - hygieneCount) / hygieneTypes.length));
          
          hygieneCustomers.forEach((c, i) => {
            // Give lower priority to generic email customers
            const isGenericEmail = c.email && genericEmailDomains.some(d => c.email?.toLowerCase().endsWith(`@${d}`));
            const priorityAdjustment = isGenericEmail ? -20 : 0;
            
            candidates.push({
              customerId: c.id,
              priority: 60 - i + priorityAdjustment,
              whyNow,
              payload: { missingField: field },
            });
            hygieneCount++;
          });
        }
        
        // Add machine profile confirmation task for customers with complete data but missing machine profile
        if (hygieneCount < quota) {
          const machineProfileCandidates = await db.select({ 
            id: customers.id,
            pricingTier: customers.pricingTier,
            phone: customers.phone,
            salesRepId: customers.salesRepId,
            address1: customers.address1
          })
            .from(customers)
            .where(and(
              isNotNull(customers.pricingTier),
              isNotNull(customers.phone),
              isNotNull(customers.salesRepId),
              eq(customers.doNotContact, false),
              or(isNull(customers.salesRepId), eq(customers.salesRepId, userId))
            ))
            .orderBy(asc(customers.updatedAt))
            .limit(Math.min(5, quota - hygieneCount));
          
          for (const c of machineProfileCandidates) {
            if (hygieneCount >= quota) break;
            const needsMachine = await checkMissingMachineProfile(c.id, c);
            if (needsMachine) {
              candidates.push({
                customerId: c.id,
                priority: 55,
                whyNow: 'Core data is complete - call to confirm what machines they use. This helps recommend the right products!',
                payload: { missingField: 'machineProfile', taskSubtype: 'hygiene_machine_profile' },
              });
              hygieneCount++;
            }
          }
        }
        break;

      case 'swatchbook':
      case 'press_test':
      case 'price_list':
        const enablementCustomers = await db.select({ id: customers.id })
          .from(customers)
          .where(and(
            isNotNull(customers.pricingTier),
            eq(customers.doNotContact, false),
            or(isNull(customers.salesRepId), eq(customers.salesRepId, userId))
          ))
          .orderBy(asc(customers.updatedAt))
          .limit(quota);
        
        enablementCustomers.forEach((c, i) => candidates.push({
          customerId: c.id,
          priority: 50 - i,
          whyNow: type === 'swatchbook' ? 'Send a SwatchBook to showcase your products.'
            : type === 'press_test' ? 'Send a Press Test Kit to demonstrate quality.'
            : 'They have samples - now send the price list!',
          payload: { productKitType: type },
        }));
        break;
    }

    return candidates.slice(0, quota);
  }

  async getNextMomentFromQueue(userId: string): Promise<{ moment: any | null; session: SpotlightSession; hints: SpotlightHint[] }> {
    // Legacy queue-based system removed - use getNextTask() instead
    const session = await this.getSessionAsync(userId);
    return { moment: null, session, hints: [] };
  }

  async completeMoment(momentId: string, outcome: string, userId: string): Promise<{ success: boolean; nextFollowUp?: any }> {
    // Legacy queue-based system removed - use completeTask() instead
    console.log(`[Spotlight] Legacy completeMoment called for ${momentId} - use completeTask() instead`);
    return { success: false };
  }

  async skipMoment(momentId: string, reason: string, userId: string): Promise<boolean> {
    // Legacy queue-based system removed - use skipTask() instead
    console.log(`[Spotlight] Legacy skipMoment called for ${momentId} - use skipTask() instead`);
    return false;
  }

  private getBucketForMomentType(type: string): TaskBucket {
    switch (type) {
      case 'call': return 'calls';
      case 'follow_up': return 'follow_ups';
      case 'email': return 'outreach';
      case 'data_hygiene': return 'data_hygiene';
      case 'swatchbook':
      case 'press_test':
      case 'price_list': return 'enablement';
      default: return 'outreach';
    }
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
    
    const SKIP_THRESHOLD = 3;
    const MAX_CONSECUTIVE_SAME_DIFFICULTY = 2;
    
    // Get available buckets with their difficulties
    const availableBuckets = incomplete.map(b => ({
      bucket: b.bucket,
      remaining: b.target - b.completed,
      difficulty: BUCKET_DIFFICULTY[b.bucket],
      consecutiveSkips: session.consecutiveSkipsPerBucket?.[b.bucket] || 0,
    })).filter(b => b.remaining > 0 && b.consecutiveSkips < SKIP_THRESHOLD);
    
    if (availableBuckets.length === 0) {
      // All buckets hit skip threshold, find least skipped
      const leastSkipped = incomplete.reduce((min, b) => {
        const currentSkips = session.consecutiveSkipsPerBucket?.[b.bucket] || 0;
        const minSkips = session.consecutiveSkipsPerBucket?.[min.bucket] || 0;
        return currentSkips < minSkips ? b : min;
      }, incomplete[0]);
      return leastSkipped.bucket;
    }
    
    // Check last task difficulties for interleaving
    const lastTypes = session.lastTaskTypes || [];
    const lastDifficulties = lastTypes.slice(-MAX_CONSECUTIVE_SAME_DIFFICULTY);
    
    // Count consecutive same-difficulty tasks
    const countConsecutiveDifficulty = (difficulty: string): number => {
      let count = 0;
      for (let i = lastDifficulties.length - 1; i >= 0; i--) {
        if (lastDifficulties[i] === difficulty) count++;
        else break;
      }
      return count;
    };
    
    // Energy-based task selection: after hard tasks, prefer easy; when high energy, allow hard
    const lastTaskWasHard = lastDifficulties.length > 0 && lastDifficulties[lastDifficulties.length - 1] === 'hard';
    const currentEnergy = session.currentEnergy ?? 100;
    
    // Sort buckets by interleaving priority
    const sortedBuckets = availableBuckets.sort((a, b) => {
      const aConsecutive = countConsecutiveDifficulty(a.difficulty);
      const bConsecutive = countConsecutiveDifficulty(b.difficulty);
      
      // Penalize buckets that would create too many consecutive same-difficulty tasks
      const aPenalty = aConsecutive >= MAX_CONSECUTIVE_SAME_DIFFICULTY ? 100 : 0;
      const bPenalty = bConsecutive >= MAX_CONSECUTIVE_SAME_DIFFICULTY ? 100 : 0;
      
      // Energy-based scoring: prefer easy after hard, and hard when energy is high
      let aEnergyScore = 0;
      let bEnergyScore = 0;
      
      if (lastTaskWasHard) {
        // After hard task, strongly prefer easy
        aEnergyScore = a.difficulty === 'easy' ? -20 : a.difficulty === 'hard' ? 20 : 0;
        bEnergyScore = b.difficulty === 'easy' ? -20 : b.difficulty === 'hard' ? 20 : 0;
      } else if (currentEnergy > 80) {
        // High energy: slightly prefer medium/hard to make progress on those
        aEnergyScore = a.difficulty === 'hard' ? -5 : a.difficulty === 'medium' ? -3 : 0;
        bEnergyScore = b.difficulty === 'hard' ? -5 : b.difficulty === 'medium' ? -3 : 0;
      } else if (currentEnergy < 40) {
        // Low energy: prefer easy tasks
        aEnergyScore = a.difficulty === 'easy' ? -10 : a.difficulty === 'hard' ? 15 : 0;
        bEnergyScore = b.difficulty === 'easy' ? -10 : b.difficulty === 'hard' ? 15 : 0;
      }
      
      // Priority order for buckets when all else is equal: follow_ups > calls > outreach > data_hygiene > enablement
      const priorityOrder: Record<TaskBucket, number> = {
        follow_ups: 1,
        calls: 2,
        outreach: 3,
        data_hygiene: 4,
        enablement: 5,
      };
      
      const aScore = aPenalty + aEnergyScore + priorityOrder[a.bucket];
      const bScore = bPenalty + bEnergyScore + priorityOrder[b.bucket];
      
      return aScore - bScore;
    });
    
    return sortedBuckets[0]?.bucket || null;
  }
  
  // Get a micro-coaching card if it's time to show one
  async getMicroCoachingCard(userId: string): Promise<MicroCoachingCard | null> {
    const session = this.getSession(userId);
    
    // Show micro-coaching card every 3-4 tasks
    if (session.tasksSinceMicroCard < 3) return null;
    
    try {
      const shownToday = session.microCardsShownToday || [];
      
      // Get a card not shown today, prioritizing variety
      const cards = await db.select()
        .from(spotlightMicroCards)
        .where(and(
          eq(spotlightMicroCards.isActive, true),
          shownToday.length > 0 ? notInArray(spotlightMicroCards.id, shownToday) : sql`true`
        ))
        .orderBy(sql`RANDOM()`)
        .limit(1);
      
      if (cards.length === 0) {
        // All cards shown today, reset
        session.microCardsShownToday = [];
        return null;
      }
      
      const card = cards[0];
      session.tasksSinceMicroCard = 0;
      session.microCardsShownToday = [...shownToday, card.id];
      
      return {
        id: card.id,
        cardType: card.cardType as MicroCardType,
        title: card.title,
        content: card.content,
        question: card.question || undefined,
        options: card.options as string[] || undefined,
        correctAnswer: card.correctAnswer || undefined,
        explanation: card.explanation || undefined,
        objectionType: card.objectionType || undefined,
        suggestedResponses: card.suggestedResponses as any || undefined,
        difficulty: card.difficulty || 'medium',
      };
    } catch (e) {
      console.error('[Spotlight] Error getting micro-coaching card:', e);
      return null;
    }
  }
  
  // Get contextual coach tip for a task
  async getCoachTip(taskSubtype: string, machineTypeCode?: string): Promise<CoachTip | null> {
    try {
      let conditions: any[] = [
        eq(spotlightCoachTips.isActive, true),
        eq(spotlightCoachTips.triggerContext, taskSubtype),
      ];
      
      const tips = await db.select()
        .from(spotlightCoachTips)
        .where(and(...conditions))
        .orderBy(desc(spotlightCoachTips.priority), sql`RANDOM()`)
        .limit(1);
      
      if (tips.length > 0) {
        return {
          id: tips[0].id,
          tipType: tips[0].tipType,
          content: tips[0].content,
        };
      }
      return null;
    } catch (e) {
      console.error('[Spotlight] Error getting coach tip:', e);
      return null;
    }
  }
  
  // Get morning warm-up data
  async getWarmupData(userId: string): Promise<{ 
    yesterdaySummary: { calls: number; tasksCompleted: number; pricingTiersAssigned: number };
    todayFocus: string;
    streak: number;
  }> {
    const session = this.getSession(userId);
    session.warmupShown = true;
    
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const result = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE bucket = 'calls' AND event_type = 'completed') as calls,
          COUNT(*) FILTER (WHERE event_type = 'completed') as tasks_completed,
          COUNT(*) FILTER (WHERE task_subtype = 'hygiene_pricing_tier' AND event_type = 'completed') as pricing_tiers
        FROM spotlight_events
        WHERE user_id = ${userId}
        AND DATE(created_at) = ${yesterdayStr}
      `);
      
      const streak = await this.calculateStreak(userId);
      
      // Determine today's focus based on what's incomplete
      const incomplete = session.buckets.filter(b => b.completed < b.target);
      const focusBucket = incomplete.sort((a, b) => {
        // Prioritize high-value incomplete buckets
        const priority: Record<TaskBucket, number> = { calls: 1, follow_ups: 2, outreach: 3, enablement: 4, data_hygiene: 5 };
        return priority[a.bucket] - priority[b.bucket];
      })[0];
      
      const focusLabels: Record<TaskBucket, string> = {
        calls: 'Building relationships through calls',
        follow_ups: 'Staying on top of follow-ups',
        outreach: 'Expanding your reach',
        data_hygiene: 'Cleaning up customer data',
        enablement: 'Enabling customers with samples',
      };
      
      return {
        yesterdaySummary: {
          calls: Number(result.rows[0]?.calls || 0),
          tasksCompleted: Number(result.rows[0]?.tasks_completed || 0),
          pricingTiersAssigned: Number(result.rows[0]?.pricing_tiers || 0),
        },
        todayFocus: focusLabels[focusBucket?.bucket || 'outreach'],
        streak,
      };
    } catch (e) {
      console.error('[Spotlight] Error getting warmup data:', e);
      return {
        yesterdaySummary: { calls: 0, tasksCompleted: 0, pricingTiersAssigned: 0 },
        todayFocus: 'Making progress on your tasks',
        streak: 0,
      };
    }
  }
  
  // Get end-of-day recap
  async getRecapData(userId: string): Promise<{
    todaySummary: { totalCompleted: number; callsConnected: number; followUpsScheduled: number };
    topWins: string[];
    suggestedFollowUps: string[];
  }> {
    const session = this.getSession(userId);
    session.recapShown = true;
    
    try {
      const today = this.getTodayKey();
      
      const result = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE event_type = 'completed') as total_completed,
          COUNT(*) FILTER (WHERE bucket = 'calls' AND outcome_id = 'connected') as calls_connected,
          COUNT(*) FILTER (WHERE scheduled_follow_up_days IS NOT NULL) as follow_ups_scheduled
        FROM spotlight_events
        WHERE user_id = ${userId}
        AND DATE(created_at) = ${today}
      `);
      
      return {
        todaySummary: {
          totalCompleted: Number(result.rows[0]?.total_completed || 0),
          callsConnected: Number(result.rows[0]?.calls_connected || 0),
          followUpsScheduled: Number(result.rows[0]?.follow_ups_scheduled || 0),
        },
        topWins: [],
        suggestedFollowUps: [],
      };
    } catch (e) {
      console.error('[Spotlight] Error getting recap data:', e);
      return {
        todaySummary: { totalCompleted: 0, callsConnected: 0, followUpsScheduled: 0 },
        topWins: [],
        suggestedFollowUps: [],
      };
    }
  }
  
  // Update gamification state after task completion
  updateGamificationOnComplete(session: SpotlightSession, taskSubtype: string): void {
    const energyCost = TASK_ENERGY_COSTS[taskSubtype]?.energyCost || 10;
    const difficulty = TASK_ENERGY_COSTS[taskSubtype]?.difficulty || 'medium';
    
    // Update energy
    session.currentEnergy = Math.max(0, (session.currentEnergy ?? 100) - energyCost);
    
    // Track last task types for interleaving
    session.lastTaskTypes = [...(session.lastTaskTypes || []).slice(-3), difficulty];
    
    // Update combo
    const lastDifficulty = session.lastTaskTypes.length >= 2 
      ? session.lastTaskTypes[session.lastTaskTypes.length - 2] 
      : null;
    
    if (lastDifficulty && lastDifficulty !== difficulty) {
      // Different difficulty = combo continues
      session.comboCount = (session.comboCount || 0) + 1;
      session.comboMultiplier = Math.min(2.0, 1.0 + (session.comboCount * 0.1));
    } else {
      // Same difficulty = combo resets
      session.comboCount = 0;
      session.comboMultiplier = 1.0;
    }
    
    // Track hard tasks for power-ups
    if (difficulty === 'hard') {
      session.hardTasksCompletedToday = (session.hardTasksCompletedToday || 0) + 1;
      // Earn power-up every 3 hard tasks
      if (session.hardTasksCompletedToday % 3 === 0) {
        session.powerUpsAvailable = (session.powerUpsAvailable || 0) + 1;
      }
    }
    
    // Update micro-coaching counter
    session.tasksSinceMicroCard = (session.tasksSinceMicroCard || 0) + 1;
  }
  
  // Use a power-up (free skip)
  usePowerUp(userId: string): boolean {
    const session = this.getSession(userId);
    if ((session.powerUpsAvailable || 0) > 0) {
      session.powerUpsAvailable = (session.powerUpsAvailable || 1) - 1;
      session.powerUpsUsedToday = (session.powerUpsUsedToday || 0) + 1;
      return true;
    }
    return false;
  }
  
  // Get gamification state for UI
  getGamificationState(session: SpotlightSession): GamificationState {
    return {
      comboCount: session.comboCount || 0,
      comboMultiplier: session.comboMultiplier || 1.0,
      currentStreak: session.currentStreak || 0,
      powerUpsAvailable: session.powerUpsAvailable || 0,
      hardTasksCompleted: session.hardTasksCompletedToday || 0,
      tasksSinceMicroCard: session.tasksSinceMicroCard || 0,
    };
  }

  // Get customer IDs currently claimed by OTHER users (within last 5 minutes)
  private async getClaimedCustomerIds(excludeUserId: string): Promise<string[]> {
    const claimTimeout = 5 * 60 * 1000; // 5 minutes
    const cutoffTime = new Date(Date.now() - claimTimeout);
    
    try {
      const claims = await db.select({
        customerId: spotlightCustomerClaims.customerId,
      })
        .from(spotlightCustomerClaims)
        .where(and(
          ne(spotlightCustomerClaims.userId, excludeUserId),
          gte(spotlightCustomerClaims.claimedAt, cutoffTime)
        ));
      
      return claims.map(c => c.customerId);
    } catch (error) {
      console.error('[Spotlight] Error getting claimed customer IDs:', error);
      return [];
    }
  }

  // Claim a customer for this user - returns true if claim succeeded
  // Uses atomic INSERT ON CONFLICT to prevent race conditions
  private async claimCustomer(userId: string, customerId: string): Promise<boolean> {
    const today = this.getTodayKey();
    
    try {
      // Atomic claim: INSERT with ON CONFLICT that only updates if claim is expired OR belongs to same user
      // The unique constraint on customer_id ensures only one row per customer
      const result = await db.execute<{ customer_id: string }>(sql`
        INSERT INTO spotlight_customer_claims (customer_id, user_id, session_date, claimed_at)
        VALUES (${customerId}, ${userId}, ${today}, NOW())
        ON CONFLICT (customer_id) DO UPDATE SET
          user_id = ${userId},
          session_date = ${today},
          claimed_at = NOW()
        WHERE 
          spotlight_customer_claims.user_id = ${userId}
          OR spotlight_customer_claims.claimed_at < NOW() - INTERVAL '5 minutes'
        RETURNING customer_id
      `);
      
      // Check if result has rows - Drizzle/Neon returns result with rowCount property
      // For INSERT ... RETURNING, rowCount indicates how many rows were returned
      const rowCount = (result as any).rowCount ?? (Array.isArray(result) ? result.length : 0);
      const success = rowCount > 0;
      
      if (!success) {
        console.log(`[Spotlight] Customer ${customerId} claimed by another user`);
      }
      
      return success;
    } catch (error) {
      console.error('[Spotlight] Error claiming customer:', error);
      return false;
    }
  }

  // Release claim when task is completed
  private async releaseClaim(userId: string): Promise<void> {
    try {
      // Delete the claim from the atomic claims table
      await db.delete(spotlightCustomerClaims)
        .where(eq(spotlightCustomerClaims.userId, userId));
    } catch (error) {
      console.error('[Spotlight] Error releasing claim:', error);
    }
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

      // Get customer IDs claimed by other users to avoid duplicates
      const claimedByOthers = await this.getClaimedCustomerIds(userId);
      let excludeIds = [...session.skippedCustomerIds, ...claimedByOthers];

      // For calls and outreach, also exclude recently contacted customers (auto-skip)
      if (nextBucket === 'calls' || nextBucket === 'outreach') {
        const recentlyContacted = await this.getRecentlyContactedIds(7);
        excludeIds = [...excludeIds, ...recentlyContacted];
      }

      let task: SpotlightTask | null = null;
      
      switch (nextBucket) {
        case 'calls':
          task = await this.findCallTask(userId, excludeIds);
          break;
        case 'follow_ups':
          task = await this.findFollowUpTask(userId, excludeIds);
          break;
        case 'outreach':
          task = await this.findOutreachTask(userId, excludeIds);
          break;
        case 'data_hygiene':
          task = await this.findHygieneTask(userId, excludeIds);
          break;
        case 'enablement':
          task = await this.findEnablementTask(userId, excludeIds);
          break;
      }

      if (!task) {
        // Try fallback light task before marking bucket as complete
        task = await this.findFallbackTask(nextBucket, userId, excludeIds);
        
        if (!task) {
          // Truly no tasks available - mark bucket as complete
          const bucketData = session.buckets.find(b => b.bucket === nextBucket);
          if (bucketData) {
            bucketData.completed = bucketData.target;
          }
          return this.getNextTask(userId);
        }
      }
      
      // Claim this customer so other users won't get the same task
      const claimSuccess = await this.claimCustomer(userId, task.customerId);
      
      if (!claimSuccess) {
        // Another user claimed this customer - add to skipped and retry
        console.log(`[Spotlight] Claim failed for customer ${task.customerId}, retrying with different task`);
        excludeIds.push(task.customerId);
        session.skippedCustomerIds.push(task.customerId);
        return this.getNextTask(userId);
      }
      
      return { task, session, allDone: false };
    } catch (error) {
      console.error('[Spotlight] Error getting next task:', error);
      return { task: null, session, allDone: true };
    }
  }

  private async findCallTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    // PRIORITY 1: Check for hot/urgent leads first - they take precedence
    const skippedLeadIds = skippedIds
      .filter(id => id.startsWith('lead-'))
      .map(id => parseInt(id.replace('lead-', '')))
      .filter(id => !isNaN(id));
    
    const leadTask = await this.findLeadCallTask(userId, skippedLeadIds);
    if (leadTask) {
      return leadTask;
    }

    // PRIORITY 2: Check for customer call tasks
    let conditions = [
      eq(customers.doNotContact, false),
      isNotNull(customers.phone),
      or(
        isNull(customers.salesRepId),
        eq(customers.salesRepId, userId)
      ),
      // Exclude internal 4sgraphics contacts from SPOTLIGHT
      sql`LOWER(${customers.email}) NOT LIKE '%4sgraphics%'`,
    ];
    
    // Filter out customer IDs (non-lead IDs)
    const customerSkippedIds = skippedIds.filter(id => !id.startsWith('lead-'));
    if (customerSkippedIds.length > 0) {
      conditions.push(notInArray(customers.id, customerSkippedIds));
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
        isHotProspect: customers.isHotProspect,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.isHotProspect), asc(customers.updatedAt))
      .limit(1);

    if (result.length > 0) {
      const customer = result[0];
      return this.buildTaskWithMachineContext(customer, 'calls', 'sales_call');
    }
    return null;
  }

  private async findFollowUpTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    const now = new Date();
    
    // PRIORITY 1: Check for high-priority Shopify quotes first (abandoned carts, draft orders)
    try {
      const shopifyQuoteResult = await db
        .select({
          id: sentQuotes.id,
          quoteNumber: sentQuotes.quoteNumber,
          customerName: sentQuotes.customerName,
          customerEmail: sentQuotes.customerEmail,
          customerId: sentQuotes.customerId,
          totalAmount: sentQuotes.totalAmount,
          source: sentQuotes.source,
          priority: sentQuotes.priority,
          followUpDueAt: sentQuotes.followUpDueAt,
          shopifyDraftOrderId: sentQuotes.shopifyDraftOrderId,
          shopifyCheckoutId: sentQuotes.shopifyCheckoutId,
        })
        .from(sentQuotes)
        .where(and(
          eq(sentQuotes.priority, 'high'),
          eq(sentQuotes.outcome, 'pending'),
          or(
            eq(sentQuotes.source, 'shopify_draft'),
            eq(sentQuotes.source, 'shopify_abandoned_cart')
          ),
          lte(sentQuotes.followUpDueAt, now),
          // Exclude already processed quotes by checking for customerEmail not in skippedIds
          ...(skippedIds.length > 0 ? [sql`${sentQuotes.customerEmail} NOT IN (${sql.raw(skippedIds.map(id => `'${id}'`).join(','))})`] : [])
        ))
        .orderBy(asc(sentQuotes.followUpDueAt))
        .limit(1);
      
      if (shopifyQuoteResult.length > 0) {
        const quote = shopifyQuoteResult[0];
        
        // Try to find linked customer, or create a temporary one
        let customer: any = null;
        if (quote.customerId) {
          const customerResult = await db.select().from(customers).where(eq(customers.id, quote.customerId)).limit(1);
          if (customerResult.length > 0) {
            customer = customerResult[0];
          }
        }
        
        // If no linked customer, search by email
        if (!customer && quote.customerEmail) {
          const customerByEmail = await db.select().from(customers).where(eq(customers.email, quote.customerEmail)).limit(1);
          if (customerByEmail.length > 0) {
            customer = customerByEmail[0];
          }
        }
        
        // Create a synthetic customer for the task if not found
        if (!customer) {
          customer = {
            id: `shopify_quote_${quote.id}`,
            company: quote.customerName,
            firstName: null,
            lastName: null,
            email: quote.customerEmail,
            phone: null,
            address1: null,
            address2: null,
            city: null,
            province: null,
            zip: null,
            country: null,
            website: null,
            salesRepId: null,
            salesRepName: null,
            pricingTier: null,
          };
        }
        
        const isAbandonedCart = quote.source === 'shopify_abandoned_cart';
        const icon = isAbandonedCart ? '🛒' : '📋';
        const subtype = isAbandonedCart ? 'shopify_abandoned_cart' : 'shopify_draft_followup';
        const whyNow = isAbandonedCart 
          ? `${icon} Abandoned Cart: $${quote.totalAmount} - They left items in their cart!`
          : `${icon} Shopify Draft Order ${quote.quoteNumber}: $${quote.totalAmount} - Awaiting customer action`;
        
        return {
          id: `follow_ups::shopify_quote_${quote.id}::${customer.id}::${subtype}`,
          customerId: customer.id,
          bucket: 'follow_ups',
          taskSubtype: subtype,
          priority: 100, // Highest priority
          whyNow,
          outcomes: [
            { id: 'contacted', label: 'Contacted', icon: '✅' },
            { id: 'order_placed', label: 'Order Placed', icon: '🎉' },
            { id: 'skip', label: 'Skip for Now', icon: '⏭️' },
          ],
          customer: {
            id: customer.id,
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
          context: {
            sourceType: quote.source || undefined,
            followUpDueDate: quote.followUpDueAt?.toISOString(),
          },
        };
      }
    } catch (err) {
      console.error('[Spotlight] Error fetching Shopify quote tasks:', err);
    }
    
    // PRIORITY 2: Lead follow-up tasks (leads that need nurturing/follow-up)
    const skippedLeadIds = skippedIds
      .filter(id => id.startsWith('lead-'))
      .map(id => parseInt(id.replace('lead-', '')))
      .filter(id => !isNaN(id));
    
    const leadFollowUpTask = await this.findLeadFollowUpTask(userId, skippedLeadIds);
    if (leadFollowUpTask) {
      return leadFollowUpTask;
    }
    
    // PRIORITY 2.5: Emails sent yesterday containing Pricing or samples that need follow-up
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      
      // Find outbound emails from yesterday with pricing/samples keywords
      const emailFollowUps = await db
        .select({
          id: gmailMessages.id,
          subject: gmailMessages.subject,
          snippet: gmailMessages.snippet,
          toEmail: gmailMessages.toEmail,
          toName: gmailMessages.toName,
          sentAt: gmailMessages.sentAt,
          customerId: gmailMessages.customerId,
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
            updatedAt: customers.updatedAt,
            isHotProspect: customers.isHotProspect,
          },
        })
        .from(gmailMessages)
        .leftJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(and(
          eq(gmailMessages.userId, userId),
          eq(gmailMessages.direction, 'outbound'),
          gte(gmailMessages.sentAt, yesterday),
          lte(gmailMessages.sentAt, yesterdayEnd),
          or(
            sql`LOWER(${gmailMessages.subject}) LIKE '%pricing%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%sample%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%swatchbook%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%price list%'`,
            sql`LOWER(${gmailMessages.snippet}) LIKE '%pricing%'`,
            sql`LOWER(${gmailMessages.snippet}) LIKE '%sample%'`
          ),
          // Exclude already skipped customers
          ...(skippedIds.filter(id => !id.startsWith('lead-')).length > 0 
            ? [sql`${gmailMessages.customerId} NOT IN (${sql.raw(skippedIds.filter(id => !id.startsWith('lead-')).map(id => `'${id}'`).join(','))})`] 
            : []),
          // Exclude internal emails
          sql`LOWER(${gmailMessages.toEmail}) NOT LIKE '%4sgraphics%'`
        ))
        .orderBy(desc(gmailMessages.sentAt))
        .limit(1);
      
      if (emailFollowUps.length > 0 && emailFollowUps[0].customer) {
        const emailData = emailFollowUps[0];
        const subjectPreview = emailData.subject?.substring(0, 50) || 'Email';
        
        return {
          id: `follow_ups::email_${emailData.id}::${emailData.customer.id}::pricing_samples_followup`,
          customerId: emailData.customer.id,
          bucket: 'follow_ups',
          taskSubtype: 'pricing_samples_followup',
          priority: 85, // High priority - these are warm leads
          whyNow: `📧 Follow up on yesterday's email: "${subjectPreview}..." - Check if they have questions about pricing/samples`,
          outcomes: [
            { id: 'called', label: 'Called', icon: 'phone' },
            { id: 'email_sent', label: 'Sent Follow-up Email', icon: 'mail' },
            { id: 'replied', label: 'They Replied', icon: 'check' },
            { id: 'skip', label: 'Skip', icon: 'x' },
          ],
          customer: emailData.customer,
          context: {
            emailId: emailData.id,
            originalSubject: emailData.subject || undefined,
            sentAt: emailData.sentAt?.toISOString(),
            sourceType: 'email_pricing_samples',
          },
        };
      }
    } catch (err) {
      console.error('[Spotlight] Error fetching email follow-up tasks:', err);
    }
    
    // PRIORITY 3: Regular follow-up tasks
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
        sourceType: followUpTasks.sourceType,
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
          updatedAt: customers.updatedAt,
          isHotProspect: customers.isHotProspect,
        },
      })
      .from(followUpTasks)
      .leftJoin(customers, eq(followUpTasks.customerId, customers.id))
      .where(and(
        ...conditions,
        // Only show tasks for contacts assigned to this user OR unassigned contacts
        or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
        // Exclude internal 4sgraphics contacts from SPOTLIGHT
        or(isNull(customers.email), sql`LOWER(${customers.email}) NOT LIKE '%4sgraphics%'`)
      ))
      .orderBy(asc(followUpTasks.dueDate))
      .limit(1);

    if (result.length > 0 && result[0].customer) {
      const task = result[0];
      const subtype = task.taskType === 'quote_follow_up' ? 'sales_quote_follow_up' : 'sales_follow_up';
      const baseTask = this.buildTask(task.customer, 'follow_ups', subtype);
      
      // Add email source badge for tasks created from email intelligence
      let whyNowPrefix = '';
      if (task.sourceType === 'email_event') {
        whyNowPrefix = '📧 Email Intelligence: ';
      }
      
      return {
        ...baseTask,
        id: `follow_ups::${task.taskId}::${task.customer.id}::${subtype}`,
        whyNow: whyNowPrefix + (task.title || baseTask.whyNow),
        context: {
          followUpId: task.taskId,
          followUpTitle: task.title || undefined,
          followUpDueDate: task.dueDate?.toISOString(),
          sourceType: task.sourceType || undefined,
        },
      };
    }
    return null;
  }

  private async findOutreachTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    // PRIORITY 1: New leads that need first contact (trust building step 1)
    const skippedLeadIds = skippedIds
      .filter(id => id.startsWith('lead-'))
      .map(id => parseInt(id.replace('lead-', '')))
      .filter(id => !isNaN(id));
    
    const leadOutreachTask = await this.findLeadOutreachTask(userId, skippedLeadIds);
    if (leadOutreachTask) {
      return leadOutreachTask;
    }

    // PRIORITY 2: Customer outreach (no recent contact)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Filter out lead IDs from skipped IDs for customer queries
    const customerSkippedIds = skippedIds.filter(id => !id.startsWith('lead-'));

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
      // Exclude internal 4sgraphics contacts from SPOTLIGHT
      sql`LOWER(${customers.email}) NOT LIKE '%4sgraphics%'`,
    ];
    
    if (customerSkippedIds.length > 0) {
      conditions.push(notInArray(customers.id, customerSkippedIds));
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
        isHotProspect: customers.isHotProspect,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.isHotProspect), asc(customers.updatedAt))
      .limit(1);

    if (result.length > 0) {
      const customer = result[0];
      return this.buildTaskWithMachineContext(customer, 'outreach', 'outreach_no_contact');
    }
    return null;
  }

  private async findHygieneTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    // Build a SQL condition to exclude generic email domains (deprioritized)
    // These customers are saved for last when all other hygiene work is done
    const genericEmailConditions = GENERIC_EMAIL_DOMAINS.map(domain => 
      sql`LOWER(${customers.email}) LIKE ${'%@' + domain}`
    );
    const isGenericEmail = or(...genericEmailConditions);
    const isNotGenericEmail = sql`NOT (${isGenericEmail})`;
    
    // For sales rep hygiene, check BOTH salesRepId AND salesRepName to handle edge cases
    // where only one field might be set (defensive fallback)
    // Priority order: bounced emails first, then business emails, generic emails last
    const priorityOrder = [
      // HIGHEST priority: Bounced emails - person may have left company or business closed
      { subtype: 'hygiene_bounced_email', condition: null, excludeGeneric: false, special: 'bounced_email' },
      // High priority: Business email domain customers
      { subtype: 'hygiene_sales_rep', condition: and(isNull(customers.salesRepId), isNull(customers.salesRepName)), excludeGeneric: true },
      { subtype: 'hygiene_pricing_tier', condition: isNull(customers.pricingTier), excludeGeneric: true },
      { subtype: 'hygiene_email', condition: isNull(customers.email), excludeGeneric: false }, // Can't exclude by email if email is null
      { subtype: 'hygiene_name', condition: and(isNull(customers.firstName), isNull(customers.lastName)), excludeGeneric: true },
      { subtype: 'hygiene_company', condition: isNull(customers.company), excludeGeneric: true },
      { subtype: 'hygiene_phone', condition: isNull(customers.phone), excludeGeneric: true },
      // Machine profiles - checked async after core data is complete
      { subtype: 'hygiene_machines', condition: null, excludeGeneric: true },
      // Low priority: Generic email domain customers (gmail, yahoo, etc.) - saved for last
      { subtype: 'hygiene_sales_rep_generic', condition: and(isNull(customers.salesRepId), isNull(customers.salesRepName)), onlyGeneric: true },
      { subtype: 'hygiene_pricing_tier_generic', condition: isNull(customers.pricingTier), onlyGeneric: true },
      { subtype: 'hygiene_name_generic', condition: and(isNull(customers.firstName), isNull(customers.lastName)), onlyGeneric: true },
      { subtype: 'hygiene_company_generic', condition: isNull(customers.company), onlyGeneric: true },
      { subtype: 'hygiene_phone_generic', condition: isNull(customers.phone), onlyGeneric: true },
    ];

    for (let i = 0; i < priorityOrder.length; i++) {
      const item = priorityOrder[i];
      const { subtype, condition } = item;
      const excludeGeneric = 'excludeGeneric' in item ? item.excludeGeneric : false;
      const onlyGeneric = 'onlyGeneric' in item ? item.onlyGeneric : false;
      const special = 'special' in item ? (item as any).special : null;
      
      // Special handling for bounced email detection - queries gmail for bounce messages
      if (special === 'bounced_email') {
        const bouncedCustomer = await this.findBouncedEmailCustomer(userId, skippedIds);
        if (bouncedCustomer) {
          return this.buildTask(bouncedCustomer.customer, 'data_hygiene', 'hygiene_bounced_email', i + 1, {
            bouncedEmail: bouncedCustomer.bouncedEmail,
            bounceSubject: bouncedCustomer.bounceSubject,
            bounceDate: bouncedCustomer.bounceDate,
          });
        }
        continue;
      }
      
      // Special handling for machine hygiene - requires async check
      if (subtype === 'hygiene_machines') {
        // Find customers with complete core data but missing machine profiles
        let machineConditions: any[] = [
          eq(customers.doNotContact, false),
          isNotNull(customers.email),
          isNotNull(customers.phone),
          isNotNull(customers.pricingTier),
          or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
          sql`LOWER(${customers.email}) NOT LIKE '%4sgraphics%'`,
        ];
        // Exclude generic email domains for machine hygiene (they're deprioritized)
        if (excludeGeneric) {
          machineConditions.push(isNotGenericEmail);
        }
        if (skippedIds.length > 0) {
          machineConditions.push(notInArray(customers.id, skippedIds));
        }
        
        const machineProfileCandidates = await db.select({
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
          isHotProspect: customers.isHotProspect,
        })
        .from(customers)
        .where(and(...machineConditions))
        .orderBy(asc(customers.updatedAt))
        .limit(5);
        
        for (const customer of machineProfileCandidates) {
          const needsMachine = await checkMissingMachineProfile(customer.id, customer);
          if (needsMachine) {
            // Map _generic subtypes back to base subtype for UI consistency
            const displaySubtype = subtype.replace('_generic', '');
            return this.buildTask(customer, 'data_hygiene', displaySubtype, i + 1);
          }
        }
        continue;
      }
      
      let whereConditions: any[] = [
        condition,
        eq(customers.doNotContact, false),
        // Exclude internal 4sgraphics contacts from SPOTLIGHT (allow null emails for hygiene_email subtype)
        or(isNull(customers.email), sql`LOWER(${customers.email}) NOT LIKE '%4sgraphics%'`),
      ];
      
      if (skippedIds.length > 0) {
        whereConditions.push(notInArray(customers.id, skippedIds));
      }
      
      // Filter by generic email domain based on priority
      if (excludeGeneric) {
        // Exclude generic email domains for high-priority hygiene tasks
        // Only filter if email is not null (can't filter null emails by domain)
        whereConditions.push(or(isNull(customers.email), isNotGenericEmail));
      } else if (onlyGeneric) {
        // Only include generic email domains for low-priority hygiene tasks
        whereConditions.push(isGenericEmail);
      }
      
      const baseSubtype = subtype.replace('_generic', '');
      if (baseSubtype !== 'hygiene_sales_rep') {
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
          updatedAt: customers.updatedAt,
          isHotProspect: customers.isHotProspect,
        })
        .from(customers)
        .where(and(...whereConditions))
        .orderBy(desc(customers.updatedAt))
        .limit(1);

      if (result.length > 0) {
        const customer = result[0];
        
        // Auto-fix: If customer is missing email but has a contact with email, promote it to primary
        if (subtype === 'hygiene_email') {
          const contactWithEmail = await db.select({ email: customerContacts.email })
            .from(customerContacts)
            .where(and(
              eq(customerContacts.customerId, customer.id),
              isNotNull(customerContacts.email)
            ))
            .limit(1);
          
          if (contactWithEmail.length > 0 && contactWithEmail[0].email) {
            // Auto-promote contact email to primary and skip this hygiene task
            await db.update(customers)
              .set({ email: contactWithEmail[0].email, updatedAt: new Date() })
              .where(eq(customers.id, customer.id));
            console.log(`[Spotlight] Auto-fixed: Promoted contact email ${contactWithEmail[0].email} to primary for ${customer.company || customer.id}`);
            // Decrement i to retry this priority level (find another customer needing email)
            i--;
            continue;
          }
        }
        
        // Auto-fix: If customer is missing phone but has a contact with phone, promote it to primary
        if (subtype === 'hygiene_phone') {
          const contactWithPhone = await db.select({ phone: customerContacts.phone })
            .from(customerContacts)
            .where(and(
              eq(customerContacts.customerId, customer.id),
              isNotNull(customerContacts.phone)
            ))
            .limit(1);
          
          if (contactWithPhone.length > 0 && contactWithPhone[0].phone) {
            // Auto-promote contact phone to primary and skip this hygiene task
            await db.update(customers)
              .set({ phone: contactWithPhone[0].phone, updatedAt: new Date() })
              .where(eq(customers.id, customer.id));
            console.log(`[Spotlight] Auto-fixed: Promoted contact phone ${contactWithPhone[0].phone} to primary for ${customer.company || customer.id}`);
            // Decrement i to retry this priority level (find another customer needing phone)
            i--;
            continue;
          }
        }
        
        // Map _generic subtypes back to base subtype for UI consistency
        const displaySubtype = subtype.replace('_generic', '');
        return this.buildTask(customer, 'data_hygiene', displaySubtype, i + 1);
      }
    }

    return null;
  }
  
  private async findBouncedEmailCustomer(userId: string, skippedIds: string[]): Promise<{
    customer: any;
    bouncedEmail: string;
    bounceSubject: string;
    bounceDate: string;
  } | null> {
    // Look for bounce notification emails in the user's gmail messages
    // Common bounce indicators:
    // - From: mailer-daemon@*, postmaster@*
    // - Subject contains: "undeliverable", "delivery", "failed", "returned", "bounce", "rejected"
    const bouncePatterns = [
      'mailer-daemon',
      'postmaster',
      'mail delivery',
      'mail-delivery',
    ];
    
    const subjectPatterns = [
      'undeliverable',
      'delivery failed',
      'delivery failure',
      'delivery status',
      'mail delivery',
      'returned mail',
      'bounce',
      'rejected',
      'could not be delivered',
      'not delivered',
    ];
    
    // Build SQL pattern conditions for bounce detection
    const fromConditions = bouncePatterns.map(pattern => 
      sql`LOWER(${gmailMessages.fromEmail}) LIKE ${'%' + pattern + '%'}`
    );
    
    const subjectConditions = subjectPatterns.map(pattern =>
      sql`LOWER(${gmailMessages.subject}) LIKE ${'%' + pattern + '%'}`
    );
    
    // Find bounce messages from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
      // Query for bounce messages that mention customer emails
      const bounceMessages = await db
        .select({
          id: gmailMessages.id,
          fromEmail: gmailMessages.fromEmail,
          subject: gmailMessages.subject,
          bodyText: gmailMessages.bodyText,
          sentAt: gmailMessages.sentAt,
          toEmail: gmailMessages.toEmail,
        })
        .from(gmailMessages)
        .where(and(
          eq(gmailMessages.userId, userId),
          or(...fromConditions, ...subjectConditions),
          sql`${gmailMessages.sentAt} > ${thirtyDaysAgo}`,
          eq(gmailMessages.direction, 'inbound'),
        ))
        .orderBy(desc(gmailMessages.sentAt))
        .limit(20);
      
      if (bounceMessages.length === 0) {
        return null;
      }
      
      // For each bounce message, try to extract the bounced email address
      // and match it to a customer
      for (const bounce of bounceMessages) {
        // Extract email addresses from the bounce message body and subject
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const bodyEmails = (bounce.bodyText || '').match(emailRegex) || [];
        const subjectEmails = (bounce.subject || '').match(emailRegex) || [];
        const allEmails = [...new Set([...bodyEmails, ...subjectEmails])];
        
        // Filter out common system emails
        const potentialBouncedEmails = allEmails.filter(email => {
          const lower = email.toLowerCase();
          return !lower.includes('mailer-daemon') && 
                 !lower.includes('postmaster') &&
                 !lower.includes('4sgraphics') &&
                 !lower.includes('noreply') &&
                 !lower.includes('no-reply');
        });
        
        // Try to match each potential bounced email to a customer
        for (const bouncedEmail of potentialBouncedEmails) {
          const normalizedEmail = bouncedEmail.toLowerCase().trim();
          
          // Check if this customer was already skipped
          const customerMatch = await db
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
              isHotProspect: customers.isHotProspect,
            })
            .from(customers)
            .where(and(
              sql`LOWER(${customers.email}) = ${normalizedEmail}`,
              eq(customers.doNotContact, false),
              skippedIds.length > 0 ? notInArray(customers.id, skippedIds) : sql`1=1`,
              or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
            ))
            .limit(1);
          
          if (customerMatch.length > 0) {
            // Also check customer contacts
            return {
              customer: customerMatch[0],
              bouncedEmail: normalizedEmail,
              bounceSubject: bounce.subject || 'Delivery failure',
              bounceDate: bounce.sentAt?.toISOString() || new Date().toISOString(),
            };
          }
          
          // Check customer contacts
          const contactMatch = await db
            .select({
              customerId: customerContacts.customerId,
              email: customerContacts.email,
            })
            .from(customerContacts)
            .innerJoin(customers, eq(customers.id, customerContacts.customerId))
            .where(and(
              sql`LOWER(${customerContacts.email}) = ${normalizedEmail}`,
              eq(customers.doNotContact, false),
              skippedIds.length > 0 ? notInArray(customers.id, skippedIds) : sql`1=1`,
              or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
            ))
            .limit(1);
          
          if (contactMatch.length > 0) {
            // Get the full customer data
            const customer = await db
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
                isHotProspect: customers.isHotProspect,
              })
              .from(customers)
              .where(eq(customers.id, contactMatch[0].customerId))
              .limit(1);
            
            if (customer.length > 0) {
              return {
                customer: customer[0],
                bouncedEmail: normalizedEmail,
                bounceSubject: bounce.subject || 'Delivery failure',
                bounceDate: bounce.sentAt?.toISOString() || new Date().toISOString(),
              };
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('[Spotlight] Error finding bounced email customers:', error);
      return null;
    }
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
      // Exclude internal 4sgraphics contacts from SPOTLIGHT
      sql`LOWER(${customers.email}) NOT LIKE '%4sgraphics%'`,
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
        isHotProspect: customers.isHotProspect,
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

  // ========== FALLBACK LIGHT TASKS ==========
  // When the queue is empty, generate light tasks to ensure reps always have a full day plan

  private async findFallbackTask(bucket: TaskBucket, userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    // Get ANY customer that can receive a light task (very relaxed criteria)
    let conditions = [
      eq(customers.doNotContact, false),
      sql`LOWER(COALESCE(${customers.email}, '')) NOT LIKE '%4sgraphics%'`,
    ];
    
    if (skippedIds.length > 0) {
      conditions.push(notInArray(customers.id, skippedIds));
    }

    // Prefer customers assigned to this rep or unassigned
    conditions.push(
      or(
        isNull(customers.salesRepId),
        eq(customers.salesRepId, userId)
      )
    );

    // Order by random for variety, but prioritize those with more data
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
        isHotProspect: customers.isHotProspect,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(sql`RANDOM()`)
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const customer = result[0];
    const subtype = this.getLightTaskSubtype(bucket);
    
    return this.buildTask(customer, bucket, subtype, 50); // Low priority for light tasks
  }

  private getLightTaskSubtype(bucket: TaskBucket): string {
    const lightTasks: Record<TaskBucket, string[]> = {
      calls: ['light_call_check_in', 'light_call_intro'],
      follow_ups: ['light_follow_up_confirm', 'light_follow_up_thank'],
      outreach: ['light_outreach_linkedin', 'light_outreach_website'],
      data_hygiene: ['light_hygiene_verify', 'light_hygiene_notes'],
      enablement: ['light_enablement_catalog', 'light_enablement_newsletter'],
    };
    
    const options = lightTasks[bucket];
    return options[Math.floor(Math.random() * options.length)];
  }

  private async buildTaskWithMachineContext(customer: any, bucket: TaskBucket, subtype: string, priority: number = 1): Promise<SpotlightTask> {
    const isHot = customer.isHotProspect === true;
    let whyNow = WHY_NOW_MESSAGES[subtype] || 'Take action on this customer.';
    
    if (isHot) {
      whyNow = `🔥 HOT PROSPECT - ${whyNow} Call more often, email at least weekly!`;
    }
    
    // Fetch machine profile for context
    let context: SpotlightTask['context'] = {};
    
    // For calls and outreach, add machine context if available
    if (bucket === 'calls' || bucket === 'outreach') {
      try {
        const machineTypes = await getCustomerMachineProfiles(customer.id);
        if (machineTypes.length > 0) {
          // These are now async - fetch labels and products from admin taxonomy
          const machineLabels = await Promise.all(machineTypes.map(m => getMachineLabel(m)));
          const suggestedProducts = await getProductSuggestionsForMachines(machineTypes);
          
          context.machineTypes = machineTypes;
          context.machineLabels = machineLabels;
          context.suggestedProducts = suggestedProducts;
          
          // Build machine context message
          const machineList = machineLabels.slice(0, 2).join(' & ');
          const productList = suggestedProducts.slice(0, 2).join(', ');
          
          if (machineLabels.length > 0 && suggestedProducts.length > 0) {
            context.machineContext = `This client has ${machineList} - talk to them about ${productList}!`;
          } else if (machineLabels.length > 0) {
            context.machineContext = `This client has ${machineList} machines.`;
          }
        }
      } catch (e) {
        console.error('[Spotlight] Error fetching machine context:', e);
      }
    }
    
    return {
      id: `${bucket}::${customer.id}::${subtype}`,
      customerId: customer.id.toString(),
      bucket,
      taskSubtype: subtype,
      priority: isHot ? priority + 100 : priority,
      whyNow,
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
        isHotProspect: customer.isHotProspect,
        updatedAt: customer.updatedAt,
      },
      context,
    };
  }
  
  private buildTask(customer: any, bucket: TaskBucket, subtype: string, priority: number = 1, extraContext?: Record<string, any>): SpotlightTask {
    const isHot = customer.isHotProspect === true;
    let whyNow = WHY_NOW_MESSAGES[subtype] || 'Take action on this customer.';
    
    // Add bounce details to the whyNow message for bounced email tasks
    if (subtype === 'hygiene_bounced_email' && extraContext?.bouncedEmail) {
      const bounceDate = extraContext.bounceDate ? new Date(extraContext.bounceDate).toLocaleDateString() : 'recently';
      whyNow = `Email to ${extraContext.bouncedEmail} bounced on ${bounceDate}. Subject: "${extraContext.bounceSubject || 'Delivery failure'}". The contact may have left the company or the business closed.`;
    }
    
    if (isHot) {
      whyNow = `🔥 HOT PROSPECT - ${whyNow} Call more often, email at least weekly!`;
    }
    
    return {
      id: `${bucket}::${customer.id}::${subtype}`,
      customerId: customer.id.toString(),
      bucket,
      taskSubtype: subtype,
      priority: isHot ? priority + 100 : priority,
      whyNow,
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
        isHotProspect: customer.isHotProspect,
        updatedAt: customer.updatedAt,
      },
      extraContext,
    };
  }

  // Build a task for a lead (not a customer)
  private buildLeadTask(lead: any, bucket: TaskBucket, subtype: string, priority: number = 1): SpotlightTask {
    const isHot = lead.priority === 'high' || lead.priority === 'urgent';
    let whyNow = WHY_NOW_MESSAGES[subtype] || 'Work on this lead to move them forward.';
    
    // Parse the name to extract first/last name for display
    const nameParts = (lead.name || '').trim().split(' ');
    const firstName = nameParts[0] || null;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
    
    return {
      id: `${bucket}::lead::${lead.id}::${subtype}`,
      customerId: `lead-${lead.id}`, // Prefix with 'lead-' to distinguish from customer IDs
      leadId: lead.id,
      isLeadTask: true,
      bucket,
      taskSubtype: subtype,
      priority: isHot ? priority + 100 : priority,
      whyNow,
      outcomes: TASK_OUTCOMES[subtype] || [
        { id: 'done', label: 'Done', icon: 'check', nextAction: { type: 'mark_complete' } },
        { id: 'skip', label: 'Skip', icon: 'x', nextAction: { type: 'no_action' } },
      ],
      // Provide customer-like structure for compatibility
      customer: {
        id: `lead-${lead.id}`,
        company: lead.company,
        firstName,
        lastName,
        email: lead.email,
        phone: lead.phone || lead.mobile,
        address1: lead.street,
        address2: lead.street2,
        city: lead.city,
        province: lead.state,
        zip: lead.zip,
        country: lead.country,
        website: lead.website,
        salesRepId: lead.salesRepId,
        salesRepName: lead.salesRepName,
        pricingTier: lead.pricingTier,
      },
      lead: {
        id: lead.id,
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        mobile: lead.mobile,
        stage: lead.stage,
        priority: lead.priority,
        score: lead.score,
        city: lead.city,
        state: lead.state,
        salesRepId: lead.salesRepId,
        salesRepName: lead.salesRepName,
        firstEmailSentAt: lead.firstEmailSentAt,
        firstEmailReplyAt: lead.firstEmailReplyAt,
        lastContactAt: lead.lastContactAt,
        totalTouchpoints: lead.totalTouchpoints,
      },
      context: {
        sourceType: 'lead',
      },
    };
  }

  // Find hot/urgent leads that need calls (for the calls bucket)
  private async findLeadCallTask(userId: string, skippedLeadIds: number[]): Promise<SpotlightTask | null> {
    try {
      let conditions = [
        // Only active leads (not converted or lost)
        notInArray(leads.stage, ['converted', 'lost']),
        // Has phone number
        or(isNotNull(leads.phone), isNotNull(leads.mobile)),
        // Assigned to this user or unassigned
        or(isNull(leads.salesRepId), eq(leads.salesRepId, userId)),
        // Priority conditions - only hot/urgent/qualified leads for calls
        or(
          eq(leads.priority, 'urgent'),
          eq(leads.priority, 'high'),
          eq(leads.stage, 'qualified')
        ),
      ];
      
      if (skippedLeadIds.length > 0) {
        conditions.push(notInArray(leads.id, skippedLeadIds));
      }

      const result = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(
          // Urgent first, then high priority, then by score
          sql`CASE WHEN ${leads.priority} = 'urgent' THEN 0 WHEN ${leads.priority} = 'high' THEN 1 ELSE 2 END`,
          desc(leads.score),
          asc(leads.lastContactAt)
        )
        .limit(1);

      if (result.length > 0) {
        const lead = result[0];
        let subtype = 'lead_call_qualified';
        if (lead.priority === 'urgent') subtype = 'lead_call_urgent';
        else if (lead.priority === 'high') subtype = 'lead_call_hot';
        
        return this.buildLeadTask(lead, 'calls', subtype, lead.priority === 'urgent' ? 200 : 150);
      }
      return null;
    } catch (error) {
      console.error('[Spotlight] Error finding lead call task:', error);
      return null;
    }
  }

  // Find new leads for outreach (for the outreach bucket)
  private async findLeadOutreachTask(userId: string, skippedLeadIds: number[]): Promise<SpotlightTask | null> {
    try {
      let conditions = [
        // Only new or contacted leads that haven't been emailed yet
        inArray(leads.stage, ['new', 'contacted']),
        // Has email
        isNotNull(leads.email),
        // Not yet emailed (trust building step 1)
        isNull(leads.firstEmailSentAt),
        // Assigned to this user or unassigned
        or(isNull(leads.salesRepId), eq(leads.salesRepId, userId)),
      ];
      
      if (skippedLeadIds.length > 0) {
        conditions.push(notInArray(leads.id, skippedLeadIds));
      }

      const result = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(
          // Higher priority first
          sql`CASE WHEN ${leads.priority} = 'urgent' THEN 0 WHEN ${leads.priority} = 'high' THEN 1 WHEN ${leads.priority} = 'medium' THEN 2 ELSE 3 END`,
          desc(leads.score),
          asc(leads.createdAt)
        )
        .limit(1);

      if (result.length > 0) {
        const lead = result[0];
        const subtype = lead.stage === 'new' ? 'lead_outreach_new' : 'lead_outreach_intro';
        return this.buildLeadTask(lead, 'outreach', subtype, lead.priority === 'high' || lead.priority === 'urgent' ? 80 : 50);
      }
      return null;
    } catch (error) {
      console.error('[Spotlight] Error finding lead outreach task:', error);
      return null;
    }
  }

  // Find leads that need follow-up (for the follow_ups bucket)
  private async findLeadFollowUpTask(userId: string, skippedLeadIds: number[]): Promise<SpotlightTask | null> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    try {
      // Priority order for lead follow-ups:
      // 1. Leads emailed but no reply after 3+ days
      // 2. Qualified leads not contacted in 5+ days
      // 3. Nurturing leads going stale (14+ days no contact)

      // Check for no-reply leads first (emailed but no response)
      let conditions = [
        notInArray(leads.stage, ['converted', 'lost']),
        isNotNull(leads.firstEmailSentAt),
        isNull(leads.firstEmailReplyAt),
        lt(leads.firstEmailSentAt, threeDaysAgo),
        or(isNull(leads.salesRepId), eq(leads.salesRepId, userId)),
      ];
      
      if (skippedLeadIds.length > 0) {
        conditions.push(notInArray(leads.id, skippedLeadIds));
      }

      let result = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.score), asc(leads.firstEmailSentAt))
        .limit(1);

      if (result.length > 0) {
        return this.buildLeadTask(result[0], 'follow_ups', 'lead_follow_up_no_reply', 60);
      }

      // Check for qualified leads needing follow-up
      conditions = [
        eq(leads.stage, 'qualified'),
        or(isNull(leads.lastContactAt), lt(leads.lastContactAt, threeDaysAgo)),
        or(isNull(leads.salesRepId), eq(leads.salesRepId, userId)),
      ];
      
      if (skippedLeadIds.length > 0) {
        conditions.push(notInArray(leads.id, skippedLeadIds));
      }

      result = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.score), asc(leads.lastContactAt))
        .limit(1);

      if (result.length > 0) {
        return this.buildLeadTask(result[0], 'follow_ups', 'lead_follow_up_qualified', 55);
      }

      // Check for stale nurturing leads
      conditions = [
        eq(leads.stage, 'nurturing'),
        or(isNull(leads.lastContactAt), lt(leads.lastContactAt, fourteenDaysAgo)),
        or(isNull(leads.salesRepId), eq(leads.salesRepId, userId)),
      ];
      
      if (skippedLeadIds.length > 0) {
        conditions.push(notInArray(leads.id, skippedLeadIds));
      }

      result = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(asc(leads.lastContactAt))
        .limit(1);

      if (result.length > 0) {
        return this.buildLeadTask(result[0], 'follow_ups', 'lead_follow_up_stale', 40);
      }

      // General nurturing leads
      conditions = [
        inArray(leads.stage, ['contacted', 'nurturing']),
        or(isNull(leads.lastContactAt), lt(leads.lastContactAt, sevenDaysAgo)),
        or(isNull(leads.salesRepId), eq(leads.salesRepId, userId)),
      ];
      
      if (skippedLeadIds.length > 0) {
        conditions.push(notInArray(leads.id, skippedLeadIds));
      }

      result = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.score), asc(leads.lastContactAt))
        .limit(1);

      if (result.length > 0) {
        return this.buildLeadTask(result[0], 'follow_ups', 'lead_follow_up_nurture', 35);
      }

      return null;
    } catch (error) {
      console.error('[Spotlight] Error finding lead follow-up task:', error);
      return null;
    }
  }

  async completeTask(
    userId: string, 
    taskId: string, 
    outcomeId: string,
    field?: string, 
    value?: string,
    notes?: string,
    customFollowUpDays?: number
  ): Promise<{ success: boolean; nextFollowUp?: { date: Date; type: string }; deleted?: boolean }> {
    const session = this.getSession(userId);
    
    let bucket: TaskBucket;
    let customerId: string;
    let subtype: string;
    let followUpId: number | null = null;
    let isLeadTask = false;
    let leadId: number | null = null;
    
    if (taskId.includes('::')) {
      const parts = taskId.split('::');
      bucket = parts[0] as TaskBucket;
      // Handle different task ID formats:
      // - Lead tasks: bucket::lead::leadId::subtype (4 parts, parts[1] = 'lead')
      // - Follow-up tasks: bucket::taskId::customerId::subtype (4 parts, parts[1] = numeric)
      // - Standard tasks: bucket::customerId::subtype (3 parts)
      if (parts.length === 4) {
        if (parts[1] === 'lead') {
          // Lead task format: bucket::lead::leadId::subtype
          isLeadTask = true;
          leadId = parseInt(parts[2]);
          customerId = `lead-${parts[2]}`; // Synthetic customer ID for leads
          subtype = parts[3];
        } else {
          // follow_ups format: bucket::taskId::customerId::subtype
          followUpId = parseInt(parts[1]);
          customerId = parts[2];
          subtype = parts[3];
        }
      } else {
        // Standard format: bucket::customerId::subtype
        customerId = parts[1];
        subtype = parts[2];
      }
    } else {
      // Legacy underscore format - not recommended, keep for backward compatibility
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
        'hygiene_machines': [], // Machine profiles managed via separate API
      };

      const allowedFields = subtypeAllowedFields[subtype] || [];
      if (allowedFields.includes(field)) {
        // Get the customer first to check for Odoo partner ID and get old value
        const [existingCustomer] = await db.select({
          id: customers.id,
          odooPartnerId: customers.odooPartnerId,
          pricingTier: customers.pricingTier,
          salesRepId: customers.salesRepId,
          salesRepName: customers.salesRepName,
          email: customers.email,
          phone: customers.phone,
          company: customers.company,
          firstName: customers.firstName,
          lastName: customers.lastName,
        })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);
        
        if (!existingCustomer) {
          console.error(`[Spotlight] Data hygiene update FAILED: customer ${customerId} not found`);
        } else {
          const updateData: Record<string, any> = {
            updatedAt: new Date(),
            [field]: value,
          };

          let salesRepName: string | null = null;
          if (field === 'salesRepId') {
            const [rep] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
              .from(users)
              .where(eq(users.id, value));
            if (rep) {
              salesRepName = rep.firstName && rep.lastName 
                ? `${rep.firstName} ${rep.lastName}` 
                : rep.email;
              updateData.salesRepName = salesRepName;
            }
          }

          console.log(`[Spotlight] Data hygiene update: customer=${customerId} field=${field} value=${value}`);
          
          const result = await db.update(customers)
            .set(updateData)
            .where(eq(customers.id, customerId))
            .returning({ id: customers.id });
          
          if (result.length === 0) {
            console.error(`[Spotlight] Data hygiene update FAILED: customer ${customerId} not found in database`);
          } else {
            console.log(`[Spotlight] Data hygiene update SUCCESS: customer ${customerId} ${field}=${value}`);
            
            // Queue for Odoo sync if customer has Odoo partner ID
            if (existingCustomer.odooPartnerId) {
              try {
                // Map local field names to Odoo field names
                const odooFieldMap: Record<string, string> = {
                  'pricingTier': 'comment', // Store tier in comment for now
                  'email': 'email',
                  'phone': 'phone',
                  'company': 'name',
                };
                
                const odooField = odooFieldMap[field];
                if (odooField) {
                  const oldValue = (existingCustomer as any)[field];
                  const queueValue = field === 'pricingTier' ? `Tier: ${value}` : value;
                  
                  await db.insert(customerSyncQueue).values({
                    customerId,
                    odooPartnerId: existingCustomer.odooPartnerId,
                    fieldName: odooField,
                    oldValue: oldValue?.toString() || null,
                    newValue: queueValue,
                    status: 'pending',
                    changedBy: userId,
                  });
                  
                  console.log(`[Spotlight] Queued ${field}=${value} for Odoo sync (partner ${existingCustomer.odooPartnerId})`);
                }
              } catch (syncError) {
                console.error(`[Spotlight] Failed to queue Odoo sync:`, syncError);
                // Don't fail the whole operation - local save succeeded
              }
            }
          }
        }
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
    
    // Handle delete_record action - permanently delete the customer/lead
    if (selectedOutcome?.nextAction?.type === 'delete_record') {
      try {
        // Log the deletion for audit purposes
        const customerData = await db.select({
          id: customers.id,
          company: customers.company,
          email: customers.email,
          firstName: customers.firstName,
          lastName: customers.lastName,
        }).from(customers).where(eq(customers.id, customerId)).limit(1);
        
        console.log(`[Spotlight] Customer deletion initiated by user ${userId}:`, {
          customerId,
          company: customerData[0]?.company,
          email: customerData[0]?.email,
          reason: 'bounced_email',
          taskSubtype: subtype,
        });
        
        // First cancel all pending follow-up tasks
        await db.update(followUpTasks)
          .set({ 
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(and(
            eq(followUpTasks.customerId, customerId),
            ne(followUpTasks.status, 'completed')
          ));
        
        // Delete customer contacts first (foreign key constraint)
        await db.delete(customerContacts).where(eq(customerContacts.customerId, customerId));
        
        // Delete the customer record
        await db.delete(customers).where(eq(customers.id, customerId));
        
        console.log(`[Spotlight] Customer ${customerId} deleted successfully due to bounced email by user ${userId}`);
        
        // Return success - the record has been deleted
        return { success: true, deleted: true };
      } catch (deleteError) {
        console.error(`[Spotlight] Failed to delete customer ${customerId}:`, deleteError);
        // Continue with normal flow - at least mark the task as completed
      }
    }

    let nextFollowUp: { date: Date; type: string } | undefined;
    
    // Handle custom follow-up with user-specified days
    if (selectedOutcome?.nextAction?.type === 'custom_follow_up' && customFollowUpDays) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + customFollowUpDays);
      
      await db.insert(followUpTasks).values({
        customerId,
        title: `Scheduled Follow-up`,
        description: notes || null,
        taskType: 'follow_up',
        dueDate,
        status: 'pending',
        assignedTo: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      nextFollowUp = { date: dueDate, type: 'follow_up' };
    }
    // Handle standard follow-up with preset days
    else if (selectedOutcome?.nextAction?.type === 'schedule_follow_up' && selectedOutcome.nextAction.daysUntil) {
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
    
    // Handle lead-specific updates when completing lead tasks
    if (isLeadTask && leadId) {
      try {
        // Fetch the current lead state to make proper decisions
        const [currentLead] = await db.select({
          salesRepId: leads.salesRepId,
          stage: leads.stage,
          firstEmailSentAt: leads.firstEmailSentAt,
          firstEmailReplyAt: leads.firstEmailReplyAt,
        }).from(leads).where(eq(leads.id, leadId)).limit(1);
        
        if (!currentLead) {
          console.error(`[Spotlight] Lead ${leadId} not found for task completion`);
        } else {
          const leadUpdateData: Record<string, any> = {
            lastContactAt: now,
            updatedAt: now,
          };
          
          // Only increment touchpoints for actual contact outcomes
          const contactOutcomes = ['email_sent', 'called', 'connected', 'voicemail', 'followed_up', 'sent_content', 'sent_email'];
          if (contactOutcomes.includes(outcomeId)) {
            leadUpdateData.totalTouchpoints = sql`COALESCE(${leads.totalTouchpoints}, 0) + 1`;
          }
          
          // Update stage and timestamps based on outcome
          if (subtype.startsWith('lead_outreach_') && (outcomeId === 'email_sent' || outcomeId === 'called')) {
            // First contact - move from 'new' to 'contacted'
            leadUpdateData.stage = 'contacted';
            // Only set firstEmailSentAt if it's null
            if (outcomeId === 'email_sent' && !currentLead.firstEmailSentAt) {
              leadUpdateData.firstEmailSentAt = now;
            }
          } else if (outcomeId === 'replied') {
            // Lead replied - update reply timestamp if not already set
            if (!currentLead.firstEmailReplyAt) {
              leadUpdateData.firstEmailReplyAt = now;
            }
          } else if (outcomeId === 'qualified') {
            // Lead has been qualified
            leadUpdateData.stage = 'qualified';
          } else if (outcomeId === 'converting') {
            // Ready to convert
            leadUpdateData.stage = 'qualified';
            leadUpdateData.probability = 80;
          } else if (outcomeId === 'not_interested' || outcomeId === 'lost') {
            // Lead is lost
            leadUpdateData.stage = 'lost';
            leadUpdateData.lostReason = notes || 'Marked as not interested via SPOTLIGHT';
          } else if (outcomeId === 're_engaged') {
            // Re-engaged - move to nurturing if currently stale/contacted
            if (currentLead.stage !== 'qualified') {
              leadUpdateData.stage = 'nurturing';
            }
          } else if (outcomeId === 'progressing') {
            // Progressing - move to nurturing if not already qualified
            if (currentLead.stage !== 'qualified') {
              leadUpdateData.stage = 'nurturing';
            }
          } else if (outcomeId === 'followed_up' || outcomeId === 'sent_content') {
            // Follow-up actions - move to nurturing if currently just contacted
            if (currentLead.stage === 'contacted') {
              leadUpdateData.stage = 'nurturing';
            }
          }
          
          // Assign to this sales rep if unassigned
          if (!currentLead.salesRepId) {
            leadUpdateData.salesRepId = userId;
            // Get sales rep name
            const [rep] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
              .from(users)
              .where(eq(users.id, userId));
            if (rep) {
              leadUpdateData.salesRepName = rep.firstName && rep.lastName 
                ? `${rep.firstName} ${rep.lastName}` 
                : rep.email;
            }
          }
          
          await db.update(leads).set(leadUpdateData).where(eq(leads.id, leadId));
          console.log(`[Spotlight] Lead ${leadId} updated after task completion: outcome=${outcomeId}`);
        }
      } catch (e) {
        console.error('[Spotlight] Failed to update lead after task completion:', e);
      }
    }
    
    // Map bucket/subtype to a specific event type for better tracking
    const getActivityEventType = () => {
      if (bucket === 'calls') return 'call';
      if (bucket === 'outreach') return 'outreach';
      if (bucket === 'follow_ups') return 'follow_up_completed';
      if (bucket === 'data_hygiene') return 'data_update';
      if (bucket === 'enablement') return 'enablement';
      return 'spotlight_action';
    };

    // Build detailed description including contact method and outcome
    const buildDescription = () => {
      const parts: string[] = [];
      parts.push(`Method: ${bucketInfo(bucket)}`);
      parts.push(`Outcome: ${selectedOutcome?.label || outcomeId}`);
      if (notes) parts.push(`Notes: ${notes}`);
      if (field && value) parts.push(`Updated ${field}: ${value}`);
      if (nextFollowUp) {
        parts.push(`Follow-up scheduled: ${nextFollowUp.date.toLocaleDateString()}`);
      }
      if (markedDnc) parts.push('Marked as Do Not Contact');
      return parts.join(' | ');
    };
    
    try {
      await db.insert(customerActivityEvents).values({
        customerId,
        eventType: getActivityEventType(),
        title: `${bucketInfo(bucket)}: ${selectedOutcome?.label || outcomeId}`,
        description: buildDescription(),
        sourceType: 'auto',
        sourceTable: 'spotlight',
        sourceId: taskId,
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
    
    if (!session.consecutiveSkipsPerBucket) {
      session.consecutiveSkipsPerBucket = { calls: 0, follow_ups: 0, outreach: 0, data_hygiene: 0, enablement: 0 };
    }
    session.consecutiveSkipsPerBucket[bucket] = 0;
    session.lastBucketUsed = bucket;
    
    // Add customer to skipped list so they don't appear again in this session
    // This prevents the same card from showing after completing a task
    if (!session.skippedCustomerIds.includes(customerId)) {
      session.skippedCustomerIds.push(customerId);
    }

    // Release claim so other users can work on this customer
    await this.releaseClaim(userId);

    console.log(`[Spotlight] Task completed for customer ${customerId}, bucket ${bucket}, outcome ${outcomeId}`);

    return { success: true, nextFollowUp };
  }

  async skipTask(userId: string, taskId: string, reason: string): Promise<void> {
    const session = this.getSession(userId);
    
    let customerId: string;
    let bucket: TaskBucket;
    let subtype: string;
    let isLeadTask = false;
    
    if (taskId.includes('::')) {
      const parts = taskId.split('::');
      bucket = parts[0] as TaskBucket;
      // Handle different task ID formats:
      // - Lead tasks: bucket::lead::leadId::subtype (4 parts, parts[1] = 'lead')
      // - Follow-up tasks: bucket::taskId::customerId::subtype (4 parts, parts[1] = numeric)
      // - Standard tasks: bucket::customerId::subtype (3 parts)
      if (parts.length === 4) {
        if (parts[1] === 'lead') {
          // Lead task format: bucket::lead::leadId::subtype
          isLeadTask = true;
          customerId = `lead-${parts[2]}`; // Synthetic customer ID for leads
          subtype = parts[3];
        } else {
          // follow_ups format: bucket::taskId::customerId::subtype
          customerId = parts[2];
          subtype = parts[3];
        }
      } else {
        // Standard format: bucket::customerId::subtype
        customerId = parts[1];
        subtype = parts[2];
      }
    } else {
      // Legacy underscore format - not recommended, keep for backward compatibility
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
    
    if (!session.consecutiveSkipsPerBucket) {
      session.consecutiveSkipsPerBucket = { calls: 0, follow_ups: 0, outreach: 0, data_hygiene: 0, enablement: 0 };
    }
    session.consecutiveSkipsPerBucket[bucket] = (session.consecutiveSkipsPerBucket[bucket] || 0) + 1;
    session.lastBucketUsed = bucket;

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

    // Track "not_my_territory" skips and flag for admin review when all users skip
    if (reason === 'not_my_territory') {
      await this.trackTerritorySkip(userId, customerId);
    }

    // Release claim so other users can work on different customers
    await this.releaseClaim(userId);

    console.log(`[Spotlight] User ${userId} skipped task ${taskId}: ${reason}`);
  }

  /**
   * Track territory skip and flag for admin review if all active users have skipped
   */
  private async trackTerritorySkip(userId: string, customerId: string): Promise<void> {
    try {
      // Get count of active (approved) users
      const activeUsers = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.status, 'approved'));
      
      const activeUserCount = activeUsers.length;
      if (activeUserCount === 0) return;

      // Check existing flag record
      const [existingFlag] = await db.select()
        .from(territorySkipFlags)
        .where(eq(territorySkipFlags.customerId, customerId))
        .limit(1);

      if (existingFlag) {
        // Add user to list if not already present
        const skippedByUsers = existingFlag.skippedByUsers || [];
        if (!skippedByUsers.includes(userId)) {
          skippedByUsers.push(userId);
          
          // Check if all active users have now skipped
          const allUsersSkipped = activeUsers.every(u => skippedByUsers.includes(u.id));
          
          await db.update(territorySkipFlags)
            .set({
              skippedByUsers,
              totalActiveUsers: activeUserCount,
              flaggedForAdminReview: allUsersSkipped,
              updatedAt: new Date(),
            })
            .where(eq(territorySkipFlags.id, existingFlag.id));

          if (allUsersSkipped) {
            console.log(`[Spotlight] Customer ${customerId} flagged for admin review - all ${activeUserCount} users marked as "not my territory"`);
          }
        }
      } else {
        // Create new flag record
        const skippedByUsers = [userId];
        const allUsersSkipped = activeUserCount === 1;
        
        await db.insert(territorySkipFlags).values({
          customerId,
          skippedByUsers,
          totalActiveUsers: activeUserCount,
          flaggedForAdminReview: allUsersSkipped,
        });

        if (allUsersSkipped) {
          console.log(`[Spotlight] Customer ${customerId} flagged for admin review - all ${activeUserCount} users marked as "not my territory"`);
        }
      }
    } catch (e) {
      console.error('[Spotlight] Failed to track territory skip:', e);
    }
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
