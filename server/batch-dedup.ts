/**
 * Batch deduplication runner.
 *
 * Two passes on every startup (and available as a manual trigger):
 *
 * PASS 1 — Customer-to-Customer:
 *   Find every email address that appears in more than one customer row.
 *   For each group: auto-merge all extras into one primary record
 *   (Odoo record wins; tie-broken by field-count).
 *   Respects the customerDoNotMerge exclusion table.
 *
 * PASS 2 — Lead-to-Customer enrichment:
 *   Find every active lead whose email matches an existing customer.
 *   Enrich the customer with any missing fields from the lead.
 *   Transfer lead activities to customerActivityEvents.
 *   Mark the lead as "converted" and link it to the customer.
 */

import { db } from "./db";
import {
  customers,
  leads,
  leadActivities,
  customerActivityEvents,
  customerDoNotMerge,
} from "@shared/schema";
import {
  sql,
  eq,
  and,
  notInArray,
  or,
  not,
  inArray,
} from "drizzle-orm";
import { performAutoMerge } from "./customer-merge";
import { storage } from "./storage";

let dedupRunning = false;

export async function runBatchDedup(verbose = false): Promise<{
  customerMerges: number;
  leadEnrichments: number;
  errors: string[];
}> {
  if (dedupRunning) {
    console.log("[BatchDedup] Already running — skipping.");
    return { customerMerges: 0, leadEnrichments: 0, errors: [] };
  }
  dedupRunning = true;

  const stats = { customerMerges: 0, leadEnrichments: 0, errors: [] as string[] };

  try {
    // ─────────────────────────────────────────────────────────────────
    // PASS 1: Customer ↔ Customer — merge exact-email duplicates
    // ─────────────────────────────────────────────────────────────────
    console.log("[BatchDedup] Pass 1 — finding customer email duplicates…");

    // Pull every customer with a non-null email
    const allCustomers = await db
      .select({
        id: customers.id,
        email: customers.email,
        odooPartnerId: customers.odooPartnerId,
      })
      .from(customers)
      .where(sql`${customers.email} IS NOT NULL AND TRIM(${customers.email}) != ''`);

    // Group by normalised email
    const emailGroups = new Map<string, string[]>(); // normalised email → [id, ...]
    for (const c of allCustomers) {
      const key = c.email!.toLowerCase().trim();
      const group = emailGroups.get(key) ?? [];
      group.push(c.id);
      emailGroups.set(key, group);
    }

    // Load all "do not merge" pairs once
    const doNotMergeRows = await db.select().from(customerDoNotMerge);
    const doNotMergePairs = new Set<string>(
      doNotMergeRows.map(r => [r.customerId1, r.customerId2].sort().join("|"))
    );
    const isPairExcluded = (a: string, b: string) =>
      doNotMergePairs.has([a, b].sort().join("|"));

    // Process each group that has > 1 member
    for (const [email, ids] of emailGroups) {
      if (ids.length < 2) continue;

      let remaining = [...ids];

      while (remaining.length > 1) {
        const [a, b] = remaining;

        if (isPairExcluded(a, b)) {
          // Skip this specific pair but keep the rest
          remaining = [b, ...remaining.slice(2)];
          continue;
        }

        try {
          const { primaryId, secondaryId } = await performAutoMerge(a, b);
          stats.customerMerges++;
          if (verbose) console.log(`[BatchDedup] Merged ${secondaryId} → ${primaryId} (email: ${email})`);
          // Replace the two IDs with just the survivor
          remaining = [primaryId, ...remaining.slice(2)];
        } catch (err: any) {
          const msg = `Customer merge (${a} ↔ ${b}): ${err.message}`;
          stats.errors.push(msg);
          console.error("[BatchDedup]", msg);
          remaining = remaining.slice(2);
        }
      }
    }

    console.log(`[BatchDedup] Pass 1 complete — ${stats.customerMerges} customer merges.`);

    // ─────────────────────────────────────────────────────────────────
    // PASS 2: Lead → Customer enrichment (email match)
    // ─────────────────────────────────────────────────────────────────
    console.log("[BatchDedup] Pass 2 — matching leads to customers by email…");

    const activeLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          sql`${leads.email} IS NOT NULL AND TRIM(${leads.email}) != ''`,
          not(inArray(leads.stage, ["converted", "lost"]))
        )
      );

    for (const lead of activeLeads) {
      if (!lead.email) continue;
      const normalizedLeadEmail = lead.email.toLowerCase().trim();

      // Find matching customer
      const matchingCustomers = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          phone: customers.phone,
          cell: customers.cell,
          company: customers.company,
          website: customers.website,
          address1: customers.address1,
          address2: customers.address2,
          city: customers.city,
          province: customers.province,
          zip: customers.zip,
          country: customers.country,
          pricingTier: customers.pricingTier,
          salesRepId: customers.salesRepId,
          customerType: customers.customerType,
          note: customers.note,
          tags: customers.tags,
        })
        .from(customers)
        .where(sql`LOWER(TRIM(${customers.email})) = ${normalizedLeadEmail}`)
        .limit(1);

      if (matchingCustomers.length === 0) continue;

      const cust = matchingCustomers[0];
      const customerId = cust.id;

      try {
        // Build enrichment object — only fill gaps (never overwrite existing data)
        const enrichment: Record<string, any> = {};

        // Name: split lead.name if customer has no first/last name
        if (!cust.firstName && !cust.lastName && lead.name) {
          const parts = lead.name.trim().split(/\s+/);
          enrichment.firstName = parts[0] || null;
          enrichment.lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
        }

        if (!cust.phone && lead.phone) enrichment.phone = lead.phone;
        if (!cust.cell && lead.mobile) enrichment.cell = lead.mobile;
        if (!cust.company && lead.company) enrichment.company = lead.company;
        if (!cust.website && lead.website) enrichment.website = lead.website;
        if (!cust.address1 && lead.street) enrichment.address1 = lead.street;
        if (!cust.address2 && lead.street2) enrichment.address2 = lead.street2;
        if (!cust.city && lead.city) enrichment.city = lead.city;
        if (!cust.province && lead.state) enrichment.province = lead.state;
        if (!cust.zip && lead.zip) enrichment.zip = lead.zip;
        if (!cust.country && lead.country) enrichment.country = lead.country;
        if (!cust.pricingTier && lead.pricingTier) enrichment.pricingTier = lead.pricingTier;
        if (!cust.salesRepId && lead.salesRepId) enrichment.salesRepId = lead.salesRepId;
        if (!cust.customerType && lead.customerType) enrichment.customerType = lead.customerType;

        // Notes: append lead description if customer has none
        if (!cust.note && lead.description) {
          enrichment.note = lead.description;
        } else if (cust.note && lead.description && !cust.note.includes(lead.description)) {
          enrichment.note = `${cust.note}\n\n--- From lead ---\n${lead.description}`;
        }

        // Tags: merge
        if (lead.tags) {
          const custTags = cust.tags ? cust.tags.split(",").map(t => t.trim()) : [];
          const leadTags = lead.tags.split(",").map(t => t.trim());
          enrichment.tags = Array.from(new Set([...custTags, ...leadTags])).filter(Boolean).join(", ");
        }

        // Apply enrichment to customer (skip if nothing changed)
        if (Object.keys(enrichment).length > 0) {
          await storage.updateCustomer(customerId, enrichment);
          if (verbose) console.log(`[BatchDedup] Enriched customer ${customerId} from lead ${lead.id} (${lead.email})`);
        }

        // Transfer lead activities → customerActivityEvents
        const leadActs = await db
          .select()
          .from(leadActivities)
          .where(eq(leadActivities.leadId, lead.id));

        for (const act of leadActs) {
          await db.insert(customerActivityEvents).values({
            customerId,
            eventType: "note",
            title: `[Lead history] ${act.summary}`,
            description: act.details || act.summary,
            sourceType: "lead_merge",
            sourceId: String(act.id),
            createdBy: act.performedBy || undefined,
            createdByName: act.performedByName || undefined,
            eventDate: act.createdAt || new Date(),
          }).onConflictDoNothing();
        }

        // Mark lead as converted and link to customer
        await db
          .update(leads)
          .set({
            stage: "converted",
            sourceCustomerId: customerId,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, lead.id));

        // Log a note on the customer
        await db.insert(customerActivityEvents).values({
          customerId,
          eventType: "note",
          title: "Lead merged into contact",
          description: `Lead record for ${lead.name || lead.email} was automatically matched by email and merged. ${Object.keys(enrichment).length > 0 ? `Fields updated: ${Object.keys(enrichment).join(", ")}.` : "No new fields — contact already complete."}`,
          sourceType: "lead_merge",
          sourceId: String(lead.id),
        });

        stats.leadEnrichments++;
        if (verbose) console.log(`[BatchDedup] Lead ${lead.id} (${lead.email}) merged into customer ${customerId}`);
      } catch (err: any) {
        const msg = `Lead-customer enrichment (lead ${lead.id} → customer ${customerId}): ${err.message}`;
        stats.errors.push(msg);
        console.error("[BatchDedup]", msg);
      }
    }

    console.log(`[BatchDedup] Pass 2 complete — ${stats.leadEnrichments} lead enrichments.`);
  } finally {
    dedupRunning = false;
  }

  console.log(
    `[BatchDedup] Done. Customer merges: ${stats.customerMerges}, Lead enrichments: ${stats.leadEnrichments}, Errors: ${stats.errors.length}`
  );
  return stats;
}
