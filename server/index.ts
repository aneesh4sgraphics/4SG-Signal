import express, { type Request, Response, NextFunction } from "express";
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startDripEmailWorker, stopDripEmailWorker } from "./drip-email-worker";
import { startQuoteFollowUpWorker, stopQuoteFollowUpWorker } from "./quote-followup-worker";
import { startDataRetentionWorker, stopDataRetentionWorker } from "./data-retention";
import { startOdooSyncWorker, stopOdooSyncWorker } from "./odoo-sync-worker";
import { ensureTaxonomySeeded } from "./taxonomy-seed";
import { seedSpotlightCoachingContent } from "./spotlight-coaching-seed";
import { sessionConfig } from "./replitAuth";
import { pool } from "./db";

process.on('uncaughtException', (err: any) => {
  const isNeonDisconnect = err?.code === '57P01' || 
    err?.message?.includes('terminating connection due to administrator command');
  if (isNeonDisconnect) {
    console.error('[Process] Database connection dropped by Neon — will reconnect on next request');
    return;
  }
  console.error('[Process] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  const isNeonDisconnect = reason?.code === '57P01' || 
    reason?.message?.includes('terminating connection due to administrator command');
  if (isNeonDisconnect) {
    console.error('[Process] Database rejection (Neon disconnect) — will reconnect on next request');
    return;
  }
  console.error('[Process] Unhandled rejection:', reason);
});

// Configure Puppeteer to use system Chromium for PDF generation
if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  process.env.PUPPETEER_EXECUTABLE_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
}

// Fail-fast validation for required secrets in production
// Use multiple checks to determine if we're in production:
// 1. NODE_ENV set to production
// 2. REPLIT_DEPLOYMENT env var exists (Replit deployments)
// 3. REPL_SLUG exists but REPLIT_DEV_DOMAIN is not set
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.REPLIT_DEPLOYMENT === '1' ||
                     (!!process.env.REPL_SLUG && !process.env.REPLIT_DEV_DOMAIN);
const requiredSecrets = ['SESSION_SECRET', 'DATABASE_URL', 'REPLIT_DOMAINS', 'REPL_ID'];
const missingSecrets = requiredSecrets.filter(key => !process.env[key]);
if (missingSecrets.length > 0 && isProduction) {
  console.error(`[FATAL] Missing required secrets in production: ${missingSecrets.join(', ')}`);
  console.error('[FATAL] Please configure these secrets in Deployment Secrets (not just Dev Secrets)');
  console.error('[FATAL] REPLIT_DOMAINS should be the deployed app domain (e.g., "4sgraphics.replit.app,quote.4sgraphics.com")');
  process.exit(1);
} else if (missingSecrets.length > 0) {
  console.warn(`[Warning] Missing secrets (dev mode - may cause issues): ${missingSecrets.join(', ')}`);
}

// Log deployment configuration on startup
console.log(`[Boot] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`[Boot] Required secrets status: SESSION_SECRET=${!!process.env.SESSION_SECRET}, DATABASE_URL=${!!process.env.DATABASE_URL}, REPL_ID=${!!process.env.REPL_ID}, REPLIT_DOMAINS=${!!process.env.REPLIT_DOMAINS}`);
if (process.env.REPLIT_DOMAINS) {
  console.log(`[Boot] REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS}`);
}

const app = express();

// Trust proxy for production deployments behind Replit's proxy/CDN
// This is critical for:
// - secure cookies (X-Forwarded-Proto header)
// - rate limiting (X-Forwarded-For header for real client IP)
// - correct req.protocol and req.ip values
if (isProduction) {
  app.set('trust proxy', 1);
  console.log('[Boot] trust proxy enabled for production');
}

// Minimal public diagnostic endpoint — intentionally before auth middleware for debugging auth failures.
// Returns only enough to confirm the environment is configured; no secret names, hostnames, or session internals.
app.get('/api/diagnostics/auth-env', (_req, res) => {
  res.json({
    environment: isProduction ? 'production' : 'development',
    timestamp: new Date().toISOString(),
    requiredSecretsPresent: !!(process.env.REPLIT_DOMAINS && process.env.SESSION_SECRET && process.env.REPL_ID),
  });
});

// Disable x-powered-by header
app.disable('x-powered-by');

// Compression middleware (gzip/brotli)
app.use(compression());

// Shopify webhook routes need raw body for HMAC verification
// Must be registered BEFORE express.json() middleware
app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }), (req: any, res, next) => {
  // Store raw body for HMAC verification
  req.rawBody = req.body;
  // Parse JSON from raw body
  if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString('utf8'));
    } catch (e) {
      console.error('Failed to parse Shopify webhook body:', e);
      req.body = {};
    }
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// --- CORS (strict: only known origins with credentials) ---
const allowedOrigins = new Set([
  // Production
  'https://4sgraphics.replit.app',
  'https://quote.4sgraphics.com',
  // Localhost development
  'http://localhost:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
].filter(Boolean));

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (same-origin requests, mobile apps, curl, etc.)
    if (!origin) return cb(null, true);
    
    // Only allow explicit known origins (no wildcards with credentials: true)
    if (allowedOrigins.has(origin)) return cb(null, true);
    
    // In development, allow the dynamic Replit dev domain (same-origin only)
    if (!isProduction && (origin.endsWith('.replit.dev') || origin.endsWith('.spock.replit.dev'))) {
      return cb(null, true);
    }
    
    // Block all other origins to reduce CSRF risk
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
}));

// Helmet security headers - different policies for prod vs dev
// IMPORTANT: Only one CSP middleware to avoid conflicts
app.use((req, res, next) => {
  const isShopifyEmbedded = req.path.startsWith('/app') || 
                             req.query.embedded === 'true' || 
                             Boolean(req.query.shop);
  const isOAuthPath = req.path.includes('/oauth') || 
                      req.path.includes('/callback') || 
                      req.path.includes('/gmail');
  const allowFraming = isShopifyEmbedded || isOAuthPath;
  
  // Development: relaxed CSP for easier debugging
  // Production: stricter CSP with explicit allowed sources
  if (!isProduction) {
    // DEV: Minimal Helmet with relaxed CSP
    helmet({
      contentSecurityPolicy: false, // Disable CSP in dev for easier debugging
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: false,
    })(req, res, next);
  } else {
    // PRODUCTION: Full Helmet with strict CSP
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://cdn.shopify.com", "https://accounts.google.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
          connectSrc: ["'self'", "https:", "wss:"],
          frameSrc: ["'self'", "https://accounts.google.com", "https://*.myshopify.com"],
          frameAncestors: allowFraming 
            ? ["'self'", "https://quote.4sgraphics.com", "https://*.myshopify.com", "https://admin.shopify.com", "https://*.replit.app", "https://*.replit.dev", "https://accounts.google.com"]
            : ["'self'", "https://quote.4sgraphics.com", "https://*.replit.app", "https://*.replit.dev"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      frameguard: false, // Disable XFO - CSP frame-ancestors takes precedence
    })(req, res, next);
  }
});

// Additional custom headers
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

// Rate limiting for auth endpoints (stricter)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authRateLimiter);

// Rate limiting for webhook endpoints
const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/webhooks', webhookRateLimiter);

// Request timing logger (no response body logging to avoid PII exposure)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // --- Unified error handler that returns JSON (never HTML) ---
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Server error';

    console.error('Express error handler:', err);
    
    // Always return JSON, never HTML
    if (!res.headersSent) {
      res.status(status).json({ error: message });
    }
    
    // Log the error but don't throw to prevent server crashes
    console.error('Error details:', {
      status,
      message,
      stack: err.stack,
      url: _req.url,
      method: _req.method
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  // isProduction is already defined at top of file
  log(`Environment: ${isProduction ? 'production' : 'development'}`);
  
  if (!isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  // Ensure admin taxonomy is seeded before starting server
  await ensureTaxonomySeeded();
  await seedSpotlightCoachingContent();
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    const workersEnabled = process.env.ENABLE_WORKERS !== 'false';
    if (workersEnabled) {
      if (process.env.ENABLE_DRIP_WORKER !== 'false') {
        startDripEmailWorker().catch(err => console.error('[Drip Worker] Failed to start:', err.message));
      } else {
        console.log('[Workers] Drip email worker disabled via ENABLE_DRIP_WORKER=false');
      }
      if (process.env.ENABLE_QUOTE_FOLLOWUP !== 'false') {
        startQuoteFollowUpWorker().catch(err => console.error('[Quote Follow-up Worker] Failed to start:', err.message));
      } else {
        console.log('[Workers] Quote follow-up worker disabled via ENABLE_QUOTE_FOLLOWUP=false');
      }
      if (process.env.ENABLE_DATA_RETENTION !== 'false') {
        startDataRetentionWorker().catch(err => console.error('[Data Retention] Failed to start:', err.message));
      } else {
        console.log('[Workers] Data retention worker disabled via ENABLE_DATA_RETENTION=false');
      }
      if (process.env.ENABLE_ODOO_SYNC !== 'false') {
        startOdooSyncWorker().catch(err => console.error('[Odoo Sync Worker] Failed to start:', err.message));
      } else {
        console.log('[Workers] Odoo sync worker disabled via ENABLE_ODOO_SYNC=false');
      }
      
      // Batch dedup: runs 20s after startup to avoid slowing initial boot
      setTimeout(async () => {
        try {
          console.log('[BatchDedup] Starting customer dedup and lead-contact enrichment…');
          const { runBatchDedup } = await import("./batch-dedup");
          const result = await runBatchDedup();
          console.log(`[BatchDedup] Complete — ${result.customerMerges} merges, ${result.leadEnrichments} enrichments, ${result.errors.length} errors`);
        } catch (err: any) {
          console.error('[BatchDedup] Failed:', err.message);
        }
      }, 20000);

      let opportunityRecalcRunning = false;
      setTimeout(async () => {
        if (opportunityRecalcRunning) return;
        opportunityRecalcRunning = true;
        try {
          console.log('[Opportunities] Starting background score recalculation...');
          const { opportunityEngine } = await import("./opportunity-engine");
          await opportunityEngine.detectSampleShipments();
          const result = await opportunityEngine.calculateAndStoreScores();
          console.log(`[Opportunities] Recalculation complete: ${result.scored} scored from ${result.processed} entities`);
        } catch (err: any) {
          console.error('[Opportunities] Background recalculation failed:', err.message);
        } finally {
          opportunityRecalcRunning = false;
        }
      }, 15000);
    } else {
      console.log('[Workers] All background workers disabled via ENABLE_WORKERS=false');
    }
  });

  let isShuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Shutdown] ${signal} received — stopping gracefully...`);

    const stopWorkers = async () => {
      const stops = [
        stopDripEmailWorker().catch(e => console.error('[Shutdown] Drip worker stop error:', e.message)),
        stopQuoteFollowUpWorker().catch(e => console.error('[Shutdown] Quote follow-up stop error:', e.message)),
        stopDataRetentionWorker().catch(e => console.error('[Shutdown] Data retention stop error:', e.message)),
        stopOdooSyncWorker().catch(e => console.error('[Shutdown] Odoo sync stop error:', e.message)),
      ];

      try {
        const { stopDailyEmailSync } = await import("./gmail-intelligence");
        stops.push(stopDailyEmailSync().catch(e => console.error('[Shutdown] Gmail sync stop error:', e.message)));
      } catch {}

      await Promise.allSettled(stops);
      console.log('[Shutdown] All workers stopped');
    };

    const closeServer = () => new Promise<void>((resolve) => {
      server.close(() => {
        console.log('[Shutdown] HTTP server closed');
        resolve();
      });
      setTimeout(resolve, 5000);
    });

    await stopWorkers();
    await closeServer();

    try {
      await pool.end();
      console.log('[Shutdown] Database pool closed');
    } catch (e: any) {
      console.error('[Shutdown] Pool close error:', e.message);
    }

    console.log('[Shutdown] Complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
