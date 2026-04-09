import type { Express } from "express";
import { db } from "./db";
import { eq, sql, and, or, desc, ilike, isNull, isNotNull, not, inArray } from "drizzle-orm";
import { isAuthenticated, requireApproval } from "./replitAuth";
import { normalizeEmail, extractCompanyDomain } from "@shared/email-normalizer";
import { odooClient } from "./odoo";
import { storage } from "./storage";
import { spotlightEngine } from "./spotlight-engine";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { isFreightContact } from "./odoo-parser";
import {
  customers,
  customerActivityEvents,
  gmailMessages,
  followUpTasks,
  leads,
  leadActivities,
  insertLeadSchema,
  insertLeadActivitySchema,
  bouncedEmails,
  dripCampaigns,
  dripCampaignAssignments,
  companies,
} from "@shared/schema";

const US_STATE_ABBR_TO_NAME: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
  IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
  MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
  NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
  NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin',
  WY:'Wyoming', PR:'Puerto Rico', VI:'Virgin Islands',
};

function stateFilterVariants(canonical: string): string[] {
  const abbr = Object.entries(US_STATE_ABBR_TO_NAME).find(([, n]) => n.toLowerCase() === canonical.toLowerCase())?.[0];
  const variants = new Set<string>([canonical, `${canonical} (US)`, `${canonical} (CA)`]);
  if (abbr) { variants.add(abbr); variants.add(`${abbr} `); variants.add(`${abbr} (US)`); }
  return Array.from(variants);
}

async function pushLeadToOdooContact(leadId: number): Promise<{ success: boolean; alreadyPushed?: boolean; odooPartnerId?: number; customerId?: string; error?: string }> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { success: false, error: 'Lead not found' };

  // Idempotent: already pushed to Odoo
  if (lead.odooPartnerId) {
    // Check if a local customer was also created — if not, complete the conversion now
    const [existingCustomer] = await db.select({ id: customers.id })
      .from(customers)
      .where(eq(customers.odooPartnerId, lead.odooPartnerId))
      .limit(1);

    if (existingCustomer) {
      // Already fully converted — nothing left to do
      return { success: true, alreadyPushed: true, odooPartnerId: lead.odooPartnerId, customerId: existingCustomer.id };
    }

    // Local customer missing (old code path) — finish the conversion: create customer + delete lead
    const newCustomerId = crypto.randomUUID();
    const nameParts = (lead.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    await db.transaction(async (tx) => {
      await tx.insert(customers).values({
        id: newCustomerId,
        firstName, lastName,
        company: lead.company || lead.name || '',
        email: lead.email || null,
        emailNormalized: lead.emailNormalized || (lead.email ? lead.email.toLowerCase().trim() : null),
        phone: lead.phone || null,
        cell: lead.mobile || null,
        address1: lead.street || null,
        address2: lead.street2 || null,
        city: lead.city || null,
        province: lead.state || null,
        zip: lead.zip || null,
        country: lead.country || null,
        website: lead.website || null,
        note: lead.description || null,
        salesRepId: lead.salesRepId || null,
        salesRepName: lead.salesRepName || null,
        pricingTier: lead.pricingTier || null,
        pricingTierSetBy: lead.pricingTierSetBy || null,
        pricingTierSetAt: lead.pricingTierSetAt || null,
        customerType: lead.customerType || null,
        tags: lead.tags || null,
        isCompany: lead.isCompany || false,
        contactType: 'contact',
        sources: ['lead_conversion'],
        swatchbookSentAt: lead.swatchbookSentAt || null,
        priceListSentAt: lead.priceListSentAt || null,
        odooPartnerId: lead.odooPartnerId,
        totalSpent: '0',
        totalOrders: 0,
        createdAt: new Date(),
      });
      await tx.insert(customerActivityEvents).values({
        customerId: newCustomerId,
        eventType: 'note',
        title: 'Contact created from Lead (retroactive)',
        description: `Lead "${lead.name}" was already in Odoo as partner #${lead.odooPartnerId}; local contact record created now.`,
        sourceType: 'manual',
        sourceTable: 'leads',
        sourceId: String(lead.id),
        eventDate: new Date(),
      });
      await tx.delete(leadActivities).where(eq(leadActivities.leadId, leadId));
      await tx.delete(leads).where(eq(leads.id, leadId));
    });
    console.log(`[Push to Odoo] Lead #${leadId} retroactively converted — customer ${newCustomerId}`);
    return { success: true, odooPartnerId: lead.odooPartnerId, customerId: newCustomerId };
  }

  // Resolve country
  let resolvedCountryId: number | undefined;
  if (lead.country) {
    const countries = await odooClient.getCountries();
    const normalize = (s: string) => s.trim().toLowerCase();
    const countryInput = normalize(lead.country);
    const match = countries.find(c =>
      normalize(c.name) === countryInput ||
      normalize(c.code) === countryInput ||
      (countryInput === 'usa' && normalize(c.code) === 'us') ||
      (countryInput === 'united states' && normalize(c.code) === 'us') ||
      (countryInput === 'united states of america' && normalize(c.code) === 'us') ||
      (countryInput === 'canada' && normalize(c.code) === 'ca')
    );
    if (match) resolvedCountryId = match.id;
  }

  // Resolve state
  let resolvedStateId: number | undefined;
  if (lead.state && resolvedCountryId) {
    const states = await odooClient.getStates(resolvedCountryId);
    const normalize = (s: string) => s.trim().toLowerCase();
    const stateInput = normalize(lead.state);
    const match = states.find(s =>
      normalize(s.name) === stateInput || normalize(s.code) === stateInput
    );
    if (match) resolvedStateId = match.id;
  }

  // Two-phase company sync: check local companies table first, then Odoo
  let parentId: number | undefined;
  if (lead.companyId) {
    // We have a local company record — check if it already has an Odoo partner ID
    const [localCompany] = await db.select().from(companies).where(eq(companies.id, lead.companyId)).limit(1);
    if (localCompany?.odooCompanyPartnerId) {
      parentId = localCompany.odooCompanyPartnerId;
    } else if (localCompany) {
      // Company exists locally but not yet in Odoo — create it
      try {
        const companyPayload: any = { name: localCompany.name, is_company: true, type: 'contact' };
        if (localCompany.domain) companyPayload.website = `https://${localCompany.domain}`;
        if (localCompany.mainPhone) companyPayload.phone = localCompany.mainPhone;
        if (localCompany.generalEmail) companyPayload.email = localCompany.generalEmail;
        if (localCompany.city) companyPayload.city = localCompany.city;
        if (localCompany.addressLine1) companyPayload.street = localCompany.addressLine1;
        if (localCompany.country) {
          const countries = await odooClient.getCountries();
          const match = countries.find(c => c.name.toLowerCase() === localCompany.country!.toLowerCase() || c.code.toLowerCase() === localCompany.country!.toLowerCase());
          if (match) companyPayload.country_id = match.id;
        }
        const newOdooCompanyId = await odooClient.createPartner(companyPayload);
        parentId = newOdooCompanyId;
        await db.update(companies)
          .set({ odooCompanyPartnerId: newOdooCompanyId, odooSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(companies.id, localCompany.id));
        console.log(`[Odoo Push] Created Odoo company partner #${newOdooCompanyId} for local company #${localCompany.id} "${localCompany.name}"`);
      } catch (compErr) {
        console.error(`[Odoo Push] Failed to create company partner for "${localCompany?.name}":`, compErr);
      }
    }
  } else if (lead.company) {
    // No local company record — fall back to name-based Odoo search
    try {
      const odooCompanies = await odooClient.searchRead('res.partner', [
        ['name', 'ilike', lead.company],
        ['is_company', '=', true]
      ], ['id', 'name'], { limit: 1 });
      if (odooCompanies.length > 0) parentId = odooCompanies[0].id;
    } catch (_) {}
  }

  // Build Odoo partner payload
  const payload: any = {
    name: lead.name,
    is_company: false,
    type: 'contact',
  };
  if (lead.email) payload.email = lead.email;
  if (lead.phone) payload.phone = lead.phone;
  if (lead.jobTitle) payload.function = lead.jobTitle;
  if (lead.website) payload.website = lead.website;
  if (lead.street) payload.street = lead.street;
  if (lead.street2) payload.street2 = lead.street2;
  if (lead.city) payload.city = lead.city;
  if (lead.zip) payload.zip = lead.zip;
  if (resolvedCountryId) payload.country_id = resolvedCountryId;
  if (resolvedStateId) payload.state_id = resolvedStateId;
  if (parentId) payload.parent_id = parentId;
  // mobile is unsupported in Odoo V19 res.partner — stash in comment
  if (lead.mobile) payload.comment = `Mobile: ${lead.mobile}`;

  // Append WhatsApp to comment if present
  if (lead.whatsapp) {
    payload.comment = payload.comment
      ? payload.comment + `\nWhatsApp: ${lead.whatsapp}`
      : `WhatsApp: ${lead.whatsapp}`;
  }
  // Append LinkedIn profile to comment if present
  if (lead.linkedinProfile) {
    payload.comment = payload.comment
      ? payload.comment + `\nLinkedIn: ${lead.linkedinProfile}`
      : `LinkedIn: ${lead.linkedinProfile}`;
  }
  // Use LinkedIn as website fallback if no website set
  if (!lead.website && lead.linkedinProfile) {
    payload.website = lead.linkedinProfile;
  }
  // Append internal notes to Odoo comment if present
  if (lead.internalNotes) {
    payload.comment = payload.comment
      ? payload.comment + `\nNotes: ${lead.internalNotes}`
      : lead.internalNotes;
  }

  const newPartnerId = await odooClient.createPartner(payload);

  // Create a Contact in our own Contacts page from the lead data
  const newCustomerId = crypto.randomUUID();
  const nameParts = (lead.name || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Wrap all local DB writes in a transaction — Odoo partner already created above
  await db.transaction(async (tx) => {
    await tx.insert(customers).values({
      id: newCustomerId,
      firstName,
      lastName,
      company: lead.company || lead.name || '',
      email: lead.email || null,
      emailNormalized: lead.emailNormalized || (lead.email ? lead.email.toLowerCase().trim() : null),
      phone: lead.phone || null,
      cell: lead.mobile || null,
      address1: lead.street || null,
      address2: lead.street2 || null,
      city: lead.city || null,
      province: lead.state || null,
      zip: lead.zip || null,
      country: lead.country || null,
      website: lead.website || null,
      note: lead.description || null,
      salesRepId: lead.salesRepId || null,
      salesRepName: lead.salesRepName || null,
      pricingTier: lead.pricingTier || null,
      pricingTierSetBy: lead.pricingTierSetBy || null,
      pricingTierSetAt: lead.pricingTierSetAt || null,
      customerType: lead.customerType || null,
      tags: lead.tags || null,
      isCompany: lead.isCompany || false,
      contactType: 'contact',
      sources: ['lead_conversion'],
      swatchbookSentAt: lead.swatchbookSentAt || null,
      priceListSentAt: lead.priceListSentAt || null,
      odooPartnerId: newPartnerId,
      jobTitle: lead.jobTitle || null,
      companyDomain: lead.companyDomain || null,
      companyId: lead.companyId || null,
      totalSpent: '0',
      totalOrders: 0,
      createdAt: new Date(),
    });

    // Log a conversion activity on the new contact
    await tx.insert(customerActivityEvents).values({
      customerId: newCustomerId,
      eventType: 'note',
      title: 'Contact created from Lead (pushed to Odoo)',
      description: `Lead "${lead.name}" was pushed to Odoo as Contact #${newPartnerId} and moved to the Contacts page.`,
      sourceType: 'manual',
      sourceTable: 'leads',
      sourceId: String(lead.id),
      eventDate: new Date(),
    });

    // Delete the lead — it now lives in Contacts
    await tx.delete(leadActivities).where(eq(leadActivities.leadId, leadId));
    await tx.delete(leads).where(eq(leads.id, leadId));
  });

  console.log(`[Push to Odoo] Lead #${leadId} "${lead.name}" → Odoo partner #${newPartnerId}, customer ${newCustomerId}, lead deleted`);

  return { success: true, odooPartnerId: newPartnerId, customerId: newCustomerId };
}

export function registerLeadsRoutes(app: Express): void {
  app.get("/api/leads/:id/drip-assignments", isAuthenticated, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      if (isNaN(leadId)) return res.status(400).json({ error: "Invalid lead ID" });
      const rows = await db
        .select({
          id: dripCampaignAssignments.id,
          campaignId: dripCampaignAssignments.campaignId,
          campaignName: dripCampaigns.name,
          campaignDescription: dripCampaigns.description,
          status: dripCampaignAssignments.status,
          startedAt: dripCampaignAssignments.startedAt,
          completedAt: dripCampaignAssignments.completedAt,
          cancelledAt: dripCampaignAssignments.cancelledAt,
          assignedBy: dripCampaignAssignments.assignedBy,
        })
        .from(dripCampaignAssignments)
        .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
        .where(eq(dripCampaignAssignments.leadId, leadId))
        .orderBy(desc(dripCampaignAssignments.startedAt));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching lead drip assignments:", error);
      res.status(500).json({ error: "Failed to fetch drip assignments" });
    }
  });
  app.get("/api/leads/tags", isAuthenticated, async (_req: any, res) => {
    try {
      const rows = await db
        .select({ tags: leads.tags })
        .from(leads)
        .where(sql`${leads.tags} IS NOT NULL AND TRIM(${leads.tags}) != ''`);
      const tagSet = new Set<string>();
      for (const row of rows) {
        if (row.tags) {
          row.tags.split(',').forEach(t => { const v = t.trim(); if (v) tagSet.add(v); });
        }
      }
      res.json(Array.from(tagSet).sort());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch lead tags' });
    }
  });
  app.get("/api/leads", isAuthenticated, async (req: any, res) => {
    try {
      const { stage, salesRepId, search, state: stateFilter, city: cityFilter, limit = 100, offset = 0, tag, createdAfterDays } = req.query;
      
      let query = db.select().from(leads);
      const conditions: any[] = [];
      
      if (stage && stage !== 'all') {
        conditions.push(eq(leads.stage, stage as string));
      } else {
        conditions.push(sql`${leads.stage} != 'converted'`);
      }
      if (salesRepId) {
        conditions.push(eq(leads.salesRepId, salesRepId as string));
      }
      if (stateFilter) {
        const variants = stateFilterVariants(stateFilter as string);
        if (variants.length === 1) {
          conditions.push(ilike(leads.state, variants[0]));
        } else {
          conditions.push(or(...variants.map(v => ilike(leads.state, v)))!);
        }
      }
      if (cityFilter) {
        conditions.push(ilike(leads.city, cityFilter as string));
      }
      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            ilike(leads.name, searchTerm),
            ilike(leads.company, searchTerm),
            ilike(leads.email, searchTerm)
          )
        );
      }
      if (tag) {
        conditions.push(ilike(leads.tags, `%${tag}%` as string));
      }
      if (createdAfterDays) {
        const days = parseInt(createdAfterDays as string);
        if (!isNaN(days) && days > 0) {
          conditions.push(sql`${leads.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`);
        }
      }
      
      const result = await db.select().from(leads)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(leads.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));
      
      // Get total count for pagination
      const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(leads)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      res.json({
        leads: result,
        total: countResult[0]?.count || 0
      });
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });
  app.get("/api/leads/stats", isAuthenticated, async (req: any, res) => {
    try {
      const stats = await db.select({
        stage: leads.stage,
        count: sql<number>`count(*)::int`
      }).from(leads)
        .where(sql`${leads.stage} != 'converted'`)
        .groupBy(leads.stage);
      
      const totalLeads = stats.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
      
      res.json({
        total: totalLeads,
        byStage: Object.fromEntries(stats.map(s => [s.stage, Number(s.count) || 0]))
      });
    } catch (error) {
      console.error("Error fetching lead stats:", error);
      res.status(500).json({ error: "Failed to fetch lead statistics" });
    }
  });
  app.get("/api/leads/needs-review", isAuthenticated, async (req: any, res) => {
    try {
      const activeStages = ['new', 'contacted', 'qualified', 'nurturing', 'contact_later'];
      
      // Return ALL active pipeline leads — sorted stale-first (oldest update first)
      const reviewLeads = await db.select().from(leads)
        .where(inArray(leads.stage, activeStages))
        .orderBy(leads.updatedAt)
        .limit(100);

      if (reviewLeads.length === 0) {
        return res.json({ leads: [], count: 0 });
      }

      // Fetch the most recent non-creation activity for each lead in one query
      const leadIds = reviewLeads.map(l => l.id);
      const recentActivities = await db
        .selectDistinctOn([leadActivities.leadId], {
          leadId: leadActivities.leadId,
          activityType: leadActivities.activityType,
          summary: leadActivities.summary,
          createdAt: leadActivities.createdAt,
        })
        .from(leadActivities)
        .where(
          and(
            inArray(leadActivities.leadId, leadIds),
            sql`${leadActivities.summary} NOT ILIKE 'Lead created%'`
          )
        )
        .orderBy(leadActivities.leadId, desc(leadActivities.createdAt));

      const activityMap = new Map(recentActivities.map(a => [a.leadId, a]));
      const now = new Date();

      const enriched = reviewLeads.map(lead => {
        const lastAct = activityMap.get(lead.id);
        const lastTouched = lastAct?.createdAt
          ? new Date(lastAct.createdAt)
          : lead.updatedAt
          ? new Date(lead.updatedAt)
          : lead.createdAt
          ? new Date(lead.createdAt)
          : now;
        const daysSinceContact = Math.floor((now.getTime() - lastTouched.getTime()) / (1000 * 60 * 60 * 24));
        const daysInPipeline = lead.createdAt
          ? Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return {
          ...lead,
          lastActivity: lastAct
            ? {
                type: lastAct.activityType,
                summary: lastAct.summary,
                createdAt: lastAct.createdAt,
                daysAgo: daysSinceContact,
              }
            : null,
          daysSinceContact,
          daysInPipeline,
        };
      });
      
      res.json({ leads: enriched, count: enriched.length });
    } catch (error) {
      console.error("Error fetching leads for review:", error);
      res.status(500).json({ error: "Failed to fetch leads for review" });
    }
  });
  app.get("/api/leads/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const lead = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
      
      if (lead.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Get activities for this lead
      const activities = await db.select().from(leadActivities)
        .where(eq(leadActivities.leadId, id))
        .orderBy(desc(leadActivities.createdAt))
        .limit(50);
      
      res.json({ ...lead[0], activities });
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });
  app.post("/api/leads", isAuthenticated, async (req: any, res) => {
    try {
      const data = insertLeadSchema.parse(req.body);
      
      // Normalize email if provided
      if (data.email) {
        data.emailNormalized = normalizeEmail(data.email);
        if (!data.companyDomain) {
          data.companyDomain = extractCompanyDomain(data.email) ?? undefined;
        }
      }

      // Duplicate detection
      if (data.email) {
        const normalizedIncoming = normalizeEmail(data.email);

        // Check existing leads
        const [existingLead] = await db.select({ id: leads.id, name: leads.name, company: leads.company, stage: leads.stage })
          .from(leads)
          .where(eq(leads.emailNormalized, normalizedIncoming))
          .limit(1);

        if (existingLead) {
          return res.status(409).json({
            error: 'duplicate',
            message: `A lead with this email already exists: ${existingLead.name || existingLead.company}`,
            existingId: existingLead.id,
            existingType: 'lead',
            existingStage: existingLead.stage,
          });
        }

        // Check existing customers
        const [existingCustomer] = await db.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, company: customers.company })
          .from(customers)
          .where(eq(customers.emailNormalized, normalizedIncoming))
          .limit(1);

        if (existingCustomer) {
          return res.status(409).json({
            error: 'duplicate',
            message: `This email already exists as a Contact: ${existingCustomer.company || existingCustomer.firstName}`,
            existingId: existingCustomer.id,
            existingType: 'customer',
          });
        }
      }

      const result = await db.insert(leads).values(data).returning();
      
      // Log the creation activity
      await db.insert(leadActivities).values({
        leadId: result[0].id,
        activityType: 'note',
        summary: 'Lead created',
        performedBy: req.user?.email,
        performedByName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : req.user?.email
      });
      
      res.status(201).json(result[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating lead:", error);
      res.status(500).json({ error: "Failed to create lead" });
    }
  });
  app.put("/api/leads/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = req.body;
      const userId = req.user?.claims?.sub || req.user?.id;

      // Normalize email if updated
      if (data.email) {
        data.emailNormalized = normalizeEmail(data.email);
        if (!data.companyDomain) {
          data.companyDomain = extractCompanyDomain(data.email) ?? null;
        }
      }
      
      data.updatedAt = new Date();

      // If the email is being changed, fetch the old lead to compare
      let oldEmail: string | null = null;
      if (data.email) {
        const [existing] = await db.select({ email: leads.email }).from(leads).where(eq(leads.id, id)).limit(1);
        oldEmail = existing?.email ?? null;
      }
      
      const result = await db.update(leads)
        .set(data)
        .where(eq(leads.id, id))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // If the email changed, auto-resolve any pending bounces for this lead so Spotlight
      // stops surfacing the stale bounce card
      if (data.email && oldEmail && data.email.toLowerCase() !== oldEmail.toLowerCase()) {
        await db.update(bouncedEmails)
          .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: userId, resolution: 'email_updated' })
          .where(and(
            eq(bouncedEmails.leadId, id),
            inArray(bouncedEmails.status, ['pending', 'investigating'])
          ));
      }

      // Auto-log stage change activity
      if (data.stage) {
        try {
          await db.insert(leadActivities).values({
            leadId: parseInt(req.params.id),
            activityType: 'stage_changed',
            summary: `Stage changed to ${data.stage}`,
            performedBy: req.user?.email || 'system',
            performedByName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : req.user?.email || 'System',
          });
        } catch (e) {
          console.error('[Stage Change] Failed to log activity:', e);
        }
      }

      // Invalidate Spotlight prefetch caches so the next task fetch reads fresh lead data
      spotlightEngine.invalidateAllPrefetchCaches();

      res.json(result[0]);
    } catch (error) {
      console.error("Error updating lead:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });
  app.post("/api/leads/:id/qualify", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid lead ID" });

      // Fetch the full lead record for both validation and conversion
      const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const missing: string[] = [];

      // 1. Address completeness
      if (!lead.street || !lead.city || !lead.state || !lead.zip) {
        missing.push('address');
      }

      // 2. Phone on file
      if (!lead.phone) {
        missing.push('phone');
      }

      // 3. Pricing tier assigned
      if (!lead.pricingTier) {
        missing.push('pricing_tier');
      }

      // 4. Email present and not actively bounced
      if (!lead.email) {
        missing.push('email');
      } else {
        const [bounced] = await db.select({ id: bouncedEmails.id })
          .from(bouncedEmails)
          .where(and(
            ilike(bouncedEmails.bouncedEmail, lead.email),
            inArray(bouncedEmails.status, ['pending', 'investigating'])
          ))
          .limit(1);
        if (bounced) missing.push('email_bounced');
      }

      if (missing.length > 0) {
        return res.json({ qualified: false, missing });
      }

      // --- All checks passed — proceed with company-aware conversion ---

      const result = await db.transaction(async (tx) => {
        // Step 1: Resolve company domain
        const companyDomain = lead.companyDomain || extractCompanyDomain(lead.email) || null;
        let resolvedCompanyId: number | null = lead.companyId || null;

        if (companyDomain && !resolvedCompanyId) {
          // Find or create the company record
          const [existingCompany] = await tx.select({ id: companies.id })
            .from(companies)
            .where(eq(companies.domain, companyDomain))
            .limit(1);

          if (existingCompany) {
            resolvedCompanyId = existingCompany.id;
          } else {
            const companyName = lead.company || companyDomain;
            const [newCompany] = await tx.insert(companies)
              .values({ name: companyName, domain: companyDomain })
              .returning({ id: companies.id });
            resolvedCompanyId = newCompany.id;
          }
        }

        // Step 2: Convert this lead to a customer
        const nameParts = (lead.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const newCustomerId = crypto.randomUUID();

        await tx.insert(customers).values({
          id: newCustomerId,
          firstName,
          lastName,
          company: lead.company || '',
          email: lead.email || null,
          emailNormalized: lead.emailNormalized || null,
          phone: lead.phone || null,
          cell: lead.mobile || null,
          address1: lead.street || null,
          address2: lead.street2 || null,
          city: lead.city || null,
          province: lead.state || null,
          zip: lead.zip || null,
          country: lead.country || null,
          website: lead.website || null,
          note: lead.description || null,
          salesRepId: lead.salesRepId || null,
          salesRepName: lead.salesRepName || null,
          pricingTier: lead.pricingTier || null,
          pricingTierSetBy: lead.pricingTierSetBy || null,
          pricingTierSetAt: lead.pricingTierSetAt || null,
          customerType: lead.customerType || null,
          tags: lead.tags || null,
          isCompany: lead.isCompany || false,
          odooPartnerId: lead.sourceContactOdooPartnerId || null,
          sources: ['lead_conversion'],
          swatchbookSentAt: lead.swatchbookSentAt || null,
          priceListSentAt: lead.priceListSentAt || null,
          // Company parity fields
          companyDomain: companyDomain,
          jobTitle: lead.jobTitle || null,
          companyId: resolvedCompanyId,
          createdAt: new Date(),
        });

        // Log the conversion
        await tx.insert(customerActivityEvents).values({
          customerId: newCustomerId,
          eventType: 'status_change',
          title: 'Lead converted to customer (qualified)',
          description: `Lead "${lead.name}" was qualified and converted to a contact.`,
          sourceType: 'manual',
          sourceTable: 'leads',
          sourceId: String(lead.id),
          eventDate: new Date(),
        });

        // Step 3: Mark this lead as converted and update company link
        await tx.update(leads)
          .set({ stage: 'converted', companyDomain, companyId: resolvedCompanyId, updatedAt: new Date() })
          .where(eq(leads.id, id));

        // Step 4: Auto-convert sibling leads with the same company domain (not already converted)
        let siblingsConverted = 0;
        if (companyDomain) {
          const siblings = await tx.select()
            .from(leads)
            .where(and(
              eq(leads.companyDomain, companyDomain),
              inArray(leads.stage, ['new', 'contacted', 'qualified']),
              sql`${leads.id} != ${id}`
            ));

          for (const sibling of siblings) {
            const siblingNameParts = (sibling.name || '').split(' ');
            const siblingFirstName = siblingNameParts[0] || '';
            const siblingLastName = siblingNameParts.slice(1).join(' ') || '';
            const siblingCustomerId = crypto.randomUUID();

            try {
              // Use a savepoint so a sibling failure cannot abort the outer transaction
              await tx.transaction(async (stx) => {
                await stx.insert(customers).values({
                  id: siblingCustomerId,
                  firstName: siblingFirstName,
                  lastName: siblingLastName,
                  company: sibling.company || '',
                  email: sibling.email || null,
                  emailNormalized: sibling.emailNormalized || null,
                  phone: sibling.phone || null,
                  cell: sibling.mobile || null,
                  address1: sibling.street || null,
                  address2: sibling.street2 || null,
                  city: sibling.city || null,
                  province: sibling.state || null,
                  zip: sibling.zip || null,
                  country: sibling.country || null,
                  website: sibling.website || null,
                  note: sibling.description || null,
                  salesRepId: sibling.salesRepId || null,
                  salesRepName: sibling.salesRepName || null,
                  pricingTier: sibling.pricingTier || null,
                  pricingTierSetBy: sibling.pricingTierSetBy || null,
                  pricingTierSetAt: sibling.pricingTierSetAt || null,
                  customerType: sibling.customerType || null,
                  tags: sibling.tags || null,
                  isCompany: sibling.isCompany || false,
                  odooPartnerId: sibling.sourceContactOdooPartnerId || null,
                  sources: ['lead_conversion'],
                  companyDomain: companyDomain,
                  jobTitle: sibling.jobTitle || null,
                  companyId: resolvedCompanyId,
                  createdAt: new Date(),
                });

                await stx.update(leads)
                  .set({ stage: 'converted', companyId: resolvedCompanyId, updatedAt: new Date() })
                  .where(eq(leads.id, sibling.id));
              });

              siblingsConverted++;
            } catch (siblingErr) {
              console.error(`[Qualify] Failed to auto-convert sibling lead #${sibling.id}:`, siblingErr);
            }
          }
        }

        return { qualified: true as const, customerId: newCustomerId, companyId: resolvedCompanyId, siblingsConverted };
      });

      // Invalidate Spotlight prefetch caches
      spotlightEngine.invalidateAllPrefetchCaches();

      console.log(`[Leads] Lead ${id} qualified → converted to customer ${result.customerId} by ${req.user?.email} (${result.siblingsConverted} siblings auto-converted)`);
      res.json(result);
    } catch (error) {
      console.error("Error qualifying lead:", error);
      res.status(500).json({ error: "Failed to qualify lead" });
    }
  });
  app.delete("/api/leads/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Delete activities first (cascade should handle this but being explicit)
      await db.delete(leadActivities).where(eq(leadActivities.leadId, id));
      
      const result = await db.delete(leads).where(eq(leads.id, id)).returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json({ success: true, deleted: result[0] });
    } catch (error) {
      console.error("Error deleting lead:", error);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });
  app.post("/api/leads/:id/push-to-odoo", isAuthenticated, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      if (isNaN(leadId)) return res.status(400).json({ error: 'Invalid lead ID' });
      const result = await pushLeadToOdooContact(leadId);
      if (!result.success && result.error === 'Lead not found') return res.status(404).json(result);
      if (!result.success) return res.status(500).json(result);
      res.json(result);
    } catch (error: any) {
      console.error("Error pushing lead to Odoo:", error);
      res.status(500).json({ error: error.message || 'Failed to push lead to Odoo' });
    }
  });
  app.post("/api/leads/bulk-email", isAuthenticated, async (req: any, res) => {
    try {
      const { leadIds, subject, body } = req.body;
      if (!leadIds?.length || !subject || !body) {
        return res.status(400).json({ error: 'leadIds, subject and body are required' });
      }

      const userId = (req.user as any)?.claims?.sub || req.user?.id;
      const { sendEmailAsUser, getUserGmailConnection } = await import('./user-gmail-oauth');
      const { sendEmail } = await import('./gmail-client');

      const userGmailConnection = userId ? await getUserGmailConnection(userId).catch(() => null) : null;
      const usePersonalGmail = !!(userGmailConnection?.isActive && userGmailConnection.scope?.includes('gmail.send'));

      const selectedLeads = await db.select().from(leads).where(inArray(leads.id, leadIds));

      let sent = 0;
      let failed = 0;

      for (const lead of selectedLeads) {
        if (!lead.email) { failed++; continue; }
        try {
          const personalizedSubject = subject
            .replace(/\{\{name\}\}/g, lead.name || lead.company || '')
            .replace(/\{\{company\}\}/g, lead.company || '');
          const personalizedBody = body
            .replace(/\{\{name\}\}/g, lead.name || lead.company || '')
            .replace(/\{\{company\}\}/g, lead.company || '');

          if (usePersonalGmail) {
            await sendEmailAsUser(userGmailConnection, lead.email, personalizedSubject, personalizedBody);
          } else {
            await sendEmail(lead.email, personalizedSubject, personalizedBody);
          }
          await db.update(leads).set({ lastContactAt: new Date() }).where(eq(leads.id, lead.id));
          sent++;
        } catch (e) {
          failed++;
        }
      }

      res.json({ sent, failed });
    } catch (error: any) {
      res.status(500).json({ error: 'Bulk email failed' });
    }
  });
  app.post("/api/leads/push-to-odoo-bulk", isAuthenticated, async (req: any, res) => {
    try {
      const { leadIds } = req.body;
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: 'leadIds array is required' });
      }
      const capped = leadIds.slice(0, 50);
      let pushed = 0, skipped = 0, failed = 0;
      const results: any[] = [];
      for (const id of capped) {
        try {
          const r = await pushLeadToOdooContact(Number(id));
          if (r.alreadyPushed) { skipped++; results.push({ id, status: 'skipped', odooPartnerId: r.odooPartnerId }); }
          else if (r.success) { pushed++; results.push({ id, status: 'pushed', odooPartnerId: r.odooPartnerId }); }
          else { failed++; results.push({ id, status: 'failed', error: r.error }); }
        } catch (e: any) {
          failed++;
          results.push({ id, status: 'failed', error: e.message });
        }
      }
      res.json({ pushed, skipped, failed, results });
    } catch (error: any) {
      console.error("Error bulk pushing leads to Odoo:", error);
      res.status(500).json({ error: error.message || 'Failed to bulk push leads to Odoo' });
    }
  });
  app.get("/api/leads/:id/convert-preview", isAuthenticated, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      if (isNaN(leadId)) return res.status(400).json({ error: 'Invalid lead ID' });
      const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      const [taskRow] = await db.select({ count: sql<number>`COUNT(*)::int` })
        .from(followUpTasks).where(eq(followUpTasks.leadId, leadId));
      const [noteRow] = await db.select({ count: sql<number>`COUNT(*)::int` })
        .from(leadActivities)
        .where(eq(leadActivities.leadId, leadId));

      let existingCustomer: { id: string; name: string } | null = null;
      const previewNorm = lead.emailNormalized || (lead.email ? normalizeEmail(lead.email) : null);
      if (previewNorm) {
        const [cust] = await db.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, company: customers.company })
          .from(customers).where(eq(customers.emailNormalized, previewNorm)).limit(1);
        if (cust) {
          existingCustomer = {
            id: cust.id,
            name: [cust.firstName, cust.lastName].filter(Boolean).join(' ') || cust.company || 'Unnamed',
          };
        }
      }

      res.json({
        taskCount: Number(taskRow?.count ?? 0),
        noteCount: Number(noteRow?.count ?? 0),
        existingCustomer,
        leadName: lead.name,
        leadEmail: lead.email,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/leads/:id/convert-to-customer", isAuthenticated, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      if (isNaN(leadId)) return res.status(400).json({ error: 'Invalid lead ID' });

      const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      const performedBy = (req.user as any)?.claims?.sub || req.user?.id || 'unknown';
      const performedByName = (req.user as any)?.claims?.email || req.user?.email || 'unknown';
      const conversionDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const conversionNote = `Converted from lead on ${conversionDate}.`;

      let customerId: string;
      let customerName: string;
      let isExisting = false;

      // Check if a customer already exists with this email
      // Primary: match by normalized email; fallback to raw email normalizer if lead lacks normalized
      let existingCustomer: typeof customers.$inferSelect | undefined;
      const lookupNorm = lead.emailNormalized || (lead.email ? normalizeEmail(lead.email) : null);
      if (lookupNorm) {
        const rows = await db.select().from(customers)
          .where(eq(customers.emailNormalized, lookupNorm))
          .limit(1);
        existingCustomer = rows[0];
      }

      await db.transaction(async (tx) => {
        if (existingCustomer) {
          // Merge: use existing customer, append notes and carry over kanban stage
          isExisting = true;
          customerId = existingCustomer.id;
          customerName = [existingCustomer.firstName, existingCustomer.lastName].filter(Boolean).join(' ')
            || existingCustomer.company || lead.name;

          const mergedNote = [
            existingCustomer.note,
            lead.description ? `[From lead] ${lead.description}` : null,
            lead.internalNotes ? `[Lead notes] ${lead.internalNotes}` : null,
            conversionNote,
          ].filter(Boolean).join('\n\n');

          const mergeUpdates: Record<string, unknown> = {
            note: mergedNote,
            updatedAt: new Date(),
          };
          // Carry over kanban stage if the existing customer doesn't have one
          if (!existingCustomer.salesKanbanStage && lead.salesKanbanStage) {
            mergeUpdates.salesKanbanStage = lead.salesKanbanStage;
          }

          await tx.update(customers)
            .set(mergeUpdates)
            .where(eq(customers.id, existingCustomer.id));
        } else {
          // Create new customer from lead
          const nameParts = (lead.name || '').split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          customerId = crypto.randomUUID();
          customerName = lead.name;

          const initialNote = [
            lead.description,
            lead.internalNotes ? `[Internal notes] ${lead.internalNotes}` : null,
            conversionNote,
          ].filter(Boolean).join('\n\n');

          await tx.insert(customers).values({
            id: customerId,
            firstName,
            lastName,
            company: lead.company || null,
            email: lead.email || null,
            emailNormalized: lead.emailNormalized || null,
            phone: lead.phone || null,
            cell: lead.mobile || null,
            address1: lead.street || null,
            address2: lead.street2 || null,
            city: lead.city || null,
            province: lead.state || null,
            zip: lead.zip || null,
            country: lead.country || null,
            website: lead.website || null,
            note: initialNote || null,
            tags: lead.tags || null,
            salesRepId: lead.salesRepId || null,
            salesRepName: lead.salesRepName || null,
            pricingTier: lead.pricingTier || null,
            pricingTierSetBy: lead.pricingTierSetBy || null,
            pricingTierSetAt: lead.pricingTierSetAt || null,
            customerType: lead.customerType || null,
            isCompany: lead.isCompany || false,
            salesKanbanStage: lead.salesKanbanStage || null,
            jobTitle: lead.jobTitle || null,
            companyDomain: lead.companyDomain || null,
            odooPartnerId: lead.sourceContactOdooPartnerId || lead.odooPartnerId || null,
            sources: ['converted_lead'],
          });
        }

        // Move all follow-up tasks from lead → customer
        await tx.update(followUpTasks)
          .set({ leadId: null, customerId })
          .where(eq(followUpTasks.leadId, leadId));

        // Migrate ALL lead activities (notes, calls, emails, etc.) → customerActivityEvents
        const allLeadActivities = await tx.select().from(leadActivities)
          .where(eq(leadActivities.leadId, leadId));
        for (const activity of allLeadActivities) {
          // Map lead activity types → valid ACTIVITY_EVENT_TYPES
          const eventTypeMap: Record<string, string> = {
            'note': 'note_added',
            'note_added': 'note_added',
            'email_sent': 'email_sent',
            'email_received': 'email_received',
            'call': 'call_made',
            'call_made': 'call_made',
            'meeting': 'meeting_completed',
            'meeting_scheduled': 'meeting_scheduled',
            'meeting_completed': 'meeting_completed',
            'sample_sent': 'note_added',
            'task': 'note_added',
          };
          const eventType = eventTypeMap[activity.activityType] || 'note_added';
          await tx.insert(customerActivityEvents).values({
            customerId,
            eventType,
            title: activity.summary || `${activity.activityType} (from lead)`,
            description: activity.details ?? undefined,
            sourceType: 'manual',
            createdBy: activity.performedBy ?? undefined,
            createdByName: activity.performedByName ?? undefined,
          });
        }

        // Add a conversion activity note to the customer
        await tx.insert(customerActivityEvents).values({
          customerId,
          eventType: 'note_added',
          title: conversionNote,
          sourceType: 'system',
          createdBy: performedBy,
          createdByName: performedByName,
        });

        // Link any gmail messages that match this lead's email to the customer
        if (lead.emailNormalized) {
          await tx.update(gmailMessages)
            .set({ customerId })
            .where(and(
              eq(gmailMessages.fromEmailNormalized, lead.emailNormalized),
              isNull(gmailMessages.customerId),
            ));
          await tx.update(gmailMessages)
            .set({ customerId })
            .where(and(
              eq(gmailMessages.toEmailNormalized, lead.emailNormalized),
              isNull(gmailMessages.customerId),
            ));
        }

        // Delete the lead (cascades to leadActivities)
        await tx.delete(leads).where(eq(leads.id, leadId));
      });

      // Invalidate caches
      setCachedData('leads', null);
      setCachedData('customers', null);

      res.json({ ok: true, customerId: customerId!, customerName: customerName!, isExisting });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      console.error('Convert lead error:', message);
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/leads/:id/activities", isAuthenticated, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const { followUpDate, followUpNote, ...bodyRest } = req.body;

      const data = insertLeadActivitySchema.parse({
        ...bodyRest,
        leadId,
        performedBy: req.user?.email,
        performedByName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : req.user?.email
      });
      
      const result = await db.insert(leadActivities).values(data).returning();
      
      // Update lead's touchpoint count and last contact date
      await db.update(leads)
        .set({
          totalTouchpoints: sql`${leads.totalTouchpoints} + 1`,
          lastContactAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId));

      // Auto-create follow-up task from call log (manual date or AI extraction)
      if (data.activityType === 'call_made') {
        try {
          let taskDueDate: Date | null = followUpDate ? new Date(followUpDate) : null;
          let taskNote = followUpNote || null;
          let taskType = 'call';

          // If no manual date provided, attempt AI extraction
          if (!taskDueDate && data.details) {
            const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
            if (anthropicKey) {
              try {
                const anthropic = new Anthropic({ apiKey: anthropicKey });
                const aiRes = await anthropic.messages.create({
                  model: 'claude-3-haiku-20240307',
                  max_tokens: 256,
                  messages: [{
                    role: 'user',
                    content: `Extract follow-up date and intent from these call notes. Reply in JSON only: { "date": "YYYY-MM-DD or null", "intent": "brief action string or null" }. Notes: "${data.details.substring(0, 500)}"`
                  }]
                });
                const rawText = aiRes.content[0]?.type === 'text' ? aiRes.content[0].text.trim() : '';
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (parsed.date && parsed.date !== 'null') {
                    taskDueDate = new Date(parsed.date);
                    if (isNaN(taskDueDate.getTime())) taskDueDate = null;
                    else taskNote = parsed.intent || taskNote;
                  }
                }
              } catch (aiError) {
                console.warn('[Tasks] AI follow-up extraction failed:', aiError);
              }
            }
          }

          if (taskDueDate && !isNaN(taskDueDate.getTime())) {
            const [lead] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, leadId));
            await storage.createFollowUpTask({
              leadId,
              customerId: null,
              title: `Call follow-up: ${lead?.name || 'Lead'}`,
              description: taskNote || `Follow up from call on ${new Date().toLocaleDateString()}`,
              taskType,
              priority: 'normal',
              status: 'pending',
              dueDate: taskDueDate,
              isAutoGenerated: !followUpDate,
              sourceType: 'call_log',
              sourceId: String(result[0].id),
              assignedTo: req.user?.id,
              assignedToName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user?.email,
            });
          }
        } catch (taskError) {
          console.warn('[Tasks] Failed to create call follow-up task:', taskError);
        }
      }
      
      res.status(201).json(result[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error adding lead activity:", error);
      res.status(500).json({ error: "Failed to add activity" });
    }
  });
  app.post("/api/leads/convert-from-contact", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.body;
      
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID is required" });
      }
      
      // Fetch the customer
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      
      if (customer.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      const c = customer[0];
      
      // Check if already converted (by email)
      if (c.emailNormalized) {
        const existingLead = await db.select().from(leads)
          .where(eq(leads.emailNormalized, c.emailNormalized))
          .limit(1);
        
        if (existingLead.length > 0) {
          return res.status(400).json({ error: "This contact is already a lead", existingLead: existingLead[0] });
        }
      }
      
      // Determine source origins
      const existsInOdooAsContact = Boolean(c.odooPartnerId);
      const existsInShopify = c.sources?.includes('shopify') || false;
      
      // Create the lead from customer data
      const leadData: any = {
        sourceType: 'converted_contact',
        sourceCustomerId: c.id,
        name: c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        email: c.email,
        emailNormalized: c.emailNormalized,
        phone: c.phone,
        mobile: c.cell,
        company: c.company,
        street: c.address1,
        street2: c.address2,
        city: c.city,
        state: c.province,
        zip: c.zip,
        country: c.country,
        website: c.website,
        stage: 'new',
        priority: 'medium',
        salesRepId: c.salesRepId,
        salesRepName: c.salesRepName,
        pricingTier: c.pricingTier,
        pricingTierSetBy: c.pricingTierSetBy,
        pricingTierSetAt: c.pricingTierSetAt,
        tags: c.tags,
        description: c.note,
        // Origin tracking
        existsInOdooAsContact,
        existsInShopify,
        sourceContactOdooPartnerId: c.odooPartnerId,
        // Trust-building tracking from contact
        swatchbookSentAt: c.swatchbookSentAt,
        priceListSentAt: c.priceListSentAt,
      };
      
      const result = await db.insert(leads).values(leadData).returning();
      
      // Log activity
      await db.insert(leadActivities).values({
        leadId: result[0].id,
        activityType: 'note',
        summary: `Converted from contact: ${c.company || c.id}`,
        performedBy: req.user?.email,
        performedByName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : req.user?.email
      });
      
      // Mark the customer as DNC so they don't appear in SPOTLIGHT as a contact
      await db.update(customers)
        .set({
          doNotContact: true,
          doNotContactReason: 'Converted to Lead',
          doNotContactSetBy: req.user?.email,
          doNotContactSetAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(customers.id, customerId));
      
      res.status(201).json({ lead: result[0] });
    } catch (error) {
      console.error("Error converting contact to lead:", error);
      res.status(500).json({ error: "Failed to convert contact to lead" });
    }
  });
  app.post("/api/leads/convert-zero-spending-contacts", requireApproval, async (req: any, res) => {
    try {
      console.log("[Leads] Starting OPTIMIZED batch conversion of $0 spending contacts to leads...");
      console.log("[Leads] Logic: Only move $0 COMPANIES (with their primary contact info) and orphan contacts without a parent");
      
      // Step 1: Get all $0 spending customers (companies AND contacts) in one query
      const zeroSpendingAll = await db.select().from(customers).where(
        and(
          or(
            eq(customers.totalSpent, "0"),
            eq(customers.totalSpent, "0.00"),
            isNull(customers.totalSpent)
          ),
          eq(customers.doNotContact, false)
        )
      );
      
      console.log(`[Leads] Found ${zeroSpendingAll.length} total records with $0 spending`);
      
      if (zeroSpendingAll.length === 0) {
        return res.json({
          success: true,
          message: 'No $0 spending contacts to convert',
          converted: 0,
          skipped: 0,
          total: 0,
          results: []
        });
      }
      
      // Separate into companies and contacts
      const zeroSpendingCompanies = zeroSpendingAll.filter(c => c.isCompany === true);
      const zeroSpendingContacts = zeroSpendingAll.filter(c => c.isCompany !== true);
      console.log(`[Leads] Breakdown: ${zeroSpendingCompanies.length} companies, ${zeroSpendingContacts.length} contacts`);
      
      // Step 2: Get ALL existing leads' normalized emails in one query (for duplicate check)
      const existingLeadEmails = await db.select({ emailNormalized: leads.emailNormalized })
        .from(leads)
        .where(isNotNull(leads.emailNormalized));
      const existingEmailSet = new Set(existingLeadEmails.map(e => e.emailNormalized).filter(Boolean));
      console.log(`[Leads] Found ${existingEmailSet.size} existing lead emails for dedup`);
      
      // Step 3: Get all child contacts for $0 companies (to attach primary contact to lead)
      const companyIds = zeroSpendingCompanies.map(c => c.id);
      const childContactsMap = new Map<string, typeof zeroSpendingAll[0]>();
      const childContactParentIds = new Set<string>(); // Track contacts that have a parent
      
      if (companyIds.length > 0) {
        const allChildContacts = await db.select().from(customers).where(
          inArray(customers.parentCustomerId, companyIds)
        );
        // Map first child contact per parent, and track all child contact IDs
        for (const child of allChildContacts) {
          if (child.parentCustomerId) {
            childContactParentIds.add(child.id);
            if (!childContactsMap.has(child.parentCustomerId)) {
              childContactsMap.set(child.parentCustomerId, child);
            }
          }
        }
        console.log(`[Leads] Found ${allChildContacts.length} child contacts under ${companyIds.length} $0 companies (will be included with their company, not as separate leads)`);
      }
      
      // Step 4: For orphan contacts (no parent), check if they have a parent company with spending
      // Get all parent company IDs for contacts that have a parent
      const contactsWithParent = zeroSpendingContacts.filter(c => c.parentCustomerId);
      const parentIdsToCheck = [...new Set(contactsWithParent.map(c => c.parentCustomerId as string))];
      
      const parentCompaniesWithSpending = new Set<string>();
      const parentCompaniesZeroSpending = new Set<string>();
      
      if (parentIdsToCheck.length > 0) {
        // Check which parents have spending
        const parentsWithSpending = await db.select({ id: customers.id })
          .from(customers)
          .where(
            and(
              inArray(customers.id, parentIdsToCheck),
              not(or(
                eq(customers.totalSpent, "0"),
                eq(customers.totalSpent, "0.00"),
                isNull(customers.totalSpent)
              ))
            )
          );
        parentsWithSpending.forEach(p => parentCompaniesWithSpending.add(p.id));
        
        // Parents with $0 spending (their contacts should NOT be added separately)
        const parentsZeroSpending = await db.select({ id: customers.id })
          .from(customers)
          .where(
            and(
              inArray(customers.id, parentIdsToCheck),
              or(
                eq(customers.totalSpent, "0"),
                eq(customers.totalSpent, "0.00"),
                isNull(customers.totalSpent)
              )
            )
          );
        parentsZeroSpending.forEach(p => parentCompaniesZeroSpending.add(p.id));
        
        console.log(`[Leads] Parent companies: ${parentCompaniesWithSpending.size} have purchases (contacts skipped), ${parentCompaniesZeroSpending.size} have $0 (contacts handled via company)`);
      }
      
      // Step 5: Prepare lead records for batch insert
      const leadsToInsert: any[] = [];
      const contactsToConvert: typeof zeroSpendingAll = [];
      let skipped = 0;
      let skippedParentHasSpending = 0;
      let skippedChildOfZeroCompany = 0;
      
      // First: Add all $0 COMPANIES as leads (with their primary contact info)
      for (const company of zeroSpendingCompanies) {
        // Skip if already a lead (by normalized email)
        if (company.emailNormalized && existingEmailSet.has(company.emailNormalized)) {
          skipped++;
          continue;
        }
        
        const existsInOdooAsContact = Boolean(company.odooPartnerId);
        const existsInShopify = company.sources?.includes('shopify') || false;
        
        // Get primary contact from pre-fetched map
        const child = childContactsMap.get(company.id);
        const primaryContactName = child ? `${child.firstName || ''} ${child.lastName || ''}`.trim() || undefined : undefined;
        const primaryContactEmail = child ? child.email || undefined : undefined;
        
        leadsToInsert.push({
          sourceType: 'converted_contact',
          sourceCustomerId: company.id,
          name: company.company || 'Unknown Company',
          email: company.email,
          emailNormalized: company.emailNormalized,
          phone: company.phone,
          mobile: company.cell,
          company: company.company,
          street: company.address1,
          street2: company.address2,
          city: company.city,
          state: company.province,
          zip: company.zip,
          country: company.country,
          website: company.website,
          stage: 'new',
          priority: 'medium',
          salesRepId: company.salesRepId,
          salesRepName: company.salesRepName,
          pricingTier: company.pricingTier,
          pricingTierSetBy: company.pricingTierSetBy,
          pricingTierSetAt: company.pricingTierSetAt,
          tags: company.tags,
          description: company.note,
          existsInOdooAsContact,
          existsInShopify,
          sourceContactOdooPartnerId: company.odooPartnerId,
          isCompany: true,
          primaryContactName,
          primaryContactEmail,
          swatchbookSentAt: company.swatchbookSentAt,
          priceListSentAt: company.priceListSentAt,
        });
        
        contactsToConvert.push(company);
      }
      
      console.log(`[Leads] Added ${leadsToInsert.length} companies as leads`);
      
      // Second: Add ORPHAN contacts (no parent company) as leads
      for (const contact of zeroSpendingContacts) {
        // Skip if already a lead (by normalized email)
        if (contact.emailNormalized && existingEmailSet.has(contact.emailNormalized)) {
          skipped++;
          continue;
        }
        
        // Skip if this contact has a parent company with purchases
        if (contact.parentCustomerId && parentCompaniesWithSpending.has(contact.parentCustomerId)) {
          skippedParentHasSpending++;
          continue;
        }
        
        // Skip if this contact has a $0 parent company (they'll be handled via the company lead)
        if (contact.parentCustomerId && parentCompaniesZeroSpending.has(contact.parentCustomerId)) {
          skippedChildOfZeroCompany++;
          continue;
        }
        
        // This is an orphan contact (no parent) - add as its own lead
        const existsInOdooAsContact = Boolean(contact.odooPartnerId);
        const existsInShopify = contact.sources?.includes('shopify') || false;
        
        leadsToInsert.push({
          sourceType: 'converted_contact',
          sourceCustomerId: contact.id,
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company || 'Unknown',
          email: contact.email,
          emailNormalized: contact.emailNormalized,
          phone: contact.phone,
          mobile: contact.cell,
          company: contact.company,
          street: contact.address1,
          street2: contact.address2,
          city: contact.city,
          state: contact.province,
          zip: contact.zip,
          country: contact.country,
          website: contact.website,
          stage: 'new',
          priority: 'medium',
          salesRepId: contact.salesRepId,
          salesRepName: contact.salesRepName,
          pricingTier: contact.pricingTier,
          pricingTierSetBy: contact.pricingTierSetBy,
          pricingTierSetAt: contact.pricingTierSetAt,
          tags: contact.tags,
          description: contact.note,
          existsInOdooAsContact,
          existsInShopify,
          sourceContactOdooPartnerId: contact.odooPartnerId,
          isCompany: false,
          swatchbookSentAt: contact.swatchbookSentAt,
          priceListSentAt: contact.priceListSentAt,
        });
        
        contactsToConvert.push(contact);
      }
      
      console.log(`[Leads] Total leads to insert: ${leadsToInsert.length} (companies + orphan contacts)`);
      
      console.log(`[Leads] Prepared ${leadsToInsert.length} leads for insertion, ${skipped} skipped (already leads)`);
      
      if (leadsToInsert.length === 0) {
        return res.json({
          success: true,
          message: 'All $0 spending contacts are already leads',
          converted: 0,
          skipped,
          total: zeroSpendingContacts.length,
          results: []
        });
      }
      
      // Step 5: Batch insert leads (100 at a time)
      const BATCH_SIZE = 100;
      const insertedLeads: any[] = [];
      
      for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
        const batch = leadsToInsert.slice(i, i + BATCH_SIZE);
        const inserted = await db.insert(leads).values(batch).returning();
        insertedLeads.push(...inserted);
        console.log(`[Leads] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted.length} leads`);
      }
      
      // Step 6: Batch insert activities (100 at a time)
      const activitiesToInsert = insertedLeads.map((lead, idx) => {
        const c = contactsToConvert[idx];
        const isCompany = c.isCompany || false;
        const child = isCompany ? childContactsMap.get(c.id) : undefined;
        const primaryContactName = child ? `${child.firstName || ''} ${child.lastName || ''}`.trim() : undefined;
        
        return {
          leadId: lead.id,
          activityType: 'note' as const,
          summary: `Batch converted from ${isCompany ? 'company' : 'contact'} with $0 spending: ${c.company || c.id}${primaryContactName ? ` (Primary contact: ${primaryContactName})` : ''}`,
          performedBy: req.user?.email,
          performedByName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : req.user?.email
        };
      });
      
      for (let i = 0; i < activitiesToInsert.length; i += BATCH_SIZE) {
        const batch = activitiesToInsert.slice(i, i + BATCH_SIZE);
        await db.insert(leadActivities).values(batch);
        console.log(`[Leads] Inserted activity batch ${Math.floor(i / BATCH_SIZE) + 1}`);
      }
      
      const results = insertedLeads.map((lead, idx) => {
        const c = contactsToConvert[idx];
        const child = c.isCompany ? childContactsMap.get(c.id) : undefined;
        return {
          id: lead.id,
          name: lead.name,
          existsInOdooAsContact: Boolean(c.odooPartnerId),
          existsInShopify: c.sources?.includes('shopify') || false,
          isCompany: c.isCompany || false,
          primaryContactName: child ? `${child.firstName || ''} ${child.lastName || ''}`.trim() || undefined : undefined
        };
      });
      
      console.log(`[Leads] Batch conversion complete: ${insertedLeads.length} converted, ${skipped} skipped (already leads), ${skippedParentHasSpending} skipped (parent has purchases), ${skippedChildOfZeroCompany} skipped (child of $0 company - handled via company lead)`);
      
      res.json({
        success: true,
        message: `Converted ${insertedLeads.length} leads (${zeroSpendingCompanies.length - skipped} companies + orphan contacts). Skipped: ${skippedParentHasSpending} (parent has purchases), ${skippedChildOfZeroCompany} (child contacts handled via their company)`,
        converted: insertedLeads.length,
        skipped,
        skippedParentHasSpending,
        skippedChildOfZeroCompany,
        totalCompanies: zeroSpendingCompanies.length,
        totalContacts: zeroSpendingContacts.length,
        total: zeroSpendingAll.length,
        results
      });
    } catch (error) {
      console.error("Error batch converting contacts to leads:", error);
      res.status(500).json({ error: "Failed to batch convert contacts to leads" });
    }
  });
  app.post("/api/leads/import-from-odoo", isAuthenticated, async (req: any, res) => {
    try {
      const { odooClient: odoo } = await import('./odoo');
      const { determineSalesRep, SALES_REPS } = await import('./sales-rep-auto-assign');
      
      console.log("[Leads] Starting Odoo lead import (optimized batch mode)...");
      
      // Fetch all leads from Odoo
      const odooLeads = await odoo.getAllLeads('lead'); // Only import actual leads, not opportunities
      
      console.log(`[Leads] Found ${odooLeads.length} leads in Odoo`);
      
      // Get all existing customer emails to skip leads that are already contacts (single query)
      const existingCustomerEmails = await db.select({ emailNormalized: customers.emailNormalized })
        .from(customers)
        .where(isNotNull(customers.emailNormalized));
      const customerEmailSet = new Set(existingCustomerEmails.map(c => c.emailNormalized?.toLowerCase()));
      console.log(`[Leads] Found ${customerEmailSet.size} existing customer emails to check against`);
      
      // Get ALL existing leads by odooLeadId in a single query
      const existingLeads = await db.select({ id: leads.id, odooLeadId: leads.odooLeadId, salesRepId: leads.salesRepId })
        .from(leads)
        .where(isNotNull(leads.odooLeadId));
      const existingLeadsMap = new Map(existingLeads.map(l => [l.odooLeadId, l]));
      console.log(`[Leads] Found ${existingLeadsMap.size} existing leads in database`);
      
      // Round-robin counter for distributing leads without location rules
      const salesRepOrder = [SALES_REPS.aneesh, SALES_REPS.patricio, SALES_REPS.santiago];
      let roundRobinIndex = 0;
      
      // Prepare batch arrays
      const toInsert: any[] = [];
      const toUpdate: { odooLeadId: number; data: any }[] = [];
      let skippedExistingCustomer = 0;
      
      let skippedFreight = 0;

      // Process all leads (fast in-memory filtering)
      for (const ol of odooLeads) {
        // Skip leads whose email already exists in customers (Contacts)
        const leadEmailNormalized = ol.email_from ? normalizeEmail(ol.email_from) : null;
        if (leadEmailNormalized && customerEmailSet.has(leadEmailNormalized.toLowerCase())) {
          skippedExistingCustomer++;
          continue;
        }

        // Skip freight/shipping/ocean contacts
        const leadCompany = ol.partner_name || '';
        const leadName = ol.contact_name || ol.name || '';
        if (isFreightContact(leadCompany) || isFreightContact(leadName)) {
          console.log(`[Leads Import] Skipping freight/shipping contact: ${leadCompany || leadName}`);
          skippedFreight++;
          continue;
        }
        
        // Determine sales rep assignment based on location rules
        const country = ol.country_id ? ol.country_id[1] : null;
        const state = ol.state_id ? ol.state_id[1] : null;
        let assignedRep = determineSalesRep({ country, province: state });
        
        // If no location rule matches, use round-robin distribution
        if (!assignedRep) {
          assignedRep = salesRepOrder[roundRobinIndex % salesRepOrder.length];
          roundRobinIndex++;
        }
        
        const leadData: any = {
          odooLeadId: ol.id,
          sourceType: 'odoo',
          name: ol.contact_name || ol.name || 'Unknown',
          email: ol.email_from || null,
          emailNormalized: leadEmailNormalized,
          phone: ol.phone || null,
          mobile: ol.mobile || null,
          company: ol.partner_name || null,
          jobTitle: ol.function || null,
          website: ol.website || null,
          street: ol.street || null,
          street2: ol.street2 || null,
          city: ol.city || null,
          state: state,
          zip: ol.zip || null,
          country: country,
          description: ol.description || null,
          stage: 'new',
          priority: ol.priority === '3' ? 'high' : ol.priority === '2' ? 'medium' : 'low',
          probability: ol.probability ? Math.round(Number(ol.probability)) : 10,
          expectedRevenue: ol.expected_revenue ? String(ol.expected_revenue) : null,
          salesRepId: assignedRep.id,
          salesRepName: assignedRep.name,
          odooWriteDate: ol.write_date ? new Date(ol.write_date) : null,
          lastOdooSyncAt: new Date(),
          updatedAt: new Date(),
        };
        
        const existing = existingLeadsMap.get(ol.id);
        if (existing) {
          // Keep existing salesRep if already set
          if (existing.salesRepId) {
            delete leadData.salesRepId;
            delete leadData.salesRepName;
          }
          toUpdate.push({ odooLeadId: ol.id, data: leadData });
        } else {
          toInsert.push(leadData);
        }
      }
      
      console.log(`[Leads] Batch processing: ${toInsert.length} to insert, ${toUpdate.length} to update`);
      
      // Batch insert new leads (chunks of 100)
      let imported = 0;
      const BATCH_SIZE = 100;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        await db.insert(leads).values(batch);
        imported += batch.length;
        console.log(`[Leads] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${imported}/${toInsert.length}`);
      }
      
      // Batch update existing leads (chunks of 50 for updates)
      let updated = 0;
      const UPDATE_BATCH_SIZE = 50;
      for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + UPDATE_BATCH_SIZE);
        await Promise.all(batch.map(item => 
          db.update(leads).set(item.data).where(eq(leads.odooLeadId, item.odooLeadId))
        ));
        updated += batch.length;
        if (i % 200 === 0) {
          console.log(`[Leads] Updated batch: ${updated}/${toUpdate.length}`);
        }
      }
      
      console.log(`[Leads] Import complete: ${imported} new, ${updated} updated, ${skippedExistingCustomer} skipped (already in Contacts), ${skippedFreight} skipped (freight/shipping/ocean)`);

      // --- Cleanup: delete local leads whose Odoo ID no longer exists in Odoo ---
      // These were deleted in Odoo, so remove them here too (skip converted leads)
      let deleted = 0;
      const odooLeadIdSet = new Set(odooLeads.map((l: any) => l.id));
      const localLeadsWithOdooId = await db.select({ id: leads.id, odooLeadId: leads.odooLeadId, stage: leads.stage })
        .from(leads)
        .where(isNotNull(leads.odooLeadId));

      const toDelete = localLeadsWithOdooId.filter(l =>
        l.odooLeadId !== null &&
        !odooLeadIdSet.has(l.odooLeadId) &&
        l.stage !== 'converted'
      );

      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map(l => l.id);
        console.log(`[Leads] Deleting ${idsToDelete.length} leads removed from Odoo: ${idsToDelete.slice(0, 10).join(', ')}${idsToDelete.length > 10 ? '...' : ''}`);
        const BATCH_DEL = 100;
        for (let i = 0; i < idsToDelete.length; i += BATCH_DEL) {
          await db.delete(leads).where(inArray(leads.id, idsToDelete.slice(i, i + BATCH_DEL)));
        }
        deleted = idsToDelete.length;
      }

      res.json({
        success: true,
        imported,
        updated,
        deleted,
        skipped: 0,
        skippedExistingCustomer,
        skippedFreight,
        total: odooLeads.length
      });
    } catch (error) {
      console.error("Error importing leads from Odoo:", error);
      res.status(500).json({ error: "Failed to import leads from Odoo" });
    }
  });
  app.patch("/api/leads/:id/kanban-stage", isAuthenticated, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const { stage } = req.body;
      await db.update(leads).set({ salesKanbanStage: stage }).where(eq(leads.id, leadId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update kanban stage" });
    }
  });
}
