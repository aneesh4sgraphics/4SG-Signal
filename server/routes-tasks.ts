import type { Express } from "express";
import { db } from "./db";
import { eq, sql, and, or, desc, asc, ilike, gte, gt, lt, isNull, isNotNull, not, inArray } from "drizzle-orm";
import { isAuthenticated } from "./replitAuth";
import { odooClient, isOdooConfigured } from "./odoo";
import { storage } from "./storage";
import { spotlightEngine } from "./spotlight-engine";
import { analyzeForHints } from "./spotlight-heuristics";
import OpenAI from "openai";
import {
  customers,
  customerActivityEvents,
  emailSends,
  emailTrackingTokens,
  labelPrints,
  users,
  emailSalesEvents,
  gmailMessages,
  followUpTasks,
  leads,
  leadActivities,
  spotlightEvents,
  spotlightSessionState,
  spotlightSnoozes,
  spotlightTeamClaims,
  dripCampaigns,
  dripCampaignAssignments,
} from "@shared/schema";

export function registerTasksRoutes(app: Express): void {
  app.get("/api/spotlight/outreach-review", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // 1. Label prints by THIS user only
      const recentPrints = await db.execute(sql`
        SELECT customer_id AS "customerId", label_type AS "labelType", created_at AS "createdAt"
        FROM label_prints
        WHERE created_at >= ${sevenDaysAgo}
          AND printed_by_user_id = ${userId}
      `).then(r => r.rows as { customerId: string; labelType: string; createdAt: string }[]);

      // 2. $0.00 Shopify orders for customers assigned to THIS user
      const recentSamples = await db.execute(sql`
        SELECT so.customer_id AS "customerId", so.order_number AS "orderNumber", so.shopify_created_at AS "shopifyCreatedAt"
        FROM shopify_orders so
        JOIN customers c ON c.id = so.customer_id
        WHERE so.shopify_created_at >= ${sevenDaysAgo}
          AND CAST(so.total_price AS numeric) = 0
          AND so.customer_id IS NOT NULL
          AND (c.sales_rep_id = ${userId} OR c.sales_rep_id = ${userEmail})
      `).then(r => r.rows as { customerId: string; orderNumber: string | null; shopifyCreatedAt: string }[]);

      // 3. Quotes sent by THIS user
      const recentQuotes = await db.execute(sql`
        SELECT customer_id AS "customerId", title, event_date AS "eventDate"
        FROM customer_activity_events
        WHERE event_date >= ${sevenDaysAgo}
          AND event_type = 'quote_sent'
          AND created_by = ${userId}
      `).then(r => r.rows as { customerId: string; title: string; eventDate: string }[]);

      // Build map of customerId → activities
      type Activity = { type: string; label: string; date: Date };
      const actMap = new Map<string, Activity[]>();

      const LABEL_DISPLAY: Record<string, string> = {
        swatch_book: 'Swatch Book sent',
        press_test_kit: 'Press Test Kit sent',
        mailer: 'Mailer sent',
        other: 'Kit sent',
        letter: 'Letter sent',
      };

      for (const p of recentPrints) {
        if (!p.customerId) continue;
        if (!actMap.has(p.customerId)) actMap.set(p.customerId, []);
        actMap.get(p.customerId)!.push({
          type: p.labelType,
          label: LABEL_DISPLAY[p.labelType] || 'Material sent',
          date: p.createdAt ? new Date(p.createdAt) : new Date(),
        });
      }

      for (const s of recentSamples) {
        if (!s.customerId) continue;
        if (!actMap.has(s.customerId)) actMap.set(s.customerId, []);
        actMap.get(s.customerId)!.push({
          type: 'sample',
          label: `Sample order${s.orderNumber ? ' ' + s.orderNumber : ''} sent`,
          date: s.shopifyCreatedAt ? new Date(s.shopifyCreatedAt) : new Date(),
        });
      }

      for (const q of recentQuotes) {
        if (!q.customerId) continue;
        if (!actMap.has(q.customerId)) actMap.set(q.customerId, []);
        actMap.get(q.customerId)!.push({
          type: 'quote',
          label: q.title || 'Quote sent',
          date: q.eventDate ? new Date(q.eventDate) : new Date(),
        });
      }

      if (actMap.size === 0) return res.json({ customers: [], count: 0 });

      const customerIds = Array.from(actMap.keys());
      const now = new Date();

      // Fetch customer details for all matched customers
      const customerRows = await db.select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        company: customers.company,
        email: customers.email,
        phone: customers.phone,
        odooPartnerId: customers.odooPartnerId,
        salesRepName: customers.salesRepName,
      }).from(customers)
        .where(inArray(customers.id, customerIds));

      // Fetch follow-up events (past 30 days), positive outcomes, and snoozes in one query
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const allActivityRows = await db.select({
        customerId: customerActivityEvents.customerId,
        eventType: customerActivityEvents.eventType,
        eventDate: customerActivityEvents.eventDate,
        createdBy: customerActivityEvents.createdBy,
      }).from(customerActivityEvents)
        .where(and(
          inArray(customerActivityEvents.customerId, customerIds),
          inArray(customerActivityEvents.eventType, [
            'call_made', 'email_sent', 'outreach_snoozed',
            'quote_sent', 'sample_shipped', 'order_placed', 'meeting_scheduled',
          ]),
          gte(customerActivityEvents.eventDate, thirtyDaysAgo)
        ));

      // Build per-customer tracking maps
      const latestFollowUp = new Map<string, Date>();
      const contactAttempts = new Map<string, number>(); // calls + emails in past 30 days
      const hasPositiveOutcome = new Set<string>(); // quote, sample, order, meeting
      const activeSnooze = new Set<string>();

      for (const row of allActivityRows) {
        const date = new Date(row.eventDate);
        if (row.eventType === 'outreach_snoozed') {
          if (date > now) activeSnooze.add(row.customerId);
        } else if (row.eventType === 'call_made' || row.eventType === 'email_sent') {
          const existing = latestFollowUp.get(row.customerId);
          if (!existing || date > existing) latestFollowUp.set(row.customerId, date);
          contactAttempts.set(row.customerId, (contactAttempts.get(row.customerId) || 0) + 1);
        } else {
          // Positive outcome events
          hasPositiveOutcome.add(row.customerId);
        }
      }

      // Also check for Shopify orders as a positive outcome
      if (customerIds.length > 0) {
        const idList = sql.join(customerIds.map(id => sql`${id}`), sql`, `);
        const recentOrdersResult = await db.execute(
          sql`SELECT customer_id AS "customerId" FROM shopify_orders WHERE shopify_created_at >= ${thirtyDaysAgo} AND CAST(total_price AS numeric) > 0 AND customer_id IN (${idList})`
        ).catch(() => ({ rows: [] as { customerId: string }[] }));
        for (const o of (recentOrdersResult.rows as { customerId: string }[])) {
          if (o.customerId) hasPositiveOutcome.add(o.customerId);
        }
      }

      // Find matching active leads for these customers (by email) — batch query
      const customerEmails = customerRows.map(c => c.email).filter(Boolean) as string[];
      const matchingLeads = customerEmails.length > 0 ? await db.select({
        id: leads.id,
        email: leads.email,
        stage: leads.stage,
      }).from(leads)
        .where(and(
          inArray(leads.email, customerEmails),
          inArray(leads.stage, ['new', 'contacted', 'qualified', 'nurturing'])
        )) : [];
      const leadByEmail = new Map(matchingLeads.map(l => [l.email?.toLowerCase(), l]));

      const result = customerRows
        .map(c => {
          const acts = (actMap.get(c.id) || []).sort((a, b) => b.date.getTime() - a.date.getTime());
          const mostRecentOutreach = acts[0]?.date || new Date();
          const daysAgo = Math.floor((now.getTime() - mostRecentOutreach.getTime()) / (1000 * 60 * 60 * 24));
          const attempts = contactAttempts.get(c.id) || 0;
          const matchedLead = c.email ? leadByEmail.get(c.email.toLowerCase()) : undefined;
          // Potentially lost: 3+ contact attempts in past 30 days with no positive outcome
          const potentiallyLost = attempts >= 3 && !hasPositiveOutcome.has(c.id);
          return {
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unknown',
            company: c.company,
            email: c.email,
            phone: c.phone,
            odooPartnerId: c.odooPartnerId,
            salesRepName: c.salesRepName,
            activities: acts.map(a => ({
              type: a.type,
              label: a.label,
              date: a.date.toISOString(),
              daysAgo: Math.floor((now.getTime() - a.date.getTime()) / (1000 * 60 * 60 * 24)),
            })),
            mostRecentDate: mostRecentOutreach.toISOString(),
            daysAgo,
            contactAttempts: attempts,
            potentiallyLost,
            leadId: matchedLead?.id || null,
            leadStage: matchedLead?.stage || null,
            _mostRecentOutreach: mostRecentOutreach,
          };
        })
        .filter(c => {
          if (activeSnooze.has(c.id)) return false;
          // Potentially lost customers always show (bypass the "already followed up" filter)
          if (c.potentiallyLost) return true;
          // Normal filter: hide if followed up after most recent outreach
          const followUp = latestFollowUp.get(c.id);
          if (followUp && followUp > c._mostRecentOutreach) return false;
          return true;
        })
        .map(({ _mostRecentOutreach: _omit, ...rest }) => rest)
        // Sort: potentially lost first (red cards at top), then by daysAgo desc
        .sort((a, b) => {
          if (a.potentiallyLost && !b.potentiallyLost) return -1;
          if (!a.potentiallyLost && b.potentiallyLost) return 1;
          return b.daysAgo - a.daysAgo;
        });

      res.json({ customers: result, count: result.length });
    } catch (error) {
      console.error("Outreach review error:", error);
      res.status(500).json({ error: "Failed to fetch outreach review" });
    }
  });
  app.post("/api/spotlight/outreach-review/mark-done", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, actionType } = req.body; // actionType: 'called' | 'emailed'
      if (!customerId || !actionType) {
        return res.status(400).json({ error: "customerId and actionType required" });
      }
      const userId = req.user?.id;
      const userName = req.user?.firstName
        ? `${req.user.firstName} ${req.user.lastName || ''}`.trim()
        : req.user?.email || 'Unknown';

      const eventType = actionType === 'emailed' ? 'email_sent' : 'call_made';
      const title = actionType === 'emailed'
        ? 'Follow-up email sent (outreach review)'
        : 'Follow-up call made (outreach review)';

      await db.insert(customerActivityEvents).values({
        customerId,
        eventType,
        title,
        createdBy: userId,
        createdByName: userName,
        eventDate: new Date(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Mark-done error:", error);
      res.status(500).json({ error: "Failed to log follow-up" });
    }
  });
  app.post("/api/spotlight/outreach-review/snooze", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.body;
      if (!customerId) return res.status(400).json({ error: "customerId required" });
      const userId = req.user?.id;
      const userName = req.user?.firstName
        ? `${req.user.firstName} ${req.user.lastName || ''}`.trim()
        : req.user?.email || 'Unknown';

      // eventDate = "snooze until" date — 7 days from now
      const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(customerActivityEvents).values({
        customerId,
        eventType: 'outreach_snoozed',
        title: 'Outreach review snoozed — remind next week',
        createdBy: userId,
        createdByName: userName,
        eventDate: snoozeUntil,
      });

      res.json({ success: true, snoozeUntil });
    } catch (error) {
      console.error("Snooze error:", error);
      res.status(500).json({ error: "Failed to snooze" });
    }
  });
  app.post("/api/spotlight/outreach-review/mark-lost", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, leadId, reason } = req.body;
      if (!customerId) return res.status(400).json({ error: "customerId required" });
      const userId = req.user?.id;
      const userName = req.user?.firstName
        ? `${req.user.firstName} ${req.user.lastName || ''}`.trim()
        : req.user?.email || 'Unknown';
      const lostReason = reason || 'No response after multiple contact attempts';

      // Mark the lead as lost if a leadId is provided
      if (leadId) {
        await db.update(leads)
          .set({ stage: 'lost', lostReason })
          .where(eq(leads.id, leadId));
      }

      // Log a customer activity event
      await db.insert(customerActivityEvents).values({
        customerId,
        eventType: 'marked_lost',
        title: `Marked as lost: ${lostReason}`,
        createdBy: userId,
        createdByName: userName,
        eventDate: new Date(),
      });

      // Snooze for 30 days (longer snooze for lost contacts)
      const snoozeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(customerActivityEvents).values({
        customerId,
        eventType: 'outreach_snoozed',
        title: 'Outreach review snoozed — marked as lost',
        createdBy: userId,
        createdByName: userName,
        eventDate: snoozeUntil,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Mark-lost error:", error);
      res.status(500).json({ error: "Failed to mark as lost" });
    }
  });
  app.get("/api/spotlight/today-progress", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      // Use consistent date logic with SPOTLIGHT session (6pm cutoff)
      // This ensures progress bars survive server restarts and match session state
      const now = new Date();
      const hour = now.getHours();
      let today: Date;
      if (hour >= 18) {
        // After 6pm, session is for "tomorrow" - count from 6pm today
        today = new Date(now);
        today.setHours(18, 0, 0, 0);
      } else {
        // Before 6pm, session is for "today" - count from 6pm yesterday
        today = new Date(now);
        today.setDate(today.getDate() - 1);
        today.setHours(18, 0, 0, 0);
      }
      
      // Run all queries in parallel: label prints + one aggregated spotlight_events + session + follow-ups
      const [labelStats, mailerStats, eventsAgg, sessionResult, onTimeFollowUps] = await Promise.all([
        // 1. SWATCHBOOKS: label prints (swatch_book / press_test_kit)
        db.select({ labelType: labelPrints.labelType, count: sql<number>`COUNT(*)::int` })
          .from(labelPrints)
          .where(and(
            eq(labelPrints.printedByUserId, userId),
            gte(labelPrints.createdAt, today),
            or(eq(labelPrints.labelType, 'swatch_book'), eq(labelPrints.labelType, 'press_test_kit'))
          ))
          .groupBy(labelPrints.labelType),

        // 1b. MAILERS: label prints of type 'mailer' today
        db.select({ count: sql<number>`COUNT(*)::int` })
          .from(labelPrints)
          .where(and(
            eq(labelPrints.printedByUserId, userId),
            gte(labelPrints.createdAt, today),
            eq(labelPrints.labelType, 'mailer')
          )),

        // 2-5. Single aggregated query replaces 5 individual spotlight_events queries
        db.select({
          callsCount:        sql<number>`COUNT(CASE WHEN outcome_id = 'called' THEN 1 END)::int`,
          emailsCount:       sql<number>`COUNT(CASE WHEN outcome_id IN ('email_sent','send_drip','replied') THEN 1 END)::int`,
          hygieneCount:      sql<number>`COUNT(CASE WHEN bucket = 'data_hygiene' THEN 1 END)::int`,
          sampleFollowups:   sql<number>`COUNT(CASE WHEN task_subtype = 'odoo_sample_followup' AND outcome_id IN ('called','email_sent') THEN 1 END)::int`,
          quotesFollowedUp:  sql<number>`COUNT(CASE WHEN task_subtype IN ('odoo_quote_followup','shopify_draft_followup','shopify_abandoned_cart','saved_quote_followup') AND outcome_id IN ('called','email_sent','contacted','order_confirmed','order_placed') THEN 1 END)::int`,
        })
        .from(spotlightEvents)
        .where(and(
          eq(spotlightEvents.userId, userId),
          eq(spotlightEvents.eventType, 'task_completed'),
          gte(spotlightEvents.createdAt, today)
        )),

        // 6a. Session state for coaching compliance
        db.select({ totalCompleted: spotlightSessionState.totalCompleted, totalTarget: spotlightSessionState.totalTarget })
          .from(spotlightSessionState)
          .where(and(eq(spotlightSessionState.userId, userId), gte(spotlightSessionState.updatedAt, today)))
          .orderBy(desc(spotlightSessionState.updatedAt))
          .limit(1),

        // 6b. On-time follow-ups
        db.select({
          total: sql<number>`COUNT(*)::int`,
          onTime: sql<number>`COUNT(CASE WHEN ${followUpTasks.completedAt} <= ${followUpTasks.dueDate} THEN 1 END)::int`,
        })
        .from(followUpTasks)
        .where(and(eq(followUpTasks.assignedTo, userId), eq(followUpTasks.status, 'completed'), gte(followUpTasks.completedAt, today))),
      ]);

      const swatchBookCount    = labelStats.find(s => s.labelType === 'swatch_book')?.count || 0;
      const pressTestKitCount  = labelStats.find(s => s.labelType === 'press_test_kit')?.count || 0;
      const mailerCount        = mailerStats[0]?.count || 0;
      const sampleFollowUpCount = eventsAgg[0]?.sampleFollowups || 0;
      const totalSwatchbooks   = swatchBookCount + pressTestKitCount + sampleFollowUpCount;
      const swatchbookGoal     = 3;

      const callsCount         = eventsAgg[0]?.callsCount || 0;
      const callsGoal          = 10;
      const emailsCount        = eventsAgg[0]?.emailsCount || 0;
      const emailsGoal         = 15;
      const hygieneCount       = eventsAgg[0]?.hygieneCount || 0;
      const hygieneGoal        = 5;
      const quotesFollowedUp   = eventsAgg[0]?.quotesFollowedUp || 0;
      const quotesGoal         = 5;

      // 6. COACHING COMPLIANCE: Weighted composite score
      const tasksCompleted     = sessionResult[0]?.totalCompleted || 0;
      const tasksTarget        = sessionResult[0]?.totalTarget || 30;
      const taskCompletionRate = Math.min(100, (tasksCompleted / tasksTarget) * 100);
      const followUpTotal      = onTimeFollowUps[0]?.total || 0;
      const followUpOnTime     = onTimeFollowUps[0]?.onTime || 0;
      const followUpRate       = followUpTotal > 0 ? (followUpOnTime / followUpTotal) * 100 : 100;
      const callRate           = Math.min(100, (callsCount / callsGoal) * 100);
      
      // Weighted composite: 50% task completion + 30% follow-up timeliness + 20% calls
      const coachingCompliance = Math.round(
        (taskCompletionRate * 0.5) + (followUpRate * 0.3) + (callRate * 0.2)
      );
      
      res.json({
        swatchbooks: {
          count: totalSwatchbooks,
          goal: swatchbookGoal,
          progress: Math.min(100, (totalSwatchbooks / swatchbookGoal) * 100),
          goalMet: totalSwatchbooks >= swatchbookGoal,
          breakdown: {
            swatchBooks: swatchBookCount,
            pressTestKits: pressTestKitCount,
            sampleFollowUps: sampleFollowUpCount,
          }
        },
        calls: {
          count: callsCount,
          goal: callsGoal,
          progress: Math.min(100, (callsCount / callsGoal) * 100),
          goalMet: callsCount >= callsGoal,
        },
        emails: {
          count: emailsCount,
          goal: emailsGoal,
          progress: Math.min(100, (emailsCount / emailsGoal) * 100),
          goalMet: emailsCount >= emailsGoal,
        },
        dataHygiene: {
          count: hygieneCount,
          goal: hygieneGoal,
          progress: Math.min(100, (hygieneCount / hygieneGoal) * 100),
          goalMet: hygieneCount >= hygieneGoal,
        },
        mailers: {
          count: mailerCount,
          goal: 5,
          progress: Math.min(100, (mailerCount / 5) * 100),
          goalMet: mailerCount >= 5,
        },
        quotesFollowedUp: {
          count: quotesFollowedUp,
          goal: quotesGoal,
          progress: Math.min(100, (quotesFollowedUp / quotesGoal) * 100),
          goalMet: quotesFollowedUp >= quotesGoal,
          highPriority: true,
        },
        coachingCompliance: {
          score: coachingCompliance,
          breakdown: {
            taskCompletion: Math.round(taskCompletionRate),
            followUpTimeliness: Math.round(followUpRate),
            callsLogged: Math.round(callRate),
          },
          components: {
            tasksCompleted,
            tasksTarget,
            followUpsOnTime: followUpOnTime,
            followUpsTotal: followUpTotal,
            callsMade: callsCount,
            callsGoal,
          },
        },
      });
    } catch (error) {
      console.error("Today's SPOTLIGHT progress error:", error);
      res.status(500).json({ error: "Failed to fetch today's progress" });
    }
  });
  app.get("/api/spotlight/worked-today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      // Use consistent 6pm cutoff date logic
      const now = new Date();
      const hour = now.getHours();
      let today: Date;
      if (hour >= 18) {
        today = new Date(now);
        today.setHours(18, 0, 0, 0);
      } else {
        today = new Date(now);
        today.setDate(today.getDate() - 1);
        today.setHours(18, 0, 0, 0);
      }
      
      // Get distinct customers from spotlight_events for this user today
      // Use subquery to get most recent interaction per customer, then get distinct
      const workedCustomersRaw = await db.select({
        customerId: spotlightEvents.customerId,
        createdAt: sql<Date>`MAX(${spotlightEvents.createdAt})`.as('max_created'),
      })
      .from(spotlightEvents)
      .where(
        and(
          eq(spotlightEvents.userId, userId),
          isNotNull(spotlightEvents.customerId),
          gte(spotlightEvents.createdAt, today)
        )
      )
      .groupBy(spotlightEvents.customerId)
      .orderBy(desc(sql`MAX(${spotlightEvents.createdAt})`));
      
      const workedCustomers = workedCustomersRaw.map(r => ({ customerId: r.customerId }));
      
      // Get customer details for each worked customer
      const customerIds = workedCustomers.map(c => c.customerId).filter(Boolean) as string[];
      
      if (customerIds.length === 0) {
        return res.json({ customers: [] });
      }
      
      const customerDetails = await db.select({
        id: customers.id,
        company: customers.company,
        email: customers.email,
      })
      .from(customers)
      .where(inArray(customers.id, customerIds));
      
      // Also check leads table for any lead IDs (lead IDs are integers stored as strings in customerIds)
      const leadIdNumbers = customerIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      let leadDetails: { id: number; company: string | null; email: string | null }[] = [];
      if (leadIdNumbers.length > 0) {
        leadDetails = await db.select({
          id: leads.id,
          company: leads.company,
          email: leads.email,
        })
        .from(leads)
        .where(inArray(leads.id, leadIdNumbers));
      }
      
      // Combine and map to preserve order
      const detailsMap = new Map<string, { company: string | null; email: string | null }>();
      for (const c of customerDetails) {
        detailsMap.set(String(c.id), { company: c.company, email: c.email });
      }
      for (const l of leadDetails) {
        detailsMap.set(String(l.id), { company: l.company, email: l.email });
      }
      
      const result = customerIds
        .map(id => {
          const d = detailsMap.get(id);
          if (!d) return null;
          return { id, name: d.company || d.email || 'Unknown', email: d.email };
        })
        .filter(Boolean);
      
      res.json({ customers: result });
    } catch (error) {
      console.error("Error getting worked customers:", error);
      res.status(500).json({ error: "Failed to fetch worked customers" });
    }
  });
  app.post("/api/spotlight/snooze", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { customerId, snoozeUntil, outcomeTag, note } = req.body;
      if (!customerId) return res.status(400).json({ error: "customerId is required" });

      const FAR_FUTURE = new Date("2099-01-01T00:00:00Z");
      const snoozeDate = (outcomeTag === 'not_interested' && !snoozeUntil)
        ? FAR_FUTURE
        : snoozeUntil ? new Date(snoozeUntil) : null;

      await db.insert(spotlightSnoozes).values({
        customerId,
        userId,
        snoozeUntil: snoozeDate,
        outcomeTag: outcomeTag || null,
        note: note || null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Spotlight snooze error:", error);
      res.status(500).json({ error: "Failed to snooze" });
    }
  });
  app.get("/api/spotlight/snooze/:customerId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { customerId } = req.params;
      const now = new Date();

      const [snooze] = await db
        .select()
        .from(spotlightSnoozes)
        .where(
          and(
            eq(spotlightSnoozes.customerId, customerId),
            eq(spotlightSnoozes.userId, userId),
            gt(spotlightSnoozes.snoozeUntil, now)
          )
        )
        .orderBy(desc(spotlightSnoozes.createdAt))
        .limit(1);

      res.json({ snoozed: !!snooze, snooze: snooze || null });
    } catch (error) {
      console.error("Snooze check error:", error);
      res.status(500).json({ error: "Failed to check snooze" });
    }
  });
  app.post("/api/spotlight/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { customerId } = req.body;
      if (!customerId) return res.status(400).json({ error: "customerId is required" });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Release any existing active claim by this user for this customer
      await db
        .update(spotlightTeamClaims)
        .set({ releasedAt: now })
        .where(
          and(
            eq(spotlightTeamClaims.customerId, customerId),
            eq(spotlightTeamClaims.userId, userId),
            isNull(spotlightTeamClaims.releasedAt)
          )
        );

      const [claim] = await db
        .insert(spotlightTeamClaims)
        .values({ customerId, userId, expiresAt, renewalCount: 0 })
        .returning();

      res.json({ success: true, claim });
    } catch (error) {
      console.error("Spotlight claim error:", error);
      res.status(500).json({ error: "Failed to claim" });
    }
  });
  app.post("/api/spotlight/claim/:customerId/renew", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { customerId } = req.params;

      // Find the active claim owned by this user
      const now = new Date();
      const [existing] = await db
        .select()
        .from(spotlightTeamClaims)
        .where(
          and(
            eq(spotlightTeamClaims.customerId, customerId),
            eq(spotlightTeamClaims.userId, userId),
            isNull(spotlightTeamClaims.releasedAt)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "No active claim found for this customer" });
      }

      if (existing.renewalCount >= 2) {
        return res.status(400).json({ error: "Maximum renewals (2) reached. The customer will return to the shared list." });
      }

      const newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const [updated] = await db
        .update(spotlightTeamClaims)
        .set({ expiresAt: newExpiry, renewalCount: existing.renewalCount + 1 })
        .where(eq(spotlightTeamClaims.id, existing.id))
        .returning();

      res.json({ success: true, claim: updated, renewalsRemaining: 2 - updated.renewalCount });
    } catch (error) {
      console.error("Spotlight renew claim error:", error);
      res.status(500).json({ error: "Failed to renew claim" });
    }
  });
  app.delete("/api/spotlight/claim/:customerId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { customerId } = req.params;

      await db
        .update(spotlightTeamClaims)
        .set({ releasedAt: new Date() })
        .where(
          and(
            eq(spotlightTeamClaims.customerId, customerId),
            eq(spotlightTeamClaims.userId, userId),
            isNull(spotlightTeamClaims.releasedAt)
          )
        );

      res.json({ success: true });
    } catch (error) {
      console.error("Spotlight unclaim error:", error);
      res.status(500).json({ error: "Failed to release claim" });
    }
  });
  app.get("/api/spotlight/claims", isAuthenticated, async (req: any, res) => {
    try {
      const now = new Date();

      const claims = await db
        .select({
          id: spotlightTeamClaims.id,
          customerId: spotlightTeamClaims.customerId,
          userId: spotlightTeamClaims.userId,
          claimedAt: spotlightTeamClaims.claimedAt,
          expiresAt: spotlightTeamClaims.expiresAt,
          renewalCount: spotlightTeamClaims.renewalCount,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
        })
        .from(spotlightTeamClaims)
        .leftJoin(users, eq(spotlightTeamClaims.userId, users.id))
        .where(
          and(
            isNull(spotlightTeamClaims.releasedAt),
            gt(spotlightTeamClaims.expiresAt, now)
          )
        );

      res.json({ claims });
    } catch (error) {
      console.error("Spotlight claims fetch error:", error);
      res.status(500).json({ error: "Failed to fetch claims" });
    }
  });
  app.get("/api/spotlight/score/:customerId", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { calculateSpotlightScore } = await import("./spotlight-engine");
      const result = await calculateSpotlightScore(customerId);
      res.json(result);
    } catch (error) {
      console.error("Spotlight score error:", error);
      res.status(500).json({ error: "Failed to calculate score" });
    }
  });
  app.get("/api/spotlight/current", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Debug: force a specific bucket type with ?forceBucket=data_hygiene
      const forceBucket = req.query.forceBucket as string | undefined;
      // Work type focus filter: bounced_email, data_hygiene, samples, quotes, calls
      const workType = req.query.workType as string | undefined;
      const result = await spotlightEngine.getNextTask(userId, forceBucket, workType);
      const { task, session, allDone } = result;
      const noTasksForWorkType = (result as any).noTasksForWorkType || false;
      const emptyReason = (result as any).emptyReason || null;
      const emptyDetail = (result as any).emptyDetail || null;
      
      // PERFORMANCE: Parallelize secondary data fetching
      const gamification = spotlightEngine.getGamificationState(session as any);
      
      const [hintsResult, microCard, coachTip] = await Promise.all([
        // Hints analysis
        task && task.customer ? analyzeForHints(
          task.customer.id,
          {
            company: task.customer.company,
            website: task.customer.website,
            email: task.customer.email,
            phone: task.customer.phone,
            pricingTier: task.customer.pricingTier,
            salesRepId: task.customer.salesRepId,
            updatedAt: task.customer.updatedAt || null,
            isHotProspect: task.customer.isHotProspect || null,
          },
          task.taskSubtype
        ) : Promise.resolve({ hints: [] }),
        // Micro coaching card
        (session as any).tasksSinceMicroCard >= 3 
          ? spotlightEngine.getMicroCoachingCard(userId) 
          : Promise.resolve(null),
        // Coach tip
        task ? spotlightEngine.getCoachTip(task.taskSubtype) : Promise.resolve(null)
      ]);

      const hints = (hintsResult as any).hints ?? hintsResult;
      const mergedCustomerId = (hintsResult as any).mergedCustomerId;

      // If an auto-merge just happened, redirect the task card to the surviving customer
      if (task && mergedCustomerId) {
        console.log(`[Spotlight] Task customer ${task.customerId} was merged → redirecting to ${mergedCustomerId}`);
        task.customerId = mergedCustomerId;
        if (task.customer) task.customer.id = mergedCustomerId;
      }

      res.json({
        task,
        session: {
          totalCompleted: session.totalCompleted,
          totalTarget: session.totalTarget,
          buckets: session.buckets,
          dayComplete: session.dayComplete,
          currentEnergy: (session as any).currentEnergy || 100,
          warmupShown: (session as any).warmupShown || false,
        },
        gamification,
        microCard,
        coachTip,
        allDone,
        hints,
        noTasksForWorkType,
        emptyReason,
        emptyDetail,
      });
    } catch (error: any) {
      console.error("[Spotlight] Error getting current task:", error);
      
      // Generate a request ID for debugging
      const requestId = `SP-${Date.now().toString(36)}`;
      
      res.status(500).json({ 
        error: "Spotlight engine error",
        requestId,
        details: error.message || "Unknown error occurred",
        retryable: true
      });
    }
  });
  app.post("/api/spotlight/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { taskId, outcomeId, field, value, notes, taskSubtype, customFollowUpDays } = req.body;
      if (!taskId || !outcomeId) {
        return res.status(400).json({ error: "taskId and outcomeId are required" });
      }

      spotlightEngine.invalidateExcludeCache(userId);
      spotlightEngine.invalidatePrefetchCache(userId);

      const result = await spotlightEngine.completeTask(userId, taskId, outcomeId, field, value, notes, customFollowUpDays);
      
      const session = spotlightEngine.getSessionStats(userId);
      if (taskSubtype) {
        spotlightEngine.updateGamificationOnComplete(session as any, taskSubtype);
      }
      
      const gamification = spotlightEngine.getGamificationState(session as any);
      
      const nextTaskData = await spotlightEngine.getNextTaskForPiggyback(userId);
      
      res.json({ ...result, gamification, nextTaskData });
    } catch (error) {
      console.error("[Spotlight] Error completing task:", error);
      res.status(500).json({ error: "Failed to complete task" });
    }
  });
  app.post("/api/spotlight/skip", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { taskId, reason } = req.body;
      if (!taskId) {
        return res.status(400).json({ error: "taskId is required" });
      }

      spotlightEngine.invalidateExcludeCache(userId);
      spotlightEngine.invalidatePrefetchCache(userId);

      await spotlightEngine.skipTask(userId, taskId, reason || 'not_now');
      
      const nextTaskData = await spotlightEngine.getNextTaskForPiggyback(userId);
      
      res.json({ success: true, nextTaskData });
    } catch (error) {
      console.error("[Spotlight] Error skipping task:", error);
      res.status(500).json({ error: "Failed to skip task" });
    }
  });
  app.post("/api/spotlight/remind-today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { taskId } = req.body;
      if (!taskId) {
        return res.status(400).json({ error: "taskId is required" });
      }

      // Mark as "remind_today" - this moves it to end of queue and tracks for EOD report
      await spotlightEngine.remindToday(userId, taskId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("[Spotlight] Error setting remind today:", error);
      res.status(500).json({ error: "Failed to set reminder" });
    }
  });
  app.get("/api/spotlight/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const session = spotlightEngine.getSessionStats(userId);
      res.json(session);
    } catch (error) {
      console.error("[Spotlight] Error getting session:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });
  app.get("/api/spotlight/remind-today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const tasks = await spotlightEngine.getRemindTodayTasks(userId);
      
      // Enrich with customer/lead names for display
      const enrichedTasks = await Promise.all(tasks.map(async (t) => {
        let displayName = 'Unknown';
        let isLead = t.customerId.startsWith('lead-');
        
        if (isLead) {
          const leadId = t.customerId.replace('lead-', '');
          const lead = await storage.getLeadById(leadId);
          displayName = lead?.companyName || lead?.contactName || 'Unknown Lead';
        } else {
          const customer = await storage.getCustomer(t.customerId);
          displayName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
        }
        
        return {
          ...t,
          displayName,
          isLead,
        };
      }));
      
      res.json(enrichedTasks);
    } catch (error) {
      console.error("[Spotlight] Error getting remind today tasks:", error);
      res.status(500).json({ error: "Failed to get remind today tasks" });
    }
  });
  app.post("/api/spotlight/pause", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      spotlightEngine.pauseSession(userId);
      res.json({ success: true, message: "Session paused until tomorrow" });
    } catch (error) {
      console.error("[Spotlight] Error pausing session:", error);
      res.status(500).json({ error: "Failed to pause session" });
    }
  });
  app.post("/api/spotlight/resume", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      spotlightEngine.resumeSession(userId);
      res.json({ success: true, message: "Session resumed" });
    } catch (error) {
      console.error("[Spotlight] Error resuming session:", error);
      res.status(500).json({ error: "Failed to resume session" });
    }
  });
  app.post("/api/spotlight/continue", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      spotlightEngine.continueAfterComplete(userId);
      res.json({ success: true, message: "You can continue working - keep up the momentum!" });
    } catch (error) {
      console.error("[Spotlight] Error continuing session:", error);
      res.status(500).json({ error: "Failed to continue session" });
    }
  });
  app.get("/api/spotlight/efficiency", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const efficiency = await spotlightEngine.calculateEfficiencyScore(userId);
      res.json(efficiency);
    } catch (error) {
      console.error("[Spotlight] Error calculating efficiency:", error);
      res.status(500).json({ error: "Failed to calculate efficiency" });
    }
  });
  app.get("/api/spotlight/skipped-tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const session = spotlightEngine.getSessionStats(userId);
      const skippedCustomerIds = session.skippedCustomerIds || [];

      if (skippedCustomerIds.length === 0) {
        return res.json([]);
      }

      const skippedCustomers = await db
        .select({
          id: customers.id,
          company: customers.company,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
        })
        .from(customers)
        .where(sql`${customers.id} = ANY(${skippedCustomerIds})`);

      res.json(skippedCustomers.map(c => ({
        id: `spotlight_skipped_${c.id}`,
        source: 'spotlight',
        customerId: c.id,
        customerName: c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        customerEmail: c.email,
        customerPhone: c.phone,
        title: 'Skipped SPOTLIGHT Task',
        status: 'skipped',
        skippedAt: new Date().toISOString(),
      })));
    } catch (error) {
      console.error("[Spotlight] Error getting skipped tasks:", error);
      res.status(500).json({ error: "Failed to get skipped tasks" });
    }
  });
  app.get("/api/spotlight/warmup", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const warmup = await spotlightEngine.getWarmupData(userId);
      res.json(warmup);
    } catch (error) {
      console.error("[Spotlight] Error getting warmup data:", error);
      res.status(500).json({ error: "Failed to get warmup data" });
    }
  });
  app.get("/api/spotlight/recap", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const recap = await spotlightEngine.getRecapData(userId);
      res.json(recap);
    } catch (error) {
      console.error("[Spotlight] Error getting recap data:", error);
      res.status(500).json({ error: "Failed to get recap data" });
    }
  });
  app.get("/api/spotlight/micro-card", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const card = await spotlightEngine.getMicroCoachingCard(userId);
      res.json({ card });
    } catch (error) {
      console.error("[Spotlight] Error getting micro-coaching card:", error);
      res.status(500).json({ error: "Failed to get micro-coaching card" });
    }
  });
  app.get("/api/spotlight/coach-tip", isAuthenticated, async (req: any, res) => {
    try {
      const { taskSubtype, machineType } = req.query;
      if (!taskSubtype) {
        return res.json({ tip: null });
      }
      const tip = await spotlightEngine.getCoachTip(taskSubtype as string, machineType as string);
      res.json({ tip });
    } catch (error) {
      console.error("[Spotlight] Error getting coach tip:", error);
      res.status(500).json({ error: "Failed to get coach tip" });
    }
  });
  app.post("/api/spotlight/use-power-up", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const success = spotlightEngine.usePowerUp(userId);
      if (success) {
        res.json({ success: true, message: "Power-up used! Free skip available." });
      } else {
        res.status(400).json({ success: false, error: "No power-ups available" });
      }
    } catch (error) {
      console.error("[Spotlight] Error using power-up:", error);
      res.status(500).json({ error: "Failed to use power-up" });
    }
  });
  app.get("/api/spotlight/gamification", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const session = spotlightEngine.getSessionStats(userId);
      const gamification = spotlightEngine.getGamificationState(session as any);
      res.json(gamification);
    } catch (error) {
      console.error("[Spotlight] Error getting gamification state:", error);
      res.status(500).json({ error: "Failed to get gamification state" });
    }
  });
  app.post("/api/spotlight/energy-check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { energyLevel } = req.body;
      if (typeof energyLevel !== 'number' || energyLevel < 0 || energyLevel > 100) {
        return res.status(400).json({ error: "energyLevel must be a number between 0 and 100" });
      }
      
      const session = spotlightEngine.getSessionStats(userId) as any;
      if (session) {
        session.currentEnergy = energyLevel;
        session.energyCheckShown = true;
      }
      res.json({ success: true, newEnergy: energyLevel });
    } catch (error) {
      console.error("[Spotlight] Error updating energy:", error);
      res.status(500).json({ error: "Failed to update energy" });
    }
  });
  app.post("/api/spotlight/inbox-search-contact", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { email, name } = req.body as { email?: string; name?: string };
      if (!email && !name) return res.status(400).json({ error: "email or name required" });

      // Build Gmail search query
      const queryParts: string[] = [];
      if (email) queryParts.push(`from:${email}`, `to:${email}`);
      if (name && !email) queryParts.push(`"${name}"`);
      const q = queryParts.join(' OR ');

      // Search Gmail
      const { default: gmailGoogle } = await import('googleapis').then(m => ({ default: m.google }));
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const xReplitToken = process.env.REPL_IDENTITY ? 'repl ' + process.env.REPL_IDENTITY
        : process.env.WEB_REPL_RENEWAL ? 'depl ' + process.env.WEB_REPL_RENEWAL : null;

      if (!xReplitToken || !hostname) {
        return res.json({ found: false, reason: 'Gmail not configured' });
      }

      const connData = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`, {
        headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken }
      }).then(r => r.json()).then((d: any) => d.items?.[0]);

      const accessToken = connData?.settings?.access_token || connData?.settings?.oauth?.credentials?.access_token;
      if (!accessToken) return res.json({ found: false, reason: 'Gmail not connected' });

      const oauth2 = new gmailGoogle.auth.OAuth2();
      oauth2.setCredentials({ access_token: accessToken });
      const gmail = gmailGoogle.gmail({ version: 'v1', auth: oauth2 });

      const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 8 });
      const messageIds = listRes.data.messages || [];

      if (messageIds.length === 0) {
        return res.json({ found: false, reason: 'No emails found for this contact' });
      }

      // Fetch full bodies of up to 5 messages
      const bodies: string[] = [];
      const sources: { subject: string; from: string; date: string }[] = [];

      for (const msg of messageIds.slice(0, 5)) {
        try {
          const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' });
          const headers = fullMsg.data.payload?.headers || [];
          const getH = (n: string) => headers.find((h: any) => h.name === n)?.value || '';

          let body = '';
          const payload = fullMsg.data.payload;
          if (payload?.body?.data) {
            body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
          } else if (payload?.parts) {
            const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
            const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
            const part = textPart || htmlPart;
            if (part?.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
          }

          if (body) {
            // Strip HTML tags and truncate
            const clean = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
            bodies.push(clean);
            sources.push({ subject: getH('Subject'), from: getH('From'), date: getH('Date') });
          }
        } catch { /* skip failed messages */ }
      }

      if (bodies.length === 0) {
        return res.json({ found: false, reason: 'Emails found but body could not be read' });
      }

      // Use AI to extract contact data from email content
      const openaiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      if (!openaiKey) return res.json({ found: false, reason: 'AI not configured' });

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: openaiKey });

      const contactHint = name ? `Contact name: ${name}. Email: ${email || 'unknown'}.` : `Contact email: ${email}.`;
      const prompt = `You are extracting contact information from email threads.
${contactHint}
Below are excerpts from email conversations with this contact. Extract any of the following if present:
- phone number (mobile or office)
- physical address (street, city, state, zip)
- company name (if different from email domain)
- job title / role

Email excerpts:
${bodies.map((b, i) => `--- Email ${i + 1} ---\n${b}`).join('\n\n')}

Return ONLY a JSON object with these keys (use null for not found):
{ "phone": string|null, "address": string|null, "company": string|null, "jobTitle": string|null, "confidence": "high"|"medium"|"low", "summary": string }`;

      const aiRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 400,
        temperature: 0.1
      });

      let extracted: { phone: string | null; address: string | null; company: string | null; jobTitle: string | null; confidence: string; summary: string } = {
        phone: null, address: null, company: null, jobTitle: null, confidence: 'low', summary: 'No data extracted'
      };
      try {
        extracted = JSON.parse(aiRes.choices[0]?.message?.content || '{}');
      } catch { /* keep defaults */ }

      const hasData = !!(extracted.phone || extracted.address || extracted.company || extracted.jobTitle);
      return res.json({
        found: hasData,
        phone: extracted.phone,
        address: extracted.address,
        company: extracted.company,
        jobTitle: extracted.jobTitle,
        confidence: extracted.confidence,
        summary: extracted.summary,
        emailsSearched: sources.length,
        sources
      });
    } catch (error: any) {
      console.error('[InboxSearch] Error:', error);
      res.json({ found: false, reason: error.message || 'Search failed' });
    }
  });
  app.get("/api/tasks/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const userEmail = (req.user?.email || '').toLowerCase();
      const ANEESH_EMAIL = 'aneesh@4sgraphics.com';
      const isAneesh = userEmail === ANEESH_EMAIL;
      const rawEmail = req.user?.email || '';

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Base visibility condition: Aneesh sees all; others see only their assigned tasks
      const visibilityCond = isAneesh ? [] : [eq(followUpTasks.assignedTo, rawEmail)];

      const [todayResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(followUpTasks)
        .where(and(gte(followUpTasks.dueDate, today), lt(followUpTasks.dueDate, tomorrow), eq(followUpTasks.status, 'pending'), ...visibilityCond));

      const [overdueResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(followUpTasks)
        .where(and(lt(followUpTasks.dueDate, today), eq(followUpTasks.status, 'pending'), ...visibilityCond));

      const [emailResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(followUpTasks)
        .where(and(eq(followUpTasks.status, 'pending'), ilike(followUpTasks.taskType, '%email%'), ...visibilityCond));

      // Emails Not Replied count: emailSends rows + Gmail-synced leadActivities + customerActivityEvents
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const emailKeywordSql = sql`(${emailSends.subject} ILIKE '%Price per Sheet%' OR ${emailSends.subject} ILIKE '%Pricing%' OR ${emailSends.subject} ILIKE '%Price List%' OR ${emailSends.subject} ILIKE '%Press Test%' OR ${emailSends.subject} ILIKE '%Press Kit%' OR ${emailSends.subject} ILIKE '%Sample%')`;
      const emailSendCountConds: any[] = [lt(emailSends.sentAt, fiveDaysAgo), isNull(emailSends.replyReceivedAt), emailKeywordSql];
      if (!isAneesh) emailSendCountConds.push(eq(emailSends.sentBy, rawEmail));
      const [emailsNotRepliedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(emailSends)
        .where(and(...emailSendCountConds));

      const [gmailLeadActivityCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leadActivities)
        .where(and(
          eq(leadActivities.activityType, 'email_sent'),
          lt(leadActivities.createdAt, fiveDaysAgo),
          sql`(${leadActivities.summary} ILIKE '%Price per Sheet%' OR ${leadActivities.summary} ILIKE '%Pricing%' OR ${leadActivities.summary} ILIKE '%Price List%' OR ${leadActivities.summary} ILIKE '%Press Test%' OR ${leadActivities.summary} ILIKE '%Press Kit%' OR ${leadActivities.summary} ILIKE '%Sample%')`,
        ));

      const [gmailCustomerActivityCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(customerActivityEvents)
        .where(and(
          eq(customerActivityEvents.eventType, 'email_sent'),
          lt(customerActivityEvents.eventDate, fiveDaysAgo),
          sql`(${customerActivityEvents.title} ILIKE '%Price per Sheet%' OR ${customerActivityEvents.title} ILIKE '%Pricing%' OR ${customerActivityEvents.title} ILIKE '%Price List%' OR ${customerActivityEvents.title} ILIKE '%Press Test%' OR ${customerActivityEvents.title} ILIKE '%Press Kit%' OR ${customerActivityEvents.title} ILIKE '%Sample%')`,
        ));

      const emailsNotRepliedCount = (Number(emailsNotRepliedResult.count) || 0)
        + (Number(gmailLeadActivityCount.count) || 0)
        + (Number(gmailCustomerActivityCount.count) || 0);

      // Seq follow-up count: completed assignments 3+ days ago that don't already have a pending follow-up task
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const assignmentsWithTasks = db
        .select({ sourceId: followUpTasks.sourceId })
        .from(followUpTasks)
        .where(and(
          eq(followUpTasks.sourceType, 'drip_sequence'),
          eq(followUpTasks.status, 'pending'),
        ));
      const [seqResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(dripCampaignAssignments)
        .where(and(
          eq(dripCampaignAssignments.status, 'completed'),
          sql`${dripCampaignAssignments.completedAt} < ${threeDaysAgo}`,
          isNotNull(dripCampaignAssignments.completedAt),
          sql`${dripCampaignAssignments.id}::text NOT IN (${assignmentsWithTasks})`,
        ));

      // Press Test Sent count: local labelPrints + leads with pressTestKitSentAt
      const [pressTestPrintsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(labelPrints)
        .where(eq(labelPrints.labelType, 'press_test_kit'));

      const [pressTestLeadsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(isNotNull(leads.pressTestKitSentAt));

      const session = spotlightEngine.getSessionStats(userId);
      const spotlightSkipped = session.skippedCustomerIds?.length || 0;
      const spotlightRemaining = (session.totalTarget || 30) - (session.totalCompleted || 0);

      const pressTestSent = (Number(pressTestPrintsCount.count) || 0) + (Number(pressTestLeadsCount.count) || 0);

      const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const sixDaysAgo = new Date(today); sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
      const thirteenDaysAgo = new Date(today); thirteenDaysAgo.setDate(thirteenDaysAgo.getDate() - 13);

      const [warmResult] = await db.select({ count: sql<number>`count(*)` }).from(followUpTasks)
        .where(and(lt(followUpTasks.dueDate, today), gte(followUpTasks.dueDate, twoDaysAgo), eq(followUpTasks.status, 'pending'), ...visibilityCond));

      const [hotResult] = await db.select({ count: sql<number>`count(*)` }).from(followUpTasks)
        .where(and(lt(followUpTasks.dueDate, twoDaysAgo), gte(followUpTasks.dueDate, sixDaysAgo), eq(followUpTasks.status, 'pending'), ...visibilityCond));

      const [criticalResult] = await db.select({ count: sql<number>`count(*)` }).from(followUpTasks)
        .where(and(lt(followUpTasks.dueDate, sixDaysAgo), gte(followUpTasks.dueDate, thirteenDaysAgo), eq(followUpTasks.status, 'pending'), ...visibilityCond));

      const [escalatedResult] = await db.select({ count: sql<number>`count(*)` }).from(followUpTasks)
        .where(and(lt(followUpTasks.dueDate, thirteenDaysAgo), eq(followUpTasks.status, 'pending'), ...visibilityCond));

      let repHeat: Array<{ name: string; critical: number; escalated: number }> = [];
      if (isAneesh) {
        const repHeatRows = await db
          .select({
            name: followUpTasks.assignedToName,
            count: sql<number>`count(*)`,
            minDue: sql<Date>`min(${followUpTasks.dueDate})`,
          })
          .from(followUpTasks)
          .where(and(lt(followUpTasks.dueDate, sixDaysAgo), eq(followUpTasks.status, 'pending')))
          .groupBy(followUpTasks.assignedToName);

        repHeat = repHeatRows
          .filter(r => r.name)
          .map(r => {
            const minDue = new Date(r.minDue);
            const daysOld = Math.floor((today.getTime() - minDue.getTime()) / (1000 * 60 * 60 * 24));
            return {
              name: r.name!,
              critical: daysOld <= 13 ? Number(r.count) : 0,
              escalated: daysOld > 13 ? Number(r.count) : 0,
            };
          });
      }

      // Per-rep task counts for admin sidebar — only computed for Aneesh
      const thisYearStart = new Date('2026-01-01T00:00:00.000Z');
      let repTaskCounts: Array<{ email: string; name: string; pending: number; overdue: number }> = [];
      if (isAneesh) {
        const REP_EMAILS = [
          { email: 'aneesh@4sgraphics.com',    name: 'Aneesh' },
          { email: 'patricio@4sgraphics.com',  name: 'Patricio' },
          { email: 'santiago@4sgraphics.com',  name: 'Santiago' },
        ];
        repTaskCounts = await Promise.all(
          REP_EMAILS.map(async (rep) => {
            const [pendingRow] = await db
              .select({ count: sql<number>`count(*)` })
              .from(followUpTasks)
              .where(and(
                eq(followUpTasks.status, 'pending'),
                gte(followUpTasks.createdAt, thisYearStart),
                sql`(${followUpTasks.assignedTo} = ${rep.email} OR ${followUpTasks.assignedTo} IN (
                  SELECT id FROM users WHERE email = ${rep.email}
                ))`
              ));
            const [overdueRow] = await db
              .select({ count: sql<number>`count(*)` })
              .from(followUpTasks)
              .where(and(
                eq(followUpTasks.status, 'pending'),
                gte(followUpTasks.createdAt, thisYearStart),
                lt(followUpTasks.dueDate, today),
                sql`(${followUpTasks.assignedTo} = ${rep.email} OR ${followUpTasks.assignedTo} IN (
                  SELECT id FROM users WHERE email = ${rep.email}
                ))`
              ));
            return {
              email: rep.email,
              name: rep.name,
              pending: Number(pendingRow.count) || 0,
              overdue: Number(overdueRow.count) || 0,
            };
          })
        );
      }

      res.json({
        today: Number(todayResult.count) || 0,
        overdue: (Number(overdueResult.count) || 0) + spotlightSkipped,
        email: Number(emailResult.count) || 0,
        emailsNotReplied: emailsNotRepliedCount,
        seqFollowUp: Number(seqResult.count) || 0,
        pressTestSent,
        spotlightSkipped,
        spotlightRemaining,
        spotlightCompleted: session.totalCompleted || 0,
        spotlightTarget: session.totalTarget || 30,
        pending: (Number(todayResult.count) || 0) + (Number(overdueResult.count) || 0) + spotlightSkipped,
        heatBreakdown: {
          warm: Number(warmResult.count) || 0,
          hot: Number(hotResult.count) || 0,
          critical: Number(criticalResult.count) || 0,
          escalated: Number(escalatedResult.count) || 0,
        },
        repHeat,
        repTaskCounts,
      });
    } catch (error) {
      console.error("[Tasks] Error getting summary:", error);
      res.status(500).json({ error: "Failed to get task summary" });
    }
  });
  app.get("/api/tasks/list", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const userEmail = (req.user?.email || '').toLowerCase();
      const ANEESH_EMAIL = 'aneesh@4sgraphics.com';
      const SHIVA_EMAILS = ['shiva@4sgraphics.com', 'shiva_sistla@yahoo.com'];
      const isAneesh = userEmail === ANEESH_EMAIL;

      const filter = (req.query.filter as string) || 'pending';
      const sort = (req.query.sort as string) || 'due_asc';
      const typeFilter = req.query.type as string;
      const assigneeFilter = req.query.assignee as string;
      const repNameFilter = req.query.repName as string; // e.g. "patricio@4sgraphics.com"
      const priorityFilter = req.query.priority as string;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

      const thisYearStart = new Date('2026-01-01T00:00:00.000Z');
      const baseConditions: any[] = [
        eq(followUpTasks.status, 'pending'),
        gte(followUpTasks.createdAt, thisYearStart),
      ];

      const rawEmail = req.user?.email || '';
      // Visibility: Aneesh sees all; others see only their own tasks
      if (!isAneesh) {
        baseConditions.push(
          sql`(${followUpTasks.assignedTo} = ${rawEmail} OR ${followUpTasks.assignedTo} = ${userId})`
        );
      }

      if (filter === 'today') {
        baseConditions.push(gte(followUpTasks.dueDate, today), lt(followUpTasks.dueDate, tomorrow));
      } else if (filter === 'overdue') {
        baseConditions.push(lt(followUpTasks.dueDate, today));
      } else if (filter === 'this_week') {
        baseConditions.push(gte(followUpTasks.dueDate, today), lt(followUpTasks.dueDate, endOfWeek));
      } else if (filter === 'email') {
        // "Email Tasks" tab — only show tasks with email-related taskType
        baseConditions.push(ilike(followUpTasks.taskType, '%email%'));
      }

      if (typeFilter && typeFilter !== 'all') {
        baseConditions.push(ilike(followUpTasks.taskType, `%${typeFilter}%`));
      }
      if (assigneeFilter === 'me') {
        // Match by both possible formats (email or userId)
        baseConditions.push(
          sql`(${followUpTasks.assignedTo} = ${rawEmail} OR ${followUpTasks.assignedTo} = ${userId})`
        );
      } else if (repNameFilter && repNameFilter !== 'all' && isAneesh) {
        // Admin filtering by specific rep — match by email OR by UUID (same logic as summary counts)
        baseConditions.push(
          sql`(${followUpTasks.assignedTo} = ${repNameFilter} OR ${followUpTasks.assignedTo} IN (
            SELECT id FROM users WHERE email = ${repNameFilter}
          ))`
        );
      }
      if (priorityFilter && priorityFilter !== 'all') {
        baseConditions.push(eq(followUpTasks.priority, priorityFilter));
      }

      let orderBy: any[];
      if (sort === 'due_desc') {
        orderBy = [desc(followUpTasks.dueDate)];
      } else if (sort === 'created') {
        orderBy = [desc(followUpTasks.createdAt)];
      } else if (sort === 'priority') {
        orderBy = [desc(followUpTasks.priority), asc(followUpTasks.dueDate)];
      } else {
        orderBy = [asc(followUpTasks.dueDate)];
      }

      const rawTasks = await db
        .select({
          id: followUpTasks.id,
          customerId: followUpTasks.customerId,
          leadId: followUpTasks.leadId,
          taskType: followUpTasks.taskType,
          title: followUpTasks.title,
          description: followUpTasks.description,
          dueDate: followUpTasks.dueDate,
          priority: followUpTasks.priority,
          status: followUpTasks.status,
          assignedTo: followUpTasks.assignedTo,
          assignedToName: followUpTasks.assignedToName,
          isAutoGenerated: followUpTasks.isAutoGenerated,
          createdAt: followUpTasks.createdAt,
          sourceType: followUpTasks.sourceType,
          sourceId: followUpTasks.sourceId,
        })
        .from(followUpTasks)
        .where(and(...baseConditions))
        .orderBy(...orderBy);

      // Batch-enrich: collect unique IDs then fetch in 2-3 queries instead of N
      const customerIdSet = new Set(rawTasks.filter(t => t.customerId).map(t => t.customerId!));
      const leadIdSet = new Set(rawTasks.filter(t => t.leadId).map(t => t.leadId!));
      const customerIdList = [...customerIdSet];
      const leadIdList = [...leadIdSet];

      const [customerRows, leadRows] = await Promise.all([
        customerIdList.length > 0
          ? db.select({ id: customers.id, company: customers.company, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
              .from(customers).where(inArray(customers.id, customerIdList))
          : [],
        leadIdList.length > 0
          ? db.select({ id: leads.id, name: leads.name, company: leads.company, email: leads.email })
              .from(leads).where(inArray(leads.id, leadIdList))
          : [],
      ]);

      const customerMap = new Map(customerRows.map(c => [c.id, c]));
      const leadMap = new Map(leadRows.map(l => [l.id, l]));

      // For email_engagement tasks where the customer has no email, use the tracking token's recipientEmail
      const unknownEmailCustomerIds = customerIdList.filter(id => {
        const c = customerMap.get(id);
        return !c?.email;
      });
      let trackingEmailMap = new Map<string, string>();
      if (unknownEmailCustomerIds.length > 0) {
        const tokenRows = await db
          .select({ customerId: emailTrackingTokens.customerId, recipientEmail: emailTrackingTokens.recipientEmail })
          .from(emailTrackingTokens)
          .where(inArray(emailTrackingTokens.customerId, unknownEmailCustomerIds))
          .orderBy(desc(emailTrackingTokens.createdAt));
        // Keep the most recent recipientEmail per customer (first seen wins since ordered desc)
        for (const row of tokenRows) {
          if (row.customerId && !trackingEmailMap.has(row.customerId)) {
            trackingEmailMap.set(row.customerId, row.recipientEmail);
          }
        }
      }

      const emailEventSourceIds = rawTasks
        .filter(t => t.sourceType === 'email_event' && t.sourceId)
        .map(t => parseInt(t.sourceId!, 10))
        .filter(id => !isNaN(id));

      let emailSubjectMap = new Map<number, string>();
      let senderEmailMap = new Map<number, string>();
      if (emailEventSourceIds.length > 0) {
        const eventRows = await db
          .select({ id: emailSalesEvents.id, gmailMessageId: emailSalesEvents.gmailMessageId })
          .from(emailSalesEvents)
          .where(inArray(emailSalesEvents.id, emailEventSourceIds));
        const gmailMsgIds = eventRows.filter(e => e.gmailMessageId).map(e => e.gmailMessageId!);
        if (gmailMsgIds.length > 0) {
          const msgRows = await db
            .select({ id: gmailMessages.id, subject: gmailMessages.subject, fromEmail: gmailMessages.fromEmail })
            .from(gmailMessages)
            .where(inArray(gmailMessages.id, gmailMsgIds));
          const msgMap = new Map(msgRows.map(m => [m.id, m]));
          for (const ev of eventRows) {
            if (ev.gmailMessageId) {
              const msg = msgMap.get(ev.gmailMessageId);
              if (msg?.subject) emailSubjectMap.set(ev.id, msg.subject);
              if (msg?.fromEmail) senderEmailMap.set(ev.id, msg.fromEmail);
            }
          }
        }
      }

      const tasks: any[] = rawTasks.map(task => {
        let recordName = 'Unknown';
        let recordType: 'customer' | 'lead' | null = null;
        let recordId: string | number | null = null;
        let contactEmail: string | null = null;
        let contactDisplayName: string | null = null;

        if (task.customerId) {
          const c = customerMap.get(task.customerId);
          recordName = c?.company || `${c?.firstName || ''} ${c?.lastName || ''}`.trim() || 'Unknown';
          recordType = 'customer';
          recordId = task.customerId;
          contactEmail = c?.email || trackingEmailMap.get(task.customerId) || null;
          const cPersonName = `${c?.firstName || ''} ${c?.lastName || ''}`.trim();
          contactDisplayName = cPersonName && c?.company
            ? `${cPersonName} (${c.company})`
            : cPersonName || c?.company || null;
        } else if (task.leadId) {
          const l = leadMap.get(task.leadId);
          recordName = l?.name || l?.company || 'Unknown';
          recordType = 'lead';
          recordId = task.leadId;
          contactEmail = l?.email || null;
          contactDisplayName = l?.name && l?.company
            ? `${l.name} (${l.company})`
            : l?.name || l?.company || null;
        }

        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < today;
        const sourceEventId = (task.sourceType === 'email_event' && task.sourceId) ? parseInt(task.sourceId, 10) : NaN;
        const emailSubject = !isNaN(sourceEventId) ? emailSubjectMap.get(sourceEventId) || null : null;
        const senderEmail = !isNaN(sourceEventId) ? senderEmailMap.get(sourceEventId) || null : null;
        const daysOverdue = isOverdue ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        const urgencyTier = daysOverdue === 0 ? 0 : daysOverdue <= 2 ? 1 : daysOverdue <= 6 ? 2 : daysOverdue <= 13 ? 3 : 4;
        return { ...task, recordName, recordType, recordId, customerName: recordName, contactEmail, emailSubject, senderEmail, contactDisplayName, source: 'calendar', category: isOverdue ? 'overdue' : 'today', daysOverdue, urgencyTier };
      });

      if ((filter === 'overdue' || filter === 'pending' || filter === 'all') && !typeFilter && !priorityFilter) {
        const session = spotlightEngine.getSessionStats(userId);
        const skippedCustomerIds = session.skippedCustomerIds || [];
        if (skippedCustomerIds.length > 0) {
          const skippedCustomers = await db
            .select({ id: customers.id, company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
            .from(customers)
            .where(sql`${customers.id} = ANY(${skippedCustomerIds})`);

          for (const c of skippedCustomers) {
            tasks.push({
              id: `spotlight_${c.id}`,
              customerId: c.id,
              leadId: null,
              recordType: 'customer',
              recordId: c.id,
              source: 'spotlight',
              category: 'overdue',
              title: 'Skipped SPOTLIGHT Task',
              taskType: 'spotlight',
              status: 'skipped',
              recordName: c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
              customerName: c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
              skippedAt: new Date().toISOString(),
            });
          }
        }
      }

      res.json(tasks);
    } catch (error) {
      console.error("[Tasks] Error getting list:", error);
      res.status(500).json({ error: "Failed to get task list" });
    }
  });
  app.post("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const { title, description, taskType, priority, dueDate, leadId: leadIdRaw, customerId: customerIdRaw, assignedTo, assignedToName } = req.body;
      if (!title || !taskType || !dueDate) {
        return res.status(400).json({ error: "title, taskType, and dueDate are required" });
      }
      if (!leadIdRaw && !customerIdRaw) {
        return res.status(400).json({ error: "Either leadId or customerId is required" });
      }
      const task = await storage.createFollowUpTask({
        title,
        description: description || null,
        taskType,
        priority: priority || 'normal',
        status: 'pending',
        dueDate: new Date(dueDate),
        leadId: leadIdRaw ? Number(leadIdRaw) : null,
        customerId: customerIdRaw || null,
        assignedTo: assignedTo || req.user?.id,
        assignedToName: assignedToName || (req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user?.email),
        isAutoGenerated: false,
      });
      res.status(201).json(task);
    } catch (error) {
      console.error("[Tasks] Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });
  app.delete("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid task ID" });
      const [task] = await db.select({ assignedTo: followUpTasks.assignedTo }).from(followUpTasks).where(eq(followUpTasks.id, id)).limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });
      const isAdmin = req.user?.role === 'admin';
      const isAssignee = task.assignedTo && task.assignedTo === String(req.user?.id);
      const isUnassigned = !task.assignedTo;
      if (!isAdmin && !isAssignee && !isUnassigned) {
        return res.status(403).json({ error: "Not authorized to cancel this task" });
      }
      await db.update(followUpTasks).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(followUpTasks.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("[Tasks] Error cancelling task:", error);
      res.status(500).json({ error: "Failed to cancel task" });
    }
  });
  app.patch("/api/tasks/:id/critical", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid task ID" });
      const { critical } = req.body as { critical: boolean };
      const newPriority = critical ? 'critical' : 'high';
      await db.update(followUpTasks).set({ priority: newPriority, updatedAt: new Date() }).where(eq(followUpTasks.id, id));
      res.json({ success: true, priority: newPriority });
    } catch (error) {
      console.error("[Tasks] Error marking task critical:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });
  app.post("/api/tasks/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid task ID" });
      const { notes } = req.body;
      const [taskRow] = await db.select({ assignedTo: followUpTasks.assignedTo, leadId: followUpTasks.leadId, customerId: followUpTasks.customerId }).from(followUpTasks).where(eq(followUpTasks.id, id)).limit(1);
      if (!taskRow) return res.status(404).json({ error: "Task not found" });
      // Use canonical auth pattern — ID lives in claims.sub OR user.id; email in claims.email OR user.email
      const userId = (req.user as any)?.claims?.sub || req.user?.id;
      const userEmail = ((req.user as any)?.claims?.email || req.user?.email || '').toLowerCase();
      const userRole = (req.user as any)?.claims?.role || req.user?.role;
      const ANEESH_EMAIL = 'aneesh@4sgraphics.com';
      const isAdmin = userRole === 'admin' || userEmail === ANEESH_EMAIL;
      const isAssignee = taskRow.assignedTo && (
        taskRow.assignedTo === userEmail ||
        taskRow.assignedTo === String(userId)
      );
      const isUnassigned = !taskRow.assignedTo;
      if (!isAdmin && !isAssignee && !isUnassigned) {
        return res.status(403).json({ error: "Not authorized to complete this task" });
      }
      const task = await storage.completeFollowUpTask(id, userId, notes);
      if (!task) return res.status(404).json({ error: "Task not found" });

      // Sync kanban: completing a task means the rep acted on this lead/customer —
      // remove them from 'no_response' and refresh lastContactAt so they drop off the Kanban.
      if (taskRow.leadId) {
        await db.update(leads)
          .set({ lastContactAt: new Date(), salesKanbanStage: sql`CASE WHEN sales_kanban_stage = 'no_response' THEN NULL ELSE sales_kanban_stage END` })
          .where(eq(leads.id, taskRow.leadId));
      }
      if (taskRow.customerId) {
        await db.update(customers)
          .set({ salesKanbanStage: sql`CASE WHEN sales_kanban_stage = 'no_response' THEN NULL ELSE sales_kanban_stage END` })
          .where(eq(customers.id, taskRow.customerId));
      }

      res.json(task);
    } catch (error) {
      console.error("[Tasks] Error completing task:", error);
      res.status(500).json({ error: "Failed to complete task" });
    }
  });
  app.get("/api/tasks/emails-not-replied", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = (req.user?.email || '').toLowerCase();
      const ANEESH_EMAIL = 'aneesh@4sgraphics.com';
      const SHIVA_EMAILS = ['shiva@4sgraphics.com', 'shiva_sistla@yahoo.com'];
      const isAneesh = userEmail === ANEESH_EMAIL;

      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const keywordClause = sql`(${emailSends.subject} ILIKE '%Price per Sheet%' OR ${emailSends.subject} ILIKE '%Pricing%' OR ${emailSends.subject} ILIKE '%Price List%' OR ${emailSends.subject} ILIKE '%Press Test%' OR ${emailSends.subject} ILIKE '%Press Kit%' OR ${emailSends.subject} ILIKE '%Sample%')`;

      const sentByConditions: any[] = [
        lt(emailSends.sentAt, fiveDaysAgo),
        isNull(emailSends.replyReceivedAt),
        keywordClause,
      ];
      if (!isAneesh) {
        // Non-Aneesh users only see emails they personally sent
        sentByConditions.push(eq(emailSends.sentBy, req.user?.email || ''));
      }

      const rows = await db
        .select({
          id: emailSends.id,
          subject: emailSends.subject,
          sentAt: emailSends.sentAt,
          sentBy: emailSends.sentBy,
          recipientEmail: emailSends.recipientEmail,
          recipientName: emailSends.recipientName,
          customerId: emailSends.customerId,
          leadId: emailSends.leadId,
          replyReceivedAt: emailSends.replyReceivedAt,
        })
        .from(emailSends)
        .where(and(...sentByConditions))
        .orderBy(asc(emailSends.sentAt))
        .limit(100);

      // For each row, check whether the lead/customer has actually replied since this email was sent
      const filtered = (await Promise.all(rows.map(async (row) => {
        const sentAt = row.sentAt ? new Date(row.sentAt) : new Date(0);
        const daysSinceSent = Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24));

        if (row.leadId) {
          const [lead] = await db
            .select({ name: leads.name, company: leads.company, email: leads.email, firstEmailReplyAt: leads.firstEmailReplyAt })
            .from(leads)
            .where(eq(leads.id, row.leadId));
          // Skip if lead has a reply recorded AFTER the sentAt — they've responded
          if (lead?.firstEmailReplyAt && new Date(lead.firstEmailReplyAt) > sentAt) return null;
          const leadContactName = lead?.name || row.recipientName || row.recipientEmail;
          const leadDisplayName = lead?.name && lead?.company ? `${lead.name} (${lead.company})` : lead?.name || null;
          const leadEmail = row.recipientEmail || lead?.email || null;
          return { ...row, recipientEmail: leadEmail, contactName: leadContactName, contactDisplayName: leadDisplayName, recordType: 'lead' as const, recordId: row.leadId, daysSinceSent };
        } else if (row.customerId) {
          const [customer] = await db
            .select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
            .from(customers)
            .where(eq(customers.id, row.customerId));
          // For customers: check if a reply-type activity exists after sentAt
          const [replyActivity] = await db
            .select({ id: customerActivityEvents.id })
            .from(customerActivityEvents)
            .where(and(
              eq(customerActivityEvents.customerId, row.customerId),
              ilike(customerActivityEvents.eventType, '%reply%'),
              sql`${customerActivityEvents.eventDate} > ${sentAt}`,
            ))
            .limit(1);
          if (replyActivity) return null;
          const contactName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || row.recipientName || row.recipientEmail;
          const personName = `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim();
          const contactDisplayName = personName && customer?.company ? `${personName} (${customer.company})` : personName || customer?.company || null;
          const resolvedRecipientEmail = row.recipientEmail || customer?.email || null;
          return { ...row, recipientEmail: resolvedRecipientEmail, contactName, contactDisplayName, recordType: 'customer' as const, recordId: row.customerId, daysSinceSent };
        }
        return { ...row, contactName: row.recipientName || row.recipientEmail, recordType: null, recordId: null, daysSinceSent };
      }))).filter((r): r is NonNullable<typeof r> => r !== null);

      // Also include Gmail-synced email_sent leadActivities with keyword subjects
      const gmailLeadActivities = await db
        .select({
          id: leadActivities.id,
          leadId: leadActivities.leadId,
          summary: leadActivities.summary,
          createdAt: leadActivities.createdAt,
        })
        .from(leadActivities)
        .where(and(
          eq(leadActivities.activityType, 'email_sent'),
          lt(leadActivities.createdAt, fiveDaysAgo),
          sql`(${leadActivities.summary} ILIKE '%Price per Sheet%' OR ${leadActivities.summary} ILIKE '%Pricing%' OR ${leadActivities.summary} ILIKE '%Price List%' OR ${leadActivities.summary} ILIKE '%Press Test%' OR ${leadActivities.summary} ILIKE '%Press Kit%' OR ${leadActivities.summary} ILIKE '%Sample%')`,
        ))
        .limit(50);

      // Collect lead IDs already covered by emailSends rows to avoid duplicates
      const coveredLeadIds = new Set(filtered.filter(r => r.leadId).map(r => r.leadId));

      const gmailEntries = (await Promise.all(gmailLeadActivities.map(async (activity) => {
        if (coveredLeadIds.has(activity.leadId)) return null; // deduplicate
        const [lead] = await db
          .select({ name: leads.name, company: leads.company, email: leads.email, firstEmailReplyAt: leads.firstEmailReplyAt })
          .from(leads)
          .where(eq(leads.id, activity.leadId));
        const sentAt = activity.createdAt ? new Date(activity.createdAt) : new Date(0);
        // Skip if lead has replied after this email was sent
        if (lead?.firstEmailReplyAt && new Date(lead.firstEmailReplyAt) > sentAt) return null;
        const daysSinceSent = Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24));
        const leadDisplayName = lead?.name && lead?.company ? `${lead.name} (${lead.company})` : lead?.name || null;
        return {
          id: `la_${activity.id}`,
          subject: activity.summary,
          sentAt: activity.createdAt,
          recipientEmail: lead?.email || null,
          recipientName: lead?.name || null,
          customerId: null,
          leadId: activity.leadId,
          replyReceivedAt: null,
          contactName: lead?.name || 'Unknown',
          contactDisplayName: leadDisplayName,
          recordType: 'lead' as const,
          recordId: activity.leadId,
          daysSinceSent,
          source: 'gmail_activity',
        };
      }))).filter((r): r is NonNullable<typeof r> => r !== null);

      // Also include customer-side Gmail-synced email_sent activities with keyword titles
      const gmailCustomerActivities = await db
        .select({
          id: customerActivityEvents.id,
          customerId: customerActivityEvents.customerId,
          title: customerActivityEvents.title,
          eventDate: customerActivityEvents.eventDate,
        })
        .from(customerActivityEvents)
        .where(and(
          eq(customerActivityEvents.eventType, 'email_sent'),
          lt(customerActivityEvents.eventDate, fiveDaysAgo),
          sql`(${customerActivityEvents.title} ILIKE '%Price per Sheet%' OR ${customerActivityEvents.title} ILIKE '%Pricing%' OR ${customerActivityEvents.title} ILIKE '%Price List%' OR ${customerActivityEvents.title} ILIKE '%Press Test%' OR ${customerActivityEvents.title} ILIKE '%Press Kit%' OR ${customerActivityEvents.title} ILIKE '%Sample%')`,
        ))
        .limit(50);

      // Collect customer IDs already covered by emailSends rows
      const coveredCustomerIds = new Set(filtered.filter(r => r.customerId).map(r => r.customerId));

      const gmailCustomerEntries = (await Promise.all(gmailCustomerActivities.map(async (activity) => {
        if (coveredCustomerIds.has(activity.customerId)) return null;
        const [customer] = await db
          .select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
          .from(customers)
          .where(eq(customers.id, activity.customerId));
        const sentAt = activity.eventDate ? new Date(activity.eventDate) : new Date(0);
        // Skip if a reply-type activity exists after this email was sent
        const [replyActivity] = await db
          .select({ id: customerActivityEvents.id })
          .from(customerActivityEvents)
          .where(and(
            eq(customerActivityEvents.customerId, activity.customerId),
            ilike(customerActivityEvents.eventType, '%reply%'),
            sql`${customerActivityEvents.eventDate} > ${sentAt}`,
          ))
          .limit(1);
        if (replyActivity) return null;
        const contactName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
        const cPersonName = `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim();
        const contactDisplayName = cPersonName && customer?.company ? `${cPersonName} (${customer.company})` : cPersonName || customer?.company || null;
        const daysSinceSent = Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: `ca_${activity.id}`,
          subject: activity.title,
          sentAt: activity.eventDate,
          recipientEmail: customer?.email || null,
          recipientName: null,
          customerId: activity.customerId,
          leadId: null,
          replyReceivedAt: null,
          contactName,
          contactDisplayName,
          recordType: 'customer' as const,
          recordId: activity.customerId,
          daysSinceSent,
          source: 'gmail_activity',
        };
      }))).filter((r): r is NonNullable<typeof r> => r !== null);

      res.json([...filtered, ...gmailEntries, ...gmailCustomerEntries]);
    } catch (error) {
      console.error("[Tasks] Error getting emails-not-replied:", error);
      res.status(500).json({ error: "Failed to get emails not replied" });
    }
  });
  app.get("/api/tasks/seq-followups", isAuthenticated, async (_req, res) => {
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const completedAssignments = await db
        .select({
          id: dripCampaignAssignments.id,
          campaignId: dripCampaignAssignments.campaignId,
          customerId: dripCampaignAssignments.customerId,
          leadId: dripCampaignAssignments.leadId,
          completedAt: dripCampaignAssignments.completedAt,
          startedAt: dripCampaignAssignments.startedAt,
          campaignName: dripCampaigns.name,
        })
        .from(dripCampaignAssignments)
        .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
        .where(and(
          eq(dripCampaignAssignments.status, 'completed'),
          sql`${dripCampaignAssignments.completedAt} < ${threeDaysAgo}`,
          isNotNull(dripCampaignAssignments.completedAt),
        ))
        .limit(100);

      const enriched = (await Promise.all(completedAssignments.map(async (assignment) => {
        // Skip if an open follow-up task already exists for this assignment
        const [existingTask] = await db
          .select({ id: followUpTasks.id })
          .from(followUpTasks)
          .where(and(
            eq(followUpTasks.sourceType, 'drip_sequence'),
            eq(followUpTasks.sourceId, String(assignment.id)),
            eq(followUpTasks.status, 'pending'),
          ))
          .limit(1);
        if (existingTask) return null;

        const sequenceStartedAt = assignment.startedAt ? new Date(assignment.startedAt) : new Date(0);

        if (assignment.leadId) {
          const [lead] = await db
            .select({ name: leads.name, company: leads.company, firstEmailReplyAt: leads.firstEmailReplyAt })
            .from(leads)
            .where(eq(leads.id, assignment.leadId));
          // If lead replied AFTER the sequence started, they've engaged — no call needed
          if (lead?.firstEmailReplyAt && new Date(lead.firstEmailReplyAt) > sequenceStartedAt) return null;
          return { ...assignment, contactName: lead?.name || lead?.company || 'Unknown', recordType: 'lead' as const, recordId: assignment.leadId };
        } else if (assignment.customerId) {
          const [customer] = await db
            .select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
            .from(customers)
            .where(eq(customers.id, assignment.customerId));
          // For customers: check for a reply-type activity after the sequence started
          const [replyActivity] = await db
            .select({ id: customerActivityEvents.id })
            .from(customerActivityEvents)
            .where(and(
              eq(customerActivityEvents.customerId, assignment.customerId),
              ilike(customerActivityEvents.eventType, '%reply%'),
              sql`${customerActivityEvents.eventDate} > ${sequenceStartedAt}`,
            ))
            .limit(1);
          if (replyActivity) return null;
          const contactName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
          return { ...assignment, contactName, recordType: 'customer' as const, recordId: assignment.customerId };
        }
        return null;
      }))).filter((r): r is NonNullable<typeof r> => r !== null);

      res.json(enriched);
    } catch (error) {
      console.error("[Tasks] Error getting seq-followups:", error);
      res.status(500).json({ error: "Failed to get sequence followups" });
    }
  });
  app.post("/api/tasks/emails-not-replied/:emailSendId/create-task", isAuthenticated, async (req: any, res) => {
    try {
      const rawId = req.params.emailSendId as string;
      const assignedTo = req.user?.id ? String(req.user.id) : undefined;
      const assignedToName = req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user?.email;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);

      // Handle Gmail-synced lead activity entries (la_<id>)
      if (rawId.startsWith('la_')) {
        const activityId = parseInt(rawId.slice(3));
        if (isNaN(activityId)) return res.status(400).json({ error: "Invalid activity ID" });
        const [activity] = await db.select().from(leadActivities).where(eq(leadActivities.id, activityId));
        if (!activity) return res.status(404).json({ error: "Activity not found" });
        const [lead] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, activity.leadId));
        const task = await storage.createFollowUpTask({
          title: `Follow up: ${(activity.summary || 'Email').substring(0, 100)}`,
          description: `Unanswered email (Gmail-synced) sent to ${lead?.name || 'lead'} on ${activity.createdAt ? new Date(activity.createdAt).toLocaleDateString() : 'unknown date'}.`,
          taskType: 'email',
          priority: 'high',
          status: 'pending',
          dueDate,
          leadId: activity.leadId,
          customerId: null,
          sourceType: 'email_no_reply',
          sourceId: rawId,
          isAutoGenerated: true,
          assignedTo,
          assignedToName,
        });
        return res.status(201).json(task);
      }

      // Handle Gmail-synced customer activity entries (ca_<id>)
      if (rawId.startsWith('ca_')) {
        const activityId = parseInt(rawId.slice(3));
        if (isNaN(activityId)) return res.status(400).json({ error: "Invalid activity ID" });
        const [activity] = await db.select().from(customerActivityEvents).where(eq(customerActivityEvents.id, activityId));
        if (!activity) return res.status(404).json({ error: "Activity not found" });
        const [customer] = await db.select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
          .from(customers).where(eq(customers.id, activity.customerId));
        const contactName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
        const task = await storage.createFollowUpTask({
          title: `Follow up: ${(activity.title || 'Email').substring(0, 100)}`,
          description: `Unanswered email (Gmail-synced) sent to ${contactName} on ${activity.eventDate ? new Date(activity.eventDate).toLocaleDateString() : 'unknown date'}.`,
          taskType: 'email',
          priority: 'high',
          status: 'pending',
          dueDate,
          customerId: activity.customerId,
          leadId: null,
          sourceType: 'email_no_reply',
          sourceId: rawId,
          isAutoGenerated: true,
          assignedTo,
          assignedToName,
        });
        return res.status(201).json(task);
      }

      // Default: numeric email_sends ID
      const emailSendId = parseInt(rawId);
      if (isNaN(emailSendId)) return res.status(400).json({ error: "Invalid email send ID" });
      const [emailSend] = await db.select().from(emailSends).where(eq(emailSends.id, emailSendId));
      if (!emailSend) return res.status(404).json({ error: "Email send not found" });

      const task = await storage.createFollowUpTask({
        title: `Follow up: ${emailSend.subject.substring(0, 100)}`,
        description: `Unanswered email sent to ${emailSend.recipientEmail} on ${emailSend.sentAt ? new Date(emailSend.sentAt).toLocaleDateString() : 'unknown date'}.`,
        taskType: 'email',
        priority: 'high',
        status: 'pending',
        dueDate,
        customerId: emailSend.customerId || null,
        leadId: emailSend.leadId || null,
        sourceType: 'email_no_reply',
        sourceId: String(emailSendId),
        isAutoGenerated: true,
        assignedTo,
        assignedToName,
      });
      res.status(201).json(task);
    } catch (error) {
      console.error("[Tasks] Error creating task from email:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });
  app.post("/api/tasks/emails-not-replied/:emailSendId/dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const rawId = req.params.emailSendId as string;
      const now = new Date();

      if (rawId.startsWith('la_') || rawId.startsWith('ca_')) {
        // Gmail-activity entries have no emailSends row — acknowledged on the client side only
        return res.json({ ok: true });
      }

      const emailSendId = parseInt(rawId, 10);
      if (isNaN(emailSendId)) return res.status(400).json({ error: "Invalid ID" });

      await db
        .update(emailSends)
        .set({ replyReceivedAt: now })
        .where(eq(emailSends.id, emailSendId));

      res.json({ ok: true });
    } catch (error) {
      console.error("[Tasks] Error dismissing email:", error);
      res.status(500).json({ error: "Failed to dismiss" });
    }
  });
  app.get("/api/tasks/press-test-sent", isAuthenticated, async (_req, res) => {
    try {
      const odooBaseUrl = process.env.ODOO_URL?.replace(/\/+$/, '') || null;
      const results: any[] = [];

      // 1. Local labelPrints — press test kits manually printed
      const localPrints = await db
        .select({
          id: labelPrints.id,
          customerId: labelPrints.customerId,
          createdAt: labelPrints.createdAt,
          notes: labelPrints.notes,
          printedByUserName: labelPrints.printedByUserName,
          quantity: labelPrints.quantity,
        })
        .from(labelPrints)
        .where(eq(labelPrints.labelType, 'press_test_kit'))
        .orderBy(desc(labelPrints.createdAt))
        .limit(200);

      for (const print of localPrints) {
        const [customer] = await db
          .select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
          .from(customers)
          .where(eq(customers.id, print.customerId));
        const contactName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
        results.push({
          id: `label_${print.id}`,
          source: 'label_print',
          contactName,
          customerId: print.customerId,
          leadId: null,
          sentAt: print.createdAt,
          notes: print.notes || null,
          sentByName: print.printedByUserName || null,
          quantity: print.quantity,
          orderNumber: null,
          odooId: null,
          odooModel: null,
          odooUrl: null,
        });
      }

      // 2. Leads with pressTestKitSentAt set
      const pressTestLeads = await db
        .select({
          id: leads.id,
          name: leads.name,
          pressTestKitSentAt: leads.pressTestKitSentAt,
        })
        .from(leads)
        .where(isNotNull(leads.pressTestKitSentAt))
        .orderBy(desc(leads.pressTestKitSentAt))
        .limit(200);

      for (const lead of pressTestLeads) {
        results.push({
          id: `lead_${lead.id}`,
          source: 'lead_manual',
          contactName: lead.name,
          customerId: null,
          leadId: lead.id,
          sentAt: lead.pressTestKitSentAt,
          notes: null,
          sentByName: null,
          quantity: null,
          orderNumber: null,
          odooId: null,
          odooModel: null,
          odooUrl: null,
        });
      }

      // 3 & 4. Odoo Sales Orders and Invoices (only if Odoo is configured)
      // Also includes orders where Customer Reference (client_order_ref) contains "Samples"
      if (isOdooConfigured()) {
        try {
          const [skuOrders, refOrders, odooInvoices] = await Promise.all([
            odooClient.getPressTestSampleOrders(),
            odooClient.getZeroValueSampleOrders(),
            odooClient.getPressTestSampleInvoices(),
          ]);

          // Merge SKU-matched and Customer-Reference-matched orders, dedup by Odoo ID
          const seenOrderIds = new Set<number>();
          const odooOrders: any[] = [];
          for (const order of [...skuOrders, ...refOrders]) {
            if (!seenOrderIds.has(order.id)) {
              seenOrderIds.add(order.id);
              odooOrders.push(order);
            }
          }

          for (const order of odooOrders) {
            const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : (order.partner_id?.name || 'Unknown');
            const odooUrl = odooBaseUrl ? `${odooBaseUrl}/web#id=${order.id}&model=sale.order&view_type=form` : null;
            results.push({
              id: `so_${order.id}`,
              source: 'odoo_sale_order',
              contactName: partnerName,
              customerId: null,
              leadId: null,
              sentAt: order.date_order ? new Date(order.date_order) : null,
              notes: null,
              sentByName: null,
              quantity: null,
              orderNumber: order.name,
              odooId: order.id,
              odooModel: 'sale.order',
              odooUrl,
            });
          }

          for (const invoice of odooInvoices) {
            const partnerName = Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : (invoice.partner_id?.name || 'Unknown');
            const odooUrl = odooBaseUrl ? `${odooBaseUrl}/web#id=${invoice.id}&model=account.move&view_type=form` : null;
            results.push({
              id: `inv_${invoice.id}`,
              source: 'odoo_invoice',
              contactName: partnerName,
              customerId: null,
              leadId: null,
              sentAt: invoice.invoice_date ? new Date(invoice.invoice_date) : null,
              notes: null,
              sentByName: null,
              quantity: null,
              orderNumber: invoice.name,
              odooId: invoice.id,
              odooModel: 'account.move',
              odooUrl,
            });
          }
        } catch (odooErr) {
          console.warn("[Tasks] Odoo press-test query failed (non-fatal):", odooErr);
        }
      }

      // Sort all results by sentAt descending
      results.sort((a, b) => {
        const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
        const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
        return dateB - dateA;
      });

      res.json(results);
    } catch (error) {
      console.error("[Tasks] Error getting press-test-sent:", error);
      res.status(500).json({ error: "Failed to get press test sent data" });
    }
  });
  app.post("/api/tasks/bulk-complete-overdue", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email || '';
      const isAneesh = userEmail === 'aneesh@4sgraphics.com';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thisYearStart = new Date('2026-01-01T00:00:00.000Z');

      const conditions: any[] = [
        eq(followUpTasks.status, 'pending'),
        lt(followUpTasks.dueDate, today),
        gte(followUpTasks.createdAt, thisYearStart),
      ];

      if (!isAneesh) {
        conditions.push(
          or(eq(followUpTasks.assignedTo, userEmail), eq(followUpTasks.assignedTo, userId))
        );
      }

      const result = await db.update(followUpTasks)
        .set({ status: 'completed', completedAt: new Date(), completedBy: userEmail })
        .where(and(...conditions));

      res.json({ completed: (result as any).rowCount || 0 });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to complete tasks' });
    }
  });
}
