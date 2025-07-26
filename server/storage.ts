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
  users,
  competitorPricing,
  fileUploads,
  productPricingMaster,
  uploadBatches,
  productCategories,
  productTypes,
  type ProductPricingMaster,
  type InsertProductPricingMaster,
  type UploadBatch,
  type InsertUploadBatch
} from "@shared/schema";
import { parseProductData } from "./csv-parser";
import { parseCustomerCSV } from "./customer-parser";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

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
}



export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private productCategories: Map<number, ProductCategory>;
  private productTypes: Map<number, ProductType>;
  private productSizes: Map<number, ProductSize>;
  private pricingTiers: Map<number, PricingTier>;
  private productPricing: Map<number, ProductPricing>;
  private customers: Map<string, Customer>;
  private sentQuotes: Map<number, SentQuote>;
  private competitorPricing: Map<number, CompetitorPricing>;

  private currentCategoryId: number;
  private currentTypeId: number;
  private currentSizeId: number;
  private currentTierId: number;
  private currentPricingId: number;
  private currentSentQuoteId: number;
  private currentCompetitorPricingId: number;

  constructor() {
    this.users = new Map();
    this.productCategories = new Map();
    this.productTypes = new Map();
    this.productSizes = new Map();
    this.pricingTiers = new Map();
    this.productPricing = new Map();
    this.customers = new Map();
    this.sentQuotes = new Map();
    this.competitorPricing = new Map();

    this.currentCategoryId = 1;
    this.currentTypeId = 1;
    this.currentSizeId = 1;
    this.currentTierId = 1;
    this.currentPricingId = 1;
    this.currentSentQuoteId = 1;
    this.currentCompetitorPricingId = 1;

    // No default users - all users come from authentication
    
    this.initializeData();
  }

  private initializeData() {
    this.loadDataFromCsv();
  }

  private loadDataFromCsv() {
    try {
      console.log('Loading product data from CSV files...');
      const csvData = parseProductData();
      
      // Clear existing data
      this.productCategories.clear();
      this.productTypes.clear();
      this.productSizes.clear();
      this.pricingTiers.clear();
      this.productPricing.clear();
      this.customers.clear();
      
      // Initialize categories
      csvData.categories.forEach(category => {
        this.productCategories.set(category.id, category);
        this.currentCategoryId = Math.max(this.currentCategoryId, category.id + 1);
      });
      
      // Initialize types
      csvData.types.forEach(type => {
        this.productTypes.set(type.id, type);
        this.currentTypeId = Math.max(this.currentTypeId, type.id + 1);
      });
      
      // Initialize sizes
      csvData.sizes.forEach(size => {
        this.productSizes.set(size.id, size);
        this.currentSizeId = Math.max(this.currentSizeId, size.id + 1);
      });
      
      // Initialize pricing tiers
      csvData.pricingTiers.forEach(tier => {
        this.pricingTiers.set(tier.id, tier);
        this.currentTierId = Math.max(this.currentTierId, tier.id + 1);
      });
      
      // Initialize product pricing
      csvData.productPricing.forEach(pricing => {
        this.productPricing.set(pricing.id, pricing);
        this.currentPricingId = Math.max(this.currentPricingId, pricing.id + 1);
      });

      // Initialize customers (now handled via database, skip CSV initialization)
      
      console.log(`Loaded ${this.productSizes.size} product sizes from CSV`);
      
    } catch (error) {
      console.error('Error initializing CSV data:', error);
      
      // Fallback to basic data if CSV parsing fails
      this.productCategories.set(1, { id: 1, name: "Graffiti Polyester Paper", description: null });
      this.productTypes.set(1, { id: 1, categoryId: 1, name: "Graffiti Polyester Paper 5mil", description: null });
      this.productSizes.set(1, { 
        id: 1, 
        typeId: 1, 
        name: '12" × 18"', 
        width: "12", 
        height: "18", 
        widthUnit: "inch", 
        heightUnit: "inch", 
        squareMeters: "0.1394",
        itemCode: null,
        minOrderQty: null
      });
      this.pricingTiers.set(1, { id: 1, name: "Retail", description: "Retail pricing tier" });
      this.productPricing.set(1, { id: 1, productTypeId: 1, tierId: 1, pricePerSquareMeter: "5.70", sizeId: null });
    }
  }

  private calculateSquareMeters(width: number, height: number, widthUnit: string, heightUnit: string): number {
    const widthInches = widthUnit === 'feet' ? width * 12 : width;
    const heightInches = heightUnit === 'feet' ? height * 12 : height;
    return (widthInches * heightInches) * (0.0254 * 0.0254);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = this.users.get(userData.id);
    if (existingUser) {
      // Always update role and status for admins to ensure they get correct permissions
      const updatedUser = { 
        ...existingUser, 
        ...userData, 
        role: userData.role || existingUser.role,
        status: userData.status || existingUser.status,
        updatedAt: new Date() 
      };
      this.users.set(userData.id, updatedUser);
      return updatedUser;
    } else {
      const newUser: User = { 
        ...userData,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        role: userData.role || "user",
        status: userData.status || "pending",
        approvedBy: userData.approvedBy || null,
        approvedAt: userData.approvedAt || null,
        loginCount: userData.loginCount || null,
        lastLoginDate: userData.lastLoginDate || null,
        createdAt: new Date(), 
        updatedAt: new Date() 
      };
      this.users.set(userData.id, newUser);
      return newUser;
    }
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async approveUser(userId: string, adminId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) {
      return undefined;
    }
    
    const updatedUser = {
      ...user,
      status: "approved" as const,
      approvedBy: adminId,
      approvedAt: new Date(),
      updatedAt: new Date()
    };
    
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async rejectUser(userId: string, adminId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) {
      return undefined;
    }
    
    const updatedUser = {
      ...user,
      status: "rejected" as const,
      approvedBy: adminId,
      approvedAt: new Date(),
      updatedAt: new Date()
    };
    
    this.users.set(userId, updatedUser);
    return updatedUser;
  }



  async getProductCategories(): Promise<ProductCategory[]> {
    return Array.from(this.productCategories.values());
  }

  async getProductCategory(id: number): Promise<ProductCategory | undefined> {
    return this.productCategories.get(id);
  }

  async createProductCategory(category: InsertProductCategory): Promise<ProductCategory> {
    const id = this.currentCategoryId++;
    const newCategory: ProductCategory = { ...category, id, description: category.description || null };
    this.productCategories.set(id, newCategory);
    return newCategory;
  }

  async getProductTypes(): Promise<ProductType[]> {
    return Array.from(this.productTypes.values());
  }

  async getProductTypesByCategory(categoryId: number): Promise<ProductType[]> {
    return Array.from(this.productTypes.values()).filter(type => type.categoryId === categoryId);
  }

  async getProductType(id: number): Promise<ProductType | undefined> {
    return this.productTypes.get(id);
  }

  async createProductType(type: InsertProductType): Promise<ProductType> {
    const id = this.currentTypeId++;
    const newType: ProductType = { ...type, id, description: type.description || null };
    this.productTypes.set(id, newType);
    return newType;
  }

  async getProductSizes(): Promise<ProductSize[]> {
    return Array.from(this.productSizes.values());
  }

  async getProductSizesByType(typeId: number): Promise<ProductSize[]> {
    return Array.from(this.productSizes.values()).filter(size => size.typeId === typeId);
  }

  async getProductSize(id: number): Promise<ProductSize | undefined> {
    return this.productSizes.get(id);
  }

  async createProductSize(size: InsertProductSize): Promise<ProductSize> {
    const id = this.currentSizeId++;
    const newSize: ProductSize = { 
      ...size, 
      id, 
      itemCode: size.itemCode || null,
      minOrderQty: size.minOrderQty || null
    };
    this.productSizes.set(id, newSize);
    return newSize;
  }

  async updateProductSize(id: number, sizeData: Partial<InsertProductSize>): Promise<ProductSize | undefined> {
    const existingSize = this.productSizes.get(id);
    if (!existingSize) {
      return undefined;
    }
    
    const updatedSize: ProductSize = {
      ...existingSize,
      ...sizeData
    };
    this.productSizes.set(id, updatedSize);
    return updatedSize;
  }

  async getPricingTiers(): Promise<PricingTier[]> {
    return Array.from(this.pricingTiers.values());
  }

  async getPricingTier(id: number): Promise<PricingTier | undefined> {
    return this.pricingTiers.get(id);
  }

  async createPricingTier(tier: InsertPricingTier): Promise<PricingTier> {
    const id = this.currentTierId++;
    const newTier: PricingTier = { ...tier, id, description: tier.description || null };
    this.pricingTiers.set(id, newTier);
    return newTier;
  }

  async getProductPricing(): Promise<ProductPricing[]> {
    return Array.from(this.productPricing.values());
  }

  async getProductPricingByType(typeId: number): Promise<ProductPricing[]> {
    return Array.from(this.productPricing.values()).filter(pricing => pricing.productTypeId === typeId);
  }

  async getPriceForProductType(typeId: number, tierId: number, sizeId?: number): Promise<number> {
    // First try to find size-specific pricing if sizeId is provided
    if (sizeId) {
      const sizeSpecificPricing = Array.from(this.productPricing.values()).find(
        p => p.productTypeId === typeId && p.tierId === tierId && p.sizeId === sizeId
      );
      if (sizeSpecificPricing) {
        return parseFloat(sizeSpecificPricing.pricePerSquareMeter);
      }
    }
    
    // Fall back to type-level pricing
    const pricing = Array.from(this.productPricing.values()).find(
      p => p.productTypeId === typeId && p.tierId === tierId && !p.sizeId
    );
    return pricing ? parseFloat(pricing.pricePerSquareMeter) : 0;
  }

  async getPriceForSquareMeters(squareMeters: number, typeId: number, tierId: number, sizeId?: number): Promise<number> {
    const pricePerSqm = await this.getPriceForProductType(typeId, tierId, sizeId);
    return squareMeters * pricePerSqm;
  }

  async getSentQuotes(): Promise<SentQuote[]> {
    return Array.from(this.sentQuotes.values());
  }

  async getSentQuote(id: number): Promise<SentQuote | undefined> {
    return this.sentQuotes.get(id);
  }

  async getSentQuoteByNumber(quoteNumber: string): Promise<SentQuote | undefined> {
    return Array.from(this.sentQuotes.values()).find(q => q.quoteNumber === quoteNumber);
  }

  async createSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    const id = this.currentSentQuoteId++;
    const newQuote: SentQuote = { 
      ...quote, 
      id,
      status: quote.status || "sent",
      customerEmail: quote.customerEmail || null,
      createdAt: new Date()
    };
    this.sentQuotes.set(id, newQuote);
    return newQuote;
  }

  async upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    // Check if quote with same quote number already exists
    const existingQuote = Array.from(this.sentQuotes.values()).find(q => q.quoteNumber === quote.quoteNumber);
    
    if (existingQuote) {
      // Merge delivery methods
      const existingMethods = existingQuote.sentVia.split(',').map(m => m.trim());
      const newMethod = quote.sentVia;
      
      // Add new method if not already present
      const allMethods = Array.from(new Set([...existingMethods, newMethod]));
      const combinedSentVia = allMethods.join(', ');
      
      // Update existing quote with merged delivery methods
      const updatedQuote: SentQuote = {
        ...existingQuote,
        ...quote,
        sentVia: combinedSentVia,
        createdAt: existingQuote.createdAt, // Keep original creation date
        status: quote.status || existingQuote.status
      };
      this.sentQuotes.set(existingQuote.id, updatedQuote);
      return updatedQuote;
    } else {
      // Create new quote
      return await this.createSentQuote(quote);
    }
  }

  async deleteSentQuote(id: number): Promise<boolean> {
    return this.sentQuotes.delete(id);
  }

  // Competitor Pricing methods
  async getCompetitorPricing(): Promise<CompetitorPricing[]> {
    return Array.from(this.competitorPricing.values());
  }

  async getCompetitorPricingById(id: number): Promise<CompetitorPricing | undefined> {
    return this.competitorPricing.get(id);
  }

  async createCompetitorPricing(pricingData: InsertCompetitorPricing): Promise<CompetitorPricing> {
    const id = this.currentCompetitorPricingId++;
    const newPricing: CompetitorPricing = {
      ...pricingData,
      id,
      timestamp: new Date(),
      createdAt: new Date(),
      width: pricingData.width?.toString() || null,
      length: pricingData.length?.toString() || null,
    };
    this.competitorPricing.set(id, newPricing);
    return newPricing;
  }

  async deleteCompetitorPricing(id: number): Promise<boolean> {
    return this.competitorPricing.delete(id);
  }

  // File Upload Tracking methods
  async getFileUploads(): Promise<FileUpload[]> {
    // For MemStorage, return empty array since we don't persist file tracking
    return [];
  }

  async getActiveFileUpload(fileType: string): Promise<FileUpload | undefined> {
    // For MemStorage, return undefined since we don't persist file tracking
    return undefined;
  }

  async createFileUpload(upload: InsertFileUpload): Promise<FileUpload> {
    // For MemStorage, return a mock upload since we don't persist file tracking
    return {
      id: 1,
      fileName: upload.fileName,
      originalFileName: upload.originalFileName,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      uploadedBy: upload.uploadedBy,
      uploadedAt: new Date(),
      recordsProcessed: upload.recordsProcessed || 0,
      recordsAdded: upload.recordsAdded || 0,
      recordsUpdated: upload.recordsUpdated || 0,
      isActive: upload.isActive || true
    };
  }

  async setActiveFileUpload(id: number, fileType: string): Promise<void> {
    // For MemStorage, no persistence needed
    return;
  }

  // Customer management methods
  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(customerData: InsertCustomer): Promise<Customer> {
    const newCustomer: Customer = {
      ...customerData,
      email: customerData.email || null,
      firstName: customerData.firstName || null,
      lastName: customerData.lastName || null,
      acceptsEmailMarketing: customerData.acceptsEmailMarketing || null,
      tags: customerData.tags || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.customers.set(customerData.id, newCustomer);
    return newCustomer;
  }

  async updateCustomer(id: string, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const existingCustomer = this.customers.get(id);
    if (!existingCustomer) {
      return undefined;
    }
    
    const updatedCustomer: Customer = {
      ...existingCustomer,
      ...customerData,
      updatedAt: new Date()
    };
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    return this.customers.delete(id);
  }

  // Removed: legacy pricing data methods - replaced by productPricingMaster

  async reinitializeData(): Promise<void> {
    // Clear existing data
    this.productCategories.clear();
    this.productTypes.clear();
    this.productSizes.clear();
    this.pricingTiers.clear();
    this.productPricing.clear();
    
    // Reset counters
    this.currentCategoryId = 1;
    this.currentTypeId = 1;
    this.currentSizeId = 1;
    this.currentTierId = 1;
    this.currentPricingId = 1;
    
    // Reinitialize with fresh data
    this.initializeData();
  }

  // Removed: legacy pricing management methods - replaced by productPricingMaster


}

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

  // For now, other methods will delegate to MemStorage
  private memStorage = new MemStorage();

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

  // Product Sizes
  async getProductSizes(): Promise<ProductSize[]> {
    return this.memStorage.getProductSizes();
  }

  async getProductSizesByType(typeId: number): Promise<ProductSize[]> {
    return this.memStorage.getProductSizesByType(typeId);
  }

  async getProductSize(id: number): Promise<ProductSize | undefined> {
    return this.memStorage.getProductSize(id);
  }

  async createProductSize(size: InsertProductSize): Promise<ProductSize> {
    return this.memStorage.createProductSize(size);
  }

  async updateProductSize(id: number, size: Partial<InsertProductSize>): Promise<ProductSize | undefined> {
    return this.memStorage.updateProductSize(id, size);
  }

  // Pricing Tiers
  async getPricingTiers(): Promise<PricingTier[]> {
    return this.memStorage.getPricingTiers();
  }

  async getPricingTier(id: number): Promise<PricingTier | undefined> {
    return this.memStorage.getPricingTier(id);
  }

  async createPricingTier(tier: InsertPricingTier): Promise<PricingTier> {
    return this.memStorage.createPricingTier(tier);
  }

  // Product Pricing
  async getProductPricing(): Promise<ProductPricing[]> {
    return this.memStorage.getProductPricing();
  }

  async getProductPricingByType(typeId: number): Promise<ProductPricing[]> {
    return this.memStorage.getProductPricingByType(typeId);
  }

  async getPriceForProductType(typeId: number, tierId: number, sizeId?: number): Promise<number> {
    return this.memStorage.getPriceForProductType(typeId, tierId, sizeId);
  }

  async getPriceForSquareMeters(squareMeters: number, typeId: number, tierId: number, sizeId?: number): Promise<number> {
    return this.memStorage.getPriceForSquareMeters(squareMeters, typeId, tierId, sizeId);
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    return this.memStorage.getCustomers();
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.memStorage.getCustomer(id);
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    return this.memStorage.createCustomer(customer);
  }

  async updateCustomer(id: string, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    return this.memStorage.updateCustomer(id, customerData);
  }

  async deleteCustomer(id: string): Promise<boolean> {
    return this.memStorage.deleteCustomer(id);
  }

  // Sent Quotes
  async getSentQuotes(): Promise<SentQuote[]> {
    return this.memStorage.getSentQuotes();
  }

  async getSentQuote(id: number): Promise<SentQuote | undefined> {
    return this.memStorage.getSentQuote(id);
  }

  async getSentQuoteByNumber(quoteNumber: string): Promise<SentQuote | undefined> {
    return this.memStorage.getSentQuoteByNumber(quoteNumber);
  }

  async createSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    return this.memStorage.createSentQuote(quote);
  }

  async upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    return this.memStorage.upsertSentQuote(quote);
  }

  async deleteSentQuote(id: number): Promise<boolean> {
    return this.memStorage.deleteSentQuote(id);
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
    return this.memStorage.reinitializeData();
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
}

export const storage = new DatabaseStorage();
