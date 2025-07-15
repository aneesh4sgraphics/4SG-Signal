import { 
  users, 
  productCategories,
  productTypes,
  productSizes,
  pricingTiers,
  productPricing,
  sentQuotes,
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
  type ProductPricing,
  type InsertProductPricing,
  type SentQuote,
  type InsertSentQuote
} from "@shared/schema";
import { parseProductData } from "./csv-parser";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  approveUser(userId: string, adminId: string): Promise<User | undefined>;
  rejectUser(userId: string, adminId: string): Promise<User | undefined>;

  
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
  
  // Pricing Tiers
  getPricingTiers(): Promise<PricingTier[]>;
  getPricingTier(id: number): Promise<PricingTier | undefined>;
  createPricingTier(tier: InsertPricingTier): Promise<PricingTier>;
  
  // Product Pricing
  getProductPricing(): Promise<ProductPricing[]>;
  getProductPricingByType(typeId: number): Promise<ProductPricing[]>;
  getPriceForProductType(typeId: number, tierId: number): Promise<number>;
  getPriceForSquareMeters(squareMeters: number, typeId: number, tierId: number): Promise<number>;
  
  // Sent Quotes
  getSentQuotes(): Promise<SentQuote[]>;
  getSentQuote(id: number): Promise<SentQuote | undefined>;
  createSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  
  // Admin methods
  reinitializeData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private productCategories: Map<number, ProductCategory>;
  private productTypes: Map<number, ProductType>;
  private productSizes: Map<number, ProductSize>;
  private pricingTiers: Map<number, PricingTier>;
  private productPricing: Map<number, ProductPricing>;
  private sentQuotes: Map<number, SentQuote>;
  private currentUserId: number;
  private currentCategoryId: number;
  private currentTypeId: number;
  private currentSizeId: number;
  private currentTierId: number;
  private currentPricingId: number;
  private currentSentQuoteId: number;

  constructor() {
    this.users = new Map();
    this.productCategories = new Map();
    this.productTypes = new Map();
    this.productSizes = new Map();
    this.pricingTiers = new Map();
    this.productPricing = new Map();
    this.sentQuotes = new Map();
    this.currentUserId = 1;
    this.currentCategoryId = 1;
    this.currentTypeId = 1;
    this.currentSizeId = 1;
    this.currentTierId = 1;
    this.currentPricingId = 1;
    this.currentSentQuoteId = 1;

    // Initialize with admin user
    this.users.set("admin", {
      id: "admin",
      email: "aneesh@4sgraphics.com",
      firstName: "Aneesh",
      lastName: "Admin",
      profileImageUrl: null,
      role: "admin",
      status: "approved",
      approvedBy: "system",
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Initialize pre-approved users
    const preApprovedUsers = [
      {
        id: "oscar_preapproved",
        email: "oscar@4sgraphics.com",
        firstName: "Oscar",
        lastName: null,
        role: "user",
        status: "approved"
      },
      {
        id: "santiago_preapproved",
        email: "santiago@4sgraphics.com",
        firstName: "Santiago",
        lastName: null,
        role: "user", 
        status: "approved"
      },
      {
        id: "patricio_preapproved",
        email: "patricio@4sgraphics.com",
        firstName: "Patricio",
        lastName: null,
        role: "user",
        status: "approved"
      }
    ];

    preApprovedUsers.forEach(userData => {
      this.users.set(userData.id, {
        ...userData,
        profileImageUrl: null,
        approvedBy: "system",
        approvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    
    this.initializeData();
  }

  private initializeData() {
    try {
      const csvData = parseProductData();
      
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
      this.productPricing.set(1, { id: 1, productTypeId: 1, tierId: 1, pricePerSquareMeter: "5.70" });
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
      const updatedUser = { ...existingUser, ...userData, updatedAt: new Date() };
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

  async getPriceForProductType(typeId: number, tierId: number): Promise<number> {
    const pricing = Array.from(this.productPricing.values()).find(
      p => p.productTypeId === typeId && p.tierId === tierId
    );
    return pricing ? parseFloat(pricing.pricePerSquareMeter) : 0;
  }

  async getPriceForSquareMeters(squareMeters: number, typeId: number, tierId: number): Promise<number> {
    const pricePerSqm = await this.getPriceForProductType(typeId, tierId);
    return squareMeters * pricePerSqm;
  }

  async getSentQuotes(): Promise<SentQuote[]> {
    return Array.from(this.sentQuotes.values());
  }

  async getSentQuote(id: number): Promise<SentQuote | undefined> {
    return this.sentQuotes.get(id);
  }

  async createSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    const id = this.currentSentQuoteId++;
    const newQuote: SentQuote = { 
      ...quote, 
      id,
      status: quote.status || "sent",
      customerEmail: quote.customerEmail || null
    };
    this.sentQuotes.set(id, newQuote);
    return newQuote;
  }

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
}

export const storage = new MemStorage();
