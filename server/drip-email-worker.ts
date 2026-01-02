import { db } from "./db";
import { 
  dripCampaignStepStatus, 
  dripCampaignSteps, 
  dripCampaignAssignments, 
  dripCampaigns,
  customers,
  emailSends,
  emailTrackingTokens
} from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { sendEmail } from "./gmail-client";
import { EMAIL_TEMPLATE_VARIABLES } from "@shared/schema";
import crypto from "crypto";

const POLL_INTERVAL_MS = 60000;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

interface ScheduledEmail {
  statusId: number;
  stepId: number;
  assignmentId: number;
  customerId: string;
  stepName: string;
  subject: string;
  body: string;
  campaignName: string;
  customerEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerCompany: string | null;
}

export function startDripEmailWorker() {
  if (intervalHandle !== null) {
    console.log("[Drip Worker] Already running, skipping start");
    return;
  }
  
  console.log("[Drip Worker] Starting drip email worker...");
  
  processScheduledEmails();
  
  intervalHandle = setInterval(() => {
    processScheduledEmails();
  }, POLL_INTERVAL_MS);
}

export function stopDripEmailWorker() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  console.log("[Drip Worker] Stopped drip email worker");
}

async function processScheduledEmails() {
  if (isProcessing) {
    return;
  }
  
  isProcessing = true;
  
  try {
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
      const emailData = await db
        .select({
          statusId: dripCampaignStepStatus.id,
          stepId: dripCampaignStepStatus.stepId,
          assignmentId: dripCampaignStepStatus.assignmentId,
          stepName: dripCampaignSteps.name,
          subject: dripCampaignSteps.subject,
          body: dripCampaignSteps.body,
          customerId: dripCampaignAssignments.customerId,
          campaignName: dripCampaigns.name,
          customerEmail: customers.email,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerCompany: customers.company,
        })
        .from(dripCampaignStepStatus)
        .innerJoin(dripCampaignSteps, eq(dripCampaignStepStatus.stepId, dripCampaignSteps.id))
        .innerJoin(dripCampaignAssignments, eq(dripCampaignStepStatus.assignmentId, dripCampaignAssignments.id))
        .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
        .innerJoin(customers, eq(dripCampaignAssignments.customerId, customers.id))
        .where(eq(dripCampaignStepStatus.id, statusId))
        .limit(1);

      if (emailData.length > 0) {
        await sendScheduledEmail(emailData[0] as ScheduledEmail);
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
    if (!email.customerEmail) {
      console.warn(`[Drip Worker] Skipping email for customer ${email.customerId} - no email address`);
      await db
        .update(dripCampaignStepStatus)
        .set({ 
          status: 'skipped',
          lastError: 'Customer has no email address'
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
      email.customerEmail,
      processedSubject,
      processedBody,
      processedBody
    );

    const messageId = result?.id;

    await db
      .update(dripCampaignStepStatus)
      .set({ 
        status: 'sent',
        sentAt: new Date(),
        gmailMessageId: messageId || null
      })
      .where(eq(dripCampaignStepStatus.id, email.statusId));

    const [emailSendRecord] = await db.insert(emailSends).values({
      customerId: email.customerId,
      subject: processedSubject,
      body: processedBody,
      recipientEmail: email.customerEmail,
      recipientName: `${email.customerFirstName || ''} ${email.customerLastName || ''}`.trim() || email.customerCompany || 'Unknown',
      sentBy: 'drip-worker',
      status: 'sent',
      sentAt: new Date(),
      variableData: {
        campaignName: email.campaignName,
        stepName: email.stepName,
        isDripEmail: 'true',
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
          customerId: email.customerId,
          recipientEmail: email.customerEmail,
          subject: processedSubject,
          sentBy: 'drip-worker',
        });
      } catch (trackingError) {
        console.error("[Drip Worker] Error creating tracking token:", trackingError);
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
  
  const customerName = `${email.customerFirstName || ''} ${email.customerLastName || ''}`.trim() || email.customerCompany || 'Valued Customer';
  
  const replacements: Record<string, string> = {
    'client.first_name': email.customerFirstName || '',
    'client.last_name': email.customerLastName || '',
    'client.company': email.customerCompany || '',
    'client.email': email.customerEmail || '',
    'client.name': customerName,
    'client_first_name': email.customerFirstName || '',
    'client_last_name': email.customerLastName || '',
    'client_company': email.customerCompany || '',
    'client_email': email.customerEmail || '',
    'client_name': customerName,
    'customer.first_name': email.customerFirstName || '',
    'customer.last_name': email.customerLastName || '',
    'customer.company': email.customerCompany || '',
    'customer.email': email.customerEmail || '',
    'customer.name': customerName,
    'customer_name': customerName,
    'company_name': email.customerCompany || '',
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
