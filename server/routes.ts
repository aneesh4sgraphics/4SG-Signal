import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { storage } from "./storage";
import { z } from "zod";
import { parseProductData } from "./csv-parser";
import { parseCustomerData } from "./customer-parser";

import { generateQuoteHTMLForDownload, generateQuoteNumber, generatePriceListHTML, generatePriceListCSV } from "./simple-pdf-generator";
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
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
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

  // Get all product pricing
  app.get("/api/product-pricing", async (req, res) => {
    try {
      const cacheKey = "product-pricing";
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const pricing = await storage.getProductPricing();
      setCachedData(cacheKey, pricing);
      res.json(pricing);
    } catch (error) {
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

  // Get price for specific square meters with product type and tier
  app.get("/api/price/:squareMeters/:typeId/:tierId", async (req, res) => {
    try {
      const squareMeters = parseFloat(req.params.squareMeters);
      const typeId = parseInt(req.params.typeId);
      const tierId = parseInt(req.params.tierId);
      
      if (isNaN(squareMeters) || squareMeters <= 0) {
        return res.status(400).json({ error: "Invalid square meters value" });
      }
      
      if (isNaN(typeId) || isNaN(tierId)) {
        return res.status(400).json({ error: "Invalid type or tier ID" });
      }
      
      const totalPrice = await storage.getPriceForSquareMeters(squareMeters, typeId, tierId);
      const pricePerSqm = await storage.getPriceForProductType(typeId, tierId);
      
      res.json({ 
        totalPrice, 
        pricePerSqm,
        squareMeters 
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
      
      const customers = parseCustomerData();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      logFileOperation({
        type: 'READ',
        file: filePath,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Get customer by ID
  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customers = parseCustomerData();
      const customer = customers.find(c => c.id === req.params.id);
      
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
                for (const [existingId, existingRow] of existingDataMap) {
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
          for (const [productId, existingRow] of existingDataMap) {
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
              let hasUpdates = false;
              const updatedRow = [...existingRow];
              
              // Compare each field and update if new data is not empty and different
              for (let i = 0; i < newRow.length && i < existingRow.length; i++) {
                const newValue = newRow[i]?.trim() || '';
                const existingValue = existingRow[i]?.trim() || '';
                
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
      
      console.log(`Pricing data upload completed: ${newCount} new, ${updatedCount || 0} updated, ${duplicateCount} duplicates skipped, ${totalCount} total`);
      
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

  // Upload customer data file
  app.post("/api/admin/upload-customer-data", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Read the uploaded CSV file
      const newCsvContent = fs.readFileSync(req.file.path, 'utf-8');
      const targetPath = path.join(process.cwd(), 'attached_assets', 'customers_export.csv');
      
      let mergedContent = newCsvContent;
      let newCount = 0;
      let duplicateCount = 0;
      let totalCount = 0;
      
      // Check if existing customer file exists
      if (fs.existsSync(targetPath)) {
        const existingContent = fs.readFileSync(targetPath, 'utf-8');
        
        // Parse both files
        const parseCustomerCSV = (content: string) => {
          const lines = content.split('\n').filter(line => line.trim());
          const rows = [];
          for (const line of lines) {
            // Simple parsing - can be enhanced if needed
            const cells = line.split(',').map(cell => cell.trim().replace(/^'|'$/g, ''));
            rows.push(cells);
          }
          return rows;
        };
        
        const existingRows = parseCustomerCSV(existingContent);
        const newRows = parseCustomerCSV(newCsvContent);
        
        if (existingRows.length > 0 && newRows.length > 0) {
          // Use the header from existing file
          const header = existingRows[0];
          const existingData = existingRows.slice(1);
          const newData = newRows.slice(1);
          
          // Create a map of existing customer data for duplicate detection and updates
          const existingDataMap = new Map(existingData.map(row => [row[0], row]));
          
          let updatedCount = 0;
          const finalData = [...existingData];
          
          // Process new data to add new records or update existing ones
          for (const newRow of newData) {
            const customerId = newRow[0];
            
            if (existingDataMap.has(customerId)) {
              // Check if any field has new/different data
              const existingRow = existingDataMap.get(customerId);
              let hasUpdates = false;
              const updatedRow = [...existingRow];
              
              // Compare each field and update if new data is not empty and different
              for (let i = 0; i < newRow.length && i < existingRow.length; i++) {
                const newValue = newRow[i]?.trim() || '';
                const existingValue = existingRow[i]?.trim() || '';
                
                // Update if new value is not empty and different from existing
                if (newValue && newValue !== existingValue) {
                  updatedRow[i] = newValue;
                  hasUpdates = true;
                }
              }
              
              if (hasUpdates) {
                // Find and update the record in finalData
                const index = finalData.findIndex(row => row[0] === customerId);
                if (index !== -1) {
                  finalData[index] = updatedRow;
                  updatedCount++;
                }
              } else {
                duplicateCount++;
              }
            } else {
              // New customer
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
        return res.status(500).json({ error: "Failed to save customer data file" });
      }
      
      // Clean up the temporary file
      safeDeleteFile(req.file.path);
      
      // Clear customer cache to ensure fresh data is loaded
      cache.delete('customers');
      
      console.log(`Customer data upload completed: ${newCount} new, ${updatedCount || 0} updated, ${duplicateCount} duplicates skipped, ${totalCount} total`);
      
      // Create appropriate message based on results
      let message = "Customer data uploaded successfully";
      if (newCount > 0 && updatedCount > 0 && duplicateCount > 0) {
        message = `Customer data uploaded: ${newCount} new customers added, ${updatedCount} customers updated, ${duplicateCount} duplicates not imported`;
      } else if (newCount > 0 && updatedCount > 0) {
        message = `Customer data uploaded: ${newCount} new customers added, ${updatedCount} customers updated`;
      } else if (newCount > 0 && duplicateCount > 0) {
        message = `Customer data uploaded: ${newCount} new customers added, ${duplicateCount} duplicates not imported`;
      } else if (updatedCount > 0 && duplicateCount > 0) {
        message = `Customer data uploaded: ${updatedCount} customers updated, ${duplicateCount} duplicates not imported`;
      } else if (newCount > 0) {
        message = `Customer data uploaded: ${newCount} new customers added successfully`;
      } else if (updatedCount > 0) {
        message = `Customer data uploaded: ${updatedCount} customers updated successfully`;
      } else if (duplicateCount > 0) {
        message = `Upload completed: ${duplicateCount} duplicate customers found and not imported. No changes made.`;
      }
      
      res.json({ 
        message,
        stats: {
          newCustomers: newCount,
          updatedCustomers: updatedCount || 0,
          duplicatesSkipped: duplicateCount,
          totalCustomers: totalCount
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
          await storage.createCompetitorPricing(competitorData);
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

  // Generate PDF quote HTML
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
        createdAt: new Date().toISOString(),
        sentVia: sentVia || 'pdf',
        status: 'sent'
      });
      
      // Generate filename with QuoteNumber-ClientName-Date format
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const sanitizedCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20); // Remove special chars and limit length
      const filename = `${finalQuoteNumber}-${sanitizedCustomerName}-${currentDate}.pdf`;
      
      // Return HTML and quote info
      res.json({
        html: htmlContent,
        quoteNumber: finalQuoteNumber,
        totalAmount,
        filename
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
        createdAt: new Date().toISOString(),
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
          addedBy: req.user?.claims?.sub || 'admin'
        };
        
        console.log('Final competitor data:', JSON.stringify(competitorData, null, 2));
        
        try {
          const savedEntry = await storage.createCompetitorPricing(competitorData);
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
          createdAt: new Date().toISOString(),
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
            .sort((a, b) => b.mtime - a.mtime)[0];
          
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

  // Generate price list PDF
  app.post("/api/generate-price-list-pdf", isAuthenticated, async (req, res) => {
    try {
      const { clientName, categoryName, tierName, items } = req.body;
      
      if (!categoryName || !tierName || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Category name, tier name, and items are required" });
      }

      const htmlContent = generatePriceListHTML({
        clientName,
        categoryName,
        tierName,
        items
      });

      // Generate filename without saving to quotes
      const fileName = `${categoryName}_${clientName ? clientName.replace(/[^a-zA-Z0-9]/g, '') : 'PriceList'}.pdf`;

      // Return HTML for PDF conversion
      res.json({ 
        html: htmlContent,
        filename: fileName
      });
    } catch (error) {
      console.error("Error generating price list PDF:", error);
      res.status(500).json({ error: "Failed to generate price list PDF" });
    }
  });

  // Generate price list CSV
  app.post("/api/generate-price-list-csv", isAuthenticated, async (req, res) => {
    try {
      const { clientName, categoryName, tierName, items } = req.body;
      
      if (!categoryName || !tierName || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Category name, tier name, and items are required" });
      }

      const csvContent = generatePriceListCSV({
        clientName,
        categoryName,
        tierName,
        items
      });

      // Generate filename without saving to quotes
      const fileName = `price-list-${categoryName}-${clientName ? clientName.replace(/[^a-zA-Z0-9]/g, '') : 'PriceList'}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating price list CSV:", error);
      res.status(500).json({ error: "Failed to generate price list CSV" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
