import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.REPLIT_DEPLOYMENT === '1' ||
                     (!!process.env.REPL_SLUG && !process.env.REPLIT_DEV_DOMAIN);

const poolMax = Number(process.env.DB_POOL_MAX ?? (isProduction ? 10 : 20));
const statementTimeout = Number(process.env.DB_STATEMENT_TIMEOUT ?? 30000);

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: statementTimeout,
});

console.log(`[DB] Pool: max=${poolMax}, statement_timeout=${statementTimeout}ms, env=${isProduction ? 'production' : 'development'}`);

export const db = drizzle({ client: pool, schema });

export async function withQueryTimeout<T>(fn: () => Promise<T>, timeoutMs: number = 15000): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}'`);
    const result = await fn();
    return result;
  } finally {
    client.release();
  }
}