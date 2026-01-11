import { db } from "./db";
import { sentQuotes } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { sendEmail } from "./gmail-client";
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from "./advisory-lock";

const POLL_INTERVAL_MS = 60000 * 60; // Check hourly
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let hasLock = false;

export async function startQuoteFollowUpWorker() {
  if (intervalHandle !== null) {
    console.log("[Quote Follow-up Worker] Already running, skipping start");
    return;
  }
  
  hasLock = await tryAcquireAdvisoryLock('QUOTE_FOLLOWUP_WORKER');
  if (!hasLock) {
    console.log("[Quote Follow-up Worker] Another instance holds the lock, skipping start");
    return;
  }
  
  console.log("[Quote Follow-up Worker] Acquired lock, starting quote follow-up worker...");
  
  processOverdueQuotes();
  
  intervalHandle = setInterval(() => {
    processOverdueQuotes();
  }, POLL_INTERVAL_MS);
}

export async function stopQuoteFollowUpWorker() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (hasLock) {
    await releaseAdvisoryLock('QUOTE_FOLLOWUP_WORKER');
    hasLock = false;
  }
  console.log("[Quote Follow-up Worker] Stopped quote follow-up worker");
}

async function processOverdueQuotes() {
  if (isProcessing) {
    return;
  }
  
  isProcessing = true;
  
  try {
    const now = new Date();
    
    // Find quotes that are past their follow-up due date and still pending
    const overdueQuotes = await db.select().from(sentQuotes)
      .where(sql`
        ${sentQuotes.outcome} = 'pending' 
        AND ${sentQuotes.followUpDueAt} IS NOT NULL 
        AND ${sentQuotes.followUpDueAt} < ${now}
        AND (${sentQuotes.lostNotificationSent} = false OR ${sentQuotes.lostNotificationSent} IS NULL)
      `)
      .limit(20);
    
    if (overdueQuotes.length === 0) {
      isProcessing = false;
      return;
    }
    
    console.log(`[Quote Follow-up Worker] Processing ${overdueQuotes.length} overdue quotes`);
    
    for (const quote of overdueQuotes) {
      try {
        // Mark as lost
        await db.update(sentQuotes)
          .set({
            outcome: 'lost',
            outcomeUpdatedAt: now,
            outcomeUpdatedBy: 'system',
            outcomeNotes: 'Auto-marked as lost after 10 days without follow-up',
            lostNotificationSent: true
          })
          .where(eq(sentQuotes.id, quote.id));
        
        console.log(`[Quote Follow-up Worker] Quote ${quote.quoteNumber} marked as LOST (overdue)`);
        
        // Send email notification to the quote owner
        if (quote.ownerEmail) {
          try {
            await sendEmail({
              to: quote.ownerEmail,
              subject: `Quote ${quote.quoteNumber} Marked as Lost - Action Required`,
              body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">Quote Follow-up Alert</h2>
                  <p>Your quote <strong>${quote.quoteNumber}</strong> for <strong>${quote.customerName}</strong> has been automatically marked as <span style="color: #dc2626; font-weight: bold;">LOST</span> because no follow-up was recorded within 10 days.</p>
                  
                  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Quote Details:</strong></p>
                    <ul style="margin: 8px 0;">
                      <li>Quote #: ${quote.quoteNumber}</li>
                      <li>Customer: ${quote.customerName}</li>
                      <li>Amount: $${parseFloat(quote.totalAmount).toFixed(2)}</li>
                      <li>Created: ${quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A'}</li>
                    </ul>
                  </div>
                  
                  <p><strong>Next Steps:</strong></p>
                  <ol>
                    <li>Log into the CRM and find this quote</li>
                    <li>If the quote was actually won, update the outcome</li>
                    <li>If lost, record the objection details for coaching insights</li>
                  </ol>
                  
                  <p style="color: #666; font-size: 14px; margin-top: 20px;">
                    This helps our coaching system understand win/loss patterns and improve our sales approach.
                  </p>
                </div>
              `
            });
            console.log(`[Quote Follow-up Worker] Notification email sent to ${quote.ownerEmail}`);
          } catch (emailError) {
            console.error(`[Quote Follow-up Worker] Failed to send email to ${quote.ownerEmail}:`, emailError);
          }
        }
        
      } catch (quoteError) {
        console.error(`[Quote Follow-up Worker] Error processing quote ${quote.id}:`, quoteError);
      }
    }
    
  } catch (error) {
    console.error("[Quote Follow-up Worker] Error processing overdue quotes:", error);
  } finally {
    isProcessing = false;
  }
}
