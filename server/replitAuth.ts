import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler, Request, Response, NextFunction } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const ALLOWED_DOMAIN = "@4sgraphics.com";

const PRE_APPROVED_EMAILS = [
  "aneesh@4sgraphics.com",
  "oscar@4sgraphics.com",
  "santiago@4sgraphics.com",
  "patricio@4sgraphics.com",
  "remy@4sgraphics.com",
  "shiva@4sgraphics.com"
];

const ADMIN_EMAILS = [
  "aneesh@4sgraphics.com",
  "oscar@4sgraphics.com",
  "shiva@4sgraphics.com"
];

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

function isPreApprovedEmail(email: string): boolean {
  return PRE_APPROVED_EMAILS.includes(email.toLowerCase());
}

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function getUserRole(email: string): "admin" | "user" {
  return isAdminEmail(email) ? "admin" : "user";
}

function getUserStatus(email: string, existingStatus?: string): "approved" | "pending" {
  if (existingStatus === "approved") return "approved";
  return isPreApprovedEmail(email) ? "approved" : "pending";
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

function createSessionMiddleware(): ReturnType<typeof session> {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: Math.floor(SESSION_TTL / 1000),
    tableName: "sessions",
    pruneSessionInterval: 60 * 15,
  });

  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;
  
  // Validate SESSION_SECRET exists - fail fast if missing
  if (!process.env.SESSION_SECRET) {
    console.error("[Auth] FATAL: SESSION_SECRET is not set! Sessions will not work.");
    throw new Error("SESSION_SECRET environment variable is required");
  }
  
  // Cookie sameSite policy:
  // - 'lax': Works for same-site OIDC flows and top-level navigations
  // - 'none': Required for cross-origin/iframe embedding (e.g., Shopify Admin app)
  //   Note: 'none' requires secure=true
  // 
  // PRODUCTION uses 'none' to support:
  // - Shopify Admin embedded app
  // - Cross-domain auth (quote.4sgraphics.com → 4sgraphics.replit.app)
  // - OAuth callback flows
  const sameSiteSetting: 'lax' | 'none' = isProduction ? 'none' : 'lax';
  
  console.log(`[Auth] Session configured: TTL=${SESSION_TTL}ms, production=${isProduction}, secure=${isProduction}, sameSite=${sameSiteSetting}`);

  // Cookie configuration for production Replit deployments
  // Using 'none' sameSite + secure allows OIDC cross-origin callback to persist cookies
  // 'secure: true' required for HTTPS in production and for SameSite=None
  // Note: Do NOT set 'domain' - let the browser infer it from the request
  const cookieConfig: session.CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: sameSiteSetting,
    maxAge: SESSION_TTL,
    path: "/",
  };
  
  console.log(`[Auth] Cookie config: httpOnly=${cookieConfig.httpOnly}, secure=${cookieConfig.secure}, sameSite=${cookieConfig.sameSite}, maxAge=${cookieConfig.maxAge}, path=${cookieConfig.path}`);

  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: cookieConfig,
  });
}

function updateUserTokens(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUserFromClaims(claims: any): Promise<void> {
  const email = claims["email"]?.toLowerCase();

  if (!isAllowedEmail(email)) {
    throw new Error(`Access denied: Only ${ALLOWED_DOMAIN} email addresses are allowed`);
  }

  const existingUser = await storage.getUser(claims["sub"]);
  const role = existingUser?.role || getUserRole(email);
  const status = getUserStatus(email, existingUser?.status);

  const firstName = claims["first_name"] || email.split("@")[0] || "User";

  console.log(`[Auth] Upserting user: ${email}, role=${role}, status=${status}`);

  await storage.upsertUser({
    id: claims["sub"],
    email: email,
    firstName: firstName,
    lastName: claims["last_name"] || null,
    profileImageUrl: claims["profile_image_url"] || null,
    role: role,
    status: status,
    approvedBy: status === "approved" ? (existingUser?.approvedBy || "system") : null,
    approvedAt: status === "approved" ? (existingUser?.approvedAt || new Date()) : null,
    loginCount: (existingUser?.loginCount || 0) + 1,
    lastLoginDate: new Date().toISOString().split("T")[0],
  });
}

function promisifiedLogin(req: Request, user: any): Promise<void> {
  return new Promise((resolve, reject) => {
    req.logIn(user, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function promisifiedSessionSave(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function promisifiedSessionRegenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function setupAuth(app: Express) {
  if (!process.env.REPLIT_DOMAINS) {
    console.error("[Auth] REPLIT_DOMAINS not set - auth will not work in production");
    setupFallbackRoutes(app);
    return;
  }

  app.set("trust proxy", 1);
  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  // Serialize only the user ID to the session (not the entire user object with tokens)
  // This prevents session/token desync issues in production
  passport.serializeUser((user: any, cb) => {
    const userId = user?.claims?.sub || user?.id;
    console.log(`[Auth] Serializing user: ${userId}`);
    cb(null, { id: userId, claims: user?.claims });
  });
  
  // Deserialize by loading the user from the session data
  // The session stores minimal user info (id + claims), which Passport uses to populate req.user
  // Also handles legacy sessions that stored the full user object
  passport.deserializeUser(async (sessionUser: any, cb) => {
    try {
      // Handle both new format { id, claims } and legacy format { id, email, claims, access_token, ... }
      const userId = sessionUser?.id || sessionUser?.claims?.sub;
      const claims = sessionUser?.claims;
      
      if (!userId) {
        console.log(`[Auth] Deserialize failed: no user ID in session data`);
        return cb(null, false);
      }
      
      // Build req.user with essential fields
      // This works for both new and legacy session formats
      const user = {
        id: userId,
        claims: claims,
        email: claims?.email || sessionUser?.email,
        // Include legacy token fields if present (for backwards compatibility)
        access_token: sessionUser?.access_token,
        refresh_token: sessionUser?.refresh_token,
        expires_at: sessionUser?.expires_at,
      };
      
      cb(null, user);
    } catch (error) {
      console.error(`[Auth] Deserialize error:`, error);
      cb(error, null);
    }
  });

  try {
    const config = await getOidcConfig();

    const verify: VerifyFunction = async (tokens, verified) => {
      try {
        const claims = tokens.claims();
        const rawEmail = claims?.["email"];
        const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase() : null;

        if (!isAllowedEmail(email)) {
          return verified(new Error(`Access denied: Only ${ALLOWED_DOMAIN} emails allowed`), null);
        }

        const user: any = {};
        updateUserTokens(user, tokens);
        await upsertUserFromClaims(claims);

        console.log(`[Auth] User verified: ${email}`);
        verified(null, user);
      } catch (error) {
        console.error("[Auth] Verification failed:", error);
        verified(error, null);
      }
    };

    // Collect all domains: production domains from REPLIT_DOMAINS, dev domain from REPLIT_DEV_DOMAIN
    const allDomains: string[] = [];
    if (process.env.REPLIT_DOMAINS) {
      allDomains.push(...process.env.REPLIT_DOMAINS.split(",").map(d => d.trim()).filter(Boolean));
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      allDomains.push(...process.env.REPLIT_DEV_DOMAIN.split(",").map(d => d.trim()).filter(Boolean));
    }
    
    console.log(`[Auth] Registering strategies for domains: ${allDomains.join(", ")}`);
    
    for (const domain of allDomains) {
      const strategy = new Strategy(
        {
          name: `replitauth:${domain}`,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
    }

    app.get("/api/login", (req, res, next) => {
      console.log(`[Auth] Login initiated from ${req.hostname}`);
      console.log(`[Auth] Available strategies - REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS}, DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN}`);
      
      // Check if strategy exists for this hostname
      const strategyName = `replitauth:${req.hostname}`;
      if (!passport._strategies[strategyName]) {
        console.error(`[Auth] No strategy registered for ${req.hostname}. Available domains: ${process.env.REPLIT_DOMAINS}`);
        return res.redirect("/?error=domain_not_configured");
      }
      
      passport.authenticate(strategyName, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    });

    app.get("/api/callback", (req, res, next) => {
      const callbackStart = Date.now();
      console.log(`[Auth] Callback received from ${req.hostname}`);
      passport.authenticate(`replitauth:${req.hostname}`, async (err: any, user: any, info: any) => {
        const authTime = Date.now() - callbackStart;
        console.log(`[Auth] OIDC authentication took ${authTime}ms`);
        console.log(`[Auth] Callback details - err: ${err ? err.message || err : 'none'}, user: ${user ? 'present' : 'null'}, info: ${JSON.stringify(info)}`);
        
        if (err) {
          console.error("[Auth] Callback error:", err);
          return res.redirect("/?error=auth_failed");
        }

        if (!user) {
          console.log("[Auth] No user returned from OIDC - info:", info);
          console.log("[Auth] Hostname:", req.hostname, "REPLIT_DOMAINS:", process.env.REPLIT_DOMAINS);
          return res.redirect("/?error=no_user");
        }

        try {
          const loginStart = Date.now();
          await promisifiedLogin(req, user);
          console.log(`[Auth] Login took ${Date.now() - loginStart}ms`);
          
          const saveStart = Date.now();
          await promisifiedSessionSave(req);
          console.log(`[Auth] Session save took ${Date.now() - saveStart}ms`);

          const totalTime = Date.now() - callbackStart;
          console.log(`[Auth] Login successful in ${totalTime}ms. Session ID: ${req.sessionID}`);
          console.log(`[Auth] User authenticated: ${req.user?.claims?.email}`);

          // Small delay page to ensure cookie is set before redirect
          res.send(`<!DOCTYPE html><html><head><title>Logging in...</title></head>
            <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;">
            <p>Logging you in...</p>
            <script>
              sessionStorage.setItem('authComplete', 'true');
              setTimeout(function(){window.location.replace('/');},500);
            </script>
            </body></html>`);
        } catch (loginErr) {
          console.error("[Auth] Login/session save failed:", loginErr);
          res.redirect("/?error=session_failed");
        }
      })(req, res, next);
    });

    app.get("/api/logout", async (req, res) => {
      const config = await getOidcConfig();
      
      req.logout(() => {
        req.session.destroy((err) => {
          if (err) console.error("[Auth] Session destroy error:", err);
          
          res.clearCookie("connect.sid", { path: "/" });
          
          const logoutUrl = client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `https://${req.hostname}`,
          }).href;
          
          res.redirect(logoutUrl);
        });
      });
    });

    // Debug endpoint to diagnose authentication issues
    app.get("/api/auth/debug", (req: any, res) => {
      const hasCookie = !!req.headers.cookie;
      const hasSessionCookie = req.headers.cookie?.includes('connect.sid') || false;
      const hasAuthTestCookie = req.headers.cookie?.includes('auth_test') || false;
      const rawCookies = req.headers.cookie || 'none';
      const hasSession = !!req.session;
      const hasSessionId = !!req.sessionID;
      const isAuth = req.isAuthenticated ? req.isAuthenticated() : false;
      const hasUser = !!req.user;
      const userEmail = req.user?.claims?.email || req.user?.email || null;
      const configuredDomains = process.env.REPLIT_DOMAINS?.split(",") || [];
      const currentHostname = req.hostname;
      const isDomainConfigured = configuredDomains.includes(currentHostname);
      const registeredStrategies = Object.keys(passport._strategies || {}).filter(s => s.startsWith('replitauth:'));
      const userId = req.user?.claims?.sub || null;
      const expiresAt = req.user?.expires_at ? new Date(req.user.expires_at * 1000).toISOString() : null;
      const isExpired = req.user?.expires_at ? (Date.now() / 1000) > req.user.expires_at : null;
      
      // Determine failure reason
      let failureReason = null;
      if (!hasCookie) {
        failureReason = "No cookies sent - browser may be blocking cookies or credentials not included in fetch";
      } else if (!hasSessionCookie) {
        failureReason = "Session cookie (connect.sid) not present - may need to log in again";
      } else if (!hasSession) {
        failureReason = "Session middleware not initialized";
      } else if (!isAuth) {
        failureReason = "Session exists but user not authenticated - session may be expired or invalid";
      } else if (!hasUser) {
        failureReason = "Authenticated but user object missing";
      } else if (isExpired) {
        failureReason = "Token expired - refresh may be needed";
      }
      
      const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;
      const isShopifyEmbedded = process.env.SHOPIFY_EMBEDDED === 'true';
      
      res.json({
        authenticated: isAuth && hasUser,
        diagnostics: {
          hasCookie,
          hasSessionCookie,
          hasAuthTestCookie,
          rawCookies: rawCookies.substring(0, 200),
          hasSession,
          hasSessionId,
          sessionId: req.sessionID?.substring(0, 10) + '...',
          isAuthenticated: isAuth,
          hasUser,
          userEmail,
          userId,
          tokenExpiresAt: expiresAt,
          tokenExpired: isExpired,
        },
        config: {
          production: isProduction,
          shopifyEmbedded: isShopifyEmbedded,
          trustProxy: true,
          cookieSecure: isProduction,
          cookieSameSite: 'lax',
          currentHostname,
          configuredDomains,
          isDomainConfigured,
          registeredStrategies,
          nodeEnv: process.env.NODE_ENV,
          hasReplitDeployment: !!process.env.REPLIT_DEPLOYMENT,
          hasSessionSecret: !!process.env.SESSION_SECRET,
          hasDatabaseUrl: !!process.env.DATABASE_URL,
        },
        failureReason,
        timestamp: new Date().toISOString(),
      });
    });

    console.log("[Auth] OIDC authentication configured successfully");
  } catch (error) {
    console.error("[Auth] Failed to configure OIDC:", error);
    setupFallbackRoutes(app);
  }
}

function setupFallbackRoutes(app: Express) {
  app.get("/api/login", (req, res) => {
    res.status(503).json({ message: "Authentication service unavailable" });
  });
  app.get("/api/callback", (req, res) => {
    res.redirect("/");
  });
  app.get("/api/logout", (req, res) => {
    res.redirect("/");
  });
}

export const isAuthenticated: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const isDevMode = process.env.NODE_ENV === 'development';
  
  if (isDevMode) {
    req.user = {
      id: 'dev-user-123',
      email: 'test@4sgraphics.com',
      role: 'admin',
      claims: {
        sub: 'dev-user-123',
        email: 'test@4sgraphics.com',
      }
    } as any;
    return next();
  }
  
  // Debug logging for production auth issues
  const hasSession = !!req.session;
  const hasPassport = !!(req.session as any)?.passport;
  const passportUser = (req.session as any)?.passport?.user;
  const hasReqUser = !!req.user;
  const isAuthenticatedFn = req.isAuthenticated ? req.isAuthenticated() : false;
  const cookieHeader = req.headers.cookie ? 'present' : 'missing';
  
  // PRODUCTION FIX: If passport.session() didn't deserialize the user but session has valid data,
  // manually reconstruct req.user. This handles race conditions with PostgreSQL session store
  // in Replit's multi-worker production environment.
  if (!isAuthenticatedFn && passportUser) {
    const userId = passportUser.id || passportUser.claims?.sub;
    const claims = passportUser.claims;
    
    if (userId && claims) {
      console.log(`[Auth] FALLBACK: Manually setting req.user from session data for ${req.path} (userId=${userId})`);
      req.user = {
        id: userId,
        claims: claims,
        email: claims.email || passportUser.email,
        access_token: passportUser.access_token,
        refresh_token: passportUser.refresh_token,
        expires_at: passportUser.expires_at,
      } as any;
      // Continue to the rest of the middleware
    }
  }
  
  // Check authentication again after potential fallback
  const isNowAuthenticated = !!req.user && !!(req.user as any).claims?.sub;
  
  if (!isNowAuthenticated) {
    console.log(`[Auth] isAuthenticated FAILED for ${req.path}: session=${hasSession}, passport=${hasPassport}, passportUser=${!!passportUser}, reqUser=${hasReqUser}, isAuthenticatedFn=${isAuthenticatedFn}, cookie=${cookieHeader}`);
    if (passportUser) {
      console.log(`[Auth] Passport user found but isAuthenticated=false: id=${passportUser.id}, claims=${JSON.stringify(passportUser.claims)}`);
    }
    return res.status(401).json({ message: "Not authenticated" });
  }

  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Invalid session" });
  }

  // Normalize user object to have consistent properties
  if (!user.id && user.claims?.sub) {
    user.id = user.claims.sub;
  }
  if (user.claims?.email && !user.email) {
    user.email = user.claims.email;
  }

  if (user.expires_at) {
    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 60;

    if (now > user.expires_at + bufferSeconds) {
      if (!user.refresh_token) {
        return res.status(401).json({ message: "Session expired" });
      }

      try {
        const config = await getOidcConfig();
        const tokenResponse = await client.refreshTokenGrant(config, user.refresh_token);
        updateUserTokens(user, tokenResponse);
        console.log("[Auth] Token refreshed successfully");
      } catch (error) {
        console.error("[Auth] Token refresh failed:", error);
        return res.status(401).json({ message: "Session expired" });
      }
    }
  }

  next();
};

export const requireApproval: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  
  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const dbUser = await storage.getUser(user.claims.sub);
  if (!dbUser) {
    return res.status(401).json({ message: "User not found" });
  }

  if (dbUser.status !== "approved") {
    return res.status(403).json({ message: "Account pending approval" });
  }

  next();
};

export const requireAdmin: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  
  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const dbUser = await storage.getUser(user.claims.sub);
  if (!dbUser) {
    return res.status(401).json({ message: "User not found" });
  }

  if (dbUser.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
};
