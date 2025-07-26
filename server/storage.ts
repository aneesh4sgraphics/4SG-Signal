import { 
  type User, 
  type InsertUser,
  type UpsertUser,
  type ProductCategory,
  type InsertProductCategory,
  type ProductType,
  type InsertProductType,
  type ProductSize,
  type InsertProductSize,
  type PricingTier,
  type InsertPricingTier,
  // Removed: ProductPricing and PricingData types - legacy tables removed
  type Customer,
  type InsertCustomer,
  type SentQuote,
  type InsertSentQuote,
  type CompetitorPricing,
  type InsertCompetitorPricing,
  type FileUpload,
  type InsertFileUpload,
  type ActivityLog,
  type InsertActivityLog,
  users,
  customers,
  sentQuotes,
  competitorPricing,
  fileUploads,
  productPricingMaster,
  uploadBatches,
  productCategories,
  productTypes,
  productSizes,
  pricingTiers,
  activityLogs,
  type ProductPricingMaster,
  type InsertProductPricingMaster,
  type UploadBatch,
  type InsertUploadBatch
} from "@shared/schema";
import { parseCustomerCSV } from "./customer-parser";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  approveUser(userId: string, adminId: string): Promise<User | undefined>;
  rejectUser(userId: string, adminId: string): Promise<User | undefined>;
  changeUserRole(userId: string, role: string): Promise<User | undefined>;

  
  // Product Categories
  getProductCategories(): Promise<ProductCategory[]>;
  getProductCategory(id: number): Promise<ProductCategory | undefined>;
  createProductCategory(category: InsertProductCategory): Promise<ProductCategory>;
  
  // Product Types
  getProductTypes(): Promise<ProductType[]>;
  getProductTypesByCategory(categoryId: number): Promise<ProductType[]>;
  getProductType(id: number): Promise<ProductType | undefined>;
  createProductType(type: InsertProductType): Promise<ProductType>;
  
  // Product Sizes
  getProductSizes(): Promise<ProductSize[]>;
  getProductSizesByType(typeId: number): Promise<ProductSize[]>;
  getProductSize(id: number): Promise<ProductSize | undefined>;
  createProductSize(size: InsertProductSize): Promise<ProductSize>;
  updateProductSize(id: number, size: Partial<InsertProductSize>): Promise<ProductSize | undefined>;
  
  // Pricing Tiers
  getPricingTiers(): Promise<PricingTier[]>;
  getPricingTier(id: number): Promise<PricingTier | undefined>;
  createPricingTier(tier: InsertPricingTier): Promise<PricingTier>;
  
  // Removed: legacy product pricing methods - replaced by productPricingMaster
  
  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;
  
  // Sent Quotes
  getSentQuotes(): Promise<SentQuote[]>;
  getSentQuote(id: number): Promise<SentQuote | undefined>;
  getSentQuoteByNumber(quoteNumber: string): Promise<SentQuote | undefined>;
  createSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  deleteSentQuote(id: number): Promise<boolean>;
  
  // Competitor Pricing
  getCompetitorPricing(): Promise<CompetitorPricing[]>;
  getCompetitorPricingById(id: number): Promise<CompetitorPricing | undefined>;
  createCompetitorPricing(pricing: InsertCompetitorPricing): Promise<CompetitorPricing>;
  deleteCompetitorPricing(id: number): Promise<boolean>;
  
  // File Upload Tracking
  getFileUploads(): Promise<FileUpload[]>;
  getActiveFileUpload(fileType: string): Promise<FileUpload | undefined>;
  createFileUpload(upload: InsertFileUpload): Promise<FileUpload>;
  setActiveFileUpload(id: number, fileType: string): Promise<void>;
  
  // Removed: legacy pricing data methods - replaced by productPricingMaster

  // Product Pricing Master operations (database-backed)
  getAllProductPricingMaster(): Promise<ProductPricingMaster[]>;
  getProductPricingMaster(): Promise<ProductPricingMaster[]>;
  getProductPricingMasterById(id: number): Promise<ProductPricingMaster | undefined>;
  createProductPricingMaster(data: InsertProductPricingMaster): Promise<ProductPricingMaster>;
  upsertProductPricingMaster(data: InsertProductPricingMaster): Promise<ProductPricingMaster>;
  clearAllProductPricingMaster(): Promise<number>; // Returns count of deleted records
  bulkCreateProductPricingMaster(data: InsertProductPricingMaster[]): Promise<ProductPricingMaster[]>;

  // Admin methods
  reinitializeData(): Promise<void>;

  // Activity logging
  logActivity(activity: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(userId?: string, limit?: number): Promise<ActivityLog[]>;
  getUserActivityLogs(userId: string, limit?: number): Promise<ActivityLog[]>;
  getActivityLogsSince(date: Date): Promise<ActivityLog[]>;
  
  // Dashboard Statistics
  getSentQuotesCount(): Promise<number>;
  getSentQuotesCountSince(date: Date): Promise<number>;
  getSentQuotesSince(date: Date): Promise<SentQuote[]>;
  getCustomersCount(): Promise<number>;
  getProductsCount(): Promise<number>;
}

// Removed: MemStorage class - Legacy in-memory storage implementation
// All functionality now uses DatabaseStorage with PostgreSQL persistence

// Database Storage Implementation
export class DatabaseStorage implements IStorage {
  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async approveUser(userId: string, adminId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async rejectUser(userId: string, adminId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        status: "rejected",
        approvedBy: adminId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async changeUserRole(userId: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Competitor Pricing operations
  async getCompetitorPricing(): Promise<CompetitorPricing[]> {
    return await db.select().from(competitorPricing).orderBy(desc(competitorPricing.createdAt));
  }

  async createCompetitorPricing(data: InsertCompetitorPricing): Promise<CompetitorPricing> {
    console.log('Storage: Creating competitor pricing entry with data:', JSON.stringify(data, null, 2));
    
    // Enhanced validation for numeric fields - keep as strings for database storage
    const numericFields = ['inputPrice', 'pricePerSqIn', 'pricePerSqFt', 'pricePerSqMeter'];
    const integerFields = ['packQty'];
    const decimalFields = ['width', 'length'];
    
    for (const field of numericFields) {
      const value = (data as any)[field];
      if (value !== undefined && value !== null) {
        const cleanValue = typeof value === 'string' ? value.replace(/[$,]/g, '') : String(value);
        const numValue = parseFloat(cleanValue);
        if (isNaN(numValue) || !isFinite(numValue)) {
          throw new Error(`Invalid numeric value for field ${field}: ${value} (parsed: ${numValue})`);
        }
        if (numValue < 0) {
          throw new Error(`Negative value not allowed for field ${field}: ${numValue}`);
        }
        // Keep as string for database storage
        (data as any)[field] = numValue.toFixed(2);
      }
    }
    
    for (const field of integerFields) {
      const value = (data as any)[field];
      if (value !== undefined && value !== null) {
        const numValue = typeof value === 'string' ? parseInt(value.replace(/[$,]/g, ''), 10) : Number(value);
        if (isNaN(numValue) || !isFinite(numValue)) {
          throw new Error(`Invalid integer value for field ${field}: ${value} (parsed: ${numValue})`);
        }
        if (numValue < 0) {
          throw new Error(`Negative value not allowed for field ${field}: ${numValue}`);
        }
        // Keep as number for integer fields
        (data as any)[field] = numValue;
      }
    }
    
    for (const field of decimalFields) {
      const value = (data as any)[field];
      if (value !== undefined && value !== null) {
        const cleanValue = typeof value === 'string' ? value.replace(/[$,]/g, '') : String(value);
        const numValue = parseFloat(cleanValue);
        if (isNaN(numValue) || !isFinite(numValue)) {
          throw new Error(`Invalid decimal value for field ${field}: ${value} (parsed: ${numValue})`);
        }
        if (numValue < 0) {
          throw new Error(`Negative value not allowed for field ${field}: ${numValue}`);
        }
        // Keep as string for decimal database fields
        (data as any)[field] = numValue.toFixed(2);
      }
    }
    
    const inputPrice = data.inputPrice ? parseFloat(String(data.inputPrice).replace(/[$,]/g, '')) : 0;
    if (!inputPrice || inputPrice === 0) {
      throw new Error(`Invalid input price: ${data.inputPrice}. Must be a positive number.`);
    }
    
    try {
      const [entry] = await db
        .insert(competitorPricing)
        .values(data)
        .returning();
      console.log('Storage: Successfully created entry:', JSON.stringify(entry, null, 2));
      return entry;
    } catch (error) {
      console.error('Storage: Database error:', error);
      throw error;
    }
  }

  async getCompetitorPricingById(id: number): Promise<CompetitorPricing | undefined> {
    const [entry] = await db.select().from(competitorPricing).where(eq(competitorPricing.id, id));
    return entry;
  }

  async deleteCompetitorPricing(id: number): Promise<boolean> {
    const result = await db
      .delete(competitorPricing)
      .where(eq(competitorPricing.id, id));
    return (result.rowCount || 0) > 0;
  }

  // All methods now use database operations directly

  // Product Categories - Database implementation
  async getProductCategories(): Promise<ProductCategory[]> {
    return await db.select().from(productCategories).orderBy(productCategories.id);
  }

  async getProductCategory(id: number): Promise<ProductCategory | undefined> {
    const [result] = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.id, id));
    return result || undefined;
  }

  async createProductCategory(category: InsertProductCategory): Promise<ProductCategory> {
    const [result] = await db
      .insert(productCategories)
      .values(category)
      .returning();
    return result;
  }

  // Product Types - Database implementation
  async getProductTypes(): Promise<ProductType[]> {
    return await db.select().from(productTypes).orderBy(productTypes.id);
  }

  async getProductTypesByCategory(categoryId: number): Promise<ProductType[]> {
    return await db
      .select()
      .from(productTypes)
      .where(eq(productTypes.categoryId, categoryId))
      .orderBy(productTypes.id);
  }

  async getProductType(id: number): Promise<ProductType | undefined> {
    const [result] = await db
      .select()
      .from(productTypes)
      .where(eq(productTypes.id, id));
    return result || undefined;
  }

  async createProductType(type: InsertProductType): Promise<ProductType> {
    const [result] = await db
      .insert(productTypes)
      .values(type)
      .returning();
    return result;
  }

  // Product Sizes - Database implementation
  async getProductSizes(): Promise<ProductSize[]> {
    return await db.select().from(productSizes).orderBy(productSizes.id);
  }

  async getProductSizesByType(typeId: number): Promise<ProductSize[]> {
    return await db
      .select()
      .from(productSizes)
      .where(eq(productSizes.typeId, typeId))
      .orderBy(productSizes.id);
  }

  async getProductSize(id: number): Promise<ProductSize | undefined> {
    const [result] = await db
      .select()
      .from(productSizes)
      .where(eq(productSizes.id, id));
    return result || undefined;
  }

  async createProductSize(size: InsertProductSize): Promise<ProductSize> {
    const [result] = await db
      .insert(productSizes)
      .values(size)
      .returning();
    return result;
  }

  async updateProductSize(id: number, size: Partial<InsertProductSize>): Promise<ProductSize | undefined> {
    const [result] = await db
      .update(productSizes)
      .set(size)
      .where(eq(productSizes.id, id))
      .returning();
    return result || undefined;
  }

  // Pricing Tiers - Database implementation
  async getPricingTiers(): Promise<PricingTier[]> {
    return await db.select().from(pricingTiers).orderBy(pricingTiers.id);
  }

  async getPricingTier(id: number): Promise<PricingTier | undefined> {
    const [result] = await db
      .select()
      .from(pricingTiers)
      .where(eq(pricingTiers.id, id));
    return result || undefined;
  }

  async createPricingTier(tier: InsertPricingTier): Promise<PricingTier> {
    const [result] = await db
      .insert(pricingTiers)
      .values(tier)
      .returning();
    return result;
  }

  // Product Pricing - Legacy methods replaced by productPricingMaster
  // These methods are deprecated and should use productPricingMaster instead
  async getProductPricing(): Promise<ProductPricing[]> {
    // Return empty array - legacy method, use getProductPricingMaster instead
    return [];
  }

  async getProductPricingByType(typeId: number): Promise<ProductPricing[]> {
    // Return empty array - legacy method, use getProductPricingMaster instead
    return [];
  }

  async getPriceForProductType(typeId: number, tierId: number, sizeId?: number): Promise<number> {
    // Return 0 - legacy method, use productPricingMaster pricing instead
    return 0;
  }

  async getPriceForSquareMeters(squareMeters: number, typeId: number, tierId: number, sizeId?: number): Promise<number> {
    // Return 0 - legacy method, use productPricingMaster pricing instead
    return 0;
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    return customer || undefined;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db
      .insert(customers)
      .values(customer)
      .returning();
    return newCustomer;
  }

  async updateCustomer(id: string, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updatedCustomer] = await db
      .update(customers)
      .set(customerData)
      .where(eq(customers.id, id))
      .returning();
    return updatedCustomer || undefined;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(customers)
        .where(eq(customers.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting customer:', error);
      return false;
    }
  }

  // Sent Quotes - Database implementation
  async getSentQuotes(): Promise<SentQuote[]> {
    return await db.select().from(sentQuotes).orderBy(desc(sentQuotes.createdAt));
  }

  async getSentQuote(id: number): Promise<SentQuote | undefined> {
    const [quote] = await db
      .select()
      .from(sentQuotes)
      .where(eq(sentQuotes.id, id));
    return quote || undefined;
  }

  async getSentQuoteByNumber(quoteNumber: string): Promise<SentQuote | undefined> {
    const [quote] = await db
      .select()
      .from(sentQuotes)
      .where(eq(sentQuotes.quoteNumber, quoteNumber));
    return quote || undefined;
  }

  async createSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    const [newQuote] = await db
      .insert(sentQuotes)
      .values(quote)
      .returning();
    return newQuote;
  }

  async upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    // Check if quote exists by quote number
    const existing = await this.getSentQuoteByNumber(quote.quoteNumber);
    
    if (existing) {
      // Update existing quote
      const [updatedQuote] = await db
        .update(sentQuotes)
        .set({ ...quote, updatedAt: new Date() })
        .where(eq(sentQuotes.quoteNumber, quote.quoteNumber))
        .returning();
      return updatedQuote;
    } else {
      // Create new quote
      return this.createSentQuote(quote);
    }
  }

  async deleteSentQuote(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(sentQuotes)
        .where(eq(sentQuotes.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting sent quote:', error);
      return false;
    }
  }

  // File Upload Tracking methods
  async getFileUploads(): Promise<FileUpload[]> {
    return await db.select().from(fileUploads).orderBy(desc(fileUploads.uploadedAt));
  }

  async getActiveFileUpload(fileType: string): Promise<FileUpload | undefined> {
    const [activeFile] = await db.select()
      .from(fileUploads)
      .where(and(eq(fileUploads.fileType, fileType), eq(fileUploads.isActive, true)))
      .orderBy(desc(fileUploads.uploadedAt))
      .limit(1);
    return activeFile;
  }

  async createFileUpload(upload: InsertFileUpload): Promise<FileUpload> {
    // Set all previous files of this type to inactive
    await db.update(fileUploads)
      .set({ isActive: false })
      .where(eq(fileUploads.fileType, upload.fileType));

    // Insert new file upload record as active
    const [newUpload] = await db
      .insert(fileUploads)
      .values({ ...upload, isActive: true })
      .returning();
    
    return newUpload;
  }

  async setActiveFileUpload(id: number, fileType: string): Promise<void> {
    // Set all files of this type to inactive
    await db.update(fileUploads)
      .set({ isActive: false })
      .where(eq(fileUploads.fileType, fileType));

    // Set the specified file to active
    await db.update(fileUploads)
      .set({ isActive: true })
      .where(eq(fileUploads.id, id));
  }

  async reinitializeData(): Promise<void> {
    // Database reinitialization is handled through migrations and CSV uploads
    // No action needed - data persistence is managed by PostgreSQL
    console.log('Database reinitialization not needed - using persistent PostgreSQL storage');
  }

  // Removed: legacy pricing methods - all replaced by productPricingMaster database operations

  // Product Pricing Master operations (database-backed)
  async getAllProductPricingMaster(): Promise<ProductPricingMaster[]> {
    return await db.select().from(productPricingMaster);
  }

  async getProductPricingMaster(): Promise<ProductPricingMaster[]> {
    return await db.select().from(productPricingMaster);
  }

  async getProductPricingMasterById(id: number): Promise<ProductPricingMaster | undefined> {
    const [result] = await db.select().from(productPricingMaster).where(eq(productPricingMaster.id, id));
    return result;
  }

  async createProductPricingMaster(data: InsertProductPricingMaster): Promise<ProductPricingMaster> {
    const [result] = await db
      .insert(productPricingMaster)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return result;
  }

  async upsertProductPricingMaster(data: InsertProductPricingMaster): Promise<ProductPricingMaster> {
    // Try to find existing record by itemCode
    const existing = await db.select()
      .from(productPricingMaster)
      .where(eq(productPricingMaster.itemCode, data.itemCode));

    if (existing.length > 0) {
      // Update existing record
      const [result] = await db
        .update(productPricingMaster)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(productPricingMaster.itemCode, data.itemCode))
        .returning();
      return result;
    } else {
      // Create new record
      return await this.createProductPricingMaster(data);
    }
  }

  async clearAllProductPricingMaster(): Promise<number> {
    const result = await db.delete(productPricingMaster);
    return result.rowCount || 0;
  }

  async bulkCreateProductPricingMaster(data: InsertProductPricingMaster[]): Promise<ProductPricingMaster[]> {
    if (data.length === 0) return [];
    
    // Get all valid productType IDs from database for validation
    const validProductTypes = await this.getProductTypes();
    const validTypeIds = new Set(validProductTypes.map(t => t.id));
    
    // Validate and sanitize productTypeId values before insertion
    const sanitizedData = data.map(item => {
      // If productTypeId is not in valid IDs set, set to null
      const sanitizedProductTypeId = item.productTypeId && validTypeIds.has(item.productTypeId)
        ? item.productTypeId 
        : null;
      
      return {
        ...item,
        productTypeId: sanitizedProductTypeId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
    
    // Log any sanitizations
    const sanitizedCount = data.filter((original, index) => 
      original.productTypeId !== sanitizedData[index].productTypeId
    ).length;
    
    if (sanitizedCount > 0) {
      console.log(`Sanitized ${sanitizedCount} invalid productTypeId values to null`);
    }
    
    const results = await db
      .insert(productPricingMaster)
      .values(sanitizedData)
      .returning();
    return results;
  }

  async deleteProductPricingMasterByItemCode(itemCode: string): Promise<void> {
    try {
      await db.delete(productPricingMaster).where(eq(productPricingMaster.itemCode, itemCode));
      console.log(`✓ Deleted pricing record for item code: ${itemCode}`);
    } catch (error) {
      console.error('Error deleting pricing record:', error);
      throw error;
    }
  }

  async updateProductPricingMasterByItemCode(itemCode: string, record: InsertProductPricingMaster): Promise<void> {
    try {
      await db.update(productPricingMaster)
        .set({
          ...record,
          updatedAt: new Date()
        })
        .where(eq(productPricingMaster.itemCode, itemCode));
      console.log(`✓ Updated pricing record for item code: ${itemCode}`);
    } catch (error) {
      console.error('Error updating pricing record:', error);
      throw error;
    }
  }

  // Upload Batch History Methods
  async createUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch> {
    const [result] = await db
      .insert(uploadBatches)
      .values(batch)
      .returning();
    return result;
  }

  async getUploadBatches(): Promise<UploadBatch[]> {
    return await db
      .select()
      .from(uploadBatches)
      .orderBy(desc(uploadBatches.uploadDate));
  }

  async getUploadBatch(batchId: string): Promise<UploadBatch | undefined> {
    const [result] = await db
      .select()
      .from(uploadBatches)
      .where(eq(uploadBatches.batchId, batchId));
    return result || undefined;
  }

  async getActiveUploadBatches(): Promise<UploadBatch[]> {
    return await db
      .select()
      .from(uploadBatches)
      .where(eq(uploadBatches.isActive, true))
      .orderBy(desc(uploadBatches.uploadDate));
  }

  async rollbackToUploadBatch(batchId: string): Promise<{ success: boolean; message: string }> {
    try {
      const targetBatch = await this.getUploadBatch(batchId);
      if (!targetBatch) {
        return { success: false, message: "Batch not found" };
      }

      // Get all records from the target batch
      const batchRecords = await db
        .select()
        .from(productPricingMaster)
        .where(eq(productPricingMaster.uploadBatch, batchId));

      if (batchRecords.length === 0) {
        return { success: false, message: "No records found for this batch" };
      }

      // Clear current data and restore from target batch
      await this.clearAllProductPricingMaster();
      await this.bulkCreateProductPricingMaster(
        batchRecords.map(record => ({
          itemCode: record.itemCode,
          productName: record.productName,
          productType: record.productType,
          productTypeId: record.productTypeId,
          size: record.size,
          totalSqm: record.totalSqm,
          minQuantity: record.minQuantity,
          exportPrice: record.exportPrice,
          masterDistributorPrice: record.masterDistributorPrice,
          dealerPrice: record.dealerPrice,
          dealer2Price: record.dealer2Price,
          approvalNeededPrice: record.approvalNeededPrice,
          tierStage25Price: record.tierStage25Price,
          tierStage2Price: record.tierStage2Price,
          tierStage15Price: record.tierStage15Price,
          tierStage1Price: record.tierStage1Price,
          retailPrice: record.retailPrice,
          rowHash: record.rowHash,
          uploadBatch: record.uploadBatch
        }))
      );

      return { 
        success: true, 
        message: `Successfully rolled back to batch ${batchId} with ${batchRecords.length} records` 
      };
    } catch (error) {
      console.error('Error during rollback:', error);
      return { success: false, message: "Rollback failed due to database error" };
    }
  }

  // Activity logging methods
  async logActivity(activity: InsertActivityLog): Promise<ActivityLog> {
    const [result] = await db
      .insert(activityLogs)
      .values(activity)
      .returning();
    return result;
  }

  async getActivityLogs(userId?: string, limit: number = 50): Promise<ActivityLog[]> {
    let query = db.select().from(activityLogs);
    
    if (userId) {
      query = query.where(eq(activityLogs.userId, userId));
    }
    
    return await query
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getUserActivityLogs(userId: string, limit: number = 50): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getActivityLogsSince(date: Date): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .where(sql`created_at >= ${date}`)
      .orderBy(desc(activityLogs.createdAt));
  }

  // Dashboard Statistics methods
  async getSentQuotesCount(): Promise<number> {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(sentQuotes);
      return result.count || 0;
    } catch (error) {
      console.error("Error getting quotes count:", error);
      return 0;
    }
  }

  async getSentQuotesCountSince(date: Date): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sentQuotes)
      .where(sql`created_at >= ${date}`);
    return result.count || 0;
  }

  async getSentQuotesSince(date: Date): Promise<SentQuote[]> {
    return await db
      .select()
      .from(sentQuotes)
      .where(sql`created_at >= ${date}`)
      .orderBy(desc(sentQuotes.createdAt));
  }

  async getCustomersCount(): Promise<number> {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(customers);
      return result.count || 0;
    } catch (error) {
      console.error("Error getting customers count:", error);
      return 0;
    }
  }

  async getProductsCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(productPricingMaster);
    return result.count || 0;
  }
}

export const storage = new DatabaseStorage();
