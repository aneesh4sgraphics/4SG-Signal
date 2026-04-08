import { db } from "./db";
import { users, spotlightEvents, labelPrints, customers, leads } from "@shared/schema";
import { eq, and, gte, lt, isNotNull, inArray, sql, or } from "drizzle-orm";
import { sendEmail } from "./gmail-client";
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from "./advisory-lock";

// Cron: 8 AM weekdays — checks every hour, fires once per day
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let hasLock = false;
let lastSentDate: string | null = null; // YYYY-MM-DD — prevents duplicate sends per day

export async function startSpotlightDigestWorker() {
  if (intervalHandle !== null) {
    console.log("[Spotlight Digest] Already running, skipping start");
    return;
  }

  hasLock = await tryAcquireAdvisoryLock('SPOTLIGHT_DIGEST_WORKER');
  if (!hasLock) {
    console.log("[Spotlight Digest] Another instance holds the lock, skipping start");
    return;
  }

  console.log("[Spotlight Digest] Acquired lock, starting worker...");

  checkAndSendDigest();

  intervalHandle = setInterval(() => {
    checkAndSendDigest();
  }, POLL_INTERVAL_MS);
}

export async function stopSpotlightDigestWorker() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (hasLock) {
    await releaseAdvisoryLock('SPOTLIGHT_DIGEST_WORKER');
    hasLock = false;
  }
  console.log("[Spotlight Digest] Stopped");
}

async function checkAndSendDigest() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
  const todayStr = now.toISOString().slice(0, 10);

  // Only run on weekdays at 8 AM (hour 8)
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  if (!isWeekday || hour !== 8) return;

  // Only send once per day
  if (lastSentDate === todayStr) {
    console.log("[Spotlight Digest] Already sent today, skipping");
    return;
  }

  console.log("[Spotlight Digest] Starting daily digest send...");
  lastSentDate = todayStr;

  try {
    const allUsers = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.status, 'approved'),
          eq(users.spotlightDigestEnabled, true)
        )
      );

    console.log(`[Spotlight Digest] Found ${allUsers.length} eligible recipients`);

    for (const user of allUsers) {
      try {
        await sendDigestToUser(user, now);
      } catch (err: any) {
        console.error(`[Spotlight Digest] Failed for ${user.email}:`, err.message);
      }
    }

    console.log("[Spotlight Digest] Daily digest complete");
  } catch (err: any) {
    console.error("[Spotlight Digest] Worker error:", err.message);
  }
}

interface YesterdayActivity {
  callsCount: number;
  emailsCount: number;
  hygieneCount: number;
  quotesFollowedUp: number;
  customersWorkedCount: number;
  swatchbooksCount: number;
  pressTestKitsCount: number;
  contactsList: Array<{ name: string; email: string | null }>;
}

async function getYesterdayActivity(userId: string): Promise<YesterdayActivity> {
  // "Yesterday" = previous calendar day, midnight to midnight
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const [eventsAgg, labelStats, workedRaw] = await Promise.all([
    // Aggregate counts from spotlight_events
    db.select({
      callsCount:      sql<number>`COUNT(CASE WHEN outcome_id = 'called' THEN 1 END)::int`,
      emailsCount:     sql<number>`COUNT(CASE WHEN outcome_id IN ('email_sent','send_drip','replied') THEN 1 END)::int`,
      hygieneCount:    sql<number>`COUNT(CASE WHEN bucket = 'data_hygiene' THEN 1 END)::int`,
      quotesCount:     sql<number>`COUNT(CASE WHEN task_subtype IN ('odoo_quote_followup','shopify_draft_followup','shopify_abandoned_cart','saved_quote_followup') AND outcome_id IN ('called','email_sent','contacted','order_confirmed','order_placed') THEN 1 END)::int`,
    })
    .from(spotlightEvents)
    .where(and(
      eq(spotlightEvents.userId, userId),
      eq(spotlightEvents.eventType, 'task_completed'),
      gte(spotlightEvents.createdAt, yesterday),
      lt(spotlightEvents.createdAt, todayMidnight),
    )),

    // Swatchbooks / press test kits printed yesterday
    db.select({ labelType: labelPrints.labelType, count: sql<number>`COUNT(*)::int` })
      .from(labelPrints)
      .where(and(
        eq(labelPrints.printedByUserId, userId),
        gte(labelPrints.createdAt, yesterday),
        lt(labelPrints.createdAt, todayMidnight),
        or(eq(labelPrints.labelType, 'swatch_book'), eq(labelPrints.labelType, 'press_test_kit')),
      ))
      .groupBy(labelPrints.labelType),

    // Distinct customers/leads worked yesterday
    db.select({ customerId: spotlightEvents.customerId })
      .from(spotlightEvents)
      .where(and(
        eq(spotlightEvents.userId, userId),
        isNotNull(spotlightEvents.customerId),
        gte(spotlightEvents.createdAt, yesterday),
        lt(spotlightEvents.createdAt, todayMidnight),
      ))
      .groupBy(spotlightEvents.customerId)
      .limit(15),
  ]);

  const swatchbooksCount   = labelStats.find(s => s.labelType === 'swatch_book')?.count || 0;
  const pressTestKitsCount = labelStats.find(s => s.labelType === 'press_test_kit')?.count || 0;
  const agg = eventsAgg[0] || { callsCount: 0, emailsCount: 0, hygieneCount: 0, quotesCount: 0 };

  // Fetch display names for the worked contacts (up to 10 to keep email concise)
  const workedIds = workedRaw.map(r => r.customerId).filter(Boolean) as string[];
  let contactsList: Array<{ name: string; email: string | null }> = [];

  if (workedIds.length > 0) {
    const [custRows, leadRows] = await Promise.all([
      db.select({ id: customers.id, company: customers.company, email: customers.email })
        .from(customers)
        .where(inArray(customers.id, workedIds)),
      db.select({ id: leads.id, company: leads.company, email: leads.email })
        .from(leads)
        .where(inArray(leads.id, workedIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n)))),
    ]);

    const nameMap = new Map<string, { name: string; email: string | null }>();
    for (const c of custRows) {
      nameMap.set(String(c.id), { name: c.company || c.email || 'Unknown', email: c.email });
    }
    for (const l of leadRows) {
      nameMap.set(String(l.id), { name: l.company || l.email || 'Unknown', email: l.email });
    }

    contactsList = workedIds
      .slice(0, 10)
      .map(id => nameMap.get(id))
      .filter(Boolean) as Array<{ name: string; email: string | null }>;
  }

  return {
    callsCount:          agg.callsCount,
    emailsCount:         agg.emailsCount,
    hygieneCount:        agg.hygieneCount,
    quotesFollowedUp:    agg.quotesCount,
    customersWorkedCount: workedIds.length,
    swatchbooksCount,
    pressTestKitsCount,
    contactsList,
  };
}

async function sendDigestToUser(user: typeof users.$inferSelect, now: Date) {
  const firstName = user.firstName || user.email.split('@')[0];

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateLabel = yesterday.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const activity = await getYesterdayActivity(user.id);
  const appUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}`;

  const totalActions = activity.callsCount + activity.emailsCount + activity.swatchbooksCount +
    activity.pressTestKitsCount + activity.quotesFollowedUp + activity.hygieneCount;

  if (totalActions === 0 && activity.customersWorkedCount === 0) {
    console.log(`[Spotlight Digest] No activity yesterday for ${user.email}, skipping`);
    return;
  }

  // Build stat rows
  const stats: Array<{ label: string; value: number; icon: string; color: string }> = [
    { label: 'Calls Made',        value: activity.callsCount,          icon: '📞', color: '#10b981' },
    { label: 'Emails Sent',       value: activity.emailsCount,         icon: '✉️',  color: '#6366f1' },
    { label: 'Quotes Followed Up',value: activity.quotesFollowedUp,    icon: '📄', color: '#f59e0b' },
    { label: 'Swatchbooks',       value: activity.swatchbooksCount,    icon: '🎨', color: '#ec4899' },
    { label: 'Press Test Kits',   value: activity.pressTestKitsCount,  icon: '🧪', color: '#8b5cf6' },
    { label: 'Data Hygiene',      value: activity.hygieneCount,        icon: '🧹', color: '#64748b' },
  ].filter(s => s.value > 0);

  const statCells = stats.map(s => `
    <td style="padding:16px 12px;text-align:center;border-right:1px solid #f1f5f9;">
      <div style="font-size:22px;margin-bottom:4px;">${s.icon}</div>
      <div style="font-size:24px;font-weight:700;color:${s.color};">${s.value}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px;">${s.label}</div>
    </td>`).join('');

  const contactRows = activity.contactsList.map((c, i) => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 12px;font-size:13px;color:#374151;">
        <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#6366f1;color:#fff;font-size:10px;font-weight:700;text-align:center;line-height:20px;margin-right:8px;">${i + 1}</span>
        ${escapeHtml(c.name)}
      </td>
      <td style="padding:8px 12px;font-size:12px;color:#9ca3af;">${escapeHtml(c.email || '')}</td>
    </tr>`).join('');

  const contactsSection = activity.contactsList.length > 0 ? `
    <div style="margin-top:24px;">
      <h3 style="font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">
        Contacts Worked (${activity.customersWorkedCount})
      </h3>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
        <tbody>${contactRows}</tbody>
      </table>
      ${activity.customersWorkedCount > 10 ? `<p style="font-size:12px;color:#9ca3af;margin:6px 0 0;">+${activity.customersWorkedCount - 10} more</p>` : ''}
    </div>` : '';

  const summaryLine = totalActions > 0
    ? `You completed <strong>${totalActions} action${totalActions !== 1 ? 's' : ''}</strong> across <strong>${activity.customersWorkedCount} contact${activity.customersWorkedCount !== 1 ? 's' : ''}</strong>.`
    : `You worked with <strong>${activity.customersWorkedCount} contact${activity.customersWorkedCount !== 1 ? 's' : ''}</strong>.`;

  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

  const [kanbanCounts] = await db.select({
    replied: sql<number>`COUNT(CASE WHEN first_email_reply_at IS NOT NULL THEN 1 END)::int`,
    samplesSent: sql<number>`COUNT(CASE WHEN press_test_kit_sent_at IS NOT NULL OR sample_envelope_sent_at IS NOT NULL THEN 1 END)::int`,
    noResponse: sql<number>`COUNT(CASE WHEN last_contact_at < ${tenDaysAgo} AND first_email_reply_at IS NULL AND first_email_sent_at IS NOT NULL THEN 1 END)::int`,
    issues: sql<number>`COUNT(CASE WHEN sales_kanban_stage = 'issue' THEN 1 END)::int`,
  }).from(leads);

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:32px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">⚡ Daily Activity Summary</h1>
      <p style="color:#e0e7ff;margin:6px 0 0;font-size:14px;">${dateLabel}</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 20px;">
        Good morning, <strong>${escapeHtml(firstName)}</strong> — here's what you accomplished yesterday.<br/>
        <span style="color:#6b7280;font-size:14px;">${summaryLine}</span>
      </p>

      ${stats.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <tbody>
          <tr>${statCells}</tr>
        </tbody>
      </table>` : ''}

      ${contactsSection}

      <div style="background:#ffffff;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #e2e8f0;">
        <h2 style="font-size:16px;font-weight:600;color:#1a1a1a;margin:0 0 14px;">Pipeline snapshot</h2>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 12px;background:#D1FAE5;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:22px;font-weight:700;color:#059669">${kanbanCounts?.replied ?? 0}</div>
              <div style="font-size:11px;color:#065f46">Replied</div>
            </td>
            <td style="width:8px"></td>
            <td style="padding:8px 12px;background:#DBEAFE;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:22px;font-weight:700;color:#2563EB">${kanbanCounts?.samplesSent ?? 0}</div>
              <div style="font-size:11px;color:#1e40af">Samples sent</div>
            </td>
            <td style="width:8px"></td>
            <td style="padding:8px 12px;background:#FEF9C3;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:22px;font-weight:700;color:#D97706">${kanbanCounts?.noResponse ?? 0}</div>
              <div style="font-size:11px;color:#92400e">No response</div>
            </td>
            <td style="width:8px"></td>
            <td style="padding:8px 12px;background:#FEE2E2;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:22px;font-weight:700;color:#DC2626">${kanbanCounts?.issues ?? 0}</div>
              <div style="font-size:11px;color:#991b1b">Issues</div>
            </td>
          </tr>
        </table>
      </div>
    </div>

    <div style="padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <a href="${appUrl}/spotlight" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Open Spotlight →</a>
    </div>

    <div style="padding:16px 32px;text-align:center;color:#9ca3af;font-size:12px;">
      You're receiving this because you have the daily digest enabled.<br/>
      To unsubscribe, go to <a href="${appUrl}/integrations" style="color:#6366f1;">your settings</a>.
    </div>
  </div>
</body>
</html>`;

  const textBody = `Good morning, ${firstName}!\n\nYour activity summary for ${dateLabel}:\n\n` +
    stats.map(s => `• ${s.label}: ${s.value}`).join('\n') +
    (activity.contactsList.length > 0
      ? `\n\nContacts worked:\n` + activity.contactsList.map((c, i) => `${i + 1}. ${c.name}`).join('\n')
      : '') +
    `\n\nOpen Spotlight: ${appUrl}/spotlight`;

  await sendEmail(
    user.email,
    `Your activity summary for ${dateLabel}`,
    textBody,
    htmlBody,
    'replit-Signal'
  );

  console.log(`[Spotlight Digest] Sent to ${user.email} (${totalActions} actions, ${activity.customersWorkedCount} contacts)`);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Manually trigger the digest for a specific user (for testing) */
export async function triggerDigestForUser(userId: string): Promise<{ sent: boolean; error?: string }> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { sent: false, error: 'User not found' };
    await sendDigestToUser(user, new Date());
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}
