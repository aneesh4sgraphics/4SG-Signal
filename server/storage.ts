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
  type ParsedContact,
  type InsertParsedContact,
  type PdfCategoryDetails,
  type InsertPdfCategoryDetails,
  // Shipment Labeler types
  type Shipment,
  type InsertShipment,
  type ShippingCompany,
  type InsertShippingCompany,
  type SavedRecipient,
  type InsertSavedRecipient,
  type ProductLabel,
  type InsertProductLabel,
  type NotionProduct,
  type InsertNotionProduct,
  // CRM types
  type PressProfile,
  type InsertPressProfile,
  type SampleRequest,
  type InsertSampleRequest,
  type TestOutcome,
  type InsertTestOutcome,
  type ValidationEvent,
  type InsertValidationEvent,
  type Swatch,
  type InsertSwatch,
  type SwatchBookShipment,
  type InsertSwatchBookShipment,
  type SwatchSelection,
  type InsertSwatchSelection,
  type CustomerJourney,
  type InsertCustomerJourney,
  type QuoteEvent,
  type InsertQuoteEvent,
  type PriceListEvent,
  type InsertPriceListEvent,
  // Journey Instance types
  type CustomerJourneyInstance,
  type InsertCustomerJourneyInstance,
  type CustomerJourneyStep,
  type InsertCustomerJourneyStep,
  type PressTestJourneyDetail,
  type InsertPressTestJourneyDetail,
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
  parsedContacts,
  pdfCategoryDetails,
  // Shipment Labeler tables
  shipments,
  shippingCompanies,
  savedRecipients,
  productLabels,
  notionProducts,
  // CRM tables
  pressProfiles,
  sampleRequests,
  testOutcomes,
  validationEvents,
  swatches,
  swatchBookShipments,
  swatchSelections,
  customerJourney,
  quoteEvents,
  priceListEvents,
  customerContacts,
  type CustomerContact,
  type InsertCustomerContact,
  // Journey Instance tables
  customerJourneyInstances,
  customerJourneySteps,
  pressTestJourneyDetails,
  type ProductPricingMaster,
  type InsertProductPricingMaster,
  type UploadBatch,
  type InsertUploadBatch
} from "@shared/schema";
import { parseCustomerCSV } from "./customer-parser";
import { db } from "./db";
import { eq, desc, and, sql, ilike, or, gte } from "drizzle-orm";

export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  approveUser(userId: string, adminId: string): Promise<User | undefined>;
  rejectUser(userId: string, adminId: string): Promise<User | undefined>;
  changeUserRole(userId: string, role: string): Promise<User | undefined>;
  updateUserRole(userId: string, role: string): Promise<User | undefined>;

  
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
  getAllCustomers(): Promise<Customer[]>; // Alias for getCustomers for clarity
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  createCustomersBatch(customers: InsertCustomer[]): Promise<Customer[]>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  updateCustomersBatch(customers: Array<{ id: string; data: InsertCustomer }>): Promise<void>;
  deleteCustomer(id: string): Promise<boolean>;
  
  // Sent Quotes
  getSentQuotes(): Promise<SentQuote[]>;
  getSentQuote(id: number): Promise<SentQuote | undefined>;
  getSentQuoteByNumber(quoteNumber: string): Promise<SentQuote | undefined>;
  createSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  deleteSentQuote(id: number): Promise<boolean>;
  getQuoteCountsByCustomerEmail(): Promise<Record<string, number>>;
  
  // Competitor Pricing
  getCompetitorPricing(): Promise<CompetitorPricing[]>;
  getCompetitorPricingById(id: number): Promise<CompetitorPricing | undefined>;
  createCompetitorPricing(pricing: InsertCompetitorPricing): Promise<CompetitorPricing>;
  updateCompetitorPricing(id: number, data: Partial<InsertCompetitorPricing>): Promise<CompetitorPricing | undefined>;
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
  getActivityLogs(userId?: string, limit?: number): Promise<any[]>;
  getUserActivityLogs(userId: string, limit?: number): Promise<any[]>;
  getActivityLogsSince(date: Date): Promise<ActivityLog[]>;
  
  // Dashboard Statistics
  getSentQuotesCount(): Promise<number>;
  getSentQuotesCountSince(date: Date): Promise<number>;
  getSentQuotesSince(date: Date): Promise<SentQuote[]>;
  getSentQuotesByCustomerInfo(email?: string, company?: string): Promise<SentQuote[]>;
  getCustomersCount(): Promise<number>;
  getProductsCount(): Promise<number>;
  
  // Parsed Contacts methods
  getParsedContacts(): Promise<ParsedContact[]>;
  getParsedContact(id: number): Promise<ParsedContact | undefined>;
  createParsedContact(contact: InsertParsedContact): Promise<ParsedContact>;
  updateParsedContact(id: number, contact: InsertParsedContact): Promise<ParsedContact>;
  deleteParsedContact(id: number): Promise<void>;
  
  // PDF Category Details methods
  getPdfCategoryDetails(): Promise<PdfCategoryDetails[]>;
  getPdfCategoryDetailByKey(categoryKey: string): Promise<PdfCategoryDetails | undefined>;
  upsertPdfCategoryDetail(detail: InsertPdfCategoryDetails): Promise<PdfCategoryDetails>;
  deletePdfCategoryDetail(id: number): Promise<void>;

  // Shipment Labeler methods
  // Shipments
  getShipments(): Promise<Shipment[]>;
  getShipment(id: number): Promise<Shipment | undefined>;
  createShipment(data: InsertShipment): Promise<Shipment>;
  deleteShipment(id: number): Promise<void>;

  // Shipping Companies
  getShippingCompanies(): Promise<ShippingCompany[]>;
  createShippingCompany(data: InsertShippingCompany): Promise<ShippingCompany>;
  deleteShippingCompany(id: number): Promise<void>;

  // Saved Recipients
  getSavedRecipients(): Promise<SavedRecipient[]>;
  createSavedRecipient(data: InsertSavedRecipient): Promise<SavedRecipient>;
  findRecipientByNameAndAddress(companyName: string, address: string): Promise<SavedRecipient | undefined>;

  // Product Labels
  getProductLabels(): Promise<ProductLabel[]>;
  getProductLabel(id: number): Promise<ProductLabel | undefined>;
  createProductLabel(data: InsertProductLabel): Promise<ProductLabel>;
  updateProductLabel(id: number, data: Partial<InsertProductLabel>): Promise<ProductLabel | undefined>;
  deleteProductLabel(id: number): Promise<void>;

  // Notion Products
  getNotionProducts(): Promise<NotionProduct[]>;
  searchNotionProducts(query: string): Promise<NotionProduct[]>;
  syncNotionProducts(products: InsertNotionProduct[]): Promise<{ synced: number; created: number; updated: number }>;

  // ========================================
  // CRM / Paper Distribution Methods
  // ========================================

  // Press Profiles
  getPressProfiles(customerId?: string): Promise<PressProfile[]>;
  getPressProfile(id: number): Promise<PressProfile | undefined>;
  createPressProfile(data: InsertPressProfile): Promise<PressProfile>;
  updatePressProfile(id: number, data: Partial<InsertPressProfile>): Promise<PressProfile | undefined>;
  deletePressProfile(id: number): Promise<void>;

  // Sample Requests
  getSampleRequests(customerId?: string): Promise<SampleRequest[]>;
  getSampleRequest(id: number): Promise<SampleRequest | undefined>;
  createSampleRequest(data: InsertSampleRequest): Promise<SampleRequest>;
  updateSampleRequest(id: number, data: Partial<InsertSampleRequest>): Promise<SampleRequest | undefined>;
  deleteSampleRequest(id: number): Promise<void>;

  // Test Outcomes
  getTestOutcomes(customerId?: string): Promise<TestOutcome[]>;
  getTestOutcome(id: number): Promise<TestOutcome | undefined>;
  createTestOutcome(data: InsertTestOutcome): Promise<TestOutcome>;
  updateTestOutcome(id: number, data: Partial<InsertTestOutcome>): Promise<TestOutcome | undefined>;

  // Validation Events
  getValidationEvents(customerId?: string): Promise<ValidationEvent[]>;
  createValidationEvent(data: InsertValidationEvent): Promise<ValidationEvent>;

  // Swatches
  getSwatches(): Promise<Swatch[]>;
  getSwatch(id: number): Promise<Swatch | undefined>;
  createSwatch(data: InsertSwatch): Promise<Swatch>;
  updateSwatch(id: number, data: Partial<InsertSwatch>): Promise<Swatch | undefined>;
  deleteSwatch(id: number): Promise<void>;

  // Swatch Book Shipments
  getSwatchBookShipments(customerId?: string): Promise<SwatchBookShipment[]>;
  getSwatchBookShipment(id: number): Promise<SwatchBookShipment | undefined>;
  createSwatchBookShipment(data: InsertSwatchBookShipment): Promise<SwatchBookShipment>;
  updateSwatchBookShipment(id: number, data: Partial<InsertSwatchBookShipment>): Promise<SwatchBookShipment | undefined>;

  // Swatch Selections
  getSwatchSelections(customerId?: string): Promise<SwatchSelection[]>;
  createSwatchSelection(data: InsertSwatchSelection): Promise<SwatchSelection>;
  updateSwatchSelection(id: number, data: Partial<InsertSwatchSelection>): Promise<SwatchSelection | undefined>;

  // Customer Contacts
  getCustomerContacts(customerId: string): Promise<CustomerContact[]>;
  getCustomerContact(id: number): Promise<CustomerContact | undefined>;
  createCustomerContact(data: InsertCustomerContact): Promise<CustomerContact>;
  updateCustomerContact(id: number, data: Partial<InsertCustomerContact>): Promise<CustomerContact | undefined>;
  deleteCustomerContact(id: number): Promise<void>;

  // Customer Journey
  getCustomerJourneys(): Promise<CustomerJourney[]>;
  getCustomerJourney(customerId: string): Promise<CustomerJourney | undefined>;
  getCustomerJourneysByStage(stage: string): Promise<CustomerJourney[]>;
  createCustomerJourney(data: InsertCustomerJourney): Promise<CustomerJourney>;
  updateCustomerJourney(customerId: string, data: Partial<InsertCustomerJourney>): Promise<CustomerJourney | undefined>;
  upsertCustomerJourney(data: InsertCustomerJourney): Promise<CustomerJourney>;

  // Quote Events
  getQuoteEvents(customerId?: string): Promise<QuoteEvent[]>;
  createQuoteEvent(data: InsertQuoteEvent): Promise<QuoteEvent>;

  // Price List Events
  getPriceListEvents(customerId?: string): Promise<PriceListEvent[]>;
  createPriceListEvent(data: InsertPriceListEvent): Promise<PriceListEvent>;

  // Customer Journey Instances (unified journey tracking)
  getJourneyInstances(customerId?: string): Promise<CustomerJourneyInstance[]>;
  getJourneyInstance(id: number): Promise<CustomerJourneyInstance | undefined>;
  createJourneyInstance(data: InsertCustomerJourneyInstance): Promise<CustomerJourneyInstance>;
  updateJourneyInstance(id: number, data: Partial<InsertCustomerJourneyInstance>): Promise<CustomerJourneyInstance | undefined>;
  deleteJourneyInstance(id: number): Promise<void>;

  // Customer Journey Steps
  getJourneySteps(instanceId: number): Promise<CustomerJourneyStep[]>;
  createJourneyStep(data: InsertCustomerJourneyStep): Promise<CustomerJourneyStep>;
  updateJourneyStep(id: number, data: Partial<InsertCustomerJourneyStep>): Promise<CustomerJourneyStep | undefined>;

  // Press Test Journey Details
  getPressTestDetails(instanceId: number): Promise<PressTestJourneyDetail | undefined>;
  createPressTestDetails(data: InsertPressTestJourneyDetail): Promise<PressTestJourneyDetail>;
  updatePressTestDetails(instanceId: number, data: Partial<InsertPressTestJourneyDetail>): Promise<PressTestJourneyDetail | undefined>;

  // CRM Dashboard Stats
  getCRMDashboardStats(): Promise<{
    stageCounts: { stage: string; count: number }[];
    totalActiveJourneys: number;
    totalQuotesSent: number;
    quotesLast30Days: number;
    totalCustomers: number;
    newCustomersLast30Days: number;
    pendingSamples: number;
    pendingSwatches: number;
    activePressProfiles: number;
  }>;
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
    // Use PostgreSQL's INSERT ... ON CONFLICT with proper handling for both id and email
    const query = sql`
      INSERT INTO users (
        id, email, first_name, last_name, profile_image_url, 
        role, status, approved_by, approved_at, login_count, 
        last_login_date, created_at, updated_at
      )
      VALUES (
        ${userData.id},
        ${userData.email},
        ${userData.firstName},
        ${userData.lastName},
        ${userData.profileImageUrl},
        ${userData.role},
        ${userData.status},
        ${userData.approvedBy},
        ${userData.approvedAt},
        ${userData.loginCount},
        ${userData.lastLoginDate},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (email) DO UPDATE SET
        id = EXCLUDED.id,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        profile_image_url = EXCLUDED.profile_image_url,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        login_count = EXCLUDED.login_count,
        last_login_date = EXCLUDED.last_login_date,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    try {
      const result = await db.execute(query);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as User;
      }
      throw new Error("No user returned from upsert operation");
    } catch (error) {
      console.error("Error in upsertUser:", error);
      console.error("Attempted userData:", userData);
      throw error;
    }
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
    const existingUser = await this.getUser(userId);
    if (!existingUser) return undefined;
    
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    
    return user;
  }

  async updateUserRole(userId: string, role: string): Promise<User | undefined> {
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
    
    const [entry] = await db
      .insert(competitorPricing)
      .values(data)
      .returning();
    return entry;
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

  async updateCompetitorPricing(id: number, data: Partial<InsertCompetitorPricing>): Promise<CompetitorPricing | undefined> {
    const [result] = await db
      .update(competitorPricing)
      .set(data)
      .where(eq(competitorPricing.id, id))
      .returning();
    return result;
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

  // ProductPricingMaster methods (clean implementation without legacy code)


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

  async getAllCustomers(): Promise<Customer[]> {
    return this.getCustomers(); // Alias for clarity in batch operations
  }

  async createCustomersBatch(customersData: InsertCustomer[]): Promise<Customer[]> {
    if (customersData.length === 0) return [];
    
    try {
      const results = await db
        .insert(customers)
        .values(customersData)
        .returning();
      return results;
    } catch (error) {
      console.error('Error creating customer batch:', error);
      throw error;
    }
  }

  async updateCustomersBatch(customerUpdates: Array<{ id: string; data: InsertCustomer }>): Promise<void> {
    if (customerUpdates.length === 0) return;
    
    try {
      // Use Promise.all for parallel processing instead of sequential updates
      const updatePromises = customerUpdates.map(({ id, data }) =>
        db
          .update(customers)
          .set(data)
          .where(eq(customers.id, id))
      );
      
      await Promise.all(updatePromises);
      console.log(`Successfully updated ${customerUpdates.length} customers in parallel`);
    } catch (error) {
      console.error('Error updating customer batch:', error);
      throw error;
    }
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
        .set(quote)
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

  async getQuoteCountsByCustomerEmail(): Promise<Record<string, number>> {
    try {
      const result = await db
        .select({
          email: sql<string>`LOWER(${sentQuotes.customerEmail})`,
          count: sql<number>`COUNT(*)::int`
        })
        .from(sentQuotes)
        .where(sql`${sentQuotes.customerEmail} IS NOT NULL AND ${sentQuotes.customerEmail} != ''`)
        .groupBy(sql`LOWER(${sentQuotes.customerEmail})`);
      
      const counts: Record<string, number> = {};
      for (const row of result) {
        if (row.email) {
          counts[row.email.toLowerCase()] = row.count;
        }
      }
      return counts;
    } catch (error) {
      console.error('Error getting quote counts:', error);
      return {};
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
    return await db.select().from(productPricingMaster).orderBy(productPricingMaster.sortOrder, productPricingMaster.id);
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
      .values(batch as any)
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

  async getActivityLogs(userId?: string, limit: number = 50): Promise<any[]> {
    if (userId) {
      return await db
        .select({
          id: activityLogs.id,
          action: activityLogs.action,
          description: activityLogs.description,
          userId: activityLogs.userId,
          userEmail: activityLogs.userEmail,
          userName: activityLogs.userName,
          userRole: activityLogs.userRole,
          createdAt: activityLogs.createdAt,
          user: {
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName
          }
        })
        .from(activityLogs)
        .leftJoin(users, eq(activityLogs.userId, users.id))
        .where(eq(activityLogs.userId, userId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(limit);
    }
    
    return await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        description: activityLogs.description,
        userId: activityLogs.userId,
        userEmail: activityLogs.userEmail,
        userName: activityLogs.userName,
        userRole: activityLogs.userRole,
        createdAt: activityLogs.createdAt,
        user: {
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getUserActivityLogs(userId: string, limit: number = 50): Promise<any[]> {
    return await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        description: activityLogs.description,
        userId: activityLogs.userId,
        userEmail: activityLogs.userEmail,
        userName: activityLogs.userName,
        userRole: activityLogs.userRole,
        createdAt: activityLogs.createdAt,
        user: {
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
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

  async getSentQuotesByCustomerInfo(email?: string, company?: string): Promise<SentQuote[]> {
    const conditions = [];
    
    if (email) {
      conditions.push(sql`LOWER(customer_email) = LOWER(${email})`);
    }
    
    if (company) {
      conditions.push(sql`LOWER(customer_name) LIKE LOWER(${`%${company}%`})`);
    }
    
    if (conditions.length === 0) {
      return [];
    }
    
    const whereClause = conditions.length === 1 
      ? conditions[0] 
      : sql`(${conditions[0]} OR ${conditions[1]})`;
    
    return await db
      .select()
      .from(sentQuotes)
      .where(whereClause)
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
  
  // Parsed Contacts implementation
  async getParsedContacts(): Promise<ParsedContact[]> {
    return await db
      .select()
      .from(parsedContacts)
      .orderBy(desc(parsedContacts.createdAt));
  }
  
  async getParsedContact(id: number): Promise<ParsedContact | undefined> {
    const [contact] = await db
      .select()
      .from(parsedContacts)
      .where(eq(parsedContacts.id, id));
    return contact;
  }
  
  async createParsedContact(contact: InsertParsedContact): Promise<ParsedContact> {
    const [newContact] = await db
      .insert(parsedContacts)
      .values(contact)
      .returning();
    return newContact;
  }
  
  async updateParsedContact(id: number, contact: InsertParsedContact): Promise<ParsedContact> {
    const [updatedContact] = await db
      .update(parsedContacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(eq(parsedContacts.id, id))
      .returning();
    return updatedContact;
  }
  
  async deleteParsedContact(id: number): Promise<void> {
    await db.delete(parsedContacts).where(eq(parsedContacts.id, id));
  }
  
  // PDF Category Details implementation
  async getPdfCategoryDetails(): Promise<PdfCategoryDetails[]> {
    return await db
      .select()
      .from(pdfCategoryDetails)
      .orderBy(pdfCategoryDetails.sortOrder);
  }
  
  async getPdfCategoryDetailByKey(categoryKey: string): Promise<PdfCategoryDetails | undefined> {
    const [detail] = await db
      .select()
      .from(pdfCategoryDetails)
      .where(eq(pdfCategoryDetails.categoryKey, categoryKey));
    return detail;
  }
  
  async upsertPdfCategoryDetail(detail: InsertPdfCategoryDetails): Promise<PdfCategoryDetails> {
    const [result] = await db
      .insert(pdfCategoryDetails)
      .values(detail)
      .onConflictDoUpdate({
        target: pdfCategoryDetails.categoryKey,
        set: {
          displayName: detail.displayName,
          logoFile: detail.logoFile,
          featuresMain: detail.featuresMain,
          featuresSub: detail.featuresSub,
          compatibleWith: detail.compatibleWith,
          matchesPattern: detail.matchesPattern,
          sortOrder: detail.sortOrder,
          isActive: detail.isActive,
          updatedBy: detail.updatedBy,
          updatedAt: new Date(),
        }
      })
      .returning();
    return result;
  }
  
  async deletePdfCategoryDetail(id: number): Promise<void> {
    await db.delete(pdfCategoryDetails).where(eq(pdfCategoryDetails.id, id));
  }

  // ========================================
  // Shipment Labeler Implementation
  // ========================================

  // Shipments
  async getShipments(): Promise<Shipment[]> {
    return await db.select().from(shipments).orderBy(desc(shipments.createdAt));
  }

  async getShipment(id: number): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, id));
    return shipment;
  }

  async createShipment(data: InsertShipment): Promise<Shipment> {
    const [shipment] = await db.insert(shipments).values(data).returning();
    return shipment;
  }

  async deleteShipment(id: number): Promise<void> {
    await db.delete(shipments).where(eq(shipments.id, id));
  }

  // Shipping Companies
  async getShippingCompanies(): Promise<ShippingCompany[]> {
    return await db.select().from(shippingCompanies).orderBy(shippingCompanies.name);
  }

  async createShippingCompany(data: InsertShippingCompany): Promise<ShippingCompany> {
    const [company] = await db.insert(shippingCompanies).values(data).returning();
    return company;
  }

  async deleteShippingCompany(id: number): Promise<void> {
    await db.delete(shippingCompanies).where(eq(shippingCompanies.id, id));
  }

  // Saved Recipients
  async getSavedRecipients(): Promise<SavedRecipient[]> {
    return await db.select().from(savedRecipients).orderBy(savedRecipients.companyName);
  }

  async createSavedRecipient(data: InsertSavedRecipient): Promise<SavedRecipient> {
    const [recipient] = await db.insert(savedRecipients).values(data).returning();
    return recipient;
  }

  async findRecipientByNameAndAddress(companyName: string, address: string): Promise<SavedRecipient | undefined> {
    const [recipient] = await db
      .select()
      .from(savedRecipients)
      .where(and(eq(savedRecipients.companyName, companyName), eq(savedRecipients.address, address)));
    return recipient;
  }

  // Product Labels
  async getProductLabels(): Promise<ProductLabel[]> {
    return await db.select().from(productLabels).orderBy(desc(productLabels.createdAt));
  }

  async getProductLabel(id: number): Promise<ProductLabel | undefined> {
    const [label] = await db.select().from(productLabels).where(eq(productLabels.id, id));
    return label;
  }

  async createProductLabel(data: InsertProductLabel): Promise<ProductLabel> {
    const [label] = await db.insert(productLabels).values(data).returning();
    return label;
  }

  async updateProductLabel(id: number, data: Partial<InsertProductLabel>): Promise<ProductLabel | undefined> {
    const [label] = await db.update(productLabels).set(data).where(eq(productLabels.id, id)).returning();
    return label;
  }

  async deleteProductLabel(id: number): Promise<void> {
    await db.delete(productLabels).where(eq(productLabels.id, id));
  }

  // Notion Products
  async getNotionProducts(): Promise<NotionProduct[]> {
    return await db.select().from(notionProducts).orderBy(notionProducts.productName);
  }

  async searchNotionProducts(query: string): Promise<NotionProduct[]> {
    if (!query.trim()) {
      return this.getNotionProducts();
    }
    return await db
      .select()
      .from(notionProducts)
      .where(
        or(
          ilike(notionProducts.productName, `%${query}%`),
          ilike(notionProducts.sku, `%${query}%`),
          ilike(notionProducts.description, `%${query}%`)
        )
      )
      .orderBy(notionProducts.productName);
  }

  async syncNotionProducts(products: InsertNotionProduct[]): Promise<{ synced: number; created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const product of products) {
      // Check if product exists by SKU or product name
      const existing = product.sku
        ? await db.select().from(notionProducts).where(eq(notionProducts.sku, product.sku)).then(r => r[0])
        : await db.select().from(notionProducts).where(eq(notionProducts.productName, product.productName)).then(r => r[0]);

      if (existing) {
        await db.update(notionProducts).set({ ...product, syncedAt: new Date() }).where(eq(notionProducts.id, existing.id));
        updated++;
      } else {
        await db.insert(notionProducts).values(product);
        created++;
      }
    }

    return { synced: products.length, created, updated };
  }

  // ========================================
  // CRM / Paper Distribution Implementation
  // ========================================

  // Press Profiles
  async getPressProfiles(customerId?: string): Promise<PressProfile[]> {
    if (customerId) {
      return await db.select().from(pressProfiles).where(eq(pressProfiles.customerId, customerId)).orderBy(desc(pressProfiles.createdAt));
    }
    return await db.select().from(pressProfiles).orderBy(desc(pressProfiles.createdAt));
  }

  async getPressProfile(id: number): Promise<PressProfile | undefined> {
    const [profile] = await db.select().from(pressProfiles).where(eq(pressProfiles.id, id));
    return profile;
  }

  async createPressProfile(data: InsertPressProfile): Promise<PressProfile> {
    const [profile] = await db.insert(pressProfiles).values(data).returning();
    return profile;
  }

  async updatePressProfile(id: number, data: Partial<InsertPressProfile>): Promise<PressProfile | undefined> {
    const [profile] = await db.update(pressProfiles).set({ ...data, updatedAt: new Date() }).where(eq(pressProfiles.id, id)).returning();
    return profile;
  }

  async deletePressProfile(id: number): Promise<void> {
    await db.delete(pressProfiles).where(eq(pressProfiles.id, id));
  }

  // Sample Requests
  async getSampleRequests(customerId?: string): Promise<SampleRequest[]> {
    if (customerId) {
      return await db.select().from(sampleRequests).where(eq(sampleRequests.customerId, customerId)).orderBy(desc(sampleRequests.createdAt));
    }
    return await db.select().from(sampleRequests).orderBy(desc(sampleRequests.createdAt));
  }

  async getSampleRequest(id: number): Promise<SampleRequest | undefined> {
    const [request] = await db.select().from(sampleRequests).where(eq(sampleRequests.id, id));
    return request;
  }

  async createSampleRequest(data: InsertSampleRequest): Promise<SampleRequest> {
    const [request] = await db.insert(sampleRequests).values(data).returning();
    return request;
  }

  async updateSampleRequest(id: number, data: Partial<InsertSampleRequest>): Promise<SampleRequest | undefined> {
    const [request] = await db.update(sampleRequests).set({ ...data, updatedAt: new Date() }).where(eq(sampleRequests.id, id)).returning();
    return request;
  }

  async deleteSampleRequest(id: number): Promise<void> {
    await db.delete(sampleRequests).where(eq(sampleRequests.id, id));
  }

  // Test Outcomes
  async getTestOutcomes(customerId?: string): Promise<TestOutcome[]> {
    if (customerId) {
      return await db.select().from(testOutcomes).where(eq(testOutcomes.customerId, customerId)).orderBy(desc(testOutcomes.createdAt));
    }
    return await db.select().from(testOutcomes).orderBy(desc(testOutcomes.createdAt));
  }

  async getTestOutcome(id: number): Promise<TestOutcome | undefined> {
    const [outcome] = await db.select().from(testOutcomes).where(eq(testOutcomes.id, id));
    return outcome;
  }

  async createTestOutcome(data: InsertTestOutcome): Promise<TestOutcome> {
    const [outcome] = await db.insert(testOutcomes).values(data).returning();
    return outcome;
  }

  async updateTestOutcome(id: number, data: Partial<InsertTestOutcome>): Promise<TestOutcome | undefined> {
    const [outcome] = await db.update(testOutcomes).set(data).where(eq(testOutcomes.id, id)).returning();
    return outcome;
  }

  // Validation Events
  async getValidationEvents(customerId?: string): Promise<ValidationEvent[]> {
    if (customerId) {
      return await db.select().from(validationEvents).where(eq(validationEvents.customerId, customerId)).orderBy(desc(validationEvents.completedAt));
    }
    return await db.select().from(validationEvents).orderBy(desc(validationEvents.completedAt));
  }

  async createValidationEvent(data: InsertValidationEvent): Promise<ValidationEvent> {
    const [event] = await db.insert(validationEvents).values(data).returning();
    return event;
  }

  // Swatches
  async getSwatches(): Promise<Swatch[]> {
    return await db.select().from(swatches).orderBy(swatches.name);
  }

  async getSwatch(id: number): Promise<Swatch | undefined> {
    const [swatch] = await db.select().from(swatches).where(eq(swatches.id, id));
    return swatch;
  }

  async createSwatch(data: InsertSwatch): Promise<Swatch> {
    const [swatch] = await db.insert(swatches).values(data).returning();
    return swatch;
  }

  async updateSwatch(id: number, data: Partial<InsertSwatch>): Promise<Swatch | undefined> {
    const [swatch] = await db.update(swatches).set(data).where(eq(swatches.id, id)).returning();
    return swatch;
  }

  async deleteSwatch(id: number): Promise<void> {
    await db.delete(swatches).where(eq(swatches.id, id));
  }

  // Swatch Book Shipments
  async getSwatchBookShipments(customerId?: string): Promise<SwatchBookShipment[]> {
    if (customerId) {
      return await db.select().from(swatchBookShipments).where(eq(swatchBookShipments.customerId, customerId)).orderBy(desc(swatchBookShipments.createdAt));
    }
    return await db.select().from(swatchBookShipments).orderBy(desc(swatchBookShipments.createdAt));
  }

  async getSwatchBookShipment(id: number): Promise<SwatchBookShipment | undefined> {
    const [shipment] = await db.select().from(swatchBookShipments).where(eq(swatchBookShipments.id, id));
    return shipment;
  }

  async createSwatchBookShipment(data: InsertSwatchBookShipment): Promise<SwatchBookShipment> {
    const [shipment] = await db.insert(swatchBookShipments).values(data).returning();
    return shipment;
  }

  async updateSwatchBookShipment(id: number, data: Partial<InsertSwatchBookShipment>): Promise<SwatchBookShipment | undefined> {
    const [shipment] = await db.update(swatchBookShipments).set(data).where(eq(swatchBookShipments.id, id)).returning();
    return shipment;
  }

  // Swatch Selections
  async getSwatchSelections(customerId?: string): Promise<SwatchSelection[]> {
    if (customerId) {
      return await db.select().from(swatchSelections).where(eq(swatchSelections.customerId, customerId)).orderBy(desc(swatchSelections.createdAt));
    }
    return await db.select().from(swatchSelections).orderBy(desc(swatchSelections.createdAt));
  }

  async createSwatchSelection(data: InsertSwatchSelection): Promise<SwatchSelection> {
    const [selection] = await db.insert(swatchSelections).values(data).returning();
    return selection;
  }

  async updateSwatchSelection(id: number, data: Partial<InsertSwatchSelection>): Promise<SwatchSelection | undefined> {
    const [selection] = await db.update(swatchSelections).set(data).where(eq(swatchSelections.id, id)).returning();
    return selection;
  }

  // Customer Contacts
  async getCustomerContacts(customerId: string): Promise<CustomerContact[]> {
    return await db.select().from(customerContacts).where(eq(customerContacts.customerId, customerId)).orderBy(desc(customerContacts.isPrimary), customerContacts.name);
  }

  async getCustomerContact(id: number): Promise<CustomerContact | undefined> {
    const [contact] = await db.select().from(customerContacts).where(eq(customerContacts.id, id));
    return contact;
  }

  async createCustomerContact(data: InsertCustomerContact): Promise<CustomerContact> {
    const [contact] = await db.insert(customerContacts).values(data).returning();
    return contact;
  }

  async updateCustomerContact(id: number, data: Partial<InsertCustomerContact>): Promise<CustomerContact | undefined> {
    const [contact] = await db.update(customerContacts).set({ ...data, updatedAt: new Date() }).where(eq(customerContacts.id, id)).returning();
    return contact;
  }

  async deleteCustomerContact(id: number): Promise<void> {
    await db.delete(customerContacts).where(eq(customerContacts.id, id));
  }

  // Customer Journey
  async getCustomerJourneys(): Promise<CustomerJourney[]> {
    return await db.select().from(customerJourney).orderBy(desc(customerJourney.stageUpdatedAt));
  }

  async getCustomerJourney(customerId: string): Promise<CustomerJourney | undefined> {
    const [journey] = await db.select().from(customerJourney).where(eq(customerJourney.customerId, customerId));
    return journey;
  }

  async getCustomerJourneysByStage(stage: string): Promise<CustomerJourney[]> {
    return await db.select().from(customerJourney).where(eq(customerJourney.journeyStage, stage)).orderBy(desc(customerJourney.stageUpdatedAt));
  }

  async createCustomerJourney(data: InsertCustomerJourney): Promise<CustomerJourney> {
    const [journey] = await db.insert(customerJourney).values(data).returning();
    return journey;
  }

  async updateCustomerJourney(customerId: string, data: Partial<InsertCustomerJourney>): Promise<CustomerJourney | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    if (data.journeyStage) {
      (updateData as any).stageUpdatedAt = new Date();
    }
    const [journey] = await db.update(customerJourney).set(updateData).where(eq(customerJourney.customerId, customerId)).returning();
    return journey;
  }

  async upsertCustomerJourney(data: InsertCustomerJourney): Promise<CustomerJourney> {
    const existing = await this.getCustomerJourney(data.customerId);
    if (existing) {
      const updated = await this.updateCustomerJourney(data.customerId, data);
      return updated!;
    }
    return await this.createCustomerJourney(data);
  }

  // Quote Events
  async getQuoteEvents(customerId?: string): Promise<QuoteEvent[]> {
    if (customerId) {
      return await db.select().from(quoteEvents).where(eq(quoteEvents.customerId, customerId)).orderBy(desc(quoteEvents.createdAt));
    }
    return await db.select().from(quoteEvents).orderBy(desc(quoteEvents.createdAt));
  }

  async createQuoteEvent(data: InsertQuoteEvent): Promise<QuoteEvent> {
    const [event] = await db.insert(quoteEvents).values(data).returning();
    // Update customer journey quote count
    const journey = await this.getCustomerJourney(data.customerId);
    if (journey) {
      await this.updateCustomerJourney(data.customerId, {
        quotesReceived: (journey.quotesReceived || 0) + 1,
        lastQuoteDate: new Date(),
      });
    }
    return event;
  }

  // Price List Events
  async getPriceListEvents(customerId?: string): Promise<PriceListEvent[]> {
    if (customerId) {
      return await db.select().from(priceListEvents).where(eq(priceListEvents.customerId, customerId)).orderBy(desc(priceListEvents.createdAt));
    }
    return await db.select().from(priceListEvents).orderBy(desc(priceListEvents.createdAt));
  }

  async createPriceListEvent(data: InsertPriceListEvent): Promise<PriceListEvent> {
    const [event] = await db.insert(priceListEvents).values(data).returning();
    // Update customer journey price list view count if customer is specified
    if (data.customerId) {
      const journey = await this.getCustomerJourney(data.customerId);
      if (journey) {
        await this.updateCustomerJourney(data.customerId, {
          priceListViews: (journey.priceListViews || 0) + 1,
          lastPriceListView: new Date(),
        });
      }
    }
    return event;
  }

  // Customer Journey Instances
  async getJourneyInstances(customerId?: string): Promise<CustomerJourneyInstance[]> {
    if (customerId) {
      return await db.select().from(customerJourneyInstances)
        .where(eq(customerJourneyInstances.customerId, customerId))
        .orderBy(desc(customerJourneyInstances.createdAt));
    }
    return await db.select().from(customerJourneyInstances).orderBy(desc(customerJourneyInstances.createdAt));
  }

  async getJourneyInstance(id: number): Promise<CustomerJourneyInstance | undefined> {
    const [instance] = await db.select().from(customerJourneyInstances).where(eq(customerJourneyInstances.id, id));
    return instance;
  }

  async createJourneyInstance(data: InsertCustomerJourneyInstance): Promise<CustomerJourneyInstance> {
    const [instance] = await db.insert(customerJourneyInstances).values(data).returning();
    return instance;
  }

  async updateJourneyInstance(id: number, data: Partial<InsertCustomerJourneyInstance>): Promise<CustomerJourneyInstance | undefined> {
    const [instance] = await db.update(customerJourneyInstances)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customerJourneyInstances.id, id))
      .returning();
    return instance;
  }

  async deleteJourneyInstance(id: number): Promise<void> {
    await db.delete(customerJourneyInstances).where(eq(customerJourneyInstances.id, id));
  }

  // Customer Journey Steps
  async getJourneySteps(instanceId: number): Promise<CustomerJourneyStep[]> {
    return await db.select().from(customerJourneySteps)
      .where(eq(customerJourneySteps.instanceId, instanceId))
      .orderBy(customerJourneySteps.createdAt);
  }

  async createJourneyStep(data: InsertCustomerJourneyStep): Promise<CustomerJourneyStep> {
    const [step] = await db.insert(customerJourneySteps).values(data).returning();
    return step;
  }

  async updateJourneyStep(id: number, data: Partial<InsertCustomerJourneyStep>): Promise<CustomerJourneyStep | undefined> {
    const [step] = await db.update(customerJourneySteps)
      .set(data)
      .where(eq(customerJourneySteps.id, id))
      .returning();
    return step;
  }

  // Press Test Journey Details
  async getPressTestDetails(instanceId: number): Promise<PressTestJourneyDetail | undefined> {
    const [details] = await db.select().from(pressTestJourneyDetails).where(eq(pressTestJourneyDetails.instanceId, instanceId));
    return details;
  }

  async createPressTestDetails(data: InsertPressTestJourneyDetail): Promise<PressTestJourneyDetail> {
    const [details] = await db.insert(pressTestJourneyDetails).values(data).returning();
    return details;
  }

  async updatePressTestDetails(instanceId: number, data: Partial<InsertPressTestJourneyDetail>): Promise<PressTestJourneyDetail | undefined> {
    const [details] = await db.update(pressTestJourneyDetails)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pressTestJourneyDetails.instanceId, instanceId))
      .returning();
    return details;
  }

  // CRM Dashboard Stats
  async getCRMDashboardStats(): Promise<{
    stageCounts: { stage: string; count: number }[];
    totalActiveJourneys: number;
    totalQuotesSent: number;
    quotesLast30Days: number;
    totalCustomers: number;
    newCustomersLast30Days: number;
    pendingSamples: number;
    pendingSwatches: number;
    activePressProfiles: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get journey stage counts
    const journeys = await db.select().from(customerJourney);
    const stageCountsMap: Record<string, number> = {};
    const stages = ['trigger', 'internal_alarm', 'supplier_pushback', 'pilot_alignment', 'controlled_trial', 'validation_proof', 'conversion'];
    stages.forEach(s => stageCountsMap[s] = 0);
    journeys.forEach(j => {
      if (j.journeyStage && stageCountsMap[j.journeyStage] !== undefined) {
        stageCountsMap[j.journeyStage]++;
      }
    });
    const stageCounts = stages.map(stage => ({ stage, count: stageCountsMap[stage] }));

    // Total quotes sent (from sent_quotes table)
    const allQuotes = await db.select({ id: sentQuotes.id }).from(sentQuotes);
    const totalQuotesSent = allQuotes.length;

    // Quotes last 30 days
    const recentQuotes = await db.select({ id: sentQuotes.id }).from(sentQuotes)
      .where(gte(sentQuotes.createdAt, thirtyDaysAgo));
    const quotesLast30Days = recentQuotes.length;

    // Total customers
    const allCustomers = await db.select({ id: customers.id }).from(customers);
    const totalCustomers = allCustomers.length;

    // New customers last 30 days
    const recentCustomers = await db.select({ id: customers.id }).from(customers)
      .where(gte(customers.createdAt, thirtyDaysAgo));
    const newCustomersLast30Days = recentCustomers.length;

    // Pending samples (status = pending or shipped or testing)
    const pendingSamplesList = await db.select({ id: sampleRequests.id }).from(sampleRequests)
      .where(sql`${sampleRequests.status} IN ('pending', 'shipped', 'testing')`);
    const pendingSamples = pendingSamplesList.length;

    // Pending swatch shipments (status = pending or shipped)
    const pendingSwatchesList = await db.select({ id: swatchBookShipments.id }).from(swatchBookShipments)
      .where(sql`${swatchBookShipments.status} IN ('pending', 'shipped')`);
    const pendingSwatches = pendingSwatchesList.length;

    // Active press profiles
    const allPressProfiles = await db.select({ id: pressProfiles.id }).from(pressProfiles);
    const activePressProfiles = allPressProfiles.length;

    return {
      stageCounts,
      totalActiveJourneys: journeys.length,
      totalQuotesSent,
      quotesLast30Days,
      totalCustomers,
      newCustomersLast30Days,
      pendingSamples,
      pendingSwatches,
      activePressProfiles,
    };
  }
}

export const storage = new DatabaseStorage();

// Standalone function for user role updates
export async function updateUserRole(userId: string, newRole: string) {
  return await db
    .update(users)
    .set({ role: newRole })
    .where(eq(users.id, userId))
    .returning()
    .then((res) => res[0]);
}
