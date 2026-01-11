import { db } from "./db";
import { sql } from "drizzle-orm";
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from "./advisory-lock";
import fs from "fs";
import path from "path";

const RETENTION_DAYS = 180; // 6 months

interface RetentionResult {
  eventsDeleted: number;
  emailTrackingDeleted: number;
  filesDeleted: number;
}

export async function runDataRetention(): Promise<RetentionResult> {
  const result: RetentionResult = {
    eventsDeleted: 0,
    emailTrackingDeleted: 0,
    filesDeleted: 0,
  };

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const eventsResult = await db.execute(sql`
      DELETE FROM customer_activity_events
      WHERE created_at < ${cutoffDate}
      AND event_type NOT IN ('order_placed', 'sample_delivered')
    `);
    result.eventsDeleted = Number((eventsResult as any).rowCount) || 0;

    const trackingResult = await db.execute(sql`
      DELETE FROM email_tracking_tokens
      WHERE created_at < ${cutoffDate}
    `);
    result.emailTrackingDeleted = Number((trackingResult as any).rowCount) || 0;

    const uploadsDir = path.join(process.cwd(), 'uploads', 'pdfs');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          result.filesDeleted++;
        }
      }
    }

    console.log(`[Data Retention] Cleaned up: ${result.eventsDeleted} events, ${result.emailTrackingDeleted} tracking tokens, ${result.filesDeleted} files`);
  } catch (error) {
    console.error('[Data Retention] Error during cleanup:', error);
  }

  return result;
}

let retentionInterval: NodeJS.Timeout | null = null;
let hasRetentionLock = false;

export async function startDataRetentionWorker(): Promise<void> {
  if (retentionInterval) {
    return;
  }

  hasRetentionLock = await tryAcquireAdvisoryLock('DATA_RETENTION_WORKER');
  if (!hasRetentionLock) {
    console.log('[Data Retention] Another instance holds the lock, skipping');
    return;
  }

  runDataRetention();

  retentionInterval = setInterval(() => {
    runDataRetention();
  }, 24 * 60 * 60 * 1000); // Run daily
}

export async function stopDataRetentionWorker(): Promise<void> {
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
  }
  if (hasRetentionLock) {
    await releaseAdvisoryLock('DATA_RETENTION_WORKER');
    hasRetentionLock = false;
  }
}
