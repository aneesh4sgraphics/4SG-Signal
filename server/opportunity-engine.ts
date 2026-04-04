import { db } from "./db";
import {
  customers, leads, customerMachineProfiles, emailSends, gmailMessages,
  opportunityScores, sampleShipments, spotlightEvents, labelPrints,
  shopifyOrders, customerCoachState, sentQuotes, emailTrackingTokens, categoryTrust,
  OPPORTUNITY_SCORING_WEIGHTS, DIGITAL_PRINTING_MACHINES, HIGH_PERFORMING_REGIONS,
  UPS_GROUND_TRANSIT_DAYS,
  type OpportunitySignal, type OpportunityType, type FollowUpEntry,
} from "@shared/schema";
import { eq, and, or, isNull, isNotNull, sql, desc, gte, lt, lte, ne, inArray, count } from "drizzle-orm";
import { odooClient, isOdooConfigured } from "./odoo";

const STATE_ABBREVIATIONS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'puerto rico': 'PR', 'district of columbia': 'DC',
};

function normalizeStateToAbbreviation(state: string | null): string | null {
  if (!state) return null;
  const trimmed = state.trim().toUpperCase();
  if (trimmed.length === 2 && UPS_GROUND_TRANSIT_DAYS[trimmed]) return trimmed;
  const fullName = state.trim().toLowerCase();
  return STATE_ABBREVIATIONS[fullName] || null;
}

function estimateTransitDays(state: string | null): number {
  const abbrev = normalizeStateToAbbreviation(state);
  if (!abbrev) return 5;
  return UPS_GROUND_TRANSIT_DAYS[abbrev] || 5;
}

export interface ScoredOpportunity {
  id: number;
  customerId: string | null;
  leadId: number | null;
  score: number;
  opportunityType: OpportunityType;
  signals: OpportunitySignal[];
  isActive: boolean;
  entityName: string;
  entityCompany: string | null;
  entityEmail: string | null;
  entityPhone: string | null;
  entityProvince: string | null;
  entityCity: string | null;
  createdAt: Date | null;
  expectedRevenue?: number | null;
  nextBestAction?: string | null;
  opportunityAgeDays?: number | null;
  assignedRepId?: string | null;
  assignedRepName?: string | null;
}

export class OpportunityEngine {

  async scoreCustomer(customerId: string): Promise<{ score: number; signals: OpportunitySignal[]; opportunityTypes: OpportunityType[] }> {
    const [customerData] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customerData) return { score: 0, signals: [], opportunityTypes: [] };

    const signals: OpportunitySignal[] = [];
    let totalScore = 0;
    const opportunityTypes: OpportunityType[] = [];

    if (customerData.customerType === 'printer') {
      signals.push({ signal: 'is_printing_company', points: OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany, detail: 'Printing company — ideal customer profile' });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany;
    }

    const machineProfiles = await db
      .select()
      .from(customerMachineProfiles)
      .where(eq(customerMachineProfiles.customerId, customerId));

    const hasDigitalMachines = machineProfiles.some(m =>
      DIGITAL_PRINTING_MACHINES.includes(m.machineFamily as any)
    );
    if (hasDigitalMachines) {
      const machineNames = machineProfiles
        .filter(m => DIGITAL_PRINTING_MACHINES.includes(m.machineFamily as any))
        .map(m => m.machineFamily);
      signals.push({
        signal: 'has_digital_machines',
        points: OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines,
        detail: `Has digital printing machines: ${machineNames.join(', ')}`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines;
      opportunityTypes.push('machine_match');
    }

    // SAMPLES SENT: Check multiple sources
    // 1. Swatch books / press test kits sent from CRM
    const hasCrmSamples = customerData.swatchbookSentAt || customerData.pressTestSentAt;
    // 2. Sample shipments table (Odoo $0 orders, label prints)
    const [sampleShipmentCount] = await db
      .select({ cnt: count() })
      .from(sampleShipments)
      .where(eq(sampleShipments.customerId, customerId));
    const hasSampleShipments = (sampleShipmentCount?.cnt || 0) > 0;
    
    const hasSamples = hasCrmSamples || hasSampleShipments;
    const totalSpent = parseFloat(customerData.totalSpent || '0');
    const hasOrders = customerData.totalOrders && customerData.totalOrders > 0 && totalSpent > 10;

    // LAST ORDER DATE: Query Shopify orders for actual last order date
    const [lastShopifyOrder] = await db
      .select({
        shopifyCreatedAt: shopifyOrders.shopifyCreatedAt,
        totalPrice: shopifyOrders.totalPrice,
        orderNumber: shopifyOrders.orderNumber,
      })
      .from(shopifyOrders)
      .where(eq(shopifyOrders.customerId, customerId))
      .orderBy(desc(shopifyOrders.shopifyCreatedAt))
      .limit(1);

    // Also check customerCoachState for daysSinceLastOrder (computed by coach engine)
    const [coachState] = await db
      .select({ daysSinceLastOrder: customerCoachState.daysSinceLastOrder })
      .from(customerCoachState)
      .where(eq(customerCoachState.customerId, customerId))
      .limit(1);

    const lastOrderDate = lastShopifyOrder?.shopifyCreatedAt || null;
    const daysSinceLastOrderFromShopify = lastOrderDate
      ? Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const daysSinceLastOrder = daysSinceLastOrderFromShopify ?? coachState?.daysSinceLastOrder ?? null;
    
    if (hasSamples && !hasOrders) {
      const sampleSources: string[] = [];
      if (hasCrmSamples) sampleSources.push('swatch book/press test kit');
      if (hasSampleShipments) sampleSources.push('sample order');
      signals.push({
        signal: 'sample_sent_no_order',
        points: OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder,
        detail: `Received ${sampleSources.join(' & ')} but hasn't placed a paid order yet`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder;
      opportunityTypes.push('sample_no_order');
    }

    // EMAIL ENGAGEMENT
    const [emailActivity] = await db
      .select({ count: count() })
      .from(gmailMessages)
      .where(and(
        eq(gmailMessages.customerId, customerId),
        eq(gmailMessages.direction, 'inbound'),
      ));

    if (emailActivity && emailActivity.count > 0) {
      signals.push({
        signal: 'email_engagement',
        points: OPPORTUNITY_SCORING_WEIGHTS.emailEngagement,
        detail: `${emailActivity.count} inbound emails — showing active interest`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.emailEngagement;
    }

    // HIGH PERFORMING REGION
    const stateAbbrev = normalizeStateToAbbreviation(customerData.province);
    if (stateAbbrev && HIGH_PERFORMING_REGIONS.includes(stateAbbrev as any)) {
      signals.push({
        signal: 'high_performing_region',
        points: OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion,
        detail: `Located in high-performing region: ${stateAbbrev}`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion;
    }

    // WENT QUIET: Customer replied but we dropped contact — ONLY for non-buyers
    // If they have orders, we show reorder_due instead
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const hasInboundReplies = (emailActivity?.count ?? 0) > 0;
    const lastOutbound = customerData.lastOutboundEmailAt;
    const noRecentContact = !lastOutbound || lastOutbound < sevenDaysAgo;
    
    if (hasInboundReplies && noRecentContact && !hasOrders) {
      const daysSinceContact = lastOutbound 
        ? Math.floor((Date.now() - lastOutbound.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      signals.push({
        signal: 'went_quiet',
        points: OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest,
        detail: daysSinceContact 
          ? `Replied to our emails but no follow-up in ${daysSinceContact} days`
          : 'Replied to our emails but was never followed up',
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest;
      opportunityTypes.push('went_quiet');
    }

    // REORDER DUE: Customer has placed orders but has gone quiet — prioritise re-engagement
    if (hasOrders && noRecentContact) {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const isLongOverdue = daysSinceLastOrder !== null && daysSinceLastOrder > 60;
      const lastOrderUnknown = daysSinceLastOrder === null;

      if (isLongOverdue || lastOrderUnknown) {
        const orderContext = daysSinceLastOrder !== null
          ? `last ordered ${daysSinceLastOrder} days ago`
          : `${customerData.totalOrders} order(s) on record`;
        signals.push({
          signal: 'reorder_opportunity',
          points: 20,
          detail: `Paying customer (${customerData.totalOrders} order(s), $${totalSpent.toFixed(0)} spent) — ${orderContext}. Needs re-engagement.`,
        });
        totalScore += 20;
        opportunityTypes.push('reorder_due');
      }
    }

    // UPSELL: Customer has spent over $2000 — upsell to higher volume/tier
    if (hasOrders && totalSpent > 2000) {
      const orderContext = daysSinceLastOrder !== null
        ? ` — last ordered ${daysSinceLastOrder} days ago`
        : '';
      signals.push({
        signal: 'small_order_upsell',
        points: OPPORTUNITY_SCORING_WEIGHTS.smallOrderUpsell,
        detail: `${customerData.totalOrders} order(s), $${totalSpent.toFixed(0)} spent${orderContext}. Upsell opportunity.`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.smallOrderUpsell;
      opportunityTypes.push('upsell_potential');
    }

    // REGULAR BUYER: 3+ orders with last order within 90 days
    if (customerData.totalOrders && customerData.totalOrders >= 3 && totalSpent > 0 && daysSinceLastOrder !== null && daysSinceLastOrder < 90) {
      const contactNeeded = noRecentContact ? ' — needs follow-up!' : '';
      signals.push({
        signal: 'regular_buyer',
        points: 15,
        detail: `Regular buyer — ${customerData.totalOrders} orders, $${totalSpent.toFixed(0)} total, last order ${daysSinceLastOrder} days ago${contactNeeded}`,
      });
      totalScore += 15;
      opportunityTypes.push('new_fit');
    }

    // Website bonus
    if (customerData.website) {
      signals.push({
        signal: 'has_website',
        points: OPPORTUNITY_SCORING_WEIGHTS.hasWebsite,
        detail: 'Has a website — can research their business',
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasWebsite;
    }

    return { score: Math.min(totalScore, 100), signals, opportunityTypes };
  }

  async scoreLead(leadId: number): Promise<{ score: number; signals: OpportunitySignal[]; opportunityTypes: OpportunityType[] }> {
    const [leadData] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!leadData) return { score: 0, signals: [], opportunityTypes: [] };

    const signals: OpportunitySignal[] = [];
    let totalScore = 0;
    const opportunityTypes: OpportunityType[] = [];

    if (leadData.customerType === 'printer') {
      signals.push({ signal: 'is_printing_company', points: OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany, detail: 'Printing company — ideal customer profile' });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany;
    }

    const machineTypes = leadData.machineTypes || [];
    const hasDigitalMachines = machineTypes.some(m =>
      DIGITAL_PRINTING_MACHINES.includes(m as any)
    );
    if (hasDigitalMachines) {
      signals.push({
        signal: 'has_digital_machines',
        points: OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines,
        detail: `Has digital printing machines: ${machineTypes.filter(m => DIGITAL_PRINTING_MACHINES.includes(m as any)).join(', ')}`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines;
      opportunityTypes.push('machine_match');
    }

    if (leadData.sampleSentAt && leadData.stage !== 'converted') {
      signals.push({
        signal: 'sample_sent_no_order',
        points: OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder,
        detail: 'Received samples but hasn\'t converted yet',
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder;
      opportunityTypes.push('sample_no_order');
    }

    if (leadData.firstEmailReplyAt) {
      signals.push({
        signal: 'email_engagement',
        points: OPPORTUNITY_SCORING_WEIGHTS.emailEngagement,
        detail: 'Replied to emails — showing active interest',
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.emailEngagement;
    }

    const stateAbbrev = normalizeStateToAbbreviation(leadData.state);
    if (stateAbbrev && HIGH_PERFORMING_REGIONS.includes(stateAbbrev as any)) {
      signals.push({
        signal: 'high_performing_region',
        points: OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion,
        detail: `Located in high-performing region: ${stateAbbrev}`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion;
    }

    // Went quiet for leads: had contact but nothing in 7+ days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (leadData.lastContactAt && leadData.lastContactAt < sevenDaysAgo && (leadData.totalTouchpoints ?? 0) > 1) {
      const daysSince = Math.floor((Date.now() - leadData.lastContactAt.getTime()) / (1000 * 60 * 60 * 24));
      signals.push({
        signal: 'went_quiet',
        points: OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest,
        detail: `${leadData.totalTouchpoints} touchpoints but no contact in ${daysSince} days`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest;
      opportunityTypes.push('went_quiet');
    }

    if (leadData.website) {
      signals.push({
        signal: 'has_website',
        points: OPPORTUNITY_SCORING_WEIGHTS.hasWebsite,
        detail: 'Has a website — can research their business',
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasWebsite;
    }

    if (opportunityTypes.length === 0 && totalScore >= 30) {
      opportunityTypes.push('new_fit');
    }

    return { score: Math.min(totalScore, 100), signals, opportunityTypes };
  }

  async calculateAndStoreScores(): Promise<{ processed: number; scored: number }> {
    const now = new Date();
    let processed = 0;
    let scored = 0;

    // ── BULK DATA FETCH ────────────────────────────────────────────────────────
    // Fetch everything we need in parallel with a handful of queries instead of
    // hitting the DB once per customer (which was ~24 000 queries for 4 759 customers).

    const [
      allCustomers,
      allMachineProfiles,
      sampleShipmentRows,
      coachStateRows,
      gmailInboundRows,
      latestShopifyOrderRows,
      existingScoreRows,
      allLeads,
      pendingQuoteRows,
      emailOpenRows,
      categoryTrustRows,
    ] = await Promise.all([
      db.select().from(customers).where(and(eq(customers.doNotContact, false), eq(customers.isCompany, false))),
      db.select().from(customerMachineProfiles),
      db.select({ customerId: sampleShipments.customerId, cnt: count() }).from(sampleShipments).where(isNotNull(sampleShipments.customerId)).groupBy(sampleShipments.customerId),
      db.select({ customerId: customerCoachState.customerId, daysSinceLastOrder: customerCoachState.daysSinceLastOrder }).from(customerCoachState),
      db.select({ customerId: gmailMessages.customerId, cnt: count() }).from(gmailMessages).where(and(eq(gmailMessages.direction, 'inbound'), isNotNull(gmailMessages.customerId))).groupBy(gmailMessages.customerId),
      db.execute(sql`SELECT DISTINCT ON (customer_id) customer_id, shopify_created_at, total_price, order_number FROM shopify_orders WHERE customer_id IS NOT NULL ORDER BY customer_id, shopify_created_at DESC`),
      db.select({ id: opportunityScores.id, customerId: opportunityScores.customerId, leadId: opportunityScores.leadId, opportunityType: opportunityScores.opportunityType, isActive: opportunityScores.isActive }).from(opportunityScores),
      db.select().from(leads).where(sql`${leads.stage} NOT IN ('converted', 'lost')`),
      // NEW: pending quotes (sent in last 45 days, not yet won)
      db.select({ customerId: sentQuotes.customerId, totalAmount: sentQuotes.totalAmount, createdAt: sentQuotes.createdAt })
        .from(sentQuotes)
        .where(and(
          isNotNull(sentQuotes.customerId),
          eq(sentQuotes.outcome, 'pending'),
          gte(sentQuotes.createdAt, new Date(Date.now() - 45 * 24 * 60 * 60 * 1000))
        )),
      // NEW: email open/click counts per customer
      db.select({ customerId: emailTrackingTokens.customerId, totalOpens: sql<number>`sum(${emailTrackingTokens.openCount})`, totalClicks: sql<number>`sum(${emailTrackingTokens.clickCount})` })
        .from(emailTrackingTokens)
        .where(and(isNotNull(emailTrackingTokens.customerId), gte(emailTrackingTokens.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))))
        .groupBy(emailTrackingTokens.customerId),
      // NEW: category trust for expansion detection
      db.select({ customerId: categoryTrust.customerId, categoryCode: categoryTrust.categoryCode, ordersPlaced: categoryTrust.ordersPlaced })
        .from(categoryTrust)
        .where(isNotNull(categoryTrust.customerId)),
    ]);

    // Build lookup maps for O(1) access
    const machinesByCustomer = new Map<string, typeof allMachineProfiles>();
    for (const mp of allMachineProfiles) {
      if (!mp.customerId) continue;
      if (!machinesByCustomer.has(mp.customerId)) machinesByCustomer.set(mp.customerId, []);
      machinesByCustomer.get(mp.customerId)!.push(mp);
    }

    const sampleCountByCustomer = new Map<string, number>();
    for (const row of sampleShipmentRows) {
      if (row.customerId) sampleCountByCustomer.set(row.customerId, Number(row.cnt));
    }

    const coachStateByCustomer = new Map<string, number | null>();
    for (const row of coachStateRows) {
      coachStateByCustomer.set(row.customerId, row.daysSinceLastOrder);
    }

    const gmailCountByCustomer = new Map<string, number>();
    for (const row of gmailInboundRows) {
      if (row.customerId) gmailCountByCustomer.set(row.customerId, Number(row.cnt));
    }

    const lastOrderByCustomer = new Map<string, { date: Date | null; daysSince: number | null }>();
    for (const row of latestShopifyOrderRows.rows as any[]) {
      const cid = row.customer_id as string;
      const rawDate = row.shopify_created_at;
      const date = rawDate ? new Date(rawDate) : null;
      const daysSince = date ? Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)) : null;
      lastOrderByCustomer.set(cid, { date, daysSince });
    }

    // NEW: pending quotes map: customerId → { totalAmount, createdAt }
    const pendingQuoteByCustomer = new Map<string, { totalAmount: number; createdAt: Date }>();
    for (const row of pendingQuoteRows) {
      if (row.customerId && !pendingQuoteByCustomer.has(row.customerId)) {
        pendingQuoteByCustomer.set(row.customerId, {
          totalAmount: parseFloat(row.totalAmount || '0'),
          createdAt: new Date(row.createdAt!),
        });
      }
    }

    // NEW: email engagement map: customerId → { opens, clicks }
    const emailEngagementByCustomer = new Map<string, { opens: number; clicks: number }>();
    for (const row of emailOpenRows) {
      if (row.customerId) {
        emailEngagementByCustomer.set(row.customerId, {
          opens: Number(row.totalOpens) || 0,
          clicks: Number(row.totalClicks) || 0,
        });
      }
    }

    // NEW: category trust map: customerId → Set of category codes with orders
    const adoptedCategoriesByCustomer = new Map<string, Set<string>>();
    for (const row of categoryTrustRows) {
      if (!row.customerId) continue;
      if (!adoptedCategoriesByCustomer.has(row.customerId)) {
        adoptedCategoriesByCustomer.set(row.customerId, new Set());
      }
      if ((row.ordersPlaced ?? 0) > 0) {
        adoptedCategoriesByCustomer.get(row.customerId)!.add(row.categoryCode);
      }
    }

    // Map: "c:{customerId}:{type}" or "l:{leadId}:{type}" → existing score row id
    const existingScoreMap = new Map<string, number>();
    for (const row of existingScoreRows) {
      if (row.customerId) existingScoreMap.set(`c:${row.customerId}:${row.opportunityType}`, row.id);
      if (row.leadId) existingScoreMap.set(`l:${row.leadId}:${row.opportunityType}`, row.id);
    }

    // ── CUSTOMER SCORING ───────────────────────────────────────────────────────
    const updateOps: Array<{ id: number; score: number; signals: OpportunitySignal[]; isActive: boolean; expectedRevenue?: number | null; nextBestAction?: string | null }> = [];
    const insertOps: Array<{ customerId?: string; leadId?: number; score: number; opportunityType: string; signals: OpportunitySignal[]; isActive: boolean; expectedRevenue?: number | null; nextBestAction?: string | null; opportunityAgeDays?: number }> = [];
    const deactivateCustomerIds: string[] = [];
    const deactivateLeadIds: number[] = [];

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const customer of allCustomers) {
      processed++;
      const machineProfiles = machinesByCustomer.get(customer.id) || [];
      const sampleShipmentCount = sampleCountByCustomer.get(customer.id) || 0;
      const gmailCount = gmailCountByCustomer.get(customer.id) || 0;
      const lastOrder = lastOrderByCustomer.get(customer.id);
      const coachDays = coachStateByCustomer.get(customer.id) ?? null;
      const daysSinceLastOrder = lastOrder?.daysSince ?? coachDays ?? null;

      const signals: OpportunitySignal[] = [];
      let totalScore = 0;
      const opportunityTypes: OpportunityType[] = [];

      // Is printing company
      if (customer.customerType === 'printer') {
        signals.push({ signal: 'is_printing_company', points: OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany, detail: 'Printing company — ideal customer profile' });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany;
      }

      // Digital machines
      const digitalMachines = machineProfiles.filter(m => DIGITAL_PRINTING_MACHINES.includes(m.machineFamily as any));
      if (digitalMachines.length > 0) {
        signals.push({ signal: 'has_digital_machines', points: OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines, detail: `Has digital printing machines: ${digitalMachines.map(m => m.machineFamily).join(', ')}` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines;
        opportunityTypes.push('machine_match');
      }

      // Samples
      const hasCrmSamples = customer.swatchbookSentAt || customer.pressTestSentAt;
      const hasSampleShipments = sampleShipmentCount > 0;
      const hasSamples = hasCrmSamples || hasSampleShipments;
      const totalSpent = parseFloat(customer.totalSpent || '0');
      const hasOrders = (customer.totalOrders ?? 0) > 0 && totalSpent > 10;

      if (hasSamples && !hasOrders) {
        const src = [hasCrmSamples ? 'swatch book/press test kit' : null, hasSampleShipments ? 'sample order' : null].filter(Boolean).join(' & ');
        signals.push({ signal: 'sample_sent_no_order', points: OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder, detail: `Received ${src} but hasn't placed a paid order yet` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder;
        opportunityTypes.push('sample_no_order');
      }

      // Email engagement
      if (gmailCount > 0) {
        signals.push({ signal: 'email_engagement', points: OPPORTUNITY_SCORING_WEIGHTS.emailEngagement, detail: `${gmailCount} inbound emails — showing active interest` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.emailEngagement;
      }

      // Region
      const stateAbbrev = normalizeStateToAbbreviation(customer.province);
      if (stateAbbrev && HIGH_PERFORMING_REGIONS.includes(stateAbbrev as any)) {
        signals.push({ signal: 'high_performing_region', points: OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion, detail: `Located in high-performing region: ${stateAbbrev}` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion;
      }

      // Went quiet — only for non-buyers
      const noRecentContact = !customer.lastOutboundEmailAt || customer.lastOutboundEmailAt < sevenDaysAgo;
      if (gmailCount > 0 && noRecentContact && !hasOrders) {
        const daysSinceContact = customer.lastOutboundEmailAt
          ? Math.floor((now.getTime() - customer.lastOutboundEmailAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        signals.push({ signal: 'went_quiet', points: OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest, detail: daysSinceContact ? `Replied to our emails but no follow-up in ${daysSinceContact} days` : 'Replied to our emails but was never followed up' });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest;
        opportunityTypes.push('went_quiet');
      }

      // Reorder due — buyers who have gone quiet
      if (hasOrders && noRecentContact && (daysSinceLastOrder === null || daysSinceLastOrder > 60)) {
        const ctx = daysSinceLastOrder !== null ? `last ordered ${daysSinceLastOrder} days ago` : `${customer.totalOrders} order(s) on record`;
        signals.push({ signal: 'reorder_opportunity', points: 20, detail: `Paying customer (${customer.totalOrders} order(s), $${totalSpent.toFixed(0)} spent) — ${ctx}. Needs re-engagement.` });
        totalScore += 20;
        opportunityTypes.push('reorder_due');
      }

      // Upsell
      if (hasOrders && totalSpent > 2000) {
        const ctx = daysSinceLastOrder !== null ? ` — last ordered ${daysSinceLastOrder} days ago` : '';
        signals.push({ signal: 'small_order_upsell', points: OPPORTUNITY_SCORING_WEIGHTS.smallOrderUpsell, detail: `${customer.totalOrders} order(s), $${totalSpent.toFixed(0)} spent${ctx}. Upsell opportunity.` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.smallOrderUpsell;
        opportunityTypes.push('upsell_potential');
      }

      // Regular buyer
      if ((customer.totalOrders ?? 0) >= 3 && totalSpent > 0 && daysSinceLastOrder !== null && daysSinceLastOrder < 90) {
        const contactNote = noRecentContact ? ' — needs follow-up!' : '';
        signals.push({ signal: 'regular_buyer', points: 15, detail: `Regular buyer — ${customer.totalOrders} orders, $${totalSpent.toFixed(0)} total, last order ${daysSinceLastOrder} days ago${contactNote}` });
        totalScore += 15;
        opportunityTypes.push('new_fit');
      }

      // SIGNAL: Quote pending — sent in last 45 days with no response
      const pendingQuote = pendingQuoteByCustomer.get(customer.id);
      if (pendingQuote) {
        const daysSinceQuote = Math.floor((now.getTime() - pendingQuote.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        signals.push({
          signal: 'quote_pending',
          points: OPPORTUNITY_SCORING_WEIGHTS.quotePending,
          detail: `Quote of $${pendingQuote.totalAmount.toFixed(0)} sent ${daysSinceQuote} days ago — no response yet`,
        });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.quotePending;
        opportunityTypes.push('quote_pending');
      }

      // SIGNAL: Email open/click engagement heat
      const emailEng = emailEngagementByCustomer.get(customer.id);
      if (emailEng && emailEng.opens > 0) {
        const openPoints = emailEng.opens >= 5 ? OPPORTUNITY_SCORING_WEIGHTS.emailOpenEngagement
          : emailEng.opens >= 2 ? Math.round(OPPORTUNITY_SCORING_WEIGHTS.emailOpenEngagement * 0.6)
          : Math.round(OPPORTUNITY_SCORING_WEIGHTS.emailOpenEngagement * 0.3);
        const detail = emailEng.clicks > 0
          ? `Opened emails ${emailEng.opens}x and clicked ${emailEng.clicks}x — high intent`
          : `Opened emails ${emailEng.opens}x — showing interest`;
        signals.push({ signal: 'email_open_engagement', points: openPoints, detail });
        totalScore += openPoints;
      }

      // SIGNAL: Category expansion — has ordered 1+ categories, machine compatible with untried ones
      const adoptedCategories = adoptedCategoriesByCustomer.get(customer.id) || new Set<string>();
      if (adoptedCategories.size > 0 && machineProfiles.length > 0) {
        if (adoptedCategories.size >= 1 && adoptedCategories.size <= 2) {
          signals.push({
            signal: 'category_expansion',
            points: OPPORTUNITY_SCORING_WEIGHTS.categoryExpansion,
            detail: `Ordering ${adoptedCategories.size} product line(s) — machine profile suggests room to expand`,
          });
          totalScore += OPPORTUNITY_SCORING_WEIGHTS.categoryExpansion;
          if (!opportunityTypes.includes('upsell_potential')) {
            opportunityTypes.push('upsell_potential');
          }
        }
      }

      // Website
      if (customer.website) {
        signals.push({ signal: 'has_website', points: OPPORTUNITY_SCORING_WEIGHTS.hasWebsite, detail: 'Has a website — can research their business' });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasWebsite;
      }

      const finalScore = Math.min(totalScore, 100);

      if (finalScore >= 20 && opportunityTypes.length > 0) {
        scored++;
        for (const oppType of opportunityTypes) {
          const typeSignals = oppType === 'sample_no_order'
            ? signals.filter(s => s.signal === 'sample_sent_no_order' || s.signal !== 'small_order_upsell')
            : signals;
          const key = `c:${customer.id}:${oppType}`;
          const existingId = existingScoreMap.get(key);

          // Compute expected revenue: avg order value × estimated annual frequency
          const totalSpent = parseFloat(customer.totalSpent || '0');
          const totalOrders = customer.totalOrders || 0;
          const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
          const lastOrder = lastOrderByCustomer.get(customer.id);
          const daysSinceLast = lastOrder?.daysSince ?? null;
          const estimatedAnnualOrders = daysSinceLast && daysSinceLast > 0 ? Math.round(365 / daysSinceLast) : 4;
          const expectedRevenue = avgOrderValue > 0 ? Math.round(avgOrderValue * Math.min(estimatedAnnualOrders, 12)) : null;

          // Compute next best action from signals
          let nextBestAction: string | null = null;
          if (oppType === 'quote_pending') {
            const qDays = pendingQuote ? Math.floor((now.getTime() - pendingQuote.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : null;
            nextBestAction = qDays && qDays > 7 ? 'Call to follow up on the pending quote — timing is critical' : 'Send a follow-up email referencing the quote sent';
          } else if (oppType === 'sample_no_order') {
            nextBestAction = 'Call and ask how the samples performed — offer a first-order discount';
          } else if (oppType === 'reorder_due') {
            nextBestAction = `Re-engage — they haven't ordered in ${daysSinceLast ?? '60+'} days. Call or send a check-in email`;
          } else if (oppType === 'went_quiet') {
            nextBestAction = 'They replied before but went quiet. Send a short "still interested?" email';
          } else if (oppType === 'upsell_potential') {
            nextBestAction = machineProfiles.length > 0 ? 'Suggest a compatible substrate they haven\'t tried — reference their machine' : 'Upsell to higher volume tier or introduce a second product line';
          } else if (oppType === 'machine_match') {
            nextBestAction = 'Lead with machine compatibility — mention specific products that work with their press';
          }

          if (existingId) {
            updateOps.push({ id: existingId, score: finalScore, signals: typeSignals, isActive: true, expectedRevenue, nextBestAction });
          } else {
            insertOps.push({ customerId: customer.id, score: finalScore, opportunityType: oppType, signals: typeSignals, isActive: true, expectedRevenue, nextBestAction, opportunityAgeDays: 0 });
          }
        }
        // Deactivate any types no longer valid for this customer
        for (const [key, id] of existingScoreMap) {
          if (!key.startsWith(`c:${customer.id}:`)) continue;
          const type = key.split(':')[2];
          if (!opportunityTypes.includes(type as OpportunityType)) {
            updateOps.push({ id, score: 0, signals: [], isActive: false });
          }
        }
      } else {
        deactivateCustomerIds.push(customer.id);
      }
    }

    // ── LEAD SCORING ───────────────────────────────────────────────────────────
    for (const lead of allLeads) {
      processed++;
      const signals: OpportunitySignal[] = [];
      let totalScore = 0;
      const opportunityTypes: OpportunityType[] = [];

      if (lead.customerType === 'printer') {
        signals.push({ signal: 'is_printing_company', points: OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany, detail: 'Printing company — ideal customer profile' });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.isPrintingCompany;
      }

      const machineTypes = lead.machineTypes || [];
      const hasDigitalMachines = machineTypes.some(m => DIGITAL_PRINTING_MACHINES.includes(m as any));
      if (hasDigitalMachines) {
        signals.push({ signal: 'has_digital_machines', points: OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines, detail: `Has digital printing machines: ${machineTypes.filter(m => DIGITAL_PRINTING_MACHINES.includes(m as any)).join(', ')}` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasDigitalMachines;
        opportunityTypes.push('machine_match');
      }

      if (lead.sampleSentAt && lead.stage !== 'converted') {
        signals.push({ signal: 'sample_sent_no_order', points: OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder, detail: "Received samples but hasn't converted yet" });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder;
        opportunityTypes.push('sample_no_order');
      }

      if (lead.firstEmailReplyAt) {
        signals.push({ signal: 'email_engagement', points: OPPORTUNITY_SCORING_WEIGHTS.emailEngagement, detail: 'Replied to emails — showing active interest' });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.emailEngagement;
      }

      const stateAbbrev = normalizeStateToAbbreviation(lead.state);
      if (stateAbbrev && HIGH_PERFORMING_REGIONS.includes(stateAbbrev as any)) {
        signals.push({ signal: 'high_performing_region', points: OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion, detail: `Located in high-performing region: ${stateAbbrev}` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion;
      }

      if (lead.lastContactAt && lead.lastContactAt < sevenDaysAgo && (lead.totalTouchpoints ?? 0) > 1) {
        const daysSince = Math.floor((now.getTime() - lead.lastContactAt.getTime()) / (1000 * 60 * 60 * 24));
        signals.push({ signal: 'went_quiet', points: OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest, detail: `${lead.totalTouchpoints} touchpoints but no contact in ${daysSince} days` });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest;
        opportunityTypes.push('went_quiet');
      }

      if (lead.website) {
        signals.push({ signal: 'has_website', points: OPPORTUNITY_SCORING_WEIGHTS.hasWebsite, detail: 'Has a website — can research their business' });
        totalScore += OPPORTUNITY_SCORING_WEIGHTS.hasWebsite;
      }

      if (opportunityTypes.length === 0 && totalScore >= 30) opportunityTypes.push('new_fit');

      const finalScore = Math.min(totalScore, 100);

      if (finalScore >= 20 && opportunityTypes.length > 0) {
        scored++;
        for (const oppType of opportunityTypes) {
          const key = `l:${lead.id}:${oppType}`;
          const existingId = existingScoreMap.get(key);
          if (existingId) {
            updateOps.push({ id: existingId, score: finalScore, signals, isActive: true });
          } else {
            insertOps.push({ leadId: lead.id, score: finalScore, opportunityType: oppType, signals, isActive: true });
          }
        }
      } else {
        deactivateLeadIds.push(lead.id);
      }
    }

    // ── BATCH DB WRITES ────────────────────────────────────────────────────────
    // Run all updates in parallel batches of 50 to avoid overwhelming the pool
    const BATCH = 50;
    const updateChunks: typeof updateOps[] = [];
    for (let i = 0; i < updateOps.length; i += BATCH) updateChunks.push(updateOps.slice(i, i + BATCH));
    for (const chunk of updateChunks) {
      await Promise.all(chunk.map(op =>
        db.update(opportunityScores).set({ score: op.score, signals: op.signals, isActive: op.isActive, lastCalculatedAt: now, updatedAt: now, ...(op.expectedRevenue !== undefined ? { expectedRevenue: op.expectedRevenue?.toString() ?? null } : {}), ...(op.nextBestAction !== undefined ? { nextBestAction: op.nextBestAction } : {}) }).where(eq(opportunityScores.id, op.id))
      ));
    }

    // Batch inserts in chunks of 100
    if (insertOps.length > 0) {
      const insertChunks: typeof insertOps[] = [];
      for (let i = 0; i < insertOps.length; i += 100) insertChunks.push(insertOps.slice(i, i + 100));
      for (const chunk of insertChunks) {
        await db.insert(opportunityScores).values(chunk.map(op => ({ ...op, lastCalculatedAt: now, expectedRevenue: op.expectedRevenue?.toString() ?? null, opportunityAgeDays: op.opportunityAgeDays ?? 0 })));
      }
    }

    // Deactivate in bulk
    if (deactivateCustomerIds.length > 0) {
      await db.update(opportunityScores).set({ isActive: false, updatedAt: now }).where(and(inArray(opportunityScores.customerId, deactivateCustomerIds), eq(opportunityScores.isActive, true)));
    }
    if (deactivateLeadIds.length > 0) {
      await db.update(opportunityScores).set({ isActive: false, updatedAt: now }).where(and(inArray(opportunityScores.leadId, deactivateLeadIds), eq(opportunityScores.isActive, true)));
    }

    console.log(`[OpportunityEngine] Scored ${scored} opportunities from ${processed} entities`);
    return { processed, scored };
  }

  async getTopOpportunities(options: {
    salesRepId?: string;
    opportunityType?: OpportunityType;
    limit?: number;
    minScore?: number;
  } = {}): Promise<ScoredOpportunity[]> {
    const { limit: maxResults = 50, minScore = 20, opportunityType, salesRepId } = options;

    const conditions = [
      eq(opportunityScores.isActive, true),
      gte(opportunityScores.score, minScore),
    ];

    if (opportunityType) {
      conditions.push(eq(opportunityScores.opportunityType, opportunityType));
    }

    const results = await db
      .select({
        id: opportunityScores.id,
        customerId: opportunityScores.customerId,
        leadId: opportunityScores.leadId,
        score: opportunityScores.score,
        opportunityType: opportunityScores.opportunityType,
        signals: opportunityScores.signals,
        isActive: opportunityScores.isActive,
        createdAt: opportunityScores.createdAt,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerCompany: customers.company,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerProvince: customers.province,
        customerCity: customers.city,
        customerSalesRepId: customers.salesRepId,
        expectedRevenue: opportunityScores.expectedRevenue,
        nextBestAction: opportunityScores.nextBestAction,
        opportunityAgeDays: opportunityScores.opportunityAgeDays,
        assignedRepId: (opportunityScores as any).assignedRepId,
        assignedRepName: (opportunityScores as any).assignedRepName,
      })
      .from(opportunityScores)
      .leftJoin(customers, eq(opportunityScores.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(opportunityScores.score))
      .limit(maxResults);

    let leadResults: any[] = [];
    const leadConditions = [
      eq(opportunityScores.isActive, true),
      gte(opportunityScores.score, minScore),
      isNotNull(opportunityScores.leadId),
    ];
    if (opportunityType) {
      leadConditions.push(eq(opportunityScores.opportunityType, opportunityType));
    }

    leadResults = await db
      .select({
        id: opportunityScores.id,
        customerId: opportunityScores.customerId,
        leadId: opportunityScores.leadId,
        score: opportunityScores.score,
        opportunityType: opportunityScores.opportunityType,
        signals: opportunityScores.signals,
        isActive: opportunityScores.isActive,
        createdAt: opportunityScores.createdAt,
        leadName: leads.name,
        leadCompany: leads.company,
        leadEmail: leads.email,
        leadPhone: leads.phone,
        leadState: leads.state,
        leadCity: leads.city,
        leadSalesRepId: leads.salesRepId,
        assignedRepId: (opportunityScores as any).assignedRepId,
        assignedRepName: (opportunityScores as any).assignedRepName,
      })
      .from(opportunityScores)
      .leftJoin(leads, eq(opportunityScores.leadId, leads.id))
      .where(and(...leadConditions))
      .orderBy(desc(opportunityScores.score))
      .limit(maxResults);

    const combined: ScoredOpportunity[] = [];

    for (const r of results) {
      if (!r.customerId) continue;
      if (salesRepId && r.customerSalesRepId && r.customerSalesRepId !== salesRepId) continue;
      combined.push({
        id: r.id,
        customerId: r.customerId,
        leadId: null,
        score: r.score,
        opportunityType: r.opportunityType as OpportunityType,
        signals: (r.signals || []) as OpportunitySignal[],
        isActive: r.isActive ?? true,
        entityName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(' ') || 'Unknown',
        entityCompany: r.customerCompany,
        entityEmail: r.customerEmail,
        entityPhone: r.customerPhone,
        entityProvince: r.customerProvince,
        entityCity: r.customerCity,
        createdAt: r.createdAt,
        expectedRevenue: r.expectedRevenue ? parseFloat(r.expectedRevenue) : null,
        nextBestAction: (r as any).nextBestAction ?? null,
        opportunityAgeDays: (r as any).opportunityAgeDays ?? null,
        assignedRepId: (r as any).assignedRepId ?? null,
        assignedRepName: (r as any).assignedRepName ?? null,
      });
    }

    for (const r of leadResults) {
      if (!r.leadId) continue;
      if (salesRepId && r.leadSalesRepId && r.leadSalesRepId !== salesRepId) continue;
      combined.push({
        id: r.id,
        customerId: null,
        leadId: r.leadId,
        score: r.score,
        opportunityType: r.opportunityType as OpportunityType,
        signals: (r.signals || []) as OpportunitySignal[],
        isActive: r.isActive ?? true,
        entityName: r.leadName || 'Unknown',
        entityCompany: r.leadCompany,
        entityEmail: r.leadEmail,
        entityPhone: r.leadPhone,
        entityProvince: r.leadState,
        entityCity: r.leadCity,
        createdAt: r.createdAt,
        expectedRevenue: (r as any).expectedRevenue ? parseFloat((r as any).expectedRevenue) : null,
        nextBestAction: (r as any).nextBestAction ?? null,
        opportunityAgeDays: (r as any).opportunityAgeDays ?? null,
        assignedRepId: (r as any).assignedRepId ?? null,
        assignedRepName: (r as any).assignedRepName ?? null,
      });
    }

    combined.sort((a, b) => b.score - a.score);
    
    const OPPORTUNITY_TYPE_PRIORITY: Record<string, number> = {
      'sample_no_order': 1,
      'went_quiet': 2,
      'reorder_due': 3,
      'upsell_potential': 4,
      'new_fit': 5,
      'machine_match': 6,
    };
    
    if (!opportunityType) {
      const entityMap = new Map<string, ScoredOpportunity>();
      for (const opp of combined) {
        const key = opp.customerId ? `c-${opp.customerId}` : `l-${opp.leadId}`;
        const existing = entityMap.get(key);
        if (!existing) {
          entityMap.set(key, opp);
        } else {
          const existingPriority = OPPORTUNITY_TYPE_PRIORITY[existing.opportunityType] || 99;
          const newPriority = OPPORTUNITY_TYPE_PRIORITY[opp.opportunityType] || 99;
          if (newPriority < existingPriority) {
            const mergedSignals = [...opp.signals];
            for (const sig of existing.signals) {
              if (!mergedSignals.some(s => s.signal === sig.signal)) {
                mergedSignals.push(sig);
              }
            }
            entityMap.set(key, { ...opp, signals: mergedSignals });
          } else {
            const mergedSignals = [...existing.signals];
            for (const sig of opp.signals) {
              if (!mergedSignals.some(s => s.signal === sig.signal)) {
                mergedSignals.push(sig);
              }
            }
            entityMap.set(key, { ...existing, signals: mergedSignals });
          }
        }
      }
      const deduplicated = Array.from(entityMap.values());
      deduplicated.sort((a, b) => b.score - a.score);
      return deduplicated.slice(0, maxResults);
    }
    
    return combined.slice(0, maxResults);
  }

  async getCustomerOpportunityScore(customerId: string): Promise<{ score: number; signals: OpportunitySignal[]; opportunities: OpportunityType[] } | null> {
    const scores = await db
      .select()
      .from(opportunityScores)
      .where(and(
        eq(opportunityScores.customerId, customerId),
        eq(opportunityScores.isActive, true),
      ))
      .orderBy(desc(opportunityScores.score));

    if (scores.length === 0) return null;

    const topScore = scores[0].score;
    const allSignals = scores.flatMap(s => (s.signals || []) as OpportunitySignal[]);
    const uniqueSignals = allSignals.filter((s, i, arr) =>
      arr.findIndex(x => x.signal === s.signal) === i
    );
    const opportunities = scores.map(s => s.opportunityType as OpportunityType);

    return { score: topScore, signals: uniqueSignals, opportunities };
  }

  async getOpportunitySummary(options: { minScore?: number; salesRepId?: string } = {}): Promise<{
    totalActive: number;
    byType: Record<string, number>;
    avgScore: number;
    topScorers: number;
    totalPipelineRevenue: number;
    byRep: Array<{ repId: string; repName: string; count: number; revenue: number }>;
  }> {
    const { minScore = 20, salesRepId } = options;

    // Use the same logic as getTopOpportunities: pull per-type counts from both
    // customer-linked and lead-linked records, applying the same score threshold.
    const baseConditions = [
      eq(opportunityScores.isActive, true),
      gte(opportunityScores.score, minScore),
    ];

    // Customer-linked counts — join customers so we can filter by salesRepId
    const customerOpps = await db
      .select({
        oppType: opportunityScores.opportunityType,
        cnt: count(),
        avgScore: sql<number>`AVG(${opportunityScores.score})`,
        salesRepId: customers.salesRepId,
      })
      .from(opportunityScores)
      .leftJoin(customers, eq(opportunityScores.customerId, customers.id))
      .where(and(...baseConditions, isNotNull(opportunityScores.customerId)))
      .groupBy(opportunityScores.opportunityType, customers.salesRepId);

    // Lead-linked counts
    const leadOpps = await db
      .select({
        oppType: opportunityScores.opportunityType,
        cnt: count(),
        avgScore: sql<number>`AVG(${opportunityScores.score})`,
      })
      .from(opportunityScores)
      .leftJoin(leads, eq(opportunityScores.leadId, leads.id))
      .where(and(...baseConditions, isNotNull(opportunityScores.leadId)))
      .groupBy(opportunityScores.opportunityType);

    const byType: Record<string, number> = {};
    let totalActive = 0;
    let totalScoreSum = 0;

    for (const row of customerOpps) {
      // Apply salesRepId filter if provided (mirrors getTopOpportunities JS-side filter)
      if (salesRepId && row.salesRepId && row.salesRepId !== salesRepId) continue;
      const n = Number(row.cnt);
      byType[row.oppType] = (byType[row.oppType] || 0) + n;
      totalActive += n;
      totalScoreSum += Number(row.avgScore) * n;
    }

    for (const row of leadOpps) {
      const n = Number(row.cnt);
      byType[row.oppType] = (byType[row.oppType] || 0) + n;
      totalActive += n;
      totalScoreSum += Number(row.avgScore) * n;
    }

    const [topScorers] = await db
      .select({ cnt: count() })
      .from(opportunityScores)
      .where(and(
        eq(opportunityScores.isActive, true),
        gte(opportunityScores.score, 60),
      ));

    // Compute per-rep pipeline breakdown (customer-linked only, grouped by customer.salesRepId)
    // Group by salesRepId only (not salesRepName) to avoid duplicates when
    // salesRepName differs across records for the same rep.
    const repRevenueRows = await db
      .select({
        repId: customers.salesRepId,
        cnt: count(),
        totalRev: sql<number>`COALESCE(SUM(CAST(${opportunityScores.expectedRevenue} AS numeric)), 0)`,
      })
      .from(opportunityScores)
      .leftJoin(customers, eq(opportunityScores.customerId, customers.id))
      .where(and(
        eq(opportunityScores.isActive, true),
        gte(opportunityScores.score, minScore),
        isNotNull(customers.salesRepId),
      ))
      .groupBy(customers.salesRepId);

    // Canonical rep name lookup — matches Odoo res.users IDs to display names
    const CANONICAL_REP_NAMES: Record<string, string> = {
      '26': 'Aneesh',
      '27': 'Patricio',
      '28': 'Santiago',
    };

    const byRep = repRevenueRows
      .filter(r => r.repId)
      .map(r => ({
        repId: r.repId!,
        repName: CANONICAL_REP_NAMES[r.repId!] || r.repId!,
        count: Number(r.cnt),
        revenue: Math.round(Number(r.totalRev)),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalPipelineRevenue = byRep.reduce((sum, r) => sum + r.revenue, 0);

    return {
      totalActive,
      byType,
      avgScore: totalActive > 0 ? Math.round(totalScoreSum / totalActive) : 0,
      topScorers: Number(topScorers?.cnt || 0),
      totalPipelineRevenue,
      byRep,
    };
  }

  async detectSampleShipments(): Promise<number> {
    let detected = 0;

    if (isOdooConfigured()) {
      try {
        const sampleOrders = await odooClient.getZeroValueSampleOrders('2025-01-01');
        if (sampleOrders && sampleOrders.length > 0) {
          for (const order of sampleOrders) {
            const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
            if (!partnerId) continue;

            const existing = await db
              .select({ id: sampleShipments.id })
              .from(sampleShipments)
              .where(and(
                eq(sampleShipments.source, 'odoo'),
                eq(sampleShipments.sourceOrderId, String(order.id)),
              ))
              .limit(1);

            if (existing.length > 0) continue;

            const [matchedCustomer] = await db
              .select({ id: customers.id, province: customers.province })
              .from(customers)
              .where(eq(customers.odooPartnerId, partnerId))
              .limit(1);

            if (!matchedCustomer) continue;

            const shippedAt = order.date_order ? new Date(order.date_order) : new Date();
            const transitDays = estimateTransitDays(matchedCustomer.province);
            const estimatedDelivery = new Date(shippedAt);
            estimatedDelivery.setDate(estimatedDelivery.getDate() + transitDays);

            await db.insert(sampleShipments).values({
              customerId: matchedCustomer.id,
              source: 'odoo',
              sourceOrderId: String(order.id),
              sourceOrderName: order.name,
              shippedAt,
              estimatedDeliveryAt: estimatedDelivery,
              deliveryState: normalizeStateToAbbreviation(matchedCustomer.province),
              estimatedTransitDays: transitDays,
              followUpStatus: 'pending',
              followUpStep: 0,
            });
            detected++;
          }
        }
      } catch (error: any) {
        console.error("[OpportunityEngine] Error detecting Odoo samples:", error.message);
      }

      // Also detect orders where customer_reference contains "Samples"
      try {
        const sampleRefOrders = await odooClient.searchRead('sale.order', [
          ['client_order_ref', 'ilike', 'sample'],
          ['state', 'in', ['sale', 'done']],
          ['date_order', '>=', '2025-01-01'],
        ], ['id', 'name', 'partner_id', 'date_order', 'client_order_ref', 'amount_total'], { limit: 200 });

        if (sampleRefOrders && sampleRefOrders.length > 0) {
          for (const order of sampleRefOrders) {
            const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
            if (!partnerId) continue;

            const existing = await db
              .select({ id: sampleShipments.id })
              .from(sampleShipments)
              .where(and(
                eq(sampleShipments.source, 'odoo'),
                eq(sampleShipments.sourceOrderId, String(order.id)),
              ))
              .limit(1);

            if (existing.length > 0) continue;

            const [matchedCustomer] = await db
              .select({ id: customers.id, province: customers.province })
              .from(customers)
              .where(eq(customers.odooPartnerId, partnerId))
              .limit(1);

            if (!matchedCustomer) continue;

            const shippedAt = order.date_order ? new Date(order.date_order) : new Date();
            const transitDays = estimateTransitDays(matchedCustomer.province);
            const estimatedDelivery = new Date(shippedAt);
            estimatedDelivery.setDate(estimatedDelivery.getDate() + transitDays);

            await db.insert(sampleShipments).values({
              customerId: matchedCustomer.id,
              source: 'odoo',
              sourceOrderId: String(order.id),
              sourceOrderName: `${order.name} (Ref: ${order.client_order_ref})`,
              shippedAt,
              estimatedDeliveryAt: estimatedDelivery,
              deliveryState: normalizeStateToAbbreviation(matchedCustomer.province),
              estimatedTransitDays: transitDays,
              followUpStatus: 'pending',
              followUpStep: 0,
            });
            detected++;
          }
        }
      } catch (error: any) {
        console.error("[OpportunityEngine] Error detecting Odoo sample-reference orders:", error.message);
      }
    }

    // Detect label prints (swatch books, press test kits) from label_prints table
    try {
      const recentLabels = await db
        .select({
          id: labelPrints.id,
          customerId: labelPrints.customerId,
          labelType: labelPrints.labelType,
          createdAt: labelPrints.createdAt,
        })
        .from(labelPrints)
        .where(and(
          isNotNull(labelPrints.customerId),
          sql`${labelPrints.labelType} IN ('swatch_book', 'press_test_kit')`,
        ));

      for (const label of recentLabels) {
        if (!label.customerId) continue;

        const existing = await db
          .select({ id: sampleShipments.id })
          .from(sampleShipments)
          .where(and(
            eq(sampleShipments.source, 'label_print'),
            eq(sampleShipments.sourceOrderId, String(label.id)),
          ))
          .limit(1);

        if (existing.length > 0) continue;

        const [cust] = await db
          .select({ province: customers.province })
          .from(customers)
          .where(eq(customers.id, label.customerId))
          .limit(1);

        const shippedAt = label.createdAt || new Date();
        const transitDays = estimateTransitDays(cust?.province || null);
        const estimatedDelivery = new Date(shippedAt);
        estimatedDelivery.setDate(estimatedDelivery.getDate() + transitDays);

        await db.insert(sampleShipments).values({
          customerId: label.customerId,
          source: 'label_print',
          sourceOrderId: String(label.id),
          sourceOrderName: `${label.labelType?.replace(/_/g, ' ')} label print`,
          shippedAt,
          estimatedDeliveryAt: estimatedDelivery,
          deliveryState: normalizeStateToAbbreviation(cust?.province || null),
          estimatedTransitDays: transitDays,
          followUpStatus: 'pending',
          followUpStep: 0,
        });
        detected++;
      }
    } catch (error: any) {
      console.error("[OpportunityEngine] Error detecting label print samples:", error.message);
    }

    console.log(`[OpportunityEngine] Detected ${detected} new sample shipments`);
    return detected;
  }

  async getSampleShipmentsNeedingFollowUp(): Promise<any[]> {
    const results = await db
      .select({
        shipment: sampleShipments,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerCompany: customers.company,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(sampleShipments)
      .leftJoin(customers, eq(sampleShipments.customerId, customers.id))
      .where(and(
        eq(sampleShipments.followUpStatus, 'pending'),
        lte(sampleShipments.estimatedDeliveryAt, new Date()),
      ))
      .orderBy(desc(sampleShipments.shippedAt))
      .limit(50);

    return results.map(r => ({
      ...r.shipment,
      customerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(' ') || r.customerCompany || 'Unknown',
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
    }));
  }

  async recordFollowUp(shipmentId: number, type: string, userId: string, outcome?: string): Promise<void> {
    const [shipment] = await db
      .select()
      .from(sampleShipments)
      .where(eq(sampleShipments.id, shipmentId))
      .limit(1);

    if (!shipment) return;

    const newStep = (shipment.followUpStep || 0) + 1;
    const followUpHistory = (shipment.followUpHistory || []) as FollowUpEntry[];
    followUpHistory.push({
      step: newStep,
      type: type as any,
      date: new Date().toISOString(),
      userId,
      outcome: outcome || undefined,
    });

    await db.update(sampleShipments)
      .set({
        followUpStep: newStep,
        followUpStatus: outcome === 'ordered' ? 'converted' : outcome === 'not_interested' ? 'closed' : 'in_progress',
        followUpHistory,
        lastFollowUpAt: new Date(),
        lastFollowUpType: type,
      })
      .where(eq(sampleShipments.id, shipmentId));
  }
}

export const opportunityEngine = new OpportunityEngine();
