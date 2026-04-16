import DOMPurify from 'isomorphic-dompurify';
import juice from 'juice';
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
  followUpTasks,
  customerActivityEvents,
  users,
} from "@shared/schema";
import { eq, and, lte, sql, isNotNull, inArray, lt, isNull, ilike } from "drizzle-orm";
import { storage } from "./storage";
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
  campaignSettings: Record<string, any>;
  campaignCreatedBy: string | null;
  senderName: string;
  recipientEmail: string | null;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  recipientCompany: string | null;
  odooPartnerId: number | null;
  isLead: boolean;
  leadSalesRepName: string | null;
}

// ─── Drip Sequence Follow-up Scanner ─────────────────────────────────────────
// Nightly scan: find completed drip sequences with no reply 3+ days ago,
// auto-create follow_up_tasks rows if one doesn't already exist.
async function scanCompletedSequencesForFollowUp() {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const completedAssignments = await db
      .select({
        id: dripCampaignAssignments.id,
        customerId: dripCampaignAssignments.customerId,
        leadId: dripCampaignAssignments.leadId,
        completedAt: dripCampaignAssignments.completedAt,
        startedAt: dripCampaignAssignments.startedAt,
        campaignId: dripCampaignAssignments.campaignId,
        campaignName: dripCampaigns.name,
      })
      .from(dripCampaignAssignments)
      .innerJoin(dripCampaigns, eq(dripCampaignAssignments.campaignId, dripCampaigns.id))
      .where(
        and(
          eq(dripCampaignAssignments.status, 'completed'),
          sql`${dripCampaignAssignments.completedAt} < ${threeDaysAgo}`,
          isNotNull(dripCampaignAssignments.completedAt),
        )
      );

    let created = 0;
    for (const assignment of completedAssignments) {
      // Skip if an open follow-up task already exists for this assignment
      const existingTask = await db
        .select({ id: followUpTasks.id })
        .from(followUpTasks)
        .where(
          and(
            eq(followUpTasks.sourceType, 'drip_sequence'),
            eq(followUpTasks.sourceId, String(assignment.id)),
            eq(followUpTasks.status, 'pending'),
          )
        )
        .limit(1);

      if (existingTask.length > 0) continue;

      const sequenceStartedAt = assignment.startedAt ? new Date(assignment.startedAt) : new Date(0);

      // No-reply gating: skip if the lead/customer has already replied since sequence started
      if (assignment.leadId) {
        const [lead] = await db
          .select({ firstEmailReplyAt: leads.firstEmailReplyAt })
          .from(leads)
          .where(eq(leads.id, assignment.leadId));
        if (lead?.firstEmailReplyAt && new Date(lead.firstEmailReplyAt) > sequenceStartedAt) continue;
      } else if (assignment.customerId) {
        const [replyActivity] = await db
          .select({ id: customerActivityEvents.id })
          .from(customerActivityEvents)
          .where(and(
            eq(customerActivityEvents.customerId, assignment.customerId),
            ilike(customerActivityEvents.eventType, '%reply%'),
            sql`${customerActivityEvents.eventDate} > ${sequenceStartedAt}`,
          ))
          .limit(1);
        if (replyActivity) continue;
      }

      let contactName = 'Unknown';
      if (assignment.customerId) {
        const [c] = await db.select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
          .from(customers).where(eq(customers.id, assignment.customerId));
        if (c) contactName = c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown';
      } else if (assignment.leadId) {
        const [l] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, assignment.leadId));
        if (l) contactName = l.name || 'Unknown';
      }

      const dueDate = new Date(assignment.completedAt!);
      dueDate.setDate(dueDate.getDate() + 3);

      await storage.createFollowUpTask({
        customerId: assignment.customerId || null,
        leadId: assignment.leadId || null,
        title: `Sequence follow-up call: ${contactName}`,
        description: `Email sequence "${assignment.campaignName}" completed with no reply. Time to follow up with a call.`,
        taskType: 'call',
        priority: 'high',
        status: 'pending',
        dueDate,
        sourceType: 'drip_sequence',
        sourceId: String(assignment.id),
        isAutoGenerated: true,
      });
      created++;
    }

    if (created > 0) {
      console.log(`[Drip Worker] Auto-created ${created} sequence follow-up task(s)`);
    }
  } catch (err: any) {
    console.error('[Drip Worker] Error in sequence follow-up scan:', err.message);
  }
}

const NIGHTLY_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let nightlyScanHandle: ReturnType<typeof setInterval> | null = null;

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

  // Start nightly sequence follow-up scanner
  scanCompletedSequencesForFollowUp();
  nightlyScanHandle = setInterval(() => {
    scanCompletedSequencesForFollowUp();
  }, NIGHTLY_SCAN_INTERVAL_MS);
}

export async function stopDripEmailWorker() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (nightlyScanHandle !== null) {
    clearInterval(nightlyScanHandle);
    nightlyScanHandle = null;
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
          campaignSettings: dripCampaigns.settings,
          campaignCreatedBy: dripCampaigns.createdBy,
          // Customer fields
          customerEmail: customers.email,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerCompany: customers.company,
          odooPartnerId: customers.odooPartnerId,
          // Lead fields
          leadEmail: leads.email,
          leadFirstName: sql<string>`SPLIT_PART(${leads.name}, ' ', 1)`,
          leadLastName: sql<string>`CASE WHEN POSITION(' ' IN ${leads.name}) > 0 THEN SUBSTRING(${leads.name} FROM POSITION(' ' IN ${leads.name}) + 1) ELSE '' END`,
          leadCompany: leads.company,
          leadSalesRepName: leads.salesRepName,
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

        // For leads: resolve the sender from the lead's assigned sales rep.
        // For customers: use the campaign creator.
        // This ensures emails go out from the rep who owns the lead, not always
        // from whichever rep happened to create the campaign.
        let senderName = '4S Graphics Team';
        let effectiveSenderEmail: string | null = null;

        if (isLead && data.leadSalesRepName) {
          // Try to resolve the sales rep user: salesRepName may be stored as an email
          // (e.g. "santiago@4sgraphics.com") or as a display name ("Santiago Castellanos").
          let repUser: { firstName: string | null; lastName: string | null; email: string } | undefined;

          if (data.leadSalesRepName.includes('@')) {
            // Direct email lookup
            const [found] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
              .from(users)
              .where(eq(users.email, data.leadSalesRepName))
              .limit(1);
            repUser = found;
          } else {
            // Display-name lookup: match first + last name concatenated
            const [found] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
              .from(users)
              .where(sql`CONCAT(${users.firstName}, ' ', ${users.lastName}) = ${data.leadSalesRepName}`)
              .limit(1);
            repUser = found;
          }

          if (repUser?.email) {
            senderName = [repUser.firstName, repUser.lastName].filter(Boolean).join(' ') || repUser.email;
            effectiveSenderEmail = repUser.email;
          }
        }

        // Fall back to campaign creator if we couldn't resolve the sales rep
        if (!effectiveSenderEmail && data.campaignCreatedBy) {
          effectiveSenderEmail = data.campaignCreatedBy;
          const [creatorUser] = await db.select({ firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(eq(users.email, data.campaignCreatedBy))
            .limit(1);
          if (creatorUser) {
            senderName = [creatorUser.firstName, creatorUser.lastName].filter(Boolean).join(' ') || senderName;
          }
        }

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
          campaignSettings: (data.campaignSettings || {}) as Record<string, any>,
          campaignCreatedBy: effectiveSenderEmail ?? data.campaignCreatedBy ?? null,
          senderName,
          recipientEmail: isLead ? data.leadEmail : data.customerEmail,
          recipientFirstName: isLead ? data.leadFirstName : data.customerFirstName,
          recipientLastName: isLead ? data.leadLastName : data.customerLastName,
          recipientCompany: isLead ? data.leadCompany : data.customerCompany,
          odooPartnerId: isLead ? null : data.odooPartnerId,
          isLead,
          leadSalesRepName: isLead ? (data.leadSalesRepName ?? null) : null,
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

    // Sanitize HTML body — strip dangerous JS/events while keeping email-safe HTML.
    // Runs before replaceVariables so {{token}} placeholders are never treated as markup.
    const sanitizedBody = DOMPurify.sanitize(email.body, {
      WHOLE_DOCUMENT: true,
      FORCE_BODY: false,
      ALLOWED_TAGS: [
        'a', 'abbr', 'b', 'blockquote', 'body', 'br', 'button', 'caption',
        'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'div', 'dl',
        'dt', 'em', 'fieldset', 'font', 'footer', 'form', 'h1', 'h2',
        'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i',
        'img', 'input', 'label', 'legend', 'li', 'link', 'main', 'meta',
        'nav', 'ol', 'p', 'pre', 's', 'section', 'select', 'small',
        'span', 'strong', 'style', 'sub', 'sup', 'table', 'tbody', 'td',
        'tfoot', 'th', 'thead', 'title', 'tr', 'u', 'ul',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'srcset', 'alt', 'title', 'style', 'class', 'id',
        'width', 'height', 'align', 'valign', 'bgcolor', 'background',
        'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan',
        'nowrap', 'color', 'face', 'size', 'target', 'rel', 'type',
        'charset', 'content', 'name', 'http-equiv', 'media', 'property',
        'role', 'aria-label', 'aria-hidden', 'lang', 'dir',
        'xmlns', 'xmlns:v', 'xmlns:o',
        'marginwidth', 'marginheight', 'leftmargin', 'topmargin',
        'vspace', 'hspace', 'loading',
      ],
      ADD_TAGS: ['html', 'head', 'body', 'meta', 'link', 'title'],
      ADD_ATTR: ['xmlns', 'xmlns:v', 'xmlns:o', 'http-equiv', 'charset', 'content', 'media'],
    });

    const processedSubject = replaceVariables(email.subject, email);
    let processedBody = replaceVariables(sanitizedBody, email);
    try {
      processedBody = juice(processedBody, { removeStyleTags: false, preserveMediaQueries: true });
    } catch (e) {
      console.warn('[Drip Worker] juice failed:', e);
    }

    // Append sender signature if the campaign has it enabled
    if (email.campaignSettings.includeSenderSignature) {
      // Look up by user ID (email_signatures.user_id stores auth user ID, not email)
      const senderEmail = email.campaignCreatedBy;
      if (senderEmail) {
        const [sigUser] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.email, senderEmail))
          .limit(1);
        if (sigUser) {
          const userSig = await storage.getEmailSignature(sigUser.id);
          if (userSig?.signatureHtml) {
            processedBody = processedBody + '<br><br>--<br>' + userSig.signatureHtml;
            console.log(`[Drip Signature] Appended signature for user: ${senderEmail}`);
          } else {
            console.log(`[Drip Signature] No signature found for user ID: ${sigUser.id} (${senderEmail})`);
          }
        } else {
          console.log(`[Drip Signature] No user record found for email: ${senderEmail}`);
        }
      }
    }

    // Inline CSS so Gmail doesn't strip <style> tags (Gmail only honors inline style="" attributes)
    try {
      processedBody = juice(processedBody, {
        removeStyleTags: false,
        preserveMediaQueries: true,
        preserveFontFaces: true,
        applyAttributesTableElements: true,
      });
    } catch (juiceErr) {
      console.warn('[Drip Worker] juice inlining failed, using raw body:', juiceErr);
    }

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

    // Send via the effective sender's personal Gmail (lead's assigned rep first, then campaign creator)
    // so the email appears in their Sent folder and replies come back to them.
    let result: any;
    let usedPersonalGmail = false;
    if (email.campaignCreatedBy) {
      try {
        const { getUserGmailConnection, sendEmailAsUser } = await import('./user-gmail-oauth');
        // Look up the effective sender's internal user ID by email
        const [creatorUser] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.email, email.campaignCreatedBy))
          .limit(1);
        if (creatorUser) {
          const conn = await getUserGmailConnection(creatorUser.id);
          if (conn?.isActive && conn.scope?.includes('gmail.send')) {
            console.log(`[Drip Worker] Sending via personal Gmail for: ${email.campaignCreatedBy} (lead sales rep / campaign creator)`);
            result = await sendEmailAsUser(creatorUser.id, email.recipientEmail!, processedSubject, processedBody, processedBody, email.senderName);
            usedPersonalGmail = true;
          }
        }
      } catch (gmailErr) {
        console.warn('[Drip Worker] Personal Gmail failed, falling back to shared connector:', gmailErr);
      }
    }
    if (!usedPersonalGmail) {
      console.log(`[Drip Worker] Sending via shared Gmail connector (no personal Gmail for: ${email.campaignCreatedBy})`);
      result = await sendEmail(
        email.recipientEmail!,
        processedSubject,
        processedBody,
        processedBody,
        email.senderName || undefined,
        email.campaignCreatedBy || undefined
      );
    }

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
    'Sales Rep Name':  email.senderName,
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
    'sender.name': email.senderName,
    'sender.company': '4S Graphics',
    'sender_name': email.senderName,
    'sender_company': '4S Graphics',
    // ── client.salesRep variants (used in campaign templates) ────────────────
    'client.salesRep': email.senderName,
    'client.sales_rep': email.senderName,
    'client.rep': email.senderName,
    'salesRep': email.senderName,
    'sales_rep': email.senderName,
    'rep_name': email.senderName,
    'repName': email.senderName,
    // ── camelCase client variants ────────────────────────────────────────────
    'client.firstName': email.recipientFirstName || '',
    'client.lastName': email.recipientLastName || '',
    'client.fullName': recipientName,
    'current_date': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    'current_year': new Date().getFullYear().toString(),
  };
  
  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, value);
  }

  // Strip any remaining {{...}} placeholders that didn't match a known variable
  // so they never appear literally in a sent email
  result = result.replace(/\{\{[^}]*\}\}/g, '');

  return result;
}
