import type { Express } from "express";
import { db } from "./db";
import { eq, sql, and, or, desc, asc, lt, isNull, isNotNull, not, inArray } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "./replitAuth";
import { normalizeEmail } from "@shared/email-normalizer";
import { odooClient } from "./odoo";
import { storage } from "./storage";
import { isBlockedCompany, getBlockedKeywordMatch, BLOCKED_COMPANY_KEYWORDS } from "./customer-blocklist";
import { scanForBouncedEmails } from "./bounce-detector";
import multer from "multer";
import path from "path";
import fs from "fs";
import { parseCustomerCSV } from "./customer-parser";
import { parseOdooExcel } from "./odoo-parser";
import { safeFileExists, safeReadFile, safeWriteFile, safeDeleteFile, logUpload } from "./fileLogger";
import {
  customers,
  customerContacts,
  customerJourney,
  sampleRequests,
  categoryTrust,
  sentQuotes,
  customerCoachState,
  customerMachineProfiles,
  customerActivityEvents,
  emailSends,
  shopifyOrders,
  shopifyVariantMappings,
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
  users,
  followUpTasks,
  deletedCustomerExclusions,
  leads,
  leadActivities,
  territorySkipFlags,
  spotlightEvents,
  bouncedEmails,
  dripCampaigns,
  dripCampaignSteps,
  dripCampaignAssignments,
  dripCampaignStepStatus,
  mailerTypes,
  PRICING_TIERS,
} from "@shared/schema";

const upload = multer({ dest: "uploads/" });

export function registerAdminRoutes(app: Express): void {
  app.post("/api/admin/spotlight/digest/send", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { triggerDigestForUser } = await import("./spotlightDigestWorker");
      const { userId } = req.body; // optional — if omitted, send to all eligible users

      if (userId) {
        const result = await triggerDigestForUser(userId);
        return res.json(result);
      }

      // Send to all approved users with digest enabled
      const eligibleUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.status, 'approved'), eq(users.spotlightDigestEnabled, true)));

      const results: Array<{ email: string; sent: boolean; error?: string }> = [];
      for (const user of eligibleUsers) {
        const r = await triggerDigestForUser(user.id);
        results.push({ email: user.email, ...r });
      }

      res.json({ sent: results.filter(r => r.sent).length, skipped: results.filter(r => !r.sent).length, results });
    } catch (error: any) {
      console.error("Digest trigger error:", error);
      res.status(500).json({ error: error.message });
    }
  });
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
  app.post("/api/admin/upload-product-data", isAuthenticated, requireAdmin, upload.single('file'), async (req, res) => {
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
      
      res.json(response);
    } catch (error) {
      console.error("Error uploading product data:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload product data file" });
    }
  });
  app.post("/api/admin/upload-pricing-data", isAuthenticated, requireAdmin, upload.single('file'), async (req, res) => {
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
  app.post("/api/admin/cleanup-deleted-odoo-contacts", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { odooClient: odoo } = await import('./odoo');

      console.log("[Odoo Cleanup] Fetching all active partner IDs from Odoo...");
      // Fetch only IDs of all active partners — fast and lightweight
      const odooPartnerIds: number[] = await odoo.search('res.partner', [['active', '=', true]]);
      const odooPartnerIdSet = new Set(odooPartnerIds);
      console.log(`[Odoo Cleanup] Found ${odooPartnerIdSet.size} active partners in Odoo`);

      // Find local customers with an odooPartnerId that no longer exists in Odoo
      const localWithOdooId = await db.select({
        id: customers.id,
        odooPartnerId: customers.odooPartnerId,
        company: customers.company,
        email: customers.email,
      }).from(customers).where(isNotNull(customers.odooPartnerId));

      const stale = localWithOdooId.filter(c => c.odooPartnerId !== null && !odooPartnerIdSet.has(c.odooPartnerId!));
      console.log(`[Odoo Cleanup] Found ${stale.length} local contacts whose Odoo partner no longer exists`);

      if (stale.length === 0) {
        return res.json({ success: true, deleted: 0, skipped: 0, message: "All contacts are in sync with Odoo" });
      }

      // For each stale contact, check if they have Shopify orders — if so, skip (keep history)
      const staleIds = stale.map(c => c.id);
      const withOrders = await db.execute(
        sql`SELECT DISTINCT customer_id FROM shopify_orders WHERE customer_id IN (${sql.join(staleIds.map(id => sql`${id}`), sql`, `)})`
      ).then(r => new Set((r.rows as { customer_id: string }[]).map(r => r.customer_id)));

      const toDelete = stale.filter(c => !withOrders.has(c.id));
      const skipped = stale.filter(c => withOrders.has(c.id));

      if (skipped.length > 0) {
        console.log(`[Odoo Cleanup] Skipping ${skipped.length} contacts with Shopify order history: ${skipped.map(c => c.company || c.email).slice(0, 5).join(', ')}`);
      }

      let deleted = 0;
      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map(c => c.id);
        console.log(`[Odoo Cleanup] Deleting ${idsToDelete.length} stale contacts: ${toDelete.map(c => c.company || c.email).slice(0, 10).join(', ')}`);
        const BATCH = 100;
        for (let i = 0; i < idsToDelete.length; i += BATCH) {
          await db.delete(customers).where(inArray(customers.id, idsToDelete.slice(i, i + BATCH)));
        }
        deleted = idsToDelete.length;
        setCachedData("customers", null);
      }

      res.json({
        success: true,
        deleted,
        skipped: skipped.length,
        skippedDetails: skipped.map(c => ({ id: c.id, name: c.company || c.email, odooPartnerId: c.odooPartnerId })),
        message: `Deleted ${deleted} stale contact(s). Skipped ${skipped.length} with order history.`,
      });
    } catch (error: any) {
      console.error("[Odoo Cleanup] Error:", error.message);
      res.status(500).json({ error: error.message || "Cleanup failed" });
    }
  });
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
  app.get("/api/admin/download-product-data", isAuthenticated, requireAdmin, async (req, res) => {
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
  app.get("/api/admin/download-pricing-data", isAuthenticated, requireAdmin, async (req, res) => {
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
  app.get("/api/admin/download-customer-data", isAuthenticated, requireAdmin, async (req, res) => {
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
  app.post("/api/admin/gmail/resync-all", isAuthenticated, async (req: any, res) => {
    try {
      const { syncGmailMessages: syncIntelligence } = await import("./gmail-intelligence");
      const { processUnanalyzedMessages, createFollowUpTasksFromEvents } = await import("./email-event-extractor");

      const afterParam = (req.body?.afterDate as string) || '2026-01-01';
      const afterDate = new Date(afterParam + 'T00:00:00Z');
      const maxMessages = Number(req.body?.maxMessages) || 500;

      const connRows = await db.execute(
        sql`SELECT user_id, gmail_address FROM user_gmail_connections WHERE is_active = true`
      );
      const userRows = (connRows as any).rows as Array<{ user_id: string; gmail_address: string }>;
      console.log(`[Resync-All] Starting resync for ${userRows.length} users from ${afterParam} (max ${maxMessages} msgs each)`);

      // Respond immediately — run in background
      res.json({ 
        message: `Resync started for ${userRows.length} users from ${afterParam} (max ${maxMessages} messages each). Check server logs.`,
        users: userRows.map(r => r.user_id),
        afterDate: afterParam,
        maxMessages,
      });

      // Background: sync each user with per-user OAuth + date filter
      (async () => {
        for (const row of userRows) {
          const { user_id: userId, gmail_address: userEmail } = row;
          try {
            console.log(`[Resync-All] → Syncing ${userEmail} (${userId}) from ${afterParam}...`);
            const syncResult = await syncIntelligence(userId, userEmail || '', maxMessages, afterDate);
            console.log(`[Resync-All] ${userEmail}: stored=${(syncResult as any)?.stored ?? '?'} matched=${(syncResult as any)?.matched ?? '?'}`);
            const eventsExtracted = await processUnanalyzedMessages(userId, 500);
            if (eventsExtracted > 0) console.log(`[Resync-All] ${userEmail}: ${eventsExtracted} events extracted`);
            const tasksCreated = await createFollowUpTasksFromEvents(userId, 200);
            if (tasksCreated > 0) console.log(`[Resync-All] ${userEmail}: ${tasksCreated} follow-up tasks created`);
          } catch (err: any) {
            console.error(`[Resync-All] User ${userId} failed:`, err.message);
          }
        }
        console.log(`[Resync-All] Complete for all ${userRows.length} users.`);
      })();

    } catch (error: any) {
      console.error("[Resync-All] Error:", error);
      res.status(500).json({ error: error.message || "Failed to start resync" });
    }
  });
  app.get("/api/admin/tags", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      // Get all customers and extract unique tags with usage counts
      const allCustomers = await db.select({ tags: customers.tags }).from(customers);
      
      // Count tags
      const tagCounts: Record<string, number> = {};
      const pricingTierSet = new Set(PRICING_TIERS.map(t => t.toLowerCase()));
      
      for (const customer of allCustomers) {
        if (customer.tags) {
          const customerTags = customer.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
          for (const tag of customerTags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
      }
      
      // Separate pricing tiers from custom tags
      const customTags = Object.entries(tagCounts)
        .filter(([tag]) => !pricingTierSet.has(tag.toLowerCase()))
        .map(([tag, usageCount]) => ({ tag, usageCount }))
        .sort((a, b) => b.usageCount - a.usageCount);
      
      res.json({
        pricingTiers: PRICING_TIERS,
        customTags,
      });
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });
  app.delete("/api/admin/tags/:tag", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const tagToDelete = decodeURIComponent(req.params.tag);
      
      // Get all customers with this tag
      const allCustomers = await db.select().from(customers);
      let updatedCount = 0;
      
      for (const customer of allCustomers) {
        if (customer.tags) {
          const customerTags = customer.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
          if (customerTags.includes(tagToDelete)) {
            const newTags = customerTags.filter(t => t !== tagToDelete).join(', ');
            await db.update(customers).set({ tags: newTags || null }).where(eq(customers.id, customer.id));
            updatedCount++;
          }
        }
      }
      
      await logAdminAudit("tags", "delete", tagToDelete, tagToDelete, { tag: tagToDelete }, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true, updatedCount });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });
  app.patch("/api/admin/tags/:tag", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const oldTag = decodeURIComponent(req.params.tag);
      const { newTag } = req.body;
      
      if (!newTag || typeof newTag !== 'string') {
        return res.status(400).json({ error: "New tag name is required" });
      }
      
      // Get all customers with this tag
      const allCustomers = await db.select().from(customers);
      let updatedCount = 0;
      
      for (const customer of allCustomers) {
        if (customer.tags) {
          const customerTags = customer.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
          if (customerTags.includes(oldTag)) {
            const newTags = customerTags.map(t => t === oldTag ? newTag.trim() : t).join(', ');
            await db.update(customers).set({ tags: newTags }).where(eq(customers.id, customer.id));
            updatedCount++;
          }
        }
      }
      
      await logAdminAudit("tags", "rename", oldTag, newTag, { oldTag }, { newTag }, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true, updatedCount });
    } catch (error) {
      console.error("Error renaming tag:", error);
      res.status(500).json({ error: "Failed to rename tag" });
    }
  });
  app.get("/api/admin/setup-status", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      // Step 1: Machine Types
      const machineTypes = await db.select().from(adminMachineTypes).where(eq(adminMachineTypes.isActive, true));
      const machineTypesComplete = machineTypes.length >= 3; // At least 3 machine types (offset, digital, flexo, etc.)
      
      // Step 2: Category Groups
      const categoryGroups = await db.select().from(adminCategoryGroups).where(eq(adminCategoryGroups.isActive, true));
      const categoryGroupsComplete = categoryGroups.length >= 2; // At least 2 category groups
      
      // Step 3: Categories with product types
      const categories = await db.select().from(adminCategories).where(eq(adminCategories.isActive, true));
      const categoriesWithMachineTypes = categories.filter(c => c.compatibleMachineTypes && c.compatibleMachineTypes.length > 0);
      const categoriesComplete = categories.length >= 5 && categoriesWithMachineTypes.length >= 3;
      
      // Step 4: SKU Mappings (from Shopify or manual)
      const skuMappings = await db.select().from(adminSkuMappings).where(eq(adminSkuMappings.isActive, true));
      const skuMappingsComplete = skuMappings.length >= 10; // At least 10 mapping rules
      
      // Step 5: Coaching Timers
      const timers = await db.select().from(adminCoachingTimers).where(eq(adminCoachingTimers.isActive, true));
      const timersComplete = timers.length >= 5; // At least 5 active timers
      
      // Step 6: Nudge Settings
      const nudges = await db.select().from(adminNudgeSettings).where(eq(adminNudgeSettings.isEnabled, true));
      const nudgesComplete = nudges.length >= 3; // At least 3 enabled nudges
      
      // Step 7: Conversation Scripts
      const scripts = await db.select().from(adminConversationScripts).where(eq(adminConversationScripts.isActive, true));
      const scriptsComplete = scripts.length >= 3; // At least 3 active scripts
      
      const steps = [
        {
          id: 'machine-types',
          name: 'Define Machine Types',
          description: 'Set up press/machine types your customers use (offset, digital, flexo, etc.)',
          isComplete: machineTypesComplete,
          current: machineTypes.length,
          target: 3,
          percentComplete: Math.min(100, Math.round((machineTypes.length / 3) * 100)),
          whatBreaks: 'Category Trust tracking will not work - you cannot track which products work with which machines.',
          configTab: 'taxonomy',
        },
        {
          id: 'category-groups',
          name: 'Define Category Groups',
          description: 'Organize product categories into logical groups (Inks, Substrates, Chemicals, etc.)',
          isComplete: categoryGroupsComplete,
          current: categoryGroups.length,
          target: 2,
          percentComplete: Math.min(100, Math.round((categoryGroups.length / 2) * 100)),
          whatBreaks: 'Categories will appear unorganized and harder to manage in the UI.',
          configTab: 'taxonomy',
        },
        {
          id: 'categories',
          name: 'Define Categories & Compatibility',
          description: 'Set up product categories with compatible machine types',
          isComplete: categoriesComplete,
          current: categories.length,
          target: 5,
          percentComplete: Math.min(100, Math.round((categoriesWithMachineTypes.length / 3) * 100)),
          whatBreaks: 'CRM cannot track customer category trust or recommend products based on their equipment.',
          configTab: 'taxonomy',
        },
        {
          id: 'sku-mappings',
          name: 'Import SKU Mappings',
          description: 'Map Shopify product SKUs to categories for automatic order categorization',
          isComplete: skuMappingsComplete,
          current: skuMappings.length,
          target: 10,
          percentComplete: Math.min(100, Math.round((skuMappings.length / 10) * 100)),
          whatBreaks: 'Orders from Shopify cannot be automatically categorized - category trust will not advance from purchases.',
          configTab: 'sku-mapping',
        },
        {
          id: 'timers',
          name: 'Set Coaching Timers',
          description: 'Configure follow-up timing for quotes, samples, and outreach',
          isComplete: timersComplete,
          current: timers.length,
          target: 5,
          percentComplete: Math.min(100, Math.round((timers.length / 5) * 100)),
          whatBreaks: 'NOW MODE will not know when to surface follow-up cards - stale quotes and samples will go untracked.',
          configTab: 'timers',
        },
        {
          id: 'nudges',
          name: 'Configure Nudge Rules',
          description: 'Set up the Next Best Move engine priorities and triggers',
          isComplete: nudgesComplete,
          current: nudges.length,
          target: 3,
          percentComplete: Math.min(100, Math.round((nudges.length / 3) * 100)),
          whatBreaks: 'CRM coaching nudges will not appear - reps will miss key action prompts on client pages.',
          configTab: 'nudges',
        },
        {
          id: 'scripts',
          name: 'Add Conversation Scripts',
          description: 'Create templates for different sales stages and customer personas',
          isComplete: scriptsComplete,
          current: scripts.length,
          target: 3,
          percentComplete: Math.min(100, Math.round((scripts.length / 3) * 100)),
          whatBreaks: 'Reps will not have guided scripts for calls - new reps may struggle with conversations.',
          configTab: 'scripts',
        },
      ];
      
      const completedSteps = steps.filter(s => s.isComplete).length;
      const overallPercent = Math.round((completedSteps / steps.length) * 100);
      
      res.json({
        steps,
        completedSteps,
        totalSteps: steps.length,
        overallPercent,
        isFullyConfigured: completedSteps === steps.length,
      });
    } catch (error) {
      console.error("Error getting setup status:", error);
      res.status(500).json({ error: "Failed to get setup status" });
    }
  });
  app.post("/api/admin/import-sku-mappings-from-shopify", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      // Get Shopify data from variant mappings and unmapped items
      const variantMappings = await db.select().from(shopifyVariantMappings).limit(500);
      const unmappedItems = await db.select().from(shopifyUnmappedItems).limit(500);
      
      // Combine all SKUs from both sources
      const allSkus: { sku: string; title: string; source: string }[] = [];
      
      for (const mapping of variantMappings) {
        if (mapping.itemCode) {
          allSkus.push({ 
            sku: mapping.itemCode, 
            title: mapping.shopifyProductTitle || mapping.productName || 'Unknown',
            source: 'variant_mapping'
          });
        }
      }
      
      for (const item of unmappedItems) {
        if (item.sku) {
          allSkus.push({ 
            sku: item.sku, 
            title: item.productTitle || 'Unknown',
            source: 'unmapped_order'
          });
        }
      }
      
      if (allSkus.length === 0) {
        return res.status(400).json({ 
          error: "No Shopify SKUs found. Please sync orders from Shopify first.",
          suggestion: "Go to Shopify Integration and sync your orders to import product SKUs."
        });
      }
      
      // Extract unique SKU prefixes
      const skuPrefixes = new Map<string, { count: number; sampleSkus: string[]; sampleTitles: string[] }>();
      
      for (const item of allSkus) {
        const sku = item.sku;
        // Extract prefix (first 2-4 uppercase letters before dash, underscore, or number)
        const prefixMatch = sku.match(/^([A-Z]{2,4})[-_0-9]?/i);
        if (prefixMatch) {
          const prefix = prefixMatch[1].toUpperCase();
          const existing = skuPrefixes.get(prefix) || { count: 0, sampleSkus: [], sampleTitles: [] };
          existing.count++;
          if (existing.sampleSkus.length < 5 && !existing.sampleSkus.includes(sku)) {
            existing.sampleSkus.push(sku);
            existing.sampleTitles.push(item.title);
          }
          skuPrefixes.set(prefix, existing);
        }
      }
      
      // Get existing categories and mappings
      const categories = await db.select().from(adminCategories).where(eq(adminCategories.isActive, true));
      const existingMappings = await db.select().from(adminSkuMappings);
      const existingPatterns = new Set(existingMappings.map(m => m.pattern.toUpperCase()));
      
      res.json({
        totalSkus: allSkus.length,
        fromVariantMappings: variantMappings.length,
        fromUnmappedOrders: unmappedItems.length,
        skuPrefixes: Array.from(skuPrefixes.entries())
          .filter(([_, data]) => data.count >= 2) // Only show prefixes with 2+ items
          .sort((a, b) => b[1].count - a[1].count)
          .map(([prefix, data]) => ({
            prefix,
            count: data.count,
            sampleSkus: data.sampleSkus,
            sampleTitles: data.sampleTitles,
            suggestedRule: `${prefix}*`,
            alreadyMapped: existingPatterns.has(prefix) || existingPatterns.has(`${prefix}*`),
          })),
        existingCategories: categories.map(c => ({ id: c.id, code: c.code, label: c.label })),
        existingMappingsCount: existingMappings.length,
        instructions: "Review the detected SKU prefixes above. Click 'Create Mapping' to link a prefix to a category. Prefixes marked 'alreadyMapped' are already configured.",
      });
    } catch (error) {
      console.error("Error analyzing Shopify products for SKU mappings:", error);
      res.status(500).json({ error: "Failed to analyze Shopify products" });
    }
  });
  app.get("/api/admin/config/machine-types", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const types = await db.select().from(adminMachineTypes).orderBy(adminMachineTypes.sortOrder);
      res.json(types);
    } catch (error) {
      console.error("Error fetching machine types:", error);
      res.status(500).json({ error: "Failed to fetch machine types" });
    }
  });
  app.post("/api/admin/config/machine-types", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminMachineTypeSchema.parse(req.body);
      const [created] = await db.insert(adminMachineTypes).values(parsed).returning();
      await logAdminAudit("machine_types", "create", String(created.id), created.label, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating machine type:", error);
      res.status(400).json({ error: error.message || "Failed to create machine type" });
    }
  });
  app.put("/api/admin/config/machine-types/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminMachineTypes).where(eq(adminMachineTypes.id, id));
      if (!existing) return res.status(404).json({ error: "Machine type not found" });

      const parsed = insertAdminMachineTypeSchema.partial().parse(req.body);
      const [updated] = await db.update(adminMachineTypes).set({ ...parsed, updatedAt: new Date() }).where(eq(adminMachineTypes.id, id)).returning();
      await logAdminAudit("machine_types", "update", String(id), updated.label, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating machine type:", error);
      res.status(400).json({ error: error.message || "Failed to update machine type" });
    }
  });
  app.delete("/api/admin/config/machine-types/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminMachineTypes).where(eq(adminMachineTypes.id, id));
      if (!existing) return res.status(404).json({ error: "Machine type not found" });

      await db.delete(adminMachineTypes).where(eq(adminMachineTypes.id, id));
      await logAdminAudit("machine_types", "delete", String(id), existing.label, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting machine type:", error);
      res.status(500).json({ error: error.message || "Failed to delete machine type" });
    }
  });
  app.get("/api/admin/config/category-groups", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const groups = await db.select().from(adminCategoryGroups).orderBy(adminCategoryGroups.sortOrder);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching category groups:", error);
      res.status(500).json({ error: "Failed to fetch category groups" });
    }
  });
  app.post("/api/admin/config/category-groups", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminCategoryGroupSchema.parse(req.body);
      const [created] = await db.insert(adminCategoryGroups).values(parsed).returning();
      await logAdminAudit("category_groups", "create", String(created.id), created.label, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating category group:", error);
      res.status(400).json({ error: error.message || "Failed to create category group" });
    }
  });
  app.put("/api/admin/config/category-groups/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCategoryGroups).where(eq(adminCategoryGroups.id, id));
      if (!existing) return res.status(404).json({ error: "Category group not found" });

      const parsed = insertAdminCategoryGroupSchema.partial().parse(req.body);
      const [updated] = await db.update(adminCategoryGroups).set({ ...parsed, updatedAt: new Date() }).where(eq(adminCategoryGroups.id, id)).returning();
      await logAdminAudit("category_groups", "update", String(id), updated.label, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating category group:", error);
      res.status(400).json({ error: error.message || "Failed to update category group" });
    }
  });
  app.delete("/api/admin/config/category-groups/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCategoryGroups).where(eq(adminCategoryGroups.id, id));
      if (!existing) return res.status(404).json({ error: "Category group not found" });

      await db.delete(adminCategoryGroups).where(eq(adminCategoryGroups.id, id));
      await logAdminAudit("category_groups", "delete", String(id), existing.label, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting category group:", error);
      res.status(500).json({ error: error.message || "Failed to delete category group" });
    }
  });
  app.get("/api/admin/config/categories", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const categories = await db.select().from(adminCategories).orderBy(adminCategories.sortOrder);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });
  app.post("/api/admin/config/categories", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminCategorySchema.parse(req.body);
      const [created] = await db.insert(adminCategories).values(parsed).returning();
      await logAdminAudit("categories", "create", String(created.id), created.label, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating category:", error);
      res.status(400).json({ error: error.message || "Failed to create category" });
    }
  });
  app.put("/api/admin/config/categories/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCategories).where(eq(adminCategories.id, id));
      if (!existing) return res.status(404).json({ error: "Category not found" });

      const parsed = insertAdminCategorySchema.partial().parse(req.body);
      const [updated] = await db.update(adminCategories).set({ ...parsed, updatedAt: new Date() }).where(eq(adminCategories.id, id)).returning();
      await logAdminAudit("categories", "update", String(id), updated.label, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating category:", error);
      res.status(400).json({ error: error.message || "Failed to update category" });
    }
  });
  app.delete("/api/admin/config/categories/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCategories).where(eq(adminCategories.id, id));
      if (!existing) return res.status(404).json({ error: "Category not found" });

      await db.delete(adminCategories).where(eq(adminCategories.id, id));
      await logAdminAudit("categories", "delete", String(id), existing.label, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: error.message || "Failed to delete category" });
    }
  });
  app.get("/api/admin/config/category-variants", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
      let query = db.select().from(adminCategoryVariants);
      if (categoryId) {
        const variants = await db.select().from(adminCategoryVariants).where(eq(adminCategoryVariants.categoryId, categoryId)).orderBy(adminCategoryVariants.sortOrder);
        return res.json(variants);
      }
      const variants = await query.orderBy(adminCategoryVariants.sortOrder);
      res.json(variants);
    } catch (error) {
      console.error("Error fetching category variants:", error);
      res.status(500).json({ error: "Failed to fetch category variants" });
    }
  });
  app.post("/api/admin/config/category-variants", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminCategoryVariantSchema.parse(req.body);
      const [created] = await db.insert(adminCategoryVariants).values(parsed).returning();
      await logAdminAudit("category_variants", "create", String(created.id), created.label, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating category variant:", error);
      res.status(400).json({ error: error.message || "Failed to create category variant" });
    }
  });
  app.put("/api/admin/config/category-variants/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCategoryVariants).where(eq(adminCategoryVariants.id, id));
      if (!existing) return res.status(404).json({ error: "Category variant not found" });

      const parsed = insertAdminCategoryVariantSchema.partial().parse(req.body);
      const [updated] = await db.update(adminCategoryVariants).set({ ...parsed, updatedAt: new Date() }).where(eq(adminCategoryVariants.id, id)).returning();
      await logAdminAudit("category_variants", "update", String(id), updated.label, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating category variant:", error);
      res.status(400).json({ error: error.message || "Failed to update category variant" });
    }
  });
  app.delete("/api/admin/config/category-variants/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCategoryVariants).where(eq(adminCategoryVariants.id, id));
      if (!existing) return res.status(404).json({ error: "Category variant not found" });

      await db.delete(adminCategoryVariants).where(eq(adminCategoryVariants.id, id));
      await logAdminAudit("category_variants", "delete", String(id), existing.label, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting category variant:", error);
      res.status(500).json({ error: error.message || "Failed to delete category variant" });
    }
  });
  app.get("/api/admin/config/shopify-skus", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      // Fetch unique SKUs from Shopify orders
      const orders = await db.select({ lineItems: shopifyOrders.lineItems }).from(shopifyOrders);
      const skuSet = new Set<string>();
      for (const order of orders) {
        if (order.lineItems && Array.isArray(order.lineItems)) {
          for (const item of order.lineItems) {
            if (item && typeof item === 'object' && 'sku' in item && item.sku) {
              skuSet.add(String(item.sku));
            } else if (item && typeof item === 'object' && 'title' in item && item.title) {
              // Use title as fallback identifier if no SKU
              skuSet.add(String(item.title));
            }
          }
        }
      }
      res.json(Array.from(skuSet).sort());
    } catch (error) {
      console.error("Error fetching Shopify SKUs:", error);
      res.status(500).json({ error: "Failed to fetch Shopify SKUs" });
    }
  });
  app.get("/api/admin/config/sku-mappings", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const mappings = await db.select().from(adminSkuMappings).orderBy(desc(adminSkuMappings.priority));
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching SKU mappings:", error);
      res.status(500).json({ error: "Failed to fetch SKU mappings" });
    }
  });
  app.post("/api/admin/config/sku-mappings", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminSkuMappingSchema.parse(req.body);
      const [created] = await db.insert(adminSkuMappings).values(parsed).returning();
      await logAdminAudit("sku_mappings", "create", String(created.id), created.pattern, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating SKU mapping:", error);
      res.status(400).json({ error: error.message || "Failed to create SKU mapping" });
    }
  });
  app.put("/api/admin/config/sku-mappings/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminSkuMappings).where(eq(adminSkuMappings.id, id));
      if (!existing) return res.status(404).json({ error: "SKU mapping not found" });

      const parsed = insertAdminSkuMappingSchema.partial().parse(req.body);
      const [updated] = await db.update(adminSkuMappings).set({ ...parsed, updatedAt: new Date() }).where(eq(adminSkuMappings.id, id)).returning();
      await logAdminAudit("sku_mappings", "update", String(id), updated.pattern, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating SKU mapping:", error);
      res.status(400).json({ error: error.message || "Failed to update SKU mapping" });
    }
  });
  app.delete("/api/admin/config/sku-mappings/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminSkuMappings).where(eq(adminSkuMappings.id, id));
      if (!existing) return res.status(404).json({ error: "SKU mapping not found" });

      await db.delete(adminSkuMappings).where(eq(adminSkuMappings.id, id));
      await logAdminAudit("sku_mappings", "delete", String(id), existing.pattern, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting SKU mapping:", error);
      res.status(500).json({ error: error.message || "Failed to delete SKU mapping" });
    }
  });
  app.get("/api/admin/config/coaching-timers", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const timers = await db.select().from(adminCoachingTimers).orderBy(adminCoachingTimers.category);
      res.json(timers);
    } catch (error) {
      console.error("Error fetching coaching timers:", error);
      res.status(500).json({ error: "Failed to fetch coaching timers" });
    }
  });
  app.post("/api/admin/config/coaching-timers", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminCoachingTimerSchema.parse(req.body);
      const [created] = await db.insert(adminCoachingTimers).values(parsed).returning();
      await logAdminAudit("coaching_timers", "create", String(created.id), created.label, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating coaching timer:", error);
      res.status(400).json({ error: error.message || "Failed to create coaching timer" });
    }
  });
  app.put("/api/admin/config/coaching-timers/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCoachingTimers).where(eq(adminCoachingTimers.id, id));
      if (!existing) return res.status(404).json({ error: "Coaching timer not found" });

      const parsed = insertAdminCoachingTimerSchema.partial().parse(req.body);
      const [updated] = await db.update(adminCoachingTimers).set({ ...parsed, updatedAt: new Date() }).where(eq(adminCoachingTimers.id, id)).returning();
      await logAdminAudit("coaching_timers", "update", String(id), updated.label, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating coaching timer:", error);
      res.status(400).json({ error: error.message || "Failed to update coaching timer" });
    }
  });
  app.delete("/api/admin/config/coaching-timers/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminCoachingTimers).where(eq(adminCoachingTimers.id, id));
      if (!existing) return res.status(404).json({ error: "Coaching timer not found" });

      await db.delete(adminCoachingTimers).where(eq(adminCoachingTimers.id, id));
      await logAdminAudit("coaching_timers", "delete", String(id), existing.label, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting coaching timer:", error);
      res.status(500).json({ error: error.message || "Failed to delete coaching timer" });
    }
  });
  app.get("/api/admin/config/nudge-settings", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const settings = await db.select().from(adminNudgeSettings).orderBy(adminNudgeSettings.priority);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching nudge settings:", error);
      res.status(500).json({ error: "Failed to fetch nudge settings" });
    }
  });
  app.post("/api/admin/config/nudge-settings", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminNudgeSettingSchema.parse(req.body);
      const [created] = await db.insert(adminNudgeSettings).values(parsed).returning();
      await logAdminAudit("nudge_settings", "create", String(created.id), created.label, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating nudge setting:", error);
      res.status(400).json({ error: error.message || "Failed to create nudge setting" });
    }
  });
  app.put("/api/admin/config/nudge-settings/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminNudgeSettings).where(eq(adminNudgeSettings.id, id));
      if (!existing) return res.status(404).json({ error: "Nudge setting not found" });

      const parsed = insertAdminNudgeSettingSchema.partial().parse(req.body);
      const [updated] = await db.update(adminNudgeSettings).set({ ...parsed, updatedAt: new Date() }).where(eq(adminNudgeSettings.id, id)).returning();
      await logAdminAudit("nudge_settings", "update", String(id), updated.label, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating nudge setting:", error);
      res.status(400).json({ error: error.message || "Failed to update nudge setting" });
    }
  });
  app.delete("/api/admin/config/nudge-settings/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminNudgeSettings).where(eq(adminNudgeSettings.id, id));
      if (!existing) return res.status(404).json({ error: "Nudge setting not found" });

      await db.delete(adminNudgeSettings).where(eq(adminNudgeSettings.id, id));
      await logAdminAudit("nudge_settings", "delete", String(id), existing.label, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting nudge setting:", error);
      res.status(500).json({ error: error.message || "Failed to delete nudge setting" });
    }
  });
  app.get("/api/admin/config/conversation-scripts", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const scripts = await db.select().from(adminConversationScripts).orderBy(adminConversationScripts.sortOrder);
      res.json(scripts);
    } catch (error) {
      console.error("Error fetching conversation scripts:", error);
      res.status(500).json({ error: "Failed to fetch conversation scripts" });
    }
  });
  app.post("/api/admin/config/conversation-scripts", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdminConversationScriptSchema.parse(req.body);
      const [created] = await db.insert(adminConversationScripts).values(parsed).returning();
      await logAdminAudit("conversation_scripts", "create", String(created.id), created.title, null, created, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(created);
    } catch (error: any) {
      console.error("Error creating conversation script:", error);
      res.status(400).json({ error: error.message || "Failed to create conversation script" });
    }
  });
  app.put("/api/admin/config/conversation-scripts/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminConversationScripts).where(eq(adminConversationScripts.id, id));
      if (!existing) return res.status(404).json({ error: "Conversation script not found" });

      const parsed = insertAdminConversationScriptSchema.partial().parse(req.body);
      const [updated] = await db.update(adminConversationScripts).set({ ...parsed, updatedAt: new Date() }).where(eq(adminConversationScripts.id, id)).returning();
      await logAdminAudit("conversation_scripts", "update", String(id), updated.title, existing, updated, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating conversation script:", error);
      res.status(400).json({ error: error.message || "Failed to update conversation script" });
    }
  });
  app.delete("/api/admin/config/conversation-scripts/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(adminConversationScripts).where(eq(adminConversationScripts.id, id));
      if (!existing) return res.status(404).json({ error: "Conversation script not found" });

      await db.delete(adminConversationScripts).where(eq(adminConversationScripts.id, id));
      await logAdminAudit("conversation_scripts", "delete", String(id), existing.title, existing, null, req.user?.claims?.sub || "unknown", req.user?.claims?.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting conversation script:", error);
      res.status(500).json({ error: error.message || "Failed to delete conversation script" });
    }
  });
  app.get("/api/admin/config/audit-log", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const configType = req.query.configType as string;

      let logs;
      if (configType) {
        logs = await db.select().from(adminAuditLog)
          .where(eq(adminAuditLog.configType, configType))
          .orderBy(desc(adminAuditLog.createdAt))
          .limit(limit)
          .offset(offset);
      } else {
        logs = await db.select().from(adminAuditLog)
          .orderBy(desc(adminAuditLog.createdAt))
          .limit(limit)
          .offset(offset);
      }
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  });
  app.get("/api/admin/config/versions", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const configType = req.query.configType as string;
      if (!configType) {
        return res.status(400).json({ error: "configType query parameter required" });
      }
      const versions = await db.select().from(adminConfigVersions)
        .where(eq(adminConfigVersions.configType, configType))
        .orderBy(desc(adminConfigVersions.version));
      res.json(versions);
    } catch (error) {
      console.error("Error fetching config versions:", error);
      res.status(500).json({ error: "Failed to fetch config versions" });
    }
  });
  app.post("/api/admin/config/versions/publish", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { configType, configData } = req.body;
      if (!configType || !configData) {
        return res.status(400).json({ error: "configType and configData required" });
      }

      // Get latest version number
      const [latest] = await db.select().from(adminConfigVersions)
        .where(eq(adminConfigVersions.configType, configType))
        .orderBy(desc(adminConfigVersions.version))
        .limit(1);

      const newVersion = (latest?.version || 0) + 1;

      // Archive previous published version
      if (latest && latest.status === 'published') {
        await db.update(adminConfigVersions)
          .set({ status: 'archived' })
          .where(eq(adminConfigVersions.id, latest.id));
      }

      // Create new published version
      const [created] = await db.insert(adminConfigVersions).values({
        configType,
        version: newVersion,
        status: 'published',
        configData,
        publishedBy: req.user?.claims?.sub || 'unknown',
        publishedAt: new Date(),
      }).returning();

      await logAdminAudit("config_versions", "publish", String(created.id), `${configType} v${newVersion}`, latest?.configData, configData, req.user?.claims?.sub || "unknown", req.user?.claims?.email);

      res.json(created);
    } catch (error) {
      console.error("Error publishing config version:", error);
      res.status(500).json({ error: "Failed to publish config version" });
    }
  });
  app.post("/api/admin/config/versions/:id/rollback", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [targetVersion] = await db.select().from(adminConfigVersions).where(eq(adminConfigVersions.id, id));

      if (!targetVersion) {
        return res.status(404).json({ error: "Version not found" });
      }

      // Get current published version
      const [current] = await db.select().from(adminConfigVersions)
        .where(and(
          eq(adminConfigVersions.configType, targetVersion.configType),
          eq(adminConfigVersions.status, 'published')
        ))
        .limit(1);

      // Archive current
      if (current) {
        await db.update(adminConfigVersions)
          .set({ status: 'archived' })
          .where(eq(adminConfigVersions.id, current.id));
      }

      // Create new version from rollback
      const newVersion = (current?.version || targetVersion.version) + 1;
      const [created] = await db.insert(adminConfigVersions).values({
        configType: targetVersion.configType,
        version: newVersion,
        status: 'published',
        configData: targetVersion.configData,
        publishedBy: req.user?.claims?.sub || 'unknown',
        publishedAt: new Date(),
      }).returning();

      await logAdminAudit("config_versions", "rollback", String(id), `${targetVersion.configType} rollback to v${targetVersion.version}`, current?.configData, targetVersion.configData, req.user?.claims?.sub || "unknown", req.user?.claims?.email);

      res.json(created);
    } catch (error) {
      console.error("Error rolling back config version:", error);
      res.status(500).json({ error: "Failed to rollback config version" });
    }
  });
  app.post("/api/admin/config/seed", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || 'unknown';
      const userEmail = req.user?.claims?.email || null;

      // Check if already seeded
      const existingMachines = await db.select().from(adminMachineTypes).limit(1);
      if (existingMachines.length > 0) {
        return res.json({ message: "Config already seeded", seeded: false });
      }

      // Seed machine types (8 families as per spec)
      const machineTypes = [
        { code: 'offset', label: 'Offset', icon: 'Printer', description: 'Traditional offset lithography presses', sortOrder: 1 },
        { code: 'digital_dry_toner', label: 'Digital Dry Toner', icon: 'Zap', description: 'Xerox, Canon, Konica Minolta dry toner', sortOrder: 2 },
        { code: 'hp_indigo', label: 'HP Indigo', icon: 'Sparkles', description: 'HP Indigo liquid electroink presses', sortOrder: 3 },
        { code: 'digital_inkjet_uv', label: 'Digital Inkjet/UV', icon: 'Droplet', description: 'UV-curable inkjet printers', sortOrder: 4 },
        { code: 'wide_format_flatbed', label: 'Wide Format Flatbed', icon: 'Maximize', description: 'Flatbed wide format printers', sortOrder: 5 },
        { code: 'wide_format_roll', label: 'Wide Format Roll', icon: 'Maximize', description: 'Roll-fed wide format printers', sortOrder: 6 },
        { code: 'aqueous_photo', label: 'Aqueous Photo', icon: 'Droplet', description: 'Aqueous-based photo printers', sortOrder: 7 },
        { code: 'screen_printing', label: 'Screen Printing', icon: 'Layers', description: 'Screen printing equipment', sortOrder: 8 },
      ];

      for (const mt of machineTypes) {
        await db.insert(adminMachineTypes).values(mt).onConflictDoNothing();
      }

      // Seed category groups
      const categoryGroups = [
        { code: 'labels', label: 'Labels', color: 'blue', sortOrder: 1 },
        { code: 'synthetic', label: 'Synthetic', color: 'green', sortOrder: 2 },
        { code: 'specialty', label: 'Specialty', color: 'purple', sortOrder: 3 },
        { code: 'thermal', label: 'Thermal', color: 'orange', sortOrder: 4 },
      ];

      for (const cg of categoryGroups) {
        await db.insert(adminCategoryGroups).values(cg).onConflictDoNothing();
      }

      // Seed coaching timers
      const coachingTimers = [
        { timerKey: 'quote_followup_soft', label: 'Quote Follow-up (Soft)', category: 'quote_followup', valueDays: 4, description: 'Days until initial quote follow-up reminder' },
        { timerKey: 'quote_followup_risk', label: 'Quote Follow-up (At Risk)', category: 'quote_followup', valueDays: 7, description: 'Days until quote marked as at-risk' },
        { timerKey: 'quote_followup_expire', label: 'Quote Follow-up (Expired)', category: 'quote_followup', valueDays: 14, description: 'Days until quote considered expired' },
        { timerKey: 'press_test_delivery_grace', label: 'Press Test Delivery Grace', category: 'press_test', valueDays: 5, description: 'Days after sample delivery before follow-up' },
        { timerKey: 'press_test_escalation', label: 'Press Test Escalation', category: 'press_test', valueDays: 10, description: 'Days until press test escalated' },
        { timerKey: 'habitual_window', label: 'Habitual Definition', category: 'habitual', valueDays: 90, description: '2 purchases within this many days = habitual' },
        { timerKey: 'stale_account_days', label: 'Stale Account', category: 'stale_account', valueDays: 60, description: 'Days without touch before account marked stale' },
      ];

      for (const ct of coachingTimers) {
        await db.insert(adminCoachingTimers).values(ct).onConflictDoNothing();
      }

      // Seed nudge settings
      const nudgeSettings = [
        { nudgeKey: 'press_test_followup', label: 'Press Test Follow-up', priority: 10, severity: 'high', isEnabled: true, description: 'Follow up on press tests awaiting results' },
        { nudgeKey: 'quote_followup', label: 'Quote Follow-up', priority: 20, severity: 'medium', isEnabled: true, description: 'Follow up on open quotes' },
        { nudgeKey: 'reorder_overdue', label: 'Reorder Overdue', priority: 30, severity: 'high', isEnabled: true, description: 'Habitual customer missed expected reorder' },
        { nudgeKey: 'reorder_due', label: 'Reorder Due', priority: 40, severity: 'medium', isEnabled: true, description: 'Habitual customer reorder window approaching' },
        { nudgeKey: 'expand_category', label: 'Expand Category', priority: 50, severity: 'low', isEnabled: true, description: 'Opportunity to introduce new categories' },
        { nudgeKey: 'stale_account', label: 'Stale Account', priority: 60, severity: 'low', isEnabled: true, description: 'Account has gone quiet' },
      ];

      for (const ns of nudgeSettings) {
        await db.insert(adminNudgeSettings).values(ns).onConflictDoNothing();
      }

      // Seed conversation scripts
      const conversationScripts = [
        { 
          scriptKey: 'prospect_intro_call', 
          title: 'Introduction Call', 
          stage: 'prospect', 
          persona: 'all', 
          situation: 'first_contact',
          scriptContent: `Hi [Name], this is [Your Name] from 4S Graphics. I noticed you recently [trigger event]. 

I wanted to reach out because we specialize in [relevant product category] for [their machine type].

"What type of printing do you do most often?"

[Listen for machine types and applications]

"That's great! We have several products that work exceptionally well with [their machine]. Would you be interested in seeing some samples?"

[If yes] "Perfect! I'll put together a sample kit with our top recommendations. What's the best address to send it to?"

[If no] "No problem at all. I'll send you our digital catalog so you have it for reference. What email works best for you?"`
        },
        { 
          scriptKey: 'prospect_sample_followup', 
          title: 'Sample Follow-Up', 
          stage: 'prospect', 
          persona: 'all', 
          situation: 'sample_sent',
          scriptContent: `Hi [Name], this is [Your Name] from 4S Graphics. I'm calling to follow up on the samples we sent last week.

"Did you get a chance to test them out?"

[If yes - positive] "That's great to hear! What did you like most about it? Ready to place an order?"

[If yes - issues] "I appreciate you trying it. What challenges did you run into? [Listen] Let me suggest [alternative product] which might work better for your setup."

[If not yet] "No problem! When do you think you'll have time to run them? I'll set a reminder to check back then."

"Is there anything else I can help you with in the meantime?"`
        },
        { 
          scriptKey: 'expansion_cross_sell', 
          title: 'Cross-Sell Opportunity', 
          stage: 'expansion', 
          persona: 'all', 
          situation: 'reorder',
          scriptContent: `Hi [Name], this is [Your Name] from 4S Graphics. Thanks for your recent order!

I noticed you've been ordering [current product]. I wanted to mention that many of our customers who use [current product] also love [complementary product] for [use case].

"Have you ever tried it for [application]?"

[If interested] "Great! I can add some samples to your next shipment so you can test it. Would that work?"

[If not interested] "No worries at all. Just wanted to make sure you knew about it. Is there anything else you need for your upcoming projects?"

"By the way, if you order [volume] of [product], we have a special pricing tier I can set up for you."`
        },
        { 
          scriptKey: 'retention_stale_account', 
          title: 'Re-Engagement Call', 
          stage: 'retention', 
          persona: 'all', 
          situation: 'stale_account',
          scriptContent: `Hi [Name], this is [Your Name] from 4S Graphics. It's been a while since we connected, and I wanted to check in.

"How have things been going at [Company]?"

[Listen for business updates, challenges]

"We've actually introduced some new products since we last spoke that I think would be perfect for [their use case]. Have you heard about [new product]?"

[Share relevant update]

"Would you like me to send over some samples so you can see the improvements?"

"Is there anything specific you've been looking for that you haven't found a good solution for yet?"`
        },
      ];

      for (const cs of conversationScripts) {
        await db.insert(adminConversationScripts).values(cs).onConflictDoNothing();
      }

      await logAdminAudit("system", "seed", null, "Initial config seeding", null, { machineTypes, categoryGroups, coachingTimers, nudgeSettings, conversationScripts }, userId, userEmail);

      res.json({ message: "Config seeded successfully", seeded: true });
    } catch (error) {
      console.error("Error seeding config:", error);
      res.status(500).json({ error: "Failed to seed config" });
    }
  });
  app.get("/api/admin/spotlight/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const analytics = await db.execute(sql`
        WITH user_stats AS (
          SELECT 
            se.user_id,
            u.email as user_email,
            u.first_name,
            u.last_name,
            COUNT(*) FILTER (WHERE se.event_type = 'completed') as completed_count,
            COUNT(*) FILTER (WHERE se.event_type = 'skipped') as skipped_count,
            COUNT(*) as total_events,
            COUNT(DISTINCT DATE(se.created_at)) as active_days
          FROM spotlight_events se
          LEFT JOIN users u ON se.user_id = u.id
          WHERE se.created_at >= ${start} AND se.created_at <= ${end}
          GROUP BY se.user_id, u.email, u.first_name, u.last_name
        ),
        bucket_stats AS (
          SELECT 
            user_id,
            bucket,
            COUNT(*) FILTER (WHERE event_type = 'completed') as bucket_completed,
            COUNT(*) FILTER (WHERE event_type = 'skipped') as bucket_skipped
          FROM spotlight_events
          WHERE created_at >= ${start} AND created_at <= ${end}
            AND bucket IS NOT NULL
          GROUP BY user_id, bucket
        ),
        bucket_agg AS (
          SELECT 
            user_id,
            jsonb_object_agg(
              bucket,
              jsonb_build_object('completed', bucket_completed, 'skipped', bucket_skipped)
            ) as bucket_breakdown
          FROM bucket_stats
          GROUP BY user_id
        )
        SELECT 
          us.*,
          ROUND(100.0 * us.completed_count / NULLIF(us.total_events, 0), 1) as completion_rate,
          ROUND(100.0 * us.skipped_count / NULLIF(us.total_events, 0), 1) as skip_rate,
          COALESCE(ba.bucket_breakdown, '{}'::jsonb) as bucket_breakdown
        FROM user_stats us
        LEFT JOIN bucket_agg ba ON us.user_id = ba.user_id
        ORDER BY us.completed_count DESC
      `);

      const outcomes = await db.execute(sql`
        SELECT 
          outcome_id,
          outcome_label,
          COUNT(*) as count
        FROM spotlight_events
        WHERE event_type = 'completed'
          AND created_at >= ${start} AND created_at <= ${end}
          AND outcome_id IS NOT NULL
        GROUP BY outcome_id, outcome_label
        ORDER BY count DESC
        LIMIT 20
      `);

      const dailyTrend = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) FILTER (WHERE event_type = 'completed') as completed,
          COUNT(*) FILTER (WHERE event_type = 'skipped') as skipped
        FROM spotlight_events
        WHERE created_at >= ${start} AND created_at <= ${end}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `);

      res.json({
        perRep: analytics.rows,
        outcomes: outcomes.rows,
        dailyTrend: dailyTrend.rows,
        dateRange: { start, end },
      });
    } catch (error) {
      console.error("[Spotlight] Analytics error:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });
  app.get("/api/admin/leaderboard", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      // Get today's date boundaries
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // This week boundaries (Monday start)
      const thisWeekStart = new Date(today);
      const dayOfWeek = thisWeekStart.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
      thisWeekStart.setDate(thisWeekStart.getDate() - diff);
      
      // This month boundaries
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      // Get user stats with bucket breakdown
      const userStats = await db.execute(sql`
        WITH user_tasks AS (
          SELECT 
            se.user_id,
            u.email,
            COALESCE(u.first_name, SPLIT_PART(u.email, '@', 1)) as display_name,
            se.bucket,
            COUNT(*) FILTER (WHERE se.event_type = 'completed' AND se.created_at >= ${today}) as today_completed,
            COUNT(*) FILTER (WHERE se.event_type = 'completed' AND se.created_at >= ${thisWeekStart}) as week_completed,
            COUNT(*) FILTER (WHERE se.event_type = 'completed' AND se.created_at >= ${thisMonthStart}) as month_completed
          FROM spotlight_events se
          JOIN users u ON se.user_id = u.id
          WHERE u.status = 'approved'
            AND se.created_at >= ${thisMonthStart}
          GROUP BY se.user_id, u.email, u.first_name, se.bucket
        ),
        bucket_agg AS (
          SELECT 
            user_id,
            email,
            display_name,
            SUM(today_completed) as today_total,
            SUM(week_completed) as week_total,
            SUM(month_completed) as month_total,
            jsonb_object_agg(
              COALESCE(bucket, 'unknown'),
              jsonb_build_object(
                'today', today_completed,
                'week', week_completed,
                'month', month_completed
              )
            ) as bucket_stats
          FROM user_tasks
          GROUP BY user_id, email, display_name
        ),
        hot_leads AS (
          SELECT 
            c.sales_rep_id,
            COUNT(*) as hot_lead_count
          FROM customers c
          WHERE c.is_hot_prospect = true
            AND c.do_not_contact = false
            AND c.sales_rep_id IS NOT NULL
          GROUP BY c.sales_rep_id
        ),
        leads_touched AS (
          SELECT 
            l.sales_rep_id,
            COUNT(*) as total_leads,
            COUNT(*) FILTER (WHERE l.first_email_sent_at IS NOT NULL) as leads_emailed,
            COUNT(*) FILTER (WHERE l.first_email_reply_at IS NOT NULL) as leads_replied
          FROM leads l
          WHERE l.sales_rep_id IS NOT NULL
          GROUP BY l.sales_rep_id
        )
        ,
        recent_customers AS (
          SELECT 
            se.user_id,
            c.odoo_partner_id,
            c.id as customer_id,
            COALESCE(NULLIF(c.company, ''), NULLIF(CONCAT(c.first_name, ' ', c.last_name), ' '), c.email) as customer_name
          FROM spotlight_events se
          JOIN customers c ON se.customer_id::text = c.id::text
          WHERE se.event_type = 'completed'
            AND se.created_at >= ${thisWeekStart}
          GROUP BY se.user_id, c.id, c.odoo_partner_id, c.company, c.first_name, c.last_name, c.email
        ),
        customer_names AS (
          SELECT 
            user_id,
            jsonb_agg(
              jsonb_build_object('name', customer_name, 'odooPartnerId', odoo_partner_id, 'id', customer_id)
              ORDER BY customer_name
            ) as customers_worked
          FROM recent_customers
          WHERE customer_name IS NOT NULL AND customer_name != ''
          GROUP BY user_id
        )
        SELECT 
          ba.user_id,
          ba.email,
          ba.display_name,
          ba.today_total::int as today_total,
          ba.week_total::int as week_total,
          ba.month_total::int as month_total,
          ba.bucket_stats,
          COALESCE(hl.hot_lead_count, 0)::int as hot_leads,
          COALESCE(lt.total_leads, 0)::int as total_leads,
          COALESCE(lt.leads_emailed, 0)::int as leads_emailed,
          COALESCE(lt.leads_replied, 0)::int as leads_replied,
          COALESCE(cn.customers_worked, '[]'::jsonb) as customers_worked
        FROM bucket_agg ba
        LEFT JOIN hot_leads hl ON ba.user_id = hl.sales_rep_id
        LEFT JOIN leads_touched lt ON ba.user_id = lt.sales_rep_id
        LEFT JOIN customer_names cn ON ba.user_id = cn.user_id
        ORDER BY ba.week_total DESC
      `);

      res.json({
        users: userStats.rows,
        dateRange: {
          today: today.toISOString(),
          weekStart: thisWeekStart.toISOString(),
          monthStart: thisMonthStart.toISOString(),
        }
      });
    } catch (error) {
      console.error("[Admin] Leaderboard error:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });
  app.get("/api/admin/spotlight/pause-patterns", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const pausePatterns = await db.execute(sql`
        SELECT 
          user_id,
          u.email as user_email,
          u.first_name,
          u.last_name,
          AVG((metadata->>'cardsBeforePause')::int) as avg_cards_before_pause,
          COUNT(*) as pause_count,
          jsonb_agg(jsonb_build_object(
            'date', created_at,
            'cardsBeforePause', metadata->'cardsBeforePause',
            'remaining', metadata->'remaining'
          ) ORDER BY created_at DESC) as pause_history
        FROM spotlight_events se
        LEFT JOIN users u ON se.user_id = u.id
        WHERE event_type = 'paused'
        AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY user_id, u.email, u.first_name, u.last_name
        ORDER BY pause_count DESC
      `);

      const isFriday = new Date().getDay() === 5;

      res.json({
        patterns: pausePatterns.rows,
        isFriday,
        recommendation: isFriday ? "It's Friday! Consider reviewing pause patterns to adjust daily card count." : null,
      });
    } catch (error) {
      console.error("[Spotlight] Pause patterns error:", error);
      res.status(500).json({ error: "Failed to fetch pause patterns" });
    }
  });
  app.get("/api/admin/blocked-customers", requireAdmin, async (req: any, res) => {
    try {
      // Find all customers that match blocked keywords
      const allCustomers = await db.select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        sources: customers.sources,
      }).from(customers);
      
      const blockedCustomers = allCustomers.filter(c => {
        const name = c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim();
        return isBlockedCompany(name);
      }).map(c => ({
        id: c.id,
        name: c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim(),
        email: c.email,
        sources: c.sources,
        matchedKeyword: getBlockedKeywordMatch(c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim()),
      }));
      
      res.json({
        count: blockedCustomers.length,
        blockedKeywords: BLOCKED_COMPANY_KEYWORDS,
        customers: blockedCustomers,
      });
    } catch (error) {
      console.error("Error finding blocked customers:", error);
      res.status(500).json({ error: "Failed to find blocked customers" });
    }
  });
  app.delete("/api/admin/blocked-customers", requireAdmin, async (req: any, res) => {
    try {
      // Find all customers that match blocked keywords
      const allCustomers = await db.select({
        id: customers.id,
        company: customers.company,
        firstName: customers.firstName,
        lastName: customers.lastName,
      }).from(customers);
      
      const blockedIds = allCustomers.filter(c => {
        const name = c.company || `${c.firstName || ''} ${c.lastName || ''}`.trim();
        return isBlockedCompany(name);
      }).map(c => c.id);
      
      if (blockedIds.length === 0) {
        return res.json({ deleted: 0, message: "No blocked customers found" });
      }
      
      // Delete in batches
      let deleted = 0;
      const batchSize = 50;
      const deletedNames: string[] = [];
      
      for (let i = 0; i < blockedIds.length; i += batchSize) {
        const batch = blockedIds.slice(i, i + batchSize);
        
        for (const id of batch) {
          const customer = allCustomers.find(c => c.id === id);
          const name = customer ? (customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim()) : id;
          
          // Delete related records first due to foreign keys
          await db.delete(customerContacts).where(eq(customerContacts.customerId, id));
          await db.delete(customerJourney).where(eq(customerJourney.customerId, id));
          await db.delete(categoryTrust).where(eq(categoryTrust.customerId, id));
          await db.delete(customerCoachState).where(eq(customerCoachState.customerId, id));
          await db.delete(customerMachineProfiles).where(eq(customerMachineProfiles.customerId, id));
          await db.delete(sampleRequests).where(eq(sampleRequests.customerId, id));
          await db.delete(followUpTasks).where(eq(followUpTasks.customerId, id));
          
          // Delete the customer
          await db.delete(customers).where(eq(customers.id, id));
          deleted++;
          if (deletedNames.length < 20) {
            deletedNames.push(name);
          }
        }
      }
      
      console.log(`[Admin] Deleted ${deleted} blocked customers`);
      
      res.json({
        deleted,
        deletedNames: deletedNames.slice(0, 20),
        message: `Successfully deleted ${deleted} blocked customers`,
      });
    } catch (error) {
      console.error("Error deleting blocked customers:", error);
      res.status(500).json({ error: "Failed to delete blocked customers" });
    }
  });
  app.get("/api/admin/customer-exclusions", requireAdmin, async (req: any, res) => {
    try {
      const exclusions = await db.select().from(deletedCustomerExclusions).orderBy(desc(deletedCustomerExclusions.createdAt));
      res.json({
        count: exclusions.length,
        exclusions,
      });
    } catch (error) {
      console.error("Error fetching customer exclusions:", error);
      res.status(500).json({ error: "Failed to fetch exclusions" });
    }
  });
  app.delete("/api/admin/customer-exclusions/:id", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid exclusion ID" });
      }
      
      const [deleted] = await db.delete(deletedCustomerExclusions)
        .where(eq(deletedCustomerExclusions.id, id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: "Exclusion not found" });
      }
      
      console.log(`[Admin] Removed exclusion for ${deleted.companyName || deleted.email} (Odoo: ${deleted.odooPartnerId}, Shopify: ${deleted.shopifyCustomerId})`);
      res.json({ success: true, removed: deleted });
    } catch (error) {
      console.error("Error removing customer exclusion:", error);
      res.status(500).json({ error: "Failed to remove exclusion" });
    }
  });
  app.get("/api/admin/mailer-types", isAuthenticated, async (req, res) => {
    try {
      const types = await db.select().from(mailerTypes).orderBy(asc(mailerTypes.displayOrder), asc(mailerTypes.id));
      res.json(types);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch mailer types" });
    }
  });
  app.post("/api/admin/mailer-types", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { name, thumbnailPath, displayOrder } = req.body;
      if (!name || !thumbnailPath) return res.status(400).json({ error: "name and thumbnailPath are required" });
      const [created] = await db.insert(mailerTypes).values({ name, thumbnailPath, displayOrder: displayOrder || 0, isActive: true }).returning();
      res.status(201).json(created);
    } catch (e) {
      res.status(500).json({ error: "Failed to create mailer type" });
    }
  });
  app.put("/api/admin/mailer-types/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, thumbnailPath, isActive, displayOrder } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (thumbnailPath !== undefined) updates.thumbnailPath = thumbnailPath;
      if (isActive !== undefined) updates.isActive = isActive;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      const [updated] = await db.update(mailerTypes).set(updates).where(eq(mailerTypes.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "Mailer type not found" });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: "Failed to update mailer type" });
    }
  });
  app.delete("/api/admin/mailer-types/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(mailerTypes).where(eq(mailerTypes.id, id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete mailer type" });
    }
  });
  app.get("/api/admin/settings", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const settings = await getAllAdminSettings();
      res.json({ settings, keys: ADMIN_SETTING_KEYS });
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });
  app.put("/api/admin/settings/:key", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { key } = req.params;
      const { value, description } = req.body;
      
      if (!Object.values(ADMIN_SETTING_KEYS).includes(key)) {
        return res.status(400).json({ error: `Invalid setting key: ${key}` });
      }
      
      await setAdminSetting(key, value, req.user?.id, description);
      
      const settings = await getAllAdminSettings();
      res.json({ success: true, settings });
    } catch (error) {
      console.error("Error updating admin setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });
  app.get("/api/admin/cost-summary", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { days = '7' } = req.query;
      const daysNum = parseInt(days as string) || 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      
      // Get total cost summary
      const summary = await db.execute(sql`
        SELECT 
          COALESCE(SUM(estimated_cost::numeric), 0) as total_cost,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(COUNT(*), 0) as total_calls
        FROM api_cost_logs
        WHERE created_at >= ${startDate}
      `);
      
      // Get breakdown by service
      const byService = await db.execute(sql`
        SELECT 
          operation,
          COALESCE(COUNT(*), 0) as call_count,
          COALESCE(SUM(estimated_cost::numeric), 0) as cost
        FROM api_cost_logs
        WHERE created_at >= ${startDate}
        GROUP BY operation
        ORDER BY cost DESC
        LIMIT 10
      `);
      
      // Get sync status
      const settings = await getAllAdminSettings();
      
      res.json({
        summary: summary.rows[0] || { total_cost: 0, total_input_tokens: 0, total_output_tokens: 0, total_calls: 0 },
        byService: byService.rows,
        settings,
        syncIntervals: {
          gmail: parseInt(settings[ADMIN_SETTING_KEYS.GMAIL_SYNC_INTERVAL_MINUTES]?.value || '30'),
          odoo: 1440, // 24 hours in minutes
          dripEmail: 10,
        },
        aiFeatures: {
          emailAnalysis: settings[ADMIN_SETTING_KEYS.AI_EMAIL_ANALYSIS_ENABLED]?.value === 'true',
          ragChatbot: settings[ADMIN_SETTING_KEYS.RAG_CHATBOT_ENABLED]?.value === 'true',
        }
      });
    } catch (error) {
      console.error("Error fetching cost summary:", error);
      res.status(500).json({ error: "Failed to fetch cost summary" });
    }
  });
  app.get("/api/admin/database/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const stats = await Promise.all([
        db.execute(sql`SELECT COUNT(*) as count FROM customers`),
        db.execute(sql`SELECT COUNT(*) as count FROM leads`),
        db.execute(sql`SELECT COUNT(*) as count FROM sent_quotes`),
        db.execute(sql`SELECT COUNT(*) as count FROM spotlight_events`),
        db.execute(sql`SELECT COUNT(*) as count FROM follow_up_tasks`),
        db.execute(sql`SELECT COUNT(*) as count FROM customer_activity_events`),
        db.execute(sql`SELECT COUNT(*) as count FROM email_sends`),
        db.execute(sql`SELECT COUNT(*) as count FROM territory_skip_flags`),
        db.execute(sql`SELECT COUNT(*) as count FROM bounced_emails`),
        db.execute(sql`SELECT COUNT(*) as count FROM product_pricing_master`),
        db.execute(sql`SELECT COUNT(*) as count FROM drip_campaigns`),
        db.execute(sql`SELECT COUNT(*) as count FROM drip_campaign_assignments`),
      ]);

      res.json({
        customers: parseInt(stats[0].rows[0]?.count || '0'),
        leads: parseInt(stats[1].rows[0]?.count || '0'),
        quotes: parseInt(stats[2].rows[0]?.count || '0'),
        spotlightEvents: parseInt(stats[3].rows[0]?.count || '0'),
        followUpTasks: parseInt(stats[4].rows[0]?.count || '0'),
        activityEvents: parseInt(stats[5].rows[0]?.count || '0'),
        emailSends: parseInt(stats[6].rows[0]?.count || '0'),
        territoryFlags: parseInt(stats[7].rows[0]?.count || '0'),
        bouncedEmails: parseInt(stats[8].rows[0]?.count || '0'),
        products: parseInt(stats[9].rows[0]?.count || '0'),
        dripCampaigns: parseInt(stats[10].rows[0]?.count || '0'),
        dripAssignments: parseInt(stats[11].rows[0]?.count || '0'),
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching database stats:", error);
      res.status(500).json({ error: "Failed to fetch database stats" });
    }
  });
  app.get("/api/admin/database/export", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      console.log("[DB Export] Starting full database export...");
      
      // Export key tables that contain business data worth preserving
      const [
        customersData,
        leadsData,
        quotesData,
        spotlightEventsData,
        followUpTasksData,
        activityEventsData,
        emailSendsData,
        territoryFlagsData,
        bouncedEmailsData,
        dripCampaignsData,
        dripCampaignStepsData,
        dripAssignmentsData,
        dripStepStatusData,
      ] = await Promise.all([
        db.select().from(customers),
        db.select().from(leads),
        db.select().from(sentQuotes),
        db.select().from(spotlightEvents),
        db.select().from(followUpTasks),
        db.select().from(customerActivityEvents),
        db.select().from(emailSends),
        db.select().from(territorySkipFlags),
        db.select().from(bouncedEmails),
        db.select().from(dripCampaigns),
        db.select().from(dripCampaignSteps),
        db.select().from(dripCampaignAssignments),
        db.select().from(dripCampaignStepStatus),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        tables: {
          customers: customersData,
          leads: leadsData,
          sentQuotes: quotesData,
          spotlightEvents: spotlightEventsData,
          followUpTasks: followUpTasksData,
          customerActivityEvents: activityEventsData,
          emailSends: emailSendsData,
          territorySkipFlags: territoryFlagsData,
          bouncedEmails: bouncedEmailsData,
          dripCampaigns: dripCampaignsData,
          dripCampaignSteps: dripCampaignStepsData,
          dripCampaignAssignments: dripAssignmentsData,
          dripCampaignStepStatus: dripStepStatusData,
        },
        counts: {
          customers: customersData.length,
          leads: leadsData.length,
          sentQuotes: quotesData.length,
          spotlightEvents: spotlightEventsData.length,
          followUpTasks: followUpTasksData.length,
          customerActivityEvents: activityEventsData.length,
          emailSends: emailSendsData.length,
          territorySkipFlags: territoryFlagsData.length,
          bouncedEmails: bouncedEmailsData.length,
          dripCampaigns: dripCampaignsData.length,
          dripCampaignSteps: dripCampaignStepsData.length,
          dripCampaignAssignments: dripAssignmentsData.length,
          dripCampaignStepStatus: dripStepStatusData.length,
        },
      };

      console.log("[DB Export] Export complete:", exportData.counts);
      
      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="database-export-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error("Error exporting database:", error);
      res.status(500).json({ error: "Failed to export database" });
    }
  });
  app.post("/api/admin/trigger-bounce-scan", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const count = await scanForBouncedEmails(userId);
      res.json({ success: true, bouncesFound: count });
    } catch (error) {
      console.error("[Admin] Bounce scan error:", error);
      res.status(500).json({ error: "Bounce scan failed" });
    }
  });
  app.get("/api/admin/trigger-bounce-scan", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const count = await scanForBouncedEmails(userId);
      res.json({ success: true, found: count });
    } catch (error) {
      console.error("[Admin] Bounce scan error:", error);
      res.status(500).json({ error: "Bounce scan failed" });
    }
  });
  app.post("/api/admin/backfill-kanban-stages", isAuthenticated, async (req: any, res) => {
    try {
      // Clear all existing kanban stages first — reset to clean state
      await db.update(leads).set({ salesKanbanStage: null });
      await db.update(customers).set({ salesKanbanStage: null });

      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      // Pre-update snapshot for diagnostics
      const [activityStats] = await db.select({
        totalActivities: sql<number>`COUNT(*)::int`,
        sampleCount: sql<number>`COUNT(CASE WHEN activity_type IN ('sample_sent','mailer_one_page','mailer_envelope','mailer_press_kit') THEN 1 END)::int`,
        emailSentCount: sql<number>`COUNT(CASE WHEN activity_type = 'email_sent' THEN 1 END)::int`,
        emailRepliedCount: sql<number>`COUNT(CASE WHEN activity_type IN ('email_replied','email_reply','note') THEN 1 END)::int`,
      }).from(leadActivities);

      const [leadFieldStats] = await db.select({
        totalLeads: sql<number>`COUNT(*)::int`,
        withFirstEmailSent: sql<number>`COUNT(CASE WHEN first_email_sent_at IS NOT NULL THEN 1 END)::int`,
        withFirstEmailReply: sql<number>`COUNT(CASE WHEN first_email_reply_at IS NOT NULL THEN 1 END)::int`,
        withLastContact: sql<number>`COUNT(CASE WHEN last_contact_at IS NOT NULL THEN 1 END)::int`,
        withPressTestKit: sql<number>`COUNT(CASE WHEN press_test_kit_sent_at IS NOT NULL THEN 1 END)::int`,
        withSampleEnvelope: sql<number>`COUNT(CASE WHEN sample_envelope_sent_at IS NOT NULL THEN 1 END)::int`,
        alreadyHasStage: sql<number>`COUNT(CASE WHEN sales_kanban_stage IS NOT NULL AND sales_kanban_stage != '' THEN 1 END)::int`,
      }).from(leads);

      // PRIORITY 1: Mark replied — overrides everything
      // From firstEmailReplyAt field
      await db.update(leads)
        .set({ salesKanbanStage: 'replied' })
        .where(isNotNull(leads.firstEmailReplyAt));

      // PRIORITY 2: Mark samples_requested — only if not already replied
      // From activity log
      const sampleActivityLeads = await db
        .selectDistinct({ leadId: leadActivities.leadId })
        .from(leadActivities)
        .where(
          inArray(leadActivities.activityType, [
            'sample_sent', 'mailer_one_page', 'mailer_envelope', 'mailer_press_kit'
          ])
        );
      const sampleLeadIds = sampleActivityLeads
        .map(r => r.leadId)
        .filter((id): id is number => id !== null);

      if (sampleLeadIds.length > 0) {
        await db.update(leads)
          .set({ salesKanbanStage: 'samples_requested' })
          .where(
            and(
              inArray(leads.id, sampleLeadIds),
              or(isNull(leads.salesKanbanStage), eq(leads.salesKanbanStage, ''), eq(leads.salesKanbanStage, 'no_response'))
            )
          );
      }

      // Also from timestamp fields
      await db.update(leads)
        .set({ salesKanbanStage: 'samples_requested' })
        .where(
          and(
            or(
              isNotNull(leads.pressTestKitSentAt),
              isNotNull(leads.sampleEnvelopeSentAt),
              isNotNull(leads.sampleSentAt),
              isNotNull(leads.onePageMailerSentAt),
            ),
            or(isNull(leads.salesKanbanStage), eq(leads.salesKanbanStage, ''), eq(leads.salesKanbanStage, 'no_response'))
          )
        );

      // PRIORITY 3: Mark no_response — only if not replied or samples
      const emailedActivityLeads = await db
        .selectDistinct({ leadId: leadActivities.leadId })
        .from(leadActivities)
        .where(eq(leadActivities.activityType, 'email_sent'));
      const emailedLeadIds = emailedActivityLeads
        .map(r => r.leadId)
        .filter((id): id is number => id !== null);

      if (emailedLeadIds.length > 0) {
        await db.update(leads)
          .set({ salesKanbanStage: 'no_response' })
          .where(
            and(
              inArray(leads.id, emailedLeadIds),
              or(isNull(leads.salesKanbanStage), eq(leads.salesKanbanStage, '')),
              isNull(leads.firstEmailReplyAt),
              lt(leads.lastContactAt, tenDaysAgo)
            )
          );
      }

      await db.update(leads)
        .set({ salesKanbanStage: 'no_response' })
        .where(
          and(
            or(isNull(leads.salesKanbanStage), eq(leads.salesKanbanStage, '')),
            isNotNull(leads.firstEmailSentAt),
            isNull(leads.firstEmailReplyAt),
            lt(leads.lastContactAt, tenDaysAgo)
          )
        );

      // Customers: swatchbook or press test → samples_requested
      await db.update(customers)
        .set({ salesKanbanStage: 'samples_requested' })
        .where(
          and(
            or(isNull(customers.salesKanbanStage), eq(customers.salesKanbanStage, ''), eq(customers.salesKanbanStage, 'no_response')),
            or(
              isNotNull(customers.pressTestSentAt),
              isNotNull(customers.swatchbookSentAt),
            )
          )
        );

      // Final counts
      const [leadCounts] = await db.select({
        samples: sql<number>`COUNT(CASE WHEN sales_kanban_stage = 'samples_requested' THEN 1 END)::int`,
        replied: sql<number>`COUNT(CASE WHEN sales_kanban_stage = 'replied' THEN 1 END)::int`,
        noResponse: sql<number>`COUNT(CASE WHEN sales_kanban_stage = 'no_response' THEN 1 END)::int`,
      }).from(leads);

      const [custCounts] = await db.select({
        samples: sql<number>`COUNT(CASE WHEN sales_kanban_stage = 'samples_requested' THEN 1 END)::int`,
      }).from(customers);

      res.json({
        success: true,
        leads: {
          samples_requested: leadCounts.samples,
          replied: leadCounts.replied,
          no_response: leadCounts.noResponse,
        },
        customers: { samples_requested: custCounts.samples },
        debug: {
          sampleActivitiesFound: sampleLeadIds.length,
          emailedActivitiesFound: emailedLeadIds.length,
        },
        message: 'Backfill complete',
        dbSnapshot: {
          activityStats,
          leadFieldStats,
        },
      });
    } catch (error: any) {
      console.error('[Backfill] Error:', error);
      res.status(500).json({ error: 'Backfill failed: ' + error.message });
    }
  });
  app.post("/api/admin/debug-activities", isAuthenticated, async (req: any, res) => {
    try {
      const activityTypes = await db
        .selectDistinct({ activityType: leadActivities.activityType })
        .from(leadActivities)
        .orderBy(leadActivities.activityType);

      const typeCounts = await db
        .select({
          activityType: leadActivities.activityType,
          count: sql<number>`COUNT(*)::int`
        })
        .from(leadActivities)
        .groupBy(leadActivities.activityType)
        .orderBy(desc(sql`COUNT(*)`));

      const recent = await db
        .select({
          id: leadActivities.id,
          leadId: leadActivities.leadId,
          activityType: leadActivities.activityType,
          summary: leadActivities.summary,
          createdAt: leadActivities.createdAt,
        })
        .from(leadActivities)
        .orderBy(desc(leadActivities.createdAt))
        .limit(20);

      const [emailedCount] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(leads)
        .where(isNotNull(leads.firstEmailSentAt));

      const [contactedCount] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(leads)
        .where(isNotNull(leads.lastContactAt));

      res.json({
        distinctActivityTypes: activityTypes.map(r => r.activityType),
        countsByType: typeCounts,
        recentActivities: recent,
        leadsWithFirstEmailSent: emailedCount.count,
        leadsWithLastContact: contactedCount.count,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/admin/database/import", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { data, options = {} } = req.body;
      const { skipExisting = true, tables: tablesToImport } = options;
      
      if (!data || !data.tables) {
        return res.status(400).json({ error: "Invalid import data format" });
      }

      console.log("[DB Import] Starting import with options:", options);
      const results: Record<string, { imported: number; skipped: number; errors: number }> = {};

      // Helper to safely import a table with duplicate checking
      async function importTable<T extends Record<string, any>>(
        tableName: string,
        tableData: T[],
        table: any,
        idField: keyof T = 'id' as keyof T
      ) {
        if (!tablesToImport || tablesToImport.includes(tableName)) {
          results[tableName] = { imported: 0, skipped: 0, errors: 0 };
          
          for (const record of tableData || []) {
            try {
              if (skipExisting && record[idField]) {
                // Check if record exists
                const existing = await db.select({ id: table[idField] })
                  .from(table)
                  .where(eq(table[idField], record[idField]))
                  .limit(1);
                
                if (existing.length > 0) {
                  results[tableName].skipped++;
                  continue;
                }
              }
              
              await db.insert(table).values(record).onConflictDoNothing();
              results[tableName].imported++;
            } catch (err) {
              console.error(`[DB Import] Error importing ${tableName} record:`, err);
              results[tableName].errors++;
            }
          }
        }
      }

      // Import tables in order (respecting foreign key dependencies)
      await importTable('customers', data.tables.customers, customers);
      await importTable('leads', data.tables.leads, leads);
      await importTable('sentQuotes', data.tables.sentQuotes, sentQuotes);
      await importTable('spotlightEvents', data.tables.spotlightEvents, spotlightEvents);
      await importTable('followUpTasks', data.tables.followUpTasks, followUpTasks);
      await importTable('customerActivityEvents', data.tables.customerActivityEvents, customerActivityEvents);
      await importTable('emailSends', data.tables.emailSends, emailSends);
      await importTable('territorySkipFlags', data.tables.territorySkipFlags, territorySkipFlags);
      await importTable('bouncedEmails', data.tables.bouncedEmails, bouncedEmails);
      await importTable('dripCampaigns', data.tables.dripCampaigns, dripCampaigns);
      await importTable('dripCampaignSteps', data.tables.dripCampaignSteps, dripCampaignSteps);
      await importTable('dripCampaignAssignments', data.tables.dripCampaignAssignments, dripCampaignAssignments);
      await importTable('dripCampaignStepStatus', data.tables.dripCampaignStepStatus, dripCampaignStepStatus);

      console.log("[DB Import] Import complete:", results);
      res.json({ 
        success: true, 
        results,
        message: "Import completed successfully"
      });
    } catch (error) {
      console.error("Error importing database:", error);
      res.status(500).json({ error: "Failed to import database" });
    }
  });
  app.get("/api/admin/email-conflict-emails", isAuthenticated, async (_req: any, res) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT l.email_normalized
        FROM leads l
        INNER JOIN customers c
          ON (c.email_normalized = l.email_normalized
           OR c.email2_normalized = l.email_normalized)
        WHERE l.email_normalized IS NOT NULL
          AND l.email_normalized <> ''
      `);
      res.json({ emails: (result.rows as any[]).map(r => r.email_normalized) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/admin/email-conflicts", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const page     = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit    = Math.min(50, parseInt(req.query.limit as string) || 20);
      const search   = ((req.query.search as string) || '').trim();
      const hasTasks = req.query.hasTasks === 'true';
      const hasEmails = req.query.hasEmails === 'true';
      const offset   = (page - 1) * limit;
      const searchLike = search ? `%${search}%` : null;

      const baseCond = sql`l.email_normalized IS NOT NULL AND l.email_normalized <> ''`;
      const searchSql = searchLike
        ? sql`AND (l.name ILIKE ${searchLike} OR l.email ILIKE ${searchLike}
               OR CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,'')) ILIKE ${searchLike})`
        : sql``;
      const taskFilterSql = hasTasks
        ? sql`AND (
            (SELECT COUNT(*) FROM follow_up_tasks ft WHERE ft.lead_id = l.id AND ft.status = 'pending') > 0
            OR
            (SELECT COUNT(*) FROM follow_up_tasks ft WHERE ft.customer_id = c.id AND ft.status = 'pending') > 0
          )`
        : sql``;
      const emailFilterSql = hasEmails
        ? sql`AND (
            (SELECT COUNT(*) FROM lead_activities la WHERE la.lead_id = l.id AND la.activity_type LIKE 'email%') > 0
            OR
            (SELECT COUNT(*) FROM customer_activity_events cae WHERE cae.customer_id = c.id AND cae.event_type IN ('email_sent','email_received')) > 0
          )`
        : sql``;

      const rows = await db.execute(sql`
        SELECT
          l.email_normalized,
          l.id            AS lead_id,
          l.name          AS lead_name,
          l.email         AS lead_email,
          l.company       AS lead_company,
          l.stage         AS lead_stage,
          l.score         AS lead_score,
          l.source_type   AS lead_source_type,
          (SELECT COUNT(*)::int FROM follow_up_tasks ft
            WHERE ft.lead_id = l.id AND ft.status = 'pending')              AS lead_task_count,
          (SELECT COUNT(*)::int FROM lead_activities la
            WHERE la.lead_id = l.id AND la.activity_type LIKE 'email%')     AS lead_email_count,
          (SELECT COUNT(*)::int FROM lead_activities la
            WHERE la.lead_id = l.id AND la.activity_type = 'note_added')    AS lead_note_count,
          c.id            AS customer_id,
          TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,'')))
                          AS customer_name,
          c.email         AS customer_email,
          c.company       AS customer_company,
          COALESCE(c.total_spent::text,'0') AS customer_total_spent,
          COALESCE(c.total_orders,0)        AS customer_total_orders,
          (SELECT COUNT(*)::int FROM follow_up_tasks ft
            WHERE ft.customer_id = c.id AND ft.status = 'pending')          AS customer_task_count,
          (SELECT COUNT(*)::int FROM customer_activity_events cae
            WHERE cae.customer_id = c.id
              AND cae.event_type IN ('email_sent','email_received'))         AS customer_email_count,
          (SELECT COUNT(*)::int FROM customer_activity_events cae
            WHERE cae.customer_id = c.id
              AND cae.event_type = 'note_added')                            AS customer_note_count
        FROM leads l
        INNER JOIN customers c
          ON (c.email_normalized = l.email_normalized
           OR c.email2_normalized = l.email_normalized)
        WHERE ${baseCond} ${searchSql} ${taskFilterSql} ${emailFilterSql}
        ORDER BY l.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM leads l
        INNER JOIN customers c
          ON (c.email_normalized = l.email_normalized
           OR c.email2_normalized = l.email_normalized)
        WHERE ${baseCond} ${searchSql} ${taskFilterSql} ${emailFilterSql}
      `);

      const total = (countResult.rows[0] as any)?.total ?? 0;
      res.json({ conflicts: rows.rows, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/admin/email-conflicts/resolve", isAuthenticated, requireAdmin, async (req: any, res) => {
    const { email, action } = req.body as { email?: string; action?: string };
    if (!email || !['keep_lead', 'keep_customer'].includes(action ?? '')) {
      return res.status(400).json({ error: "email and valid action ('keep_lead'|'keep_customer') required" });
    }

    // Normalize the incoming email to match the stored normalized columns
    const normEmail = normalizeEmail(email);

    // Find the first conflict pair with this normalized email
    const conflictRows = await db.execute(sql`
      SELECT l.id AS lead_id, c.id AS customer_id
      FROM leads l
      INNER JOIN customers c
        ON (c.email_normalized = l.email_normalized
         OR c.email2_normalized = l.email_normalized)
      WHERE l.email_normalized = ${normEmail}
        AND l.email_normalized IS NOT NULL
        AND l.email_normalized <> ''
      LIMIT 1
    `);
    if (conflictRows.rows.length === 0) {
      return res.status(400).json({ error: 'No email conflict exists for this email address' });
    }

    const { lead_id: leadId, customer_id: customerId } = conflictRows.rows[0] as { lead_id: number; customer_id: string };

    try {
      await db.transaction(async (tx) => {
        if (action === 'keep_lead') {
          // 1. Migrate ALL tasks (any status) from customer → lead
          await tx.update(followUpTasks)
            .set({ customerId: null, leadId: Number(leadId) })
            .where(eq(followUpTasks.customerId, String(customerId)));
          // 2. Migrate notes from customerActivityEvents → leadActivities
          const custNotes = await tx.select()
            .from(customerActivityEvents)
            .where(and(
              eq(customerActivityEvents.customerId, String(customerId)),
              eq(customerActivityEvents.eventType, 'note_added'),
            ));
          for (const note of custNotes) {
            await tx.insert(leadActivities).values({
              leadId: Number(leadId),
              activityType: 'note_added',
              summary: note.title || 'Note (migrated from contact)',
              details: note.description ?? undefined,
              performedBy: note.createdBy ?? undefined,
              performedByName: note.createdByName ?? undefined,
            });
          }
          // 3. Delete customer (cascade removes activities, contacts, etc.)
          await tx.delete(customers).where(eq(customers.id, String(customerId)));
        } else {
          // 1. Migrate ALL tasks (any status) from lead → customer
          await tx.update(followUpTasks)
            .set({ leadId: null, customerId: String(customerId) })
            .where(eq(followUpTasks.leadId, Number(leadId)));
          // 2. Migrate notes from leadActivities → customerActivityEvents
          const leadNotes = await tx.select()
            .from(leadActivities)
            .where(and(
              eq(leadActivities.leadId, Number(leadId)),
              eq(leadActivities.activityType, 'note_added'),
            ));
          for (const note of leadNotes) {
            await tx.insert(customerActivityEvents).values({
              customerId: String(customerId),
              eventType: 'note_added',
              title: note.summary || 'Note (migrated from lead)',
              description: note.details ?? undefined,
              sourceType: 'manual',
              createdBy: note.performedBy ?? undefined,
              createdByName: note.performedByName ?? undefined,
            });
          }
          // 3. Delete lead (cascade removes leadActivities, etc.)
          await tx.delete(leads).where(eq(leads.id, Number(leadId)));
        }
      });

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM leads l
        INNER JOIN customers c
          ON (c.email_normalized = l.email_normalized
           OR c.email2_normalized = l.email_normalized)
        WHERE l.email_normalized IS NOT NULL AND l.email_normalized <> ''
      `);
      const remaining = (countResult.rows[0] as Record<string, unknown>)?.total as number ?? 0;
      res.json({ ok: true, remaining });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      res.status(500).json({ error: message });
    }
  });
}
