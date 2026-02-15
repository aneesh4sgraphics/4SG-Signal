import { db } from "./db";
import {
  customers, leads, customerMachineProfiles, emailSends, gmailMessages,
  opportunityScores, sampleShipments, spotlightEvents, labelPrints,
  OPPORTUNITY_SCORING_WEIGHTS, DIGITAL_PRINTING_MACHINES, HIGH_PERFORMING_REGIONS,
  UPS_GROUND_TRANSIT_DAYS,
  type OpportunitySignal, type OpportunityType, type FollowUpEntry,
} from "@shared/schema";
import { eq, and, or, isNull, isNotNull, sql, desc, gte, lt, inArray, count } from "drizzle-orm";
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

    const hasSamples = customerData.swatchbookSentAt || customerData.pressTestSentAt;
    const hasOrders = customerData.totalOrders && customerData.totalOrders > 0;
    if (hasSamples && !hasOrders) {
      signals.push({
        signal: 'sample_sent_no_order',
        points: OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder,
        detail: 'Received samples but hasn\'t ordered yet',
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.sampleSentNoOrder;
      opportunityTypes.push('sample_no_order');
    }

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

    const stateAbbrev = normalizeStateToAbbreviation(customerData.province);
    if (stateAbbrev && HIGH_PERFORMING_REGIONS.includes(stateAbbrev as any)) {
      signals.push({
        signal: 'high_performing_region',
        points: OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion,
        detail: `Located in high-performing region: ${stateAbbrev}`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.highPerformingRegion;
    }

    const totalSpent = parseFloat(customerData.totalSpent || '0');
    if (hasOrders && totalSpent > 0 && totalSpent < 500) {
      signals.push({
        signal: 'small_order_upsell',
        points: OPPORTUNITY_SCORING_WEIGHTS.smallOrderUpsell,
        detail: `Placed ${customerData.totalOrders} order(s) totaling $${totalSpent.toFixed(2)} — room to grow`,
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.smallOrderUpsell;
      opportunityTypes.push('upsell_potential');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const lastOutbound = customerData.lastOutboundEmailAt;
    if (lastOutbound && lastOutbound < thirtyDaysAgo && (emailActivity?.count ?? 0) > 0) {
      signals.push({
        signal: 'went_quiet',
        points: OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest,
        detail: 'Was engaged but went quiet — worth a check-in',
      });
      totalScore += OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest;
      opportunityTypes.push('went_quiet');
    }

    if (customerData.website) {
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (leadData.lastContactAt && leadData.lastContactAt < thirtyDaysAgo && (leadData.totalTouchpoints ?? 0) > 2) {
      signals.push({
        signal: 'went_quiet',
        points: OPPORTUNITY_SCORING_WEIGHTS.wentQuietAfterInterest,
        detail: `${leadData.totalTouchpoints} touchpoints but no contact in 30+ days`,
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
    let processed = 0;
    let scored = 0;

    const allCustomers = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(
        eq(customers.doNotContact, false),
        eq(customers.isCompany, false),
      ));

    for (const customer of allCustomers) {
      processed++;
      const { score, signals, opportunityTypes } = await this.scoreCustomer(customer.id);

      if (score >= 20 && opportunityTypes.length > 0) {
        scored++;
        for (const oppType of opportunityTypes) {
          const typeSignals = signals.filter(s => {
            if (oppType === 'sample_no_order') return s.signal === 'sample_sent_no_order' || s.signal !== 'small_order_upsell';
            return true;
          });

          const existing = await db
            .select({ id: opportunityScores.id })
            .from(opportunityScores)
            .where(and(
              eq(opportunityScores.customerId, customer.id),
              eq(opportunityScores.opportunityType, oppType),
              eq(opportunityScores.isActive, true),
            ))
            .limit(1);

          if (existing.length > 0) {
            await db.update(opportunityScores)
              .set({
                score,
                signals: typeSignals,
                lastCalculatedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(opportunityScores.id, existing[0].id));
          } else {
            await db.insert(opportunityScores).values({
              customerId: customer.id,
              score,
              opportunityType: oppType,
              signals: typeSignals,
              isActive: true,
              lastCalculatedAt: new Date(),
            });
          }
        }
      } else {
        await db.update(opportunityScores)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(
            eq(opportunityScores.customerId, customer.id),
            eq(opportunityScores.isActive, true),
          ));
      }
    }

    const allLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(sql`${leads.stage} NOT IN ('converted', 'lost')`);

    for (const lead of allLeads) {
      processed++;
      const { score, signals, opportunityTypes } = await this.scoreLead(lead.id);

      if (score >= 20 && opportunityTypes.length > 0) {
        scored++;
        for (const oppType of opportunityTypes) {
          const existing = await db
            .select({ id: opportunityScores.id })
            .from(opportunityScores)
            .where(and(
              eq(opportunityScores.leadId, lead.id),
              eq(opportunityScores.opportunityType, oppType),
              eq(opportunityScores.isActive, true),
            ))
            .limit(1);

          if (existing.length > 0) {
            await db.update(opportunityScores)
              .set({
                score,
                signals,
                lastCalculatedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(opportunityScores.id, existing[0].id));
          } else {
            await db.insert(opportunityScores).values({
              leadId: lead.id,
              score,
              opportunityType: oppType,
              signals,
              isActive: true,
              lastCalculatedAt: new Date(),
            });
          }
        }
      } else {
        await db.update(opportunityScores)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(
            eq(opportunityScores.leadId, lead.id),
            eq(opportunityScores.isActive, true),
          ));
      }
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
      });
    }

    combined.sort((a, b) => b.score - a.score);
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

  async getOpportunitySummary(): Promise<{
    totalActive: number;
    byType: Record<string, number>;
    avgScore: number;
    topScorers: number;
  }> {
    const activeOpps = await db
      .select({
        oppType: opportunityScores.opportunityType,
        cnt: count(),
        avgScore: sql<number>`AVG(${opportunityScores.score})`,
      })
      .from(opportunityScores)
      .where(eq(opportunityScores.isActive, true))
      .groupBy(opportunityScores.opportunityType);

    const byType: Record<string, number> = {};
    let totalActive = 0;
    let totalScoreSum = 0;

    for (const row of activeOpps) {
      byType[row.oppType] = Number(row.cnt);
      totalActive += Number(row.cnt);
      totalScoreSum += Number(row.avgScore) * Number(row.cnt);
    }

    const [topScorers] = await db
      .select({ cnt: count() })
      .from(opportunityScores)
      .where(and(
        eq(opportunityScores.isActive, true),
        gte(opportunityScores.score, 60),
      ));

    return {
      totalActive,
      byType,
      avgScore: totalActive > 0 ? Math.round(totalScoreSum / totalActive) : 0,
      topScorers: Number(topScorers?.cnt || 0),
    };
  }

  async detectSampleShipments(): Promise<number> {
    let detected = 0;

    if (isOdooConfigured()) {
      try {
        const sampleOrders = await odooClient.getZeroValueSampleOrders('2026-01-01');
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
              orderAmount: String(order.amount_total || 0),
              clientRef: (order as any).client_order_ref || null,
            });

            detected++;
          }
        }
      } catch (error) {
        console.error('[OpportunityEngine] Error detecting Odoo sample shipments:', error);
      }
    }

    const recentLabels = await db
      .select()
      .from(labelPrints)
      .where(gte(labelPrints.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)));

    for (const label of recentLabels) {
      const existing = await db
        .select({ id: sampleShipments.id })
        .from(sampleShipments)
        .where(and(
          eq(sampleShipments.source, 'label_print'),
          eq(sampleShipments.sourceOrderId, String(label.id)),
        ))
        .limit(1);

      if (existing.length > 0) continue;

      const transitDays = estimateTransitDays(label.province);
      const shippedAt = label.createdAt || new Date();
      const estimatedDelivery = new Date(shippedAt);
      estimatedDelivery.setDate(estimatedDelivery.getDate() + transitDays);

      await db.insert(sampleShipments).values({
        customerId: label.customerId,
        source: 'label_print',
        sourceOrderId: String(label.id),
        sourceOrderName: `${label.labelType} label print`,
        shippedAt,
        estimatedDeliveryAt: estimatedDelivery,
        deliveryState: normalizeStateToAbbreviation(label.province),
        estimatedTransitDays: transitDays,
        followUpStatus: 'pending',
        followUpStep: 0,
        orderAmount: '0',
      });

      detected++;
    }

    console.log(`[OpportunityEngine] Detected ${detected} new sample shipments`);
    return detected;
  }

  async getSampleShipmentsNeedingFollowUp(): Promise<any[]> {
    const now = new Date();

    const shipments = await db
      .select({
        shipment: sampleShipments,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerCompany: customers.company,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerProvince: customers.province,
      })
      .from(sampleShipments)
      .leftJoin(customers, eq(sampleShipments.customerId, customers.id))
      .where(and(
        eq(sampleShipments.followUpStatus, 'pending'),
        sql`${sampleShipments.estimatedDeliveryAt} <= ${now}`,
        lt(sampleShipments.followUpStep, 3),
      ))
      .orderBy(sampleShipments.estimatedDeliveryAt);

    return shipments;
  }

  async recordFollowUp(shipmentId: number, type: 'call' | 'email' | 'other', userId: string, outcome?: string): Promise<void> {
    const [shipment] = await db
      .select()
      .from(sampleShipments)
      .where(eq(sampleShipments.id, shipmentId))
      .limit(1);

    if (!shipment) return;

    const currentStep = (shipment.followUpStep || 0) + 1;
    const history = (shipment.followUpHistory || []) as FollowUpEntry[];
    history.push({
      step: currentStep,
      type,
      date: new Date().toISOString(),
      outcome,
      userId,
    });

    const isComplete = currentStep >= 3;
    const hasCall = history.some(h => h.type === 'call');

    let nextFollowUpDays = 3;
    if (currentStep === 1) nextFollowUpDays = 3;
    else if (currentStep === 2) nextFollowUpDays = 5;

    const nextFollowUp = new Date();
    nextFollowUp.setDate(nextFollowUp.getDate() + nextFollowUpDays);

    await db.update(sampleShipments)
      .set({
        followUpStep: currentStep,
        lastFollowUpAt: new Date(),
        followUpHistory: history,
        followUpStatus: isComplete ? 'completed' : 'pending',
        updatedAt: new Date(),
      })
      .where(eq(sampleShipments.id, shipmentId));
  }
}

export const opportunityEngine = new OpportunityEngine();
