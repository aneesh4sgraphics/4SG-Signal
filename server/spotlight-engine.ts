import { db } from "./db";
import { customers, followUpTasks, users, customerActivityEvents, spotlightEvents, customerContacts, spotlightSessionState, spotlightCustomerClaims, spotlightMicroCards, spotlightCoachTips, TASK_ENERGY_COSTS, customerSyncQueue, sentQuotes, territorySkipFlags, gmailMessages, leads, bouncedEmails, dripCampaignStepStatus, dripCampaignAssignments, dripCampaignSteps, dripCampaigns, emailSends } from "@shared/schema";
import { scanForBouncedEmails } from "./bounce-detector";
import { odooClient, isOdooConfigured } from "./odoo";

// Generic email domains to deprioritize in data hygiene tasks
const GENERIC_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'live.com', 'msn.com', 'me.com', 'comcast.net', 'verizon.net',
  'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net'
];
import { eq, and, isNull, or, ne, sql, desc, asc, lt, lte, gte, gt, isNotNull, inArray, notInArray, count } from "drizzle-orm";
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
  continueAfterComplete: boolean; // User chose to continue after hitting daily target
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
  // Remind Me Again Today tracking
  remindTodayTasks?: {
    taskId: string;
    customerId: string;
    bucket: TaskBucket;
    subtype: string;
    remindedAt: Date;
  }[];
}

/**
 * SEQUENCED DAILY QUOTAS (50 tasks/day = 5 cycles of 10 tasks)
 * 
 * Each cycle pattern:
 * - Positions 1-3: Data Hygiene (3 tasks)
 * - Position 4: Quote Follow-up (1 task)
 * - Positions 5-7: SwatchBooks/Press Test Kits (3 tasks)
 * - Position 8: Lapsed Customer Call (1 task)
 * - Positions 9-10: Data Hygiene (2 tasks)
 */
const DAILY_QUOTAS: Record<TaskBucket, number> = {
  calls: 5,           // 1 lapsed customer per cycle × 5 cycles
  follow_ups: 5,      // 1 quote follow-up per cycle × 5 cycles
  outreach: 15,       // 3 swatchbooks/trust building per cycle × 5 cycles
  data_hygiene: 25,   // 5 per cycle (3 start + 2 end) × 5 cycles
  enablement: 0,      // Not in the sequenced pattern (fallback only)
};
// Total: 50 tasks per day (5 + 5 + 15 + 25 = 50)

const TOTAL_DAILY_QUOTA = Object.values(DAILY_QUOTAS).reduce((a, b) => a + b, 0);

const TASK_OUTCOMES: Record<string, TaskOutcome[]> = {
  hygiene_sales_rep: [
    { id: 'assigned', label: 'Assign to Me', icon: 'user-check', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Not My Territory', icon: 'x', nextAction: { type: 'no_action' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
  ],
  hygiene_pricing_tier: [
    { id: 'assigned', label: 'Pricing Tier Assigned', icon: 'tag', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Need More Info', icon: 'help-circle', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'research' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
  ],
  hygiene_email: [
    { id: 'found', label: 'Email Found', icon: 'mail', nextAction: { type: 'mark_complete' } },
    { id: 'no_email', label: 'No Email Available', icon: 'x', nextAction: { type: 'mark_complete' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  hygiene_name: [
    { id: 'found', label: 'Name Added', icon: 'user', nextAction: { type: 'mark_complete' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  hygiene_company: [
    { id: 'found', label: 'Company Added', icon: 'building', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
  ],
  hygiene_phone: [
    { id: 'found', label: 'Phone Added', icon: 'phone', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Research Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
  ],
  hygiene_machines: [
    { id: 'confirmed', label: 'Machines Confirmed', icon: 'settings', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Ask Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 14, taskType: 'research' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
  ],
  hygiene_bounced_email: [
    { id: 'mark_inactive', label: 'Mark as Do Not Contact', icon: 'user-x', nextAction: { type: 'mark_dnc' } },
    { id: 'delete_record', label: 'Delete This Record', icon: 'trash-2', nextAction: { type: 'delete_record' } },
    { id: 'keep', label: 'Keep Active', icon: 'check', nextAction: { type: 'mark_complete' } },
    { id: 'skip', label: 'Investigate Later', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
  ],
  hygiene_customer_type: [
    { id: 'printer', label: 'Printing Company', icon: 'printer', nextAction: { type: 'set_customer_type', customerType: 'printer' } },
    { id: 'reseller', label: 'Reseller/Distributor', icon: 'truck', nextAction: { type: 'set_customer_type', customerType: 'reseller' } },
    { id: 'skip', label: 'Not Sure Yet', icon: 'clock', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'research' } },
    { id: 'bad_fit', label: 'Bad Fit / DNC', icon: 'ban', nextAction: { type: 'mark_dnc' } },
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
    { id: 'remind_later', label: 'Remind Me Later', icon: 'clock', nextAction: { type: 'custom_follow_up' } },
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
  // DRIP email tasks - reply detected (HIGH PRIORITY)
  drip_reply_urgent: [
    { id: 'called', label: 'Called Them', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'email_sent', label: 'Replied to Email', icon: 'send', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'qualified', label: 'Qualified!', icon: 'star', nextAction: { type: 'mark_complete' } },
    { id: 'not_interested', label: 'Not Interested', icon: 'x', nextAction: { type: 'mark_complete' } },
  ],
  // DRIP stale follow-up - 10 days no response with creative options
  drip_stale_followup: [
    { id: 'send_drip', label: 'Send Another Email', icon: 'mail', nextAction: { type: 'schedule_follow_up', daysUntil: 10, taskType: 'drip_followup' } },
    { id: 'send_swatchbook', label: 'Send Swatch Book', icon: 'package', nextAction: { type: 'schedule_follow_up', daysUntil: 14, taskType: 'follow_up' } },
    { id: 'send_press_test', label: 'Send Press Test Kit', icon: 'box', nextAction: { type: 'schedule_follow_up', daysUntil: 14, taskType: 'follow_up' } },
    { id: 'call', label: 'Call Them', icon: 'phone', nextAction: { type: 'schedule_follow_up', daysUntil: 3, taskType: 'follow_up' } },
    { id: 'linkedin', label: 'Connect on LinkedIn', icon: 'linkedin', nextAction: { type: 'schedule_follow_up', daysUntil: 7, taskType: 'follow_up' } },
    { id: 'skip', label: 'Give More Time', icon: 'clock', nextAction: { type: 'no_action' } },
    { id: 'lost', label: 'Mark as Lost', icon: 'x', nextAction: { type: 'mark_complete' } },
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
  hygiene_customer_type: 'Is this a Printing Company or Reseller? This determines what info we need to collect.',
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
  // DRIP email task messages
  drip_reply_urgent: '🔥 DRIP REPLY! They responded to your drip email - strike now while they\'re engaged!',
  drip_stale_followup: '⏰ 10 days since your drip campaign ended with no response. Time to try something different!',
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

  // Get customer IDs that THIS user has skipped as "not my territory" (persisted across sessions)
  private async getUserTerritorySkippedIds(userId: string): Promise<string[]> {
    try {
      // Get customers where this user is in the skippedByUsers array
      const result = await db.select({ customerId: territorySkipFlags.customerId })
        .from(territorySkipFlags)
        .where(sql`${userId} = ANY(${territorySkipFlags.skippedByUsers})`);
      
      return result.map(r => r.customerId);
    } catch (e) {
      console.error('[Spotlight] Error getting user territory skipped IDs:', e);
      return [];
    }
  }

  // Get customer IDs that have been contacted within the last N days (auto-skip these)
  private async getRecentlyContactedIds(daysBack: number = 7): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    try {
      const result = await db
        .select({ customerId: customerActivityEvents.customerId })
        .from(customerActivityEvents)
        .where(
          and(
            gte(customerActivityEvents.createdAt, cutoffDate),
            inArray(customerActivityEvents.eventType, ['call', 'email', 'quote', 'follow_up_completed'])
          )
        );
      
      // Use Set for deduplication instead of selectDistinct
      const uniqueIds = new Set<string>();
      for (const r of result) {
        if (r.customerId) uniqueIds.add(r.customerId);
      }
      return Array.from(uniqueIds);
    } catch (e) {
      console.error('[Spotlight] Error getting recently contacted IDs:', e);
      return [];
    }
  }

  // Get customer/lead IDs contacted TODAY by ANY user (prevent duplicate contacts across users)
  private async getTodayContactedByAnyUser(): Promise<{ customerIds: string[]; leadIds: number[] }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
      // Check spotlight_events for completed tasks TODAY that involve any form of customer/lead contact
      // Comprehensive list of outcomes that indicate contact was made
      const contactOutcomes = "'email_sent','called','connected','voicemail','quoted','followed_up','sent_content','sent_email','sent','replied','qualified'";
      const completedToday = await db
        .select({ 
          customerId: spotlightEvents.customerId,
          leadId: spotlightEvents.leadId 
        })
        .from(spotlightEvents)
        .where(
          and(
            gte(spotlightEvents.createdAt, today),
            eq(spotlightEvents.eventType, 'completed'),
            or(
              sql`${spotlightEvents.metadata}->>'outcome' IN (${sql.raw(contactOutcomes)})`,
              sql`${spotlightEvents.metadata}->>'outcomeId' IN (${sql.raw(contactOutcomes)})`
            )
          )
        );
      
      // Also check customerActivityEvents for today
      const activityToday = await db
        .select({ customerId: customerActivityEvents.customerId })
        .from(customerActivityEvents)
        .where(
          and(
            gte(customerActivityEvents.createdAt, today),
            inArray(customerActivityEvents.eventType, ['call', 'email', 'quote'])
          )
        );
      
      // Also check leads with last_contact_at set to today (may have been updated by Gmail sync etc.)
      const leadsContactedToday = await db
        .select({ id: leads.id })
        .from(leads)
        .where(gte(leads.lastContactAt, today));
      
      // Also check customers with last_contact_at set to today
      const customersContactedToday = await db
        .select({ id: customers.id })
        .from(customers)
        .where(gte(customers.lastContactAt, today));
      
      const customerIds = new Set<string>();
      const leadIds = new Set<number>();
      
      for (const row of completedToday) {
        if (row.customerId) customerIds.add(row.customerId);
        if (row.leadId) leadIds.add(row.leadId);
      }
      for (const row of activityToday) {
        if (row.customerId) customerIds.add(row.customerId);
      }
      for (const row of leadsContactedToday) {
        if (row.id) leadIds.add(row.id);
      }
      for (const row of customersContactedToday) {
        if (row.id) customerIds.add(row.id);
      }
      
      console.log(`[Spotlight Cross-User Filter] Leads contacted today: ${leadIds.size}, Customers: ${customerIds.size}`);
      if (leadIds.size > 0) {
        console.log(`[Spotlight Cross-User Filter] Lead IDs to exclude: ${Array.from(leadIds).slice(0, 10).join(', ')}${leadIds.size > 10 ? '...' : ''}`);
      }
      
      return { 
        customerIds: Array.from(customerIds), 
        leadIds: Array.from(leadIds) 
      };
    } catch (e) {
      console.error('[Spotlight] Error getting today contacted IDs:', e);
      return { customerIds: [], leadIds: [] };
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
        continueAfterComplete: false,
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
      
      // Try to restore session state from database (survives server restarts)
      try {
        const persistedState = await db.select()
          .from(spotlightSessionState)
          .where(and(
            eq(spotlightSessionState.userId, userId),
            eq(spotlightSessionState.sessionDate, today)
          ))
          .limit(1);
        
        if (persistedState.length > 0) {
          const state = persistedState[0];
          console.log(`[Spotlight] Restoring session state for user ${userId} from database`);
          
          // Restore bucket completions
          const bucketMap: Record<string, { completed: number; target: number }> = {
            'calls': { completed: state.callsCompleted || 0, target: state.callsTarget || 10 },
            'follow_ups': { completed: state.followUpsCompleted || 0, target: state.followUpsTarget || 10 },
            'outreach': { completed: state.outreachCompleted || 0, target: state.outreachTarget || 10 },
            'data_hygiene': { completed: state.dataHygieneCompleted || 0, target: state.dataHygieneTarget || 10 },
            'enablement': { completed: state.enablementCompleted || 0, target: state.enablementTarget || 10 },
          };
          
          for (const bucket of session.buckets) {
            const restored = bucketMap[bucket.bucket];
            if (restored) {
              bucket.completed = restored.completed;
            }
          }
          
          session.totalCompleted = state.totalCompleted || 0;
          session.dayComplete = state.dayComplete || false;
          session.currentEnergy = state.currentEnergy || 100;
          session.comboCount = state.comboCount || 0;
          session.comboMultiplier = parseFloat(String(state.comboMultiplier || '1.0'));
          session.hardTasksCompletedToday = state.hardTasksCompletedToday || 0;
          session.powerUpsAvailable = state.powerUpsAvailable || 0;
          session.powerUpsUsedToday = state.powerUpsUsedToday || 0;
          session.tasksSinceMicroCard = state.tasksSinceMicroCard || 0;
          session.microCardsShownToday = (state.microCardsShownToday as number[]) || [];
          session.warmupShown = state.warmupShown || false;
          session.energyCheckShown = state.energyCheckShown || false;
          session.recapShown = state.recapShown || false;
          session.lastTaskTypes = (state.lastTaskTypes as string[]) || [];
          
          console.log(`[Spotlight] Restored progress: ${session.totalCompleted}/${session.totalTarget}`);
        }
        
        // Restore skipped customer/lead IDs from today's spotlight_events
        // This ensures that completed/skipped tasks don't reappear after a server restart
        // Align with session date (getTodayKey uses 6pm cutoff - after 6pm returns "tomorrow")
        const now = new Date();
        const hour = now.getHours();
        let sessionStart: Date;
        if (hour >= 18) {
          // After 6pm, session is for "tomorrow" but events are still from 6pm today onward
          sessionStart = new Date(now);
          sessionStart.setHours(18, 0, 0, 0);
        } else {
          // Before 6pm, session is for "today" starting from 6pm yesterday
          sessionStart = new Date(now);
          sessionStart.setDate(sessionStart.getDate() - 1);
          sessionStart.setHours(18, 0, 0, 0);
        }
        
        const todayEvents = await db
          .select({ 
            customerId: spotlightEvents.customerId,
            leadId: spotlightEvents.leadId 
          })
          .from(spotlightEvents)
          .where(
            and(
              eq(spotlightEvents.userId, userId),
              gte(spotlightEvents.createdAt, sessionStart),
              inArray(spotlightEvents.eventType, ['completed', 'skipped', 'remind_today'])
            )
          );
        
        // Use Set to deduplicate
        const seenIds = new Set<string>();
        for (const event of todayEvents) {
          if (event.customerId && !seenIds.has(event.customerId)) {
            seenIds.add(event.customerId);
            if (!session.skippedCustomerIds.includes(event.customerId)) {
              session.skippedCustomerIds.push(event.customerId);
            }
          }
          if (event.leadId) {
            const leadKey = `lead-${event.leadId}`;
            if (!seenIds.has(leadKey) && !session.skippedCustomerIds.includes(leadKey)) {
              seenIds.add(leadKey);
              session.skippedCustomerIds.push(leadKey);
            }
          }
        }
        
        console.log(`[Spotlight] Restored ${session.skippedCustomerIds.length} skipped IDs from today's events`);
      } catch (restoreError) {
        console.error('[Spotlight] Error restoring session state:', restoreError);
      }
      
      this.sessions.set(sessionKey, session);
    }
    return session;
  }
  
  private async persistSessionState(userId: string, session: SpotlightSession): Promise<void> {
    const today = this.getTodayKey();
    
    try {
      const bucketData = {
        callsCompleted: session.buckets.find(b => b.bucket === 'calls')?.completed || 0,
        callsTarget: session.buckets.find(b => b.bucket === 'calls')?.target || 10,
        followUpsCompleted: session.buckets.find(b => b.bucket === 'follow_ups')?.completed || 0,
        followUpsTarget: session.buckets.find(b => b.bucket === 'follow_ups')?.target || 10,
        outreachCompleted: session.buckets.find(b => b.bucket === 'outreach')?.completed || 0,
        outreachTarget: session.buckets.find(b => b.bucket === 'outreach')?.target || 10,
        dataHygieneCompleted: session.buckets.find(b => b.bucket === 'data_hygiene')?.completed || 0,
        dataHygieneTarget: session.buckets.find(b => b.bucket === 'data_hygiene')?.target || 10,
        enablementCompleted: session.buckets.find(b => b.bucket === 'enablement')?.completed || 0,
        enablementTarget: session.buckets.find(b => b.bucket === 'enablement')?.target || 10,
      };
      
      await db.insert(spotlightSessionState)
        .values({
          userId,
          sessionDate: today,
          ...bucketData,
          totalCompleted: session.totalCompleted,
          totalTarget: session.totalTarget,
          dayComplete: session.dayComplete,
          currentEnergy: session.currentEnergy,
          comboCount: session.comboCount,
          comboMultiplier: String(session.comboMultiplier),
          hardTasksCompletedToday: session.hardTasksCompletedToday,
          powerUpsAvailable: session.powerUpsAvailable,
          powerUpsUsedToday: session.powerUpsUsedToday,
          tasksSinceMicroCard: session.tasksSinceMicroCard,
          microCardsShownToday: session.microCardsShownToday,
          warmupShown: session.warmupShown,
          recapShown: session.recapShown,
          energyCheckShown: session.energyCheckShown,
          lastTaskTypes: session.lastTaskTypes,
        })
        .onConflictDoUpdate({
          target: [spotlightSessionState.userId, spotlightSessionState.sessionDate],
          set: {
            ...bucketData,
            totalCompleted: session.totalCompleted,
            totalTarget: session.totalTarget,
            dayComplete: session.dayComplete,
            currentEnergy: session.currentEnergy,
            comboCount: session.comboCount,
            comboMultiplier: String(session.comboMultiplier),
            hardTasksCompletedToday: session.hardTasksCompletedToday,
            powerUpsAvailable: session.powerUpsAvailable,
            powerUpsUsedToday: session.powerUpsUsedToday,
            tasksSinceMicroCard: session.tasksSinceMicroCard,
            microCardsShownToday: session.microCardsShownToday,
            warmupShown: session.warmupShown,
            recapShown: session.recapShown,
            energyCheckShown: session.energyCheckShown,
            lastTaskTypes: session.lastTaskTypes,
            updatedAt: new Date(),
          },
        });
    } catch (persistError) {
      console.error('[Spotlight] Error persisting session state:', persistError);
    }
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
        continueAfterComplete: false,
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
            customerType: customers.customerType,
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

  // Allow user to continue working after completing their daily target of 50 tasks
  continueAfterComplete(userId: string): void {
    const session = this.getSession(userId);
    session.continueAfterComplete = true;
    session.dayComplete = false; // Reset dayComplete to allow more tasks
    session.lastActivityAt = new Date();

    console.log(`[Spotlight] User ${userId} chose to continue after completing ${session.totalCompleted} tasks`);

    db.insert(spotlightEvents).values({
      eventType: 'continued_after_complete',
      userId,
      bucket: 'calls',
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours(),
      metadata: {
        tasksCompletedWhenContinued: session.totalCompleted,
        totalTarget: session.totalTarget,
      },
    }).catch(e => console.error('[Spotlight] Failed to log continue event:', e));
  }

  updateActivity(userId: string): void {
    const session = this.getSession(userId);
    session.lastActivityAt = new Date();
  }

  /**
   * SEQUENCED TASK PATTERN (50 tasks/day = 5 cycles of 10 tasks each)
   * 
   * Each cycle of 10 tasks:
   * Position 1-3: Data Hygiene (3 tasks) - start day with easy wins
   * Position 4:   Quote Follow-up (1 task) - follow up on pending quotes
   * Position 5-7: SwatchBooks/Press Test Kits (3 tasks) - trust building
   * Position 8:   Lapsed Customer (1 task) - reconnect with dormant customer
   * Position 9-10: Data Hygiene (2 tasks) - end cycle with easy tasks
   * 
   * FALLBACK when Data Hygiene is exhausted:
   * 1. Connect with 3 Leads (email or phone)
   * 2. Follow up on 5 Quotes
   * 3. Follow up with 5 customers (calls or email)
   * 4. Send at least 3 Mailers/SwatchBooks/Press test kits
   */
  private getNextBucket(session: SpotlightSession): TaskBucket | null {
    const incomplete = session.buckets.filter(b => b.completed < b.target);
    if (incomplete.length === 0) return null;
    
    // Calculate position in current cycle (0-9)
    const positionInCycle = session.totalCompleted % 10;
    
    // Helper to check if bucket has remaining tasks
    const hasTasksRemaining = (bucket: TaskBucket): boolean => {
      const bucketState = session.buckets.find(b => b.bucket === bucket);
      return bucketState ? bucketState.completed < bucketState.target : false;
    };
    
    // Define the sequenced pattern
    // Positions 0-2 (first 3): Data Hygiene
    // Position 3: Quote Follow-up (follow_ups bucket)
    // Positions 4-6 (next 3): SwatchBooks/Trust Building (outreach bucket)
    // Position 7: Lapsed Customer (calls bucket)
    // Positions 8-9 (last 2): Data Hygiene
    
    let targetBucket: TaskBucket | null = null;
    
    if (positionInCycle <= 2) {
      // Positions 0-2: Data Hygiene (3 tasks)
      targetBucket = 'data_hygiene';
    } else if (positionInCycle === 3) {
      // Position 3: Quote Follow-up
      targetBucket = 'follow_ups';
    } else if (positionInCycle >= 4 && positionInCycle <= 6) {
      // Positions 4-6: SwatchBooks/Trust Building (3 tasks)
      targetBucket = 'outreach';
    } else if (positionInCycle === 7) {
      // Position 7: Lapsed Customer Call
      targetBucket = 'calls';
    } else {
      // Positions 8-9: Data Hygiene (2 tasks)
      targetBucket = 'data_hygiene';
    }
    
    // Check if target bucket has remaining tasks
    if (targetBucket && hasTasksRemaining(targetBucket)) {
      return targetBucket;
    }
    
    // FALLBACK PRIORITY when primary bucket is exhausted
    // Special handling when Data Hygiene is exhausted (positions 0-2 or 8-9):
    // 1. Connect with 3 Leads (calls bucket - lead subtypes)
    // 2. Follow up on 5 Quotes (follow_ups bucket)
    // 3. Follow up with 5 customers (calls bucket - customer calls)
    // 4. Send at least 3 Mailers/SwatchBooks (outreach bucket)
    
    const isDataHygienePosition = positionInCycle <= 2 || positionInCycle >= 8;
    const dataHygieneExhausted = !hasTasksRemaining('data_hygiene');
    
    if (isDataHygienePosition && dataHygieneExhausted) {
      // Data hygiene is exhausted at a data hygiene position - use priority fallback
      // Priority: calls (leads) → follow_ups (quotes) → outreach (swatchbooks)
      const priorityFallback: TaskBucket[] = ['calls', 'follow_ups', 'outreach'];
      for (const bucket of priorityFallback) {
        if (hasTasksRemaining(bucket)) {
          console.log(`[Spotlight] Cycle position ${positionInCycle}: Data Hygiene exhausted, falling back to ${bucket} (priority fallback)`);
          return bucket;
        }
      }
    }
    
    // Standard fallback for non-data-hygiene positions or when priority fallback is exhausted
    const standardFallback: TaskBucket[] = ['follow_ups', 'outreach', 'calls', 'data_hygiene', 'enablement'];
    
    for (const bucket of standardFallback) {
      if (hasTasksRemaining(bucket)) {
        console.log(`[Spotlight] Cycle position ${positionInCycle}: ${targetBucket} exhausted, falling back to ${bucket}`);
        return bucket;
      }
    }
    
    return null;
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

  async getNextTask(userId: string, forceBucket?: string): Promise<{ task: SpotlightTask | null; session: SpotlightSession; allDone: boolean; isPaused?: boolean }> {
    const session = await this.getSessionAsync(userId);
    
    if (session.isPaused) {
      return { task: null, session, allDone: false, isPaused: true };
    }
    
    session.lastActivityAt = new Date();
    
    // Check if daily target is reached
    if (session.totalCompleted >= session.totalTarget && !session.continueAfterComplete) {
      // Target reached and user hasn't chosen to continue - mark day complete
      session.dayComplete = true;
      return { task: null, session, allDone: true };
    }
    // If continueAfterComplete is true, we keep going past the target
    
    try {
      // Allow forcing a specific bucket for debugging (e.g., ?forceBucket=data_hygiene)
      const nextBucket = forceBucket as BucketType || this.getNextBucket(session);
      if (!nextBucket) {
        session.dayComplete = true;
        return { task: null, session, allDone: true };
      }

      // PERFORMANCE: Parallelize exclusion queries
      // Apply TODAY's contacts exclusion to ALL buckets to prevent duplicate outreach across users
      const [claimedByOthers, recentlyContacted, todayContacted, territorySkipped] = await Promise.all([
        this.getClaimedCustomerIds(userId),
        this.getRecentlyContactedIds(7),
        this.getTodayContactedByAnyUser(),
        this.getUserTerritorySkippedIds(userId) // Persist "not my territory" skips across sessions
      ]);
      
      // Merge all customer IDs to exclude (includes today's contacted to prevent duplicate outreach)
      // territorySkipped ensures users don't see customers they've already marked as "not my territory"
      let excludeIds = [...session.skippedCustomerIds, ...claimedByOthers, ...recentlyContacted, ...todayContacted.customerIds, ...territorySkipped];
      // Add lead IDs contacted today as 'lead-{id}' format for lead task filtering
      for (const leadId of todayContacted.leadIds) {
        excludeIds.push(`lead-${leadId}`);
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
    // PRIORITY 0: Check for DRIP email replies - HIGHEST PRIORITY
    const customerSkippedIds = skippedIds.filter(id => !id.startsWith('lead-'));
    const dripReplyTask = await this.findDripReplyTask(userId, customerSkippedIds);
    if (dripReplyTask) {
      return dripReplyTask;
    }

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
    
    // Re-use customerSkippedIds from drip reply check above
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
            customerType: customers.customerType,
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

  // Find DRIP email replies - customers who replied to a drip campaign email
  private async findDripReplyTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    try {
      // Find drip emails sent in the last 30 days that have replies in Gmail
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Get drip emails sent to customers
      const dripEmails = await db
        .select({
          stepStatusId: dripCampaignStepStatus.id,
          assignmentId: dripCampaignStepStatus.assignmentId,
          stepId: dripCampaignStepStatus.stepId,
          sentAt: dripCampaignStepStatus.sentAt,
          gmailMessageId: dripCampaignStepStatus.gmailMessageId,
          customerId: dripCampaignAssignments.customerId,
          campaignName: dripCampaigns.name,
          stepName: dripCampaignSteps.name,
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
            customerType: customers.customerType,
          },
        })
        .from(dripCampaignStepStatus)
        .innerJoin(dripCampaignAssignments, eq(dripCampaignStepStatus.assignmentId, dripCampaignAssignments.id))
        .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
        .innerJoin(dripCampaignSteps, eq(dripCampaignStepStatus.stepId, dripCampaignSteps.id))
        .innerJoin(customers, eq(dripCampaignAssignments.customerId, customers.id))
        .where(and(
          eq(dripCampaignStepStatus.status, 'sent'),
          gte(dripCampaignStepStatus.sentAt, thirtyDaysAgo),
          eq(customers.doNotContact, false),
          or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
          ...(skippedIds.length > 0 ? [notInArray(customers.id, skippedIds)] : [])
        ))
        .orderBy(desc(dripCampaignStepStatus.sentAt))
        .limit(50);
      
      // For each drip email, check if there's a reply in Gmail
      for (const drip of dripEmails) {
        if (!drip.customer.email) continue;
        
        // Check for inbound emails from this customer after the drip was sent
        // Use stricter matching: reply must be within 14 days of drip and subject should indicate a reply
        const fourteenDaysAfterDrip = new Date(drip.sentAt!);
        fourteenDaysAfterDrip.setDate(fourteenDaysAfterDrip.getDate() + 14);
        
        const replies = await db
          .select({ id: gmailMessages.id, subject: gmailMessages.subject, sentAt: gmailMessages.sentAt, threadId: gmailMessages.threadId })
          .from(gmailMessages)
          .where(and(
            eq(gmailMessages.direction, 'inbound'),
            eq(gmailMessages.customerId, drip.customer.id),
            gt(gmailMessages.sentAt, drip.sentAt!),
            lte(gmailMessages.sentAt, fourteenDaysAfterDrip),
            // Subject should indicate a reply (starts with Re: or Fwd:)
            or(
              sql`LOWER(${gmailMessages.subject}) LIKE 're:%'`,
              sql`LOWER(${gmailMessages.subject}) LIKE 'fwd:%'`
            )
          ))
          .orderBy(desc(gmailMessages.sentAt))
          .limit(1);
        
        if (replies.length > 0) {
          // Check if we already handled this specific drip step's reply (check spotlight_events)
          // Use specific step status ID to avoid re-surfacing the same drip->reply combination
          const alreadyHandled = await db
            .select({ id: spotlightEvents.id })
            .from(spotlightEvents)
            .where(and(
              eq(spotlightEvents.customerId, drip.customer.id),
              or(
                // Check for this specific drip step being handled
                sql`${spotlightEvents.taskId} LIKE ${'calls::drip_reply_' + drip.stepStatusId + '::%'}`,
                // Also check for ANY drip reply task for this customer since the drip was sent
                and(
                  sql`${spotlightEvents.taskId} LIKE 'calls::drip_reply_%'`,
                  gte(spotlightEvents.createdAt, drip.sentAt!)
                )
              )
            ))
            .limit(1);
          
          if (alreadyHandled.length === 0) {
            const daysSinceReply = Math.floor((Date.now() - (replies[0].sentAt?.getTime() || 0)) / (1000 * 60 * 60 * 24));
            const urgencyLabel = daysSinceReply === 0 ? '🔥 TODAY!' : daysSinceReply === 1 ? '⚡ Yesterday!' : `${daysSinceReply} days ago`;
            
            return {
              id: `calls::drip_reply_${drip.stepStatusId}::${drip.customer.id}::drip_reply_urgent`,
              customerId: drip.customer.id,
              bucket: 'calls',
              taskSubtype: 'drip_reply_urgent',
              priority: 100, // Highest priority
              whyNow: `🔥 DRIP REPLY (${urgencyLabel})! They replied to "${drip.campaignName}" - call them now!`,
              outcomes: TASK_OUTCOMES.drip_reply_urgent,
              customer: drip.customer,
              context: {
                campaignName: drip.campaignName,
                stepName: drip.stepName,
                replySubject: replies[0].subject || undefined,
                repliedAt: replies[0].sentAt?.toISOString(),
                sourceType: 'drip_reply',
              },
            };
          }
        }
      }
    } catch (error) {
      console.error('[Spotlight] Error finding drip reply task:', error);
    }
    return null;
  }

  // Find stale DRIP campaigns - 10 days since last email with no response
  private async findDripStaleFollowupTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    try {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      // Find completed or stale drip campaigns where the last email was sent 10+ days ago
      const staleDripCustomers = await db
        .select({
          assignmentId: dripCampaignAssignments.id,
          customerId: dripCampaignAssignments.customerId,
          campaignName: dripCampaigns.name,
          lastStepSentAt: sql<Date>`MAX(${dripCampaignStepStatus.sentAt})`.as('lastStepSentAt'),
          totalStepsSent: sql<number>`COUNT(CASE WHEN ${dripCampaignStepStatus.status} = 'sent' THEN 1 END)`.as('totalStepsSent'),
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
            customerType: customers.customerType,
          },
        })
        .from(dripCampaignAssignments)
        .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
        .innerJoin(customers, eq(dripCampaignAssignments.customerId, customers.id))
        .leftJoin(dripCampaignStepStatus, eq(dripCampaignStepStatus.assignmentId, dripCampaignAssignments.id))
        .where(and(
          or(eq(dripCampaignAssignments.status, 'completed'), eq(dripCampaignAssignments.status, 'active')),
          eq(customers.doNotContact, false),
          or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
          ...(skippedIds.length > 0 ? [notInArray(customers.id, skippedIds)] : [])
        ))
        .groupBy(
          dripCampaignAssignments.id, 
          dripCampaignAssignments.customerId, 
          dripCampaigns.name,
          customers.id,
          customers.company,
          customers.firstName,
          customers.lastName,
          customers.email,
          customers.phone,
          customers.address1,
          customers.address2,
          customers.city,
          customers.province,
          customers.zip,
          customers.country,
          customers.website,
          customers.salesRepId,
          customers.salesRepName,
          customers.pricingTier
        )
        .having(and(
          lte(sql`MAX(${dripCampaignStepStatus.sentAt})`, tenDaysAgo),
          gte(sql`MAX(${dripCampaignStepStatus.sentAt})`, sixtyDaysAgo)
        ))
        .orderBy(asc(sql`MAX(${dripCampaignStepStatus.sentAt})`))
        .limit(10);
      
      for (const stale of staleDripCustomers) {
        if (!stale.customer.email) continue;
        
        // Check if customer has replied since the drip was sent
        const hasReplied = await db
          .select({ id: gmailMessages.id })
          .from(gmailMessages)
          .where(and(
            eq(gmailMessages.direction, 'inbound'),
            eq(gmailMessages.customerId, stale.customer.id),
            gt(gmailMessages.sentAt, stale.lastStepSentAt)
          ))
          .limit(1);
        
        if (hasReplied.length > 0) continue; // They replied, no need for creative follow-up
        
        // Check if we already handled this stale campaign
        const alreadyHandled = await db
          .select({ id: spotlightEvents.id })
          .from(spotlightEvents)
          .where(and(
            eq(spotlightEvents.customerId, stale.customer.id),
            sql`${spotlightEvents.taskId} LIKE 'follow_ups::drip_stale_%'`,
            gte(spotlightEvents.createdAt, stale.lastStepSentAt)
          ))
          .limit(1);
        
        if (alreadyHandled.length === 0) {
          const daysSinceLastEmail = Math.floor((Date.now() - (stale.lastStepSentAt?.getTime() || 0)) / (1000 * 60 * 60 * 24));
          
          return {
            id: `follow_ups::drip_stale_${stale.assignmentId}::${stale.customer.id}::drip_stale_followup`,
            customerId: stale.customer.id,
            bucket: 'follow_ups',
            taskSubtype: 'drip_stale_followup',
            priority: 70,
            whyNow: `⏰ ${daysSinceLastEmail} days since "${stale.campaignName}" ended - no response. Try something creative!`,
            outcomes: TASK_OUTCOMES.drip_stale_followup,
            customer: stale.customer,
            context: {
              campaignName: stale.campaignName,
              lastEmailSentAt: stale.lastStepSentAt?.toISOString(),
              emailsSent: stale.totalStepsSent,
              daysSinceLastEmail,
              sourceType: 'drip_stale',
            },
          };
        }
      }
    } catch (error) {
      console.error('[Spotlight] Error finding drip stale followup task:', error);
    }
    return null;
  }

  // Find customers with pending Odoo quotations (draft/sent state, not converted to sales order)
  private async findOdooQuoteFollowUpTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    // Skip if Odoo is not configured
    if (!isOdooConfigured()) {
      return null;
    }

    try {
      // Get customers with Odoo partner IDs that haven't been skipped
      let conditions = [
        isNotNull(customers.odooPartnerId),
        eq(customers.doNotContact, false),
        or(
          isNull(customers.salesRepId),
          eq(customers.salesRepId, userId)
        ),
      ];

      if (skippedIds.length > 0) {
        conditions.push(notInArray(customers.id, skippedIds));
      }

      // Get a batch of customers with Odoo partner IDs
      const customersWithOdoo = await db
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
          customerType: customers.customerType,
          odooPartnerId: customers.odooPartnerId,
          isHotProspect: customers.isHotProspect,
        })
        .from(customers)
        .where(and(...conditions))
        .orderBy(desc(customers.isHotProspect), desc(customers.updatedAt))
        .limit(20);

      // Check each customer for pending Odoo quotations
      for (const customer of customersWithOdoo) {
        if (!customer.odooPartnerId) continue;

        try {
          const pendingQuotes = await odooClient.getQuotesByPartner(customer.odooPartnerId);
          
          if (pendingQuotes && pendingQuotes.length > 0) {
            // Found a pending quote! Create a follow-up task
            const quote = pendingQuotes[0]; // Take the most recent
            const quoteDate = quote.date_order ? new Date(quote.date_order) : null;
            const daysSinceQuote = quoteDate 
              ? Math.floor((Date.now() - quoteDate.getTime()) / (1000 * 60 * 60 * 24))
              : null;

            return {
              id: `follow_ups::${customer.id}::odoo_quote_followup`,
              customerId: customer.id,
              bucket: 'follow_ups',
              taskSubtype: 'odoo_quote_followup',
              priority: 95, // High priority - pending quotes need follow-up
              whyNow: `Pending Odoo quote ${quote.name} for $${Number(quote.amount_total || 0).toFixed(2)}${daysSinceQuote !== null ? ` (${daysSinceQuote} days ago)` : ''}`,
              outcomes: [
                { id: 'called', label: 'Called Customer', icon: 'phone' },
                { id: 'email_sent', label: 'Sent Follow-up Email', icon: 'mail' },
                { id: 'order_confirmed', label: 'Order Confirmed!', icon: 'check' },
                { id: 'quote_expired', label: 'Quote Expired/Lost', icon: 'x' },
              ],
              extraContext: {
                odooQuoteId: quote.id,
                odooQuoteName: quote.name,
                odooQuoteState: quote.state,
                odooQuoteAmount: quote.amount_total,
                odooQuoteDate: quote.date_order,
                odooQuoteValidityDate: quote.validity_date,
                daysSinceQuote,
                sourceType: 'odoo_quotation',
              },
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
                sourceType: 'odoo_quotation',
                odooQuoteDetails: {
                  id: quote.id,
                  name: quote.name,
                  amount: quote.amount_total,
                  date: quote.date_order,
                  state: quote.state,
                },
              },
            };
          }
        } catch (odooErr) {
          // Log but continue to next customer if Odoo call fails
          console.error(`[Spotlight] Error fetching Odoo quotes for partner ${customer.odooPartnerId}:`, odooErr);
        }
      }
    } catch (error) {
      console.error('[Spotlight] Error finding Odoo quote follow-up task:', error);
    }
    return null;
  }

  // Find customers who received $0.00 sample orders and may need follow-up
  private async findOdooSampleOrderFollowUpTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    // Skip if Odoo is not configured
    if (!isOdooConfigured()) {
      return null;
    }

    try {
      // Get $0.00 sample orders from Odoo (since Jan 1st 2026)
      const sampleOrders = await odooClient.getZeroValueSampleOrders('2026-01-01');
      
      if (!sampleOrders || sampleOrders.length === 0) {
        return null;
      }

      // Get partner IDs from sample orders
      const partnerIds = sampleOrders
        .filter(order => order.partner_id)
        .map(order => Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id);
      
      if (partnerIds.length === 0) {
        return null;
      }

      // Find matching customers - filter by odooPartnerId from sample orders
      let conditions = [
        inArray(customers.odooPartnerId, partnerIds), // Only customers with sample orders
        eq(customers.doNotContact, false),
        or(
          isNull(customers.salesRepId),
          eq(customers.salesRepId, userId)
        ),
      ];

      if (skippedIds.length > 0) {
        conditions.push(notInArray(customers.id, skippedIds));
      }

      const matchingCustomers = await db
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
          odooPartnerId: customers.odooPartnerId,
        })
        .from(customers)
        .where(and(...conditions)); // Removed limit - we want all matches

      // Log if sample orders exist but no matching customers found
      if (matchingCustomers.length === 0 && sampleOrders.length > 0) {
        console.log(`[Spotlight] Found ${sampleOrders.length} $0.00 sample orders but no matching customers in database`);
        return null;
      }

      // Match customers to sample orders
      for (const customer of matchingCustomers) {
        if (!customer.odooPartnerId) continue;

        const customerSampleOrder = sampleOrders.find(order => {
          const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
          return partnerId === customer.odooPartnerId;
        });

        if (customerSampleOrder) {
          const orderDate = customerSampleOrder.date_order ? new Date(customerSampleOrder.date_order) : null;
          const daysSinceSample = orderDate 
            ? Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          // Check if we already followed up on this sample order
          const alreadyHandled = await db
            .select({ id: spotlightEvents.id })
            .from(spotlightEvents)
            .where(and(
              eq(spotlightEvents.customerId, customer.id),
              eq(spotlightEvents.eventType, 'task_completed'),
              sql`${spotlightEvents.details}->>'taskSubtype' = 'odoo_sample_followup'`,
              sql`${spotlightEvents.details}->>'odooOrderId' = ${String(customerSampleOrder.id)}`
            ))
            .limit(1);

          if (alreadyHandled.length > 0) {
            continue; // Already followed up on this sample order
          }

          return {
            id: `follow_ups::${customer.id}::odoo_sample_followup_${customerSampleOrder.id}`,
            customerId: customer.id,
            bucket: 'follow_ups',
            taskSubtype: 'odoo_sample_followup',
            priority: 90, // High priority for sample follow-ups
            whyNow: `🎁 Samples sent (${customerSampleOrder.name}) - Follow up to see if they liked the product!`,
            outcomes: [
              { id: 'called', label: 'Called Customer', icon: 'phone' },
              { id: 'email_sent', label: 'Sent Follow-up Email', icon: 'mail' },
              { id: 'order_placed', label: 'They Ordered!', icon: 'check' },
              { id: 'not_interested', label: 'Not Interested', icon: 'x' },
              { id: 'skip', label: 'Skip for Now', icon: 'clock' },
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
              sourceType: 'odoo_sample_order',
            },
            extraContext: {
              odooOrderId: customerSampleOrder.id,
              odooOrderName: customerSampleOrder.name,
              odooOrderDate: customerSampleOrder.date_order,
              daysSinceSample,
              isProTip: true,
              proTipMessage: `You sent this Sales Order (${customerSampleOrder.name}) with $0.00 value${daysSinceSample !== null ? ` ${daysSinceSample} days ago` : ''}. Would you like to follow up with the customer to see how they liked the samples?`,
            },
          };
        }
      }
    } catch (error) {
      console.error('[Spotlight] Error finding Odoo sample order follow-up task:', error);
    }
    return null;
  }

  private async findFollowUpTask(userId: string, skippedIds: string[]): Promise<SpotlightTask | null> {
    const now = new Date();
    const customerSkippedIds = skippedIds.filter(id => !id.startsWith('lead-'));
    
    // PRIORITY 0: Check for stale DRIP campaigns - 10 days no response, creative follow-up options
    const dripStaleTask = await this.findDripStaleFollowupTask(userId, customerSkippedIds);
    if (dripStaleTask) {
      return dripStaleTask;
    }
    
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
    
    // PRIORITY 1.5: Odoo pending quotations (draft/sent state, not converted)
    const odooQuoteTask = await this.findOdooQuoteFollowUpTask(userId, customerSkippedIds);
    if (odooQuoteTask) {
      return odooQuoteTask;
    }
    
    // PRIORITY 1.6: Odoo $0.00 sample orders - follow up on samples sent
    const sampleOrderTask = await this.findOdooSampleOrderFollowUpTask(userId, customerSkippedIds);
    if (sampleOrderTask) {
      return sampleOrderTask;
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
          gmailMessageId: gmailMessages.gmailMessageId,
          threadId: gmailMessages.threadId,
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
            customerType: customers.customerType,
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
            // Pricing keywords
            sql`LOWER(${gmailMessages.subject}) LIKE '%pricing%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%price list%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%price%'`,
            // Sample/swatchbook keywords
            sql`LOWER(${gmailMessages.subject}) LIKE '%sample%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%swatchbook%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%press test%'`,
            // Quote/proposal keywords
            sql`LOWER(${gmailMessages.subject}) LIKE '%quote%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%proposal%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%estimate%'`,
            // Product/catalog keywords
            sql`LOWER(${gmailMessages.subject}) LIKE '%catalog%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%product%'`,
            // Follow-up indicators
            sql`LOWER(${gmailMessages.subject}) LIKE '%following up%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%follow up%'`,
            sql`LOWER(${gmailMessages.subject}) LIKE '%checking in%'`,
            // Body keywords for sales-related content
            sql`LOWER(${gmailMessages.snippet}) LIKE '%pricing%'`,
            sql`LOWER(${gmailMessages.snippet}) LIKE '%sample%'`,
            sql`LOWER(${gmailMessages.snippet}) LIKE '%quote%'`,
            sql`LOWER(${gmailMessages.snippet}) LIKE '%attached%'`
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
            gmailMessageId: emailData.gmailMessageId || undefined,
            gmailThreadId: emailData.threadId || undefined,
            originalSubject: emailData.subject || undefined,
            sentAt: emailData.sentAt?.toISOString(),
            sourceType: 'email_pricing_samples',
          },
        };
      }
    } catch (err) {
      console.error('[Spotlight] Error fetching email follow-up tasks:', err);
    }
    
    // PRIORITY 2.7: Older unreplied emails (2-3 days old) - leads going cold!
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      twoDaysAgo.setHours(23, 59, 59, 999);
      
      // Find outbound emails from 2-3 days ago that haven't been followed up
      const olderEmailFollowUps = await db
        .select({
          id: gmailMessages.id,
          gmailMessageId: gmailMessages.gmailMessageId,
          subject: gmailMessages.subject,
          snippet: gmailMessages.snippet,
          toEmail: gmailMessages.toEmail,
          threadId: gmailMessages.threadId,
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
            customerType: customers.customerType,
            updatedAt: customers.updatedAt,
            isHotProspect: customers.isHotProspect,
          },
        })
        .from(gmailMessages)
        .leftJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(and(
          eq(gmailMessages.userId, userId),
          eq(gmailMessages.direction, 'outbound'),
          gte(gmailMessages.sentAt, threeDaysAgo),
          lte(gmailMessages.sentAt, twoDaysAgo),
          isNotNull(gmailMessages.customerId),
          // Exclude already skipped customers
          ...(skippedIds.filter(id => !id.startsWith('lead-')).length > 0 
            ? [sql`${gmailMessages.customerId} NOT IN (${sql.raw(skippedIds.filter(id => !id.startsWith('lead-')).map(id => `'${id}'`).join(','))})`] 
            : []),
          // Exclude internal emails
          sql`LOWER(${gmailMessages.toEmail}) NOT LIKE '%4sgraphics%'`
        ))
        .orderBy(asc(gmailMessages.sentAt)) // Oldest first - most urgent
        .limit(1);
      
      if (olderEmailFollowUps.length > 0 && olderEmailFollowUps[0].customer) {
        const emailData = olderEmailFollowUps[0];
        
        // Check if there's been an inbound reply in this thread
        const hasReply = emailData.threadId ? await db
          .select({ id: gmailMessages.id })
          .from(gmailMessages)
          .where(and(
            eq(gmailMessages.threadId, emailData.threadId),
            eq(gmailMessages.direction, 'inbound'),
            gt(gmailMessages.sentAt, emailData.sentAt!)
          ))
          .limit(1) : [];
        
        // Only show if no reply received
        if (hasReply.length === 0) {
          const subjectPreview = emailData.subject?.substring(0, 40) || 'Email';
          const daysSent = Math.floor((now.getTime() - (emailData.sentAt?.getTime() || 0)) / (1000 * 60 * 60 * 24));
          
          return {
            id: `follow_ups::unreplied_email_${emailData.id}::${emailData.customer.id}::unreplied_email_followup`,
            customerId: emailData.customer.id,
            bucket: 'follow_ups',
            taskSubtype: 'pricing_samples_followup', // Use same outcomes
            priority: 80, // Slightly lower than yesterday's emails
            whyNow: `⚠️ No reply in ${daysSent} days: "${subjectPreview}..." - Follow up before they go cold!`,
            outcomes: [
              { id: 'called', label: 'Called', icon: 'phone' },
              { id: 'email_sent', label: 'Sent Follow-up', icon: 'mail' },
              { id: 'replied', label: 'They Replied', icon: 'check' },
              { id: 'skip', label: 'Skip', icon: 'x' },
            ],
            customer: emailData.customer,
            context: {
              emailId: emailData.id,
              gmailMessageId: emailData.gmailMessageId || undefined,
              gmailThreadId: emailData.threadId || undefined,
              originalSubject: emailData.subject || undefined,
              sentAt: emailData.sentAt?.toISOString(),
              daysSinceEmail: daysSent,
              sourceType: 'unreplied_email',
            },
          };
        }
      }
    } catch (err) {
      console.error('[Spotlight] Error fetching unreplied email tasks:', err);
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
            customerType: customers.customerType,
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
            customerType: customers.customerType,
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
      // Customer type - is this a Printer or Reseller? (determines if we need machine info)
      { subtype: 'hygiene_customer_type', condition: isNull(customers.customerType), excludeGeneric: true },
      // Machine profiles - only for Printing Companies, checked async after core data is complete
      { subtype: 'hygiene_machines', condition: eq(customers.customerType, 'printer'), excludeGeneric: true, requiresCustomerType: true },
      // Low priority: Generic email domain customers (gmail, yahoo, etc.) - saved for last
      { subtype: 'hygiene_sales_rep_generic', condition: and(isNull(customers.salesRepId), isNull(customers.salesRepName)), onlyGeneric: true },
      { subtype: 'hygiene_pricing_tier_generic', condition: isNull(customers.pricingTier), onlyGeneric: true },
      { subtype: 'hygiene_name_generic', condition: and(isNull(customers.firstName), isNull(customers.lastName)), onlyGeneric: true },
      { subtype: 'hygiene_company_generic', condition: isNull(customers.company), onlyGeneric: true },
      { subtype: 'hygiene_phone_generic', condition: isNull(customers.phone), onlyGeneric: true },
    ];

    // CRITICAL: Get customer IDs with pending bounced emails
    // These customers should ONLY appear as bounced email tasks, not regular hygiene tasks
    // Bounced emails must be investigated FIRST before any data hygiene work
    const pendingBouncedCustomerIds: string[] = [];
    try {
      const pendingBounces = await db
        .select({ customerId: bouncedEmails.customerId })
        .from(bouncedEmails)
        .where(and(
          isNotNull(bouncedEmails.customerId),
          or(
            eq(bouncedEmails.status, 'pending'),
            eq(bouncedEmails.status, 'investigating')
          )
        ));
      for (const b of pendingBounces) {
        if (b.customerId) pendingBouncedCustomerIds.push(b.customerId);
      }
    } catch (e) {
      console.error('[Spotlight] Error getting bounced customer IDs:', e);
    }

    for (let i = 0; i < priorityOrder.length; i++) {
      const item = priorityOrder[i];
      const { subtype, condition } = item;
      const excludeGeneric = 'excludeGeneric' in item ? item.excludeGeneric : false;
      const onlyGeneric = 'onlyGeneric' in item ? item.onlyGeneric : false;
      const special = 'special' in item ? (item as any).special : null;
      
      // Special handling for bounced email detection - uses bouncedEmails table
      if (special === 'bounced_email') {
        const bouncedResult = await this.findBouncedEmailCustomer(userId, skippedIds);
        if (bouncedResult) {
          const task = this.buildTask(bouncedResult.customer, 'data_hygiene', 'hygiene_bounced_email', i + 1, {
            bouncedEmail: bouncedResult.bouncedEmail,
            bounceSubject: bouncedResult.bounceSubject,
            bounceDate: bouncedResult.bounceDate,
            bounceId: bouncedResult.bounceId,
            matchType: bouncedResult.matchType,
          });
          // If this is a lead bounce, mark the task appropriately
          if (bouncedResult.matchType === 'lead' && bouncedResult.lead) {
            task.isLeadTask = true;
            task.leadId = bouncedResult.lead.id;
            task.lead = bouncedResult.lead;
          }
          return task;
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
        // Exclude customers with pending bounced emails
        if (pendingBouncedCustomerIds.length > 0) {
          machineConditions.push(notInArray(customers.id, pendingBouncedCustomerIds));
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
            customerType: customers.customerType,
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
      
      // CRITICAL: Exclude customers with pending bounced emails from regular hygiene tasks
      // They should ONLY appear as bounced email tasks until the bounce is resolved
      if (pendingBouncedCustomerIds.length > 0) {
        whereConditions.push(notInArray(customers.id, pendingBouncedCustomerIds));
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
            customerType: customers.customerType,
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

    // Check for leads missing customer type (reseller vs printer)
    const skippedLeadIds = skippedIds
      .filter(id => id.startsWith('lead-'))
      .map(id => parseInt(id.replace('lead-', '')))
      .filter(id => !isNaN(id));
    
    let leadConditions: any[] = [
      isNull(leads.customerType),
      notInArray(leads.stage, ['converted', 'lost']),
      or(isNull(leads.salesRepId), eq(leads.salesRepId, userId)),
    ];
    
    if (skippedLeadIds.length > 0) {
      leadConditions.push(notInArray(leads.id, skippedLeadIds));
    }
    
    const leadResult = await db
      .select()
      .from(leads)
      .where(and(...leadConditions))
      .orderBy(desc(leads.score), desc(leads.updatedAt))
      .limit(1);
    
    if (leadResult.length > 0) {
      const lead = leadResult[0];
      return this.buildLeadTask(lead, 'data_hygiene', 'hygiene_customer_type', 50);
    }

    return null;
  }
  
  // Cache for bounce scan to avoid repeated Gmail API calls
  private bounceScanCache: Map<string, { lastScan: number }> = new Map();
  private BOUNCE_SCAN_INTERVAL = 5 * 60 * 1000; // 5 minutes between scans

  private async findBouncedEmailCustomer(userId: string, skippedIds: string[]): Promise<{
    customer: any;
    lead?: any;
    bouncedEmail: string;
    bounceSubject: string;
    bounceDate: string;
    bounceId: number;
    matchType: string;
  } | null> {
    try {
      // Only scan for bounced emails every 5 minutes to avoid slow Gmail API calls
      const cacheKey = userId;
      const cached = this.bounceScanCache.get(cacheKey);
      const now = Date.now();
      
      if (!cached || (now - cached.lastScan) > this.BOUNCE_SCAN_INTERVAL) {
        try {
          await scanForBouncedEmails(userId);
          this.bounceScanCache.set(cacheKey, { lastScan: now });
        } catch (scanError) {
          // Don't block on scan errors, just skip
          this.bounceScanCache.set(cacheKey, { lastScan: now }); // Still cache to avoid retrying
        }
      }
      
      // Query the bouncedEmails table for pending or investigating bounces
      // "investigating" bounces resurface after their investigateUntil date
      const currentDate = new Date();
      
      // Priority: customer matches first, then contact matches, then lead matches
      const pendingBounces = await db
        .select({
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
          investigateUntil: bouncedEmails.investigateUntil,
        })
        .from(bouncedEmails)
        .where(or(
          eq(bouncedEmails.status, 'pending'),
          // Investigating bounces resurface after investigateUntil date has passed
          // Legacy records without investigateUntil are treated as immediately resurfaceable
          and(
            eq(bouncedEmails.status, 'investigating'),
            or(
              lt(bouncedEmails.investigateUntil, currentDate),
              isNull(bouncedEmails.investigateUntil)
            )
          )
        ))
        .orderBy(desc(bouncedEmails.bounceDate))
        .limit(10);
      
      if (pendingBounces.length === 0) {
        return null;
      }
      
      // Process bounces - try to find one with a valid customer/lead
      for (const bounce of pendingBounces) {
        // Handle customer bounces
        if (bounce.customerId && bounce.matchType !== 'lead') {
          // Check if customer is skipped
          if (skippedIds.includes(bounce.customerId)) {
            continue;
          }
          
          // Get customer data
          const customerData = await db
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
            customerType: customers.customerType,
              updatedAt: customers.updatedAt,
              isHotProspect: customers.isHotProspect,
            })
            .from(customers)
            .where(and(
              eq(customers.id, bounce.customerId),
              eq(customers.doNotContact, false),
              or(isNull(customers.salesRepId), eq(customers.salesRepId, userId)),
            ))
            .limit(1);
          
          if (customerData.length > 0) {
            return {
              customer: customerData[0],
              bouncedEmail: bounce.bouncedEmail,
              bounceSubject: bounce.bounceSubject || 'Delivery failure',
              bounceDate: bounce.bounceDate?.toISOString() || new Date().toISOString(),
              bounceId: bounce.id,
              matchType: bounce.matchType || 'customer',
            };
          }
        }
        
        // Handle lead bounces
        if (bounce.leadId && bounce.matchType === 'lead') {
          const leadId = bounce.leadId;
          // Check if lead task is skipped
          if (skippedIds.includes(`lead-${leadId}`)) {
            continue;
          }
          
          // Get lead data - bounced emails should show regardless of sales rep assignment
          // since they're data quality issues that need immediate attention
          const leadData = await db
            .select()
            .from(leads)
            .where(eq(leads.id, leadId))
            .limit(1);
          
          if (leadData.length > 0) {
            // Build a customer-like object for lead display in SPOTLIGHT
            const lead = leadData[0];
            return {
              customer: {
                id: `lead-${lead.id}`,
                company: lead.company || lead.name,
                firstName: lead.name?.split(' ')[0] || '',
                lastName: lead.name?.split(' ').slice(1).join(' ') || '',
                email: lead.email,
                phone: lead.phone,
                city: lead.city,
                province: lead.province,
                country: lead.country,
                salesRepId: lead.salesRepId,
                salesRepName: lead.salesRepName,
                pricingTier: lead.pricingTier,
                isHotProspect: lead.score && lead.score >= 50,
              },
              lead: lead,
              bouncedEmail: bounce.bouncedEmail,
              bounceSubject: bounce.bounceSubject || 'Delivery failure',
              bounceDate: bounce.bounceDate?.toISOString() || new Date().toISOString(),
              bounceId: bounce.id,
              matchType: 'lead',
            };
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
            customerType: customers.customerType,
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
            customerType: customers.customerType,
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
        customerType: lead.customerType,
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
        customerType: lead.customerType,
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
    const session = await this.getSessionAsync(userId);
    
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
            customerType: customers.customerType,
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
      // Handle lead DNC vs customer DNC
      if (isLeadTask && leadId) {
        await db.update(leads)
          .set({ 
            stage: 'lost',
            lostReason: 'Bounced email - marked as do not contact',
            updatedAt: new Date(),
          })
          .where(eq(leads.id, leadId));
        console.log(`[Spotlight] Lead ${leadId} marked as lost/DNC by user ${userId}`);
      } else {
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
      
      // Resolve any bounced email records for this customer/lead
      if (subtype === 'hygiene_bounced_email' && extraContext?.bounceId) {
        await db.update(bouncedEmails)
          .set({
            status: 'resolved',
            resolution: 'mark_dnc',
            resolvedAt: new Date(),
            resolvedBy: userId,
          })
          .where(eq(bouncedEmails.id, extraContext.bounceId as number));
        console.log(`[Spotlight] Bounce record ${extraContext.bounceId} resolved as mark_dnc`);
      }
    }
    
    // Handle "keep" action for bounced emails - mark bounce as resolved but keep contact active
    if (subtype === 'hygiene_bounced_email' && outcomeId === 'keep' && extraContext?.bounceId) {
      await db.update(bouncedEmails)
        .set({
          status: 'resolved',
          resolution: 'keep',
          resolvedAt: new Date(),
          resolvedBy: userId,
        })
        .where(eq(bouncedEmails.id, extraContext.bounceId as number));
      console.log(`[Spotlight] Bounce record ${extraContext.bounceId} resolved as keep`);
    }
    
    // Handle delete_record action - permanently delete the customer/lead
    if (selectedOutcome?.nextAction?.type === 'delete_record') {
      try {
        // Handle lead deletions
        if (isLeadTask && leadId) {
          const leadData = await db.select({
            id: leads.id,
            name: leads.name,
            email: leads.email,
            company: leads.company,
          }).from(leads).where(eq(leads.id, leadId)).limit(1);
          
          console.log(`[Spotlight] Lead deletion initiated by user ${userId}:`, {
            leadId,
            name: leadData[0]?.name,
            email: leadData[0]?.email,
            company: leadData[0]?.company,
            reason: 'bounced_email',
            taskSubtype: subtype,
          });
          
          // Delete the lead record
          await db.delete(leads).where(eq(leads.id, leadId));
          
          console.log(`[Spotlight] Lead ${leadId} deleted successfully due to bounced email by user ${userId}`);
          
          // Resolve bounce record if this is a bounced email task
          if (subtype === 'hygiene_bounced_email' && extraContext?.bounceId) {
            await db.update(bouncedEmails)
              .set({
                status: 'resolved',
                resolution: 'delete',
                resolvedAt: new Date(),
                resolvedBy: userId,
              })
              .where(eq(bouncedEmails.id, extraContext.bounceId as number));
            console.log(`[Spotlight] Bounce record ${extraContext.bounceId} resolved as delete`);
          }
          
          return { success: true, deleted: true };
        }
        
        // Handle customer deletions
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
        
        // Resolve bounce record if this is a bounced email task
        if (subtype === 'hygiene_bounced_email' && extraContext?.bounceId) {
          await db.update(bouncedEmails)
            .set({
              status: 'resolved',
              resolution: 'delete',
              resolvedAt: new Date(),
              resolvedBy: userId,
            })
            .where(eq(bouncedEmails.id, extraContext.bounceId as number));
          console.log(`[Spotlight] Bounce record ${extraContext.bounceId} resolved as delete`);
        }
        
        // Return success - the record has been deleted
        return { success: true, deleted: true };
      } catch (deleteError) {
        console.error(`[Spotlight] Failed to delete customer/lead ${customerId || leadId}:`, deleteError);
        // Continue with normal flow - at least mark the task as completed
      }
    }

    // Handle set_customer_type action - set customer or lead as printer or reseller
    if (selectedOutcome?.nextAction?.type === 'set_customer_type') {
      const customerType = (selectedOutcome.nextAction as any).customerType;
      
      if (isLeadTask && leadId) {
        // Update lead's customer type
        await db.update(leads)
          .set({ 
            customerType,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, leadId));
        console.log(`[Spotlight] Lead ${leadId} set as ${customerType} by user ${userId}`);
      } else {
        // Update customer's customer type
        await db.update(customers)
          .set({ 
            customerType,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customerId));
        console.log(`[Spotlight] Customer ${customerId} set as ${customerType} by user ${userId}`);
      }
    }

    let nextFollowUp: { date: Date; type: string } | undefined;
    
    // Handle "remind_later" outcome for email tasks - directly schedule a follow-up
    if (outcomeId === 'remind_later' && customFollowUpDays) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + customFollowUpDays);
      
      await db.insert(followUpTasks).values({
        customerId,
        title: `📧 Email Follow-up Reminder`,
        description: notes || `Reminder to follow up on this email task`,
        taskType: 'email_follow_up',
        dueDate,
        status: 'pending',
        assignedTo: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      nextFollowUp = { date: dueDate, type: 'email_follow_up' };
      console.log(`[Spotlight] Created email reminder for ${customerId} in ${customFollowUpDays} days`);
    }
    // Handle custom follow-up with user-specified days
    else if (selectedOutcome?.nextAction?.type === 'custom_follow_up' && customFollowUpDays) {
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
      
      // For lead tasks, don't create customer follow-up tasks (leads use lead tracking)
      if (!isLeadTask) {
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
      }

      nextFollowUp = { date: dueDate, type: selectedOutcome.nextAction.taskType || 'follow_up' };
      
      // For bounced email "skip" actions, mark the bounce as investigating (not resolved)
      // This allows it to resurface after the follow-up period (7 days)
      if (subtype === 'hygiene_bounced_email' && outcomeId === 'skip' && extraContext?.bounceId) {
        const investigateUntilDate = new Date();
        investigateUntilDate.setDate(investigateUntilDate.getDate() + 7);
        
        await db.update(bouncedEmails)
          .set({
            status: 'investigating',
            investigateUntil: investigateUntilDate,
          })
          .where(eq(bouncedEmails.id, extraContext.bounceId as number));
        console.log(`[Spotlight] Bounce record ${extraContext.bounceId} set to investigating until ${investigateUntilDate.toISOString()}`);
      }
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
    
    // Only log customer activity for real customers (not leads with synthetic IDs)
    // Lead-prefixed IDs like 'lead-123' are not valid customer IDs in the database
    if (!isLeadTask && !customerId.startsWith('lead-')) {
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
    
    // Persist session state to database (survives server restarts)
    await this.persistSessionState(userId, session);

    console.log(`[Spotlight] Task completed for customer ${customerId}, bucket ${bucket}, outcome ${outcomeId}`);

    return { success: true, nextFollowUp };
  }

  async skipTask(userId: string, taskId: string, reason: string): Promise<void> {
    const session = await this.getSessionAsync(userId);
    
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
   * Remind Me Again Today - defers task to end of day
   * The task will be temporarily skipped but tracked for later reappearance
   * Uses spotlight_events with 'remind_today' event_type to persist across restarts
   */
  async remindToday(userId: string, taskId: string): Promise<void> {
    const session = await this.getSessionAsync(userId);
    
    let customerId: string;
    let bucket: TaskBucket;
    let subtype: string;
    
    if (taskId.includes('::')) {
      const parts = taskId.split('::');
      bucket = parts[0] as TaskBucket;
      if (parts.length === 4) {
        if (parts[1] === 'lead') {
          customerId = `lead-${parts[2]}`;
          subtype = parts[3];
        } else {
          customerId = parts[2];
          subtype = parts[3];
        }
      } else {
        customerId = parts[1];
        subtype = parts[2];
      }
    } else {
      const parts = taskId.split('_');
      bucket = parts[0] as TaskBucket;
      customerId = parts[1];
      subtype = parts.slice(2).join('_');
    }

    // Add to skipped list so it moves to end of queue for now
    // But we'll also track it as remind_today so getNextTask can resurface it later
    if (!session.skippedCustomerIds.includes(customerId)) {
      session.skippedCustomerIds.push(customerId);
    }

    // Track in session for in-memory end-of-day reappearance
    if (!session.remindTodayTasks) {
      session.remindTodayTasks = [];
    }
    session.remindTodayTasks.push({
      taskId,
      customerId,
      bucket,
      subtype,
      remindedAt: new Date(),
    });

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Persist to DB for cross-restart durability and next-day priority
    try {
      await db.insert(spotlightEvents).values({
        eventType: 'remind_today',
        userId,
        customerId,
        bucket,
        taskSubtype: subtype,
        skipReason: `remind_today::${today}`, // Include date for next-day tracking
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
      });
    } catch (e) {
      console.error('[Spotlight] Failed to log remind_today event:', e);
    }

    await this.releaseClaim(userId);

    console.log(`[Spotlight] User ${userId} set remind today for task ${taskId}`);
  }

  /**
   * Get tasks that were marked "Remind Me Again Today" - for EOD surfacing
   * Returns tasks that should reappear at end of current session
   */
  getRemindTodayTasks(userId: string): Array<{taskId: string; customerId: string; bucket: TaskBucket; subtype: string; remindedAt: Date}> {
    const session = this.getSession(userId);
    return session.remindTodayTasks || [];
  }

  /**
   * Clear a remind-today task from skipped list so it can resurface
   * Call this when serving remind-today tasks at end of day
   */
  allowRemindTodayTask(userId: string, customerId: string): void {
    const session = this.getSession(userId);
    const idx = session.skippedCustomerIds.indexOf(customerId);
    if (idx >= 0) {
      session.skippedCustomerIds.splice(idx, 1);
    }
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

  async creditDirectAction(
    userId: string, 
    actionType: 'email_sent' | 'call_made' | 'swatchbook_sent',
    customerId?: string,
    leadId?: number,
    metadata?: Record<string, any>
  ): Promise<{ credited: boolean; bucket: TaskBucket; newProgress: { completed: number; target: number } }> {
    const session = await this.getSessionAsync(userId);
    
    const bucketMap: Record<string, TaskBucket> = {
      'email_sent': 'outreach',
      'call_made': 'calls',
      'swatchbook_sent': 'enablement',
    };
    
    const bucket = bucketMap[actionType];
    const bucketData = session.buckets.find(b => b.bucket === bucket);
    
    if (!bucketData) {
      console.log(`[Spotlight] Could not find bucket ${bucket} for action ${actionType}`);
      return { credited: false, bucket, newProgress: { completed: 0, target: 0 } };
    }
    
    if (bucketData.completed >= bucketData.target) {
      console.log(`[Spotlight] Bucket ${bucket} already at target, not crediting ${actionType}`);
      return { credited: false, bucket, newProgress: { completed: bucketData.completed, target: bucketData.target } };
    }
    
    bucketData.completed++;
    session.totalCompleted++;
    
    console.log(`[Spotlight] Credited direct action ${actionType} to ${bucket} bucket for user ${userId}. Progress: ${bucketData.completed}/${bucketData.target}`);
    
    try {
      await db.insert(spotlightEvents).values({
        userId,
        eventType: 'completed',
        customerId: customerId || null,
        leadId: leadId || null,
        bucket,
        taskSubtype: actionType,
        metadata: {
          outcome: actionType,
          directAction: true,
          ...metadata,
        },
      });
    } catch (e) {
      console.error('[Spotlight] Error recording direct action event:', e);
    }
    
    // Persist session state to database (survives server restarts)
    await this.persistSessionState(userId, session);
    
    return { 
      credited: true, 
      bucket, 
      newProgress: { completed: bucketData.completed, target: bucketData.target } 
    };
  }
}

export const spotlightEngine = new SpotlightEngine();
