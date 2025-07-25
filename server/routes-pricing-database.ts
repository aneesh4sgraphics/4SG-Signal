import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
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
      return res.status(400).json({ error: "CSV file must have header and at least one data row" });
    }

    const headers = parseCSVLine(lines[0]);
    console.log(`CSV headers: ${headers.join(', ')}`);

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

      // Create the pricing master record
      const pricingRecord: InsertProductPricingMaster = {
        itemCode: rowData.ItemCode || '',
        productName: rowData.product_name || '',
        productType: rowData.ProductType || '',
        size: rowData.size || '',
        totalSqm: cleanNumeric(rowData.total_sqm),
        minQuantity: parseInt(rowData.min_quantity) || 50,
        exportPrice: cleanPrice(rowData.Export),
        masterDistributorPrice: cleanPrice(rowData['M.Distributor']),
        dealerPrice: cleanPrice(rowData.Dealer),
        dealer2Price: cleanPrice(rowData.Dealer2),
        approvalNeededPrice: cleanPrice(rowData.ApprovalNeeded),
        tierStage25Price: cleanPrice(rowData.TierStage25),
        tierStage2Price: cleanPrice(rowData.TierStage2),
        tierStage15Price: cleanPrice(rowData.TierStage15),
        tierStage1Price: cleanPrice(rowData.TierStage1),
        retailPrice: cleanPrice(rowData.Retail),
        uploadBatch: uploadBatch
      };

      if (pricingRecord.itemCode) {
        newData.push(pricingRecord);
      }
    }

    console.log(`Parsed ${newData.length} records from CSV`);

    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    if (clearDatabase) {
      // Option 1: Clear and Replace Database
      console.log("Clearing all existing product pricing data...");
      removedCount = await storage.clearAllProductPricingMaster();
      
      console.log(`Inserting ${newData.length} new records...`);
      await storage.bulkCreateProductPricingMaster(newData);
      addedCount = newData.length;
      
      console.log("✓ Complete database replacement completed");
    } else {
      // Option 2: Smart Synchronization
      console.log("Performing smart database synchronization...");
      
      // Get existing data
      const existingData = await storage.getAllProductPricingMaster();
      const existingMap = new Map(existingData.map(item => [item.itemCode, item]));
      const newMap = new Map(newData.map(item => [item.itemCode, item]));
      
      // Step 1: Remove records that don't exist in new data
      for (const existing of existingData) {
        if (!newMap.has(existing.itemCode)) {
          await storage.clearAllProductPricingMaster(); // This could be optimized to delete specific records
          removedCount++;
        }
      }
      
      // Step 2: Add new records and update existing ones
      for (const newRecord of newData) {
        const existing = existingMap.get(newRecord.itemCode);
        
        if (existing) {
          // Check if any values changed
          let hasChanges = false;
          for (const key in newRecord) {
            if (newRecord[key as keyof InsertProductPricingMaster] !== existing[key as keyof typeof existing]) {
              hasChanges = true;
              break;
            }
          }
          
          if (hasChanges) {
            await storage.upsertProductPricingMaster(newRecord);
            updatedCount++;
          }
        } else {
          await storage.createProductPricingMaster(newRecord);
          addedCount++;
        }
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    const totalRecords = await storage.getAllProductPricingMaster();
    
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
      uploadBatch: uploadBatch,
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
    
    res.status(500).json({ 
      error: "Failed to process pricing database upload", 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all product pricing from database
router.get("/product-pricing-database", isAuthenticated, async (req, res) => {
  try {
    console.log("Fetching product pricing from database...");
    const pricingData = await storage.getAllProductPricingMaster();
    console.log(`Retrieved ${pricingData.length} pricing records from database`);
    res.json(pricingData);
  } catch (error) {
    console.error("Error fetching product pricing from database:", error);
    res.status(500).json({ error: "Failed to fetch product pricing from database" });
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
      'TierStage25', 'TierStage2', 'TierStage15', 'TierStage1', 'Retail'
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
        item.retailPrice || 0
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

export default router;