import { db } from "./db";
import { users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "./gmail-client";
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from "./advisory-lock";
import { getTopSpotlightCustomers } from "./spotlight-engine";

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

async function sendDigestToUser(user: typeof users.$inferSelect, now: Date) {
  const firstName = user.firstName || user.email.split('@')[0];
  const topCustomers = await getTopSpotlightCustomers(user.id, 5);

  if (topCustomers.length === 0) {
    console.log(`[Spotlight Digest] No items for ${user.email}, skipping`);
    return;
  }

  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const appUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}`;

  const customerRows = topCustomers
    .map((item, idx) => {
      const name = item.customer.company ||
        [item.customer.firstName, item.customer.lastName].filter(Boolean).join(' ') ||
        item.customer.email || 'Unknown';
      const email = item.customer.email || '';
      const detailUrl = `${appUrl}/customer-management`;
      return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:12px 8px;font-weight:600;color:#1e293b;">${idx + 1}. ${escapeHtml(name)}</td>
          <td style="padding:12px 8px;color:#64748b;font-size:13px;">${escapeHtml(item.reason.primary)}</td>
          <td style="padding:12px 8px;">
            <a href="${detailUrl}" style="color:#6366f1;font-size:13px;text-decoration:none;">View →</a>
          </td>
        </tr>`;
    })
    .join('');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:32px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">⚡ Spotlight Digest</h1>
      <p style="color:#e0e7ff;margin:6px 0 0;font-size:14px;">${dateLabel}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 20px;">Good morning, <strong>${escapeHtml(firstName)}</strong> — here are your top ${topCustomers.length} priorities for today.</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Customer</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Why Now</th>
            <th style="padding:10px 8px;width:60px;"></th>
          </tr>
        </thead>
        <tbody>${customerRows}</tbody>
      </table>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <a href="${appUrl}/spotlight" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">View all priorities in Spotlight →</a>
    </div>
    <div style="padding:16px 32px;text-align:center;color:#9ca3af;font-size:12px;">
      You're receiving this because you have Spotlight digest enabled. <br/>
      To unsubscribe, go to <a href="${appUrl}/integrations" style="color:#6366f1;">your settings</a>.
    </div>
  </div>
</body>
</html>`;

  const textBody = `Good morning, ${firstName}!\n\nYour top Spotlight priorities for ${dateLabel}:\n\n${
    topCustomers.map((item, idx) => {
      const name = item.customer.company ||
        [item.customer.firstName, item.customer.lastName].filter(Boolean).join(' ') ||
        item.customer.email || 'Unknown';
      return `${idx + 1}. ${name}\n   ${item.reason.primary}`;
    }).join('\n\n')
  }\n\nView all in Spotlight: ${appUrl}/spotlight`;

  await sendEmail(
    user.email,
    `Your Spotlight priorities for today — ${dateLabel}`,
    textBody,
    htmlBody,
    'replit-Signal'
  );

  console.log(`[Spotlight Digest] Sent to ${user.email} (${topCustomers.length} items)`);
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
