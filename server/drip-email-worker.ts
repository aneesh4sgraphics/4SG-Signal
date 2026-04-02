import { db } from "./db";
import { 
  dripCampaignStepStatus, 
  dripCampaignSteps, 
  dripCampaignAssignments, 
  dripCampaigns,
  customers,
  leads,
  emailSends,
  emailTrackingTokens,
  gmailMessages,
} from "@shared/schema";
import { eq, and, lte, sql, isNotNull, inArray } from "drizzle-orm";
import { sendEmail } from "./gmail-client";
import { EMAIL_TEMPLATE_VARIABLES } from "@shared/schema";
import crypto from "crypto";
import { odooClient } from "./odoo";
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from "./advisory-lock";

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let hasLock = false;

interface ScheduledEmail {
  statusId: number;
  stepId: number;
  assignmentId: number;
  customerId: string | null;
  leadId: number | null;
  stepName: string;
  subject: string;
  body: string;
  campaignName: string;
  recipientEmail: string | null;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  recipientCompany: string | null;
  odooPartnerId: number | null;
  isLead: boolean;
}

export async function startDripEmailWorker() {
  if (intervalHandle !== null) {
    console.log("[Drip Worker] Already running, skipping start");
    return;
  }
  
  hasLock = await tryAcquireAdvisoryLock('DRIP_EMAIL_WORKER');
  if (!hasLock) {
    console.log("[Drip Worker] Another instance holds the lock, skipping start");
    return;
  }
  
  console.log("[Drip Worker] Acquired lock, starting drip email worker...");
  
  processScheduledEmails();
  
  intervalHandle = setInterval(() => {
    processScheduledEmails();
  }, POLL_INTERVAL_MS);
}

export async function stopDripEmailWorker() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (hasLock) {
    await releaseAdvisoryLock('DRIP_EMAIL_WORKER');
    hasLock = false;
  }
  console.log("[Drip Worker] Stopped drip email worker");
}

// ─── Reply-exit check ─────────────────────────────────────────────────────────
// For campaigns with exitOnReply: true, if any inbound Gmail message appears on
// the same thread as a sent drip email, mark that assignment as 'completed'.
async function checkReplyExits() {
  try {
    // 1. Find all active assignments for campaigns with exitOnReply enabled
    const activeRows = await db
      .select({
        assignmentId: dripCampaignAssignments.id,
        campaignSettings: dripCampaigns.settings,
      })
      .from(dripCampaignAssignments)
      .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
      .where(eq(dripCampaignAssignments.status, 'active'));

    const exitOnReplyIds = activeRows
      .filter(r => {
        const settings = r.campaignSettings as any;
        return settings?.exitOnReply === true;
      })
      .map(r => r.assignmentId);

    if (exitOnReplyIds.length === 0) return;

    // 2. Get all thread IDs for sent steps in those assignments
    const sentStatuses = await db
      .select({
        assignmentId: dripCampaignStepStatus.assignmentId,
        threadId: dripCampaignStepStatus.gmailThreadId,
      })
      .from(dripCampaignStepStatus)
      .where(
        and(
          inArray(dripCampaignStepStatus.assignmentId, exitOnReplyIds),
          eq(dripCampaignStepStatus.status, 'sent'),
          isNotNull(dripCampaignStepStatus.gmailThreadId),
        )
      );

    if (sentStatuses.length === 0) return;

    // Build map: threadId → assignmentId
    const threadToAssignment: Record<string, number> = {};
    for (const row of sentStatuses) {
      if (row.threadId) threadToAssignment[row.threadId] = row.assignmentId;
    }

    const allThreadIds = Object.keys(threadToAssignment);
    if (allThreadIds.length === 0) return;

    // 3. Check gmailMessages for inbound replies on those threads
    const inboundReplies = await db
      .select({ threadId: gmailMessages.threadId })
      .from(gmailMessages)
      .where(
        and(
          eq(gmailMessages.direction, 'inbound'),
          inArray(gmailMessages.threadId as any, allThreadIds),
        )
      );

    if (inboundReplies.length === 0) return;

    // 4. Mark each assignment that received a reply as 'completed'
    const repliedAssignmentIds = [
      ...new Set(
        inboundReplies
          .map(r => r.threadId ? threadToAssignment[r.threadId] : null)
          .filter(Boolean) as number[]
      ),
    ];

    for (const assignmentId of repliedAssignmentIds) {
      await db
        .update(dripCampaignAssignments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(
          and(
            eq(dripCampaignAssignments.id, assignmentId),
            eq(dripCampaignAssignments.status, 'active'), // only if still active
          )
        );
      console.log(`[Drip Worker] Reply detected — completed assignment ${assignmentId} (exit criteria met)`);
    }
  } catch (err: any) {
    console.error('[Drip Worker] Error in reply-exit check:', err.message);
  }
}

async function processScheduledEmails() {
  if (isProcessing) {
    return;
  }
  
  isProcessing = true;
  
  try {
    // Run reply-exit check first so cancelled assignments don't get emailed this cycle
    await checkReplyExits();

    const now = new Date();
    
    const lockedStatuses = await db.execute(sql`
      UPDATE drip_campaign_step_status 
      SET status = 'sending', updated_at = NOW()
      WHERE id IN (
        SELECT dss.id 
        FROM drip_campaign_step_status dss
        INNER JOIN drip_campaign_steps ds ON dss.step_id = ds.id
        INNER JOIN drip_campaign_assignments da ON dss.assignment_id = da.id
        INNER JOIN drip_campaigns dc ON da.campaign_id = dc.id
        WHERE dss.status = 'scheduled'
          AND dss.scheduled_for <= ${now}
          AND dc.is_active = true
          AND ds.is_active = true
          AND da.status = 'active'
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);

    const lockedIds = (lockedStatuses.rows || []).map((r: any) => r.id);
    
    if (lockedIds.length === 0) {
      return;
    }

    console.log(`[Drip Worker] Processing ${lockedIds.length} emails`);

    for (const statusId of lockedIds) {
      // Query with LEFT JOINs to handle both customers and leads
      const emailData = await db
        .select({
          statusId: dripCampaignStepStatus.id,
          stepId: dripCampaignStepStatus.stepId,
          assignmentId: dripCampaignStepStatus.assignmentId,
          stepName: dripCampaignSteps.name,
          subject: dripCampaignSteps.subject,
          body: dripCampaignSteps.body,
          customerId: dripCampaignAssignments.customerId,
          leadId: dripCampaignAssignments.leadId,
          campaignName: dripCampaigns.name,
          // Customer fields
          customerEmail: customers.email,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerCompany: customers.company,
          odooPartnerId: customers.odooPartnerId,
          // Lead fields
          leadEmail: leads.email,
          leadFirstName: sql<string>`SPLIT_PART(${leads.name}, ' ', 1)`,
          leadLastName: sql<string>`SUBSTRING(${leads.name} FROM POSITION(' ' IN ${leads.name}) + 1)`,
          leadCompany: leads.company,
        })
        .from(dripCampaignStepStatus)
        .innerJoin(dripCampaignSteps, eq(dripCampaignStepStatus.stepId, dripCampaignSteps.id))
        .innerJoin(dripCampaignAssignments, eq(dripCampaignStepStatus.assignmentId, dripCampaignAssignments.id))
        .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
        .leftJoin(customers, eq(dripCampaignAssignments.customerId, customers.id))
        .leftJoin(leads, eq(dripCampaignAssignments.leadId, leads.id))
        .where(eq(dripCampaignStepStatus.id, statusId))
        .limit(1);

      if (emailData.length > 0) {
        const data = emailData[0];
        const isLead = data.leadId !== null;
        
        const scheduledEmail: ScheduledEmail = {
          statusId: data.statusId,
          stepId: data.stepId,
          assignmentId: data.assignmentId,
          customerId: data.customerId,
          leadId: data.leadId,
          stepName: data.stepName,
          subject: data.subject,
          body: data.body,
          campaignName: data.campaignName,
          recipientEmail: isLead ? data.leadEmail : data.customerEmail,
          recipientFirstName: isLead ? data.leadFirstName : data.customerFirstName,
          recipientLastName: isLead ? data.leadLastName : data.customerLastName,
          recipientCompany: isLead ? data.leadCompany : data.customerCompany,
          odooPartnerId: isLead ? null : data.odooPartnerId,
          isLead,
        };
        
        await sendScheduledEmail(scheduledEmail);
      }
    }
  } catch (error) {
    console.error("[Drip Worker] Error processing scheduled emails:", error);
  } finally {
    isProcessing = false;
  }
}

async function sendScheduledEmail(email: ScheduledEmail) {
  try {
    const recipientType = email.isLead ? 'lead' : 'customer';
    const recipientId = email.isLead ? email.leadId : email.customerId;
    
    if (!email.recipientEmail) {
      console.warn(`[Drip Worker] Skipping email for ${recipientType} ${recipientId} - no email address`);
      await db
        .update(dripCampaignStepStatus)
        .set({ 
          status: 'skipped',
          lastError: `${recipientType} has no email address`
        })
        .where(eq(dripCampaignStepStatus.id, email.statusId));
      return;
    }

    const processedSubject = replaceVariables(email.subject, email);
    let processedBody = replaceVariables(email.body, email);
    
    // Generate tracking token for drip emails
    const trackingToken = crypto.randomBytes(24).toString('hex');
    
    // Get base URL from environment or use default
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || 'https://quote-calculator-application.replit.app';
    
    // Create tracking pixel URL
    const trackingPixelUrl = `${baseUrl}/api/t/open/${trackingToken}.png`;
    
    // Wrap links in the HTML for click tracking
    processedBody = processedBody.replace(
      /<a\s+([^>]*href=["'])([^"']+)(["'][^>]*)>/gi,
      (match: string, prefix: string, url: string, suffix: string) => {
        if (url.startsWith('mailto:') || url.startsWith('tel:') || url.includes('/api/t/')) {
          return match;
        }
        const encodedUrl = encodeURIComponent(url);
        const trackedUrl = `${baseUrl}/api/t/click/${trackingToken}?url=${encodedUrl}`;
        return `<a ${prefix}${trackedUrl}${suffix}>`;
      }
    );
    
    // Inject tracking pixel at the end of the email body
    const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
    
    if (processedBody.includes('</body>')) {
      processedBody = processedBody.replace('</body>', `${trackingPixel}</body>`);
    } else {
      processedBody = processedBody + trackingPixel;
    }

    const result = await sendEmail(
      email.recipientEmail,
      processedSubject,
      processedBody,
      processedBody
    );

    const messageId = result?.id;
    const threadId = result?.threadId;

    await db
      .update(dripCampaignStepStatus)
      .set({ 
        status: 'sent',
        sentAt: new Date(),
        gmailMessageId: messageId || null,
        gmailThreadId: threadId || null
      })
      .where(eq(dripCampaignStepStatus.id, email.statusId));

    const recipientName = `${email.recipientFirstName || ''} ${email.recipientLastName || ''}`.trim() || email.recipientCompany || 'Unknown';
    
    const [emailSendRecord] = await db.insert(emailSends).values({
      customerId: email.customerId || undefined,
      leadId: email.leadId || undefined,
      subject: processedSubject,
      body: processedBody,
      recipientEmail: email.recipientEmail,
      recipientName,
      sentBy: 'drip-worker',
      status: 'sent',
      sentAt: new Date(),
      variableData: {
        campaignName: email.campaignName,
        stepName: email.stepName,
        isDripEmail: 'true',
        isLead: email.isLead ? 'true' : 'false',
      },
    }).returning();

    if (emailSendRecord) {
      await db
        .update(dripCampaignStepStatus)
        .set({ emailSendId: emailSendRecord.id })
        .where(eq(dripCampaignStepStatus.id, email.statusId));
      
      // Create tracking token record
      try {
        await db.insert(emailTrackingTokens).values({
          token: trackingToken,
          emailSendId: emailSendRecord.id,
          customerId: email.customerId || undefined,
          leadId: email.leadId || undefined,
          recipientEmail: email.recipientEmail,
          subject: processedSubject,
          sentBy: 'drip-worker',
        });
      } catch (trackingError) {
        console.error("[Drip Worker] Error creating tracking token:", trackingError);
      }
    }

    // Sync email to Odoo contact's chatter (non-blocking)
    if (email.odooPartnerId) {
      try {
        await odooClient.logEmailToPartner(email.odooPartnerId, {
          to: email.customerEmail || '',
          subject: `[Drip Campaign: ${email.campaignName}] ${processedSubject}`,
          body: processedBody,
          sentAt: new Date(),
        });
        console.log(`[Drip Worker] Synced email to Odoo partner ${email.odooPartnerId}`);
      } catch (odooError: any) {
        console.error("[Drip Worker] Error syncing to Odoo (non-critical):", odooError.message);
      }
    }

    console.log(`[Drip Worker] Sent email to ${email.customerEmail} for campaign "${email.campaignName}" (tracking: ${trackingToken.substring(0, 8)}...)`);
  } catch (error: any) {
    console.error(`[Drip Worker] Failed to send email to ${email.customerEmail}:`, error.message);
    
    const currentStatus = await db
      .select({ retryCount: dripCampaignStepStatus.retryCount })
      .from(dripCampaignStepStatus)
      .where(eq(dripCampaignStepStatus.id, email.statusId))
      .limit(1);
    
    const retryCount = (currentStatus[0]?.retryCount || 0) + 1;
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      await db
        .update(dripCampaignStepStatus)
        .set({ 
          status: 'failed',
          retryCount,
          lastError: error.message
        })
        .where(eq(dripCampaignStepStatus.id, email.statusId));
    } else {
      const retryDelay = Math.pow(2, retryCount) * 60 * 1000;
      const nextRetry = new Date(Date.now() + retryDelay);
      
      await db
        .update(dripCampaignStepStatus)
        .set({ 
          status: 'scheduled',
          scheduledFor: nextRetry,
          retryCount,
          lastError: error.message
        })
        .where(eq(dripCampaignStepStatus.id, email.statusId));
      
      console.log(`[Drip Worker] Scheduled retry #${retryCount} for ${email.customerEmail} at ${nextRetry.toISOString()}`);
    }
  }
}

function replaceVariables(text: string, email: ScheduledEmail): string {
  if (!text) return text;
  
  const recipientName = `${email.recipientFirstName || ''} ${email.recipientLastName || ''}`.trim() || email.recipientCompany || 'Valued Customer';
  
  const replacements: Record<string, string> = {
    // ── Human-readable (inserted via Variables button) ──────────────────────
    'First Name':      email.recipientFirstName || '',
    'Last Name':       email.recipientLastName || '',
    'Full Name':       recipientName,
    'Email':           email.recipientEmail || '',
    'Company':         email.recipientCompany || '',
    'Sales Rep Name':  '4S Graphics Team',
    'Unsubscribe Link': '#unsubscribe',
    // ── Legacy dot/underscore keys ───────────────────────────────────────────
    'client.first_name': email.recipientFirstName || '',
    'client.last_name': email.recipientLastName || '',
    'client.company': email.recipientCompany || '',
    'client.email': email.recipientEmail || '',
    'client.name': recipientName,
    'client_first_name': email.recipientFirstName || '',
    'client_last_name': email.recipientLastName || '',
    'client_company': email.recipientCompany || '',
    'client_email': email.recipientEmail || '',
    'client_name': recipientName,
    'customer.first_name': email.recipientFirstName || '',
    'customer.last_name': email.recipientLastName || '',
    'customer.company': email.recipientCompany || '',
    'customer.email': email.recipientEmail || '',
    'customer.name': recipientName,
    'customer_name': recipientName,
    'company_name': email.recipientCompany || '',
    'sender.name': '4S Graphics',
    'sender.company': '4S Graphics',
    'sender_name': '4S Graphics',
    'sender_company': '4S Graphics',
    'current_date': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    'current_year': new Date().getFullYear().toString(),
  };
  
  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{\\s*${key.replace(/\./g, '\\.')}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, value);
  }
  
  return result;
}
