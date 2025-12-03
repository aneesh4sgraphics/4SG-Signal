import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
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

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  // In development, use memory store for simplicity
  if (process.env.NODE_ENV === 'development') {
    return session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: false, // Set to false for development
        maxAge: sessionTtl,
      },
    });
  }
  
  // In production, use PostgreSQL store
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true, // Create table if missing
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: 'lax', // Required for same-site cookies with secure flag
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  const email = claims["email"];
  
  // Check if email domain is 4sgraphics.com
  if (!email || !email.endsWith("@4sgraphics.com")) {
    throw new Error("Only 4sgraphics.com email addresses are allowed");
  }
  
  // List of pre-approved emails
  const preApprovedEmails = [
    "aneesh@4sgraphics.com",
    "oscar@4sgraphics.com", 
    "santiago@4sgraphics.com",
    "patricio@4sgraphics.com",
    "remy@4sgraphics.com",
    "shiva@4sgraphics.com"
  ];
  
  const isAdmin = email === "aneesh@4sgraphics.com" || email === "oscar@4sgraphics.com" || email === "shiva@4sgraphics.com";
  const isPreApproved = preApprovedEmails.includes(email);
  
  // Extract first name from email if not provided
  const firstName = claims["first_name"] || email.split('@')[0] || null;
  
  console.log("Upserting user with data:", {
    id: claims["sub"],
    email: claims["email"],
    firstName: firstName,
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    role: isAdmin ? "admin" : "user",
    status: isPreApproved ? "approved" : "pending",
  });
  
  // Get current user to increment login count
  const currentUser = await storage.getUser(claims["sub"]);
  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  console.log("Auth claims received:", {
    sub: claims["sub"],
    email: claims["email"],
    existing_user_id: currentUser?.id,
    existing_status: currentUser?.status,
    existing_role: currentUser?.role
  });
  
  // Preserve existing status and role for already-approved users
  // Only apply pre-approved logic for new users
  const role = currentUser && currentUser.status === 'approved' 
    ? currentUser.role 
    : (isAdmin ? "admin" : "user");
  
  const status = currentUser && currentUser.status === 'approved'
    ? 'approved'
    : (isPreApproved ? "approved" : "pending");
  
  const approvedBy = currentUser && currentUser.status === 'approved'
    ? currentUser.approvedBy
    : (isPreApproved ? "system" : null);
    
  const approvedAt = currentUser && currentUser.status === 'approved'
    ? currentUser.approvedAt
    : (isPreApproved ? new Date() : null);
  
  try {
    await storage.upsertUser({
      id: claims["sub"],
      email: claims["email"],
      firstName: firstName,
      lastName: claims["last_name"] || null,
      profileImageUrl: claims["profile_image_url"] || null,
      role: role,
      status: status,
      approvedBy: approvedBy,
      approvedAt: approvedAt,
      loginCount: (currentUser?.loginCount || 0) + 1,
      lastLoginDate: currentDate,
    });
    
    console.log("User upserted with preserved status:", { role, status });
  } catch (error) {
    console.error("Error in upsertUser:", error);
    console.error("Attempted to upsert with ID:", claims["sub"], "and email:", claims["email"]);
    throw error;
  }
}

export async function setupAuth(app: Express) {
  try {
    app.set("trust proxy", 1);
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());

    // Check if we're in a true development environment (not Replit deployment)
    const isTrueDevEnv = process.env.NODE_ENV === 'development' && 
                        process.env.REPLIT_DOMAINS === undefined;
    
    // Also bypass for Replit development environment (for testing)
    const isReplitDev = process.env.REPLIT_DOMAINS && 
                       process.env.REPLIT_DOMAINS.includes('replit.dev');

    if (isTrueDevEnv || isReplitDev) {
      console.log("Local development mode: Setting up simplified auth routes");
      
      // Set up simple passport serialization for development
      passport.serializeUser((user: any, cb) => cb(null, user));
      passport.deserializeUser((user: any, cb) => cb(null, user));
      
      app.get("/api/login", (req, res) => {
        console.log("Development login - redirecting to home");
        res.redirect("/");
      });

      app.get("/api/callback", (req, res) => {
        console.log("Development callback - redirecting to home");
        res.redirect("/");
      });

      app.get("/api/logout", (req, res) => {
        console.log("Development logout - clearing session and redirecting");
        req.logout((err) => {
          if (err) {
            console.error("Logout error:", err);
          }
          req.session.destroy((err) => {
            if (err) {
              console.error("Session destroy error:", err);
            }
            res.clearCookie('connect.sid');
            res.redirect("/");
          });
        });
      });
      
      return;
    }

    // Production OIDC setup
    const config = await getOidcConfig();

    const verify: VerifyFunction = async (
      tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
      verified: passport.AuthenticateCallback
    ) => {
      try {
        const user = {};
        updateUserSession(user, tokens);
        await upsertUser(tokens.claims());
        verified(null, user);
      } catch (error) {
        console.error("Auth verification error:", error);
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
        verify,
      );
      passport.use(strategy);
    }

    passport.serializeUser((user: Express.User, cb) => cb(null, user));
    passport.deserializeUser((user: Express.User, cb) => cb(null, user));

    app.get("/api/login", (req, res, next) => {
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    });

    app.get("/api/callback", (req, res, next) => {
      passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any, info: any) => {
        if (err) {
          return next(err);
        }
        if (!user) {
          return res.redirect("/api/login");
        }
        req.logIn(user, (err) => {
          if (err) {
            return next(err);
          }
          // Set login flag in session storage via redirect with script
          res.send(`
            <script>
              sessionStorage.setItem('justLoggedIn', 'true');
              window.location.href = '/';
            </script>
          `);
        });
      })(req, res, next);
    });

    app.get("/api/logout", (req, res) => {
      req.logout(() => {
        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      });
    });
  } catch (error) {
    console.error("Auth setup error:", error);
    // Set up fallback routes that don't crash
    app.get("/api/login", (req, res) => {
      res.status(500).json({ message: "Authentication not configured properly" });
    });
    app.get("/api/callback", (req, res) => {
      res.redirect("/");
    });
    app.get("/api/logout", (req, res) => {
      res.redirect("/");
    });
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // More secure development bypass conditions
  const isTrueLocalDev = process.env.NODE_ENV === 'development' && 
                        (req.hostname === 'localhost' || req.hostname === '127.0.0.1') &&
                        !process.env.REPLIT_DOMAINS;
  
  // Allow Replit dev environment for legitimate development/testing
  const isReplitDev = process.env.REPLIT_DOMAINS && 
                     process.env.REPLIT_DOMAINS.includes('replit.dev') &&
                     process.env.NODE_ENV === 'development';

  if (isTrueLocalDev || isReplitDev) {
    // Create a mock user for development
    req.user = {
      id: 'dev-user-123',
      role: 'admin',
      claims: {
        sub: 'dev-user-123',
        email: 'test@4sgraphics.com',
        first_name: 'Admin',
        last_name: 'Dev',
        profile_image_url: 'https://via.placeholder.com/150'
      }
    };
    console.log('Development bypass activated for isAuthenticated');
    return next();
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

export const requireApproval: RequestHandler = async (req, res, next) => {
  // More secure development bypass conditions
  const isTrueLocalDev = process.env.NODE_ENV === 'development' && 
                        (req.hostname === 'localhost' || req.hostname === '127.0.0.1') &&
                        !process.env.REPLIT_DOMAINS;
  
  // Allow Replit dev environment for legitimate development/testing
  const isReplitDev = process.env.REPLIT_DOMAINS && 
                     process.env.REPLIT_DOMAINS.includes('replit.dev') &&
                     process.env.NODE_ENV === 'development';

  if (isTrueLocalDev || isReplitDev) {
    // Create a mock user for development
    req.user = {
      claims: {
        sub: 'dev-user-123',
        email: 'aneesh@4sgraphics.com',
        first_name: 'Aneesh',
        last_name: 'Dev',
        profile_image_url: 'https://via.placeholder.com/150'
      }
    };
    console.log('Development bypass activated for requireApproval');
    return next();
  }

  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const dbUser = await storage.getUser(user.claims.sub);
  if (!dbUser || dbUser.status !== "approved") {
    return res.status(403).json({ message: "Account pending approval" });
  }
  
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  // Development bypass - simplified for Replit environment
  if (process.env.NODE_ENV === 'development') {
    console.log('Development bypass activated for requireAdmin');
    return next();
  }

  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const dbUser = await storage.getUser(user.claims.sub);
  if (!dbUser || dbUser.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  
  next();
};