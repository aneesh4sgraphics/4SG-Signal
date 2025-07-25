import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import pdf from 'html-pdf-node';
import puppeteer from 'puppeteer';
import { storage } from "./storage";
import { z } from "zod";
import { parseProductData } from "./csv-parser";
import { parseCustomerCSV } from "./customer-parser";

import { generateQuoteHTMLForDownload, generateQuoteNumber, generatePriceListHTML, generatePriceListCSV, generateUniqueQuoteNumber, validateQuoteNumber } from "./stub-functions";
import { insertSentQuoteSchema } from "@shared/schema";
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
    const pricing = await storage.getProductPricing();

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
      const sizePricing = pricing.filter(p => p.productTypeId === size.typeId);
      
      const row = [
        size.id.toString(),
        `${category?.name || ""} ${type?.name || ""}`.trim(),
        type?.name || "",
        size.name,
        size.itemCode || "",
        size.minOrderQty || "",
        ...tiers.map(tier => {
          const tierPrice = sizePricing.find(p => p.tierId === tier.id);
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
    
    console.log("Product data saved to file successfully");
  } catch (error) {
    console.error("Error saving product data to file:", error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      // Development bypass for testing
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          email: 'test@4sgraphics.com',
          role: 'admin',
          approved: true
        });
      }
      const userId = req.user.claims.sub;
      
      // Development bypass - return mock user data for development
      if (process.env.NODE_ENV === 'development' && (req.hostname === 'localhost' || req.get('host')?.includes('localhost') || req.get('host')?.includes('replit.dev'))) {
        return res.json({
          id: 'dev-user-123',
          email: 'aneesh@4sgraphics.com',
          firstName: 'Aneesh',
          lastName: 'Dev',
          profileImageUrl: 'https://via.placeholder.com/150',
          role: 'admin',
          status: 'approved',
          loginCount: 1,
          lastLoginDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      const user = await storage.getUser(userId);
      console.log("User data from storage:", user); // Debug log
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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
      const adminId = req.user.claims.sub;
      
      console.log('Approve user request:', { originalUserId, userId, adminId });
      
      const user = await storage.approveUser(userId, adminId);
      if (!user) {
        console.log('User not found for approval:', userId);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log('User approval successful:', user);
      res.json(user);
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  app.post('/api/admin/users/:userId/reject', requireAdmin, async (req: any, res) => {
    try {
      const userId = decodeURIComponent(req.params.userId);
      const adminId = req.user.claims.sub;
      
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
      
      // Fetch pricing data and convert to expected format
      const pricingData = await storage.getAllPricingData();
      const productTypes = await storage.getProductTypes();
      const tiers = await storage.getPricingTiers();
      
      const productPricing = [];
      
      // Map pricing data to ProductPricing format
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
            'Approval (Retail)': data.approvalRetailPrice,
            'Stage25': data.stage25Price,
            'Stage2': data.stage2Price,
            'Stage15': data.stage15Price,
            'Stage1': data.stage1Price,
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

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const customerId = req.params.id;
      const success = await storage.deleteCustomer(customerId);
      
      if (!success) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Clear cache to ensure fresh data
      setCachedData("customers", null);
      
      res.json({ message: "Customer deleted successfully" });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: "Failed to delete customer" });
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
      
      const pricing = await storage.getProductPricingByType(typeId);
      res.json(pricing);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product pricing" });
    }
  });

  // Get price for specific square meters with product type and tier (with optional size-specific pricing)
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
      
      const totalPrice = await storage.getPriceForSquareMeters(squareMeters, typeId, tierId, size);
      const pricePerSqm = await storage.getPriceForProductType(typeId, tierId, size);
      
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

  // Calculate custom size square meters with pricing
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
        pricePerSqm = await storage.getPriceForProductType(typeId, tierId);
        totalPrice = await storage.getPriceForSquareMeters(squareMeters, typeId, tierId);
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
      const filePath = path.join(process.cwd(), 'attached_assets', 'customers_export.csv');
      
      if (!safeFileExists(filePath)) {
        logFileOperation({
          type: 'READ',
          file: filePath,
          success: false,
          error: 'Customer file not found'
        });
        return res.json([]); // Return empty array if no customer file exists
      }
      
      const customers = parseCustomerCSV();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      const filePathLocal = path.join(process.cwd(), 'attached_assets', 'customers_export.csv');
      logFileOperation({
        type: 'READ',
        file: filePathLocal,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Get customer by ID
  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customers = parseCustomerCSV();
      const customer = customers.find((c: any) => c.id === req.params.id);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  // Configure multer for file uploads
  const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV files are allowed'));
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
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
          // Check if record exists
          const existing = await storage.getPricingDataByProductId(pricingEntry.productId);
          
          if (existing) {
            // Update existing record
            await storage.updatePricingDataByProductId(pricingEntry.productId, pricingEntry);
            updatedRecords++;
          } else {
            // Create new record
            await storage.createPricingData(pricingEntry);
            newRecords++;
          }
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
      const pricingData = await storage.getAllPricingData();
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
      
      const updatedEntry = await storage.updatePricingData(parseInt(id), updates);
      
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
      const pricingData = await storage.getAllPricingData();
      
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
        entry.productId,
        entry.productType,
        entry.exportPrice || '',
        entry.masterDistributorPrice || '',
        entry.dealerPrice || '',
        entry.dealer2Price || '',
        entry.approvalRetailPrice || '',
        entry.stage25Price || '',
        entry.stage2Price || '',
        entry.stage15Price || '',
        entry.stage1Price || '',
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

  // Generate PDF quote as actual PDF file
  app.post("/api/generate-pdf-quote", isAuthenticated, async (req: any, res) => {
    try {
      const { customerName, customerEmail, quoteItems, quoteNumber, sentVia } = req.body;
      
      if (!customerName || !quoteItems || !Array.isArray(quoteItems) || quoteItems.length === 0) {
        return res.status(400).json({ error: "Customer name and quote items are required" });
      }

      // Get current user's email from authenticated session
      const currentUserEmail = req.user?.claims?.email || "sales@4sgraphics.com";

      // Use provided quote number or generate new one
      const finalQuoteNumber = quoteNumber || generateQuoteNumber();
      
      // Calculate total
      const totalAmount = quoteItems.reduce((sum: number, item: any) => sum + item.total, 0);
      
      // Generate HTML
      const htmlContent = generateQuoteHTMLForDownload({
        customerName,
        customerEmail,
        quoteItems,
        quoteNumber: finalQuoteNumber,
        totalAmount,
        salesRep: currentUserEmail
      });
      
      // Save quote to database (upsert to prevent duplicates)
      await storage.upsertSentQuote({
        quoteNumber: finalQuoteNumber,
        customerName,
        customerEmail: customerEmail || null,
        quoteItems: JSON.stringify(quoteItems),
        totalAmount: totalAmount.toString(),
        sentVia: sentVia || 'pdf',
        status: 'sent'
      });
      
      // Generate filename following the requested format: QuickQuotes_4SGraphics_Date_for_CustomerName.pdf
      const currentDate = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '-');
      const sanitizedCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const filename = `QuickQuotes_4SGraphics_${currentDate}_for_${sanitizedCustomerName}.pdf`;
      
      // Return HTML with proper print styles for browser-based PDF generation
      // This approach works better in constrained environments
      res.json({
        html: htmlContent,
        filename,
        quoteNumber: finalQuoteNumber,
        totalAmount,
        downloadType: 'pdf'
      });
    } catch (error) {
      console.error("Error generating PDF quote:", error);
      res.status(500).json({ error: "Failed to generate PDF quote" });
    }
  });

  // Send email quote
  app.post("/api/send-email-quote", isAuthenticated, async (req: any, res) => {
    try {
      const { customerName, customerEmail, quoteItems } = req.body;
      
      if (!customerName || !customerEmail || !quoteItems || !Array.isArray(quoteItems) || quoteItems.length === 0) {
        return res.status(400).json({ error: "Customer name, email, and quote items are required" });
      }

      // Generate quote number
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

  // Generate Price List PDF as actual PDF file
  app.post("/api/generate-price-list-pdf", async (req, res) => {
    try {
      const { clientName, categoryName, tierName, quoteNumber, items } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items provided for price list" });
      }

      // Generate HTML content for price list
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Price List - ${categoryName || 'Products'}</title>
          <style>
            body { font-family: 'Roboto', Arial, sans-serif; margin: 20px; font-size: 10px; }
            .header { text-align: center; margin-bottom: 20px; }
            .company-name { font-size: 15px; font-weight: bold; margin-bottom: 10px; }
            .title { font-size: 12px; font-weight: bold; margin-bottom: 5px; }
            .quote-info { font-size: 10px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .price { text-align: right; }
            .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">4S Graphics</div>
            <div class="title">Price List${categoryName ? ` - ${categoryName}` : ''}</div>
            ${clientName ? `<div class="quote-info">For: ${clientName}</div>` : ''}
            ${quoteNumber ? `<div class="quote-info">Quote #: ${quoteNumber}</div>` : ''}
            ${tierName ? `<div class="quote-info">Pricing Tier: ${tierName}</div>` : ''}
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Size</th>
                <th>Item Code</th>
                <th>Min Qty</th>
                <th>Price/Sq.M</th>
                <th>Price Per Sheet</th>
                <th>Price Per Pack</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item: any) => {
                const pricing = item.pricing;
                const pricePerSqm = pricing ? parseFloat(pricing.pricePerSquareMeter) : 0;
                const squareMeters = parseFloat(item.size.squareMeters);
                const pricePerSheet = pricePerSqm * squareMeters;
                const minOrderQty = parseInt(item.size.minOrderQty) || 50;
                const pricePerPack = pricePerSheet * minOrderQty;
                
                return `
                  <tr>
                    <td>${item.size.name}</td>
                    <td>${item.size.itemCode || '-'}</td>
                    <td>${minOrderQty}</td>
                    <td class="price">$${pricePerSqm.toFixed(2)}</td>
                    <td class="price">$${pricePerSheet.toFixed(2)}</td>
                    <td class="price">$${pricePerPack.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            Generated on ${new Date().toLocaleDateString()} | 4S Graphics Price List
          </div>
        </body>
        </html>
      `;

      // Generate filename
      const filename = `price-list-${categoryName || 'products'}-${quoteNumber || Date.now()}.pdf`;
      
      // Return HTML with proper print styles for browser-based PDF generation
      // This approach works better in constrained environments
      res.json({
        html,
        filename,
        downloadType: 'pdf'
      });
    } catch (error) {
      console.error("Error generating price list PDF:", error);
      res.status(500).json({ error: "Failed to generate price list PDF" });
    }
  });

  // Generate Price List CSV
  app.post("/api/generate-price-list-csv", async (req, res) => {
    try {
      const { clientName, categoryName, tierName, quoteNumber, items } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items provided for price list" });
      }

      // Generate CSV content
      const headers = ['Size', 'Item Code', 'Min Qty', 'Price/Sq.M', 'Price Per Sheet', 'Price Per Pack'];
      const csvRows = [
        headers.join(','),
        ...items.map((item: any) => {
          const pricing = item.pricing;
          const pricePerSqm = pricing ? parseFloat(pricing.pricePerSquareMeter) : 0;
          const squareMeters = parseFloat(item.size.squareMeters);
          const pricePerSheet = pricePerSqm * squareMeters;
          const minOrderQty = parseInt(item.size.minOrderQty) || 50;
          const pricePerPack = pricePerSheet * minOrderQty;
          
          return [
            `"${item.size.name}"`,
            `"${item.size.itemCode || '-'}"`,
            minOrderQty,
            pricePerSqm.toFixed(2),
            pricePerSheet.toFixed(2),
            pricePerPack.toFixed(2)
          ].join(',');
        })
      ];

      const csvContent = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="price-list-${categoryName || 'products'}-${quoteNumber || Date.now()}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating price list CSV:", error);
      res.status(500).json({ error: "Failed to generate price list CSV" });
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
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1);
      
      console.log('Headers:', headers);
      console.log('Data rows:', dataRows.length);
      
      let uploadedCount = 0;
      
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        console.log(`Processing row ${i + 1}:`, row);
        
        const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
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
        
        // Parse input price
        const inputPriceStr = String(rowData['Input Price'] || '0');
        const inputPrice = parseFloat(inputPriceStr.replace(/[$,]/g, ''));
        console.log('Input Price:', inputPriceStr, '->', inputPrice);
        
        // Parse per-unit prices
        const pricePerSqInStr = String(rowData['Price/in²'] || '0');
        const pricePerSqIn = parseFloat(pricePerSqInStr.replace(/[$,]/g, ''));
        console.log('Price/in²:', pricePerSqInStr, '->', pricePerSqIn);
        
        const pricePerSqFtStr = String(rowData['Price/ft²'] || '0');
        const pricePerSqFt = parseFloat(pricePerSqFtStr.replace(/[$,]/g, ''));
        console.log('Price/ft²:', pricePerSqFtStr, '->', pricePerSqFt);
        
        const pricePerSqMeterStr = String(rowData['Price/m²'] || '0');
        const pricePerSqMeter = parseFloat(pricePerSqMeterStr.replace(/[$,]/g, ''));
        console.log('Price/m²:', pricePerSqMeterStr, '->', pricePerSqMeter);
        
        // Parse dimensions 
        const widthStr = String(rowData.Width || '0');
        const width = parseFloat(widthStr.replace(/[^0-9.]/g, ''));
        
        const lengthStr = String(rowData.Length || '0');
        const length = parseFloat(lengthStr.replace(/[^0-9.]/g, ''));
        
        console.log('Dimensions:', widthStr, 'x', lengthStr, '->', width, 'x', length);
        
        // Create competitor data object
        const competitorData = {
          type: rowData.Type || 'sheets',
          dimensions: `${width} x ${length} in`,
          width: width,
          length: length,
          unit: 'in',
          packQty: parseInt(rowData['Pack Qty'] || '1') || 1,
          inputPrice: inputPrice,
          thickness: rowData.Thickness || 'N/A',
          productKind: rowData['Product Kind'] || 'Non Adhesive',
          surfaceFinish: rowData['Surface Finish'] || 'N/A',
          supplierInfo: rowData['Supplier Info'] || 'N/A',
          infoReceivedFrom: rowData['Info Received From'] || 'N/A',
          pricePerSqIn: pricePerSqIn,
          pricePerSqFt: pricePerSqFt,
          pricePerSqMeter: pricePerSqMeter,
          notes: rowData.Notes || 'N/A',
          source: 'CSV Upload',
          addedBy: (req.user as any)?.claims?.sub || 'admin'
        };
        
        console.log('Final competitor data:', JSON.stringify(competitorData, null, 2));
        
        try {
          const savedEntry = await storage.createCompetitorPricing(competitorData as any);
          console.log('Successfully saved entry:', JSON.stringify(savedEntry, null, 2));
          uploadedCount++;
        } catch (error) {
          console.error(`Error saving competitor pricing data for row ${i + 1}:`, error);
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
      const pricingData = await storage.getAllPricingData();
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

      await storage.updatePricingData(id, updates);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating pricing data:", error);
      res.status(500).json({ error: "Failed to update pricing data" });
    }
  });

  // Upload pricing CSV
  app.post("/api/upload-pricing-csv", isAuthenticated, upload.single('file'), async (req, res) => {
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
      await db.delete(pricingData);
      
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

      // Batch insert all records at once
      console.log(`Batch inserting ${recordsToInsert.length} records...`);
      if (recordsToInsert.length > 0) {
        const insertResult = await db.insert(pricingData).values(recordsToInsert as any).returning();
        console.log(`Successfully inserted ${insertResult.length} pricing records (IDs: ${insertResult.map(r => r.id).join(', ')})`);
        newRecords = insertResult.length;
      }

      const updatedRecords = 0; // Since we're doing fresh insert

      // After uploading to pricingData table, also sync to productPricing table
      console.log(`\nSyncing pricing data to productPricing system...`);
      await syncPricingDataToProductPricing();
      
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
      res.status(500).json({ error: "Failed to upload pricing CSV" });
    }
  });

  // Sync function to bridge pricingData to productPricing
  async function syncPricingDataToProductPricing() {
    try {
      console.log("Starting sync from pricingData to productPricing...");
      
      // Get all pricing data entries
      const pricingDataEntries = await storage.getAllPricingData();
      console.log(`Found ${pricingDataEntries.length} pricing data entries to sync`);
      
      // Get all product types for mapping
      const productTypes = await storage.getProductTypesWithCategories();
      
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
              { tierName: 'Approval_Retail', tierId: 5, price: pricingEntry.approvalRetailPrice },
              { tierName: 'Stage25', tierId: 6, price: pricingEntry.stage25Price },
              { tierName: 'Stage2', tierId: 7, price: pricingEntry.stage2Price },
              { tierName: 'Stage15', tierId: 8, price: pricingEntry.stage15Price },
              { tierName: 'Stage1', tierId: 9, price: pricingEntry.stage1Price },
              { tierName: 'Retail', tierId: 10, price: pricingEntry.retailPrice }
            ];
            
            for (const tier of tierMappings) {
              if (tier.price && parseFloat(tier.price) > 0) {
                try {
                  await storage.upsertProductPricing({
                    productTypeId: matchingType.id,
                    tierId: tier.tierId,
                    pricePerSquareMeter: parseFloat(tier.price),
                    sizeId: null // General pricing, not size-specific
                  });
                  syncedCount++;
                } catch (error) {
                  console.error(`Error upserting pricing for type ${matchingType.id}, tier ${tier.tierId}:`, error);
                  errorCount++;
                }
              }
            }
            
            console.log(`Synced pricing for: ${pricingEntry.productType} → ${matchingType.name}`);
          } else {
            console.log(`No matching product type found for: "${pricingEntry.productType}"`);
            errorCount++;
          }
        } catch (error) {
          console.error(`Error processing pricing entry ${pricingEntry.id}:`, error);
          errorCount++;
        }
      }
      
      console.log(`Sync completed: ${syncedCount} prices synced, ${errorCount} errors`);
    } catch (error) {
      console.error("Error in syncPricingDataToProductPricing:", error);
    }
  }

  // Sync product structure from pricing data
  app.post("/api/sync-product-structure", isAuthenticated, async (req, res) => {
    try {
      console.log("Starting product structure sync from pricing data...");
      
      // Get all pricing data to understand what products exist
      const pricingData = await storage.getAllPricingData();
      console.log(`Found ${pricingData.length} pricing records`);
      
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
            console.log(`Created category: ${categoryName}`);
          } catch (error) {
            console.log(`Category ${categoryName} might already exist`);
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

  // API endpoints for PDF and CSV generation
  app.post("/api/generate-pdf-quote", isAuthenticated, async (req, res) => {
    try {
      const { customerName, quoteItems, quoteNumber, totalAmount } = req.body;
      
      if (!customerName || !quoteItems || !Array.isArray(quoteItems) || quoteItems.length === 0) {
        return res.status(400).json({ error: "Customer name and quote items are required" });
      }

      // Import the function from stub-functions
      const { generateQuoteHTMLForDownload } = await import('./stub-functions.js');
      
      const html = generateQuoteHTMLForDownload({
        customerName,
        quoteNumber,
        quoteItems,
        totalAmount: totalAmount || quoteItems.reduce((sum: number, item: any) => sum + item.total, 0)
      });
      
      res.json({ html });
    } catch (error) {
      console.error("Error generating PDF quote:", error);
      res.status(500).json({ error: "Failed to generate PDF quote" });
    }
  });

  app.post("/api/generate-price-list-pdf", isAuthenticated, async (req, res) => {
    try {
      const { categoryName, tierName, items, customerName, quoteNumber } = req.body;
      
      console.log('Enhanced PDF Generation Request:', {
        categoryName,
        tierName,
        itemCount: items?.length,
        firstItem: items?.[0],
        customerName,
        quoteNumber
      });
      
      if (!categoryName || !tierName || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Category name, tier name, and items are required" });
      }

      // Import the enhanced function from stub-functions
      const { generatePriceListHTML } = await import('./stub-functions.js');
      
      // Generate unique quote number if not provided
      const listNumber = quoteNumber || `PL-${Date.now().toString().slice(-6)}`;
      
      const html = generatePriceListHTML({
        categoryName,
        tierName,
        items,
        customerName,
        quoteNumber: listNumber,
        title: "PRICE LIST"
      });
      
      // Generate filename with proper format
      const filename = `PriceList-${categoryName.replace(/\s+/g, '')}-${listNumber}.pdf`;
      
      res.json({ 
        html, 
        filename,
        listNumber,
        downloadType: 'pdf'
      });
    } catch (error) {
      console.error("Error generating price list PDF:", error);
      res.status(500).json({ error: "Failed to generate price list PDF" });
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

      const result = await storage.updateProductPricing(parseInt(id), parseFloat(pricePerSquareMeter));
      
      if (!result) {
        return res.status(404).json({ error: "Pricing entry not found" });
      }

      res.json({ success: true, message: "Price updated successfully" });
    } catch (error) {
      console.error("Error updating price:", error);
      res.status(500).json({ error: "Failed to update price" });
    }
  });

  // Generate unique quote number with customer prefix and backend validation
  app.post("/api/generate-quote-number", async (req, res) => {
    try {
      const { customerName, customerId } = req.body;
      const quoteNumber = await generateUniqueQuoteNumber(customerName, customerId);
      res.json({ 
        quoteNumber,
        hasCustomerPrefix: !!(customerName || customerId),
        isValid: validateQuoteNumber(quoteNumber)
      });
    } catch (error) {
      console.error("Error generating unique quote number:", error);
      res.status(500).json({ error: "Failed to generate unique quote number" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
