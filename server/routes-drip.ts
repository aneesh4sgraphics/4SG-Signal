import type { Express } from "express";
import { db } from "./db";
import { eq, sql, or, desc, not, inArray } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "./replitAuth";
import { storage } from "./storage";
import {
  customers,
  leads,
  dripCampaigns,
  dripCampaignSteps,
  dripCampaignAssignments,
  dripCampaignStepStatus,
} from "@shared/schema";
import zipcodes from "zipcodes";

// ─── State normalization helpers ──────────────────────────────────────────────
const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};
const FULL_TO_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([abbr, full]) => [full.toLowerCase(), abbr])
);

function normalizeStateToAbbr(raw: string): string {
  if (!raw) return '';
  // strip trailing " (US)", " (CA)" etc.
  const s = raw.trim().replace(/\s*\([^)]+\)\s*$/, '').trim();
  if (US_STATES[s.toUpperCase()]) return s.toUpperCase();
  return FULL_TO_ABBR[s.toLowerCase()] || '';
}

function stateInputToAbbr(input: string): string {
  const upper = input.trim().toUpperCase();
  if (US_STATES[upper]) return upper;
  return FULL_TO_ABBR[input.trim().toLowerCase()] || '';
}

async function scheduleStepsForAssignment(assignmentId: number, steps: any[], startDate: Date) {
  let scheduledTime = new Date(startDate);
  for (const step of steps) {
    // Add delay based on unit
    if (step.delayAmount > 0) {
      switch (step.delayUnit) {
        case 'minutes':
          scheduledTime = new Date(scheduledTime.getTime() + step.delayAmount * 60 * 1000);
          break;
        case 'hours':
          scheduledTime = new Date(scheduledTime.getTime() + step.delayAmount * 60 * 60 * 1000);
          break;
        case 'weeks':
          scheduledTime = new Date(scheduledTime.getTime() + step.delayAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'days':
        default:
          scheduledTime = new Date(scheduledTime.getTime() + step.delayAmount * 24 * 60 * 60 * 1000);
          break;
      }
    }
    
    await storage.createDripCampaignStepStatus({
      assignmentId,
      stepId: step.id,
      scheduledFor: scheduledTime,
      status: 'scheduled',
    });
  }
}

// Update assignment status (pause, resume, cancel)


export function registerDripRoutes(app: Express): void {
  app.get("/api/drip-campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const campaigns = await storage.getDripCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching drip campaigns:", error);
      res.status(500).json({ error: "Failed to fetch drip campaigns" });
    }
  });
  app.get("/api/drip-campaigns/assignment-counts", isAuthenticated, async (req: any, res) => {
    try {
      const counts = await storage.getDripCampaignAssignmentCounts();
      res.json(counts);
    } catch (error) {
      console.error("Error fetching drip campaign assignment counts:", error);
      res.status(500).json({ error: "Failed to fetch assignment counts" });
    }
  });
  // ─── Filter options (distinct values for dropdowns) ────────────────────────
  app.get("/api/drip-campaigns/filter-options", isAuthenticated, async (req: any, res) => {
    try {
      const type = (req.query.type as string) || 'lead';
      if (type === 'lead') {
        const [stagesRes, tiersRes, repsRes] = await Promise.all([
          db.execute(sql`SELECT DISTINCT stage FROM leads WHERE stage IS NOT NULL AND stage != '' ORDER BY stage`),
          db.execute(sql`SELECT DISTINCT pricing_tier FROM leads WHERE pricing_tier IS NOT NULL AND pricing_tier != '' ORDER BY pricing_tier`),
          db.execute(sql`SELECT DISTINCT sales_rep_name FROM leads WHERE sales_rep_name IS NOT NULL AND sales_rep_name != '' ORDER BY sales_rep_name`),
        ]);
        res.json({
          stages: stagesRes.rows.map((r: any) => r.stage),
          pricingTiers: tiersRes.rows.map((r: any) => r.pricing_tier),
          reps: repsRes.rows.map((r: any) => r.sales_rep_name),
        });
      } else {
        const [tiersRes, repsRes] = await Promise.all([
          db.execute(sql`SELECT DISTINCT pricing_tier FROM customers WHERE pricing_tier IS NOT NULL AND pricing_tier != '' ORDER BY pricing_tier`),
          db.execute(sql`SELECT DISTINCT sales_rep_name FROM customers WHERE sales_rep_name IS NOT NULL AND sales_rep_name != '' ORDER BY sales_rep_name`),
        ]);
        res.json({
          stages: [],
          pricingTiers: tiersRes.rows.map((r: any) => r.pricing_tier),
          reps: repsRes.rows.map((r: any) => r.sales_rep_name),
        });
      }
    } catch (err) {
      console.error("filter-options error:", err);
      res.status(500).json({ error: "Failed to fetch filter options" });
    }
  });

  // ─── Filter recipients (smart multi-criteria search) ─────────────────────
  app.get("/api/drip-campaigns/filter-recipients", isAuthenticated, async (req: any, res) => {
    try {
      const type = (req.query.type as string) || 'lead';
      const search = ((req.query.search as string) || '').toLowerCase();
      const statesRaw = req.query.states
        ? (Array.isArray(req.query.states) ? req.query.states : [req.query.states]) as string[]
        : [];
      const stagesRaw = req.query.stages
        ? (Array.isArray(req.query.stages) ? req.query.stages : [req.query.stages]) as string[]
        : [];
      const tiersRaw = req.query.pricingTiers
        ? (Array.isArray(req.query.pricingTiers) ? req.query.pricingTiers : [req.query.pricingTiers]) as string[]
        : [];
      const assignedRep = ((req.query.assignedRep as string) || '').toLowerCase();
      const lastContactedAfter = req.query.lastContactedAfter as string | undefined;
      const lastContactedBefore = req.query.lastContactedBefore as string | undefined;
      const lastMailerAfter = req.query.lastMailerAfter as string | undefined;
      const lastMailerBefore = req.query.lastMailerBefore as string | undefined;
      const neverMailed = req.query.neverMailed === 'true';
      const zipCode = (req.query.zipCode as string || '').replace(/\D/g, '').substring(0, 5);
      const milesRadius = req.query.milesRadius ? parseInt(req.query.milesRadius as string) : 0;

      // Normalize selected states to abbreviations
      const selectedAbbrs = statesRaw.map(stateInputToAbbr).filter(Boolean);

      // Build zip set for radius filter
      let zipSet: Set<string> | undefined;
      if (zipCode.length === 5 && milesRadius > 0) {
        const nearby = zipcodes.radius(zipCode, milesRadius) as string[];
        zipSet = new Set(nearby);
      }

      let results: any[] = [];

      if (type === 'lead') {
        const rows = await db.select({
          id: leads.id,
          name: leads.name,
          email: leads.email,
          company: leads.company,
          state: leads.state,
          zip: leads.zip,
          stage: leads.stage,
          pricingTier: leads.pricingTier,
          salesRepName: leads.salesRepName,
          lastContactAt: leads.lastContactAt,
          lastMailerSentAt: leads.lastMailerSentAt,
        }).from(leads).limit(4000);

        results = rows
          .filter(r => {
            if (search && !`${r.name || ''} ${r.email || ''} ${r.company || ''}`.toLowerCase().includes(search)) return false;
            if (selectedAbbrs.length > 0 && !selectedAbbrs.includes(normalizeStateToAbbr(r.state || ''))) return false;
            if (stagesRaw.length > 0 && !stagesRaw.includes(r.stage || '')) return false;
            if (tiersRaw.length > 0 && !tiersRaw.includes(r.pricingTier || '')) return false;
            if (assignedRep && !(r.salesRepName || '').toLowerCase().includes(assignedRep)) return false;
            if (lastContactedAfter && (!r.lastContactAt || new Date(r.lastContactAt) < new Date(lastContactedAfter))) return false;
            if (lastContactedBefore && r.lastContactAt && new Date(r.lastContactAt) > new Date(lastContactedBefore)) return false;
            if (neverMailed && r.lastMailerSentAt) return false;
            if (lastMailerAfter && (!r.lastMailerSentAt || new Date(r.lastMailerSentAt) < new Date(lastMailerAfter))) return false;
            if (lastMailerBefore && r.lastMailerSentAt && new Date(r.lastMailerSentAt) > new Date(lastMailerBefore)) return false;
            if (zipSet && r.zip) {
              const clean = (r.zip || '').trim().replace(/\D/g, '').substring(0, 5);
              if (!zipSet.has(clean)) return false;
            } else if (zipSet && !r.zip) return false;
            return true;
          })
          .slice(0, 500)
          .map(r => ({
            id: String(r.id),
            label: r.name || r.email || `Lead #${r.id}`,
            sublabel: [r.company, r.state].filter(Boolean).join(' · '),
            email: r.email,
            type: 'lead',
          }));
      } else {
        const rows = await db.select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          company: customers.company,
          email: customers.email,
          province: customers.province,
          zip: customers.zip,
          pricingTier: customers.pricingTier,
          salesRepName: customers.salesRepName,
          lastOutboundEmailAt: customers.lastOutboundEmailAt,
          swatchbookSentAt: customers.swatchbookSentAt,
        }).from(customers).limit(4000);

        results = rows
          .filter(r => {
            const fullName = `${r.firstName || ''} ${r.lastName || ''}`.trim();
            if (search && !`${fullName} ${r.company || ''} ${r.email || ''}`.toLowerCase().includes(search)) return false;
            if (selectedAbbrs.length > 0 && !selectedAbbrs.includes(normalizeStateToAbbr(r.province || ''))) return false;
            if (tiersRaw.length > 0 && !tiersRaw.includes(r.pricingTier || '')) return false;
            if (assignedRep && !(r.salesRepName || '').toLowerCase().includes(assignedRep)) return false;
            if (lastContactedAfter && (!r.lastOutboundEmailAt || new Date(r.lastOutboundEmailAt) < new Date(lastContactedAfter))) return false;
            if (lastContactedBefore && r.lastOutboundEmailAt && new Date(r.lastOutboundEmailAt) > new Date(lastContactedBefore)) return false;
            if (neverMailed && r.swatchbookSentAt) return false;
            if (lastMailerAfter && (!r.swatchbookSentAt || new Date(r.swatchbookSentAt) < new Date(lastMailerAfter))) return false;
            if (lastMailerBefore && r.swatchbookSentAt && new Date(r.swatchbookSentAt) > new Date(lastMailerBefore)) return false;
            if (zipSet && r.zip) {
              const clean = (r.zip || '').trim().replace(/\D/g, '').substring(0, 5);
              if (!zipSet.has(clean)) return false;
            } else if (zipSet && !r.zip) return false;
            return true;
          })
          .slice(0, 500)
          .map(r => ({
            id: String(r.id),
            label: r.company || `${r.firstName || ''} ${r.lastName || ''}`.trim() || `Customer #${r.id}`,
            sublabel: [r.province, r.zip].filter(Boolean).join(', '),
            email: r.email,
            type: 'customer',
          }));
      }

      res.json(results);
    } catch (err) {
      console.error("filter-recipients error:", err);
      res.status(500).json({ error: "Failed to filter recipients" });
    }
  });

  app.get("/api/drip-campaigns/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const campaign = await storage.getDripCampaign(id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const steps = await storage.getDripCampaignSteps(id);
      res.json({ ...campaign, steps });
    } catch (error) {
      console.error("Error fetching drip campaign:", error);
      res.status(500).json({ error: "Failed to fetch drip campaign" });
    }
  });
  app.post("/api/drip-campaigns", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { name, description, isActive, triggerType } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      
      const campaign = await storage.createDripCampaign({
        name,
        description,
        isActive: isActive || false,
        triggerType: triggerType || 'manual',
        createdBy: req.user?.email,
      });
      
      res.json(campaign);
    } catch (error) {
      console.error("Error creating drip campaign:", error);
      res.status(500).json({ error: "Failed to create drip campaign" });
    }
  });
  app.patch("/api/drip-campaigns/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, isActive, triggerType, settings } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (triggerType !== undefined) updateData.triggerType = triggerType;
      if (settings !== undefined) updateData.settings = settings;
      
      const campaign = await storage.updateDripCampaign(id, updateData);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      res.json(campaign);
    } catch (error) {
      console.error("Error updating drip campaign:", error);
      res.status(500).json({ error: "Failed to update drip campaign" });
    }
  });
  app.delete("/api/drip-campaigns/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteDripCampaign(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting drip campaign:", error);
      res.status(500).json({ error: "Failed to delete drip campaign" });
    }
  });
  app.get("/api/drip-campaigns/:campaignId/steps", isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const steps = await storage.getDripCampaignSteps(campaignId);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching drip campaign steps:", error);
      res.status(500).json({ error: "Failed to fetch drip campaign steps" });
    }
  });
  app.post("/api/drip-campaigns/:campaignId/steps", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { name, subject, body, delayAmount, delayUnit, stepOrder, templateId, attachments, variables, isActive } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Step name is required" });
      }
      
      // Get current max step order
      const existingSteps = await storage.getDripCampaignSteps(campaignId);
      const maxOrder = existingSteps.length > 0 ? Math.max(...existingSteps.map(s => s.stepOrder)) : 0;
      
      const step = await storage.createDripCampaignStep({
        campaignId,
        name,
        subject: subject || '',
        body: body || '',
        delayAmount: delayAmount || 0,
        delayUnit: delayUnit || 'days',
        stepOrder: stepOrder || maxOrder + 1,
        templateId: templateId || null,
        attachments: attachments || [],
        variables: variables || [],
        isActive: isActive !== false,
      });
      
      res.json(step);
    } catch (error) {
      console.error("Error creating drip campaign step:", error);
      res.status(500).json({ error: "Failed to create drip campaign step" });
    }
  });
  app.patch("/api/drip-campaigns/:campaignId/steps/:stepId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const stepId = parseInt(req.params.stepId);
      const { name, subject, body, delayAmount, delayUnit, stepOrder, templateId, attachments, variables, isActive } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (subject !== undefined) updateData.subject = subject;
      if (body !== undefined) updateData.body = body;
      if (delayAmount !== undefined) updateData.delayAmount = delayAmount;
      if (delayUnit !== undefined) updateData.delayUnit = delayUnit;
      if (stepOrder !== undefined) updateData.stepOrder = stepOrder;
      if (templateId !== undefined) updateData.templateId = templateId;
      if (attachments !== undefined) updateData.attachments = attachments;
      if (variables !== undefined) updateData.variables = variables;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const step = await storage.updateDripCampaignStep(stepId, updateData);
      if (!step) {
        return res.status(404).json({ error: "Step not found" });
      }
      
      res.json(step);
    } catch (error) {
      console.error("Error updating drip campaign step:", error);
      res.status(500).json({ error: "Failed to update drip campaign step" });
    }
  });
  app.delete("/api/drip-campaigns/:campaignId/steps/:stepId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const stepId = parseInt(req.params.stepId);
      await storage.deleteDripCampaignStep(stepId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting drip campaign step:", error);
      res.status(500).json({ error: "Failed to delete drip campaign step" });
    }
  });
  app.post("/api/drip-campaigns/:campaignId/steps/reorder", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { stepIds } = req.body;
      
      if (!Array.isArray(stepIds)) {
        return res.status(400).json({ error: "stepIds must be an array" });
      }
      
      await storage.reorderDripCampaignSteps(campaignId, stepIds);
      const steps = await storage.getDripCampaignSteps(campaignId);
      res.json(steps);
    } catch (error) {
      console.error("Error reordering drip campaign steps:", error);
      res.status(500).json({ error: "Failed to reorder drip campaign steps" });
    }
  });
  app.post("/api/drip-campaigns/:campaignId/steps/:stepId/test-send", isAuthenticated, async (req: any, res) => {
    try {
      const stepId   = parseInt(req.params.stepId);
      const { recipientType, recipientId } = req.body as {
        recipientType: 'lead' | 'customer';
        recipientId: string;
      };

      // 1. Get the drip step + campaign settings
      const [step] = await db.select().from(dripCampaignSteps).where(eq(dripCampaignSteps.id, stepId));
      if (!step) return res.status(404).json({ error: 'Step not found' });

      const campaignId = parseInt(req.params.campaignId);
      const [campaign] = await db.select().from(dripCampaigns).where(eq(dripCampaigns.id, campaignId));
      const campaignSettings = (campaign?.settings || {}) as any;

      // 2. Gather recipient info
      let firstName = '', lastName = '', company = '', recipientEmail = '';
      if (recipientType === 'lead') {
        const [lead] = await db.select().from(leads).where(eq(leads.id, parseInt(recipientId)));
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        const nameParts = (lead.name || '').split(' ');
        firstName = nameParts[0] || '';
        lastName  = nameParts.slice(1).join(' ');
        company   = lead.company || '';
        recipientEmail = lead.email || '';
      } else {
        const [cust] = await db.select().from(customers).where(eq(customers.id, recipientId));
        if (!cust) return res.status(404).json({ error: 'Customer not found' });
        firstName = cust.firstName || '';
        lastName  = cust.lastName  || '';
        company   = cust.company   || '';
        recipientEmail = cust.email || '';
      }

      // 3. Fetch logged-in user so we can use their name in variable substitution
      const authUserId = (req.user as any)?.claims?.sub || req.user?.userId || req.user?.id;
      const dbUser = await storage.getUser(authUserId);
      const senderName = [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(' ') || '4S Graphics Team';

      // Variable substitution (mirror replaceVariables logic)
      const recipientName = `${firstName} ${lastName}`.trim() || company || 'Valued Customer';
      const replacements: Record<string, string> = {
        'First Name': firstName, 'Last Name': lastName, 'Full Name': recipientName,
        'Email': recipientEmail, 'Company': company,
        'Sales Rep Name': senderName, 'Unsubscribe Link': '#unsubscribe',
        'client.first_name': firstName, 'client.last_name': lastName,
        'client.company': company, 'client.email': recipientEmail, 'client.name': recipientName,
        'customer.first_name': firstName, 'customer.last_name': lastName,
        'customer.company': company, 'customer.email': recipientEmail, 'customer.name': recipientName,
        'company_name': company, 'current_date': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        'current_year': new Date().getFullYear().toString(),
        'sender.name': senderName, 'sender_name': senderName,
        'user.name': senderName, 'user_name': senderName,
      };
      const applyVars = (text: string) => {
        let out = text || '';
        for (const [key, val] of Object.entries(replacements)) {
          const rx = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
          out = out.replace(rx, val);
        }
        return out.replace(/\{\{[^}]*\}\}/g, '');
      };

      const finalSubject = `[TEST] ${applyVars(step.subject || '')}`;
      let finalBody      = applyVars(step.body || '');

      // 4. Send to the logged-in user's email
      const toEmail = dbUser?.email;
      if (!toEmail) return res.status(400).json({ error: 'Could not determine your email address' });

      // 5. Append sender signature if the campaign has it enabled
      // Signatures are keyed by auth user ID (not email address)
      if (campaignSettings.includeSenderSignature) {
        const userSig = await storage.getEmailSignature(authUserId);
        if (userSig?.signatureHtml) {
          finalBody = finalBody + '<br><br>--<br>' + userSig.signatureHtml;
        } else {
          console.log(`[Test Send Signature] No signature found for user ID: ${authUserId}`);
        }
      }

      const { sendEmailAsUser, getUserGmailConnection } = await import("./user-gmail-oauth");
      const { sendEmail } = await import("./gmail-client");
      const userGmailConn = await getUserGmailConnection(authUserId);
      const plain = finalBody.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

      if (userGmailConn?.isActive && userGmailConn.scope?.includes('gmail.send')) {
        await sendEmailAsUser(authUserId, toEmail, finalSubject, plain, finalBody, senderName);
      } else {
        await sendEmail(toEmail, finalSubject, plain, finalBody, senderName);
      }

      console.log(`[Test Send] Step "${step.name}" sent to ${toEmail} using data from ${recipientType} ${recipientId}`);
      res.json({ success: true, sentTo: toEmail });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });
  app.get("/api/drip-campaigns/:campaignId/assignments", isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const assignments = await storage.getDripCampaignAssignments(campaignId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching drip campaign assignments:", error);
      res.status(500).json({ error: "Failed to fetch drip campaign assignments" });
    }
  });
  app.get("/api/drip-campaigns/:campaignId/assignments/enriched", isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);

      // Fetch assignments joined with customer data
      const rows = await db.select({
        id: dripCampaignAssignments.id,
        campaignId: dripCampaignAssignments.campaignId,
        customerId: dripCampaignAssignments.customerId,
        leadId: dripCampaignAssignments.leadId,
        status: dripCampaignAssignments.status,
        startedAt: dripCampaignAssignments.startedAt,
        completedAt: dripCampaignAssignments.completedAt,
        pausedAt: dripCampaignAssignments.pausedAt,
        cancelledAt: dripCampaignAssignments.cancelledAt,
        assignedBy: dripCampaignAssignments.assignedBy,
        customerCompany: customers.company,
        customerEmail: customers.email,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
      })
        .from(dripCampaignAssignments)
        .leftJoin(customers, eq(dripCampaignAssignments.customerId, customers.id))
        .where(eq(dripCampaignAssignments.campaignId, campaignId))
        .orderBy(desc(dripCampaignAssignments.startedAt));

      // Resolve lead names
      const leadIds = rows.filter(r => r.leadId).map(r => r.leadId!);
      let leadMap: Record<number, { name: string; company: string | null; email: string | null }> = {};
      if (leadIds.length > 0) {
        const leadRows = await db.select({ id: leads.id, name: leads.name, company: leads.company, email: leads.email })
          .from(leads)
          .where(inArray(leads.id, leadIds));
        leadMap = Object.fromEntries(leadRows.map(l => [l.id, l]));
      }

      // Get step status counts per assignment
      const assignmentIds = rows.map(r => r.id);
      let stepCountMap: Record<number, { sent: number; total: number }> = {};
      if (assignmentIds.length > 0) {
        const stepStatuses = await db.select({
          assignmentId: dripCampaignStepStatus.assignmentId,
          status: dripCampaignStepStatus.status,
          count: sql<number>`count(*)::int`,
        })
          .from(dripCampaignStepStatus)
          .where(inArray(dripCampaignStepStatus.assignmentId, assignmentIds))
          .groupBy(dripCampaignStepStatus.assignmentId, dripCampaignStepStatus.status);

        for (const row of stepStatuses) {
          if (!stepCountMap[row.assignmentId]) stepCountMap[row.assignmentId] = { sent: 0, total: 0 };
          stepCountMap[row.assignmentId].total += Number(row.count);
          if (row.status === 'sent') stepCountMap[row.assignmentId].sent += Number(row.count);
        }
      }

      const enriched = rows.map(r => {
        const lead = r.leadId ? leadMap[r.leadId] : null;
        const stepProgress = stepCountMap[r.id] ?? { sent: 0, total: 0 };
        const name = lead
          ? (lead.name || lead.company || lead.email || 'Unknown Lead')
          : (r.customerCompany || [r.customerFirstName, r.customerLastName].filter(Boolean).join(' ') || r.customerEmail || 'Unknown');
        return {
          id: r.id,
          campaignId: r.campaignId,
          customerId: r.customerId,
          leadId: r.leadId,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          pausedAt: r.pausedAt,
          cancelledAt: r.cancelledAt,
          assignedBy: r.assignedBy,
          name,
          email: lead?.email ?? r.customerEmail,
          company: lead?.company ?? r.customerCompany,
          type: r.leadId ? 'lead' : 'customer',
          stepsSent: stepProgress.sent,
          stepsTotal: stepProgress.total,
        };
      });

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching enriched assignments:", error);
      res.status(500).json({ error: "Failed to fetch enriched assignments" });
    }
  });
  app.post("/api/drip-campaigns/:campaignId/assignments", isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { customerIds, leadIds, startAt } = req.body;
      
      const hasCustomers = Array.isArray(customerIds) && customerIds.length > 0;
      const hasLeads = Array.isArray(leadIds) && leadIds.length > 0;
      
      if (!hasCustomers && !hasLeads) {
        return res.status(400).json({ error: "customerIds or leadIds array is required" });
      }
      
      // Get campaign steps to schedule
      const steps = await storage.getDripCampaignSteps(campaignId);
      if (steps.length === 0) {
        return res.status(400).json({ error: "Campaign has no steps to schedule" });
      }
      
      const startDate = startAt ? new Date(startAt) : new Date();
      const assignments = [];
      
      // Process customers
      if (hasCustomers) {
        for (const customerId of customerIds) {
          // Check if already assigned
          const existing = await storage.getDripCampaignAssignments(campaignId, customerId);
          if (existing.some(a => a.status === 'active')) {
            continue; // Skip if already active
          }
          
          // Create assignment
          const assignment = await storage.createDripCampaignAssignment({
            campaignId,
            customerId,
            status: 'active',
            startedAt: startDate,
            assignedBy: req.user?.email,
            metadata: {},
          });
          
          // Schedule all steps for this assignment
          await scheduleStepsForAssignment(assignment.id, steps, startDate);
          assignments.push(assignment);
        }
      }
      
      // Process leads
      if (hasLeads) {
        for (const leadId of leadIds) {
          // Validate leadId is a valid integer
          const parsedLeadId = parseInt(leadId);
          if (isNaN(parsedLeadId)) {
            console.warn(`[Drip Assign] Invalid leadId: ${leadId}, skipping`);
            continue;
          }
          
          // Check if already assigned (search by leadId)
          const existing = await storage.getDripCampaignAssignments(campaignId, undefined, parsedLeadId);
          if (existing.some(a => a.status === 'active')) {
            continue; // Skip if already active
          }
          
          // Create assignment for lead
          const assignment = await storage.createDripCampaignAssignment({
            campaignId,
            leadId: parsedLeadId,
            status: 'active',
            startedAt: startDate,
            assignedBy: req.user?.email,
            metadata: {},
          });
          
          // Schedule all steps for this assignment
          await scheduleStepsForAssignment(assignment.id, steps, startDate);
          assignments.push(assignment);
        }
      }
      
      res.json({ created: assignments.length, assignments });
    } catch (error) {
      console.error("Error creating drip campaign assignments:", error);
      res.status(500).json({ error: "Failed to create drip campaign assignments" });
    }
  });
  app.patch("/api/drip-campaigns/assignments/:assignmentId", isAuthenticated, async (req: any, res) => {
    try {
      const assignmentId = parseInt(req.params.assignmentId);
      const { status } = req.body;
      
      if (!['active', 'paused', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const updateData: any = { status };
      if (status === 'paused') updateData.pausedAt = new Date();
      if (status === 'cancelled') updateData.cancelledAt = new Date();
      if (status === 'completed') updateData.completedAt = new Date();
      
      const assignment = await storage.updateDripCampaignAssignment(assignmentId, updateData);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      
      res.json(assignment);
    } catch (error) {
      console.error("Error updating drip campaign assignment:", error);
      res.status(500).json({ error: "Failed to update drip campaign assignment" });
    }
  });
  app.get("/api/drip-campaigns/assignments/:assignmentId/statuses", isAuthenticated, async (req: any, res) => {
    try {
      const assignmentId = parseInt(req.params.assignmentId);
      const statuses = await storage.getDripCampaignStepStatuses(assignmentId);
      res.json(statuses);
    } catch (error) {
      console.error("Error fetching drip campaign step statuses:", error);
      res.status(500).json({ error: "Failed to fetch drip campaign step statuses" });
    }
  });
}
