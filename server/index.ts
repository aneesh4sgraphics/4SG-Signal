import express, { type Request, Response, NextFunction } from "express";
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startDripEmailWorker } from "./drip-email-worker";
import { startQuoteFollowUpWorker } from "./quote-followup-worker";

// Configure Puppeteer to use system Chromium for PDF generation
if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  process.env.PUPPETEER_EXECUTABLE_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
}

const app = express();

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
const isProduction = process.env.NODE_ENV === 'production';
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

// Unified security headers middleware (CSP + X-Frame-Options computed once)
app.use((req, res, next) => {
  // Prevent search engines from indexing
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  
  // Determine if this is a Shopify embedded context
  const isShopifyEmbedded = req.path.startsWith('/app') || 
                             req.query.embedded === 'true' || 
                             Boolean(req.query.shop);
  
  // Compute CSP frame-ancestors based on context
  if (isShopifyEmbedded) {
    // Allow Shopify Admin iframe embedding
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com https://*.replit.app https://*.replit.dev"
    );
    // Remove X-Frame-Options to defer to CSP for Shopify embedding
    res.removeHeader('X-Frame-Options');
  } else {
    // Restrict embedding to same-origin and Replit domains only
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.replit.app https://*.replit.dev");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  
  next();
});

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
  // Use multiple checks to determine if we're in production:
  // 1. NODE_ENV set to production
  // 2. REPLIT_DEPLOYMENT env var exists (Replit deployments)
  // 3. REPL_SLUG exists but REPLIT_DEV is not set
  const isProduction = process.env.NODE_ENV === "production" || 
                       process.env.REPLIT_DEPLOYMENT === "1" ||
                       (process.env.REPL_SLUG && !process.env.REPLIT_DEV_DOMAIN);
  
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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start background workers (async, acquire advisory locks for singleton execution)
    startDripEmailWorker().catch(err => console.error('[Drip Worker] Failed to start:', err.message));
    startQuoteFollowUpWorker().catch(err => console.error('[Quote Follow-up Worker] Failed to start:', err.message));
  });
})();
