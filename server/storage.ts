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
  type ProductPricing,
  type InsertProductPricing,
  type Customer,
  type InsertCustomer,
  type SentQuote,
  type InsertSentQuote
} from "@shared/schema";
import { parseProductData } from "./csv-parser";
import { parseCustomerData } from "./customer-parser";

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
  updateProductSize(id: number, size: Partial<InsertProductSize>): Promise<ProductSize | undefined>;
  
  // Pricing Tiers
  getPricingTiers(): Promise<PricingTier[]>;
  getPricingTier(id: number): Promise<PricingTier | undefined>;
  createPricingTier(tier: InsertPricingTier): Promise<PricingTier>;
  
  // Product Pricing
  getProductPricing(): Promise<ProductPricing[]>;
  getProductPricingByType(typeId: number): Promise<ProductPricing[]>;
  getPriceForProductType(typeId: number, tierId: number): Promise<number>;
  getPriceForSquareMeters(squareMeters: number, typeId: number, tierId: number): Promise<number>;
  
  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;
  
  // Sent Quotes
  getSentQuotes(): Promise<SentQuote[]>;
  getSentQuote(id: number): Promise<SentQuote | undefined>;
  createSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  
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
    this.customers = new Map();
    this.sentQuotes = new Map();

    this.currentCategoryId = 1;
    this.currentTypeId = 1;
    this.currentSizeId = 1;
    this.currentTierId = 1;
    this.currentPricingId = 1;
    this.currentSentQuoteId = 1;

    // No default users - all users come from authentication
    
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

      // Initialize customers from CSV
      const customerData = parseCustomerData();
      customerData.forEach(customer => {
        this.customers.set(customer.id, {
          ...customer,
          createdAt: new Date(),
          updatedAt: new Date()
        });
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

  async upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote> {
    // Check if quote with same quote number already exists
    const existingQuote = Array.from(this.sentQuotes.values()).find(q => q.quoteNumber === quote.quoteNumber);
    
    if (existingQuote) {
      // Update existing quote
      const updatedQuote: SentQuote = {
        ...existingQuote,
        ...quote,
        sentVia: quote.sentVia || existingQuote.sentVia,
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
