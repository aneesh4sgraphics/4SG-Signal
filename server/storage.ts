import { 
  users, 
  productCategories,
  productTypes,
  productSizes,
  pricingTiers,
  type User, 
  type InsertUser,
  type ProductCategory,
  type InsertProductCategory,
  type ProductType,
  type InsertProductType,
  type ProductSize,
  type InsertProductSize,
  type PricingTier,
  type InsertPricingTier
} from "@shared/schema";

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
  getPriceForSquareMeters(squareMeters: number): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private productCategories: Map<number, ProductCategory>;
  private productTypes: Map<number, ProductType>;
  private productSizes: Map<number, ProductSize>;
  private pricingTiers: Map<number, PricingTier>;
  private currentUserId: number;
  private currentCategoryId: number;
  private currentTypeId: number;
  private currentSizeId: number;
  private currentTierId: number;

  constructor() {
    this.users = new Map();
    this.productCategories = new Map();
    this.productTypes = new Map();
    this.productSizes = new Map();
    this.pricingTiers = new Map();
    this.currentUserId = 1;
    this.currentCategoryId = 1;
    this.currentTypeId = 1;
    this.currentSizeId = 1;
    this.currentTierId = 1;
    
    this.initializeData();
  }

  private initializeData() {
    // Initialize pricing tiers
    const tiers = [
      { minSquareMeters: "0.01", maxSquareMeters: "0.5", pricePerSquareMeter: "8.50" },
      { minSquareMeters: "0.51", maxSquareMeters: "2.0", pricePerSquareMeter: "7.50" },
      { minSquareMeters: "2.01", maxSquareMeters: "5.0", pricePerSquareMeter: "6.50" },
      { minSquareMeters: "5.01", maxSquareMeters: "999999", pricePerSquareMeter: "5.50" }
    ];

    tiers.forEach(tier => {
      this.createPricingTier(tier);
    });

    // Initialize product categories
    const categories = [
      { name: "Banners & Signs", description: "Outdoor and indoor banner solutions" },
      { name: "Prints & Posters", description: "High-quality prints and posters" },
      { name: "Vinyl Graphics", description: "Custom vinyl graphics and decals" },
      { name: "Fabric Products", description: "Fabric-based printing solutions" }
    ];

    categories.forEach(category => {
      this.createProductCategory(category);
    });

    // Initialize product types for Banners & Signs
    const bannerTypes = [
      { categoryId: 1, name: "Outdoor Banner", description: "Weather-resistant outdoor banners" },
      { categoryId: 1, name: "Indoor Banner", description: "High-quality indoor banners" },
      { categoryId: 1, name: "Mesh Banner", description: "Wind-resistant mesh banners" }
    ];

    bannerTypes.forEach(type => {
      this.createProductType(type);
    });

    // Initialize sizes for Outdoor Banner
    const outdoorBannerSizes = [
      { typeId: 1, name: '12" × 18"', width: "12", height: "18", widthUnit: "inch", heightUnit: "inch", squareMeters: "0.1394" },
      { typeId: 1, name: '18" × 24"', width: "18", height: "24", widthUnit: "inch", heightUnit: "inch", squareMeters: "0.2787" },
      { typeId: 1, name: '24" × 36"', width: "24", height: "36", widthUnit: "inch", heightUnit: "inch", squareMeters: "0.5574" },
      { typeId: 1, name: '36" × 48"', width: "36", height: "48", widthUnit: "inch", heightUnit: "inch", squareMeters: "1.1148" },
      { typeId: 1, name: '48" × 8\'', width: "48", height: "8", widthUnit: "inch", heightUnit: "feet", squareMeters: "2.9728" },
      { typeId: 1, name: '60" × 10\'', width: "60", height: "10", widthUnit: "inch", heightUnit: "feet", squareMeters: "4.6450" }
    ];

    outdoorBannerSizes.forEach(size => {
      this.createProductSize(size);
    });
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
    const newCategory: ProductCategory = { ...category, id };
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
    const newType: ProductType = { ...type, id };
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
    const newSize: ProductSize = { ...size, id };
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
    const newTier: PricingTier = { ...tier, id };
    this.pricingTiers.set(id, newTier);
    return newTier;
  }

  async getPriceForSquareMeters(squareMeters: number): Promise<number> {
    const tiers = await this.getPricingTiers();
    for (const tier of tiers) {
      const min = parseFloat(tier.minSquareMeters);
      const max = parseFloat(tier.maxSquareMeters);
      if (squareMeters >= min && squareMeters <= max) {
        return parseFloat(tier.pricePerSquareMeter);
      }
    }
    return parseFloat(tiers[tiers.length - 1].pricePerSquareMeter);
  }
}

export const storage = new MemStorage();
