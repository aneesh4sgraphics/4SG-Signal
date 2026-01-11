import { db } from "./db";
import { sql } from "drizzle-orm";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  version: number;
}

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

let currentConfigVersion = 0;

export async function getConfigVersion(): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT COALESCE(MAX(id), 0) as version FROM (
        SELECT MAX(id) as id FROM admin_sku_mappings
        UNION ALL SELECT MAX(id) FROM admin_categories
        UNION ALL SELECT MAX(id) FROM catalog_product_types
        UNION ALL SELECT MAX(id) FROM admin_coaching_timers
        UNION ALL SELECT MAX(id) FROM admin_conversation_scripts
        UNION ALL SELECT MAX(id) FROM product_pricing_master
      ) as versions
    `);
    return Number((result.rows[0] as any)?.version) || 0;
  } catch {
    return Date.now();
  }
}

export async function invalidateConfigCache(): Promise<void> {
  currentConfigVersion++;
  cache.clear();
  console.log(`[Config Cache] Invalidated. New version: ${currentConfigVersion}`);
}

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  
  if (entry && entry.expiresAt > now && entry.version === currentConfigVersion) {
    return entry.data;
  }
  
  const data = await fetcher();
  cache.set(key, {
    data,
    expiresAt: now + ttlMs,
    version: currentConfigVersion,
  });
  
  return data;
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheStats(): { size: number; version: number } {
  return { size: cache.size, version: currentConfigVersion };
}
