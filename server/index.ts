import express, { type Request, Response, NextFunction } from "express";
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startDripEmailWorker } from "./drip-email-worker";
import { startQuoteFollowUpWorker } from "./quote-followup-worker";
import { startDataRetentionWorker } from "./data-retention";
import { startOdooSyncWorker } from "./odoo-sync-worker";
import { ensureTaxonomySeeded } from "./taxonomy-seed";
import { seedSpotlightCoachingContent } from "./spotlight-coaching-seed";
import { sessionConfig } from "./replitAuth";

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

// Public diagnostic endpoint - MUST be before auth middleware so it's accessible when auth is broken
app.get('/api/diagnostics/auth-env', (req, res) => {
  res.json({
    environment: isProduction ? 'production' : 'development',
    timestamp: new Date().toISOString(),
    hostname: req.hostname,
    secrets: {
      SESSION_SECRET: !!process.env.SESSION_SECRET,
      DATABASE_URL: !!process.env.DATABASE_URL,
      REPL_ID: !!process.env.REPL_ID,
      REPLIT_DOMAINS: !!process.env.REPLIT_DOMAINS,
      REPLIT_DEPLOYMENT: !!process.env.REPLIT_DEPLOYMENT,
      NODE_ENV: process.env.NODE_ENV || 'not set',
    },
    domains: process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',') : [],
    authWillWork: !!(process.env.REPLIT_DOMAINS && process.env.SESSION_SECRET && process.env.REPL_ID),
    cookies: {
      present: !!req.cookies,
      sessionCookie: !!req.cookies?.['connect.sid'],
    },
    sessionCookieConfig: {
      isProduction: sessionConfig.isProduction,
      sameSite: sessionConfig.sameSite,
      secure: sessionConfig.secure,
      httpOnly: sessionConfig.httpOnly,
      ttl: sessionConfig.ttl,
      path: sessionConfig.path,
    },
    trustProxy: true,
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
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.shopify.com", "https://accounts.google.com"],
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
    
    // Start background workers (async, acquire advisory locks for singleton execution)
    startDripEmailWorker().catch(err => console.error('[Drip Worker] Failed to start:', err.message));
    startQuoteFollowUpWorker().catch(err => console.error('[Quote Follow-up Worker] Failed to start:', err.message));
    startDataRetentionWorker().catch(err => console.error('[Data Retention] Failed to start:', err.message));
    startOdooSyncWorker().catch(err => console.error('[Odoo Sync Worker] Failed to start:', err.message));
  });
})();
