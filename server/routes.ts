import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import pdf from 'html-pdf-node';
import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import OpenAI from 'openai';
import { storage } from "./storage";
import chatRouter from "./chat";
import { z } from "zod";
// Removed: parseProductData import - legacy CSV parser no longer used
import { parseCustomerCSV } from "./customer-parser";
import { parseOdooExcel } from "./odoo-parser";

import { generateQuoteHTMLForDownload, generatePriceListHTML, validateQuoteNumber, generateQuoteNumber } from "./stub-functions";
import { 
  insertSentQuoteSchema,
  insertShipmentSchema,
  insertShippingCompanySchema,
  insertSavedRecipientSchema,
  insertProductLabelSchema,
  insertPressProfileSchema,
  insertSampleRequestSchema,
  insertTestOutcomeSchema,
  insertValidationEventSchema,
  insertSwatchSchema,
  insertSwatchBookShipmentSchema,
  insertSwatchSelectionSchema,
  insertCustomerJourneySchema,
  insertQuoteEventSchema,
  insertPriceListEventSchema,
  insertCustomerJourneyInstanceSchema,
  insertCustomerJourneyStepSchema,
  insertPressTestJourneyDetailSchema,
  JOURNEY_STAGES,
  JOURNEY_TYPES,
  PRESS_TEST_STEPS,
  PRODUCT_LINES
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
// Removed: pricingData import - legacy table removed
import { addPricingRoutes } from "./routes-pricing";
import pricingDatabaseRoutes from "./routes-pricing-database";
import { APP_CONFIG, isAdminEmail, getUserRoleFromEmail, getAccessibleTiers, debugLog } from "./config";
import { searchNotionProducts } from "./notion";

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
  // Register public/debug routes BEFORE auth middleware
  // Test database connection (no auth required for debugging)
  app.get("/api/test-db", async (req: any, res) => {
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

  // Temporary endpoint to fix admin user approval status
  app.get("/api/fix-admin-user", async (req: any, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const aneeshUser = allUsers.find(u => u.email === 'aneesh@4sgraphics.com');
      
      if (!aneeshUser) {
        return res.json({ message: "User not found in database", allEmails: allUsers.map(u => u.email) });
      }

      console.log("Current user status:", aneeshUser);

      // Update to approved admin status
      const updated = await storage.approveUser(aneeshUser.id, 'system');
      
      if (updated) {
        // Also ensure role is admin
        await storage.changeUserRole(aneeshUser.id, 'admin');
      }

      const finalUser = await storage.getUser(aneeshUser.id);
      
      res.json({
        message: "User status updated",
        before: { status: aneeshUser.status, role: aneeshUser.role },
        after: { status: finalUser?.status, role: finalUser?.role }
      });
    } catch (error) {
      console.error("Error fixing user:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Dashboard statistics endpoint (with relaxed auth for now)
  app.get("/api/dashboard/stats", async (req: any, res) => {
    try {
      debugLog("=== Dashboard Stats Request ===");
      
      // Use simpler approach - test each query individually
      let totalQuotes = 0;
      let quotesThisMonth = 0;
      let monthlyRevenue = 0;
      let totalCustomers = 0;
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
  app.get("/api/dashboard/crm", async (req: any, res) => {
    try {
      const crmStats = await storage.getCRMDashboardStats();
      res.json(crmStats);
    } catch (error) {
      console.error("CRM Dashboard stats error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to fetch CRM statistics", details: errorMessage });
    }
  });

  // --- Health check (for debugging connectivity quickly) ---
  app.get('/api/health', (_req, res) => {
    res.json({ 
      ok: true, 
      env: process.env.NODE_ENV, 
      time: new Date().toISOString(),
      version: "1.0.0",
      database: "connected",
      cache: cache.size
    });
  });

  // --- Comprehensive diagnostics endpoint ---
  app.get('/api/diagnostics', async (_req, res) => {
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
        const testQuery = await storage.db.execute('SELECT 1 as test');
        diagnostics.database.connected = true;
        diagnostics.database.rowCount = testQuery.rows.length;
      } catch (dbError) {
        diagnostics.database.connected = false;
        diagnostics.database.error = dbError instanceof Error ? dbError.message : String(dbError);
      }

      // Test critical API endpoints
      try {
        const pricingData = await storage.getAllProductPricing();
        diagnostics.api_endpoints['/api/product-pricing-database'] = `✓ Working (${pricingData.length} items)`;
      } catch (apiError) {
        diagnostics.api_endpoints['/api/product-pricing-database'] = `✗ Error: ${apiError instanceof Error ? apiError.message : String(apiError)}`;
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

  // Setup authentication middleware AFTER the public routes
  await setupAuth(app);

  // Auth routes
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
      const userId = req.user.claims.sub;
      
      // Development bypass - return mock user data for development
      if (APP_CONFIG.DEV_MODE && (req.hostname === 'localhost' || req.get('host')?.includes('localhost') || req.get('host')?.includes('replit.dev'))) {
        return res.json({
          id: 'dev-user-123',
          email: process.env.DEV_USER_EMAIL || APP_CONFIG.ADMIN_EMAILS[0],
          firstName: 'Dev',
          lastName: 'User',
          profileImageUrl: 'https://via.placeholder.com/150',
          role: process.env.DEV_USER_ROLE || 'admin',
          status: 'approved',
          loginCount: 1,
          lastLoginDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      const user = await storage.getUser(userId);
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
      console.log('=== SERVER ROLE CHANGE REQUEST (userId pattern) ===');
      console.log('userId:', req.params.userId);
      console.log('decoded userId:', decodeURIComponent(req.params.userId));
      console.log('role from body:', req.body.role);
      console.log('request body:', JSON.stringify(req.body));
      
      const userId = decodeURIComponent(req.params.userId);
      const { role } = req.body;
      
      if (!role || !['user', 'manager', 'admin'].includes(role)) {
        console.log('Invalid role provided:', role);
        return res.status(400).json({ message: "Invalid role. Must be 'user', 'manager', or 'admin'" });
      }
      
      console.log('Calling storage.changeUserRole with:', { userId, role });
      const user = await storage.changeUserRole(userId, role);
      
      if (!user) {
        console.log('User not found in database for userId:', userId);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log('Role change successful, returning user:', JSON.stringify(user));
      res.json(user);
    } catch (error) {
      console.error("Error updating user role - full error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack');
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update user role" });
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

  // Get all product pricing - maps from pricing_data table to expected format
  app.get("/api/product-pricing", async (req, res) => {
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

  // Customer management routes
  app.get("/api/customers", async (req, res) => {
    try {
      const cacheKey = "customers";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const customers = await storage.getCustomers();
      setCachedData(cacheKey, customers);
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customerData = req.body;
      const customer = await storage.createCustomer(customerData);
      
      // Clear cache to ensure fresh data
      setCachedData("customers", null);
      
      res.json(customer);
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  app.put("/api/customers/:id", async (req, res) => {
    try {
      const customerId = req.params.id;
      const customerData = req.body;
      const customer = await storage.updateCustomer(customerId, customerData);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Clear cache to ensure fresh data
      setCachedData("customers", null);
      
      res.json(customer);
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  
  // Product management routes
  app.put("/api/product-sizes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const sizeId = parseInt(req.params.id);
      const sizeData = req.body;

      console.log("Updating product size:", { sizeId, sizeData });

      if (isNaN(sizeId)) {
        console.error("Invalid product size ID:", req.params.id);
        return res.status(400).json({ error: "Invalid product size ID" });
      }

      // Check if user is admin
      const userRole = req.user?.claims?.email === "aneesh@4sgraphics.com" || req.user?.claims?.email === "oscar@4sgraphics.com" ? "admin" : "user";
      if (userRole !== "admin") {
        console.error("Non-admin user attempted to update product:", req.user?.claims?.email);
        return res.status(403).json({ error: "Admin access required" });
      }

      const updatedSize = await storage.updateProductSize(sizeId, sizeData);
      
      if (!updatedSize) {
        console.error("Product size not found:", sizeId);
        return res.status(404).json({ error: "Product size not found" });
      }
      
      console.log("Product size updated successfully:", updatedSize);
      
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
  app.post("/api/admin/save-product-data", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      const userRole = req.user?.claims?.email === "aneesh@4sgraphics.com" || req.user?.claims?.email === "oscar@4sgraphics.com" ? "admin" : "user";
      if (userRole !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      await saveProductDataToFile();
      
      res.json({ message: "Product data saved to file successfully" });
    } catch (error) {
      console.error("Error saving product data:", error);
      res.status(500).json({ error: "Failed to save product data" });
    }
  });

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

  // DEPRECATED: Get price for specific square meters with product type and tier 
  // This endpoint is no longer used - pricing is now handled through productPricingMaster
  app.get("/api/price/:squareMeters/:typeId/:tierId", async (req, res) => {
    try {
      const squareMeters = parseFloat(req.params.squareMeters);
      const typeId = parseInt(req.params.typeId);
      const tierId = parseInt(req.params.tierId);
      const { sizeId } = req.query;
      const size = sizeId ? parseInt(sizeId as string) : undefined;
      
      if (isNaN(squareMeters) || squareMeters <= 0) {
        return res.status(400).json({ error: "Invalid square meters value" });
      }
      
      if (isNaN(typeId) || isNaN(tierId)) {
        return res.status(400).json({ error: "Invalid type or tier ID" });
      }
      
      // Return zero values for deprecated endpoint
      const totalPrice = 0;
      const pricePerSqm = 0;
      
      res.json({ 
        totalPrice, 
        pricePerSqm,
        squareMeters,
        sizeId: size,
        hasSizeSpecificPricing: size !== undefined && pricePerSqm > 0
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate price" });
    }
  });

  // DEPRECATED: Calculate custom size square meters with pricing
  // This endpoint is no longer used - pricing is now handled through productPricingMaster
  app.post("/api/calculate-square-meters", async (req, res) => {
    try {
      const schema = z.object({
        width: z.number().positive(),
        height: z.number().positive(),
        widthUnit: z.enum(['inch', 'feet']),
        heightUnit: z.enum(['inch', 'feet']),
        typeId: z.number().optional(),
        tierId: z.number().optional()
      });

      const { width, height, widthUnit, heightUnit, typeId, tierId } = schema.parse(req.body);
      
      const widthInches = widthUnit === 'feet' ? width * 12 : width;
      const heightInches = heightUnit === 'feet' ? height * 12 : height;
      const squareMeters = (widthInches * heightInches) * (0.0254 * 0.0254);
      
      let pricePerSqm = 0;
      let totalPrice = 0;
      
      if (typeId && tierId) {
        // Return zero values for deprecated endpoint
        pricePerSqm = 0;
        totalPrice = 0;
      }
      
      res.json({ 
        squareMeters: parseFloat(squareMeters.toFixed(4)), 
        pricePerSqm,
        totalPrice
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data" });
      }
      res.status(500).json({ error: "Failed to calculate square meters" });
    }
  });

  // Get all customers
  app.get("/api/customers", async (req, res) => {
    try {
      // Use database storage instead of CSV parsing
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Get quote counts per customer email
  app.get("/api/customers/quote-counts", isAuthenticated, async (req, res) => {
    try {
      const counts = await storage.getQuoteCountsByCustomerEmail();
      res.json(counts);
    } catch (error) {
      console.error("Error fetching quote counts:", error);
      res.status(500).json({ error: "Failed to fetch quote counts" });
    }
  });

  // Get customer by ID
  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  // Create new customer (Admin only)
  app.post("/api/customers", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const customer = req.body;
      
      if (!customer.id || !customer.id.trim()) {
        return res.status(400).json({ error: "Customer ID is required" });
      }

      // Check if customer already exists
      const existingCustomer = await storage.getCustomer(customer.id);
      if (existingCustomer) {
        return res.status(409).json({ error: "Customer with this ID already exists" });
      }

      const createdCustomer = await storage.createCustomer(customer);
      res.status(201).json(createdCustomer);
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  // Update customer (Admin only)
  app.put("/api/customers/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const customerId = req.params.id;
      const customerData = req.body;
      
      // Check if customer exists
      const existingCustomer = await storage.getCustomer(customerId);
      if (!existingCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const updatedCustomer = await storage.updateCustomer(customerId, customerData);
      res.json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  // Delete customer (Admin only)
  app.delete("/api/customers/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const customerId = req.params.id;

      const deleteResult = await storage.deleteCustomer(customerId);
      if (!deleteResult) {
        return res.status(404).json({ error: "Customer not found" });
      }

      setCachedData("customers", null);
      res.json({ message: "Customer deleted successfully" });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });

  // Merge customers (Admin only)
  app.post("/api/customers/merge", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { targetId, sourceId } = req.body;
      
      if (!targetId || !sourceId) {
        return res.status(400).json({ error: "Both targetId and sourceId are required" });
      }
      
      const targetCustomer = await storage.getCustomer(targetId);
      const sourceCustomer = await storage.getCustomer(sourceId);
      
      if (!targetCustomer) {
        return res.status(404).json({ error: "Target customer not found" });
      }
      if (!sourceCustomer) {
        return res.status(404).json({ error: "Source customer not found" });
      }
      
      // Merge: fill in missing data from source to target
      const mergedData: any = { ...targetCustomer };
      
      // Fill in missing fields from source
      if (!mergedData.phone && sourceCustomer.phone) mergedData.phone = sourceCustomer.phone;
      if (!mergedData.email && sourceCustomer.email) mergedData.email = sourceCustomer.email;
      if (!mergedData.company && sourceCustomer.company) mergedData.company = sourceCustomer.company;
      if (!mergedData.city && sourceCustomer.city) mergedData.city = sourceCustomer.city;
      if (!mergedData.province && sourceCustomer.province) mergedData.province = sourceCustomer.province;
      if (!mergedData.country && sourceCustomer.country) mergedData.country = sourceCustomer.country;
      if (!mergedData.address1 && sourceCustomer.address1) mergedData.address1 = sourceCustomer.address1;
      if (!mergedData.address2 && sourceCustomer.address2) mergedData.address2 = sourceCustomer.address2;
      if (!mergedData.zip && sourceCustomer.zip) mergedData.zip = sourceCustomer.zip;
      
      // Merge tags
      if (sourceCustomer.tags) {
        const targetTags = mergedData.tags ? mergedData.tags.split(',').map((t: string) => t.trim()) : [];
        const sourceTags = sourceCustomer.tags.split(',').map((t: string) => t.trim());
        const allTags = Array.from(new Set([...targetTags, ...sourceTags])).filter(Boolean);
        mergedData.tags = allTags.join(', ');
      }
      
      // Merge sources
      const targetSources = mergedData.sources || [];
      const sourceSources = sourceCustomer.sources || [];
      mergedData.sources = Array.from(new Set([...targetSources, ...sourceSources]));
      
      // Combine totals
      mergedData.totalOrders = (parseInt(String(mergedData.totalOrders)) || 0) + (parseInt(String(sourceCustomer.totalOrders)) || 0);
      mergedData.totalSpent = (parseFloat(String(mergedData.totalSpent)) || 0) + (parseFloat(String(sourceCustomer.totalSpent)) || 0);
      
      // Merge note
      if (sourceCustomer.note && sourceCustomer.note !== mergedData.note) {
        mergedData.note = mergedData.note 
          ? `${mergedData.note}\n\n--- Merged from ${sourceCustomer.company || sourceCustomer.email} ---\n${sourceCustomer.note}`
          : sourceCustomer.note;
      }
      
      // Update target customer with merged data
      await storage.updateCustomer(targetId, mergedData);
      
      // Delete source customer
      await storage.deleteCustomer(sourceId);
      
      setCachedData("customers", null);
      res.json({ message: "Customers merged successfully", mergedCustomer: mergedData });
    } catch (error) {
      console.error("Error merging customers:", error);
      res.status(500).json({ error: "Failed to merge customers" });
    }
  });

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

  // File Upload Tracking routes
  app.get("/api/file-uploads/:fileType", async (req, res) => {
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
  app.post("/api/admin/upload-product-data", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`Processing upload: ${req.file.originalname}, Size: ${req.file.size} bytes`);

      // Read the uploaded CSV file
      const newCsvContent = safeReadFile(req.file.path);
      if (!newCsvContent) {
        return res.status(400).json({ error: "Failed to read uploaded file. Please ensure the file is not corrupted." });
      }
      
      const targetPath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data.csv');
      
      // Log the upload
      logUpload(req.file.originalname, targetPath, req.file.size);
      
      let mergedContent = newCsvContent;
      let newCount = 0;
      let duplicateCount = 0;
      let updatedCount = 0;
      let totalCount = 0;
      let parseErrors: string[] = [];
      
      // Enhanced CSV parsing with proper quote handling
      const parseProductCSV = (content: string) => {
        try {
          const lines = content.split('\n').filter(line => line.trim());
          if (lines.length === 0) {
            throw new Error("Empty CSV file");
          }
          
          const rows: string[][] = [];
          for (let i = 0; i < lines.length; i++) {
            try {
              // Handle CSV with proper quote parsing
              const line = lines[i];
              const cells: string[] = [];
              let currentCell = '';
              let inQuotes = false;
              let j = 0;
              
              while (j < line.length) {
                const char = line[j];
                const nextChar = line[j + 1];
                
                if (char === '"') {
                  if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    currentCell += '"';
                    j += 2;
                  } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                    j++;
                  }
                } else if (char === ',' && !inQuotes) {
                  // End of cell
                  cells.push(currentCell.trim());
                  currentCell = '';
                  j++;
                } else {
                  currentCell += char;
                  j++;
                }
              }
              
              // Add the last cell
              cells.push(currentCell.trim());
              rows.push(cells);
            } catch (error) {
              parseErrors.push(`Line ${i + 1}: Failed to parse - ${error}`);
              continue;
            }
          }
          
          return rows;
        } catch (error) {
          throw new Error(`CSV parsing failed: ${error}`);
        }
      };
      
      let existingRows: string[][] = [];
      let newRows: string[][] = [];
      
      try {
        newRows = parseProductCSV(newCsvContent);
        console.log(`Parsed ${newRows.length} rows from uploaded file`);
      } catch (error) {
        console.error("Failed to parse uploaded CSV:", error);
        return res.status(400).json({ 
          error: `Failed to parse uploaded CSV file: ${error}`,
          parseErrors: parseErrors.slice(0, 10) // Limit to first 10 errors
        });
      }
      
      if (newRows.length < 2) {
        return res.status(400).json({ 
          error: "CSV file must contain at least a header row and one data row" 
        });
      }
      
      // Check if existing product file exists and merge
      if (safeFileExists(targetPath)) {
        const existingContent = safeReadFile(targetPath);
        if (!existingContent) {
          return res.status(500).json({ error: "Failed to read existing product file" });
        }
        
        try {
          existingRows = parseProductCSV(existingContent);
          console.log(`Found existing file with ${existingRows.length} rows`);
        } catch (error) {
          console.error("Failed to parse existing CSV:", error);
          return res.status(500).json({ 
            error: `Failed to parse existing product data: ${error}` 
          });
        }
        
        if (existingRows.length > 0 && newRows.length > 0) {
          const header = newRows[0]; // Use new header to ensure all columns are included
          const existingData = existingRows.slice(1);
          const newData = newRows.slice(1);
          
          // Create a map for faster lookups - use ProductID (first column) as key
          const existingDataMap = new Map<string, string[]>();
          existingData.forEach(row => {
            const productId = row[0]?.trim();
            if (productId) {
              existingDataMap.set(productId, row);
            }
          });
          
          const finalData: string[][] = [];
          const processedIds = new Set<string>();
          
          // Process each new row
          for (let rowIndex = 0; rowIndex < newData.length; rowIndex++) {
            const newRow = newData[rowIndex];
            const productId = newRow[0]?.trim();
            
            if (!productId) {
              // Check if this row has meaningful data (not just empty fields)
              const hasData = newRow.slice(1).some(cell => cell?.trim());
              if (hasData) {
                console.log(`Row ${rowIndex + 2}: No ProductID but has data - will look for matching existing row`);
                
                // Try to find an existing row with empty ProductID that matches this data pattern
                let foundMatch = false;
                for (const [existingId, existingRow] of Array.from(existingDataMap.entries())) {
                  if (!existingId || existingId === '') {
                    // Check if this existing empty row matches the new row pattern (same ProductName, ProductType, Size)
                    const existingName = existingRow[1]?.trim() || '';
                    const existingType = existingRow[2]?.trim() || '';
                    const existingSize = existingRow[3]?.trim() || '';
                    const newName = newRow[1]?.trim() || '';
                    const newType = newRow[2]?.trim() || '';
                    const newSize = newRow[3]?.trim() || '';
                    
                    if (existingName === newName && existingType === newType && existingSize === newSize) {
                      console.log(`  Found matching existing row with empty ProductID - updating with new data`);
                      let hasUpdates = false;
                      const updatedRow = [...existingRow];
                      
                      // Ensure the updated row has the same length as the new header
                      while (updatedRow.length < header.length) {
                        updatedRow.push('');
                      }
                      
                      // Update all fields with new data
                      for (let i = 0; i < newRow.length && i < updatedRow.length; i++) {
                        const newValue = newRow[i]?.trim() || '';
                        const existingValue = updatedRow[i]?.trim() || '';
                        
                        if (newValue && (existingValue === '' || newValue !== existingValue)) {
                          const actionType = existingValue === '' ? 'added' : 'updated';
                          console.log(`    Field ${i} (${header[i] || 'unknown'}): ${actionType} "${existingValue}" → "${newValue}"`);
                          updatedRow[i] = newValue;
                          hasUpdates = true;
                        }
                      }
                      
                      finalData.push(updatedRow);
                      if (hasUpdates) {
                        updatedCount++;
                      } else {
                        duplicateCount++;
                      }
                      foundMatch = true;
                      existingDataMap.delete(existingId); // Remove from map to avoid duplicate processing
                      break;
                    }
                  }
                }
                
                if (!foundMatch) {
                  parseErrors.push(`Row ${rowIndex + 2}: Missing ProductID and no matching existing row found`);
                }
              } else {
                parseErrors.push(`Row ${rowIndex + 2}: Missing ProductID and no data`);
              }
              continue;
            }
            
            if (processedIds.has(productId)) {
              parseErrors.push(`Row ${rowIndex + 2}: Duplicate ProductID ${productId} in uploaded file`);
              duplicateCount++;
              continue;
            }
            
            processedIds.add(productId);
            
            if (existingDataMap.has(productId)) {
              // Update existing product
              console.log(`Processing existing product: ${productId}`);
              const existingRow = existingDataMap.get(productId);
              if (existingRow) {
                let hasUpdates = false;
                const updatedRow = [...existingRow];
                
                // Ensure the updated row has the same length as the new header
                while (updatedRow.length < header.length) {
                  updatedRow.push('');
                }
                
                // Compare each field and update if new data should be added
                for (let i = 0; i < newRow.length && i < updatedRow.length; i++) {
                  const newValue = newRow[i]?.trim() || '';
                  const existingValue = updatedRow[i]?.trim() || '';
                  
                  // Update in these cases:
                  // 1. Existing field is empty and new value is provided (append missing data)
                  // 2. New value is different from existing value (update existing data)
                  if (newValue && (existingValue === '' || newValue !== existingValue)) {
                    const actionType = existingValue === '' ? 'added' : 'updated';
                    console.log(`  Field ${i} (${header[i] || 'unknown'}): ${actionType} "${existingValue}" → "${newValue}"`);
                    updatedRow[i] = newValue;
                    hasUpdates = true;
                  }
                }
                
                finalData.push(updatedRow);
                if (hasUpdates) {
                  updatedCount++;
                } else {
                  duplicateCount++;
                }
              }
            } else {
              // New product - ensure it has the same number of columns as header
              console.log(`Adding new product: ${productId}`);
              const newProduct = [...newRow];
              while (newProduct.length < header.length) {
                newProduct.push('');
              }
              finalData.push(newProduct);
              newCount++;
            }
          }
          
          // Add any remaining existing products that weren't in the new file
          for (const [productId, existingRow] of Array.from(existingDataMap.entries())) {
            if (!processedIds.has(productId)) {
              // Ensure existing row has the same length as the new header
              const paddedRow = [...existingRow];
              while (paddedRow.length < header.length) {
                paddedRow.push('');
              }
              finalData.push(paddedRow);
            }
          }
          
          totalCount = finalData.length;
          
          // Reconstruct CSV with proper quote escaping
          const escapeCsvCell = (cell: string) => {
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          };
          
          const mergedRows = [header, ...finalData];
          mergedContent = mergedRows.map(row => 
            row.map(escapeCsvCell).join(',')
          ).join('\n');
          
          console.log(`Merge complete: ${newCount} new, ${updatedCount} updated, ${duplicateCount} duplicates`);
        }
      } else {
        // No existing file, count new records
        const dataRows = newRows.slice(1);
        newCount = dataRows.length;
        totalCount = newCount;
        console.log(`New file created with ${newCount} products`);
      }
      
      // Save the merged file
      if (!safeWriteFile(targetPath, mergedContent)) {
        return res.status(500).json({ error: "Failed to save product data file to disk" });
      }
      
      // Clean up the temporary file
      safeDeleteFile(req.file.path);
      
      // Create file upload tracking record
      try {
        await storage.createFileUpload({
          fileName: 'PricePAL_All_Product_Data.csv',
          originalFileName: req.file.originalname,
          fileType: 'product_data',
          fileSize: req.file.size,
          uploadedBy: 'test@4sgraphics.com', // For development
          recordsProcessed: newRows.length - 1,
          recordsAdded: newCount,
          recordsUpdated: updatedCount,
          isActive: true
        });
      } catch (error) {
        console.error('Failed to create file upload record:', error);
      }

      // Refresh data in storage
      console.log('Refreshing product data in storage...');
      try {
        await storage.reinitializeData();
        console.log('Product data storage refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh storage:', error);
      }
      
      console.log(`Product data upload completed: ${newCount} new, ${updatedCount} updated, ${duplicateCount} duplicates`);
      
      // Create detailed success message based on results
      let message = "Product data uploaded successfully";
      if (newCount > 0 && updatedCount > 0 && duplicateCount > 0) {
        message = `Upload complete: ${newCount} new products added, ${updatedCount} existing products updated, ${duplicateCount} duplicates skipped`;
      } else if (newCount > 0 && updatedCount > 0) {
        message = `Upload complete: ${newCount} new products added and ${updatedCount} existing products updated`;
      } else if (newCount > 0 && duplicateCount > 0) {
        message = `Upload complete: ${newCount} new products added, ${duplicateCount} duplicates skipped`;
      } else if (updatedCount > 0 && duplicateCount > 0) {
        message = `Upload complete: ${updatedCount} existing products updated, ${duplicateCount} duplicates skipped`;
      } else if (newCount > 0) {
        message = `Upload complete: ${newCount} new products added successfully`;
      } else if (updatedCount > 0) {
        message = `Upload complete: ${updatedCount} existing products updated successfully`;
      } else if (duplicateCount > 0) {
        message = `Upload complete: All ${duplicateCount} products were duplicates, no changes made`;
      }
      
      const response = {
        success: true,
        message,
        stats: {
          newProducts: newCount,
          updatedProducts: updatedCount,
          duplicatesSkipped: duplicateCount,
          totalProducts: totalCount
        },
        details: {
          filename: req.file.originalname,
          fileSize: req.file.size,
          rowsProcessed: newRows.length - 1,
          parseErrors: parseErrors.length > 0 ? parseErrors.slice(0, 10) : undefined
        }
      };
      
      console.log('Upload response:', JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Error uploading product data:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload product data file" });
    }
  });

  // Upload pricing data file
  app.post("/api/admin/upload-pricing-data", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Read the uploaded CSV file
      const newCsvContent = fs.readFileSync(req.file.path, 'utf-8');
      const targetPath = path.join(process.cwd(), 'attached_assets', 'tier_pricing_template.csv');
      
      let mergedContent = newCsvContent;
      let newCount = 0;
      let updatedCount = 0;
      let duplicateCount = 0;
      let totalCount = 0;
      
      // Check if existing pricing file exists
      if (fs.existsSync(targetPath)) {
        const existingContent = fs.readFileSync(targetPath, 'utf-8');
        
        // Parse both files
        const parsePricingCSV = (content: string) => {
          const lines = content.split('\n').filter(line => line.trim());
          return lines.map(line => line.split(',').map(cell => cell.trim()));
        };
        
        const existingRows = parsePricingCSV(existingContent);
        const newRows = parsePricingCSV(newCsvContent);
        
        if (existingRows.length > 0 && newRows.length > 0) {
          const header = existingRows[0];
          const existingData = existingRows.slice(1);
          const newData = newRows.slice(1);
          
          // Create a map of existing pricing data for duplicate detection and updates
          const existingDataMap = new Map(existingData.map(row => [`${row[0]}_${row[1]}`, row]));
          
          let updatedCount = 0;
          const finalData = [...existingData];
          
          // Process new data to add new records or update existing ones
          for (const newRow of newData) {
            const compositeKey = `${newRow[0]}_${newRow[1]}`;
            
            if (existingDataMap.has(compositeKey)) {
              // Check if any field has new/different data
              const existingRow = existingDataMap.get(compositeKey);
              if (!existingRow) continue;
              let hasUpdates = false;
              const updatedRow = [...existingRow];
              
              // Compare each field and update if new data is not empty and different
              for (let i = 0; i < newRow.length && i < existingRow!.length; i++) {
                const newValue = newRow[i]?.trim() || '';
                const existingValue = existingRow![i]?.trim() || '';
                
                // Update if new value is not empty and different from existing
                if (newValue && newValue !== existingValue) {
                  updatedRow[i] = newValue;
                  hasUpdates = true;
                }
              }
              
              if (hasUpdates) {
                // Find and update the record in finalData
                const index = finalData.findIndex(row => `${row[0]}_${row[1]}` === compositeKey);
                if (index !== -1) {
                  finalData[index] = updatedRow;
                  updatedCount++;
                }
              } else {
                duplicateCount++;
              }
            } else {
              // New pricing entry
              finalData.push(newRow);
              newCount++;
            }
          }
          
          totalCount = finalData.length;
          
          // Reconstruct CSV
          const mergedRows = [header, ...finalData];
          mergedContent = mergedRows.map(row => row.join(',')).join('\n');
        }
      } else {
        // No existing file, count new records
        const lines = newCsvContent.split('\n').filter(line => line.trim());
        newCount = lines.length - 1; // Subtract header
        totalCount = newCount;
      }
      
      // Save the merged file
      if (!safeWriteFile(targetPath, mergedContent)) {
        return res.status(500).json({ error: "Failed to save pricing data file" });
      }
      
      // Clean up the temporary file
      safeDeleteFile(req.file.path);
      
      // Clear pricing-related caches
      cache.delete('pricing-tiers');
      cache.delete('product-pricing');
      
      // Reinitialize storage with new data
      await storage.reinitializeData();
      
      console.log(`Pricing data upload completed: ${newCount} new, ${updatedCount} updated, ${duplicateCount} duplicates skipped, ${totalCount} total`);
      
      // Create appropriate message based on results
      let message = "Pricing data uploaded successfully";
      if (newCount > 0 && updatedCount > 0 && duplicateCount > 0) {
        message = `Pricing data uploaded: ${newCount} new entries added, ${updatedCount} entries updated, ${duplicateCount} duplicates not imported`;
      } else if (newCount > 0 && updatedCount > 0) {
        message = `Pricing data uploaded: ${newCount} new entries added, ${updatedCount} entries updated`;
      } else if (newCount > 0 && duplicateCount > 0) {
        message = `Pricing data uploaded: ${newCount} new entries added, ${duplicateCount} duplicates not imported`;
      } else if (updatedCount > 0 && duplicateCount > 0) {
        message = `Pricing data uploaded: ${updatedCount} entries updated, ${duplicateCount} duplicates not imported`;
      } else if (newCount > 0) {
        message = `Pricing data uploaded: ${newCount} new entries added successfully`;
      } else if (updatedCount > 0) {
        message = `Pricing data uploaded: ${updatedCount} entries updated successfully`;
      } else if (duplicateCount > 0) {
        message = `Upload completed: ${duplicateCount} duplicate entries found and not imported. No changes made.`;
      }
      
      res.json({ 
        message,
        stats: {
          newPricingEntries: newCount,
          updatedPricingEntries: updatedCount || 0,
          duplicatesSkipped: duplicateCount,
          totalPricingEntries: totalCount
        }
      });
    } catch (error) {
      console.error("Error uploading pricing data:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload pricing data file" });
    }
  });

  // Upload customer data file (Admin only)
  app.post("/api/admin/upload-customer-data", isAuthenticated, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Read the uploaded CSV file
      const csvContent = fs.readFileSync(req.file.path, 'utf-8');
      
      // Use the customer parser to process the CSV
      const { parseCustomerCSV } = await import("./customer-parser");
      const { newCustomers, updatedCustomers, errors } = await parseCustomerCSV(csvContent);
      
      // Save the uploaded file for records
      const targetPath = path.join(process.cwd(), 'attached_assets', 'customer-data_' + Date.now() + '.csv');
      fs.writeFileSync(targetPath, csvContent);
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      // Clear cache to ensure fresh customer data
      setCachedData("customers", null);

      let message: string;
      if (errors.length > 0) {
        message = `Customer data uploaded with ${errors.length} errors: ${newCustomers} new customers added, ${updatedCustomers} customers updated. Check logs for error details.`;
      } else if (newCustomers > 0 && updatedCustomers > 0) {
        message = `Customer data uploaded successfully: ${newCustomers} new customers added, ${updatedCustomers} customers updated`;
      } else if (newCustomers > 0) {
        message = `Customer data uploaded successfully: ${newCustomers} new customers added`;
      } else if (updatedCustomers > 0) {
        message = `Customer data uploaded successfully: ${updatedCustomers} customers updated`;
      } else {
        message = "No customers were processed. Please check the file format.";
      }

      res.json({ 
        message,
        stats: {
          newCustomers,
          updatedCustomers,
          errors: errors.length,
          totalCustomers: newCustomers + updatedCustomers
        }
      });
    } catch (error) {
      console.error("Error uploading customer data:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload customer data file" });
    }
  });

  // Upload Odoo Excel file (Admin only)
  app.post("/api/admin/upload-odoo-contacts", isAuthenticated, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Read the uploaded Excel file as buffer
      const fileBuffer = fs.readFileSync(req.file.path);
      
      // Use the Odoo parser to process the Excel file
      const { parseOdooExcel } = await import("./odoo-parser");
      const { newCustomers, updatedCustomers, errors } = await parseOdooExcel(fileBuffer);
      
      // Save the uploaded file for records
      const targetPath = path.join(process.cwd(), 'attached_assets', 'odoo-contacts_' + Date.now() + '.xlsx');
      fs.writeFileSync(targetPath, fileBuffer);
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      // Clear cache to ensure fresh customer data
      setCachedData("customers", null);

      let message: string;
      if (errors.length > 0) {
        message = `Odoo contacts uploaded with ${errors.length} errors: ${newCustomers} new customers added, ${updatedCustomers} customers updated. Check logs for error details.`;
      } else if (newCustomers > 0 && updatedCustomers > 0) {
        message = `Odoo contacts uploaded successfully: ${newCustomers} new customers added, ${updatedCustomers} customers updated`;
      } else if (newCustomers > 0) {
        message = `Odoo contacts uploaded successfully: ${newCustomers} new customers added`;
      } else if (updatedCustomers > 0) {
        message = `Odoo contacts uploaded successfully: ${updatedCustomers} customers updated`;
      } else {
        message = "No customers were processed. Please check the file format.";
      }

      res.json({ 
        message,
        stats: {
          newCustomers,
          updatedCustomers,
          errors: errors.length,
          totalCustomers: newCustomers + updatedCustomers
        }
      });
    } catch (error) {
      console.error("Error uploading Odoo contacts:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to upload Odoo contacts file" });
    }
  });

  // Upload pricing CSV for Price Management (REPLACED - See line 2296 for active endpoint)
  app.post("/api/upload-pricing-csv-OLD", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`Processing pricing upload: ${req.file.originalname}, Size: ${req.file.size} bytes`);

      // Read the uploaded CSV file
      const csvContent = fs.readFileSync(req.file.path, 'utf-8');
      
      // Parse CSV content
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV file must contain at least a header and one data row" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1);
      
      let newRecords = 0;
      let updatedRecords = 0;
      
      for (const row of dataRows) {
        // Handle CSV parsing more carefully - handle quoted values and dollar signs
        const values = [];
        let currentValue = '';
        let inQuotes = false;
        
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(currentValue.trim().replace(/"/g, '').replace(/\$/g, '').replace(/\s+$/, ''));
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        
        // Don't forget the last value
        if (currentValue) {
          values.push(currentValue.trim().replace(/"/g, '').replace(/\$/g, '').replace(/\s+$/, ''));
        }
        
        if (values.length !== headers.length) {
          console.warn(`Skipping row with incorrect number of columns. Expected ${headers.length}, got ${values.length}: ${row.substring(0, 100)}...`);
          continue;
        }
        
        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index];
        });
        
        // Map CSV data to database schema (ensure all prices are strings)
        const pricingEntry = {
          productId: rowData.productId || '',
          productType: rowData.productType || '',
          exportPrice: rowData.EXPORT_pricePerSqm ? String(rowData.EXPORT_pricePerSqm) : null,
          masterDistributorPrice: rowData.MASTER_DISTRIBUTOR_pricePerSqm ? String(rowData.MASTER_DISTRIBUTOR_pricePerSqm) : null,
          dealerPrice: rowData.DEALER_pricePerSqm ? String(rowData.DEALER_pricePerSqm) : null,
          dealer2Price: rowData.DEALER_2_pricePerSqm ? String(rowData.DEALER_2_pricePerSqm) : null,
          approvalRetailPrice: rowData.Approval_Retail__pricePerSqm ? String(rowData.Approval_Retail__pricePerSqm) : null,
          stage25Price: rowData.Stage25_pricePerSqm ? String(rowData.Stage25_pricePerSqm) : null,
          stage2Price: rowData.Stage2_pricePerSqm ? String(rowData.Stage2_pricePerSqm) : null,
          stage15Price: rowData.Stage15_pricePerSqm ? String(rowData.Stage15_pricePerSqm) : null,
          stage1Price: rowData.Stage1_pricePerSqm ? String(rowData.Stage1_pricePerSqm) : null,
          retailPrice: rowData.Retail_pricePerSqm ? String(rowData.Retail_pricePerSqm) : null,
        };
        
        try {
          // Use productPricingMaster table instead
          await storage.createProductPricingMaster({
            itemCode: pricingEntry.productId,
            productName: pricingEntry.productType,
            productType: pricingEntry.productType,
            size: '',
            totalSqm: '0',
            minQuantity: '1',
            exportPrice: parseFloat(pricingEntry.exportPrice || '0'),
            masterDistributorPrice: parseFloat(pricingEntry.masterDistributorPrice || '0'),
            dealerPrice: parseFloat(pricingEntry.dealerPrice || '0'),
            dealer2Price: parseFloat(pricingEntry.dealer2Price || '0'),
            approvalNeededPrice: parseFloat(pricingEntry.approvalRetailPrice || '0'),
            tierStage25Price: parseFloat(pricingEntry.stage25Price || '0'),
            tierStage2Price: parseFloat(pricingEntry.stage2Price || '0'),
            tierStage15Price: parseFloat(pricingEntry.stage15Price || '0'),
            tierStage1Price: parseFloat(pricingEntry.stage1Price || '0'),
            retailPrice: parseFloat(pricingEntry.retailPrice || '0'),
            uploadBatch: `batch-${Date.now()}`
          });
          newRecords++;
        } catch (error) {
          console.error(`Error processing pricing data for ${pricingEntry.productId}:`, error);
        }
      }
      
      // Clean up the temporary file
      fs.unlinkSync(req.file.path);
      
      console.log(`Pricing upload complete: ${newRecords} new, ${updatedRecords} updated`);
      
      res.json({ 
        success: true,
        newRecords,
        updatedRecords,
        totalProcessed: newRecords + updatedRecords,
        message: `Upload successful! ${newRecords} new entries added, ${updatedRecords} entries updated`
      });
    } catch (error) {
      console.error("Error uploading pricing data:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload pricing data file" });
    }
  });

  // Get pricing data for Price Management
  app.get("/api/pricing-data", async (req, res) => {
    try {
      const pricingData = await storage.getProductPricingMaster();
      res.json(pricingData);
    } catch (error) {
      console.error("Error fetching pricing data:", error);
      res.status(500).json({ error: "Failed to fetch pricing data" });
    }
  });

  // Update pricing data entry
  app.patch("/api/pricing-data/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updatedEntry = await storage.upsertProductPricingMaster({ id: parseInt(id), ...updates });
      
      if (!updatedEntry) {
        return res.status(404).json({ error: "Pricing entry not found" });
      }
      
      res.json(updatedEntry);
    } catch (error) {
      console.error("Error updating pricing data:", error);
      res.status(500).json({ error: "Failed to update pricing data" });
    }
  });

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
  app.post("/api/admin/upload-competitor-data", requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      
      // Parse CSV content
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV file must contain at least a header and one data row" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1);
      
      let uploadedCount = 0;
      
      for (const row of dataRows) {
        const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
        
        if (values.length !== headers.length) {
          console.warn(`Skipping row with incorrect number of columns: ${row}`);
          continue;
        }
        
        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index];
        });
        
        // Parse dimensions to extract width and length
        const dimensionsMatch = (rowData.Width && rowData.Length) ? 
          null : (rowData.dimensions || '').match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches|ft|feet|"|')\s*[×x]\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|ft|feet|"|')/);
        
        const width = parseFloat(rowData.Width || rowData.width || (dimensionsMatch ? dimensionsMatch[1] : '0')) || 0;
        const length = parseFloat(rowData.Length || rowData.length || (dimensionsMatch ? dimensionsMatch[2] : '0')) || 0;
        
        // Map CSV columns to database fields (flexible header mapping)
        const competitorData = {
          type: rowData.Type || rowData.type || rowData.Product_Type || 'sheets',
          dimensions: rowData.dimensions || rowData.Dimensions || rowData.Size || `${width} x ${length} in`,
          width: width,
          length: length,
          unit: rowData.unit || rowData.Unit || 'in',
          packQty: parseInt(rowData['Pack Qty'] || rowData.packQty || rowData.PackQty || rowData.Pack_Qty || '1') || 1,
          inputPrice: parseFloat(String(rowData['Input Price'] || rowData.inputPrice || rowData.InputPrice || rowData.Input_Price || '0').replace(/[$,]/g, '')) || 0,
          thickness: rowData.Thickness || rowData.thickness || '',
          productKind: rowData['Product Kind'] || rowData.productKind || rowData.ProductKind || rowData.Product_Kind || '',
          surfaceFinish: rowData['Surface Finish'] || rowData.surfaceFinish || rowData.SurfaceFinish || rowData.Surface_Finish || '',
          supplierInfo: rowData['Supplier Info'] || rowData.supplierInfo || rowData.SupplierInfo || rowData.Supplier_Info || rowData.Supplier || '',
          infoReceivedFrom: rowData['Info Received From'] || rowData.infoReceivedFrom || rowData.InfoReceivedFrom || rowData.Info_Received_From || '',
          pricePerSqIn: parseFloat(String(rowData['Price/in²'] || rowData.pricePerSqIn || rowData.PricePerSqIn || rowData.Price_Per_SqIn || '0').replace(/[$,]/g, '')) || 0,
          pricePerSqFt: parseFloat(String(rowData['Price/ft²'] || rowData.pricePerSqFt || rowData.PricePerSqFt || rowData.Price_Per_SqFt || '0').replace(/[$,]/g, '')) || 0,
          pricePerSqMeter: parseFloat(String(rowData['Price/m²'] || rowData.pricePerSqMeter || rowData.PricePerSqMeter || rowData.Price_Per_SqMeter || '0').replace(/[$,]/g, '')) || 0,
          notes: rowData.Notes || rowData.notes || rowData.Comments || '',
          source: rowData.source || rowData.Source || 'Admin CSV Upload',
          addedBy: 'admin' // Required field for admin uploads
        };
        
        try {
          await storage.createCompetitorPricing(competitorData as any);
          uploadedCount++;
        } catch (error) {
          console.error(`Error saving competitor pricing data:`, error);
        }
      }
      
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      
      res.json({ 
        message: `Competitor pricing data uploaded successfully. ${uploadedCount} entries added and are now visible to all users.`,
        count: uploadedCount 
      });
    } catch (error) {
      console.error("Error uploading competitor pricing data:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload competitor pricing data file" });
    }
  });

  // Download product data
  app.get("/api/admin/download-product-data", async (req, res) => {
    try {
      const filePath = path.join(process.cwd(), 'attached_assets', 'PricePAL_All_Product_Data.csv');
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Product data file not found" });
      }
      
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="product-data.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error downloading product data:", error);
      res.status(500).json({ error: "Failed to download product data" });
    }
  });

  // Download pricing data
  app.get("/api/admin/download-pricing-data", async (req, res) => {
    try {
      const filePath = path.join(process.cwd(), 'attached_assets', 'tier_pricing_template.csv');
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Pricing data file not found" });
      }
      
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="pricing-data.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error downloading pricing data:", error);
      res.status(500).json({ error: "Failed to download pricing data" });
    }
  });

  // Download customer data
  app.get("/api/admin/download-customer-data", async (req, res) => {
    try {
      const filePath = path.join(process.cwd(), 'attached_assets', 'customers_export.csv');
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Customer data file not found" });
      }
      
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="customer-data.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error downloading customer data:", error);
      res.status(500).json({ error: "Failed to download customer data" });
    }
  });

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
    console.log('=== PDF GENERATION START ===');
    console.log('User:', req.user?.claims?.email || 'unknown');
    console.log('Request body keys:', Object.keys(req.body || {}));
    
    try {
      const { customerName, customerEmail, quoteItems, sentVia } = req.body;
      
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
      
      // Calculate totals (no tax)
      const totalAmount = quoteItems.reduce((sum: number, item: any) => sum + item.total, 0);
      
      // Save quote to database (non-blocking - don't wait for it)
      storage.upsertSentQuote({
        quoteNumber: finalQuoteNumber,
        customerName,
        customerEmail: customerEmail || null,
        quoteItems: JSON.stringify(quoteItems),
        totalAmount: totalAmount.toString(),
        sentVia: sentVia || 'pdf',
        status: 'sent'
      }).catch(err => console.error('Failed to save quote:', err));
      
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
      const boxHeight = 80;
      
      // Customer Box (left)
      doc.rect(leftMargin, yPos, boxWidth, boxHeight).stroke(borderColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Customer', leftMargin + 8, yPos + 8);
      doc.fontSize(9).font('Helvetica').fillColor(textDark);
      doc.text(customerName, leftMargin + 8, yPos + 24, { width: boxWidth - 16 });
      if (customerEmail) {
        doc.text(customerEmail, leftMargin + 8, yPos + 50, { width: boxWidth - 16 });
      }
      
      // Invoicing address Box (middle)
      const box2X = leftMargin + boxWidth + 10;
      doc.rect(box2X, yPos, boxWidth, boxHeight).stroke(borderColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Invoicing address', box2X + 8, yPos + 8);
      doc.fontSize(9).font('Helvetica').fillColor(textDark);
      doc.text(customerName, box2X + 8, yPos + 24, { width: boxWidth - 16 });
      
      // Shipping Address Box (right)
      const box3X = leftMargin + (boxWidth + 10) * 2;
      doc.rect(box3X, yPos, boxWidth, boxHeight).stroke(borderColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Shipping Address', box3X + 8, yPos + 8);
      doc.fontSize(9).font('Helvetica').fillColor(textDark);
      doc.text(customerName, box3X + 8, yPos + 24, { width: boxWidth - 16 });

      // === ORDER INFO ROW ===
      yPos = 195;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(textDark);
      doc.text('PO', leftMargin, yPos);
      doc.text('Order Date', leftMargin + 180, yPos);
      doc.text('Salesperson', leftMargin + 360, yPos);
      
      doc.fontSize(10).font('Helvetica').fillColor(textDark);
      doc.text('QuickQuote', leftMargin, yPos + 14);
      doc.text(new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }), leftMargin + 180, yPos + 14);
      doc.text(salesperson, leftMargin + 360, yPos + 14);

      // === PRODUCT TABLE ===
      yPos = 250;
      
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
          yPos = 50;
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
      doc.text('Page 1 / 1', leftMargin, footerY + 26, { align: 'center', width: contentWidth });
      
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

  // Send email quote
  app.post("/api/send-email-quote", isAuthenticated, async (req: any, res) => {
    try {
      const { customerName, customerEmail, quoteItems } = req.body;
      
      if (!customerName || !customerEmail || !quoteItems || !Array.isArray(quoteItems) || quoteItems.length === 0) {
        return res.status(400).json({ error: "Customer name, email, and quote items are required" });
      }

      // Generate quote number using the utility function
      const quoteNumber = generateQuoteNumber();
      
      // Calculate total
      const totalAmount = quoteItems.reduce((sum: number, item: any) => sum + item.total, 0);
      
      // Save quote to database
      await storage.createSentQuote({
        quoteNumber,
        customerName,
        customerEmail,
        quoteItems: JSON.stringify(quoteItems),
        totalAmount: totalAmount.toString(),
        sentVia: 'email',
        status: 'sent'
      });
      
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





  // Get all sent quotes
  app.get("/api/sent-quotes", async (req, res) => {
    try {
      const quotes = await storage.getSentQuotes();
      res.json(quotes);
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
      
      console.log("=== VALIDATION DETAILS ===");
      console.log("Received data:", JSON.stringify(pricingData, null, 2));
      
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
      
      // Read the uploaded CSV file
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      console.log('CSV Content:', csvContent.substring(0, 500) + '...');
      
      // Parse CSV content
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
      
      const headers = parseCSVRow(lines[0]);
      const dataRows = lines.slice(1);
      
      console.log('Headers:', headers);
      console.log('Data rows:', dataRows.length);
      
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
        const row = dataRows[i];
        console.log(`Processing row ${i + 1}:`, row);
        
        const values = parseCSVRow(row);
        console.log('Values:', values);
        
        if (values.length !== headers.length) {
          console.warn(`Skipping row with incorrect number of columns: ${row}`);
          continue;
        }
        
        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index];
        });
        
        console.log('Row data:', rowData);
        
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
        
        console.log('Final competitor data:', JSON.stringify(competitorData, null, 2));
        
        // Check for duplicate before saving
        const newFingerprint = createFingerprint(competitorData);
        if (existingFingerprints.has(newFingerprint)) {
          console.log(`Skipping duplicate row ${i + 1}`);
          skippedDuplicates++;
          continue;
        }
        
        try {
          const savedEntry = await storage.createCompetitorPricing(competitorData as any);
          console.log('Successfully saved entry:', JSON.stringify(savedEntry, null, 2));
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

  // Get sent quote by ID
  app.get("/api/sent-quotes/:id", async (req, res) => {
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

  // Save a new quote or update existing method
  app.post("/api/sent-quotes", isAuthenticated, async (req: any, res) => {
    try {
      const { quoteNumber, customerName, customerEmail, quoteItems, totalAmount, sentVia } = req.body;
      
      if (!quoteNumber || !customerName || !quoteItems || !totalAmount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Default sentVia to "Not Known" if missing or empty
      const finalSentVia = sentVia && sentVia.trim() ? sentVia.trim() : "Not Known";

      // Check if quote already exists
      const existingQuotes = await storage.getSentQuotes();
      const existingQuote = existingQuotes.find(q => q.quoteNumber === quoteNumber);
      
      if (existingQuote) {
        // Update the existing quote with new delivery method
        const updatedSentVia = existingQuote.sentVia.includes(finalSentVia) 
          ? existingQuote.sentVia 
          : existingQuote.sentVia + `, ${finalSentVia}`;
        
        // For now, we'll just return the existing quote since we don't have an update method
        // In a real database, we would update the sentVia field
        res.json(existingQuote);
      } else {
        // Create new quote
        const newQuote = await storage.createSentQuote({
          quoteNumber,
          customerName,
          customerEmail: customerEmail || null,
          quoteItems: JSON.stringify(quoteItems),
          totalAmount: totalAmount.toString(),
          sentVia: finalSentVia,
          status: 'sent'
        });
        
        res.json(newQuote);
      }
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

  // DEPRECATED: Upload pricing CSV - Use routes-pricing-database.ts instead
  app.post("/api/upload-pricing-csv-deprecated", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileContent = fs.readFileSync(req.file.path, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV file must have header and at least one data row" });
      }

      // Enhanced CSV parsing to handle quoted fields properly
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
          const char = line[i];
          
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              // Escaped quote
              current += '"';
              i += 2;
            } else {
              // Toggle quote mode
              inQuotes = !inQuotes;
              i++;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
            i++;
          } else {
            current += char;
            i++;
          }
        }
        
        result.push(current.trim());
        return result;
      };

      // Clear existing pricing data first
      console.log("Clearing existing pricing data...");
      await storage.clearAllProductPricingMaster();
      
      // Parse CSV data - batch insert approach
      let newRecords = 0;
      const recordsToInsert = [];

      console.log(`Processing ${lines.length - 1} data rows from CSV`);

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line).map(v => v.replace(/^\$/, '').trim());
        
        if (values.length < 2) {
          console.log(`Row ${i}: Skipping - insufficient columns (${values.length})`);
          continue;
        }

        const record = {
          productId: values[0] || '',
          productType: values[1] || '',
          exportPrice: values[2] ? parseFloat(values[2]) || null : null,
          masterDistributorPrice: values[3] ? parseFloat(values[3]) || null : null,
          dealerPrice: values[4] ? parseFloat(values[4]) || null : null,
          dealer2Price: values[5] ? parseFloat(values[5]) || null : null,
          approvalRetailPrice: values[6] ? parseFloat(values[6]) || null : null,
          stage25Price: values[7] ? parseFloat(values[7]) || null : null,
          stage2Price: values[8] ? parseFloat(values[8]) || null : null,
          stage15Price: values[9] ? parseFloat(values[9]) || null : null,
          stage1Price: values[10] ? parseFloat(values[10]) || null : null,
          retailPrice: values[11] ? parseFloat(values[11]) || null : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (record.productId && record.productType) {
          recordsToInsert.push(record);
        }
      }

      // DEPRECATED: Use productPricingMaster table instead
      debugLog(`Would have inserted ${recordsToInsert.length} records into deprecated table`);
      if (recordsToInsert.length > 0) {
        // Redirect to new productPricingMaster system
        for (const record of recordsToInsert) {
          await storage.createProductPricingMaster({
            itemCode: record.productId,
            productType: record.productType,
            exportPrice: record.exportPrice || 0,
            masterDistributorPrice: record.masterDistributorPrice || 0,
            dealerPrice: record.dealerPrice || 0,
            dealer2Price: record.dealer2Price || 0,
            tierApprovalRetailPrice: record.approvalRetailPrice || 0,
            tierStage25Price: record.stage25Price || 0,
            tierStage2Price: record.stage2Price || 0,
            tierStage15Price: record.stage15Price || 0,
            tierStage1Price: record.stage1Price || 0,
            tierRetailPrice: record.retailPrice || 0
          });
          newRecords++;
        }
        debugLog(`Successfully processed ${newRecords} pricing records`);
      }

      const updatedRecords = 0; // Since we're doing fresh insert

      // After uploading to productPricingMaster table, sync complete
      debugLog(`\nPricing data sync to productPricingMaster complete`);
      // Note: syncPricingDataToProductPricing() is deprecated
      
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      res.json({
        success: true,
        message: "Pricing data uploaded successfully",
        newRecords,
        updatedRecords,
        totalProcessed: newRecords + updatedRecords
      });

    } catch (error) {
      console.error("Error uploading pricing CSV:", error);
      res.status(500).json({ error: "This endpoint is deprecated. Use /api/upload-pricing-database instead." });
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
  
  // Add database-backed pricing routes
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

      // Configure html-pdf-node for MAXIMUM SPEED in Replit environment
      const options = {
        format: 'A4',
        margin: { top: "15px", right: "15px", bottom: "15px", left: "15px" },
        printBackground: true,
        preferCSSPageSize: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-first-run',
          '--disable-infobars',
          '--disable-breakpad',
          '--disable-canvas-aa',
          '--disable-2d-canvas-clip-aa',
          '--disable-gl-drawing-for-tests',
          '--disable-threaded-animation',
          '--disable-threaded-scrolling',
          '--disable-in-process-stack-traces',
          '--disable-histogram-customizer',
          '--disable-gl-extensions',
          '--disable-composited-antialiasing'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        timeout: 15000 // 15 second timeout instead of default 30s
      };

      console.log('🖥️ Starting Chromium PDF generation with path:', process.env.PUPPETEER_EXECUTABLE_PATH);

      // Generate PDF
      const file = { content: html };
      const pdfBuffer = await pdf.generatePdf(file, options);

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

      // Import xlsx library
      const XLSX = await import('xlsx');

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

      const worksheetData = [headers];

      // Generate pricelist ID from tier and category (sanitized for ODOO)
      const sanitizedCategory = selectedCategory.replace(/[^\w]/g, '_').replace(/_+/g, '_');
      const pricelistExternalId = `pricelist_${selectedTier}_${sanitizedCategory}`;
      const pricelistDisplayName = tierLabel || selectedTier;

      priceListItems.forEach((item, index) => {
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

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

      // Set column widths for better readability
      worksheet['!cols'] = [
        { wch: 25 },  // External ID
        { wch: 20 },  // Pricelist Name
        { wch: 25 },  // Apply On
        { wch: 50 },  // Product
        { wch: 20 },  // Min. Quantity
        { wch: 15 },  // Start Date
        { wch: 15 },  // End Date
        { wch: 25 },  // Compute Price
        { wch: 15 },  // Fixed Price
        { wch: 20 },  // Percentage Price
        { wch: 15 },  // Based on
        { wch: 20 },  // Other Pricelist
        { wch: 18 },  // Price Discount
        { wch: 18 },  // Price Surcharge
        { wch: 18 },  // Price Rounding
        { wch: 20 },  // Min. Price Margin
        { wch: 20 }   // Max. Price Margin
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });

      // Set headers for Excel download
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="PriceList_ODOO_${selectedCategory}_${pricelistDisplayName}_${new Date().toISOString().split('T')[0]}.xls"`);

      // Send the Excel file
      res.send(buffer);

      logDownload(`PriceList_ODOO_${selectedCategory}_${selectedTier}.xls`, 'ODOO Excel format generation');

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

      // Import xlsx library for proper Excel generation
      const XLSX = await import('xlsx');

      // Create worksheet data
      const worksheetData = [];
      
      // Add headers
      const headers = ['Item Code', 'Product Type', 'Size', 'Min Qty'];
      
      // Only add Price/Sq.M column for admin users
      if (userRole === 'admin') {
        headers.push('Price/Sq.M');
      }
      
      headers.push('Price/Unit', 'Price Per Pack');
      worksheetData.push(headers);

      // Add data rows
      priceListItems.forEach(item => {
        const row = [
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

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      
      // Auto-fit column widths
      const colWidths = headers.map((header, i) => {
        const maxLength = Math.max(
          header.length,
          ...worksheetData.slice(1).map(row => String(row[i]).length)
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      worksheet['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Price List');

      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { 
        type: 'buffer', 
        bookType: 'xlsx',
        compression: true 
      });

      // Set headers for Excel download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="PriceList_Full_${selectedCategory}_${selectedTier}_${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.setHeader('Content-Length', excelBuffer.length.toString());

      // Send the Excel buffer
      res.send(excelBuffer);

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
  app.get("/api/parsed-contacts", async (req, res) => {
    try {
      const contacts = await storage.getParsedContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching parsed contacts:", error);
      res.status(500).json({ error: "Failed to fetch parsed contacts" });
    }
  });

  app.get("/api/parsed-contacts/:id", async (req, res) => {
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

  app.post("/api/parsed-contacts", async (req, res) => {
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

  app.put("/api/parsed-contacts/:id", async (req, res) => {
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

  app.delete("/api/parsed-contacts/:id", async (req, res) => {
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
  app.post("/api/fetch-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Validate URL
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }
      
      // Fetch the URL content
      const response = await fetch(url);
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
  app.get("/api/email/labels", isAuthenticated, async (req, res) => {
    try {
      const { getLabels } = await import("./gmail-client");
      const labels = await getLabels();
      res.json(labels);
    } catch (error) {
      console.error("Error fetching email labels:", error);
      res.status(500).json({ error: "Failed to fetch email labels" });
    }
  });
  
  // Get messages from a label (default: INBOX)
  app.get("/api/email/messages", isAuthenticated, async (req, res) => {
    try {
      const { getMessages } = await import("./gmail-client");
      const label = (req.query.label as string) || 'INBOX';
      const maxResults = parseInt(req.query.maxResults as string) || 20;
      const messages = await getMessages(label, maxResults);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching email messages:", error);
      res.status(500).json({ error: "Failed to fetch email messages" });
    }
  });
  
  // Get single message with full body
  app.get("/api/email/messages/:id", isAuthenticated, async (req, res) => {
    try {
      const { getMessage } = await import("./gmail-client");
      const message = await getMessage(req.params.id);
      res.json(message);
    } catch (error) {
      console.error("Error fetching email message:", error);
      res.status(500).json({ error: "Failed to fetch email message" });
    }
  });
  
  // Send an email
  app.post("/api/email/send", isAuthenticated, async (req: any, res) => {
    try {
      const { sendEmail } = await import("./gmail-client");
      const { to, subject, body, htmlBody } = req.body;
      
      if (!to || !subject || !body) {
        return res.status(400).json({ error: "Missing required fields: to, subject, body" });
      }
      
      const result = await sendEmail(to, subject, body, htmlBody);
      
      // Log the email activity
      await storage.logActivity({
        userId: req.user?.claims?.sub || 'anonymous',
        activityType: 'email_sent',
        description: `Email sent to ${to}: ${subject}`,
        metadata: { to, subject }
      });
      
      res.json({ success: true, messageId: result.id });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
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

  // Notion Products (locally synced)
  app.get("/api/notion-products", isAuthenticated, async (req, res) => {
    try {
      const products = await storage.getNotionProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
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
    console.log("=== POST /api/crm/journeys received ===");
    console.log("Request body:", req.body);
    try {
      const validatedData = insertCustomerJourneySchema.parse(req.body);
      console.log("Validated data:", validatedData);
      const journey = await storage.upsertCustomerJourney(validatedData);
      console.log("Created journey:", journey);
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

  app.post("/api/crm/sample-requests", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSampleRequestSchema.parse(req.body);
      const request = await storage.createSampleRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating sample request:", error);
      res.status(500).json({ error: "Failed to create sample request" });
    }
  });

  app.put("/api/crm/sample-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSampleRequestSchema.partial().parse(req.body);
      const request = await storage.updateSampleRequest(parseInt(req.params.id), validatedData);
      if (!request) {
        return res.status(404).json({ error: "Sample request not found" });
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

  // Test Outcomes
  app.get("/api/crm/test-outcomes", isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const outcomes = await storage.getTestOutcomes(customerId);
      res.json(outcomes);
    } catch (error) {
      console.error("Error fetching test outcomes:", error);
      res.status(500).json({ error: "Failed to fetch test outcomes" });
    }
  });

  app.post("/api/crm/test-outcomes", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertTestOutcomeSchema.parse(req.body);
      const outcome = await storage.createTestOutcome(validatedData);
      res.status(201).json(outcome);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating test outcome:", error);
      res.status(500).json({ error: "Failed to create test outcome" });
    }
  });

  app.put("/api/crm/test-outcomes/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertTestOutcomeSchema.partial().parse(req.body);
      const outcome = await storage.updateTestOutcome(parseInt(req.params.id), validatedData);
      if (!outcome) {
        return res.status(404).json({ error: "Test outcome not found" });
      }
      res.json(outcome);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating test outcome:", error);
      res.status(500).json({ error: "Failed to update test outcome" });
    }
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
      const validatedData = insertPriceListEventSchema.parse(req.body);
      const event = await storage.createPriceListEvent(validatedData);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating price list event:", error);
      res.status(500).json({ error: "Failed to create price list event" });
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
          // Don't fail the whole request, just log the error
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
  app.put("/api/crm/journey-instances/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertCustomerJourneyInstanceSchema.partial().parse(req.body);
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
  });

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

  // Catch-all for unmatched API routes - return JSON 404 instead of HTML
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.path}` });
  });

  const httpServer = createServer(app);
  return httpServer;
}
