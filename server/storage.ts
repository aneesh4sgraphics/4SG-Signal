import { 
  users, 
  productCategories,
  productTypes,
  productSizes,
  pricingTiers,
  productPricing,
  type User, 
  type InsertUser,
  type ProductCategory,
  type InsertProductCategory,
  type ProductType,
  type InsertProductType,
  type ProductSize,
  type InsertProductSize,
  type PricingTier,
  type InsertPricingTier,
  type ProductPricing,
  type InsertProductPricing
} from "@shared/schema";
import { parseProductData } from "./csv-parser";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private productCategories: Map<number, ProductCategory>;
  private productTypes: Map<number, ProductType>;
  private productSizes: Map<number, ProductSize>;
  private pricingTiers: Map<number, PricingTier>;
  private productPricing: Map<number, ProductPricing>;
  private currentUserId: number;
  private currentCategoryId: number;
  private currentTypeId: number;
  private currentSizeId: number;
  private currentTierId: number;
  private currentPricingId: number;

  constructor() {
    this.users = new Map();
    this.productCategories = new Map();
    this.productTypes = new Map();
    this.productSizes = new Map();
    this.pricingTiers = new Map();
    this.productPricing = new Map();
    this.currentUserId = 1;
    this.currentCategoryId = 1;
    this.currentTypeId = 1;
    this.currentSizeId = 1;
    this.currentTierId = 1;
    this.currentPricingId = 1;
    
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

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
}

export const storage = new MemStorage();
