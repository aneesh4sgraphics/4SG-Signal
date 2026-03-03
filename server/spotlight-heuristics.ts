import { db } from "./db";
import { customers, customerActivityEvents, customerMachineProfiles, adminCategories, adminMachineTypes, customerDoNotMerge } from "@shared/schema";
import { eq, and, sql, desc, lt, count, arrayContains, or } from "drizzle-orm";
import { performAutoMerge } from "./customer-merge";

export interface SpotlightHint {
  type: 'bad_fit' | 'stale_contact' | 'duplicate' | 'missing_field' | 'quick_win';
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
  // Paper / substrate / supply industry — clear printing-related businesses
  'paper', 'papers', 'substrate', 'substrates', 'media', 'stock',
  'supply', 'supplies', 'distributor', 'wholesale', 'converter',
  'coated', 'uncoated', 'bond', 'cardstock', 'card stock',
];

function normalizeText(text: string | null): string {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
}

// Match keyword as a whole word (surrounded by spaces or string boundaries).
// Prevents "spa" from matching "athenspaper", "nail" from matching "thumbnail", etc.
function matchesWholeWord(text: string, keyword: string): boolean {
  // Multi-word keywords: check as substring (they already have spaces)
  if (keyword.includes(' ')) return text.includes(keyword);
  const regex = new RegExp(`(?:^|\\s)${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
  return regex.test(text);
}

function checkBadFitCompany(company: string | null, website: string | null): SpotlightHint | null {
  const normalizedCompany = normalizeText(company);
  const normalizedWebsite = normalizeText(website);
  const combined = `${normalizedCompany} ${normalizedWebsite}`;
  
  // Check positive keywords first — any match means we leave them alone
  const hasPrintingKeyword = PRINTING_POSITIVE_KEYWORDS.some(kw => matchesWholeWord(combined, kw));
  if (hasPrintingKeyword) return null;
  
  // Check non-printing keywords using whole-word matching to avoid false positives
  // e.g. "spa" must not match "athenspaper", "nail" must not match "email"
  const matchedNonPrinting = NON_PRINTING_KEYWORDS.filter(kw => matchesWholeWord(combined, kw));
  
  if (matchedNonPrinting.length >= 1) {
    const primaryMatch = matchedNonPrinting[0];
    return {
      type: 'bad_fit',
      severity: matchedNonPrinting.length >= 2 ? 'high' : 'medium',
      message: `This looks like a ${primaryMatch} company — probably not in printing. Click "Mark as Bad Fit" to remove them from your task list permanently.`,
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

function normalizePhone(phone: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

async function checkDuplicate(email: string | null, phone: string | null, customerId: string): Promise<SpotlightHint | null> {
  if (!email && !phone) return null;
  
  try {
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const normalizedPhone = phone ? normalizePhone(phone) : '';

    const conditions = [];
    if (normalizedEmail) {
      conditions.push(sql`LOWER(TRIM(${customers.email})) = ${normalizedEmail}`);
    }
    if (normalizedPhone.length === 10) {
      conditions.push(sql`RIGHT(REGEXP_REPLACE(${customers.phone}, '[^0-9]', '', 'g'), 10) = ${normalizedPhone}`);
    }
    
    if (conditions.length === 0) return null;
    
    const duplicates = await db.select({ 
      id: customers.id, 
      company: customers.company,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      odooPartnerId: customers.odooPartnerId,
      sources: customers.sources,
    })
      .from(customers)
      .where(and(
        sql`${customers.id} != ${customerId}`,
        sql`(${sql.join(conditions, sql` OR `)})`
      ))
      .limit(3);
    
    if (duplicates.length === 0) return null;

    // Load "do not merge" exclusions
    const doNotMergeRecords = await db.select()
      .from(customerDoNotMerge)
      .where(or(
        and(eq(customerDoNotMerge.customerId1, customerId)),
        and(eq(customerDoNotMerge.customerId2, customerId))
      ));
    
    const doNotMergeIds = new Set<string>();
    for (const record of doNotMergeRecords) {
      doNotMergeIds.add(record.customerId1 === customerId ? record.customerId2 : record.customerId1);
    }

    // Partition duplicates into:
    //   exactEmailMatch — same normalised email (auto-merge silently, Odoo takes precedence)
    //   otherMatch     — phone-only or cross-source (show "Review & Merge" to user)
    const exactEmailMatches: typeof duplicates = [];
    const otherMatches: typeof duplicates = [];

    for (const dup of duplicates) {
      if (doNotMergeIds.has(dup.id)) continue; // user explicitly said "not a duplicate"

      const dupEmail = dup.email ? dup.email.toLowerCase().trim() : null;
      const isExactEmailMatch = normalizedEmail && dupEmail && dupEmail === normalizedEmail;

      // Suppress cross-source Odoo↔Shopify pairs — resolved by Shopify sync automatically.
      // Cross-source = one ID starts with "shopify_" and the other does not.
      const currentIsOdoo = !customerId.startsWith('shopify_');
      const dupIsShopify = dup.id.startsWith('shopify_');
      const isCrossSource = (currentIsOdoo && dupIsShopify) || (!currentIsOdoo && !dupIsShopify);
      if (isCrossSource) {
        // If they share the exact email, auto-merge (Odoo wins); otherwise just suppress.
        if (isExactEmailMatch) exactEmailMatches.push(dup);
        continue;
      }

      if (isExactEmailMatch) {
        exactEmailMatches.push(dup);
      } else {
        otherMatches.push(dup);
      }
    }

    // Auto-merge all exact-email pairs silently (fire-and-forget, non-blocking)
    for (const dup of exactEmailMatches) {
      const dupId = dup.id;
      performAutoMerge(customerId, dupId).catch(err => {
        console.error(`[AutoMerge] Failed to merge ${customerId} ↔ ${dupId}:`, err);
      });
      // After auto-merge the current task card will refresh on next Spotlight load — no hint needed
    }

    // Only show "Review & Merge" for phone-only / uncertain matches (not exact-email)
    if (otherMatches.length === 0) return null;

    const getDisplayName = (d: typeof otherMatches[0]) => {
      if (d.company && d.company.trim()) return d.company;
      const fullName = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
      if (fullName) return fullName;
      if (d.email) return d.email;
      return 'another record';
    };
    const duplicateNames = otherMatches.map(getDisplayName).slice(0, 2).join(', ');
    return {
      type: 'duplicate',
      severity: 'medium',
      message: `Possible duplicate of: ${duplicateNames}`,
      ctaLabel: 'Review & Merge',
      ctaAction: 'view_duplicate',
      metadata: { 
        duplicateIds: otherMatches.map(d => d.id),
        duplicateNames: otherMatches.map(d => ({ id: d.id, company: d.company, displayName: getDisplayName(d) })),
      },
    };
  } catch (e) {
    console.error('[Heuristics] Duplicate check error:', e);
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
  if (!customer.salesRepId) missing.push('sales rep');
  
  if (missing.length >= 2) {
    return {
      type: 'missing_field',
      severity: 'medium',
      message: `Missing ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''} - consider updating data first.`,
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

// Check if customer has machine profile
export async function getCustomerMachineProfiles(customerId: string): Promise<string[]> {
  try {
    const profiles = await db.select({ machineFamily: customerMachineProfiles.machineFamily })
      .from(customerMachineProfiles)
      .where(eq(customerMachineProfiles.customerId, customerId));
    return profiles.map(p => p.machineFamily);
  } catch (e) {
    console.error('[Heuristics] Machine profile check error:', e);
    return [];
  }
}

// Check if customer has core data but missing machine profile
export async function checkMissingMachineProfile(
  customerId: string,
  customer: {
    pricingTier: string | null;
    phone: string | null;
    salesRepId: string | null;
    streetAddress: string | null;
  }
): Promise<boolean> {
  // Only suggest machine profile confirmation if core data is complete
  const hasCoreDta = customer.pricingTier && customer.phone && customer.salesRepId;
  if (!hasCoreDta) return false;
  
  const machineProfiles = await getCustomerMachineProfiles(customerId);
  return machineProfiles.length === 0;
}

// Get product suggestions based on machine types - queries actual admin taxonomy
export async function getProductSuggestionsForMachines(machineTypes: string[]): Promise<string[]> {
  if (machineTypes.length === 0) return [];
  
  try {
    // Query admin_categories that are compatible with any of the customer's machine types
    const categories = await db.select({ 
      label: adminCategories.label,
      compatibleMachineTypes: adminCategories.compatibleMachineTypes 
    })
      .from(adminCategories)
      .where(eq(adminCategories.isActive, true));
    
    const matchingCategories: Set<string> = new Set();
    
    for (const cat of categories) {
      if (cat.compatibleMachineTypes && Array.isArray(cat.compatibleMachineTypes)) {
        // Check if any of customer's machine types are in this category's compatible machines
        const hasMatch = machineTypes.some(mt => 
          cat.compatibleMachineTypes!.includes(mt)
        );
        if (hasMatch) {
          matchingCategories.add(cat.label);
        }
      }
    }
    
    return Array.from(matchingCategories).slice(0, 3); // Limit to 3 suggestions
  } catch (e) {
    console.error('[Heuristics] Error fetching product suggestions:', e);
    return [];
  }
}

// Get machine label from machine type code - queries actual admin taxonomy
export async function getMachineLabel(machineTypeCode: string): Promise<string> {
  try {
    const [machine] = await db.select({ label: adminMachineTypes.label })
      .from(adminMachineTypes)
      .where(eq(adminMachineTypes.code, machineTypeCode))
      .limit(1);
    
    return machine?.label || machineTypeCode;
  } catch (e) {
    console.error('[Heuristics] Error fetching machine label:', e);
    return machineTypeCode;
  }
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
  
  const [stale, duplicate] = await Promise.all([
    checkStaleContact(customerId, customer.updatedAt),
    checkDuplicate(customer.email, customer.phone, customerId),
  ]);
  
  if (stale) hints.push(stale);
  if (duplicate) hints.push(duplicate);
  
  const missingField = checkMissingCriticalField(customer, momentType);
  if (missingField) hints.push(missingField);
  
  hints.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  
  return hints.slice(0, 3);
}
