import { db } from "./db";
import { customers, customerActivityEvents } from "@shared/schema";
import { eq, and, sql, desc, lt } from "drizzle-orm";

export interface SpotlightHint {
  type: 'bad_fit' | 'stale_contact' | 'duplicate' | 'missing_field' | 'already_handled' | 'quick_win';
  severity: 'high' | 'medium' | 'low';
  message: string;
  ctaLabel: string;
  ctaAction: string;
  metadata?: Record<string, any>;
}

const NON_PRINTING_KEYWORDS = [
  'logistics', 'freight', 'shipping', 'shipper', 'consolidator', 'consolidators',
  '3pl', 'third party logistics', 'warehouse', 'warehousing', 'distribution',
  'trucking', 'transport', 'transportation', 'carrier', 'carriers',
  'terminal', 'port', 'customs', 'customs broker', 'broker', 'brokerage',
  'forwarder', 'forwarding', 'courier', 'delivery', 'last mile',
  'drayage', 'intermodal', 'ltl', 'ftl', 'cold chain', 'cold storage',
  'fulfillment', 'supply chain', 'scm', 'inventory management',
  'real estate', 'realty', 'property management', 'mortgage', 'insurance',
  'accounting', 'tax services', 'legal', 'law firm', 'attorney',
  'medical', 'clinic', 'hospital', 'dental', 'pharmacy', 'healthcare',
  'restaurant', 'cafe', 'catering', 'food service', 'bakery',
  'salon', 'spa', 'beauty', 'nail', 'barbershop',
  'automotive', 'auto repair', 'mechanic', 'car wash', 'tire',
  'plumbing', 'hvac', 'electrical', 'roofing', 'construction',
  'landscaping', 'lawn care', 'cleaning', 'janitorial', 'maid service',
  'daycare', 'childcare', 'school', 'tutoring', 'education',
  'gym', 'fitness', 'yoga', 'crossfit', 'martial arts',
  'pet', 'veterinary', 'grooming', 'kennel', 'boarding',
];

const PRINTING_POSITIVE_KEYWORDS = [
  'print', 'printing', 'graphics', 'graphic', 'design', 'signs', 'signage',
  'apparel', 'clothing', 'textile', 'embroidery', 'screen print', 'dtg',
  'promotional', 'promo', 'merch', 'merchandise', 'swag',
  'vinyl', 'wrap', 'wraps', 'decal', 'sticker', 'label', 'labels',
  'banner', 'banners', 'display', 'trade show', 'exhibit',
  'packaging', 'box', 'carton', 'folding', 'corrugated',
  'offset', 'digital print', 'wide format', 'large format',
  'flexo', 'flexographic', 'letterpress', 'lithography',
  'marketing', 'advertising', 'agency', 'creative', 'brand',
];

function normalizeText(text: string | null): string {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
}

function checkBadFitCompany(company: string | null, website: string | null): SpotlightHint | null {
  const normalizedCompany = normalizeText(company);
  const normalizedWebsite = normalizeText(website);
  const combined = `${normalizedCompany} ${normalizedWebsite}`;
  
  const hasPrintingKeyword = PRINTING_POSITIVE_KEYWORDS.some(kw => combined.includes(kw));
  if (hasPrintingKeyword) return null;
  
  const matchedNonPrinting = NON_PRINTING_KEYWORDS.filter(kw => combined.includes(kw));
  
  if (matchedNonPrinting.length >= 1) {
    const primaryMatch = matchedNonPrinting[0];
    return {
      type: 'bad_fit',
      severity: matchedNonPrinting.length >= 2 ? 'high' : 'medium',
      message: `This looks like a ${primaryMatch} company - probably not in printing.`,
      ctaLabel: 'Mark as Bad Fit',
      ctaAction: 'bad_fit',
      metadata: { matchedKeywords: matchedNonPrinting },
    };
  }
  
  return null;
}

async function checkStaleContact(customerId: string, updatedAt: Date | null): Promise<SpotlightHint | null> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
  
  if (updatedAt && updatedAt < sixMonthsAgo) {
    const daysSinceUpdate = Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
    return {
      type: 'stale_contact',
      severity: daysSinceUpdate > 365 ? 'high' : 'medium',
      message: `No activity in ${daysSinceUpdate} days - they may have forgotten you.`,
      ctaLabel: 'Send Reactivation Email',
      ctaAction: 'reactivation_email',
      metadata: { daysSinceUpdate },
    };
  }
  
  return null;
}

async function checkDuplicate(email: string | null, phone: string | null, customerId: string): Promise<SpotlightHint | null> {
  if (!email && !phone) return null;
  
  try {
    const conditions = [];
    if (email) {
      conditions.push(sql`LOWER(${customers.email}) = LOWER(${email})`);
    }
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        conditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${customers.phone}, '-', ''), ' ', ''), '(', ''), ')', '') LIKE ${'%' + cleanPhone.slice(-10)}`);
      }
    }
    
    if (conditions.length === 0) return null;
    
    const duplicates = await db.select({ id: customers.id, company: customers.company })
      .from(customers)
      .where(and(
        sql`${customers.id} != ${customerId}`,
        sql`(${sql.join(conditions, sql` OR `)})`
      ))
      .limit(3);
    
    if (duplicates.length > 0) {
      return {
        type: 'duplicate',
        severity: 'medium',
        message: `Possible duplicate of "${duplicates[0].company || 'another contact'}"`,
        ctaLabel: 'Skip (Duplicate)',
        ctaAction: 'skip_duplicate',
        metadata: { duplicateIds: duplicates.map(d => d.id) },
      };
    }
  } catch (e) {
    console.error('[Heuristics] Duplicate check error:', e);
  }
  
  return null;
}

async function checkAlreadyHandled(customerId: string): Promise<SpotlightHint | null> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentActivity = await db.select()
      .from(customerActivityEvents)
      .where(and(
        eq(customerActivityEvents.customerId, customerId),
        sql`${customerActivityEvents.createdAt} > ${thirtyDaysAgo}`
      ))
      .orderBy(desc(customerActivityEvents.createdAt))
      .limit(1);
    
    if (recentActivity.length > 0) {
      const daysSince = Math.floor((Date.now() - new Date(recentActivity[0].createdAt!).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince < 7) {
        return {
          type: 'already_handled',
          severity: 'low',
          message: `Already contacted ${daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}: "${recentActivity[0].description?.slice(0, 50) || 'Recent activity'}"`,
          ctaLabel: 'Skip (Recent)',
          ctaAction: 'skip_recent',
          metadata: { lastActivityId: recentActivity[0].id, daysSince },
        };
      }
    }
  } catch (e) {
    console.error('[Heuristics] Already handled check error:', e);
  }
  
  return null;
}

function checkMissingCriticalField(customer: {
  phone: string | null;
  email: string | null;
  pricingTier: string | null;
  salesRepId: string | null;
}, momentType: string): SpotlightHint | null {
  if (momentType === 'data_hygiene') return null;
  
  const missing: string[] = [];
  if (!customer.email) missing.push('email');
  if (!customer.phone) missing.push('phone');
  if (!customer.pricingTier) missing.push('pricing tier');
  
  if (missing.length >= 2) {
    return {
      type: 'missing_field',
      severity: 'medium',
      message: `Missing ${missing.join(' and ')} - consider updating data first.`,
      ctaLabel: 'Fix Data First',
      ctaAction: 'fix_data',
      metadata: { missingFields: missing },
    };
  }
  
  return null;
}

function checkQuickWin(customer: {
  pricingTier: string | null;
  isHotProspect: boolean | null;
}): SpotlightHint | null {
  if (customer.isHotProspect) {
    return {
      type: 'quick_win',
      severity: 'high',
      message: 'Hot prospect - prioritize this contact!',
      ctaLabel: 'Call Now',
      ctaAction: 'prioritize_call',
    };
  }
  
  return null;
}

export async function analyzeForHints(
  customerId: string,
  customer: {
    company: string | null;
    website: string | null;
    email: string | null;
    phone: string | null;
    pricingTier: string | null;
    salesRepId: string | null;
    updatedAt: Date | null;
    isHotProspect: boolean | null;
  },
  momentType: string
): Promise<SpotlightHint[]> {
  const hints: SpotlightHint[] = [];
  
  const badFit = checkBadFitCompany(customer.company, customer.website);
  if (badFit) hints.push(badFit);
  
  const quickWin = checkQuickWin(customer);
  if (quickWin) hints.push(quickWin);
  
  const [stale, duplicate, alreadyHandled] = await Promise.all([
    checkStaleContact(customerId, customer.updatedAt),
    checkDuplicate(customer.email, customer.phone, customerId),
    checkAlreadyHandled(customerId),
  ]);
  
  if (stale) hints.push(stale);
  if (duplicate) hints.push(duplicate);
  if (alreadyHandled) hints.push(alreadyHandled);
  
  const missingField = checkMissingCriticalField(customer, momentType);
  if (missingField) hints.push(missingField);
  
  hints.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  
  return hints.slice(0, 3);
}
