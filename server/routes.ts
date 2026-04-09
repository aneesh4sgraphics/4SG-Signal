import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { storage } from "./storage";
import chatRouter from "./chat";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { z } from "zod";
// Removed: parseProductData import - legacy CSV parser no longer used
import { parseCustomerCSV } from "./customer-parser";
import { parseOdooExcel, isFreightContact } from "./odoo-parser";
import { odooClient, isOdooConfigured } from "./odoo";
import { isBlockedCompany, getBlockedKeywordMatch, BLOCKED_COMPANY_KEYWORDS } from "./customer-blocklist";
import { autoAssignSalesRepIfNeeded } from "./sales-rep-auto-assign";

import { generateQuoteHTMLForDownload, generatePriceListHTML, validateQuoteNumber, generateQuoteNumber } from "./stub-functions";
import { normalizeEmail, extractCompanyDomain } from "@shared/email-normalizer";
import { 
  insertSentQuoteSchema,
  insertShipmentSchema,
  insertShippingCompanySchema,
  insertSavedRecipientSchema,
  insertProductLabelSchema,
  insertPressProfileSchema,
  insertSampleRequestSchema,
  insertValidationEventSchema,
  insertSwatchSchema,
  insertSwatchBookShipmentSchema,
  insertPressKitShipmentSchema,
  insertSwatchSelectionSchema,
  insertCustomerJourneySchema,
  insertQuoteEventSchema,
  insertPriceListEventSchema,
  insertCustomerJourneyInstanceSchema,
  insertCustomerJourneyStepSchema,
  insertPressTestJourneyDetailSchema,
  insertJourneyTemplateSchema,
  insertJourneyTemplateStageSchema,
  JOURNEY_STAGES,
  JOURNEY_TYPES,
  PRESS_TEST_STEPS,
  PRODUCT_LINES,
  PRICING_TIERS,
  LABEL_TYPES,
  LABEL_TYPE_LABELS,
  insertLabelPrintSchema
} from "@shared/schema";
import { setupAuth, isAuthenticated, requireApproval, requireAdmin } from "./replitAuth";
import { 
  logFileOperation, 
  safeFileExists, 
  safeReadFile, 
  safeWriteFile, 
  safeDeleteFile, 
  logUpload, 
  logDownload 
} from "./fileLogger";
import { db } from "./db";
import { eq, sql, and, or, desc, asc, ilike, gte, lte, gt, lt, isNull, isNotNull, ne, not, inArray } from "drizzle-orm";
import { 
  customers,
  customerContacts, 
  customerJourney, 
  customerJourneyInstances, 
  sampleRequests, 
  swatchBookShipments, 
  pressKitShipments, 
  quoteEvents, 
  priceListEvents, 
  pressProfiles, 
  categoryTrust,
  sentQuotes,
  customerCoachState,
  customerMachineProfiles,
  categoryObjections,
  quoteCategoryLinks,
  customerJourneyProgress,
  customerActivityEvents,
  emailSends,
  emailTrackingTokens,
  labelPrints,
  shipmentFollowUpTasks,
  shopifyOrders,
  shopifyProductMappings,
  shopifyCustomerMappings,
  shopifySettings,
  shopifyInstalls,
  shopifyWebhookEvents,
  shopifyVariantMappings,
  shopifyDraftOrders,
  productOdooMappings,
  odooPriceSyncQueue,
  productPricingMaster,
  productCategories,
  productTypes,
  adminMachineTypes,
  adminCategoryGroups,
  adminCategories,
  adminCategoryVariants,
  adminSkuMappings,
  adminCoachingTimers,
  adminNudgeSettings,
  adminConversationScripts,
  adminConfigVersions,
  adminAuditLog,
  insertAdminMachineTypeSchema,
  insertAdminCategoryGroupSchema,
  insertAdminCategorySchema,
  insertAdminCategoryVariantSchema,
  insertAdminSkuMappingSchema,
  insertAdminCoachingTimerSchema,
  insertAdminNudgeSettingSchema,
  insertAdminConversationScriptSchema,
  insertShopifyVariantMappingSchema,
  insertShopifyDraftOrderSchema,
  ACCOUNT_STATES,
  ACCOUNT_STATE_CONFIG,
  CATEGORY_STATES,
  CATEGORY_STATE_CONFIG,
  MACHINE_FAMILIES,
  OBJECTION_TYPES,
  CATEGORY_MACHINE_COMPATIBILITY,
  COACH_NUDGE_ACTIONS,
  CUSTOMER_STATES,
  TRUST_LEVELS,
  QUOTE_FOLLOW_UP_STAGES,
  JOURNEY_PROGRESS_STAGES,
  insertCustomerJourneyProgressSchema,
  productMergeSuggestions,
  users,
  gmailUnmatchedEmails,
  emailSalesEvents,
  gmailMessages,
  gmailMessageMatches,
  followUpTasks,
  deletedCustomerExclusions,
  insertFollowUpTaskSchema,
  customerDoNotMerge,
  customerSyncQueue,
  emailIntelligenceBlacklist,
  leads,
  leadActivities,
  insertLeadSchema,
  insertLeadActivitySchema,
  territorySkipFlags,
  spotlightEvents,
  spotlightSessionState,
  spotlightSnoozes,
  spotlightTeamClaims,
  bouncedEmails,
  dripCampaigns,
  dripCampaignSteps,
  dripCampaignAssignments,
  dripCampaignStepStatus,
  labelQueue,
  mailerTypes,
  companies,
  insertCompanySchema,
  sketchboardEntries,
  opportunityScores,
  domainAcknowledgments,
} from "@shared/schema";
// Removed: pricingData import - legacy table removed
import { addPricingRoutes } from "./routes-pricing";
import pricingDatabaseRoutes from "./routes-pricing-database";
import { registerLeadsRoutes } from "./routes-leads";
import { registerDripRoutes } from "./routes-drip";
import { registerTasksRoutes } from "./routes-tasks";
import { registerEmailRoutes } from "./routes-email";
import { registerAdminRoutes } from "./routes-admin";
import { registerCustomersRoutes } from "./routes-customers";
import { APP_CONFIG, isAdminEmail, getUserRoleFromEmail, getAccessibleTiers, debugLog } from "./config";
import { searchNotionProducts } from "./notion";
import * as googleCalendar from "./google-calendar-client";
import { autoTrackQuoteSent, autoTrackPriceListSent, autoTrackSampleShipped, findCustomerIdByEmail, findCustomerIdByName } from "./activity-tracker";
import { scanForBouncedEmails } from "./bounce-detector";

// Simple in-memory cache for frequently accessed data
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCachedData(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Stale-While-Revalidate cache for Odoo reports (per-user, 10 min TTL)
const reportCache = new Map<string, { data: any; timestamp: number; refreshing: boolean }>();
const REPORT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface ReportCacheResult {
  data: any | null;
  isStale: boolean;
  isCached: boolean;
  fetchedAt: number | null;
}

function getReportCache(userId: string, reportKey: string, bypass: boolean = false): ReportCacheResult {
  if (bypass) {
    return { data: null, isStale: false, isCached: false, fetchedAt: null };
  }
  const key = `${userId}:${reportKey}`;
  const cached = reportCache.get(key);
  
  if (!cached) {
    return { data: null, isStale: false, isCached: false, fetchedAt: null };
  }
  
  const age = Date.now() - cached.timestamp;
  const isStale = age > REPORT_CACHE_TTL;
  
  return { data: cached.data, isStale, isCached: true, fetchedAt: cached.timestamp };
}

// Standard metadata for report responses
function buildReportMeta(source: 'odoo' | 'shopify' | 'local' | 'mixed', cached: boolean, fetchedAt: number | null) {
  return {
    _meta: {
      source,
      cached,
      fetchedAt: fetchedAt || Date.now(),
      fetchedAtIso: new Date(fetchedAt || Date.now()).toISOString(),
    }
  };
}

function setReportCache(userId: string, reportKey: string, data: any) {
  const key = `${userId}:${reportKey}`;
  reportCache.set(key, { data, timestamp: Date.now(), refreshing: false });
}

function isReportRefreshing(userId: string, reportKey: string): boolean {
  const key = `${userId}:${reportKey}`;
  return reportCache.get(key)?.refreshing || false;
}

function setReportRefreshing(userId: string, reportKey: string, refreshing: boolean) {
  const key = `${userId}:${reportKey}`;
  const cached = reportCache.get(key);
  if (cached) {
    cached.refreshing = refreshing;
  }
}

// Background refresh helper - runs fetch and updates cache
async function refreshReportInBackground(
  userId: string,
  reportKey: string,
  fetchFn: () => Promise<any>
) {
  if (isReportRefreshing(userId, reportKey)) return;
  
  setReportRefreshing(userId, reportKey, true);
  try {
    const freshData = await fetchFn();
    setReportCache(userId, reportKey, freshData);
  } catch (error) {
    console.error(`[Report Cache] Background refresh failed for ${reportKey}:`, error);
  } finally {
    setReportRefreshing(userId, reportKey, false);
  }
}

// Pre-load logo buffer at startup for fast PDF generation
let cachedLogoBuffer: Buffer | null = null;
const logoPath = path.join(process.cwd(), 'attached_assets', '4s_logo_Clean_120x_1764801255491.png');
try {
  if (fs.existsSync(logoPath)) {
    cachedLogoBuffer = fs.readFileSync(logoPath);
  }
} catch (e) {
  console.log('Logo not found for caching, will use text fallback');
}

function convertQuotesToCSV(quotes: any[]): string {
  if (quotes.length === 0) {
    return 'No quotes found\n';
  }
  
  const headers = ['Quote Number', 'Customer Name', 'Customer Email', 'Total Amount', 'Created At', 'Sent Via', 'Status'];
  const rows = quotes.map(quote => [
    quote.quoteNumber,
    quote.customerName,
    quote.customerEmail || '',
    quote.totalAmount,
    quote.createdAt,
    quote.sentVia,
    quote.status
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

async function saveProductDataToFile() {
  try {
    // Get current product data
    const categories = await storage.getProductCategories();
    const types = await storage.getProductTypes();
    const sizes = await storage.getProductSizes();
    const tiers = await storage.getPricingTiers();
    const pricing: any[] = []; // Legacy pricing table removed, using productPricingMaster instead

    // Build CSV data similar to the original format
    const csvData = [];
    
    // Add header
    csvData.push([
      "ProductID",
      "ProductName", 
      "ProductType",
      "Size",
      "ItemCode",
      "MinOrderQty",
      ...tiers.map(tier => `${tier.name}_pricePerSqm`)
    ]);

    // Build rows
    sizes.forEach(size => {
      const type = types.find(t => t.id === size.typeId);
      const category = categories.find(c => c.id === type?.categoryId);
      const sizePricing = pricing.filter((p: any) => p.productTypeId === size.typeId);
      
      const row = [
        size.id.toString(),
        `${category?.name || ""} ${type?.name || ""}`.trim(),
        type?.name || "",
        size.name,
        size.itemCode || "",
        size.minOrderQty || "",
        ...tiers.map(tier => {
          const tierPrice = sizePricing.find((p: any) => p.tierId === tier.id);
          return tierPrice ? tierPrice.pricePerSquareMeter : "0";
        })
      ];
      
      csvData.push(row);
    });

    // Convert to CSV string
    const csvString = csvData.map(row => row.join(",")).join("\n");
    
    // Save to file
    const filePath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data.csv');
    fs.writeFileSync(filePath, csvString);
    
    debugLog("Product data saved to file successfully");
  } catch (error) {
    console.error("Error saving product data to file:", error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register Object Storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Boot-time migration: add odoo_partner_id to leads if it doesn't exist
  try {
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS odoo_partner_id integer`);
  } catch (err) {
    console.error("Migration error (leads.odoo_partner_id):", err);
  }

  // Boot-time migration: add last_sent_sync_at to user_gmail_connections for sent mail activity sync
  try {
    await db.execute(sql`ALTER TABLE user_gmail_connections ADD COLUMN IF NOT EXISTS last_sent_sync_at timestamp`);
  } catch (err) {
    console.error("Migration error (user_gmail_connections.last_sent_sync_at):", err);
  }

  // Boot-time migration: create sketchboard_entries table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sketchboard_entries (
        id serial PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "column" varchar(20) NOT NULL,
        customer_name varchar(255) NOT NULL,
        note varchar(255),
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "IDX_sketchboard_user_column" ON sketchboard_entries(user_id, "column")
    `);
  } catch (err) {
    console.error("Migration error (sketchboard_entries):", err);
  }

  // Boot-time migration: add expectedRevenue, nextBestAction, opportunityAgeDays to opportunity_scores
  try {
    await db.execute(sql`ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS expected_revenue decimal(12,2)`);
    await db.execute(sql`ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS next_best_action text`);
    await db.execute(sql`ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS opportunity_age_days integer`);
  } catch (err) {
    console.error("Migration error (opportunity_scores new columns):", err);
  }

  // Boot-time migration: add assigned_rep_id to opportunity_scores
  try {
    await db.execute(sql`ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS assigned_rep_id varchar`);
    await db.execute(sql`ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS assigned_rep_name varchar(255)`);
  } catch (err) {
    console.error("Migration error (opportunity_scores assigned_rep):", err);
  }

  // Boot-time backfill: derive salesRepId from salesRepName where salesRepId is NULL
  // salesRepId stores Odoo res.users IDs: 26=Aneesh, 27=Patricio, 28=Santiago
  try {
    const backfillResult = await db.execute(sql`
      UPDATE customers
      SET sales_rep_id = CASE
        WHEN sales_rep_name ILIKE '%Patricio%' THEN '27'
        WHEN sales_rep_name ILIKE '%Santiago%' THEN '28'
        WHEN sales_rep_name ILIKE '%Aneesh%'   THEN '26'
      END
      WHERE sales_rep_id IS NULL
        AND sales_rep_name IS NOT NULL
        AND sales_rep_name != ''
        AND (
          sales_rep_name ILIKE '%Patricio%'
          OR sales_rep_name ILIKE '%Santiago%'
          OR sales_rep_name ILIKE '%Aneesh%'
        )
    `);
    const count = (backfillResult as any).rowCount || 0;
    if (count > 0) console.log(`[Boot] Backfilled salesRepId for ${count} customers with salesRepName but no salesRepId`);

    const leadBackfill = await db.execute(sql`
      UPDATE leads
      SET sales_rep_id = CASE
        WHEN sales_rep_name ILIKE '%Patricio%' THEN '27'
        WHEN sales_rep_name ILIKE '%Santiago%' THEN '28'
        WHEN sales_rep_name ILIKE '%Aneesh%'   THEN '26'
      END
      WHERE sales_rep_id IS NULL
        AND sales_rep_name IS NOT NULL
        AND sales_rep_name != ''
        AND (
          sales_rep_name ILIKE '%Patricio%'
          OR sales_rep_name ILIKE '%Santiago%'
          OR sales_rep_name ILIKE '%Aneesh%'
        )
    `);
    const leadCount = (leadBackfill as any).rowCount || 0;
    if (leadCount > 0) console.log(`[Boot] Backfilled salesRepId for ${leadCount} leads with salesRepName but no salesRepId`);
  } catch (err) {
    console.error("Migration error (salesRepId backfill):", err);
  }

  // Initialize default follow-up configurations on startup
  try {
    await storage.initDefaultFollowUpConfig();
    console.log("✅ Default follow-up configs initialized");
  } catch (err) {
    console.error("Failed to initialize follow-up configs:", err);
  }
  
  // Auto-generate daily check-in tasks if users have none
  try {
    const todayTasks = await storage.getTodayFollowUpTasks();
    const pendingTasks = await storage.getPendingFollowUpTasks();
    const totalTasks = todayTasks.length + pendingTasks.length;
    
    // If there are fewer than 5 tasks, auto-generate some
    if (totalTasks < 5) {
      console.log(`[Task Generator] Only ${totalTasks} tasks found, generating check-in tasks...`);
      
      // Get customers sorted by last activity (oldest first)
      const customers = await storage.getAllCustomers();
      const now = new Date();
      const tasksNeeded = Math.max(5 - totalTasks, 5); // Generate at least 5 tasks
      
      // Filter customers that don't already have pending tasks
      const customersWithTasks = new Set([
        ...todayTasks.map(t => t.customerId),
        ...pendingTasks.map(t => t.customerId)
      ]);
      
      const eligibleCustomers = customers
        .filter(c => !customersWithTasks.has(c.id) && (c.company || c.firstName || c.lastName))
        .slice(0, tasksNeeded);
      
      const taskTypes = [
        { type: 'check_in', title: 'Check in with customer', priority: 'normal' },
        { type: 'reorder_check', title: 'Check if customer needs reorder', priority: 'normal' },
        { type: 'relationship', title: 'Build relationship - quick call', priority: 'low' },
      ];
      
      let tasksCreated = 0;
      for (let i = 0; i < eligibleCustomers.length && tasksCreated < tasksNeeded; i++) {
        const customer = eligibleCustomers[i];
        const taskConfig = taskTypes[tasksCreated % taskTypes.length];
        
        // Spread due dates throughout the day and week
        const dueDate = new Date(now);
        dueDate.setHours(9 + (tasksCreated % 8), 0, 0, 0); // Between 9am and 5pm
        if (tasksCreated >= 5) {
          dueDate.setDate(dueDate.getDate() + Math.floor(tasksCreated / 5)); // Spread over days
        }
        
        const customerName = customer.company || 
          `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 
          customer.email || 'Customer';
        
        await storage.createFollowUpTask({
          customerId: customer.id,
          title: `${taskConfig.title} - ${customerName}`,
          description: `Auto-generated daily task for customer engagement`,
          taskType: taskConfig.type,
          priority: taskConfig.priority as 'low' | 'normal' | 'high' | 'urgent',
          status: 'pending',
          dueDate,
        });
        tasksCreated++;
      }
      
      console.log(`✅ Generated ${tasksCreated} daily check-in tasks`);
    }
  } catch (err) {
    console.error("Failed to auto-generate tasks:", err);
  }
  
  // ============================================================
  // CRITICAL: Setup authentication middleware BEFORE all HTTP routes
  // Session + Passport middleware must be registered first so that
  // req.session and req.user are populated for every route handler.
  // ============================================================
  await setupAuth(app);
  console.log("[Boot] Auth middleware registered BEFORE all HTTP routes");

  // Test database connection
  app.get("/api/test-db", isAuthenticated, async (req: any, res) => {
    try {
      debugLog("Testing database connection...");
      
      // Test basic queries one by one
      const customersCount = await storage.getCustomersCount();
      debugLog("Customers count:", customersCount);
      
      const productsCount = await storage.getProductsCount();
      debugLog("Products count:", productsCount);
      
      const quotesCount = await storage.getSentQuotesCount();
      debugLog("Quotes count:", quotesCount);
      
      res.json({
        database: "connected",
        customers: customersCount,
        products: productsCount,
        quotes: quotesCount
      });
    } catch (error) {
      console.error("Database test error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown database error";
      res.status(500).json({ error: errorMessage });
    }
  });

  // REMOVED: /api/fix-admin-user - security hole, was exposing unauthenticated admin escalation
  // Use /admin page to manage user roles instead

  // Integration connection status check - for connection popup
  app.get("/api/integrations/status", isAuthenticated, async (req: any, res) => {
    const connectionStatus = {
      odoo: { connected: false, error: null as string | null },
      gmail: { connected: false, error: null as string | null },
      calendar: { connected: false, error: null as string | null },
    };
    
    // Check all connections in parallel for speed
    const checks = await Promise.allSettled([
      // Check Odoo connection
      (async () => {
        try {
          const { odooClient } = await import('./odoo');
          const odooResult = await odooClient.testConnection();
          connectionStatus.odoo.connected = odooResult.success === true;
          if (!odooResult.success) {
            connectionStatus.odoo.error = odooResult.message || 'Connection failed';
          }
        } catch (error: any) {
          connectionStatus.odoo.connected = false;
          connectionStatus.odoo.error = error.message || 'Odoo not configured';
        }
      })(),
      
      // Check Gmail connection — true if the user has a personal OAuth connection OR the shared connector works
      (async () => {
        try {
          const authUserId = (req.user as any)?.claims?.sub || req.user?.id;

          // 1. Check per-user OAuth first (most common path)
          if (authUserId) {
            const { getUserGmailConnection } = await import('./user-gmail-oauth');
            const userConn = await getUserGmailConnection(authUserId);
            if (userConn?.isActive) {
              connectionStatus.gmail.connected = true;
              return;
            }
          }

          // 2. Fall back to shared Replit connector
          const { checkGmailConnection } = await import('./gmail-client');
          const ok = await checkGmailConnection();
          connectionStatus.gmail.connected = ok;
          if (!ok) connectionStatus.gmail.error = 'Gmail not connected - click Connect Gmail to link your account';
        } catch (error: any) {
          connectionStatus.gmail.connected = false;
          connectionStatus.gmail.error = error.message || 'Gmail check failed';
        }
      })(),

      // Check Google Calendar connection using the same client used for reading events
      (async () => {
        try {
          const { isGoogleCalendarConnected } = await import('./google-calendar-client');
          const ok = await isGoogleCalendarConnected();
          connectionStatus.calendar.connected = ok;
          if (!ok) connectionStatus.calendar.error = 'Google Calendar not connected - please reconnect in Integrations panel';
        } catch (error: any) {
          connectionStatus.calendar.connected = false;
          connectionStatus.calendar.error = error.message || 'Calendar check failed';
        }
      })(),
    ]);
    
    res.json(connectionStatus);
  });

  // Dashboard statistics endpoint
  app.get("/api/dashboard/stats", isAuthenticated, async (req: any, res) => {
    try {
      debugLog("=== Dashboard Stats Request ===");
      
      // Use simpler approach - test each query individually
      let totalQuotes = 0;
      let quotesThisMonth = 0;
      let monthlyRevenue = 0;
      let totalCustomers = 0;
      let hotLeads = 0;
      let totalProducts = 0;
      let activityCount = 0;

      try {
        totalQuotes = await storage.getSentQuotesCount();
        debugLog("✓ Total quotes:", totalQuotes);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        console.warn("Failed to get quotes count:", errorMessage);
      }

      try {
        totalCustomers = await storage.getCustomersCount();
        debugLog("✓ Total customers:", totalCustomers);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        console.warn("Failed to get customers count:", errorMessage);
      }

      try {
        hotLeads = await storage.getHotLeadsCount();
        debugLog("✓ Hot leads:", hotLeads);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        console.warn("Failed to get hot leads count:", errorMessage);
      }

      try {
        totalProducts = await storage.getProductsCount();
        debugLog("✓ Total products:", totalProducts);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        console.warn("Failed to get products count:", errorMessage);
      }

      try {
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        
        quotesThisMonth = await storage.getSentQuotesCountSince(thisMonth);
        debugLog("✓ Quotes this month:", quotesThisMonth);
        
        const monthlyQuotes = await storage.getSentQuotesSince(thisMonth);
        monthlyRevenue = monthlyQuotes.reduce((sum, quote) => {
          const amount = parseFloat(quote.totalAmount?.toString() || '0');
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        debugLog("✓ Monthly revenue:", monthlyRevenue);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        console.warn("Failed to get monthly stats:", errorMessage);
      }

      const stats = {
        totalQuotes,
        quotesThisMonth,
        monthlyRevenue,
        totalCustomers,
        hotLeads,
        totalProducts,
        activityCount
      };
      
      debugLog("=== Final Dashboard Stats ===", stats);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch dashboard statistics", details: errorMessage });
    }
  });

  // CRM Dashboard statistics endpoint
  app.get("/api/dashboard/crm", isAuthenticated, async (req: any, res) => {
    try {
      const crmStats = await storage.getCRMDashboardStats();
      res.json(crmStats);
    } catch (error) {
      console.error("CRM Dashboard stats error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch CRM statistics", details: errorMessage });
    }
  });

  // Sales Analytics - daily sales trendline data
  app.get("/api/analytics/sales-trend", isAuthenticated, async (req: any, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Get quotes grouped by day
      const quotesResult = await db.select({
        date: sql<string>`DATE(${sentQuotes.createdAt})`,
        totalAmount: sql<string>`SUM(CAST(${sentQuotes.totalAmount} AS NUMERIC))`,
        count: sql<number>`COUNT(*)`,
      })
        .from(sentQuotes)
        .where(gte(sentQuotes.createdAt, startDate))
        .groupBy(sql`DATE(${sentQuotes.createdAt})`)
        .orderBy(sql`DATE(${sentQuotes.createdAt})`);
      
      // Try to get invoices from Odoo (if available)
      let odooInvoices: any[] = [];
      try {
        const invoicesRaw = await odooClient.searchRead('account.move', [
          ['move_type', 'in', ['out_invoice']],
          ['state', '=', 'posted'],
          ['invoice_date', '>=', startDate.toISOString().split('T')[0]],
        ], ['id', 'invoice_date', 'amount_total', 'state'], { limit: 500 });
        
        // Group invoices by date
        const invoicesByDate = new Map<string, number>();
        for (const inv of invoicesRaw) {
          const date = inv.invoice_date;
          if (date) {
            const current = invoicesByDate.get(date) || 0;
            invoicesByDate.set(date, current + (inv.amount_total || 0));
          }
        }
        
        odooInvoices = Array.from(invoicesByDate.entries()).map(([date, total]) => ({
          date,
          invoicedAmount: total,
        }));
      } catch (err) {
        console.warn("Could not fetch Odoo invoices for analytics:", err);
      }
      
      // Build daily data for the date range
      const dailyData: { date: string; quotedAmount: number; invoicedAmount: number; quoteCount: number }[] = [];
      
      // Normalize date keys - PostgreSQL DATE can return Date objects or strings
      const quotesMap = new Map(quotesResult.map(q => {
        const dateKey = q.date instanceof Date 
          ? q.date.toISOString().split('T')[0] 
          : String(q.date).split('T')[0];
        return [dateKey, { amount: parseFloat(q.totalAmount) || 0, count: Number(q.count) || 0 }];
      }));
      const invoicesMap = new Map(odooInvoices.map(i => [i.date, i.invoicedAmount]));
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const quoteData = quotesMap.get(dateStr) || { amount: 0, count: 0 };
        dailyData.push({
          date: dateStr,
          quotedAmount: quoteData.amount,
          invoicedAmount: invoicesMap.get(dateStr) || 0,
          quoteCount: quoteData.count,
        });
      }
      
      // Calculate totals
      const totalQuoted = dailyData.reduce((sum, d) => sum + d.quotedAmount, 0);
      const totalInvoiced = dailyData.reduce((sum, d) => sum + d.invoicedAmount, 0);
      const totalQuoteCount = dailyData.reduce((sum, d) => sum + d.quoteCount, 0);
      
      res.json({
        success: true,
        days,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dailyData,
        totals: {
          quoted: totalQuoted,
          invoiced: totalInvoiced,
          quoteCount: totalQuoteCount,
        },
      });
    } catch (error) {
      console.error("Sales analytics error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch sales analytics", details: errorMessage });
    }
  });

  // Helper to fetch invoices-2026 data
  async function fetchInvoices2026Data() {
    const year = 2026;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    const invoices = await odooClient.searchRead('account.move', [
      ['move_type', 'in', ['out_invoice']],
      ['state', '=', 'posted'],
      ['invoice_date', '>=', startDate],
      ['invoice_date', '<=', endDate],
    ], ['id', 'invoice_date', 'amount_total', 'amount_untaxed', 'state'], { limit: 10000 });
    
    const monthlyData = new Map<number, { total: number; untaxed: number; count: number }>();
    for (let m = 1; m <= 12; m++) {
      monthlyData.set(m, { total: 0, untaxed: 0, count: 0 });
    }
    
    let grandTotal = 0;
    let grandUntaxed = 0;
    
    for (const inv of invoices) {
      if (inv.invoice_date) {
        const month = parseInt(inv.invoice_date.split('-')[1]);
        const current = monthlyData.get(month) || { total: 0, untaxed: 0, count: 0 };
        current.total += inv.amount_total || 0;
        current.untaxed += inv.amount_untaxed || 0;
        current.count += 1;
        monthlyData.set(month, current);
        grandTotal += inv.amount_total || 0;
        grandUntaxed += inv.amount_untaxed || 0;
      }
    }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = months.map((name, idx) => {
      const data = monthlyData.get(idx + 1) || { total: 0, untaxed: 0, count: 0 };
      return { month: name, total: data.total, untaxed: data.untaxed, count: data.count };
    });
    
    const ordersToInvoice = await odooClient.searchRead('sale.order', [
      ['state', '=', 'sale'],
      ['invoice_status', '=', 'to invoice'],
    ], ['id', 'amount_total'], { limit: 10000 });
    
    return {
      success: true,
      year,
      grandTotal,
      grandUntaxed,
      invoiceCount: invoices.length,
      chartData,
      waitingToInvoice: {
        count: ordersToInvoice.length,
        amount: ordersToInvoice.reduce((sum: number, o: any) => sum + (o.amount_total || 0), 0),
      },
    };
  }

  // Reports 2026 - Invoice totals for 2026 only (with stale-while-revalidate cache)
  app.get("/api/reports/invoices-2026", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email || 'anonymous';
      const reportKey = 'invoices-2026';
      const bypass = req.query.refresh === 'true';
      const cached = getReportCache(userId, reportKey, bypass);
      
      if (cached.isCached) {
        if (cached.isStale) {
          refreshReportInBackground(userId, reportKey, fetchInvoices2026Data);
        }
        return res.json({ ...cached.data, ...buildReportMeta('odoo', true, cached.fetchedAt) });
      }
      
      const data = await fetchInvoices2026Data();
      setReportCache(userId, reportKey, data);
      res.json({ ...data, ...buildReportMeta('odoo', false, Date.now()) });
    } catch (error) {
      console.error("Invoices 2026 report error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch invoice data", details: errorMessage });
    }
  });

  // Helper to fetch quotes-vs-orders-2026 data
  async function fetchQuotesVsOrders2026Data() {
    const year = 2026;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    const saleOrders = await odooClient.searchRead('sale.order', [
      ['date_order', '>=', `${startDate} 00:00:00`],
      ['date_order', '<=', `${endDate} 23:59:59`],
    ], ['id', 'name', 'state', 'date_order', 'amount_total', 'amount_untaxed'], { limit: 10000 });
    
    const monthlyQuotes = new Map<number, { amount: number; count: number }>();
    const monthlyConfirmed = new Map<number, { amount: number; count: number }>();
    
    for (let m = 1; m <= 12; m++) {
      monthlyQuotes.set(m, { amount: 0, count: 0 });
      monthlyConfirmed.set(m, { amount: 0, count: 0 });
    }
    
    let totalQuotesAmount = 0, totalConfirmedAmount = 0, quotesCount = 0, confirmedCount = 0;
    
    for (const order of saleOrders) {
      if (order.date_order) {
        const dateStr = order.date_order.split(' ')[0];
        const month = parseInt(dateStr.split('-')[1]);
        
        if (['draft', 'sent'].includes(order.state)) {
          const current = monthlyQuotes.get(month) || { amount: 0, count: 0 };
          current.amount += order.amount_total || 0;
          current.count += 1;
          monthlyQuotes.set(month, current);
          totalQuotesAmount += order.amount_total || 0;
          quotesCount += 1;
        } else if (['sale', 'done'].includes(order.state)) {
          const current = monthlyConfirmed.get(month) || { amount: 0, count: 0 };
          current.amount += order.amount_total || 0;
          current.count += 1;
          monthlyConfirmed.set(month, current);
          totalConfirmedAmount += order.amount_total || 0;
          confirmedCount += 1;
        }
      }
    }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = months.map((name, idx) => {
      const quotes = monthlyQuotes.get(idx + 1) || { amount: 0, count: 0 };
      const confirmed = monthlyConfirmed.get(idx + 1) || { amount: 0, count: 0 };
      return {
        month: name,
        quotesAmount: quotes.amount,
        quotesCount: quotes.count,
        confirmedAmount: confirmed.amount,
        confirmedCount: confirmed.count,
      };
    });
    
    return {
      success: true,
      year,
      totals: { quotesAmount: totalQuotesAmount, quotesCount, confirmedAmount: totalConfirmedAmount, confirmedCount },
      chartData,
    };
  }

  // Reports 2026 - Quotations vs Confirmed Sales Orders (with stale-while-revalidate cache)
  app.get("/api/reports/quotes-vs-orders-2026", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email || 'anonymous';
      const reportKey = 'quotes-vs-orders-2026';
      const bypass = req.query.refresh === 'true';
      const cached = getReportCache(userId, reportKey, bypass);
      
      if (cached.isCached) {
        if (cached.isStale) {
          refreshReportInBackground(userId, reportKey, fetchQuotesVsOrders2026Data);
        }
        return res.json({ ...cached.data, ...buildReportMeta('odoo', true, cached.fetchedAt) });
      }
      
      const data = await fetchQuotesVsOrders2026Data();
      setReportCache(userId, reportKey, data);
      res.json({ ...data, ...buildReportMeta('odoo', false, Date.now()) });
    } catch (error) {
      console.error("Quotes vs Orders 2026 report error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch quotes/orders data", details: errorMessage });
    }
  });

  // Helper to fetch gross-profit-2026 data
  async function fetchGrossProfit2026Data() {
    const year = 2026;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    const incomeLines = await odooClient.searchRead('account.move.line', [
      ['account_id.account_type', 'in', ['income', 'income_other']],
      ['date', '>=', startDate],
      ['date', '<=', endDate],
      ['parent_state', '=', 'posted'],
    ], ['credit', 'debit', 'date'], { limit: 50000 });
    
    const cosLines = await odooClient.searchRead('account.move.line', [
      ['account_id.account_type', '=', 'expense_direct_cost'],
      ['date', '>=', startDate],
      ['date', '<=', endDate],
      ['parent_state', '=', 'posted'],
    ], ['credit', 'debit', 'date'], { limit: 50000 });
    
    const monthlyData = new Map<number, { revenue: number; cogs: number }>();
    for (let m = 1; m <= 12; m++) {
      monthlyData.set(m, { revenue: 0, cogs: 0 });
    }
    
    let totalRevenue = 0;
    for (const line of incomeLines) {
      const lineRevenue = (line.credit || 0) - (line.debit || 0);
      totalRevenue += lineRevenue;
      if (line.date) {
        const month = parseInt(line.date.split('-')[1]);
        const current = monthlyData.get(month) || { revenue: 0, cogs: 0 };
        current.revenue += lineRevenue;
        monthlyData.set(month, current);
      }
    }
    
    let totalCogs = 0;
    for (const line of cosLines) {
      const lineCogs = (line.debit || 0) - (line.credit || 0);
      totalCogs += lineCogs;
      if (line.date) {
        const month = parseInt(line.date.split('-')[1]);
        const current = monthlyData.get(month) || { revenue: 0, cogs: 0 };
        current.cogs += lineCogs;
        monthlyData.set(month, current);
      }
    }
    
    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPercent = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100) : 0;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = months.map((name, idx) => {
      const data = monthlyData.get(idx + 1) || { revenue: 0, cogs: 0 };
      const profit = data.revenue - data.cogs;
      const margin = data.revenue > 0 ? ((profit / data.revenue) * 100) : 0;
      return { month: name, revenue: data.revenue, cogs: data.cogs, profit, margin: Math.round(margin * 10) / 10 };
    });
    
    return {
      success: true,
      year,
      totals: { revenue: totalRevenue, cogs: totalCogs, grossProfit, grossMarginPercent: Math.round(grossMarginPercent * 10) / 10 },
      chartData,
    };
  }

  // Reports 2026 - Gross Profit (COGS vs Sales) (with stale-while-revalidate cache)
  app.get("/api/reports/gross-profit-2026", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email || 'anonymous';
      const reportKey = 'gross-profit-2026';
      const bypass = req.query.refresh === 'true';
      const cached = getReportCache(userId, reportKey, bypass);
      
      if (cached.isCached) {
        if (cached.isStale) {
          refreshReportInBackground(userId, reportKey, fetchGrossProfit2026Data);
        }
        return res.json({ ...cached.data, ...buildReportMeta('odoo', true, cached.fetchedAt) });
      }
      
      const data = await fetchGrossProfit2026Data();
      setReportCache(userId, reportKey, data);
      res.json({ ...data, ...buildReportMeta('odoo', false, Date.now()) });
    } catch (error) {
      console.error("Gross Profit 2026 report error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch gross profit data", details: errorMessage });
    }
  });

  // Reports 2026 - Debt to Equity Ratio
  async function fetchDebtEquity2026Data() {
    const year = 2026;
    const asOfDate = `${year}-12-31`;
    
    const liabilityLines = await odooClient.searchRead('account.move.line', [
      ['account_id.account_type', 'in', ['liability_payable', 'liability_current', 'liability_non_current']],
      ['date', '<=', asOfDate],
      ['parent_state', '=', 'posted'],
    ], ['credit', 'debit', 'balance', 'account_id'], { limit: 50000 });
    
    const equityLines = await odooClient.searchRead('account.move.line', [
      ['account_id.account_type', 'in', ['equity', 'equity_unaffected']],
      ['date', '<=', asOfDate],
      ['parent_state', '=', 'posted'],
    ], ['credit', 'debit', 'balance', 'account_id'], { limit: 50000 });
    
    const totalDebt = liabilityLines.reduce((sum: number, line: any) => 
      sum + ((line.credit || 0) - (line.debit || 0)), 0);
    
    const totalEquity = equityLines.reduce((sum: number, line: any) => 
      sum + ((line.credit || 0) - (line.debit || 0)), 0);
    
    const debtToEquityRatio = totalEquity !== 0 
      ? Math.abs(totalDebt) / Math.abs(totalEquity)
      : null;
    
    return {
      success: true,
      year,
      totalDebt: Math.abs(totalDebt),
      totalEquity: Math.abs(totalEquity),
      debtToEquityRatio,
      hasData: liabilityLines.length > 0 || equityLines.length > 0,
    };
  }

  app.get("/api/reports/debt-equity-2026", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.email || 'anonymous';
      const reportKey = 'debt-equity-2026';
      const bypass = req.query.refresh === 'true';
      const cached = getReportCache(userId, reportKey, bypass);
      
      if (cached.isCached) {
        if (cached.isStale) {
          refreshReportInBackground(userId, reportKey, fetchDebtEquity2026Data);
        }
        return res.json({ ...cached.data, ...buildReportMeta('odoo', true, cached.fetchedAt) });
      }
      
      const data = await fetchDebtEquity2026Data();
      setReportCache(userId, reportKey, data);
      res.json({ ...data, ...buildReportMeta('odoo', false, Date.now()) });
    } catch (error) {
      console.error("Debt to Equity 2026 report error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch debt/equity data", 
        details: errorMessage,
        hasData: false,
      });
    }
  });

  // Reports - ROI & MOIC (Investor Returns)
  async function fetchInvestorReturnsData(initialInvestment: number, companyStartDate: string) {
      const today = new Date().toISOString().split('T')[0];
      
      // Get all equity accounts (current total equity = book value)
      const equityLines = await odooClient.searchRead('account.move.line', [
        ['account_id.account_type', 'in', ['equity', 'equity_unaffected']],
        ['date', '<=', today],
        ['parent_state', '=', 'posted'],
      ], ['credit', 'debit', 'balance', 'account_id', 'date'], { limit: 50000 });
      
      // Total equity (book value)
      const totalEquity = equityLines.reduce((sum: number, line: any) => 
        sum + ((line.credit || 0) - (line.debit || 0)), 0);
      
      // Get lifetime income (all-time revenue)
      const lifetimeIncome = await odooClient.searchRead('account.move.line', [
        ['account_id.account_type', 'in', ['income', 'income_other']],
        ['date', '>=', companyStartDate],
        ['date', '<=', today],
        ['parent_state', '=', 'posted'],
      ], ['credit', 'debit'], { limit: 100000 });
      
      const totalRevenue = lifetimeIncome.reduce((sum: number, line: any) => 
        sum + ((line.credit || 0) - (line.debit || 0)), 0);
      
      // Get lifetime COGS
      const lifetimeCogs = await odooClient.searchRead('account.move.line', [
        ['account_id.account_type', '=', 'expense_direct_cost'],
        ['date', '>=', companyStartDate],
        ['date', '<=', today],
        ['parent_state', '=', 'posted'],
      ], ['credit', 'debit'], { limit: 100000 });
      
      const totalCogs = lifetimeCogs.reduce((sum: number, line: any) => 
        sum + ((line.debit || 0) - (line.credit || 0)), 0);
      
      // Get lifetime operating expenses
      const lifetimeExpenses = await odooClient.searchRead('account.move.line', [
        ['account_id.account_type', 'in', ['expense', 'expense_depreciation']],
        ['date', '>=', companyStartDate],
        ['date', '<=', today],
        ['parent_state', '=', 'posted'],
      ], ['credit', 'debit'], { limit: 100000 });
      
      const totalExpenses = lifetimeExpenses.reduce((sum: number, line: any) => 
        sum + ((line.debit || 0) - (line.credit || 0)), 0);
      
      // Calculate net income lifetime
      const lifetimeGrossProfit = totalRevenue - totalCogs;
      const lifetimeNetIncome = lifetimeGrossProfit - totalExpenses;
      
      // Current value = initial investment + lifetime earnings (or use equity if available)
      // For simplicity, we use equity as current book value
      const currentValue = Math.abs(totalEquity) > 0 ? Math.abs(totalEquity) : initialInvestment + lifetimeNetIncome;
      
      // Calculate ROI = (Current Value - Initial Investment) / Initial Investment × 100
      const roi = initialInvestment > 0 
        ? ((currentValue - initialInvestment) / initialInvestment) * 100 
        : 0;
      
      // Calculate MOIC = Current Value / Initial Investment
      const moic = initialInvestment > 0 
        ? currentValue / initialInvestment 
        : 0;
      
      // Calculate years in business
      const startYear = parseInt(companyStartDate.split('-')[0]);
      const currentYear = new Date().getFullYear();
      const yearsInBusiness = currentYear - startYear;
      
      // Calculate annualized ROI (CAGR)
      const annualizedRoi = yearsInBusiness > 0 && initialInvestment > 0
        ? (Math.pow(currentValue / initialInvestment, 1 / yearsInBusiness) - 1) * 100
        : 0;
      
      // Get yearly profits for chart
      const yearlyData: Array<{ year: number; revenue: number; profit: number; cumulativeProfit: number }> = [];
      let cumulativeProfit = 0;
      
      for (let year = startYear; year <= currentYear; year++) {
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        
        // Get year's income
        const yearIncome = await odooClient.searchRead('account.move.line', [
          ['account_id.account_type', 'in', ['income', 'income_other']],
          ['date', '>=', yearStart],
          ['date', '<=', yearEnd],
          ['parent_state', '=', 'posted'],
        ], ['credit', 'debit'], { limit: 50000 });
        
        const yearRevenue = yearIncome.reduce((sum: number, line: any) => 
          sum + ((line.credit || 0) - (line.debit || 0)), 0);
        
        // Get year's COGS
        const yearCogs = await odooClient.searchRead('account.move.line', [
          ['account_id.account_type', '=', 'expense_direct_cost'],
          ['date', '>=', yearStart],
          ['date', '<=', yearEnd],
          ['parent_state', '=', 'posted'],
        ], ['credit', 'debit'], { limit: 50000 });
        
        const yearCost = yearCogs.reduce((sum: number, line: any) => 
          sum + ((line.debit || 0) - (line.credit || 0)), 0);
        
        const yearProfit = yearRevenue - yearCost;
        cumulativeProfit += yearProfit;
        
        yearlyData.push({
          year,
          revenue: yearRevenue,
          profit: yearProfit,
          cumulativeProfit,
        });
      }
      
      return {
        success: true,
        initialInvestment,
        currentValue,
        totalEquity: Math.abs(totalEquity),
        lifetimeRevenue: totalRevenue,
        lifetimeGrossProfit,
        lifetimeCogs: totalCogs,
        lifetimeExpenses: totalExpenses,
        lifetimeNetIncome,
        roi: Math.round(roi * 10) / 10,
        moic: Math.round(moic * 100) / 100,
        annualizedRoi: Math.round(annualizedRoi * 10) / 10,
        yearsInBusiness,
        companyStartDate,
        yearlyData,
        hasData: equityLines.length > 0 || lifetimeIncome.length > 0,
      };
  }

  app.get("/api/reports/investor-returns", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const initialInvestment = parseFloat(req.query.initialInvestment as string) || 100000;
      const companyStartDate = req.query.startDate as string || '2020-01-01';
      const userId = req.user?.email || 'anonymous';
      const reportKey = `investor-returns-${initialInvestment}-${companyStartDate}`;
      const bypass = req.query.refresh === 'true';
      const cached = getReportCache(userId, reportKey, bypass);
      
      if (cached.isCached) {
        if (cached.isStale) {
          refreshReportInBackground(userId, reportKey, () => fetchInvestorReturnsData(initialInvestment, companyStartDate));
        }
        return res.json({ ...cached.data, ...buildReportMeta('odoo', true, cached.fetchedAt) });
      }
      
      const data = await fetchInvestorReturnsData(initialInvestment, companyStartDate);
      setReportCache(userId, reportKey, data);
      res.json({ ...data, ...buildReportMeta('odoo', false, Date.now()) });
    } catch (error) {
      console.error("Investor Returns report error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch investor returns data", 
        details: errorMessage,
        hasData: false,
      });
    }
  });

  // Reports 2026 - Bad Debt & Collections
  async function fetchBadDebt2026Data() {
      const today = new Date();
      
      const openInvoices = await odooClient.searchRead('account.move', [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ['payment_state', 'in', ['not_paid', 'partial']],
      ], ['id', 'name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'payment_state'], { limit: 5000 });
      
      const agingBuckets = {
        current: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        days90Plus: 0,
      };
      
      const customerTotals = new Map<number, { 
        name: string; 
        amountDue: number; 
        oldestDueDate: string; 
        daysOverdue: number;
        invoiceCount: number;
      }>();
      
      let totalReceivables = 0;
      let totalOverdue = 0;
      
      for (const invoice of openInvoices) {
        const amountDue = invoice.amount_residual || 0;
        totalReceivables += amountDue;
        
        const dueDate = invoice.invoice_date_due ? new Date(invoice.invoice_date_due) : null;
        const daysOverdue = dueDate ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        if (daysOverdue <= 0) {
          agingBuckets.current += amountDue;
        } else if (daysOverdue <= 30) {
          agingBuckets.days1_30 += amountDue;
          totalOverdue += amountDue;
        } else if (daysOverdue <= 60) {
          agingBuckets.days31_60 += amountDue;
          totalOverdue += amountDue;
        } else if (daysOverdue <= 90) {
          agingBuckets.days61_90 += amountDue;
          totalOverdue += amountDue;
        } else {
          agingBuckets.days90Plus += amountDue;
          totalOverdue += amountDue;
        }
        
        if (daysOverdue > 0 && invoice.partner_id) {
          const partnerId = invoice.partner_id[0];
          const partnerName = invoice.partner_id[1] || 'Unknown';
          
          const existing = customerTotals.get(partnerId);
          if (existing) {
            existing.amountDue += amountDue;
            existing.invoiceCount += 1;
            if (daysOverdue > existing.daysOverdue) {
              existing.daysOverdue = daysOverdue;
              existing.oldestDueDate = invoice.invoice_date_due || '';
            }
          } else {
            customerTotals.set(partnerId, {
              name: partnerName,
              amountDue: amountDue,
              oldestDueDate: invoice.invoice_date_due || '',
              daysOverdue: daysOverdue,
              invoiceCount: 1,
            });
          }
        }
      }
      
      const sortedCustomers = Array.from(customerTotals.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.amountDue - a.amountDue)
        .slice(0, 10);
      
      const badDebtRatio = totalReceivables > 0 
        ? (agingBuckets.days90Plus / totalReceivables) * 100 
        : 0;
      
      const collectionScore = Math.max(0, Math.min(100, 
        100 - (badDebtRatio * 2) - (agingBuckets.days61_90 / Math.max(totalReceivables, 1) * 100)
      ));
      
      const collectionTips: string[] = [];
      
      if (agingBuckets.days90Plus > 0) {
        collectionTips.push(`${sortedCustomers.filter(c => c.daysOverdue > 90).length} customers have invoices 90+ days overdue. Consider escalating to collections.`);
      }
      if (agingBuckets.days61_90 > agingBuckets.days1_30) {
        collectionTips.push('More debt in 61-90 day bucket than 1-30 days. Follow-up calls are critical now.');
      }
      if (sortedCustomers.length > 0 && sortedCustomers[0].amountDue > totalOverdue * 0.3) {
        collectionTips.push(`${sortedCustomers[0].name} owes ${Math.round(sortedCustomers[0].amountDue / totalOverdue * 100)}% of all overdue - prioritize this account.`);
      }
      if (badDebtRatio > 10) {
        collectionTips.push('Bad debt ratio is high (>10%). Review credit terms for new customers.');
      }
      if (collectionTips.length === 0) {
        collectionTips.push('Collection health is good. Keep monitoring aging weekly.');
      }
      
      return {
        success: true,
        totalReceivables,
        totalOverdue,
        badDebtRatio: Math.round(badDebtRatio * 10) / 10,
        collectionScore: Math.round(collectionScore),
        agingBuckets,
        topOverdueCustomers: sortedCustomers,
        collectionTips,
        invoiceCount: openInvoices.length,
        hasData: openInvoices.length > 0,
      };
  }

  app.get("/api/reports/bad-debt-2026", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.email || 'anonymous';
      const reportKey = 'bad-debt-2026';
      const bypass = req.query.refresh === 'true';
      const cached = getReportCache(userId, reportKey, bypass);
      
      if (cached.isCached) {
        if (cached.isStale) {
          refreshReportInBackground(userId, reportKey, fetchBadDebt2026Data);
        }
        return res.json({ ...cached.data, ...buildReportMeta('odoo', true, cached.fetchedAt) });
      }
      
      const data = await fetchBadDebt2026Data();
      setReportCache(userId, reportKey, data);
      res.json({ ...data, ...buildReportMeta('odoo', false, Date.now()) });
    } catch (error) {
      console.error("Bad Debt report error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch bad debt data", 
        details: errorMessage,
        hasData: false,
      });
    }
  });

  // Reports 2026 - Inventory Turnover
  async function fetchInventoryTurnover2026Data() {
      const year = 2026;
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      // Get COGS from Cost of Sales accounting entries (expense_direct_cost account type)
      // This is the accurate COGS from Odoo's accounting, not calculated from product costs
      const cosLines = await odooClient.searchRead('account.move.line', [
        ['account_id.account_type', '=', 'expense_direct_cost'],
        ['date', '>=', startDate],
        ['date', '<=', endDate],
        ['parent_state', '=', 'posted'],
      ], ['credit', 'debit', 'balance', 'account_id'], { limit: 50000 });
      
      // Cost of Sales: debit increases, credit decreases
      const totalCogs = cosLines.reduce((sum: number, line: any) => 
        sum + ((line.debit || 0) - (line.credit || 0)), 0);
      
      // Get current inventory value from stock.quant (inventory on hand)
      // This is the most reliable way to get current stock levels in Odoo
      let products: any[] = [];
      let currentInventoryValue = 0;
      let currentInventoryQty = 0;
      
      try {
        // Try stock.quant first (more accurate for warehoused products)
        const quants = await odooClient.searchRead('stock.quant', [
          ['quantity', '>', 0],
          ['location_id.usage', '=', 'internal'], // Only internal stock locations
        ], ['product_id', 'quantity', 'value'], { limit: 50000 });
        
        if (quants.length > 0) {
          // Group by product and sum quantities/values
          const productQuantities = new Map<number, { qty: number; value: number }>();
          for (const quant of quants) {
            const productId = quant.product_id?.[0];
            if (productId) {
              const existing = productQuantities.get(productId) || { qty: 0, value: 0 };
              existing.qty += quant.quantity || 0;
              existing.value += quant.value || 0;
              productQuantities.set(productId, existing);
            }
          }
          
          products = Array.from(productQuantities.entries()).map(([id, data]) => ({
            id,
            qty_available: data.qty,
            value: data.value
          }));
          
          currentInventoryQty = Array.from(productQuantities.values()).reduce((sum, p) => sum + p.qty, 0);
          currentInventoryValue = Array.from(productQuantities.values()).reduce((sum, p) => sum + p.value, 0);
        }
      } catch (quantError) {
        console.log("stock.quant not available, falling back to product.product");
      }
      
      // Fallback to product.product if stock.quant didn't work or returned nothing
      if (products.length === 0) {
        const productList = await odooClient.searchRead('product.product', [
          ['type', '=', 'product'], // Only storable products
          ['qty_available', '>', 0],
        ], ['id', 'qty_available', 'standard_price', 'name'], { limit: 50000 });
        
        products = productList;
        for (const product of productList) {
          const qty = product.qty_available || 0;
          const cost = product.standard_price || 0;
          currentInventoryValue += qty * cost;
          currentInventoryQty += qty;
        }
      }
      
      // Calculate inventory turnover ratio
      // Using current inventory as average (simplification - ideally would use (beginning + ending)/2)
      const inventoryTurnover = currentInventoryValue > 0 
        ? totalCogs / currentInventoryValue 
        : 0;
      
      // Days to sell inventory = 365 / turnover ratio
      const daysToSellInventory = inventoryTurnover > 0 
        ? Math.round(365 / inventoryTurnover) 
        : null;
      
      // Get product count with stock
      const productsWithStock = products.length;
      
      return {
        success: true,
        year,
        cogs: totalCogs,
        currentInventoryValue,
        currentInventoryQty: Math.round(currentInventoryQty),
        productsWithStock,
        inventoryTurnover: Math.round(inventoryTurnover * 100) / 100,
        daysToSellInventory,
        hasData: products.length > 0 || totalCogs > 0,
      };
  }

  app.get("/api/reports/inventory-turnover-2026", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email || 'anonymous';
      const reportKey = 'inventory-turnover-2026';
      const bypass = req.query.refresh === 'true';
      const cached = getReportCache(userId, reportKey, bypass);
      
      if (cached.isCached) {
        if (cached.isStale) {
          refreshReportInBackground(userId, reportKey, fetchInventoryTurnover2026Data);
        }
        return res.json({ ...cached.data, ...buildReportMeta('odoo', true, cached.fetchedAt) });
      }
      
      const data = await fetchInventoryTurnover2026Data();
      setReportCache(userId, reportKey, data);
      res.json({ ...data, ...buildReportMeta('odoo', false, Date.now()) });
    } catch (error) {
      console.error("Inventory Turnover 2026 report error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch inventory turnover data", 
        details: errorMessage,
        hasData: false,
      });
    }
  });

  // Sales Analytics - Profit & Loss (Income and Cost of Sales from Odoo)
  app.get("/api/analytics/profit-loss", isAuthenticated, async (req: any, res) => {
    try {
      const { period = 'month', year = '2026', month, quarter } = req.query;
      const yearNum = parseInt(year);
      
      let startDate: string, endDate: string;
      
      if (period === 'month' && month) {
        const monthNum = parseInt(month);
        startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${lastDay}`;
      } else if (period === 'quarter' && quarter) {
        const q = parseInt(quarter);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = q * 3;
        startDate = `${yearNum}-${String(startMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, endMonth, 0).getDate();
        endDate = `${yearNum}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
      } else {
        // Full year
        startDate = `${yearNum}-01-01`;
        endDate = `${yearNum}-12-31`;
      }
      
      // Get Income (Revenue) from account.move.line with income account types
      const incomeLines = await odooClient.searchRead('account.move.line', [
        ['account_id.account_type', 'in', ['income', 'income_other']],
        ['date', '>=', startDate],
        ['date', '<=', endDate],
        ['parent_state', '=', 'posted'],
      ], ['credit', 'debit', 'balance', 'date', 'account_id'], { limit: 50000 });
      
      // Get Cost of Sales from account.move.line with expense_direct_cost account type
      const cosLines = await odooClient.searchRead('account.move.line', [
        ['account_id.account_type', '=', 'expense_direct_cost'],
        ['date', '>=', startDate],
        ['date', '<=', endDate],
        ['parent_state', '=', 'posted'],
      ], ['credit', 'debit', 'balance', 'date', 'account_id'], { limit: 50000 });
      
      // Calculate totals - Income is credit minus debit, Cost is debit minus credit
      const totalIncome = incomeLines.reduce((sum: number, line: any) => 
        sum + ((line.credit || 0) - (line.debit || 0)), 0);
      const totalCostOfSales = cosLines.reduce((sum: number, line: any) => 
        sum + ((line.debit || 0) - (line.credit || 0)), 0);
      
      const grossProfit = totalIncome - totalCostOfSales;
      const grossMarginPercent = totalIncome > 0 ? ((grossProfit / totalIncome) * 100) : 0;
      
      res.json({
        success: true,
        period,
        year: yearNum,
        month: month ? parseInt(month) : null,
        quarter: quarter ? parseInt(quarter) : null,
        startDate,
        endDate,
        income: Math.round(totalIncome * 100) / 100,
        costOfSales: Math.round(totalCostOfSales * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMarginPercent: Math.round(grossMarginPercent * 10) / 10,
      });
    } catch (error) {
      console.error("Profit & Loss analytics error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch P&L data", details: errorMessage });
    }
  });

  // Sales Analytics - Quotes Sent (count and total from Odoo)
  app.get("/api/analytics/quotes-sent", isAuthenticated, async (req: any, res) => {
    try {
      const { period = 'month', year = '2026', month, quarter } = req.query;
      const yearNum = parseInt(year);
      
      let startDate: string, endDate: string;
      let periodLabel: string;
      
      if (period === 'month' && month) {
        const monthNum = parseInt(month);
        startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${lastDay}`;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        periodLabel = `${monthNames[monthNum - 1]} ${yearNum}`;
      } else if (period === 'quarter' && quarter) {
        const q = parseInt(quarter);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = q * 3;
        startDate = `${yearNum}-${String(startMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, endMonth, 0).getDate();
        endDate = `${yearNum}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
        periodLabel = `Q${q} ${yearNum}`;
      } else {
        startDate = `${yearNum}-01-01`;
        endDate = `${yearNum}-12-31`;
        periodLabel = `${yearNum}`;
      }
      
      // Get ALL sale orders from Odoo (every sales order was once a quote)
      const allOrders = await odooClient.searchRead('sale.order', [
        ['date_order', '>=', startDate],
        ['date_order', '<=', endDate],
      ], ['id', 'name', 'amount_total', 'date_order', 'state'], { limit: 10000 });
      
      // Total quotes = all orders created (since every order starts as a quote)
      const totalQuotes = allOrders.length;
      const totalAmount = allOrders.reduce((sum: number, q: any) => sum + (q.amount_total || 0), 0);
      
      // Outstanding quotes = not yet converted (still draft or sent)
      const outstandingQuotes = allOrders.filter((o: any) => ['draft', 'sent'].includes(o.state));
      const outstandingCount = outstandingQuotes.length;
      const outstandingAmount = outstandingQuotes.reduce((sum: number, q: any) => sum + (q.amount_total || 0), 0);
      
      // Converted = confirmed orders (sale or done)
      const convertedOrders = allOrders.filter((o: any) => ['sale', 'done'].includes(o.state));
      const convertedCount = convertedOrders.length;
      const convertedAmount = convertedOrders.reduce((sum: number, o: any) => sum + (o.amount_total || 0), 0);
      
      res.json({
        success: true,
        period,
        periodLabel,
        year: yearNum,
        month: month ? parseInt(month) : null,
        quarter: quarter ? parseInt(quarter) : null,
        startDate,
        endDate,
        // Total quotes created (all orders, since every order was once a quote)
        totalQuotes,
        totalAmount: Math.round(totalAmount * 100) / 100,
        // Outstanding = still need to convert
        outstandingCount,
        outstandingAmount: Math.round(outstandingAmount * 100) / 100,
        // Converted = became sales orders
        convertedCount,
        convertedAmount: Math.round(convertedAmount * 100) / 100,
      });
    } catch (error) {
      console.error("Quotes sent analytics error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch quotes data", details: errorMessage });
    }
  });

  // Sales Analytics - Conversion Rate (Quotes to Sales Orders)
  app.get("/api/analytics/conversion-rate", isAuthenticated, async (req: any, res) => {
    try {
      const { period = 'month', year = '2026', month, quarter } = req.query;
      const yearNum = parseInt(year);
      
      let startDate: string, endDate: string;
      let periodLabel: string;
      
      if (period === 'month' && month) {
        const monthNum = parseInt(month);
        startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${lastDay}`;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        periodLabel = `${monthNames[monthNum - 1]} ${yearNum}`;
      } else if (period === 'quarter' && quarter) {
        const q = parseInt(quarter);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = q * 3;
        startDate = `${yearNum}-${String(startMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, endMonth, 0).getDate();
        endDate = `${yearNum}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
        periodLabel = `Q${q} ${yearNum}`;
      } else {
        startDate = `${yearNum}-01-01`;
        endDate = `${yearNum}-12-31`;
        periodLabel = `${yearNum}`;
      }
      
      // Get all sale orders created in the period (quotes sent = draft + sent)
      const allQuotes = await odooClient.searchRead('sale.order', [
        ['date_order', '>=', startDate],
        ['date_order', '<=', endDate],
      ], ['id', 'name', 'amount_total', 'state', 'date_order'], { limit: 10000 });
      
      // Count quotes sent (draft or sent state means it's still a quote)
      // But for conversion, we need quotes that were created in period
      // and then confirmed. Let's get confirmed orders too.
      const quotesSent = allQuotes.filter((o: any) => ['draft', 'sent'].includes(o.state));
      const ordersConfirmed = allQuotes.filter((o: any) => ['sale', 'done'].includes(o.state));
      
      const quotesSentCount = quotesSent.length;
      const quotesSentAmount = quotesSent.reduce((sum: number, q: any) => sum + (q.amount_total || 0), 0);
      const ordersConfirmedCount = ordersConfirmed.length;
      const ordersConfirmedAmount = ordersConfirmed.reduce((sum: number, o: any) => sum + (o.amount_total || 0), 0);
      
      // Conversion rate = confirmed / (quotes + confirmed) since confirmed ones were once quotes
      const totalCreated = quotesSentCount + ordersConfirmedCount;
      const conversionRate = totalCreated > 0 
        ? ((ordersConfirmedCount / totalCreated) * 100) 
        : 0;
      
      res.json({
        success: true,
        period,
        periodLabel,
        year: yearNum,
        month: month ? parseInt(month) : null,
        quarter: quarter ? parseInt(quarter) : null,
        startDate,
        endDate,
        quotesSent: quotesSentCount,
        quotesSentAmount: Math.round(quotesSentAmount * 100) / 100,
        ordersConfirmed: ordersConfirmedCount,
        ordersConfirmedAmount: Math.round(ordersConfirmedAmount * 100) / 100,
        conversionRate: Math.round(conversionRate * 10) / 10,
      });
    } catch (error) {
      console.error("Conversion rate analytics error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch conversion data", details: errorMessage });
    }
  });

  // Get all approved users (for sales rep selection)
  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      // Exclude info@4sgraphics.com (duplicate Aneesh Prabhu - use aneesh@4sgraphics.com instead)
      const approvedUsers = allUsers
        .filter(u => u.status === 'approved' && u.email !== 'info@4sgraphics.com')
        .map(u => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
        }));
      res.json(approvedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch users", details: errorMessage });
    }
  });

  // Unified sales reps endpoint - single source of truth for all sales rep dropdowns
  let salesRepsCache: { data: Array<{ id: string; name: string; email: string }>; timestamp: number } | null = null;
  let salesRepsRefreshing = false;
  const SALES_REPS_CACHE_TTL = 30 * 60 * 1000; // 30 min TTL

  async function refreshSalesRepsCache() {
    if (salesRepsRefreshing) return;
    salesRepsRefreshing = true;
    try {
      let odooSalesReps: Array<{ id: string; name: string; email: string }> = [];
      try {
        const users = await odooClient.getUsers();
        // Only return the 3 known 4S Graphics sales reps by their Odoo IDs.
        // This prevents external contacts, test users, and other Odoo internal
        // users from appearing in the sales rep dropdown across the app.
        const KNOWN_REP_IDS = new Set(['26', '27', '28']);
        const CANONICAL_NAMES: Record<string, string> = {
          '26': 'Aneesh Prabhu',
          '27': 'Patricio Delgado',
          '28': 'Santiago Castellanos',
        };
        odooSalesReps = users
          .filter(u => KNOWN_REP_IDS.has(String(u.id)))
          .map(u => ({
            id: String(u.id),
            name: CANONICAL_NAMES[String(u.id)] || u.name,
            email: u.email || ''
          }));
        console.log(`[Sales Reps] Loaded ${odooSalesReps.length} sales reps from Odoo`);
      } catch (odooError) {
        console.log("[Sales Reps] Odoo unavailable, falling back to local users");
      }
      if (odooSalesReps.length > 0) {
        salesRepsCache = { data: odooSalesReps.sort((a, b) => a.name.localeCompare(b.name)), timestamp: Date.now() };
        return;
      }
      const allUsers = await storage.getAllUsers();
      // Restrict local fallback to only the 3 known reps by email
      const KNOWN_REP_EMAILS = new Set([
        'aneesh@4sgraphics.com',
        'patricio@4sgraphics.com',
        'santiago@4sgraphics.com'
      ]);
      const salesReps = allUsers
        .filter(u => KNOWN_REP_EMAILS.has(u.email?.toLowerCase() || ''))
        .map(u => ({
          id: u.id,
          name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email.split('@')[0],
          email: u.email
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      salesRepsCache = { data: salesReps, timestamp: Date.now() };
    } catch (err) {
      console.error("[Sales Reps] Background refresh failed:", err);
    } finally {
      salesRepsRefreshing = false;
    }
  }

  // Warm the cache immediately at startup; if Odoo is unavailable, retry once after 20s
  let _startupCacheFromLocal = false;
  refreshSalesRepsCache().then(() => {
    // If we fell back to local users (no Odoo), schedule a retry
    const hasOdooUsers = salesRepsCache?.data.some(r => /^\d+$/.test(r.id)); // Odoo IDs are numeric
    if (!hasOdooUsers) {
      _startupCacheFromLocal = true;
      setTimeout(() => {
        console.log('[Sales Reps] Startup retry — attempting Odoo connection again...');
        salesRepsCache = null; // Force fresh fetch
        refreshSalesRepsCache().catch(() => {});
      }, 20000);
    }
  }).catch(() => {});

  app.get("/api/sales-reps", isAuthenticated, async (req: any, res) => {
    try {
      const isStale = !salesRepsCache || (Date.now() - salesRepsCache.timestamp > SALES_REPS_CACHE_TTL);
      // If we have cached data (even stale), return it immediately and refresh in background
      if (salesRepsCache) {
        if (isStale) refreshSalesRepsCache().catch(() => {});
        return res.json(salesRepsCache.data);
      }
      // No cache at all — wait for fresh data (first startup)
      await refreshSalesRepsCache();
      res.json(salesRepsCache?.data ?? []);
    } catch (error) {
      console.error("Error fetching sales reps:", error);
      res.status(500).json({ error: "Failed to fetch sales reps" });
    }
  });

  // Usage/Cost indicator for admins - shows database size and resource usage
  app.get("/api/dashboard/usage", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      // Get database size info
      const dbSizeResult = await db.execute(sql`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as db_size,
          pg_database_size(current_database()) as db_size_bytes
      `);
      
      // Get table sizes
      const tableSizesResult = await db.execute(sql`
        SELECT 
          relname as table_name,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_total_relation_size(relid) as size_bytes
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 10
      `);
      
      // Get record counts
      const customerCount = await storage.getCustomerCount();
      const productCount = await storage.getProductsCount();
      const quoteCount = await storage.getSentQuotesCount();
      
      // Get activity log count (estimated to be fast)
      const activityResult = await db.execute(sql`
        SELECT reltuples::bigint as estimate FROM pg_class WHERE relname = 'activity_logs'
      `);
      const activityLogCount = activityResult.rows[0]?.estimate || 0;
      
      res.json({
        database: {
          size: dbSizeResult.rows[0]?.db_size || 'Unknown',
          sizeBytes: parseInt(dbSizeResult.rows[0]?.db_size_bytes as string) || 0,
          tables: tableSizesResult.rows
        },
        records: {
          customers: customerCount,
          products: productCount,
          quotes: quoteCount,
          activityLogs: activityLogCount
        },
        limits: {
          dbMaxSize: '1 GB', // Neon free tier
          dbMaxSizeBytes: 1073741824
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Usage stats error:", error);
      res.status(500).json({ error: "Failed to fetch usage statistics" });
    }
  });

  // API Cost tracking for admins - shows spending on OpenAI and other APIs
  app.get("/api/dashboard/api-costs", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { days = '30' } = req.query;
      const daysNum = parseInt(days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      
      // Get total costs by operation
      const costsByOperation = await db.execute(sql`
        SELECT 
          operation,
          function_name,
          COUNT(*) as call_count,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(estimated_cost::numeric) as total_cost,
          AVG(request_duration_ms) as avg_duration_ms
        FROM api_cost_logs
        WHERE created_at >= ${startDate}
        GROUP BY operation, function_name
        ORDER BY total_cost DESC
      `);
      
      // Get daily costs for chart
      const dailyCosts = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          api_provider,
          SUM(estimated_cost::numeric) as daily_cost,
          COUNT(*) as call_count
        FROM api_cost_logs
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at), api_provider
        ORDER BY date DESC
      `);
      
      // Get total summary
      const totalSummary = await db.execute(sql`
        SELECT 
          SUM(estimated_cost::numeric) as total_cost,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          COUNT(*) as total_calls,
          AVG(request_duration_ms) as avg_duration_ms
        FROM api_cost_logs
        WHERE created_at >= ${startDate}
      `);
      
      // Get costs by model
      const costsByModel = await db.execute(sql`
        SELECT 
          model,
          COUNT(*) as call_count,
          SUM(estimated_cost::numeric) as total_cost
        FROM api_cost_logs
        WHERE created_at >= ${startDate} AND model IS NOT NULL
        GROUP BY model
        ORDER BY total_cost DESC
      `);
      
      res.json({
        summary: {
          totalCost: parseFloat(totalSummary.rows[0]?.total_cost || '0'),
          totalCalls: parseInt(totalSummary.rows[0]?.total_calls || '0'),
          totalInputTokens: parseInt(totalSummary.rows[0]?.total_input_tokens || '0'),
          totalOutputTokens: parseInt(totalSummary.rows[0]?.total_output_tokens || '0'),
          avgDurationMs: Math.round(parseFloat(totalSummary.rows[0]?.avg_duration_ms || '0')),
          periodDays: daysNum,
        },
        byOperation: costsByOperation.rows,
        byModel: costsByModel.rows,
        daily: dailyCosts.rows,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("API costs error:", error);
      res.status(500).json({ error: "Failed to fetch API cost statistics" });
    }
  });

  // Critical clients to work on today - AI-guided daily focus
  app.get("/api/dashboard/critical-clients", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user?.email;
      const userId = req.user?.id;
      const userRole = req.user?.role;
      // Treat both admin and manager as privileged users who can see all customers
      const isPrivileged = userRole === 'admin' || userRole === 'manager';
      
      // Get user's Odoo ID for territory matching (some customers use Odoo IDs, others use internal IDs)
      const [currentUser] = await db
        .select({ odooUserId: users.odooUserId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const odooUserId = currentUser?.odooUserId?.toString() || '';
      
      // Get all relevant data for scoring
      const [pendingTasks, todayTasks, overdueTasks, customers] = await Promise.all([
        storage.getPendingFollowUpTasks(),
        storage.getTodayFollowUpTasks(),
        storage.getOverdueFollowUpTasks(),
        storage.getAllCustomers()
      ]);
      
      // Combine all tasks for processing (they may overlap but that's ok)
      const allTasks = [...pendingTasks, ...todayTasks, ...overdueTasks];
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Score each customer based on multiple signals
      const customerScores: Array<{
        customerId: string;
        displayName: string;
        score: number;
        reasonCode: string;
        reasonText: string;
        recommendedAction: string;
        priority: 'critical' | 'high' | 'medium';
      }> = [];
      
      // Build a map of customer tasks (dedupe by task id)
      const taskMap = new Map<number, typeof allTasks[0]>();
      for (const task of allTasks) {
        if (task.status !== 'completed' && !taskMap.has(task.id)) {
          taskMap.set(task.id, task);
        }
      }
      
      const customerTaskMap = new Map<string, typeof allTasks>();
      for (const task of taskMap.values()) {
        const tasks = customerTaskMap.get(task.customerId) || [];
        tasks.push(task);
        customerTaskMap.set(task.customerId, tasks);
      }
      
      for (const customer of customers) {
        // Filter by sales rep assignment (unless admin/manager)
        // Check against user ID, email, and Odoo user ID for compatibility
        if (!isPrivileged && customer.salesRepId) {
          const isAssignedToMe = customer.salesRepId === userId || customer.salesRepId === userEmail || customer.salesRepId === odooUserId;
          if (!isAssignedToMe) {
            continue;
          }
        }
        
        let score = 0;
        let reasonCode = '';
        let reasonText = '';
        let recommendedAction = '';
        let priority: 'critical' | 'high' | 'medium' = 'medium';
        
        const tasks = customerTaskMap.get(customer.id) || [];
        const displayName = customer.company || 
          `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 
          customer.email || customer.id;
        
        // 1. High-priority overdue tasks (critical - highest score)
        const overdueTasks = tasks.filter(t => {
          const dueDate = new Date(t.dueDate);
          return dueDate < today && t.priority === 'high';
        });
        if (overdueTasks.length > 0) {
          score += 100 + (overdueTasks.length * 10);
          reasonCode = 'overdue_high_priority';
          reasonText = `${overdueTasks.length} overdue high-priority task${overdueTasks.length > 1 ? 's' : ''}`;
          recommendedAction = 'Complete overdue tasks';
          priority = 'critical';
        }
        
        // 2. Any overdue tasks (high score)
        const anyOverdueTasks = tasks.filter(t => new Date(t.dueDate) < today);
        if (!reasonCode && anyOverdueTasks.length > 0) {
          score += 80 + (anyOverdueTasks.length * 5);
          reasonCode = 'overdue_tasks';
          reasonText = `${anyOverdueTasks.length} overdue task${anyOverdueTasks.length > 1 ? 's' : ''}`;
          recommendedAction = 'Follow up on pending tasks';
          priority = 'high';
        }
        
        // 3. Hot prospect without recent activity (high score)
        if (!reasonCode && customer.isHotProspect) {
          score += 70;
          reasonCode = 'hot_prospect';
          reasonText = 'Hot prospect - prioritize engagement';
          recommendedAction = 'Reach out to close deal';
          priority = 'high';
        }
        
        // 4. Tasks due today (medium-high score)
        const todayTasks = tasks.filter(t => {
          const dueDate = new Date(t.dueDate);
          return dueDate.toDateString() === today.toDateString();
        });
        if (!reasonCode && todayTasks.length > 0) {
          score += 60 + (todayTasks.length * 5);
          reasonCode = 'tasks_due_today';
          reasonText = `${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} due today`;
          recommendedAction = 'Complete scheduled follow-ups';
          priority = 'medium';
        }
        
        // 5. Missing required info (pricing tier or sales rep) - score 40
        const hasSalesRep = customer.salesRepId || customer.salesRepName;
        if (!reasonCode && (!customer.pricingTier || !hasSalesRep)) {
          score += 40;
          reasonCode = 'missing_required';
          const missing = [];
          if (!customer.pricingTier) missing.push('pricing tier');
          if (!hasSalesRep) missing.push('sales rep');
          reasonText = `Missing ${missing.join(' and ')}`;
          recommendedAction = 'Update customer profile';
          priority = 'medium';
        }
        
        // 6. Missing contact info (address, phone) - score 30
        const hasPhone = customer.phone || customer.phone2 || customer.cell || customer.defaultAddressPhone;
        const hasAddress = customer.address1 && customer.city;
        if (!reasonCode && (!hasPhone || !hasAddress)) {
          score += 30;
          reasonCode = 'missing_contact';
          const missing = [];
          if (!hasPhone) missing.push('phone');
          if (!hasAddress) missing.push('address');
          reasonText = `Missing ${missing.join(' and ')}`;
          recommendedAction = 'Complete contact info';
          priority = 'medium';
        }
        
        // 7. Missing tags/enrichment - score 25
        if (!reasonCode && !customer.tags) {
          score += 25;
          reasonCode = 'missing_tags';
          reasonText = 'No tags assigned';
          recommendedAction = 'Add customer tags';
          priority = 'medium';
        }
        
        // Only include customers with a reason
        if (reasonCode) {
          customerScores.push({
            customerId: customer.id,
            displayName,
            score,
            reasonCode,
            reasonText,
            recommendedAction,
            priority
          });
        }
      }
      
      // Sort by score (highest first) and take top 5
      let topClients = customerScores
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      
      // CRITICAL: Always ensure at least 5 recommendations
      // If we don't have enough, add data hygiene fallbacks for any customer
      if (topClients.length < 5) {
        const usedCustomerIds = new Set(topClients.map(c => c.customerId));
        const hygieneRecommendations: typeof topClients = [];
        
        // Get customers not already in the list for hygiene tasks
        // PRIORITY: First show user's assigned customers, then company-wide tasks
        
        // Step 1: Get remaining customers assigned to this user (or all if privileged)
        const myCustomers = customers.filter(c => {
          if (usedCustomerIds.has(c.id)) return false;
          if (!isPrivileged) {
            const isAssignedToMe = c.salesRepId === userId || c.salesRepId === userEmail || c.salesRepId === odooUserId;
            if (!isAssignedToMe) return false;
          }
          return true;
        });
        
        // Step 2: Get unassigned/team customers (only used if we need more tasks)
        const teamCustomers = customers.filter(c => {
          if (usedCustomerIds.has(c.id)) return false;
          const isUnassigned = !c.salesRepId || c.salesRepId.trim() === '';
          return isUnassigned;
        });
        
        // Combine: user's customers first, then team opportunities
        const availableCustomers = [...myCustomers, ...teamCustomers];
        
        // Shuffle for variety each day, but deterministic by date
        const todayStr = today.toISOString().split('T')[0];
        const shuffledCustomers = availableCustomers.sort((a, b) => {
          const hashA = (a.id + todayStr).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const hashB = (b.id + todayStr).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          return hashA - hashB;
        });
        
        for (const customer of shuffledCustomers) {
          if (topClients.length + hygieneRecommendations.length >= 5) break;
          
          const displayName = customer.company || 
            `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 
            customer.email || customer.id;
          
          // Check for data hygiene opportunities in priority order
          let reasonCode = '';
          let reasonText = '';
          let recommendedAction = '';
          
          // Check various hygiene issues and outreach opportunities
          const isUnassigned = !customer.salesRepId || customer.salesRepId.trim() === '';
          const isMyCustomer = !isPrivileged && (customer.salesRepId === userId || customer.salesRepId === userEmail || customer.salesRepId === odooUserId);
          const hasPhone = customer.phone || customer.phone2 || customer.cell || customer.defaultAddressPhone;
          const hasAddress = customer.address1 && customer.city;
          
          // Build list of possible tasks, prioritizing hygiene issues first
          const taskTypes = [];
          
          // For unassigned customers, the main task is to claim them
          if (isUnassigned) {
            taskTypes.push({ code: 'team_opportunity', text: 'Unassigned - available to claim', action: 'Claim this customer' });
          }
          
          // Data hygiene tasks (for any customer)
          if (!customer.pricingTier) {
            taskTypes.push({ code: 'hygiene_pricing_tier', text: 'Missing pricing tier', action: 'Assign a pricing tier' });
          }
          if (!hasPhone) {
            taskTypes.push({ code: 'hygiene_phone', text: 'Missing phone number', action: 'Add contact phone number' });
          }
          if (!hasAddress) {
            taskTypes.push({ code: 'hygiene_address', text: 'Incomplete address', action: 'Complete mailing address' });
          }
          if (!customer.email) {
            taskTypes.push({ code: 'hygiene_email', text: 'Missing email address', action: 'Add email for communication' });
          }
          
          // Outreach tasks - always available for any customer (lower priority)
          taskTypes.push({ code: 'outreach_sample', text: 'Sample opportunity', action: 'Send product samples' });
          taskTypes.push({ code: 'outreach_swatchbook', text: 'SwatchBook opportunity', action: 'Send a SwatchBook' });
          taskTypes.push({ code: 'engage_customer', text: 'Customer engagement opportunity', action: 'Schedule a check-in call' });
          
          // Pick the first available task type for this customer
          if (taskTypes.length > 0) {
            const task = taskTypes[0];
            reasonCode = task.code;
            reasonText = task.text;
            recommendedAction = task.action;
          } else {
            // Fallback
            reasonCode = 'engage_customer';
            reasonText = 'Customer review opportunity';
            recommendedAction = 'Check in with customer';
          }
          
          hygieneRecommendations.push({
            customerId: customer.id,
            displayName,
            score: 10, // Low score for hygiene items
            reasonCode,
            reasonText,
            recommendedAction,
            priority: 'medium' as const
          });
        }
        
        topClients = [...topClients, ...hygieneRecommendations];
      }
      
      // If STILL not enough (e.g., user has very few customers), show generic recommendations
      if (topClients.length < 5) {
        const genericRecommendations = [
          { reasonCode: 'action_import', reasonText: 'Build your customer base', recommendedAction: 'Import customers from CSV' },
          { reasonCode: 'action_prospect', reasonText: 'Find new opportunities', recommendedAction: 'Add new prospects' },
          { reasonCode: 'action_campaign', reasonText: 'Boost engagement', recommendedAction: 'Create email campaign' },
          { reasonCode: 'action_quotes', reasonText: 'Drive revenue', recommendedAction: 'Send new quotes' },
          { reasonCode: 'action_samples', reasonText: 'Convert prospects', recommendedAction: 'Schedule sample sends' }
        ];
        
        let idx = 0;
        while (topClients.length < 5 && idx < genericRecommendations.length) {
          const rec = genericRecommendations[idx];
          topClients.push({
            customerId: 'system-action-' + idx,
            displayName: 'System Action',
            score: 5,
            reasonCode: rec.reasonCode,
            reasonText: rec.reasonText,
            recommendedAction: rec.recommendedAction,
            priority: 'medium'
          });
          idx++;
        }
      }
      
      res.json(topClients);
    } catch (error) {
      console.error("Critical clients error:", error);
      res.status(500).json({ error: "Failed to fetch critical clients" });
    }
  });

  // --- Health check (for debugging connectivity quickly) ---
  app.get('/api/health', (_req, res) => {
    res.json({ 
      ok: true, 
      env: process.env.NODE_ENV, 
      time: new Date().toISOString(),
      version: "2.0.0",
      database: "connected",
      cache: cache.size
    });
  });

  // =============================================
  // LABEL PRINTING ROUTES
  // =============================================

  // Print address label - creates record and returns PDF
  app.post("/api/labels/print", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userName = req.user?.firstName && req.user?.lastName 
        ? `${req.user.firstName} ${req.user.lastName}` 
        : req.user?.email || 'Unknown';

      // Validate request body - either customerId or leadId
      const schema = z.object({
        customerId: z.string().optional(),
        leadId: z.number().optional(),
        labelType: z.enum(['swatch_book', 'press_test_kit', 'mailer', 'other']),
        otherDescription: z.string().optional(),
        quantity: z.number().int().positive().default(1),
        notes: z.string().optional(),
      }).refine(data => data.customerId || data.leadId, {
        message: "Either customerId or leadId is required"
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { customerId, leadId, labelType, otherDescription, quantity, notes } = parsed.data;

      // Get address info from customer or lead
      let recipientName: string;
      let addressData: {
        address1?: string;
        address2?: string;
        city?: string;
        province?: string;
        country?: string;
        zip?: string;
      };
      let finalCustomerId = customerId;

      if (leadId) {
        // Get lead for address info
        const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
        if (!lead) {
          return res.status(404).json({ error: "Lead not found" });
        }
        recipientName = lead.name || lead.company || 'Lead';
        addressData = {
          address1: lead.street || '',
          address2: lead.street2 || '',
          city: lead.city || '',
          province: lead.state || '',
          country: lead.country || '',
          zip: lead.zip || '',
        };
        finalCustomerId = `lead-${leadId}`;
      } else if (customerId) {
        // Get customer for address info
        const customer = await storage.getCustomer(customerId);
        if (!customer) {
          return res.status(404).json({ error: "Customer not found" });
        }
        recipientName = customer.company || 
          `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 
          'Customer';
        addressData = {
          address1: customer.address1 || '',
          address2: customer.address2 || '',
          city: customer.city || '',
          province: customer.province || '',
          country: customer.country || '',
          zip: customer.zip || '',
        };
        finalCustomerId = customerId;
      } else {
        return res.status(400).json({ error: "Either customerId or leadId is required" });
      }

      // Create label print record
      const [labelPrint] = await db.insert(labelPrints).values({
        customerId: finalCustomerId,
        labelType,
        otherDescription: labelType === 'other' ? otherDescription : null,
        quantity,
        addressLine1: addressData.address1 || '',
        addressLine2: addressData.address2 || '',
        city: addressData.city || '',
        province: addressData.province || '',
        country: addressData.country || '',
        postalCode: addressData.zip || '',
        printedByUserId: userId,
        printedByUserName: userName,
        notes,
      }).returning();

      // Generate 4"x3" thermal label PDF (288x216 points = 4"x3" at 72dpi)
      const doc = new PDFDocument({
        size: [288, 216], // 4" x 3" at 72 DPI
        margins: { top: 18, bottom: 18, left: 18, right: 18 }
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      
      const pdfPromise = new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });

      // Label type header (small text at top)
      const labelTypeDisplay = LABEL_TYPE_LABELS[labelType as keyof typeof LABEL_TYPE_LABELS] || labelType;
      doc.fontSize(8)
         .fillColor('#666666')
         .text(labelTypeDisplay.toUpperCase(), { align: 'right' });

      doc.moveDown(0.5);

      // Recipient name (larger, bold)
      doc.fontSize(14)
         .fillColor('#000000')
         .font('Helvetica-Bold')
         .text(recipientName.toUpperCase(), { align: 'left' });

      doc.moveDown(0.3);

      // Address lines
      doc.fontSize(11)
         .font('Helvetica');

      if (addressData.address1) {
        doc.text(addressData.address1.toUpperCase());
      }
      if (addressData.address2) {
        doc.text(addressData.address2.toUpperCase());
      }

      // City, Province/State, Postal Code
      const cityLine = [
        addressData.city,
        addressData.province,
        addressData.zip
      ].filter(Boolean).join(', ').toUpperCase();
      
      if (cityLine) {
        doc.text(cityLine);
      }

      // Country (if not USA/Canada)
      if (addressData.country && !['US', 'USA', 'CA', 'CAN', 'Canada', 'United States'].includes(addressData.country)) {
        doc.text(addressData.country.toUpperCase());
      }

      doc.end();
      const pdfBuffer = await pdfPromise;

      if (leadId) {
        try {
          await db.insert(leadActivities).values({
            leadId,
            activityType: 'sample_sent',
            summary: `Printed ${labelTypeDisplay} label (x${quantity})`,
            details: notes || null,
            performedBy: userId,
            performedByName: userName,
          });
          // If this is a mailer label, increment mailerSentCount and update lastMailerSentAt
          if (labelType === 'mailer') {
            await db.update(leads)
              .set({
                mailerSentCount: sql`COALESCE(${leads.mailerSentCount}, 0) + 1`,
                lastMailerSentAt: new Date(),
                lastMailerType: labelTypeDisplay,
                salesKanbanStage: 'samples_requested',
              })
              .where(eq(leads.id, leadId));
          }
        } catch (actErr) {
          console.error("[Label Print] Failed to log lead activity:", actErr);
        }
      } else if (customerId) {
        try {
          const eventType = ['swatch_book', 'press_test_kit'].includes(labelType) ? 'sample_shipped' : 'product_info_shared';
          await db.insert(customerActivityEvents).values({
            customerId,
            eventType,
            title: `${labelTypeDisplay} label printed (x${quantity})`,
            description: notes || null,
            sourceType: 'auto',
            sourceId: String(labelPrint.id),
            sourceTable: 'label_prints',
            createdBy: userId,
            createdByName: userName,
            eventDate: new Date(),
          });
        } catch (actErr) {
          console.error("[Label Print] Failed to log customer activity:", actErr);
        }
      }

      // Return success with PDF as base64
      res.json({
        success: true,
        labelPrint,
        pdf: pdfBuffer.toString('base64'),
        message: `Label printed for ${recipientName}`
      });

    } catch (error) {
      console.error("Label print error:", error);
      res.status(500).json({ error: "Failed to print label" });
    }
  });

  // Check for mailer conflicts before batch printing
  app.post("/api/labels/check-mailer-conflicts", isAuthenticated, async (req, res) => {
    try {
      const { mailerId, mailerName, addresses } = req.body as {
        mailerId?: number | null;
        mailerName?: string | null;
        addresses: { customerId?: string; leadId?: number; name?: string }[];
      };

      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const sameMailer: { name: string; sentDate: string; entityType: string }[] = [];
      const tooRecent: { name: string; lastMailerDate: string; daysAgo: number; entityType: string }[] = [];

      for (const addr of addresses) {
        if (addr.customerId) {
          // Check same mailer already sent (by mailerId stored in metadata)
          if (mailerId) {
            const existing = await db
              .select({ eventDate: customerActivityEvents.eventDate, title: customerActivityEvents.title })
              .from(customerActivityEvents)
              .where(and(
                eq(customerActivityEvents.customerId, addr.customerId),
                sql`${customerActivityEvents.metadata}->>'mailerId' = ${String(mailerId)}`
              ))
              .orderBy(asc(customerActivityEvents.eventDate))
              .limit(1);
            if (existing.length > 0) {
              sameMailer.push({
                name: addr.name || addr.customerId,
                sentDate: existing[0].eventDate?.toISOString() || '',
                entityType: 'customer',
              });
              continue; // already in sameMailer, skip tooRecent check
            }
          }
          // Check any mailer within 10 days
          const recentMailer = await db
            .select({ eventDate: customerActivityEvents.eventDate })
            .from(customerActivityEvents)
            .where(and(
              eq(customerActivityEvents.customerId, addr.customerId),
              eq(customerActivityEvents.eventType, 'product_info_shared'),
              gte(customerActivityEvents.eventDate, tenDaysAgo)
            ))
            .orderBy(desc(customerActivityEvents.eventDate))
            .limit(1);
          if (recentMailer.length > 0) {
            const sentDate = new Date(recentMailer[0].eventDate!);
            const daysAgo = Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
            tooRecent.push({
              name: addr.name || addr.customerId,
              lastMailerDate: sentDate.toISOString(),
              daysAgo,
              entityType: 'customer',
            });
          }
        } else if (addr.leadId) {
          // Check same mailer already sent to lead (by summary text)
          if (mailerName) {
            const existing = await db
              .select({ createdAt: leadActivities.createdAt })
              .from(leadActivities)
              .where(and(
                eq(leadActivities.leadId, addr.leadId),
                sql`${leadActivities.summary} ILIKE ${'%' + mailerName + '%'}`
              ))
              .orderBy(asc(leadActivities.createdAt))
              .limit(1);
            if (existing.length > 0) {
              sameMailer.push({
                name: addr.name || `Lead #${addr.leadId}`,
                sentDate: existing[0].createdAt?.toISOString() || '',
                entityType: 'lead',
              });
              continue;
            }
          }
          // Check any mailer within 10 days for lead
          const recentLeadMailer = await db
            .select({ createdAt: leadActivities.createdAt })
            .from(leadActivities)
            .where(and(
              eq(leadActivities.leadId, addr.leadId),
              eq(leadActivities.activityType, 'sample_sent'),
              gte(leadActivities.createdAt, tenDaysAgo)
            ))
            .orderBy(desc(leadActivities.createdAt))
            .limit(1);
          if (recentLeadMailer.length > 0) {
            const sentDate = new Date(recentLeadMailer[0].createdAt!);
            const daysAgo = Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
            tooRecent.push({
              name: addr.name || `Lead #${addr.leadId}`,
              lastMailerDate: sentDate.toISOString(),
              daysAgo,
              entityType: 'lead',
            });
          }
        }
      }

      res.json({
        sameMailer,
        tooRecent,
        totalConflicts: sameMailer.length + tooRecent.length,
      });
    } catch (error) {
      console.error("Error checking mailer conflicts:", error);
      res.status(500).json({ error: "Failed to check conflicts" });
    }
  });

  app.post("/api/labels/print-batch", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userName = req.user?.firstName && req.user?.lastName 
        ? `${req.user.firstName} ${req.user.lastName}` 
        : req.user?.email || 'Unknown';

      const schema = z.object({
        labelType: z.enum(['swatch_book', 'press_test_kit', 'mailer', 'letter', 'other']),
        labelFormat: z.enum(['thermal_4x6', 'letter_30up']).optional().default('thermal_4x6'),
        otherDescription: z.string().optional(),
        mailerId: z.number().optional(), // ID of the mailer type selected (when labelType === 'mailer')
        addresses: z.array(z.object({
          customerId: z.string().optional(),
          leadId: z.number().optional(),
        })).min(1, "At least 1 address required"),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { labelType, labelFormat, otherDescription, mailerId, addresses } = parsed.data;
      let labelTypeDisplay = LABEL_TYPE_LABELS[labelType as keyof typeof LABEL_TYPE_LABELS] || labelType;
      
      // Look up mailer type details if a mailer is selected
      let mailerInfo: { id: number; name: string; thumbnailPath: string } | null = null;
      if (labelType === 'mailer' && mailerId) {
        const [mt] = await db.select().from(mailerTypes).where(eq(mailerTypes.id, mailerId)).limit(1);
        if (mt) {
          mailerInfo = { id: mt.id, name: mt.name, thumbnailPath: mt.thumbnailPath };
          labelTypeDisplay = mt.name; // Use specific mailer name in logs
        }
      }

      interface ResolvedAddress {
        contactName: string;
        companyName: string;
        address1: string;
        address2: string;
        cityStateZip: string;
        customerId?: string;
        leadId?: number;
      }

      const resolved: ResolvedAddress[] = [];

      for (const addr of addresses) {
        if (addr.leadId) {
          const [lead] = await db.select().from(leads).where(eq(leads.id, addr.leadId));
          if (!lead) continue;
          const contactName = lead.primaryContactName || lead.name || '';
          const companyName = lead.company || '';
          resolved.push({
            contactName,
            companyName: companyName !== contactName ? companyName : '',
            address1: lead.street || '',
            address2: lead.street2 || '',
            cityStateZip: [lead.city, lead.state, lead.zip].filter(Boolean).join(', '),
            leadId: addr.leadId,
          });
        } else if (addr.customerId) {
          const customer = await storage.getCustomer(addr.customerId);
          if (!customer) continue;
          const firstName = customer.firstName || '';
          const lastName = customer.lastName || '';
          const contactName = [firstName, lastName].filter(Boolean).join(' ');
          const companyName = customer.company || '';
          resolved.push({
            contactName: contactName || companyName,
            companyName: contactName && companyName && contactName !== companyName ? companyName : '',
            address1: customer.address1 || '',
            address2: customer.address2 || '',
            cityStateZip: [customer.city, customer.province, customer.zip].filter(Boolean).join(', '),
            customerId: addr.customerId,
          });
        }
      }

      if (resolved.length < 1) {
        return res.status(400).json({ error: "No valid addresses found." });
      }

      const chunks: Buffer[] = [];
      let totalPages: number;
      let pdfBuffer: Buffer;

      if (labelFormat === 'letter_30up') {
        // Avery 5160/5260 compatible: 8.5" × 11" letter, 3 columns × 10 rows = 30 labels
        // Label: 2.625" × 1" (189 × 72 pts), gaps: 0.125" (9 pts) between cols, ~0" between rows
        // Margins: top 0.5" (36), left ~0.1875" (13.5), bottom 0.5" (36)
        const pageW = 612; // 8.5"
        const pageH = 792; // 11"
        const labelsPerPage = 30;
        const cols = 3;
        const rows = 10;
        const labelW = 189; // 2.625"
        const labelH = 72;  // 1"
        const topMargin = 36;
        const leftMargin = 13.5;
        const colGap = 9;   // 0.125" between columns
        const rowGap = 0;
        const innerPadX = 5;
        const innerPadY = 6;

        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          autoFirstPage: false,
        });
        doc.on('data', (chunk) => chunks.push(chunk));
        const pdfPromise = new Promise<Buffer>((resolve) => {
          doc.on('end', () => resolve(Buffer.concat(chunks)));
        });

        totalPages = Math.ceil(resolved.length / labelsPerPage);

        for (let page = 0; page < totalPages; page++) {
          doc.addPage({ size: 'LETTER', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
          const pageAddresses = resolved.slice(page * labelsPerPage, (page + 1) * labelsPerPage);

          for (let i = 0; i < pageAddresses.length; i++) {
            const addr = pageAddresses[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = leftMargin + col * (labelW + colGap);
            const yTop = topMargin + row * (labelH + rowGap);

            let y = yTop + innerPadY;
            const maxW = labelW - innerPadX * 2;

            if (addr.contactName) {
              doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000')
                 .text(addr.contactName.toUpperCase(), x + innerPadX, y, { width: maxW, lineBreak: false, ellipsis: true });
              y += 9;
            }
            if (addr.companyName) {
              doc.fontSize(6.5).font('Helvetica').fillColor('#000000')
                 .text(addr.companyName.toUpperCase(), x + innerPadX, y, { width: maxW, lineBreak: false, ellipsis: true });
              y += 8.5;
            }
            if (addr.address1) {
              doc.fontSize(6.5).font('Helvetica').fillColor('#000000')
                 .text(addr.address1.toUpperCase(), x + innerPadX, y, { width: maxW, lineBreak: false, ellipsis: true });
              y += 8.5;
            }
            if (addr.address2) {
              doc.fontSize(6.5).font('Helvetica').fillColor('#000000')
                 .text(addr.address2.toUpperCase(), x + innerPadX, y, { width: maxW, lineBreak: false, ellipsis: true });
              y += 8.5;
            }
            if (addr.cityStateZip) {
              doc.fontSize(6.5).font('Helvetica').fillColor('#000000')
                 .text(addr.cityStateZip.toUpperCase(), x + innerPadX, y, { width: maxW, lineBreak: false, ellipsis: true });
            }
          }
        }

        doc.end();
        pdfBuffer = await pdfPromise;

      } else {
        // 4"x6" thermal at 72 DPI = 288x432 points
        const pageWidth = 288;
        const pageHeight = 432;
        const labelsPerPage = 4;
        const labelHeight = pageHeight / labelsPerPage;
        const margin = 14;

        const doc = new PDFDocument({
          size: [pageWidth, pageHeight],
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          autoFirstPage: false,
        });
        doc.on('data', (chunk) => chunks.push(chunk));
        const pdfPromise = new Promise<Buffer>((resolve) => {
          doc.on('end', () => resolve(Buffer.concat(chunks)));
        });

        totalPages = Math.ceil(resolved.length / labelsPerPage);

        for (let page = 0; page < totalPages; page++) {
          doc.addPage({ size: [pageWidth, pageHeight], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
          const pageAddresses = resolved.slice(page * labelsPerPage, (page + 1) * labelsPerPage);

          for (let i = 0; i < pageAddresses.length; i++) {
            const addr = pageAddresses[i];
            const yStart = i * labelHeight;

            if (i > 0) {
              doc.save();
              doc.strokeColor('#999999').lineWidth(0.5).dash(4, { space: 3 });
              doc.moveTo(0, yStart).lineTo(pageWidth, yStart).stroke();
              doc.restore();
            }

            let y = yStart + margin;

            if (addr.contactName) {
              doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
                 .text(addr.contactName.toUpperCase(), margin, y, { width: pageWidth - margin * 2 });
              y += 14;
            }
            if (addr.companyName) {
              doc.fontSize(9).font('Helvetica').fillColor('#000000')
                 .text(addr.companyName.toUpperCase(), margin, y, { width: pageWidth - margin * 2 });
              y += 12;
            }
            if (addr.address1) {
              doc.fontSize(9).font('Helvetica').fillColor('#000000')
                 .text(addr.address1.toUpperCase(), margin, y, { width: pageWidth - margin * 2 });
              y += 12;
            }
            if (addr.address2) {
              doc.fontSize(9).font('Helvetica').fillColor('#000000')
                 .text(addr.address2.toUpperCase(), margin, y, { width: pageWidth - margin * 2 });
              y += 12;
            }
            if (addr.cityStateZip) {
              doc.fontSize(9).font('Helvetica').fillColor('#000000')
                 .text(addr.cityStateZip.toUpperCase(), margin, y, { width: pageWidth - margin * 2 });
            }
          }
        }

        doc.end();
        pdfBuffer = await pdfPromise;
      }

      // Log activity and create label print records for each address
      for (const addr of resolved) {
        try {
          const finalCustomerId = addr.leadId ? `lead-${addr.leadId}` : addr.customerId!;
          const isBulk = resolved.length > 1;
          const bulkNote = isBulk ? `Bulk label (${resolved.length} labels in batch)` : null;
          await db.insert(labelPrints).values({
            customerId: finalCustomerId,
            labelType,
            otherDescription: labelType === 'other' ? (otherDescription || null) : null,
            quantity: 1,
            addressLine1: addr.address1,
            addressLine2: addr.address2,
            city: addr.cityStateZip.split(',')[0]?.trim() || '',
            province: '',
            country: '',
            postalCode: '',
            printedByUserId: userId,
            printedByUserName: userName,
            notes: bulkNote,
          });

          const activityTitle = labelType === 'mailer' && mailerInfo
            ? `Mailer Sent: ${mailerInfo.name}`
            : labelType === 'swatch_book' ? 'Swatch Book Sent'
            : labelType === 'press_test_kit' ? 'Press Test Kit Sent'
            : labelType === 'letter' ? 'Letter Sent'
            : `${labelTypeDisplay} Sent`;
          
          if (addr.leadId) {
            await db.insert(leadActivities).values({
              leadId: addr.leadId,
              activityType: 'sample_sent',
              summary: activityTitle,
              details: bulkNote,
              performedBy: userId,
              performedByName: userName,
            });
            if (labelType === 'mailer') {
              await db.update(leads)
                .set({
                  mailerSentCount: sql`COALESCE(${leads.mailerSentCount}, 0) + 1`,
                  lastMailerSentAt: new Date(),
                  lastMailerType: labelTypeDisplay,
                  salesKanbanStage: 'samples_requested',
                })
                .where(eq(leads.id, addr.leadId));
            }
          } else if (addr.customerId) {
            const eventType = ['swatch_book', 'press_test_kit'].includes(labelType) ? 'sample_shipped' : 'product_info_shared';
            const metadata: Record<string, any> = {};
            if (mailerInfo) {
              metadata.mailerId = mailerInfo.id;
              metadata.mailerName = mailerInfo.name;
              metadata.thumbnailPath = mailerInfo.thumbnailPath;
            }
            await db.insert(customerActivityEvents).values({
              customerId: addr.customerId,
              eventType,
              title: activityTitle,
              description: bulkNote,
              sourceType: 'auto',
              sourceId: finalCustomerId,
              sourceTable: 'label_prints',
              createdBy: userId,
              createdByName: userName,
              eventDate: new Date(),
              metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
          }
        } catch (actErr) {
          console.error("[Batch Label] Failed to log activity:", actErr);
        }
      }

      res.json({
        success: true,
        pdf: pdfBuffer.toString('base64'),
        message: `${resolved.length} labels printed on ${totalPages} page(s)`,
        count: resolved.length,
      });

    } catch (error) {
      console.error("Batch label print error:", error);
      res.status(500).json({ error: "Failed to print labels" });
    }
  });

  // ── Domain Integrity Endpoints ──────────────────────────────────────────────

  const GENERIC_EMAIL_DOMAINS = new Set([
    'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
    'aol.com','live.com','me.com','mac.com','googlemail.com',
    'protonmail.com','proton.me','ymail.com','msn.com','hotmail.es',
    'yahoo.es','live.com.mx','comcast.net','att.net','verizon.net',
  ]);

  function extractDomain(email: string | null | undefined): string | null {
    if (!email) return null;
    const idx = email.lastIndexOf('@');
    if (idx === -1) return null;
    return email.slice(idx + 1).toLowerCase().trim();
  }




  // Returns all contact IDs with unacknowledged domain mismatches (for contacts list badges)

  // Get label stats for a customer

  // Get sales wins - Shopify orders that came after first email sent from this app
  app.get("/api/dashboard/sales-wins", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email || req.user?.id;
      const { period } = req.query;
      
      // Get date range filter
      const now = new Date();
      let dateFilter = new Date(now.getFullYear(), now.getMonth(), 1); // default: this month
      if (period === 'week') {
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === 'quarter') {
        dateFilter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      } else if (period === 'year') {
        dateFilter = new Date(now.getFullYear(), 0, 1);
      } else if (period === 'all') {
        dateFilter = new Date(2020, 0, 1);
      }

      // Find all email sends grouped by customer with their earliest send date
      const firstEmailsByCustomer = await db
        .select({
          customerId: emailSends.customerId,
          firstEmailAt: sql<Date>`MIN(${emailSends.sentAt})`,
          sentBy: sql<string>`(array_agg(${emailSends.sentBy} ORDER BY ${emailSends.sentAt} ASC))[1]`,
        })
        .from(emailSends)
        .where(and(
          isNotNull(emailSends.customerId),
          eq(emailSends.status, 'sent')
        ))
        .groupBy(emailSends.customerId);

      if (firstEmailsByCustomer.length === 0) {
        return res.json({ wins: [], totalWins: 0, totalRevenue: 0, myWins: 0, myRevenue: 0 });
      }

      // Get all matched Shopify orders in the date range
      const orders = await db.select({
        id: shopifyOrders.id,
        orderNumber: shopifyOrders.orderNumber,
        customerId: shopifyOrders.customerId,
        customerName: shopifyOrders.customerName,
        companyName: shopifyOrders.companyName,
        totalPrice: shopifyOrders.totalPrice,
        shopifyCreatedAt: shopifyOrders.shopifyCreatedAt,
        financialStatus: shopifyOrders.financialStatus,
      })
        .from(shopifyOrders)
        .where(and(
          isNotNull(shopifyOrders.customerId),
          gte(shopifyOrders.shopifyCreatedAt, dateFilter)
        ))
        .orderBy(desc(shopifyOrders.shopifyCreatedAt));

      // Match orders to first emails - an order is a "win" if it came after the first email
      const emailMap = new Map(firstEmailsByCustomer.map(e => [e.customerId, e]));
      
      const wins = [];
      let totalRevenue = 0;
      let myWins = 0;
      let myRevenue = 0;

      for (const order of orders) {
        const emailData = emailMap.get(order.customerId);
        if (emailData && order.shopifyCreatedAt && new Date(order.shopifyCreatedAt) > new Date(emailData.firstEmailAt)) {
          const price = parseFloat(order.totalPrice || '0');
          const win = {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.companyName || order.customerName || 'Unknown',
            totalPrice: price,
            orderDate: order.shopifyCreatedAt,
            firstEmailDate: emailData.firstEmailAt,
            attributedTo: emailData.sentBy,
            financialStatus: order.financialStatus,
          };
          wins.push(win);
          totalRevenue += price;
          
          if (emailData.sentBy === userId) {
            myWins++;
            myRevenue += price;
          }
        }
      }

      res.json({
        wins: wins.slice(0, 50),
        totalWins: wins.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        myWins,
        myRevenue: Math.round(myRevenue * 100) / 100,
      });
    } catch (error) {
      console.error("Error fetching sales wins:", error);
      res.status(500).json({ error: "Failed to fetch sales wins" });
    }
  });

  // Get recent wins for dashboard - up to 3 wins with step summaries
  app.get("/api/dashboard/recent-wins", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.email || req.user?.id;

      // Try this week first, fall back to last 30 days
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Find all email sends grouped by customer (need firstEmailDate for win detection)
      const firstEmailsByCustomer = await db
        .select({
          customerId: emailSends.customerId,
          firstEmailAt: sql<Date>`MIN(${emailSends.sentAt})`,
          sentBy: sql<string>`(array_agg(${emailSends.sentBy} ORDER BY ${emailSends.sentAt} ASC))[1]`,
        })
        .from(emailSends)
        .where(and(isNotNull(emailSends.customerId), eq(emailSends.status, 'sent')))
        .groupBy(emailSends.customerId);

      if (firstEmailsByCustomer.length === 0) {
        return res.json({ wins: [], period: 'week' });
      }

      const emailMap = new Map(firstEmailsByCustomer.map(e => [e.customerId, e]));

      const findWins = async (since: Date) => {
        const orders = await db.select({
          id: shopifyOrders.id,
          orderNumber: shopifyOrders.orderNumber,
          customerId: shopifyOrders.customerId,
          customerName: shopifyOrders.customerName,
          companyName: shopifyOrders.companyName,
          totalPrice: shopifyOrders.totalPrice,
          shopifyCreatedAt: shopifyOrders.shopifyCreatedAt,
        })
          .from(shopifyOrders)
          .where(and(isNotNull(shopifyOrders.customerId), gte(shopifyOrders.shopifyCreatedAt, since)))
          .orderBy(desc(shopifyOrders.shopifyCreatedAt));

        const wins: any[] = [];
        for (const order of orders) {
          if (wins.length >= 3) break;
          const emailData = emailMap.get(order.customerId!);
          if (!emailData || !order.shopifyCreatedAt) continue;
          if (new Date(order.shopifyCreatedAt) <= new Date(emailData.firstEmailAt)) continue;

          const orderDate = new Date(order.shopifyCreatedAt);
          const firstTouchDate = new Date(emailData.firstEmailAt);
          const daysToWin = Math.round((orderDate.getTime() - firstTouchDate.getTime()) / (1000 * 60 * 60 * 24));

          // Get customer info for linking
          const custRows = await db.select({
            odooPartnerId: customers.odooPartnerId,
            firstName: customers.firstName,
            lastName: customers.lastName,
            company: customers.company,
          }).from(customers).where(eq(customers.id, order.customerId!)).limit(1);
          const cust = custRows[0];

          // Step summary: emails
          const emailCountRows = await db.select({ count: sql<number>`COUNT(*)` })
            .from(emailSends)
            .where(and(
              eq(emailSends.customerId, order.customerId!),
              eq(emailSends.status, 'sent'),
              lte(emailSends.sentAt, orderDate)
            ));
          const emailCount = Number(emailCountRows[0]?.count || 0);

          // Step summary: label prints grouped by type
          const labelRows = await db.select({
            labelType: labelPrints.labelType,
            count: sql<number>`COUNT(*)`,
          })
            .from(labelPrints)
            .where(and(
              eq(labelPrints.customerId, order.customerId!),
              lte(labelPrints.createdAt, orderDate)
            ))
            .groupBy(labelPrints.labelType);

          // Step summary: activity events grouped by type
          const activityRows = await db.select({
            eventType: customerActivityEvents.eventType,
            count: sql<number>`COUNT(*)`,
          })
            .from(customerActivityEvents)
            .where(and(
              eq(customerActivityEvents.customerId, order.customerId!),
              lte(customerActivityEvents.eventDate, orderDate)
            ))
            .groupBy(customerActivityEvents.eventType);

          const labelCounts: Record<string, number> = {};
          for (const l of labelRows) {
            labelCounts[l.labelType] = Number(l.count);
          }
          const activityCounts: Record<string, number> = {};
          for (const a of activityRows) {
            activityCounts[a.eventType] = Number(a.count);
          }

          // Get rep display name from users table
          const repEmail = emailData.sentBy;
          const repRows = await db.select({ firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(eq(users.email, repEmail))
            .limit(1);
          const repName = repRows[0]
            ? [repRows[0].firstName, repRows[0].lastName].filter(Boolean).join(' ') || repEmail?.split('@')[0]
            : repEmail?.split('@')[0] || 'Team';

          wins.push({
            customerId: order.customerId,
            odooPartnerId: cust?.odooPartnerId || null,
            companyName: order.companyName || order.customerName || cust?.company || 'Unknown',
            orderNumber: order.orderNumber,
            totalPrice: parseFloat(order.totalPrice || '0'),
            orderDate: order.shopifyCreatedAt,
            daysToWin,
            attributedTo: repEmail,
            attributedToName: repName,
            stepSummary: {
              emails: emailCount,
              swatchBooks: labelCounts['swatch_book'] || 0,
              pressTestKits: labelCounts['press_test_kit'] || 0,
              mailers: (labelCounts['mailer'] || 0) + (labelCounts['letter'] || 0),
              calls: activityCounts['call_made'] || 0,
              quotes: activityCounts['quote_sent'] || 0,
              samples: (activityCounts['sample_shipped'] || 0) + (activityCounts['sample_delivered'] || 0),
            },
          });
        }
        return wins;
      };

      let wins = await findWins(weekAgo);
      let period = 'week';
      if (wins.length === 0) {
        wins = await findWins(monthAgo);
        period = 'month';
      }

      res.json({ wins, period });
    } catch (error) {
      console.error("Error fetching recent wins:", error);
      res.status(500).json({ error: "Failed to fetch recent wins" });
    }
  });

  // Get win path for a customer - timeline of interactions leading to a Shopify order

  // Get team-wide label stats for dashboard
  app.get("/api/dashboard/label-stats", isAuthenticated, async (req: any, res) => {
    try {
      // Get totals by label type across all customers (all-time)
      const stats = await db.select({
        labelType: labelPrints.labelType,
        count: sql<number>`COUNT(*)::int`,
        totalQuantity: sql<number>`SUM(${labelPrints.quantity})::int`,
      })
      .from(labelPrints)
      .groupBy(labelPrints.labelType);

      // Get this-month totals by label type
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthStats = await db.select({
        labelType: labelPrints.labelType,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(labelPrints)
      .where(gte(labelPrints.createdAt, monthStart))
      .groupBy(labelPrints.labelType);

      // Get totals by user (who printed the most)
      const byUser = await db.select({
        userId: labelPrints.printedByUserId,
        userName: labelPrints.printedByUserName,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(labelPrints)
      .groupBy(labelPrints.printedByUserId, labelPrints.printedByUserName)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(5);

      // Get recent prints
      const recentPrints = await db.select({
        id: labelPrints.id,
        labelType: labelPrints.labelType,
        customerId: labelPrints.customerId,
        printedByUserName: labelPrints.printedByUserName,
        createdAt: labelPrints.createdAt,
      })
      .from(labelPrints)
      .orderBy(desc(labelPrints.createdAt))
      .limit(10);

      // Calculate totals
      const grandTotal = stats.reduce((sum, s) => sum + (s.count || 0), 0);
      const thisMonthTotal = thisMonthStats.reduce((sum, s) => sum + (s.count || 0), 0);

      // Last day of current month for deadline display
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthName = now.toLocaleDateString('en-US', { month: 'long' });
      const deadline = `${monthName} ${lastDay.getDate()}, ${lastDay.getFullYear()}`;

      res.json({
        stats: stats.map(s => ({
          labelType: s.labelType,
          label: LABEL_TYPE_LABELS[s.labelType as keyof typeof LABEL_TYPE_LABELS] || s.labelType,
          count: s.count || 0,
          totalQuantity: s.totalQuantity || 0,
        })),
        thisMonthStats: thisMonthStats.map(s => ({
          labelType: s.labelType,
          label: LABEL_TYPE_LABELS[s.labelType as keyof typeof LABEL_TYPE_LABELS] || s.labelType,
          count: s.count || 0,
        })),
        thisMonthTotal,
        deadline,
        byUser,
        recentPrints,
        grandTotal
      });
    } catch (error) {
      console.error("Dashboard label stats error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard label stats" });
    }
  });

  // Get all outbound marketing kits with customer details for table display
  app.get("/api/dashboard/outbound-kits", isAuthenticated, async (req: any, res) => {
    try {
      // Get all label prints with customer name joined
      const kits = await db.select({
        id: labelPrints.id,
        labelType: labelPrints.labelType,
        otherDescription: labelPrints.otherDescription,
        quantity: labelPrints.quantity,
        customerId: labelPrints.customerId,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerEmail: customers.email,
        city: labelPrints.city,
        province: labelPrints.province,
        country: labelPrints.country,
        printedByUserName: labelPrints.printedByUserName,
        createdAt: labelPrints.createdAt,
      })
      .from(labelPrints)
      .leftJoin(customers, eq(labelPrints.customerId, customers.id))
      .orderBy(desc(labelPrints.createdAt));

      res.json({
        kits: kits.map(k => ({
          id: k.id,
          labelType: k.labelType,
          labelTypeDisplay: LABEL_TYPE_LABELS[k.labelType as keyof typeof LABEL_TYPE_LABELS] || k.labelType,
          otherDescription: k.otherDescription,
          quantity: k.quantity,
          customerId: k.customerId,
          customerName: [k.customerFirstName, k.customerLastName].filter(Boolean).join(' ') || 'Unknown',
          customerEmail: k.customerEmail || '',
          location: [k.city, k.province, k.country].filter(Boolean).join(', ') || 'N/A',
          printedBy: k.printedByUserName || 'Unknown',
          createdAt: k.createdAt,
        }))
      });
    } catch (error) {
      console.error("Outbound kits error:", error);
      res.status(500).json({ error: "Failed to fetch outbound kits" });
    }
  });

  // Get today's label stats for current user (for Spotlight daily goal)
  app.get("/api/labels/today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      // Get start of today (local time)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Count today's swatch_book and press_test_kit prints by this user
      const todayStats = await db.select({
        labelType: labelPrints.labelType,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(labelPrints)
      .where(
        and(
          eq(labelPrints.printedByUserId, userId),
          gte(labelPrints.createdAt, today),
          or(
            eq(labelPrints.labelType, 'swatch_book'),
            eq(labelPrints.labelType, 'press_test_kit')
          )
        )
      )
      .groupBy(labelPrints.labelType);

      const swatchBookCount = todayStats.find(s => s.labelType === 'swatch_book')?.count || 0;
      const pressTestKitCount = todayStats.find(s => s.labelType === 'press_test_kit')?.count || 0;
      const totalKitsSentToday = swatchBookCount + pressTestKitCount;
      const dailyGoal = 5;
      const swatchBookGoal = 3; // Minimum 3 swatchbooks per user per day

      res.json({
        swatchBookCount,
        pressTestKitCount,
        totalKitsSentToday,
        dailyGoal,
        goalMet: totalKitsSentToday >= dailyGoal,
        remaining: Math.max(0, dailyGoal - totalKitsSentToday),
        progress: Math.min(100, (totalKitsSentToday / dailyGoal) * 100),
        // Swatchbook-specific tracking
        swatchBookGoal,
        swatchBookGoalMet: swatchBookCount >= swatchBookGoal,
        swatchBookRemaining: Math.max(0, swatchBookGoal - swatchBookCount),
        swatchBookProgress: Math.min(100, (swatchBookCount / swatchBookGoal) * 100),
      });
    } catch (error) {
      console.error("Today's label stats error:", error);
      res.status(500).json({ error: "Failed to fetch today's label stats" });
    }
  });

  // --- Shared Label Queue (cross-user) ---

  app.get("/api/label-queue", isAuthenticated, async (req: any, res) => {
    try {
      const items = await storage.getLabelQueue();
      if (items.length === 0) return res.json([]);

      // Batch-fetch all addresses in 2 queries instead of N
      const customerIds = items.filter(i => i.customerId).map(i => i.customerId!);
      const leadIds = items.filter(i => i.leadId).map(i => i.leadId!);

      const [customerRows, leadRows] = await Promise.all([
        customerIds.length > 0
          ? db.select({
              id: customers.id, company: customers.company,
              firstName: customers.firstName, lastName: customers.lastName,
              address1: customers.address1, address2: customers.address2,
              city: customers.city, province: customers.province,
              zip: customers.zip, country: customers.country,
            }).from(customers).where(inArray(customers.id, customerIds))
          : Promise.resolve([]),
        leadIds.length > 0
          ? db.select({
              id: leads.id, name: leads.name, company: leads.company,
              street: leads.street, street2: leads.street2,
              city: leads.city, state: leads.state,
              zip: leads.zip, country: leads.country,
            }).from(leads).where(inArray(leads.id, leadIds))
          : Promise.resolve([]),
      ]);

      const customerMap = new Map(customerRows.map(c => [c.id, c]));
      const leadMap = new Map(leadRows.map(l => [l.id, l]));

      const enriched = items.map(item => {
        let address = null;
        if (item.customerId) {
          address = customerMap.get(item.customerId) || null;
        } else if (item.leadId) {
          const lead = leadMap.get(item.leadId);
          if (lead) {
            const nameParts = (lead.name || '').split(' ');
            address = {
              id: `lead-${lead.id}`,
              company: lead.company,
              firstName: nameParts[0] || null,
              lastName: nameParts.slice(1).join(' ') || null,
              address1: lead.street,
              address2: lead.street2,
              city: lead.city,
              province: lead.state,
              zip: lead.zip,
              country: lead.country,
            };
          }
        }
        return { ...item, address };
      });

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching label queue:", error);
      res.status(500).json({ error: "Failed to fetch label queue" });
    }
  });

  app.post("/api/label-queue", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, leadId } = req.body;
      const addedBy = req.user?.email || req.user?.id || 'unknown';
      if (!customerId && !leadId) {
        return res.status(400).json({ error: "customerId or leadId required" });
      }
      const item = await storage.addToLabelQueue(customerId || null, leadId || null, addedBy);
      res.json(item);
    } catch (error) {
      console.error("Error adding to label queue:", error);
      res.status(500).json({ error: "Failed to add to label queue" });
    }
  });

  app.delete("/api/label-queue/clear", isAuthenticated, async (req: any, res) => {
    try {
      await storage.clearLabelQueue();
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing label queue:", error);
      res.status(500).json({ error: "Failed to clear label queue" });
    }
  });

  app.delete("/api/label-queue/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.removeFromLabelQueue(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing from label queue:", error);
      res.status(500).json({ error: "Failed to remove from label queue" });
    }
  });

  // --- Spotlight: Last Week's Outreach Review ---
  // Returns customers who had outbound activities (swatch books, press kits, mailers, samples, quotes)
  // in the past 7 days and need a follow-up call or email.

  // Mark a customer as followed up (called or emailed) — logs a CRM activity event

  // Snooze a customer in outreach-review for 7 days

  // Mark a contact/lead as lost from the outreach review panel

  // --- Today's SPOTLIGHT Progress Bars ---
  // Comprehensive daily progress tracking for SPOTLIGHT UI

  // Get customers worked on today for SPOTLIGHT sidebar navigation

  // ── Improvement 3: Snooze & Outcome Logging ──────────────────────────────

  // POST /api/spotlight/snooze — snooze a customer card with optional outcome tag

  // GET /api/spotlight/snooze/:customerId — check snooze status for a customer

  // ── Improvement 4: Team Visibility & Claiming ─────────────────────────────

  // POST /api/spotlight/claim — claim a customer for 30 days (max 2 renewals)

  // POST /api/spotlight/claim/:customerId/renew — renew a claim for another 30 days (max 2 times)

  // DELETE /api/spotlight/claim/:customerId — release a claim early

  // GET /api/spotlight/claims — get all active claims (for team visibility)


  // GET /api/spotlight/score/:customerId — on-demand score for a single customer

  // GET /api/users/me/spotlight-digest — get digest preference
  app.get("/api/users/me/spotlight-digest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.select({ spotlightDigestEnabled: users.spotlightDigestEnabled }).from(users).where(eq(users.id, userId)).limit(1);
      const enabled = user[0]?.spotlightDigestEnabled ?? true;
      res.json({ spotlightDigestEnabled: enabled });
    } catch (error) {
      console.error("Get digest preference error:", error);
      res.status(500).json({ error: "Failed to get preference" });
    }
  });

  // PATCH /api/users/me/spotlight-digest — toggle digest email preference
  app.patch("/api/users/me/spotlight-digest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: "enabled must be boolean" });

      await db.update(users).set({ spotlightDigestEnabled: enabled }).where(eq(users.id, userId));
      res.json({ success: true, spotlightDigestEnabled: enabled });
    } catch (error) {
      console.error("Toggle digest error:", error);
      res.status(500).json({ error: "Failed to update preference" });
    }
  });

  // POST /api/admin/spotlight/digest/send — manually trigger the digest for one or all users (admin only)

  // --- Comprehensive diagnostics endpoint ---
  app.get('/api/diagnostics', isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const diagnostics: any = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version
        },
        env_vars: {
          DATABASE_URL: process.env.DATABASE_URL ? '✓ Set' : '✗ Missing',
          REPL_ID: process.env.REPL_ID ? '✓ Set' : '✗ Missing',
          REPL_SLUG: process.env.REPL_SLUG ? '✓ Set' : '✗ Missing',
          NODE_ENV: process.env.NODE_ENV || 'not set',
        },
        database: {
          connected: false,
          error: null as string | null
        },
        api_endpoints: {
          '/api/product-pricing-database': 'unknown',
          '/api/customers': 'unknown',
          '/api/auth/user': 'unknown'
        }
      };

      // Test database connection
      try {
        const pricingData = await storage.getAllProductPricingMaster();
        diagnostics.database.connected = true;
        diagnostics.database.rowCount = pricingData.length;
        diagnostics.api_endpoints['/api/product-pricing-database'] = `✓ Working (${pricingData.length} items)`;
      } catch (dbError) {
        diagnostics.database.connected = false;
        diagnostics.database.error = dbError instanceof Error ? dbError.message : String(dbError);
        diagnostics.api_endpoints['/api/product-pricing-database'] = `✗ Error: ${dbError instanceof Error ? dbError.message : String(dbError)}`;
      }

      res.json({
        status: diagnostics.database.connected ? 'healthy' : 'degraded',
        diagnostics
      });
    } catch (error) {
      console.error('Diagnostics endpoint error:', error);
      res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Auth routes (setupAuth already called earlier in this function)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      // Development bypass for testing using config
      if (APP_CONFIG.DEV_MODE) {
        return res.json({
          email: process.env.DEV_USER_EMAIL || "test@4sgraphics.com",
          role: process.env.DEV_USER_ROLE || "admin",
          status: 'approved'
        });
      }
      
      // Check if user is authenticated before accessing req.user
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Safely access user claims - support both new sessions (claims.sub) and legacy (id)
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!userId) {
        console.log('[Auth] /api/auth/user - Invalid session: no userId found', {
          hasClaims: !!req.user?.claims,
          hasId: !!req.user?.id
        });
        return res.status(401).json({ message: "Invalid session" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      debugLog("User data from storage:", user);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: "Failed to fetch user", details: errorMessage });
    }
  });

  // User management endpoints (Admin only)
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/admin/users/:userId/approve', requireAdmin, async (req: any, res) => {
    try {
      const originalUserId = req.params.userId;
      const userId = decodeURIComponent(originalUserId);
      const adminId = 'dev-admin-123'; // Development fallback
      
      debugLog('Approve user request:', { originalUserId, userId, adminId });
      
      const user = await storage.approveUser(userId, adminId);
      if (!user) {
        debugLog('User not found for approval:', userId);
        return res.status(404).json({ message: "User not found" });
      }
      
      debugLog('User approval successful:', user);
      res.json(user);
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  app.post('/api/admin/users/:userId/reject', requireAdmin, async (req: any, res) => {
    try {
      const userId = decodeURIComponent(req.params.userId);
      const adminId = 'dev-admin-123'; // Development fallback
      
      const user = await storage.rejectUser(userId, adminId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error rejecting user:", error);
      res.status(500).json({ message: "Failed to reject user" });
    }
  });

  // Support both :userId and :id patterns for compatibility
  app.patch('/api/admin/users/:userId/role', requireAdmin, async (req: any, res) => {
    try {
      const userId = decodeURIComponent(req.params.userId);
      const { role } = req.body;
      
      if (!role || !['user', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'user', 'manager', or 'admin'" });
      }
      
      const user = await storage.changeUserRole(userId, role);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update user role" });
    }
  });

  // Update user's allowed pricing tiers
  app.patch('/api/admin/users/:userId/allowed-tiers', requireAdmin, async (req: any, res) => {
    try {
      const userId = decodeURIComponent(req.params.userId);
      const { allowedTiers } = req.body;
      
      // Validate allowedTiers is null or an array of valid tier keys (must match quote-calculator keys)
      const validTiers = [
        'landedPrice', 'exportPrice', 'masterDistributorPrice', 'dealerPrice', 'dealer2Price',
        'approvalNeededPrice', 'tierStage25Price', 'tierStage2Price', 'tierStage15Price', 
        'tierStage1Price', 'retailPrice'
      ];
      
      if (allowedTiers !== null && !Array.isArray(allowedTiers)) {
        return res.status(400).json({ message: "allowedTiers must be null or an array of tier keys" });
      }
      
      if (Array.isArray(allowedTiers)) {
        const invalidTiers = allowedTiers.filter((t: string) => !validTiers.includes(t));
        if (invalidTiers.length > 0) {
          return res.status(400).json({ message: `Invalid tier keys: ${invalidTiers.join(', ')}` });
        }
      }
      
      const user = await storage.updateUserAllowedTiers(userId, allowedTiers);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating user allowed tiers:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update user allowed tiers" });
    }
  });

  // Backfill: Propagate pricing tier and sales rep between companies and contacts
  app.post('/api/admin/run-batch-dedup', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { runBatchDedup } = await import("./batch-dedup");
      const result = await runBatchDedup(true);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[Admin] Batch dedup error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/backfill-pricing-propagation', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      console.log("[Backfill] Starting bidirectional pricing tier/sales rep propagation...");
      
      const results = {
        companyToContact: 0,
        contactToCompany: 0,
        errors: 0,
      };
      
      // Step 1: Propagate from companies to contacts
      const companies = await db.select()
        .from(customers)
        .where(eq(customers.isCompany, true));
      
      console.log(`[Backfill] Found ${companies.length} companies to process`);
      
      for (const company of companies) {
        if (!company.pricingTier && !company.salesRepName) continue;
        
        try {
          const childContacts = await db.select()
            .from(customers)
            .where(eq(customers.parentCustomerId, company.id));
          
          for (const child of childContacts) {
            const updates: Record<string, any> = {};
            if (company.pricingTier && !child.pricingTier) {
              updates.pricingTier = company.pricingTier;
            }
            if (company.salesRepName && !child.salesRepName) {
              updates.salesRepName = company.salesRepName;
            }
            if (company.salesRepId && !child.salesRepId) {
              updates.salesRepId = company.salesRepId;
            }
            if (Object.keys(updates).length > 0) {
              await db.update(customers).set(updates).where(eq(customers.id, child.id));
              results.companyToContact++;
            }
          }
        } catch (err) {
          console.error(`[Backfill] Error processing company ${company.id}:`, err);
          results.errors++;
        }
      }
      
      // Step 2: Propagate from contacts to companies (fill missing company data)
      const companiesWithoutData = await db.select()
        .from(customers)
        .where(and(
          eq(customers.isCompany, true),
          sql`(${customers.pricingTier} IS NULL OR ${customers.salesRepName} IS NULL)`
        ));
      
      console.log(`[Backfill] Found ${companiesWithoutData.length} companies with missing data`);
      
      for (const company of companiesWithoutData) {
        try {
          // Find children with data
          const enrichedChildren = await db.select()
            .from(customers)
            .where(and(
              eq(customers.parentCustomerId, company.id),
              sql`(${customers.pricingTier} IS NOT NULL OR ${customers.salesRepName} IS NOT NULL)`
            ))
            .orderBy(desc(customers.updatedAt))
            .limit(1);
          
          if (enrichedChildren.length > 0) {
            const child = enrichedChildren[0];
            const updates: Record<string, any> = {};
            if (!company.pricingTier && child.pricingTier) {
              updates.pricingTier = child.pricingTier;
            }
            if (!company.salesRepName && child.salesRepName) {
              updates.salesRepName = child.salesRepName;
            }
            if (!company.salesRepId && child.salesRepId) {
              updates.salesRepId = child.salesRepId;
            }
            if (Object.keys(updates).length > 0) {
              await db.update(customers).set(updates).where(eq(customers.id, company.id));
              results.contactToCompany++;
            }
          }
        } catch (err) {
          console.error(`[Backfill] Error processing company ${company.id}:`, err);
          results.errors++;
        }
      }
      
      // Clear cache
      setCachedData("customers", null);
      
      console.log(`[Backfill] Complete: ${results.companyToContact} contacts updated, ${results.contactToCompany} companies updated, ${results.errors} errors`);
      
      res.json({
        success: true,
        message: `Propagation complete: ${results.companyToContact} contacts updated from companies, ${results.contactToCompany} companies updated from contacts`,
        results
      });
    } catch (error: any) {
      console.error("[Backfill] Error:", error);
      res.status(500).json({ error: error.message || "Backfill failed" });
    }
  });

  // One-time push: Sync backfilled pricing tiers to Odoo
  app.post('/api/admin/push-pricing-to-odoo', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      console.log("[Odoo Push] Starting one-time push of pricing tiers to Odoo...");
      
      // Get ALL customers with odooPartnerId and pricingTier (companies AND contacts)
      const contactsToSync = await db.select()
        .from(customers)
        .where(and(
          isNotNull(customers.odooPartnerId),
          isNotNull(customers.pricingTier)
        ));
      
      console.log(`[Odoo Push] Found ${contactsToSync.length} contacts with parent companies to sync`);
      
      // Get all Odoo partner categories to map tier names to IDs
      const categories = await odooClient.getPartnerCategories();
      const categoryMap = new Map<string, number>();
      for (const cat of categories) {
        categoryMap.set(cat.name.toUpperCase(), cat.id);
      }
      
      console.log(`[Odoo Push] Loaded ${categories.length} Odoo categories`);
      
      const results = {
        synced: 0,
        skipped: 0,
        errors: 0,
        details: [] as string[],
      };
      
      for (const contact of contactsToSync) {
        if (!contact.pricingTier || !contact.odooPartnerId) {
          results.skipped++;
          continue;
        }
        
        const tierName = contact.pricingTier.toUpperCase();
        const categoryId = categoryMap.get(tierName);
        
        if (!categoryId) {
          console.log(`[Odoo Push] Category not found for tier: ${tierName}`);
          results.skipped++;
          continue;
        }
        
        try {
          // Fetch current partner to preserve existing categories
          const partners = await odooClient.read('res.partner', [contact.odooPartnerId], ['category_id']);
          if (!partners || partners.length === 0) {
            console.log(`[Odoo Push] Partner ${contact.odooPartnerId} not found in Odoo`);
            results.skipped++;
            continue;
          }
          
          const currentCategories = partners[0].category_id || [];
          const categoryIds = currentCategories.map((c: any) => 
            Array.isArray(c) ? c[0] : c
          ).filter((id: number) => typeof id === 'number');
          
          // Add new category if not already present
          if (!categoryIds.includes(categoryId)) {
            categoryIds.push(categoryId);
            
            // Update partner with new categories using special command format
            // [(6, 0, [ids])] replaces all categories
            await odooClient.updatePartner(contact.odooPartnerId, {
              category_id: [[6, 0, categoryIds]]
            });
            
            results.synced++;
            results.details.push(`${contact.company || contact.firstName} ${contact.lastName}: Added ${tierName}`);
            console.log(`[Odoo Push] Updated partner ${contact.odooPartnerId} with tier ${tierName}`);
          } else {
            results.skipped++;
            console.log(`[Odoo Push] Partner ${contact.odooPartnerId} already has tier ${tierName}`);
          }
        } catch (err: any) {
          console.error(`[Odoo Push] Error updating partner ${contact.odooPartnerId}:`, err.message);
          results.errors++;
        }
      }
      
      console.log(`[Odoo Push] Complete: ${results.synced} synced, ${results.skipped} skipped, ${results.errors} errors`);
      
      res.json({
        success: true,
        message: `Pushed ${results.synced} pricing tiers to Odoo`,
        results
      });
    } catch (error: any) {
      console.error("[Odoo Push] Error:", error);
      res.status(500).json({ error: error.message || "Push to Odoo failed" });
    }
  });

  // Bulk-pull pricing tier from Odoo pricelist for customers with no local pricingTier
  // Reads property_product_pricelist from Odoo and seeds the local pricing_tier column.
  app.post('/api/admin/pull-pricing-from-odoo', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      console.log("[Odoo Pull] Starting bulk pricelist pull from Odoo...");
      const candidates = await db.select({
        id: customers.id,
        company: customers.company,
        odooPartnerId: customers.odooPartnerId,
      })
        .from(customers)
        .where(and(
          isNotNull(customers.odooPartnerId),
          sql`(${customers.pricingTier} IS NULL OR ${customers.pricingTier} = '')`
        ));

      console.log(`[Odoo Pull] Found ${candidates.length} customers with null pricingTier and Odoo partner ID`);
      if (candidates.length === 0) {
        return res.json({ updated: 0, skipped: 0, errors: 0, message: "No customers need pricing tier update" });
      }

      const partnerIds = candidates.map(c => c.odooPartnerId as number);
      const partners = await odooClient.searchRead('res.partner', [['id', 'in', partnerIds]], ['id', 'property_product_pricelist'], { limit: partnerIds.length + 10 });

      const pricelistByPartnerId = new Map<number, string>();
      for (const p of partners) {
        if (p.property_product_pricelist && p.property_product_pricelist !== false) {
          const name = (p.property_product_pricelist as [number, string])[1];
          if (name) pricelistByPartnerId.set(p.id, name);
        }
      }

      const results = { updated: 0, skipped: 0, errors: 0 };
      for (const customer of candidates) {
        const pricelist = pricelistByPartnerId.get(customer.odooPartnerId as number);
        if (!pricelist) { results.skipped++; continue; }
        try {
          await db.update(customers).set({ pricingTier: pricelist }).where(eq(customers.id, customer.id));
          console.log(`[Odoo Pull] ${customer.company || customer.id}: set pricingTier = ${pricelist}`);
          results.updated++;
        } catch (err: any) {
          console.error(`[Odoo Pull] Error updating ${customer.id}:`, err.message);
          results.errors++;
        }
      }

      console.log(`[Odoo Pull] Done: ${results.updated} updated, ${results.skipped} skipped (no Odoo pricelist), ${results.errors} errors`);
      res.json({ ...results, message: `Updated ${results.updated} customers from Odoo pricelist` });
    } catch (error: any) {
      console.error("[Odoo Pull] Error:", error);
      res.status(500).json({ error: error.message || "Failed to pull pricing from Odoo" });
    }
  });

  // Auto-assign sales reps based on location rules
  app.post('/api/admin/auto-assign-sales-reps', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      // Get all customers without a sales rep
      const allCustomers = await storage.getCustomers();
      const unassignedCustomers = allCustomers.filter(c => !c.salesRepId || c.salesRepId.trim() === '');
      
      const results = {
        santiago: 0,
        patricio: 0,
        aneesh: 0,
        skipped: 0,
        errors: 0,
      };
      
      for (const customer of unassignedCustomers) {
        try {
          // Use the centralized determineSalesRep function from sales-rep-auto-assign module
          const { determineSalesRep, SALES_REPS } = await import('./sales-rep-auto-assign');
          const assignedRep = determineSalesRep({
            country: customer.country,
            province: customer.province,
          });
          
          // If no match, skip (missing location data)
          if (!assignedRep) {
            results.skipped++;
            continue;
          }
          
          // Track which rep was assigned
          if (assignedRep.name === 'Santiago') results.santiago++;
          else if (assignedRep.name === 'Patricio') results.patricio++;
          else if (assignedRep.name === 'Aneesh') results.aneesh++;
          
          // Update customer with assigned sales rep
          await storage.updateCustomer(customer.id, {
            salesRepId: assignedRep.id,
            salesRepName: assignedRep.name,
          });
          
        } catch (err) {
          console.error(`Error assigning sales rep to customer ${customer.id}:`, err);
          results.errors++;
        }
      }
      
      console.log("Auto-assignment results:", results);
      
      // Clear customer cache
      setCachedData("customers", null);
      
      res.json({
        message: "Sales rep auto-assignment completed",
        totalProcessed: unassignedCustomers.length,
        results,
      });
      
    } catch (error) {
      console.error("Error in auto-assign sales reps:", error);
      res.status(500).json({ error: "Failed to auto-assign sales reps" });
    }
  });

  // ========================================
  // TERRITORY SKIP ADMIN ENDPOINTS
  // ========================================

  // Get customers flagged for admin review (all users marked as "not my territory")
  app.get('/api/admin/territory-skip-flags', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const flags = await db.select({
        id: territorySkipFlags.id,
        customerId: territorySkipFlags.customerId,
        skippedByUsers: territorySkipFlags.skippedByUsers,
        totalActiveUsers: territorySkipFlags.totalActiveUsers,
        flaggedForAdminReview: territorySkipFlags.flaggedForAdminReview,
        adminReviewedAt: territorySkipFlags.adminReviewedAt,
        adminReviewedBy: territorySkipFlags.adminReviewedBy,
        adminDecision: territorySkipFlags.adminDecision,
        createdAt: territorySkipFlags.createdAt,
        customerCompany: customers.company,
        customerEmail: customers.email,
        customerCity: customers.city,
        customerProvince: customers.province,
        customerCountry: customers.country,
      })
      .from(territorySkipFlags)
      .leftJoin(customers, eq(territorySkipFlags.customerId, customers.id))
      .where(eq(territorySkipFlags.flaggedForAdminReview, true))
      .orderBy(desc(territorySkipFlags.createdAt));

      res.json(flags);
    } catch (error) {
      console.error("[Admin] Error fetching territory skip flags:", error);
      res.status(500).json({ error: "Failed to fetch territory skip flags" });
    }
  });

  // Admin decision on territory skip flag
  app.post('/api/admin/territory-skip-flags/:id/decision', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { decision } = req.body; // 'keep', 'delete', 'reassign'
      const adminUserId = req.user?.id;

      if (!['keep', 'delete', 'reassign'].includes(decision)) {
        return res.status(400).json({ error: "Invalid decision. Must be 'keep', 'delete', or 'reassign'" });
      }

      const [flag] = await db.select()
        .from(territorySkipFlags)
        .where(eq(territorySkipFlags.id, parseInt(id)))
        .limit(1);

      if (!flag) {
        return res.status(404).json({ error: "Territory skip flag not found" });
      }

      // Update the flag with admin decision
      await db.update(territorySkipFlags)
        .set({
          adminReviewedAt: new Date(),
          adminReviewedBy: adminUserId,
          adminDecision: decision,
          flaggedForAdminReview: false, // Remove from review queue
          updatedAt: new Date(),
        })
        .where(eq(territorySkipFlags.id, parseInt(id)));

      // If decision is 'delete', actually delete the customer
      if (decision === 'delete' && flag.customerId) {
        const customer = await storage.getCustomer(flag.customerId);
        if (customer) {
          // Record exclusion to prevent re-import
          await db.insert(deletedCustomerExclusions).values({
            odooPartnerId: customer.odooPartnerId || null,
            shopifyCustomerId: null,
            originalCustomerId: flag.customerId,
            companyName: customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
            email: customer.email,
            deletedBy: adminUserId,
            reason: 'Deleted via territory skip admin review - no sales rep claimed territory',
          });
          
          await storage.deleteCustomer(flag.customerId);
          console.log(`[Admin] Customer ${flag.customerId} deleted via territory skip review`);
        }
      }

      res.json({ 
        success: true, 
        decision,
        message: decision === 'delete' 
          ? 'Customer has been deleted and blocked from re-import'
          : decision === 'keep'
            ? 'Customer will be kept and removed from review queue'
            : 'Customer marked for reassignment'
      });
    } catch (error) {
      console.error("[Admin] Error processing territory skip decision:", error);
      res.status(500).json({ error: "Failed to process territory skip decision" });
    }
  });

  // Get count of pending territory skip flags for admin dashboard badge
  app.get('/api/admin/territory-skip-flags/count', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const result = await db.select({ count: count() })
        .from(territorySkipFlags)
        .where(eq(territorySkipFlags.flaggedForAdminReview, true));
      
      res.json({ count: result[0]?.count || 0 });
    } catch (error) {
      console.error("[Admin] Error counting territory skip flags:", error);
      res.status(500).json({ error: "Failed to count territory skip flags" });
    }
  });



  // Get all product categories
  app.get("/api/product-categories", async (req, res) => {
    try {
      const cacheKey = "product-categories";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const categories = await storage.getProductCategories();
      setCachedData(cacheKey, categories);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product categories" });
    }
  });

  // Get all product types
  app.get("/api/product-types", async (req, res) => {
    try {
      const cacheKey = "product-types";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const types = await storage.getProductTypes();
      setCachedData(cacheKey, types);
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product types" });
    }
  });

  // Add a new product category
  app.post("/api/product-categories", requireAdmin, async (req: any, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: "Category name is required" });
      }
      
      const [category] = await db.insert(productCategories).values({ name: name.trim() }).returning();
      setCachedData("product-categories", null); // Clear cache
      res.json(category);
    } catch (error: any) {
      console.error("Error adding category:", error);
      res.status(500).json({ error: error.message || "Failed to add category" });
    }
  });

  // Update a category name
  app.patch("/api/product-categories/:categoryId", requireAdmin, async (req: any, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      if (isNaN(categoryId)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
      
      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: "Category name is required" });
      }
      
      const [updated] = await db.update(productCategories)
        .set({ name: name.trim() })
        .where(eq(productCategories.id, categoryId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Category not found" });
      }
      
      setCachedData("product-categories", null);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: error.message || "Failed to update category" });
    }
  });

  // Add a new product type
  app.post("/api/product-types", requireAdmin, async (req: any, res) => {
    try {
      const { name, categoryId } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: "Type name is required" });
      }
      if (!categoryId || typeof categoryId !== 'number') {
        return res.status(400).json({ error: "Category ID is required" });
      }
      
      const [type] = await db.insert(productTypes).values({ 
        name: name.trim(), 
        categoryId 
      }).returning();
      setCachedData("product-types", null); // Clear cache
      setCachedData(`product-types-${categoryId}`, null); // Clear category-specific cache
      res.json(type);
    } catch (error: any) {
      console.error("Error adding type:", error);
      res.status(500).json({ error: error.message || "Failed to add type" });
    }
  });

  // Update a product type name
  app.patch("/api/product-types/:typeId", requireAdmin, async (req: any, res) => {
    try {
      const typeId = parseInt(req.params.typeId);
      if (isNaN(typeId)) {
        return res.status(400).json({ error: "Invalid type ID" });
      }
      
      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: "Type name is required" });
      }
      
      const [updated] = await db.update(productTypes)
        .set({ name: name.trim() })
        .where(eq(productTypes.id, typeId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Product type not found" });
      }
      
      setCachedData("product-types", null);
      setCachedData(`product-types-${updated.categoryId}`, null);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating product type:", error);
      res.status(500).json({ error: error.message || "Failed to update product type" });
    }
  });

  // Delete a product type
  app.delete("/api/product-types/:typeId", requireAdmin, async (req: any, res) => {
    try {
      const typeId = parseInt(req.params.typeId);
      if (isNaN(typeId)) {
        return res.status(400).json({ error: "Invalid type ID" });
      }
      
      // Check if any products are using this type
      const productsUsingType = await db.select({ id: productPricingMaster.id })
        .from(productPricingMaster)
        .where(eq(productPricingMaster.catalogProductTypeId, typeId))
        .limit(1);
      
      if (productsUsingType.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete type that has products assigned. Merge or reassign products first." 
        });
      }
      
      await db.delete(productTypes).where(eq(productTypes.id, typeId));
      setCachedData("product-types", null);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting type:", error);
      res.status(500).json({ error: error.message || "Failed to delete type" });
    }
  });

  // Merge product types (move all products from source to target, then delete source)
  app.post("/api/product-types/merge", requireAdmin, async (req: any, res) => {
    try {
      const { sourceTypeId, targetTypeId } = req.body;
      
      if (!sourceTypeId || !targetTypeId) {
        return res.status(400).json({ error: "Source and target type IDs are required" });
      }
      
      if (sourceTypeId === targetTypeId) {
        return res.status(400).json({ error: "Source and target cannot be the same" });
      }
      
      // Get target type to verify it exists and get its category
      const [targetType] = await db.select().from(productTypes).where(eq(productTypes.id, targetTypeId));
      if (!targetType) {
        return res.status(404).json({ error: "Target type not found" });
      }
      
      // Update all products from source type to target type
      // Must update BOTH productTypeId AND catalogProductTypeId, plus productType text field
      await db.update(productPricingMaster)
        .set({ 
          productTypeId: targetTypeId,
          catalogProductTypeId: targetTypeId,
          catalogCategoryId: targetType.categoryId,
          productType: targetType.name,
          updatedAt: new Date()
        })
        .where(eq(productPricingMaster.productTypeId, sourceTypeId));
      
      // Also update any products that only have catalogProductTypeId set (edge case)
      await db.update(productPricingMaster)
        .set({ 
          productTypeId: targetTypeId,
          catalogProductTypeId: targetTypeId,
          catalogCategoryId: targetType.categoryId,
          productType: targetType.name,
          updatedAt: new Date()
        })
        .where(eq(productPricingMaster.catalogProductTypeId, sourceTypeId));
      
      // Delete the source type
      await db.delete(productTypes).where(eq(productTypes.id, sourceTypeId));
      
      setCachedData("product-types", null);
      res.json({ success: true, message: "Types merged successfully" });
    } catch (error: any) {
      console.error("Error merging types:", error);
      res.status(500).json({ error: error.message || "Failed to merge types" });
    }
  });

  // Get product types by category
  app.get("/api/product-types/:categoryId", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      if (isNaN(categoryId)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
      
      const cacheKey = `product-types-${categoryId}`;
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const types = await storage.getProductTypesByCategory(categoryId);
      setCachedData(cacheKey, types);
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product types" });
    }
  });

  // Get all product sizes
  app.get("/api/product-sizes", async (req, res) => {
    try {
      const cacheKey = "product-sizes";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const sizes = await storage.getProductSizes();
      setCachedData(cacheKey, sizes);
      res.json(sizes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product sizes" });
    }
  });

  // Get product sizes by type
  app.get("/api/product-sizes/:typeId", async (req, res) => {
    try {
      const typeId = parseInt(req.params.typeId);
      if (isNaN(typeId)) {
        return res.status(400).json({ error: "Invalid type ID" });
      }
      
      const cacheKey = `product-sizes-${typeId}`;
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const sizes = await storage.getProductSizesByType(typeId);
      setCachedData(cacheKey, sizes);
      res.json(sizes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product sizes" });
    }
  });

  // Get all pricing tiers
  app.get("/api/pricing-tiers", async (req, res) => {
    try {
      const cacheKey = "pricing-tiers";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const tiers = await storage.getPricingTiers();
      setCachedData(cacheKey, tiers);
      res.json(tiers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pricing tiers" });
    }
  });

  // Calculate best price to offer for a product + customer combination
  app.post("/api/best-price", isAuthenticated, async (req: any, res) => {
    try {
      const { productId, itemCode, customerId, quantity } = req.body;
      
      if (!productId && !itemCode) {
        return res.status(400).json({ error: "Either productId or itemCode is required", code: "MISSING_PRODUCT" });
      }
      
      const { bestPriceEngine } = await import("./best-price-engine");
      
      const result = await bestPriceEngine.calculateBestPrice({
        productId: productId ? parseInt(productId) : undefined,
        itemCode,
        customerId,
        quantity: quantity ? parseInt(quantity) : undefined,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("[Best Price] Error calculating:", error);
      if (error.message === 'Product not found') {
        return res.status(404).json({ error: "Product not found", code: "PRODUCT_NOT_FOUND" });
      }
      res.status(422).json({ error: error.message || "Failed to calculate best price", code: "CALCULATION_ERROR" });
    }
  });

  // Get all product pricing - maps from pricing_data table to expected format
  app.get("/api/product-pricing", isAuthenticated, async (req, res) => {
    try {
      const cacheKey = "product-pricing";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      // Fetch pricing data from productPricingMaster table
      const pricingData = await storage.getProductPricingMaster();
      const productTypes = await storage.getProductTypes();
      const tiers = await storage.getPricingTiers();
      
      const productPricing = [];
      
      // Map pricing data to legacy ProductPricing format (for backward compatibility)
      for (const data of pricingData) {
        // Find matching product type by name/pattern
        const matchingType = productTypes.find(type => 
          type.name.toLowerCase().includes(data.productType.toLowerCase()) ||
          data.productType.toLowerCase().includes(type.name.toLowerCase())
        );
        
        if (matchingType) {
          // Create pricing entries for each tier with non-zero prices
          const tierColumns = {
            'Export': data.exportPrice,
            'Master Distributor': data.masterDistributorPrice,
            'Dealer': data.dealerPrice,
            'Dealer2': data.dealer2Price,
            'Approval (Retail)': data.approvalNeededPrice,
            'Stage25': data.tierStage25Price,
            'Stage2': data.tierStage2Price,
            'Stage15': data.tierStage15Price,
            'Stage1': data.tierStage1Price,
            'Retail': data.retailPrice
          };
          
          for (const [tierName, price] of Object.entries(tierColumns)) {
            if (price && parseFloat(price.toString()) > 0) {
              const tier = tiers.find(t => t.name === tierName);
              if (tier) {
                productPricing.push({
                  id: productPricing.length + 1,
                  productTypeId: matchingType.id,
                  tierId: tier.id,
                  pricePerSquareMeter: price.toString()
                });
              }
            }
          }
        }
      }
      
      setCachedData(cacheKey, productPricing);
      res.json(productPricing);
    } catch (error) {
      console.error("Error fetching product pricing:", error);
      res.status(500).json({ error: "Failed to fetch product pricing" });
    }
  });

  // Domain contacts lookup — used by Spotlight bounced email to show same-domain contacts
  app.get("/api/contacts/by-domain", isAuthenticated, async (req: any, res) => {
    try {
      const domain = (req.query.domain as string || '').trim().toLowerCase();
      const excludeCustomerId = (req.query.excludeCustomerId as string || '').trim();
      const excludeLeadId = req.query.excludeLeadId ? parseInt(req.query.excludeLeadId as string) : null;
      if (!domain || domain.length < 3) return res.json({ contacts: [] });

      const emailPattern = `%@${domain}`;

      const [customerRows, leadRows] = await Promise.all([
        db.select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          company: customers.company,
          email: customers.email,
          phone: customers.phone,
          salesRepName: customers.salesRepName,
        })
        .from(customers)
        .where(and(
          ilike(customers.email, emailPattern),
          excludeCustomerId ? ne(customers.id, excludeCustomerId) : sql`1=1`,
          eq(customers.doNotContact, false),
        ))
        .limit(8),

        db.select({
          id: leads.id,
          name: leads.name,
          company: leads.company,
          email: leads.email,
          phone: leads.phone,
          salesRepName: leads.salesRepName,
        })
        .from(leads)
        .where(and(
          ilike(leads.email, emailPattern),
          excludeLeadId ? ne(leads.id, excludeLeadId) : sql`1=1`,
        ))
        .limit(8),
      ]);

      const contacts = [
        ...customerRows.map(c => ({
          type: 'customer' as const,
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown',
          company: c.company,
          email: c.email,
          phone: c.phone,
          salesRepName: c.salesRepName,
          href: `/odoo-contacts/${c.id}`,
        })),
        ...leadRows.map(l => ({
          type: 'lead' as const,
          id: String(l.id),
          name: l.name || l.company || 'Unknown',
          company: l.company,
          email: l.email,
          phone: l.phone,
          salesRepName: l.salesRepName,
          href: `/leads/${l.id}`,
        })),
      ];

      res.json({ contacts, domain });
    } catch (err: any) {
      console.error('[by-domain] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Customer management routes
  // Live customer count endpoint with data quality stats


  // NOTE: Customer creation route with full validation is defined later (line ~2268)
  // This simple version removed to prevent route conflicts.


  
  // Product management routes
  app.put("/api/product-sizes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const sizeId = parseInt(req.params.id);
      const sizeData = req.body;

      if (isNaN(sizeId)) {
        return res.status(400).json({ error: "Invalid product size ID" });
      }

      // Check if user is admin
      const userRole = req.user?.claims?.email === "aneesh@4sgraphics.com" || req.user?.claims?.email === "oscar@4sgraphics.com" ? "admin" : "user";
      if (userRole !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const updatedSize = await storage.updateProductSize(sizeId, sizeData);
      
      if (!updatedSize) {
        return res.status(404).json({ error: "Product size not found" });
      }
      
      // Clear cache to ensure fresh data
      setCachedData("product-sizes", null);
      
      // Save updated data to file
      await saveProductDataToFile();
      
      res.json(updatedSize);
    } catch (error) {
      console.error("Error updating product size:", error);
      res.status(500).json({ error: "Failed to update product size" });
    }
  });

  // Save current product data to CSV file

  // Get product pricing by type ID
  app.get("/api/product-pricing/:typeId", async (req, res) => {
    try {
      const typeId = parseInt(req.params.typeId);
      if (isNaN(typeId)) {
        return res.status(400).json({ error: "Invalid type ID" });
      }
      
      // Legacy method removed, return empty array for backward compatibility
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product pricing" });
    }
  });


  // Get all customers
  // Note: /api/customers endpoint is defined earlier with caching support

  // Get quote counts per customer email

  // Get price list counts per customer ID

  // Customer health check — returns companies that haven't been contacted recently

  // Get customer by ID

  // Lightweight navigation endpoint - returns only prev/next company IDs

  // Customer overview endpoint - bundled data for first paint (reduces API chattiness)

  // Customer Trust Metrics - aggregated stats for Trust Level card

  // Create new customer (Admin only)

  // NOTE: Primary customer update route is defined earlier (line ~1919) which handles pricing tier sync.
  // This duplicate route was removed to prevent Express routing conflicts.

  // Update customer sales rep assignment (dedicated endpoint to avoid overwriting other fields)

  // Delete customer (Admin only)

  // Merge customers (All authenticated users)

  // Mark customers as "Do Not Merge" - they are separate entities

  // Bulk update customers (Admin only) - for updating Pricing Tier and Sales Rep on multiple customers

  // Configure multer for CSV/Excel file uploads
  const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
      console.log(`File upload check: ${file.originalname}, mimetype: ${file.mimetype}`);
      // Accept CSV and Excel files
      const isCSV = file.originalname.toLowerCase().endsWith('.csv') || 
          file.mimetype === 'text/csv' || 
          file.mimetype === 'application/csv' ||
          file.mimetype === 'text/plain';
      
      const isExcel = file.originalname.toLowerCase().endsWith('.xlsx') ||
          file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/vnd.ms-excel';
      
      if (isCSV || isExcel) {
        cb(null, true);
      } else {
        console.log(`File rejected: ${file.originalname} with mimetype ${file.mimetype}`);
        cb(new Error('Only CSV and Excel (.xlsx) files are allowed'));
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });

  // Configure multer for image uploads (logos)
  const imageUpload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
      console.log(`Image upload check: ${file.originalname}, mimetype: ${file.mimetype}`);
      const isImage = file.mimetype.startsWith('image/') || 
          file.originalname.toLowerCase().endsWith('.png') ||
          file.originalname.toLowerCase().endsWith('.jpg') ||
          file.originalname.toLowerCase().endsWith('.jpeg');
      
      if (isImage) {
        cb(null, true);
      } else {
        console.log(`Image rejected: ${file.originalname} with mimetype ${file.mimetype}`);
        cb(new Error('Only image files (PNG, JPG) are allowed'));
      }
    },
    limits: {
      fileSize: 2 * 1024 * 1024 // 2MB limit for logos
    }
  });

  // Screenshot import - AI-powered contact extraction from screenshots
  const screenshotUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
  });


  // File Upload Tracking routes
  app.get("/api/file-uploads/:fileType", isAuthenticated, async (req: any, res) => {
    try {
      const fileType = req.params.fileType;
      const activeFile = await storage.getActiveFileUpload(fileType);
      res.json(activeFile);
    } catch (error) {
      console.error("Error fetching file upload data:", error);
      res.status(500).json({ error: "Failed to fetch file upload data" });
    }
  });

  // Upload product data file

  // Upload pricing data file

  // Upload customer data file (Admin only)

  // Upload Odoo Excel file (Admin only)

  // Cleanup contacts deleted from Odoo: compares local customers against live Odoo partner list

  // NOTE: Pricing data routes with auth are defined later (line ~5233)
  // These simple versions removed to prevent route conflicts and ensure auth.

  // Export pricing data as CSV
  app.get("/api/pricing-data/export", isAuthenticated, async (req, res) => {
    try {
      const pricingData = await storage.getProductPricingMaster();
      
      // Create CSV headers matching original format
      const headers = [
        'productId',
        'productType', 
        'EXPORT_pricePerSqm',
        'MASTER_DISTRIBUTOR_pricePerSqm',
        'DEALER_pricePerSqm',
        'DEALER_2_pricePerSqm',
        'Approval_Retail__pricePerSqm',
        'Stage25_pricePerSqm',
        'Stage2_pricePerSqm',
        'Stage15_pricePerSqm',
        'Stage1_pricePerSqm',
        'Retail_pricePerSqm'
      ];
      
      // Convert data to CSV format
      const csvRows = pricingData.map(entry => [
        entry.itemCode,
        entry.productType,
        entry.exportPrice || '',
        entry.masterDistributorPrice || '',
        entry.dealerPrice || '',
        entry.dealer2Price || '',
        entry.approvalNeededPrice || '',
        entry.tierStage25Price || '',
        entry.tierStage2Price || '',
        entry.tierStage15Price || '',
        entry.tierStage1Price || '',
        entry.retailPrice || ''
      ]);
      
      const csvContent = [headers, ...csvRows].map(row => row.join(',')).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="pricing-data-export.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting pricing data:", error);
      res.status(500).json({ error: "Failed to export pricing data" });
    }
  });

  // Upload competitor pricing data file

  // Download product data

  // Download pricing data

  // Download customer data

  // Generate unique quote number
  app.post("/api/generate-quote-number", isAuthenticated, async (req: any, res) => {
    try {
      // Generate 7-digit alphanumeric quote number
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const quoteNumber = Array.from(
        { length: 7 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join("");
      res.json({ quoteNumber });
    } catch (error) {
      console.error("Error generating quote number:", error);
      res.status(500).json({ error: "Failed to generate quote number" });
    }
  });

  // Generate PDF quote using pdfkit (optimized for speed)
  app.post("/api/generate-pdf-quote", isAuthenticated, async (req: any, res) => {
    try {
      const { customerName, customerEmail, customerCompany, customerAddress, quoteItems, sentVia, additionalCharges = [] } = req.body;
      
      if (!customerName || !quoteItems || !Array.isArray(quoteItems) || quoteItems.length === 0) {
        return res.status(400).json({ error: "Customer name and quote items are required" });
      }

      // Get current user's email from authenticated session
      const currentUserEmail = req.user?.claims?.email || "sales@4sgraphics.com";
      const salesperson = req.user?.claims?.first_name && req.user?.claims?.last_name 
        ? `${req.user.claims.first_name} ${req.user.claims.last_name}`
        : currentUserEmail.split('@')[0];

      // Generate unique quote number with S prefix
      const quoteNum = Math.floor(10000 + Math.random() * 90000);
      const finalQuoteNumber = `S0${quoteNum}`;
      
      // Calculate totals (subtotal + additional charges)
      const subtotal = quoteItems.reduce((sum: number, item: any) => sum + item.total, 0);
      const chargesTotal = (additionalCharges as any[]).reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
      const totalAmount = subtotal + chargesTotal;
      const hasCharges = additionalCharges.length > 0 && chargesTotal > 0;
      
      // Save quote to database SYNCHRONOUSLY before generating PDF
      // Set follow-up due date to 10 days from now
      const followUpDueAt = new Date();
      followUpDueAt.setDate(followUpDueAt.getDate() + 10);
      
      let savedQuote: any = null;
      try {
        console.log(`[Quote Save] Saving quote ${finalQuoteNumber} for ${customerName}`);
        savedQuote = await storage.upsertSentQuote({
          quoteNumber: finalQuoteNumber,
          customerName,
          customerEmail: customerEmail || null,
          quoteItems: JSON.stringify(quoteItems),
          totalAmount: totalAmount.toString(),
          sentVia: sentVia || 'pdf',
          status: 'sent',
          ownerEmail: currentUserEmail,
          followUpDueAt,
          outcome: 'pending',
          reminderCount: 0,
          lostNotificationSent: false
        });
        console.log(`[Quote Save] Quote saved successfully with ID: ${savedQuote?.id}, follow-up due: ${followUpDueAt.toISOString()}`);
      } catch (saveError) {
        console.error('[Quote Save] FAILED to save quote:', saveError);
      }
      
      // Link quote to categories asynchronously (non-blocking)
      (async () => {
        try {
          if (!savedQuote) {
            console.log('[Quote Integration] Skipping category linking - quote not saved');
            return;
          }

          // === QUOTE-CATEGORY INTEGRATION ===
          let customerId = null;
          if (customerEmail) {
            customerId = await findCustomerIdByEmail(customerEmail);
          }
          if (!customerId && customerName) {
            customerId = await findCustomerIdByName(customerName);
          }

          if (customerId && savedQuote) {
            // Extract unique product categories from quote items
            const uniqueCategories = [...new Set(quoteItems.map((item: any) => item.productName).filter(Boolean))];

            for (const categoryName of uniqueCategories) {
              // Update category trust: if not_introduced, set to introduced
              const existingTrust = await db.select().from(categoryTrust)
                .where(sql`${categoryTrust.customerId} = ${customerId} AND ${categoryTrust.categoryName} = ${categoryName}`);

              if (existingTrust.length > 0) {
                const trust = existingTrust[0];
                await db.update(categoryTrust)
                  .set({
                    quotesSent: (trust.quotesSent || 0) + 1,
                    trustLevel: trust.trustLevel === 'not_introduced' ? 'introduced' : trust.trustLevel,
                    updatedAt: new Date()
                  })
                  .where(eq(categoryTrust.id, trust.id));
              } else {
                await db.insert(categoryTrust).values({
                  customerId,
                  categoryName: categoryName as string,
                  trustLevel: 'introduced',
                  quotesSent: 1,
                  updatedBy: req.user?.email
                });
              }

              // Create quote category link with follow-up timer (4 days initial)
              const initialFollowUpDue = new Date();
              initialFollowUpDue.setDate(initialFollowUpDue.getDate() + 4);

              await db.insert(quoteCategoryLinks).values({
                customerId,
                quoteId: savedQuote.id,
                quoteNumber: finalQuoteNumber,
                categoryName: categoryName as string,
                followUpStage: 'initial',
                nextFollowUpDue: initialFollowUpDue,
                urgencyScore: 30
              });
            }

            console.log(`[Quote Integration] Linked quote ${finalQuoteNumber} to ${uniqueCategories.length} categories for customer ${customerId}`);
          } else {
            console.log(`[Quote Integration] Customer not found for: ${customerEmail || customerName}`);
          }
        } catch (err) {
          console.error('Failed to save quote or link categories:', err);
        }
      })();
      
      // Generate filename
      const currentDate = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '-');
      const sanitizedCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const filename = `QuickQuotes_4SGraphics_${currentDate}_for_${sanitizedCustomerName}.pdf`;

      // Brand colors matching Odoo invoice style
      const brandGreen = '#00945f';
      const textDark = '#333333';
      const textMuted = '#666666';
      const borderColor = '#cccccc';

      // Create PDF using pdfkit (optimized settings)
      const doc = new PDFDocument({ 
        size: 'A4', 
        margins: { top: 40, bottom: 60, left: 40, right: 40 },
        autoFirstPage: true,
        compress: true
      });
      
      // Track page count for page numbering
      let pageCount = 1;
      const pageNumbers: number[] = [1];
      
      // Listen for new pages to track count
      doc.on('pageAdded', () => {
        pageCount++;
        pageNumbers.push(pageCount);
      });
      
      // Collect PDF into buffer
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      
      const pdfPromise = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      const pageWidth = doc.page.width;
      const leftMargin = 40;
      const rightMargin = pageWidth - 40;
      const contentWidth = rightMargin - leftMargin;

      // === HEADER SECTION ===
      // Use pre-cached logo buffer for speed
      let logoLoaded = false;
      if (cachedLogoBuffer) {
        try {
          doc.image(cachedLogoBuffer, leftMargin, 30, { width: 45 });
          logoLoaded = true;
        } catch (e) { /* ignore logo errors */ }
      }
      
      // Company name and address next to logo
      const companyTextX = logoLoaded ? leftMargin + 55 : leftMargin;
      doc.fontSize(12).font('Helvetica-Bold').fillColor(textDark);
      doc.text('4S Graphics, Inc.', companyTextX, 30);
      doc.fontSize(9).font('Helvetica').fillColor(textMuted);
      doc.text('764 Northwest 57th Court', companyTextX, 45);
      doc.text('Fort Lauderdale FL 33309', companyTextX, 57);
      doc.text('United States', companyTextX, 69);
      
      // Right side header - tagline and order number
      doc.fontSize(11).font('Helvetica-BoldOblique').fillColor(brandGreen);
      doc.text('Synthetic & Specialty Substrates Supplier', rightMargin - 220, 30, { width: 220, align: 'right' });
      doc.fontSize(10).font('Helvetica').fillColor(textDark);
      doc.text(`Order # ${finalQuoteNumber}`, rightMargin - 220, 48, { width: 220, align: 'right' });

      // === THREE CUSTOMER INFO BOXES ===
      let yPos = 100;
      const boxWidth = (contentWidth - 20) / 3; // 3 boxes with 10px gaps
      const boxHeight = 95; // Increased height for address
      
      // Build address lines
      const buildAddressLines = () => {
        if (!customerAddress) return [];
        const lines: string[] = [];
        if (customerAddress.address1) lines.push(customerAddress.address1);
        if (customerAddress.address2) lines.push(customerAddress.address2);
        const cityStateZip = [
          customerAddress.city,
          customerAddress.province,
          customerAddress.zip
        ].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' $1');
        if (cityStateZip) lines.push(cityStateZip);
        if (customerAddress.country && customerAddress.country !== 'US' && customerAddress.country !== 'USA') {
          lines.push(customerAddress.country);
        }
        return lines;
      };
      const addressLines = buildAddressLines();
      
      // Customer Box (left)
      doc.rect(leftMargin, yPos, boxWidth, boxHeight).stroke(borderColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Customer', leftMargin + 8, yPos + 8);
      doc.fontSize(9).font('Helvetica').fillColor(textDark);
      let customerBoxY = yPos + 24;
      if (customerCompany) {
        doc.font('Helvetica-Bold').text(customerCompany, leftMargin + 8, customerBoxY, { width: boxWidth - 16 });
        customerBoxY += 11;
        doc.font('Helvetica');
      }
      doc.text(customerName, leftMargin + 8, customerBoxY, { width: boxWidth - 16 });
      customerBoxY += 11;
      if (customerEmail) {
        doc.fillColor(textMuted).text(customerEmail, leftMargin + 8, customerBoxY, { width: boxWidth - 16 });
        doc.fillColor(textDark);
      }
      
      // Invoicing address Box (middle)
      const box2X = leftMargin + boxWidth + 10;
      doc.rect(box2X, yPos, boxWidth, boxHeight).stroke(borderColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Invoicing Address', box2X + 8, yPos + 8);
      doc.fontSize(9).font('Helvetica').fillColor(textDark);
      let invoiceBoxY = yPos + 24;
      if (customerCompany) {
        doc.font('Helvetica-Bold').text(customerCompany, box2X + 8, invoiceBoxY, { width: boxWidth - 16 });
        invoiceBoxY += 11;
        doc.font('Helvetica');
      }
      doc.text(customerName, box2X + 8, invoiceBoxY, { width: boxWidth - 16 });
      invoiceBoxY += 11;
      addressLines.forEach(line => {
        doc.text(line, box2X + 8, invoiceBoxY, { width: boxWidth - 16 });
        invoiceBoxY += 11;
      });
      
      // Shipping Address Box (right)
      const box3X = leftMargin + (boxWidth + 10) * 2;
      doc.rect(box3X, yPos, boxWidth, boxHeight).stroke(borderColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Shipping Address', box3X + 8, yPos + 8);
      doc.fontSize(9).font('Helvetica').fillColor(textDark);
      let shipBoxY = yPos + 24;
      if (customerCompany) {
        doc.font('Helvetica-Bold').text(customerCompany, box3X + 8, shipBoxY, { width: boxWidth - 16 });
        shipBoxY += 11;
        doc.font('Helvetica');
      }
      doc.text(customerName, box3X + 8, shipBoxY, { width: boxWidth - 16 });
      shipBoxY += 11;
      addressLines.forEach(line => {
        doc.text(line, box3X + 8, shipBoxY, { width: boxWidth - 16 });
        shipBoxY += 11;
      });

      // === ORDER INFO ROW ===
      yPos = 210; // Adjusted for taller address boxes
      doc.fontSize(9).font('Helvetica-Bold').fillColor(textDark);
      doc.text('PO', leftMargin, yPos);
      doc.text('Order Date', leftMargin + 180, yPos);
      doc.text('Salesperson', leftMargin + 360, yPos);
      
      doc.fontSize(10).font('Helvetica').fillColor(textDark);
      doc.text('QuickQuote', leftMargin, yPos + 14);
      doc.text(new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }), leftMargin + 180, yPos + 14);
      doc.text(salesperson, leftMargin + 360, yPos + 14);

      // === PRODUCT TABLE ===
      yPos = 265; // Adjusted for taller address boxes
      
      // Table column positions (removed Disc.% and Taxes columns)
      // Distribute columns to fit within contentWidth
      const colWidths = {
        code: 75,
        desc: 210,
        qty: 55,
        uom: 45,
        price: 65,
        amount: 65
      };
      const tableWidth = colWidths.code + colWidths.desc + colWidths.qty + colWidths.uom + colWidths.price + colWidths.amount;
      
      const colX = {
        code: leftMargin,
        desc: leftMargin + colWidths.code,
        qty: leftMargin + colWidths.code + colWidths.desc,
        uom: leftMargin + colWidths.code + colWidths.desc + colWidths.qty,
        price: leftMargin + colWidths.code + colWidths.desc + colWidths.qty + colWidths.uom,
        amount: leftMargin + colWidths.code + colWidths.desc + colWidths.qty + colWidths.uom + colWidths.price
      };
      
      // Table header
      doc.fontSize(9).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Product Code', colX.code, yPos, { width: colWidths.code });
      doc.text('Description', colX.desc, yPos, { width: colWidths.desc });
      doc.text('Quantity', colX.qty, yPos, { width: colWidths.qty, align: 'right' });
      doc.text('UoM', colX.uom, yPos, { width: colWidths.uom, align: 'center' });
      doc.text('Unit Price', colX.price, yPos, { width: colWidths.price, align: 'right' });
      doc.text('Amount', colX.amount, yPos, { width: colWidths.amount, align: 'right' });
      
      // Header line
      yPos += 15;
      doc.moveTo(leftMargin, yPos).lineTo(rightMargin, yPos).strokeColor(borderColor).stroke();
      
      // Table rows
      yPos += 8;
      doc.font('Helvetica').fontSize(9).fillColor(textDark);
      
      // Helper function to determine if product is in roll format
      const isRollFormat = (size: string): boolean => {
        if (!size) return false;
        return size.includes("'") || size.toLowerCase().includes("feet") || /\d+x\d+\'/.test(size);
      };

      quoteItems.forEach((item: any, index: number) => {
        const productCode = item.itemCode || item.sku || 'ITEM-' + (index + 1);
        const description = `${item.productType || 'Product'}${item.size ? ` size ${item.size}` : ''}`;
        const qty = item.quantity || 1;
        const uom = isRollFormat(item.size || '') ? 'Rolls' : 'Sheets';
        const unitPrice = Number(item.pricePerUnit || item.pricePerSheet || 0);
        const amount = Number(item.total || 0);
        
        // Calculate row height based on description length
        const descLines = Math.ceil(description.length / 35);
        const rowHeight = Math.max(20, descLines * 12 + 8);
        
        // Alternate row shading - extend to full content width
        if (index % 2 === 0) {
          doc.rect(leftMargin, yPos - 2, contentWidth, rowHeight).fill('#f5f5f5');
        }
        
        doc.fontSize(9).font('Helvetica').fillColor(textDark);
        doc.fontSize(8).text(productCode.substring(0, 15), colX.code, yPos + 1, { width: colWidths.code - 5 });
        doc.fontSize(9);
        doc.text(description, colX.desc, yPos, { width: colWidths.desc - 5 });
        doc.text(qty.toFixed(2), colX.qty, yPos, { width: colWidths.qty, align: 'right' });
        doc.text(uom, colX.uom, yPos, { width: colWidths.uom, align: 'center' });
        doc.text(`$ ${unitPrice.toFixed(4)}`, colX.price, yPos, { width: colWidths.price, align: 'right' });
        doc.text(`$ ${amount.toFixed(2)}`, colX.amount, yPos, { width: colWidths.amount, align: 'right' });
        
        yPos += rowHeight;
        
        // Add new page if needed
        if (yPos > 620) {
          doc.addPage();
          yPos = 60;
        }
      });

      // Separator line after items
      yPos += 5;
      doc.moveTo(leftMargin, yPos).lineTo(rightMargin, yPos).strokeColor(borderColor).stroke();

      // === SHIPPING NOTE (in green italic) ===
      yPos += 12;
      doc.fontSize(9).font('Helvetica-Oblique').fillColor(brandGreen);
      doc.text('Ship Via: Standard Shipping', leftMargin, yPos);

      // === TOTALS SECTION (right-aligned) ===
      yPos += 25;
      const totalsStartX = rightMargin - 200;
      const totalsLabelWidth = 120;
      const totalsAmountWidth = 80;
      const rowHeightTotals = 20;
      
      // If there are additional charges, show subtotal and charges first
      if (hasCharges) {
        // Subtotal row
        doc.rect(totalsStartX, yPos, totalsLabelWidth + totalsAmountWidth, rowHeightTotals).fill('#ffffff');
        doc.lineWidth(0.5).strokeColor(borderColor).rect(totalsStartX, yPos, totalsLabelWidth + totalsAmountWidth, rowHeightTotals).stroke();
        doc.fontSize(9).font('Helvetica').fillColor(textDark);
        doc.text('Subtotal', totalsStartX + 8, yPos + 5, { width: totalsLabelWidth - 10 });
        doc.text(`$ ${subtotal.toFixed(2)}`, totalsStartX + totalsLabelWidth, yPos + 5, { width: totalsAmountWidth - 8, align: 'right' });
        yPos += rowHeightTotals;
        
        // Additional charges rows
        for (const charge of (additionalCharges as any[])) {
          if (charge.amount > 0) {
            doc.rect(totalsStartX, yPos, totalsLabelWidth + totalsAmountWidth, rowHeightTotals).fill('#ffffff');
            doc.lineWidth(0.5).strokeColor(borderColor).rect(totalsStartX, yPos, totalsLabelWidth + totalsAmountWidth, rowHeightTotals).stroke();
            doc.fontSize(9).font('Helvetica').fillColor(textDark);
            doc.text(charge.label || 'Charge', totalsStartX + 8, yPos + 5, { width: totalsLabelWidth - 10 });
            doc.text(`$ ${charge.amount.toFixed(2)}`, totalsStartX + totalsLabelWidth, yPos + 5, { width: totalsAmountWidth - 8, align: 'right' });
            yPos += rowHeightTotals;
          }
        }
      }
      
      // Total row (green text)
      doc.rect(totalsStartX, yPos, totalsLabelWidth + totalsAmountWidth, 22).fill('#f5f5f5');
      doc.lineWidth(0.5).strokeColor(borderColor).rect(totalsStartX, yPos, totalsLabelWidth + totalsAmountWidth, 22).stroke();
      doc.fontSize(10).font('Helvetica-Bold').fillColor(brandGreen);
      doc.text('Total', totalsStartX + 8, yPos + 6, { width: totalsLabelWidth - 10 });
      doc.text(`$ ${totalAmount.toFixed(2)}`, totalsStartX + totalsLabelWidth, yPos + 6, { width: totalsAmountWidth - 8, align: 'right' });
      
      // Total in words (on one line with wider width)
      yPos += 30;
      doc.fontSize(10).font('Helvetica').fillColor(textDark);
      doc.text(`Total is: `, leftMargin, yPos, { continued: true });
      doc.font('Helvetica-Bold').text(`USD dollars ${numberToWords(Math.floor(totalAmount))}`, { continued: false });

      // === PAYMENT TERMS ===
      yPos += 35;
      doc.fontSize(8).font('Helvetica').fillColor(textDark);
      doc.text('Payment terms: ', leftMargin, yPos, { continued: true });
      doc.font('Helvetica-Bold').text('Immediate Payment', { continued: false });
      
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      doc.font('Helvetica').text(`Payment due date: ${dueDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`, leftMargin, yPos + 12);

      // === PAYMENT INSTRUCTIONS ===
      yPos += 38;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Payment Instructions', leftMargin, yPos);
      yPos += 12;
      doc.fontSize(8).font('Helvetica');
      doc.text('All payments should be made to ', leftMargin, yPos, { continued: true });
      doc.font('Helvetica-Bold').text('4S GRAPHICS, INC.', { continued: true });
      doc.font('Helvetica').text(' only.', { continued: false });
      
      yPos += 14;
      doc.fontSize(8).font('Helvetica').fillColor(textDark);
      
      // Payment method bullets
      const paymentMethods = [
        { label: 'ACH Payments:', value: 'Account# 0126734133 | Routing# 063104668 | SWIFT Code: UPNBUS44 / ABA: 062005690' },
        { label: 'Credit Cards:', value: 'Visa, MasterCard, and American Express (4.5% processing fee applies)' },
        { label: 'Zelle Payments:', value: 'Linked Phone Number for Payment: 260-580-0526' },
        { label: 'PayPal Payments:', value: 'info@4sgraphics.com (4.5% PayPal fee applies)' }
      ];
      
      paymentMethods.forEach((method) => {
        doc.font('Helvetica').text('•  ', leftMargin, yPos, { continued: true });
        doc.font('Helvetica-Bold').text(method.label + ' ', { continued: true });
        doc.font('Helvetica').text(method.value, { continued: false });
        yPos += 11;
      });

      // Shipping note
      yPos += 10;
      doc.fontSize(8).font('Helvetica-Oblique').fillColor(textDark);
      doc.text('Shipping Extra at Actuals. Free Shipping available with minimum Order Quantities.', leftMargin, yPos);

      // === FOOTER ===
      const footerY = doc.page.height - 50;
      doc.moveTo(leftMargin, footerY).lineTo(rightMargin, footerY).strokeColor(borderColor).stroke();
      doc.fontSize(9).font('Helvetica').fillColor(textMuted);
      doc.text('+1 954-493-6484 | info@4sgraphics.com | www.4sgraphics.com', leftMargin, footerY + 12, { align: 'center', width: contentWidth });
      
      // Add page numbers to top right of all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(9).font('Helvetica').fillColor(textMuted);
        doc.text(`Page ${i - range.start + 1} / ${range.count}`, rightMargin - 80, 15, { width: 80, align: 'right' });
      }
      
      // Finalize PDF
      doc.end();
      
      const pdfBuffer = await pdfPromise;
      console.log('📦 PDF Buffer size:', pdfBuffer.length, 'bytes');

      // Set headers for file download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // Send the PDF
      res.end(pdfBuffer);
      
      console.log('✅ Quote PDF generated successfully:', filename);
    } catch (error) {
      console.error("=== PDF GENERATION ERROR ===");
      console.error("Error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : '';
      console.error("Stack:", errorStack);
      res.status(500).json({ 
        error: "Failed to generate PDF quote", 
        details: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Helper function to convert number to words
  function numberToWords(num: number): string {
    if (num === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const thousands = ['', 'Thousand', 'Million'];
    
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
    
    for (let i = thousands.length - 1; i >= 0; i--) {
      const divisor = Math.pow(1000, i);
      if (num >= divisor) {
        return numberToWords(Math.floor(num / divisor)) + ' ' + thousands[i] + (num % divisor ? ' ' + numberToWords(num % divisor) : '');
      }
    }
    return String(num);
  }

  // Generate CSV quote for download
  app.post("/api/generate-quote-csv", isAuthenticated, async (req: any, res) => {
    try {
      const { customerName, customerEmail, items, quoteNumber } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Quote items are required" });
      }

      // Build CSV content
      const headers = ['Item Code', 'Product', 'Size', 'Quantity', 'Price Per Sheet', 'Total'];
      const rows = items.map((item: any) => [
        item.itemCode || '',
        item.productType || '',
        item.size || '',
        item.quantity || 0,
        item.pricePerSheet?.toFixed(2) || '0.00',
        item.total?.toFixed(2) || '0.00'
      ]);

      const csvContent = [
        `Quote Number,${quoteNumber || 'N/A'}`,
        `Customer,${customerName || 'N/A'}`,
        `Email,${customerEmail || 'N/A'}`,
        `Date,${new Date().toLocaleDateString()}`,
        '',
        headers.join(','),
        ...rows.map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
        '',
        `Total,,,,,${items.reduce((sum: number, item: any) => sum + (item.total || 0), 0).toFixed(2)}`
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="quote_${quoteNumber || 'export'}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error("CSV generation error:", error);
      res.status(500).json({ error: "Failed to generate CSV" });
    }
  });

  // Send email quote (saves quote to database after email is sent via email composer)
  app.post("/api/send-email-quote", isAuthenticated, async (req: any, res) => {
    try {
      const { customerName, customerEmail, quoteItems, customerId, quoteNumber: providedQuoteNumber } = req.body;
      
      if (!customerName || !customerEmail || !quoteItems || !Array.isArray(quoteItems) || quoteItems.length === 0) {
        return res.status(400).json({ error: "Customer name, email, and quote items are required" });
      }

      // Use provided quote number or generate a new one
      const quoteNumber = providedQuoteNumber || generateQuoteNumber();
      
      // Calculate total
      const totalAmount = quoteItems.reduce((sum: number, item: any) => sum + item.total, 0);
      
      // Save quote to database
      const savedQuote = await storage.createSentQuote({
        quoteNumber,
        customerName,
        customerEmail,
        quoteItems: JSON.stringify(quoteItems),
        totalAmount: totalAmount.toString(),
        sentVia: 'email',
        status: 'sent'
      });
      
      // Auto-track customer activity (non-blocking)
      const resolvedCustomerId = customerId || await findCustomerIdByEmail(customerEmail) || await findCustomerIdByName(customerName);
      if (resolvedCustomerId) {
        autoTrackQuoteSent({
          customerId: resolvedCustomerId,
          quoteNumber,
          quoteId: savedQuote.id,
          totalAmount: totalAmount.toString(),
          itemCount: quoteItems.length,
          quoteItems,
          sentVia: 'email',
          userId: req.user?.id,
          userName: req.user?.firstName || req.user?.email,
        }).catch(err => console.error('Auto-track error:', err));
      }
      
      // TODO: Implement actual email sending
      // For now, just return success
      res.json({ 
        message: "Quote email sent successfully",
        quoteNumber
      });
    } catch (error) {
      console.error("Error sending email quote:", error);
      res.status(500).json({ error: "Failed to send email quote" });
    }
  });





  // Pipeline view: recent pending quotes for the Opportunities Kanban
  app.get("/api/quotes/pipeline", isAuthenticated, async (req: any, res) => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const userEmail = req.user?.claims?.email || req.user?.email || null;
      const isAdmin = req.user?.role === 'admin';

      // Build where conditions — admins see all, reps see their own
      const conditions = [
        eq(sentQuotes.outcome, 'pending'),
        gte(sentQuotes.createdAt, cutoff),
      ];
      if (!isAdmin && userEmail) {
        conditions.push(eq(sentQuotes.ownerEmail, userEmail));
      }

      const quotes = await db
        .select({
          id: sentQuotes.id,
          quoteNumber: sentQuotes.quoteNumber,
          customerName: sentQuotes.customerName,
          customerEmail: sentQuotes.customerEmail,
          totalAmount: sentQuotes.totalAmount,
          source: sentQuotes.source,
          createdAt: sentQuotes.createdAt,
          ownerEmail: sentQuotes.ownerEmail,
          customerId: sentQuotes.customerId,
          priority: sentQuotes.priority,
        })
        .from(sentQuotes)
        .where(and(...conditions))
        .orderBy(desc(sentQuotes.createdAt))
        .limit(200);

      res.json(quotes);
    } catch (error) {
      console.error('[Quotes Pipeline]', error);
      res.status(500).json({ error: 'Failed to fetch pipeline quotes' });
    }
  });

  // Get all sent quotes
  app.get("/api/sent-quotes", isAuthenticated, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string | undefined;
      
      // For backward compatibility, if no pagination params, return all
      if (!req.query.page && !req.query.limit && !search) {
        const quotes = await storage.getSentQuotes();
        return res.json(quotes);
      }
      
      // Paginated response
      const result = await storage.getSentQuotesPaginated(page, limit, search);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sent quotes" });
    }
  });

  app.delete("/api/sent-quotes/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid quote ID" });
      }
      
      await storage.deleteSentQuote(id);
      res.json({ message: "Quote deleted successfully" });
    } catch (error) {
      console.error("Error deleting quote:", error);
      res.status(500).json({ error: "Failed to delete quote" });
    }
  });

  app.patch("/api/sent-quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid quote ID" });
      }
      
      const { customerEmail } = req.body;
      await storage.updateSentQuote(id, { customerEmail });
      res.json({ message: "Quote updated successfully" });
    } catch (error) {
      console.error("Error updating quote:", error);
      res.status(500).json({ error: "Failed to update quote" });
    }
  });

  // Competitor Pricing endpoints
  app.get("/api/competitor-pricing", requireApproval, async (req, res) => {
    try {
      const pricingData = await storage.getCompetitorPricing();
      res.json(pricingData);
    } catch (error) {
      console.error("Error fetching competitor pricing:", error);
      res.status(500).json({ error: "Failed to fetch competitor pricing" });
    }
  });

  app.post("/api/competitor-pricing", requireApproval, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const pricingData = req.body;
      
      console.log("Received competitor pricing data:", pricingData);
      console.log("User ID:", userId);
      
      // Enhanced validation to match database schema
      const requiredStringFields = ['type', 'dimensions', 'thickness', 'productKind', 'surfaceFinish', 'supplierInfo', 'infoReceivedFrom', 'notes', 'source'];
      const requiredNumericFields = ['packQty', 'inputPrice', 'pricePerSqIn', 'pricePerSqFt', 'pricePerSqMeter'];
      
      const validationErrors = [];
      
      // Check required string fields
      for (const field of requiredStringFields) {
        if (!pricingData[field] || pricingData[field] === '') {
          validationErrors.push(`Missing or empty string field: ${field} (value: ${pricingData[field]})`);
        }
      }
      
      // Check numeric fields with enhanced validation
      for (const field of requiredNumericFields) {
        const value = pricingData[field];
        if (value === undefined || value === null || value === '') {
          validationErrors.push(`Missing or empty numeric field: ${field} (value: ${value})`);
        } else {
          // Validate that numeric fields are actually valid numbers
          const cleanValue = typeof value === 'string' ? value.replace(/[$,]/g, '') : String(value);
          const numValue = parseFloat(cleanValue);
          if (isNaN(numValue) || !isFinite(numValue)) {
            validationErrors.push(`Invalid numeric value for field: ${field} (value: ${value}, parsed: ${numValue})`);
          } else if (numValue < 0) {
            validationErrors.push(`Negative value not allowed for field: ${field} (value: ${numValue})`);
          }
        }
      }
      
      if (validationErrors.length > 0) {
        console.log("VALIDATION FAILED:");
        validationErrors.forEach(error => console.log(`  - ${error}`));
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationErrors,
          receivedData: pricingData 
        });
      }
      
      console.log("All validation checks passed");

      const newEntry = await storage.createCompetitorPricing({
        ...pricingData,
        addedBy: userId
      });
      
      console.log("Successfully created competitor pricing entry:", newEntry);
      res.json(newEntry);
    } catch (error) {
      console.error("Error creating competitor pricing:", error);
      res.status(500).json({ error: "Failed to create competitor pricing" });
    }
  });

  app.delete("/api/competitor-pricing/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricing ID" });
      }
      
      await storage.deleteCompetitorPricing(id);
      res.json({ message: "Competitor pricing deleted successfully" });
    } catch (error) {
      console.error("Error deleting competitor pricing:", error);
      res.status(500).json({ error: "Failed to delete competitor pricing" });
    }
  });

  // Bulk update competitor pricing entries (supports multiple fields)
  app.patch("/api/competitor-pricing/bulk-update", requireAdmin, async (req, res) => {
    try {
      const { ids, field, value, fields } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No entries selected" });
      }
      
      // Allowed fields for bulk update
      const allowedFields = [
        'type', 'thickness', 'productKind', 'surfaceFinish', 
        'supplierInfo', 'infoReceivedFrom', 'notes', 'source'
      ];
      
      // Handle multi-field update (new format)
      if (fields && typeof fields === 'object') {
        const updateData: any = {};
        for (const [fieldKey, fieldValue] of Object.entries(fields)) {
          if (allowedFields.includes(fieldKey) && fieldValue !== undefined && fieldValue !== '') {
            updateData[fieldKey] = fieldValue;
          }
        }
        
        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ error: "No valid fields provided for update" });
        }
        
        let updatedCount = 0;
        for (const id of ids) {
          await storage.updateCompetitorPricing(id, updateData);
          updatedCount++;
        }
        
        res.json({ 
          message: `Successfully updated ${updatedCount} entries`,
          updatedCount,
          fieldsUpdated: Object.keys(updateData)
        });
        return;
      }
      
      // Handle single field update (legacy format)
      if (!field) {
        return res.status(400).json({ error: "No field specified" });
      }
      
      if (!allowedFields.includes(field)) {
        return res.status(400).json({ error: `Field '${field}' is not allowed for bulk update` });
      }
      
      let updatedCount = 0;
      for (const id of ids) {
        const updateData: any = {};
        updateData[field] = value || '';
        await storage.updateCompetitorPricing(id, updateData);
        updatedCount++;
      }
      
      res.json({ 
        message: `Successfully updated ${updatedCount} entries`,
        updatedCount 
      });
    } catch (error) {
      console.error("Error bulk updating competitor pricing:", error);
      res.status(500).json({ error: "Failed to bulk update competitor pricing" });
    }
  });

  // Upload competitor pricing data directly from competitor pricing page
  app.post("/api/upload-competitor-pricing", requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const fileName = req.file.originalname.toLowerCase();
      const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      
      let headers: string[] = [];
      let dataRows: any[] = [];
      
      if (isExcelFile) {
        // Handle Excel files
        const ExcelJSModule = await import('exceljs');
        const ExcelJS = ExcelJSModule.default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];

        if (!worksheet || worksheet.rowCount <= 1) {
          return res.status(400).json({ error: "Empty Excel file" });
        }

        const headerRow = worksheet.getRow(1);
        headers = (headerRow.values as any[]).slice(1).map((v: any) => String(v ?? ''));

        dataRows = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const rowObj: Record<string, any> = {};
          (row.values as any[]).slice(1).forEach((val: any, idx: number) => {
            rowObj[headers[idx]] = val;
          });
          dataRows.push(rowObj);
        });

        console.log('Excel Headers:', headers);
        console.log('Excel Data rows:', dataRows.length);
      } else {
        // Handle CSV files
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        console.log('CSV Content:', csvContent.substring(0, 500) + '...');
        
        const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
        console.log('Lines:', lines.length);
        
        if (lines.length === 0) {
          return res.status(400).json({ error: "Empty CSV file" });
        }
        
        // Helper function to parse CSV row properly (handles commas inside quoted fields)
        const parseCSVRow = (row: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < row.length; i++) {
            const char = row[i];
            
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim().replace(/^"|"$/g, ''));
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim().replace(/^"|"$/g, ''));
          return result;
        };
        
        headers = parseCSVRow(lines[0]);
        const csvDataRows = lines.slice(1);
        
        // Convert CSV rows to objects
        dataRows = csvDataRows.map(row => {
          const values = parseCSVRow(row);
          const rowData: any = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index] || '';
          });
          return rowData;
        }).filter(row => Object.values(row).some(v => v !== ''));
      }
      
      // Fetch existing entries for duplicate detection
      const existingEntries = await storage.getCompetitorPricing();
      
      // Create fingerprints of existing entries for fast lookup
      const createFingerprint = (entry: any) => {
        return [
          String(entry.type || '').toLowerCase().trim(),
          String(entry.dimensions || '').toLowerCase().trim(),
          String(entry.packQty || 0),
          String(parseFloat(entry.inputPrice || 0).toFixed(2)),
          String(entry.thickness || '').toLowerCase().trim(),
          String(entry.productKind || '').toLowerCase().trim(),
          String(entry.surfaceFinish || '').toLowerCase().trim(),
          String(entry.supplierInfo || '').toLowerCase().trim(),
          String(parseFloat(entry.pricePerSqMeter || 0).toFixed(4)),
          String(entry.notes || '').toLowerCase().trim(),
        ].join('|');
      };
      
      const existingFingerprints = new Set(existingEntries.map(createFingerprint));
      console.log(`Found ${existingFingerprints.size} existing unique entries for duplicate detection`);
      
      let uploadedCount = 0;
      let skippedDuplicates = 0;
      
      for (let i = 0; i < dataRows.length; i++) {
        const rowData = dataRows[i];
        console.log(`Processing row ${i + 1}:`, rowData);
        
        // Parse input price (supports multiple column names)
        const inputPriceStr = String(rowData['Price/Pack'] || rowData['Input Price'] || '0');
        const inputPrice = parseFloat(inputPriceStr.replace(/[$,]/g, ''));
        console.log('Price/Pack:', inputPriceStr, '->', inputPrice);
        
        // Parse price per sheet
        const pricePerSheetStr = String(rowData['Price/Sheet'] || '0');
        const pricePerSheet = parseFloat(pricePerSheetStr.replace(/[$,]/g, ''));
        console.log('Price/Sheet:', pricePerSheetStr, '->', pricePerSheet);
        
        // Parse per-unit prices (optional, will be calculated if zero)
        const pricePerSqInStr = String(rowData['Price/in²'] || '0');
        const pricePerSqIn = parseFloat(pricePerSqInStr.replace(/[$,]/g, ''));
        
        const pricePerSqFtStr = String(rowData['Price/ft²'] || '0');
        const pricePerSqFt = parseFloat(pricePerSqFtStr.replace(/[$,]/g, ''));
        
        const pricePerSqMeterStr = String(rowData['Price/m²'] || '0');
        const pricePerSqMeter = parseFloat(pricePerSqMeterStr.replace(/[$,]/g, ''));
        
        // Parse dimensions 
        const widthStr = String(rowData.Width || '0');
        const width = parseFloat(widthStr.replace(/[^0-9.]/g, ''));
        
        const lengthStr = String(rowData.Length || '0');
        const length = parseFloat(lengthStr.replace(/[^0-9.]/g, ''));
        
        console.log('Dimensions:', widthStr, 'x', lengthStr, '->', width, 'x', length);
        
        // Get unit from CSV or default to 'in'
        const unit = rowData.Unit || 'in';
        
        // Create competitor data object
        const competitorData = {
          type: rowData.Type || 'sheets',
          dimensions: `${width} x ${length} ${unit}`,
          width: width,
          length: length,
          unit: unit,
          packQty: parseInt(rowData['Pack Qty'] || '1') || 1,
          inputPrice: inputPrice,
          thickness: rowData.Thickness || 'N/A',
          productKind: rowData['Product Kind'] || 'Non Adhesive',
          surfaceFinish: rowData['Surface Finish'] || 'N/A',
          supplierInfo: rowData['Supplier'] || rowData['Supplier Info'] || 'N/A',
          infoReceivedFrom: rowData['Info From'] || rowData['Info Received From'] || 'N/A',
          pricePerSqIn: pricePerSqIn,
          pricePerSqFt: pricePerSqFt,
          pricePerSqMeter: pricePerSqMeter,
          notes: rowData.Notes || 'N/A',
          source: rowData['Source'] || 'CSV Upload',
          pricePerSheet: pricePerSheet,
          addedBy: (req.user as any)?.claims?.sub || 'admin'
        };
        
        // Check for duplicate before saving
        const newFingerprint = createFingerprint(competitorData);
        if (existingFingerprints.has(newFingerprint)) {
          skippedDuplicates++;
          continue;
        }
        
        try {
          const savedEntry = await storage.createCompetitorPricing(competitorData as any);
          uploadedCount++;
          // Add fingerprint to set to prevent duplicates within same upload
          existingFingerprints.add(newFingerprint);
        } catch (error) {
          console.error(`Error saving competitor pricing data for row ${i + 1}:`, error);
        }
      }
      
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      
      let message = `Upload complete: ${uploadedCount} new entries added.`;
      if (skippedDuplicates > 0) {
        message += ` ${skippedDuplicates} duplicates skipped.`;
      }
      
      res.json({ 
        message,
        count: uploadedCount,
        skipped: skippedDuplicates
      });
    } catch (error) {
      console.error("Error uploading competitor pricing data:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload competitor pricing data file" });
    }
  });

  // ========================================
  // PRODUCT COMPETITOR MAPPING APIs
  // ========================================

  // Get all product-competitor mappings
  app.get("/api/competitor-mappings", requireApproval, async (req, res) => {
    try {
      const mappings = await storage.getProductCompetitorMappings();
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching competitor mappings:", error);
      res.status(500).json({ error: "Failed to fetch competitor mappings" });
    }
  });

  // Get mappings for a specific product
  app.get("/api/competitor-mappings/product/:productId", requireApproval, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      const mappings = await storage.getProductCompetitorMappingsByProductId(productId);
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching competitor mappings for product:", error);
      res.status(500).json({ error: "Failed to fetch competitor mappings" });
    }
  });

  // Get mappings for a specific competitor entry
  app.get("/api/competitor-mappings/competitor/:competitorId", requireApproval, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.competitorId);
      if (isNaN(competitorId)) {
        return res.status(400).json({ error: "Invalid competitor pricing ID" });
      }
      const mappings = await storage.getProductCompetitorMappingsByCompetitorId(competitorId);
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching competitor mappings:", error);
      res.status(500).json({ error: "Failed to fetch competitor mappings" });
    }
  });

  // Create a new mapping
  app.post("/api/competitor-mappings", requireApproval, async (req: any, res) => {
    try {
      const { productId, competitorPricingId, matchConfidence, notes } = req.body;
      const userId = req.user?.claims?.sub || 'unknown';

      if (!productId || !competitorPricingId) {
        return res.status(400).json({ error: "Product ID and Competitor Pricing ID are required" });
      }

      // Check if mapping already exists
      const existingMappings = await storage.getProductCompetitorMappingsByProductId(productId);
      const duplicateMapping = existingMappings.find(m => m.competitorPricingId === competitorPricingId);
      if (duplicateMapping) {
        return res.status(409).json({ error: "This mapping already exists" });
      }

      const mapping = await storage.createProductCompetitorMapping({
        productId,
        competitorPricingId,
        matchConfidence: matchConfidence || 'manual',
        status: 'active',
        notes: notes || null,
        createdBy: userId,
      });
      res.json(mapping);
    } catch (error) {
      console.error("Error creating competitor mapping:", error);
      res.status(500).json({ error: "Failed to create competitor mapping" });
    }
  });

  // Update a mapping
  app.patch("/api/competitor-mappings/:id", requireApproval, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid mapping ID" });
      }

      const { matchConfidence, status, notes } = req.body;
      const mapping = await storage.updateProductCompetitorMapping(id, {
        matchConfidence,
        status,
        notes,
      });

      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      res.json(mapping);
    } catch (error) {
      console.error("Error updating competitor mapping:", error);
      res.status(500).json({ error: "Failed to update competitor mapping" });
    }
  });

  // Delete a mapping
  app.delete("/api/competitor-mappings/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid mapping ID" });
      }

      const deleted = await storage.deleteProductCompetitorMapping(id);
      if (!deleted) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      res.json({ message: "Mapping deleted successfully" });
    } catch (error) {
      console.error("Error deleting competitor mapping:", error);
      res.status(500).json({ error: "Failed to delete competitor mapping" });
    }
  });

  // Get all products from product pricing master table
  app.get("/api/product-pricing-master", requireApproval, async (req, res) => {
    try {
      const products = await storage.getAllProductPricingMaster();
      res.json(products);
    } catch (error) {
      console.error("Error fetching product pricing master:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  // Get competitor pricing with mappings enriched with product info
  app.get("/api/competitor-pricing-with-mappings", requireApproval, async (req, res) => {
    try {
      const [competitorData, mappings, products] = await Promise.all([
        storage.getCompetitorPricing(),
        storage.getProductCompetitorMappings(),
        storage.getAllProductPricingMaster(),
      ]);

      // Build a map of competitor ID to product info
      const productMap = new Map(products.map(p => [p.id, p]));
      const mappingsByCompetitor = new Map<number, Array<{ mapping: any; product: any }>>();
      
      for (const mapping of mappings) {
        const product = productMap.get(mapping.productId);
        if (!mappingsByCompetitor.has(mapping.competitorPricingId)) {
          mappingsByCompetitor.set(mapping.competitorPricingId, []);
        }
        mappingsByCompetitor.get(mapping.competitorPricingId)!.push({
          mapping,
          product: product ? {
            id: product.id,
            itemCode: product.itemCode,
            productName: product.productName,
            productType: product.productType,
          } : null,
        });
      }

      // Enrich competitor data with mapping info
      const enrichedData = competitorData.map(entry => ({
        ...entry,
        mappedProducts: mappingsByCompetitor.get(entry.id) || [],
        hasMappings: mappingsByCompetitor.has(entry.id),
      }));

      res.json(enrichedData);
    } catch (error) {
      console.error("Error fetching competitor pricing with mappings:", error);
      res.status(500).json({ error: "Failed to fetch competitor pricing with mappings" });
    }
  });

  // Get sent quote by ID
  app.get("/api/sent-quotes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid quote ID" });
      }
      
      const quote = await storage.getSentQuote(id);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found" });
      }
      
      res.json(quote);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  });

  // ========================================
  // QUOTE FOLLOW-UP & OUTCOME APIs
  // ========================================

  // Get pending quote follow-ups for a user (or all if admin)
  app.get("/api/quotes/follow-ups/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user?.claims?.email;
      const isAdmin = req.user?.role === 'admin';
      
      // Get quotes with pending outcome that are due for follow-up
      const now = new Date();
      const pendingQuotes = await db.select().from(sentQuotes)
        .where(sql`${sentQuotes.outcome} = 'pending' AND ${sentQuotes.followUpDueAt} IS NOT NULL`)
        .orderBy(sentQuotes.followUpDueAt);
      
      // Filter by owner if not admin
      const filteredQuotes = isAdmin ? pendingQuotes : pendingQuotes.filter(q => q.ownerEmail === userEmail);
      
      // Get all customers to map email to ID
      const allCustomers = await storage.getCustomers();
      const customersByEmail = new Map(allCustomers.map(c => [c.email?.toLowerCase(), c]));
      // Build customer name lookup using company or firstName + lastName
      const customersByName = new Map(allCustomers.map(c => {
        const displayName = c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim();
        return [displayName.toLowerCase(), c];
      }));
      
      // Categorize by urgency and add customerId
      const result = filteredQuotes.map(q => {
        const customerByEmail = q.customerEmail ? customersByEmail.get(q.customerEmail.toLowerCase()) : null;
        const customerByName = q.customerName ? customersByName.get(q.customerName.toLowerCase()) : null;
        const customer = customerByEmail || customerByName;
        return {
          ...q,
          customerId: customer?.id || null,
          isOverdue: q.followUpDueAt && new Date(q.followUpDueAt) < now,
          daysUntilDue: q.followUpDueAt ? Math.ceil((new Date(q.followUpDueAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
        };
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching pending quote follow-ups:", error);
      res.status(500).json({ error: "Failed to fetch pending follow-ups" });
    }
  });

  // Get quotes that were auto-marked as lost (for notification popup)
  app.get("/api/quotes/lost-notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user?.claims?.email;
      
      // Get quotes marked as lost that haven't had notification dismissed
      const lostQuotes = await db.select().from(sentQuotes)
        .where(sql`${sentQuotes.outcome} = 'lost' AND ${sentQuotes.ownerEmail} = ${userEmail} AND ${sentQuotes.lostNotificationSent} = true`)
        .orderBy(sql`${sentQuotes.outcomeUpdatedAt} DESC`)
        .limit(10);
      
      // Get all customers to map email to ID
      const allCustomers = await storage.getCustomers();
      const customersByEmail = new Map(allCustomers.map(c => [c.email?.toLowerCase(), c]));
      // Build customer name lookup using company or firstName + lastName
      const customersByName = new Map(allCustomers.map(c => {
        const displayName = c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim();
        return [displayName.toLowerCase(), c];
      }));
      
      // Add customerId to each quote
      const result = lostQuotes.map(q => {
        const customerByEmail = q.customerEmail ? customersByEmail.get(q.customerEmail.toLowerCase()) : null;
        const customerByName = q.customerName ? customersByName.get(q.customerName.toLowerCase()) : null;
        const customer = customerByEmail || customerByName;
        return {
          ...q,
          customerId: customer?.id || null,
        };
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching lost quote notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Update quote outcome (won/lost with details)
  app.put("/api/quotes/:id/outcome", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid quote ID" });
      }
      
      const { outcome, outcomeNotes, competitorName, objectionSummary } = req.body;
      const userEmail = req.user?.claims?.email;
      const isAdmin = req.user?.role === 'admin';
      
      if (!['won', 'lost', 'pending'].includes(outcome)) {
        return res.status(400).json({ error: "Invalid outcome. Must be 'won', 'lost', or 'pending'" });
      }
      
      // Authorization check: Only owner or admin can update outcome
      const existingQuote = await db.select().from(sentQuotes).where(eq(sentQuotes.id, id)).limit(1);
      if (existingQuote.length === 0) {
        return res.status(404).json({ error: "Quote not found" });
      }
      
      if (!isAdmin && existingQuote[0].ownerEmail !== userEmail) {
        return res.status(403).json({ error: "You don't have permission to update this quote" });
      }
      
      const updatedQuote = await db.update(sentQuotes)
        .set({
          outcome,
          outcomeNotes: outcomeNotes || null,
          competitorName: competitorName || null,
          objectionSummary: objectionSummary || null,
          outcomeUpdatedAt: new Date(),
          outcomeUpdatedBy: userEmail
        })
        .where(eq(sentQuotes.id, id))
        .returning();
      
      if (updatedQuote.length === 0) {
        return res.status(404).json({ error: "Quote not found" });
      }
      
      console.log(`[Quote Outcome] Quote ${updatedQuote[0].quoteNumber} marked as ${outcome} by ${userEmail}`);
      
      res.json(updatedQuote[0]);
    } catch (error) {
      console.error("Error updating quote outcome:", error);
      res.status(500).json({ error: "Failed to update quote outcome" });
    }
  });

  // Dismiss lost notification (mark as seen)
  app.post("/api/quotes/:id/dismiss-notification", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid quote ID" });
      }
      
      const userEmail = req.user?.claims?.email;
      const isAdmin = req.user?.role === 'admin';
      
      // Authorization check: Only owner or admin can dismiss notification
      const existingQuote = await db.select().from(sentQuotes).where(eq(sentQuotes.id, id)).limit(1);
      if (existingQuote.length === 0) {
        return res.status(404).json({ error: "Quote not found" });
      }
      
      if (!isAdmin && existingQuote[0].ownerEmail !== userEmail) {
        return res.status(403).json({ error: "You don't have permission to dismiss this notification" });
      }
      
      await db.update(sentQuotes)
        .set({ lostNotificationSent: false }) // Reset to hide notification
        .where(eq(sentQuotes.id, id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing notification:", error);
      res.status(500).json({ error: "Failed to dismiss notification" });
    }
  });

  // Save a new quote or update existing method
  app.post("/api/sent-quotes", isAuthenticated, async (req: any, res) => {
    try {
      const { quoteNumber, customerName, customerEmail, quoteItems, totalAmount, sentVia, customerId: providedCustomerId } = req.body;
      
      if (!quoteNumber || !customerName || !quoteItems || !totalAmount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Stamp the authenticated user as owner
      const ownerEmail = req.user?.claims?.email || req.user?.email || null;

      // Default sentVia to "Not Known" if missing or empty
      const finalSentVia = sentVia && sentVia.trim() ? sentVia.trim() : "Not Known";

      // Follow-up due 10 days from now
      const followUpDueAt = new Date();
      followUpDueAt.setDate(followUpDueAt.getDate() + 10);

      // Check if quote already exists
      const existingQuotes = await storage.getSentQuotes();
      const existingQuote = existingQuotes.find(q => q.quoteNumber === quoteNumber);
      
      let savedQuote;
      if (existingQuote) {
        // Update the existing quote with new delivery method
        const updatedSentVia = existingQuote.sentVia.includes(finalSentVia) 
          ? existingQuote.sentVia 
          : existingQuote.sentVia + `, ${finalSentVia}`;
        
        // For now, we'll just return the existing quote since we don't have an update method
        savedQuote = existingQuote;
      } else {
        // Create new quote
        savedQuote = await storage.createSentQuote({
          quoteNumber,
          customerName,
          customerEmail: customerEmail || null,
          quoteItems: JSON.stringify(quoteItems),
          totalAmount: totalAmount.toString(),
          sentVia: finalSentVia,
          status: 'sent',
          ownerEmail,
          followUpDueAt,
        });
      }

      // === QUOTE-CATEGORY INTEGRATION ===
      // Find customer by email or provided ID
      let customerId = providedCustomerId;
      if (!customerId && customerEmail) {
        customerId = await findCustomerIdByEmail(customerEmail);
      }
      if (!customerId && customerName) {
        customerId = await findCustomerIdByName(customerName);
      }

      if (customerId) {
        try {
          // Parse quote items to extract unique product categories
          const items = Array.isArray(quoteItems) ? quoteItems : JSON.parse(quoteItems);
          const uniqueCategories = [...new Set(items.map((item: any) => item.productName).filter(Boolean))];

          for (const categoryName of uniqueCategories) {
            // 1. Update category trust: if not_introduced, set to introduced
            const existingTrust = await db.select().from(categoryTrust)
              .where(sql`${categoryTrust.customerId} = ${customerId} AND ${categoryTrust.categoryName} = ${categoryName}`);

            if (existingTrust.length > 0) {
              const trust = existingTrust[0];
              // Increment quotes sent count
              await db.update(categoryTrust)
                .set({
                  quotesSent: (trust.quotesSent || 0) + 1,
                  trustLevel: trust.trustLevel === 'not_introduced' ? 'introduced' : trust.trustLevel,
                  updatedAt: new Date()
                })
                .where(eq(categoryTrust.id, trust.id));
            } else {
              // Create new category trust at "introduced" level
              await db.insert(categoryTrust).values({
                customerId,
                categoryName: categoryName as string,
                trustLevel: 'introduced',
                quotesSent: 1,
                updatedBy: req.user?.email
              });
            }

            // 2. Create quote category link with follow-up timer (4 days initial)
            const initialFollowUpDue = new Date();
            initialFollowUpDue.setDate(initialFollowUpDue.getDate() + 4); // 3-5 days initial

            await db.insert(quoteCategoryLinks).values({
              customerId,
              quoteId: savedQuote.id,
              quoteNumber,
              categoryName: categoryName as string,
              followUpStage: 'initial',
              nextFollowUpDue: initialFollowUpDue,
              urgencyScore: 30 // Base urgency for new quote
            });
          }

          console.log(`[Quote Integration] Linked quote ${quoteNumber} to ${uniqueCategories.length} categories for customer ${customerId}`);
        } catch (integrationError) {
          console.error("[Quote Integration] Error linking quote to categories:", integrationError);
          // Don't fail the main request, just log the error
        }
      }

      res.json(savedQuote);
    } catch (error) {
      console.error("Error saving quote:", error);
      res.status(500).json({ error: "Failed to save quote" });
    }
  });

  // Download all database files (Admin only)
  app.get("/api/download-data", requireAdmin, async (req, res) => {
    try {
      const archive = archiver('zip');
      
      // Set response headers
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="4sgraphics-data-${new Date().toISOString().split('T')[0]}.zip"`);
      
      // Pipe archive data to response
      archive.pipe(res);
      
      // Add CSV files from attached_assets (only main files, no duplicates)
      const assetsDir = path.join(process.cwd(), 'attached_assets');
      
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const csvFiles = files.filter(file => file.endsWith('.csv'));
        
        // Define main file patterns to include (exclude timestamped duplicates)
        const mainFiles = [
          'customers_export.csv',
          'PricePAL_All_Product_Data.csv', 
          'tier_pricing_template.csv'
        ];
        
        // Find the latest area pricing file (if any)
        const areaPricingFiles = csvFiles.filter(file => 
          file.startsWith('area-pricing-calculations-') && !file.includes('(1)')
        );
        
        if (areaPricingFiles.length > 0) {
          // Sort by modification time and get the most recent
          const latestAreaFile = areaPricingFiles
            .map(file => ({
              name: file,
              path: path.join(assetsDir, file),
              mtime: fs.statSync(path.join(assetsDir, file)).mtime
            }))
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
          
          mainFiles.push(latestAreaFile.name);
        }
        
        // Add only the main files
        mainFiles.forEach(fileName => {
          const filePath = path.join(assetsDir, fileName);
          if (safeFileExists(filePath)) {
            archive.file(filePath, { name: fileName });
            logDownload(filePath, 'admin');
          }
        });
      }
      
      // Add exported data from database
      try {
        const quotes = await storage.getSentQuotes();
        const quotesCSV = convertQuotesToCSV(quotes);
        archive.append(quotesCSV, { name: 'sent_quotes.csv' });
      } catch (error) {
        console.error('Error exporting quotes:', error);
      }
      
      // Finalize the archive
      archive.finalize();
      
    } catch (error) {
      console.error("Error creating download archive:", error);
      res.status(500).json({ error: "Failed to create download archive" });
    }
  });



  // Pricing Data Management API endpoints
  
  // Get all pricing data
  app.get("/api/pricing-data", isAuthenticated, async (req, res) => {
    try {
      const pricingData = await storage.getProductPricingMaster();
      res.json(pricingData);
    } catch (error) {
      console.error("Error fetching pricing data:", error);
      res.status(500).json({ error: "Failed to fetch pricing data" });
    }
  });

  // Update pricing data field
  app.patch("/api/pricing-data/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricing data ID" });
      }

      await storage.upsertProductPricingMaster({ id, ...updates });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating pricing data:", error);
      res.status(500).json({ error: "Failed to update pricing data" });
    }
  });


  // Sync function to bridge pricingData to productPricing
  async function syncPricingDataToProductPricing() {
    try {
      console.log("Starting sync from pricingData to productPricing...");
      
      // Get all pricing data entries
      const pricingDataEntries = await storage.getProductPricingMaster();
      console.log(`Found ${pricingDataEntries.length} pricing data entries to sync`);
      
      // Get all product types for mapping
      const productTypes = await storage.getProductTypes();
      
      let syncedCount = 0;
      let errorCount = 0;
      
      for (const pricingEntry of pricingDataEntries) {
        try {
          // Find matching product type
          const matchingType = productTypes.find(pt => 
            pt.name.toLowerCase() === pricingEntry.productType.toLowerCase()
          );
          
          if (matchingType) {
            // Create pricing entries for each tier with pricing data
            const tierMappings = [
              { tierName: 'EXPORT', tierId: 1, price: pricingEntry.exportPrice },
              { tierName: 'MASTER_DISTRIBUTOR', tierId: 2, price: pricingEntry.masterDistributorPrice },
              { tierName: 'DEALER', tierId: 3, price: pricingEntry.dealerPrice },
              { tierName: 'DEALER_2', tierId: 4, price: pricingEntry.dealer2Price },
              { tierName: 'Approval_Retail', tierId: 5, price: pricingEntry.approvalNeededPrice },
              { tierName: 'Stage25', tierId: 6, price: pricingEntry.tierStage25Price },
              { tierName: 'Stage2', tierId: 7, price: pricingEntry.tierStage2Price },
              { tierName: 'Stage15', tierId: 8, price: pricingEntry.tierStage15Price },
              { tierName: 'Stage1', tierId: 9, price: pricingEntry.tierStage1Price },
              { tierName: 'Retail', tierId: 10, price: pricingEntry.retailPrice }
            ];
            
            for (const tier of tierMappings) {
              if (tier.price && parseFloat(String(tier.price)) > 0) {
                try {
                  await storage.upsertProductPricingMaster({
                    productTypeId: matchingType.id,
                    tierId: tier.tierId,
                    pricePerSquareMeter: parseFloat(String(tier.price)),
                    sizeId: null // General pricing, not size-specific
                  });
                  syncedCount++;
                } catch (error) {
                  console.error(`Error upserting pricing for type ${matchingType.id}, tier ${tier.tierId}:`, error);
                  errorCount++;
                }
              }
            }
            
            debugLog(`Synced pricing for: ${pricingEntry.productType} → ${matchingType.name}`);
          } else {
            debugLog(`No matching product type found for: "${pricingEntry.productType}"`);
            errorCount++;
          }
        } catch (error) {
          console.error(`Error processing pricing entry ${pricingEntry.id}:`, error);
          errorCount++;
        }
      }
      
      debugLog(`Sync completed: ${syncedCount} prices synced, ${errorCount} errors`);
    } catch (error) {
      console.error("Error in syncPricingDataToProductPricing:", error);
    }
  }

  // Sync product structure from pricing data
  app.post("/api/sync-product-structure", isAuthenticated, async (req, res) => {
    try {
      debugLog("Starting product structure sync from pricing data...");
      
      // Get all pricing data to understand what products exist
      const pricingData = await storage.getProductPricingMaster();
      debugLog(`Found ${pricingData.length} pricing records`);
      
      // Create category mappings based on product_id
      const categoryMap = new Map();
      categoryMap.set('graffiti-polyester-paper', 'Graffiti Polyester Paper');
      categoryMap.set('graffiti-blended-poly', 'Graffiti Blended Poly');
      categoryMap.set('graffiti-stick', 'GraffitiStick');
      categoryMap.set('solvit', 'Solvit');
      categoryMap.set('cliq-aqueous-media', 'CLiQ Aqueous Media');
      categoryMap.set('rang-print-canvas', 'Rang Print Canvas');
      categoryMap.set('eie-media', 'EiE Media');
      categoryMap.set('ele-laser-media', 'eLe Laser Media');
      categoryMap.set('mxp-media', 'MXP Media');
      categoryMap.set('dtf-films', 'DTF Films');
      
      // Create categories first
      for (const [productId, categoryName] of categoryMap) {
        const hasDataForCategory = pricingData.some(p => p.productId === productId);
        if (hasDataForCategory) {
          try {
            await storage.createProductCategory({ name: categoryName, description: null });
            debugLog(`Created category: ${categoryName}`);
          } catch (error) {
            debugLog(`Category ${categoryName} might already exist`);
          }
        }
      }
      
      // Get created categories to map product types
      const categories = await storage.getProductCategories();
      const categoryNameToId = new Map();
      categories.forEach(cat => categoryNameToId.set(cat.name, cat.id));
      
      // Create product types from pricing data
      const processedTypes = new Set();
      for (const data of pricingData) {
        const categoryName = categoryMap.get(data.productId);
        const categoryId = categoryNameToId.get(categoryName);
        
        if (categoryId && !processedTypes.has(data.productType)) {
          try {
            await storage.createProductType({ 
              categoryId: categoryId, 
              name: data.productType, 
              description: null 
            });
            console.log(`Created product type: ${data.productType} in category ${categoryName}`);
            processedTypes.add(data.productType);
          } catch (error) {
            console.log(`Product type ${data.productType} might already exist`);
          }
        }
      }
      
      console.log("Product structure sync completed");
      res.json({ success: true, message: "Product structure synced successfully" });
    } catch (error) {
      console.error("Error syncing product structure:", error);
      res.status(500).json({ error: "Failed to sync product structure" });
    }
  });

  // Manual sync endpoint for testing
  app.post("/api/sync-pricing", isAuthenticated, async (req, res) => {
    try {
      await syncPricingDataToProductPricing();
      res.json({ success: true, message: "Pricing data synced successfully" });
    } catch (error) {
      console.error("Error syncing pricing data:", error);
      res.status(500).json({ error: "Failed to sync pricing data" });
    }
  });

  app.get("/api/product-types-all", isAuthenticated, async (req, res) => {
    try {
      const productTypes = await storage.getProductTypesWithCategories();
      res.json(productTypes);
    } catch (error) {
      console.error("Error fetching product types:", error);
      res.status(500).json({ error: "Failed to fetch product types" });
    }
  });

  // API endpoint to serve the converted pricing data
  app.get("/api/product-pricing-data", isAuthenticated, async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const filePath = path.join(process.cwd(), 'attached_assets', 'converted_pricing_data.csv');
      console.log("Reading pricing data from:", filePath);
      
      if (!fs.existsSync(filePath)) {
        console.log("Pricing data file not found");
        return res.status(404).json({ error: "Pricing data file not found" });
      }
      
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      console.log(`Pricing data loaded: ${lines.length} total lines, ${lines.length - 1} data records`);
      
      const headers = lines[0].split(',');
      
      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: any = {};
        
        headers.forEach((header, index) => {
          const value = values[index];
          
          // Convert numeric fields
          if (['total_sqm', 'min_quantity', 'Export', 'M.Distributor', 'Dealer', 'Dealer2', 
               'ApprovalNeeded', 'TierStage25', 'TierStage2', 'TierStage15', 'TierStage1', 'Retail'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            // Clean up quoted values
            row[header] = value.replace(/^"|"$/g, '');
          }
        });
        
        return row;
      });
      
      console.log(`Returning ${data.length} product records to frontend`);
      res.json(data);
    } catch (error) {
      console.error("Error fetching product pricing data:", error);
      res.status(500).json({ error: "Failed to fetch product pricing data" });
    }
  });

  // Add pricing management routes
  addPricingRoutes(app, isAuthenticated, requireAdmin);
  
  // Add database-backed pricing routes (mounted at /api so routes like /product-pricing-database work)
  app.use("/api", pricingDatabaseRoutes);

  // Generate Price List PDF
  app.post("/api/generate-price-list-pdf", isAuthenticated, async (req, res) => {
    try {
      const { customerName, selectedCategory, selectedTier, priceListItems } = req.body;

      // Validate required data
      if (!priceListItems || !Array.isArray(priceListItems) || priceListItems.length === 0) {
        return res.status(400).json({ error: "Price list items are required" });
      }

      if (!selectedCategory || !selectedTier) {
        return res.status(400).json({ error: "Category and tier selection are required" });
      }

      // Generate a 7-digit alphanumeric quote number for the price list
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const quoteNumber = Array.from(
        { length: 7 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join("");

      // Generate HTML using the price list function
      const html = await generatePriceListHTML({
        categoryName: selectedCategory,
        tierName: selectedTier,
        items: priceListItems,
        customerName: customerName || 'Customer',
        quoteNumber,
        title: "PRICE LIST"
      });
      
      console.log('📏 HTML Size:', html.length, 'characters');

      console.log('🖥️ Starting Chromium PDF generation with path:', process.env.PUPPETEER_EXECUTABLE_PATH);

      // Generate PDF using puppeteer directly
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: "15px", right: "15px", bottom: "15px", left: "15px" },
        printBackground: true,
      });

      await browser.close();

      console.log('📦 PDF Buffer size:', pdfBuffer.length, 'bytes');

      // Set headers for file download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="PriceList_${selectedCategory}_${selectedTier}_${new Date().toISOString().split('T')[0]}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // Calculate total amount from price list items
      const totalAmount = priceListItems.reduce((sum: number, item: any) => {
        const price = parseFloat(item.pricePerPack || item.total || 0);
        return sum + price;
      }, 0);

      // Save to Saved Quotes table
      try {
        await storage.createSentQuote({
          quoteNumber,
          customerName: customerName || 'Customer',
          customerEmail: '',
          quoteItems: JSON.stringify(priceListItems.map((item: any) => ({
            itemCode: item.itemCode,
            productType: item.productType,
            size: item.size,
            quantity: item.minOrderQty || item.minQty || 1,
            pricePerSheet: item.pricePerSheet,
            total: item.pricePerPack || item.total
          }))),
          totalAmount: totalAmount.toString(),
          sentVia: 'pdf',
          status: 'sent'
        });
        
        console.log('✅ Price list saved to Saved Quotes with number:', quoteNumber);
        
        // Auto-track price list activity (non-blocking) - use customerId from request if provided
        const { customerId } = req.body;
        const resolvedCustomerId = customerId || (customerName ? await findCustomerIdByName(customerName) : null);
        if (resolvedCustomerId) {
          autoTrackPriceListSent({
            customerId: resolvedCustomerId,
            quoteNumber,
            category: selectedCategory,
            tier: selectedTier,
            itemCount: priceListItems.length,
            priceListItems,
            userId: (req as any).user?.id,
            userName: (req as any).user?.firstName || (req as any).user?.email,
          }).catch(err => console.error('Auto-track price list error:', err));
        }
      } catch (saveError) {
        console.error('❌ Error saving price list to Saved Quotes:', saveError);
        // Don't fail the PDF generation if saving fails
      }

      // Send the PDF
      res.end(pdfBuffer);
      
      console.log('✅ PDF generated successfully');
      logDownload(`PriceList_${selectedCategory}_${selectedTier}.pdf`, 'PDF price list generation');

    } catch (error) {
      console.error("Price List PDF generation error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ 
        error: "Failed to generate Price List PDF", 
        details: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Generate Price List Excel (ODOO import format)
  app.post("/api/generate-price-list-csv-odoo", isAuthenticated, async (req, res) => {
    try {
      const { selectedCategory, selectedTier, priceListItems, tierLabel } = req.body;

      // Validate required data
      if (!priceListItems || !Array.isArray(priceListItems) || priceListItems.length === 0) {
        return res.status(400).json({ error: "Price list items are required" });
      }

      // ODOO template headers matching the uploaded template exactly
      const headers = [
        'External ID',
        'Pricelist Name',
        'Pricelist Items/Apply On',
        'Pricelist Items/Product',
        'Pricelist Items/Min. Quantity',
        'Pricelist Items/Start Date',
        'Pricelist Items/End Date',
        'Pricelist Items/Compute Price',
        'Pricelist Items/Fixed Price',
        'Pricelist Items/Percentage Price',
        'Pricelist Items/Based on',
        'Pricelist Items/Other Pricelist',
        'Pricelist Items/Price Discount',
        'Pricelist Items/Price Surcharge',
        'Pricelist Items/Price Rounding',
        'Pricelist Items/Min. Price Margin',
        'Pricelist Items/Max. Price Margin'
      ];

      const worksheetData: any[][] = [headers];

      // Generate pricelist ID from tier and category (sanitized for ODOO)
      const sanitizedCategory = selectedCategory.replace(/[^\w]/g, '_').replace(/_+/g, '_');
      const pricelistExternalId = `pricelist_${selectedTier}_${sanitizedCategory}`;
      const pricelistDisplayName = tierLabel || selectedTier;

      priceListItems.forEach((item: any, index: number) => {
        const row = [
          index === 0 ? pricelistExternalId : '',  // External ID (only first row)
          index === 0 ? pricelistDisplayName : '', // Pricelist Name (only first row)
          'Product',                               // Apply On
          `[${item.itemCode}] ${item.productName}`, // Product (format: [itemCode] productName)
          item.minQty || '',                       // Min. Quantity
          '',                                      // Start Date
          '',                                      // End Date
          'Fixed Price',                           // Compute Price
          item.price || 0,                         // Fixed Price
          '',                                      // Percentage Price
          'Sales Price',                           // Based on
          '',                                      // Other Pricelist
          '',                                      // Price Discount
          '',                                      // Price Surcharge
          '',                                      // Price Rounding
          '',                                      // Min. Price Margin
          ''                                       // Max. Price Margin
        ];
        worksheetData.push(row);
      });

      // Create workbook and worksheet using ExcelJS
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Template');

      // Set column widths for better readability
      const colWidths = [25, 20, 25, 50, 20, 15, 15, 25, 15, 20, 15, 20, 18, 18, 18, 20, 20];
      worksheet.columns = headers.map((h: string, i: number) => ({
        key: `col${i}`,
        width: colWidths[i] || 15
      }));

      // Add all rows (header + data)
      worksheet.addRows(worksheetData);

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Set headers for Excel download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="PriceList_ODOO_${selectedCategory}_${pricelistDisplayName}_${new Date().toISOString().split('T')[0]}.xlsx"`);

      // Send the Excel file
      res.send(Buffer.from(buffer));

      logDownload(`PriceList_ODOO_${selectedCategory}_${selectedTier}.xlsx`, 'ODOO Excel format generation');

    } catch (error) {
      console.error("Price List ODOO Excel generation error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ 
        error: "Failed to generate Price List for ODOO", 
        details: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Generate Price List Excel (All visible columns)
  app.post("/api/generate-price-list-excel", isAuthenticated, async (req, res) => {
    try {
      const { selectedCategory, selectedTier, priceListItems, userRole } = req.body;

      // Validate required data
      if (!priceListItems || !Array.isArray(priceListItems) || priceListItems.length === 0) {
        return res.status(400).json({ error: "Price list items are required" });
      }

      // Create worksheet data
      const worksheetData: any[][] = [];
      
      // Add headers
      const headers: string[] = ['Item Code', 'Product Type', 'Size', 'Min Qty'];
      
      // Only add Price/Sq.M column for admin users
      if (userRole === 'admin') {
        headers.push('Price/Sq.M');
      }
      
      headers.push('Price/Unit', 'Price Per Pack');
      worksheetData.push(headers);

      // Add data rows
      priceListItems.forEach((item: any) => {
        const row: any[] = [
          item.itemCode || '',
          item.productType || '',
          item.size || '',
          item.minQty || 0
        ];

        // Only add Price/Sq.M for admin users
        if (userRole === 'admin') {
          row.push(item.pricePerSqM || 0);
        }

        row.push(
          item.pricePerSheet || 0,
          item.pricePerPack || 0
        );

        worksheetData.push(row);
      });

      // Create workbook and worksheet using ExcelJS
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Price List');

      // Auto-fit column widths
      worksheet.columns = headers.map((header: string, i: number) => {
        const maxLength = Math.max(
          header.length,
          ...worksheetData.slice(1).map((row: any[]) => String(row[i]).length)
        );
        return { key: `col${i}`, width: Math.min(maxLength + 2, 50) };
      });

      // Add all rows (header + data)
      worksheet.addRows(worksheetData);

      // Generate Excel buffer
      const excelBuffer = await workbook.xlsx.writeBuffer();

      // Set headers for Excel download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="PriceList_Full_${selectedCategory}_${selectedTier}_${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.setHeader('Content-Length', excelBuffer.byteLength.toString());

      // Send the Excel buffer
      res.send(Buffer.from(excelBuffer));

      logDownload(`PriceList_Full_${selectedCategory}_${selectedTier}.xlsx`, 'Excel format generation');

    } catch (error) {
      console.error("Price List Excel generation error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ 
        error: "Failed to generate Price List Excel file", 
        details: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });



  app.post("/api/generate-price-list-csv", isAuthenticated, async (req, res) => {
    try {
      const { categoryName, tierName, items } = req.body;
      
      const csvHeader = "Item Code,Product Type,Size,Min Qty,Price/Sq.M,Price/Sheet,Price Per Pack\n";
      const csvRows = items.map((item: any) => 
        `${item.itemCode},${item.productType},"${item.size}",${item.minQty},${item.pricePerSqM.toFixed(2)},${item.pricePerSheet.toFixed(2)},${item.pricePerPack.toFixed(2)}`
      ).join('\n');
      
      const csv = csvHeader + csvRows;
      const filename = `price-list-${categoryName.replace(/\s+/g, '-')}-${tierName}-${new Date().toISOString().split('T')[0]}.csv`;
      
      res.json({ csv, filename });
    } catch (error) {
      console.error("Error generating price list CSV:", error);
      res.status(500).json({ error: "Failed to generate price list CSV" });
    }
  });

  app.put("/api/pricing/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { pricePerSquareMeter } = req.body;

      if (!pricePerSquareMeter || isNaN(parseFloat(pricePerSquareMeter))) {
        return res.status(400).json({ error: "Valid price per square meter is required" });
      }

      const result = await storage.upsertProductPricingMaster({ id: parseInt(id), retailPrice: parseFloat(pricePerSquareMeter) });
      
      if (!result) {
        return res.status(404).json({ error: "Pricing entry not found" });
      }

      res.json({ success: true, message: "Price updated successfully" });
    } catch (error) {
      console.error("Error updating price:", error);
      res.status(500).json({ error: "Failed to update price" });
    }
  });



  // Activity logging API routes
  app.post("/api/log-activity", isAuthenticated, async (req, res) => {
    try {
      const { action, description } = req.body;
      // Handle both production (req.user.id) and development (req.user.claims.sub) authentication
      const userId = req.user?.id || (req.user as unknown as { claims?: { sub?: string } })?.claims?.sub;
      
      debugLog("=== ACTIVITY LOGGING DEBUG ===");
      debugLog("Request body:", req.body);
      debugLog("User object:", req.user);
      debugLog("Extracted userId:", userId);
      debugLog("Action:", action);
      debugLog("Description:", description);
      
      if (!action || !description || !userId) {
        debugLog("Missing required fields - userId:", userId, "action:", action, "description:", description);
        return res.status(400).json({ error: "Action, description, and user ID are required" });
      }

      const ipAddress = req.ip || req.connection.remoteAddress || null;
      const userAgent = req.get('User-Agent') || null;

      // Extract user information from user object with proper typing
      const userClaims = req.user as unknown as { claims?: { email?: string; first_name?: string; last_name?: string } };
      const userEmail = userClaims.claims?.email || req.user?.email || 'development@4sgraphics.com';
      const userName = `${userClaims.claims?.first_name || 'Dev'} ${userClaims.claims?.last_name || 'User'}`;
      const userRole = (req.user as unknown as { role?: string })?.role || 'admin';
      
      // Determine action type based on action
      const actionType = action.toLowerCase().includes('page') ? 'navigation' : 
                        action.toLowerCase().includes('user') ? 'admin' :
                        action.toLowerCase().includes('quote') ? 'quote' :
                        action.toLowerCase().includes('price') ? 'pricing' :
                        action.toLowerCase().includes('customer') ? 'customer' :
                        'system';

      const activity = await storage.logActivity({
        userId,
        userEmail,
        userName,
        userRole,
        action,
        actionType,
        description,
        ipAddress,
        userAgent
      });

      res.json({ success: true, activity });
    } catch (error) {
      console.error("Error logging activity:", error);
      res.status(500).json({ error: "Failed to log activity" });
    }
  });

  app.get("/api/activity-logs", isAuthenticated, async (req, res) => {
    try {
      // Handle both production (req.user.id) and development (req.user.claims.sub) authentication
      const userId = req.user?.id || (req.user as unknown as { claims?: { sub?: string } })?.claims?.sub;
      const isAdmin = req.user?.role === 'admin';
      const limit = parseInt(req.query.limit as string) || 50;

      let activities;
      if (isAdmin) {
        // Admins see all activities
        activities = await storage.getActivityLogs(undefined, limit);
      } else {
        // Users see only their own activities
        activities = await storage.getUserActivityLogs(userId!, limit);
      }

      res.json({ activities });
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  app.get("/api/activity-logs/user/:userId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const activities = await storage.getUserActivityLogs(userId, limit);
      res.json({ activities });
    } catch (error) {
      console.error("Error fetching user activity logs:", error);
      res.status(500).json({ error: "Failed to fetch user activity logs" });
    }
  });

  // Parsed Contacts endpoints
  app.get("/api/parsed-contacts", isAuthenticated, async (req, res) => {
    try {
      const contacts = await storage.getParsedContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching parsed contacts:", error);
      res.status(500).json({ error: "Failed to fetch parsed contacts" });
    }
  });

  app.get("/api/parsed-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const contact = await storage.getParsedContact(id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      console.error("Error fetching parsed contact:", error);
      res.status(500).json({ error: "Failed to fetch parsed contact" });
    }
  });

  app.post("/api/parsed-contacts", isAuthenticated, async (req, res) => {
    try {
      const { insertParsedContactSchema } = await import("@shared/schema");
      const validatedData = insertParsedContactSchema.parse(req.body);
      const contact = await storage.createParsedContact(validatedData);
      res.json(contact);
    } catch (error) {
      console.error("Error creating parsed contact:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid contact data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create parsed contact" });
    }
  });

  app.put("/api/parsed-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { insertParsedContactSchema } = await import("@shared/schema");
      const validatedData = insertParsedContactSchema.parse(req.body);
      const contact = await storage.updateParsedContact(id, validatedData);
      res.json(contact);
    } catch (error) {
      console.error("Error updating parsed contact:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid contact data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update parsed contact" });
    }
  });

  app.delete("/api/parsed-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteParsedContact(id);
      res.json({ message: "Contact deleted successfully" });
    } catch (error) {
      console.error("Error deleting parsed contact:", error);
      res.status(500).json({ error: "Failed to delete parsed contact" });
    }
  });
  
  // URL fetching endpoint for the text parser
  app.post("/api/fetch-url", isAuthenticated, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Validate URL
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Only allow HTTPS to public hosts — block SSRF vectors
      if (parsed.protocol !== 'https:') {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }
      const hostname = parsed.hostname.toLowerCase();
      const privatePatterns = [
        /^localhost$/,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^::1$/,
        /^fc[0-9a-f]{2}:/i,
        /\.local$/,
        /\.internal$/,
      ];
      if (privatePatterns.some(p => p.test(hostname))) {
        return res.status(400).json({ error: "URL host is not allowed" });
      }
      
      // Fetch with a 10-second timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Extract text content from HTML (simple approach)
      // Remove script and style tags
      let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
      text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
      
      // Extract text from remaining HTML
      text = text.replace(/<[^>]+>/g, ' ');
      
      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();
      
      // Limit to reasonable size
      if (text.length > 10000) {
        text = text.substring(0, 10000);
      }
      
      res.json({ text });
    } catch (error) {
      console.error("Error fetching URL:", error);
      res.status(500).json({ error: "Failed to fetch URL content" });
    }
  });

  // Chat endpoint moved to chat.ts and imported as chatRouter
  // The old implementation has been removed for cleaner architecture

  // Use the new chat router
  app.use(chatRouter);

  // PDF Category Logo Upload endpoint
  app.post("/api/pdf-category-logo", isAuthenticated, requireAdmin, imageUpload.single('logo'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { categoryKey } = req.body;
      if (!categoryKey) {
        return res.status(400).json({ error: "Category key is required" });
      }
      
      const originalExt = path.extname(req.file.originalname).toLowerCase();
      const newFilename = `pdf-logo-${categoryKey}${originalExt}`;
      const destPath = path.join(process.cwd(), 'attached_assets', newFilename);
      
      fs.renameSync(req.file.path, destPath);
      
      res.json({ 
        success: true, 
        filename: newFilename,
        message: "Logo uploaded successfully" 
      });
    } catch (error) {
      console.error("Error uploading PDF category logo:", error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });

  // PDF Category Details endpoints (Admin only)
  app.get("/api/pdf-category-details", isAuthenticated, async (req, res) => {
    try {
      const details = await storage.getPdfCategoryDetails();
      res.json(details);
    } catch (error) {
      console.error("Error fetching PDF category details:", error);
      res.status(500).json({ error: "Failed to fetch PDF category details" });
    }
  });

  app.get("/api/pdf-category-details/:categoryKey", isAuthenticated, async (req, res) => {
    try {
      const { categoryKey } = req.params;
      const detail = await storage.getPdfCategoryDetailByKey(categoryKey);
      if (!detail) {
        return res.status(404).json({ error: "Category detail not found" });
      }
      res.json(detail);
    } catch (error) {
      console.error("Error fetching PDF category detail:", error);
      res.status(500).json({ error: "Failed to fetch PDF category detail" });
    }
  });

  app.post("/api/pdf-category-details", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { insertPdfCategoryDetailsSchema } = await import("@shared/schema");
      const validatedData = insertPdfCategoryDetailsSchema.parse({
        ...req.body,
        updatedBy: req.user?.claims?.sub || 'system'
      });
      const detail = await storage.upsertPdfCategoryDetail(validatedData);
      res.json(detail);
    } catch (error) {
      console.error("Error saving PDF category detail:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to save PDF category detail" });
    }
  });

  app.delete("/api/pdf-category-details/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePdfCategoryDetail(id);
      res.json({ message: "Category detail deleted successfully" });
    } catch (error) {
      console.error("Error deleting PDF category detail:", error);
      res.status(500).json({ error: "Failed to delete PDF category detail" });
    }
  });

  // ========== EMAIL / GMAIL ENDPOINTS ==========
  // Gmail integration using Replit's Gmail connection
  
  // Get email labels
  
  // Get messages from a label (default: INBOX)
  
  // Get single message with full body
  
  // Send an email via Gmail and log to database

  // ========================================
  // Per-User Gmail OAuth Routes
  // ========================================

  // Get user's Gmail connection status

  // Initiate Gmail OAuth flow

  // OAuth callback

  // Disconnect Gmail

  // ========================================
  // Gmail Intelligence Routes
  // ========================================

  // Get sync state for current user

  // Trigger Gmail sync for current user

  // Get insights for current user (admins can see all)

  // Get insights summary (counts by type and status)

  // Update insight status (complete, dismiss, acknowledge)

  // Re-analyze pending messages (admins analyze all users' messages)

  // Rematch unmatched messages to customers using improved domain matching (admin only)

  // ========================================
  // Email Intelligence V2 Routes (Sync Debug Panel)
  // ========================================

  // Get comprehensive sync status for debug panel (legacy route)

  // NEW: /api/email/sync/status - detailed sync status with all debug info

  // NEW: /api/email/sync/run - force sync now and return counts

  // Admin: resync all active users from a given date (defaults to 2026-01-01)
  // Uses per-user OAuth tokens (gmail-intelligence) — not shared integration token

  // Trigger full Gmail sync (30 days, with pagination)

  // Get unmatched emails for manual linking

  // Manually link an unmatched email to a customer

  // Ignore an unmatched email

  // Re-match pending unmatched emails using current customer data

  // Get extracted sales events with sender info and category filtering

  // Update event type (correct wrongly identified events)

  // Delete event (dismiss false positive)

  // Email intelligence blacklist management



  // Get sales events summary by type

  // Enrich events with AI coaching tips

  // Re-analyze all emails with new event rules

  // ========================================
  // Shipment Follow-up Tasks Routes
  // ========================================

  // Get shipment follow-up tasks
  app.get("/api/shipment-followups", isAuthenticated, async (req: any, res) => {
    try {
      const { getShipmentFollowUpTasks, getPendingShipmentReminders } = await import("./gmail-intelligence");
      const userId = req.user?.claims?.sub || req.user?.id;
      const status = req.query.status as string | undefined;
      const remindersOnly = req.query.reminders === 'true';

      if (remindersOnly) {
        const reminders = await getPendingShipmentReminders(userId);
        return res.json(reminders);
      }

      const tasks = await getShipmentFollowUpTasks(userId, status);
      res.json(tasks);
    } catch (error: any) {
      console.error("Error fetching shipment follow-up tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Complete a shipment follow-up task
  app.patch("/api/shipment-followups/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const { updateShipmentTaskStatus } = await import("./gmail-intelligence");
      const taskId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id;

      await updateShipmentTaskStatus(taskId, userId, 'completed');
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error completing shipment task:", error);
      res.status(500).json({ error: "Failed to complete task" });
    }
  });

  // Dismiss a shipment follow-up task
  app.patch("/api/shipment-followups/:id/dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const { updateShipmentTaskStatus } = await import("./gmail-intelligence");
      const taskId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id;
      const { reason } = req.body;

      await updateShipmentTaskStatus(taskId, userId, 'dismissed', reason);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error dismissing shipment task:", error);
      res.status(500).json({ error: "Failed to dismiss task" });
    }
  });

  // Reschedule a shipment follow-up task (remind me next week)
  app.patch("/api/shipment-followups/:id/remind", isAuthenticated, async (req: any, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id;
      const { followUpDueDate } = req.body;

      await db.update(shipmentFollowUpTasks)
        .set({ 
          followUpDueDate: new Date(followUpDueDate),
          reminderCount: sql`${shipmentFollowUpTasks.reminderCount} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(shipmentFollowUpTasks.id, taskId),
          eq(shipmentFollowUpTasks.userId, userId)
        ));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error rescheduling shipment task:", error);
      res.status(500).json({ error: "Failed to reschedule task" });
    }
  });

  // Mark reminder as sent (for internal use)
  app.patch("/api/shipment-followups/:id/reminder-sent", isAuthenticated, async (req: any, res) => {
    try {
      const { markReminderSent } = await import("./gmail-intelligence");
      const taskId = parseInt(req.params.id);

      await markReminderSent(taskId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error marking reminder sent:", error);
      res.status(500).json({ error: "Failed to update reminder" });
    }
  });

  // ========================================
  // Shipment Labeler Routes
  // ========================================

  // Shipments
  app.get("/api/shipments", isAuthenticated, async (req, res) => {
    try {
      const shipments = await storage.getShipments();
      res.json(shipments);
    } catch (error) {
      console.error("Error fetching shipments:", error);
      res.status(500).json({ error: "Failed to fetch shipments" });
    }
  });

  app.get("/api/shipments/:id", isAuthenticated, async (req, res) => {
    try {
      const shipment = await storage.getShipment(parseInt(req.params.id));
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      res.json(shipment);
    } catch (error) {
      console.error("Error fetching shipment:", error);
      res.status(500).json({ error: "Failed to fetch shipment" });
    }
  });

  app.post("/api/shipments", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertShipmentSchema.parse(req.body);
      const shipment = await storage.createShipment(validatedData);
      res.status(201).json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating shipment:", error);
      res.status(500).json({ error: "Failed to create shipment" });
    }
  });

  app.delete("/api/shipments/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteShipment(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting shipment:", error);
      res.status(500).json({ error: "Failed to delete shipment" });
    }
  });

  // Shipping Companies
  app.get("/api/shipping-companies", isAuthenticated, async (req, res) => {
    try {
      const companies = await storage.getShippingCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Error fetching shipping companies:", error);
      res.status(500).json({ error: "Failed to fetch shipping companies" });
    }
  });

  app.post("/api/shipping-companies", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertShippingCompanySchema.parse(req.body);
      const company = await storage.createShippingCompany(validatedData);
      res.status(201).json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating shipping company:", error);
      res.status(500).json({ error: "Failed to create shipping company" });
    }
  });

  app.delete("/api/shipping-companies/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteShippingCompany(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting shipping company:", error);
      res.status(500).json({ error: "Failed to delete shipping company" });
    }
  });

  // Saved Recipients
  app.get("/api/saved-recipients", isAuthenticated, async (req, res) => {
    try {
      const recipients = await storage.getSavedRecipients();
      res.json(recipients);
    } catch (error) {
      console.error("Error fetching saved recipients:", error);
      res.status(500).json({ error: "Failed to fetch saved recipients" });
    }
  });

  app.post("/api/saved-recipients", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSavedRecipientSchema.parse(req.body);
      // Check if already exists
      const existing = await storage.findRecipientByNameAndAddress(validatedData.companyName, validatedData.address);
      if (existing) {
        return res.json(existing);
      }
      const recipient = await storage.createSavedRecipient(validatedData);
      res.status(201).json(recipient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating saved recipient:", error);
      res.status(500).json({ error: "Failed to save recipient" });
    }
  });

  // Product Labels
  app.get("/api/product-labels", isAuthenticated, async (req, res) => {
    try {
      const labels = await storage.getProductLabels();
      res.json(labels);
    } catch (error) {
      console.error("Error fetching product labels:", error);
      res.status(500).json({ error: "Failed to fetch product labels" });
    }
  });

  app.get("/api/product-labels/:id", isAuthenticated, async (req, res) => {
    try {
      const label = await storage.getProductLabel(parseInt(req.params.id));
      if (!label) {
        return res.status(404).json({ error: "Product label not found" });
      }
      res.json(label);
    } catch (error) {
      console.error("Error fetching product label:", error);
      res.status(500).json({ error: "Failed to fetch product label" });
    }
  });

  app.post("/api/product-labels", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertProductLabelSchema.parse(req.body);
      const label = await storage.createProductLabel(validatedData);
      res.status(201).json(label);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating product label:", error);
      res.status(500).json({ error: "Failed to create product label" });
    }
  });

  app.put("/api/product-labels/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertProductLabelSchema.partial().parse(req.body);
      const label = await storage.updateProductLabel(parseInt(req.params.id), validatedData);
      if (!label) {
        return res.status(404).json({ error: "Product label not found" });
      }
      res.json(label);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating product label:", error);
      res.status(500).json({ error: "Failed to update product label" });
    }
  });

  app.delete("/api/product-labels/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteProductLabel(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting product label:", error);
      res.status(500).json({ error: "Failed to delete product label" });
    }
  });

  // Notion Products - Legacy route removed (table dropped). Use Notion API search instead.
  app.get("/api/notion-products", isAuthenticated, async (req, res) => {
    res.json([]); // Legacy table removed - use /api/notion-products/search for Notion API search
  });

  app.get("/api/notion-products/search", isAuthenticated, async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const databaseId = req.query.databaseId as string | undefined;
      
      // Use Notion API to search products
      const products = await searchNotionProducts(query, databaseId);
      res.json(products);
    } catch (error: any) {
      console.error("Error searching Notion products:", error);
      
      // Return helpful error message
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Notion is not connected. Please set up the Notion integration." });
      }
      
      res.status(500).json({ error: "Failed to search products in Notion" });
    }
  });

  // ========================================
  // CRM / Paper Distribution Routes
  // ========================================

  // Customer Contacts
  // Get a single contact by ID (for Contact Detail page)
  app.get("/api/crm/customer-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const contact = await storage.getCustomerContact(parseInt(req.params.id));
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      // Normalise email once
      const normalizedEmail = contact.emailNormalized
        ? contact.emailNormalized
        : (contact.email || "").toLowerCase().replace(/\s/g, "");

      // Run customer lookup, Gmail messages, and emailSends all in parallel
      const [customerRows, gmailRows, sendRows] = await Promise.all([
        db.select({ id: customers.id, company: customers.company, city: customers.city, province: customers.province, companyId: customers.companyId })
          .from(customers)
          .where(eq(customers.id, contact.customerId))
          .limit(1),
        normalizedEmail
          ? db.select({ id: gmailMessages.id, direction: gmailMessages.direction, fromEmail: gmailMessages.fromEmail, fromName: gmailMessages.fromName, toEmail: gmailMessages.toEmail, subject: gmailMessages.subject, snippet: gmailMessages.snippet, sentAt: gmailMessages.sentAt })
              .from(gmailMessages)
              .where(or(
                eq(gmailMessages.fromEmailNormalized, normalizedEmail),
                eq(gmailMessages.toEmailNormalized, normalizedEmail),
                sql`LOWER(TRIM(${gmailMessages.fromEmail})) = ${normalizedEmail}`,
                sql`LOWER(TRIM(${gmailMessages.toEmail})) = ${normalizedEmail}`
              ))
              .orderBy(desc(gmailMessages.sentAt))
              .limit(30)
          : Promise.resolve([] as any[]),
        normalizedEmail
          ? db.select({ id: emailSends.id, subject: emailSends.subject, body: emailSends.body, recipientEmail: emailSends.recipientEmail, sentBy: emailSends.sentBy, sentAt: emailSends.sentAt })
              .from(emailSends)
              .where(sql`LOWER(TRIM(${emailSends.recipientEmail})) = ${normalizedEmail}`)
              .orderBy(desc(emailSends.sentAt))
              .limit(30)
          : Promise.resolve([] as any[]),
      ]);

      const customer = customerRows[0] ?? null;
      const company = customer ? { id: customer.id, company: customer.company, city: customer.city, province: customer.province } : null;

      // Company record only needed if customer has a companyId — run after parallel step
      let companyRecord: { id: number; name: string; odooCompanyPartnerId: number | null } | null = null;
      if (customer?.companyId) {
        const [rec] = await db.select({ id: companies.id, name: companies.name, odooCompanyPartnerId: companies.odooCompanyPartnerId })
          .from(companies).where(eq(companies.id, customer.companyId)).limit(1);
        companyRecord = rec ?? null;
      }

      // Normalize emailSends into the same shape as gmailMessages rows; mark source so UI can distinguish
      const sentEmailRows = sendRows.map((s: any) => ({
        id: `send-${s.id}`,
        direction: "out" as const,
        fromEmail: s.sentBy ?? null,
        fromName: s.sentBy ?? null,
        toEmail: s.recipientEmail,
        subject: s.subject,
        snippet: (s.body as string)?.slice(0, 160) ?? null,
        sentAt: s.sentAt ? new Date(s.sentAt).toISOString() : null,
        source: "send" as const,
      }));

      // Build a dedup key set from gmail rows to avoid showing the same email twice
      const gmailEmailRows = (gmailRows as any[]).map((g: any) => ({ ...g, source: "gmail" as const }));

      // Merge and sort newest-first; emailSends records that also appear in gmail (same subject+to+approxTime) can coexist — duplicates are rare
      const allEmails = [...gmailEmailRows, ...sentEmailRows].sort((a, b) => {
        const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
        const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
        return tb - ta;
      });

      res.json({ contact, company, companyRecord, emails: allEmails });
    } catch (error) {
      console.error("Error fetching customer contact:", error);
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.get("/api/crm/customer-contacts", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      const contacts = await storage.getCustomerContacts(customerId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching customer contacts:", error);
      res.status(500).json({ error: "Failed to fetch customer contacts" });
    }
  });

  app.post("/api/crm/customer-contacts", isAuthenticated, async (req, res) => {
    try {
      const contact = await storage.createCustomerContact(req.body);
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating customer contact:", error);
      res.status(500).json({ error: "Failed to create customer contact" });
    }
  });

  app.put("/api/crm/customer-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const contact = await storage.updateCustomerContact(parseInt(req.params.id), req.body);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      console.error("Error updating customer contact:", error);
      res.status(500).json({ error: "Failed to update customer contact" });
    }
  });

  app.delete("/api/crm/customer-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteCustomerContact(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting customer contact:", error);
      res.status(500).json({ error: "Failed to delete customer contact" });
    }
  });

  // Journey Stages metadata
  app.get("/api/crm/journey-stages", isAuthenticated, (req, res) => {
    res.json({ stages: JOURNEY_STAGES, productLines: PRODUCT_LINES });
  });

  // Customer Journey
  app.get("/api/crm/journeys", isAuthenticated, async (req, res) => {
    try {
      const stage = req.query.stage as string | undefined;
      const journeys = stage 
        ? await storage.getCustomerJourneysByStage(stage)
        : await storage.getCustomerJourneys();
      res.json(journeys);
    } catch (error) {
      console.error("Error fetching customer journeys:", error);
      res.status(500).json({ error: "Failed to fetch customer journeys" });
    }
  });

  app.get("/api/crm/journeys/:customerId", isAuthenticated, async (req, res) => {
    try {
      const journey = await storage.getCustomerJourney(req.params.customerId);
      if (!journey) {
        return res.status(404).json({ error: "Customer journey not found" });
      }
      res.json(journey);
    } catch (error) {
      console.error("Error fetching customer journey:", error);
      res.status(500).json({ error: "Failed to fetch customer journey" });
    }
  });

  app.post("/api/crm/journeys", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCustomerJourneySchema.parse(req.body);
      const journey = await storage.upsertCustomerJourney(validatedData);
      res.status(201).json(journey);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Zod validation error:", error.errors);
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating customer journey:", error);
      res.status(500).json({ error: "Failed to create customer journey" });
    }
  });

  app.put("/api/crm/journeys/:customerId", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCustomerJourneySchema.partial().parse(req.body);
      const journey = await storage.updateCustomerJourney(req.params.customerId, validatedData);
      if (!journey) {
        return res.status(404).json({ error: "Customer journey not found" });
      }
      res.json(journey);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating customer journey:", error);
      res.status(500).json({ error: "Failed to update customer journey" });
    }
  });

  // Journey Templates (Custom Pipelines)
  app.get("/api/crm/journey-templates", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getJourneyTemplates();
      // Fetch stages for each template
      const templatesWithStages = await Promise.all(
        templates.map(async (template) => {
          const stages = await storage.getTemplateStages(template.id);
          return { ...template, stages };
        })
      );
      res.json(templatesWithStages);
    } catch (error) {
      console.error("Error fetching journey templates:", error);
      res.status(500).json({ error: "Failed to fetch journey templates" });
    }
  });

  app.get("/api/crm/journey-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getJourneyTemplate(parseInt(req.params.id));
      if (!template) {
        return res.status(404).json({ error: "Journey template not found" });
      }
      const stages = await storage.getTemplateStages(template.id);
      res.json({ ...template, stages });
    } catch (error) {
      console.error("Error fetching journey template:", error);
      res.status(500).json({ error: "Failed to fetch journey template" });
    }
  });

  app.post("/api/crm/journey-templates", isAuthenticated, async (req, res) => {
    try {
      const { stages, ...templateData } = req.body;
      const user = req.user as any;
      
      // Create a unique key from the name
      const key = templateData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') + '_' + Date.now();
      
      const validatedTemplate = insertJourneyTemplateSchema.parse({
        ...templateData,
        key,
        createdBy: user?.id
      });
      
      const template = await storage.createJourneyTemplate(validatedTemplate);
      
      // Create stages if provided
      if (stages && Array.isArray(stages)) {
        for (let i = 0; i < stages.length; i++) {
          const stageData = {
            templateId: template.id,
            position: i + 1,
            name: stages[i].name,
            guidance: stages[i].guidance || null,
            color: stages[i].color || null,
            confidenceLevel: stages[i].confidenceLevel || null,
            overdueDays: stages[i].overdueDays || null,
            autoCloseDays: stages[i].autoCloseDays || null
          };
          await storage.createTemplateStage(stageData);
        }
      }
      
      // Return template with stages
      const createdStages = await storage.getTemplateStages(template.id);
      res.status(201).json({ ...template, stages: createdStages });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating journey template:", error);
      res.status(500).json({ error: "Failed to create journey template" });
    }
  });

  app.put("/api/crm/journey-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const { stages, ...templateData } = req.body;
      const templateId = parseInt(req.params.id);
      
      const validatedTemplate = insertJourneyTemplateSchema.partial().parse(templateData);
      const template = await storage.updateJourneyTemplate(templateId, validatedTemplate);
      
      if (!template) {
        return res.status(404).json({ error: "Journey template not found" });
      }
      
      // Update stages if provided - delete all and recreate
      if (stages && Array.isArray(stages)) {
        await storage.deleteAllTemplateStages(templateId);
        for (let i = 0; i < stages.length; i++) {
          const stageData = {
            templateId,
            position: i + 1,
            name: stages[i].name,
            guidance: stages[i].guidance || null,
            color: stages[i].color || null,
            confidenceLevel: stages[i].confidenceLevel || null,
            overdueDays: stages[i].overdueDays || null,
            autoCloseDays: stages[i].autoCloseDays || null
          };
          await storage.createTemplateStage(stageData);
        }
      }
      
      const updatedStages = await storage.getTemplateStages(templateId);
      res.json({ ...template, stages: updatedStages });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating journey template:", error);
      res.status(500).json({ error: "Failed to update journey template" });
    }
  });

  app.delete("/api/crm/journey-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getJourneyTemplate(parseInt(req.params.id));
      if (template?.isSystemDefault) {
        return res.status(400).json({ error: "Cannot delete system default templates" });
      }
      await storage.deleteJourneyTemplate(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting journey template:", error);
      res.status(500).json({ error: "Failed to delete journey template" });
    }
  });

  // Duplicate a template
  app.post("/api/crm/journey-templates/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const sourceTemplate = await storage.getJourneyTemplate(parseInt(req.params.id));
      if (!sourceTemplate) {
        return res.status(404).json({ error: "Source template not found" });
      }
      
      const user = req.user as any;
      const newName = req.body.name || `${sourceTemplate.name} (Copy)`;
      const key = newName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
      
      const newTemplate = await storage.createJourneyTemplate({
        key,
        name: newName,
        description: sourceTemplate.description,
        isSystemDefault: false,
        isActive: true,
        createdBy: user?.id
      });
      
      // Copy stages
      const sourceStages = await storage.getTemplateStages(sourceTemplate.id);
      for (const stage of sourceStages) {
        await storage.createTemplateStage({
          templateId: newTemplate.id,
          position: stage.position,
          name: stage.name,
          guidance: stage.guidance,
          color: stage.color,
          confidenceLevel: stage.confidenceLevel,
          overdueDays: stage.overdueDays,
          autoCloseDays: stage.autoCloseDays
        });
      }
      
      const newStages = await storage.getTemplateStages(newTemplate.id);
      res.status(201).json({ ...newTemplate, stages: newStages });
    } catch (error) {
      console.error("Error duplicating journey template:", error);
      res.status(500).json({ error: "Failed to duplicate journey template" });
    }
  });

  // Press Profiles
  app.get("/api/crm/press-profiles", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const profiles = await storage.getPressProfiles(customerId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching press profiles:", error);
      res.status(500).json({ error: "Failed to fetch press profiles" });
    }
  });

  app.get("/api/crm/press-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const profile = await storage.getPressProfile(parseInt(req.params.id));
      if (!profile) {
        return res.status(404).json({ error: "Press profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching press profile:", error);
      res.status(500).json({ error: "Failed to fetch press profile" });
    }
  });

  app.post("/api/crm/press-profiles", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPressProfileSchema.parse(req.body);
      const profile = await storage.createPressProfile(validatedData);
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating press profile:", error);
      res.status(500).json({ error: "Failed to create press profile" });
    }
  });

  app.put("/api/crm/press-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPressProfileSchema.partial().parse(req.body);
      const profile = await storage.updatePressProfile(parseInt(req.params.id), validatedData);
      if (!profile) {
        return res.status(404).json({ error: "Press profile not found" });
      }
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating press profile:", error);
      res.status(500).json({ error: "Failed to update press profile" });
    }
  });

  app.delete("/api/crm/press-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePressProfile(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting press profile:", error);
      res.status(500).json({ error: "Failed to delete press profile" });
    }
  });

  // Sample Requests
  app.get("/api/crm/sample-requests", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const requests = await storage.getSampleRequests(customerId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching sample requests:", error);
      res.status(500).json({ error: "Failed to fetch sample requests" });
    }
  });

  app.get("/api/crm/sample-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const request = await storage.getSampleRequest(parseInt(req.params.id));
      if (!request) {
        return res.status(404).json({ error: "Sample request not found" });
      }
      res.json(request);
    } catch (error) {
      console.error("Error fetching sample request:", error);
      res.status(500).json({ error: "Failed to fetch sample request" });
    }
  });

  app.post("/api/crm/sample-requests", isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertSampleRequestSchema.parse(req.body);
      const request = await storage.createSampleRequest(validatedData);
      
      // Auto-track sample request (non-blocking)
      if (request.customerId) {
        autoTrackSampleShipped({
          customerId: request.customerId,
          sampleRequestId: request.id,
          productId: request.productId || undefined,
          productName: request.productName || undefined,
          status: request.status,
          userId: req.user?.id,
          userName: req.user?.firstName || req.user?.email,
        }).catch(err => console.error('Auto-track sample error:', err));
      }
      
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating sample request:", error);
      res.status(500).json({ error: "Failed to create sample request" });
    }
  });

  app.put("/api/crm/sample-requests/:id", isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertSampleRequestSchema.partial().parse(req.body);
      const request = await storage.updateSampleRequest(parseInt(req.params.id), validatedData);
      if (!request) {
        return res.status(404).json({ error: "Sample request not found" });
      }
      
      // Auto-track sample status change if status was updated (non-blocking)
      if (validatedData.status && request.customerId) {
        autoTrackSampleShipped({
          customerId: request.customerId,
          sampleRequestId: request.id,
          productId: request.productId || undefined,
          productName: request.productName || undefined,
          status: request.status,
          trackingNumber: request.trackingNumber || undefined,
          userId: req.user?.id,
          userName: req.user?.firstName || req.user?.email,
        }).catch(err => console.error('Auto-track sample update error:', err));
      }
      
      res.json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating sample request:", error);
      res.status(500).json({ error: "Failed to update sample request" });
    }
  });

  app.delete("/api/crm/sample-requests/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteSampleRequest(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sample request:", error);
      res.status(500).json({ error: "Failed to delete sample request" });
    }
  });

  // Test Outcomes - Legacy routes removed (table dropped). Use sample requests with result field instead.
  app.get("/api/crm/test-outcomes", isAuthenticated, async (req, res) => {
    res.json([]); // Legacy table removed
  });

  app.post("/api/crm/test-outcomes", isAuthenticated, async (req: any, res) => {
    res.status(410).json({ error: "Test outcomes feature deprecated - use sample request feedback instead" });
  });

  app.put("/api/crm/test-outcomes/:id", isAuthenticated, async (req, res) => {
    res.status(410).json({ error: "Test outcomes feature deprecated - use sample request feedback instead" });
  });

  // Validation Events
  app.get("/api/crm/validation-events", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const events = await storage.getValidationEvents(customerId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching validation events:", error);
      res.status(500).json({ error: "Failed to fetch validation events" });
    }
  });

  app.post("/api/crm/validation-events", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertValidationEventSchema.parse(req.body);
      const event = await storage.createValidationEvent(validatedData);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating validation event:", error);
      res.status(500).json({ error: "Failed to create validation event" });
    }
  });

  // Swatches
  app.get("/api/crm/swatches", isAuthenticated, async (req, res) => {
    try {
      const swatches = await storage.getSwatches();
      res.json(swatches);
    } catch (error) {
      console.error("Error fetching swatches:", error);
      res.status(500).json({ error: "Failed to fetch swatches" });
    }
  });

  app.get("/api/crm/swatches/:id", isAuthenticated, async (req, res) => {
    try {
      const swatch = await storage.getSwatch(parseInt(req.params.id));
      if (!swatch) {
        return res.status(404).json({ error: "Swatch not found" });
      }
      res.json(swatch);
    } catch (error) {
      console.error("Error fetching swatch:", error);
      res.status(500).json({ error: "Failed to fetch swatch" });
    }
  });

  app.post("/api/crm/swatches", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSwatchSchema.parse(req.body);
      const swatch = await storage.createSwatch(validatedData);
      res.status(201).json(swatch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating swatch:", error);
      res.status(500).json({ error: "Failed to create swatch" });
    }
  });

  app.put("/api/crm/swatches/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSwatchSchema.partial().parse(req.body);
      const swatch = await storage.updateSwatch(parseInt(req.params.id), validatedData);
      if (!swatch) {
        return res.status(404).json({ error: "Swatch not found" });
      }
      res.json(swatch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating swatch:", error);
      res.status(500).json({ error: "Failed to update swatch" });
    }
  });

  app.delete("/api/crm/swatches/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteSwatch(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting swatch:", error);
      res.status(500).json({ error: "Failed to delete swatch" });
    }
  });

  // Swatch Book Shipments
  app.get("/api/crm/swatch-shipments", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const shipments = await storage.getSwatchBookShipments(customerId);
      res.json(shipments);
    } catch (error) {
      console.error("Error fetching swatch book shipments:", error);
      res.status(500).json({ error: "Failed to fetch swatch book shipments" });
    }
  });

  app.post("/api/crm/swatch-shipments", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSwatchBookShipmentSchema.parse(req.body);
      const shipment = await storage.createSwatchBookShipment(validatedData);
      res.status(201).json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating swatch book shipment:", error);
      res.status(500).json({ error: "Failed to create swatch book shipment" });
    }
  });

  app.put("/api/crm/swatch-shipments/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSwatchBookShipmentSchema.partial().parse(req.body);
      const shipment = await storage.updateSwatchBookShipment(parseInt(req.params.id), validatedData);
      if (!shipment) {
        return res.status(404).json({ error: "Swatch book shipment not found" });
      }
      res.json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating swatch book shipment:", error);
      res.status(500).json({ error: "Failed to update swatch book shipment" });
    }
  });

  // Press Kit Shipments
  app.get("/api/crm/press-kit-shipments", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const shipments = await storage.getPressKitShipments(customerId);
      res.json(shipments);
    } catch (error) {
      console.error("Error fetching press kit shipments:", error);
      res.status(500).json({ error: "Failed to fetch press kit shipments" });
    }
  });

  app.post("/api/crm/press-kit-shipments", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPressKitShipmentSchema.parse(req.body);
      const shipment = await storage.createPressKitShipment(validatedData);
      res.status(201).json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating press kit shipment:", error);
      res.status(500).json({ error: "Failed to create press kit shipment" });
    }
  });

  app.put("/api/crm/press-kit-shipments/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPressKitShipmentSchema.partial().parse(req.body);
      const shipment = await storage.updatePressKitShipment(parseInt(req.params.id), validatedData);
      if (!shipment) {
        return res.status(404).json({ error: "Press kit shipment not found" });
      }
      res.json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating press kit shipment:", error);
      res.status(500).json({ error: "Failed to update press kit shipment" });
    }
  });

  // Swatch Selections
  app.get("/api/crm/swatch-selections", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const selections = await storage.getSwatchSelections(customerId);
      res.json(selections);
    } catch (error) {
      console.error("Error fetching swatch selections:", error);
      res.status(500).json({ error: "Failed to fetch swatch selections" });
    }
  });

  app.post("/api/crm/swatch-selections", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSwatchSelectionSchema.parse(req.body);
      const selection = await storage.createSwatchSelection(validatedData);
      res.status(201).json(selection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating swatch selection:", error);
      res.status(500).json({ error: "Failed to create swatch selection" });
    }
  });

  app.put("/api/crm/swatch-selections/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSwatchSelectionSchema.partial().parse(req.body);
      const selection = await storage.updateSwatchSelection(parseInt(req.params.id), validatedData);
      if (!selection) {
        return res.status(404).json({ error: "Swatch selection not found" });
      }
      res.json(selection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating swatch selection:", error);
      res.status(500).json({ error: "Failed to update swatch selection" });
    }
  });

  // Quote Events (tracking quotes sent to customers)
  app.get("/api/crm/quote-events", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const events = await storage.getQuoteEvents(customerId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching quote events:", error);
      res.status(500).json({ error: "Failed to fetch quote events" });
    }
  });

  // Get sent quotes matching a customer by email or company name
  app.get("/api/crm/customer-sent-quotes", isAuthenticated, async (req, res) => {
    try {
      const email = req.query.email as string | undefined;
      const company = req.query.company as string | undefined;
      
      if (!email && !company) {
        return res.json([]);
      }
      
      const quotes = await storage.getSentQuotesByCustomerInfo(email, company);
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching customer sent quotes:", error);
      res.status(500).json({ error: "Failed to fetch customer sent quotes" });
    }
  });

  app.post("/api/crm/quote-events", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertQuoteEventSchema.parse(req.body);
      const event = await storage.createQuoteEvent(validatedData);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating quote event:", error);
      res.status(500).json({ error: "Failed to create quote event" });
    }
  });

  // Price List Events (tracking price list views/downloads)
  app.get("/api/crm/price-list-events", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const events = await storage.getPriceListEvents(customerId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching price list events:", error);
      res.status(500).json({ error: "Failed to fetch price list events" });
    }
  });

  app.post("/api/crm/price-list-events", isAuthenticated, async (req, res) => {
    try {
      const { items, ...eventData } = req.body;
      const validatedData = insertPriceListEventSchema.parse(eventData);
      const event = await storage.createPriceListEvent(validatedData);
      
      // If line items were provided, save them too
      if (items && Array.isArray(items) && items.length > 0) {
        await storage.createPriceListEventItems(event.id, items);
      }
      
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating price list event:", error);
      res.status(500).json({ error: "Failed to create price list event" });
    }
  });

  // Get latest price list items for a customer (for QuickQuotes reference)
  app.get("/api/crm/price-list-items/:customerId", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.params.customerId;
      const result = await storage.getLatestPriceListItemsForCustomer(customerId);
      if (!result) {
        return res.json({ event: null, items: [] });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching price list items:", error);
      res.status(500).json({ error: "Failed to fetch price list items" });
    }
  });

  // ========================================
  // Customer Journey Instances API
  // ========================================

  // Get journey types and steps configuration
  app.get("/api/crm/journey-types", isAuthenticated, (req, res) => {
    res.json({
      types: JOURNEY_TYPES,
      pressTestSteps: PRESS_TEST_STEPS,
    });
  });

  // Get all journey instances (optionally filter by customerId)
  app.get("/api/crm/journey-instances", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const instances = await storage.getJourneyInstances(customerId);
      res.json(instances);
    } catch (error) {
      console.error("Error fetching journey instances:", error);
      res.status(500).json({ error: "Failed to fetch journey instances" });
    }
  });

  // Get a single journey instance with steps and details
  app.get("/api/crm/journey-instances/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const instance = await storage.getJourneyInstance(id);
      if (!instance) {
        return res.status(404).json({ error: "Journey instance not found" });
      }
      
      const steps = await storage.getJourneySteps(id);
      let details = null;
      
      if (instance.journeyType === 'press_test') {
        details = await storage.getPressTestDetails(id);
      }
      
      res.json({ instance, steps, details });
    } catch (error) {
      console.error("Error fetching journey instance:", error);
      res.status(500).json({ error: "Failed to fetch journey instance" });
    }
  });

  // Create a new journey instance
  app.post("/api/crm/journey-instances", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCustomerJourneyInstanceSchema.parse(req.body);
      const instance = await storage.createJourneyInstance(validatedData);
      
      // If it's a press test journey, create the details record
      if (validatedData.journeyType === 'press_test' && req.body.pressTestDetails) {
        try {
          // Convert date strings to Date objects if needed
          const pressTestData = {
            ...req.body.pressTestDetails,
            instanceId: instance.id,
            shippedAt: req.body.pressTestDetails.shippedAt ? new Date(req.body.pressTestDetails.shippedAt) : null,
            receivedAt: req.body.pressTestDetails.receivedAt ? new Date(req.body.pressTestDetails.receivedAt) : null,
          };
          const detailsData = insertPressTestJourneyDetailSchema.parse(pressTestData);
          await storage.createPressTestDetails(detailsData);
        } catch (detailsError) {
          console.error("Error creating press test details:", detailsError);
        }
      }
      
      // Create the first step
      if (validatedData.currentStep) {
        await storage.createJourneyStep({
          instanceId: instance.id,
          stepKey: validatedData.currentStep,
          completedAt: new Date(),
          completedBy: validatedData.createdBy,
        });
      }
      
      res.status(201).json(instance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating journey instance:", error);
      res.status(500).json({ error: "Failed to create journey instance" });
    }
  });

  // Update a journey instance
  const updateJourneyInstanceHandler = async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      // Coerce ISO date strings to Date objects for timestamp fields before Zod validation
      const body = { ...req.body };
      if (typeof body.completedAt === 'string') body.completedAt = new Date(body.completedAt);
      if (typeof body.startedAt === 'string') body.startedAt = new Date(body.startedAt);
      const validatedData = insertCustomerJourneyInstanceSchema.partial().parse(body);
      const instance = await storage.updateJourneyInstance(id, validatedData);
      
      if (!instance) {
        return res.status(404).json({ error: "Journey instance not found" });
      }
      
      // Update press test details if provided
      if (req.body.pressTestDetails) {
        const existing = await storage.getPressTestDetails(id);
        if (existing) {
          await storage.updatePressTestDetails(id, req.body.pressTestDetails);
        } else {
          await storage.createPressTestDetails({
            ...req.body.pressTestDetails,
            instanceId: id,
          });
        }
      }
      
      res.json(instance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating journey instance:", error);
      res.status(500).json({ error: "Failed to update journey instance" });
    }
  };

  app.put("/api/crm/journey-instances/:id", isAuthenticated, updateJourneyInstanceHandler);
  app.patch("/api/crm/journey-instances/:id", isAuthenticated, updateJourneyInstanceHandler);

  // Delete a journey instance
  app.delete("/api/crm/journey-instances/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteJourneyInstance(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting journey instance:", error);
      res.status(500).json({ error: "Failed to delete journey instance" });
    }
  });

  // Advance journey to next step
  app.post("/api/crm/journey-instances/:id/advance", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nextStep, completedBy, notes, payload } = req.body;
      
      const instance = await storage.getJourneyInstance(id);
      if (!instance) {
        return res.status(404).json({ error: "Journey instance not found" });
      }
      
      // Create the step record
      await storage.createJourneyStep({
        instanceId: id,
        stepKey: nextStep,
        completedAt: new Date(),
        completedBy,
        notes,
        payload,
      });
      
      // Update the instance current step
      const updatedInstance = await storage.updateJourneyInstance(id, {
        currentStep: nextStep,
      });
      
      res.json(updatedInstance);
    } catch (error) {
      console.error("Error advancing journey:", error);
      res.status(500).json({ error: "Failed to advance journey" });
    }
  });

  // Update press test journey details
  app.put("/api/crm/journey-instances/:id/press-test-details", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const instance = await storage.getJourneyInstance(id);
      
      if (!instance) {
        return res.status(404).json({ error: "Journey instance not found" });
      }
      
      if (instance.journeyType !== 'press_test') {
        return res.status(400).json({ error: "This journey is not a press test journey" });
      }
      
      const existing = await storage.getPressTestDetails(id);
      let details;
      
      if (existing) {
        details = await storage.updatePressTestDetails(id, req.body);
      } else {
        details = await storage.createPressTestDetails({
          ...req.body,
          instanceId: id,
        });
      }
      
      res.json(details);
    } catch (error) {
      console.error("Error updating press test details:", error);
      res.status(500).json({ error: "Failed to update press test details" });
    }
  });

  // ========================================
  // Customer Activity System Routes
  // ========================================

  // Customer Activity Events - list all or by customer
  app.get("/api/customer-activity/events", isAuthenticated, async (req, res) => {
    try {
      const { customerId, limit } = req.query;
      let events;
      
      if (customerId) {
        events = await storage.getActivityEventsByCustomer(customerId as string);
      } else {
        events = await storage.getRecentActivityEvents(limit ? parseInt(limit as string) : 50);
      }
      
      // Return fields that frontend expects: id, eventType, title, description, createdAt, createdByName, metadata
      const cleanGmailId = (raw: string | null | undefined): string => {
        if (!raw) return '';
        // "gmailMsgId=<id>|to:<email>" → "Sent to: <email>"
        const m = raw.match(/^gmailMsgId=[^|]+\|to:(.+)$/);
        if (m) return `Sent to: ${m[1]}`;
        // Strip any other raw gmailMsgId patterns
        if (raw.startsWith('gmailMsgId=')) return '';
        return raw;
      };

      const cleanTitle = (raw: string | null | undefined): string => {
        if (!raw) return '';
        // Remove "[Lead history] " prefix for cleaner display
        return raw.replace(/^\[Lead history\] /, '');
      };

      const transformed = events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        title: cleanTitle(e.title),
        description: cleanGmailId(e.description),
        createdAt: e.eventDate?.toISOString() || e.createdAt?.toISOString() || new Date().toISOString(),
        eventDate: e.eventDate?.toISOString() || null,
        createdByName: e.createdByName || null,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        amount: e.amount,
        productName: e.productName,
        metadata: (e as any).metadata || null,
      }));
      
      res.json(transformed);
    } catch (error) {
      console.error("Error fetching activity events:", error);
      res.status(500).json({ error: "Failed to fetch activity events" });
    }
  });

  // Get email history for a customer/contact/lead
  app.get("/api/customer-activity/emails", isAuthenticated, async (req, res) => {
    try {
      const { customerId, contactEmail, leadId, limit = '10' } = req.query;
      
      if (!customerId && !contactEmail && !leadId) {
        return res.status(400).json({ error: "customerId, contactEmail, or leadId required" });
      }
      
      const limitNum = Math.min(parseInt(limit as string) || 10, 50);
      let emails: any[] = [];
      
      // Query by email if provided (most accurate for contact-level)
      if (contactEmail) {
        const normalizedEmail = (contactEmail as string).toLowerCase().replace(/\s/g, '');
        const [gmailRows, sendRows] = await Promise.all([
          db.select({
            id: gmailMessages.id,
            direction: gmailMessages.direction,
            fromEmail: gmailMessages.fromEmail,
            fromName: gmailMessages.fromName,
            toEmail: gmailMessages.toEmail,
            subject: gmailMessages.subject,
            snippet: gmailMessages.snippet,
            sentAt: gmailMessages.sentAt,
          })
          .from(gmailMessages)
          .where(
            or(
              eq(gmailMessages.fromEmailNormalized, normalizedEmail),
              eq(gmailMessages.toEmailNormalized, normalizedEmail),
              sql`LOWER(TRIM(${gmailMessages.fromEmail})) = ${normalizedEmail}`,
              sql`LOWER(TRIM(${gmailMessages.toEmail})) = ${normalizedEmail}`
            )
          )
          .orderBy(desc(gmailMessages.sentAt))
          .limit(limitNum),
          db.select({
            id: emailSends.id,
            recipientEmail: emailSends.recipientEmail,
            subject: emailSends.subject,
            sentAt: emailSends.sentAt,
            sentBy: emailSends.sentBy,
          })
          .from(emailSends)
          .where(and(sql`LOWER(TRIM(${emailSends.recipientEmail})) = ${normalizedEmail}`, eq(emailSends.status, 'sent')))
          .orderBy(desc(emailSends.sentAt))
          .limit(limitNum),
        ]);
        const sendMapped = sendRows.map((r: any) => ({
          id: 1000000 + r.id,
          direction: 'outbound',
          fromEmail: null,
          fromName: '4S Graphics',
          toEmail: r.recipientEmail,
          subject: r.subject,
          snippet: r.sentBy === 'drip-worker' ? 'Drip campaign email' : 'Sent email',
          sentAt: r.sentAt?.toISOString() ?? null,
          isDrip: r.sentBy === 'drip-worker',
        }));
        const gmailSubjectSet = new Set(gmailRows.map((r: any) => (r.subject || '').toLowerCase().trim()));
        const dedupedSends = sendMapped.filter((r: any) => !gmailSubjectSet.has((r.subject || '').toLowerCase().trim()));
        emails = [...gmailRows, ...dedupedSends].sort((a: any, b: any) => {
          const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
          const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
          return tb - ta;
        });
      }
      // Query by customer ID 
      else if (customerId) {
        // Look up customer email to also search email_sends
        const [custRow] = await db.select({ email: customers.email, emailNormalized: customers.emailNormalized })
          .from(customers).where(eq(customers.id, customerId as string)).limit(1);
        const custEmailNorm = custRow?.emailNormalized || (custRow?.email ? custRow.email.toLowerCase().trim() : null);

        const [gmailRows, sendRows] = await Promise.all([
          db.select({
            id: gmailMessages.id,
            direction: gmailMessages.direction,
            fromEmail: gmailMessages.fromEmail,
            fromName: gmailMessages.fromName,
            toEmail: gmailMessages.toEmail,
            subject: gmailMessages.subject,
            snippet: gmailMessages.snippet,
            sentAt: gmailMessages.sentAt,
          })
          .from(gmailMessages)
          .where(eq(gmailMessages.customerId, customerId as string))
          .orderBy(desc(gmailMessages.sentAt))
          .limit(limitNum),
          custEmailNorm
            ? db.select({
                id: emailSends.id,
                recipientEmail: emailSends.recipientEmail,
                subject: emailSends.subject,
                sentAt: emailSends.sentAt,
                sentBy: emailSends.sentBy,
              })
              .from(emailSends)
              .where(and(sql`LOWER(TRIM(${emailSends.recipientEmail})) = ${custEmailNorm}`, eq(emailSends.status, 'sent')))
              .orderBy(desc(emailSends.sentAt))
              .limit(limitNum)
            : Promise.resolve([] as any[]),
        ]);
        const sendMapped = sendRows.map((r: any) => ({
          id: 1000000 + r.id,
          direction: 'outbound',
          fromEmail: null,
          fromName: '4S Graphics',
          toEmail: r.recipientEmail,
          subject: r.subject,
          snippet: r.sentBy === 'drip-worker' ? 'Drip campaign email' : 'Sent email',
          sentAt: r.sentAt?.toISOString() ?? null,
          isDrip: r.sentBy === 'drip-worker',
        }));
        const gmailSubjectSet = new Set(gmailRows.map((r: any) => (r.subject || '').toLowerCase().trim()));
        const dedupedSends = sendMapped.filter((r: any) => !gmailSubjectSet.has((r.subject || '').toLowerCase().trim()));
        emails = [...gmailRows, ...dedupedSends].sort((a: any, b: any) => {
          const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
          const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
          return tb - ta;
        });
      }
      // Query by lead ID — merge gmail_messages + email_sends for this lead
      else if (leadId) {
        const leadIdNum = parseInt(leadId as string);
        const lead = await db.select({ email: leads.email }).from(leads).where(eq(leads.id, leadIdNum)).limit(1);
        let gmailRows: any[] = [];
        if (lead.length > 0 && lead[0].email) {
          const normalizedEmail = lead[0].email.toLowerCase().replace(/\s/g, '');
          gmailRows = await db.select({
            id: gmailMessages.id,
            direction: gmailMessages.direction,
            fromEmail: gmailMessages.fromEmail,
            fromName: gmailMessages.fromName,
            toEmail: gmailMessages.toEmail,
            subject: gmailMessages.subject,
            snippet: gmailMessages.snippet,
            sentAt: gmailMessages.sentAt,
          })
          .from(gmailMessages)
          .where(
            or(
              eq(gmailMessages.fromEmailNormalized, normalizedEmail),
              eq(gmailMessages.toEmailNormalized, normalizedEmail),
              sql`LOWER(TRIM(${gmailMessages.fromEmail})) = ${normalizedEmail}`,
              sql`LOWER(TRIM(${gmailMessages.toEmail})) = ${normalizedEmail}`
            )
          )
          .orderBy(desc(gmailMessages.sentAt))
          .limit(limitNum);
        }

        // Also pull drip/manual email_sends for this lead (use offset ID to avoid collision)
        const dripRows = await db.select({
          id: emailSends.id,
          recipientEmail: emailSends.recipientEmail,
          subject: emailSends.subject,
          sentAt: emailSends.sentAt,
          sentBy: emailSends.sentBy,
        })
        .from(emailSends)
        .where(and(eq(emailSends.leadId, leadIdNum), eq(emailSends.status, 'sent')))
        .orderBy(desc(emailSends.sentAt))
        .limit(limitNum);

        const dripMapped = dripRows.map(r => ({
          id: 1000000 + r.id, // offset to avoid collision with gmail message IDs
          direction: 'outbound',
          fromEmail: null,
          fromName: '4S Graphics',
          toEmail: r.recipientEmail,
          subject: r.subject,
          snippet: r.sentBy === 'drip-worker' ? 'Drip campaign email' : 'Sent email',
          sentAt: r.sentAt?.toISOString() ?? null,
          isDrip: true,
        }));

        // Merge and sort by sentAt desc
        const gmailSubjectSet = new Set(gmailRows.map(r => (r.subject || '').toLowerCase().trim()));
        const dedupedDrip = dripMapped.filter(r => !gmailSubjectSet.has((r.subject || '').toLowerCase().trim()));
        emails = [...gmailRows, ...dedupedDrip].sort((a, b) => {
          const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
          const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
          return bTime - aTime;
        });
      }
      
      res.json(emails);
    } catch (error) {
      console.error("Error fetching email history:", error);
      res.status(500).json({ error: "Failed to fetch email history" });
    }
  });

  // Create activity event
  app.post("/api/customer-activity/events", isAuthenticated, async (req: any, res) => {
    try {
      const { followUpDate, followUpNote, ...bodyRest } = req.body;
      const event = await storage.createActivityEvent({
        ...bodyRest,
        createdBy: req.user?.id,
        createdByName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user?.email,
      });

      // Auto-create follow-up task from call log
      if ((bodyRest.eventType === 'call_made' || bodyRest.eventType === 'call') && bodyRest.customerId) {
        try {
          let taskDueDate: Date | null = followUpDate ? new Date(followUpDate) : null;
          let taskNote: string | null = followUpNote || null;

          if (!taskDueDate && bodyRest.description) {
            const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
            if (anthropicKey) {
              try {
                const anthropic = new Anthropic({ apiKey: anthropicKey });
                const aiRes = await anthropic.messages.create({
                  model: 'claude-3-haiku-20240307',
                  max_tokens: 256,
                  messages: [{ role: 'user', content: `Extract follow-up date and intent from these call notes. Reply JSON only: { "date": "YYYY-MM-DD or null", "intent": "brief action or null" }. Notes: "${bodyRest.description.substring(0, 500)}"` }]
                });
                const rawText = aiRes.content[0]?.type === 'text' ? aiRes.content[0].text.trim() : '';
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (parsed.date && parsed.date !== 'null') {
                    taskDueDate = new Date(parsed.date);
                    if (isNaN(taskDueDate.getTime())) taskDueDate = null;
                    else taskNote = parsed.intent || taskNote;
                  }
                }
              } catch (aiError) {
                console.warn('[Tasks] AI extraction for customer call failed:', aiError);
              }
            }
          }

          if (taskDueDate && !isNaN(taskDueDate.getTime())) {
            const [customer] = await db.select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName })
              .from(customers).where(eq(customers.id, bodyRest.customerId));
            const cName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Customer';
            await storage.createFollowUpTask({
              customerId: bodyRest.customerId,
              leadId: null,
              title: `Call follow-up: ${cName}`,
              description: taskNote || `Follow up from call on ${new Date().toLocaleDateString()}`,
              taskType: 'call',
              priority: 'normal',
              status: 'pending',
              dueDate: taskDueDate,
              isAutoGenerated: !followUpDate,
              sourceType: 'call_log',
              sourceId: String(event.id),
              assignedTo: req.user?.id,
              assignedToName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user?.email,
            });
          }
        } catch (taskError) {
          console.warn('[Tasks] Failed to create customer call follow-up task:', taskError);
        }
      }

      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating activity event:", error);
      res.status(500).json({ error: "Failed to create activity event" });
    }
  });

  // Delete activity event (notes)
  app.delete("/api/customer-activity/events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      await db.delete(customerActivityEvents).where(eq(customerActivityEvents.id, eventId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting activity event:", error);
      res.status(500).json({ error: "Failed to delete activity event" });
    }
  });

  // Follow-up Tasks - list all or by customer
  app.get("/api/customer-activity/follow-ups", isAuthenticated, async (req, res) => {
    try {
      const { customerId, status } = req.query;
      let tasks;
      
      if (customerId) {
        tasks = await storage.getFollowUpTasksByCustomer(customerId as string);
      } else if (status === 'pending') {
        tasks = await storage.getPendingFollowUpTasks();
      } else {
        tasks = await storage.getPendingFollowUpTasks();
      }
      
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching follow-up tasks:", error);
      res.status(500).json({ error: "Failed to fetch follow-up tasks" });
    }
  });

  // Create follow-up task
  app.post("/api/customer-activity/follow-ups", isAuthenticated, async (req: any, res) => {
    try {
      const task = await storage.createFollowUpTask({
        ...req.body,
        assignedTo: req.body.assignedTo || req.user?.id,
        assignedToName: req.body.assignedToName || (req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user?.email),
      });
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating follow-up task:", error);
      res.status(500).json({ error: "Failed to create follow-up task" });
    }
  });

  // Update follow-up task
  app.patch("/api/customer-activity/follow-ups/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.updateFollowUpTask(id, req.body);
      
      if (!task) {
        return res.status(404).json({ error: "Follow-up task not found" });
      }
      
      res.json(task);
    } catch (error) {
      console.error("Error updating follow-up task:", error);
      res.status(500).json({ error: "Failed to update follow-up task" });
    }
  });

  // Complete follow-up task
  app.post("/api/customer-activity/follow-ups/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { notes } = req.body;
      const completedBy = req.user?.id;
      
      const task = await storage.completeFollowUpTask(id, completedBy, notes);
      
      if (!task) {
        return res.status(404).json({ error: "Follow-up task not found" });
      }
      
      res.json(task);
    } catch (error) {
      console.error("Error completing follow-up task:", error);
      res.status(500).json({ error: "Failed to complete follow-up task" });
    }
  });

  // Get today's follow-up tasks
  app.get("/api/customer-activity/follow-ups/today", isAuthenticated, async (req, res) => {
    try {
      const tasks = await storage.getTodayFollowUpTasks();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching today's tasks:", error);
      res.status(500).json({ error: "Failed to fetch today's tasks" });
    }
  });

  // Get overdue follow-up tasks
  app.get("/api/customer-activity/follow-ups/overdue", isAuthenticated, async (req, res) => {
    try {
      const tasks = await storage.getOverdueFollowUpTasks();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching overdue tasks:", error);
      res.status(500).json({ error: "Failed to fetch overdue tasks" });
    }
  });

  // Product Exposure - list by customer
  app.get("/api/customer-activity/product-exposure", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.query;
      
      if (!customerId) {
        return res.status(400).json({ error: "customerId query parameter is required" });
      }
      
      const exposures = await storage.getProductExposureByCustomer(customerId as string);
      res.json(exposures);
    } catch (error) {
      console.error("Error fetching product exposures:", error);
      res.status(500).json({ error: "Failed to fetch product exposures" });
    }
  });

  // Create product exposure
  app.post("/api/customer-activity/product-exposure", isAuthenticated, async (req: any, res) => {
    try {
      const exposure = await storage.createProductExposure({
        ...req.body,
        sharedBy: req.user?.id,
        sharedByName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user?.email,
      });
      res.status(201).json(exposure);
    } catch (error) {
      console.error("Error creating product exposure:", error);
      res.status(500).json({ error: "Failed to create product exposure" });
    }
  });

  // Get engagement summary for customer
  app.get("/api/customer-activity/summary/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      const summary = await storage.getEngagementSummary(customerId);
      
      if (!summary) {
        return res.json({
          customerId,
          lastContactDate: null,
          daysSinceLastContact: null,
          totalContactsLast30Days: 0,
          totalContactsLast90Days: 0,
          totalQuotesSent: 0,
          quotesLast30Days: 0,
          lastQuoteDate: null,
          openQuotesCount: 0,
          quotesWithoutFollowUp: 0,
          totalSamplesSent: 0,
          samplesLast90Days: 0,
          lastSampleDate: null,
          samplesWithoutConversion: 0,
          productsExposedCount: 0,
          productCategoriesExposed: [],
          engagementScore: 0,
          engagementTrend: 'stable',
          needsAttention: false,
          attentionReason: null,
        });
      }
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching engagement summary:", error);
      res.status(500).json({ error: "Failed to fetch engagement summary" });
    }
  });

  // Get follow-up configuration
  app.get("/api/customer-activity/config", isAuthenticated, async (req, res) => {
    try {
      let config = await storage.getFollowUpConfig();
      
      if (config.length === 0) {
        await storage.initDefaultFollowUpConfig();
        config = await storage.getFollowUpConfig();
      }
      
      res.json(config);
    } catch (error) {
      console.error("Error fetching follow-up config:", error);
      res.status(500).json({ error: "Failed to fetch follow-up config" });
    }
  });

  // Update follow-up configuration
  app.post("/api/customer-activity/config", isAuthenticated, async (req, res) => {
    try {
      const { eventType, ...configData } = req.body;
      
      if (!eventType) {
        return res.status(400).json({ error: "eventType is required" });
      }
      
      const config = await storage.updateFollowUpConfig(eventType, configData);
      res.json(config);
    } catch (error) {
      console.error("Error updating follow-up config:", error);
      res.status(500).json({ error: "Failed to update follow-up config" });
    }
  });

  // Get idle accounts (no activity in 30+ days)
  app.get("/api/customer-activity/idle-accounts", isAuthenticated, async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const idleAccounts = [];
      for (const customer of customers) {
        const events = await storage.getActivityEventsByCustomer(customer.id);
        const lastEvent = events[0];
        
        if (!lastEvent) {
          idleAccounts.push({
            customer,
            lastActivity: null,
            daysSinceActivity: null,
          });
        } else {
          const lastActivityDate = lastEvent.eventDate 
            ? new Date(lastEvent.eventDate) 
            : (lastEvent.createdAt ? new Date(lastEvent.createdAt) : null);
          
          if (!lastActivityDate || lastActivityDate < thirtyDaysAgo) {
            const daysSinceActivity = lastActivityDate 
              ? Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
              : null;
            idleAccounts.push({
              customer,
              lastActivity: lastActivityDate?.toISOString() || null,
              daysSinceActivity,
            });
          }
        }
      }
      
      res.json(idleAccounts);
    } catch (error) {
      console.error("Error fetching idle accounts:", error);
      res.status(500).json({ error: "Failed to fetch idle accounts" });
    }
  });

  // Get pending samples (samples shipped but not followed up)
  app.get("/api/customer-activity/pending-samples", isAuthenticated, async (req, res) => {
    try {
      const [sampleRequests, allFollowUpTasks] = await Promise.all([
        storage.getSampleRequests(),
        storage.getPendingFollowUpTasks(),
      ]);
      
      const sampleFollowUpIds = new Set(
        allFollowUpTasks
          .filter(t => (t.taskType?.includes('sample') || t.sourceType === 'sample') && t.sourceId)
          .map(t => String(t.sourceId))
      );
      
      const pendingSamples = sampleRequests.filter(sample => {
        const isActive = sample.status === 'shipped' || sample.status === 'pending';
        const hasNoFollowUp = !sampleFollowUpIds.has(String(sample.id));
        return isActive && hasNoFollowUp;
      });
      
      res.json(pendingSamples);
    } catch (error) {
      console.error("Error fetching pending samples:", error);
      res.status(500).json({ error: "Failed to fetch pending samples" });
    }
  });

  // Get dashboard stats summary - OPTIMIZED to avoid N+1 queries
  app.get("/api/customer-activity/dashboard-stats", isAuthenticated, async (req, res) => {
    try {
      const [todayTasks, overdueTasks, pendingTasks, sampleRequests, allFollowUpTasks, customerCount] = await Promise.all([
        storage.getTodayFollowUpTasks(),
        storage.getOverdueFollowUpTasks(),
        storage.getPendingFollowUpTasks(),
        storage.getSampleRequests(),
        storage.getPendingFollowUpTasks(),
        storage.getCustomerCount(),
      ]);

      // Calculate idle accounts using a single aggregated query instead of N+1
      const idleAccountsCount = await storage.getIdleAccountsCount(30);
      
      const sampleFollowUpIds = new Set(
        allFollowUpTasks
          .filter(t => (t.taskType?.includes('sample') || t.sourceType === 'sample') && t.sourceId)
          .map(t => String(t.sourceId))
      );
      
      const pendingSamplesCount = sampleRequests.filter(s => {
        const isActive = s.status === 'shipped' || s.status === 'pending';
        const hasNoFollowUp = !sampleFollowUpIds.has(String(s.id));
        return isActive && hasNoFollowUp;
      }).length;

      res.json({
        todayTasks: todayTasks.length,
        overdueTasks: overdueTasks.length,
        pendingTasks: pendingTasks.length,
        idleAccounts: idleAccountsCount,
        pendingSamples: pendingSamplesCount,
        recentActivity: 0,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // ========================================
  // Tutorial Progress Endpoints
  // ========================================

  // Get user's tutorial progress
  app.get("/api/tutorials/progress", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const progress = await storage.getUserTutorialProgress(userEmail);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching tutorial progress:", error);
      res.status(500).json({ error: "Failed to fetch tutorial progress" });
    }
  });

  // Create or update tutorial progress
  app.post("/api/tutorials/progress", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const { tutorialId, status, currentStep, totalSteps, startedAt } = req.body;
      
      if (!tutorialId) {
        return res.status(400).json({ error: "tutorialId is required" });
      }
      
      const existing = await storage.getTutorialProgress(userEmail, tutorialId);
      
      if (existing) {
        const updated = await storage.updateTutorialProgress(userEmail, tutorialId, {
          status,
          currentStep,
          startedAt: startedAt ? new Date(startedAt) : undefined,
        });
        return res.json(updated);
      }
      
      const progress = await storage.createTutorialProgress({
        userEmail,
        tutorialId,
        status: status || "in_progress",
        currentStep: currentStep || 0,
        totalSteps: totalSteps || 1,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
      });
      
      res.json(progress);
    } catch (error) {
      console.error("Error creating tutorial progress:", error);
      res.status(500).json({ error: "Failed to create tutorial progress" });
    }
  });

  // Update tutorial progress
  app.patch("/api/tutorials/progress/:tutorialId", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const { tutorialId } = req.params;
      const { status, currentStep, completedAt, skippedAt, startedAt } = req.body;
      
      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (currentStep !== undefined) updateData.currentStep = currentStep;
      if (completedAt !== undefined) updateData.completedAt = completedAt ? new Date(completedAt) : null;
      if (skippedAt !== undefined) updateData.skippedAt = skippedAt ? new Date(skippedAt) : null;
      if (startedAt !== undefined) updateData.startedAt = startedAt ? new Date(startedAt) : null;
      
      const progress = await storage.updateTutorialProgress(userEmail, tutorialId, updateData);
      
      if (!progress) {
        return res.status(404).json({ error: "Tutorial progress not found" });
      }
      
      res.json(progress);
    } catch (error) {
      console.error("Error updating tutorial progress:", error);
      res.status(500).json({ error: "Failed to update tutorial progress" });
    }
  });

  // ========================================
  // Email Templates API
  // ========================================

  // Get all email templates

  // Get single email template

  // Helper function to auto-detect variables from template content
  const extractTemplateVariables = (subject: string, body: string): string[] => {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const foundVars = new Set<string>();
    
    // Extract from subject
    let match;
    while ((match = variablePattern.exec(subject)) !== null) {
      foundVars.add(match[1].trim());
    }
    
    // Reset regex state and extract from body
    variablePattern.lastIndex = 0;
    while ((match = variablePattern.exec(body)) !== null) {
      foundVars.add(match[1].trim());
    }
    
    return Array.from(foundVars);
  };

  // Create email template (admin only)

  // Update email template (owner or admin)

  // Delete email template (owner or admin)

  // Render email template with variables

  // Get email sends history

  // ========================================
  // EMAIL SIGNATURE APIs
  // ========================================

  // Get current user's email signature

  // Create or update email signature

  // Delete email signature

  // ========================================
  // EMAIL TRACKING APIs (PUBLIC - no auth required)
  // ========================================

  // Tracking pixel endpoint - logs email opens
  // Accessed via <img src="/api/t/open/:token.png"> in emails
  app.get("/api/t/open/:token.png", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Look up the tracking token
      const trackingToken = await storage.getEmailTrackingTokenByToken(token);
      
      if (trackingToken) {
        // Record the open event
        const ipAddress = req.headers['x-forwarded-for'] as string || req.ip;
        const userAgent = req.headers['user-agent'] || undefined;
        
        await storage.recordEmailOpenEvent(trackingToken.id, ipAddress, userAgent);
        
        // Create follow-up task on first open
        if (trackingToken.openCount === 0 && trackingToken.customerId) {
          try {
            await storage.createFollowUpTask({
              customerId: trackingToken.customerId,
              taskType: 'email_engagement',
              title: `Email Opened: ${trackingToken.subject || 'Email'}`,
              description: `Customer opened the email "${trackingToken.subject}". Consider following up.`,
              priority: 'normal',
              status: 'pending',
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24 hours
              assignedTo: trackingToken.sentBy || undefined,
              isAutoGenerated: true,
            });
          } catch (taskError) {
            console.error('Error creating follow-up task for email open:', taskError);
          }
        }
        
        console.log(`Email open tracked: token=${token}, customer=${trackingToken.customerId}`);
      } else {
        console.log(`Unknown tracking token: ${token}`);
      }
      
      // Return a 1x1 transparent GIF
      const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set({
        'Content-Type': 'image/gif',
        'Content-Length': transparentGif.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.send(transparentGif);
    } catch (error) {
      console.error("Error tracking email open:", error);
      // Still return the transparent GIF to avoid broken images
      const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set({ 'Content-Type': 'image/gif' });
      res.send(transparentGif);
    }
  });

  // Link click redirect endpoint - logs clicks and redirects
  // Accessed via /api/t/click/:token?url=<encoded_url>&text=<link_text>
  app.get("/api/t/click/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { url, text } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).send('Missing redirect URL');
      }
      
      const decodedUrl = decodeURIComponent(url);

      // Security: only redirect to allowed domains to prevent open-redirect abuse
      const ALLOWED_REDIRECT_HOSTS = ['4sgraphics.com', 'quote.4sgraphics.com'];
      try {
        const parsed = new URL(decodedUrl);
        const host = parsed.hostname.toLowerCase();
        if (!ALLOWED_REDIRECT_HOSTS.includes(host)) {
          console.warn(`[TrackingClick] Blocked redirect to disallowed host: ${host}`);
          return res.status(400).send('Redirect target not allowed');
        }
      } catch {
        return res.status(400).send('Invalid redirect URL');
      }

      // Look up the tracking token
      const trackingToken = await storage.getEmailTrackingTokenByToken(token);
      
      if (trackingToken) {
        // Record the click event
        const ipAddress = req.headers['x-forwarded-for'] as string || req.ip;
        const userAgent = req.headers['user-agent'] || undefined;
        const linkText = typeof text === 'string' ? decodeURIComponent(text) : undefined;
        
        await storage.recordEmailClickEvent(trackingToken.id, decodedUrl, linkText, ipAddress, userAgent);
        
        // Create follow-up task on first click
        if (trackingToken.clickCount === 0 && trackingToken.customerId) {
          try {
            await storage.createFollowUpTask({
              customerId: trackingToken.customerId,
              taskType: 'email_engagement',
              title: `Email Link Clicked: ${trackingToken.subject || 'Email'}`,
              description: `Customer clicked a link in "${trackingToken.subject}": ${linkText || decodedUrl}. High engagement - consider immediate follow-up!`,
              priority: 'high',
              status: 'pending',
              dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // Due in 4 hours for clicks
              assignedTo: trackingToken.sentBy || undefined,
              isAutoGenerated: true,
            });
          } catch (taskError) {
            console.error('Error creating follow-up task for email click:', taskError);
          }
        }
        
        console.log(`Email click tracked: token=${token}, url=${decodedUrl}, customer=${trackingToken.customerId}`);
      } else {
        console.log(`Unknown tracking token for click: ${token}`);
      }
      
      // Redirect to the original URL
      res.redirect(302, decodedUrl);
    } catch (error) {
      console.error("Error tracking email click:", error);
      res.status(500).send('Error processing redirect');
    }
  });

  // Get email tracking stats for a customer (authenticated)

  // ========================================
  // DRIP CAMPAIGN APIs
  // ========================================

  // Get all drip campaigns

  // Get assignment counts for all campaigns

  // Get single drip campaign with steps

  // Create drip campaign (admin only)

  // Update drip campaign (admin only)

  // Delete drip campaign (admin only)

  // ========================================
  // DRIP CAMPAIGN STEPS APIs
  // ========================================

  // Get steps for a campaign

  // Create step (admin only)

  // Update step (admin only)

  // Delete step (admin only)

  // Reorder steps (admin only)

  // ========================================
  // DRIP CAMPAIGN ASSIGNMENTS APIs
  // ========================================
  // TEST-SEND: send one step to the logged-in user with real recipient data
  // ========================================

  // ========================================

  // Get assignments for a campaign or customer

  // Get enriched assignments for a campaign (with contact names + step progress)

  // Get all drip campaign assignments for a specific lead

  // Assign customers or leads to a campaign
  
  // Helper function to schedule steps for an assignment
  // Get step statuses for an assignment

  // ========================================
  // MEDIA UPLOAD APIs for Drip Emails
  // ========================================

  // Get all media uploads
  app.get("/api/media", isAuthenticated, async (req: any, res) => {
    try {
      const uploads = await storage.getMediaUploads();
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching media uploads:", error);
      res.status(500).json({ error: "Failed to fetch media uploads" });
    }
  });

  // Upload media file
  app.post("/api/media/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { originalname, filename, mimetype, size, path: filePath } = req.file;
      
      // Generate URL for the uploaded file
      const url = `/uploads/${filename}`;
      
      const mediaUpload = await storage.createMediaUpload({
        filename,
        originalName: originalname,
        mimeType: mimetype,
        size,
        url,
        uploadedBy: req.user?.email,
        usedIn: req.body.usedIn || 'drip_email',
      });
      
      res.json(mediaUpload);
    } catch (error) {
      console.error("Error uploading media:", error);
      res.status(500).json({ error: "Failed to upload media" });
    }
  });

  // Delete media file (admin only)
  app.delete("/api/media/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteMediaUpload(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting media:", error);
      res.status(500).json({ error: "Failed to delete media" });
    }
  });

  // ========================================
  // COACH-STYLE B2B CUSTOMER JOURNEY APIs
  // ========================================

  // Get category trust for a customer
  app.get("/api/crm/category-trust/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      const trusts = await db.select().from(categoryTrust).where(eq(categoryTrust.customerId, customerId));
      res.json(trusts);
    } catch (error) {
      console.error("Error fetching category trust:", error);
      res.status(500).json({ error: "Failed to fetch category trust" });
    }
  });

  // Create or update category trust (click-based progression)
  app.post("/api/crm/category-trust", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, categoryName, categoryCode, machineType, trustLevel, notes } = req.body;
      
      if (!customerId || (!categoryName && !categoryCode)) {
        return res.status(400).json({ error: "customerId and categoryName or categoryCode are required" });
      }

      // Generate categoryCode from categoryName if not provided, or vice versa
      const finalCategoryCode = categoryCode || (categoryName ? categoryName.toUpperCase().replace(/[^A-Z0-9]/g, '_') : '');
      const finalCategoryName = categoryName || categoryCode || '';
      
      if (!finalCategoryCode) {
        return res.status(400).json({ error: "Unable to determine category code" });
      }

      // Check if trust record exists
      const existing = await db.select().from(categoryTrust)
        .where(sql`${categoryTrust.customerId} = ${customerId} AND (${categoryTrust.categoryCode} = ${finalCategoryCode} OR ${categoryTrust.categoryName} = ${finalCategoryName}) AND COALESCE(${categoryTrust.machineType}, '') = COALESCE(${machineType || ''}, '')`);

      let result;
      if (existing.length > 0) {
        // Update existing
        result = await db.update(categoryTrust)
          .set({ 
            trustLevel: trustLevel || existing[0].trustLevel,
            notes: notes !== undefined ? notes : existing[0].notes,
            updatedBy: req.user?.email,
            updatedAt: new Date()
          })
          .where(eq(categoryTrust.id, existing[0].id))
          .returning();
      } else {
        // Create new
        result = await db.insert(categoryTrust).values({
          customerId,
          categoryCode: finalCategoryCode,
          categoryName: finalCategoryName,
          machineType: machineType || null,
          trustLevel: trustLevel || 'unknown',
          notes,
          updatedBy: req.user?.email,
        }).returning();
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error creating/updating category trust:", error);
      res.status(500).json({ error: "Failed to update category trust" });
    }
  });

  // Advance trust level (single click progression)
  app.post("/api/crm/category-trust/:id/advance", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const existing = await db.select().from(categoryTrust).where(eq(categoryTrust.id, parseInt(id)));
      if (existing.length === 0) {
        return res.status(404).json({ error: "Category trust not found" });
      }

      const current = existing[0];
      const currentIndex = TRUST_LEVELS.indexOf(current.trustLevel as any);
      const nextIndex = Math.min(currentIndex + 1, TRUST_LEVELS.length - 1);
      const nextLevel = TRUST_LEVELS[nextIndex];

      const result = await db.update(categoryTrust)
        .set({ 
          trustLevel: nextLevel,
          updatedBy: req.user?.email,
          updatedAt: new Date()
        })
        .where(eq(categoryTrust.id, parseInt(id)))
        .returning();

      res.json(result[0]);
    } catch (error) {
      console.error("Error advancing trust level:", error);
      res.status(500).json({ error: "Failed to advance trust level" });
    }
  });

  // Log conversation outcome from coach modal
  app.post("/api/crm/conversation-outcome/:customerId", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { outcome, reason, stalledCategories } = req.body;

      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // Log the call event
      await db.insert(customerActivityEvents).values({
        customerId,
        eventType: 'call_made',
        title: `Coaching call - ${outcome === 'next_step_agreed' ? 'Positive' : outcome === 'still_undecided' ? 'Undecided' : 'Not moving forward'}`,
        description: reason ? `Reason: ${reason}. Categories discussed: ${stalledCategories?.join(', ') || 'General'}` : `Categories discussed: ${stalledCategories?.join(', ') || 'General'}`,
        sourceType: 'manual',
        createdBy: req.user?.email,
        createdByName: req.user?.email,
        eventDate: new Date(),
      });

      // Handle outcomes
      if (outcome === 'not_moving_forward') {
        // Set pause date (60 days for prospect, 30 for others)
        const pauseDays = 60;
        const pauseUntil = new Date();
        pauseUntil.setDate(pauseUntil.getDate() + pauseDays);

        await db.update(customers)
          .set({ 
            pausedUntil: pauseUntil,
            pauseReason: reason || 'not_moving_forward',
            updatedAt: new Date()
          })
          .where(eq(customers.id, customerId));

        // Mark any open quotes as closed-lost
        await db.update(quoteCategoryLinks)
          .set({ 
            followUpStage: 'closed',
            outcome: 'lost',
            updatedAt: new Date()
          })
          .where(sql`${quoteCategoryLinks.customerId} = ${customerId} AND ${quoteCategoryLinks.followUpStage} != 'closed'`);

        res.json({ 
          success: true, 
          action: 'paused', 
          pausedUntil: pauseUntil,
          message: `Account paused until ${pauseUntil.toLocaleDateString()}`
        });

      } else if (outcome === 'still_undecided') {
        // Log objection if reason provided
        if (reason && stalledCategories?.length > 0) {
          for (const categoryName of stalledCategories) {
            await db.insert(categoryObjections).values({
              customerId,
              categoryName,
              objectionType: reason,
              status: 'open',
              createdBy: req.user?.email,
            }).onConflictDoNothing();
          }
        }

        res.json({ 
          success: true, 
          action: 'logged', 
          message: 'Status updated. Consider next follow-up action.'
        });

      } else if (outcome === 'next_step_agreed') {
        // Clear any pause and advance categories if stalled
        await db.update(customers)
          .set({ 
            pausedUntil: null,
            pauseReason: null,
            updatedAt: new Date()
          })
          .where(eq(customers.id, customerId));

        res.json({ 
          success: true, 
          action: 'advanced', 
          message: 'Progress recorded. Next step agreed.'
        });
      }

    } catch (error) {
      console.error("Error logging conversation outcome:", error);
      res.status(500).json({ error: "Failed to log conversation outcome" });
    }
  });

  // Get coach state for a customer (enhanced with quote/test follow-ups)
  app.get("/api/crm/coach-state/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      const state = await db.select().from(customerCoachState).where(eq(customerCoachState.customerId, customerId));
      
      if (state.length === 0) {
        // Return calculated state based on customer data
        const customer = await storage.getCustomer(customerId);
        if (!customer) {
          return res.status(404).json({ error: "Customer not found" });
        }

        // Calculate state from existing data
        const samples = await storage.getSampleRequestsByCustomerId(customerId);
        const quotes = await db.select().from(quoteEvents).where(eq(quoteEvents.customerId, customerId));
        
        // === ENHANCED: Check for pending quote follow-ups ===
        const pendingQuoteFollowUps = await db.select().from(quoteCategoryLinks)
          .where(sql`${quoteCategoryLinks.customerId} = ${customerId} AND ${quoteCategoryLinks.followUpStage} != 'closed' AND ${quoteCategoryLinks.nextFollowUpDue} IS NOT NULL`);
        
        const now = new Date();
        const overdueFollowUps = pendingQuoteFollowUps.filter(q => q.nextFollowUpDue && new Date(q.nextFollowUpDue) <= now);
        const upcomingFollowUps = pendingQuoteFollowUps.filter(q => q.nextFollowUpDue && new Date(q.nextFollowUpDue) > now);
        
        let currentState: string = 'prospect';
        let nudgeAction: string | null = null;
        let nudgeReason: string | null = null;
        let nudgePriority: string = 'normal';

        const totalOrders = parseInt(customer.totalOrders || '0');
        const hasSamples = samples.length > 0;
        const hasQuotes = quotes.length > 0 || pendingQuoteFollowUps.length > 0;

        // === PRIORITY: Overdue quote follow-ups take precedence ===
        if (overdueFollowUps.length > 0) {
          const urgent = overdueFollowUps.sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0))[0];
          currentState = 'engaged';
          nudgeAction = 'follow_up_quote';
          nudgeReason = `Quote ${urgent.quoteNumber} follow-up overdue (${urgent.categoryName})`;
          nudgePriority = 'high';
        } else if (totalOrders >= 5) {
          currentState = 'loyal';
          nudgeAction = 'celebrate_milestone';
          nudgeReason = `${totalOrders} orders placed - maintain relationship`;
        } else if (totalOrders >= 2) {
          currentState = 'repeat';
          nudgeAction = 'check_reorder';
          nudgeReason = 'Check if reorder is due';
        } else if (totalOrders >= 1) {
          currentState = 'ordered';
          nudgeAction = 'follow_up_quote';
          nudgeReason = 'Follow up on first order experience';
        } else if (upcomingFollowUps.length > 0) {
          const next = upcomingFollowUps.sort((a, b) => 
            new Date(a.nextFollowUpDue!).getTime() - new Date(b.nextFollowUpDue!).getTime()
          )[0];
          currentState = 'engaged';
          nudgeAction = 'follow_up_quote';
          const daysUntil = Math.ceil((new Date(next.nextFollowUpDue!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          nudgeReason = `Quote ${next.quoteNumber} follow-up in ${daysUntil} days (${next.categoryName})`;
          nudgePriority = daysUntil <= 1 ? 'high' : 'normal';
        } else if (hasSamples) {
          currentState = 'sampled';
          nudgeAction = 'follow_up_sample';
          nudgeReason = 'Follow up on sample feedback';
        } else if (hasQuotes) {
          currentState = 'engaged';
          nudgeAction = 'send_sample';
          nudgeReason = 'Quote sent - offer samples to test';
        } else {
          currentState = 'prospect';
          nudgeAction = 'send_swatchbook';
          nudgeReason = 'New contact - introduce with SwatchBook';
        }

        return res.json({
          customerId,
          currentState,
          stateConfidence: 80,
          totalOrders,
          nextNudgeAction: nudgeAction,
          nextNudgeReason: nudgeReason,
          nextNudgePriority: nudgePriority,
          pendingQuoteFollowUps: pendingQuoteFollowUps.length,
          overdueFollowUps: overdueFollowUps.length,
          isCalculated: true, // Flag that this is computed, not stored
        });
      }

      res.json(state[0]);
    } catch (error) {
      console.error("Error fetching coach state:", error);
      res.status(500).json({ error: "Failed to fetch coach state" });
    }
  });

  // Update coach state (after rep takes action)
  app.post("/api/crm/coach-state/:customerId/action", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { action, notes } = req.body;

      // Log the action taken
      await storage.createActivityEvent({
        customerId,
        eventType: action,
        title: `Coach Action: ${COACH_NUDGE_ACTIONS[action as keyof typeof COACH_NUDGE_ACTIONS]?.label || action}`,
        description: notes,
        createdBy: req.user?.email,
      });

      // Recalculate and update state
      const customer = await storage.getCustomer(customerId);
      const samples = await storage.getSampleRequestsByCustomerId(customerId);
      const quotes = await db.select().from(quoteEvents).where(eq(quoteEvents.customerId, customerId));
      
      const totalOrders = parseInt(customer?.totalOrders || '0');
      const hasSamples = samples.length > 0;
      const hasQuotes = quotes.length > 0;

      let currentState = 'prospect';
      let nudgeAction: string | null = null;
      let nudgeReason: string | null = null;

      if (totalOrders >= 5) {
        currentState = 'loyal';
      } else if (totalOrders >= 2) {
        currentState = 'repeat';
        nudgeAction = 'check_reorder';
        nudgeReason = 'Monitor reorder timing';
      } else if (totalOrders >= 1) {
        currentState = 'ordered';
        nudgeAction = 'send_quote';
        nudgeReason = 'Encourage repeat order';
      } else if (hasSamples) {
        currentState = 'sampled';
        nudgeAction = 'follow_up_sample';
        nudgeReason = 'Get sample feedback';
      } else if (hasQuotes || action === 'send_quote') {
        currentState = 'engaged';
        nudgeAction = 'send_sample';
        nudgeReason = 'Offer samples to test';
      } else if (action === 'send_swatchbook') {
        currentState = 'engaged';
        nudgeAction = 'send_quote';
        nudgeReason = 'SwatchBook sent - follow up with quote';
      }

      // Upsert coach state
      const existing = await db.select().from(customerCoachState).where(eq(customerCoachState.customerId, customerId));
      
      if (existing.length > 0) {
        await db.update(customerCoachState)
          .set({
            currentState,
            nextNudgeAction: nudgeAction,
            nextNudgeReason: nudgeReason,
            daysSinceLastContact: 0,
            lastCalculated: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(customerCoachState.customerId, customerId));
      } else {
        await db.insert(customerCoachState).values({
          customerId,
          currentState,
          nextNudgeAction: nudgeAction,
          nextNudgeReason: nudgeReason,
          totalOrders,
        });
      }

      res.json({ success: true, currentState, nextNudgeAction: nudgeAction });
    } catch (error) {
      console.error("Error recording coach action:", error);
      res.status(500).json({ error: "Failed to record action" });
    }
  });

  // ========================================
  // CUSTOMER JOURNEY PROGRESS (Horizontal Progress Indicator)
  // ========================================

  // Get journey progress summary for a customer
  app.get("/api/crm/journey-progress/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;

      // Get machine profiles count
      const machines = await db.select().from(customerMachineProfiles)
        .where(eq(customerMachineProfiles.customerId, customerId));
      const hasMachineProfile = machines.length > 0;

      // Get swatch books sent count
      const swatchBooks = await db.select().from(swatchBookShipments)
        .where(eq(swatchBookShipments.customerId, customerId));
      const swatchBooksCount = swatchBooks.length;

      // Get quotes sent count (using quoteEvents which has customerId)
      const quotes = await db.select().from(quoteEvents)
        .where(eq(quoteEvents.customerId, customerId));
      const quotesCount = quotes.length;

      // Get press kits sent count
      const pressKits = await db.select().from(pressKitShipments)
        .where(eq(pressKitShipments.customerId, customerId));
      const pressKitsCount = pressKits.length;

      // Get emails sent count
      const emails = await db.select().from(emailSends)
        .where(eq(emailSends.customerId, customerId));
      const emailsCount = emails.length;

      // Get manually tracked stages (call, rep_visit, buyer, try_and_try, dont_worry)
      const manualStages = await db.select().from(customerJourneyProgress)
        .where(eq(customerJourneyProgress.customerId, customerId));
      
      const manualStageMap: Record<string, boolean> = {};
      manualStages.forEach(stage => {
        if (stage.completedAt) {
          manualStageMap[stage.stage] = true;
        }
      });

      // Build the summary
      const journeySummary = {
        stages: {
          machine_profile: { completed: hasMachineProfile, count: machines.length },
          swatch_book: { completed: swatchBooksCount > 0, count: swatchBooksCount },
          quotes: { completed: quotesCount > 0, count: quotesCount },
          press_kit: { completed: pressKitsCount > 0, count: pressKitsCount },
          call: { completed: !!manualStageMap['call'], count: manualStageMap['call'] ? 1 : 0 },
          email: { completed: emailsCount > 0, count: emailsCount },
          rep_visit: { completed: !!manualStageMap['rep_visit'], count: manualStageMap['rep_visit'] ? 1 : 0 },
          buyer: { completed: !!manualStageMap['buyer'], count: manualStageMap['buyer'] ? 1 : 0 },
          try_and_try: { completed: !!manualStageMap['try_and_try'], count: manualStageMap['try_and_try'] ? 1 : 0 },
          dont_worry: { completed: !!manualStageMap['dont_worry'], count: manualStageMap['dont_worry'] ? 1 : 0 },
        },
        totalCompleted: [
          hasMachineProfile,
          swatchBooksCount > 0,
          quotesCount > 0,
          pressKitsCount > 0,
          !!manualStageMap['call'],
          emailsCount > 0,
          !!manualStageMap['rep_visit'],
          !!manualStageMap['buyer'],
          !!manualStageMap['try_and_try'],
          !!manualStageMap['dont_worry'],
        ].filter(Boolean).length,
        totalStages: 10,
      };

      res.json(journeySummary);
    } catch (error) {
      console.error("Error fetching journey progress:", error);
      res.status(500).json({ error: "Failed to fetch journey progress" });
    }
  });

  // Mark a journey stage as completed
  app.post("/api/crm/journey-progress/:customerId/complete", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { stage, notes } = req.body;

      // Validate stage
      if (!JOURNEY_PROGRESS_STAGES.includes(stage)) {
        return res.status(400).json({ error: "Invalid journey stage" });
      }

      // Check if already exists
      const existing = await db.select().from(customerJourneyProgress)
        .where(sql`${customerJourneyProgress.customerId} = ${customerId} AND ${customerJourneyProgress.stage} = ${stage}`);

      if (existing.length > 0) {
        // Update existing
        await db.update(customerJourneyProgress)
          .set({
            completedAt: new Date(),
            completedBy: req.user?.email,
            notes,
            updatedAt: new Date(),
          })
          .where(eq(customerJourneyProgress.id, existing[0].id));
      } else {
        // Create new
        await db.insert(customerJourneyProgress).values({
          customerId,
          stage,
          completedAt: new Date(),
          completedBy: req.user?.email,
          notes,
        });
      }

      res.json({ success: true, stage, completed: true });
    } catch (error) {
      console.error("Error marking journey stage complete:", error);
      res.status(500).json({ error: "Failed to mark stage complete" });
    }
  });

  // Uncomplete a journey stage
  app.post("/api/crm/journey-progress/:customerId/uncomplete", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { stage } = req.body;

      const existing = await db.select().from(customerJourneyProgress)
        .where(sql`${customerJourneyProgress.customerId} = ${customerId} AND ${customerJourneyProgress.stage} = ${stage}`);

      if (existing.length > 0) {
        await db.update(customerJourneyProgress)
          .set({
            completedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(customerJourneyProgress.id, existing[0].id));
      }

      res.json({ success: true, stage, completed: false });
    } catch (error) {
      console.error("Error uncompleting journey stage:", error);
      res.status(500).json({ error: "Failed to uncomplete stage" });
    }
  });

  // ========================================
  // QUOTE CATEGORY LINKS (Quote Follow-up Tracking)
  // ========================================

  // Get all quote category links for a customer
  app.get("/api/crm/quote-category-links/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      const links = await db.select().from(quoteCategoryLinks)
        .where(eq(quoteCategoryLinks.customerId, customerId));
      res.json(links);
    } catch (error) {
      console.error("Error fetching quote category links:", error);
      res.status(500).json({ error: "Failed to fetch quote category links" });
    }
  });

  // Advance follow-up stage for a quote category link
  app.post("/api/crm/quote-category-links/:id/advance", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const existing = await db.select().from(quoteCategoryLinks)
        .where(eq(quoteCategoryLinks.id, parseInt(id)));
      
      if (existing.length === 0) {
        return res.status(404).json({ error: "Quote category link not found" });
      }

      const current = existing[0];
      const stageOrder = ['initial', 'second', 'final', 'expired', 'closed'];
      const currentIndex = stageOrder.indexOf(current.followUpStage);
      
      if (currentIndex >= 3) {
        return res.status(400).json({ error: "Follow-up already at final stage" });
      }

      const nextStage = stageOrder[currentIndex + 1];
      const nextFollowUpDue = new Date();
      
      // Set next follow-up date based on stage
      if (nextStage === 'second') {
        nextFollowUpDue.setDate(nextFollowUpDue.getDate() + 5); // 7-10 days total
      } else if (nextStage === 'final') {
        nextFollowUpDue.setDate(nextFollowUpDue.getDate() + 7); // 14+ days total
      }

      const result = await db.update(quoteCategoryLinks)
        .set({
          followUpStage: nextStage,
          nextFollowUpDue: nextStage === 'expired' || nextStage === 'closed' ? null : nextFollowUpDue,
          followUpCount: (current.followUpCount || 0) + 1,
          lastFollowUpDate: new Date(),
          urgencyScore: (current.urgencyScore || 30) + 20, // Increase urgency with each follow-up
          notes: notes || current.notes,
          updatedAt: new Date()
        })
        .where(eq(quoteCategoryLinks.id, parseInt(id)))
        .returning();

      // Log the follow-up activity
      if (current.customerId) {
        await storage.createActivityEvent({
          customerId: current.customerId,
          eventType: 'quote_follow_up',
          title: `Quote ${current.quoteNumber} Follow-up (${nextStage})`,
          description: `Category: ${current.categoryName}${notes ? `. Notes: ${notes}` : ''}`,
          createdBy: req.user?.email,
        });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error advancing follow-up stage:", error);
      res.status(500).json({ error: "Failed to advance follow-up stage" });
    }
  });

  // Close follow-up (quote won or lost)
  app.post("/api/crm/quote-category-links/:id/close", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { outcome, notes, advanceTrust } = req.body;

      const existing = await db.select().from(quoteCategoryLinks)
        .where(eq(quoteCategoryLinks.id, parseInt(id)));
      
      if (existing.length === 0) {
        return res.status(404).json({ error: "Quote category link not found" });
      }

      const current = existing[0];
      
      const result = await db.update(quoteCategoryLinks)
        .set({
          followUpStage: 'closed',
          nextFollowUpDue: null,
          notes: notes || current.notes,
          updatedAt: new Date()
        })
        .where(eq(quoteCategoryLinks.id, parseInt(id)))
        .returning();

      // If quote was won and advanceTrust is true, advance category trust
      if (outcome === 'won' && advanceTrust && current.customerId && current.categoryName) {
        const existingTrust = await db.select().from(categoryTrust)
          .where(sql`${categoryTrust.customerId} = ${current.customerId} AND ${categoryTrust.categoryName} = ${current.categoryName}`);

        if (existingTrust.length > 0) {
          const trust = existingTrust[0];
          const trustLevelOrder = ['not_introduced', 'introduced', 'evaluated', 'adopted', 'habitual'];
          const currentTrustIndex = trustLevelOrder.indexOf(trust.trustLevel);
          
          // Advance to at least "adopted" if quote won
          if (currentTrustIndex < 3) {
            await db.update(categoryTrust)
              .set({
                trustLevel: 'adopted',
                updatedAt: new Date(),
                updatedBy: req.user?.email
              })
              .where(eq(categoryTrust.id, trust.id));
          }
        }
      }

      // Log the close activity
      if (current.customerId) {
        await storage.createActivityEvent({
          customerId: current.customerId,
          eventType: outcome === 'won' ? 'quote_won' : 'quote_lost',
          title: `Quote ${current.quoteNumber} ${outcome === 'won' ? 'Won' : 'Lost'}`,
          description: `Category: ${current.categoryName}${notes ? `. Notes: ${notes}` : ''}`,
          createdBy: req.user?.email,
        });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error closing follow-up:", error);
      res.status(500).json({ error: "Failed to close follow-up" });
    }
  });

  // Get constants for UI
  app.get("/api/crm/coach-constants", isAuthenticated, (req, res) => {
    res.json({
      accountStates: ACCOUNT_STATES,
      accountStateConfig: ACCOUNT_STATE_CONFIG,
      categoryStates: CATEGORY_STATES,
      categoryStateConfig: CATEGORY_STATE_CONFIG,
      machineFamilies: MACHINE_FAMILIES,
      objectionTypes: OBJECTION_TYPES,
      categoryMachineCompatibility: CATEGORY_MACHINE_COMPATIBILITY,
      nudgeActions: COACH_NUDGE_ACTIONS,
    });
  });

  // ========================================
  // AUTO-SYNC CATEGORY TRUST FROM EXISTING DATA
  // ========================================

  // Sync category trust from sample requests
  app.post("/api/crm/category-trust/:customerId/sync", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get sample requests for this customer
      const samples = await storage.getSampleRequestsByCustomerId(customerId);
      
      // Get existing category trusts
      const existingTrusts = await db.select().from(categoryTrust).where(eq(categoryTrust.customerId, customerId));
      const existingMap = new Map(existingTrusts.map(t => [t.categoryName, t]));
      
      const synced: any[] = [];
      
      // Process sample requests - extract category from product name
      for (const sample of samples) {
        if (!sample.productName) continue;
        
        // Try to extract category from product name (e.g., "Endurance C1S 12pt" → "C1S")
        const categoryMatch = sample.productName.match(/\b(C1S|C2S|SBS|CCK|CCNB|FBB|FOLDING_CARTON|TAG|LABELS|TEXTWEIGHT|COVER|BOND|BRISTOL|INDEX|VELLUM|OFFSET)\b/i);
        if (!categoryMatch) continue;
        
        const categoryName = categoryMatch[1].toUpperCase();
        const existing = existingMap.get(categoryName);
        
        // Determine trust level based on sample status
        let trustLevel = 'introduced';
        if (sample.status === 'testing' || sample.status === 'shipped') {
          trustLevel = 'evaluated';
        } else if (sample.status === 'completed') {
          trustLevel = 'adopted';
        }
        
        // Only update if new level is higher
        const trustLevelOrder = { 'not_introduced': 0, 'introduced': 1, 'evaluated': 2, 'adopted': 3, 'habitual': 4 };
        const currentLevel = existing?.trustLevel || 'not_introduced';
        
        if ((trustLevelOrder as any)[trustLevel] > (trustLevelOrder as any)[currentLevel]) {
          if (existing) {
            await db.update(categoryTrust)
              .set({ 
                trustLevel,
                updatedBy: req.user?.email || 'auto-sync',
                updatedAt: new Date(),
                lastOrderDate: sample.createdAt,
              })
              .where(eq(categoryTrust.id, existing.id));
            synced.push({ categoryName, trustLevel, action: 'updated' });
          } else {
            await db.insert(categoryTrust).values({
              customerId,
              categoryName,
              trustLevel,
              updatedBy: req.user?.email || 'auto-sync',
              lastOrderDate: sample.createdAt,
            });
            synced.push({ categoryName, trustLevel, action: 'created' });
          }
        }
      }
      
      res.json({ success: true, synced, message: `Synced ${synced.length} category trusts from existing data` });
    } catch (error) {
      console.error("Error syncing category trust:", error);
      res.status(500).json({ error: "Failed to sync category trust" });
    }
  });

  // ========================================
  // MACHINE PROFILE APIs
  // ========================================

  // Get available machine types from admin taxonomy (for all authenticated users)
  app.get("/api/crm/machine-types", isAuthenticated, async (req, res) => {
    try {
      const types = await db.select({
        id: adminMachineTypes.id,
        code: adminMachineTypes.code,
        label: adminMachineTypes.label,
        icon: adminMachineTypes.icon,
        description: adminMachineTypes.description,
        sortOrder: adminMachineTypes.sortOrder,
      })
        .from(adminMachineTypes)
        .where(eq(adminMachineTypes.isActive, true))
        .orderBy(adminMachineTypes.sortOrder);
      res.json(types);
    } catch (error) {
      console.error("Error fetching machine types:", error);
      res.status(500).json({ error: "Failed to fetch machine types" });
    }
  });

  // Get machine profiles for a customer
  app.get("/api/crm/machine-profiles/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      const profiles = await db.select().from(customerMachineProfiles)
        .where(eq(customerMachineProfiles.customerId, customerId));
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching machine profiles:", error);
      res.status(500).json({ error: "Failed to fetch machine profiles" });
    }
  });

  // Add or toggle machine profile (one-click)
  // Auto-assigns customer to Aneesh if Distributor or Dealer is selected
  const ANEESH_USER_ID = "45980257";
  const AUTO_ASSIGN_MACHINE_TYPES = ['distributor', 'dealer'];
  
  app.post("/api/crm/machine-profiles", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, machineFamily, status, source, otherDetails } = req.body;
      
      if (!customerId || !machineFamily) {
        return res.status(400).json({ error: "customerId and machineFamily are required" });
      }

      // Check if profile exists
      const existing = await db.select().from(customerMachineProfiles)
        .where(sql`${customerMachineProfiles.customerId} = ${customerId} AND ${customerMachineProfiles.machineFamily} = ${machineFamily}`);

      let result;
      if (existing.length > 0) {
        // Update existing
        result = await db.update(customerMachineProfiles)
          .set({ 
            status: status || 'confirmed',
            confirmedAt: status === 'confirmed' ? new Date() : existing[0].confirmedAt,
            confirmedBy: status === 'confirmed' ? req.user?.email : existing[0].confirmedBy,
            touchCount: (existing[0].touchCount || 0) + 1,
            otherDetails: otherDetails || existing[0].otherDetails,
            updatedAt: new Date()
          })
          .where(eq(customerMachineProfiles.id, existing[0].id))
          .returning();
      } else {
        // Create new
        result = await db.insert(customerMachineProfiles).values({
          customerId,
          machineFamily,
          status: status || 'inferred',
          source: source || 'user_added',
          touchCount: 1,
          otherDetails: otherDetails || null,
          confirmedAt: status === 'confirmed' ? new Date() : null,
          confirmedBy: status === 'confirmed' ? req.user?.email : null,
        }).returning();
      }

      // Auto-assign to Aneesh if Distributor or Dealer is selected
      if (AUTO_ASSIGN_MACHINE_TYPES.includes(machineFamily.toLowerCase())) {
        const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
        const previousSalesRepId = customer?.salesRepId;
        
        // Only update if not already assigned to Aneesh
        if (previousSalesRepId !== ANEESH_USER_ID) {
          await db.update(customers)
            .set({ 
              salesRepId: ANEESH_USER_ID,
              salesRepName: 'Aneesh',
              updatedAt: new Date()
            })
            .where(eq(customers.id, customerId));
          
          // Log the auto-assignment
          await storage.logActivity({
            userId: req.user?.id,
            userEmail: req.user?.email || 'system',
            userRole: req.user?.role || 'user',
            action: 'auto_assign_sales_rep',
            actionType: 'customer_update',
            description: `Customer auto-assigned to Aneesh (${machineFamily} selected)`,
            targetId: customerId,
            targetType: 'customer',
            metadata: { 
              previousSalesRepId, 
              newSalesRepId: ANEESH_USER_ID, 
              machineFamily,
              reason: 'distributor_dealer_auto_assign'
            },
          });
          
          console.log(`[Machine Profile] Auto-assigned customer ${customerId} to Aneesh (${machineFamily} selected)`);
        }
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error creating/updating machine profile:", error);
      res.status(500).json({ error: "Failed to update machine profile" });
    }
  });

  // Confirm machine (one-click)
  app.post("/api/crm/machine-profiles/:id/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const result = await db.update(customerMachineProfiles)
        .set({ 
          status: 'confirmed',
          confirmedAt: new Date(),
          confirmedBy: req.user?.email,
          updatedAt: new Date()
        })
        .where(eq(customerMachineProfiles.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: "Machine profile not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error confirming machine profile:", error);
      res.status(500).json({ error: "Failed to confirm machine profile" });
    }
  });

  // Remove machine profile
  app.delete("/api/crm/machine-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(customerMachineProfiles).where(eq(customerMachineProfiles.id, parseInt(id)));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting machine profile:", error);
      res.status(500).json({ error: "Failed to delete machine profile" });
    }
  });

  // ========================================
  // CATEGORY OBJECTION APIs
  // ========================================

  // Get ALL objections (for summary page)
  app.get("/api/crm/objections", isAuthenticated, async (req, res) => {
    try {
      const objections = await db.select().from(categoryObjections)
        .orderBy(desc(categoryObjections.createdAt));
      res.json(objections);
    } catch (error) {
      console.error("Error fetching all objections:", error);
      res.status(500).json({ error: "Failed to fetch objections" });
    }
  });

  // Get objections for a customer
  app.get("/api/crm/objections/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      const objections = await db.select().from(categoryObjections)
        .where(eq(categoryObjections.customerId, customerId));
      res.json(objections);
    } catch (error) {
      console.error("Error fetching objections:", error);
      res.status(500).json({ error: "Failed to fetch objections" });
    }
  });

  // Log objection (one-click)
  app.post("/api/crm/objections", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, categoryName, categoryTrustId, objectionType, details } = req.body;
      
      if (!customerId || !categoryName || !objectionType) {
        return res.status(400).json({ error: "customerId, categoryName, and objectionType are required" });
      }

      const result = await db.insert(categoryObjections).values({
        customerId,
        categoryName,
        categoryTrustId: categoryTrustId || null,
        objectionType,
        details,
        status: 'open',
        createdBy: req.user?.email,
      }).returning();

      res.json(result[0]);
    } catch (error) {
      console.error("Error logging objection:", error);
      res.status(500).json({ error: "Failed to log objection" });
    }
  });

  // Resolve objection with required note
  app.post("/api/crm/objections/:id/resolve", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, resolutionNote } = req.body; // addressed, won, lost
      
      // Require a note when closing an issue
      if (!resolutionNote || resolutionNote.trim() === '') {
        return res.status(400).json({ error: "A resolution note is required to close an issue" });
      }
      
      const result = await db.update(categoryObjections)
        .set({ 
          status: status || 'won',
          details: resolutionNote.trim(), // Store the resolution note in details
          resolvedAt: new Date(),
          resolvedBy: req.user?.email,
        })
        .where(eq(categoryObjections.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: "Objection not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error resolving objection:", error);
      res.status(500).json({ error: "Failed to resolve objection" });
    }
  });

  // ========================================
  // LEADS MODULE APIs
  // ========================================

  // Get all leads with optional filtering
  // ── State normalization helpers ────────────────────────────────────────────
  const US_STATE_ABBR_TO_NAME: Record<string, string> = {
    AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
    CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
    FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
    IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
    ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
    MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
    NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
    NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
    OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
    SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
    VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin',
    WY:'Wyoming', PR:'Puerto Rico', VI:'Virgin Islands',
  };

  // Normalize a raw DB state value → canonical name ("FL " / "Florida (US)" → "Florida")
  function normalizeStateName(raw: string): string {
    const s = raw.trim().replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
    return US_STATE_ABBR_TO_NAME[s.toUpperCase()] || (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/(?<=\s)\w/g, c => c.toUpperCase()));
  }

  // Return all DB variants that should match a canonical state name for filtering
  function stateFilterVariants(canonical: string): string[] {
    const abbr = Object.entries(US_STATE_ABBR_TO_NAME).find(([, n]) => n.toLowerCase() === canonical.toLowerCase())?.[0];
    const variants = new Set<string>([canonical, `${canonical} (US)`, `${canonical} (CA)`]);
    if (abbr) { variants.add(abbr); variants.add(`${abbr} `); variants.add(`${abbr} (US)`); }
    return Array.from(variants);
  }

  // Get unique states/provinces used by customers and leads (for label state filter)
  app.get("/api/label-states", isAuthenticated, async (req: any, res) => {
    try {
      const [customerProvinces, leadStates] = await Promise.all([
        db.selectDistinct({ val: customers.province }).from(customers)
          .where(sql`${customers.province} is not null and trim(${customers.province}) <> ''`)
          .orderBy(customers.province),
        db.selectDistinct({ val: leads.state }).from(leads)
          .where(sql`${leads.state} is not null and trim(${leads.state}) <> ''`)
          .orderBy(leads.state),
      ]);
      // Normalize all values and deduplicate
      const seen = new Set<string>();
      const combined: string[] = [];
      for (const raw of [
        ...customerProvinces.map(r => r.val as string),
        ...leadStates.map(r => r.val as string),
      ]) {
        const canonical = normalizeStateName(raw);
        if (canonical && !seen.has(canonical.toLowerCase())) {
          seen.add(canonical.toLowerCase());
          combined.push(canonical);
        }
      }
      combined.sort();
      res.json(combined);
    } catch (error) {
      console.error("Error fetching label states:", error);
      res.status(500).json({ error: "Failed to fetch states" });
    }
  });

  app.get("/api/label-cities", isAuthenticated, async (req: any, res) => {
    try {
      const { state } = req.query;
      if (!state) return res.json([]);
      const variants = stateFilterVariants(state as string);
      const [customerCities, leadCities] = await Promise.all([
        db.selectDistinct({ val: customers.city }).from(customers)
          .where(and(
            sql`${customers.city} is not null and trim(${customers.city}) <> ''`,
            or(...variants.map(v => ilike(customers.province, v)))!
          ))
          .orderBy(customers.city),
        db.selectDistinct({ val: leads.city }).from(leads)
          .where(and(
            sql`${leads.city} is not null and trim(${leads.city}) <> ''`,
            or(...variants.map(v => ilike(leads.state, v)))!
          ))
          .orderBy(leads.city),
      ]);
      const seen = new Set<string>();
      const combined: string[] = [];
      for (const raw of [
        ...customerCities.map(r => r.val as string),
        ...leadCities.map(r => r.val as string),
      ]) {
        const normalized = (raw || '').trim();
        const key = normalized.toLowerCase();
        if (normalized && !seen.has(key)) {
          seen.add(key);
          combined.push(normalized);
        }
      }
      combined.sort();
      res.json(combined);
    } catch (error) {
      console.error("Error fetching label cities:", error);
      res.status(500).json({ error: "Failed to fetch cities" });
    }
  });

  // Return distinct tag values from leads (must be before /api/leads/:id)


  // Get lead statistics for dashboard (must be before :id route)

  // Get leads that need Monday morning review (must be before :id route)

  // Get single lead by ID

  // Create a new lead

  // Update a lead

  // Qualify a lead — validate all requirements, convert to customer, link company, auto-convert siblings

  // ── Companies API ─────────────────────────────────────────────────────────

  // List all companies with lead/contact counts
  app.get("/api/companies", isAuthenticated, async (req: any, res) => {
    try {
      const allCompanies = await db.select().from(companies).orderBy(companies.name);
      
      // Fetch contact counts grouped by company_id
      const contactCounts = await db
        .select({ companyId: customers.companyId, count: sql<number>`COUNT(*)` })
        .from(customers)
        .where(sql`${customers.companyId} IS NOT NULL`)
        .groupBy(customers.companyId);
      const contactCountMap = new Map(contactCounts.map(r => [r.companyId, Number(r.count)]));

      // Fetch active lead counts grouped by company_id
      const leadCounts = await db
        .select({ companyId: leads.companyId, count: sql<number>`COUNT(*)` })
        .from(leads)
        .where(and(sql`${leads.companyId} IS NOT NULL`, inArray(leads.stage, ['new', 'contacted', 'qualified'])))
        .groupBy(leads.companyId);
      const leadCountMap = new Map(leadCounts.map(r => [r.companyId, Number(r.count)]));

      const rows = allCompanies.map(c => ({
        ...c,
        contactCount: contactCountMap.get(c.id) ?? 0,
        leadCount: leadCountMap.get(c.id) ?? 0,
      }));

      res.json(rows);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  // Backward-compat alias kept so existing frontend query key still resolves
  app.get("/api/companies/all-names", isAuthenticated, async (req: any, res) => {
    res.redirect(307, `/api/companies/directory?${new URLSearchParams(req.query as any).toString()}`);
  });

  // ── Odoo company sync ─────────────────────────────────────────────────────────
  // Pull is_company=true customer partners from Odoo into the companies table.
  // Then link orphan customers (company_id IS NULL) to their Odoo company by name.
  app.post("/api/odoo/sync-companies", requireAdmin, async (req: any, res) => {
    try {
      await odooClient.authenticate();

      const limit = 200;
      let offset = 0;
      let created = 0;
      let updated = 0;
      let linked = 0;

      const allOdooCompanies: any[] = [];

      while (true) {
        const batch = await odooClient.searchRead(
          'res.partner',
          [['is_company', '=', true], ['customer_rank', '>', 0]],
          ['id', 'name', 'street', 'city', 'state_id', 'country_id', 'phone', 'email', 'website', 'zip'],
          { limit, offset }
        );
        if (!batch || batch.length === 0) break;
        allOdooCompanies.push(...batch);
        if (batch.length < limit) break;
        offset += limit;
      }

      for (const partner of allOdooCompanies) {
        if (!partner.name) continue;

        const city = partner.city || null;
        const stateProvince = partner.state_id ? partner.state_id[1] : null;
        const country = partner.country_id ? partner.country_id[1] : null;

        // Check if already exists by odooCompanyPartnerId or name
        const existing = await db.select({ id: companies.id })
          .from(companies)
          .where(
            sql`${companies.odooCompanyPartnerId} = ${partner.id} OR LOWER(${companies.name}) = LOWER(${partner.name})`
          )
          .limit(1);

        if (existing.length > 0) {
          // Update
          await db.update(companies)
            .set({
              name: partner.name,
              odooCompanyPartnerId: partner.id,
              city,
              stateProvince,
              country,
              mainPhone: partner.phone || null,
              generalEmail: partner.email || null,
              addressLine1: partner.street || null,
            })
            .where(eq(companies.id, existing[0].id));
          updated++;

          // Link orphan customers by exact name OR stripped name (without "- HQ" etc.)
          const strippedPartnerName = partner.name.replace(/\s*[-–]\s*(HQ|Branch|Office|[A-Z]{2,4}|\d+)\s*$/i, '').trim();
          const linkResult = await db.execute(
            sql`UPDATE customers SET company_id = ${existing[0].id}
                WHERE company_id IS NULL
                AND (LOWER(company) = LOWER(${partner.name}) OR LOWER(company) = LOWER(${strippedPartnerName}))`
          );
          linked += (linkResult as any).rowCount || 0;
        } else {
          // Create
          const inserted = await db.insert(companies).values({
            name: partner.name,
            odooCompanyPartnerId: partner.id,
            city,
            stateProvince,
            country,
            mainPhone: partner.phone || null,
            generalEmail: partner.email || null,
            addressLine1: partner.street || null,
            status: 'active',
          }).returning({ id: companies.id });
          created++;

          if (inserted[0]?.id) {
            const strippedN = partner.name.replace(/\s*[-–]\s*(HQ|Branch|Office|[A-Z]{2,4}|\d+)\s*$/i, '').trim();
            const linkResult = await db.execute(
              sql`UPDATE customers SET company_id = ${inserted[0].id}
                  WHERE company_id IS NULL
                  AND (LOWER(company) = LOWER(${partner.name}) OR LOWER(company) = LOWER(${strippedN}))`
            );
            linked += (linkResult as any).rowCount || 0;
          }
        }
      }

      res.json({
        message: `Synced ${allOdooCompanies.length} Odoo companies`,
        created,
        updated,
        linkedCustomers: linked,
      });
    } catch (error: any) {
      console.error("Odoo sync-companies error:", error);
      res.status(500).json({ error: error.message || "Failed to sync companies from Odoo" });
    }
  });

  // Company directory: aggregated cards with financial metrics from linked contacts
  // ── helpers for connection strength ─────────────────────────────────────────
  function latestOf(...vals: (Date | string | null | undefined)[]): Date | null {
    const parsed = vals
      .filter(Boolean)
      .map(v => v instanceof Date ? v : new Date(v as string))
      .filter(d => !isNaN(d.getTime()));
    if (!parsed.length) return null;
    return new Date(Math.max(...parsed.map(d => d.getTime())));
  }
  function calcConnectionStrength(d: Date | null): 'very_strong' | 'strong' | 'moderate' | 'weak' | 'cold' {
    if (!d) return 'cold';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 30) return 'very_strong';
    if (days <= 90) return 'strong';
    if (days <= 180) return 'moderate';
    if (days <= 365) return 'weak';
    return 'cold';
  }

  app.get("/api/companies/directory", isAuthenticated, async (req: any, res) => {
    try {
      const search = ((req.query.search as string) || '').trim().toLowerCase();

      // ── 1. Official companies (companies table) with aggregated stats ──────
      const officialRaw = await db.select({
        id: companies.id,
        name: companies.name,
        city: companies.city,
        stateProvince: companies.stateProvince,
        domain: companies.domain,
        mainPhone: companies.mainPhone,
        generalEmail: companies.generalEmail,
        odooCompanyPartnerId: companies.odooCompanyPartnerId,
        addressLine1: companies.addressLine1,
        country: companies.country,
        status: companies.status,
        assignedTo: companies.assignedTo,
        companyTags: companies.companyTags,
      }).from(companies).orderBy(companies.name);

      // Aggregate customer stats grouped by companyId
      const custStats = await db
        .select({
          companyId: customers.companyId,
          contactCount: sql<number>`COUNT(*)`,
          lifetimeSales: sql<string>`COALESCE(SUM(${customers.totalSpent}::decimal), 0)`,
          totalOrders: sql<number>`COALESCE(SUM(${customers.totalOrders}), 0)`,
          primarySalesRep: sql<string>`MODE() WITHIN GROUP (ORDER BY ${customers.salesRepName})`,
          primaryPricingTier: sql<string>`MODE() WITHIN GROUP (ORDER BY ${customers.pricingTier})`,
        })
        .from(customers)
        .where(sql`${customers.companyId} IS NOT NULL`)
        .groupBy(customers.companyId);

      const custStatMap = new Map(custStats.map(r => [r.companyId, r]));

      // ── Last interaction: activity events by companyId ──────────────────────
      const activityByCompId = await db
        .select({
          companyId: customers.companyId,
          lastDate: sql<string>`MAX(${customerActivityEvents.eventDate})`,
        })
        .from(customerActivityEvents)
        .innerJoin(customers, eq(customerActivityEvents.customerId, customers.id))
        .where(sql`${customers.companyId} IS NOT NULL`)
        .groupBy(customers.companyId);

      // ── Last interaction: gmail messages by companyId ───────────────────────
      const emailByCompId = await db
        .select({
          companyId: customers.companyId,
          lastDate: sql<string>`MAX(${gmailMessages.sentAt})`,
        })
        .from(gmailMessages)
        .innerJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(and(
          sql`${customers.companyId} IS NOT NULL`,
          sql`${gmailMessages.sentAt} IS NOT NULL`
        ))
        .groupBy(customers.companyId);

      const actByIdMap = new Map<number, Date>(
        activityByCompId.filter(r => r.companyId && r.lastDate).map(r => [r.companyId as number, new Date(r.lastDate)])
      );
      const emlByIdMap = new Map<number, Date>(
        emailByCompId.filter(r => r.companyId && r.lastDate).map(r => [r.companyId as number, new Date(r.lastDate)])
      );

      type CompanyCard = {
        id: number | null;
        name: string;
        source: 'odoo' | 'contact';
        city: string | null;
        stateProvince: string | null;
        domain: string | null;
        mainPhone: string | null;
        generalEmail: string | null;
        addressLine1: string | null;
        country: string | null;
        contactCount: number;
        lifetimeSales: number;
        totalOrders: number;
        primarySalesRep: string | null;
        primaryPricingTier: string | null;
        lastInteractionDate: string | null;
        connectionStrength: 'very_strong' | 'strong' | 'moderate' | 'weak' | 'cold';
        companyTags: string | null;
      };

      const result: CompanyCard[] = officialRaw.map(c => {
        const stats = custStatMap.get(c.id) ?? null;
        const lastDate = latestOf(
          actByIdMap.get(c.id as number),
          emlByIdMap.get(c.id as number),
          c.lastActivityDate ?? undefined,
        );
        return {
          id: c.id,
          name: c.name,
          source: 'odoo' as const,
          city: c.city ?? null,
          stateProvince: c.stateProvince ?? null,
          domain: c.domain ?? null,
          mainPhone: c.mainPhone ?? null,
          generalEmail: c.generalEmail ?? null,
          addressLine1: c.addressLine1 ?? null,
          country: c.country ?? null,
          contactCount: Number(stats?.contactCount ?? 0),
          lifetimeSales: parseFloat(stats?.lifetimeSales ?? '0'),
          totalOrders: Number(stats?.totalOrders ?? 0),
          primarySalesRep: stats?.primarySalesRep ?? null,
          primaryPricingTier: stats?.primaryPricingTier ?? null,
          lastInteractionDate: lastDate?.toISOString() ?? null,
          connectionStrength: calcConnectionStrength(lastDate),
          companyTags: c.companyTags ?? null,
        };
      });

      // ── 2. Orphan company names from customers (no linked companies record) ─
      // Only include customers marked as companies (isCompany=true) in Odoo
      const orphanStats = await db
        .select({
          company: customers.company,
          contactCount: sql<number>`COUNT(*)`,
          lifetimeSales: sql<string>`COALESCE(SUM(${customers.totalSpent}::decimal), 0)`,
          totalOrders: sql<number>`COALESCE(SUM(${customers.totalOrders}), 0)`,
          primarySalesRep: sql<string>`MODE() WITHIN GROUP (ORDER BY ${customers.salesRepName})`,
          primaryPricingTier: sql<string>`MODE() WITHIN GROUP (ORDER BY ${customers.pricingTier})`,
          city: sql<string>`MODE() WITHIN GROUP (ORDER BY ${customers.city})`,
          province: sql<string>`MODE() WITHIN GROUP (ORDER BY ${customers.province})`,
        })
        .from(customers)
        .where(and(
          sql`${customers.companyId} IS NULL`,
          sql`${customers.company} IS NOT NULL`,
          sql`TRIM(${customers.company}) != ''`,
          eq(customers.isCompany, true)
        ))
        .groupBy(customers.company);

      const officialNamesLower = new Set(officialRaw.map(c => c.name.toLowerCase()));

      // ── Last interaction for orphan companies (by company name) ─────────────
      const actByNameRaw = await db
        .select({
          company: customers.company,
          lastDate: sql<string>`MAX(${customerActivityEvents.eventDate})`,
        })
        .from(customerActivityEvents)
        .innerJoin(customers, eq(customerActivityEvents.customerId, customers.id))
        .where(sql`${customers.companyId} IS NULL AND ${customers.company} IS NOT NULL`)
        .groupBy(customers.company);

      const emlByNameRaw = await db
        .select({
          company: customers.company,
          lastDate: sql<string>`MAX(${gmailMessages.sentAt})`,
        })
        .from(gmailMessages)
        .innerJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(and(
          sql`${customers.companyId} IS NULL`,
          sql`${customers.company} IS NOT NULL`,
          sql`${gmailMessages.sentAt} IS NOT NULL`
        ))
        .groupBy(customers.company);

      const actByNameMap = new Map<string, Date>(
        actByNameRaw.filter(r => r.company && r.lastDate).map(r => [r.company!.toLowerCase(), new Date(r.lastDate)])
      );
      const emlByNameMap = new Map<string, Date>(
        emlByNameRaw.filter(r => r.company && r.lastDate).map(r => [r.company!.toLowerCase(), new Date(r.lastDate)])
      );

      for (const row of orphanStats) {
        if (!row.company) continue;
        if (officialNamesLower.has(row.company.toLowerCase())) continue;
        const nameLower = row.company.toLowerCase();
        const lastDate = latestOf(
          actByNameMap.get(nameLower),
          emlByNameMap.get(nameLower),
        );
        result.push({
          id: null,
          name: row.company,
          source: 'contact',
          city: row.city ?? null,
          stateProvince: row.province ?? null,
          domain: null,
          mainPhone: null,
          generalEmail: null,
          addressLine1: null,
          country: null,
          contactCount: Number(row.contactCount),
          lifetimeSales: parseFloat(row.lifetimeSales ?? '0'),
          totalOrders: Number(row.totalOrders),
          primarySalesRep: row.primarySalesRep ?? null,
          primaryPricingTier: row.primaryPricingTier ?? null,
          lastInteractionDate: lastDate?.toISOString() ?? null,
          connectionStrength: calcConnectionStrength(lastDate),
          companyTags: null,
        });
      }

      // Filter + sort
      const filtered = search
        ? result.filter(r => r.name.toLowerCase().includes(search))
        : result;
      filtered.sort((a, b) => a.name.localeCompare(b.name));

      res.json(filtered);
    } catch (error) {
      console.error("Error fetching company directory:", error);
      res.status(500).json({ error: "Failed to fetch company directory" });
    }
  });

  // Contacts for a company identified only by name (orphan companies)
  app.get("/api/companies/by-name/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const name = ((req.query.name as string) || '').trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const localContacts = await db
        .select()
        .from(customers)
        .where(and(
          sql`LOWER(${customers.company}) = LOWER(${name})`,
          sql`${customers.companyId} IS NULL`
        ))
        .orderBy(customers.lastName, customers.firstName);

      // Also pull contacts from Odoo by searching the company name
      let odooContacts: any[] = [];
      try {
        const odooCompanies = await odooClient.searchRead('res.partner',
          [['name', 'ilike', name], ['is_company', '=', true]],
          ['id', 'name'], { limit: 5 }
        );
        if (odooCompanies && odooCompanies.length > 0) {
          const bestMatch = odooCompanies.find((c: any) =>
            c.name.toLowerCase() === name.toLowerCase()
          ) || odooCompanies[0];
          const rawOdooContacts = await odooClient.getCompanyContacts(bestMatch.id);
          const localEmails = new Set(localContacts.map(c => (c.email || '').toLowerCase()).filter(Boolean));
          odooContacts = rawOdooContacts
            .filter((oc: any) => !oc.email || !localEmails.has(oc.email.toLowerCase()))
            .map((oc: any) => {
              const parts = (oc.name || '').trim().split(/\s+/);
              const firstName = parts.slice(0, -1).join(' ') || parts[0] || null;
              const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
              return {
                id: `odoo_${oc.id}`,
                firstName,
                lastName,
                email: oc.email || null,
                phone: oc.phone || null,
                cell: null,
                company: name,
                address1: null,
                city: null,
                province: null,
                country: null,
                jobTitle: oc.function || null,
                isCompany: false,
                source: 'odoo',
                odooPartnerId: oc.id,
              };
            });
        }
      } catch (odooErr: any) {
        console.warn('[Company Contacts] Odoo fetch skipped:', odooErr.message);
      }

      res.json({ contacts: [...localContacts, ...odooContacts] });
    } catch (error) {
      console.error("Error fetching contacts by company name:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Get contacts for a specific company
  app.get("/api/companies/:id/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) return res.status(400).json({ error: "Invalid company ID" });

      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const localContacts = await db
        .select()
        .from(customers)
        .where(eq(customers.companyId, companyId))
        .orderBy(customers.lastName, customers.firstName);

      // Also pull from Odoo if the company has an Odoo partner ID
      let odooContacts: any[] = [];
      if (company.odooCompanyPartnerId) {
        try {
          const rawOdooContacts = await odooClient.getCompanyContacts(company.odooCompanyPartnerId);
          const localEmails = new Set(localContacts.map(c => (c.email || '').toLowerCase()).filter(Boolean));
          odooContacts = rawOdooContacts
            .filter((oc: any) => !oc.email || !localEmails.has(oc.email.toLowerCase()))
            .map((oc: any) => {
              const parts = (oc.name || '').trim().split(/\s+/);
              const firstName = parts.slice(0, -1).join(' ') || parts[0] || null;
              const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
              return {
                id: `odoo_${oc.id}`,
                firstName,
                lastName,
                email: oc.email || null,
                phone: oc.phone || null,
                cell: null,
                company: company.name,
                address1: null,
                city: null,
                province: null,
                country: null,
                jobTitle: oc.function || null,
                isCompany: false,
                source: 'odoo',
                odooPartnerId: oc.id,
              };
            });
        } catch (odooErr: any) {
          console.warn('[Company Contacts] Odoo fetch skipped:', odooErr.message);
        }
      }

      res.json({ company, contacts: [...localContacts, ...odooContacts] });
    } catch (error) {
      console.error("Error fetching company contacts:", error);
      res.status(500).json({ error: "Failed to fetch company contacts" });
    }
  });

  // ── Company Detail Page endpoints ──────────────────────────────────────────
  // Helper: compute connection strength for detail page
  function companyConnectionStrength(lastDate: Date | null): 'very_strong' | 'strong' | 'moderate' | 'weak' | 'cold' {
    if (!lastDate) return 'cold';
    const days = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
    if (days <= 30) return 'very_strong';
    if (days <= 90) return 'strong';
    if (days <= 180) return 'moderate';
    if (days <= 365) return 'weak';
    return 'cold';
  }

  // ─── Company detail: by-name routes (must be before :id routes) ──────────────
  // Overview for orphan (Shopify-only) company — no DB id
  app.get("/api/companies/by-name/overview", isAuthenticated, async (req: any, res) => {
    try {
      const name = ((req.query.name as string) || '').trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const contacts = await db.select().from(customers)
        .where(and(
          sql`LOWER(${customers.company}) = LOWER(${name})`,
          sql`${customers.companyId} IS NULL`
        ))
        .orderBy(customers.lastName, customers.firstName);

      const contactCount = contacts.length;
      const lifetimeSales = contacts.reduce((sum, c) => sum + parseFloat(c.totalSpent || '0'), 0);
      const totalOrders = contacts.reduce((sum, c) => sum + (c.totalOrders || 0), 0);

      const lastActRow = await db
        .select({ lastDate: sql<string>`MAX(${customerActivityEvents.eventDate})` })
        .from(customerActivityEvents)
        .innerJoin(customers, eq(customerActivityEvents.customerId, customers.id))
        .where(and(sql`LOWER(${customers.company}) = LOWER(${name})`, sql`${customers.companyId} IS NULL`));
      const lastEmailRow = await db
        .select({ lastDate: sql<string>`MAX(${gmailMessages.sentAt})` })
        .from(gmailMessages)
        .innerJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(and(sql`LOWER(${customers.company}) = LOWER(${name})`, sql`${customers.companyId} IS NULL`, sql`${gmailMessages.sentAt} IS NOT NULL`));

      const lastInteraction = latestOf(lastActRow[0]?.lastDate, lastEmailRow[0]?.lastDate);
      const connectionStrength = calcConnectionStrength(lastInteraction);

      res.json({
        company: { id: null, name, isOrphan: true, odooCompanyPartnerId: null, source: 'contact' },
        contacts,
        contactCount,
        lifetimeSales,
        totalOrders,
        connectionStrength,
        lastInteractionDate: lastInteraction?.toISOString() ?? null,
        odooKpis: { avgMargin: null, invoiceCount: null, outstanding: null },
      });
    } catch (error) {
      console.error("Error fetching orphan company overview:", error);
      res.status(500).json({ error: "Failed to fetch company overview" });
    }
  });

  app.get("/api/companies/by-name/activity", isAuthenticated, async (req: any, res) => {
    try {
      const name = ((req.query.name as string) || '').trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const events = await db
        .select({
          id: customerActivityEvents.id,
          customerId: customerActivityEvents.customerId,
          eventType: customerActivityEvents.eventType,
          title: customerActivityEvents.title,
          description: customerActivityEvents.description,
          eventDate: customerActivityEvents.eventDate,
          createdByName: customerActivityEvents.createdByName,
          amount: customerActivityEvents.amount,
          contactFirstName: customers.firstName,
          contactLastName: customers.lastName,
          contactEmail: customers.email,
        })
        .from(customerActivityEvents)
        .innerJoin(customers, eq(customerActivityEvents.customerId, customers.id))
        .where(and(sql`LOWER(${customers.company}) = LOWER(${name})`, sql`${customers.companyId} IS NULL`))
        .orderBy(sql`${customerActivityEvents.eventDate} DESC`);

      res.json({ events });
    } catch (error) {
      console.error("Error fetching company activity by name:", error);
      res.status(500).json({ error: "Failed to fetch company activity" });
    }
  });

  app.get("/api/companies/by-name/emails", isAuthenticated, async (req: any, res) => {
    try {
      const name = ((req.query.name as string) || '').trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const emails = await db
        .select({
          id: gmailMessages.id,
          direction: gmailMessages.direction,
          fromEmail: gmailMessages.fromEmail,
          fromName: gmailMessages.fromName,
          toEmail: gmailMessages.toEmail,
          toName: gmailMessages.toName,
          subject: gmailMessages.subject,
          snippet: gmailMessages.snippet,
          sentAt: gmailMessages.sentAt,
          customerId: gmailMessages.customerId,
          contactFirstName: customers.firstName,
          contactLastName: customers.lastName,
        })
        .from(gmailMessages)
        .innerJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(and(sql`LOWER(${customers.company}) = LOWER(${name})`, sql`${customers.companyId} IS NULL`))
        .orderBy(sql`${gmailMessages.sentAt} DESC`)
        .limit(10);

      res.json({ emails });
    } catch (error) {
      console.error("Error fetching company emails by name:", error);
      res.status(500).json({ error: "Failed to fetch company emails" });
    }
  });

  // Invoice lines for orphan company
  app.get("/api/companies/by-name/invoice-lines", isAuthenticated, async (_req, res) => {
    res.json({ lines: [], invoices: [], invoiceLines: [] });
  });

  // ─── Company detail: :id routes ─────────────────────────────────────────────
  // Overview for official company by DB id
  app.get("/api/companies/:id/overview", isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) return res.status(400).json({ error: "Invalid company ID" });

      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const contacts = await db.select().from(customers)
        .where(eq(customers.companyId, companyId))
        .orderBy(customers.lastName, customers.firstName);

      const contactCount = contacts.length;
      const lifetimeSales = contacts.reduce((sum, c) => sum + parseFloat(c.totalSpent || '0'), 0);
      const totalOrders = contacts.reduce((sum, c) => sum + (c.totalOrders || 0), 0);

      const lastActRow = await db
        .select({ lastDate: sql<string>`MAX(${customerActivityEvents.eventDate})` })
        .from(customerActivityEvents)
        .innerJoin(customers, eq(customerActivityEvents.customerId, customers.id))
        .where(eq(customers.companyId, companyId));
      const lastEmailRow = await db
        .select({ lastDate: sql<string>`MAX(${gmailMessages.sentAt})` })
        .from(gmailMessages)
        .innerJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(and(eq(customers.companyId, companyId), sql`${gmailMessages.sentAt} IS NOT NULL`));

      const lastInteraction = latestOf(lastActRow[0]?.lastDate, lastEmailRow[0]?.lastDate, company.lastActivityDate ?? undefined);
      const connectionStrength = calcConnectionStrength(lastInteraction);

      let odooKpis: { avgMargin: number | null; invoiceCount: number | null; outstanding: number | null; lifetimeSales: number | null } = {
        avgMargin: null, invoiceCount: null, outstanding: null, lifetimeSales: null,
      };

      if (company.odooCompanyPartnerId) {
        try {
          const invoices = await odooClient.getInvoicesByPartner(company.odooCompanyPartnerId);
          const posted = invoices.filter((inv: any) => inv.state === 'posted');
          const postedInvoices = posted.filter((inv: any) => inv.move_type === 'out_invoice');
          const postedRefunds  = posted.filter((inv: any) => inv.move_type === 'out_refund');
          odooKpis.invoiceCount   = postedInvoices.length;
          odooKpis.outstanding    = posted.reduce((sum: number, inv: any) => sum + (inv.amount_residual || 0), 0);
          const totalSales  = postedInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_total || 0), 0);
          const totalRefunds = postedRefunds.reduce((sum: number, inv: any) => sum + (inv.amount_total || 0), 0);
          odooKpis.lifetimeSales = totalSales - totalRefunds;
        } catch (e: any) {
          console.error(`[Company Detail] Odoo KPI fetch error for partner ${company.odooCompanyPartnerId}:`, e.message);
        }
      }

      res.json({
        company: { ...company, isOrphan: false },
        contacts,
        contactCount,
        lifetimeSales,
        totalOrders,
        connectionStrength,
        lastInteractionDate: lastInteraction?.toISOString() ?? null,
        odooKpis,
      });
    } catch (error) {
      console.error("Error fetching company overview:", error);
      res.status(500).json({ error: "Failed to fetch company overview" });
    }
  });

  // Odoo metrics (slow — fetched separately so page loads fast)
  app.get("/api/companies/by-name/odoo-metrics", isAuthenticated, async (_req, res) => {
    res.json({ odooAvailable: false, averageMargin: null, totalOutstanding: null, invoiceCount: null, lifetimeSales: null });
  });

  app.get("/api/companies/:id/odoo-metrics", isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) return res.status(400).json({ error: "Invalid company ID" });

      const [company] = await db.select({ odooCompanyPartnerId: companies.odooCompanyPartnerId })
        .from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company?.odooCompanyPartnerId) {
        return res.json({ odooAvailable: false, averageMargin: null, totalOutstanding: null, invoiceCount: null, lifetimeSales: null });
      }

      const pid = company.odooCompanyPartnerId;
      const [metrics, invoices] = await Promise.all([
        odooClient.getPartnerBusinessMetrics(pid).catch(() => null),
        odooClient.getInvoicesByPartner(pid).catch(() => [] as any[]),
      ]);

      const postedInvoices2 = Array.isArray(invoices) ? invoices.filter((i: any) => i.move_type === 'out_invoice' && i.state === 'posted') : [];
      const postedRefunds2  = Array.isArray(invoices) ? invoices.filter((i: any) => i.move_type === 'out_refund'  && i.state === 'posted') : [];
      const lifetimeSalesFromInvoices = postedInvoices2.reduce((s: number, i: any) => s + (i.amount_total || 0), 0)
                                      - postedRefunds2.reduce((s: number, i: any) => s + (i.amount_total || 0), 0);
      res.json({
        odooAvailable: true,
        averageMargin: metrics?.averageMargin ?? null,
        totalOutstanding: metrics?.totalOutstanding ?? null,
        lifetimeSales: lifetimeSalesFromInvoices,
        invoiceCount: postedInvoices2.length,
      });
    } catch (error) {
      console.error("Error fetching Odoo metrics:", error);
      res.status(500).json({ error: "Failed to fetch Odoo metrics" });
    }
  });

  // Activity events by company name (orphan)
  app.get("/api/companies/by-name/activity", isAuthenticated, async (req: any, res) => {
    try {
      const name = ((req.query.name as string) || '').trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const orphanCustomers = await db.select({ id: customers.id })
        .from(customers)
        .where(and(sql`LOWER(${customers.company}) = LOWER(${name})`, sql`${customers.companyId} IS NULL`));

      if (!orphanCustomers.length) return res.json({ events: [] });

      const ids = orphanCustomers.map(c => c.id);
      const events = await db.select().from(customerActivityEvents)
        .where(inArray(customerActivityEvents.customerId, ids))
        .orderBy(desc(customerActivityEvents.eventDate));

      res.json({ events });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  // Activity events for official company
  app.get("/api/companies/:id/activity", isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) return res.status(400).json({ error: "Invalid company ID" });

      const events = await db
        .select({
          id: customerActivityEvents.id,
          customerId: customerActivityEvents.customerId,
          eventType: customerActivityEvents.eventType,
          title: customerActivityEvents.title,
          description: customerActivityEvents.description,
          eventDate: customerActivityEvents.eventDate,
          createdByName: customerActivityEvents.createdByName,
          amount: customerActivityEvents.amount,
          contactFirstName: customers.firstName,
          contactLastName: customers.lastName,
          contactEmail: customers.email,
        })
        .from(customerActivityEvents)
        .innerJoin(customers, eq(customerActivityEvents.customerId, customers.id))
        .where(eq(customers.companyId, companyId))
        .orderBy(sql`${customerActivityEvents.eventDate} DESC`);

      res.json({ events });
    } catch (error) {
      console.error("Error fetching company activity:", error);
      res.status(500).json({ error: "Failed to fetch company activity" });
    }
  });

  // Emails for orphan company
  app.get("/api/companies/by-name/emails", isAuthenticated, async (req: any, res) => {
    try {
      const name = ((req.query.name as string) || '').trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const orphanCustomers = await db.select({ id: customers.id })
        .from(customers)
        .where(and(sql`LOWER(${customers.company}) = LOWER(${name})`, sql`${customers.companyId} IS NULL`));

      if (!orphanCustomers.length) return res.json({ emails: [] });

      const ids = orphanCustomers.map(c => c.id);
      const emails = await db.select().from(gmailMessages)
        .where(inArray(gmailMessages.customerId, ids))
        .orderBy(desc(gmailMessages.sentAt))
        .limit(10);

      res.json({ emails });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch emails" });
    }
  });

  // Emails for official company
  app.get("/api/companies/:id/emails", isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) return res.status(400).json({ error: "Invalid company ID" });

      const emails = await db
        .select({
          id: gmailMessages.id,
          direction: gmailMessages.direction,
          fromEmail: gmailMessages.fromEmail,
          fromName: gmailMessages.fromName,
          toEmail: gmailMessages.toEmail,
          toName: gmailMessages.toName,
          subject: gmailMessages.subject,
          snippet: gmailMessages.snippet,
          sentAt: gmailMessages.sentAt,
          customerId: gmailMessages.customerId,
          contactFirstName: customers.firstName,
          contactLastName: customers.lastName,
        })
        .from(gmailMessages)
        .innerJoin(customers, eq(gmailMessages.customerId, customers.id))
        .where(eq(customers.companyId, companyId))
        .orderBy(sql`${gmailMessages.sentAt} DESC`)
        .limit(10);

      res.json({ emails });
    } catch (error) {
      console.error("Error fetching company emails:", error);
      res.status(500).json({ error: "Failed to fetch company emails" });
    }
  });

  // Invoice lines for orphan company
  app.get("/api/companies/by-name/invoice-lines", isAuthenticated, async (_req, res) => {
    res.json({ lines: [], invoices: [] });
  });

  // Company detail: invoice lines from Odoo (Product Prices tab)
  app.get("/api/companies/:id/invoice-lines", isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) return res.status(400).json({ error: "Invalid company ID" });

      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return res.status(404).json({ error: "Company not found" });
      if (!company.odooCompanyPartnerId) return res.json({ invoices: [], message: "No Odoo partner linked" });

      const invoiceLines = await odooClient.searchRead('account.move.line', [
        ['partner_id', 'child_of', company.odooCompanyPartnerId],
        ['parent_state', '=', 'posted'],
        ['move_type', '=', 'out_invoice'],
        ['display_type', '=', 'product'],
      ], [
        'id', 'move_id', 'move_name', 'product_id', 'name', 'quantity', 'price_unit', 'price_subtotal', 'date', 'partner_id',
      ], { limit: 200, order: 'create_date desc' });

      const invoiceMap: Record<string, { invoiceNumber: string; invoiceDate: string | null; partnerName: string; lines: { id: number; sku: string; description: string; pricePerUnit: number; quantity: number; total: number }[]; invoiceTotal: number }> = {};

      for (const line of invoiceLines) {
        const invNum = line.move_name || (line.move_id ? line.move_id[1] : '');
        if (!invoiceMap[invNum]) {
          invoiceMap[invNum] = {
            invoiceNumber: invNum,
            invoiceDate: line.date || null,
            partnerName: line.partner_id ? line.partner_id[1] : '',
            lines: [],
            invoiceTotal: 0,
          };
        }
        const lineTotal = line.price_subtotal || 0;
        invoiceMap[invNum].lines.push({
          id: line.id,
          sku: line.product_id ? line.product_id[1]?.split(']')[0]?.replace('[', '').trim() || '' : '',
          description: line.name || (line.product_id ? line.product_id[1] : ''),
          pricePerUnit: line.price_unit || 0,
          quantity: line.quantity || 0,
          total: lineTotal,
        });
        invoiceMap[invNum].invoiceTotal += lineTotal;
      }

      const invoices = Object.values(invoiceMap);

      res.json({ invoices });
    } catch (error) {
      console.error("Error fetching company invoice lines:", error);
      res.status(500).json({ error: "Failed to fetch invoice lines" });
    }
  });

  // Company Files: email sends, QuickQuotes, Price Lists for orphan companies
  app.get("/api/companies/by-name/files", isAuthenticated, async (req: any, res) => {
    try {
      const name = ((req.query.name as string) || '').trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const orphanCustomers = await db.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
        .from(customers)
        .where(and(sql`LOWER(${customers.company}) = LOWER(${name})`, sql`${customers.companyId} IS NULL`));

      if (!orphanCustomers.length) return res.json({ emailSends: [], quoteEvents: [], priceListEvents: [] });

      const ids = orphanCustomers.map(c => c.id);
      const customerMap = new Map(orphanCustomers.map(c => [c.id, c]));

      const [sends, quotes, priceLists] = await Promise.all([
        db.select().from(emailSends).where(and(inArray(emailSends.customerId, ids), eq(emailSends.status, 'sent'))).orderBy(desc(emailSends.sentAt)).limit(50),
        db.select().from(quoteEvents).where(inArray(quoteEvents.customerId, ids)).orderBy(desc(quoteEvents.createdAt)).limit(50),
        db.select().from(priceListEvents).where(inArray(priceListEvents.customerId, ids)).orderBy(desc(priceListEvents.createdAt)).limit(50),
      ]);

      res.json({
        emailSends: sends.map(s => ({ ...s, contactFirstName: customerMap.get(s.customerId!)?.firstName, contactLastName: customerMap.get(s.customerId!)?.lastName })),
        quoteEvents: quotes.map(q => ({ ...q, contactFirstName: customerMap.get(q.customerId)?.firstName, contactLastName: customerMap.get(q.customerId)?.lastName })),
        priceListEvents: priceLists.map(p => ({ ...p, contactFirstName: customerMap.get(p.customerId!)?.firstName, contactLastName: customerMap.get(p.customerId!)?.lastName })),
      });
    } catch (error) {
      console.error("Error fetching company files:", error);
      res.status(500).json({ error: "Failed to fetch company files" });
    }
  });

  // Company Files: email sends, QuickQuotes, Price Lists for official companies
  app.get("/api/companies/:id/files", isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) return res.status(400).json({ error: "Invalid company ID" });

      const companyCustomers = await db.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
        .from(customers)
        .where(eq(customers.companyId, companyId));

      if (!companyCustomers.length) return res.json({ emailSends: [], quoteEvents: [], priceListEvents: [] });

      const ids = companyCustomers.map(c => c.id);
      const customerMap = new Map(companyCustomers.map(c => [c.id, c]));

      const [sends, quotes, priceLists] = await Promise.all([
        db.select().from(emailSends).where(and(inArray(emailSends.customerId, ids), eq(emailSends.status, 'sent'))).orderBy(desc(emailSends.sentAt)).limit(50),
        db.select().from(quoteEvents).where(inArray(quoteEvents.customerId, ids)).orderBy(desc(quoteEvents.createdAt)).limit(50),
        db.select().from(priceListEvents).where(inArray(priceListEvents.customerId, ids)).orderBy(desc(priceListEvents.createdAt)).limit(50),
      ]);

      res.json({
        emailSends: sends.map(s => ({ ...s, contactFirstName: customerMap.get(s.customerId!)?.firstName, contactLastName: customerMap.get(s.customerId!)?.lastName })),
        quoteEvents: quotes.map(q => ({ ...q, contactFirstName: customerMap.get(q.customerId)?.firstName, contactLastName: customerMap.get(q.customerId)?.lastName })),
        priceListEvents: priceLists.map(p => ({ ...p, contactFirstName: customerMap.get(p.customerId!)?.firstName, contactLastName: customerMap.get(p.customerId!)?.lastName })),
      });
    } catch (error) {
      console.error("Error fetching company files:", error);
      res.status(500).json({ error: "Failed to fetch company files" });
    }
  });

  // Delete a lead

  // ── Helper: push a single lead to Odoo as a Contact (res.partner) ──────────

  // Push a single lead to Odoo as a Contact

  // Bulk push leads to Odoo as Contacts


  // Preview what will be transferred when converting a lead to customer

  // Convert a lead into a customer (or merge into existing customer by email)

  // Add activity to a lead

  // Convert a contact to a lead (Assign as Lead from SPOTLIGHT)

  // Batch convert contacts with $0 spending to leads (OPTIMIZED with batch processing)

  // Import leads from Odoo

  // ========================================
  // ODOO INTEGRATION APIs
  // ========================================

  const { odooClient } = await import('./odoo');

  // Odoo health check - public endpoint for debugging production issues
  app.get("/api/odoo/health", async (req: any, res) => {
    try {
      const configured = !!(process.env.ODOO_URL && process.env.ODOO_DATABASE && process.env.ODOO_USERNAME && (process.env.ODOO_PASSWORD || process.env.ODOO_API_KEY));
      
      let canAuth = false;
      let lastError: string | null = null;
      
      if (configured) {
        try {
          const testResult = await odooClient.testConnection();
          canAuth = testResult.success === true;
          if (!canAuth && testResult.message) {
            lastError = testResult.message;
          }
        } catch (e: any) {
          lastError = e.message || 'Unknown error during auth test';
        }
      } else {
        lastError = 'Missing required Odoo environment variables';
      }
      
      res.json({
        configured,
        canAuth,
        lastError,
        envStatus: {
          ODOO_URL: !!process.env.ODOO_URL,
          ODOO_DATABASE: !!process.env.ODOO_DATABASE,
          ODOO_USERNAME: !!process.env.ODOO_USERNAME,
          ODOO_API_KEY: !!process.env.ODOO_API_KEY,
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        configured: false,
        canAuth: false,
        lastError: error.message || 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Test Odoo connection
  app.get("/api/odoo/test-connection", requireAdmin, async (req: any, res) => {
    try {
      const result = await odooClient.testConnection();
      res.json(result);
    } catch (error: any) {
      console.error("Odoo connection test error:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to connect to Odoo" 
      });
    }
  });

  // Get Odoo connection status
  app.get("/api/odoo/status", requireAdmin, async (req: any, res) => {
    try {
      const status = odooClient.getConnectionStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Odoo base URL for constructing links (available to approved users)
  app.get("/api/odoo/base-url", requireApproval, async (req: any, res) => {
    try {
      const odooUrl = process.env.ODOO_URL?.replace(/\/+$/, '') || null;
      res.json({ baseUrl: odooUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get available payment terms from Odoo
  app.get("/api/odoo/payment-terms", requireApproval, async (req: any, res) => {
    try {
      const terms = await odooClient.getPaymentTerms();
      res.json(terms);
    } catch (error: any) {
      console.error("Error fetching payment terms:", error);
      res.status(500).json({ error: error.message || "Failed to fetch payment terms from Odoo" });
    }
  });

  // Update customer payment terms (immediate Odoo update)
  app.post("/api/odoo/customer/:customerId/payment-terms", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { paymentTermId, paymentTermName } = req.body;
      
      // Get customer to find their odooPartnerId
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo" });
      }
      
      // Update payment terms directly in Odoo (this is a critical business field)
      const result = await odooClient.updatePartnerPaymentTerms(customer.odooPartnerId, paymentTermId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to update payment terms in Odoo" });
      }
      
      res.json({ success: true, message: "Payment terms updated in Odoo" });
    } catch (error: any) {
      console.error("Error updating payment terms:", error);
      res.status(500).json({ error: error.message || "Failed to update payment terms" });
    }
  });

  // Get available partner categories (tags) from Odoo
  app.get("/api/odoo/partner-categories", requireApproval, async (req: any, res) => {
    try {
      const categories = await odooClient.getPartnerCategories();
      res.json(categories);
    } catch (error: any) {
      console.error("Error fetching partner categories:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partner categories from Odoo" });
    }
  });

  // Get partner IDs that have a specific category/tag - used for filtering
  app.get("/api/odoo/partners-by-category/:categoryName", requireApproval, async (req: any, res) => {
    try {
      const { categoryName } = req.params;
      if (!categoryName) {
        return res.status(400).json({ error: "Category name is required" });
      }
      const partnerIds = await odooClient.getPartnerIdsByCategory(categoryName);
      res.json(partnerIds);
    } catch (error: any) {
      console.error("Error fetching partners by category:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partners by category from Odoo" });
    }
  });

  // Get available sales people (internal users) from Odoo
  app.get("/api/odoo/sales-people", requireApproval, async (req: any, res) => {
    try {
      const users = await odooClient.getUsers();
      // Return sorted by name
      const salesPeople = users
        .map(u => ({ id: u.id, name: u.name, email: u.email }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(salesPeople);
    } catch (error: any) {
      console.error("Error fetching sales people:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sales people from Odoo" });
    }
  });

  // Update customer sales person (immediate Odoo update)
  app.post("/api/odoo/customer/:customerId/sales-person", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { salesPersonId, salesPersonName } = req.body;
      
      // Get customer to find their odooPartnerId
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo" });
      }
      
      // Update user_id (sales person) directly in Odoo
      await odooClient.write('res.partner', customer.odooPartnerId, {
        user_id: salesPersonId || false // false to unassign
      });
      
      // Find the app user that corresponds to this Odoo user (for SPOTLIGHT task assignment)
      let appUserId: string | null = null;
      if (salesPersonId) {
        const [appUser] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.odooUserId, salesPersonId))
          .limit(1);
        appUserId = appUser?.id || null;
      }
      
      // Update BOTH salesRepId AND salesRepName for consistency
      // salesRepId is used by SPOTLIGHT for task assignment
      // salesRepName is used for display purposes
      await db.update(customers).set({
        salesRepId: appUserId,
        salesRepName: salesPersonName || null,
        updatedAt: new Date()
      }).where(eq(customers.id, customerId));
      
      console.log(`[Sales Person Sync] Customer ${customerId}: Odoo user_id=${salesPersonId}, app salesRepId=${appUserId}, name=${salesPersonName}`);
      
      // If this is a company, propagate sales person to child contacts in Odoo
      let childrenUpdated = 0;
      if (customer.isCompany) {
        try {
          // Get all child contacts of this company from Odoo
          const childContacts = await odooClient.searchRead('res.partner', [
            ['parent_id', '=', customer.odooPartnerId],
            ['is_company', '=', false]
          ], ['id'], { limit: 500 });
          
          if (childContacts && childContacts.length > 0) {
            // Update all child contacts with the same sales person in Odoo
            for (const child of childContacts) {
              try {
                await odooClient.write('res.partner', child.id, {
                  user_id: salesPersonId || false
                });
                childrenUpdated++;
              } catch (childErr) {
                console.error(`[Sales Person Sync] Failed to update child contact ${child.id}:`, childErr);
              }
            }
            console.log(`[Sales Person Sync] Updated ${childrenUpdated} child contacts in Odoo`);
            
            // Also update child contacts in local database
            const localChildContacts = await db.select({ id: customers.id })
              .from(customers)
              .where(eq(customers.parentCustomerId, customerId));
            
            if (localChildContacts.length > 0) {
              await db.update(customers).set({
                salesRepId: appUserId,
                salesRepName: salesPersonName || null,
                updatedAt: new Date()
              }).where(eq(customers.parentCustomerId, customerId));
              console.log(`[Sales Person Sync] Updated ${localChildContacts.length} child contacts in local database`);
            }
          }
        } catch (childErr) {
          console.error("[Sales Person Sync] Error updating child contacts:", childErr);
          // Continue - main update succeeded
        }
      }
      
      res.json({ 
        success: true, 
        message: salesPersonName 
          ? `Sales person set to ${salesPersonName}${childrenUpdated > 0 ? ` (including ${childrenUpdated} child contacts)` : ''}`
          : "Sales person unassigned"
      });
    } catch (error: any) {
      console.error("Error updating customer sales person:", error);
      res.status(500).json({ error: error.message || "Failed to update sales person" });
    }
  });

  // Update customer category/tag (immediate Odoo update) - also propagates to child contacts
  app.post("/api/odoo/customer/:customerId/category", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { categoryId, categoryName } = req.body;
      
      // Get customer to find their odooPartnerId
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo" });
      }
      
      // Update category directly in Odoo for the company - replaces all categories with just this one
      await odooClient.write('res.partner', customer.odooPartnerId, {
        category_id: [[6, 0, [categoryId]]] // Replace all categories with just this one
      });
      
      // Get all child contacts of this company and update their categories too
      const childContacts = await odooClient.searchRead('res.partner', [
        ['parent_id', '=', customer.odooPartnerId],
        ['is_company', '=', false]
      ], ['id'], { limit: 500 });
      
      let childrenUpdated = 0;
      if (childContacts && childContacts.length > 0) {
        // Update all child contacts with the same category
        const childIds = childContacts.map((c: any) => c.id);
        for (const childId of childIds) {
          try {
            await odooClient.write('res.partner', childId, {
              category_id: [[6, 0, [categoryId]]]
            });
            childrenUpdated++;
          } catch (childError: any) {
            console.error(`Error updating child contact ${childId}:`, childError.message);
          }
        }
      }
      
      // Also update local pricing tier field
      await db.update(customers).set({
        pricingTier: categoryName,
        updatedAt: new Date()
      }).where(eq(customers.id, customerId));
      
      res.json({ 
        success: true, 
        message: `Category updated in Odoo${childrenUpdated > 0 ? ` (${childrenUpdated} contacts also updated)` : ''}`,
        childrenUpdated 
      });
    } catch (error: any) {
      console.error("Error updating customer category:", error);
      res.status(500).json({ error: error.message || "Failed to update category" });
    }
  });

  // Create customer in Odoo (push CRM contact to Odoo)
  app.post("/api/odoo/customer/:customerId/create", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get customer from CRM
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is already linked to Odoo", odooPartnerId: customer.odooPartnerId });
      }
      
      // Validate required fields
      const name = customer.isCompany 
        ? customer.company 
        : [customer.firstName, customer.lastName].filter(Boolean).join(' ');
      
      if (!name) {
        return res.status(422).json({ error: "Customer name is required (company name or first/last name)" });
      }
      
      // Check for existing partner by email (duplicate prevention)
      if (customer.email) {
        const existingPartners = await odooClient.searchRead('res.partner', [
          ['email', '=ilike', customer.email]
        ], ['id', 'name', 'email', 'is_company'], { limit: 5 });
        
        if (existingPartners && existingPartners.length > 0) {
          return res.status(409).json({ 
            error: "A partner with this email already exists in Odoo",
            duplicates: existingPartners.map((p: any) => ({
              id: p.id,
              name: p.name,
              email: p.email,
              isCompany: p.is_company
            }))
          });
        }
      }
      
      // Resolve country ID if provided
      let countryId: number | false = false;
      if (customer.country) {
        const countries = await odooClient.getCountries();
        const country = countries.find(c => 
          c.name.toLowerCase() === customer.country?.toLowerCase() ||
          c.code.toLowerCase() === customer.country?.toLowerCase()
        );
        if (country) {
          countryId = country.id;
        }
      }
      
      // Resolve state ID if country found and state provided
      let stateId: number | false = false;
      if (countryId && customer.province) {
        const states = await odooClient.getStates(countryId as number);
        const state = states.find(s => 
          s.name.toLowerCase() === customer.province?.toLowerCase() ||
          s.code.toLowerCase() === customer.province?.toLowerCase()
        );
        if (state) {
          stateId = state.id;
        }
      }
      
      // Build partner data - only include valid res.partner fields
      const partnerData: Record<string, any> = {
        name,
        is_company: customer.isCompany || false,
        email: customer.email || false,
        phone: customer.phone || customer.cell || false,
        street: customer.address1 || false,
        city: customer.city || false,
        zip: customer.zip || false,
        website: customer.website || false,
        comment: customer.note || false,
      };
      
      if (countryId) partnerData.country_id = countryId;
      if (stateId) partnerData.state_id = stateId;
      
      // Create the partner in Odoo
      const newPartnerId = await odooClient.create('res.partner', partnerData);
      
      if (!newPartnerId) {
        return res.status(500).json({ error: "Failed to create partner in Odoo" });
      }
      
      console.log(`[Odoo] Created new partner ID ${newPartnerId} for CRM customer ${customerId}`);
      
      // Update local customer record with the new Odoo partner ID
      await db.update(customers).set({
        odooPartnerId: newPartnerId,
        updatedAt: new Date()
      }).where(eq(customers.id, customerId));
      
      res.json({ 
        success: true, 
        message: `Successfully created "${name}" in Odoo`,
        odooPartnerId: newPartnerId
      });
    } catch (error: any) {
      console.error("Error creating customer in Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to create customer in Odoo" });
    }
  });

  // Link CRM customer to existing Odoo partner
  app.post("/api/odoo/customer/:customerId/link", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { odooPartnerId } = req.body;
      
      if (!odooPartnerId) {
        return res.status(400).json({ error: "odooPartnerId is required" });
      }
      
      // Get customer from CRM
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Verify the Odoo partner exists
      const partners = await odooClient.searchRead('res.partner', [
        ['id', '=', odooPartnerId]
      ], ['id', 'name'], { limit: 1 });
      
      if (!partners || partners.length === 0) {
        return res.status(404).json({ error: "Odoo partner not found" });
      }
      
      // Update local customer record with the Odoo partner ID
      await db.update(customers).set({
        odooPartnerId: odooPartnerId,
        updatedAt: new Date()
      }).where(eq(customers.id, customerId));
      
      console.log(`[Odoo] Linked CRM customer ${customerId} to Odoo partner ${odooPartnerId}`);
      
      res.json({ 
        success: true, 
        message: `Successfully linked to "${partners[0].name}" in Odoo`,
        odooPartnerId
      });
    } catch (error: any) {
      console.error("Error linking customer to Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to link customer to Odoo" });
    }
  });

  // Bulk update payment terms for multiple customers
  app.post("/api/odoo/customers/bulk/payment-terms", requireApproval, async (req: any, res) => {
    try {
      const { customerIds, paymentTermId, paymentTermName } = req.body;
      
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ error: "customerIds array is required" });
      }
      if (!paymentTermId) {
        return res.status(400).json({ error: "paymentTermId is required" });
      }

      const results = { success: 0, failed: 0, errors: [] as string[] };
      
      for (const customerId of customerIds) {
        try {
          const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
          if (!customer || !customer.odooPartnerId) {
            results.failed++;
            results.errors.push(`Customer ${customerId}: Not linked to Odoo`);
            continue;
          }
          
          const result = await odooClient.updatePartnerPaymentTerms(customer.odooPartnerId, paymentTermId);
          if (result.success) {
            // Also update local customer record with payment term
            await db.update(customers).set({
              updatedAt: new Date()
            }).where(eq(customers.id, customerId));
            results.success++;
          } else {
            results.failed++;
            results.errors.push(`Customer ${customer.company || customerId}: ${result.error}`);
          }
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Customer ${customerId}: ${err.message}`);
        }
      }
      
      res.json({
        success: results.success > 0,
        message: `Updated ${results.success} of ${customerIds.length} customers`,
        ...results
      });
    } catch (error: any) {
      console.error("Error bulk updating payment terms:", error);
      res.status(500).json({ error: error.message || "Failed to bulk update payment terms" });
    }
  });

  // Bulk update sales person for multiple customers
  app.post("/api/odoo/customers/bulk/sales-person", requireApproval, async (req: any, res) => {
    try {
      const { customerIds, salesPersonId, salesPersonName } = req.body;
      
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ error: "customerIds array is required" });
      }

      // Find the app user that corresponds to this Odoo user (for SPOTLIGHT task assignment)
      let appUserId: string | null = null;
      if (salesPersonId) {
        const [appUser] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.odooUserId, salesPersonId))
          .limit(1);
        appUserId = appUser?.id || null;
      }

      const results = { success: 0, failed: 0, errors: [] as string[] };
      
      for (const customerId of customerIds) {
        try {
          const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
          if (!customer || !customer.odooPartnerId) {
            results.failed++;
            results.errors.push(`Customer ${customerId}: Not linked to Odoo`);
            continue;
          }
          
          await odooClient.write('res.partner', customer.odooPartnerId, {
            user_id: salesPersonId || false
          });
          
          // Update BOTH salesRepId AND salesRepName for consistency
          await db.update(customers).set({
            salesRepId: appUserId,
            salesRepName: salesPersonName || null,
            updatedAt: new Date()
          }).where(eq(customers.id, customerId));
          
          results.success++;
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Customer ${customerId}: ${err.message}`);
        }
      }
      
      console.log(`[Bulk Sales Person Sync] Updated ${results.success} customers: Odoo user_id=${salesPersonId}, app salesRepId=${appUserId}, name=${salesPersonName}`);
      
      res.json({
        success: results.success > 0,
        message: `Updated ${results.success} of ${customerIds.length} customers`,
        ...results
      });
    } catch (error: any) {
      console.error("Error bulk updating sales person:", error);
      res.status(500).json({ error: error.message || "Failed to bulk update sales person" });
    }
  });

  // Bulk update category/tag for multiple customers
  app.post("/api/odoo/customers/bulk/category", requireApproval, async (req: any, res) => {
    try {
      const { customerIds, categoryId, categoryName } = req.body;
      
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ error: "customerIds array is required" });
      }
      if (!categoryId) {
        return res.status(400).json({ error: "categoryId is required" });
      }

      const results = { success: 0, failed: 0, childrenUpdated: 0, errors: [] as string[] };
      
      for (const customerId of customerIds) {
        try {
          const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
          if (!customer || !customer.odooPartnerId) {
            results.failed++;
            results.errors.push(`Customer ${customerId}: Not linked to Odoo`);
            continue;
          }
          
          // Update category in Odoo for the company
          await odooClient.write('res.partner', customer.odooPartnerId, {
            category_id: [[6, 0, [categoryId]]]
          });
          
          // Get and update child contacts
          const childContacts = await odooClient.searchRead('res.partner', [
            ['parent_id', '=', customer.odooPartnerId],
            ['is_company', '=', false]
          ], ['id'], { limit: 500 });
          
          if (childContacts && childContacts.length > 0) {
            for (const child of childContacts) {
              try {
                await odooClient.write('res.partner', child.id, {
                  category_id: [[6, 0, [categoryId]]]
                });
                results.childrenUpdated++;
              } catch (childError: any) {
                // Log but continue
              }
            }
          }
          
          // Update local pricing tier
          await db.update(customers).set({
            pricingTier: categoryName,
            updatedAt: new Date()
          }).where(eq(customers.id, customerId));
          
          results.success++;
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Customer ${customerId}: ${err.message}`);
        }
      }
      
      res.json({
        success: results.success > 0,
        message: `Updated ${results.success} of ${customerIds.length} customers${results.childrenUpdated > 0 ? ` (${results.childrenUpdated} child contacts)` : ''}`,
        ...results
      });
    } catch (error: any) {
      console.error("Error bulk updating category:", error);
      res.status(500).json({ error: error.message || "Failed to bulk update category" });
    }
  });

  // Get partners (customers/companies) from Odoo
  app.get("/api/odoo/partners", requireApproval, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const isCompany = req.query.is_company === 'true' ? true : req.query.is_company === 'false' ? false : undefined;
      
      const partners = await odooClient.getPartners({ limit, offset, isCompany });
      res.json(partners);
    } catch (error: any) {
      console.error("Error fetching Odoo partners:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partners from Odoo" });
    }
  });

  // Get single partner by ID
  app.get("/api/odoo/partners/:id", requireApproval, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const partner = await odooClient.getPartnerById(id);
      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }
      res.json(partner);
    } catch (error: any) {
      console.error("Error fetching Odoo partner:", error);
      res.status(500).json({ error: error.message || "Failed to fetch partner from Odoo" });
    }
  });

  // NOTE: This is a READ-ONLY integration - no write operations to Odoo

  // Get products from Odoo
  app.get("/api/odoo/products", requireApproval, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const includeNoSku = req.query.includeNoSku === 'true';
      const search = (req.query.search as string || '').trim();
      
      // Use product.product (variants) instead of product.template
      // This matches the Odoo Product Variants page which shows ~597 items
      let domain: any[] = [['active', '=', true]];
      
      // Filter to only show products that have SKUs (default_code) unless includeNoSku is true
      if (!includeNoSku) {
        // Odoo domain: active AND has SKU (not false AND not empty string)
        domain = [
          ['active', '=', true],
          ['default_code', '!=', false],
          ['default_code', '!=', '']
        ];
      }
      
      // Add search filter if provided - search in SKU or name using ilike (case-insensitive contains)
      if (search) {
        // Odoo uses 'ilike' for case-insensitive partial match
        // Add OR condition: name contains search OR default_code contains search
        domain = [
          ...domain,
          '|',
          ['name', 'ilike', `%${search}%`],
          ['default_code', 'ilike', `%${search}%`]
        ];
      }
      
      const products = await odooClient.searchProductVariants({ limit, offset, domain });
      res.json(products);
    } catch (error: any) {
      console.error("Error fetching Odoo products:", error);
      res.status(500).json({ error: error.message || "Failed to fetch products from Odoo" });
    }
  });

  // Get product categories from Odoo
  app.get("/api/odoo/product-categories", requireApproval, async (req: any, res) => {
    try {
      const categories = await odooClient.getAllProductCategories();
      res.json(categories);
    } catch (error: any) {
      console.error("Error fetching Odoo product categories:", error);
      res.status(500).json({ error: error.message || "Failed to fetch product categories from Odoo" });
    }
  });

  // Get previous/next product IDs for navigation
  app.get("/api/odoo/products/:id/navigation", requireApproval, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      // Get a window of products around the current one
      const products = await odooClient.searchProductVariants({ 
        limit: 1000, 
        offset: 0, 
        domain: [['default_code', '!=', false]]
      });
      
      // Find current product index
      const currentIndex = products.findIndex((p: any) => p.id === productId);
      
      const prevId = currentIndex > 0 ? products[currentIndex - 1].id : null;
      const nextId = currentIndex >= 0 && currentIndex < products.length - 1 
        ? products[currentIndex + 1].id 
        : null;
      
      res.json({ prevId, nextId });
    } catch (error: any) {
      console.error("Error fetching product navigation:", error);
      res.json({ prevId: null, nextId: null });
    }
  });

  // Get detailed product information including pricing tiers, inventory, POs, and customer purchases
  app.get("/api/odoo/products/:id/details", requireApproval, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      // Fetch product variant first to get the template ID for related queries
      const product = await odooClient.getProductVariantById(productId);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Get the template ID for pricelist and inventory queries
      const templateId = product.product_tmpl_id ? product.product_tmpl_id[0] : productId;
      
      // Fetch related data in parallel
      // Use templateId for queries that need product template, productId for variant-specific queries
      const [pricingTiers, inventory, purchaseOrders, customerPurchases] = await Promise.all([
        odooClient.getPricelistItemsForProduct(templateId),
        odooClient.getProductInventoryByTemplate(templateId),
        odooClient.getProductPurchaseOrders(productId),
        odooClient.getProductCustomerPurchases(templateId), // Uses template ID to find all variant sales
      ]);

      // Defensive defaults for all data
      const safeInventory = inventory || { totalAvailable: 0, totalVirtual: 0, totalIncoming: 0, totalOutgoing: 0, variants: [] };
      const safePricingTiers = pricingTiers || [];
      const safePurchaseOrders = purchaseOrders || [];
      const safeCustomerPurchases = customerPurchases || [];

      // Use the product variant's standard price directly
      const averageCost = product.standard_price || 0;

      // Calculate total on PO
      const totalOnPO = safePurchaseOrders.reduce((sum, po) => sum + (po.qty_remaining || 0), 0);

      // Fetch local pricing from productPricingMaster by SKU
      const sku = product.default_code || '';
      let localPricing: any = null;
      if (sku) {
        const [localProduct] = await db.select().from(productPricingMaster)
          .where(eq(productPricingMaster.itemCode, sku))
          .limit(1);
        
        if (localProduct) {
          // Build pricing tiers array in QuickQuotes format
          const tierData = [
            { key: 'landedPrice', label: 'LANDED PRICE', pricePerSqm: parseFloat(localProduct.landedPrice || '0') },
            { key: 'exportPrice', label: 'EXPORT ONLY', pricePerSqm: parseFloat(localProduct.exportPrice || '0') },
            { key: 'masterDistributorPrice', label: 'DISTRIBUTOR', pricePerSqm: parseFloat(localProduct.masterDistributorPrice || '0') },
            { key: 'dealerPrice', label: 'DEALER-VIP', pricePerSqm: parseFloat(localProduct.dealerPrice || '0') },
            { key: 'dealer2Price', label: 'DEALER', pricePerSqm: parseFloat(localProduct.dealer2Price || '0') },
            { key: 'approvalNeededPrice', label: 'SHOPIFY LOWEST', pricePerSqm: parseFloat(localProduct.approvalNeededPrice || '0') },
            { key: 'tierStage25Price', label: 'SHOPIFY3', pricePerSqm: parseFloat(localProduct.tierStage25Price || '0') },
            { key: 'tierStage2Price', label: 'SHOPIFY2', pricePerSqm: parseFloat(localProduct.tierStage2Price || '0') },
            { key: 'tierStage15Price', label: 'SHOPIFY1', pricePerSqm: parseFloat(localProduct.tierStage15Price || '0') },
            { key: 'tierStage1Price', label: 'SHOPIFY-ACCOUNT', pricePerSqm: parseFloat(localProduct.tierStage1Price || '0') },
            { key: 'retailPrice', label: 'RETAIL', pricePerSqm: parseFloat(localProduct.retailPrice || '0') },
          ];
          
          const totalSqm = parseFloat(localProduct.totalSqm || '0') || 0;
          const minQuantity = Math.max(localProduct.minQuantity || 1, 1); // Ensure at least 1 to avoid division by zero
          
          localPricing = {
            productName: localProduct.productName,
            productType: localProduct.productType,
            size: localProduct.size,
            totalSqm,
            minQuantity,
            rollSheet: localProduct.rollSheet,
            unitOfMeasure: localProduct.unitOfMeasure,
            tiers: tierData.map(tier => {
              // Guard against division by zero and invalid values
              const pricePerSheet = totalSqm > 0 && minQuantity > 0 
                ? (tier.pricePerSqm * totalSqm) / minQuantity 
                : 0;
              const minOrderQtyPrice = pricePerSheet * minQuantity;
              return {
                ...tier,
                pricePerSheet: isFinite(pricePerSheet) ? pricePerSheet : 0,
                minOrderQtyPrice: isFinite(minOrderQtyPrice) ? minOrderQtyPrice : 0,
              };
            }),
          };
        }
      }

      res.json({
        product: {
          id: product.id,
          name: product.name,
          sku: product.default_code || '',
          listPrice: product.list_price,
          averageCost,
          category: product.categ_id ? product.categ_id[1] : null,
          type: product.type,
          description: product.description_sale || product.description || '',
          uom: product.uom_id ? product.uom_id[1] : 'Unit',
        },
        pricingTiers: safePricingTiers.map(tier => ({
          id: tier.id,
          pricelistName: tier.pricelist_name,
          pricelistId: tier.pricelist_id?.[0] || 0,
          fixedPrice: tier.fixed_price || 0,
          minQuantity: tier.min_quantity || 1,
          computePrice: tier.compute_price || 'fixed',
          percentPrice: tier.percent_price || 0,
        })),
        localPricing,
        inventory: {
          available: safeInventory.totalAvailable || 0,
          virtual: safeInventory.totalVirtual || 0,
          incoming: safeInventory.totalIncoming || 0,
          outgoing: safeInventory.totalOutgoing || 0,
          variants: safeInventory.variants || [],
        },
        purchaseOrders: {
          totalOnOrder: totalOnPO,
          orders: safePurchaseOrders.slice(0, 10), // Limit to 10 most recent
        },
        customerPurchases: safeCustomerPurchases.map(c => ({
          partnerId: c.partner_id,
          partnerName: c.partner_name,
          totalQty: c.total_qty || 0,
          totalRevenue: c.total_revenue || 0,
          orderCount: c.order_count || 0,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching product details:", error);
      res.status(500).json({ error: error.message || "Failed to fetch product details from Odoo" });
    }
  });

  // Get best selling price analysis for a product based on invoice history
  app.get("/api/odoo/products/:id/best-price", requireApproval, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      // Get the product to find its template ID
      const product = await odooClient.getProductVariantById(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const templateId = product.product_tmpl_id ? product.product_tmpl_id[0] : productId;

      // Fetch invoice lines for this product (last 12 months)
      const invoiceLines = await odooClient.getProductInvoiceLines(productId, templateId);

      if (invoiceLines.length === 0) {
        return res.json({
          hasData: false,
          message: "No invoice history found for this product in the last 12 months",
        });
      }

      // Calculate effective unit prices from each invoice line
      const priceData = invoiceLines
        .filter(line => line.quantity > 0 && line.price_unit > 0)
        .map(line => {
          // Effective price after discount
          const effectivePrice = line.price_unit * (1 - (line.discount || 0) / 100);
          return {
            price: effectivePrice,
            quantity: line.quantity,
            date: line.invoice_date,
            partner: line.partner_id?.[1] || 'Unknown',
          };
        });

      if (priceData.length === 0) {
        return res.json({
          hasData: false,
          message: "No valid pricing data found in invoice history",
        });
      }

      // Calculate statistics
      const totalQuantity = priceData.reduce((sum, d) => sum + d.quantity, 0);
      
      // Weighted average (by quantity)
      const weightedSum = priceData.reduce((sum, d) => sum + (d.price * d.quantity), 0);
      const weightedAverage = weightedSum / totalQuantity;

      // Sort prices for percentile calculations
      const sortedPrices = priceData.map(d => d.price).sort((a, b) => a - b);
      const minPrice = sortedPrices[0];
      const maxPrice = sortedPrices[sortedPrices.length - 1];
      
      // Median (50th percentile)
      const medianIndex = Math.floor(sortedPrices.length / 2);
      const median = sortedPrices.length % 2 === 0
        ? (sortedPrices[medianIndex - 1] + sortedPrices[medianIndex]) / 2
        : sortedPrices[medianIndex];

      // 25th and 75th percentiles with proper bounds checking for small samples
      const p25Index = Math.min(Math.floor(sortedPrices.length * 0.25), sortedPrices.length - 1);
      const p75Index = Math.min(Math.floor(sortedPrices.length * 0.75), sortedPrices.length - 1);
      // For very small samples, ensure P75 >= P25
      const percentile25 = sortedPrices[p25Index] ?? minPrice;
      const percentile75 = sortedPrices.length > 1 
        ? (sortedPrices[Math.max(p75Index, p25Index + 1)] ?? maxPrice)
        : maxPrice;

      // Best price recommendation: Max of weighted average and 25th percentile
      // This gives a competitive but profitable price
      const recommendedPrice = Math.max(weightedAverage, percentile25);

      // Find most recent price with proper guards
      const sortedByDate = [...priceData].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const mostRecentEntry = sortedByDate[0];
      const mostRecentPrice = (mostRecentEntry?.price && isFinite(mostRecentEntry.price)) ? mostRecentEntry.price : null;
      const mostRecentDate = mostRecentEntry?.date || null;

      // Simple average (unweighted)
      const simpleAverage = sortedPrices.reduce((a, b) => a + b, 0) / sortedPrices.length;

      res.json({
        hasData: true,
        recommendedPrice: Math.round(recommendedPrice * 100) / 100,
        statistics: {
          weightedAverage: Math.round(weightedAverage * 100) / 100,
          simpleAverage: Math.round(simpleAverage * 100) / 100,
          median: Math.round(median * 100) / 100,
          minPrice: Math.round(minPrice * 100) / 100,
          maxPrice: Math.round(maxPrice * 100) / 100,
          percentile25: Math.round(percentile25 * 100) / 100,
          percentile75: Math.round(percentile75 * 100) / 100,
        },
        volume: {
          totalInvoices: invoiceLines.length,
          totalQuantitySold: Math.round(totalQuantity),
          distinctCustomers: new Set(priceData.map(d => d.partner)).size,
        },
        recentActivity: mostRecentPrice !== null && mostRecentDate ? {
          mostRecentPrice: Math.round(mostRecentPrice * 100) / 100,
          mostRecentDate,
        } : undefined,
        productInfo: {
          id: product.id,
          name: product.name,
          sku: product.default_code || '',
        },
      });
    } catch (error: any) {
      console.error("Error calculating best price:", error);
      res.status(500).json({ error: error.message || "Failed to calculate best price" });
    }
  });

  // Get product inventory from Odoo by SKU
  app.get("/api/odoo/inventory/:itemCode", requireApproval, async (req: any, res) => {
    try {
      const { itemCode } = req.params;
      if (!itemCode) {
        return res.status(400).json({ error: "Item code is required" });
      }

      const inventory = await odooClient.getProductInventory(itemCode);
      const odooBaseUrl = process.env.ODOO_URL?.replace(/\/+$/, ''); // Remove trailing slashes
      const productUrl = inventory.productId && odooBaseUrl
        ? `${odooBaseUrl}/web#id=${inventory.productId}&model=product.product&view_type=form`
        : null;
      res.json({
        itemCode,
        qtyAvailable: inventory.qtyAvailable,
        qtyReserved: inventory.qtyReserved,
        qtyVirtual: inventory.qtyVirtual,
        productId: inventory.productId,
        odooUrl: productUrl,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error fetching Odoo inventory:", error);
      res.status(500).json({ error: error.message || "Failed to fetch inventory from Odoo" });
    }
  });

  // Get pricelists from Odoo
  app.get("/api/odoo/pricelists", requireApproval, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const pricelists = await odooClient.getPricelists({ limit, offset });
      res.json(pricelists);
    } catch (error: any) {
      console.error("Error fetching Odoo pricelists:", error);
      res.status(500).json({ error: error.message || "Failed to fetch pricelists from Odoo" });
    }
  });

  // Get sale orders from Odoo
  app.get("/api/odoo/orders", requireApproval, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const state = req.query.state as string;
      
      const orders = await odooClient.getSaleOrders({ limit, offset, state });
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching Odoo orders:", error);
      res.status(500).json({ error: error.message || "Failed to fetch orders from Odoo" });
    }
  });

  // Get Odoo users (sales reps)
  app.get("/api/odoo/users", requireApproval, async (req: any, res) => {
    try {
      const users = await odooClient.getUsers();
      res.json(users);
    } catch (error: any) {
      console.error("Error fetching Odoo users:", error);
      res.status(500).json({ error: error.message || "Failed to fetch users from Odoo" });
    }
  });

  // Get Odoo quotes (draft/sent sale orders) for a customer by their odooPartnerId
  app.get("/api/odoo/customer/:customerId/quotes", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get customer to find their odooPartnerId
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer.length || !customer[0].odooPartnerId) {
        return res.json([]);
      }
      
      const quotes = await odooClient.getQuotesByPartner(customer[0].odooPartnerId);
      res.json(quotes);
    } catch (error: any) {
      console.error("Error fetching Odoo quotes for customer:", error);
      res.status(500).json({ error: error.message || "Failed to fetch quotes from Odoo" });
    }
  });

  // Get Odoo invoices for a customer by their odooPartnerId
  app.get("/api/odoo/customer/:customerId/invoices", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get customer to find their odooPartnerId
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer.length || !customer[0].odooPartnerId) {
        return res.json([]);
      }
      
      const invoices = await odooClient.getInvoicesByPartner(customer[0].odooPartnerId);
      res.json(invoices);
    } catch (error: any) {
      console.error("Error fetching Odoo invoices for customer:", error);
      res.status(500).json({ error: error.message || "Failed to fetch invoices from Odoo" });
    }
  });

  // Get Odoo confirmed orders for a customer by their odooPartnerId
  app.get("/api/odoo/customer/:customerId/orders", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get customer to find their odooPartnerId
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer.length || !customer[0].odooPartnerId) {
        return res.json([]);
      }
      
      const orders = await odooClient.getSaleOrdersByPartner(customer[0].odooPartnerId);
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching Odoo orders for customer:", error);
      res.status(500).json({ error: error.message || "Failed to fetch orders from Odoo" });
    }
  });

  // Get Odoo stats for a customer (for the Odoo-style stat bar)
  app.get("/api/odoo/customer/:customerId/stats", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get customer to find their odooPartnerId
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer.length || !customer[0].odooPartnerId) {
        return res.json({
          sales: 0,
          salesCount: 0,
          invoiced: 0,
          invoicedCount: 0,
          due: 0,
          dueCount: 0,
          quotesCount: 0,
          quotesTotal: 0,
          connected: false,
        });
      }
      
      const partnerId = customer[0].odooPartnerId;
      
      // Fetch data in parallel
      const [quotes, orders, invoices] = await Promise.all([
        odooClient.getQuotesByPartner(partnerId).catch(() => []),
        odooClient.getSaleOrdersByPartner(partnerId).catch(() => []),
        odooClient.getInvoicesByPartner(partnerId).catch(() => []),
      ]);
      
      // Calculate sales (confirmed orders)
      const salesTotal = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.amount_total) || 0), 0);
      
      // Calculate invoiced (paid invoices)
      const paidInvoices = invoices.filter((inv: any) => inv.payment_state === 'paid' || inv.payment_state === 'in_payment');
      const invoicedTotal = paidInvoices.reduce((sum: number, inv: any) => sum + (parseFloat(inv.amount_total) || 0), 0);
      
      // Calculate due (unpaid invoices)
      const dueInvoices = invoices.filter((inv: any) => 
        inv.state === 'posted' && 
        (inv.payment_state === 'not_paid' || inv.payment_state === 'partial')
      );
      const dueTotal = dueInvoices.reduce((sum: number, inv: any) => sum + (parseFloat(inv.amount_residual) || 0), 0);
      
      // Quotes total
      const quotesTotal = quotes.reduce((sum: number, q: any) => sum + (parseFloat(q.amount_total) || 0), 0);
      
      res.json({
        sales: salesTotal,
        salesCount: orders.length,
        invoiced: invoicedTotal,
        invoicedCount: paidInvoices.length,
        due: dueTotal,
        dueCount: dueInvoices.length,
        quotesCount: quotes.length,
        quotesTotal: quotesTotal,
        connected: true,
      });
    } catch (error: any) {
      console.error("Error fetching Odoo stats for customer:", error);
      res.status(500).json({ error: error.message || "Failed to fetch stats from Odoo" });
    }
  });

  // Get comprehensive business metrics for a customer from Odoo
  // Returns: salesPerson, paymentTerms, totalOutstanding, lifetimeSales, averageMargin, topProducts, purchasedCategories, allCategories
  app.get("/api/odoo/customer/:customerId/business-metrics", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get customer to find their odooPartnerId
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer.length) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      let odooPartnerId = customer[0].odooPartnerId;
      
      // If no odooPartnerId, try to auto-match by email (only if exactly one match)
      if (!odooPartnerId && customer[0].email) {
        try {
          const normalizedEmail = customer[0].email.toLowerCase().trim();
          const matchingPartners = await odooClient.searchRead('res.partner', [
            ['email', '=ilike', normalizedEmail],
            ['active', '=', true],
          ], ['id', 'name', 'email', 'is_company', 'parent_id'], { limit: 5 });
          
          if (matchingPartners.length === 1) {
            // Exactly one match - safe to auto-link
            odooPartnerId = matchingPartners[0].id;
            
            // Update customer record with the found odooPartnerId
            await db.update(customers)
              .set({ 
                odooPartnerId: odooPartnerId,
                sources: customer[0].sources?.includes('odoo') 
                  ? customer[0].sources 
                  : [...(customer[0].sources || []), 'odoo'],
                updatedAt: new Date()
              })
              .where(eq(customers.id, customerId));
            
            console.log(`[Auto-Link] Customer ${customerId} linked to Odoo partner ${odooPartnerId} by email: ${normalizedEmail}`);
          } else if (matchingPartners.length > 1) {
            console.log(`[Auto-Link] Customer ${customerId} has ${matchingPartners.length} potential Odoo matches - manual linking required`);
          }
        } catch (autoLinkError: any) {
          console.error(`[Auto-Link] Error matching customer ${customerId} to Odoo:`, autoLinkError.message);
        }
      }
      
      if (!odooPartnerId) {
        const allCategories = await odooClient.getAllProductCategories();
        return res.json({
          salesPerson: null,
          paymentTerms: null,
          totalOutstanding: 0,
          lifetimeSales: 0,
          averageMargin: 0,
          topProducts: [],
          purchasedCategories: [],
          allCategories,
          connected: false,
        });
      }
      
      const [metrics, allCategories] = await Promise.all([
        odooClient.getPartnerBusinessMetrics(odooPartnerId),
        odooClient.getAllProductCategories(),
      ]);
      
      if (!metrics) {
        return res.json({
          salesPerson: null,
          paymentTerms: null,
          totalOutstanding: 0,
          lifetimeSales: 0,
          averageMargin: 0,
          topProducts: [],
          purchasedCategories: [],
          allCategories,
          connected: false,
        });
      }
      
      res.json({
        ...metrics,
        allCategories,
        connected: true,
      });
    } catch (error: any) {
      console.error("Error fetching Odoo business metrics for customer:", error);
      res.status(500).json({ error: error.message || "Failed to fetch business metrics from Odoo" });
    }
  });

  // Get company contacts (people belonging to this company) from Odoo + local DB
  app.get("/api/odoo/customer/:customerId/contacts", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get company record
      const [company] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!company) return res.json({ contacts: [] });

      // Fetch Odoo contacts if linked
      let odooContacts: Array<{ id: number; name: string; email: string | null; phone: string | null; function: string | null }> = [];
      if (company.odooPartnerId) {
        try {
          odooContacts = await odooClient.getCompanyContacts(company.odooPartnerId);
        } catch (e) {
          console.error('[Contacts] Odoo fetch error:', e);
        }
      }

      // Build a set of emails already returned from Odoo so we don't double-list
      const odooEmails = new Set(odooContacts.map(c => c.email?.toLowerCase().trim()).filter(Boolean));

      // Fetch local contacts: parentCustomerId match OR same company name (non-company records)
      const companyNameLower = company.company?.toLowerCase().trim();
      const localRows = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
          jobTitle: customers.jobTitle,
          parentCustomerId: customers.parentCustomerId,
          company: customers.company,
        })
        .from(customers)
        .where(and(
          eq(customers.isCompany, false),
          or(
            eq(customers.parentCustomerId, customerId),
            companyNameLower
              ? sql`LOWER(TRIM(COALESCE(${customers.company}, ''))) = ${companyNameLower} AND ${customers.parentCustomerId} IS NULL`
              : sql`false`
          )
        ));

      // Convert local contacts to the same shape, skipping those already in Odoo
      const localContacts = localRows
        .filter(r => {
          const emailKey = r.email?.toLowerCase().trim();
          return !emailKey || !odooEmails.has(emailKey);
        })
        .map((r, idx) => ({
          id: -(idx + 1), // negative synthetic ID to avoid collision with Odoo IDs
          name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || 'Unknown',
          email: r.email || null,
          phone: r.phone || null,
          function: r.jobTitle || null,
          localId: r.id,   // UUID for navigation to the contact's detail page
          localOnly: true,
        }));

      res.json({ contacts: [...odooContacts, ...localContacts] });
    } catch (error: any) {
      console.error("Error fetching company contacts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch company contacts" });
    }
  });

  // Create a new contact (child partner) for a company
  app.post("/api/odoo/customer/:customerId/contacts", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { name, email, phone, function: jobFunction } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(422).json({ error: "Contact name is required" });
      }
      
      // Get customer to find their odooPartnerId
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Build contact data matching Odoo's res.partner format
      const contactData: Record<string, any> = {
        name: name.trim(),
        is_company: false,
        type: 'contact', // Odoo contact type for child contacts
        email: email?.trim() || false,
        phone: phone?.trim() || false,
        function: jobFunction?.trim() || false, // job title/function field
      };
      
      // Always save the contact locally with parentCustomerId link
      const newLocalId = crypto.randomUUID();
      const nameParts = (name.trim()).split(' ');
      await db.insert(customers).values({
        id: newLocalId,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        jobTitle: jobFunction?.trim() || null,
        company: customer.company || '',
        isCompany: false,
        contactType: 'contact',
        parentCustomerId: customerId,
        salesRepId: customer.salesRepId || null,
        salesRepName: customer.salesRepName || null,
        pricingTier: customer.pricingTier || null,
        sources: ['manual'],
        createdAt: new Date(),
      });

      // If customer is linked to Odoo, also create contact as child in Odoo
      if (customer.odooPartnerId) {
        contactData.parent_id = customer.odooPartnerId;
        
        try {
          const newContactId = await odooClient.create('res.partner', contactData);
          if (newContactId) {
            // Link local record to Odoo
            await db.update(customers).set({ odooPartnerId: newContactId }).where(eq(customers.id, newLocalId));
            console.log(`[Odoo] Created child contact ID ${newContactId} for parent ${customer.odooPartnerId}`);
          }
        } catch (odooErr) {
          console.error('[Odoo] Failed to create contact in Odoo (saved locally):', odooErr);
        }
        
        res.status(201).json({ 
          success: true, 
          localId: newLocalId,
          message: "Contact created successfully" 
        });
      } else {
        // Saved locally only
        res.status(201).json({ 
          success: true, 
          localId: newLocalId,
          message: "Contact saved locally (company not linked to Odoo)" 
        });
      }
    } catch (error: any) {
      console.error("Error creating Odoo contact:", error);
      res.status(500).json({ error: error.message || "Failed to create contact" });
    }
  });

  // Edit an individual contact (updates local DB + Odoo if linked)
  app.patch("/api/odoo/customer/:customerId/contacts/:contactId", requireApproval, async (req: any, res) => {
    try {
      const { customerId, contactId } = req.params;
      const { name, email, phone, function: jobFunction, localId } = req.body;
      if (!name || !name.trim()) return res.status(422).json({ error: "Contact name is required" });

      const updateData: Record<string, any> = {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        jobTitle: jobFunction?.trim() || null,
        updatedAt: new Date(),
      };

      // Update local record if we have one
      const localRecordId = localId || null;
      if (localRecordId) {
        await db.update(customers)
          .set({
            firstName: updateData.name.split(' ')[0] || '',
            lastName: updateData.name.split(' ').slice(1).join(' ') || '',
            email: updateData.email,
            phone: updateData.phone,
            jobTitle: updateData.jobTitle,
          })
          .where(eq(customers.id, localRecordId));
      }

      // Update in Odoo if this is an Odoo contact (numeric contactId)
      const odooContactId = parseInt(contactId);
      if (!isNaN(odooContactId) && odooContactId > 0) {
        try {
          await odooClient.update('res.partner', odooContactId, {
            name: updateData.name,
            email: updateData.email || false,
            phone: updateData.phone || false,
            function: jobFunction?.trim() || false,
          });
        } catch (odooErr) {
          console.error('[Odoo] Failed to update contact in Odoo (local updated):', odooErr);
        }
      }

      res.json({ success: true, message: "Contact updated" });
    } catch (error: any) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: error.message || "Failed to update contact" });
    }
  });

  // Merge contacts in Odoo (keeps one, deletes others)
  app.post("/api/odoo/customer/:customerId/contacts/merge", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { keepContactId, deleteContactIds } = req.body;
      
      if (!keepContactId || !deleteContactIds || !Array.isArray(deleteContactIds) || deleteContactIds.length === 0) {
        return res.status(422).json({ error: "Must specify one contact to keep and at least one to delete" });
      }
      
      // Get customer to verify ownership
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo" });
      }
      
      // Verify all contacts belong to this parent
      const allContactIds = [keepContactId, ...deleteContactIds];
      const contacts = await odooClient.searchRead('res.partner', [
        ['id', 'in', allContactIds],
        ['parent_id', '=', customer.odooPartnerId]
      ], ['id', 'name', 'email'], {});
      
      if (contacts.length !== allContactIds.length) {
        return res.status(400).json({ error: "Some contacts do not belong to this company" });
      }
      
      // Delete the duplicate contacts from Odoo
      for (const contactId of deleteContactIds) {
        try {
          await odooClient.execute('res.partner', 'unlink', [[contactId]]);
          console.log(`[Odoo] Deleted merged contact ID ${contactId}`);
        } catch (err: any) {
          console.error(`[Odoo] Failed to delete contact ${contactId}:`, err.message);
          // Continue with other deletions
        }
      }
      
      res.json({ 
        success: true, 
        message: `Merged ${deleteContactIds.length} contact(s) into one. Remember to update this in Odoo and Shopify manually if needed.`,
        keptContactId: keepContactId,
        deletedContactIds: deleteContactIds
      });
    } catch (error: any) {
      console.error("Error merging Odoo contacts:", error);
      res.status(500).json({ error: error.message || "Failed to merge contacts" });
    }
  });

  // Get partner data for editing - fetches current Odoo data for the edit form
  app.get("/api/odoo/customer/:customerId/edit-data", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo" });
      }
      
      const partnerData = await odooClient.getPartnerForEdit(customer.odooPartnerId);
      if (!partnerData) {
        return res.status(404).json({ error: "Partner not found in Odoo" });
      }
      
      res.json({ 
        partnerData,
        localData: {
          company: customer.company,
          email: customer.email,
          phone: customer.phone,
          address1: customer.address1,
          address2: customer.address2,
          city: customer.city,
          province: customer.province,
          zip: customer.zip,
          country: customer.country,
          website: customer.website,
          note: customer.note,
        },
        syncStatus: customer.odooSyncStatus,
        pendingChanges: customer.odooPendingChanges,
        lastSyncError: customer.odooLastSyncError,
      });
    } catch (error: any) {
      console.error("Error fetching customer edit data:", error);
      res.status(500).json({ error: error.message || "Failed to fetch edit data" });
    }
  });

  // Save customer edits - queue for Odoo sync
  app.patch("/api/odoo/customer/:customerId/edit", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const { changes } = req.body; // { company, email, phone, address1, address2, city, province, zip, country, website, note }
      const userEmail = req.user?.email || 'unknown';
      
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo - cannot sync to Odoo" });
      }
      
      // Build update object and queue entries for changes
      const updateData: any = {
        updatedAt: new Date(),
        odooSyncStatus: 'pending',
      };
      
      const queueEntries: any[] = [];
      const fieldMappings: Record<string, string> = {
        company: 'company',
        firstName: 'firstName',
        lastName: 'lastName',
        email: 'email',
        phone: 'phone',
        address1: 'address1',
        address2: 'address2',
        city: 'city',
        province: 'province',
        zip: 'zip',
        country: 'country',
        website: 'website',
        note: 'note',
      };
      
      for (const [field, newValue] of Object.entries(changes)) {
        if (fieldMappings[field]) {
          const oldValue = (customer as any)[fieldMappings[field]];
          if (oldValue !== newValue) {
            updateData[fieldMappings[field]] = newValue;
            queueEntries.push({
              customerId,
              odooPartnerId: customer.odooPartnerId,
              fieldName: field,
              oldValue: oldValue?.toString() || null,
              newValue: (newValue as any)?.toString() || null,
              status: 'pending',
              changedBy: userEmail,
            });
          }
        }
      }
      
      if (queueEntries.length === 0) {
        return res.json({ success: true, message: "No changes detected", queued: 0 });
      }
      
      // Store pending changes JSON for quick reference
      updateData.odooPendingChanges = changes;
      
      // Update local customer record
      await db.update(customers).set(updateData).where(eq(customers.id, customerId));
      
      // Add to sync queue
      await db.insert(customerSyncQueue).values(queueEntries);
      
      // Clear cache
      setCachedData("customers", null);
      
      res.json({ 
        success: true, 
        message: `${queueEntries.length} change(s) queued for Odoo sync`,
        queued: queueEntries.length,
        syncStatus: 'pending',
      });
    } catch (error: any) {
      console.error("Error saving customer edits:", error);
      res.status(500).json({ error: error.message || "Failed to save edits" });
    }
  });

  // Get sync queue status for a customer
  app.get("/api/odoo/customer/:customerId/sync-queue", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      const queue = await db.select()
        .from(customerSyncQueue)
        .where(eq(customerSyncQueue.customerId, customerId))
        .orderBy(desc(customerSyncQueue.createdAt))
        .limit(50);
      
      res.json({ queue });
    } catch (error: any) {
      console.error("Error fetching sync queue:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sync queue" });
    }
  });

  // Manual sync - push pending changes to Odoo immediately
  app.post("/api/odoo/customer/:customerId/push-sync", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo" });
      }
      
      // Get pending queue items for this customer
      const pendingItems = await db.select()
        .from(customerSyncQueue)
        .where(and(
          eq(customerSyncQueue.customerId, customerId),
          eq(customerSyncQueue.status, 'pending')
        ));
      
      if (pendingItems.length === 0) {
        return res.json({ success: true, message: "No pending changes to sync", synced: 0 });
      }
      
      // Group changes by field to get the latest value for each field
      const latestChanges: Record<string, string | null> = {};
      for (const item of pendingItems) {
        latestChanges[item.fieldName] = item.newValue;
      }
      
      // Push to Odoo with conflict check
      const lastWriteDate = customer.odooWriteDate || undefined;
      const result = await odooClient.updatePartnerWithConflictCheck(
        customer.odooPartnerId,
        latestChanges,
        lastWriteDate
      );
      
      if (result.conflict) {
        // Mark items as conflict
        await db.update(customerSyncQueue)
          .set({ status: 'conflict', errorMessage: result.error, processedAt: new Date() })
          .where(and(
            eq(customerSyncQueue.customerId, customerId),
            eq(customerSyncQueue.status, 'pending')
          ));
        
        await db.update(customers)
          .set({ odooSyncStatus: 'conflict', odooLastSyncError: result.error })
          .where(eq(customers.id, customerId));
        
        return res.json({ 
          success: false, 
          conflict: true,
          message: "Conflict detected - data was modified in Odoo since last sync",
        });
      }
      
      if (!result.success) {
        // Mark items as error
        await db.update(customerSyncQueue)
          .set({ status: 'error', errorMessage: result.error, processedAt: new Date() })
          .where(and(
            eq(customerSyncQueue.customerId, customerId),
            eq(customerSyncQueue.status, 'pending')
          ));
        
        await db.update(customers)
          .set({ odooSyncStatus: 'error', odooLastSyncError: result.error })
          .where(eq(customers.id, customerId));
        
        return res.status(500).json({ 
          success: false, 
          error: result.error || "Failed to sync to Odoo",
        });
      }
      
      // Success - mark items as synced
      await db.update(customerSyncQueue)
        .set({ status: 'synced', processedAt: new Date() })
        .where(and(
          eq(customerSyncQueue.customerId, customerId),
          eq(customerSyncQueue.status, 'pending')
        ));
      
      // Update customer sync status
      await db.update(customers)
        .set({ 
          odooSyncStatus: 'synced',
          odooPendingChanges: null,
          odooLastSyncError: null,
          odooWriteDate: result.currentWriteDate || new Date(),
          lastOdooSyncAt: new Date(),
        })
        .where(eq(customers.id, customerId));
      
      // Clear cache
      setCachedData("customers", null);
      
      res.json({ 
        success: true, 
        message: `${pendingItems.length} change(s) synced to Odoo`,
        synced: pendingItems.length,
      });
    } catch (error: any) {
      console.error("Error pushing sync to Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to sync to Odoo" });
    }
  });

  // Get pending sync count across all customers
  app.get("/api/odoo/pending-sync-count", requireApproval, async (req: any, res) => {
    try {
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(customerSyncQueue)
        .where(eq(customerSyncQueue.status, 'pending'));
      
      res.json({ pendingCount: result?.count || 0 });
    } catch (error: any) {
      console.error("Error fetching pending sync count:", error);
      res.status(500).json({ error: error.message || "Failed to get pending sync count" });
    }
  });

  // Admin route to run batch sync to Odoo immediately
  app.post("/api/odoo/run-batch-sync", requireAdmin, async (req: any, res) => {
    try {
      const { runOdooSyncNow } = await import("./odoo-sync-worker");
      const result = await runOdooSyncNow();
      res.json(result);
    } catch (error: any) {
      console.error("Error running batch sync:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to run batch sync" });
    }
  });

  // Admin route to check Odoo for new products and queue them for review
  app.post("/api/odoo/sync-new-products", requireAdmin, async (req: any, res) => {
    try {
      const { runOdooProductSyncNow } = await import("./odoo-sync-worker");
      const result = await runOdooProductSyncNow();
      res.json(result);
    } catch (error: any) {
      console.error("Error syncing new products from Odoo:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to sync new products" });
    }
  });

  // Resync a customer's data from Odoo (updates address and other fields)
  app.post("/api/odoo/customer/:customerId/resync", requireApproval, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get customer to find their odooPartnerId
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not linked to Odoo" });
      }
      
      // Fetch partner data from Odoo
      const partner = await odooClient.getPartnerById(customer.odooPartnerId);
      if (!partner) {
        return res.status(404).json({ error: "Partner not found in Odoo" });
      }
      
      // Seed pricingTier from Odoo property_product_pricelist when local value is not set.
      // The local pricingTier is authoritative once set — only use Odoo as a seed for null values.
      let pricingTier: string | null = customer.pricingTier;
      if (!pricingTier && partner.property_product_pricelist && partner.property_product_pricelist !== false) {
        pricingTier = (partner.property_product_pricelist as [number, string])[1] || null;
      }
      
      // Update customer with fresh Odoo data
      const updateData = {
        address1: partner.street || null,
        address2: partner.street2 || null,
        city: partner.city || null,
        province: partner.state_id ? partner.state_id[1] : null,
        zip: partner.zip || null,
        country: partner.country_id ? partner.country_id[1] : null,
        phone: partner.phone || partner.mobile || customer.phone,
        cell: partner.mobile || customer.cell,
        website: partner.website || customer.website,
        pricingTier, // Category/tag from Odoo
        lastOdooSyncAt: new Date(),
      };
      
      await db.update(customers).set(updateData).where(eq(customers.id, customerId));
      
      // Clear cache
      setCachedData("customers", null);
      
      // Return updated customer
      const [updatedCustomer] = await db.select().from(customers).where(eq(customers.id, customerId));
      
      res.json({ 
        success: true, 
        message: "Customer data synced from Odoo",
        customer: updatedCustomer 
      });
    } catch (error: any) {
      console.error("Error resyncing customer from Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to resync from Odoo" });
    }
  });

  // Get Odoo sync status - check if any Odoo-linked customers exist
  app.get("/api/odoo/sync-status", requireApproval, async (req: any, res) => {
    try {
      // Count customers with Odoo partner IDs (previously synced)
      const [syncedCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(customers)
        .where(sql`${customers.odooPartnerId} IS NOT NULL`);
      
      // Get last sync timestamp
      const [lastSync] = await db.select({ lastSync: sql<Date>`MAX(${customers.lastOdooSyncAt})` })
        .from(customers);
      
      // Count total customers
      const [totalCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(customers);
      
      res.json({
        hasPreviousSync: (syncedCount?.count || 0) > 0,
        syncedCustomerCount: syncedCount?.count || 0,
        totalCustomerCount: totalCount?.count || 0,
        lastSyncAt: lastSync?.lastSync || null,
      });
    } catch (error: any) {
      console.error("Error fetching Odoo sync status:", error);
      res.status(500).json({ error: error.message || "Failed to get sync status" });
    }
  });

  // Import partners from Odoo as customers with import mode support
  // importMode: 'add_new' (default) = only add missing, 'full_reset' = delete all and re-import, 'sync_with_deletions' = add/update + remove deleted
  app.post("/api/odoo/import/partners", requireAdmin, async (req: any, res) => {
    try {
      const { deleteExisting = false, importMode = 'add_new' } = req.body;
      const useFullReset = deleteExisting || importMode === 'full_reset';
      const useSyncWithDeletions = importMode === 'sync_with_deletions';
      
      console.log(`[Odoo Import] Starting partner import from Odoo (mode: ${useFullReset ? 'full_reset' : useSyncWithDeletions ? 'sync_with_deletions' : 'add_new'})...`);
      
      // Step 1: If full reset, preserve pricing tiers before deleting, then delete all customers
      // Pricing tiers set in Signal are AUTHORITATIVE — never let Odoo overwrite them
      const preservedTierByOdooId = new Map<number, string | null>(); // odooPartnerId → pricingTier
      const preservedTierByEmail = new Map<string, string | null>();  // email_normalized → pricingTier
      if (useFullReset) {
        const allWithTier = await db.select({
          odooPartnerId: customers.odooPartnerId,
          emailNormalized: customers.emailNormalized,
          pricingTier: customers.pricingTier,
        }).from(customers).where(isNotNull(customers.pricingTier));
        for (const c of allWithTier) {
          if (c.odooPartnerId) preservedTierByOdooId.set(c.odooPartnerId, c.pricingTier);
          if (c.emailNormalized) preservedTierByEmail.set(c.emailNormalized, c.pricingTier);
        }
        console.log(`[Odoo Import] FULL RESET: Preserved ${preservedTierByOdooId.size} pricing tiers before delete`);
        console.log("[Odoo Import] FULL RESET: Deleting all existing customers...");
        await db.delete(customers);
        console.log("[Odoo Import] All existing customers deleted");
      }
      
      // Step 2: Get existing Odoo partner IDs to check for duplicates (for incremental mode)
      const existingOdooIds = new Set<number>();
      const existingOdooCustomers = new Map<number, string>(); // odooPartnerId -> customerId
      // Email-based dedup map: catches customers that exist locally but have no odooPartnerId yet
      const existingEmailMap = new Map<string, { id: string; pricingTier: string | null }>();
      if (!useFullReset) {
        const existing = await db.select({
          id: customers.id,
          odooPartnerId: customers.odooPartnerId,
          emailNormalized: customers.emailNormalized,
          pricingTier: customers.pricingTier,
        }).from(customers);
        existing.forEach(c => {
          if (c.odooPartnerId) {
            existingOdooIds.add(c.odooPartnerId);
            existingOdooCustomers.set(c.odooPartnerId, c.id);
          }
          if (c.emailNormalized) {
            existingEmailMap.set(c.emailNormalized, { id: c.id, pricingTier: c.pricingTier });
          }
        });
        console.log(`[Odoo Import] Found ${existingOdooIds.size} existing Odoo-linked customers, ${existingEmailMap.size} total by email`);
      }
      
      // Step 3: Get excluded category IDs (Vendor + Account Team)
      console.log("[Odoo Import] Fetching excluded category IDs...");
      const [vendorCategoryId, accountTeamCategoryId] = await Promise.all([
        odooClient.getVendorCategoryId(),
        odooClient.getAccountTeamCategoryId(),
      ]);
      if (vendorCategoryId) {
        console.log(`[Odoo Import] Will filter out contacts with Vendor category ID: ${vendorCategoryId}`);
      } else {
        console.log("[Odoo Import] WARNING: No 'Vendor' category found in Odoo - vendor filtering disabled");
      }
      if (accountTeamCategoryId) {
        console.log(`[Odoo Import] Will filter out contacts with Account Team category ID: ${accountTeamCategoryId}`);
      } else {
        console.log("[Odoo Import] WARNING: No 'Account Team' category found in Odoo - account team filtering disabled");
      }
      
      // Step 4: Fetch ALL partners from Odoo (companies and contacts) using pagination
      console.log("[Odoo Import] Fetching all partners from Odoo (this may take a moment)...");
      const partners = await odooClient.getAllPartners();
      console.log(`[Odoo Import] Fetched ${partners.length} partners from Odoo`);
      
      // Load excluded Odoo partner IDs (previously deleted customers that shouldn't be re-imported)
      const exclusions = await db.select({ odooPartnerId: deletedCustomerExclusions.odooPartnerId })
        .from(deletedCustomerExclusions)
        .where(sql`${deletedCustomerExclusions.odooPartnerId} IS NOT NULL`);
      const excludedOdooIds = new Set(exclusions.map(e => e.odooPartnerId).filter((id): id is number => id !== null));
      console.log(`[Odoo Import] Found ${excludedOdooIds.size} excluded Odoo partner IDs (previously deleted)`);
      
      const results = {
        imported: 0,
        skipped: 0,
        skippedVendors: 0,
        skippedAccountTeam: 0,
        skippedNoEmail: 0,
        skippedBlocked: 0,
        skippedExcluded: 0,
        alreadyExists: 0,
        deleted: 0,
        removedAccountTeam: 0,
        failed: 0,
        errors: [] as string[],
        skippedPartners: [] as string[],
        skippedBlockedNames: [] as string[],
        skippedExcludedNames: [] as string[],
        deletedCustomers: [] as string[],
        mode: useFullReset ? 'full_reset' : useSyncWithDeletions ? 'sync_with_deletions' : 'add_new',
      };
      
      // Track which Odoo partner IDs are still active in Odoo
      const activeOdooPartnerIds = new Set<number>();
      
      // Step 5: Create each partner as a customer
      for (const partner of partners) {
        try {
          // Skip partners without a name
          if (!partner.name || partner.name.trim() === '') {
            results.skipped++;
            results.skippedPartners.push(`Partner ID ${partner.id}: No name provided`);
            continue;
          }
          
          // Skip partners with Vendor tag
          if (vendorCategoryId && odooClient.hasVendorTag(partner, vendorCategoryId)) {
            results.skippedVendors++;
            continue;
          }
          
          // Skip (and retroactively remove) partners tagged as Account Team
          if (accountTeamCategoryId && odooClient.hasVendorTag(partner, accountTeamCategoryId)) {
            results.skippedAccountTeam++;
            // If this partner is already in the app, remove them
            if (existingOdooIds.has(partner.id)) {
              const existingId = existingOdooCustomers.get(partner.id);
              if (existingId) {
                try {
                  await db.delete(customers).where(eq(customers.id, existingId));
                  results.removedAccountTeam++;
                  console.log(`[Odoo Import] Removed Account Team contact: ${partner.name} (Odoo ID: ${partner.id})`);
                } catch (delErr: any) {
                  console.error(`[Odoo Import] Failed to remove Account Team contact ${partner.id}:`, delErr.message);
                }
              }
            }
            continue;
          }
          
          // Skip partners without email (email is required for CRM to work)
          if (!partner.email || partner.email.trim() === '') {
            results.skippedNoEmail++;
            continue;
          }
          
          // Skip blocked companies (cargo, freight, logistics, etc.)
          const blockedKeyword = getBlockedKeywordMatch(partner.name);
          if (blockedKeyword) {
            results.skippedBlocked++;
            if (results.skippedBlockedNames.length < 20) {
              results.skippedBlockedNames.push(`${partner.name} (${blockedKeyword})`);
            }
            console.log(`[Odoo Import] Skipped blocked company: ${partner.name} (matched: ${blockedKeyword})`);
            continue;
          }
          
          // Skip previously deleted customers (on exclusion list)
          if (excludedOdooIds.has(partner.id)) {
            results.skippedExcluded++;
            if (results.skippedExcludedNames.length < 20) {
              results.skippedExcludedNames.push(partner.name);
            }
            console.log(`[Odoo Import] Skipped excluded partner: ${partner.name} (previously deleted)`);
            continue;
          }
          
          // Track this as an active partner in Odoo (for deletion sync)
          activeOdooPartnerIds.add(partner.id);
          
          // In incremental mode, skip partners that already exist by Odoo ID
          if (!useFullReset && existingOdooIds.has(partner.id)) {
            results.alreadyExists++;
            continue;
          }

          // Email-based dedup: if customer already exists locally (no odooPartnerId yet),
          // just link the odooPartnerId — never create a duplicate, never touch pricingTier
          if (!useFullReset && partner.email) {
            const emailNorm = partner.email.toLowerCase().trim();
            const existingByEmail = existingEmailMap.get(emailNorm);
            if (existingByEmail && !existingOdooIds.has(partner.id)) {
              await db.update(customers)
                .set({ odooPartnerId: partner.id, lastOdooSyncAt: new Date() })
                .where(eq(customers.id, existingByEmail.id));
              existingOdooIds.add(partner.id);
              existingOdooCustomers.set(partner.id, existingByEmail.id);
              results.alreadyExists++;
              console.log(`[Odoo Import] Linked Odoo partner ${partner.id} to existing customer ${existingByEmail.id} by email (pricingTier preserved)`);
              continue;
            }
          }
          
          // Parse the partner name for first/last name (for individuals)
          let firstName = '';
          let lastName = '';
          let company = '';
          
          if (partner.is_company) {
            company = partner.name;
          } else {
            const nameParts = partner.name.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
            company = partner.parent_name || '';
          }
          
          // Extract sales rep info from Odoo user_id field (format: [id, "Name"] or false)
          // Store Odoo user ID directly — spotlight filters compare against Odoo IDs
          let salesRepId: string | null = null;
          let salesRepName: string | null = null;
          if (partner.user_id && Array.isArray(partner.user_id) && partner.user_id.length >= 2) {
            const odooUserId = partner.user_id[0];
            salesRepName = partner.user_id[1] || null;
            // Only accept canonical rep IDs (26=Aneesh, 27=Patricio, 28=Santiago)
            const CANONICAL_REP_IDS = [26, 27, 28];
            salesRepId = CANONICAL_REP_IDS.includes(Number(odooUserId)) ? String(odooUserId) : null;
          }
          
          // Extract parent relationship (format: [id, "Parent Name"] or false)
          let odooParentId: number | null = null;
          if (partner.parent_id && Array.isArray(partner.parent_id) && partner.parent_id.length >= 1) {
            odooParentId = partner.parent_id[0];
          }
          
          // Determine contact type based on Odoo company_type field
          let contactType = 'contact';
          if (partner.is_company) {
            contactType = 'company';
          } else if (partner.type === 'delivery') {
            contactType = 'delivery';
          } else if (partner.type === 'invoice') {
            contactType = 'invoice';
          } else if (partner.type === 'other') {
            contactType = 'other';
          }
          
          // Seed pricingTier from Odoo property_product_pricelist (e.g. "SHOPIFY2", "RETAIL")
          // Signal-assigned tiers are AUTHORITATIVE: restore any previously set tier after full reset
          let pricingTier: string | null = null;
          if (partner.property_product_pricelist && partner.property_product_pricelist !== false) {
            pricingTier = (partner.property_product_pricelist as [number, string])[1] || null;
          }
          // In full reset mode, restore the previously set pricingTier (Signal is authoritative)
          if (useFullReset) {
            const emailNorm = partner.email ? partner.email.toLowerCase().trim() : null;
            const restoredTier = preservedTierByOdooId.get(partner.id)
              ?? (emailNorm ? preservedTierByEmail.get(emailNorm) : undefined);
            if (restoredTier !== undefined) {
              pricingTier = restoredTier; // Restore Signal's value, ignore Odoo's
            }
          }
          
          // Create customer record - map Odoo address fields exactly
          const customerData = {
            id: crypto.randomUUID(),
            firstName,
            lastName,
            company,
            email: partner.email || null,
            phone: partner.phone || partner.mobile || null,
            cell: partner.mobile || null,
            address1: partner.street || null,
            address2: partner.street2 || null,
            city: partner.city || null,
            province: partner.state_id ? partner.state_id[1] : null, // Full state/province name from Odoo
            zip: partner.zip || null,
            country: partner.country_id ? partner.country_id[1] : null, // Full country name from Odoo
            website: partner.website || null,
            notes: partner.comment || null,
            odooPartnerId: partner.id,
            odooParentId,
            isCompany: partner.is_company || false,
            contactType,
            salesRepId,
            salesRepName,
            pricingTier, // Category/tag from Odoo
            accountState: 'prospect' as const,
            lastOdooSyncAt: new Date(),
            createdAt: new Date(),
          };
          
          await db.insert(customers).values(customerData);
          results.imported++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`Partner ${partner.id} (${partner.name}): ${error.message}`);
        }
      }
      
      console.log(`[Odoo Import] Complete: ${results.imported} imported, ${results.alreadyExists} already existed, ${results.skipped} skipped, ${results.skippedVendors} vendors skipped, ${results.skippedAccountTeam} account team skipped (${results.removedAccountTeam} existing removed), ${results.skippedBlocked} blocked, ${results.skippedExcluded} excluded, ${results.skippedNoEmail} no email, ${results.failed} failed`);
      
      // Step 5: Resolve parent customer IDs (link children to their parent companies)
      console.log("[Odoo Import] Resolving parent relationships...");
      const customersWithParent = await db.select().from(customers).where(sql`${customers.odooParentId} IS NOT NULL`);
      let parentLinksResolved = 0;
      
      let pricingCascadeCount = 0;
      for (const customer of customersWithParent) {
        if (customer.odooParentId) {
          // Find the parent customer by their Odoo partner ID
          const parentCustomer = await db.select().from(customers)
            .where(eq(customers.odooPartnerId, customer.odooParentId))
            .limit(1);
          
          if (parentCustomer.length > 0) {
            const parent = parentCustomer[0];
            // Link parent
            await db.update(customers)
              .set({ parentCustomerId: parent.id })
              .where(eq(customers.id, customer.id));
            parentLinksResolved++;

            // Cascade pricing tier + sales rep from parent when child doesn't have them
            const cascadeUpdates: Record<string, any> = {};
            if (!customer.pricingTier && parent.pricingTier) {
              cascadeUpdates.pricingTier = parent.pricingTier;
            }
            if (!customer.salesRepName && parent.salesRepName) {
              cascadeUpdates.salesRepName = parent.salesRepName;
              if (parent.salesRepId) cascadeUpdates.salesRepId = parent.salesRepId;
            }
            if (Object.keys(cascadeUpdates).length > 0) {
              await db.update(customers).set(cascadeUpdates).where(eq(customers.id, customer.id));
              pricingCascadeCount++;
            }
          }
        }
      }
      console.log(`[Odoo Import] Resolved ${parentLinksResolved} parent relationships, cascaded pricing/rep to ${pricingCascadeCount} contacts`);
      
      // Step 6: Delete customers that no longer exist in Odoo (always runs when we have linked customers)
      if (existingOdooCustomers.size > 0) {
        console.log(`[Odoo Import] Checking for deleted partners...`);
        console.log(`[Odoo Import] Active Odoo partners: ${activeOdooPartnerIds.size}, Local Odoo-linked customers: ${existingOdooCustomers.size}`);
        
        for (const [odooPartnerId, customerId] of existingOdooCustomers) {
          // If this local customer's Odoo partner ID is NOT in the active set, it was deleted from Odoo
          if (!activeOdooPartnerIds.has(odooPartnerId)) {
            try {
              // Get customer name for logging before deletion
              const [customerToDelete] = await db.select({ 
                company: customers.company, 
                firstName: customers.firstName,
                lastName: customers.lastName 
              })
                .from(customers)
                .where(eq(customers.id, customerId))
                .limit(1);
              
              const customerName = customerToDelete?.company || 
                `${customerToDelete?.firstName || ''} ${customerToDelete?.lastName || ''}`.trim() || 
                'Unknown';
              
              await db.delete(customers).where(eq(customers.id, customerId));
              results.deleted++;
              results.deletedCustomers.push(`${customerName} (Odoo ID: ${odooPartnerId})`);
              console.log(`[Odoo Import] Deleted customer: ${customerName} (Odoo partner ${odooPartnerId} no longer exists)`);
            } catch (error: any) {
              results.errors.push(`Failed to delete customer ${customerId}: ${error.message}`);
            }
          }
        }
        
        console.log(`[Odoo Import] Deletion sync complete: ${results.deleted} customers removed`);
      }
      
      // Clear customer cache to ensure fresh data is returned
      setCachedData("customers", null);
      
      res.json({
        success: true,
        message: `Imported ${results.imported} partners from Odoo${results.skippedNoEmail > 0 ? ` (skipped ${results.skippedNoEmail} without email)` : ''}${results.skippedBlocked > 0 ? ` (skipped ${results.skippedBlocked} blocked companies)` : ''}${results.skippedExcluded > 0 ? ` (skipped ${results.skippedExcluded} previously deleted)` : ''}${results.deleted > 0 ? `, deleted ${results.deleted} removed from Odoo` : ''}`,
        parentLinksResolved,
        ...results
      });
    } catch (error: any) {
      console.error("Error importing partners from Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to import partners from Odoo" });
    }
  });

  // Sync sales reps from Odoo for existing customers
  app.post("/api/odoo/sync-sales-reps", requireAdmin, async (req: any, res) => {
    try {
      console.log("[Odoo Sync] Starting sales rep sync from Odoo...");
      
      // Get all customers with Odoo partner IDs
      const customersWithOdoo = await db.select({
        id: customers.id,
        odooPartnerId: customers.odooPartnerId,
        salesRepId: customers.salesRepId,
        salesRepName: customers.salesRepName,
        company: customers.company,
      }).from(customers)
        .where(sql`${customers.odooPartnerId} IS NOT NULL`);
      
      console.log(`[Odoo Sync] Found ${customersWithOdoo.length} customers with Odoo partner IDs`);
      
      // Get unique Odoo partner IDs to fetch
      const odooPartnerIds = [...new Set(customersWithOdoo.map(c => c.odooPartnerId).filter((id): id is number => id !== null))];
      
      if (odooPartnerIds.length === 0) {
        return res.json({
          success: true,
          message: "No customers with Odoo partner IDs found",
          updated: 0,
          skipped: 0,
        });
      }
      
      // Fetch partners from Odoo in batches
      const BATCH_SIZE = 100;
      await odooClient.authenticate();
      
      const partnerMap = new Map<number, { userId: string | null; userName: string | null }>();
      
      for (let i = 0; i < odooPartnerIds.length; i += BATCH_SIZE) {
        const batchIds = odooPartnerIds.slice(i, i + BATCH_SIZE);
        console.log(`[Odoo Sync] Fetching batch ${Math.floor(i/BATCH_SIZE) + 1} (${batchIds.length} partners)`);
        
        try {
          const partners = await odooClient.searchRead('res.partner', [['id', 'in', batchIds]], ['id', 'user_id']);
          
          for (const partner of partners) {
            if (partner.user_id && Array.isArray(partner.user_id) && partner.user_id.length >= 2) {
              partnerMap.set(partner.id, {
                userId: String(partner.user_id[0]),
                userName: partner.user_id[1] || null,
              });
            } else {
              partnerMap.set(partner.id, { userId: null, userName: null });
            }
          }
        } catch (batchError: any) {
          console.error(`[Odoo Sync] Error fetching batch:`, batchError.message);
        }
      }
      
      console.log(`[Odoo Sync] Retrieved sales rep info for ${partnerMap.size} partners`);
      
      // Update customers with sales rep info
      let updated = 0;
      let skipped = 0;
      let alreadySet = 0;
      
      for (const customer of customersWithOdoo) {
        if (!customer.odooPartnerId) continue;
        
        const salesInfo = partnerMap.get(customer.odooPartnerId);
        if (!salesInfo) {
          skipped++;
          continue;
        }
        
        // Skip if customer already has a sales rep or Odoo has no sales rep
        if (customer.salesRepId && customer.salesRepId.trim() !== '') {
          alreadySet++;
          continue;
        }
        
        if (!salesInfo.userId) {
          skipped++;
          continue;
        }
        
        // Update the customer with sales rep info
        await db.update(customers)
          .set({
            salesRepId: salesInfo.userId,
            salesRepName: salesInfo.userName,
          })
          .where(eq(customers.id, customer.id));
        
        updated++;
      }
      
      console.log(`[Odoo Sync] Complete: ${updated} updated, ${alreadySet} already had sales rep, ${skipped} skipped (no sales rep in Odoo)`);
      
      // Clear customer cache
      setCachedData("customers", null);
      
      res.json({
        success: true,
        message: `Updated ${updated} customers with sales rep info from Odoo`,
        updated,
        alreadySet,
        skipped,
        totalProcessed: customersWithOdoo.length,
      });
    } catch (error: any) {
      console.error("Error syncing sales reps from Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to sync sales reps from Odoo" });
    }
  });

  // Sync tags/categories from Odoo for all customers
  app.post("/api/odoo/sync-tags", requireAdmin, async (req: any, res) => {
    try {
      console.log("[Odoo Tag Sync] Starting tag sync from Odoo...");
      
      // Get all customers with Odoo partner IDs
      const customersWithOdoo = await db.select({
        id: customers.id,
        odooPartnerId: customers.odooPartnerId,
        company: customers.company,
        pricingTier: customers.pricingTier,
      }).from(customers)
        .where(sql`${customers.odooPartnerId} IS NOT NULL`);
      
      console.log(`[Odoo Tag Sync] Found ${customersWithOdoo.length} customers with Odoo partner IDs`);
      
      if (customersWithOdoo.length === 0) {
        return res.json({
          success: true,
          message: "No Odoo-linked customers found",
          updated: 0,
          checked: 0,
        });
      }
      
      // Fetch partner data in batches to get category_id
      const batchSize = 50;
      const partnerIds = customersWithOdoo.map(c => c.odooPartnerId!);
      const partnerMap = new Map<number, string | null>();
      
      for (let i = 0; i < partnerIds.length; i += batchSize) {
        const batchIds = partnerIds.slice(i, i + batchSize);
        try {
          const partners = await odooClient.searchRead('res.partner', [
            ['id', 'in', batchIds]
          ], ['id', 'category_id'], { limit: batchSize });
          
          for (const partner of partners) {
            let tag: string | null = null;
            if (partner.category_id && Array.isArray(partner.category_id) && partner.category_id.length > 0) {
              const firstCategory = partner.category_id[0];
              if (Array.isArray(firstCategory) && firstCategory.length >= 2) {
                tag = firstCategory[1];
              }
            }
            partnerMap.set(partner.id, tag);
          }
          console.log(`[Odoo Tag Sync] Fetched batch ${Math.floor(i/batchSize) + 1}: ${partners.length} partners`);
        } catch (batchError: any) {
          console.error(`[Odoo Tag Sync] Error fetching batch:`, batchError.message);
        }
      }
      
      console.log(`[Odoo Tag Sync] Retrieved tags for ${partnerMap.size} partners`);
      
      // Update customers with tags
      let updated = 0;
      let skipped = 0;
      let alreadySet = 0;
      
      for (const customer of customersWithOdoo) {
        if (!customer.odooPartnerId) continue;
        
        const tag = partnerMap.get(customer.odooPartnerId);
        if (tag === undefined) {
          skipped++;
          continue;
        }
        
        // Skip if customer already has this tag
        if (customer.pricingTier === tag) {
          alreadySet++;
          continue;
        }
        
        // Update the customer with tag
        await db.update(customers)
          .set({ pricingTier: tag })
          .where(eq(customers.id, customer.id));
        
        updated++;
      }
      
      console.log(`[Odoo Tag Sync] Complete: ${updated} updated, ${alreadySet} already had tag, ${skipped} skipped`);
      
      // Clear customer cache
      setCachedData("customers", null);
      
      res.json({
        success: true,
        message: `Updated ${updated} customers with tags from Odoo`,
        updated,
        alreadySet,
        skipped,
        totalProcessed: customersWithOdoo.length,
      });
    } catch (error: any) {
      console.error("Error syncing tags from Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to sync tags from Odoo" });
    }
  });

  // Backfill missing customer emails from Odoo
  app.post("/api/odoo/backfill-emails", requireAdmin, async (req: any, res) => {
    try {
      console.log("[Odoo Email Backfill] Starting email backfill from Odoo...");
      
      // Get all customers with Odoo partner IDs but no email
      const customersWithoutEmail = await db.select({
        id: customers.id,
        odooPartnerId: customers.odooPartnerId,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
      }).from(customers)
        .where(and(
          sql`${customers.odooPartnerId} IS NOT NULL`,
          or(isNull(customers.email), eq(customers.email, ''))
        ));
      
      console.log(`[Odoo Email Backfill] Found ${customersWithoutEmail.length} customers without email that have Odoo IDs`);
      
      if (customersWithoutEmail.length === 0) {
        return res.json({
          success: true,
          message: "No customers need email backfill",
          emailsAdded: 0,
          checked: 0,
        });
      }
      
      // Authenticate with Odoo
      await odooClient.authenticate();
      
      const BATCH_SIZE = 50;
      let emailsAdded = 0;
      const updatedCustomers: string[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < customersWithoutEmail.length; i += BATCH_SIZE) {
        const batch = customersWithoutEmail.slice(i, i + BATCH_SIZE);
        console.log(`[Odoo Email Backfill] Processing batch ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} customers)`);
        
        for (const customer of batch) {
          try {
            if (!customer.odooPartnerId) continue;
            
            const partner = await odooClient.getPartnerById(customer.odooPartnerId);
            
            if (partner && partner.email && partner.email.trim()) {
              await db.update(customers)
                .set({ 
                  email: partner.email.trim().toLowerCase(),
                  updatedAt: new Date()
                })
                .where(eq(customers.id, customer.id));
              
              emailsAdded++;
              const displayName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
              updatedCustomers.push(`${displayName}: ${partner.email}`);
              console.log(`[Odoo Email Backfill] Added email ${partner.email} to ${displayName}`);
            }
          } catch (error: any) {
            const displayName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
            errors.push(`Failed to fetch ${displayName}: ${error.message}`);
          }
        }
      }
      
      // Clear customer cache
      setCachedData("customers", null);
      
      res.json({
        success: true,
        message: `Backfilled ${emailsAdded} emails from Odoo`,
        checked: customersWithoutEmail.length,
        emailsAdded,
        updatedCustomers: updatedCustomers.slice(0, 100),
        errors: errors.slice(0, 20),
      });
    } catch (error: any) {
      console.error("Error backfilling emails from Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to backfill emails from Odoo" });
    }
  });

  // Remove existing customers with Vendor tag from Odoo
  app.post("/api/odoo/remove-vendors", requireAdmin, async (req: any, res) => {
    try {
      console.log("[Odoo Cleanup] Starting vendor customer removal...");
      
      // Step 1: Get Vendor category ID from Odoo
      await odooClient.authenticate();
      const vendorCategoryId = await odooClient.getVendorCategoryId();
      
      if (!vendorCategoryId) {
        return res.status(400).json({ 
          error: "Could not find 'Vendor' category in Odoo. Please check that a category named 'Vendor' exists." 
        });
      }
      
      console.log(`[Odoo Cleanup] Vendor category ID: ${vendorCategoryId}`);
      
      // Step 2: Get all customers with Odoo partner IDs
      const odooCustomers = await db.select({
        id: customers.id,
        odooPartnerId: customers.odooPartnerId,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
      }).from(customers)
        .where(sql`${customers.odooPartnerId} IS NOT NULL`);
      
      console.log(`[Odoo Cleanup] Found ${odooCustomers.length} customers linked to Odoo`);
      
      // Step 3: Fetch partner category info from Odoo in batches
      const BATCH_SIZE = 100;
      const vendorCustomerIds: string[] = [];
      const vendorNames: string[] = [];
      
      const odooPartnerIds = odooCustomers.map(c => c.odooPartnerId!);
      
      for (let i = 0; i < odooPartnerIds.length; i += BATCH_SIZE) {
        const batchIds = odooPartnerIds.slice(i, i + BATCH_SIZE);
        console.log(`[Odoo Cleanup] Checking batch ${Math.floor(i/BATCH_SIZE) + 1} (${batchIds.length} partners)`);
        
        try {
          const partners = await odooClient.searchRead('res.partner', [['id', 'in', batchIds]], ['id', 'category_id', 'name']);
          
          for (const partner of partners) {
            if (odooClient.hasVendorTag(partner as any, vendorCategoryId)) {
              const customer = odooCustomers.find(c => c.odooPartnerId === partner.id);
              if (customer) {
                vendorCustomerIds.push(customer.id);
                vendorNames.push(customer.company || `${customer.firstName} ${customer.lastName}`.trim() || partner.name);
              }
            }
          }
        } catch (batchError: any) {
          console.error(`[Odoo Cleanup] Error checking batch:`, batchError.message);
        }
      }
      
      console.log(`[Odoo Cleanup] Found ${vendorCustomerIds.length} vendor customers to remove`);
      
      if (vendorCustomerIds.length === 0) {
        return res.json({
          success: true,
          message: "No vendor customers found to remove",
          removed: 0,
          vendorNames: [],
        });
      }
      
      // Step 4: Delete vendor customers using batch delete with IN clause
      console.log(`[Odoo Cleanup] Deleting ${vendorCustomerIds.length} vendor customers in batch...`);
      let removed = 0;
      
      // Use batch delete with IN clause for efficiency
      const DELETE_BATCH_SIZE = 50;
      for (let i = 0; i < vendorCustomerIds.length; i += DELETE_BATCH_SIZE) {
        const batchIds = vendorCustomerIds.slice(i, i + DELETE_BATCH_SIZE);
        try {
          await db.delete(customers).where(sql`${customers.id} IN (${sql.join(batchIds.map(id => sql`${id}`), sql`, `)})`);
          removed += batchIds.length;
        } catch (deleteError: any) {
          console.error(`[Odoo Cleanup] Error deleting batch:`, deleteError.message);
        }
      }
      
      console.log(`[Odoo Cleanup] Removed ${removed} vendor customers`);
      
      // Clear customer cache
      setCachedData("customers", null);
      
      res.json({
        success: true,
        message: `Removed ${removed} vendor customers from database`,
        removed,
        vendorNames: vendorNames.slice(0, 50), // Return first 50 names for reference
        totalFound: vendorCustomerIds.length,
      });
    } catch (error: any) {
      console.error("Error removing vendor customers:", error);
      res.status(500).json({ error: error.message || "Failed to remove vendor customers" });
    }
  });

  // ========================================
  // ODOO PRODUCT MAPPING APIs
  // ========================================

  // Get all product mappings
  app.get("/api/odoo/product-mappings", requireApproval, async (req: any, res) => {
    try {
      const mappings = await db.select().from(productOdooMappings).orderBy(productOdooMappings.itemCode);
      res.json(mappings);
    } catch (error: any) {
      console.error("Error fetching product mappings:", error);
      res.status(500).json({ error: error.message || "Failed to fetch product mappings" });
    }
  });

  // Get QuickQuotes products for mapping (with mapping status)
  app.get("/api/odoo/products-for-mapping", requireApproval, async (req: any, res) => {
    try {
      const search = (req.query.search as string || '').toLowerCase();
      const mappedOnly = req.query.mappedOnly === 'true';
      const unmappedOnly = req.query.unmappedOnly === 'true';
      
      // Get all QuickQuotes products
      let products = await db.select().from(productPricingMaster).orderBy(productPricingMaster.productType, productPricingMaster.itemCode);
      
      // Get all mappings
      const mappings = await db.select().from(productOdooMappings);
      const mappingsByItemCode = new Map(mappings.map(m => [m.itemCode, m]));
      
      // Combine products with their mapping status
      let result = products.map(product => ({
        ...product,
        mapping: mappingsByItemCode.get(product.itemCode) || null,
        isMapped: mappingsByItemCode.has(product.itemCode)
      }));
      
      // Apply filters
      if (search) {
        result = result.filter(p => 
          p.itemCode.toLowerCase().includes(search) ||
          p.productName.toLowerCase().includes(search) ||
          p.productType.toLowerCase().includes(search)
        );
      }
      
      if (mappedOnly) {
        result = result.filter(p => p.isMapped);
      } else if (unmappedOnly) {
        result = result.filter(p => !p.isMapped);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching products for mapping:", error);
      res.status(500).json({ error: error.message || "Failed to fetch products for mapping" });
    }
  });

  // Create a product mapping
  app.post("/api/odoo/product-mappings", requireAdmin, async (req: any, res) => {
    try {
      const { itemCode, odooProductId, odooDefaultCode, odooProductName } = req.body;
      
      if (!itemCode || !odooProductId) {
        return res.status(400).json({ error: "itemCode and odooProductId are required" });
      }
      
      // Check if mapping already exists
      const existing = await db.select().from(productOdooMappings).where(eq(productOdooMappings.itemCode, itemCode)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ error: "Mapping already exists for this product" });
      }
      
      const [mapping] = await db.insert(productOdooMappings).values({
        itemCode,
        odooProductId,
        odooDefaultCode,
        odooProductName,
        syncStatus: 'mapped',
        createdBy: req.user?.email || 'system',
      }).returning();
      
      res.json(mapping);
    } catch (error: any) {
      console.error("Error creating product mapping:", error);
      res.status(500).json({ error: error.message || "Failed to create product mapping" });
    }
  });

  // Update a product mapping
  app.patch("/api/odoo/product-mappings/:id", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { odooProductId, odooDefaultCode, odooProductName } = req.body;
      
      const [mapping] = await db.update(productOdooMappings)
        .set({
          odooProductId,
          odooDefaultCode,
          odooProductName,
          updatedAt: new Date(),
        })
        .where(eq(productOdooMappings.id, id))
        .returning();
      
      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }
      
      res.json(mapping);
    } catch (error: any) {
      console.error("Error updating product mapping:", error);
      res.status(500).json({ error: error.message || "Failed to update product mapping" });
    }
  });

  // Delete a product mapping
  app.delete("/api/odoo/product-mappings/:id", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      const [deleted] = await db.delete(productOdooMappings)
        .where(eq(productOdooMappings.id, id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: "Mapping not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting product mapping:", error);
      res.status(500).json({ error: error.message || "Failed to delete product mapping" });
    }
  });

  // Preview auto-mapping: returns proposed matches without creating them
  app.post("/api/odoo/product-mappings/auto/preview", requireAdmin, async (req: any, res) => {
    try {
      // 1. Get all QuickQuotes products
      const quickquotesProducts = await db.select({
        id: productPricingMaster.id,
        itemCode: productPricingMaster.itemCode,
        productName: productPricingMaster.productName,
        productType: productPricingMaster.productType,
      }).from(productPricingMaster);
      
      // 2. Get existing mappings
      const existingMappings = await db.select().from(productOdooMappings);
      const existingMappingsByItemCode = new Map(
        existingMappings.map(m => [m.itemCode, m])
      );
      
      // 3. Get all Odoo products (templates + variants) with default_code
      let odooProducts: any[] = [];
      try {
        console.log("[Preview Mapping] Fetching Odoo products...");
        odooProducts = await odooClient.getAllProductsWithVariants();
        console.log(`[Preview Mapping] Fetched ${odooProducts.length} Odoo products`);
      } catch (err: any) {
        console.error("[Preview Mapping] Failed to fetch Odoo products:", err.message);
        return res.status(500).json({ 
          error: "Could not connect to Odoo. Please check your connection settings.", 
          details: err.message 
        });
      }
      
      // Normalize code for fuzzy matching: remove dashes, x, spaces, make lowercase
      const normalizeCode = (code: string): string => {
        return code.toLowerCase().replace(/[-_xX\s]/g, '');
      };
      
      // Build a map of default_code -> odoo product
      const odooByCode = new Map<string, any>();
      const odooByCodeLower = new Map<string, any>(); // For case-insensitive fallback
      const odooByNormalized = new Map<string, any[]>(); // For fuzzy matching (multiple matches possible)
      
      for (const odooProduct of odooProducts) {
        if (odooProduct.default_code) {
          const code = odooProduct.default_code.trim();
          const codeLower = code.toLowerCase();
          const codeNormalized = normalizeCode(code);
          
          if (!odooByCode.has(code)) {
            odooByCode.set(code, odooProduct);
          }
          if (!odooByCodeLower.has(codeLower)) {
            odooByCodeLower.set(codeLower, odooProduct);
          }
          // Store all products with this normalized code for fuzzy matching
          if (!odooByNormalized.has(codeNormalized)) {
            odooByNormalized.set(codeNormalized, []);
          }
          odooByNormalized.get(codeNormalized)!.push(odooProduct);
        }
      }
      
      // Find best fuzzy match based on prefix similarity
      const findBestFuzzyMatch = (itemCode: string): { product: any; similarity: number } | null => {
        const normalizedItem = normalizeCode(itemCode);
        if (!normalizedItem) return null;
        
        let bestMatch: any = null;
        let bestSimilarity = 0;
        
        for (const [normalizedOdoo, products] of odooByNormalized.entries()) {
          // Check if one starts with the other (prefix match)
          const shorter = normalizedItem.length <= normalizedOdoo.length ? normalizedItem : normalizedOdoo;
          const longer = normalizedItem.length > normalizedOdoo.length ? normalizedItem : normalizedOdoo;
          
          if (longer.startsWith(shorter)) {
            // Calculate similarity based on length ratio
            const similarity = shorter.length / longer.length;
            if (similarity > bestSimilarity && similarity >= 0.6) { // At least 60% match
              bestSimilarity = similarity;
              bestMatch = products[0];
            }
          }
          
          // Also check for common prefix match
          let commonPrefix = 0;
          const minLen = Math.min(normalizedItem.length, normalizedOdoo.length);
          for (let i = 0; i < minLen; i++) {
            if (normalizedItem[i] === normalizedOdoo[i]) {
              commonPrefix++;
            } else {
              break;
            }
          }
          
          if (commonPrefix >= 4) { // At least 4 characters match at start
            const similarity = commonPrefix / Math.max(normalizedItem.length, normalizedOdoo.length);
            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestMatch = products[0];
            }
          }
        }
        
        return bestMatch ? { product: bestMatch, similarity: bestSimilarity } : null;
      };
      
      // 4. Build proposed mappings
      const proposedMappings: any[] = [];
      
      for (const product of quickquotesProducts) {
        const itemCode = product.itemCode?.trim();
        if (!itemCode) continue;
        
        // Check if already mapped
        const existingMapping = existingMappingsByItemCode.get(itemCode);
        if (existingMapping) continue; // Skip already mapped
        
        // Try exact match first
        let odooProduct = odooByCode.get(itemCode);
        let matchType = 'exact';
        let matchConfidence = 100;
        
        // Fall back to case-insensitive match
        if (!odooProduct) {
          odooProduct = odooByCodeLower.get(itemCode.toLowerCase());
          matchType = 'case_insensitive';
          matchConfidence = 95;
        }
        
        // Fall back to normalized match (ignoring dashes, x, etc.)
        if (!odooProduct) {
          const normalizedItem = normalizeCode(itemCode);
          const normalizedMatches = odooByNormalized.get(normalizedItem);
          if (normalizedMatches && normalizedMatches.length > 0) {
            odooProduct = normalizedMatches[0];
            matchType = 'normalized';
            matchConfidence = 90;
          }
        }
        
        // Fall back to fuzzy prefix match
        if (!odooProduct) {
          const fuzzyResult = findBestFuzzyMatch(itemCode);
          if (fuzzyResult) {
            odooProduct = fuzzyResult.product;
            matchType = 'fuzzy_prefix';
            matchConfidence = Math.round(fuzzyResult.similarity * 100);
          }
        }
        
        proposedMappings.push({
          itemCode,
          productName: product.productName,
          productType: product.productType,
          suggestedOdooProduct: odooProduct ? {
            id: odooProduct.id,
            name: odooProduct.name,
            default_code: odooProduct.default_code,
            list_price: odooProduct.list_price,
            is_variant: odooProduct.is_variant,
          } : null,
          matchType: odooProduct ? matchType : 'no_match',
          matchConfidence: odooProduct ? matchConfidence : 0,
          accepted: matchType === 'exact' || matchType === 'case_insensitive', // Only auto-accept exact/case matches
        });
      }
      
      res.json({
        success: true,
        totalProducts: quickquotesProducts.length,
        totalOdooProducts: odooProducts.length,
        alreadyMapped: existingMappings.length,
        proposedMappings,
      });
    } catch (error: any) {
      console.error("Error previewing auto-mapping:", error);
      res.status(500).json({ error: error.message || "Failed to preview auto-mapping" });
    }
  });

  // Apply confirmed mappings from preview
  app.post("/api/odoo/product-mappings/auto/apply", requireAdmin, async (req: any, res) => {
    try {
      const { mappings } = req.body;
      
      if (!mappings || !Array.isArray(mappings)) {
        return res.status(400).json({ error: "mappings array is required" });
      }
      
      let created = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const mapping of mappings) {
        if (!mapping.itemCode || !mapping.odooProductId) {
          failed++;
          errors.push(`Invalid mapping for ${mapping.itemCode || 'unknown'}`);
          continue;
        }
        
        try {
          // Check if mapping already exists
          const [existing] = await db.select().from(productOdooMappings)
            .where(eq(productOdooMappings.itemCode, mapping.itemCode))
            .limit(1);
          
          if (existing) {
            // Update existing
            await db.update(productOdooMappings)
              .set({
                odooProductId: mapping.odooProductId,
                odooDefaultCode: mapping.odooDefaultCode,
                odooProductName: mapping.odooProductName,
                syncStatus: 'pending',
                updatedAt: new Date(),
              })
              .where(eq(productOdooMappings.id, existing.id));
          } else {
            // Create new
            await db.insert(productOdooMappings).values({
              itemCode: mapping.itemCode,
              odooProductId: mapping.odooProductId,
              odooDefaultCode: mapping.odooDefaultCode,
              odooProductName: mapping.odooProductName,
              syncStatus: 'pending',
            });
          }
          created++;
        } catch (err: any) {
          failed++;
          errors.push(`Failed to map ${mapping.itemCode}: ${err.message}`);
        }
      }
      
      res.json({
        success: true,
        created,
        failed,
        errors: errors.slice(0, 10),
      });
    } catch (error: any) {
      console.error("Error applying mappings:", error);
      res.status(500).json({ error: error.message || "Failed to apply mappings" });
    }
  });

  // Legacy auto-map endpoint (kept for backward compatibility)
  app.post("/api/odoo/product-mappings/auto", requireAdmin, async (req: any, res) => {
    try {
      const { overwriteExisting = false, dryRun = false } = req.body;
      
      // 1. Get all QuickQuotes products
      const quickquotesProducts = await db.select({
        id: productPricingMaster.id,
        itemCode: productPricingMaster.itemCode,
        productName: productPricingMaster.productName,
        productType: productPricingMaster.productType,
      }).from(productPricingMaster);
      
      // 2. Get existing mappings
      const existingMappings = await db.select().from(productOdooMappings);
      const existingMappingsByItemCode = new Map(
        existingMappings.map(m => [m.itemCode, m])
      );
      
      // 3. Get all Odoo products (templates + variants) with default_code
      let odooProducts: any[] = [];
      try {
        // Use getAllProductsWithVariants to get both templates and variants
        // This ensures we capture all Item Codes, as they're often on variants in Odoo
        odooProducts = await odooClient.getAllProductsWithVariants();
      } catch (err: any) {
        return res.status(500).json({ 
          error: "Failed to fetch Odoo products", 
          details: err.message 
        });
      }
      
      // Build a map of default_code -> odoo product (only those with codes)
      const odooByCode = new Map<string, any>();
      const duplicateCodes: string[] = [];
      for (const odooProduct of odooProducts) {
        if (odooProduct.default_code) {
          const code = odooProduct.default_code.trim();
          if (odooByCode.has(code)) {
            duplicateCodes.push(code);
          } else {
            odooByCode.set(code, odooProduct);
          }
        }
      }
      
      // 4. Match and create mappings
      const results = {
        matched: 0,
        created: 0,
        skipped: 0,
        conflicts: [] as string[],
        noMatch: [] as string[],
        newMappings: [] as any[],
      };
      
      for (const product of quickquotesProducts) {
        const itemCode = product.itemCode?.trim();
        if (!itemCode) continue;
        
        // Check if already mapped
        const existingMapping = existingMappingsByItemCode.get(itemCode);
        if (existingMapping && !overwriteExisting) {
          results.skipped++;
          continue;
        }
        
        // Look for matching Odoo product
        const odooProduct = odooByCode.get(itemCode);
        if (!odooProduct) {
          results.noMatch.push(itemCode);
          continue;
        }
        
        // Check for duplicate Odoo codes
        if (duplicateCodes.includes(itemCode)) {
          results.conflicts.push(`${itemCode} (multiple Odoo products with same code)`);
          continue;
        }
        
        results.matched++;
        
        if (!dryRun) {
          if (existingMapping) {
            // Update existing mapping
            await db.update(productOdooMappings)
              .set({
                odooProductId: odooProduct.id,
                odooDefaultCode: odooProduct.default_code,
                odooProductName: odooProduct.name,
                syncStatus: 'pending',
                updatedAt: new Date(),
              })
              .where(eq(productOdooMappings.id, existingMapping.id));
          } else {
            // Create new mapping
            const [newMapping] = await db.insert(productOdooMappings).values({
              itemCode,
              odooProductId: odooProduct.id,
              odooDefaultCode: odooProduct.default_code,
              odooProductName: odooProduct.name,
              syncStatus: 'pending',
            }).returning();
            results.newMappings.push(newMapping);
          }
          results.created++;
        }
      }
      
      res.json({
        success: true,
        dryRun,
        totalProducts: quickquotesProducts.length,
        totalOdooProducts: odooProducts.length,
        matched: results.matched,
        created: results.created,
        skipped: results.skipped,
        conflicts: results.conflicts.slice(0, 20), // Limit to first 20
        noMatch: results.noMatch.slice(0, 50), // Limit to first 50
        noMatchCount: results.noMatch.length,
        conflictCount: results.conflicts.length,
      });
    } catch (error: any) {
      console.error("Error auto-mapping products:", error);
      res.status(500).json({ error: error.message || "Failed to auto-map products" });
    }
  });

  // ========================================
  // ODOO MISSING PRODUCTS IMPORT APIs
  // ========================================

  // Get Odoo products that are NOT in local productPricingMaster
  app.get("/api/odoo/missing-products", requireAdmin, async (req: any, res) => {
    try {
      // First check if Odoo is connected
      const isConnected = await odooClient.testConnection();
      if (!isConnected) {
        return res.status(503).json({ 
          error: "Odoo is not connected. Please check your Odoo credentials in Environment Secrets." 
        });
      }
      
      const search = (req.query.search as string || '').toLowerCase();
      
      // Get all local item codes
      const localProducts = await db.select({
        itemCode: productPricingMaster.itemCode,
      }).from(productPricingMaster);
      const localItemCodes = new Set(localProducts.map(p => p.itemCode?.toLowerCase()));
      
      // Get all Odoo products
      console.log("[Missing Products] Fetching Odoo products...");
      const odooProducts = await odooClient.getAllProductsWithVariants();
      console.log(`[Missing Products] Found ${odooProducts.length} Odoo products`);
      
      // Filter to products NOT in local app (by default_code)
      const missingProducts = odooProducts.filter(p => {
        if (!p.default_code) return false;
        const code = p.default_code.toLowerCase();
        const notInLocal = !localItemCodes.has(code);
        if (!notInLocal) return false;
        
        // Apply search filter
        if (search) {
          return (
            code.includes(search) ||
            (p.name || '').toLowerCase().includes(search)
          );
        }
        return true;
      });
      
      res.json({
        success: true,
        totalOdooProducts: odooProducts.length,
        totalLocalProducts: localProducts.length,
        missingCount: missingProducts.length,
        missingProducts: missingProducts.slice(0, 200), // Limit to 200 for UI performance
      });
    } catch (error: any) {
      console.error("Error fetching missing products:", error);
      res.status(500).json({ error: error.message || "Failed to fetch missing products" });
    }
  });

  // Import selected Odoo products into local productPricingMaster and auto-map
  // Now supports guided product creation with additional fields
  app.post("/api/odoo/import-products", requireAdmin, async (req: any, res) => {
    try {
      const { products } = req.body;
      
      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: "products array is required" });
      }
      
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      
      for (const product of products) {
        if (!product.default_code || !product.name) {
          skipped++;
          continue;
        }
        
        const odooItemCode = product.default_code.trim();
        // Use Odoo code as the local item code going forward
        const itemCode = odooItemCode;
        
        try {
          // Check if product already exists
          const [existing] = await db.select().from(productPricingMaster)
            .where(eq(productPricingMaster.itemCode, itemCode))
            .limit(1);
          
          if (existing) {
            skipped++;
            continue;
          }
          
          // Extract guided fields from product (if provided)
          const rollSheet = product.rollSheet || null;
          const unitOfMeasure = product.unitOfMeasure || null;
          const minQuantity = product.minQuantity || 1;
          
          // All pricing tiers - preserved so admin can see them in Product Mappings
          const landedPrice = product.landedPrice?.toString() || null;
          const exportPrice = product.exportPrice?.toString() || null;
          const masterDistributorPrice = product.masterDistributorPrice?.toString() || null;
          const dealerPrice = product.dealerPrice?.toString() || null;
          const dealer2Price = product.dealer2Price?.toString() || null;
          const tierStage25Price = product.tierStage25Price?.toString() || null;
          const tierStage2Price = product.tierStage2Price?.toString() || null;
          const tierStage15Price = product.tierStage15Price?.toString() || null;
          const tierStage1Price = product.tierStage1Price?.toString() || null;
          const retailPrice = product.retailPrice?.toString() || null;
          
          // Always flag as Unmapped so it surfaces in Product Mappings for admin review.
          // Category/type assignment happens there, not at import time.
          await db.insert(productPricingMaster).values({
            itemCode,
            odooItemCode,
            productName: product.name,
            productType: 'Unmapped',
            productTypeId: null,
            catalogCategoryId: null,
            catalogProductTypeId: null,
            size: 'Unmapped',
            totalSqm: product.totalSqm || '0',
            minQuantity,
            rollSheet,
            unitOfMeasure,
            landedPrice,
            exportPrice,
            masterDistributorPrice,
            dealerPrice,
            dealer2Price,
            approvalNeededPrice: tierStage25Price,
            tierStage25Price,
            tierStage2Price,
            tierStage15Price,
            tierStage1Price,
            retailPrice,
            uploadBatch: 'odoo-import-' + new Date().toISOString().split('T')[0],
            isArchived: false,
          });
          
          // Auto-create mapping with Odoo code preserved
          await db.insert(productOdooMappings).values({
            itemCode,
            odooProductId: product.id,
            odooDefaultCode: odooItemCode,
            odooProductName: product.name,
            syncStatus: 'mapped',
            createdBy: req.user?.email,
          }).onConflictDoNothing();
          
          imported++;
        } catch (err: any) {
          errors.push(`${odooItemCode}: ${err.message}`);
        }
      }
      
      res.json({
        success: true,
        imported,
        skipped,
        errors: errors.slice(0, 10),
      });
    } catch (error: any) {
      console.error("Error importing products:", error);
      res.status(500).json({ error: error.message || "Failed to import products" });
    }
  });

  // ========================================
  // SIMPLIFIED ODOO IMPORT - Import ALL products as unmapped
  // ========================================
  
  app.post("/api/products/import-all-from-odoo", requireAdmin, async (req: any, res) => {
    try {
      const { odooClient } = await import('./odoo');
      
      console.log("[Odoo Import] Fetching ALL products (templates + variants) from Odoo...");
      const odooProducts = await odooClient.getAllProductsWithVariants();
      console.log(`[Odoo Import] Found ${odooProducts.length} products in Odoo`);
      
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      
      for (const product of odooProducts) {
        if (!product.default_code || !product.name) {
          skipped++;
          continue;
        }
        
        const odooItemCode = product.default_code.trim();
        
        try {
          // Check if product already exists
          const [existing] = await db.select().from(productPricingMaster)
            .where(eq(productPricingMaster.itemCode, odooItemCode))
            .limit(1);
          
          if (existing) {
            skipped++;
            continue;
          }
          
          // Extract description for size info
          const description = product.description_sale || product.description || product.name;
          
          // Create product as UNMAPPED (no category/type assigned)
          await db.insert(productPricingMaster).values({
            itemCode: odooItemCode,
            odooItemCode: odooItemCode,
            productName: product.name,
            productType: 'Unmapped',
            productTypeId: null,
            catalogCategoryId: null,
            catalogProductTypeId: null,
            size: 'Unmapped',
            totalSqm: '0',
            minQuantity: 1,
            rollSheet: null,
            unitOfMeasure: null,
            dealerPrice: product.list_price?.toString() || '0',
            retailPrice: product.list_price?.toString() || '0',
            uploadBatch: 'odoo-fresh-import-' + new Date().toISOString().split('T')[0],
            isArchived: false,
          });
          
          imported++;
        } catch (err: any) {
          errors.push(`${odooItemCode}: ${err.message}`);
        }
      }
      
      console.log(`[Odoo Import] Complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
      
      res.json({
        success: true,
        totalFromOdoo: odooProducts.length,
        imported,
        skipped,
        errors: errors.slice(0, 20),
      });
    } catch (error: any) {
      console.error("Error importing all products from Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to import products from Odoo" });
    }
  });

  // ========================================
  // PRODUCT MAPPING TOOL APIs
  // ========================================

  // Get products that need mapping (unmapped or incomplete)
  app.get("/api/products/unmapped", requireAdmin, async (req: any, res) => {
    try {
      const filter = (req.query.filter as string) || 'all';
      const search = (req.query.search as string || '').toLowerCase();
      
      // Get all products with their category/type info (excluding archived)
      const allProducts = await db.select({
        id: productPricingMaster.id,
        itemCode: productPricingMaster.itemCode,
        odooItemCode: productPricingMaster.odooItemCode,
        productName: productPricingMaster.productName,
        productType: productPricingMaster.productType,
        productTypeId: productPricingMaster.productTypeId,
        catalogCategoryId: productPricingMaster.catalogCategoryId,
        size: productPricingMaster.size,
        totalSqm: productPricingMaster.totalSqm,
        rollSheet: productPricingMaster.rollSheet,
        unitOfMeasure: productPricingMaster.unitOfMeasure,
        dealerPrice: productPricingMaster.dealerPrice,
        retailPrice: productPricingMaster.retailPrice,
        updatedAt: productPricingMaster.updatedAt,
        uploadBatch: productPricingMaster.uploadBatch,
      }).from(productPricingMaster)
        .where(or(eq(productPricingMaster.isArchived, false), isNull(productPricingMaster.isArchived)))
        .orderBy(productPricingMaster.productName);
      
      // Get excluded/archived products separately
      const excludedProducts = await db.select({
        id: productPricingMaster.id,
        itemCode: productPricingMaster.itemCode,
        odooItemCode: productPricingMaster.odooItemCode,
        productName: productPricingMaster.productName,
        productType: productPricingMaster.productType,
        productTypeId: productPricingMaster.productTypeId,
        catalogCategoryId: productPricingMaster.catalogCategoryId,
        size: productPricingMaster.size,
        totalSqm: productPricingMaster.totalSqm,
        rollSheet: productPricingMaster.rollSheet,
        unitOfMeasure: productPricingMaster.unitOfMeasure,
        dealerPrice: productPricingMaster.dealerPrice,
        retailPrice: productPricingMaster.retailPrice,
        updatedAt: productPricingMaster.updatedAt,
        uploadBatch: productPricingMaster.uploadBatch,
      }).from(productPricingMaster)
        .where(eq(productPricingMaster.isArchived, true))
        .orderBy(productPricingMaster.productName);
      
      // Get categories and types for reference
      const categories = await db.select().from(productCategories);
      const types = await db.select().from(productTypes);
      
      // Build type-to-category lookup
      const typeToCategory = new Map<number, number>();
      types.forEach(t => typeToCategory.set(t.id, t.categoryId));
      
      // Filter products based on criteria
      let filtered = allProducts.filter(p => {
        // Apply search filter first
        if (search) {
          const matchSearch = 
            (p.itemCode || '').toLowerCase().includes(search) ||
            (p.productName || '').toLowerCase().includes(search) ||
            (p.productType || '').toLowerCase().includes(search);
          if (!matchSearch) return false;
        }
        
        // Apply status filter
        const hasNoType = !p.productTypeId;
        const hasNoCategory = !p.catalogCategoryId;
        const hasDefaultSize = p.size === 'Standard' || !p.size;
        const hasZeroSqm = !p.totalSqm || parseFloat(p.totalSqm.toString()) === 0;
        
        switch (filter) {
          case 'unmapped':
            return hasNoType || hasNoCategory;
          case 'no-size':
            return hasDefaultSize;
          case 'no-sqm':
            return hasZeroSqm;
          case 'incomplete':
            return hasNoType || hasNoCategory || hasDefaultSize || hasZeroSqm;
          case 'all':
          default:
            return true;
        }
      });
      
      // Calculate counts for each filter
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const counts = {
        all: allProducts.length,
        unmapped: allProducts.filter(p => !p.productTypeId || !p.catalogCategoryId).length,
        noSize: allProducts.filter(p => p.size === 'Standard' || !p.size).length,
        noSqm: allProducts.filter(p => !p.totalSqm || parseFloat(p.totalSqm.toString()) === 0).length,
        incomplete: allProducts.filter(p => 
          !p.productTypeId || !p.catalogCategoryId || 
          p.size === 'Standard' || !p.size ||
          !p.totalSqm || parseFloat(p.totalSqm.toString()) === 0
        ).length,
        excluded: excludedProducts.length,
        newInLast7Days: allProducts.filter(p => 
          (!p.productTypeId || !p.catalogCategoryId) &&
          p.updatedAt && new Date(p.updatedAt) >= sevenDaysAgo
        ).length,
      };
      
      res.json({
        success: true,
        products: filtered.slice(0, 500), // Limit for performance
        excludedProducts: excludedProducts.slice(0, 500), // Excluded products for restore
        totalFiltered: filtered.length,
        counts,
        categories,
        types,
      });
    } catch (error: any) {
      console.error("Error fetching unmapped products:", error);
      res.status(500).json({ error: error.message || "Failed to fetch products" });
    }
  });

  // Update single product mapping
  app.patch("/api/products/:id/mapping", requireAdmin, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { productTypeId, catalogCategoryId, size, totalSqm, rollSheet, unitOfMeasure, isArchived, minQuantity } = req.body;
      
      // Build update object
      const updates: any = { updatedAt: new Date() };
      
      // Handle archive/exclude
      if (isArchived !== undefined) updates.isArchived = isArchived;
      
      // Handle min quantity (used for packets/cartons)
      if (minQuantity !== undefined) updates.minQuantity = minQuantity;
      
      if (productTypeId !== undefined) {
        updates.productTypeId = productTypeId || null;
        updates.catalogProductTypeId = productTypeId || null; // Keep in sync
        // If setting productTypeId, also derive catalogCategoryId from the type
        if (productTypeId) {
          const [typeInfo] = await db.select().from(productTypes)
            .where(eq(productTypes.id, productTypeId))
            .limit(1);
          if (typeInfo) {
            updates.catalogCategoryId = typeInfo.categoryId;
            updates.productType = typeInfo.name; // Also update productType string
          }
        }
      }
      if (catalogCategoryId !== undefined) updates.catalogCategoryId = catalogCategoryId || null;
      if (size !== undefined) updates.size = size;
      if (totalSqm !== undefined) updates.totalSqm = totalSqm.toString();
      if (rollSheet !== undefined) updates.rollSheet = rollSheet || null;
      if (unitOfMeasure !== undefined) updates.unitOfMeasure = unitOfMeasure || null;
      
      const [updated] = await db.update(productPricingMaster)
        .set(updates)
        .where(eq(productPricingMaster.id, productId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      res.json({ success: true, product: updated });
    } catch (error: any) {
      console.error("Error updating product mapping:", error);
      res.status(500).json({ error: error.message || "Failed to update product" });
    }
  });

  // Bulk update product mappings
  app.post("/api/products/bulk-mapping", requireAdmin, async (req: any, res) => {
    try {
      const { productIds, updates } = req.body;
      
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: "productIds array is required" });
      }
      
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "updates object is required" });
      }
      
      // Build update object
      const updateData: any = { updatedAt: new Date() };
      
      if (updates.productTypeId !== undefined) {
        updateData.productTypeId = updates.productTypeId || null;
        updateData.catalogProductTypeId = updates.productTypeId || null; // Keep in sync
        // Derive category from type
        if (updates.productTypeId) {
          const [typeInfo] = await db.select().from(productTypes)
            .where(eq(productTypes.id, updates.productTypeId))
            .limit(1);
          if (typeInfo) {
            updateData.catalogCategoryId = typeInfo.categoryId;
            updateData.productType = typeInfo.name;
          }
        }
      }
      if (updates.catalogCategoryId !== undefined) updateData.catalogCategoryId = updates.catalogCategoryId || null;
      if (updates.size !== undefined) updateData.size = updates.size;
      if (updates.totalSqm !== undefined) updateData.totalSqm = updates.totalSqm.toString();
      if (updates.rollSheet !== undefined) updateData.rollSheet = updates.rollSheet || null;
      if (updates.unitOfMeasure !== undefined) updateData.unitOfMeasure = updates.unitOfMeasure || null;
      
      let updatedCount = 0;
      for (const id of productIds) {
        await db.update(productPricingMaster)
          .set(updateData)
          .where(eq(productPricingMaster.id, id));
        updatedCount++;
      }
      
      res.json({ success: true, updatedCount });
    } catch (error: any) {
      console.error("Error bulk updating products:", error);
      res.status(500).json({ error: error.message || "Failed to bulk update products" });
    }
  });

  // Reset all product mappings (admin only) - clears productTypeId, catalogProductTypeId, catalogCategoryId
  app.post("/api/products/reset-mappings", requireAdmin, async (req: any, res) => {
    try {
      const { confirm } = req.body;
      
      if (confirm !== 'RESET_ALL_MAPPINGS') {
        return res.status(400).json({ error: "Confirmation required. Send { confirm: 'RESET_ALL_MAPPINGS' }" });
      }
      
      // Clear mapping fields for all products
      const result = await db.update(productPricingMaster)
        .set({
          productTypeId: null,
          catalogProductTypeId: null,
          catalogCategoryId: null,
          updatedAt: new Date(),
        })
        .returning({ id: productPricingMaster.id });
      
      console.log(`Reset mappings for ${result.length} products`);
      
      res.json({ success: true, resetCount: result.length });
    } catch (error: any) {
      console.error("Error resetting product mappings:", error);
      res.status(500).json({ error: error.message || "Failed to reset mappings" });
    }
  });

  // ============ ODOO FUZZY MATCH SUGGESTIONS ============

  // Helper: Calculate Levenshtein distance for fuzzy matching
  const levenshteinDistance = (str1: string, str2: string): number => {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  };

  // Helper: Normalize product code for comparison
  const normalizeProductCode = (code: string): string => {
    return code
      .toLowerCase()
      .replace(/[\s\-_\/\\\.]+/g, '')
      .trim();
  };

  // Helper: Calculate similarity score (0-1)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const normalized1 = normalizeProductCode(str1);
    const normalized2 = normalizeProductCode(str2);
    
    if (normalized1 === normalized2) return 1.0;
    
    const maxLen = Math.max(normalized1.length, normalized2.length);
    if (maxLen === 0) return 0;
    
    const distance = levenshteinDistance(normalized1, normalized2);
    return 1 - (distance / maxLen);
  };

  // Get all pending merge suggestions
  app.get("/api/products/merge-suggestions", requireAdmin, async (req: any, res) => {
    try {
      const suggestions = await db.select({
        id: productMergeSuggestions.id,
        localProductId: productMergeSuggestions.localProductId,
        odooDefaultCode: productMergeSuggestions.odooDefaultCode,
        odooProductName: productMergeSuggestions.odooProductName,
        odooProductId: productMergeSuggestions.odooProductId,
        matchScore: productMergeSuggestions.matchScore,
        matchType: productMergeSuggestions.matchType,
        status: productMergeSuggestions.status,
        createdAt: productMergeSuggestions.createdAt,
      })
        .from(productMergeSuggestions)
        .where(eq(productMergeSuggestions.status, 'pending'))
        .orderBy(desc(productMergeSuggestions.matchScore));
      
      // Get local product details for each suggestion
      const enrichedSuggestions = await Promise.all(suggestions.map(async (s) => {
        const [localProduct] = await db.select({
          itemCode: productPricingMaster.itemCode,
          odooItemCode: productPricingMaster.odooItemCode,
          productName: productPricingMaster.productName,
          productType: productPricingMaster.productType,
          size: productPricingMaster.size,
          dealerPrice: productPricingMaster.dealerPrice,
        })
          .from(productPricingMaster)
          .where(eq(productPricingMaster.id, s.localProductId))
          .limit(1);
        
        return {
          ...s,
          localProduct,
        };
      }));
      
      res.json({
        success: true,
        suggestions: enrichedSuggestions,
        count: enrichedSuggestions.length,
      });
    } catch (error: any) {
      console.error("Error fetching merge suggestions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch suggestions" });
    }
  });

  // Generate fuzzy match suggestions from Odoo products
  app.post("/api/products/generate-suggestions", requireAdmin, async (req: any, res) => {
    try {
      const { minScore = 0.7 } = req.body;
      
      // Get Odoo products
      const { odooClient } = await import('./odoo');
      const odooProducts = await odooClient.getProducts({ limit: 500 });
      
      if (!odooProducts || odooProducts.length === 0) {
        return res.json({ success: true, generated: 0, message: "No Odoo products found" });
      }
      
      // Get local products
      const localProducts = await db.select({
        id: productPricingMaster.id,
        itemCode: productPricingMaster.itemCode,
        odooItemCode: productPricingMaster.odooItemCode,
        productName: productPricingMaster.productName,
        isArchived: productPricingMaster.isArchived,
      })
        .from(productPricingMaster)
        .where(eq(productPricingMaster.isArchived, false));
      
      // Clear existing pending suggestions
      await db.delete(productMergeSuggestions)
        .where(eq(productMergeSuggestions.status, 'pending'));
      
      // Get all previously rejected pairs to exclude them
      const rejectedPairs = await db.select({
        localProductId: productMergeSuggestions.localProductId,
        odooDefaultCode: productMergeSuggestions.odooDefaultCode,
      })
        .from(productMergeSuggestions)
        .where(eq(productMergeSuggestions.status, 'rejected'));
      
      // Create a Set for fast lookup of rejected pairs
      const rejectedSet = new Set(
        rejectedPairs.map(r => `${r.localProductId}:${r.odooDefaultCode}`)
      );
      
      let generated = 0;
      const newSuggestions: any[] = [];
      const missingFromLocal: any[] = [];
      
      for (const odooProduct of odooProducts) {
        const odooCode = odooProduct.default_code || '';
        if (!odooCode) continue;
        
        let bestMatch: { product: any; score: number; type: string } | null = null;
        
        for (const localProduct of localProducts) {
          // Skip if already has this Odoo code
          if (localProduct.odooItemCode === odooCode) {
            bestMatch = { product: localProduct, score: 1.0, type: 'exact' };
            break;
          }
          
          // Calculate similarity with item code
          const score = calculateSimilarity(odooCode, localProduct.itemCode);
          
          if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
            bestMatch = {
              product: localProduct,
              score,
              type: score === 1.0 ? 'exact' : score >= 0.9 ? 'prefix' : 'fuzzy',
            };
          }
        }
        
        if (bestMatch && bestMatch.score < 1.0) {
          // Skip if this pair was previously rejected
          const pairKey = `${bestMatch.product.id}:${odooCode}`;
          if (rejectedSet.has(pairKey)) {
            continue;
          }
          
          // Found a fuzzy match - create suggestion
          newSuggestions.push({
            localProductId: bestMatch.product.id,
            odooDefaultCode: odooCode,
            odooProductName: odooProduct.name || '',
            odooProductId: odooProduct.id,
            matchScore: bestMatch.score.toFixed(4),
            matchType: bestMatch.type,
            status: 'pending',
          });
          generated++;
        } else if (!bestMatch) {
          // No match found - track as missing
          missingFromLocal.push({
            odooCode,
            odooProductName: odooProduct.name,
            odooProductId: odooProduct.id,
          });
        }
      }
      
      // Insert new suggestions
      if (newSuggestions.length > 0) {
        await db.insert(productMergeSuggestions).values(newSuggestions);
      }
      
      res.json({
        success: true,
        generated,
        missingFromLocal: missingFromLocal.slice(0, 50), // Return first 50 missing
        totalMissing: missingFromLocal.length,
      });
    } catch (error: any) {
      console.error("Error generating suggestions:", error);
      res.status(500).json({ error: error.message || "Failed to generate suggestions" });
    }
  });

  // Accept a merge suggestion - apply Odoo code to local product
  app.post("/api/products/merge-suggestions/:id/accept", requireAdmin, async (req: any, res) => {
    try {
      const suggestionId = parseInt(req.params.id);
      const userId = req.user?.id || req.user?.email || 'admin';
      
      // Get the suggestion
      const [suggestion] = await db.select()
        .from(productMergeSuggestions)
        .where(eq(productMergeSuggestions.id, suggestionId))
        .limit(1);
      
      if (!suggestion) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      
      if (suggestion.status !== 'pending') {
        return res.status(400).json({ error: "Suggestion already resolved" });
      }
      
      // Update the local product with Odoo code (Odoo code takes precedence)
      await db.update(productPricingMaster)
        .set({
          odooItemCode: suggestion.odooDefaultCode,
          updatedAt: new Date(),
        })
        .where(eq(productPricingMaster.id, suggestion.localProductId));
      
      // Mark suggestion as accepted
      await db.update(productMergeSuggestions)
        .set({
          status: 'accepted',
          resolvedAt: new Date(),
          resolvedBy: userId,
        })
        .where(eq(productMergeSuggestions.id, suggestionId));
      
      res.json({ success: true, message: "Odoo code applied to product" });
    } catch (error: any) {
      console.error("Error accepting suggestion:", error);
      res.status(500).json({ error: error.message || "Failed to accept suggestion" });
    }
  });

  // Reject a merge suggestion
  app.post("/api/products/merge-suggestions/:id/reject", requireAdmin, async (req: any, res) => {
    try {
      const suggestionId = parseInt(req.params.id);
      const userId = req.user?.id || req.user?.email || 'admin';
      const { notes } = req.body;
      
      const [suggestion] = await db.select()
        .from(productMergeSuggestions)
        .where(eq(productMergeSuggestions.id, suggestionId))
        .limit(1);
      
      if (!suggestion) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      
      await db.update(productMergeSuggestions)
        .set({
          status: 'rejected',
          resolvedAt: new Date(),
          resolvedBy: userId,
          notes: notes || null,
        })
        .where(eq(productMergeSuggestions.id, suggestionId));
      
      res.json({ success: true, message: "Suggestion rejected" });
    } catch (error: any) {
      console.error("Error rejecting suggestion:", error);
      res.status(500).json({ error: error.message || "Failed to reject suggestion" });
    }
  });

  // Add a new product from Odoo data
  app.post("/api/products/add-from-odoo", requireAdmin, async (req: any, res) => {
    try {
      const { 
        odooCode, 
        odooProductName, 
        odooProductId,
        productName,
        productType,
        size,
        totalSqm,
        minQuantity,
        rollSheet,
        unitOfMeasure,
      } = req.body;
      
      if (!odooCode) {
        return res.status(400).json({ error: "Odoo code is required" });
      }
      
      // Check if product with this Odoo code already exists
      const [existing] = await db.select({ id: productPricingMaster.id })
        .from(productPricingMaster)
        .where(eq(productPricingMaster.odooItemCode, odooCode))
        .limit(1);
      
      if (existing) {
        return res.status(400).json({ error: "Product with this Odoo code already exists" });
      }
      
      // Generate a unique item code based on Odoo code
      const itemCode = `ODOO-${odooCode}`;
      
      // Check if item code exists
      const [existingItemCode] = await db.select({ id: productPricingMaster.id })
        .from(productPricingMaster)
        .where(eq(productPricingMaster.itemCode, itemCode))
        .limit(1);
      
      if (existingItemCode) {
        return res.status(400).json({ error: "Product with this item code already exists" });
      }
      
      // Insert new product
      const [newProduct] = await db.insert(productPricingMaster).values({
        itemCode,
        odooItemCode: odooCode,
        productName: productName || odooProductName || 'Unknown Product',
        productType: productType || 'Unknown Type',
        size: size || 'Standard',
        totalSqm: totalSqm || '0',
        minQuantity: minQuantity || 50,
        rollSheet: rollSheet || null,
        unitOfMeasure: unitOfMeasure || null,
        isArchived: false,
      }).returning();
      
      res.json({ success: true, product: newProduct });
    } catch (error: any) {
      console.error("Error adding product from Odoo:", error);
      res.status(500).json({ error: error.message || "Failed to add product" });
    }
  });

  // ============ END ODOO FUZZY MATCH ============

  // Get duplicate/similar products for merging
  app.get("/api/products/duplicates", requireAdmin, async (req: any, res) => {
    try {
      const allProducts = await db.select({
        id: productPricingMaster.id,
        itemCode: productPricingMaster.itemCode,
        odooItemCode: productPricingMaster.odooItemCode,
        productName: productPricingMaster.productName,
        productType: productPricingMaster.productType,
        size: productPricingMaster.size,
        totalSqm: productPricingMaster.totalSqm,
        dealerPrice: productPricingMaster.dealerPrice,
        retailPrice: productPricingMaster.retailPrice,
      }).from(productPricingMaster)
        .orderBy(productPricingMaster.itemCode);
      
      const normalizeCode = (code: string): string => {
        return code
          .toLowerCase()
          .replace(/[\s\-_\/\\\.]+/g, '')
          .replace(/\d+x\d+/gi, '')
          .replace(/\d{2,}$/g, '')
          .trim();
      };
      
      const groupedByNormalized = new Map<string, typeof allProducts>();
      
      for (const product of allProducts) {
        if (!product.itemCode) continue;
        const normalized = normalizeCode(product.itemCode);
        if (normalized.length < 3) continue;
        
        if (!groupedByNormalized.has(normalized)) {
          groupedByNormalized.set(normalized, []);
        }
        groupedByNormalized.get(normalized)!.push(product);
      }
      
      const duplicateGroups = Array.from(groupedByNormalized.entries())
        .filter(([_, products]) => products.length > 1)
        .map(([normalizedCode, products]) => ({
          normalizedCode,
          products,
          hasOdooCode: products.some(p => p.odooItemCode),
          conflictingPrices: new Set(products.map(p => p.dealerPrice)).size > 1,
          conflictingSizes: new Set(products.map(p => p.size)).size > 1,
        }))
        .sort((a, b) => b.products.length - a.products.length);
      
      res.json({
        success: true,
        duplicateGroups,
        totalGroups: duplicateGroups.length,
        totalDuplicateProducts: duplicateGroups.reduce((sum, g) => sum + g.products.length, 0),
      });
    } catch (error: any) {
      console.error("Error fetching duplicate products:", error);
      res.status(500).json({ error: error.message || "Failed to fetch duplicates" });
    }
  });

  // Merge duplicate products (keep primary, deactivate others)
  app.post("/api/products/merge", requireAdmin, async (req: any, res) => {
    try {
      const { primaryId, mergeIds } = req.body;
      
      if (!primaryId || !mergeIds || !Array.isArray(mergeIds) || mergeIds.length === 0) {
        return res.status(400).json({ error: "primaryId and mergeIds array are required" });
      }
      
      const [primary] = await db.select().from(productPricingMaster)
        .where(eq(productPricingMaster.id, primaryId))
        .limit(1);
      
      if (!primary) {
        return res.status(404).json({ error: "Primary product not found" });
      }
      
      let mergedCount = 0;
      for (const mergeId of mergeIds) {
        if (mergeId === primaryId) continue;
        
        await db.update(productPricingMaster)
          .set({ 
            isActive: false,
            productName: `[MERGED → ${primary.itemCode}] ${primary.productName}`,
            updatedAt: new Date()
          })
          .where(eq(productPricingMaster.id, mergeId));
        mergedCount++;
      }
      
      res.json({ 
        success: true, 
        mergedCount,
        primaryProduct: primary 
      });
    } catch (error: any) {
      console.error("Error merging products:", error);
      res.status(500).json({ error: error.message || "Failed to merge products" });
    }
  });

  // ========================================
  // ODOO SALES ORDER APIs
  // ========================================

  // Create a sales order in Odoo from QuickQuotes
  app.post("/api/odoo/create-sale-order", requireApproval, async (req: any, res) => {
    try {
      const { customerId, items, note } = req.body;
      
      if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "customerId and items array are required" });
      }
      
      // Get customer and their Odoo partner ID
      const [customer] = await db.select().from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      if (!customer.odooPartnerId) {
        return res.status(400).json({ error: "Customer is not synced to Odoo. Please sync the customer first." });
      }
      
      // Build order lines - each item needs to be mapped to Odoo product
      const orderLines: Array<[number, number, { product_id: number; product_uom_qty: number; price_unit: number }]> = [];
      const unmappedItems: string[] = [];
      
      for (const item of items) {
        // Get the Odoo mapping for this item
        const [mapping] = await db.select().from(productOdooMappings)
          .where(eq(productOdooMappings.itemCode, item.itemCode))
          .limit(1);
        
        if (!mapping) {
          unmappedItems.push(item.itemCode || item.productName);
          continue;
        }
        
        // Odoo order line format: [0, 0, { field: value }] for create
        orderLines.push([0, 0, {
          product_id: mapping.odooProductId,
          product_uom_qty: item.quantity || 1,
          price_unit: item.pricePerSheet || 0,
        }]);
      }
      
      if (unmappedItems.length > 0 && orderLines.length === 0) {
        return res.status(400).json({ 
          error: "No items are mapped to Odoo products", 
          unmappedItems 
        });
      }
      
      // Create the sale order in Odoo
      const orderId = await odooClient.createSaleOrder({
        partner_id: customer.odooPartnerId,
        order_line: orderLines,
        note: note || `Created from QuickQuotes on ${new Date().toLocaleDateString()}`,
      });
      
      // Log the activity
      await db.insert(activityLogs).values({
        userId: req.user.id,
        userEmail: req.user.email || 'unknown',
        userName: req.user.name || req.user.email || 'Unknown',
        userRole: req.user.role || 'user',
        action: 'ODOO_ORDER_CREATED',
        actionType: 'odoo',
        description: `Created Odoo sales order #${orderId} for customer ${customer.company || customer.email}`,
        targetId: String(customerId),
        targetType: 'customer',
        metadata: {
          odooOrderId: orderId,
          itemCount: orderLines.length,
          unmappedCount: unmappedItems.length,
        },
      });
      
      res.json({
        success: true,
        orderId,
        itemsAdded: orderLines.length,
        unmappedItems: unmappedItems.length > 0 ? unmappedItems : undefined,
        message: `Sales order created in Odoo${unmappedItems.length > 0 ? ` (${unmappedItems.length} items skipped - not mapped)` : ''}`,
      });
    } catch (error: any) {
      console.error("Error creating Odoo sale order:", error);
      res.status(500).json({ error: error.message || "Failed to create sale order in Odoo" });
    }
  });

  // ========================================
  // ODOO PRICE SYNC QUEUE APIs
  // ========================================

  // Get pending price sync requests
  app.get("/api/odoo/price-sync-queue", requireAdmin, async (req: any, res) => {
    try {
      const status = req.query.status as string || 'pending';
      const queue = await db.select().from(odooPriceSyncQueue)
        .where(eq(odooPriceSyncQueue.status, status))
        .orderBy(odooPriceSyncQueue.requestedAt);
      res.json(queue);
    } catch (error: any) {
      console.error("Error fetching price sync queue:", error);
      res.status(500).json({ error: error.message || "Failed to fetch price sync queue" });
    }
  });

  // Request a price push to Odoo (adds to queue, requires approval)
  app.post("/api/odoo/price-sync-queue", requireApproval, async (req: any, res) => {
    try {
      const { itemCode, priceTier, newPrice } = req.body;
      
      if (!itemCode || !priceTier || newPrice === undefined) {
        return res.status(400).json({ error: "itemCode, priceTier, and newPrice are required" });
      }
      
      // Get the product mapping
      const [mapping] = await db.select().from(productOdooMappings)
        .where(eq(productOdooMappings.itemCode, itemCode))
        .limit(1);
      
      if (!mapping) {
        return res.status(400).json({ error: "Product is not mapped to Odoo. Please create a mapping first." });
      }
      
      // Get current Odoo price
      let currentOdooPrice = null;
      try {
        const odooProduct = await odooClient.getProductById(mapping.odooProductId);
        if (odooProduct) {
          currentOdooPrice = odooProduct.list_price;
        }
      } catch (err) {
        console.warn("Could not fetch current Odoo price:", err);
      }
      
      const [queueItem] = await db.insert(odooPriceSyncQueue).values({
        mappingId: mapping.id,
        itemCode,
        odooProductId: mapping.odooProductId,
        priceTier,
        currentOdooPrice: currentOdooPrice?.toString(),
        newPrice: newPrice.toString(),
        status: 'pending',
        requestedBy: req.user?.email || 'unknown',
      }).returning();
      
      res.json(queueItem);
    } catch (error: any) {
      console.error("Error adding to price sync queue:", error);
      res.status(500).json({ error: error.message || "Failed to add price sync request" });
    }
  });

  // Approve and execute a price sync (WRITE to Odoo)
  app.post("/api/odoo/price-sync-queue/:id/approve", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get the queue item
      const [queueItem] = await db.select().from(odooPriceSyncQueue)
        .where(eq(odooPriceSyncQueue.id, id))
        .limit(1);
      
      if (!queueItem) {
        return res.status(404).json({ error: "Queue item not found" });
      }
      
      if (queueItem.status !== 'pending') {
        return res.status(400).json({ error: "Queue item is not pending" });
      }
      
      // Update status to approved
      await db.update(odooPriceSyncQueue)
        .set({
          status: 'approved',
          approvedBy: req.user?.email || 'admin',
          approvedAt: new Date(),
        })
        .where(eq(odooPriceSyncQueue.id, id));
      
      // Execute the price update in Odoo
      try {
        const success = await odooClient.updateProductPrice(
          queueItem.odooProductId,
          parseFloat(queueItem.newPrice)
        );
        
        if (success) {
          // Update mapping status
          await db.update(productOdooMappings)
            .set({
              syncStatus: 'synced',
              lastSyncedAt: new Date(),
              lastSyncError: null,
            })
            .where(eq(productOdooMappings.id, queueItem.mappingId));
          
          // Update queue item
          await db.update(odooPriceSyncQueue)
            .set({
              status: 'synced',
              syncedAt: new Date(),
            })
            .where(eq(odooPriceSyncQueue.id, id));
          
          res.json({ success: true, message: "Price updated in Odoo" });
        } else {
          throw new Error("Odoo returned false for update");
        }
      } catch (syncError: any) {
        // Update with error status
        await db.update(odooPriceSyncQueue)
          .set({
            status: 'error',
            syncError: syncError.message,
          })
          .where(eq(odooPriceSyncQueue.id, id));
        
        await db.update(productOdooMappings)
          .set({
            syncStatus: 'error',
            lastSyncError: syncError.message,
          })
          .where(eq(productOdooMappings.id, queueItem.mappingId));
        
        res.status(500).json({ error: `Failed to update price in Odoo: ${syncError.message}` });
      }
    } catch (error: any) {
      console.error("Error approving price sync:", error);
      res.status(500).json({ error: error.message || "Failed to approve price sync" });
    }
  });

  // Reject a price sync request
  app.post("/api/odoo/price-sync-queue/:id/reject", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      const [updated] = await db.update(odooPriceSyncQueue)
        .set({
          status: 'rejected',
          approvedBy: req.user?.email || 'admin',
          approvedAt: new Date(),
        })
        .where(eq(odooPriceSyncQueue.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Queue item not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error rejecting price sync:", error);
      res.status(500).json({ error: error.message || "Failed to reject price sync" });
    }
  });

  // Sync Odoo sale orders into sent_quotes for reports
  app.post("/api/odoo/sync-sales", requireAdmin, async (req: any, res) => {
    try {
      // Get existing quote numbers to avoid duplicates
      const existingQuotes = await db.select({ quoteNumber: sentQuotes.quoteNumber })
        .from(sentQuotes);
      const existingQuoteNumbers = new Set(existingQuotes.map(q => q.quoteNumber));
      
      // Get partner mapping for customer names
      const customers = await storage.getCustomers();
      const customersByOdooId = new Map(
        customers
          .filter(c => c.odooPartnerId)
          .map(c => [c.odooPartnerId, c])
      );
      
      // Paginate through all sale orders from Odoo
      const batchSize = 200;
      let offset = 0;
      let imported = 0;
      let skipped = 0;
      let totalFetched = 0;
      let hasMore = true;
      
      while (hasMore) {
        const saleOrders = await odooClient.getSaleOrders({ 
          limit: batchSize, 
          offset,
          domain: [['state', 'in', ['sale', 'done']]] 
        });
        
        totalFetched += saleOrders.length;
        console.log(`Fetched batch: ${saleOrders.length} orders (offset ${offset})`);
        
        for (const order of saleOrders) {
          const quoteNumber = order.name || `ODOO-${order.id}`;
          
          // Skip if already imported (check both existing and newly added)
          if (existingQuoteNumbers.has(quoteNumber)) {
            skipped++;
            continue;
          }
          
          // Get customer info
          const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
          const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : 'Unknown Customer';
          const customer = customersByOdooId.get(partnerId);
          
          // Create quote record
          await db.insert(sentQuotes).values({
            quoteNumber,
            customerName: customer?.name || partnerName,
            customerEmail: customer?.email || null,
            quoteItems: JSON.stringify([{ note: 'Imported from Odoo', orderId: order.id }]),
            totalAmount: String(order.amount_total || 0),
            createdAt: order.date_order ? new Date(order.date_order) : new Date(),
            sentVia: 'odoo-sync',
            status: order.state === 'done' ? 'completed' : 'sent',
            ownerEmail: req.user?.email,
            outcome: order.state === 'done' ? 'won' : 'pending',
          });
          
          // Track this quote number to prevent duplicates within same sync
          existingQuoteNumbers.add(quoteNumber);
          imported++;
        }
        
        // Check if there are more orders to fetch
        if (saleOrders.length < batchSize) {
          hasMore = false;
        } else {
          offset += batchSize;
        }
      }
      
      res.json({
        success: true,
        message: `Imported ${imported} orders from Odoo (${skipped} already existed)`,
        imported,
        skipped,
        total: totalFetched,
      });
    } catch (error: any) {
      console.error("Error syncing Odoo sales:", error);
      res.status(500).json({ error: error.message || "Failed to sync sales from Odoo" });
    }
  });

  // Get all Odoo products (with pagination for mapping UI)
  app.get("/api/odoo/all-products", requireApproval, async (req: any, res) => {
    try {
      const search = (req.query.search as string || '').toLowerCase();
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      
      let domain: any[] = [];
      if (search) {
        domain = ['|', '|', 
          ['name', 'ilike', `%${search}%`],
          ['default_code', 'ilike', `%${search}%`],
          ['description', 'ilike', `%${search}%`]
        ];
      }
      
      const products = await odooClient.getProducts({ limit, offset, domain });
      res.json(products);
    } catch (error: any) {
      console.error("Error fetching all Odoo products:", error);
      res.status(500).json({ error: error.message || "Failed to fetch Odoo products" });
    }
  });

  // ========================================
  // SHOPIFY INTEGRATION APIs
  // ========================================

  // Environment variables for Shopify (supports both OAuth and direct access token)
  const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
  const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
  const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_customers,read_products';
  const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000');
  // Direct access token for "Develop apps" (custom apps created in store admin)
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

  // Shopify OAuth: Initiate install flow
  app.get("/shopify/auth", async (req, res) => {
    try {
      const shop = req.query.shop as string;
      
      if (!shop || !shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
        return res.status(400).send("Invalid shop parameter");
      }
      
      if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
        return res.status(500).send("Shopify app credentials not configured");
      }

      // Generate state for CSRF protection
      const crypto = await import('crypto');
      const state = crypto.randomBytes(16).toString('hex');
      
      // Store state in session or temporary storage (we'll use session)
      if (req.session) {
        req.session.shopifyState = state;
        req.session.shopifyShop = shop;
      }

      const redirectUri = `${SHOPIFY_APP_URL}/shopify/callback`;
      const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      
      console.log(`Shopify OAuth: Redirecting to ${shop} for install`);
      res.redirect(installUrl);
    } catch (error) {
      console.error("Shopify auth error:", error);
      res.status(500).send("Error initiating Shopify authentication");
    }
  });

  // Shopify OAuth: Callback after user approves
  app.get("/shopify/callback", async (req, res) => {
    try {
      const { shop, code, state, hmac } = req.query as { shop: string; code: string; state: string; hmac: string };
      
      if (!shop || !code || !state) {
        return res.status(400).send("Missing required parameters");
      }
      
      if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
        return res.status(500).send("Shopify app credentials not configured");
      }

      // Verify state to prevent CSRF
      const sessionState = req.session?.shopifyState;
      if (state !== sessionState) {
        console.warn("Shopify OAuth: State mismatch", { expected: sessionState, received: state });
        return res.status(403).send("Invalid state parameter");
      }

      // Verify HMAC
      const crypto = await import('crypto');
      const queryParams = new URLSearchParams(req.query as any);
      queryParams.delete('hmac');
      const message = queryParams.toString();
      const generatedHmac = crypto.createHmac('sha256', SHOPIFY_API_SECRET)
        .update(message)
        .digest('hex');
      
      if (generatedHmac !== hmac) {
        console.warn("Shopify OAuth: HMAC verification failed");
        return res.status(401).send("Invalid HMAC signature");
      }

      // Exchange code for access token
      const axios = (await import('axios')).default;
      const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      });

      const { access_token, scope } = tokenResponse.data;
      
      if (!access_token) {
        return res.status(500).send("Failed to obtain access token");
      }

      // Store the installation
      await db.insert(shopifyInstalls).values({
        shop,
        accessToken: access_token,
        scope,
        isActive: true,
        installedAt: new Date(),
      }).onConflictDoUpdate({
        target: shopifyInstalls.shop,
        set: {
          accessToken: access_token,
          scope,
          isActive: true,
          uninstalledAt: null,
          updatedAt: new Date(),
        }
      });

      // Also update shopifySettings with the shop domain
      const existingSettings = await db.select().from(shopifySettings).limit(1);
      if (existingSettings.length > 0) {
        await db.update(shopifySettings).set({ shopDomain: shop, isActive: true }).where(eq(shopifySettings.id, existingSettings[0].id));
      } else {
        await db.insert(shopifySettings).values({ shopDomain: shop, isActive: true });
      }

      // Register webhooks
      await registerShopifyWebhooks(shop, access_token);

      console.log(`Shopify OAuth: Successfully installed app for ${shop}`);
      
      // Redirect to embedded app
      res.redirect(`https://${shop}/admin/apps/${SHOPIFY_API_KEY}`);
    } catch (error: any) {
      console.error("Shopify callback error:", error.response?.data || error);
      res.status(500).send("Error completing Shopify authentication");
    }
  });

  // Helper function to register webhooks after OAuth
  async function registerShopifyWebhooks(shop: string, accessToken: string) {
    try {
      const axios = (await import('axios')).default;
      const webhookUrl = `${SHOPIFY_APP_URL}/api/webhooks/shopify`;
      
      const webhooksToRegister = [
        { topic: 'orders/paid', address: `${webhookUrl}/orders` },
        { topic: 'orders/updated', address: `${webhookUrl}/orders` },
        { topic: 'customers/create', address: `${webhookUrl}/customers` },
        { topic: 'customers/update', address: `${webhookUrl}/customers` },
        { topic: 'customers/delete', address: `${webhookUrl}/customers` },
      ];

      for (const webhook of webhooksToRegister) {
        try {
          await axios.post(
            `https://${shop}/admin/api/2024-01/webhooks.json`,
            { webhook: { topic: webhook.topic, address: webhook.address, format: 'json' } },
            { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
          );
          console.log(`Registered webhook: ${webhook.topic} -> ${webhook.address}`);
        } catch (webhookError: any) {
          // Webhook might already exist
          if (webhookError.response?.status !== 422) {
            console.error(`Failed to register webhook ${webhook.topic}:`, webhookError.response?.data || webhookError.message);
          }
        }
      }
    } catch (error) {
      console.error("Error registering webhooks:", error);
    }
  }

  // Middleware to verify Shopify embedded app session
  // For single-store internal app, we verify:
  // 1. The shop parameter matches an installed shop
  // 2. User has valid CRM session OR request comes from valid Shopify Admin
  async function verifyShopifySession(req: any, res: any, next: any) {
    try {
      const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
      const host = req.query.host;
      
      if (!shop) {
        // No shop parameter - redirect to home
        return res.redirect('/');
      }

      // Validate shop format to prevent injection
      if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
        return res.status(400).send("Invalid shop parameter");
      }

      // Check if we have an active installation for this shop
      const install = await db.select().from(shopifyInstalls)
        .where(and(eq(shopifyInstalls.shop, shop), eq(shopifyInstalls.isActive, true)))
        .limit(1);

      if (install.length === 0) {
        // Not installed, redirect to OAuth flow
        return res.redirect(`/shopify/auth?shop=${shop}`);
      }

      // For a single-store internal app, we trust requests with valid host parameter
      // The host is Base64 encoded and provided by Shopify Admin
      // Full session token validation would require App Bridge token exchange
      if (!host) {
        console.warn(`Shopify embedded request without host for ${shop}`);
      }

      // Set shop context on request
      req.shopifyShop = shop;
      req.shopifyHost = host;
      req.shopifyAccessToken = install[0].accessToken;
      
      // Update last API call timestamp
      await db.update(shopifyInstalls)
        .set({ lastApiCallAt: new Date() })
        .where(eq(shopifyInstalls.shop, shop));
      
      next();
    } catch (error) {
      console.error("Shopify session verification error:", error);
      res.status(500).send("Error verifying Shopify session");
    }
  }

  // Embedded app entry point - served when accessed from Shopify Admin
  app.get("/app", verifyShopifySession, (req: any, res) => {
    const shop = req.shopifyShop;
    const host = req.shopifyHost;
    
    // Redirect to React app with embedded context
    // The React app will initialize App Bridge if embedded=true
    const redirectUrl = new URL('/', `${SHOPIFY_APP_URL}`);
    redirectUrl.searchParams.set('embedded', 'true');
    redirectUrl.searchParams.set('shop', shop);
    if (host) redirectUrl.searchParams.set('host', host);
    
    res.redirect(redirectUrl.toString());
  });

  // API endpoint to get Shopify install status
  app.get("/api/shopify/install-status", isAuthenticated, async (req, res) => {
    try {
      // Check for direct access token setup first (Develop apps / custom apps)
      if (SHOPIFY_ACCESS_TOKEN && SHOPIFY_STORE_DOMAIN) {
        return res.json({
          installed: true,
          connectionType: 'direct_token',
          shops: [{ 
            shop: SHOPIFY_STORE_DOMAIN, 
            installedAt: new Date().toISOString(), 
            scope: SHOPIFY_SCOPES 
          }],
        });
      }

      // Fall back to OAuth-based installs
      const installs = await db.select().from(shopifyInstalls)
        .where(eq(shopifyInstalls.isActive, true));
      
      res.json({
        installed: installs.length > 0,
        connectionType: 'oauth',
        shops: installs.map(i => ({ shop: i.shop, installedAt: i.installedAt, scope: i.scope })),
      });
    } catch (error) {
      console.error("Error getting install status:", error);
      res.status(500).json({ error: "Failed to get install status" });
    }
  });

  // Helper function to verify Shopify HMAC signature
  async function verifyShopifyWebhookHMAC(rawBody: Buffer | string, hmacHeader: string): Promise<boolean> {
    if (!SHOPIFY_API_SECRET || !hmacHeader) {
      console.warn("Shopify HMAC verification skipped: missing secret or header");
      return true; // Allow if no secret configured
    }
    
    try {
      const crypto = await import('crypto');
      const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
      const computedHmac = crypto.createHmac('sha256', SHOPIFY_API_SECRET)
        .update(bodyBuffer)
        .digest('base64');
      
      // Use timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(computedHmac),
        Buffer.from(hmacHeader)
      );
      
      return isValid;
    } catch (error) {
      console.error("HMAC verification error:", error);
      return false;
    }
  }

  // Shopify webhook endpoint for order notifications (verified by HMAC)
  app.post("/api/webhooks/shopify/orders", async (req: any, res) => {
    try {
      const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      
      // Verify HMAC signature using raw body (set by express.raw middleware in index.ts)
      const hmacValid = await verifyShopifyWebhookHMAC(req.rawBody, hmacHeader);
      
      console.log(`Shopify webhook from ${shopDomain}, topic: ${topic}, HMAC valid: ${hmacValid}`);
      
      // Log webhook event for debugging
      await db.insert(shopifyWebhookEvents).values({
        shop: shopDomain || 'unknown',
        topic: topic || 'orders/unknown',
        shopifyId: String(req.body?.id),
        payload: req.body,
        hmacValid,
        processed: false,
      });

      if (!hmacValid) {
        console.warn("Shopify webhook rejected: invalid HMAC signature");
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Respond quickly to Shopify
      res.status(200).json({ received: true });

      // Process the order asynchronously
      const order = req.body;
      console.log(`Shopify ${topic} webhook received:`, order.id, order.name);

      if (topic === 'orders/create' || topic === 'orders/paid') {
        // Extract customer info
        const customerEmail = order.email?.toLowerCase();
        const customerName = order.customer 
          ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
          : order.billing_address?.name || '';
        const companyName = order.customer?.company || order.billing_address?.company || '';
        const shopifyCustomerIdStr = order.customer?.id ? String(order.customer.id) : null;

        // Try to match using customer mappings first
        let matchedCustomerId = null;
        
        // Check customer mappings by Shopify customer ID
        if (shopifyCustomerIdStr) {
          const mapping = await db.select().from(shopifyCustomerMappings)
            .where(and(
              eq(shopifyCustomerMappings.shopifyCustomerId, shopifyCustomerIdStr),
              eq(shopifyCustomerMappings.isActive, true)
            ))
            .limit(1);
          if (mapping.length > 0) {
            matchedCustomerId = mapping[0].crmCustomerId;
          }
        }

        // Check customer mappings by email
        if (!matchedCustomerId && customerEmail) {
          const mapping = await db.select().from(shopifyCustomerMappings)
            .where(and(
              ilike(shopifyCustomerMappings.shopifyEmail, customerEmail),
              eq(shopifyCustomerMappings.isActive, true)
            ))
            .limit(1);
          if (mapping.length > 0) {
            matchedCustomerId = mapping[0].crmCustomerId;
          }
        }

        // Check customer mappings by company name
        if (!matchedCustomerId && companyName) {
          const mapping = await db.select().from(shopifyCustomerMappings)
            .where(and(
              ilike(shopifyCustomerMappings.shopifyCompanyName, companyName),
              eq(shopifyCustomerMappings.isActive, true)
            ))
            .limit(1);
          if (mapping.length > 0) {
            matchedCustomerId = mapping[0].crmCustomerId;
            
            // If matched by company mapping and customer is missing email, update it from Shopify
            if (customerEmail && matchedCustomerId) {
              const mappedCustomer = await db.select({ email: customers.email })
                .from(customers)
                .where(eq(customers.id, matchedCustomerId))
                .limit(1);
              if (mappedCustomer.length > 0 && !mappedCustomer[0].email) {
                console.log(`[Shopify] Filling missing email via mapping for ${companyName}: ${customerEmail}`);
                await db.update(customers)
                  .set({ 
                    email: customerEmail,
                    updatedAt: new Date()
                  })
                  .where(eq(customers.id, matchedCustomerId));
              }
            }
          }
        }

        // Fall back to direct CRM email match
        if (!matchedCustomerId && customerEmail) {
          const existingCustomer = await db.select().from(customers)
            .where(ilike(customers.email, customerEmail))
            .limit(1);
          if (existingCustomer.length > 0) {
            matchedCustomerId = existingCustomer[0].id;
          }
        }
        
        // Fall back to direct CRM company name match
        if (!matchedCustomerId && companyName) {
          const existingCustomer = await db.select().from(customers)
            .where(ilike(customers.company, companyName))
            .limit(1);
          if (existingCustomer.length > 0) {
            matchedCustomerId = existingCustomer[0].id;
            
            // If matched by company and customer is missing email, update it from Shopify
            if (customerEmail && !existingCustomer[0].email) {
              console.log(`[Shopify] Filling missing email for ${companyName}: ${customerEmail}`);
              await db.update(customers)
                .set({ 
                  email: customerEmail,
                  updatedAt: new Date()
                })
                .where(eq(customers.id, existingCustomer[0].id));
            }
          }
        }

        // If no customer match, check leads — convert to customer if order > $50
        if (!matchedCustomerId && customerEmail) {
          const orderTotal = parseFloat(order.total_price || '0');
          if (orderTotal > 50) {
            const matchingLeads = await db.select().from(leads)
              .where(and(
                ilike(leads.email, customerEmail),
                ne(leads.stage, 'converted'),
                ne(leads.stage, 'lost')
              ))
              .limit(1);

            if (matchingLeads.length > 0) {
              const convertedId = await convertLeadToCustomer(matchingLeads[0], orderTotal, customerEmail);
              if (convertedId) {
                matchedCustomerId = convertedId;
              }
            }
          }
        }

        // Store the order
        await db.insert(shopifyOrders).values({
          shopifyOrderId: String(order.id),
          shopifyCustomerId: order.customer?.id ? String(order.customer.id) : null,
          customerId: matchedCustomerId,
          orderNumber: order.name || order.order_number,
          email: customerEmail,
          customerName,
          companyName,
          totalPrice: order.total_price,
          currency: order.currency,
          financialStatus: order.financial_status,
          fulfillmentStatus: order.fulfillment_status,
          lineItems: order.line_items,
          shippingAddress: order.shipping_address,
          billingAddress: order.billing_address,
          tags: order.tags,
          note: order.note,
          shopifyCreatedAt: order.created_at ? new Date(order.created_at) : new Date(),
          processedForCoaching: false,
        }).onConflictDoUpdate({
          target: shopifyOrders.shopifyOrderId,
          set: {
            financialStatus: order.financial_status,
            fulfillmentStatus: order.fulfillment_status,
            updatedAt: new Date(),
          }
        });

        // If matched to CRM customer and order is paid, process for coaching
        if (matchedCustomerId && order.financial_status === 'paid') {
          await processOrderForCoaching(matchedCustomerId, order);
        }

        // Update settings last sync
        await db.update(shopifySettings).set({
          lastSyncAt: new Date(),
          ordersProcessed: sql`orders_processed + 1`,
        });
      }
    } catch (error) {
      console.error("Error processing Shopify webhook:", error);
    }
  });

  // Helper function to convert a lead to a customer when they place a qualifying order
  async function convertLeadToCustomer(lead: any, orderTotal: number, orderEmail: string): Promise<string | null> {
    try {
      const newCustomerId = crypto.randomUUID();
      const nameParts = (lead.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      await db.insert(customers).values({
        id: newCustomerId,
        firstName,
        lastName,
        company: lead.company || lead.name || '',
        email: lead.email || orderEmail,
        emailNormalized: lead.emailNormalized || orderEmail?.toLowerCase()?.trim(),
        phone: lead.phone || null,
        cell: lead.mobile || null,
        address1: lead.street || null,
        address2: lead.street2 || null,
        city: lead.city || null,
        province: lead.state || null,
        zip: lead.zip || null,
        country: lead.country || null,
        website: lead.website || null,
        note: lead.description || null,
        salesRepId: lead.salesRepId || null,
        salesRepName: lead.salesRepName || null,
        pricingTier: lead.pricingTier || null,
        pricingTierSetBy: lead.pricingTierSetBy || null,
        pricingTierSetAt: lead.pricingTierSetAt || null,
        customerType: lead.customerType || null,
        tags: lead.tags || null,
        isCompany: lead.isCompany || false,
        totalSpent: String(orderTotal),
        totalOrders: 1,
        sources: ['lead_conversion'],
        swatchbookSentAt: lead.swatchbookSentAt || null,
        priceListSentAt: lead.priceListSentAt || null,
        odooPartnerId: lead.sourceContactOdooPartnerId || null,
        createdAt: new Date(),
      });

      // Mark the lead as converted
      await db.update(leads).set({
        stage: 'converted',
        updatedAt: new Date(),
      }).where(eq(leads.id, lead.id));

      // Log the conversion as an activity event
      await db.insert(customerActivityEvents).values({
        customerId: newCustomerId,
        eventType: 'order_placed',
        title: `Lead converted to customer (order $${orderTotal.toFixed(2)})`,
        description: `Lead "${lead.name}" was automatically converted to a customer after placing a Shopify order over $50.`,
        sourceType: 'auto',
        sourceTable: 'leads',
        sourceId: String(lead.id),
        amount: String(orderTotal),
        eventDate: new Date(),
      });

      console.log(`[Lead Conversion] Lead #${lead.id} "${lead.name}" converted to customer ${newCustomerId} (order: $${orderTotal.toFixed(2)})`);
      return newCustomerId;
    } catch (error) {
      console.error(`[Lead Conversion] Failed to convert lead #${lead.id}:`, error);
      return null;
    }
  }

  // Helper function to process paid orders for coaching
  async function processOrderForCoaching(customerId: string, order: any) {
    try {
      // Keywords that indicate press kit / sample materials
      const PRESS_KIT_KEYWORDS = [
        'sample sheet', 'sample sheets',
        'swatch book', 'swatchbook', 'swatch-book',
        'test kit', 'test-kit', 'testkit',
        'press kit', 'press-kit', 'presskit',
        'sample kit', 'sample pack', 'sample package',
        'evaluation kit', 'trial kit'
      ];
      
      // Get product mappings
      const mappings = await db.select().from(shopifyProductMappings)
        .where(eq(shopifyProductMappings.isActive, true));

      // Extract categories from line items and detect press kits
      const categoriesFromOrder = new Set<string>();
      const pressKitItems: { title: string; quantity: number }[] = [];
      
      for (const item of order.line_items || []) {
        const title = item.title?.toLowerCase() || '';
        const productType = item.product_type?.toLowerCase() || '';
        
        // Check for press kit keywords
        for (const keyword of PRESS_KIT_KEYWORDS) {
          if (title.includes(keyword)) {
            pressKitItems.push({ title: item.title, quantity: item.quantity || 1 });
            break;
          }
        }
        
        for (const mapping of mappings) {
          if (mapping.shopifyProductTitle && title.includes(mapping.shopifyProductTitle.toLowerCase())) {
            categoriesFromOrder.add(mapping.categoryName);
          }
          if (mapping.shopifyProductType && productType.includes(mapping.shopifyProductType.toLowerCase())) {
            categoriesFromOrder.add(mapping.categoryName);
          }
        }
      }
      
      // Process press kit orders - create shipment records and coaching activity
      if (pressKitItems.length > 0) {
        console.log(`Press kit detected in order ${order.name}: ${pressKitItems.map(i => i.title).join(', ')}`);
        
        // Check if we already recorded this order as a press kit (avoid duplicates)
        // Check both by order number in notes and by checking activity events
        const existingPressKitActivity = await db.select().from(customerActivityEvents)
          .where(and(
            eq(customerActivityEvents.customerId, customerId),
            eq(customerActivityEvents.eventType, 'press_kit_shipped'),
            eq(customerActivityEvents.sourceId, String(order.id))
          ))
          .limit(1);
        
        if (existingPressKitActivity.length === 0) {
          // Create press kit shipment record
          await db.insert(pressKitShipments).values({
            customerId,
            pressKitVersion: pressKitItems.map(i => i.title).join(', '),
            status: 'shipped',
            shippedAt: new Date(order.created_at),
            notes: `Auto-created from Shopify order ${order.name}. Items: ${pressKitItems.map(i => `${i.title} (x${i.quantity})`).join(', ')}`,
          });
          
          // Create coaching activity for press kit follow-up
          await db.insert(customerActivityEvents).values({
            customerId,
            eventType: 'press_kit_shipped',
            title: `Press Kit Shipped - Order ${order.name}`,
            description: `Customer received sample materials via Shopify order. Items: ${pressKitItems.map(i => i.title).join(', ')}. ACTION NEEDED: Follow up in 3-5 days to check if materials arrived and gather feedback.`,
            sourceType: 'auto',
            sourceId: String(order.id),
            sourceTable: 'shopify_orders',
            metadata: {
              orderId: order.id,
              orderNumber: order.name,
              pressKitItems: pressKitItems,
              coachingActions: [
                'Check if materials arrived safely',
                'Ask which products they plan to test',
                'Schedule a follow-up call for test results',
                'Offer technical support if needed'
              ]
            },
          });
          
          console.log(`Created press kit shipment and coaching activity for customer ${customerId}`);
        }
      }

      // Advance category trust to 'adopted' for each category in the order
      for (const categoryName of categoriesFromOrder) {
        const existingTrust = await db.select().from(categoryTrust)
          .where(and(
            eq(categoryTrust.customerId, customerId),
            eq(categoryTrust.categoryName, categoryName)
          ))
          .limit(1);

        if (existingTrust.length > 0) {
          const trust = existingTrust[0];
          // Only advance if not already adopted or habitual
          if (trust.trustLevel !== 'adopted' && trust.trustLevel !== 'habitual') {
            await db.update(categoryTrust)
              .set({
                trustLevel: 'adopted',
                ordersPlaced: (trust.ordersPlaced || 0) + 1,
                lastOrderDate: new Date(),
                firstOrderDate: trust.firstOrderDate || new Date(),
                totalOrderValue: String(Number(trust.totalOrderValue || 0) + Number(order.total_price || 0)),
                updatedAt: new Date(),
              })
              .where(eq(categoryTrust.id, trust.id));
          } else {
            // Just update order stats
            await db.update(categoryTrust)
              .set({
                ordersPlaced: (trust.ordersPlaced || 0) + 1,
                lastOrderDate: new Date(),
                totalOrderValue: String(Number(trust.totalOrderValue || 0) + Number(order.total_price || 0)),
                updatedAt: new Date(),
              })
              .where(eq(categoryTrust.id, trust.id));
          }
        } else {
          // Create new trust record as adopted (they bought it!)
          await db.insert(categoryTrust).values({
            customerId,
            categoryName,
            trustLevel: 'adopted',
            ordersPlaced: 1,
            lastOrderDate: new Date(),
            firstOrderDate: new Date(),
            totalOrderValue: order.total_price,
          });
        }
      }

      // Log activity event
      await db.insert(customerActivityEvents).values({
        customerId,
        eventType: 'shopify_order',
        title: `Shopify Order ${order.name} - $${order.total_price}`,
        description: `Order placed with ${order.line_items?.length || 0} items. Categories: ${Array.from(categoriesFromOrder).join(', ') || 'None mapped'}`,
        sourceType: 'auto',
        sourceId: String(order.id),
        sourceTable: 'shopify_orders',
        amount: order.total_price,
        itemCount: order.line_items?.length || 0,
        metadata: {
          orderId: order.id,
          orderNumber: order.name,
          totalPrice: order.total_price,
          itemCount: order.line_items?.length || 0,
          categories: Array.from(categoriesFromOrder),
        },
      });

      // Mark order as processed
      await db.update(shopifyOrders)
        .set({
          processedForCoaching: true,
          coachingProcessedAt: new Date(),
        })
        .where(eq(shopifyOrders.shopifyOrderId, String(order.id)));

      console.log(`Processed order ${order.name} for customer ${customerId}, advanced ${categoriesFromOrder.size} categories`);
    } catch (error) {
      console.error("Error processing order for coaching:", error);
    }
  }

  // Shopify webhook endpoint for customer notifications (verified by HMAC)
  app.post("/api/webhooks/shopify/customers", async (req: any, res) => {
    try {
      const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      
      // Verify HMAC signature using raw body
      const hmacValid = await verifyShopifyWebhookHMAC(req.rawBody, hmacHeader);
      
      console.log(`Shopify customer webhook from ${shopDomain}, topic: ${topic}, HMAC valid: ${hmacValid}`);

      // Log the webhook event
      await db.insert(shopifyWebhookEvents).values({
        shop: shopDomain || 'unknown',
        topic: topic || 'customers/unknown',
        shopifyId: String(req.body?.id),
        payload: req.body,
        hmacValid,
        processed: false,
      });

      if (!hmacValid) {
        console.warn("Shopify customer webhook rejected: invalid HMAC signature");
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Respond quickly to Shopify
      res.status(200).json({ received: true });

      // Process the customer data asynchronously
      const customer = req.body;
      
      if (topic === 'customers/create' || topic === 'customers/update') {
        const customerEmail = customer.email?.toLowerCase();
        const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
        const companyName = customer.default_address?.company || '';

        // Try to match with existing CRM customer
        if (customerEmail) {
          const existingCustomer = await db.select().from(customers)
            .where(ilike(customers.email, customerEmail))
            .limit(1);
          
          if (existingCustomer.length > 0) {
            const crmCustomer = existingCustomer[0];
            
            // Sync tags from Shopify (merge with existing)
            let tagsUpdate: { tags?: string; pricingTier?: string } = {};
            if (customer.tags) {
              const existingTags = crmCustomer.tags ? crmCustomer.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
              const shopifyTags = customer.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
              const mergedTags = [...new Set([...existingTags, ...shopifyTags])];
              const newTagsString = mergedTags.join(', ');
              if (newTagsString !== crmCustomer.tags) {
                tagsUpdate.tags = newTagsString;
              }
              
              // Extract pricing tier from tags if customer doesn't have one (e.g., "Tier: SHOPIFY2" -> "SHOPIFY2")
              if (!crmCustomer.pricingTier) {
                for (const tag of shopifyTags) {
                  const tierMatch = tag.match(/tier:\s*(\S+)/i);
                  if (tierMatch) {
                    tagsUpdate.pricingTier = tierMatch[1].toUpperCase();
                    break;
                  }
                }
              }
            }
            
            // Update customer if tags or pricing tier changed
            if (Object.keys(tagsUpdate).length > 0) {
              await db.update(customers)
                .set({ ...tagsUpdate, updatedAt: new Date() })
                .where(eq(customers.id, crmCustomer.id));
            }
            
            // Log activity for customer sync
            await db.insert(customerActivityEvents).values({
              customerId: crmCustomer.id,
              eventType: 'shopify_customer_sync',
              eventCategory: 'sync',
              description: `Shopify customer ${topic === 'customers/create' ? 'created' : 'updated'}${Object.keys(tagsUpdate).length > 0 ? ' (tags synced)' : ''}`,
              metadata: {
                shopifyCustomerId: customer.id,
                email: customerEmail,
                ordersCount: customer.orders_count,
                totalSpent: customer.total_spent,
                tagsSynced: Object.keys(tagsUpdate).length > 0,
              },
            });
          }
        }

        // Update webhook event as processed
        await db.update(shopifyWebhookEvents)
          .set({ processed: true, processedAt: new Date() })
          .where(eq(shopifyWebhookEvents.shopifyId, String(customer.id)));
      }
      
      // Handle customer deletion - remove from Clients and Leads
      if (topic === 'customers/delete' || topic === 'customers/redact') {
        const customerEmail = customer.email?.toLowerCase();
        const shopifyCustomerId = String(customer.id);
        
        console.log(`[Shopify Webhook] Customer deletion: ID=${shopifyCustomerId}, email=${customerEmail}`);
        
        let deletedCustomers = 0;
        let deletedLeads = 0;
        
        // Delete from customers table by email
        if (customerEmail) {
          const deleteResult = await db.delete(customers)
            .where(ilike(customers.email, customerEmail))
            .returning({ id: customers.id });
          deletedCustomers = deleteResult.length;
          
          // Also delete from leads table
          const deleteLeadsResult = await db.delete(leads)
            .where(ilike(leads.email, customerEmail))
            .returning({ id: leads.id });
          deletedLeads = deleteLeadsResult.length;
        }
        
        // Also check Shopify customer ID mapping and add to exclusion list
        const mappings = await db.select().from(shopifyCustomerMappings)
          .where(eq(shopifyCustomerMappings.shopifyCustomerId, shopifyCustomerId));
        
        for (const mapping of mappings) {
          // Add to excluded list to prevent re-import
          await db.insert(excludedShopifyCustomerIds)
            .values({
              shopifyCustomerId: shopifyCustomerId,
              reason: 'customer_deleted_in_shopify',
              excludedAt: new Date(),
            })
            .onConflictDoNothing();
          
          // Delete mapping
          await db.delete(shopifyCustomerMappings)
            .where(eq(shopifyCustomerMappings.shopifyCustomerId, shopifyCustomerId));
        }
        
        console.log(`[Shopify Webhook] Deleted ${deletedCustomers} customers, ${deletedLeads} leads for Shopify customer ${shopifyCustomerId}`);
        
        // Update webhook event as processed
        await db.update(shopifyWebhookEvents)
          .set({ processed: true, processedAt: new Date() })
          .where(eq(shopifyWebhookEvents.shopifyId, shopifyCustomerId));
      }
    } catch (error) {
      console.error("Error processing Shopify customer webhook:", error);
    }
  });

  // Get webhook events (for debugging)
  app.get("/api/shopify/webhook-events", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const events = await db.select().from(shopifyWebhookEvents)
        .orderBy(desc(shopifyWebhookEvents.createdAt))
        .limit(100);
      
      res.json(events);
    } catch (error) {
      console.error("Error fetching webhook events:", error);
      res.status(500).json({ error: "Failed to fetch webhook events" });
    }
  });

  // Get Shopify settings
  app.get("/api/shopify/settings", isAuthenticated, async (req, res) => {
    try {
      const settings = await db.select().from(shopifySettings).limit(1);
      res.json(settings[0] || { isActive: false });
    } catch (error) {
      console.error("Error fetching Shopify settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update Shopify settings (admin only)
  app.post("/api/shopify/settings", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { shopDomain, webhookSecret, isActive } = req.body;

      const existing = await db.select().from(shopifySettings).limit(1);
      
      if (existing.length > 0) {
        const result = await db.update(shopifySettings)
          .set({
            shopDomain,
            webhookSecret,
            isActive,
            updatedAt: new Date(),
          })
          .where(eq(shopifySettings.id, existing[0].id))
          .returning();
        res.json(result[0]);
      } else {
        const result = await db.insert(shopifySettings).values({
          shopDomain,
          webhookSecret,
          isActive,
        }).returning();
        res.json(result[0]);
      }
    } catch (error) {
      console.error("Error updating Shopify settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get Shopify orders
  app.get("/api/shopify/orders", isAuthenticated, async (req, res) => {
    try {
      const { customerId, limit: queryLimit } = req.query;
      
      let query = db.select().from(shopifyOrders);
      
      if (customerId) {
        query = query.where(eq(shopifyOrders.customerId, customerId as string)) as any;
      }
      
      const orders = await query
        .orderBy(desc(shopifyOrders.shopifyCreatedAt))
        .limit(parseInt(queryLimit as string) || 100);
      
      // Auto-match unmatched orders by email (exact single match only)
      const unmatchedOrders = orders.filter(o => !o.customerId && o.customerEmail);
      const uniqueEmails = [...new Set(unmatchedOrders.map(o => o.customerEmail!.toLowerCase()))];
      
      if (uniqueEmails.length > 0) {
        const autoMatched: Record<string, string> = {};
        
        for (const email of uniqueEmails) {
          const matchingCustomers = await db.select({ id: customers.id })
            .from(customers)
            .where(ilike(customers.email, email))
            .limit(2);
          
          if (matchingCustomers.length === 1) {
            autoMatched[email] = matchingCustomers[0].id;
          } else if (matchingCustomers.length === 0) {
            // No customer match — check if a lead matches and has a qualifying order
            const ordersForEmail = unmatchedOrders.filter(o => o.customerEmail?.toLowerCase() === email);
            const maxOrderTotal = Math.max(...ordersForEmail.map(o => parseFloat(o.totalPrice || '0')));
            if (maxOrderTotal > 50) {
              const matchingLeads = await db.select().from(leads)
                .where(and(
                  ilike(leads.email, email),
                  ne(leads.stage, 'converted'),
                  ne(leads.stage, 'lost')
                ))
                .limit(1);

              if (matchingLeads.length > 0) {
                const convertedId = await convertLeadToCustomer(matchingLeads[0], maxOrderTotal, email);
                if (convertedId) {
                  autoMatched[email] = convertedId;
                }
              }
            }
          }
        }
        
        // Bulk update auto-matched orders and create mappings
        for (const [email, crmCustomerId] of Object.entries(autoMatched)) {
          await db.update(shopifyOrders)
            .set({ customerId: crmCustomerId, updatedAt: new Date() })
            .where(and(
              ilike(shopifyOrders.customerEmail, email),
              isNull(shopifyOrders.customerId)
            ));
          
          // Create mapping if not exists
          const existingMapping = await db.select().from(shopifyCustomerMappings)
            .where(or(
              ilike(shopifyCustomerMappings.shopifyEmail, email),
              eq(shopifyCustomerMappings.crmCustomerId, crmCustomerId)
            ))
            .limit(1);
          
          if (existingMapping.length === 0) {
            const crmCust = await db.select().from(customers).where(eq(customers.id, crmCustomerId)).limit(1);
            await db.insert(shopifyCustomerMappings).values({
              crmCustomerId,
              crmCustomerName: crmCust[0]?.company || `${crmCust[0]?.firstName || ''} ${crmCust[0]?.lastName || ''}`.trim() || null,
              shopifyEmail: email,
            });
          }
        }
        
        // Re-fetch if any were auto-matched
        if (Object.keys(autoMatched).length > 0) {
          let refetchQuery = db.select().from(shopifyOrders);
          if (customerId) {
            refetchQuery = refetchQuery.where(eq(shopifyOrders.customerId, customerId as string)) as any;
          }
          const refreshedOrders = await refetchQuery
            .orderBy(desc(shopifyOrders.shopifyCreatedAt))
            .limit(parseInt(queryLimit as string) || 100);
          
          const refreshedWithDomain = refreshedOrders.map(order => ({
            ...order,
            shopDomain: SHOPIFY_STORE_DOMAIN || null,
          }));
          return res.json(refreshedWithDomain);
        }
      }

      // Add store domain to each order for constructing Shopify admin links
      const ordersWithDomain = orders.map(order => ({
        ...order,
        shopDomain: SHOPIFY_STORE_DOMAIN || null,
      }));
      
      res.json(ordersWithDomain);
    } catch (error) {
      console.error("Error fetching Shopify orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Sync orders from Shopify (for direct token setup)
  app.post("/api/shopify/sync-orders", isAuthenticated, async (req: any, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ error: "Shopify direct access not configured. Please add SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_DOMAIN to your secrets." });
      }

      const axios = (await import('axios')).default;
      
      // Fetch recent orders from Shopify
      const response = await axios.get(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=50`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      const shopifyOrdersList = response.data.orders || [];
      let synced = 0;
      let updated = 0;

      for (const order of shopifyOrdersList) {
        // Check if order already exists
        const existing = await db.select().from(shopifyOrders)
          .where(eq(shopifyOrders.shopifyOrderId, String(order.id)))
          .limit(1);

        const customerEmail = order.email || order.customer?.email || null;
        const orderData: any = {
          shopifyOrderId: String(order.id),
          orderNumber: order.name,
          shopifyCustomerId: order.customer?.id ? String(order.customer.id) : null,
          customerEmail,
          customerName: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : order.shipping_address?.name,
          companyName: order.customer?.default_address?.company || order.billing_address?.company,
          totalPrice: order.total_price,
          financialStatus: order.financial_status,
          fulfillmentStatus: order.fulfillment_status,
          lineItems: order.line_items,
          shippingAddress: order.shipping_address || null,
          billingAddress: order.billing_address || null,
          shopifyCreatedAt: new Date(order.created_at),
          updatedAt: new Date(),
        };

        // Auto-match by email if exactly one CRM customer matches
        if (!orderData.customerId && customerEmail) {
          const emailMatches = await db.select({ id: customers.id })
            .from(customers)
            .where(ilike(customers.email, customerEmail))
            .limit(2);
          if (emailMatches.length === 1) {
            orderData.customerId = emailMatches[0].id;
          }
        }

        // If still no customer match, check leads — convert to customer if order > $50
        if (!orderData.customerId && customerEmail) {
          const orderTotal = parseFloat(order.total_price || '0');
          if (orderTotal > 50) {
            const matchingLeads = await db.select().from(leads)
              .where(and(
                ilike(leads.email, customerEmail),
                ne(leads.stage, 'converted'),
                ne(leads.stage, 'lost')
              ))
              .limit(1);

            if (matchingLeads.length > 0) {
              const convertedId = await convertLeadToCustomer(matchingLeads[0], orderTotal, customerEmail);
              if (convertedId) {
                orderData.customerId = convertedId;
              }
            }
          }
        }
        
        console.log(`Order ${order.name}: shipping_address=${!!order.shipping_address}, billing_address=${!!order.billing_address}`);

        if (existing.length > 0) {
          await db.update(shopifyOrders)
            .set(orderData)
            .where(eq(shopifyOrders.id, existing[0].id));
          updated++;
        } else {
          await db.insert(shopifyOrders).values(orderData);
          synced++;
        }
      }

      res.json({ 
        success: true, 
        message: `Synced ${synced} new orders, updated ${updated} existing orders`,
        total: shopifyOrdersList.length
      });
    } catch (error: any) {
      console.error("Error syncing Shopify orders:", error.response?.data || error);
      res.status(500).json({ error: "Failed to sync orders", details: error.response?.data?.errors || error.message });
    }
  });

  // Test Shopify connection (for direct token setup)
  app.get("/api/shopify/test-connection", isAuthenticated, async (req, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ 
          connected: false, 
          error: "Shopify credentials not configured" 
        });
      }

      const axios = (await import('axios')).default;
      
      // Test API access by fetching shop info
      const response = await axios.get(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      res.json({ 
        connected: true, 
        shop: response.data.shop.name,
        domain: response.data.shop.domain,
        email: response.data.shop.email,
      });
    } catch (error: any) {
      console.error("Error testing Shopify connection:", error.response?.data || error);
      res.status(500).json({ 
        connected: false, 
        error: error.response?.data?.errors || error.message 
      });
    }
  });

  // Sync customers from Shopify
  app.post("/api/shopify/sync-customers", isAuthenticated, async (req: any, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ error: "Shopify direct access not configured. Please add SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_DOMAIN to your secrets." });
      }

      const axios = (await import('axios')).default;
      
      // Fetch all customers from Shopify (paginated)
      let allShopifyCustomers: any[] = [];
      let pageInfo: string | null = null;
      let hasNextPage = true;
      
      while (hasNextPage) {
        const url = pageInfo 
          ? `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers.json?limit=250&page_info=${pageInfo}`
          : `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers.json?limit=250`;
        
        const response = await axios.get(url, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        });
        
        allShopifyCustomers = allShopifyCustomers.concat(response.data.customers || []);
        
        // Check for pagination
        const linkHeader = response.headers['link'];
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
          pageInfo = nextMatch ? nextMatch[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      }

      console.log(`Fetched ${allShopifyCustomers.length} customers from Shopify`);

      // Build a set of all active Shopify customer IDs for deletion/merge detection
      const activeShopifyCustomerIds = new Set<string>(
        allShopifyCustomers.map(c => String(c.id))
      );

      // Get all existing customers with their emails for matching
      const existingCustomers = await db.select().from(customers);
      const emailToCustomerMap = new Map<string, typeof existingCustomers[0]>();
      
      for (const customer of existingCustomers) {
        if (customer.email) {
          emailToCustomerMap.set(customer.email.toLowerCase(), customer);
        }
        if (customer.email2) {
          emailToCustomerMap.set(customer.email2.toLowerCase(), customer);
        }
      }

      // Get existing Shopify customer mappings for update/deactivation
      const existingMappings = await db.select().from(shopifyCustomerMappings);
      const shopifyIdToMappingMap = new Map(
        existingMappings.map(m => [m.shopifyCustomerId, m])
      );

      // Load excluded Shopify customer IDs (previously deleted customers that shouldn't be re-imported)
      const shopifyExclusions = await db.select({ shopifyCustomerId: deletedCustomerExclusions.shopifyCustomerId })
        .from(deletedCustomerExclusions)
        .where(sql`${deletedCustomerExclusions.shopifyCustomerId} IS NOT NULL`);
      const excludedShopifyIds = new Set(shopifyExclusions.map(e => e.shopifyCustomerId).filter((id): id is string => id !== null));
      console.log(`[Shopify Sync] Found ${excludedShopifyIds.size} excluded Shopify customer IDs (previously deleted)`);

      let matched = 0;
      let imported = 0;
      let skipped = 0;
      let skippedBlocked = 0;
      let skippedExcluded = 0;
      let primaryEmailsSet = 0;
      let mappingsCreated = 0;
      let mappingsUpdated = 0;
      let mappingsDeactivated = 0;
      let customersDeleted = 0;
      const matchedCustomers: string[] = [];
      const importedCustomers: string[] = [];
      const skippedBlockedNames: string[] = [];
      const skippedExcludedNames: string[] = [];

      for (const shopifyCustomer of allShopifyCustomers) {
        const shopifyEmail = shopifyCustomer.email?.toLowerCase();
        
        if (!shopifyEmail) {
          // Skip customers without email
          skipped++;
          continue;
        }

        const existingCustomer = emailToCustomerMap.get(shopifyEmail);
        
        if (existingCustomer) {
          // Customer exists - add 'shopify' to sources if not already there
          const currentSources = existingCustomer.sources || [];
          const defaultAddress = shopifyCustomer.default_address || shopifyCustomer.addresses?.[0] || {};
          
          // Build update object with missing address fields from Shopify
          const addressUpdates: Record<string, any> = {};
          if (!existingCustomer.address1 && defaultAddress.address1) {
            addressUpdates.address1 = defaultAddress.address1;
          }
          if (!existingCustomer.address2 && defaultAddress.address2) {
            addressUpdates.address2 = defaultAddress.address2;
          }
          if (!existingCustomer.city && defaultAddress.city) {
            addressUpdates.city = defaultAddress.city;
          }
          if (!existingCustomer.province && (defaultAddress.province || defaultAddress.province_code)) {
            addressUpdates.province = defaultAddress.province || defaultAddress.province_code;
          }
          if (!existingCustomer.country && (defaultAddress.country || defaultAddress.country_code)) {
            addressUpdates.country = defaultAddress.country || defaultAddress.country_code;
          }
          if (!existingCustomer.zip && defaultAddress.zip) {
            addressUpdates.zip = defaultAddress.zip;
          }
          if (!existingCustomer.phone && (shopifyCustomer.phone || defaultAddress.phone)) {
            addressUpdates.phone = shopifyCustomer.phone || defaultAddress.phone;
          }
          
          // Merge Shopify tags with existing tags (preserve existing, add new from Shopify)
          let tagsUpdate: { tags?: string; pricingTier?: string } = {};
          if (shopifyCustomer.tags) {
            const existingTags = existingCustomer.tags ? existingCustomer.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
            const shopifyTags = shopifyCustomer.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
            const mergedTags = [...new Set([...existingTags, ...shopifyTags])];
            const newTagsString = mergedTags.join(', ');
            if (newTagsString !== existingCustomer.tags) {
              tagsUpdate.tags = newTagsString;
            }
            
            // Extract pricing tier from tags if customer doesn't have one (e.g., "Tier: SHOPIFY2" -> "SHOPIFY2")
            if (!existingCustomer.pricingTier) {
              for (const tag of shopifyTags) {
                const tierMatch = tag.match(/tier:\s*(\S+)/i);
                if (tierMatch) {
                  tagsUpdate.pricingTier = tierMatch[1].toUpperCase();
                  break;
                }
              }
            }
          }
          
          const hasAddressUpdates = Object.keys(addressUpdates).length > 0;
          const hasTagsUpdate = Object.keys(tagsUpdate).length > 0;
          
          if (!currentSources.includes('shopify') || hasAddressUpdates || hasTagsUpdate) {
            const updatedSources = currentSources.includes('shopify') ? currentSources : [...currentSources, 'shopify'];
            
            // Also check if we need to set primary email
            let emailUpdate: { email?: string } = {};
            if (!existingCustomer.email && shopifyEmail) {
              emailUpdate.email = shopifyCustomer.email;
              primaryEmailsSet++;
            }
            
            await db.update(customers)
              .set({ 
                sources: updatedSources,
                ...emailUpdate,
                ...addressUpdates,
                ...tagsUpdate,
                updatedAt: new Date()
              })
              .where(eq(customers.id, existingCustomer.id));
            
            if (!currentSources.includes('shopify')) {
              matched++;
              matchedCustomers.push(existingCustomer.company || `${existingCustomer.firstName} ${existingCustomer.lastName}`.trim() || existingCustomer.email || 'Unknown');
            } else if (hasAddressUpdates || hasTagsUpdate) {
              matched++;
              const updateType = hasTagsUpdate && hasAddressUpdates ? 'address & tags updated' : hasTagsUpdate ? 'tags updated' : 'address updated';
              matchedCustomers.push(`${existingCustomer.company || existingCustomer.firstName || 'Unknown'} (${updateType})`);
            }
          } else {
            // Already has shopify source and no address updates needed
            if (!existingCustomer.email && shopifyEmail) {
              await db.update(customers)
                .set({ 
                  email: shopifyCustomer.email,
                  updatedAt: new Date()
                })
                .where(eq(customers.id, existingCustomer.id));
              primaryEmailsSet++;
            }
            skipped++; // Already synced
          }
          
          // Create or update Shopify customer mapping
          const shopifyCustomerId = String(shopifyCustomer.id);
          const existingMapping = shopifyIdToMappingMap.get(shopifyCustomerId);
          const customerDisplayName = existingCustomer.company || `${existingCustomer.firstName} ${existingCustomer.lastName}`.trim();
          
          if (existingMapping) {
            // Update existing mapping if needed
            if (!existingMapping.isActive || existingMapping.crmCustomerId !== existingCustomer.id) {
              await db.update(shopifyCustomerMappings)
                .set({
                  crmCustomerId: existingCustomer.id,
                  crmCustomerName: customerDisplayName,
                  shopifyEmail: shopifyCustomer.email,
                  shopifyCompanyName: shopifyCustomer.default_address?.company || null,
                  isActive: true,
                  updatedAt: new Date(),
                })
                .where(eq(shopifyCustomerMappings.id, existingMapping.id));
              mappingsUpdated++;
            }
          } else {
            // Create new mapping
            await db.insert(shopifyCustomerMappings).values({
              shopifyCustomerId,
              shopifyEmail: shopifyCustomer.email,
              shopifyCompanyName: shopifyCustomer.default_address?.company || null,
              crmCustomerId: existingCustomer.id,
              crmCustomerName: customerDisplayName,
              isActive: true,
            });
            mappingsCreated++;
          }

          // Clean up any stale shopify_XXXX record for this Shopify customer.
          // This happens when: Shopify sync ran first (creating shopify_XXXX), then Odoo
          // imported the same person — leaving two records with the same email.
          const staleShopifyId = `shopify_${shopifyCustomer.id}`;
          if (staleShopifyId !== existingCustomer.id) {
            const staleRecord = await db.select({ id: customers.id })
              .from(customers)
              .where(eq(customers.id, staleShopifyId))
              .limit(1);

            if (staleRecord.length > 0) {
              try {
                // Re-point any Shopify orders that were linked to the stale record
                await db.update(shopifyOrders)
                  .set({ customerId: existingCustomer.id })
                  .where(eq(shopifyOrders.customerId, staleShopifyId));

                // Delete the stale shopify_XXXX customer record
                await db.delete(customers).where(eq(customers.id, staleShopifyId));

                console.log(`[Shopify Sync] Cleaned up stale record ${staleShopifyId} → merged into ${existingCustomer.id}`);
              } catch (cleanupErr) {
                console.warn(`[Shopify Sync] Could not clean up stale record ${staleShopifyId}:`, cleanupErr);
              }
            }
          }
        } else {
          // Customer doesn't exist by email - check if exists by Shopify ID
          const newId = `shopify_${shopifyCustomer.id}`;
          
          // Get default address
          const defaultAddress = shopifyCustomer.default_address || shopifyCustomer.addresses?.[0] || {};
          
          // Determine if this is a company (has company name in address)
          const hasCompany = defaultAddress.company && defaultAddress.company.trim().length > 0;
          const personName = `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim();
          
          // Skip blocked companies (cargo, freight, logistics, etc.)
          const companyToCheck = defaultAddress.company || personName;
          const blockedKeyword = getBlockedKeywordMatch(companyToCheck);
          if (blockedKeyword) {
            skippedBlocked++;
            if (skippedBlockedNames.length < 20) {
              skippedBlockedNames.push(`${companyToCheck} (${blockedKeyword})`);
            }
            console.log(`[Shopify Sync] Skipped blocked company: ${companyToCheck} (matched: ${blockedKeyword})`);
            continue;
          }
          
          // Skip previously deleted customers (on exclusion list)
          const shopifyIdStr = String(shopifyCustomer.id);
          if (excludedShopifyIds.has(shopifyIdStr)) {
            skippedExcluded++;
            if (skippedExcludedNames.length < 20) {
              skippedExcludedNames.push(companyToCheck || shopifyEmail);
            }
            console.log(`[Shopify Sync] Skipped excluded customer: ${companyToCheck || shopifyEmail} (previously deleted)`);
            continue;
          }
          
          // Check if customer already exists by Shopify ID
          const existingByShopifyId = await db.select({ id: customers.id })
            .from(customers)
            .where(eq(customers.id, newId))
            .limit(1);
          
          // Extract pricing tier from Shopify tags (e.g., "Tier: SHOPIFY2" -> "SHOPIFY2")
          let extractedPricingTier: string | null = null;
          if (shopifyCustomer.tags) {
            const tagsList = shopifyCustomer.tags.split(',').map((t: string) => t.trim());
            for (const tag of tagsList) {
              const tierMatch = tag.match(/tier:\s*(\S+)/i);
              if (tierMatch) {
                extractedPricingTier = tierMatch[1].toUpperCase();
                break;
              }
            }
          }
          
          const customerData = {
            firstName: shopifyCustomer.first_name || null,
            lastName: shopifyCustomer.last_name || null,
            email: shopifyCustomer.email || null,
            company: defaultAddress.company || null,
            phone: shopifyCustomer.phone || defaultAddress.phone || null,
            address1: defaultAddress.address1 || null,
            address2: defaultAddress.address2 || null,
            city: defaultAddress.city || null,
            province: defaultAddress.province || defaultAddress.province_code || null,
            country: defaultAddress.country || defaultAddress.country_code || null,
            zip: defaultAddress.zip || null,
            acceptsEmailMarketing: shopifyCustomer.accepts_marketing === true,
            acceptsSmsMarketing: !!shopifyCustomer.accepts_marketing_updated_at,
            totalSpent: shopifyCustomer.total_spent || "0",
            totalOrders: shopifyCustomer.orders_count || 0,
            note: shopifyCustomer.note || null,
            tags: shopifyCustomer.tags || null,
            pricingTier: extractedPricingTier,
            taxExempt: shopifyCustomer.tax_exempt === true,
            isCompany: hasCompany === true,
            contactType: hasCompany ? 'company' : 'contact',
            updatedAt: new Date(),
          };

          const shopifyCustomerId = String(shopifyCustomer.id);
          const existingMapping = shopifyIdToMappingMap.get(shopifyCustomerId);
          const customerDisplayName = defaultAddress.company || personName;

          if (existingByShopifyId.length > 0) {
            // Update existing Shopify customer
            await db.update(customers)
              .set(customerData)
              .where(eq(customers.id, newId));
            matched++;
            matchedCustomers.push(defaultAddress.company || personName || shopifyCustomer.email || 'Unknown');
          } else {
            // Insert new customer
            await db.insert(customers).values({
              id: newId,
              ...customerData,
              sources: ['shopify'],
              createdAt: new Date(),
            });
          
            // Create a contact for the person if this is a company
            if (hasCompany && personName) {
              try {
                await db.insert(customerContacts).values({
                  customerId: newId,
                  name: personName,
                  email: shopifyCustomer.email || null,
                  phone: shopifyCustomer.phone || defaultAddress.phone || null,
                  role: 'Primary Contact',
                  isPrimary: true,
                });
              } catch (contactError) {
                console.error(`Failed to create contact for ${newId}:`, contactError);
              }
            }
          
            imported++;
            importedCustomers.push(defaultAddress.company || personName || shopifyCustomer.email || 'Unknown');
          }
          
          // Create or update Shopify customer mapping for imported customers
          if (existingMapping) {
            if (!existingMapping.isActive || existingMapping.crmCustomerId !== newId) {
              await db.update(shopifyCustomerMappings)
                .set({
                  crmCustomerId: newId,
                  crmCustomerName: customerDisplayName,
                  shopifyEmail: shopifyCustomer.email,
                  shopifyCompanyName: defaultAddress.company || null,
                  isActive: true,
                  updatedAt: new Date(),
                })
                .where(eq(shopifyCustomerMappings.id, existingMapping.id));
              mappingsUpdated++;
            }
          } else {
            await db.insert(shopifyCustomerMappings).values({
              shopifyCustomerId,
              shopifyEmail: shopifyCustomer.email,
              shopifyCompanyName: defaultAddress.company || null,
              crmCustomerId: newId,
              crmCustomerName: customerDisplayName,
              isActive: true,
            });
            mappingsCreated++;
          }
        }
      }

      // Deactivate mappings for deleted or merged Shopify customers
      // Any Shopify customer ID in our mappings that's NOT in the active list was deleted/merged
      for (const mapping of existingMappings) {
        if (mapping.shopifyCustomerId && mapping.isActive && !activeShopifyCustomerIds.has(mapping.shopifyCustomerId)) {
          await db.update(shopifyCustomerMappings)
            .set({
              isActive: false,
              updatedAt: new Date(),
            })
            .where(eq(shopifyCustomerMappings.id, mapping.id));
          mappingsDeactivated++;
          console.log(`[Shopify Sync] Deactivated mapping for deleted/merged Shopify customer ${mapping.shopifyCustomerId} (CRM: ${mapping.crmCustomerName})`);

          // Also delete the CRM customer if they have no Odoo link (Shopify-only customer)
          if (mapping.crmCustomerId) {
            try {
              const [crmCustomer] = await db.select({ odooPartnerId: customers.odooPartnerId })
                .from(customers)
                .where(eq(customers.id, mapping.crmCustomerId))
                .limit(1);
              if (crmCustomer && !crmCustomer.odooPartnerId) {
                await db.delete(customers).where(eq(customers.id, mapping.crmCustomerId));
                customersDeleted++;
                console.log(`[Shopify Sync] Deleted CRM customer ${mapping.crmCustomerName} (${mapping.crmCustomerId}) — no longer in Shopify`);
              } else if (crmCustomer?.odooPartnerId) {
                console.log(`[Shopify Sync] Kept CRM customer ${mapping.crmCustomerName} — still linked to Odoo partner ${crmCustomer.odooPartnerId}`);
              }
            } catch (delErr: any) {
              console.error(`[Shopify Sync] Failed to delete CRM customer ${mapping.crmCustomerId}:`, delErr.message);
            }
          }
        }
      }

      res.json({
        success: true,
        total: allShopifyCustomers.length,
        matched,
        imported,
        skipped,
        skippedBlocked,
        skippedExcluded,
        primaryEmailsSet,
        mappingsCreated,
        mappingsUpdated,
        mappingsDeactivated,
        customersDeleted,
        matchedCustomers: matchedCustomers.slice(0, 20), // Limit to first 20 for display
        importedCustomers: importedCustomers.slice(0, 20),
        skippedBlockedNames: skippedBlockedNames.slice(0, 20),
        skippedExcludedNames: skippedExcludedNames.slice(0, 20),
      });
    } catch (error: any) {
      console.error("Error syncing Shopify customers:", error.response?.data || error);
      res.status(500).json({ error: "Failed to sync customers", details: error.response?.data?.errors || error.message });
    }
  });

  // Backfill missing customer emails from existing Shopify orders
  app.post("/api/shopify/backfill-emails", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Find customers with no primary email
      const customersWithoutEmail = await db.select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
      })
        .from(customers)
        .where(or(isNull(customers.email), eq(customers.email, '')));

      console.log(`[Shopify Email Backfill] Found ${customersWithoutEmail.length} customers without email`);

      // Get all Shopify orders with emails for matching
      const ordersWithEmails = await db.select({
        email: shopifyOrders.email,
        companyName: shopifyOrders.companyName,
        customerName: shopifyOrders.customerName,
        customerId: shopifyOrders.customerId,
      })
        .from(shopifyOrders)
        .where(and(
          not(isNull(shopifyOrders.email)),
          not(eq(shopifyOrders.email, ''))
        ));

      console.log(`[Shopify Email Backfill] Found ${ordersWithEmails.length} Shopify orders with emails`);

      let emailsAdded = 0;
      const updatedCustomers: string[] = [];

      for (const customer of customersWithoutEmail) {
        const displayName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
        const customerFullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim().toLowerCase();
        const companyName = customer.company?.toLowerCase() || '';

        // Try to find matching Shopify order
        let matchedEmail: string | null = null;

        // First try: match by linked customerId
        const directMatch = ordersWithEmails.find(o => o.customerId === customer.id);
        if (directMatch) {
          matchedEmail = directMatch.email;
        }

        // Second try: match by company name (exact, case-insensitive)
        if (!matchedEmail && companyName) {
          const companyMatch = ordersWithEmails.find(o => 
            o.companyName?.toLowerCase() === companyName
          );
          if (companyMatch) {
            matchedEmail = companyMatch.email;
          }
        }

        // Third try: match by customer name (exact, case-insensitive)
        if (!matchedEmail && customerFullName) {
          const nameMatch = ordersWithEmails.find(o => 
            o.customerName?.toLowerCase() === customerFullName
          );
          if (nameMatch) {
            matchedEmail = nameMatch.email;
          }
        }

        if (matchedEmail) {
          await db.update(customers)
            .set({ 
              email: matchedEmail,
              updatedAt: new Date()
            })
            .where(eq(customers.id, customer.id));
          
          emailsAdded++;
          updatedCustomers.push(`${displayName}: ${matchedEmail}`);
          console.log(`[Shopify Email Backfill] Added email ${matchedEmail} to ${displayName}`);
        }
      }

      res.json({
        success: true,
        customersChecked: customersWithoutEmail.length,
        emailsAdded,
        updatedCustomers: updatedCustomers.slice(0, 50), // Limit for display
      });
    } catch (error: any) {
      console.error("Error backfilling emails:", error);
      res.status(500).json({ error: "Failed to backfill emails", details: error.message });
    }
  });

  // Sync Shopify orders to Odoo as confirmed sales orders
  app.post("/api/shopify/sync-invoices-to-odoo", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { startDate, endDate } = req.body;
      
      console.log("[Shopify->Odoo] Starting invoice sync...", { startDate, endDate });

      // Build date filter conditions
      const conditions = [
        eq(shopifyOrders.financialStatus, 'paid'),
        or(
          isNull(shopifyOrders.odooSyncedAt),
          eq(shopifyOrders.odooSynced, false)
        )
      ];

      // Add date range filters if provided
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        conditions.push(gte(shopifyOrders.shopifyCreatedAt, start));
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(shopifyOrders.shopifyCreatedAt, end));
      }

      // Get Shopify orders that are paid, not synced yet, and within date range
      const ordersToSync = await db.select().from(shopifyOrders)
        .where(and(...conditions))
        .orderBy(shopifyOrders.shopifyCreatedAt);

      console.log(`[Shopify->Odoo] Found ${ordersToSync.length} orders to sync`);

      const results: Array<{
        orderId: string;
        orderName: string;
        status: 'success' | 'failed' | 'skipped';
        odooOrderId?: number;
        odooOrderName?: string;
        error?: string;
      }> = [];

      let synced = 0;
      let failed = 0;
      let skipped = 0;

      for (const order of ordersToSync) {
        try {
          // 1. Find the customer in Odoo by email
          const customerEmail = order.email;
          if (!customerEmail) {
            results.push({
              orderId: order.shopifyOrderId,
              orderName: order.orderNumber || `#${order.shopifyOrderId}`,
              status: 'skipped',
              error: 'No customer email'
            });
            skipped++;
            continue;
          }

          // Search for partner in Odoo
          const partners = await odooClient.searchRead('res.partner', [
            ['email', 'ilike', customerEmail]
          ], ['id', 'name', 'email'], { limit: 1 });

          if (partners.length === 0) {
            results.push({
              orderId: order.shopifyOrderId,
              orderName: order.orderNumber || `#${order.shopifyOrderId}`,
              status: 'skipped',
              error: `Customer not found in Odoo: ${customerEmail}`
            });
            skipped++;
            continue;
          }

          const partnerId = partners[0].id;

          // 2. Build order lines from Shopify line items
          const lineItems = order.lineItems as Array<{
            sku?: string;
            title?: string;
            quantity: number;
            price: string;
            variant_id?: number;
          }>;

          if (!lineItems || lineItems.length === 0) {
            results.push({
              orderId: order.shopifyOrderId,
              orderName: order.orderNumber || `#${order.shopifyOrderId}`,
              status: 'skipped',
              error: 'No line items'
            });
            skipped++;
            continue;
          }

          const orderLines: Array<[number, number, { product_id: number; product_uom_qty: number; price_unit: number }]> = [];
          let allProductsFound = true;
          let missingProducts: string[] = [];

          for (const item of lineItems) {
            // Find product in Odoo by SKU/default_code
            const sku = item.sku;
            if (!sku) {
              allProductsFound = false;
              missingProducts.push(item.title || 'Unknown product');
              continue;
            }

            const products = await odooClient.searchRead('product.product', [
              ['default_code', '=', sku]
            ], ['id', 'name', 'default_code'], { limit: 1 });

            if (products.length === 0) {
              allProductsFound = false;
              missingProducts.push(`${item.title || 'Unknown'} (SKU: ${sku})`);
              continue;
            }

            orderLines.push([0, 0, {
              product_id: products[0].id,
              product_uom_qty: item.quantity,
              price_unit: parseFloat(item.price)
            }]);
          }

          if (!allProductsFound || orderLines.length === 0) {
            results.push({
              orderId: order.shopifyOrderId,
              orderName: order.orderNumber || `#${order.shopifyOrderId}`,
              status: 'failed',
              error: `Products not found in Odoo: ${missingProducts.join(', ')}`
            });
            failed++;
            continue;
          }

          // 3. Create sale order in Odoo
          const saleOrderId = await odooClient.create('sale.order', {
            partner_id: partnerId,
            order_line: orderLines,
            client_order_ref: order.orderNumber || `Shopify-${order.shopifyOrderId}`,
            note: `Synced from Shopify order ${order.orderNumber} on ${new Date().toISOString()}`,
          });

          // 4. Confirm the sale order (this deducts inventory)
          await odooClient.execute('sale.order', 'action_confirm', [saleOrderId]);

          // Get the order name from Odoo
          const createdOrder = await odooClient.searchRead('sale.order', [
            ['id', '=', saleOrderId]
          ], ['name'], { limit: 1 });

          const odooOrderName = createdOrder.length > 0 ? createdOrder[0].name : `SO${saleOrderId}`;

          // 5. Mark as synced in our database
          await db.update(shopifyOrders)
            .set({
              odooSynced: true,
              odooSyncedAt: new Date(),
              odooOrderId: saleOrderId,
              updatedAt: new Date()
            })
            .where(eq(shopifyOrders.id, order.id));

          results.push({
            orderId: order.shopifyOrderId,
            orderName: order.orderNumber || `#${order.shopifyOrderId}`,
            status: 'success',
            odooOrderId: saleOrderId,
            odooOrderName
          });
          synced++;

          console.log(`[Shopify->Odoo] Synced order ${order.orderNumber} -> ${odooOrderName}`);

        } catch (orderError: any) {
          console.error(`[Shopify->Odoo] Error syncing order ${order.orderNumber}:`, orderError);
          results.push({
            orderId: order.shopifyOrderId,
            orderName: order.orderNumber || `#${order.shopifyOrderId}`,
            status: 'failed',
            error: orderError.message || 'Unknown error'
          });
          failed++;
        }
      }

      console.log(`[Shopify->Odoo] Sync complete: ${synced} synced, ${failed} failed, ${skipped} skipped`);

      res.json({
        success: true,
        total: ordersToSync.length,
        synced,
        failed,
        skipped,
        results
      });

    } catch (error: any) {
      console.error("[Shopify->Odoo] Error syncing invoices:", error);
      res.status(500).json({ error: "Failed to sync invoices to Odoo", details: error.message });
    }
  });

  // Sync draft orders from Shopify
  app.post("/api/shopify/sync-draft-orders", isAuthenticated, async (req: any, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ error: "Shopify direct access not configured. Please add SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_DOMAIN to your secrets." });
      }

      const axios = (await import('axios')).default;
      
      // Fetch all draft orders from Shopify (paginated)
      let allDraftOrders: any[] = [];
      let pageInfo: string | null = null;
      let hasNextPage = true;
      
      while (hasNextPage) {
        const url = pageInfo 
          ? `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/draft_orders.json?limit=250&page_info=${pageInfo}`
          : `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/draft_orders.json?limit=250`;
        
        const response = await axios.get(url, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        });
        
        allDraftOrders = allDraftOrders.concat(response.data.draft_orders || []);
        
        // Check for pagination
        const linkHeader = response.headers['link'];
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
          pageInfo = nextMatch ? nextMatch[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      }

      console.log(`Fetched ${allDraftOrders.length} draft orders from Shopify`);

      // Get existing customers for matching
      const existingCustomers = await db.select().from(customers);
      const emailToCustomerMap = new Map<string, typeof existingCustomers[0]>();
      
      for (const customer of existingCustomers) {
        if (customer.email) {
          emailToCustomerMap.set(customer.email.toLowerCase(), customer);
        }
      }

      let synced = 0;
      let updated = 0;
      let skipped = 0;
      const syncedDraftOrders: string[] = [];

      for (const draftOrder of allDraftOrders) {
        const shopifyDraftOrderId = String(draftOrder.id);
        const customerEmail = draftOrder.email?.toLowerCase();
        
        // Try to match to a CRM customer
        let matchedCustomerId: string | null = null;
        if (customerEmail) {
          const matchedCustomer = emailToCustomerMap.get(customerEmail);
          if (matchedCustomer) {
            matchedCustomerId = matchedCustomer.id;
          }
        }

        // Check if draft order already exists
        const existing = await db.select().from(shopifyDraftOrders)
          .where(eq(shopifyDraftOrders.shopifyDraftOrderId, shopifyDraftOrderId))
          .limit(1);

        // Calculate line items count
        const lineItemsCount = draftOrder.line_items?.length || 0;

        // Determine status based on Shopify's status
        let status = 'open';
        if (draftOrder.status === 'completed') {
          status = 'completed';
        } else if (draftOrder.status === 'invoice_sent') {
          status = 'invoice_sent';
        }

        const draftOrderData = {
          shopifyDraftOrderId,
          shopifyDraftOrderNumber: draftOrder.name || `#D${draftOrder.id}`,
          customerId: matchedCustomerId,
          customerEmail: draftOrder.email || null,
          invoiceUrl: draftOrder.invoice_url || null,
          status,
          totalPrice: draftOrder.total_price || null,
          lineItemsCount,
          shopifyOrderId: draftOrder.order_id ? String(draftOrder.order_id) : null,
          completedAt: draftOrder.completed_at ? new Date(draftOrder.completed_at) : null,
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          // Update existing
          await db.update(shopifyDraftOrders)
            .set(draftOrderData)
            .where(eq(shopifyDraftOrders.id, existing[0].id));
          updated++;
        } else {
          // Insert new
          await db.insert(shopifyDraftOrders).values({
            ...draftOrderData,
            createdAt: draftOrder.created_at ? new Date(draftOrder.created_at) : new Date(),
          });
          synced++;
          syncedDraftOrders.push(draftOrder.name || `#D${draftOrder.id}`);
        }
      }

      res.json({
        success: true,
        total: allDraftOrders.length,
        synced,
        updated,
        syncedDraftOrders: syncedDraftOrders.slice(0, 20),
      });
    } catch (error: any) {
      console.error("Error syncing Shopify draft orders:", error.response?.data || error);
      res.status(500).json({ error: "Failed to sync draft orders", details: error.response?.data?.errors || error.message });
    }
  });

  // Get Shopify draft orders for a customer (excludes completed orders)
  app.get("/api/shopify/draft-orders/:customerId", isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      
      // Only return non-completed draft orders (open, invoice_sent, or abandoned)
      const draftOrders = await db.select().from(shopifyDraftOrders)
        .where(
          and(
            eq(shopifyDraftOrders.customerId, customerId),
            or(
              isNull(shopifyDraftOrders.status),
              ne(shopifyDraftOrders.status, 'completed')
            )
          )
        )
        .orderBy(desc(shopifyDraftOrders.createdAt));
      
      res.json(draftOrders);
    } catch (error) {
      console.error("Error fetching draft orders:", error);
      res.status(500).json({ error: "Failed to fetch draft orders" });
    }
  });

  // Get Shopify customers (for preview before sync)
  app.get("/api/shopify/customers", isAuthenticated, async (req, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ error: "Shopify credentials not configured" });
      }

      const axios = (await import('axios')).default;
      
      const response = await axios.get(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers.json?limit=50`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      res.json({
        customers: response.data.customers || [],
        total: response.data.customers?.length || 0,
      });
    } catch (error: any) {
      console.error("Error fetching Shopify customers:", error.response?.data || error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Get product mappings
  app.get("/api/shopify/product-mappings", isAuthenticated, async (req, res) => {
    try {
      const mappings = await db.select().from(shopifyProductMappings)
        .orderBy(shopifyProductMappings.categoryName);
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching product mappings:", error);
      res.status(500).json({ error: "Failed to fetch mappings" });
    }
  });

  // Create product mapping
  app.post("/api/shopify/product-mappings", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { shopifyProductTitle, shopifyProductTag, shopifyProductType, categoryName } = req.body;
      
      if (!categoryName) {
        return res.status(400).json({ error: "categoryName is required" });
      }

      const result = await db.insert(shopifyProductMappings).values({
        shopifyProductTitle,
        shopifyProductTag,
        shopifyProductType,
        categoryName,
      }).returning();

      res.json(result[0]);
    } catch (error) {
      console.error("Error creating product mapping:", error);
      res.status(500).json({ error: "Failed to create mapping" });
    }
  });

  // Delete product mapping
  app.delete("/api/shopify/product-mappings/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      await db.delete(shopifyProductMappings)
        .where(eq(shopifyProductMappings.id, parseInt(req.params.id)));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product mapping:", error);
      res.status(500).json({ error: "Failed to delete mapping" });
    }
  });

  // Get customer mappings
  app.get("/api/shopify/customer-mappings", isAuthenticated, async (req, res) => {
    try {
      const mappings = await db.select().from(shopifyCustomerMappings)
        .where(eq(shopifyCustomerMappings.isActive, true))
        .orderBy(shopifyCustomerMappings.crmCustomerName);
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching customer mappings:", error);
      res.status(500).json({ error: "Failed to fetch customer mappings" });
    }
  });

  // Create customer mapping (for auto-matching future orders)
  app.post("/api/shopify/customer-mappings", isAuthenticated, async (req, res) => {
    try {
      const { shopifyEmail, shopifyCompanyName, shopifyCustomerId, crmCustomerId, crmCustomerName } = req.body;
      
      if (!crmCustomerId) {
        return res.status(400).json({ error: "crmCustomerId is required" });
      }

      if (!shopifyEmail && !shopifyCompanyName && !shopifyCustomerId) {
        return res.status(400).json({ error: "At least one Shopify identifier (email, company, or customer ID) is required" });
      }

      const result = await db.insert(shopifyCustomerMappings).values({
        shopifyEmail: shopifyEmail?.toLowerCase() || null,
        shopifyCompanyName: shopifyCompanyName || null,
        shopifyCustomerId: shopifyCustomerId || null,
        crmCustomerId,
        crmCustomerName: crmCustomerName || null,
      }).returning();

      res.json(result[0]);
    } catch (error) {
      console.error("Error creating customer mapping:", error);
      res.status(500).json({ error: "Failed to create customer mapping" });
    }
  });

  // Delete customer mapping
  app.delete("/api/shopify/customer-mappings/:id", isAuthenticated, async (req, res) => {
    try {
      await db.delete(shopifyCustomerMappings)
        .where(eq(shopifyCustomerMappings.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting customer mapping:", error);
      res.status(500).json({ error: "Failed to delete customer mapping" });
    }
  });

  // Manual customer matching for unmatched Shopify orders (also creates a mapping for future)
  app.post("/api/shopify/orders/:orderId/match-customer", isAuthenticated, async (req, res) => {
    try {
      const { orderId } = req.params;
      const { customerId, createMapping } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }

      const order = await db.select().from(shopifyOrders)
        .where(eq(shopifyOrders.id, parseInt(orderId)))
        .limit(1);

      if (order.length === 0) {
        return res.status(404).json({ error: "Order not found" });
      }

      const orderData = order[0];

      // Update the order with matched customer
      await db.update(shopifyOrders)
        .set({ customerId, updatedAt: new Date() })
        .where(eq(shopifyOrders.id, parseInt(orderId)));

      // Also match all other unmatched orders from the same Shopify customer
      const bulkMatchConditions = [];
      if (orderData.customerEmail) {
        bulkMatchConditions.push(ilike(shopifyOrders.customerEmail, orderData.customerEmail));
      }
      if (orderData.shopifyCustomerId) {
        bulkMatchConditions.push(eq(shopifyOrders.shopifyCustomerId, orderData.shopifyCustomerId));
      }
      let bulkMatched = 0;
      if (bulkMatchConditions.length > 0) {
        const bulkResult = await db.update(shopifyOrders)
          .set({ customerId, updatedAt: new Date() })
          .where(and(
            or(...bulkMatchConditions),
            isNull(shopifyOrders.customerId)
          ));
        bulkMatched = (bulkResult as any)?.rowCount || 0;
      }

      // Always create customer mapping for future auto-matching
      const mappingData: any = {
        crmCustomerId: customerId,
        crmCustomerName: null,
      };

      const crmCustomer = await db.select().from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      if (crmCustomer.length > 0) {
        mappingData.crmCustomerName = crmCustomer[0].company || `${crmCustomer[0].firstName} ${crmCustomer[0].lastName}`.trim();
      }

      if (orderData.customerEmail) {
        mappingData.shopifyEmail = orderData.customerEmail.toLowerCase();
      }
      if (orderData.companyName) {
        mappingData.shopifyCompanyName = orderData.companyName;
      }
      if (orderData.shopifyCustomerId) {
        mappingData.shopifyCustomerId = orderData.shopifyCustomerId;
      }

      // Check if mapping already exists by any Shopify identifier
      const mappingChecks = [];
      if (orderData.shopifyCustomerId) {
        mappingChecks.push(eq(shopifyCustomerMappings.shopifyCustomerId, orderData.shopifyCustomerId));
      }
      if (orderData.customerEmail) {
        mappingChecks.push(ilike(shopifyCustomerMappings.shopifyEmail, orderData.customerEmail));
      }
      mappingChecks.push(eq(shopifyCustomerMappings.crmCustomerId, customerId));

      const existingMapping = await db.select().from(shopifyCustomerMappings)
        .where(or(...mappingChecks))
        .limit(1);

      let mappingCreated = false;
      if (existingMapping.length === 0) {
        await db.insert(shopifyCustomerMappings).values(mappingData);
        mappingCreated = true;
      }

      // Process for coaching if paid
      if (order[0].financialStatus === 'paid' && !order[0].processedForCoaching) {
        await processOrderForCoaching(customerId, {
          id: order[0].shopifyOrderId,
          name: order[0].orderNumber,
          total_price: order[0].totalPrice,
          line_items: order[0].lineItems as any[],
        });
      }

      res.json({ success: true, mappingCreated, bulkMatched });
    } catch (error) {
      console.error("Error matching customer to order:", error);
      res.status(500).json({ error: "Failed to match customer" });
    }
  });

  // ============================================================
  // Shopify Variant Mappings - for QuickQuote to Draft Order integration
  // ============================================================

  // Fetch Shopify products (for mapping UI)
  app.get("/api/shopify/products", isAuthenticated, async (req, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ error: "Shopify not configured" });
      }

      const axios = (await import('axios')).default;
      const response = await axios.get(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products.json?limit=250`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      // Transform to include variants with product info
      const productsWithVariants = response.data.products.flatMap((product: any) =>
        product.variants.map((variant: any) => ({
          productId: String(product.id),
          variantId: String(variant.id),
          productTitle: product.title,
          variantTitle: variant.title,
          sku: variant.sku,
          price: variant.price,
          inventoryQuantity: variant.inventory_quantity,
          fullTitle: variant.title === 'Default Title' 
            ? product.title 
            : `${product.title} - ${variant.title}`,
        }))
      );

      res.json(productsWithVariants);
    } catch (error: any) {
      console.error("Error fetching Shopify products:", error.response?.data || error);
      res.status(500).json({ error: "Failed to fetch Shopify products" });
    }
  });

  // Get variant mappings
  app.get("/api/shopify/variant-mappings", isAuthenticated, async (req, res) => {
    try {
      const mappings = await db.select().from(shopifyVariantMappings)
        .where(eq(shopifyVariantMappings.isActive, true))
        .orderBy(shopifyVariantMappings.productName);
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching variant mappings:", error);
      res.status(500).json({ error: "Failed to fetch variant mappings" });
    }
  });

  // Create variant mapping
  app.post("/api/shopify/variant-mappings", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const validatedData = insertShopifyVariantMappingSchema.parse(req.body);
      
      // Check if mapping already exists for this item
      if (validatedData.itemCode) {
        const existing = await db.select().from(shopifyVariantMappings)
          .where(eq(shopifyVariantMappings.itemCode, validatedData.itemCode))
          .limit(1);
        if (existing.length > 0) {
          // Update existing
          const result = await db.update(shopifyVariantMappings)
            .set({ ...validatedData, updatedAt: new Date() })
            .where(eq(shopifyVariantMappings.id, existing[0].id))
            .returning();
          return res.json(result[0]);
        }
      }

      const result = await db.insert(shopifyVariantMappings).values(validatedData).returning();
      res.json(result[0]);
    } catch (error) {
      console.error("Error creating variant mapping:", error);
      res.status(500).json({ error: "Failed to create variant mapping" });
    }
  });

  // Delete variant mapping
  app.delete("/api/shopify/variant-mappings/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      await db.delete(shopifyVariantMappings)
        .where(eq(shopifyVariantMappings.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting variant mapping:", error);
      res.status(500).json({ error: "Failed to delete variant mapping" });
    }
  });

  // Validate SKUs against Shopify before creating draft order
  app.post("/api/shopify/validate-skus", isAuthenticated, async (req: any, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.json({ unmappedSkus: [] }); // Can't validate if Shopify not configured
      }

      const { skus } = req.body;
      if (!skus || !Array.isArray(skus) || skus.length === 0) {
        return res.json({ unmappedSkus: [] });
      }

      const axios = (await import('axios')).default;

      // Get existing variant mappings from database
      const allMappings = await db.select().from(shopifyVariantMappings)
        .where(eq(shopifyVariantMappings.isActive, true));
      
      const mappingsBySku = new Map<string, boolean>();
      for (const mapping of allMappings) {
        if (mapping.itemCode) {
          mappingsBySku.set(mapping.itemCode.trim().toLowerCase(), true);
        }
      }

      // Fetch all Shopify variants with pagination
      let shopifySkus = new Set<string>();
      try {
        let hasNextPage = true;
        let cursor: string | null = null;
        
        while (hasNextPage) {
          const graphqlQuery = `
            {
              productVariants(first: 250${cursor ? `, after: "${cursor}"` : ''}) {
                edges {
                  node {
                    sku
                  }
                  cursor
                }
                pageInfo {
                  hasNextPage
                }
              }
            }
          `;
          
          const graphqlResponse = await axios.post(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`,
            { query: graphqlQuery },
            {
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json',
              },
            }
          );
          
          const data = graphqlResponse.data?.data?.productVariants;
          const variants = data?.edges || [];
          
          for (const edge of variants) {
            const sku = edge.node.sku;
            if (sku) {
              shopifySkus.add(sku.trim().toLowerCase());
            }
            cursor = edge.cursor;
          }
          
          hasNextPage = data?.pageInfo?.hasNextPage || false;
        }
        
        console.log(`[Shopify] SKU validation loaded ${shopifySkus.size} Shopify SKUs`);
      } catch (err: any) {
        console.error('[Shopify] Failed to fetch variants for SKU validation:', err.message);
      }

      // Check each SKU - only report as unmapped if not in database mappings AND not in Shopify
      const unmappedSkus: string[] = [];
      for (const sku of skus) {
        const skuLower = sku.trim().toLowerCase();
        const isMapped = mappingsBySku.has(skuLower) || shopifySkus.has(skuLower);
        if (!isMapped) {
          unmappedSkus.push(sku);
        }
      }

      res.json({ unmappedSkus });
    } catch (error: any) {
      console.error("Error validating SKUs:", error);
      res.json({ unmappedSkus: [] }); // On error, return empty to allow proceeding
    }
  });

  // Create Shopify draft order from QuickQuote
  app.post("/api/shopify/draft-orders", isAuthenticated, async (req: any, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ error: "Shopify not configured. Please add SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_DOMAIN to your secrets." });
      }

      const { quoteNumber, customerEmail, customerId, customerName, lineItems, note } = req.body;

      if (!lineItems || lineItems.length === 0) {
        return res.status(400).json({ error: "At least one line item is required" });
      }

      const axios = (await import('axios')).default;

      // Get existing variant mappings from database
      const allMappings = await db.select().from(shopifyVariantMappings)
        .where(eq(shopifyVariantMappings.isActive, true));
      
      // Build lookup map by itemCode (Signal SKU) - normalize with trim and lowercase
      const mappingsBySku = new Map<string, typeof allMappings[0]>();
      for (const mapping of allMappings) {
        if (mapping.itemCode) {
          mappingsBySku.set(mapping.itemCode.trim().toLowerCase(), mapping);
        }
      }

      console.log(`[Shopify] Loaded ${allMappings.length} SKU mappings from database`);

      // Fetch ALL Shopify variants with pagination for SKU matching
      let shopifyVariantsBySku = new Map<string, { variantId: string; productTitle: string; variantTitle: string; price: number }>();
      try {
        let hasNextPage = true;
        let cursor: string | null = null;
        
        while (hasNextPage) {
          const graphqlResponse = await axios.post(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`,
            {
              query: `{
                productVariants(first: 250${cursor ? `, after: "${cursor}"` : ''}) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  edges {
                    node {
                      id
                      sku
                      title
                      price
                      product {
                        title
                      }
                    }
                  }
                }
              }`
            },
            {
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json',
              },
            }
          );
          
          const data = graphqlResponse.data?.data?.productVariants;
          const variants = data?.edges || [];
          
          for (const edge of variants) {
            const variant = edge.node;
            if (variant.sku) {
              shopifyVariantsBySku.set(variant.sku.trim().toLowerCase(), {
                variantId: variant.id,
                productTitle: variant.product?.title || '',
                variantTitle: variant.title || '',
                price: parseFloat(variant.price) || 0,
              });
            }
          }
          
          hasNextPage = data?.pageInfo?.hasNextPage || false;
          cursor = data?.pageInfo?.endCursor || null;
        }
        
        console.log(`[Shopify] Loaded ${shopifyVariantsBySku.size} Shopify variants by SKU for auto-matching`);
      } catch (err: any) {
        console.error('[Shopify] Failed to fetch variants for SKU matching:', err.message);
      }

      // Build Shopify line items
      const shopifyLineItems: any[] = [];
      const mappedItems: string[] = [];
      const unmappedItems: string[] = [];

      for (const item of lineItems) {
        const sku = (item.itemCode || item.sku || '').trim();
        const itemTitle = `${item.productName || item.title}${item.size ? ` - ${item.size}` : ''}`;
        const qqUnitPrice = item.unitPrice || item.pricePerPacket || 0;
        const qqLineTotal = item.lineTotal || 0; // Total from QuickQuotes (handles MOQ pricing)
        const quantity = item.quantity || 1;
        const skuLower = sku.toLowerCase();

        // First check our manual mapping table
        const mapping = sku ? mappingsBySku.get(skuLower) : null;
        
        if (mapping && mapping.shopifyVariantId) {
          // Use mapped Shopify variant from database
          let variantId: string | number = mapping.shopifyVariantId;
          
          const gidMatch = mapping.shopifyVariantId.match(/ProductVariant\/(\d+)/);
          if (gidMatch) {
            variantId = parseInt(gidMatch[1], 10);
          } else if (/^\d+$/.test(mapping.shopifyVariantId)) {
            variantId = parseInt(mapping.shopifyVariantId, 10);
          }
          
          // Get Shopify's original price for discount calculation
          // Note: Shopify variants are priced per PACK (e.g., $51.99 for 25 sheets)
          // QQ sends sheet quantity but we order 1 pack from Shopify
          const shopifyVariant = shopifyVariantsBySku.get(skuLower);
          const shopifyPackPrice = shopifyVariant?.price || 0;
          // QQ line total is the total for all sheets (which equals 1 pack price with discount)
          const effectiveQQTotal = qqLineTotal > 0 ? qqLineTotal : (qqUnitPrice * quantity);
          // Discount is the difference between Shopify pack price and QQ total
          const totalLineDiscount = shopifyPackPrice - effectiveQQTotal;
          
          console.log(`[Shopify] Using DB mapped variant: Signal SKU ${sku} -> Shopify variant ${variantId} (Shopify Pack Price: $${shopifyPackPrice.toFixed(2)}, QQ Total: $${effectiveQQTotal.toFixed(2)}, Sheet Qty: ${quantity}, Discount: $${totalLineDiscount.toFixed(2)})`);
          
          const lineItem: any = {
            variant_id: variantId,
            quantity: 1, // Order 1 pack (which contains the sheet quantity)
          };
          
          // Apply discount if QQ total is lower than Shopify pack price
          if (totalLineDiscount > 0.01) {
            lineItem.applied_discount = {
              description: 'QQ Discount',
              value_type: 'fixed_amount',
              value: String(totalLineDiscount.toFixed(2)),
              title: 'QQ Discount',
            };
          } else if (effectiveQQTotal > shopifyPackPrice) {
            // QQ total is higher than Shopify price - use custom pricing
            lineItem.price = String(effectiveQQTotal.toFixed(2));
          }
          
          shopifyLineItems.push(lineItem);
          mappedItems.push(`${itemTitle} (SKU: ${sku})`);
        } else if (sku && shopifyVariantsBySku.has(skuLower)) {
          // Auto-match by SKU from Shopify
          const shopifyVariant = shopifyVariantsBySku.get(skuLower)!;
          
          // Extract numeric ID from GraphQL GID (gid://shopify/ProductVariant/123)
          let variantId: number | string = shopifyVariant.variantId;
          const gidMatch = shopifyVariant.variantId.match(/ProductVariant\/(\d+)/);
          if (gidMatch) {
            variantId = parseInt(gidMatch[1], 10);
          }
          
          // Calculate discount using pack pricing
          // Note: Shopify variants are priced per PACK (e.g., $484.99 for 400 sheets)
          // QQ sends sheet quantity but we order 1 pack from Shopify
          const shopifyPackPrice = shopifyVariant.price;
          const effectiveQQTotal = qqLineTotal > 0 ? qqLineTotal : (qqUnitPrice * quantity);
          // Discount is the difference between Shopify pack price and QQ total
          const totalLineDiscount = shopifyPackPrice - effectiveQQTotal;
          
          console.log(`[Shopify] Auto-matched by SKU: ${sku} -> Shopify variant ${variantId} (${shopifyVariant.productTitle}) - Shopify Pack Price: $${shopifyPackPrice.toFixed(2)}, QQ Total: $${effectiveQQTotal.toFixed(2)}, Sheet Qty: ${quantity}, Discount: $${totalLineDiscount.toFixed(2)}`);
          
          const lineItem: any = {
            variant_id: variantId,
            quantity: 1, // Order 1 pack (which contains the sheet quantity)
          };
          
          // Apply discount if QQ total is lower than Shopify pack price
          if (totalLineDiscount > 0.01) {
            lineItem.applied_discount = {
              description: 'QQ Discount',
              value_type: 'fixed_amount',
              value: String(totalLineDiscount.toFixed(2)),
              title: 'QQ Discount',
            };
          } else if (effectiveQQTotal > shopifyPackPrice) {
            // QQ total is higher than Shopify price - use custom pricing
            lineItem.price = String(effectiveQQTotal.toFixed(2));
          }
          
          shopifyLineItems.push(lineItem);
          mappedItems.push(`${itemTitle} (SKU: ${sku})`);
        } else {
          // No mapping found - create custom line item with SKU reference
          console.log(`[Shopify] No mapping for SKU: ${sku} - creating custom item at QQ price $${qqUnitPrice}`);
          shopifyLineItems.push({
            title: itemTitle,
            price: String(qqUnitPrice.toFixed(2)),
            quantity: quantity,
            sku: sku || undefined,
            taxable: true,
          });
          if (sku) {
            unmappedItems.push(`${itemTitle} (SKU: ${sku})`);
          }
        }
      }

      // Look up Shopify customer ID from mapping table
      let shopifyCustomerId: string | null = null;
      if (customerId) {
        const customerMapping = await db.select()
          .from(shopifyCustomerMappings)
          .where(and(
            eq(shopifyCustomerMappings.crmCustomerId, String(customerId)),
            eq(shopifyCustomerMappings.isActive, true)
          ))
          .limit(1);
        
        if (customerMapping.length > 0 && customerMapping[0].shopifyCustomerId) {
          shopifyCustomerId = customerMapping[0].shopifyCustomerId;
          console.log(`[Shopify] Found customer mapping: CRM ${customerId} -> Shopify customer ${shopifyCustomerId}`);
        }
      }

      // Create draft order in Shopify
      const draftOrderPayload: any = {
        draft_order: {
          line_items: shopifyLineItems,
          note: note || `QuickQuote: ${quoteNumber || 'Draft'}`,
          use_customer_default_address: true,
        }
      };

      // Link to existing Shopify customer if we have their ID
      if (shopifyCustomerId) {
        // Extract numeric ID from GID if needed (gid://shopify/Customer/123456)
        let numericCustomerId: number | string = shopifyCustomerId;
        const gidMatch = shopifyCustomerId.match(/Customer\/(\d+)/);
        if (gidMatch) {
          numericCustomerId = parseInt(gidMatch[1], 10);
        } else if (/^\d+$/.test(shopifyCustomerId)) {
          numericCustomerId = parseInt(shopifyCustomerId, 10);
        }
        draftOrderPayload.draft_order.customer = { id: numericCustomerId };
        console.log(`[Shopify] Linking draft order to existing Shopify customer ID: ${numericCustomerId}`);
      } else if (customerEmail) {
        // Fallback to email if no Shopify customer ID found
        draftOrderPayload.draft_order.email = customerEmail;
      }

      console.log(`[Shopify] Creating draft order with ${shopifyLineItems.length} line items (${mappedItems.length} mapped, ${unmappedItems.length} custom) for ${shopifyCustomerId ? `Shopify customer ${shopifyCustomerId}` : customerEmail || 'no customer'}`);

      const response = await axios.post(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/draft_orders.json`,
        draftOrderPayload,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      const draftOrder = response.data.draft_order;
      const finalQuoteNumber = quoteNumber || `QQ-${Date.now()}`;

      // Save to our database (shopifyDraftOrders table)
      const savedDraft = await db.insert(shopifyDraftOrders).values({
        quoteNumber: finalQuoteNumber,
        customerId,
        customerEmail,
        shopifyDraftOrderId: String(draftOrder.id),
        shopifyDraftOrderNumber: draftOrder.name,
        invoiceUrl: draftOrder.invoice_url,
        status: draftOrder.status,
        totalPrice: draftOrder.total_price,
        lineItemsCount: draftOrder.line_items?.length || 0,
      }).returning();

      // Also save to sentQuotes for SPOTLIGHT follow-up tracking
      const quoteItemsJson = JSON.stringify(lineItems.map((item: any) => ({
        productName: item.productName || item.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice || item.pricePerPacket,
        size: item.size,
        sku: item.itemCode || item.sku,
      })));
      
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 3); // Follow up in 3 days for Shopify drafts (high priority)
      
      await db.insert(sentQuotes).values({
        quoteNumber: draftOrder.name || finalQuoteNumber,
        customerName: customerName || 'Unknown',
        customerEmail: customerEmail || null,
        quoteItems: quoteItemsJson,
        totalAmount: draftOrder.total_price || '0',
        sentVia: 'shopify_draft',
        status: 'draft',
        ownerEmail: req.user?.email || null,
        followUpDueAt: followUpDate,
        outcome: 'pending',
        source: 'shopify_draft',
        shopifyDraftOrderId: String(draftOrder.id),
        priority: 'high', // High priority for SPOTLIGHT
        customerId: customerId || null,
      });

      console.log(`[Shopify] Draft order created: ${draftOrder.name} - $${draftOrder.total_price} (saved to Saved Quotes for follow-up)`);

      res.json({
        success: true,
        draftOrder: savedDraft[0],
        shopifyDraftOrderNumber: draftOrder.name,
        invoiceUrl: draftOrder.invoice_url,
        adminUrl: `https://${SHOPIFY_STORE_DOMAIN}/admin/draft_orders/${draftOrder.id}`,
        totalPrice: draftOrder.total_price,
        mappedItems: mappedItems.length > 0 ? mappedItems : undefined,
        unmappedItems: unmappedItems.length > 0 ? unmappedItems : undefined,
      });
    } catch (error: any) {
      console.error("Error creating draft order:", error.response?.data || error);
      res.status(500).json({ 
        error: "Failed to create draft order",
        details: error.response?.data?.errors || error.message
      });
    }
  });

  // Get draft orders
  app.get("/api/shopify/draft-orders", isAuthenticated, async (req, res) => {
    try {
      const drafts = await db.select().from(shopifyDraftOrders)
        .orderBy(desc(shopifyDraftOrders.createdAt))
        .limit(100);
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching draft orders:", error);
      res.status(500).json({ error: "Failed to fetch draft orders" });
    }
  });

  // Sync Shopify abandoned carts and unconverted draft orders to Saved Quotes
  // Only processes items created after Jan 1, 2026
  app.post("/api/shopify/sync-to-saved-quotes", isAuthenticated, async (req: any, res) => {
    try {
      if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
        return res.status(400).json({ error: "Shopify not configured" });
      }

      const axios = (await import('axios')).default;
      const cutoffDate = new Date('2026-01-01T00:00:00Z');
      
      let syncedDrafts = 0;
      let syncedCarts = 0;
      let skipped = 0;
      let alreadyConverted = 0;

      // 1. Fetch all OPEN draft orders from Shopify (not completed/converted)
      console.log('[Shopify Sync] Fetching open draft orders after Jan 1, 2026...');
      
      try {
        let hasNextPage = true;
        let cursor: string | null = null;
        
        while (hasNextPage) {
          const graphqlResponse = await axios.post(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`,
            {
              query: `{
                draftOrders(first: 100, query: "status:open created_at:>=2026-01-01"${cursor ? `, after: "${cursor}"` : ''}) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  edges {
                    node {
                      id
                      name
                      createdAt
                      updatedAt
                      status
                      totalPrice
                      customer {
                        id
                        email
                        displayName
                      }
                      lineItems(first: 50) {
                        edges {
                          node {
                            title
                            quantity
                            originalUnitPrice
                            sku
                          }
                        }
                      }
                    }
                  }
                }
              }`
            },
            {
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json',
              },
            }
          );

          const data = graphqlResponse.data?.data?.draftOrders;
          const drafts = data?.edges || [];
          
          for (const edge of drafts) {
            const draft = edge.node;
            const draftId = draft.id.replace('gid://shopify/DraftOrder/', '');
            const createdAt = new Date(draft.createdAt);
            
            // Skip if before cutoff
            if (createdAt < cutoffDate) {
              skipped++;
              continue;
            }
            
            // Check if already in sentQuotes
            const existing = await db.select({ id: sentQuotes.id })
              .from(sentQuotes)
              .where(eq(sentQuotes.shopifyDraftOrderId, draftId))
              .limit(1);
            
            if (existing.length > 0) {
              skipped++;
              continue;
            }
            
            // Parse line items
            const lineItems = draft.lineItems?.edges?.map((e: any) => ({
              title: e.node.title,
              quantity: e.node.quantity,
              price: e.node.originalUnitPrice,
              sku: e.node.sku,
            })) || [];
            
            const followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + 2); // Follow up in 2 days
            
            await db.insert(sentQuotes).values({
              quoteNumber: draft.name,
              customerName: draft.customer?.displayName || 'Unknown',
              customerEmail: draft.customer?.email || null,
              quoteItems: JSON.stringify(lineItems),
              totalAmount: draft.totalPrice || '0',
              sentVia: 'shopify_draft',
              status: 'draft',
              createdAt: createdAt,
              followUpDueAt: followUpDate,
              outcome: 'pending',
              source: 'shopify_draft',
              shopifyDraftOrderId: draftId,
              priority: 'high',
            });
            
            syncedDrafts++;
          }
          
          hasNextPage = data?.pageInfo?.hasNextPage || false;
          cursor = data?.pageInfo?.endCursor || null;
        }
      } catch (err: any) {
        console.error('[Shopify Sync] Error fetching draft orders:', err.message);
      }

      // 2. Fetch abandoned checkouts from Shopify
      console.log('[Shopify Sync] Fetching abandoned checkouts after Jan 1, 2026...');
      
      try {
        // Shopify REST API for checkouts (GraphQL doesn't support abandoned checkouts well)
        const checkoutsResponse = await axios.get(
          `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/checkouts.json?created_at_min=2026-01-01T00:00:00Z&limit=250`,
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            },
          }
        );

        const checkouts = checkoutsResponse.data?.checkouts || [];
        
        for (const checkout of checkouts) {
          const checkoutId = String(checkout.id);
          const createdAt = new Date(checkout.created_at);
          
          // Skip if before cutoff
          if (createdAt < cutoffDate) {
            skipped++;
            continue;
          }
          
          // Skip if checkout was completed (has order)
          if (checkout.order_id) {
            alreadyConverted++;
            continue;
          }
          
          // Check if already in sentQuotes
          const existing = await db.select({ id: sentQuotes.id })
            .from(sentQuotes)
            .where(eq(sentQuotes.shopifyCheckoutId, checkoutId))
            .limit(1);
          
          if (existing.length > 0) {
            skipped++;
            continue;
          }
          
          // Parse line items
          const lineItems = checkout.line_items?.map((item: any) => ({
            title: item.title,
            quantity: item.quantity,
            price: item.price,
            sku: item.sku,
          })) || [];
          
          const followUpDate = new Date();
          followUpDate.setDate(followUpDate.getDate() + 1); // Follow up next day for abandoned carts (highest priority)
          
          await db.insert(sentQuotes).values({
            quoteNumber: `AC-${checkoutId.slice(-6)}`,
            customerName: checkout.billing_address?.name || checkout.email?.split('@')[0] || 'Unknown',
            customerEmail: checkout.email || null,
            quoteItems: JSON.stringify(lineItems),
            totalAmount: checkout.total_price || '0',
            sentVia: 'shopify_abandoned',
            status: 'abandoned',
            createdAt: createdAt,
            followUpDueAt: followUpDate,
            outcome: 'pending',
            source: 'shopify_abandoned_cart',
            shopifyCheckoutId: checkoutId,
            priority: 'high',
          });
          
          syncedCarts++;
        }
      } catch (err: any) {
        console.error('[Shopify Sync] Error fetching checkouts:', err.message);
      }

      console.log(`[Shopify Sync] Complete: ${syncedDrafts} drafts, ${syncedCarts} abandoned carts synced, ${skipped} skipped, ${alreadyConverted} already converted`);
      
      res.json({
        success: true,
        message: `Synced ${syncedDrafts} draft orders and ${syncedCarts} abandoned carts to Saved Quotes`,
        syncedDrafts,
        syncedCarts,
        skipped,
        alreadyConverted,
      });
    } catch (error: any) {
      console.error('[Shopify Sync] Error:', error);
      res.status(500).json({ error: 'Failed to sync Shopify data', details: error.message });
    }
  });

  // ============================================
  // ADMIN RULES & CONFIG ROUTES
  // ============================================

  // Helper: Log admin audit event
  async function logAdminAudit(
    configType: string,
    action: string,
    entityId: string | null,
    entityName: string | null,
    beforeData: any,
    afterData: any,
    userId: string,
    userEmail: string | null
  ) {
    try {
      await db.insert(adminAuditLog).values({
        configType,
        action,
        entityId: entityId || undefined,
        entityName: entityName || undefined,
        beforeData,
        afterData,
        userId,
        userEmail: userEmail || undefined,
      });
    } catch (e) {
      console.error("Failed to log admin audit:", e);
    }
  }

  // --- Tags Management ---



  // --- Setup Completeness Wizard ---

  // Auto-import SKU mappings from Shopify products

  // --- Machine Types ---




  // --- Category Groups ---




  // --- Categories ---




  // --- Category Variants ---




  // --- SKU Mappings ---
  // Get unique SKUs from Shopify orders for unmapped product detection





  // --- Coaching Timers ---




  // --- Nudge Settings ---




  // --- Conversation Scripts ---




  // --- Audit Log (read-only) ---

  // --- Config Versions (for rollback) ---

  // Publish current config as a new version

  // Rollback to a previous version

  // Seed initial config data from hardcoded constants

  // ============================================
  // SPOTLIGHT - Focus Mode for Client Work
  // ============================================

  const { spotlightEngine } = await import("./spotlight-engine");
  const { analyzeForHints } = await import("./spotlight-heuristics");




  // Remind Me Again Today - reschedules task to end of day


  // Get "Later Today" tasks for scratch pad


  // Admin leaderboard - show user task stats with bucket breakdown



  // Allow user to continue working after completing their daily target


  // Get skipped SPOTLIGHT tasks for today

  // ============================================
  // SPOTLIGHT - Coaching & Gamification APIs
  // ============================================

  // Get morning warm-up data

  // Get end-of-day recap

  // Get micro-coaching card (shown every 3-4 tasks)

  // Get contextual coach tip for current task

  // Use power-up (free skip)

  // Get gamification state

  // Update energy level (mid-session adjustment)

  // Inbox Search - find contact data (phone, address, company) from Gmail history

  // Bounce Investigation - Get bounce details with AI research
  app.get("/api/bounce-investigation/:bounceId", isAuthenticated, async (req: any, res) => {
    try {
      const bounceId = parseInt(req.params.bounceId);
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (isNaN(bounceId)) {
        return res.status(400).json({ error: "Invalid bounce ID" });
      }

      // Get bounce record - any authenticated user can view bounces
      // (bounced emails are data quality issues visible to all users)
      const [bounce] = await db
        .select()
        .from(bouncedEmails)
        .where(eq(bouncedEmails.id, bounceId))
        .limit(1);

      if (!bounce) {
        return res.status(404).json({ error: "Bounce not found" });
      }

      // Get associated record (customer, contact, or lead)
      let record: any = null;
      if (bounce.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, bounce.leadId)).limit(1);
        if (lead) {
          record = {
            type: 'lead',
            id: lead.id,
            name: lead.contactName || lead.company || 'Unknown',
            email: lead.email,
            phone: lead.phone,
            companyName: lead.company,
            title: lead.title,
            city: lead.city,
            state: lead.state,
            lastContactAt: lead.lastContactAt,
            stage: lead.stage,
            source: lead.source,
          };
        }
      } else if (bounce.customerId) {
        const [customer] = await db.select().from(customers).where(eq(customers.id, bounce.customerId)).limit(1);
        if (customer) {
          record = {
            type: 'customer',
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            companyName: customer.name,
            city: customer.city,
            state: customer.state,
            lastContactAt: customer.lastContactAt,
          };
        }
      }

      // Extract domain from email
      const emailDomain = bounce.bouncedEmail.split('@')[1];
      let domain = null;
      if (emailDomain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'].includes(emailDomain.toLowerCase())) {
        domain = {
          domain: emailDomain,
          screenshotUrl: `https://api.microlink.io/?url=https://${emailDomain}&screenshot=true&meta=false&embed=screenshot.url`,
          linkedinSearchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(emailDomain.split('.')[0])}`,
        };
      }

      // Generate AI research (use cached value if already computed)
      let aiResearch = null;
      if (bounce.aiResearch) {
        aiResearch = bounce.aiResearch;
      } else {
      const openaiApiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      if (openaiApiKey) {
        try {
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ 
            apiKey: openaiApiKey,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          });

          const prompt = `You are a sales intelligence assistant helping a sales rep decide what to do with a bounced email contact.

BOUNCED EMAIL DETAILS:
- Email: ${bounce.bouncedEmail}
- Bounce Date: ${new Date(bounce.bounceDate).toLocaleDateString()}
- Bounce Reason: ${bounce.bounceReason || 'Not specified'}
- Original Subject: ${bounce.bounceSubject || 'Not available'}

${record ? `CONTACT/LEAD DETAILS:
- Name: ${record.name}
- Company: ${record.companyName || 'Unknown'}
- Title: ${record.title || 'Unknown'}
- Location: ${[record.city, record.state].filter(Boolean).join(', ') || 'Unknown'}
- Last Contact: ${record.lastContactAt ? new Date(record.lastContactAt).toLocaleDateString() : 'Never'}
- Source: ${record.source || 'Unknown'}
${record.stage ? `- Lead Stage: ${record.stage}` : ''}` : 'No contact record found'}

${domain ? `DOMAIN: ${domain.domain}` : 'Personal email domain (Gmail, Yahoo, etc.)'}

Analyze this bounced email and provide insights in JSON format:
{
  "summary": "Brief 1-2 sentence summary of the situation",
  "domainAnalysis": "Analysis of the email domain - is it a real company? personal email? generic domain?",
  "bounceAnalysis": "Analysis of why the email bounced - did the person leave? company closed? typo?",
  "recommendation": "One of: delete, bad_fit, keep, investigate",
  "confidence": 0.0-1.0 confidence in your recommendation,
  "reasons": ["Array of 3-5 bullet points explaining your reasoning"]
}`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 500,
          });

          const content = completion.choices[0]?.message?.content;
          if (content) {
            aiResearch = JSON.parse(content);
            // Cache result so future loads skip the API call
            await db.update(bouncedEmails).set({ aiResearch }).where(eq(bouncedEmails.id, bounceId));
          }
        } catch (aiError) {
          console.error('[Bounce Investigation] AI error:', aiError);
        }
      }
      } // end else (no cached aiResearch)

      res.json({
        bounce: {
          id: bounce.id,
          bouncedEmail: bounce.bouncedEmail,
          bounceSubject: bounce.bounceSubject,
          bounceDate: bounce.bounceDate,
          bounceReason: bounce.bounceReason,
          bounceType: bounce.bounceType,
          matchType: bounce.matchType,
          status: bounce.status,
          outreachHistorySnapshot: bounce.outreachHistorySnapshot ? (() => { try { return JSON.parse(bounce.outreachHistorySnapshot); } catch { return null; } })() : null,
        },
        record,
        domain,
        aiResearch,
      });
    } catch (error) {
      console.error("[Bounce Investigation] Error:", error);
      res.status(500).json({ error: "Failed to load bounce investigation" });
    }
  });

  // Bounce Investigation - Regenerate AI analysis
  app.post("/api/bounce-investigation/:bounceId/regenerate-ai", isAuthenticated, async (req: any, res) => {
    try {
      const bounceId = parseInt(req.params.bounceId);
      const userId = req.user?.claims?.sub || req.user?.id;
      
      // Verify bounce belongs to user before allowing regeneration
      const [bounce] = await db
        .select({ id: bouncedEmails.id })
        .from(bouncedEmails)
        .where(and(
          eq(bouncedEmails.id, bounceId),
          eq(bouncedEmails.detectedBy, userId)
        ))
        .limit(1);
      
      if (!bounce) {
        return res.status(404).json({ error: "Bounce not found" });
      }
      
      // The GET endpoint regenerates AI each time, so a simple refetch works
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to regenerate AI" });
    }
  });

  // Bounce Investigation - Resolve bounce with action
  app.post("/api/bounce-investigation/:bounceId/resolve", isAuthenticated, async (req: any, res) => {
    try {
      const bounceId = parseInt(req.params.bounceId);
      const { resolution, correctedEmail } = req.body;
      const userId = req.user?.claims?.sub || req.user?.id;

      if (!['bad_fit', 'delete', 'keep', 'fix_email'].includes(resolution)) {
        return res.status(400).json({ error: "Invalid resolution" });
      }

      if (resolution === 'fix_email' && !correctedEmail) {
        return res.status(400).json({ error: "correctedEmail is required for fix_email resolution" });
      }

      // Get bounce record
      const [bounce] = await db
        .select()
        .from(bouncedEmails)
        .where(eq(bouncedEmails.id, bounceId))
        .limit(1);

      if (!bounce) {
        return res.status(404).json({ error: "Bounce not found" });
      }

      // Handle the resolution action
      if (resolution === 'delete') {
        if (bounce.leadId) {
          await db.delete(leads).where(eq(leads.id, bounce.leadId));
        } else if (bounce.customerId) {
          await db.delete(customers).where(eq(customers.id, bounce.customerId));
        }
      } else if (resolution === 'bad_fit') {
        if (bounce.leadId) {
          await db.update(leads)
            .set({ stage: 'lost', lostReason: 'Bad Fit - Email Bounced', doNotContact: true })
            .where(eq(leads.id, bounce.leadId));
        } else if (bounce.customerId) {
          await db.update(customers)
            .set({ doNotContact: true, doNotContactReason: 'Bad Fit - Email Bounced' })
            .where(eq(customers.id, bounce.customerId));
        }
      } else if (resolution === 'fix_email' && correctedEmail) {
        // BUG-06 FIX: Update the email on the underlying customer, contact, or lead record
        if (bounce.customerId) {
          await db.update(customers)
            .set({ email: correctedEmail })
            .where(eq(customers.id, bounce.customerId));
        }
        if (bounce.contactId) {
          await db.update(customerContacts)
            .set({ email: correctedEmail })
            .where(eq(customerContacts.id, bounce.contactId));
        }
        if (bounce.leadId) {
          await db.update(leads)
            .set({ email: correctedEmail })
            .where(eq(leads.id, bounce.leadId));
        }
      }
      // 'keep' just resolves the bounce without changing the record

      // Mark bounce record as resolved
      await db.update(bouncedEmails)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: userId,
          resolution: resolution,
        })
        .where(eq(bouncedEmails.id, bounceId));

      res.json({ success: true });
    } catch (error) {
      console.error("[Bounce Investigation] Error resolving:", error);
      res.status(500).json({ error: "Failed to resolve bounce" });
    }
  });


  // Bounce Investigation - AI typo detection
  app.post('/api/bounce-investigation/:bounceId/check-typo', isAuthenticated, async (req: any, res) => {
    try {
      const bounceId = parseInt(req.params.bounceId);
      if (isNaN(bounceId)) return res.status(400).json({ error: 'Invalid bounce ID' });

      const [bounce] = await db.select().from(bouncedEmails).where(eq(bouncedEmails.id, bounceId)).limit(1);
      if (!bounce) return res.status(404).json({ error: 'Bounce not found' });

      const typoUserId = req.user?.claims?.sub || req.user?.id;
      const typoDbUser = await storage.getUser(typoUserId);
      if (bounce.detectedBy !== typoUserId && typoDbUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: not your bounce record' });
      }

      return res.json({ suggestion: null, confidence: 0, reasoning: 'Enter the corrected email manually' });
    } catch (error: any) {
      console.error('[Bounce] check-typo error:', error);
      res.status(500).json({ error: 'Failed to check for typo' });
    }
  });

  // Bounce Investigation - Company viability check
  app.post('/api/bounce-investigation/:bounceId/check-company', isAuthenticated, async (req: any, res) => {
    try {
      const bounceId = parseInt(req.params.bounceId);
      if (isNaN(bounceId)) return res.status(400).json({ error: 'Invalid bounce ID' });

      const [bounce] = await db.select().from(bouncedEmails).where(eq(bouncedEmails.id, bounceId)).limit(1);
      if (!bounce) return res.status(404).json({ error: 'Bounce not found' });

      const companyUserId = req.user?.claims?.sub || req.user?.id;
      const companyDbUser = await storage.getUser(companyUserId);
      if (bounce.detectedBy !== companyUserId && companyDbUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: not your bounce record' });
      }

      let companyName = '';
      const emailDomain = bounce.bouncedEmail.split('@')[1] || '';
      if (bounce.customerId) {
        const [cust] = await db.select({ company: customers.company, name: customers.name }).from(customers).where(eq(customers.id, bounce.customerId)).limit(1);
        companyName = cust?.company || cust?.name || emailDomain;
      }
      if (!companyName) companyName = emailDomain.split('.')[0];

      const personalDomains = ['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com'];
      const websiteUrl = emailDomain && !personalDomains.includes(emailDomain.toLowerCase()) ? `https://${emailDomain}` : undefined;
      const linkedinSearchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;
      const googleMapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(companyName)}`;

      return res.json({ verdict: 'uncertain', explanation: 'Use the research links below to assess the company.', websiteUrl, linkedinSearchUrl, googleMapsUrl });
    } catch (error: any) {
      console.error('[Bounce] check-company error:', error);
      res.status(500).json({ error: 'Failed to check company viability' });
    }
  });

  // Bounce Investigation - Replace contact (person left the company)
  app.post('/api/bounce-investigation/:bounceId/replace-contact', isAuthenticated, async (req: any, res) => {
    try {
      const bounceId = parseInt(req.params.bounceId);
      const userId = req.user?.claims?.sub || req.user?.id;
      if (isNaN(bounceId)) return res.status(400).json({ error: 'Invalid bounce ID' });

      const { name, email, phone, title } = req.body;
      if (!name?.trim() || !email?.trim()) {
        return res.status(422).json({ error: 'Name and email are required' });
      }

      const [bounce] = await db.select().from(bouncedEmails).where(eq(bouncedEmails.id, bounceId)).limit(1);
      if (!bounce) return res.status(404).json({ error: 'Bounce not found' });

      const replaceDbUser = await storage.getUser(userId);
      if (bounce.detectedBy !== userId && replaceDbUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: not your bounce record' });
      }

      // --- LEAD BOUNCE PATH ---
      // A lead is a single-person record — updating the person means updating the lead directly
      if (!bounce.customerId && bounce.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, bounce.leadId)).limit(1);
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        await db.update(leads).set({
          name: name.trim(),
          email: email.trim(),
          emailNormalized: email.trim().toLowerCase(),
          phone: phone?.trim() || lead.phone,
          jobTitle: title?.trim() || lead.jobTitle,
          updatedAt: new Date(),
        }).where(eq(leads.id, bounce.leadId));
        // Sync updated contact info back to Odoo if the lead has a linked partner
        if (lead.odooPartnerId) {
          try {
            const odooFields: Record<string, any> = { name: name.trim(), email: email.trim() };
            if (phone?.trim()) odooFields.phone = phone.trim();
            if (title?.trim()) odooFields.function = title.trim();
            await odooClient.write('res.partner', [lead.odooPartnerId], odooFields);
            console.log('[Bounce] Updated Odoo lead partner:', lead.odooPartnerId);
          } catch (odooErr: any) {
            console.error('[Bounce] Odoo lead partner update error:', (odooErr as any).message);
          }
        }

        const outreachHistorySnapshotLead = bounce.outreachHistorySnapshot;
        await db.update(bouncedEmails)
          .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: userId, resolution: 'replaced_contact' })
          .where(eq(bouncedEmails.id, bounceId));
        spotlightEngine.invalidateAllPrefetchCaches();
        return res.json({
          success: true,
          isLeadUpdate: true,
          outreachHistorySnapshot: outreachHistorySnapshotLead ? JSON.parse(outreachHistorySnapshotLead) : null,
        });
      }

      if (!bounce.customerId) return res.status(400).json({ error: 'No customer linked to this bounce' });

      const [customer] = await db.select().from(customers).where(eq(customers.id, bounce.customerId)).limit(1);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });

      // Create the new contact in local DB (role field stores title/job function)
      const [newContact] = await db.insert(customerContacts).values({
        customerId: bounce.customerId,
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        role: title?.trim() || null,
      }).returning();

      // Push to Odoo if customer has an Odoo partner ID
        // Search for an existing partner by email under the same parent — update if found, create only if not
        let odooContactId: number | null = null;
        if (customer.odooPartnerId) {
          try {
            const existingPartners = await odooClient.searchRead(
              'res.partner',
              [['email', '=', email.trim()], ['parent_id', '=', customer.odooPartnerId]],
              ['id', 'name', 'email'],
              { limit: 1 }
            );
            const odooFields: Record<string, any> = {
              name: name.trim(),
              is_company: false,
              type: 'contact',
              parent_id: customer.odooPartnerId,
              email: email.trim(),
              phone: phone?.trim() || false,
              function: title?.trim() || false,
            };
            if (existingPartners.length > 0) {
              // Partner already exists — update in place instead of creating a duplicate
              odooContactId = existingPartners[0].id;
              await odooClient.write('res.partner', [odooContactId!], odooFields);
              console.log('[Bounce] Updated existing Odoo contact (already present):', odooContactId);
            } else {
              // No match found — safe to create
              odooContactId = await odooClient.create('res.partner', odooFields);
              console.log('[Bounce] Created new Odoo contact:', odooContactId);
            }
          } catch (odooErr: any) {
            console.error('[Bounce] Odoo contact sync error:', odooErr.message);
          }
        }

      // Resolve the bounce
      const outreachHistorySnapshot = bounce.outreachHistorySnapshot;
      await db.update(bouncedEmails)
        .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: userId, resolution: 'replaced_contact' })
        .where(eq(bouncedEmails.id, bounceId));

      res.json({
        success: true,
        contactId: newContact?.id,
        odooContactId,
        outreachHistorySnapshot: outreachHistorySnapshot ? JSON.parse(outreachHistorySnapshot) : null,
      });
    } catch (error: any) {
      console.error('[Bounce] replace-contact error:', error);
      res.status(500).json({ error: 'Failed to replace contact' });
    }
  });

  // Bounce Investigation - Fix email with Odoo sync
  // This extends the existing resolve endpoint with fix_email_odoo type
  app.post('/api/bounce-investigation/:bounceId/fix-email', isAuthenticated, async (req: any, res) => {
    try {
      const bounceId = parseInt(req.params.bounceId);
      const userId = req.user?.claims?.sub || req.user?.id;
      if (isNaN(bounceId)) return res.status(400).json({ error: 'Invalid bounce ID' });

      const { correctedEmail } = req.body;
      if (!correctedEmail?.trim()) return res.status(422).json({ error: 'correctedEmail is required' });

      const [bounce] = await db.select().from(bouncedEmails).where(eq(bouncedEmails.id, bounceId)).limit(1);
      if (!bounce) return res.status(404).json({ error: 'Bounce not found' });

      const fixEmailDbUser = await storage.getUser(userId);
      if (bounce.detectedBy !== userId && fixEmailDbUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: not your bounce record' });
      }

      const newEmail = correctedEmail.trim().toLowerCase();

      // Update email in local DB for all linked records
      if (bounce.customerId) {
        await db.update(customers).set({ email: newEmail }).where(eq(customers.id, bounce.customerId));
      }
      if (bounce.contactId) {
        await db.update(customerContacts).set({ email: newEmail }).where(eq(customerContacts.id, bounce.contactId));
      }
      if (bounce.leadId) {
        await db.update(leads).set({ email: newEmail }).where(eq(leads.id, bounce.leadId));
      }

      // Sync to Odoo if customer has an Odoo partner ID
      let odooUpdated = false;
      if (bounce.customerId) {
        const [customer] = await db.select({ odooPartnerId: customers.odooPartnerId }).from(customers).where(eq(customers.id, bounce.customerId)).limit(1);
        if (customer?.odooPartnerId) {
          try {
            await odooClient.updatePartner(customer.odooPartnerId, { email: newEmail });
            odooUpdated = true;
          } catch (odooErr: any) {
            console.error('[Bounce] Odoo email update error:', odooErr.message);
          }
        }
      }

      // Resolve the bounce
      const outreachHistorySnapshot = bounce.outreachHistorySnapshot;
      await db.update(bouncedEmails)
        .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: userId, resolution: 'fix_email_odoo' })
        .where(eq(bouncedEmails.id, bounceId));

      res.json({
        success: true,
        odooUpdated,
        correctedEmail: newEmail,
        outreachHistorySnapshot: outreachHistorySnapshot ? JSON.parse(outreachHistorySnapshot) : null,
      });
    } catch (error: any) {
      console.error('[Bounce] fix-email error:', error);
      res.status(500).json({ error: 'Failed to fix email' });
    }
  });

  // ─── Task Inbox API ──────────────────────────────────────────────────────────

  // Helper to enrich task with record name (customer or lead)
  async function enrichTaskRecord(task: any): Promise<any> {
    let recordName = 'Unknown';
    let recordType: 'customer' | 'lead' | null = null;
    let recordId: string | number | null = null;

    if (task.customerId) {
      recordType = 'customer';
      recordId = task.customerId;
      const [customer] = await db
        .select({ company: customers.company, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
        .from(customers)
        .where(eq(customers.id, task.customerId));
      recordName = customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
      const personName = `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim();
      const contactDisplayName = personName && customer?.company
        ? `${personName} (${customer.company})`
        : personName || customer?.company || null;
      return { ...task, recordName, recordType, recordId, customerName: recordName, contactEmail: customer?.email || null, contactDisplayName };
    } else if (task.leadId) {
      recordType = 'lead';
      recordId = task.leadId;
      const [lead] = await db
        .select({ name: leads.name, company: leads.company, email: leads.email })
        .from(leads)
        .where(eq(leads.id, task.leadId));
      recordName = lead?.name || lead?.company || 'Unknown';
      const leadDisplayName = lead?.name && lead?.company
        ? `${lead.name} (${lead.company})`
        : lead?.name || lead?.company || null;
      return { ...task, recordName, recordType, recordId, customerName: recordName, contactEmail: lead?.email || null, contactDisplayName: leadDisplayName };
    }

    return { ...task, recordName, recordType, recordId, customerName: recordName, contactEmail: null, contactDisplayName: null };
  }

  // Unified task summary for dashboard

  // Unified task list with filter/sort support

  // Create a new task from the inbox

  // Cancel a task

  // Mark / unmark a task as critical

  // Complete a task

  // Emails Not Replied — emails 5+ days old with pricing/sample keywords where:
  //   - replyReceivedAt IS NULL (no reply logged on the email_sends row)
  //   - Lead: firstEmailReplyAt is NULL or predates the email sentAt (no known reply)
  //   - Customer: no 'reply'-type customerActivityEvent after the email sentAt
  // Also includes Gmail-synced email_sent leadActivities with matching subjects.

  // Drip Sequence follow-up section
  // Returns completed drip assignments 3+ days ago where the lead/customer has NOT replied
  // since the sequence started, and no open follow_up_task already exists for this assignment.

  // Create follow-up task from an unanswered email

  // Mark an email-not-replied item as "done" (dismiss it from the list)

  // Press Test Sent section
  // Returns customers/leads who received Press Test Sheets, sourced from:
  //   1. Local labelPrints table (labelType = 'press_test_kit')
  //   2. Leads with pressTestKitSentAt set
  //   3. Odoo Sales Orders with "Samples" in product SKU OR Customer Reference (client_order_ref)
  //   4. Odoo Invoices with "Samples"-suffixed product codes


  // ============================================
  // Calendar Hub API Routes
  // ============================================

  // Check if Google Calendar is connected
  app.get("/api/calendar/status", isAuthenticated, async (req: any, res) => {
    try {
      const connected = await googleCalendar.isGoogleCalendarConnected();
      res.json({ connected });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  // Get all calendar events and tasks for a date range
  app.get("/api/calendar/events", isAuthenticated, async (req: any, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ error: "start and end dates are required" });
      }

      const startDate = new Date(start as string);
      const endDate = new Date(end as string);
      
      // Get Google Calendar events
      let googleEvents: googleCalendar.CalendarEvent[] = [];
      try {
        googleEvents = await googleCalendar.getEventsInRange(startDate, endDate);
      } catch (error) {
        console.log('[Calendar] Google Calendar not connected, skipping Google events');
      }
      
      // Get internal follow-up tasks
      const tasks = await db
        .select({
          id: followUpTasks.id,
          customerId: followUpTasks.customerId,
          title: followUpTasks.title,
          description: followUpTasks.description,
          taskType: followUpTasks.taskType,
          priority: followUpTasks.priority,
          status: followUpTasks.status,
          dueDate: followUpTasks.dueDate,
          assignedTo: followUpTasks.assignedTo,
          assignedToName: followUpTasks.assignedToName,
          calendarEventId: followUpTasks.calendarEventId,
          createdAt: followUpTasks.createdAt,
        })
        .from(followUpTasks)
        .where(
          and(
            gte(followUpTasks.dueDate, startDate),
            sql`${followUpTasks.dueDate} <= ${endDate}`
          )
        )
        .orderBy(followUpTasks.dueDate);

      // Get customer names for tasks
      const customerIds = [...new Set(tasks.map(t => t.customerId).filter(Boolean))];
      const customerNames: Record<string, string> = {};
      if (customerIds.length > 0) {
        const customerData = await db
          .select({ id: customers.id, company: customers.company })
          .from(customers)
          .where(sql`${customers.id} IN ${customerIds}`);
        customerData.forEach(c => { customerNames[c.id] = c.company || 'Unknown'; });
      }

      // Convert tasks to calendar event format
      const taskEvents = tasks.map(task => ({
        id: `task-${task.id}`,
        title: task.title,
        description: task.description,
        start: task.dueDate,
        end: task.dueDate,
        allDay: false,
        source: 'app' as const,
        sourceType: 'follow_up_task',
        sourceId: task.id,
        priority: task.priority,
        status: task.status,
        taskType: task.taskType,
        customerId: task.customerId,
        customerName: customerNames[task.customerId] || undefined,
        assignedTo: task.assignedTo,
        assignedToName: task.assignedToName,
        calendarEventId: task.calendarEventId,
      }));

      // Combine and return all events
      const allEvents = [
        ...googleEvents.map(e => ({ ...e, sourceType: 'google_calendar' })),
        ...taskEvents,
      ];

      res.json({ events: allEvents });
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  // Get events for a specific day
  app.get("/api/calendar/day/:date", isAuthenticated, async (req: any, res) => {
    try {
      const { date } = req.params;
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      // Get Google Calendar events for this day
      let googleEvents: googleCalendar.CalendarEvent[] = [];
      try {
        googleEvents = await googleCalendar.getEventsInRange(dayStart, dayEnd);
      } catch (error) {
        console.log('[Calendar] Google Calendar not connected');
      }

      // Get internal tasks for this day
      const tasks = await db
        .select({
          id: followUpTasks.id,
          customerId: followUpTasks.customerId,
          title: followUpTasks.title,
          description: followUpTasks.description,
          taskType: followUpTasks.taskType,
          priority: followUpTasks.priority,
          status: followUpTasks.status,
          dueDate: followUpTasks.dueDate,
          assignedTo: followUpTasks.assignedTo,
          assignedToName: followUpTasks.assignedToName,
          calendarEventId: followUpTasks.calendarEventId,
          completedAt: followUpTasks.completedAt,
          completionNotes: followUpTasks.completionNotes,
        })
        .from(followUpTasks)
        .where(
          and(
            gte(followUpTasks.dueDate, dayStart),
            sql`${followUpTasks.dueDate} <= ${dayEnd}`
          )
        )
        .orderBy(followUpTasks.dueDate);

      // Get customer info
      const customerIds = [...new Set(tasks.map(t => t.customerId).filter(Boolean))];
      const customerData: Record<string, { company: string; email?: string }> = {};
      if (customerIds.length > 0) {
        const customersResult = await db
          .select({ id: customers.id, company: customers.company, email: customers.email })
          .from(customers)
          .where(sql`${customers.id} IN ${customerIds}`);
        customersResult.forEach(c => { 
          customerData[c.id] = { company: c.company || 'Unknown', email: c.email || undefined }; 
        });
      }

      res.json({
        date,
        googleEvents: googleEvents.map(e => ({ ...e, sourceType: 'google_calendar' })),
        tasks: tasks.map(t => ({
          ...t,
          customerName: customerData[t.customerId]?.company,
          customerEmail: customerData[t.customerId]?.email,
        })),
      });
    } catch (error) {
      console.error("Error fetching day events:", error);
      res.status(500).json({ error: "Failed to fetch day events" });
    }
  });

  // Create a new task
  app.post("/api/calendar/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const { title, description, dueDate, customerId, priority, taskType, assignedTo, syncToGoogle } = req.body;
      
      if (!title || !dueDate) {
        return res.status(400).json({ error: "Title and due date are required" });
      }

      const taskData = {
        customerId: customerId || null,
        title,
        description: description || null,
        taskType: taskType || 'general',
        priority: priority || 'normal',
        status: 'pending',
        dueDate: new Date(dueDate),
        assignedTo: assignedTo || req.user?.claims?.email || null,
        assignedToName: assignedTo || req.user?.claims?.email || null,
        isAutoGenerated: false,
      };

      // Validate the task data
      const validated = insertFollowUpTaskSchema.parse(taskData);

      // Create the task
      const [newTask] = await db
        .insert(followUpTasks)
        .values(validated)
        .returning();

      // Optionally sync to Google Calendar
      if (syncToGoogle) {
        try {
          const calendarEventId = await googleCalendar.syncTaskToCalendar({
            id: newTask.id,
            title: newTask.title,
            description: newTask.description,
            dueDate: newTask.dueDate,
          });
          
          if (calendarEventId) {
            await db
              .update(followUpTasks)
              .set({ calendarEventId })
              .where(eq(followUpTasks.id, newTask.id));
            newTask.calendarEventId = calendarEventId;
          }
        } catch (error) {
          console.log('[Calendar] Failed to sync task to Google Calendar:', error);
        }
      }

      res.json(newTask);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  // Update a task
  app.patch("/api/calendar/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { title, description, dueDate, priority, status, assignedTo, syncToGoogle } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
      if (priority !== undefined) updateData.priority = priority;
      if (status !== undefined) {
        updateData.status = status;
        if (status === 'completed') {
          updateData.completedAt = new Date();
          updateData.completedBy = req.user?.claims?.email;
        }
      }
      if (assignedTo !== undefined) {
        updateData.assignedTo = assignedTo;
        updateData.assignedToName = assignedTo;
      }

      const [updated] = await db
        .update(followUpTasks)
        .set(updateData)
        .where(eq(followUpTasks.id, parseInt(id)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Sync changes to Google Calendar if requested and task has a calendar event
      if (syncToGoogle && updated.calendarEventId) {
        try {
          await googleCalendar.updateCalendarEvent(updated.calendarEventId, {
            title: updated.title,
            description: updated.description || undefined,
            start: updated.dueDate,
          });
        } catch (error) {
          console.log('[Calendar] Failed to sync update to Google Calendar:', error);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Delete a task
  app.delete("/api/calendar/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Get the task first to check for calendar event
      const [task] = await db
        .select()
        .from(followUpTasks)
        .where(eq(followUpTasks.id, parseInt(id)));

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Delete from Google Calendar if synced
      if (task.calendarEventId) {
        try {
          await googleCalendar.deleteCalendarEvent(task.calendarEventId);
        } catch (error) {
          console.log('[Calendar] Failed to delete from Google Calendar:', error);
        }
      }

      // Delete the task
      await db
        .delete(followUpTasks)
        .where(eq(followUpTasks.id, parseInt(id)));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Get all users for task assignment
  app.get("/api/calendar/users", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.role, 'approved'));

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Create a Google Calendar event directly
  app.post("/api/calendar/google-events", isAuthenticated, async (req: any, res) => {
    try {
      const { title, description, start, end, allDay, location, attendees } = req.body;

      if (!title || !start) {
        return res.status(400).json({ error: "Title and start time are required" });
      }

      const event = await googleCalendar.createCalendarEvent({
        title,
        description,
        start: new Date(start),
        end: end ? new Date(end) : undefined,
        allDay,
        location,
        attendees,
      });

      if (!event) {
        return res.status(500).json({ error: "Failed to create Google Calendar event" });
      }

      res.json(event);
    } catch (error) {
      console.error("Error creating Google Calendar event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // Admin endpoint to find and delete blocked companies (cargo, freight, logistics, etc.)
  

  // Admin endpoint to view customer exclusion list (customers that won't be re-imported)
  
  // Admin endpoint to remove a customer from the exclusion list (allow re-import)

  // ============= ADMIN SETTINGS API (Cost Optimization) =============
  const { getAllAdminSettings, setAdminSetting, ADMIN_SETTING_KEYS } = await import("./admin-settings");
  
  // ===== MAILER TYPES ADMIN =====




  // Get all admin settings
  
  // Update an admin setting
  
  // Get cost summary for dashboard widget

  // ====== Database Management Endpoints ======
  // Get database statistics for admin monitoring

  // Export database data as JSON for migration

  // Trigger bounce scan manually (admin only) — POST and GET both supported




  // Import database data from JSON export (with duplicate prevention)

  // ========================================
  // OPPORTUNITY ENGINE ROUTES
  // ========================================

  app.get("/api/opportunities", isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngine } = await import("./opportunity-engine");
      const { type, limit, minScore } = req.query;
      const isAdmin = req.user?.role === 'admin';
      // salesRepId in DB is the Odoo res.users ID (e.g. "26"), not the Replit user UUID.
      // Look up the current user's odooUserId from the users table for correct matching.
      let repOdooId: string | undefined = undefined;
      if (!isAdmin) {
        const [currentUser] = await db.select({ odooUserId: users.odooUserId })
          .from(users)
          .where(eq(users.id, req.user.id))
          .limit(1);
        repOdooId = currentUser?.odooUserId?.toString() || undefined;
      }
      const opportunities = await opportunityEngine.getTopOpportunities({
        salesRepId: repOdooId,
        opportunityType: type as any,
        limit: limit ? parseInt(limit as string) : 100,
        minScore: minScore ? parseInt(minScore as string) : 20,
      });
      res.json(opportunities);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      res.status(500).json({ error: "Failed to fetch opportunities" });
    }
  });

  app.get("/api/opportunities/summary", isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngine } = await import("./opportunity-engine");
      const isAdmin = req.user?.role === 'admin';
      let repOdooIdForSummary: string | undefined = undefined;
      if (!isAdmin) {
        const [currentUser] = await db.select({ odooUserId: users.odooUserId })
          .from(users)
          .where(eq(users.id, req.user.id))
          .limit(1);
        repOdooIdForSummary = currentUser?.odooUserId?.toString() || undefined;
      }
      const summary = await opportunityEngine.getOpportunitySummary({
        minScore: 20,
        salesRepId: repOdooIdForSummary,
      });
      res.json(summary);
    } catch (error) {
      console.error("Error fetching opportunity summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  app.get("/api/opportunities/customer/:customerId", isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngine } = await import("./opportunity-engine");
      const result = await opportunityEngine.getCustomerOpportunityScore(req.params.customerId);
      res.json(result || { score: 0, signals: [], opportunities: [] });
    } catch (error) {
      console.error("Error fetching customer opportunity score:", error);
      res.status(500).json({ error: "Failed to fetch score" });
    }
  });

  app.post("/api/opportunities/recalculate", isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngine } = await import("./opportunity-engine");
      const result = await opportunityEngine.calculateAndStoreScores();
      res.json(result);
    } catch (error) {
      console.error("Error recalculating opportunities:", error);
      res.status(500).json({ error: "Failed to recalculate" });
    }
  });

  app.post("/api/opportunities/detect-samples", isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngine } = await import("./opportunity-engine");
      const detected = await opportunityEngine.detectSampleShipments();
      res.json({ detected });
    } catch (error) {
      console.error("Error detecting samples:", error);
      res.status(500).json({ error: "Failed to detect samples" });
    }
  });

  app.get("/api/opportunities/sample-followups", isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngine } = await import("./opportunity-engine");
      const followUps = await opportunityEngine.getSampleShipmentsNeedingFollowUp();
      res.json(followUps);
    } catch (error) {
      console.error("Error fetching sample follow-ups:", error);
      res.status(500).json({ error: "Failed to fetch follow-ups" });
    }
  });

  app.post("/api/opportunities/sample-followup/:shipmentId", isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngine } = await import("./opportunity-engine");
      const { type, outcome } = req.body;
      await opportunityEngine.recordFollowUp(
        parseInt(req.params.shipmentId),
        type || 'other',
        req.user?.id,
        outcome
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording follow-up:", error);
      res.status(500).json({ error: "Failed to record follow-up" });
    }
  });

  // Mark an opportunity as Won or Lost (deactivates it from the pipeline)
  app.post("/api/opportunities/:id/outcome", isAuthenticated, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { outcome } = req.body;
    if (isNaN(id) || !['won', 'lost'].includes(outcome)) {
      return res.status(400).json({ error: "outcome must be 'won' or 'lost'" });
    }
    try {
      const [existing] = await db.select().from(opportunityScores).where(eq(opportunityScores.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: "Opportunity not found" });

      const history = [
        ...(existing.followUpHistory || []),
        {
          step: 0,
          type: 'other' as const,
          date: new Date().toISOString(),
          outcome,
          userId: (req.user as any)?.claims?.sub || req.user?.id,
        },
      ];

      await db.update(opportunityScores)
        .set({ isActive: false, followUpHistory: history, updatedAt: new Date() })
        .where(eq(opportunityScores.id, id));

      res.json({ ok: true, outcome });
    } catch (err: any) {
      console.error("Error setting opportunity outcome:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Dashboard Kanban board data
  app.get("/api/dashboard/kanban", isAuthenticated, async (req: any, res) => {
    try {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      // Rep filter: admins can pass ?rep=aneesh to scope; non-admins are auto-scoped to their name
      const isAdmin = req.user?.role === 'admin';
      const userId = (req.user as any)?.claims?.sub || req.user?.id || '';
      const userEmail: string = ((req.user as any)?.claims?.email || req.user?.email || '').toLowerCase();
      const userFirstName = userEmail.split('@')[0]; // e.g. "aneesh"
      const repParam = (req.query.rep as string || '').toLowerCase().trim();
      // repFilter: null = show all (admin with no filter), string = ILIKE pattern
      const repFilter: string | null = isAdmin
        ? (repParam && repParam !== 'all' ? repParam : null)
        : userFirstName || null;

      // Helper: optional ilike condition for Drizzle queries
      const leadRepCond = repFilter ? ilike(leads.salesRepName, `%${repFilter}%`) : undefined;
      const custRepCond = repFilter ? ilike(customers.salesRepName, `%${repFilter}%`) : undefined;
      // SQL fragment for raw queries (safe: repFilter is always derived from email first-name, never user input without validation)
      const repSqlFrag = repFilter ? sql`AND LOWER(c.sales_rep_name) ILIKE ${'%' + repFilter + '%'}` : sql``;
      const repShipSqlFrag = repFilter ? sql`AND (LOWER(c.sales_rep_name) ILIKE ${'%' + repFilter + '%'} OR (c.id IS NULL AND sft.user_id::text = ${userId}))` : sql``;

      const repliedLeads = await db
        .select({ id: leads.id, name: leads.name, company: leads.company, type: sql<string>`'lead'`, salesKanbanStage: leads.salesKanbanStage, rep: sql<string | null>`${leads.salesRepName}`, signal: sql<string>`CASE WHEN ${leads.firstEmailReplyAt} IS NOT NULL THEN 'email needs response' ELSE 'needs reply' END` })
        .from(leads)
        .where(
          and(
            isNull(leads.pressTestKitSentAt),
            isNull(leads.sampleSentAt),
            or(
              isNotNull(leads.firstEmailReplyAt),
              eq(leads.salesKanbanStage, 'replied')
            ),
            leadRepCond,
          )
        )
        .orderBy(desc(leads.firstEmailReplyAt))
        .limit(100);

      // Customers manually placed in replied stage
      const repliedCustomersManual = await db
        .select({
          id: customers.id,
          name: sql<string>`COALESCE(${customers.firstName} || ' ' || ${customers.lastName}, ${customers.company}, 'Unknown')`,
          company: customers.company,
          type: sql<string>`'customer'`,
          salesKanbanStage: customers.salesKanbanStage,
          rep: sql<string | null>`${customers.salesRepName}`,
          signal: sql<string>`'needs reply'`
        })
        .from(customers)
        .where(and(eq(customers.salesKanbanStage, 'replied'), custRepCond))
        .limit(50);

      // Customers with an inbound Gmail message in last 60 days, no outbound email from us since then
      const inboundUnrepliedCustomers = await db.execute(sql`
        SELECT DISTINCT ON (c.id)
          c.id,
          COALESCE(c.first_name || ' ' || c.last_name, c.company, 'Unknown') AS name,
          c.company,
          'customer' AS type,
          c.sales_kanban_stage AS "salesKanbanStage",
          c.sales_rep_name AS rep,
          'email needs response' AS signal
        FROM gmail_messages gm
        JOIN customers c ON c.id = gm.customer_id
        WHERE gm.direction = 'inbound'
          AND gm.sent_at >= NOW() - INTERVAL '90 days'
          AND NOT EXISTS (
            SELECT 1 FROM gmail_messages outbound
            WHERE outbound.customer_id = gm.customer_id
              AND outbound.direction = 'outbound'
              AND outbound.sent_at > gm.sent_at
          )
          AND NOT EXISTS (
            SELECT 1 FROM email_sends es
            WHERE LOWER(TRIM(es.recipient_email)) = LOWER(TRIM(c.email))
              AND es.sent_at > gm.sent_at
          )
          AND (c.sales_kanban_stage IS NULL OR c.sales_kanban_stage NOT IN ('won', 'lost'))
          ${repSqlFrag}
        ORDER BY c.id, gm.sent_at DESC
        LIMIT 50
      `);

      // Merge: manual + inbound unresponded, dedup by id
      const seenCustomerIds = new Set<string>();
      const repliedCustomers: any[] = [];
      for (const row of [...repliedCustomersManual, ...(inboundUnrepliedCustomers.rows as any[])]) {
        if (!seenCustomerIds.has(row.id)) {
          seenCustomerIds.add(row.id);
          repliedCustomers.push(row);
        }
      }

      const samplesLeads = await db
        .select({ id: leads.id, name: leads.name, company: leads.company, type: sql<string>`'lead'`, salesKanbanStage: leads.salesKanbanStage, rep: sql<string | null>`${leads.salesRepName}`, signal: sql<string>`CASE WHEN ${leads.pressTestKitSentAt} IS NOT NULL THEN 'press test kit sent' WHEN ${leads.sampleEnvelopeSentAt} IS NOT NULL THEN 'sample envelope sent' WHEN ${leads.sampleSentAt} IS NOT NULL THEN 'sample sent' WHEN ${leads.onePageMailerSentAt} IS NOT NULL THEN 'mailer sent' ELSE 'samples requested' END` })
        .from(leads)
        .where(
          and(
            or(
              isNotNull(leads.pressTestKitSentAt),
              isNotNull(leads.sampleSentAt),
              eq(leads.salesKanbanStage, 'samples_requested')
            ),
            leadRepCond,
          )
        )
        .orderBy(desc(leads.pressTestKitSentAt))
        .limit(100);

      // Pull pending sample shipments from shipment_follow_up_tasks, matching to customers
      const shipmentSamplesRaw = await db.execute(sql`
        SELECT DISTINCT ON (COALESCE(c.id::text, sft.recipient_email))
          COALESCE(c.id::text, 'ship_' || sft.id::text) AS id,
          COALESCE(
            c.first_name || ' ' || c.last_name,
            c.company,
            sft.recipient_name,
            sft.customer_company,
            sft.recipient_email,
            'Unknown'
          ) AS name,
          COALESCE(c.company, sft.customer_company) AS company,
          CASE WHEN c.id IS NOT NULL THEN 'customer' ELSE 'shipment' END AS type,
          c.sales_kanban_stage AS "salesKanbanStage",
          c.sales_rep_name AS rep,
          CASE
            WHEN sft.shipment_type = 'press_test_kit' THEN 'press test sent'
            WHEN sft.shipment_type = 'swatchbook' THEN 'swatchbook sent'
            ELSE 'samples sent'
          END AS signal
        FROM shipment_follow_up_tasks sft
        LEFT JOIN customers c ON (
          c.id = sft.customer_id
          OR LOWER(TRIM(c.email)) = LOWER(TRIM(sft.recipient_email))
        )
        WHERE sft.shipment_type IN ('samples', 'swatchbook', 'press_test_kit')
          AND sft.status = 'pending'
          AND sft.reply_received = false
          AND sft.dismissed_at IS NULL
          AND sft.sent_at >= NOW() - INTERVAL '90 days'
          ${repShipSqlFrag}
        ORDER BY COALESCE(c.id::text, sft.recipient_email), sft.sent_at DESC
        LIMIT 100
      `);
      const samplesCustomers = (shipmentSamplesRaw.rows as any[]);

      // Subquery fragments: exclude records that have a future pending follow-up task (rescheduled/snoozed)
      const noFutureLeadTask = sql`NOT EXISTS (
        SELECT 1 FROM follow_up_tasks ft
        WHERE ft.lead_id = ${leads.id}
          AND ft.status = 'pending'
          AND ft.due_date > NOW()
      )`;
      const noFutureCustomerTask = sql`NOT EXISTS (
        SELECT 1 FROM follow_up_tasks ft
        WHERE ft.customer_id = ${customers.id}
          AND ft.status = 'pending'
          AND ft.due_date > NOW()
      )`;

      const noResponseLeads = await db
        .select({ id: leads.id, name: leads.name, company: leads.company, type: sql<string>`'lead'`, salesKanbanStage: leads.salesKanbanStage, rep: sql<string | null>`${leads.salesRepName}`, signal: sql<string>`CASE WHEN ${leads.lastContactAt} IS NOT NULL THEN CONCAT(EXTRACT(DAY FROM NOW() - ${leads.lastContactAt})::int, ' days silent') ELSE 'no contact yet' END` })
        .from(leads)
        .where(
          and(
            isNull(leads.pressTestKitSentAt),
            isNull(leads.sampleSentAt),
            or(
              and(
                isNotNull(leads.firstEmailSentAt),
                isNull(leads.firstEmailReplyAt),
                lt(leads.lastContactAt, tenDaysAgo),
                sql`${leads.lastContactAt} >= NOW() - INTERVAL '30 days'`
              ),
              eq(leads.salesKanbanStage, 'no_response')
            ),
            noFutureLeadTask,
            leadRepCond,
          )
        )
        .orderBy(asc(leads.lastContactAt))
        .limit(100);

      const noResponseCustomers = await db
        .select({
          id: customers.id,
          name: sql<string>`COALESCE(${customers.firstName} || ' ' || ${customers.lastName}, ${customers.company}, 'Unknown')`,
          company: customers.company,
          type: sql<string>`'customer'`,
          salesKanbanStage: customers.salesKanbanStage,
          rep: sql<string | null>`${customers.salesRepName}`,
          signal: sql<string>`'no recent contact'`
        })
        .from(customers)
        .where(
          and(
            isNull(customers.pressTestSentAt),
            isNull(customers.swatchbookSentAt),
            eq(customers.salesKanbanStage, 'no_response'),
            sql`${customers.lastOutboundEmailAt} >= NOW() - INTERVAL '30 days'`,
            noFutureCustomerTask,
            custRepCond,
          )
        )
        .limit(100);

      const issueLeads = await db
        .select({ id: leads.id, name: leads.name, company: leads.company, type: sql<string>`'lead'`, salesKanbanStage: leads.salesKanbanStage, rep: sql<string | null>`${leads.salesRepName}`, signal: sql<string>`'issue flagged'` })
        .from(leads)
        .where(and(eq(leads.salesKanbanStage, 'issue'), leadRepCond))
        .limit(100);

      const issueCustomers = await db
        .select({
          id: customers.id,
          name: sql<string>`COALESCE(${customers.firstName} || ' ' || ${customers.lastName}, ${customers.company}, 'Unknown')`,
          company: customers.company,
          type: sql<string>`'customer'`,
          salesKanbanStage: customers.salesKanbanStage,
          rep: sql<string | null>`${customers.salesRepName}`,
          signal: sql<string>`'issue flagged'`
        })
        .from(customers)
        .where(and(eq(customers.salesKanbanStage, 'issue'), custRepCond))
        .limit(100);

      res.json({
        replied: [...repliedLeads, ...repliedCustomers],
        samplesRequested: [...samplesLeads, ...samplesCustomers],
        noResponse: [...noResponseLeads, ...noResponseCustomers],
        issues: [...issueLeads, ...issueCustomers],
      });
    } catch (error) {
      console.error("Error fetching kanban data:", error);
      res.status(500).json({ error: "Failed to fetch kanban data" });
    }
  });

  // Unknown Inquiries — inbound emails with pricing/sample keywords from senders not in leads/customers
  app.get("/api/dashboard/unknown-inquiries", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === 'admin';
      const userId = (req.user as any)?.claims?.sub || req.user?.id || '';
      const userFilter = isAdmin ? sql`` : sql`AND gm.user_id = ${userId}`;

      const rows = await db.execute(sql`
        SELECT DISTINCT ON (LOWER(TRIM(gm.from_email)))
          gm.id,
          gm.from_email     AS "fromEmail",
          gm.from_name      AS "fromName",
          gm.subject,
          gm.snippet,
          gm.sent_at        AS "sentAt",
          gm.thread_id      AS "threadId"
        FROM gmail_messages gm
        WHERE gm.direction = 'inbound'
          AND gm.sent_at >= NOW() - INTERVAL '60 days'
          AND gm.customer_id IS NULL
          ${userFilter}

          -- Must have a pricing or sample keyword in subject or snippet
          AND (
            gm.subject ILIKE '%price%'
            OR gm.subject ILIKE '%pricing%'
            OR gm.subject ILIKE '%sample%'
            OR gm.subject ILIKE '%quote%'
            OR gm.subject ILIKE '%swatchbook%'
            OR gm.subject ILIKE '%swatch book%'
            OR gm.subject ILIKE '%press test%'
            OR gm.subject ILIKE '%press kit%'
            OR gm.snippet  ILIKE '%price%'
            OR gm.snippet  ILIKE '%sample%'
            OR gm.snippet  ILIKE '%quote%'
          )

          -- Exclude if sender is already a lead, customer, or customer contact (exact email match)
          AND NOT EXISTS (
            SELECT 1 FROM leads l
            WHERE LOWER(TRIM(l.email)) = LOWER(TRIM(gm.from_email))
          )
          AND NOT EXISTS (
            SELECT 1 FROM customers c
            WHERE LOWER(TRIM(c.email)) = LOWER(TRIM(gm.from_email))
          )
          AND NOT EXISTS (
            SELECT 1 FROM customer_contacts cc
            WHERE LOWER(TRIM(cc.email)) = LOWER(TRIM(gm.from_email))
          )
          -- Exclude if the sender's domain matches a known customer/lead domain
          -- (catches colleagues from the same company whose exact email isn't stored)
          -- Skips generic email providers to avoid false exclusions
          AND SPLIT_PART(LOWER(TRIM(gm.from_email)), '@', 2) NOT IN (
            'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
            'aol.com','live.com','msn.com','me.com','mac.com','googlemail.com'
          )
          AND NOT EXISTS (
            SELECT 1 FROM customers c2
            WHERE c2.email IS NOT NULL AND c2.email != ''
              AND SPLIT_PART(LOWER(TRIM(c2.email)), '@', 2)
                = SPLIT_PART(LOWER(TRIM(gm.from_email)), '@', 2)
          )
          AND NOT EXISTS (
            SELECT 1 FROM leads l2
            WHERE l2.email IS NOT NULL AND l2.email != ''
              AND SPLIT_PART(LOWER(TRIM(l2.email)), '@', 2)
                = SPLIT_PART(LOWER(TRIM(gm.from_email)), '@', 2)
          )
          AND NOT EXISTS (
            SELECT 1 FROM customer_contacts cc2
            WHERE cc2.email IS NOT NULL AND cc2.email != ''
              AND SPLIT_PART(LOWER(TRIM(cc2.email)), '@', 2)
                = SPLIT_PART(LOWER(TRIM(gm.from_email)), '@', 2)
          )

          -- Exclude obvious marketing / automated senders (domain-based)
          AND gm.from_email NOT ILIKE '%noreply%'
          AND gm.from_email NOT ILIKE '%no-reply%'
          AND gm.from_email NOT ILIKE '%donotreply%'
          AND gm.from_email NOT ILIKE '%do-not-reply%'
          AND gm.from_email NOT ILIKE '%mailer%'
          AND gm.from_email NOT ILIKE '%notification%'
          AND gm.from_email NOT ILIKE '%postmaster%'
          AND gm.from_email NOT ILIKE '%bounce%'
          AND gm.from_email NOT ILIKE '%mailchimp%'
          AND gm.from_email NOT ILIKE '%sendgrid%'
          AND gm.from_email NOT ILIKE '%klaviyo%'
          AND gm.from_email NOT ILIKE '%hubspot%'
          AND gm.from_email NOT ILIKE '@google.com'
          AND gm.from_email NOT ILIKE '%googlemail%'

          -- Exclude marketing-keyword subjects
          AND gm.subject NOT ILIKE '%unsubscribe%'
          AND gm.subject NOT ILIKE '%newsletter%'
          AND gm.subject NOT ILIKE '%promotional%'
          AND gm.subject NOT ILIKE '%promotion%'
          AND gm.subject NOT ILIKE '%limited offer%'
          AND gm.subject NOT ILIKE '%deal%'
          AND gm.subject NOT ILIKE '%discount%'
          AND gm.subject NOT ILIKE '%your account%'
          AND gm.subject NOT ILIKE '%invoice%'
          AND gm.subject NOT ILIKE '%payment%'
          AND gm.subject NOT ILIKE '%delivery status%'

        ORDER BY LOWER(TRIM(gm.from_email)), gm.sent_at DESC
        LIMIT 20
      `);

      res.json(rows.rows as any[]);
    } catch (error) {
      console.error("[Unknown Inquiries] Error:", error);
      res.status(500).json({ error: "Failed to fetch unknown inquiries" });
    }
  });




  // ========================================
  // Sketchboard API Routes
  // ========================================

  // Get all entries for the logged-in user (optionally by column)
  app.get('/api/sketchboard/entries', isAuthenticated, requireApproval, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const VALID_COLUMNS = ['working_on', 'waiting_on', 'decide_on'];
      const rawColumn = typeof req.query.column === 'string' ? req.query.column : undefined;
      const column = rawColumn && VALID_COLUMNS.includes(rawColumn) ? rawColumn : undefined;
      const entries = await storage.getSketchboardEntries(userId, column);
      res.json(entries);
    } catch (error) {
      console.error('Error fetching sketchboard entries:', error);
      res.status(500).json({ error: 'Failed to fetch entries' });
    }
  });

  // Add an entry to a column
  app.post('/api/sketchboard/entries', isAuthenticated, requireApproval, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const { column, customerName, note } = req.body;
      if (!column || !customerName) {
        return res.status(400).json({ error: 'column and customerName are required' });
      }
      if (!customerName.trim()) {
        return res.status(400).json({ error: 'customerName cannot be empty' });
      }
      const VALID_COLUMNS = ['working_on', 'waiting_on', 'decide_on'];
      if (!VALID_COLUMNS.includes(column)) {
        return res.status(400).json({ error: 'Invalid column' });
      }
      const count = await storage.getSketchboardColumnCount(userId, column);
      if (count >= 15) {
        return res.status(422).json({ error: 'COLUMN_FULL', message: 'Column is at capacity (15 max)', count });
      }
      const entry = await storage.createSketchboardEntry({
        userId,
        column,
        customerName: customerName.trim(),
        note: note?.trim() || null,
      });
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating sketchboard entry:', error);
      res.status(500).json({ error: 'Failed to create entry' });
    }
  });

  // Update an entry
  app.patch('/api/sketchboard/entries/:id', isAuthenticated, requireApproval, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid entry id' });
      const { note, sortOrder, customerName } = req.body;
      const updated = await storage.updateSketchboardEntry(id, userId, {
        ...(customerName !== undefined && { customerName }),
        ...(note !== undefined && { note: note?.trim() || null }),
        ...(sortOrder !== undefined && { sortOrder }),
      });
      if (!updated) return res.status(404).json({ error: 'Entry not found' });
      res.json(updated);
    } catch (error) {
      console.error('Error updating sketchboard entry:', error);
      res.status(500).json({ error: 'Failed to update entry' });
    }
  });

  // Delete an entry
  app.delete('/api/sketchboard/entries/:id', isAuthenticated, requireApproval, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid entry id' });
      // Get the entry's column before deleting so we can normalize sort order after
      const [toDelete] = await db.select({ column: sketchboardEntries.column })
        .from(sketchboardEntries)
        .where(and(eq(sketchboardEntries.id, id), eq(sketchboardEntries.userId, userId)));
      if (!toDelete) return res.status(404).json({ error: 'Entry not found' });
      const deleted = await storage.deleteSketchboardEntry(id, userId);
      if (!deleted) return res.status(404).json({ error: 'Entry not found' });
      // Re-normalize sort orders to close the gap
      await storage.normalizeSketchboardSortOrder(userId, toDelete.column);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting sketchboard entry:', error);
      res.status(500).json({ error: 'Failed to delete entry' });
    }
  });

  // ─── Email Conflict Detection ─────────────────────────────────────────────
  // Lightweight: returns just the set of conflicting normalized emails (used for badges)
  // Note: intentionally not requireAdmin — all authenticated users can access this
  // lightweight badge data to show duplicate warnings on lead/contact cards

  // Full paginated conflict list (admin-only)

  // Resolve a conflict: keep the lead or the customer (email is the identity key)

  // Register route groups from split files
  registerLeadsRoutes(app);
  registerDripRoutes(app);
  registerTasksRoutes(app);
  registerEmailRoutes(app);
  registerAdminRoutes(app);
  registerCustomersRoutes(app);

  // Catch-all for unmatched API routes - return JSON 404 instead of HTML
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.path}` });
  });

  const workersEnabled = process.env.ENABLE_WORKERS !== 'false';
  if (workersEnabled && process.env.ENABLE_GMAIL_SYNC !== 'false') {
    import("./gmail-intelligence").then(({ startDailyEmailSync }) => {
      startDailyEmailSync();
    }).catch(err => {
      console.error('[Gmail Auto-Sync] Failed to start daily sync scheduler:', err.message);
    });
  } else {
    console.log('[Workers] Gmail sync disabled via ENABLE_WORKERS=false or ENABLE_GMAIL_SYNC=false');
  }

  // ── Global search: leads + customers + contacts ─────────────────────────────
  app.get('/api/search', isAuthenticated, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) return res.json({ leads: [], customers: [], contacts: [] });

      const pattern = `%${q}%`;

      const [matchedLeads, matchedCustomers, matchedContacts] = await Promise.all([
        db.select({
          id: leads.id,
          name: leads.name,
          email: leads.email,
          company: leads.company,
          stage: leads.stage,
        })
          .from(leads)
          .where(
            or(
              ilike(leads.name, pattern),
              ilike(leads.email, pattern),
              ilike(leads.company, pattern)
            )
          )
          .limit(6),

        db.select({
          id: customers.id,
          company: customers.company,
          email: customers.email,
          firstName: customers.firstName,
          lastName: customers.lastName,
        })
          .from(customers)
          .where(
            or(
              ilike(customers.company, pattern),
              ilike(customers.email, pattern),
              ilike(customers.firstName, pattern),
              ilike(customers.lastName, pattern)
            )
          )
          .limit(6),

        db.select({
          id: customerContacts.id,
          name: customerContacts.name,
          email: customerContacts.email,
          role: customerContacts.role,
          customerId: customerContacts.customerId,
        })
          .from(customerContacts)
          .where(
            or(
              ilike(customerContacts.name, pattern),
              ilike(customerContacts.email, pattern)
            )
          )
          .limit(6),
      ]);

      res.json({ leads: matchedLeads, customers: matchedCustomers, contacts: matchedContacts });
    } catch (err: any) {
      console.error('[Global Search] Error:', err.message);
      res.status(500).json({ error: 'Search failed' });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}
