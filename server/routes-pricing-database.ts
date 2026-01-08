import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage";
import { isAuthenticated, requireAdmin } from "./replitAuth";
import type { InsertProductPricingMaster } from "@shared/schema";

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Helper function to parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Helper function to clean price values
function cleanPrice(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper function to clean numeric values
function cleanNumeric(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper function to generate row hash for change detection
function generateRowHash(record: Omit<InsertProductPricingMaster, 'uploadBatch' | 'rowHash' | 'sortOrder'>): string {
  // Create a stable string representation of the row data (excluding metadata)
  const hashData = [
    record.itemCode || '',
    record.productName || '',
    record.productType || '',
    record.size || '',
    record.totalSqm || '0',
    record.minQuantity || 50,
    record.exportPrice || '0',
    record.masterDistributorPrice || '0',
    record.dealerPrice || '0',
    record.dealer2Price || '0',
    record.approvalNeededPrice || '0',
    record.tierStage25Price || '0',
    record.tierStage2Price || '0',
    record.tierStage15Price || '0',
    record.tierStage1Price || '0',
    record.retailPrice || '0'
  ].join('|');
  
  return crypto.createHash('sha256').update(hashData).digest('hex');
}

// Upload pricing CSV with database synchronization
router.post("/upload-pricing-database", isAuthenticated, requireAdmin, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const clearDatabase = req.body.clearDatabase === 'true';
    const filePath = req.file.path;
    const uploadBatch = `batch_${Date.now()}`;
    
    console.log(`Starting database-backed pricing upload. Clear database: ${clearDatabase}`);

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: "CSV file must have header and at least one data row",
        details: `Found ${lines.length} line(s). Please ensure your CSV file has a header row followed by data rows.`,
        suggestion: "Check that your CSV file is properly formatted and not empty."
      });
    }

    const headers = parseCSVLine(lines[0]);
    console.log(`CSV headers: ${headers.join(', ')}`);
    
    // Validate required headers
    const requiredHeaders = [
      'ItemCode', 'product_name', 'ProductType', 'size', 'total_sqm', 'min_quantity',
      'Export', 'Dealer', 'Dealer2', 'ApprovalNeeded', 'TierStage25', 
      'TierStage2', 'TierStage15', 'TierStage1', 'Retail'
    ];
    
    const missingHeaders = requiredHeaders.filter(header => 
      !headers.some(h => h === header || h === header.replace('.', '_'))
    );
    
    if (missingHeaders.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: "Missing required columns in CSV",
        details: `The following columns are missing: ${missingHeaders.join(', ')}`,
        suggestion: "Please ensure your CSV has all required columns. You can download a template for reference.",
        foundHeaders: headers,
        requiredHeaders: requiredHeaders
      });
    }

    // Preload product types for faster lookups
    let productTypes = await storage.getProductTypes();
    console.log(`Loaded ${productTypes.length} product types for matching`);
    
    // Create missing product types found in CSV but not in database
    const csvProductTypes = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length >= 3 && values[2]) {
        csvProductTypes.add(values[2].trim());
      }
    }
    
    // Find and create missing product types
    const existingTypeNames = new Set(productTypes.map(t => t.name));
    const missingTypes = Array.from(csvProductTypes).filter(typeName => !existingTypeNames.has(typeName));
    
    if (missingTypes.length > 0) {
      console.log(`Creating ${missingTypes.length} missing product types:`, missingTypes);
      
      // Get the default category (Graffiti Polyester Paper) or fallback to first category
      const allCategories = await storage.getProductCategories();
      const defaultCategory = allCategories.find(c => c.name === 'Graffiti Polyester Paper') || allCategories[0];
      const categoryId = defaultCategory?.id || 1;
      
      for (const typeName of missingTypes) {
        try {
          const newType = await storage.createProductType({
            name: typeName,
            categoryId: categoryId
          });
          productTypes.push(newType);
          console.log(`✓ Created product type: ${typeName} (ID: ${newType.id})`);
        } catch (error) {
          console.error(`Failed to create product type "${typeName}":`, error);
        }
      }
      
      // Refresh product types from database to ensure we have the latest data
      productTypes = await storage.getProductTypes();
      console.log(`Refreshed product types, now have ${productTypes.length} types in total`);
    }

    // Parse new data from CSV
    const newData: InsertProductPricingMaster[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      if (values.length < headers.length) {
        console.warn(`Row ${i + 1}: Insufficient columns (${values.length} vs ${headers.length})`);
        continue;
      }

      // Map CSV columns to database fields
      const rowData: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        rowData[header] = value;
      });
      
      // Validate ItemCode is present
      if (!rowData.ItemCode || rowData.ItemCode.trim() === '') {
        console.warn(`Row ${i + 1}: Skipping row with empty ItemCode`);
        continue;
      }

      // Try to find matching product type ID
      let productTypeId: number | null = null;
      if (rowData.ProductType) {
        const matchingType = productTypes.find(type => 
          type.name.toLowerCase() === rowData.ProductType.toLowerCase()
        );
        if (matchingType) {
          productTypeId = matchingType.id;
        } else {
          console.warn(`No matching product type found for: "${rowData.ProductType}" - setting productTypeId to null`);
          productTypeId = null;
        }
      }

      // Create the pricing master record (without hash first)
      const recordData = {
        itemCode: rowData.ItemCode || '',
        productName: rowData.product_name || '',
        productType: rowData.ProductType || '',
        productTypeId: productTypeId,
        size: rowData.size || '',
        totalSqm: cleanNumeric(rowData.total_sqm).toString(),
        minQuantity: parseInt(rowData.min_quantity) || 50,
        exportPrice: cleanPrice(rowData.Export).toString(),
        masterDistributorPrice: cleanPrice(rowData['M.Distributor'] || rowData['M_Distributor']).toString(),
        dealerPrice: cleanPrice(rowData.Dealer).toString(),
        dealer2Price: cleanPrice(rowData.Dealer2).toString(),
        approvalNeededPrice: cleanPrice(rowData.ApprovalNeeded).toString(),
        tierStage25Price: cleanPrice(rowData.TierStage25).toString(),
        tierStage2Price: cleanPrice(rowData.TierStage2).toString(),
        tierStage15Price: cleanPrice(rowData.TierStage15).toString(),
        tierStage1Price: cleanPrice(rowData.TierStage1).toString(),
        retailPrice: cleanPrice(rowData.Retail).toString()
      };
      
      // Validate numeric fields
      const numericFields = ['totalSqm', 'exportPrice', 'dealerPrice', 'retailPrice'];
      const invalidNumericField = numericFields.find(field => {
        const value = parseFloat((recordData as any)[field]);
        return isNaN(value) || value < 0;
      });
      
      if (invalidNumericField) {
        console.warn(`Row ${i + 1}: Invalid numeric value in field ${invalidNumericField} for item ${recordData.itemCode}`);
      }

      // Generate hash and create final record
      // Use existing hash from CSV if available, otherwise generate new one
      const existingHash = rowData.row_hash || rowData.rowHash;
      const pricingRecord: InsertProductPricingMaster = {
        ...recordData,
        rowHash: existingHash || generateRowHash(recordData),
        uploadBatch: uploadBatch,
        sortOrder: i // Preserve CSV row order (1-based index)
      };

      if (pricingRecord.itemCode) {
        // Only add records with valid or null productTypeId to prevent foreign key violations
        if (pricingRecord.productTypeId === null || productTypes.some(type => type.id === pricingRecord.productTypeId)) {
          newData.push(pricingRecord);
        } else {
          console.warn(`Skipping record with invalid productTypeId ${pricingRecord.productTypeId} for item: ${pricingRecord.itemCode}`);
        }
      }
    }

    console.log(`Parsed ${newData.length} records from CSV`);
    console.log(`Valid productType IDs in database: ${productTypes.map(t => t.id).join(', ')}`);
    
    // Check for any problematic records that slipped through
    const problematicRecords = newData.filter(record => 
      record.productTypeId !== null && !productTypes.some(type => type.id === record.productTypeId)
    );
    
    if (problematicRecords.length > 0) {
      console.error(`Found ${problematicRecords.length} records with invalid productTypeId values:`);
      problematicRecords.forEach(record => {
        console.error(`  - Item: ${record.itemCode}, productTypeId: ${record.productTypeId}, productType: ${record.productType}`);
      });
      return res.status(400).json({ 
        error: "Invalid productTypeId values found in data", 
        details: `${problematicRecords.length} records have productTypeId values that don't exist in the database`
      });
    }

    // Dry run preview - analyze changes without committing
    const existingData = await storage.getAllProductPricingMaster();
    const existingMap = new Map(existingData.map(item => [item.itemCode, item]));
    const newMap = new Map(newData.map(item => [item.itemCode, item]));
    
    const preview = {
      toAdd: [] as Array<{ itemCode: string; productName: string; productType: string }>,
      toUpdate: [] as Array<{ itemCode: string; productName: string; changes: Record<string, { old: any; new: any }> }>,
      toDelete: [] as Array<{ itemCode: string; productName: string; productType: string }>
    };

    if (clearDatabase) {
      // For clear database mode, everything is "added"
      preview.toAdd = newData.map(item => ({
        itemCode: item.itemCode,
        productName: item.productName,
        productType: item.productType
      }));
      preview.toDelete = existingData.map(item => ({
        itemCode: item.itemCode,
        productName: item.productName,
        productType: item.productType
      }));
    } else {
      // Smart sync mode - detailed change analysis
      
      // Items to delete (exist in DB but not in CSV)
      for (const existing of existingData) {
        if (!newMap.has(existing.itemCode)) {
          preview.toDelete.push({
            itemCode: existing.itemCode,
            productName: existing.productName,
            productType: existing.productType
          });
        }
      }
      
      // Items to add or update
      for (const newItem of newData) {
        const existing = existingMap.get(newItem.itemCode);
        
        if (!existing) {
          // New item to add
          preview.toAdd.push({
            itemCode: newItem.itemCode,
            productName: newItem.productName,
            productType: newItem.productType
          });
        } else {
          // Check for changes using hash comparison
          if (existing.rowHash !== newItem.rowHash) {
            const changes: Record<string, { old: any; new: any }> = {};
            
            // Compare key fields for detailed change log
            const fieldsToCompare = [
              'productName', 'productType', 'size', 'totalSqm', 'minQuantity',
              'exportPrice', 'masterDistributorPrice', 'dealerPrice', 'dealer2Price',
              'approvalNeededPrice', 'tierStage25Price', 'tierStage2Price', 
              'tierStage15Price', 'tierStage1Price', 'retailPrice'
            ];
            
            for (const field of fieldsToCompare) {
              const oldValue = (existing as any)[field];
              const newValue = (newItem as any)[field];
              
              if (oldValue !== newValue) {
                changes[field] = { old: oldValue, new: newValue };
              }
            }
            
            if (Object.keys(changes).length > 0) {
              preview.toUpdate.push({
                itemCode: newItem.itemCode,
                productName: newItem.productName,
                changes
              });
            }
          }
        }
      }
    }

    console.log("\n=== DRY RUN PREVIEW ===");
    console.log(`Records to ADD: ${preview.toAdd.length}`);
    console.log(`Records to UPDATE: ${preview.toUpdate.length}`);  
    console.log(`Records to DELETE: ${preview.toDelete.length}`);
    
    if (preview.toAdd.length > 0) {
      console.log("\nNEW RECORDS:");
      preview.toAdd.slice(0, 5).forEach(item => {
        console.log(`  + ${item.itemCode}: ${item.productName} (${item.productType})`);
      });
      if (preview.toAdd.length > 5) {
        console.log(`  ... and ${preview.toAdd.length - 5} more`);
      }
    }
    
    if (preview.toUpdate.length > 0) {
      console.log("\nUPDATED RECORDS:");
      preview.toUpdate.slice(0, 3).forEach(item => {
        console.log(`  ~ ${item.itemCode}: ${item.productName}`);
        Object.entries(item.changes).slice(0, 3).forEach(([field, change]) => {
          console.log(`    ${field}: "${change.old}" → "${change.new}"`);
        });
      });
      if (preview.toUpdate.length > 3) {
        console.log(`  ... and ${preview.toUpdate.length - 3} more updated records`);
      }
    }
    
    if (preview.toDelete.length > 0) {
      console.log("\nRECORDS TO DELETE:");
      preview.toDelete.slice(0, 5).forEach(item => {
        console.log(`  - ${item.itemCode}: ${item.productName} (${item.productType})`);
      });
      if (preview.toDelete.length > 5) {
        console.log(`  ... and ${preview.toDelete.length - 5} more`);
      }
    }
    
    console.log("=======================\n");

    // Generate unique batch ID for this upload
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`\n📦 Creating upload batch: ${batchId}`);

    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    if (clearDatabase) {
      // Option 1: Clear and Replace Database
      console.log("Clearing all existing product pricing data...");
      removedCount = await storage.clearAllProductPricingMaster();
      
      console.log(`Inserting ${newData.length} new records...`);
      const recordsWithBatch = newData.map(record => ({
        ...record,
        uploadBatch: batchId
      }));
      await storage.bulkCreateProductPricingMaster(recordsWithBatch);
      addedCount = newData.length;
      
      console.log("✓ Complete database replacement completed");
    } else {
      // Option 2: Smart Synchronization
      console.log("Performing smart database synchronization...");
      
      // Get existing data
      const existingData = await storage.getAllProductPricingMaster();
      const existingMap = new Map(existingData.map(item => [item.itemCode, item]));
      const newMap = new Map(newData.map(item => [item.itemCode, item]));
      
      // Step 1: Delete records that exist in DB but not in CSV
      const toDelete: string[] = [];
      for (const existing of existingData) {
        if (!newMap.has(existing.itemCode)) {
          toDelete.push(existing.itemCode);
        }
      }
      
      if (toDelete.length > 0) {
        console.log(`Removing ${toDelete.length} records no longer in CSV...`);
        for (const itemCode of toDelete) {
          await storage.deleteProductPricingMasterByItemCode(itemCode);
          removedCount++;
        }
      }
      
      // Step 2: Process CSV records with hash-based change detection
      const toAdd: InsertProductPricingMaster[] = [];
      const toUpdate: InsertProductPricingMaster[] = [];
      
      for (const newRecord of newData) {
        const existing = existingMap.get(newRecord.itemCode);
        
        if (existing) {
          // ItemCode exists - check if rowHash changed
          if (existing.rowHash && existing.rowHash === newRecord.rowHash) {
            // Hash is same → skip (no changes)
            console.log(`Skipping ${newRecord.itemCode}: no changes detected`);
          } else {
            // Hash changed → update
            toUpdate.push({
              ...newRecord,
              uploadBatch: batchId
            });
          }
        } else {
          // ItemCode not found → insert
          toAdd.push({
            ...newRecord,
            uploadBatch: batchId
          });
        }
      }
      
      // Batch operations for efficiency
      if (toAdd.length > 0) {
        console.log(`Adding ${toAdd.length} new records...`);
        await storage.bulkCreateProductPricingMaster(toAdd);
        addedCount = toAdd.length;
      }
      
      if (toUpdate.length > 0) {
        console.log(`Updating ${toUpdate.length} changed records...`);
        for (const record of toUpdate) {
          await storage.updateProductPricingMasterByItemCode(record.itemCode, record);
          updatedCount++;
        }
      }
    }

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.warn('File cleanup error (file may have been already deleted):', error);
    }
    const totalRecords = await storage.getAllProductPricingMaster();

    console.log(`\n✅ CSV upload completed successfully:`);
    console.log(`   - Records added: ${addedCount}`);
    console.log(`   - Records updated: ${updatedCount}`);
    console.log(`   - Records removed: ${removedCount}`);
    console.log(`   - Total records in database: ${totalRecords.length}`);
    
    // Create upload batch history record
    console.log(`\n📝 Saving upload batch history...`);
    const batchRecord = await storage.createUploadBatch({
      batchId: uploadBatch,
      filename: req.file.originalname,
      recordsProcessed: newData.length,
      recordsAdded: addedCount,
      recordsUpdated: updatedCount,
      recordsDeleted: removedCount,
      clearDatabase: clearDatabase,
      changeLog: {
        added: preview.toAdd,
        updated: preview.toUpdate,
        deleted: preview.toDelete
      },
      isActive: true
    });
    
    console.log(`✓ Batch history saved with ID: ${batchRecord.id}`);
    
    res.json({
      success: true,
      message: clearDatabase 
        ? `Complete database replacement successful. ${totalRecords.length} products now available.`
        : `Smart synchronization completed. ${addedCount} added, ${updatedCount} updated, ${removedCount} removed.`,
      recordsProcessed: newData.length,
      totalRecords: totalRecords.length,
      addedRecordsCount: addedCount,
      updatedRecordsCount: updatedCount,
      removedRecordsCount: removedCount,
      clearDatabase: clearDatabase,
      batchId: uploadBatch,
      uploadBatch: uploadBatch,
      changeLog: {
        added: preview.toAdd.length,
        updated: preview.toUpdate.length,
        deleted: preview.toDelete.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error processing pricing database upload:", error);
    
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
      }
    }
    
    // Provide detailed error information
    let errorMessage = "Failed to process pricing database upload";
    let errorDetails = "Unknown error occurred";
    let suggestion = "Please check your CSV file format and try again";
    
    if (error instanceof Error) {
      errorDetails = error.message;
      
      // Provide specific suggestions based on error type
      if (error.message.includes('duplicate key')) {
        errorMessage = "Duplicate item codes found";
        suggestion = "Check your CSV for duplicate ItemCode values";
      } else if (error.message.includes('foreign key') || error.message.includes('productTypeId')) {
        errorMessage = "Invalid product type reference";
        suggestion = "Some products reference product types that don't exist in the database";
      } else if (error.message.includes('parse') || error.message.includes('CSV')) {
        errorMessage = "CSV parsing error";
        suggestion = "Ensure your CSV is properly formatted with correct column headers";
      } else if (error.message.includes('column') || error.message.includes('header')) {
        errorMessage = "Invalid CSV structure";
        suggestion = "Check that your CSV has all required columns: ItemCode, product_name, ProductType, size, etc.";
      }
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      suggestion: suggestion,
      timestamp: new Date().toISOString()
    });
  }
});

// Get product codes for autocomplete (lightweight endpoint)
router.get("/quickquotes/products", async (req, res) => {
  try {
    const allPricingData = await storage.getAllProductPricingMaster();
    // Filter to only show MAPPED products (have catalogCategoryId) and not archived
    const pricingData = allPricingData.filter(item => 
      item.catalogCategoryId && !item.isArchived
    );
    // Return only the fields needed for autocomplete
    const products = pricingData.map(item => ({
      id: item.id,
      itemCode: item.itemCode,
      productName: item.productName,
      productType: item.productType
    }));
    res.json(products);
  } catch (error) {
    console.error("Error fetching product codes:", error);
    res.status(500).json({ error: "Failed to fetch product codes" });
  }
});

// Get all product pricing from database
router.get("/product-pricing-database", isAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log("=== GET /api/product-pricing-database START ===");
    console.log("Request headers:", req.headers);
    console.log("User authenticated:", !!req.user);
    
    console.log("Fetching product pricing from database...");
    const allPricingData = await storage.getAllProductPricingMaster();
    
    // Filter to only show MAPPED products (have catalogCategoryId) and not archived
    const pricingData = allPricingData.filter(item => 
      item.catalogCategoryId && !item.isArchived
    );
    console.log(`✓ Retrieved ${pricingData.length} mapped pricing records from database (${allPricingData.length} total) in ${Date.now() - startTime}ms`);
    
    if (pricingData.length === 0) {
      console.warn("⚠ No mapped pricing data found in database");
      return res.json({ 
        data: [],
        warning: "No mapped products found. Please map products in the Product Mapping page first."
      });
    }
    
    // Transform decimal strings to numbers for frontend compatibility
    const transformedData = pricingData.map(item => ({
      ...item,
      totalSqm: parseFloat(String(item.totalSqm || 0)),
      exportPrice: parseFloat(String(item.exportPrice || 0)),
      masterDistributorPrice: parseFloat(String(item.masterDistributorPrice || 0)),
      dealerPrice: parseFloat(String(item.dealerPrice || 0)),
      dealer2Price: parseFloat(String(item.dealer2Price || 0)),
      approvalNeededPrice: parseFloat(String(item.approvalNeededPrice || 0)),
      tierStage25Price: parseFloat(String(item.tierStage25Price || 0)),
      tierStage2Price: parseFloat(String(item.tierStage2Price || 0)),
      tierStage15Price: parseFloat(String(item.tierStage15Price || 0)),
      tierStage1Price: parseFloat(String(item.tierStage1Price || 0)),
      retailPrice: parseFloat(String(item.retailPrice || 0))
    }));
    
    console.log(`✓ Successfully transformed ${transformedData.length} records`);
    console.log(`=== GET /api/product-pricing-database END (${Date.now() - startTime}ms) ===`);
    
    res.json({ data: transformedData });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("=== GET /api/product-pricing-database ERROR ===");
    console.error("Duration before error:", duration + "ms");
    console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("Database connection status:", process.env.DATABASE_URL ? 'URL present' : 'URL missing');
    
    // Build detailed error response
    const errorResponse: any = {
      error: "Failed to fetch product pricing from database",
      timestamp: new Date().toISOString(),
      duration: duration + "ms"
    };
    
    // Add specific error details based on error type
    if (error instanceof Error) {
      errorResponse.message = error.message;
      errorResponse.type = error.constructor.name;
      
      // Database connection errors
      if (error.message.includes('ECONNREFUSED') || error.message.includes('connect ETIMEDOUT')) {
        errorResponse.details = "Cannot connect to database. Please check database configuration in Secrets.";
        errorResponse.suggestion = "Ensure DATABASE_URL is set correctly in the Secrets tab.";
      }
      // Query errors
      else if (error.message.includes('relation') || error.message.includes('table')) {
        errorResponse.details = "Database table not found. The pricing table may not exist.";
        errorResponse.suggestion = "Run database migrations or contact support.";
      }
      // Permission errors
      else if (error.message.includes('permission') || error.message.includes('denied')) {
        errorResponse.details = "Database permission error.";
        errorResponse.suggestion = "Check database user permissions.";
      }
      // Generic database errors
      else {
        errorResponse.details = error.message;
      }
      
      // Stack traces are NEVER sent to client - only logged server-side
      // In development, log full stack to console
      if (process.env.NODE_ENV === 'development' && error.stack) {
        console.error("Full stack trace:", error.stack);
      }
    }
    
    res.status(500).json(errorResponse);
  }
});

// Export pricing data from database
router.get("/download-pricing-database", isAuthenticated, requireAdmin, async (req: any, res: any) => {
  try {
    const pricingData = await storage.getAllProductPricingMaster();
    
    if (pricingData.length === 0) {
      return res.status(404).json({ error: "No pricing data found in database" });
    }

    // Convert to CSV format
    const headers = [
      'ItemCode', 'product_name', 'ProductType', 'size', 'total_sqm', 'min_quantity',
      'Export', 'M.Distributor', 'Dealer', 'Dealer2', 'ApprovalNeeded',
      'TierStage25', 'TierStage2', 'TierStage15', 'TierStage1', 'Retail',
      'row_hash'
    ];

    const csvLines = [headers.join(',')];
    
    pricingData.forEach(item => {
      const row = [
        item.itemCode,
        `"${item.productName}"`,
        `"${item.productType}"`,
        `"${item.size}"`,
        item.totalSqm,
        item.minQuantity,
        item.exportPrice || 0,
        item.masterDistributorPrice || 0,
        item.dealerPrice || 0,
        item.dealer2Price || 0,
        item.approvalNeededPrice || 0,
        item.tierStage25Price || 0,
        item.tierStage2Price || 0,
        item.tierStage15Price || 0,
        item.tierStage1Price || 0,
        item.retailPrice || 0,
        item.rowHash || ''
      ];
      csvLines.push(row.join(','));
    });

    const csvContent = csvLines.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pricing-database-export.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error("Error downloading pricing database:", error);
    res.status(500).json({ error: "Failed to download pricing database" });
  }
});

// Get upload batch history
router.get("/upload-batches", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    console.log("Fetching upload batch history...");
    const batches = await storage.getUploadBatches();
    
    res.json({
      success: true,
      batches: batches,
      count: batches.length
    });
  } catch (error) {
    console.error("Error fetching upload batches:", error);
    res.status(500).json({ 
      error: "Failed to fetch upload batch history", 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific batch details
router.get("/upload-batches/:batchId", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const { batchId } = req.params;
    console.log(`Fetching batch details for: ${batchId}`);
    
    const batch = await storage.getUploadBatch(batchId);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    res.json({
      success: true,
      batch: batch
    });
  } catch (error) {
    console.error("Error fetching batch details:", error);
    res.status(500).json({ 
      error: "Failed to fetch batch details", 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Bulk update multiple product prices (admin only) - MUST be before :id route
router.patch("/product-pricing/bulk-update", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { ids, updates } = req.body;
    
    console.log(`=== PATCH /api/product-pricing/bulk-update START ===`);
    console.log(`Updating ${ids?.length} products`);
    
    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        details: "Product IDs array is required"
      });
    }
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        error: "Invalid request",
        details: "Price updates object is required"
      });
    }
    
    // SECURITY: Strict whitelist of allowed price fields
    const ALLOWED_PRICE_FIELDS = new Set([
      'landedPrice', 'exportPrice', 'masterDistributorPrice', 'dealerPrice', 'dealer2Price',
      'approvalNeededPrice', 'tierStage25Price', 'tierStage2Price', 
      'tierStage15Price', 'tierStage1Price', 'retailPrice'
    ]);
    
    // Check for any disallowed fields
    const receivedFields = Object.keys(updates);
    const disallowedFields = receivedFields.filter(f => !ALLOWED_PRICE_FIELDS.has(f));
    if (disallowedFields.length > 0) {
      console.warn(`Security: Rejected non-price fields: ${disallowedFields.join(', ')}`);
      return res.status(400).json({
        error: "Invalid fields",
        details: `Only price fields can be updated. Rejected: ${disallowedFields.join(', ')}`
      });
    }
    
    // Validate and sanitize price updates
    const sanitizedUpdates: Record<string, number> = {};
    const invalidFields: string[] = [];
    
    for (const key of receivedFields) {
      const rawValue = updates[key];
      const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
      
      if (isNaN(numValue) || numValue < 0 || numValue > 999999.99) {
        invalidFields.push(key);
      } else {
        sanitizedUpdates[key] = Math.round(numValue * 100) / 100;
      }
    }
    
    if (invalidFields.length > 0) {
      return res.status(400).json({ 
        error: "Invalid price values",
        details: `The following fields have invalid values: ${invalidFields.join(', ')}`
      });
    }
    
    // Get all pricing data
    const allPricing = await storage.getAllProductPricingMaster();
    
    // Helper to safely get existing numeric value
    const getExistingPrice = (value: any): string => {
      if (value === null || value === undefined) return '0';
      const num = parseFloat(String(value));
      return isNaN(num) ? '0' : num.toString();
    };
    
    // Update each product
    let updatedCount = 0;
    for (const productId of ids) {
      const currentRecord = allPricing.find(p => p.id === parseInt(productId));
      if (!currentRecord) {
        console.warn(`Product not found: ${productId}`);
        continue;
      }
      
      // Build complete record with existing data + updates
      const completeRecord: any = {
        itemCode: currentRecord.itemCode,
        productName: currentRecord.productName,
        productType: currentRecord.productType,
        productTypeId: currentRecord.productTypeId,
        size: currentRecord.size,
        totalSqm: getExistingPrice(currentRecord.totalSqm),
        minQuantity: currentRecord.minQuantity || 50,
        landedPrice: sanitizedUpdates.landedPrice !== undefined ? sanitizedUpdates.landedPrice.toString() : getExistingPrice(currentRecord.landedPrice),
        exportPrice: sanitizedUpdates.exportPrice !== undefined ? sanitizedUpdates.exportPrice.toString() : getExistingPrice(currentRecord.exportPrice),
        masterDistributorPrice: sanitizedUpdates.masterDistributorPrice !== undefined ? sanitizedUpdates.masterDistributorPrice.toString() : getExistingPrice(currentRecord.masterDistributorPrice),
        dealerPrice: sanitizedUpdates.dealerPrice !== undefined ? sanitizedUpdates.dealerPrice.toString() : getExistingPrice(currentRecord.dealerPrice),
        dealer2Price: sanitizedUpdates.dealer2Price !== undefined ? sanitizedUpdates.dealer2Price.toString() : getExistingPrice(currentRecord.dealer2Price),
        approvalNeededPrice: sanitizedUpdates.approvalNeededPrice !== undefined ? sanitizedUpdates.approvalNeededPrice.toString() : getExistingPrice(currentRecord.approvalNeededPrice),
        tierStage25Price: sanitizedUpdates.tierStage25Price !== undefined ? sanitizedUpdates.tierStage25Price.toString() : getExistingPrice(currentRecord.tierStage25Price),
        tierStage2Price: sanitizedUpdates.tierStage2Price !== undefined ? sanitizedUpdates.tierStage2Price.toString() : getExistingPrice(currentRecord.tierStage2Price),
        tierStage15Price: sanitizedUpdates.tierStage15Price !== undefined ? sanitizedUpdates.tierStage15Price.toString() : getExistingPrice(currentRecord.tierStage15Price),
        tierStage1Price: sanitizedUpdates.tierStage1Price !== undefined ? sanitizedUpdates.tierStage1Price.toString() : getExistingPrice(currentRecord.tierStage1Price),
        retailPrice: sanitizedUpdates.retailPrice !== undefined ? sanitizedUpdates.retailPrice.toString() : getExistingPrice(currentRecord.retailPrice),
        uploadBatch: currentRecord.uploadBatch,
        rowHash: currentRecord.rowHash,
        sortOrder: currentRecord.sortOrder,
      };
      
      await storage.updateProductPricingMasterByItemCode(currentRecord.itemCode, completeRecord);
      updatedCount++;
    }
    
    console.log(`✓ Bulk updated ${updatedCount} products`);
    console.log(`=== PATCH /api/product-pricing/bulk-update END ===`);
    
    res.json({ 
      success: true, 
      message: `Updated pricing for ${updatedCount} products`,
      updatedCount,
      updatedFields: Object.keys(sanitizedUpdates)
    });
  } catch (error) {
    console.error("Error in bulk update:", error);
    res.status(500).json({ 
      error: "Failed to bulk update product pricing",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update single product pricing (admin only)
router.patch("/product-pricing/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    console.log(`=== PATCH /api/product-pricing/${id} START ===`);
    console.log("Updates received:", updates);
    
    // SECURITY: Strict whitelist of allowed price fields - reject any non-whitelisted fields
    const ALLOWED_PRICE_FIELDS = new Set([
      'landedPrice', 'exportPrice', 'masterDistributorPrice', 'dealerPrice', 'dealer2Price',
      'approvalNeededPrice', 'tierStage25Price', 'tierStage2Price', 
      'tierStage15Price', 'tierStage1Price', 'retailPrice'
    ]);
    
    // Check for any disallowed fields in the request
    const receivedFields = Object.keys(updates);
    const disallowedFields = receivedFields.filter(f => !ALLOWED_PRICE_FIELDS.has(f));
    if (disallowedFields.length > 0) {
      console.warn(`Security: Rejected non-price fields: ${disallowedFields.join(', ')}`);
      return res.status(400).json({
        error: "Invalid fields",
        details: `Only price fields can be updated. Rejected: ${disallowedFields.join(', ')}`
      });
    }
    
    // First, get the current record to merge with
    const allPricing = await storage.getAllProductPricingMaster();
    const currentRecord = allPricing.find(p => p.id === parseInt(id));
    
    if (!currentRecord) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Validate and sanitize price updates - convert to numbers, validate range
    const sanitizedUpdates: Record<string, number> = {};
    const invalidFields: string[] = [];
    
    for (const key of receivedFields) {
      const rawValue = updates[key];
      // Parse the value - handle both string and number inputs
      const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
      
      if (isNaN(numValue) || numValue < 0 || numValue > 999999.99) {
        invalidFields.push(key);
      } else {
        // Store as number (2 decimal precision maintained via rounding)
        sanitizedUpdates[key] = Math.round(numValue * 100) / 100;
      }
    }
    
    if (invalidFields.length > 0) {
      return res.status(400).json({ 
        error: "Invalid price values",
        details: `The following fields have invalid values: ${invalidFields.join(', ')}`,
        suggestion: "All price fields must be valid positive numbers"
      });
    }
    
    if (Object.keys(sanitizedUpdates).length === 0) {
      return res.status(400).json({ 
        error: "No valid fields to update",
        details: "Provide at least one valid price field to update"
      });
    }
    
    // Helper to safely get existing numeric value
    const getExistingPrice = (value: any): string => {
      if (value === null || value === undefined) return '0';
      const num = parseFloat(String(value));
      return isNaN(num) ? '0' : num.toString();
    };
    
    // Build complete record with existing data + only the validated updates
    // Note: Updates are already validated numbers, existing values are converted from DB strings
    const completeRecord: any = {
      itemCode: currentRecord.itemCode,
      productName: currentRecord.productName,
      productType: currentRecord.productType,
      productTypeId: currentRecord.productTypeId,
      size: currentRecord.size,
      totalSqm: getExistingPrice(currentRecord.totalSqm),
      minQuantity: currentRecord.minQuantity || 50,
      // For each price field: use update (as number) if provided, otherwise keep existing value
      landedPrice: sanitizedUpdates.landedPrice !== undefined ? sanitizedUpdates.landedPrice.toString() : getExistingPrice(currentRecord.landedPrice),
      exportPrice: sanitizedUpdates.exportPrice !== undefined ? sanitizedUpdates.exportPrice.toString() : getExistingPrice(currentRecord.exportPrice),
      masterDistributorPrice: sanitizedUpdates.masterDistributorPrice !== undefined ? sanitizedUpdates.masterDistributorPrice.toString() : getExistingPrice(currentRecord.masterDistributorPrice),
      dealerPrice: sanitizedUpdates.dealerPrice !== undefined ? sanitizedUpdates.dealerPrice.toString() : getExistingPrice(currentRecord.dealerPrice),
      dealer2Price: sanitizedUpdates.dealer2Price !== undefined ? sanitizedUpdates.dealer2Price.toString() : getExistingPrice(currentRecord.dealer2Price),
      approvalNeededPrice: sanitizedUpdates.approvalNeededPrice !== undefined ? sanitizedUpdates.approvalNeededPrice.toString() : getExistingPrice(currentRecord.approvalNeededPrice),
      tierStage25Price: sanitizedUpdates.tierStage25Price !== undefined ? sanitizedUpdates.tierStage25Price.toString() : getExistingPrice(currentRecord.tierStage25Price),
      tierStage2Price: sanitizedUpdates.tierStage2Price !== undefined ? sanitizedUpdates.tierStage2Price.toString() : getExistingPrice(currentRecord.tierStage2Price),
      tierStage15Price: sanitizedUpdates.tierStage15Price !== undefined ? sanitizedUpdates.tierStage15Price.toString() : getExistingPrice(currentRecord.tierStage15Price),
      tierStage1Price: sanitizedUpdates.tierStage1Price !== undefined ? sanitizedUpdates.tierStage1Price.toString() : getExistingPrice(currentRecord.tierStage1Price),
      retailPrice: sanitizedUpdates.retailPrice !== undefined ? sanitizedUpdates.retailPrice.toString() : getExistingPrice(currentRecord.retailPrice),
      uploadBatch: currentRecord.uploadBatch,
      rowHash: currentRecord.rowHash,
      sortOrder: currentRecord.sortOrder,
    };
    
    console.log("Merged record:", completeRecord);
    
    // Update the record with complete data
    await storage.updateProductPricingMasterByItemCode(currentRecord.itemCode, completeRecord);
    
    console.log(`✓ Updated product pricing for ID ${id} (${currentRecord.itemCode})`);
    console.log(`=== PATCH /api/product-pricing/${id} END ===`);
    
    res.json({ 
      success: true, 
      message: "Product pricing updated successfully",
      updatedFields: Object.keys(sanitizedUpdates)
    });
  } catch (error) {
    console.error("Error updating product pricing:", error);
    res.status(500).json({ 
      error: "Failed to update product pricing",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Rollback to specific batch
router.post("/rollback-batch/:batchId", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const { batchId } = req.params;
    console.log(`Starting rollback to batch: ${batchId}`);
    
    const result = await storage.rollbackToUploadBatch(batchId);
    
    if (result.success) {
      console.log(`✅ Rollback successful: ${result.message}`);
      res.json({
        success: true,
        message: result.message
      });
    } else {
      console.log(`❌ Rollback failed: ${result.message}`);
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error("Error during batch rollback:", error);
    res.status(500).json({ 
      error: "Failed to rollback to batch", 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper to slugify a string into a code
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Helper to detect subfamily from ProductType (for Rang Print, Screen Printing)
function detectSubfamily(productType: string): string | null {
  const lc = productType.toLowerCase();
  if (lc.includes('rang duo')) return 'Rang Duo';
  if (lc.includes('rang lux')) return 'Rang Lux';
  if (lc.includes('eie')) return 'EiE';
  if (lc.includes('ele')) return 'eLe';
  return null;
}

// Sync catalog from pricing database - creates/updates categories and product types
router.post("/sync-catalog-from-pricing", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    console.log("=== Starting Catalog Sync from Pricing Database ===");
    
    const userId = req.user?.id || 'system';
    const userEmail = req.user?.email || 'system@4sgraphics.com';
    
    // Create import log entry
    const importLog = await storage.createCatalogImportLog({
      fileName: 'pricing_database_sync',
      importedBy: userId,
      importedByEmail: userEmail,
      status: 'pending'
    });
    
    // Get all unique product_name values from productPricingMaster
    const allPricing = await storage.getAllProductPricingMaster();
    
    if (!allPricing || allPricing.length === 0) {
      await storage.updateCatalogImportLog(importLog.id, {
        status: 'failed',
        errors: ['No pricing data found in database. Please upload pricing CSV first.'],
        completedAt: new Date()
      });
      return res.status(400).json({
        error: "No pricing data found",
        details: "Please upload the pricing CSV before syncing the catalog."
      });
    }
    
    console.log(`Found ${allPricing.length} pricing records to process`);
    
    // Extract unique categories (product_name) and product types
    const categoryMap = new Map<string, { label: string; productTypes: Set<string> }>();
    
    for (const record of allPricing) {
      const categoryLabel = record.productName;
      if (!categoryMap.has(categoryLabel)) {
        categoryMap.set(categoryLabel, { label: categoryLabel, productTypes: new Set() });
      }
      categoryMap.get(categoryLabel)!.productTypes.add(record.productType);
    }
    
    console.log(`Found ${categoryMap.size} unique categories`);
    
    let categoriesCreated = 0;
    let categoriesUpdated = 0;
    let productTypesCreated = 0;
    let productTypesUpdated = 0;
    const errors: string[] = [];
    
    // Process each category
    const categoryIdMap = new Map<string, number>(); // label -> id
    const productTypeIdMap = new Map<string, number>(); // label -> id
    
    for (const [categoryLabel, categoryData] of Array.from(categoryMap.entries())) {
      const categoryCode = slugify(categoryLabel);
      
      try {
        // Check if category exists
        const existingCategory = await storage.getAdminCategoryByCode(categoryCode);
        
        let categoryId: number;
        if (existingCategory) {
          categoryId = existingCategory.id;
          categoriesUpdated++;
          console.log(`Category exists: ${categoryLabel} (${categoryCode})`);
        } else {
          // Create new category
          const newCategory = await storage.createAdminCategory({
            code: categoryCode,
            label: categoryLabel,
            isActive: true,
            sortOrder: categoriesCreated
          });
          categoryId = newCategory.id;
          categoriesCreated++;
          console.log(`Created category: ${categoryLabel} (${categoryCode})`);
        }
        
        categoryIdMap.set(categoryLabel, categoryId);
        
        // Process product types for this category
        for (const productTypeLabel of Array.from(categoryData.productTypes)) {
          const productTypeCode = slugify(productTypeLabel);
          const subfamily = detectSubfamily(productTypeLabel);
          
          try {
            const existingProductType = await storage.getCatalogProductTypeByCode(productTypeCode);
            
            if (existingProductType) {
              productTypesUpdated++;
              productTypeIdMap.set(productTypeLabel, existingProductType.id);
            } else {
              const newProductType = await storage.createCatalogProductType({
                categoryId,
                code: productTypeCode,
                label: productTypeLabel,
                subfamily,
                isActive: true,
                sortOrder: productTypesCreated
              });
              productTypesCreated++;
              productTypeIdMap.set(productTypeLabel, newProductType.id);
              console.log(`Created product type: ${productTypeLabel} (subfamily: ${subfamily || 'none'})`);
            }
          } catch (err) {
            const errMsg = `Failed to create product type ${productTypeLabel}: ${err instanceof Error ? err.message : 'Unknown error'}`;
            console.error(errMsg);
            errors.push(errMsg);
          }
        }
      } catch (err) {
        const errMsg = `Failed to create category ${categoryLabel}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error(errMsg);
        errors.push(errMsg);
      }
    }
    
    // Now update all productPricingMaster records with catalog links
    let variantsUpdated = 0;
    for (const record of allPricing) {
      const categoryId = categoryIdMap.get(record.productName);
      const productTypeId = productTypeIdMap.get(record.productType);
      
      if (categoryId && productTypeId) {
        try {
          await storage.updateProductPricingMasterCatalogLinks(
            record.itemCode,
            categoryId,
            productTypeId
          );
          variantsUpdated++;
        } catch (err) {
          errors.push(`Failed to link ${record.itemCode}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
    
    // Update import log
    await storage.updateCatalogImportLog(importLog.id, {
      categoriesCreated,
      categoriesUpdated,
      productTypesCreated,
      productTypesUpdated,
      variantsCreated: 0,
      variantsUpdated: variantsUpdated,
      status: errors.length > 0 ? 'completed' : 'completed',
      errors: errors.length > 0 ? errors : null,
      completedAt: new Date()
    });
    
    console.log("=== Catalog Sync Complete ===");
    console.log(`Categories: ${categoriesCreated} created, ${categoriesUpdated} existing`);
    console.log(`Product Types: ${productTypesCreated} created, ${productTypesUpdated} existing`);
    console.log(`Variants linked: ${variantsUpdated}`);
    
    res.json({
      success: true,
      message: "Catalog synced successfully from pricing database",
      stats: {
        categoriesCreated,
        categoriesUpdated,
        productTypesCreated,
        productTypesUpdated,
        variantsLinked: variantsUpdated,
        errors: errors.length
      }
    });
  } catch (error) {
    console.error("Error syncing catalog:", error);
    res.status(500).json({
      error: "Failed to sync catalog",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get catalog categories with product types
router.get("/catalog-categories", isAuthenticated, async (req, res) => {
  try {
    const categories = await storage.getAllAdminCategories();
    const productTypes = await storage.getAllCatalogProductTypes();
    
    // Group product types by category
    const categoriesWithTypes = categories.map(cat => ({
      ...cat,
      productTypes: productTypes.filter(pt => pt.categoryId === cat.id)
    }));
    
    res.json(categoriesWithTypes);
  } catch (error) {
    console.error("Error fetching catalog categories:", error);
    res.status(500).json({ error: "Failed to fetch catalog" });
  }
});

// Get catalog import logs
router.get("/catalog-import-logs", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const logs = await storage.getCatalogImportLogs();
    res.json(logs);
  } catch (error) {
    console.error("Error fetching import logs:", error);
    res.status(500).json({ error: "Failed to fetch import logs" });
  }
});

// Get unmapped Shopify items
router.get("/shopify-unmapped-items", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const items = await storage.getShopifyUnmappedItems();
    res.json(items);
  } catch (error) {
    console.error("Error fetching unmapped items:", error);
    res.status(500).json({ error: "Failed to fetch unmapped items" });
  }
});

// Resolve an unmapped Shopify item
router.post("/shopify-unmapped-items/:id/resolve", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { categoryId, productTypeId, itemCode, createMapping } = req.body;
    
    const userId = req.user?.email || 'system';
    
    await storage.resolveShopifyUnmappedItem(
      parseInt(id),
      categoryId,
      productTypeId,
      itemCode,
      userId
    );
    
    // Optionally create a permanent SKU mapping rule
    if (createMapping && req.body.sku) {
      await storage.createAdminSkuMapping({
        ruleType: 'exact',
        pattern: req.body.sku,
        categoryId,
        categoryCode: null,
        priority: 10,
        description: `Auto-created from unmapped item resolution`,
        isActive: true
      });
    }
    
    res.json({ success: true, message: "Item resolved successfully" });
  } catch (error) {
    console.error("Error resolving unmapped item:", error);
    res.status(500).json({ error: "Failed to resolve item" });
  }
});

// Helper function to generate canonical category code from product name
function generateCategoryCode(productName: string): string {
  return productName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim underscores
}

// Mapping Audit - Shows % of Shopify SKUs that match ItemCodes
router.get("/mapping-audit", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    // Get all pricing items with their ItemCodes
    const pricingItems = await storage.getAllPricingMasterItems();
    const itemCodes = new Set(pricingItems.map(p => p.itemCode).filter(Boolean));
    
    // Get all SKU mappings
    const skuMappings = await storage.getAllAdminSkuMappings();
    const activeMappings = skuMappings.filter(m => m.isActive);
    
    // Get all categories for lookup
    const categories = await storage.getAllAdminCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c]));
    
    // Get Shopify products/variants (from unmapped items or orders)
    const unmappedItems = await storage.getShopifyUnmappedItems();
    
    // Also get unique ItemCodes from pricing database
    const uniqueItemCodes = Array.from(itemCodes);
    
    // Build audit results
    const auditResults = {
      summary: {
        totalPricingItems: pricingItems.length,
        totalUniqueItemCodes: uniqueItemCodes.length,
        totalSkuMappings: activeMappings.length,
        totalUnmappedShopifyItems: unmappedItems.filter(u => !u.resolvedCategoryId).length,
        totalResolvedItems: unmappedItems.filter(u => u.resolvedCategoryId).length,
      },
      categories: categories.map(cat => ({
        id: cat.id,
        code: cat.code,
        label: cat.label,
        itemCount: pricingItems.filter(p => p.catalogCategoryId === cat.id).length,
        mappingRules: activeMappings.filter(m => m.categoryId === cat.id).length,
      })),
      unmappedItems: unmappedItems.filter(u => !u.resolvedCategoryId).map(item => ({
        id: item.id,
        sku: item.sku,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        orderId: item.shopifyOrderId,
        createdAt: item.createdAt,
        suggestedMatches: findSuggestedMatches(item.sku || '', pricingItems, categories),
      })),
      mappingRules: activeMappings.map(rule => ({
        id: rule.id,
        ruleType: rule.ruleType,
        pattern: rule.pattern,
        categoryId: rule.categoryId,
        categoryCode: rule.categoryCode || categoryMap.get(rule.categoryId || 0)?.code,
        categoryLabel: categoryMap.get(rule.categoryId || 0)?.label,
        priority: rule.priority,
      })),
    };
    
    res.json(auditResults);
  } catch (error) {
    console.error("Error running mapping audit:", error);
    res.status(500).json({ error: "Failed to run mapping audit" });
  }
});

// Helper to find suggested matches for a SKU
function findSuggestedMatches(
  sku: string, 
  pricingItems: any[], 
  categories: any[]
): { itemCode: string; productName: string; similarity: number }[] {
  if (!sku) return [];
  
  const skuLower = sku.toLowerCase();
  const matches: { itemCode: string; productName: string; similarity: number }[] = [];
  
  // Check for exact ItemCode match
  const exactMatch = pricingItems.find(p => p.itemCode?.toLowerCase() === skuLower);
  if (exactMatch) {
    return [{
      itemCode: exactMatch.itemCode || '',
      productName: exactMatch.productName || '',
      similarity: 100
    }];
  }
  
  // Check for prefix matches
  for (const item of pricingItems.slice(0, 500)) { // Limit for performance
    if (!item.itemCode) continue;
    const itemCodeLower = item.itemCode.toLowerCase();
    
    // Check if SKU starts with or contains the ItemCode
    if (skuLower.startsWith(itemCodeLower) || itemCodeLower.startsWith(skuLower)) {
      matches.push({
        itemCode: item.itemCode,
        productName: item.productName || '',
        similarity: Math.round((Math.min(sku.length, item.itemCode.length) / Math.max(sku.length, item.itemCode.length)) * 100)
      });
    }
  }
  
  // Sort by similarity and return top 3
  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

// Create SKU mapping rule from audit
router.post("/mapping-audit/create-rule", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { pattern, ruleType, categoryId, description } = req.body;
    
    if (!pattern || !categoryId) {
      return res.status(400).json({ error: "Pattern and categoryId are required" });
    }
    
    // Get the category to store its code
    const categories = await storage.getAllAdminCategories();
    const category = categories.find(c => c.id === categoryId);
    
    if (!category) {
      return res.status(400).json({ error: "Category not found" });
    }
    
    const mapping = await storage.createAdminSkuMapping({
      ruleType: ruleType || 'exact',
      pattern,
      categoryId,
      categoryCode: category.code,
      priority: 10,
      description: description || `Created from mapping audit`,
      isActive: true
    });
    
    res.json({ success: true, mapping });
  } catch (error) {
    console.error("Error creating mapping rule:", error);
    res.status(500).json({ error: "Failed to create mapping rule" });
  }
});

// Create new category with canonical code
router.post("/categories/create", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { label, code, groupId, compatibleMachineTypes, description } = req.body;
    
    if (!label) {
      return res.status(400).json({ error: "Category label is required" });
    }
    
    // Generate code if not provided
    const categoryCode = code || generateCategoryCode(label);
    
    // Check if code already exists
    const existingCategories = await storage.getAllAdminCategories();
    if (existingCategories.some(c => c.code === categoryCode)) {
      return res.status(400).json({ error: "Category code already exists" });
    }
    
    const category = await storage.createAdminCategory({
      code: categoryCode,
      label,
      groupId: groupId || null,
      compatibleMachineTypes: compatibleMachineTypes || [],
      description: description || null,
      sortOrder: existingCategories.length,
      isActive: true
    });
    
    res.json({ success: true, category });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// Create new product type under a category
router.post("/product-types/create", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { categoryId, label, code, subfamily, description } = req.body;
    
    if (!categoryId || !label) {
      return res.status(400).json({ error: "Category ID and label are required" });
    }
    
    // Generate code if not provided
    const typeCode = code || generateCategoryCode(label);
    
    const productType = await storage.createCatalogProductType({
      categoryId,
      code: typeCode,
      label,
      subfamily: subfamily || null,
      description: description || null,
      sortOrder: 0,
      isActive: true
    });
    
    res.json({ success: true, productType });
  } catch (error) {
    console.error("Error creating product type:", error);
    res.status(500).json({ error: "Failed to create product type" });
  }
});

// Test SKU Resolution - Paste a SKU and see resolved category, machine compatibility, trust state
router.post("/test-sku", isAuthenticated, async (req: any, res) => {
  try {
    const { sku } = req.body;
    
    if (!sku) {
      return res.status(400).json({ error: "SKU is required" });
    }
    
    // Get all SKU mappings
    const skuMappings = await storage.getAllAdminSkuMappings();
    const activeMappings = skuMappings.filter(m => m.isActive).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Get all categories for lookup
    const categories = await storage.getAllAdminCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c]));
    
    // Get machine types
    const machineTypes = await storage.getAllAdminMachineTypes();
    
    // Try to find a matching rule
    let matchedRule: typeof activeMappings[0] | null = null;
    let matchType: string = 'none';
    
    for (const rule of activeMappings) {
      if (rule.ruleType === 'exact' && rule.pattern === sku) {
        matchedRule = rule;
        matchType = 'exact';
        break;
      } else if (rule.ruleType === 'prefix' && sku.startsWith(rule.pattern || '')) {
        matchedRule = rule;
        matchType = 'prefix';
        break;
      } else if (rule.ruleType === 'regex') {
        try {
          const regex = new RegExp(rule.pattern || '');
          if (regex.test(sku)) {
            matchedRule = rule;
            matchType = 'regex';
            break;
          }
        } catch (e) {
          // Invalid regex, skip
        }
      }
    }
    
    // Also check for direct ItemCode match in pricing database
    const pricingItems = await storage.getAllPricingMasterItems();
    const directMatch = pricingItems.find(p => p.itemCode?.toLowerCase() === sku.toLowerCase());
    
    let result: any = {
      sku,
      resolved: false,
      matchType: 'none',
      category: null,
      machineCompatibility: [],
      pricingMatch: null,
    };
    
    if (matchedRule && matchedRule.categoryId) {
      const category = categoryMap.get(matchedRule.categoryId);
      if (category) {
        result = {
          ...result,
          resolved: true,
          matchType,
          matchedPattern: matchedRule.pattern,
          category: {
            id: category.id,
            code: category.code,
            label: category.label,
            groupId: category.groupId,
          },
          machineCompatibility: (category.compatibleMachineTypes || []).map(mtCode => {
            const mt = machineTypes.find(m => m.code === mtCode);
            return mt ? { code: mt.code, label: mt.label, icon: mt.icon } : { code: mtCode, label: mtCode };
          }),
        };
      }
    }
    
    if (directMatch) {
      result.pricingMatch = {
        itemCode: directMatch.itemCode,
        productName: directMatch.productName,
        productType: directMatch.productType,
        size: directMatch.size,
        dealerPrice: directMatch.dealerPrice,
        retailPrice: directMatch.retailPrice,
      };
      
      // If no mapping but there's a pricing match, check if it has a catalog category
      if (!result.resolved && directMatch.catalogCategoryId) {
        const category = categoryMap.get(directMatch.catalogCategoryId);
        if (category) {
          result = {
            ...result,
            resolved: true,
            matchType: 'pricing_database',
            category: {
              id: category.id,
              code: category.code,
              label: category.label,
              groupId: category.groupId,
            },
            machineCompatibility: (category.compatibleMachineTypes || []).map(mtCode => {
              const mt = machineTypes.find(m => m.code === mtCode);
              return mt ? { code: mt.code, label: mt.label, icon: mt.icon } : { code: mtCode, label: mtCode };
            }),
          };
        }
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error("Error testing SKU:", error);
    res.status(500).json({ error: "Failed to test SKU" });
  }
});

// Preview Impact - Show how many customers/categories would be affected by a mapping change
router.post("/preview-impact", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { mappingId, newCategoryId, pattern, ruleType } = req.body;
    
    // Get existing mapping if we're updating
    let existingMapping = null;
    if (mappingId) {
      const mappings = await storage.getAllAdminSkuMappings();
      existingMapping = mappings.find(m => m.id === mappingId);
    }
    
    // Get all categories
    const categories = await storage.getAllAdminCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c]));
    
    // Get machine types
    const machineTypes = await storage.getAllAdminMachineTypes();
    
    // Get pricing items to estimate SKU coverage
    const pricingItems = await storage.getAllPricingMasterItems();
    
    // Get unmapped items to see potential matches
    const unmappedItems = await storage.getShopifyUnmappedItems();
    const unresolvedItems = unmappedItems.filter(u => !u.resolvedCategoryId);
    
    // Get all customer trust records to see impact
    const categoryTrust = await storage.getAllCategoryTrust();
    
    // Calculate impact
    const testPattern = pattern || existingMapping?.pattern || '';
    const testRuleType = ruleType || existingMapping?.ruleType || 'exact';
    const targetCategoryId = newCategoryId || existingMapping?.categoryId;
    
    // Find matching pricing items
    let matchingPricingItems: typeof pricingItems = [];
    let matchingUnmappedItems: typeof unresolvedItems = [];
    
    if (testPattern) {
      if (testRuleType === 'exact') {
        matchingPricingItems = pricingItems.filter(p => p.itemCode === testPattern);
        matchingUnmappedItems = unresolvedItems.filter(u => u.sku === testPattern);
      } else if (testRuleType === 'prefix') {
        matchingPricingItems = pricingItems.filter(p => p.itemCode?.startsWith(testPattern));
        matchingUnmappedItems = unresolvedItems.filter(u => u.sku?.startsWith(testPattern));
      } else if (testRuleType === 'regex') {
        try {
          const regex = new RegExp(testPattern);
          matchingPricingItems = pricingItems.filter(p => p.itemCode && regex.test(p.itemCode));
          matchingUnmappedItems = unresolvedItems.filter(u => u.sku && regex.test(u.sku));
        } catch (e) {
          // Invalid regex
        }
      }
    }
    
    // Get target category info
    const targetCategory = targetCategoryId ? categoryMap.get(targetCategoryId) : null;
    
    // Find customers who have trust records for the target category
    const affectedTrustRecords = targetCategory 
      ? categoryTrust.filter(t => t.categoryName === targetCategory.label || t.categoryCode === targetCategory.code)
      : [];
    
    // Get unique customer IDs
    const uniqueCustomerIds = new Set(affectedTrustRecords.map(t => t.customerId));
    
    const impact = {
      pattern: testPattern,
      ruleType: testRuleType,
      targetCategory: targetCategory ? {
        id: targetCategory.id,
        code: targetCategory.code,
        label: targetCategory.label,
      } : null,
      machineCompatibility: targetCategory?.compatibleMachineTypes?.map(mtCode => {
        const mt = machineTypes.find(m => m.code === mtCode);
        return mt ? { code: mt.code, label: mt.label } : { code: mtCode, label: mtCode };
      }) || [],
      stats: {
        matchingPricingItems: matchingPricingItems.length,
        matchingUnmappedItems: matchingUnmappedItems.length,
        customersWithTrustInCategory: uniqueCustomerIds.size,
        totalTrustRecordsInCategory: affectedTrustRecords.length,
      },
      sampleMatches: {
        pricingItems: matchingPricingItems.slice(0, 5).map(p => ({
          itemCode: p.itemCode,
          productName: p.productName,
          productType: p.productType,
        })),
        unmappedItems: matchingUnmappedItems.slice(0, 5).map(u => ({
          sku: u.sku,
          productTitle: u.productTitle,
        })),
      },
    };
    
    res.json(impact);
  } catch (error) {
    console.error("Error previewing impact:", error);
    res.status(500).json({ error: "Failed to preview impact" });
  }
});

// Seed admin categories from pricing database
router.post("/seed-categories-from-pricing", isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    // Get unique product names from pricing database
    const pricingItems = await storage.getAllPricingMasterItems();
    
    // Extract unique product names
    const uniqueProductNames = Array.from(new Set(pricingItems.map(p => p.productName).filter(Boolean))) as string[];
    
    // Get existing categories
    const existingCategories = await storage.getAllAdminCategories();
    const existingCodes = new Set(existingCategories.map(c => c.code));
    
    // Get category groups for assignment
    const groups = await storage.getAllAdminCategoryGroups();
    const defaultGroupId = groups.length > 0 ? groups[0].id : null;
    
    let created = 0;
    let skipped = 0;
    
    for (const productName of uniqueProductNames) {
      // Generate a category code from product name
      const code = productName
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
      
      if (existingCodes.has(code)) {
        skipped++;
        continue;
      }
      
      try {
        await storage.createAdminCategory({
          code,
          label: productName,
          groupId: defaultGroupId,
          description: `Auto-seeded from pricing database: ${productName}`,
          compatibleMachineTypes: [],
          isActive: true,
          sortOrder: created,
        });
        existingCodes.add(code);
        created++;
      } catch (e) {
        console.error(`Failed to create category for ${productName}:`, e);
        skipped++;
      }
    }
    
    res.json({
      success: true,
      created,
      skipped,
      total: uniqueProductNames.length,
      message: `Created ${created} categories, skipped ${skipped} (already exist or error)`
    });
  } catch (error) {
    console.error("Error seeding categories:", error);
    res.status(500).json({ error: "Failed to seed categories" });
  }
});

export default router;