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
function generateRowHash(record: Omit<InsertProductPricingMaster, 'uploadBatch' | 'rowHash'>): string {
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
      return res.status(400).json({ error: "CSV file must have header and at least one data row" });
    }

    const headers = parseCSVLine(lines[0]);
    console.log(`CSV headers: ${headers.join(', ')}`);

    // Preload product types for faster lookups
    const productTypes = await storage.getProductTypes();
    console.log(`Loaded ${productTypes.length} product types for matching`);

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
        masterDistributorPrice: cleanPrice(rowData['M.Distributor']).toString(),
        dealerPrice: cleanPrice(rowData.Dealer).toString(),
        dealer2Price: cleanPrice(rowData.Dealer2).toString(),
        approvalNeededPrice: cleanPrice(rowData.ApprovalNeeded).toString(),
        tierStage25Price: cleanPrice(rowData.TierStage25).toString(),
        tierStage2Price: cleanPrice(rowData.TierStage2).toString(),
        tierStage15Price: cleanPrice(rowData.TierStage15).toString(),
        tierStage1Price: cleanPrice(rowData.TierStage1).toString(),
        retailPrice: cleanPrice(rowData.Retail).toString()
      };

      // Generate hash and create final record
      // Use existing hash from CSV if available, otherwise generate new one
      const existingHash = rowData.row_hash || rowData.rowHash;
      const pricingRecord: InsertProductPricingMaster = {
        ...recordData,
        rowHash: existingHash || generateRowHash(recordData),
        uploadBatch: uploadBatch
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
              const oldValue = existing[field as keyof ProductPricingMaster];
              const newValue = newItem[field as keyof InsertProductPricingMaster];
              
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
    fs.unlinkSync(filePath);
    const totalRecords = await storage.getAllProductPricingMaster();

    console.log(`\n✅ CSV upload completed successfully:`);
    console.log(`   - Records added: ${addedCount}`);
    console.log(`   - Records updated: ${updatedCount}`);
    console.log(`   - Records removed: ${removedCount}`);
    console.log(`   - Total records in database: ${totalRecords.length}`);
    
    // Create upload batch history record
    console.log(`\n📝 Saving upload batch history...`);
    const batchRecord = await storage.createUploadBatch({
      batchId,
      filename: file.originalname,
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
      batchId: batchId,
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

export default router;