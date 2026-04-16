import type { Express } from "express";
import { db } from "./db";
import { eq, sql, and, or, desc, not, inArray } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "./replitAuth";
import { odooClient } from "./odoo";
import { storage } from "./storage";
import { spotlightEngine } from "./spotlight-engine";
import multer from "multer";
import crypto from "crypto";
import OpenAI from "openai";

// Extracts all {{variable}} tokens from subject and body strings
function extractTemplateVariables(...texts: (string | undefined | null)[]): string[] {
  const found = new Set<string>();
  const pattern = /\{\{([^}]+)\}\}/g;
  for (const text of texts) {
    if (!text) continue;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      found.add(m[1].trim());
    }
  }
  return Array.from(found);
}
import Anthropic from "@anthropic-ai/sdk";
import {
  customers,
  emailSends,
  users,
  gmailUnmatchedEmails,
  emailSalesEvents,
  gmailMessages,
  gmailMessageMatches,
  followUpTasks,
  emailIntelligenceBlacklist,
  leads,
  leadActivities,
} from "@shared/schema";

const screenshotUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function registerEmailRoutes(app: Express): void {
  app.post("/api/screenshot/extract", isAuthenticated, screenshotUpload.single('screenshot'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      // Prefer Replit-managed integration keys (won't have quota issues) over user's own keys
      const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
      const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

      const backend = anthropicKey ? `Anthropic (${process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ? 'integration' : 'user-key'})`
        : openaiKey ? `OpenAI (${process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? 'integration' : 'user-key'})`
        : 'none';

      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

      const extractionPrompt = `Extract contact information from this screenshot. Return ONLY a valid JSON object with these exact fields (use null for any field not found):
{
  "name": "Full name of the person",
  "company": "Company or organization name",
  "jobTitle": "Job title or professional role",
  "email": "Primary email address only — no extra text",
  "phone": "Phone number including country code if visible (e.g. +1 708-203-5717)",
  "street": "Street address line 1",
  "street2": "Apartment, suite, or floor (line 2 only if present)",
  "city": "City name",
  "state": "Full state or province name (e.g. Illinois not IL)",
  "zip": "Postal or ZIP code",
  "country": "Full country name (e.g. United States, Canada, Mexico)",
  "notes": "Any other relevant professional context such as machine types, products, specialties"
}
Return only the JSON object. No markdown, no code blocks, no explanation.`;

      let rawText = '{}';

      if (anthropicKey) {
        // Use Claude claude-sonnet-4-20250514 — better at structured extraction
        const anthropic = new Anthropic({ apiKey: anthropicKey });
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [{
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64Image }
            }, {
              type: 'text',
              text: extractionPrompt
            }]
          }]
        });
        rawText = (response.content[0] as any)?.text || '{}';
      } else if (openaiKey) {
        // Fallback to OpenAI GPT-4o
        const usingIntegrationKey = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
        const openaiClient = new OpenAI({
          apiKey: openaiKey,
          ...(usingIntegrationKey && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
            ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }
            : {}),
        });
        const completion = await openaiClient.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [{
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' }
            }, {
              type: 'text',
              text: extractionPrompt
            }]
          }]
        });
        rawText = completion.choices[0]?.message?.content || '{}';
      } else {
        return res.status(503).json({ error: 'AI extraction is not configured. Add an ANTHROPIC_API_KEY or OPENAI_API_KEY secret.' });
      }
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let extracted: Record<string, string | null> = {};
      try {
        extracted = JSON.parse(cleaned);
      } catch (e) {
        console.error('[Screenshot Extract] Failed to parse AI response:', rawText);
        return res.status(422).json({ error: 'Could not parse contact information from image' });
      }

      console.log(`[Screenshot Extract] Extracted fields: ${Object.keys(extracted).filter(k => extracted[k]).join(', ')}`);
      res.json({ data: extracted });
    } catch (error: any) {
      console.error('[Screenshot Extract] Error:', error?.message || error);
      const isQuotaError = error?.status === 429 && (error?.message || '').toLowerCase().includes('quota');
      const msg = error?.status === 401 ? 'AI API key is invalid or not configured'
        : isQuotaError ? 'AI quota exceeded — contact your administrator to configure a valid API key'
        : error?.status === 429 ? 'AI rate limit reached — try again in a moment'
        : error?.status === 400 ? 'Image could not be processed — try a clearer screenshot'
        : 'Failed to extract contact information';
      res.status(500).json({ error: msg });
    }
  });
  app.get("/api/email/labels", isAuthenticated, async (req, res) => {
    try {
      const { getLabels } = await import("./gmail-client");
      const labels = await getLabels();
      res.json(labels);
    } catch (error) {
      console.error("Error fetching email labels:", error);
      res.status(500).json({ error: "Failed to fetch email labels" });
    }
  });
  app.get("/api/email/messages", isAuthenticated, async (req, res) => {
    try {
      const { getMessages } = await import("./gmail-client");
      const label = (req.query.label as string) || 'INBOX';
      const maxResults = parseInt(req.query.maxResults as string) || 20;
      const messages = await getMessages(label, maxResults);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching email messages:", error);
      res.status(500).json({ error: "Failed to fetch email messages" });
    }
  });
  app.get("/api/email/messages/:id", isAuthenticated, async (req, res) => {
    try {
      const { getMessage } = await import("./gmail-client");
      const message = await getMessage(req.params.id);
      res.json(message);
    } catch (error) {
      console.error("Error fetching email message:", error);
      res.status(500).json({ error: "Failed to fetch email message" });
    }
  });
  app.post("/api/email/send", isAuthenticated, async (req: any, res) => {
    try {
      const { sendEmail } = await import("./gmail-client");
      const { sendEmailAsUser, getUserGmailConnection } = await import("./user-gmail-oauth");
      const crypto = await import("crypto");
      const { to, subject, body, htmlBody, customerId, templateId, recipientName, variableData, enableTracking = true } = req.body;
      
      if (!to || !subject || !body) {
        return res.status(400).json({ error: "Missing required fields: to, subject, body" });
      }
      
      // Check if user has their own Gmail OAuth connection with send permission
      const authUserId = req.user?.id;
      let usePersonalGmail = false;
      let userGmailConnection: any = null;
      
      if (authUserId) {
        try {
          userGmailConnection = await getUserGmailConnection(authUserId);
          if (userGmailConnection?.isActive && userGmailConnection.scope?.includes('gmail.send')) {
            usePersonalGmail = true;
            console.log('[Email Send] Using personal Gmail for:', userGmailConnection.gmailAddress);
          }
        } catch (e) {
          // No personal Gmail connection, will check shared connector
        }
      }
      
      // If no personal Gmail, check if shared connector is available
      if (!usePersonalGmail) {
        try {
          // Check if shared connector is available by importing and checking the connection
          const { checkGmailConnection } = await import("./gmail-client");
          const isConnected = await checkGmailConnection();
          if (!isConnected) {
            console.log('[Email Send] No Gmail available for user:', req.user?.email);
            return res.status(400).json({ 
              error: "Gmail not connected. Please connect your Gmail in Settings > Integrations to send emails.",
              requiresConnection: true
            });
          }
        } catch (sharedError: any) {
          // Shared connector failed - likely a connection issue
          console.log('[Email Send] Gmail connection check failed:', sharedError.message);
          return res.status(400).json({ 
            error: "Gmail not connected. Please connect your Gmail in Settings > Integrations to send emails.",
            requiresConnection: true
          });
        }
      }
      
      // Fetch user's email signature and auto-append if exists
      const userId = req.user?.email;
      let signature: { signatureHtml: string } | null = null;
      if (userId) {
        signature = await storage.getEmailSignature(userId);
      }
      
      // Prepare body with signature appended
      let finalHtmlBody = htmlBody || body.replace(/\n/g, '<br>');
      let finalPlainBody = body;
      
      // Only auto-append signature if:
      // 1. Signature exists
      // 2. Body doesn't already contain the signature (from {{user.signature}} variable)
      // 3. Body doesn't already contain the signature HTML directly
      const shouldAppendSignature = signature?.signatureHtml && 
        !finalHtmlBody.includes(signature.signatureHtml) &&
        !body.includes('{{user.signature}}');
      
      if (shouldAppendSignature && signature?.signatureHtml) {
        // Append signature to HTML body with separator
        finalHtmlBody = finalHtmlBody + '<br><br>--<br>' + signature.signatureHtml;
        // Strip HTML from signature for plain text version
        const signaturePlainText = signature.signatureHtml
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        finalPlainBody = body + '\n\n--\n' + signaturePlainText;
      }
      
      // Generate tracking token and prepare tracked HTML
      let trackedHtmlBody = finalHtmlBody;
      let trackingToken: string | null = null;
      let trackingTokenRecord: any = null;
      
      if (enableTracking) {
        // Generate unique tracking token
        trackingToken = crypto.randomBytes(24).toString('hex');
        
        // Get the base URL for tracking (use HOST header or default)
        const baseUrl = `https://${req.get('host')}`;
        
        // Create tracking pixel URL
        const trackingPixelUrl = `${baseUrl}/api/t/open/${trackingToken}.png`;
        
        // Wrap links in the HTML for click tracking
        trackedHtmlBody = trackedHtmlBody.replace(
          /<a\s+([^>]*href=["'])([^"']+)(["'][^>]*)>/gi,
          (match: string, prefix: string, url: string, suffix: string) => {
            // Don't track mailto: links, tel: links, or internal tracking links
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
        
        // Insert tracking pixel before closing body tag or at the end
        if (trackedHtmlBody.includes('</body>')) {
          trackedHtmlBody = trackedHtmlBody.replace('</body>', `${trackingPixel}</body>`);
        } else {
          trackedHtmlBody = trackedHtmlBody + trackingPixel;
        }
      }
      
      // Send via Gmail with tracked HTML and signature-appended plain text
      // Use user's personal Gmail if available, otherwise use shared connector
      let result;
      if (usePersonalGmail && authUserId) {
        result = await sendEmailAsUser(authUserId, to, subject, finalPlainBody, trackedHtmlBody);
      } else {
        result = await sendEmail(to, subject, finalPlainBody, trackedHtmlBody);
      }
      
      // Verify customerId still exists (may have been merged/deleted by batch dedup)
      let resolvedCustomerId: string | null = customerId || null;
      if (resolvedCustomerId && !resolvedCustomerId.startsWith('lead-')) {
        try {
          const existing = await storage.getCustomer(resolvedCustomerId);
          if (!existing) {
            console.warn(`[Email Send] Customer ${resolvedCustomerId} not found (merged/deleted) — logging send without customer link`);
            resolvedCustomerId = null;
          }
        } catch {
          resolvedCustomerId = null;
        }
      }

      // Log to emailSends table
      const emailSend = await storage.createEmailSend({
        templateId: templateId || null,
        recipientEmail: to,
        recipientName: recipientName || null,
        customerId: resolvedCustomerId,
        subject,
        body: finalPlainBody,
        variableData: variableData || {},
        status: "sent",
        sentBy: req.user?.email || req.user?.claims?.email,
      });
      
      // Create tracking token record if tracking is enabled
      if (enableTracking && trackingToken) {
        try {
          trackingTokenRecord = await storage.createEmailTrackingToken({
            token: trackingToken,
            emailSendId: emailSend.id,
            customerId: resolvedCustomerId,
            recipientEmail: to,
            subject: subject,
            sentBy: req.user?.email || req.user?.claims?.email,
          });
        } catch (trackingError) {
          console.error("Error creating tracking token (non-critical):", trackingError);
        }
      }
      
      // Log the email activity
      try {
        await storage.logActivity({
          userId: req.user?.claims?.sub || req.user?.id || 'anonymous',
          userEmail: req.user?.email || req.user?.claims?.email || 'unknown',
          userRole: req.user?.role || 'user',
          action: 'email_sent',
          actionType: 'email',
          description: `Email sent to ${to}: ${subject}`,
          metadata: { to, subject, messageId: result.id, trackingEnabled: enableTracking }
        });
      } catch (logError) {
        console.error("Error logging email activity (non-critical):", logError);
      }
      
      // Log as customer activity if customerId is provided (skip lead-prefixed IDs)
      const isValidCustomerId = resolvedCustomerId && !resolvedCustomerId.startsWith('lead-');
      if (isValidCustomerId) {
        try {
          await storage.createActivityEvent({
            customerId: resolvedCustomerId,
            eventType: 'email_sent',
            title: `Email sent: ${subject}`,
            description: `Sent to ${to}`,
            eventData: {
              templateId,
              subject,
              recipientEmail: to,
              gmailMessageId: result.id,
            },
            createdBy: req.user?.email,
          });
        } catch (activityError) {
          console.error("Error logging email activity:", activityError);
        }
        
        // Sync email to Odoo contact's chatter (non-blocking)
        try {
          const customer = await storage.getCustomer(resolvedCustomerId);
          if (customer?.odooPartnerId) {
            const { odooClient } = await import("./odoo");
            await odooClient.logEmailToPartner(customer.odooPartnerId, {
              to,
              subject,
              body: htmlBody || body,
              sentAt: new Date(),
            });
            console.log(`[Email Sync] Email logged to Odoo partner ${customer.odooPartnerId}`);
          }
        } catch (odooError: any) {
          console.error("Error syncing email to Odoo (non-critical):", odooError.message);
        }
      }
      
      // Log lead activity and update trust timestamps if this email is to a lead
      let matchedLeadId: number | undefined;
      try {
        // Prefer direct lead ID from customerId (lead-{id}) — avoids email mismatch when recipient differs
        if (resolvedCustomerId?.startsWith('lead-') || customerId?.startsWith('lead-')) {
          const rawId = (resolvedCustomerId || customerId).replace('lead-', '');
          const parsedLeadId = parseInt(rawId);
          if (!isNaN(parsedLeadId)) {
            matchedLeadId = parsedLeadId;
            const now = new Date();
            // Update firstEmailSentAt only if not already set
            const existing = await db.select({ firstEmailSentAt: leads.firstEmailSentAt }).from(leads).where(eq(leads.id, parsedLeadId)).limit(1);
            if (existing.length > 0 && !existing[0].firstEmailSentAt) {
              await db.update(leads).set({ firstEmailSentAt: now }).where(eq(leads.id, parsedLeadId));
              console.log(`[Lead Trust] Marked firstEmailSentAt for lead ${parsedLeadId}`);
            }
            // Log to leadActivities so it appears in the lead's Activity tab
            await db.insert(leadActivities).values({
              leadId: parsedLeadId,
              activityType: 'email_sent',
              summary: `Email sent: ${subject}`,
              details: `To: ${to}`,
              performedBy: req.user?.email || req.user?.claims?.email || 'unknown',
              performedByName: req.user?.email || req.user?.claims?.email || 'unknown',
              createdAt: now,
            });
            // Bump touchpoints and lastContactAt
            await db.update(leads).set({ totalTouchpoints: sql`${leads.totalTouchpoints} + 1`, lastContactAt: now, updatedAt: now }).where(eq(leads.id, parsedLeadId));
            console.log(`[Lead Activity] Logged email activity for lead ${parsedLeadId}`);
          }
        } else {
          // Fallback: try to match by email if no lead ID available
          const normalizedRecipient = to.toLowerCase().trim();
          const leadByEmail = await db.select().from(leads)
            .where(sql`LOWER(${leads.email}) = ${normalizedRecipient} AND ${leads.firstEmailSentAt} IS NULL`)
            .limit(1);
          if (leadByEmail.length > 0) {
            matchedLeadId = leadByEmail[0].id;
            await db.update(leads).set({ firstEmailSentAt: new Date() }).where(eq(leads.id, leadByEmail[0].id));
            console.log(`[Lead Trust] Marked firstEmailSentAt for lead ${leadByEmail[0].id} via email match`);
          }
        }
      } catch (leadError: any) {
        console.error("Error updating lead activity (non-critical):", leadError.message);
      }
      
      // Credit SPOTLIGHT progress for direct email sends (non-blocking)
      try {
        const authUserId = req.user?.claims?.sub || req.user?.id;
        if (authUserId) {
          const { spotlightEngine } = await import("./spotlight-engine");
          const creditResult = await spotlightEngine.creditDirectAction(
            authUserId,
            'email_sent',
            customerId || undefined,
            matchedLeadId,
            { recipientEmail: to, subject }
          );
          if (creditResult.credited) {
            console.log(`[Spotlight] Email credited to outreach bucket: ${creditResult.newProgress.completed}/${creditResult.newProgress.target}`);
          }
        }
      } catch (spotlightError: any) {
        console.error("Error crediting SPOTLIGHT (non-critical):", spotlightError.message);
      }
      
      res.json({ 
        success: true, 
        messageId: result.id, 
        emailSend,
        trackingEnabled: enableTracking,
        trackingToken: trackingToken 
      });
    } catch (error: any) {
      console.error("Error sending email:", error);
      const errorMessage = error?.message || error?.errors?.[0]?.message || "Failed to send email";
      const errorDetails = error?.response?.data || error?.errors || null;
      console.error("Email error details:", JSON.stringify(errorDetails, null, 2));
      res.status(500).json({ 
        error: errorMessage,
        details: errorDetails 
      });
    }
  });
  app.get("/api/gmail-oauth/status", isAuthenticated, async (req: any, res) => {
    try {
      const { getUserGmailConnection } = await import("./user-gmail-oauth");
      const userId = req.user?.claims?.sub || req.user?.id;
      const connection = await getUserGmailConnection(userId);
      
      if (connection && connection.isActive) {
        res.json({
          connected: true,
          email: connection.gmailAddress,
          lastSyncAt: connection.lastSyncAt,
          lastError: connection.lastError,
        });
      } else if (connection && !connection.isActive) {
        res.json({
          connected: false,
          needsReconnect: true,
          email: connection.gmailAddress,
          lastError: connection.lastError,
        });
      } else {
        res.json({ connected: false });
      }
    } catch (error: any) {
      console.error("Error checking Gmail connection:", error);
      res.status(500).json({ error: "Failed to check Gmail connection" });
    }
  });
  app.get("/api/gmail-oauth/connect", isAuthenticated, async (req: any, res) => {
    try {
      const { getAuthUrl } = await import("./user-gmail-oauth");
      const userId = req.user?.claims?.sub || req.user?.id;
      const { randomUUID } = await import('node:crypto');
      const nonce = randomUUID();
      req.session.gmailOAuthNonce = nonce;
      req.session.gmailOAuthUserId = userId;
      const authUrl = getAuthUrl(nonce);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("Error initiating Gmail OAuth:", error);
      if (error.message?.includes('not configured')) {
        res.status(503).json({ 
          error: "Gmail OAuth is not configured. Please contact admin.",
          code: "NOT_CONFIGURED"
        });
      } else {
        res.status(500).json({ error: error.message || "Failed to initiate Gmail connection" });
      }
    }
  });
  app.get("/api/gmail-oauth/callback", async (req: any, res) => {
    try {
      const { code, state: nonce, error: oauthError } = req.query;
      
      if (oauthError) {
        console.error("Gmail OAuth error:", oauthError);
        return res.redirect("/integrations?gmail_error=" + encodeURIComponent(oauthError as string));
      }
      
      if (!code || !nonce) {
        return res.redirect("/integrations?gmail_error=missing_params");
      }

      // Verify nonce matches session to prevent OAuth CSRF / account-linking abuse
      const sessionNonce = req.session?.gmailOAuthNonce;
      const userId = req.session?.gmailOAuthUserId;
      if (!sessionNonce || !userId) {
        console.error("[Gmail OAuth] Session lost during OAuth redirect — session cookie dropped");
        return res.redirect("/integrations?gmail_error=session_lost");
      }
      if (sessionNonce !== nonce) {
        console.error("[Gmail OAuth] State nonce mismatch — possible CSRF attempt");
        return res.redirect("/integrations?gmail_error=invalid_state");
      }
      // Consume the nonce so it can't be replayed
      delete req.session.gmailOAuthNonce;
      delete req.session.gmailOAuthUserId;
      
      const { handleCallback } = await import("./user-gmail-oauth");
      const result = await handleCallback(code as string, userId as string);
      
      res.redirect(`/integrations?gmail_connected=true&email=${encodeURIComponent(result.email)}`);
    } catch (error: any) {
      console.error("Error handling Gmail OAuth callback:", error);
      res.redirect("/integrations?gmail_error=" + encodeURIComponent(error.message || "callback_failed"));
    }
  });
  app.delete("/api/gmail-oauth/disconnect", isAuthenticated, async (req: any, res) => {
    try {
      const { disconnectUserGmail } = await import("./user-gmail-oauth");
      const userId = req.user?.claims?.sub || req.user?.id;
      await disconnectUserGmail(userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error disconnecting Gmail:", error);
      res.status(500).json({ error: "Failed to disconnect Gmail" });
    }
  });
  app.get("/api/gmail-intelligence/sync-state", isAuthenticated, async (req: any, res) => {
    try {
      const { getSyncState } = await import("./gmail-intelligence");
      const userId = req.user?.claims?.sub || req.user?.id;
      const state = await getSyncState(userId);
      res.json(state || { syncStatus: 'never_synced' });
    } catch (error: any) {
      console.error("Error fetching Gmail sync state:", error);
      res.status(500).json({ error: "Failed to fetch sync state" });
    }
  });
  app.post("/api/gmail-intelligence/sync", isAuthenticated, async (req: any, res) => {
    try {
      const { syncGmailMessages, analyzeMessagesForInsights } = await import("./gmail-intelligence");
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.email || req.user?.claims?.email;
      const maxMessages = parseInt(req.body.maxMessages) || 50;
      
      // Ensure user exists in users table (required for foreign key constraints)
      const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!existingUser) {
        // Create a minimal user record for Gmail sync to work
        await db.insert(users).values({
          id: userId,
          email: userEmail,
          role: req.user?.role || 'user',
          status: 'approved',
        }).onConflictDoNothing();
        console.log(`[Gmail Sync] Created user record for: ${userId}`);
      }
      
      // Sync messages from Gmail
      const syncResult = await syncGmailMessages(userId, userEmail, maxMessages);
      
      // Analyze new messages for insights
      const analysisResult = await analyzeMessagesForInsights(userId);
      
      res.json({ 
        success: true, 
        sync: syncResult, 
        analysis: analysisResult 
      });
    } catch (error: any) {
      console.error("Error syncing Gmail:", error);
      
      // Check for insufficient permission error
      if (error.message?.includes('Insufficient Permission') || error.code === 403) {
        return res.status(403).json({ 
          error: "Gmail permissions limited - the current Gmail integration only allows sending emails. Reading inbox requires reconnecting with full Gmail access permissions in the published app.",
          code: "INSUFFICIENT_SCOPE"
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to sync Gmail" });
    }
  });
  app.get("/api/gmail-intelligence/insights", isAuthenticated, async (req: any, res) => {
    try {
      const { getInsightsForUser } = await import("./gmail-intelligence");
      const userId = req.user?.claims?.sub || req.user?.id;
      const userRole = req.user?.role || req.user?.claims?.role;
      const isAdmin = userRole === 'admin';
      const { status, type, customerId, limit } = req.query;
      
      const insights = await getInsightsForUser(userId, {
        status: status as string,
        type: type as string,
        customerId: customerId as string,
        limit: limit ? parseInt(limit as string) : 50,
        showAll: isAdmin,
      });
      
      res.json(insights);
    } catch (error: any) {
      console.error("Error fetching Gmail insights:", error);
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });
  app.get("/api/gmail-intelligence/summary", isAuthenticated, async (req: any, res) => {
    try {
      const { getInsightsSummary } = await import("./gmail-intelligence");
      const userId = req.user?.claims?.sub || req.user?.id;
      const userRole = req.user?.role || req.user?.claims?.role;
      const isAdmin = userRole === 'admin';
      
      const summary = await getInsightsSummary(userId, isAdmin);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching Gmail insights summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });
  app.patch("/api/gmail-intelligence/insights/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { updateInsightStatus } = await import("./gmail-intelligence");
      const insightId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id;
      const { status, reason } = req.body;
      
      if (!['pending', 'acknowledged', 'completed', 'dismissed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      await updateInsightStatus(insightId, status, userId, reason);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating insight status:", error);
      res.status(500).json({ error: "Failed to update insight" });
    }
  });
  app.post("/api/gmail-intelligence/analyze", isAuthenticated, async (req: any, res) => {
    try {
      const { analyzeMessagesForInsights } = await import("./gmail-intelligence");
      const userId = req.user?.claims?.sub || req.user?.id;
      const userRole = req.user?.role || req.user?.claims?.role;
      const isAdmin = userRole === 'admin';
      const limit = parseInt(req.body.limit) || 20;
      
      const result = await analyzeMessagesForInsights(userId, limit, isAdmin);
      res.json(result);
    } catch (error: any) {
      console.error("Error analyzing messages:", error);
      res.status(500).json({ error: "Failed to analyze messages" });
    }
  });
  app.post("/api/gmail-intelligence/rematch", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.user?.role || req.user?.claims?.role;
      if (userRole !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { rematchUnmatchedMessages } = await import("./gmail-intelligence");
      const { createFollowUpTasksFromEvents } = await import("./email-event-extractor");
      
      // Step 1: Rematch messages to customers
      const rematchResult = await rematchUnmatchedMessages();
      
      // Step 2: Re-process events to create follow-up tasks for ALL users (admin mode with null userId)
      const tasksCreated = await createFollowUpTasksFromEvents(null, 500);
      
      res.json({ 
        success: true,
        matched: rematchResult.matched,
        totalUnmatched: rematchResult.total,
        tasksCreated,
        message: `Matched ${rematchResult.matched} of ${rematchResult.total} messages to customers, created ${tasksCreated} tasks`
      });
    } catch (error: any) {
      console.error("Error rematching messages:", error);
      res.status(500).json({ error: error.message || "Failed to rematch messages" });
    }
  });
  app.get("/api/email-intelligence/sync-status", isAuthenticated, async (req: any, res) => {
    try {
      const { getSyncStatus, ensureSyncState } = await import("./gmail-sync-worker");
      const userId = req.user?.claims?.sub || req.user?.id;
      
      await ensureSyncState(userId);
      const status = await getSyncStatus(userId);
      res.json(status);
    } catch (error: any) {
      console.error("Error fetching sync status:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sync status" });
    }
  });
  app.get("/api/email/sync/status", isAuthenticated, async (req: any, res) => {
    try {
      const { getSyncStatus, ensureSyncState } = await import("./gmail-sync-worker");
      const userId = req.user?.claims?.sub || req.user?.id;
      
      await ensureSyncState(userId);
      const status = await getSyncStatus(userId);
      
      // Get skip reasons breakdown
      const skipReasons = await db.select({
        reason: gmailUnmatchedEmails.ignoredReason,
        count: sql<number>`count(*)::int`,
      })
        .from(gmailUnmatchedEmails)
        .where(eq(gmailUnmatchedEmails.status, 'ignored'))
        .groupBy(gmailUnmatchedEmails.ignoredReason);
      
      // Get task creation counts
      const [tasksFromEvents] = await db.select({ count: sql<number>`count(*)::int` })
        .from(followUpTasks)
        .where(eq(followUpTasks.sourceType, 'email_event'));
      
      res.json({
        ...status,
        skipReasonBreakdown: skipReasons.reduce((acc: Record<string, number>, r) => {
          acc[r.reason || 'unknown'] = r.count;
          return acc;
        }, {}),
        tasksCreatedFromEvents: tasksFromEvents?.count || 0,
      });
    } catch (error: any) {
      console.error("Error fetching sync status:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sync status" });
    }
  });
  app.post("/api/email/sync/run", isAuthenticated, async (req: any, res) => {
    try {
      const { syncGmailMessages, ensureSyncState, getSyncStatus } = await import("./gmail-sync-worker");
      const { processUnanalyzedMessages, detectStaleThreads, createFollowUpTasksFromEvents } = await import("./email-event-extractor");
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.email || req.user?.claims?.email;
      
      console.log(`[Email Sync] Manual sync triggered by ${userEmail}`);
      
      // Ensure user exists
      const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!existingUser) {
        await db.insert(users).values({
          id: userId,
          email: userEmail,
          role: req.user?.role || 'user',
          status: 'approved',
        }).onConflictDoNothing();
      }
      
      await ensureSyncState(userId);
      
      // Run the full sync pipeline
      const syncStats = await syncGmailMessages(userId);
      console.log(`[Email Sync] Fetched ${syncStats.messagesStored} messages`);
      
      const eventsExtracted = await processUnanalyzedMessages(userId, 200);
      console.log(`[Email Sync] Extracted ${eventsExtracted} events`);
      
      const staleThreads = await detectStaleThreads(userId);
      console.log(`[Email Sync] Detected ${staleThreads} stale threads`);
      
      const tasksCreated = await createFollowUpTasksFromEvents(userId, 100);
      console.log(`[Email Sync] Created ${tasksCreated} tasks`);
      
      // Get updated status after sync
      const finalStatus = await getSyncStatus(userId);
      
      res.json({ 
        success: true, 
        sync: syncStats,
        eventsExtracted,
        staleThreadsDetected: staleThreads,
        tasksCreated,
        counts: finalStatus.counts,
      });
    } catch (error: any) {
      console.error("[Email Sync] Error:", error);
      if (error.message?.includes('Insufficient Permission') || error.code === 403) {
        return res.status(403).json({ 
          error: "Gmail permissions limited - reading inbox requires full Gmail access permissions.",
          code: "INSUFFICIENT_SCOPE"
        });
      }
      res.status(500).json({ error: error.message || "Failed to sync Gmail" });
    }
  });
  app.post("/api/email-intelligence/sync", isAuthenticated, async (req: any, res) => {
    try {
      const { syncGmailMessages, ensureSyncState } = await import("./gmail-sync-worker");
      const { processUnanalyzedMessages, detectStaleThreads, createFollowUpTasksFromEvents } = await import("./email-event-extractor");
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.email || req.user?.claims?.email;
      
      const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!existingUser) {
        await db.insert(users).values({
          id: userId,
          email: userEmail,
          role: req.user?.role || 'user',
          status: 'approved',
        }).onConflictDoNothing();
      }
      
      await ensureSyncState(userId);
      const syncStats = await syncGmailMessages(userId);
      const eventsExtracted = await processUnanalyzedMessages(userId, 200);
      const staleThreads = await detectStaleThreads(userId);
      const tasksCreated = await createFollowUpTasksFromEvents(userId, 100);
      
      res.json({ 
        success: true, 
        sync: syncStats,
        eventsExtracted,
        staleThreadsDetected: staleThreads,
        tasksCreated,
      });
    } catch (error: any) {
      console.error("Error syncing Gmail:", error);
      if (error.message?.includes('Insufficient Permission') || error.code === 403) {
        return res.status(403).json({ 
          error: "Gmail permissions limited - reading inbox requires full Gmail access permissions.",
          code: "INSUFFICIENT_SCOPE"
        });
      }
      res.status(500).json({ error: error.message || "Failed to sync Gmail" });
    }
  });
  app.get("/api/email-intelligence/unmatched", isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const unmatched = await db.select({
        id: gmailUnmatchedEmails.id,
        email: gmailUnmatchedEmails.email,
        domain: gmailUnmatchedEmails.domain,
        senderName: gmailUnmatchedEmails.senderName,
        subject: gmailUnmatchedEmails.subject,
        messageDate: gmailUnmatchedEmails.messageDate,
        status: gmailUnmatchedEmails.status,
      })
        .from(gmailUnmatchedEmails)
        .where(eq(gmailUnmatchedEmails.status, 'pending'))
        .orderBy(desc(gmailUnmatchedEmails.messageDate))
        .limit(limit);
      
      res.json(unmatched);
    } catch (error: any) {
      console.error("Error fetching unmatched emails:", error);
      res.status(500).json({ error: "Failed to fetch unmatched emails" });
    }
  });
  app.post("/api/email-intelligence/unmatched/:id/link", isAuthenticated, async (req: any, res) => {
    try {
      const unmatchedId = parseInt(req.params.id);
      const { customerId } = req.body;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      
      const [unmatched] = await db.select()
        .from(gmailUnmatchedEmails)
        .where(eq(gmailUnmatchedEmails.id, unmatchedId))
        .limit(1);
      
      if (!unmatched) {
        return res.status(404).json({ error: "Unmatched email not found" });
      }
      
      await db.insert(gmailMessageMatches).values({
        gmailMessageId: unmatched.gmailMessageId,
        customerId,
        matchType: 'manual',
        matchedEmail: unmatched.email,
        confidence: '1.00',
        isConfirmed: true,
        confirmedBy: userId,
        confirmedAt: new Date(),
      });
      
      await db.update(gmailMessages)
        .set({ customerId })
        .where(eq(gmailMessages.id, unmatched.gmailMessageId));
      
      await db.update(gmailUnmatchedEmails)
        .set({ 
          status: 'linked',
          linkedCustomerId: customerId,
          linkedBy: userId,
          linkedAt: new Date(),
        })
        .where(eq(gmailUnmatchedEmails.id, unmatchedId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error linking email:", error);
      res.status(500).json({ error: "Failed to link email" });
    }
  });
  app.post("/api/email-intelligence/unmatched/:id/ignore", isAuthenticated, async (req: any, res) => {
    try {
      const unmatchedId = parseInt(req.params.id);
      const { reason } = req.body;
      
      await db.update(gmailUnmatchedEmails)
        .set({ 
          status: 'ignored',
          ignoredReason: reason || 'Manually ignored',
        })
        .where(eq(gmailUnmatchedEmails.id, unmatchedId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error ignoring email:", error);
      res.status(500).json({ error: "Failed to ignore email" });
    }
  });
  app.post("/api/email-intelligence/rematch", isAuthenticated, async (req: any, res) => {
    try {
      const { matchEmailToCustomer, extractDomain, FREE_EMAIL_PROVIDERS } = await import("./gmail-sync-worker");
      const userId = req.user?.claims?.sub || req.user?.id;
      const limit = parseInt(req.body.limit) || 500;
      
      const pendingUnmatched = await db.select()
        .from(gmailUnmatchedEmails)
        .where(eq(gmailUnmatchedEmails.status, 'pending'))
        .limit(limit);
      
      let matched = 0;
      let ignored = 0;
      let stillUnmatched = 0;
      
      for (const unmatched of pendingUnmatched) {
        const email = unmatched.email?.toLowerCase() || '';
        const domain = unmatched.domain?.toLowerCase() || extractDomain(email);
        
        if (!email || FREE_EMAIL_PROVIDERS.has(domain) || domain.includes('4sgraphics')) {
          await db.update(gmailUnmatchedEmails)
            .set({ 
              status: 'ignored',
              ignoredReason: domain.includes('4sgraphics') ? 'Internal email' : 'Free email provider - no company match possible',
            })
            .where(eq(gmailUnmatchedEmails.id, unmatched.id));
          ignored++;
          continue;
        }
        
        const result = await matchEmailToCustomer(email, domain);
        
        if (result.customerId) {
          await db.insert(gmailMessageMatches).values({
            gmailMessageId: unmatched.gmailMessageId,
            customerId: result.customerId,
            matchType: result.matchType,
            matchedEmail: email,
            confidence: result.confidence.toFixed(2),
            isConfirmed: false,
          }).onConflictDoNothing();
          
          await db.update(gmailMessages)
            .set({ customerId: result.customerId })
            .where(eq(gmailMessages.id, unmatched.gmailMessageId));
          
          await db.update(gmailUnmatchedEmails)
            .set({ 
              status: 'linked',
              linkedCustomerId: result.customerId,
              linkedBy: userId,
              linkedAt: new Date(),
            })
            .where(eq(gmailUnmatchedEmails.id, unmatched.id));
          matched++;
        } else {
          stillUnmatched++;
        }
      }
      
      res.json({ 
        success: true, 
        processed: pendingUnmatched.length,
        matched,
        ignored,
        stillUnmatched,
      });
    } catch (error: any) {
      console.error("Error re-matching emails:", error);
      res.status(500).json({ error: error.message || "Failed to re-match emails" });
    }
  });
  app.get("/api/email-intelligence/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const { eventType, customerId, limit: limitParam, category } = req.query;
      const limit = parseInt(limitParam as string) || 100;
      
      const conditions = [eq(emailSalesEvents.userId, userId)];
      if (eventType && eventType !== 'all') {
        conditions.push(eq(emailSalesEvents.eventType, eventType as string));
      }
      if (customerId) {
        conditions.push(eq(emailSalesEvents.customerId, customerId as string));
      }
      
      // Category filtering - group event types into categories
      // Using actual event types from EMAIL_SALES_EVENT_TYPES
      if (category && category !== 'all') {
        const categoryMap: Record<string, string[]> = {
          urgent: ['urgent', 'po', 'approval'],
          opportunities: ['opportunity', 'lead', 'samples'],
          commitments: ['commitment', 'sales_win', 'press_test_success', 'swatch_received'],
          actions: ['action', 'quote_sent', 'price_sent', 'pricelist_sent'],
          feedback: ['feedback'],
        };
        const types = categoryMap[category as string] || [];
        if (types.length > 0) {
          conditions.push(inArray(emailSalesEvents.eventType, types));
        }
      }
      
      const events = await db.select({
        id: emailSalesEvents.id,
        eventType: emailSalesEvents.eventType,
        confidence: emailSalesEvents.confidence,
        triggerText: emailSalesEvents.triggerText,
        occurredAt: emailSalesEvents.occurredAt,
        customerId: emailSalesEvents.customerId,
        customerName: customers.company,
        isProcessed: emailSalesEvents.isProcessed,
        coachingTip: emailSalesEvents.coachingTip,
        followUpTaskId: emailSalesEvents.followUpTaskId,
        senderName: gmailMessages.fromName,
        senderEmail: gmailMessages.fromEmail,
        subject: gmailMessages.subject,
        direction: gmailMessages.direction,
      })
        .from(emailSalesEvents)
        .leftJoin(customers, eq(emailSalesEvents.customerId, customers.id))
        .leftJoin(gmailMessages, eq(emailSalesEvents.gmailMessageId, gmailMessages.id))
        .where(and(...conditions))
        .orderBy(desc(emailSalesEvents.occurredAt))
        .limit(limit);
      
      // Get total count for pagination info
      const totalResult = await db.select({ count: sql<number>`count(*)` })
        .from(emailSalesEvents)
        .where(and(...conditions));
      
      // Get counts by category for tabs
      // Using actual event types from EMAIL_SALES_EVENT_TYPES
      const categoryCounts = await db.execute(sql`
        SELECT 
          CASE 
            WHEN event_type IN ('urgent', 'po', 'approval') THEN 'urgent'
            WHEN event_type IN ('opportunity', 'lead', 'samples') THEN 'opportunities'
            WHEN event_type IN ('commitment', 'sales_win', 'press_test_success', 'swatch_received') THEN 'commitments'
            WHEN event_type IN ('action', 'quote_sent', 'price_sent', 'pricelist_sent') THEN 'actions'
            WHEN event_type = 'feedback' THEN 'feedback'
            ELSE 'other'
          END as category,
          COUNT(*) as count
        FROM email_sales_events
        WHERE user_id = ${userId}
        GROUP BY category
      `);
      
      res.json({ 
        events, 
        total: Number(totalResult[0]?.count || 0),
        categoryCounts: (categoryCounts as any).rows || []
      });
    } catch (error: any) {
      console.error("Error fetching sales events:", error);
      res.status(500).json({ error: "Failed to fetch sales events" });
    }
  });
  app.patch("/api/email-intelligence/events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const eventId = parseInt(req.params.id);
      const { eventType } = req.body;
      
      const validTypes = ['po', 'approval', 'samples', 'urgent', 'opportunity', 'commitment', 'action', 'feedback', 'sales_win', 'press_test_success', 'swatch_received', 'lead', 'price_sent', 'pricelist_sent', 'quote_sent', 'dismissed'];
      if (!validTypes.includes(eventType)) {
        return res.status(400).json({ error: "Invalid event type" });
      }
      
      await db.update(emailSalesEvents)
        .set({ eventType })
        .where(and(eq(emailSalesEvents.id, eventId), eq(emailSalesEvents.userId, userId)));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating event type:", error);
      res.status(500).json({ error: "Failed to update event" });
    }
  });
  app.delete("/api/email-intelligence/events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const eventId = parseInt(req.params.id);
      
      await db.delete(emailSalesEvents)
        .where(and(eq(emailSalesEvents.id, eventId), eq(emailSalesEvents.userId, userId)));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });
  app.get("/api/email-intelligence/blacklist", isAuthenticated, async (req: any, res) => {
    try {
      const blacklist = await db.select().from(emailIntelligenceBlacklist).orderBy(desc(emailIntelligenceBlacklist.createdAt));
      res.json(blacklist);
    } catch (error: any) {
      console.error("Error fetching blacklist:", error);
      res.status(500).json({ error: "Failed to fetch blacklist" });
    }
  });
  app.post("/api/email-intelligence/blacklist", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const { pattern, patternType, reason } = req.body;
      
      if (!pattern) {
        return res.status(400).json({ error: "Pattern is required" });
      }
      
      const [entry] = await db.insert(emailIntelligenceBlacklist).values({
        pattern: pattern.toLowerCase().trim(),
        patternType: patternType || 'email',
        reason,
        addedBy: userId,
      }).returning();
      
      res.json(entry);
    } catch (error: any) {
      console.error("Error adding to blacklist:", error);
      res.status(500).json({ error: "Failed to add to blacklist" });
    }
  });
  app.delete("/api/email-intelligence/blacklist/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(emailIntelligenceBlacklist).where(eq(emailIntelligenceBlacklist.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing from blacklist:", error);
      res.status(500).json({ error: "Failed to remove from blacklist" });
    }
  });
  app.get("/api/email-intelligence/events/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      
      const summary = await db.execute(sql`
        SELECT 
          event_type,
          COUNT(*) as count,
          AVG(confidence::numeric) as avg_confidence,
          COUNT(CASE WHEN is_processed THEN 1 END) as processed_count
        FROM email_sales_events
        WHERE user_id = ${userId}
        GROUP BY event_type
        ORDER BY count DESC
      `);
      
      res.json((summary as any).rows || []);
    } catch (error: any) {
      console.error("Error fetching events summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });
  app.post("/api/email-intelligence/events/enrich", isAuthenticated, async (req: any, res) => {
    try {
      const { enrichEventsWithCoaching } = await import("./email-event-extractor");
      const userId = req.user?.claims?.sub || req.user?.id;
      const limit = parseInt(req.body.limit) || 20;
      
      const enriched = await enrichEventsWithCoaching(userId, limit);
      res.json({ success: true, enriched });
    } catch (error: any) {
      console.error("Error enriching events:", error);
      res.status(500).json({ error: "Failed to enrich events" });
    }
  });
  app.post("/api/email-intelligence/reanalyze", isAuthenticated, async (req: any, res) => {
    try {
      const { processUnanalyzedMessages, detectStaleThreads, createFollowUpTasksFromEvents } = await import("./email-event-extractor");
      const userId = req.user?.claims?.sub || req.user?.id;
      const limit = parseInt(req.body.limit) || 500;
      
      await db.delete(emailSalesEvents).where(eq(emailSalesEvents.userId, userId));
      
      await db.update(gmailMessages)
        .set({ analysisStatus: 'pending' })
        .where(eq(gmailMessages.userId, userId));
      
      const eventsExtracted = await processUnanalyzedMessages(userId, limit);
      const staleThreads = await detectStaleThreads(userId);
      const tasksCreated = await createFollowUpTasksFromEvents(userId, 100);
      
      res.json({ 
        success: true, 
        eventsExtracted,
        staleThreadsDetected: staleThreads,
        tasksCreated,
      });
    } catch (error: any) {
      console.error("Error re-analyzing emails:", error);
      res.status(500).json({ error: error.message || "Failed to re-analyze emails" });
    }
  });
  app.get("/api/email/templates", isAuthenticated, async (req: any, res) => {
    try {
      const templates = await storage.getEmailTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ error: "Failed to fetch email templates" });
    }
  });
  app.get("/api/email/templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getEmailTemplate(id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching email template:", error);
      res.status(500).json({ error: "Failed to fetch email template" });
    }
  });
  app.post("/api/email/templates", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { name, description, subject, body, category, variables, isActive } = req.body;
      
      if (!name || !subject || !body) {
        return res.status(400).json({ error: "Name, subject, and body are required" });
      }
      
      // Auto-detect variables from content - always scan the body/subject
      const detectedVars = extractTemplateVariables(subject, body);
      // Merge with provided variables, preferring detected ones
      const providedVars = Array.isArray(variables) ? variables : [];
      const finalVariables = [...new Set([...detectedVars, ...providedVars])];
      
      const template = await storage.createEmailTemplate({
        name,
        description,
        subject,
        body,
        category: category || "general",
        variables: finalVariables,
        isActive: isActive !== false,
        createdBy: req.user?.email,
      });
      
      res.json(template);
    } catch (error) {
      console.error("Error creating email template:", error);
      res.status(500).json({ error: "Failed to create email template" });
    }
  });
  app.patch("/api/email/templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      const isAdmin = req.user?.role === 'admin';
      
      // Check ownership or admin status
      const existingTemplate = await storage.getEmailTemplate(id);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }
      if (!isAdmin && existingTemplate.createdBy !== userId) {
        return res.status(403).json({ error: "Not authorized to edit this template" });
      }
      
      const { name, description, subject, body, category, variables, isActive } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (subject !== undefined) updateData.subject = subject;
      if (body !== undefined) updateData.body = body;
      if (category !== undefined) updateData.category = category;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      // Get current template to preserve existing variables and merge with detected ones
      const currentTemplate = existingTemplate;
      if (currentTemplate) {
        const finalSubject = subject !== undefined ? subject : currentTemplate.subject;
        const finalBody = body !== undefined ? body : currentTemplate.body;
        const detectedVars = extractTemplateVariables(finalSubject, finalBody);
        const existingVars = Array.isArray(currentTemplate.variables) ? currentTemplate.variables as string[] : [];
        const providedVars = Array.isArray(variables) ? variables : [];
        // Merge: detected from content + explicitly provided + existing stored variables
        updateData.variables = [...new Set([...detectedVars, ...providedVars, ...existingVars])];
      } else if (variables !== undefined) {
        updateData.variables = variables;
      }
      
      const template = await storage.updateEmailTemplate(id, updateData);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error updating email template:", error);
      res.status(500).json({ error: "Failed to update email template" });
    }
  });
  app.delete("/api/email/templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      const userEmail = req.user?.email;
      const userId = req.user?.id;
      const isAdmin = req.user?.role === 'admin';
      
      // Check ownership or admin status
      const existingTemplate = await storage.getEmailTemplate(id);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }
      const canDelete = isAdmin || 
        existingTemplate.createdBy === userEmail || 
        existingTemplate.createdBy === userId;
      if (!canDelete) {
        return res.status(403).json({ error: "Not authorized to delete this template" });
      }
      
      await storage.deleteEmailTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting email template:", error);
      res.status(500).json({ error: "Failed to delete email template" });
    }
  });
  app.post("/api/email/render", isAuthenticated, async (req: any, res) => {
    try {
      const { templateId, variables } = req.body;
      
      const template = await storage.getEmailTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Replace variables in subject and body
      let renderedSubject = template.subject;
      let renderedBody = template.body;
      
      if (variables && typeof variables === 'object') {
        for (const [key, value] of Object.entries(variables)) {
          const pattern = new RegExp(`{{${key}}}`, 'g');
          renderedSubject = renderedSubject.replace(pattern, String(value || ''));
          renderedBody = renderedBody.replace(pattern, String(value || ''));
        }
      }
      
      res.json({
        subject: renderedSubject,
        body: renderedBody,
        templateName: template.name,
      });
    } catch (error) {
      console.error("Error rendering email template:", error);
      res.status(500).json({ error: "Failed to render email template" });
    }
  });
  app.get("/api/email/sends", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.query;
      const sends = await storage.getEmailSends(customerId as string | undefined);
      res.json(sends);
    } catch (error) {
      console.error("Error fetching email sends:", error);
      res.status(500).json({ error: "Failed to fetch email sends" });
    }
  });
  app.get("/api/email/signature", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      const signature = await storage.getEmailSignature(userId);
      
      // If no saved signature, return null so frontend knows to prompt setup
      if (!signature) {
        return res.json(null);
      }
      
      res.json(signature);
    } catch (error) {
      console.error("Error fetching email signature:", error);
      res.status(500).json({ error: "Failed to fetch email signature" });
    }
  });
  app.post("/api/email/signature", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { name, title, phone, cellPhone, signatureHtml } = req.body;
      
      if (!signatureHtml) {
        return res.status(400).json({ error: "Signature HTML is required" });
      }

      const existingSignature = await storage.getEmailSignature(userId);
      
      if (existingSignature) {
        const updated = await storage.updateEmailSignature(userId, {
          name,
          title,
          phone,
          cellPhone,
          signatureHtml,
        });
        res.json(updated);
      } else {
        const created = await storage.createEmailSignature({
          userId,
          name,
          title,
          phone,
          cellPhone,
          signatureHtml,
          isActive: true,
        });
        res.json(created);
      }
    } catch (error) {
      console.error("Error saving email signature:", error);
      res.status(500).json({ error: "Failed to save email signature" });
    }
  });
  app.delete("/api/email/signature", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      await storage.deleteEmailSignature(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting email signature:", error);
      res.status(500).json({ error: "Failed to delete email signature" });
    }
  });
  app.get("/api/email/tracking/:customerId", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const tokens = await storage.getEmailTrackingTokensByCustomer(customerId);
      
      // Get events for each token
      const trackingData = await Promise.all(
        tokens.map(async (token) => {
          const events = await storage.getEmailTrackingEventsByToken(token.id);
          return { ...token, events };
        })
      );
      
      res.json(trackingData);
    } catch (error) {
      console.error("Error fetching email tracking data:", error);
      res.status(500).json({ error: "Failed to fetch tracking data" });
    }
  });
}
