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
  
  console.log(`[Auth] Session configured: TTL=${SESSION_TTL}ms, production=${isProduction}, secure=${isProduction}, sameSite=${isProduction ? 'none' : 'lax'}`);

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: SESSION_TTL,
      path: "/",
    },
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

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

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

    for (const domain of process.env.REPLIT_DOMAINS!.split(",")) {
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
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    });

    app.get("/api/callback", (req, res, next) => {
      passport.authenticate(`replitauth:${req.hostname}`, async (err: any, user: any, info: any) => {
        if (err) {
          console.error("[Auth] Callback error:", err);
          return res.redirect("/?error=auth_failed");
        }

        if (!user) {
          console.log("[Auth] No user returned from OIDC");
          return res.redirect("/api/login");
        }

        try {
          await promisifiedSessionRegenerate(req);
          await promisifiedLogin(req, user);
          await promisifiedSessionSave(req);

          console.log(`[Auth] Login successful, session regenerated and saved`);

          res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Logging in...</title></head>
            <body>
              <script>
                sessionStorage.setItem('authComplete', 'true');
                sessionStorage.setItem('authTimestamp', Date.now().toString());
                window.location.replace('/');
              </script>
            </body>
            </html>
          `);
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
  
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Invalid session" });
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
