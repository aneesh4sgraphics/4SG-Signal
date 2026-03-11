import { db } from "./db";
import { sql } from "drizzle-orm";

const LOCK_IDS = {
  DRIP_EMAIL_WORKER: 1001,
  QUOTE_FOLLOWUP_WORKER: 1002,
  GMAIL_SYNC_WORKER: 1003,
  DATA_RETENTION_WORKER: 1004,
  ODOO_SYNC_WORKER: 1005,
  SPOTLIGHT_DIGEST_WORKER: 1006,
} as const;

export type LockName = keyof typeof LOCK_IDS;

export async function tryAcquireAdvisoryLock(lockName: LockName): Promise<boolean> {
  const lockId = LOCK_IDS[lockName];
  try {
    const result = await db.execute(sql`SELECT pg_try_advisory_lock(${lockId}) as acquired`);
    return (result.rows[0] as any)?.acquired === true;
  } catch (error) {
    console.error(`[Advisory Lock] Failed to acquire lock ${lockName}:`, error);
    return false;
  }
}

export async function releaseAdvisoryLock(lockName: LockName): Promise<void> {
  const lockId = LOCK_IDS[lockName];
  try {
    await db.execute(sql`SELECT pg_advisory_unlock(${lockId})`);
  } catch (error) {
    console.error(`[Advisory Lock] Failed to release lock ${lockName}:`, error);
  }
}

export async function withAdvisoryLock<T>(
  lockName: LockName,
  fn: () => Promise<T>,
  options: { skipIfLocked?: boolean } = {}
): Promise<T | null> {
  const acquired = await tryAcquireAdvisoryLock(lockName);
  
  if (!acquired) {
    if (options.skipIfLocked) {
      return null;
    }
    throw new Error(`Could not acquire advisory lock: ${lockName}`);
  }
  
  try {
    return await fn();
  } finally {
    await releaseAdvisoryLock(lockName);
  }
}

export { LOCK_IDS };
