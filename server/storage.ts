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
  type ProductCompetitorMapping,
  type InsertProductCompetitorMapping,
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
  type PressKitShipment,
  type InsertPressKitShipment,
  type SwatchSelection,
  type InsertSwatchSelection,
  type CustomerJourney,
  type InsertCustomerJourney,
  type QuoteEvent,
  type InsertQuoteEvent,
  type PriceListEvent,
  type InsertPriceListEvent,
  type PriceListEventItem,
  type InsertPriceListEventItem,
  // Journey Instance types
  type CustomerJourneyInstance,
  type InsertCustomerJourneyInstance,
  type CustomerJourneyStep,
  type InsertCustomerJourneyStep,
  type PressTestJourneyDetail,
  type InsertPressTestJourneyDetail,
  // Journey Template types
  type JourneyTemplate,
  type InsertJourneyTemplate,
  type JourneyTemplateStage,
  type InsertJourneyTemplateStage,
  users,
  customers,
  sentQuotes,
  competitorPricing,
  productCompetitorMappings,
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
  // CRM tables
  pressProfiles,
  sampleRequests,
  validationEvents,
  swatches,
  swatchBookShipments,
  pressKitShipments,
  swatchSelections,
  customerJourney,
  quoteEvents,
  priceListEvents,
  priceListEventItems,
  customerContacts,
  type CustomerContact,
  type InsertCustomerContact,
  // Journey Instance tables
  customerJourneyInstances,
  customerJourneySteps,
  pressTestJourneyDetails,
  // Journey Template tables
  journeyTemplates,
  journeyTemplateStages,
  type ProductPricingMaster,
  type InsertProductPricingMaster,
  type UploadBatch,
  type InsertUploadBatch,
  // Customer Activity System types
  type CustomerActivityEvent,
  type InsertCustomerActivityEvent,
  type FollowUpTask,
  type InsertFollowUpTask,
  type ProductExposureLog,
  type InsertProductExposureLog,
  type CustomerEngagementSummary,
  type InsertCustomerEngagementSummary,
  type FollowUpConfig,
  type InsertFollowUpConfig,
  type UserTutorialProgress,
  type InsertUserTutorialProgress,
  type EmailTemplate,
  type InsertEmailTemplate,
  type EmailSend,
  type InsertEmailSend,
  type EmailTrackingToken,
  type InsertEmailTrackingToken,
  type EmailTrackingEvent,
  type InsertEmailTrackingEvent,
  emailSignatures,
  type EmailSignature,
  type InsertEmailSignature,
  // Customer Activity System tables
  customerActivityEvents,
  followUpTasks,
  productExposureLog,
  customerEngagementSummary,
  followUpConfig,
  userTutorialProgress,
  emailTemplates,
  emailSends,
  emailTrackingTokens,
  emailTrackingEvents,
  // Admin Config tables
  adminCategories,
  type AdminCategory,
  type InsertAdminCategory,
  adminSkuMappings,
  type AdminSkuMapping,
  type InsertAdminSkuMapping,
  // Catalog tables
  catalogProductTypes,
  type CatalogProductType,
  type InsertCatalogProductType,
  catalogImportLogs,
  type CatalogImportLog,
  type InsertCatalogImportLog,
  shopifyUnmappedItems,
  type ShopifyUnmappedItem,
  type InsertShopifyUnmappedItem,
  categoryTrust,
  type CategoryTrust,
  // Drip Campaign tables
  dripCampaigns,
  dripCampaignSteps,
  dripCampaignAssignments,
  dripCampaignStepStatus,
  mediaUploads,
  type DripCampaign,
  type InsertDripCampaign,
  type DripCampaignStep,
  type InsertDripCampaignStep,
  type DripCampaignAssignment,
  type InsertDripCampaignAssignment,
  type DripCampaignStepStatus,
  type InsertDripCampaignStepStatus,
  type MediaUpload,
  type InsertMediaUpload,
  // Coaching Moments
  coachingMoments,
  type CoachingMoment,
  type InsertCoachingMoment,
  customerCoachState,
  // Label Queue
  labelQueue,
  type LabelQueueItem,
  // Sketchboard
  sketchboardEntries,
  type SketchboardEntry,
  type InsertSketchboardEntry,
  leads,
} from "@shared/schema";
import { parseCustomerCSV } from "./customer-parser";
import { db } from "./db";
import { eq, desc, and, sql, ilike, or, gte, isNull, isNotNull, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  approveUser(userId: string, adminId: string): Promise<User | undefined>;
  rejectUser(userId: string, adminId: string): Promise<User | undefined>;
  changeUserRole(userId: string, role: string): Promise<User | undefined>;
  updateUserRole(userId: string, role: string): Promise<User | undefined>;
  updateUserAllowedTiers(userId: string, allowedTiers: string[] | null): Promise<User | undefined>;
  updateUserOdooMapping(userId: string, odooUserId: number | null, odooUserName: string | null): Promise<User | undefined>;

  
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
  getCustomersPaginated(
    page: number, 
    limit: number, 
    search?: string,
    filters?: {
      salesRepId?: string;
      pricingTier?: string;
      province?: string;
      isHotProspect?: boolean;
      isCompany?: boolean;
      doNotContact?: boolean;
      city?: string;
      customerType?: string;
      hasAddress?: boolean;
      connectionStrength?: string;
    }
  ): Promise<{ data: Partial<Customer>[]; total: number; page: number; limit: number; totalPages: number }>;
  getAllCustomers(): Promise<Customer[]>; // Alias for getCustomers for clarity
  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerCount(): Promise<number>;
  getIdleAccountsCount(daysThreshold: number): Promise<number>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  createCustomersBatch(customers: InsertCustomer[]): Promise<Customer[]>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  updateCustomersBatch(customers: Array<{ id: string; data: InsertCustomer }>): Promise<void>;
  bulkUpdateCustomerFields(customerIds: string[], fields: { pricingTier?: string; salesRepId?: string }): Promise<number>;
  deleteCustomer(id: string): Promise<boolean>;
  
  // Sent Quotes
  getSentQuotes(): Promise<SentQuote[]>;
  getSentQuotesPaginated(page: number, limit: number, search?: string): Promise<{ data: SentQuote[]; total: number; page: number; limit: number; totalPages: number }>;
  getSentQuote(id: number): Promise<SentQuote | undefined>;
  getSentQuoteByNumber(quoteNumber: string): Promise<SentQuote | undefined>;
  createSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  upsertSentQuote(quote: InsertSentQuote): Promise<SentQuote>;
  updateSentQuote(id: number, data: Partial<InsertSentQuote>): Promise<SentQuote | undefined>;
  deleteSentQuote(id: number): Promise<boolean>;
  getQuoteCountsByCustomerEmail(): Promise<Record<string, number>>;
  
  // Competitor Pricing
  getCompetitorPricing(): Promise<CompetitorPricing[]>;
  getCompetitorPricingById(id: number): Promise<CompetitorPricing | undefined>;
  createCompetitorPricing(pricing: InsertCompetitorPricing): Promise<CompetitorPricing>;
  updateCompetitorPricing(id: number, data: Partial<InsertCompetitorPricing>): Promise<CompetitorPricing | undefined>;
  deleteCompetitorPricing(id: number): Promise<boolean>;
  
  // Product Competitor Mappings
  getProductCompetitorMappings(): Promise<ProductCompetitorMapping[]>;
  getProductCompetitorMappingsByProductId(productId: number): Promise<ProductCompetitorMapping[]>;
  getProductCompetitorMappingsByCompetitorId(competitorPricingId: number): Promise<ProductCompetitorMapping[]>;
  createProductCompetitorMapping(mapping: InsertProductCompetitorMapping): Promise<ProductCompetitorMapping>;
  updateProductCompetitorMapping(id: number, data: Partial<InsertProductCompetitorMapping>): Promise<ProductCompetitorMapping | undefined>;
  deleteProductCompetitorMapping(id: number): Promise<boolean>;
  
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
  getHotLeadsCount(): Promise<number>;
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

  // Press Kit Shipments
  getPressKitShipments(customerId?: string): Promise<PressKitShipment[]>;
  getPressKitShipment(id: number): Promise<PressKitShipment | undefined>;
  createPressKitShipment(data: InsertPressKitShipment): Promise<PressKitShipment>;
  updatePressKitShipment(id: number, data: Partial<InsertPressKitShipment>): Promise<PressKitShipment | undefined>;

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
  getPriceListCountsByCustomerId(): Promise<Record<string, number>>;
  
  // Price List Event Items
  createPriceListEventItems(eventId: number, items: InsertPriceListEventItem[]): Promise<PriceListEventItem[]>;
  getLatestPriceListItemsForCustomer(customerId: string): Promise<{ event: PriceListEvent; items: PriceListEventItem[] } | null>;

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

  // Journey Templates
  getJourneyTemplates(): Promise<JourneyTemplate[]>;
  getJourneyTemplate(id: number): Promise<JourneyTemplate | undefined>;
  getJourneyTemplateByKey(key: string): Promise<JourneyTemplate | undefined>;
  createJourneyTemplate(data: InsertJourneyTemplate): Promise<JourneyTemplate>;
  updateJourneyTemplate(id: number, data: Partial<InsertJourneyTemplate>): Promise<JourneyTemplate | undefined>;
  deleteJourneyTemplate(id: number): Promise<void>;

  // Journey Template Stages
  getTemplateStages(templateId: number): Promise<JourneyTemplateStage[]>;
  createTemplateStage(data: InsertJourneyTemplateStage): Promise<JourneyTemplateStage>;
  updateTemplateStage(id: number, data: Partial<InsertJourneyTemplateStage>): Promise<JourneyTemplateStage | undefined>;
  deleteTemplateStage(id: number): Promise<void>;
  deleteAllTemplateStages(templateId: number): Promise<void>;

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
    pendingFeedback: number;
    samplesWithTracking: number;
    swatchesWithTracking: number;
    hotProspects: number;
  }>;

  // ========================================
  // Customer Activity System Methods
  // ========================================

  // Customer Activity Events
  createActivityEvent(data: InsertCustomerActivityEvent): Promise<CustomerActivityEvent>;
  getActivityEventsByCustomer(customerId: string): Promise<CustomerActivityEvent[]>;
  getRecentActivityEvents(limit?: number): Promise<CustomerActivityEvent[]>;

  // Follow-up Tasks
  createFollowUpTask(data: InsertFollowUpTask): Promise<FollowUpTask>;
  getFollowUpTasksByCustomer(customerId: string): Promise<FollowUpTask[]>;
  getPendingFollowUpTasks(): Promise<FollowUpTask[]>;
  updateFollowUpTask(id: number, data: Partial<InsertFollowUpTask>): Promise<FollowUpTask | undefined>;
  completeFollowUpTask(id: number, completedBy: string, notes?: string): Promise<FollowUpTask | undefined>;
  getOverdueFollowUpTasks(): Promise<FollowUpTask[]>;
  getTodayFollowUpTasks(): Promise<FollowUpTask[]>;

  // Product Exposure
  createProductExposure(data: InsertProductExposureLog): Promise<ProductExposureLog>;
  getProductExposureByCustomer(customerId: string): Promise<ProductExposureLog[]>;

  // Engagement Summary
  getEngagementSummary(customerId: string): Promise<CustomerEngagementSummary | undefined>;
  updateEngagementSummary(customerId: string, data: Partial<InsertCustomerEngagementSummary>): Promise<CustomerEngagementSummary | undefined>;

  // Follow-up Config
  getFollowUpConfig(): Promise<FollowUpConfig[]>;
  updateFollowUpConfig(eventType: string, data: Partial<InsertFollowUpConfig>): Promise<FollowUpConfig | undefined>;
  initDefaultFollowUpConfig(): Promise<void>;

  // Tutorial Progress
  getUserTutorialProgress(userEmail: string): Promise<UserTutorialProgress[]>;
  getTutorialProgress(userEmail: string, tutorialId: string): Promise<UserTutorialProgress | undefined>;
  createTutorialProgress(data: InsertUserTutorialProgress): Promise<UserTutorialProgress>;
  updateTutorialProgress(userEmail: string, tutorialId: string, data: Partial<InsertUserTutorialProgress>): Promise<UserTutorialProgress | undefined>;

  // Email Templates
  getEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(id: number): Promise<EmailTemplate | undefined>;
  createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: number, data: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined>;
  deleteEmailTemplate(id: number): Promise<void>;

  // Sketchboard
  getSketchboardEntries(userId: string, column?: string): Promise<SketchboardEntry[]>;
  createSketchboardEntry(data: InsertSketchboardEntry): Promise<SketchboardEntry>;
  updateSketchboardEntry(id: number, userId: string, data: Partial<InsertSketchboardEntry>): Promise<SketchboardEntry | undefined>;
  deleteSketchboardEntry(id: number, userId: string): Promise<boolean>;
  getSketchboardColumnCount(userId: string, column: string): Promise<number>;
  normalizeSketchboardSortOrder(userId: string, column: string): Promise<void>;

  // Label Queue (shared cross-user)
  getLabelQueue(): Promise<LabelQueueItem[]>;
  addToLabelQueue(customerId: string | null, leadId: number | null, addedBy: string): Promise<LabelQueueItem>;
  removeFromLabelQueue(id: number): Promise<void>;
  clearLabelQueue(): Promise<void>;

  // Email Sends
  getEmailSends(customerId?: string): Promise<EmailSend[]>;
  createEmailSend(data: InsertEmailSend): Promise<EmailSend>;

  // Email Tracking
  createEmailTrackingToken(data: InsertEmailTrackingToken): Promise<EmailTrackingToken>;
  getEmailTrackingTokenByToken(token: string): Promise<EmailTrackingToken | undefined>;
  getEmailTrackingTokensByCustomer(customerId: string): Promise<EmailTrackingToken[]>;
  recordEmailOpenEvent(tokenId: number, ipAddress?: string, userAgent?: string): Promise<EmailTrackingEvent>;
  recordEmailClickEvent(tokenId: number, linkUrl: string, linkText?: string, ipAddress?: string, userAgent?: string): Promise<EmailTrackingEvent>;
  getEmailTrackingEventsByToken(tokenId: number): Promise<EmailTrackingEvent[]>;

  // Email Signatures
  getEmailSignature(userId: string): Promise<EmailSignature | undefined>;
  createEmailSignature(data: InsertEmailSignature): Promise<EmailSignature>;
  updateEmailSignature(userId: string, data: Partial<InsertEmailSignature>): Promise<EmailSignature | undefined>;
  deleteEmailSignature(userId: string): Promise<void>;

  // ========================================
  // Admin Categories & Catalog System Methods
  // ========================================

  // Admin Categories
  getAllAdminCategories(): Promise<AdminCategory[]>;
  getAdminCategory(id: number): Promise<AdminCategory | undefined>;
  getAdminCategoryByCode(code: string): Promise<AdminCategory | undefined>;
  createAdminCategory(data: InsertAdminCategory): Promise<AdminCategory>;
  updateAdminCategory(id: number, data: Partial<InsertAdminCategory>): Promise<AdminCategory | undefined>;

  // Catalog Product Types
  getAllCatalogProductTypes(): Promise<CatalogProductType[]>;
  getCatalogProductType(id: number): Promise<CatalogProductType | undefined>;
  getCatalogProductTypeByCode(code: string): Promise<CatalogProductType | undefined>;
  getCatalogProductTypesByCategory(categoryId: number): Promise<CatalogProductType[]>;
  createCatalogProductType(data: InsertCatalogProductType): Promise<CatalogProductType>;
  updateCatalogProductType(id: number, data: Partial<InsertCatalogProductType>): Promise<CatalogProductType | undefined>;

  // Catalog Import Logs
  getCatalogImportLogs(): Promise<CatalogImportLog[]>;
  createCatalogImportLog(data: InsertCatalogImportLog): Promise<CatalogImportLog>;
  updateCatalogImportLog(id: number, data: Partial<InsertCatalogImportLog>): Promise<CatalogImportLog | undefined>;

  // Shopify Unmapped Items
  getShopifyUnmappedItems(status?: string): Promise<ShopifyUnmappedItem[]>;
  createShopifyUnmappedItem(data: InsertShopifyUnmappedItem): Promise<ShopifyUnmappedItem>;
  resolveShopifyUnmappedItem(id: number, categoryId: number | null, productTypeId: number | null, itemCode: string | null, resolvedBy: string): Promise<ShopifyUnmappedItem | undefined>;

  // Admin SKU Mappings
  getAllAdminSkuMappings(): Promise<AdminSkuMapping[]>;
  createAdminSkuMapping(data: InsertAdminSkuMapping): Promise<AdminSkuMapping>;

  // Catalog Links Update
  updateProductPricingMasterCatalogLinks(itemCode: string, categoryId: number, productTypeId: number): Promise<void>;

  // ========================================
  // Drip Campaign Methods
  // ========================================
  
  // Drip Campaigns
  getDripCampaigns(): Promise<DripCampaign[]>;
  getDripCampaign(id: number): Promise<DripCampaign | undefined>;
  createDripCampaign(data: InsertDripCampaign): Promise<DripCampaign>;
  updateDripCampaign(id: number, data: Partial<InsertDripCampaign>): Promise<DripCampaign | undefined>;
  deleteDripCampaign(id: number): Promise<void>;
  
  // Drip Campaign Steps
  getDripCampaignSteps(campaignId: number): Promise<DripCampaignStep[]>;
  getDripCampaignStep(id: number): Promise<DripCampaignStep | undefined>;
  createDripCampaignStep(data: InsertDripCampaignStep): Promise<DripCampaignStep>;
  updateDripCampaignStep(id: number, data: Partial<InsertDripCampaignStep>): Promise<DripCampaignStep | undefined>;
  deleteDripCampaignStep(id: number): Promise<void>;
  reorderDripCampaignSteps(campaignId: number, stepIds: number[]): Promise<void>;
  
  // Drip Campaign Assignments
  getDripCampaignAssignments(campaignId?: number, customerId?: string, leadId?: number): Promise<DripCampaignAssignment[]>;
  getDripCampaignAssignment(id: number): Promise<DripCampaignAssignment | undefined>;
  getDripCampaignAssignmentCounts(): Promise<{ campaignId: number; count: number }[]>;
  createDripCampaignAssignment(data: InsertDripCampaignAssignment): Promise<DripCampaignAssignment>;
  bulkCreateDripCampaignAssignments(data: InsertDripCampaignAssignment[]): Promise<DripCampaignAssignment[]>;
  getActiveAssignmentsForCampaign(campaignId: number, customerIds: string[], leadIds: number[]): Promise<DripCampaignAssignment[]>;
  updateDripCampaignAssignment(id: number, data: Partial<InsertDripCampaignAssignment>): Promise<DripCampaignAssignment | undefined>;
  
  // Drip Campaign Step Status
  getDripCampaignStepStatuses(assignmentId: number): Promise<DripCampaignStepStatus[]>;
  getScheduledDripEmails(): Promise<DripCampaignStepStatus[]>;
  createDripCampaignStepStatus(data: InsertDripCampaignStepStatus): Promise<DripCampaignStepStatus>;
  bulkCreateDripCampaignStepStatuses(data: InsertDripCampaignStepStatus[]): Promise<void>;
  updateDripCampaignStepStatus(id: number, data: Partial<InsertDripCampaignStepStatus>): Promise<DripCampaignStepStatus | undefined>;
  
  // Media Uploads
  getMediaUploads(): Promise<MediaUpload[]>;
  createMediaUpload(data: InsertMediaUpload): Promise<MediaUpload>;
  deleteMediaUpload(id: number): Promise<void>;

  // ========================================
  // Now Mode Coaching Moments
  // ========================================
  getCurrentMoment(userId: string): Promise<CoachingMoment | undefined>;
  getMomentsForUser(userId: string, status?: string): Promise<CoachingMoment[]>;
  createCoachingMoment(data: InsertCoachingMoment): Promise<CoachingMoment>;
  completeMoment(id: number, outcome: string, notes?: string): Promise<CoachingMoment | undefined>;
  getDailyMomentCount(userId: string, dateKey: string): Promise<number>;
  incrementDailyMomentCount(userId: string, dateKey: string, isCall?: boolean): Promise<void>;
  incrementSkippedCount(userId: string, dateKey: string): Promise<void>;
  getDailyStats(userId: string, dateKey: string): Promise<{ completed: number; skipped: number; calls: number; cap: number }>;
  generateMomentsForUser(userId: string): Promise<CoachingMoment[]>;
  updateUserActivity(userId: string): Promise<void>;
  calculateEfficiencyScore(userId: string): Promise<number>;
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

  async updateUserAllowedTiers(userId: string, allowedTiers: string[] | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ allowedTiers, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserOdooMapping(userId: string, odooUserId: number | null, odooUserName: string | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ odooUserId, odooUserName, updatedAt: new Date() })
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

  // Product Competitor Mappings - Database implementation
  async getProductCompetitorMappings(): Promise<ProductCompetitorMapping[]> {
    return await db.select().from(productCompetitorMappings).orderBy(productCompetitorMappings.createdAt);
  }

  async getProductCompetitorMappingsByProductId(productId: number): Promise<ProductCompetitorMapping[]> {
    return await db
      .select()
      .from(productCompetitorMappings)
      .where(eq(productCompetitorMappings.productId, productId));
  }

  async getProductCompetitorMappingsByCompetitorId(competitorPricingId: number): Promise<ProductCompetitorMapping[]> {
    return await db
      .select()
      .from(productCompetitorMappings)
      .where(eq(productCompetitorMappings.competitorPricingId, competitorPricingId));
  }

  async createProductCompetitorMapping(mapping: InsertProductCompetitorMapping): Promise<ProductCompetitorMapping> {
    const [result] = await db
      .insert(productCompetitorMappings)
      .values(mapping)
      .returning();
    return result;
  }

  async updateProductCompetitorMapping(id: number, data: Partial<InsertProductCompetitorMapping>): Promise<ProductCompetitorMapping | undefined> {
    const [result] = await db
      .update(productCompetitorMappings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productCompetitorMappings.id, id))
      .returning();
    return result;
  }

  async deleteProductCompetitorMapping(id: number): Promise<boolean> {
    const result = await db
      .delete(productCompetitorMappings)
      .where(eq(productCompetitorMappings.id, id));
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

  // ProductPricingMaster methods (clean implementation without legacy code)


  // Customers
  async getCustomers(): Promise<Customer[]> {
    return await db.select(this.customerListFields).from(customers) as Customer[];
  }

  // List-only fields for customer list views (excludes notes, large text fields)
  private customerListFields = {
    id: customers.id,
    firstName: customers.firstName,
    lastName: customers.lastName,
    email: customers.email,
    company: customers.company,
    address1: customers.address1,
    city: customers.city,
    province: customers.province,
    zip: customers.zip,
    country: customers.country,
    phone: customers.phone,
    totalSpent: customers.totalSpent,
    totalOrders: customers.totalOrders,
    pricingTier: customers.pricingTier,
    salesRepId: customers.salesRepId,
    salesRepName: customers.salesRepName,
    isHotProspect: customers.isHotProspect,
    isCompany: customers.isCompany,
    contactType: customers.contactType,
    doNotContact: customers.doNotContact,
    customerType: customers.customerType,
    lastOutboundEmailAt: customers.lastOutboundEmailAt,
    sources: customers.sources,
    odooPartnerId: customers.odooPartnerId,
    parentCustomerId: customers.parentCustomerId,
    updatedAt: customers.updatedAt,
    createdAt: customers.createdAt,
  };

  async getCustomersPaginated(
    page: number, 
    limit: number, 
    search?: string,
    filters?: {
      salesRepId?: string;
      pricingTier?: string;
      province?: string;
      isHotProspect?: boolean;
      isCompany?: boolean;
      doNotContact?: boolean;
      city?: string;
      customerType?: string;
      hasAddress?: boolean;
      connectionStrength?: string;
      createdAfterDays?: number;
    }
  ): Promise<{ data: Partial<Customer>[]; total: number; page: number; limit: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    const conditions: any[] = [];
    
    // Build search condition - searches indexed fields for performance
    if (search) {
      const searchTerm = search.toLowerCase();
      conditions.push(sql`(
        ${customers.company} ILIKE ${'%' + searchTerm + '%'} OR
        ${customers.email} ILIKE ${'%' + searchTerm + '%'} OR
        ${customers.firstName} ILIKE ${'%' + searchTerm + '%'} OR
        ${customers.lastName} ILIKE ${'%' + searchTerm + '%'} OR
        ${customers.phone} ILIKE ${'%' + searchTerm + '%'} OR
        ${customers.website} ILIKE ${'%' + searchTerm + '%'} OR
        ${customers.city} ILIKE ${'%' + searchTerm + '%'} OR
        ${customers.id} ILIKE ${'%' + searchTerm + '%'} OR
        CONCAT(${customers.firstName}, ' ', ${customers.lastName}) ILIKE ${'%' + searchTerm + '%'}
      )`);
    }
    
    // Build filter conditions
    if (filters?.salesRepId) {
      conditions.push(eq(customers.salesRepId, filters.salesRepId));
    }
    if (filters?.pricingTier) {
      conditions.push(eq(customers.pricingTier, filters.pricingTier));
    }
    if (filters?.province) {
      // Match all DB variants via provinceVariants (array) or single value.
      // e.g. for "Florida": ["Florida","Florida (US)","Florida (CA)","FL","FL ","FL (US)"]
      const variants: string[] = (filters as any).provinceVariants ?? [filters.province];
      if (variants.length === 1) {
        conditions.push(ilike(customers.province, variants[0]));
      } else {
        conditions.push(or(...variants.map(v => ilike(customers.province, v)))!);
      }
    }
    if (filters?.isHotProspect !== undefined) {
      conditions.push(eq(customers.isHotProspect, filters.isHotProspect));
    }
    if (filters?.isCompany !== undefined) {
      conditions.push(eq(customers.isCompany, filters.isCompany));
    }
    if (filters?.doNotContact !== undefined) {
      conditions.push(eq(customers.doNotContact, filters.doNotContact));
    }
    if (filters?.city) {
      conditions.push(ilike(customers.city, filters.city));
    }
    if (filters?.customerType) {
      conditions.push(eq(customers.customerType, filters.customerType));
    }
    if (filters?.hasAddress === true) {
      conditions.push(sql`${customers.address1} IS NOT NULL AND ${customers.address1} <> ''`);
    }
    if (filters?.createdAfterDays) {
      const cutoff = new Date(Date.now() - filters.createdAfterDays * 86400000);
      conditions.push(sql`${customers.createdAt} >= ${cutoff}`);
    }
    if (filters?.connectionStrength) {
      const now = new Date();
      const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
      switch (filters.connectionStrength) {
        case 'very_strong':
          conditions.push(sql`${customers.lastOutboundEmailAt} >= ${daysAgo(30)}`);
          break;
        case 'strong':
          conditions.push(sql`${customers.lastOutboundEmailAt} >= ${daysAgo(90)} AND ${customers.lastOutboundEmailAt} < ${daysAgo(30)}`);
          break;
        case 'moderate':
          conditions.push(sql`${customers.lastOutboundEmailAt} >= ${daysAgo(180)} AND ${customers.lastOutboundEmailAt} < ${daysAgo(90)}`);
          break;
        case 'weak':
          conditions.push(sql`${customers.lastOutboundEmailAt} >= ${daysAgo(365)} AND ${customers.lastOutboundEmailAt} < ${daysAgo(180)}`);
          break;
        case 'cold':
          conditions.push(sql`(${customers.lastOutboundEmailAt} IS NULL OR ${customers.lastOutboundEmailAt} < ${daysAgo(365)})`);
          break;
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Count query
    const countQuery = whereClause 
      ? db.select({ count: sql<number>`count(*)` }).from(customers).where(whereClause)
      : db.select({ count: sql<number>`count(*)` }).from(customers);
    const [countResult] = await countQuery;
    const total = Number(countResult?.count) || 0;
    
    // Data query - only select list fields (lean payload)
    const dataQuery = whereClause
      ? db.select(this.customerListFields).from(customers).where(whereClause)
      : db.select(this.customerListFields).from(customers);
    
    const data = await dataQuery
      .orderBy(customers.company, customers.id)
      .limit(limit)
      .offset(offset);
    
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    return customer || undefined;
  }

  async getCustomerCount(): Promise<number> {
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM customers`);
    return parseInt(result.rows[0]?.count as string) || 0;
  }

  async getIdleAccountsCount(daysThreshold: number): Promise<number> {
    // Optimized single query: count customers with no activity events 
    // OR whose last activity is older than threshold days
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM customers c
      WHERE NOT EXISTS (
        SELECT 1 FROM customer_activity_events ae 
        WHERE ae.customer_id = c.id 
        AND (ae.event_date > NOW() - INTERVAL '${sql.raw(String(daysThreshold))} days'
             OR ae.created_at > NOW() - INTERVAL '${sql.raw(String(daysThreshold))} days')
      )
    `);
    return parseInt(result.rows[0]?.count as string) || 0;
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

  async bulkUpdateCustomerFields(customerIds: string[], fields: { pricingTier?: string; salesRepId?: string }): Promise<number> {
    if (customerIds.length === 0) return 0;
    
    const updateData: Partial<InsertCustomer> = {};
    if (fields.pricingTier !== undefined) {
      updateData.pricingTier = fields.pricingTier;
    }
    if (fields.salesRepId !== undefined) {
      updateData.salesRepId = fields.salesRepId;
    }
    
    if (Object.keys(updateData).length === 0) return 0;
    
    try {
      const result = await db
        .update(customers)
        .set(updateData)
        .where(inArray(customers.id, customerIds));
      
      console.log(`Bulk updated ${result.rowCount} customers with fields:`, Object.keys(updateData));
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in bulk update customers:', error);
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

  async getSentQuotesPaginated(page: number, limit: number, search?: string): Promise<{ data: SentQuote[]; total: number; page: number; limit: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    
    if (search) {
      const searchPattern = `%${search.toLowerCase()}%`;
      const searchCondition = or(
        ilike(sentQuotes.quoteNumber, searchPattern),
        ilike(sentQuotes.customerName, searchPattern),
        ilike(sentQuotes.customerEmail, searchPattern)
      );
      
      const [countResult] = await db.select({ count: sql<number>`count(*)` })
        .from(sentQuotes)
        .where(searchCondition);
      const total = Number(countResult?.count) || 0;
      
      const data = await db.select()
        .from(sentQuotes)
        .where(searchCondition)
        .orderBy(desc(sentQuotes.createdAt))
        .limit(limit)
        .offset(offset);
      
      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    }
    
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(sentQuotes);
    const total = Number(countResult?.count) || 0;
    
    const data = await db.select()
      .from(sentQuotes)
      .orderBy(desc(sentQuotes.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
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

  async updateSentQuote(id: number, data: Partial<InsertSentQuote>): Promise<SentQuote | undefined> {
    try {
      const [updated] = await db
        .update(sentQuotes)
        .set(data)
        .where(eq(sentQuotes.id, id))
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error('Error updating sent quote:', error);
      return undefined;
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

  async getHotLeadsCount(): Promise<number> {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .where(eq(customers.isHotProspect, true));
      return result.count || 0;
    } catch (error) {
      console.error("Error getting hot leads count:", error);
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

  // Press Kit Shipments
  async getPressKitShipments(customerId?: string): Promise<PressKitShipment[]> {
    if (customerId) {
      return await db.select().from(pressKitShipments).where(eq(pressKitShipments.customerId, customerId)).orderBy(desc(pressKitShipments.createdAt));
    }
    return await db.select().from(pressKitShipments).orderBy(desc(pressKitShipments.createdAt));
  }

  async getPressKitShipment(id: number): Promise<PressKitShipment | undefined> {
    const [shipment] = await db.select().from(pressKitShipments).where(eq(pressKitShipments.id, id));
    return shipment;
  }

  async createPressKitShipment(data: InsertPressKitShipment): Promise<PressKitShipment> {
    const [shipment] = await db.insert(pressKitShipments).values(data).returning();
    return shipment;
  }

  async updatePressKitShipment(id: number, data: Partial<InsertPressKitShipment>): Promise<PressKitShipment | undefined> {
    const [shipment] = await db.update(pressKitShipments).set(data).where(eq(pressKitShipments.id, id)).returning();
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

  async getPriceListCountsByCustomerId(): Promise<Record<string, number>> {
    const results = await db
      .select({
        customerId: priceListEvents.customerId,
        count: sql<number>`count(*)::int`
      })
      .from(priceListEvents)
      .where(sql`${priceListEvents.customerId} IS NOT NULL`)
      .groupBy(priceListEvents.customerId);
    
    const counts: Record<string, number> = {};
    for (const row of results) {
      if (row.customerId) {
        counts[row.customerId] = row.count;
      }
    }
    return counts;
  }

  async createPriceListEventItems(eventId: number, items: InsertPriceListEventItem[]): Promise<PriceListEventItem[]> {
    if (items.length === 0) return [];
    const itemsWithEventId = items.map(item => ({ ...item, eventId }));
    const inserted = await db.insert(priceListEventItems).values(itemsWithEventId).returning();
    return inserted;
  }

  async getLatestPriceListItemsForCustomer(customerId: string): Promise<{ event: PriceListEvent; items: PriceListEventItem[] } | null> {
    // Get the most recent price list event for this customer
    const events = await db.select()
      .from(priceListEvents)
      .where(eq(priceListEvents.customerId, customerId))
      .orderBy(desc(priceListEvents.createdAt))
      .limit(1);
    
    if (events.length === 0) return null;
    
    const event = events[0];
    
    // Get all items for this event
    const items = await db.select()
      .from(priceListEventItems)
      .where(eq(priceListEventItems.eventId, event.id));
    
    return { event, items };
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

  // Journey Templates
  async getJourneyTemplates(): Promise<JourneyTemplate[]> {
    return await db.select().from(journeyTemplates)
      .where(eq(journeyTemplates.isActive, true))
      .orderBy(desc(journeyTemplates.createdAt));
  }

  async getJourneyTemplate(id: number): Promise<JourneyTemplate | undefined> {
    const [template] = await db.select().from(journeyTemplates).where(eq(journeyTemplates.id, id));
    return template;
  }

  async getJourneyTemplateByKey(key: string): Promise<JourneyTemplate | undefined> {
    const [template] = await db.select().from(journeyTemplates).where(eq(journeyTemplates.key, key));
    return template;
  }

  async createJourneyTemplate(data: InsertJourneyTemplate): Promise<JourneyTemplate> {
    const [template] = await db.insert(journeyTemplates).values(data).returning();
    return template;
  }

  async updateJourneyTemplate(id: number, data: Partial<InsertJourneyTemplate>): Promise<JourneyTemplate | undefined> {
    const [template] = await db.update(journeyTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(journeyTemplates.id, id))
      .returning();
    return template;
  }

  async deleteJourneyTemplate(id: number): Promise<void> {
    await db.update(journeyTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(journeyTemplates.id, id));
  }

  // Journey Template Stages
  async getTemplateStages(templateId: number): Promise<JourneyTemplateStage[]> {
    return await db.select().from(journeyTemplateStages)
      .where(eq(journeyTemplateStages.templateId, templateId))
      .orderBy(journeyTemplateStages.position);
  }

  async createTemplateStage(data: InsertJourneyTemplateStage): Promise<JourneyTemplateStage> {
    const [stage] = await db.insert(journeyTemplateStages).values(data).returning();
    return stage;
  }

  async updateTemplateStage(id: number, data: Partial<InsertJourneyTemplateStage>): Promise<JourneyTemplateStage | undefined> {
    const [stage] = await db.update(journeyTemplateStages)
      .set(data)
      .where(eq(journeyTemplateStages.id, id))
      .returning();
    return stage;
  }

  async deleteTemplateStage(id: number): Promise<void> {
    await db.delete(journeyTemplateStages).where(eq(journeyTemplateStages.id, id));
  }

  async deleteAllTemplateStages(templateId: number): Promise<void> {
    await db.delete(journeyTemplateStages).where(eq(journeyTemplateStages.templateId, templateId));
  }

  // CRM Dashboard Stats - Optimized with parallel queries
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
    pendingFeedback: number;
    samplesWithTracking: number;
    swatchesWithTracking: number;
    hotProspects: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Execute all independent queries in parallel for better performance
    const [
      journeys,
      allQuotesResult,
      recentQuotesResult,
      allCustomersResult,
      recentCustomersResult,
      pendingSamplesResult,
      pendingSwatchesResult,
      allPressProfilesResult,
      samplesWithTrackingResult,
      swatchesWithTrackingResult,
      pendingFeedbackResult,
      hotProspectsResult,
    ] = await Promise.all([
      // Journey stage counts
      db.select().from(customerJourney),
      // Total quotes
      db.select({ count: sql<number>`count(*)` }).from(sentQuotes),
      // Quotes last 30 days
      db.select({ count: sql<number>`count(*)` }).from(sentQuotes)
        .where(gte(sentQuotes.createdAt, thirtyDaysAgo)),
      // Total customers
      db.select({ count: sql<number>`count(*)` }).from(customers),
      // New customers last 30 days
      db.select({ count: sql<number>`count(*)` }).from(customers)
        .where(gte(customers.createdAt, thirtyDaysAgo)),
      // Pending samples
      db.select({ count: sql<number>`count(*)` }).from(sampleRequests)
        .where(sql`${sampleRequests.status} IN ('pending', 'shipped', 'testing')`),
      // Pending swatches
      db.select({ count: sql<number>`count(*)` }).from(swatchBookShipments)
        .where(sql`${swatchBookShipments.status} IN ('pending', 'shipped')`),
      // Active press profiles
      db.select({ count: sql<number>`count(*)` }).from(pressProfiles),
      // Samples with tracking
      db.select({ count: sql<number>`count(*)` }).from(pressTestJourneyDetails)
        .where(isNotNull(pressTestJourneyDetails.trackingNumber)),
      // Swatches with tracking
      db.select({ count: sql<number>`count(*)` }).from(swatchBookShipments)
        .where(isNotNull(swatchBookShipments.trackingNumber)),
      // Pending feedback
      db.select({ count: sql<number>`count(*)` })
        .from(pressTestJourneyDetails)
        .innerJoin(customerJourneyInstances, eq(pressTestJourneyDetails.instanceId, customerJourneyInstances.id))
        .where(
          and(
            eq(customerJourneyInstances.journeyType, 'press_test'),
            eq(customerJourneyInstances.status, 'in_progress'),
            or(
              isNotNull(pressTestJourneyDetails.trackingNumber),
              isNotNull(pressTestJourneyDetails.receivedAt)
            ),
            isNull(pressTestJourneyDetails.result)
          )
        ),
      // Hot prospects count
      db.select({ count: sql<number>`count(*)` }).from(customers)
        .where(eq(customers.isHotProspect, true)),
    ]);

    // Process journey stage counts
    const stageCountsMap: Record<string, number> = {};
    const stages = ['trigger', 'internal_alarm', 'supplier_pushback', 'pilot_alignment', 'controlled_trial', 'validation_proof', 'conversion'];
    stages.forEach(s => stageCountsMap[s] = 0);
    journeys.forEach(j => {
      if (j.journeyStage && stageCountsMap[j.journeyStage] !== undefined) {
        stageCountsMap[j.journeyStage]++;
      }
    });
    const stageCounts = stages.map(stage => ({ stage, count: stageCountsMap[stage] }));

    return {
      stageCounts,
      totalActiveJourneys: journeys.length,
      totalQuotesSent: Number(allQuotesResult[0]?.count) || 0,
      quotesLast30Days: Number(recentQuotesResult[0]?.count) || 0,
      totalCustomers: Number(allCustomersResult[0]?.count) || 0,
      newCustomersLast30Days: Number(recentCustomersResult[0]?.count) || 0,
      pendingSamples: Number(pendingSamplesResult[0]?.count) || 0,
      pendingSwatches: Number(pendingSwatchesResult[0]?.count) || 0,
      activePressProfiles: Number(allPressProfilesResult[0]?.count) || 0,
      pendingFeedback: Number(pendingFeedbackResult[0]?.count) || 0,
      samplesWithTracking: Number(samplesWithTrackingResult[0]?.count) || 0,
      swatchesWithTracking: Number(swatchesWithTrackingResult[0]?.count) || 0,
      hotProspects: Number(hotProspectsResult[0]?.count) || 0,
    };
  }

  // ========================================
  // Customer Activity System Implementation
  // ========================================

  // Customer Activity Events
  async createActivityEvent(data: InsertCustomerActivityEvent): Promise<CustomerActivityEvent> {
    const [event] = await db.insert(customerActivityEvents).values(data).returning();
    return event;
  }

  async getActivityEventsByCustomer(customerId: string): Promise<CustomerActivityEvent[]> {
    return await db
      .select()
      .from(customerActivityEvents)
      .where(eq(customerActivityEvents.customerId, customerId))
      .orderBy(desc(customerActivityEvents.eventDate));
  }

  async getRecentActivityEvents(limit: number = 50): Promise<CustomerActivityEvent[]> {
    return await db
      .select()
      .from(customerActivityEvents)
      .orderBy(desc(customerActivityEvents.eventDate))
      .limit(limit);
  }

  // Follow-up Tasks
  async createFollowUpTask(data: InsertFollowUpTask): Promise<FollowUpTask> {
    // Auto-assign to customer's sales rep if not specified
    let taskData = { ...data };
    
    if (!taskData.assignedTo && taskData.customerId) {
      try {
        const [customer] = await db.select().from(customers).where(eq(customers.id, taskData.customerId));
        if (customer?.salesRepId) {
          taskData.assignedTo = customer.salesRepId;
          taskData.assignedToName = customer.salesRepName || undefined;
        }
      } catch (error) {
        console.warn('[Task] Failed to lookup customer for auto-assign:', error);
      }
    }
    
    const [task] = await db.insert(followUpTasks).values(taskData).returning();
    
    // Create Google Calendar event asynchronously (don't block task creation)
    this.createCalendarEventForTask(task).catch(err => {
      console.warn('[Task] Failed to create calendar event:', err);
    });
    
    return task;
  }
  
  private async createCalendarEventForTask(task: FollowUpTask): Promise<void> {
    try {
      const { createCalendarEvent } = await import('./calendar-client');
      
      // Get customer/lead name for the calendar event
      let customerName = 'Unknown';
      try {
        if (task.customerId) {
          const [customer] = await db.select().from(customers).where(eq(customers.id, task.customerId));
          if (customer) {
            customerName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer';
          }
        } else if (task.leadId) {
          const [lead] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, task.leadId));
          if (lead) customerName = lead.name || 'Lead';
        }
      } catch (e) {
        console.warn('[Calendar] Failed to get record name:', e);
      }
      
      const eventId = await createCalendarEvent({
        title: task.title,
        description: task.description || undefined,
        dueDate: task.dueDate,
        customerId: task.customerId,
        customerName,
        taskType: task.taskType,
      });
      
      if (eventId) {
        // Update task with calendar event ID
        await db.update(followUpTasks)
          .set({ calendarEventId: eventId, updatedAt: new Date() })
          .where(eq(followUpTasks.id, task.id));
        console.log(`[Task] Calendar event ${eventId} created for task ${task.id}`);
      }
    } catch (error) {
      console.warn('[Task] Calendar sync failed:', error);
    }
  }

  async getFollowUpTasksByCustomer(customerId: string): Promise<FollowUpTask[]> {
    return await db
      .select()
      .from(followUpTasks)
      .where(eq(followUpTasks.customerId, customerId))
      .orderBy(desc(followUpTasks.dueDate));
  }

  async getPendingFollowUpTasks(): Promise<FollowUpTask[]> {
    return await db
      .select()
      .from(followUpTasks)
      .where(eq(followUpTasks.status, 'pending'))
      .orderBy(followUpTasks.dueDate);
  }

  async updateFollowUpTask(id: number, data: Partial<InsertFollowUpTask>): Promise<FollowUpTask | undefined> {
    const [task] = await db
      .update(followUpTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(followUpTasks.id, id))
      .returning();
    return task;
  }

  async completeFollowUpTask(id: number, completedBy: string, notes?: string): Promise<FollowUpTask | undefined> {
    // Get the task first to check for calendar event
    const [existingTask] = await db.select().from(followUpTasks).where(eq(followUpTasks.id, id));
    
    const [task] = await db
      .update(followUpTasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        completedBy,
        completionNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(followUpTasks.id, id))
      .returning();
    
    // Delete calendar event if it exists
    if (existingTask?.calendarEventId) {
      this.deleteCalendarEventForTask(existingTask.calendarEventId).catch(err => {
        console.warn('[Task] Failed to delete calendar event:', err);
      });
    }
    
    return task;
  }
  
  private async deleteCalendarEventForTask(eventId: string): Promise<void> {
    try {
      const { deleteCalendarEvent } = await import('./calendar-client');
      await deleteCalendarEvent(eventId);
      console.log(`[Task] Calendar event ${eventId} deleted`);
    } catch (error) {
      console.warn('[Task] Calendar event deletion failed:', error);
    }
  }

  async getOverdueFollowUpTasks(): Promise<FollowUpTask[]> {
    const now = new Date();
    return await db
      .select()
      .from(followUpTasks)
      .where(
        and(
          eq(followUpTasks.status, 'pending'),
          sql`${followUpTasks.dueDate} < ${now}`
        )
      )
      .orderBy(followUpTasks.dueDate);
  }

  async getTodayFollowUpTasks(): Promise<FollowUpTask[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    return await db
      .select()
      .from(followUpTasks)
      .where(
        and(
          eq(followUpTasks.status, 'pending'),
          sql`${followUpTasks.dueDate} >= ${todayStart}`,
          sql`${followUpTasks.dueDate} <= ${todayEnd}`
        )
      )
      .orderBy(followUpTasks.dueDate);
  }

  // Product Exposure
  async createProductExposure(data: InsertProductExposureLog): Promise<ProductExposureLog> {
    const [exposure] = await db.insert(productExposureLog).values(data).returning();
    return exposure;
  }

  async getProductExposureByCustomer(customerId: string): Promise<ProductExposureLog[]> {
    return await db
      .select()
      .from(productExposureLog)
      .where(eq(productExposureLog.customerId, customerId))
      .orderBy(desc(productExposureLog.createdAt));
  }

  // Engagement Summary
  async getEngagementSummary(customerId: string): Promise<CustomerEngagementSummary | undefined> {
    const [summary] = await db
      .select()
      .from(customerEngagementSummary)
      .where(eq(customerEngagementSummary.customerId, customerId));
    return summary;
  }

  async updateEngagementSummary(customerId: string, data: Partial<InsertCustomerEngagementSummary>): Promise<CustomerEngagementSummary | undefined> {
    const existing = await this.getEngagementSummary(customerId);
    
    if (existing) {
      const [summary] = await db
        .update(customerEngagementSummary)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(customerEngagementSummary.customerId, customerId))
        .returning();
      return summary;
    } else {
      const [summary] = await db
        .insert(customerEngagementSummary)
        .values({ customerId, ...data } as any)
        .returning();
      return summary;
    }
  }

  // Follow-up Config
  async getFollowUpConfig(): Promise<FollowUpConfig[]> {
    return await db.select().from(followUpConfig).orderBy(followUpConfig.eventType);
  }

  async updateFollowUpConfig(eventType: string, data: Partial<InsertFollowUpConfig>): Promise<FollowUpConfig | undefined> {
    const [existing] = await db
      .select()
      .from(followUpConfig)
      .where(eq(followUpConfig.eventType, eventType));
    
    if (existing) {
      const [config] = await db
        .update(followUpConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(followUpConfig.eventType, eventType))
        .returning();
      return config;
    } else {
      const [config] = await db
        .insert(followUpConfig)
        .values({ eventType, ...data } as any)
        .returning();
      return config;
    }
  }

  async initDefaultFollowUpConfig(): Promise<void> {
    const defaultConfigs = [
      { eventType: 'quote_sent', isEnabled: true, defaultDelayDays: 3, defaultPriority: 'normal', taskTitle: 'Follow up on sent quote' },
      { eventType: 'sample_shipped', isEnabled: true, defaultDelayDays: 7, defaultPriority: 'normal', taskTitle: 'Check if sample was received' },
      { eventType: 'sample_delivered', isEnabled: true, defaultDelayDays: 3, defaultPriority: 'high', taskTitle: 'Get feedback on sample' },
      { eventType: 'price_list_sent', isEnabled: true, defaultDelayDays: 5, defaultPriority: 'normal', taskTitle: 'Follow up on price list' },
    ];

    // Batch fetch existing configs to avoid N+1 queries
    const existingConfigs = await db.select().from(followUpConfig);
    const existingEventTypes = new Set(existingConfigs.map(c => c.eventType));
    
    // Filter to only insert missing configs
    const configsToInsert = defaultConfigs.filter(c => !existingEventTypes.has(c.eventType));
    
    if (configsToInsert.length > 0) {
      await db.insert(followUpConfig).values(configsToInsert);
    }
  }

  // ========================================
  // Tutorial Progress Implementation
  // ========================================

  async getUserTutorialProgress(userEmail: string): Promise<UserTutorialProgress[]> {
    return await db
      .select()
      .from(userTutorialProgress)
      .where(eq(userTutorialProgress.userEmail, userEmail))
      .orderBy(userTutorialProgress.tutorialId);
  }

  async getTutorialProgress(userEmail: string, tutorialId: string): Promise<UserTutorialProgress | undefined> {
    const [progress] = await db
      .select()
      .from(userTutorialProgress)
      .where(
        and(
          eq(userTutorialProgress.userEmail, userEmail),
          eq(userTutorialProgress.tutorialId, tutorialId)
        )
      );
    return progress;
  }

  async createTutorialProgress(data: InsertUserTutorialProgress): Promise<UserTutorialProgress> {
    const [progress] = await db.insert(userTutorialProgress).values(data).returning();
    return progress;
  }

  async updateTutorialProgress(userEmail: string, tutorialId: string, data: Partial<InsertUserTutorialProgress>): Promise<UserTutorialProgress | undefined> {
    const [progress] = await db
      .update(userTutorialProgress)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(userTutorialProgress.userEmail, userEmail),
          eq(userTutorialProgress.tutorialId, tutorialId)
        )
      )
      .returning();
    return progress;
  }

  // ========================================
  // Email Templates Implementation
  // ========================================

  async getEmailTemplates(): Promise<EmailTemplate[]> {
    return await db
      .select()
      .from(emailTemplates)
      .orderBy(emailTemplates.name);
  }

  async getEmailTemplate(id: number): Promise<EmailTemplate | undefined> {
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, id));
    return template;
  }

  async createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const [template] = await db.insert(emailTemplates).values(data).returning();
    return template;
  }

  async updateEmailTemplate(id: number, data: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined> {
    const [template] = await db
      .update(emailTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return template;
  }

  async deleteEmailTemplate(id: number): Promise<void> {
    await db.update(emailSends).set({ templateId: null }).where(eq(emailSends.templateId, id));
    await db.update(dripCampaignSteps).set({ templateId: null }).where(eq(dripCampaignSteps.templateId, id));
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  // ========================================
  // Label Queue Implementation
  // ========================================

  async getLabelQueue(): Promise<LabelQueueItem[]> {
    return await db.select().from(labelQueue).orderBy(labelQueue.addedAt);
  }

  async addToLabelQueue(customerId: string | null, leadId: number | null, addedBy: string): Promise<LabelQueueItem> {
    // Prevent duplicates — if this customer/lead is already in the queue, return the existing entry
    const existing = await db
      .select()
      .from(labelQueue)
      .where(
        customerId
          ? eq(labelQueue.customerId, customerId)
          : eq(labelQueue.leadId, leadId!)
      )
      .limit(1);
    if (existing.length > 0) return existing[0];

    const [item] = await db.insert(labelQueue).values({ customerId, leadId, addedBy }).returning();
    return item;
  }

  async removeFromLabelQueue(id: number): Promise<void> {
    await db.delete(labelQueue).where(eq(labelQueue.id, id));
  }

  async clearLabelQueue(): Promise<void> {
    await db.delete(labelQueue);
  }

  // ========================================
  // Email Sends Implementation
  // ========================================

  async getEmailSends(customerId?: string): Promise<EmailSend[]> {
    if (customerId) {
      return await db
        .select()
        .from(emailSends)
        .where(eq(emailSends.customerId, customerId))
        .orderBy(desc(emailSends.sentAt));
    }
    return await db
      .select()
      .from(emailSends)
      .orderBy(desc(emailSends.sentAt));
  }

  async createEmailSend(data: InsertEmailSend): Promise<EmailSend> {
    const [send] = await db.insert(emailSends).values(data).returning();
    return send;
  }

  // ========================================
  // Email Tracking Implementation
  // ========================================

  async createEmailTrackingToken(data: InsertEmailTrackingToken): Promise<EmailTrackingToken> {
    const [token] = await db.insert(emailTrackingTokens).values(data).returning();
    return token;
  }

  async getEmailTrackingTokenByToken(token: string): Promise<EmailTrackingToken | undefined> {
    const [result] = await db
      .select()
      .from(emailTrackingTokens)
      .where(eq(emailTrackingTokens.token, token));
    return result;
  }

  async getEmailTrackingTokensByCustomer(customerId: string): Promise<EmailTrackingToken[]> {
    return await db
      .select()
      .from(emailTrackingTokens)
      .where(eq(emailTrackingTokens.customerId, customerId))
      .orderBy(desc(emailTrackingTokens.createdAt));
  }

  async recordEmailOpenEvent(tokenId: number, ipAddress?: string, userAgent?: string): Promise<EmailTrackingEvent> {
    // Create the event
    const [event] = await db.insert(emailTrackingEvents).values({
      tokenId,
      eventType: 'open',
      ipAddress,
      userAgent,
    }).returning();

    // Update the token's open count and timestamps
    const now = new Date();
    await db
      .update(emailTrackingTokens)
      .set({
        openCount: sql`${emailTrackingTokens.openCount} + 1`,
        firstOpenedAt: sql`COALESCE(${emailTrackingTokens.firstOpenedAt}, ${now})`,
        lastOpenedAt: now,
      })
      .where(eq(emailTrackingTokens.id, tokenId));

    return event;
  }

  async recordEmailClickEvent(tokenId: number, linkUrl: string, linkText?: string, ipAddress?: string, userAgent?: string): Promise<EmailTrackingEvent> {
    // Create the event
    const [event] = await db.insert(emailTrackingEvents).values({
      tokenId,
      eventType: 'click',
      linkUrl,
      linkText,
      ipAddress,
      userAgent,
    }).returning();

    // Update the token's click count
    await db
      .update(emailTrackingTokens)
      .set({
        clickCount: sql`${emailTrackingTokens.clickCount} + 1`,
      })
      .where(eq(emailTrackingTokens.id, tokenId));

    return event;
  }

  async getEmailTrackingEventsByToken(tokenId: number): Promise<EmailTrackingEvent[]> {
    return await db
      .select()
      .from(emailTrackingEvents)
      .where(eq(emailTrackingEvents.tokenId, tokenId))
      .orderBy(desc(emailTrackingEvents.createdAt));
  }

  // ========================================
  // Email Signatures Implementation
  // ========================================

  async getEmailSignature(userId: string): Promise<EmailSignature | undefined> {
    const [signature] = await db
      .select()
      .from(emailSignatures)
      .where(eq(emailSignatures.userId, userId));
    return signature;
  }

  async createEmailSignature(data: InsertEmailSignature): Promise<EmailSignature> {
    const [signature] = await db.insert(emailSignatures).values(data).returning();
    return signature;
  }

  async updateEmailSignature(userId: string, data: Partial<InsertEmailSignature>): Promise<EmailSignature | undefined> {
    const [signature] = await db
      .update(emailSignatures)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailSignatures.userId, userId))
      .returning();
    return signature;
  }

  async deleteEmailSignature(userId: string): Promise<void> {
    await db.delete(emailSignatures).where(eq(emailSignatures.userId, userId));
  }

  // ========================================
  // Admin Categories & Catalog System Implementation
  // ========================================

  // Alias for pricing master items - used by routes-pricing-database
  async getAllPricingMasterItems(): Promise<ProductPricingMaster[]> {
    return await db.select().from(productPricingMaster).orderBy(productPricingMaster.sortOrder, productPricingMaster.id);
  }

  async getAllAdminMachineTypes(): Promise<{ id: number; code: string; label: string; icon?: string | null; sortOrder: number | null }[]> {
    const { adminMachineTypes } = await import("@shared/schema");
    return await db.select().from(adminMachineTypes).orderBy(adminMachineTypes.sortOrder);
  }

  async getAllAdminCategoryGroups(): Promise<{ id: number; code: string; label: string; sortOrder: number | null }[]> {
    const { adminCategoryGroups } = await import("@shared/schema");
    return await db.select().from(adminCategoryGroups).orderBy(adminCategoryGroups.sortOrder);
  }

  async getAllAdminCategories(): Promise<AdminCategory[]> {
    return await db.select().from(adminCategories).orderBy(adminCategories.sortOrder);
  }

  async getAdminCategory(id: number): Promise<AdminCategory | undefined> {
    const [category] = await db.select().from(adminCategories).where(eq(adminCategories.id, id));
    return category;
  }

  async getAdminCategoryByCode(code: string): Promise<AdminCategory | undefined> {
    const [category] = await db.select().from(adminCategories).where(eq(adminCategories.code, code));
    return category;
  }

  async createAdminCategory(data: InsertAdminCategory): Promise<AdminCategory> {
    const [category] = await db.insert(adminCategories).values(data).returning();
    return category;
  }

  async updateAdminCategory(id: number, data: Partial<InsertAdminCategory>): Promise<AdminCategory | undefined> {
    const [category] = await db
      .update(adminCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminCategories.id, id))
      .returning();
    return category;
  }

  // Catalog Product Types
  async getAllCatalogProductTypes(): Promise<CatalogProductType[]> {
    return await db.select().from(catalogProductTypes).orderBy(catalogProductTypes.sortOrder);
  }

  async getCatalogProductType(id: number): Promise<CatalogProductType | undefined> {
    const [type] = await db.select().from(catalogProductTypes).where(eq(catalogProductTypes.id, id));
    return type;
  }

  async getCatalogProductTypeByCode(code: string): Promise<CatalogProductType | undefined> {
    const [type] = await db.select().from(catalogProductTypes).where(eq(catalogProductTypes.code, code));
    return type;
  }

  async getCatalogProductTypesByCategory(categoryId: number): Promise<CatalogProductType[]> {
    return await db
      .select()
      .from(catalogProductTypes)
      .where(eq(catalogProductTypes.categoryId, categoryId))
      .orderBy(catalogProductTypes.sortOrder);
  }

  async createCatalogProductType(data: InsertCatalogProductType): Promise<CatalogProductType> {
    const [type] = await db.insert(catalogProductTypes).values(data).returning();
    return type;
  }

  async updateCatalogProductType(id: number, data: Partial<InsertCatalogProductType>): Promise<CatalogProductType | undefined> {
    const [type] = await db
      .update(catalogProductTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(catalogProductTypes.id, id))
      .returning();
    return type;
  }

  // Catalog Import Logs
  async getCatalogImportLogs(): Promise<CatalogImportLog[]> {
    return await db.select().from(catalogImportLogs).orderBy(desc(catalogImportLogs.createdAt));
  }

  async createCatalogImportLog(data: InsertCatalogImportLog): Promise<CatalogImportLog> {
    const [log] = await db.insert(catalogImportLogs).values(data).returning();
    return log;
  }

  async updateCatalogImportLog(id: number, data: Partial<InsertCatalogImportLog>): Promise<CatalogImportLog | undefined> {
    const [log] = await db
      .update(catalogImportLogs)
      .set(data)
      .where(eq(catalogImportLogs.id, id))
      .returning();
    return log;
  }

  // Category Trust
  async getAllCategoryTrust(): Promise<CategoryTrust[]> {
    return await db.select().from(categoryTrust).orderBy(desc(categoryTrust.updatedAt));
  }

  // Shopify Unmapped Items
  async getShopifyUnmappedItems(status?: string): Promise<ShopifyUnmappedItem[]> {
    if (status) {
      return await db
        .select()
        .from(shopifyUnmappedItems)
        .where(eq(shopifyUnmappedItems.status, status))
        .orderBy(desc(shopifyUnmappedItems.createdAt));
    }
    return await db.select().from(shopifyUnmappedItems).orderBy(desc(shopifyUnmappedItems.createdAt));
  }

  async createShopifyUnmappedItem(data: InsertShopifyUnmappedItem): Promise<ShopifyUnmappedItem> {
    const [item] = await db.insert(shopifyUnmappedItems).values(data).returning();
    return item;
  }

  async resolveShopifyUnmappedItem(
    id: number,
    categoryId: number | null,
    productTypeId: number | null,
    itemCode: string | null,
    resolvedBy: string
  ): Promise<ShopifyUnmappedItem | undefined> {
    const [item] = await db
      .update(shopifyUnmappedItems)
      .set({
        resolvedCategoryId: categoryId,
        resolvedProductTypeId: productTypeId,
        resolvedItemCode: itemCode,
        resolvedBy,
        resolvedAt: new Date(),
        status: 'resolved',
        updatedAt: new Date()
      })
      .where(eq(shopifyUnmappedItems.id, id))
      .returning();
    return item;
  }

  // Admin SKU Mappings
  async getAllAdminSkuMappings(): Promise<AdminSkuMapping[]> {
    return await db.select().from(adminSkuMappings).orderBy(desc(adminSkuMappings.priority));
  }

  async createAdminSkuMapping(data: InsertAdminSkuMapping): Promise<AdminSkuMapping> {
    const [mapping] = await db.insert(adminSkuMappings).values(data).returning();
    return mapping;
  }

  // Catalog Links Update
  async updateProductPricingMasterCatalogLinks(
    itemCode: string,
    categoryId: number,
    productTypeId: number
  ): Promise<void> {
    await db
      .update(productPricingMaster)
      .set({
        catalogCategoryId: categoryId,
        catalogProductTypeId: productTypeId,
        updatedAt: new Date()
      })
      .where(eq(productPricingMaster.itemCode, itemCode));
  }

  // ========================================
  // Drip Campaign Implementation
  // ========================================

  async getDripCampaigns(): Promise<DripCampaign[]> {
    return await db.select().from(dripCampaigns).orderBy(desc(dripCampaigns.createdAt));
  }

  async getDripCampaign(id: number): Promise<DripCampaign | undefined> {
    const [campaign] = await db.select().from(dripCampaigns).where(eq(dripCampaigns.id, id));
    return campaign;
  }

  async createDripCampaign(data: InsertDripCampaign): Promise<DripCampaign> {
    const [campaign] = await db.insert(dripCampaigns).values(data).returning();
    return campaign;
  }

  async updateDripCampaign(id: number, data: Partial<InsertDripCampaign>): Promise<DripCampaign | undefined> {
    const [campaign] = await db
      .update(dripCampaigns)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dripCampaigns.id, id))
      .returning();
    return campaign;
  }

  async deleteDripCampaign(id: number): Promise<void> {
    await db.delete(dripCampaigns).where(eq(dripCampaigns.id, id));
  }

  // Drip Campaign Steps
  async getDripCampaignSteps(campaignId: number): Promise<DripCampaignStep[]> {
    return await db
      .select()
      .from(dripCampaignSteps)
      .where(eq(dripCampaignSteps.campaignId, campaignId))
      .orderBy(dripCampaignSteps.stepOrder);
  }

  async getDripCampaignStep(id: number): Promise<DripCampaignStep | undefined> {
    const [step] = await db.select().from(dripCampaignSteps).where(eq(dripCampaignSteps.id, id));
    return step;
  }

  async createDripCampaignStep(data: InsertDripCampaignStep): Promise<DripCampaignStep> {
    const [step] = await db.insert(dripCampaignSteps).values(data).returning();
    return step;
  }

  async updateDripCampaignStep(id: number, data: Partial<InsertDripCampaignStep>): Promise<DripCampaignStep | undefined> {
    const [step] = await db
      .update(dripCampaignSteps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dripCampaignSteps.id, id))
      .returning();
    return step;
  }

  async deleteDripCampaignStep(id: number): Promise<void> {
    await db.delete(dripCampaignSteps).where(eq(dripCampaignSteps.id, id));
  }

  async reorderDripCampaignSteps(campaignId: number, stepIds: number[]): Promise<void> {
    for (let i = 0; i < stepIds.length; i++) {
      await db
        .update(dripCampaignSteps)
        .set({ stepOrder: i + 1, updatedAt: new Date() })
        .where(and(eq(dripCampaignSteps.id, stepIds[i]), eq(dripCampaignSteps.campaignId, campaignId)));
    }
  }

  // Drip Campaign Assignments
  async getDripCampaignAssignments(campaignId?: number, customerId?: string, leadId?: number): Promise<DripCampaignAssignment[]> {
    const conditions: any[] = [];
    if (campaignId) conditions.push(eq(dripCampaignAssignments.campaignId, campaignId));
    if (customerId) conditions.push(eq(dripCampaignAssignments.customerId, customerId));
    if (leadId) conditions.push(eq(dripCampaignAssignments.leadId, leadId));
    
    if (conditions.length > 0) {
      return await db.select().from(dripCampaignAssignments)
        .where(and(...conditions))
        .orderBy(desc(dripCampaignAssignments.createdAt));
    }
    return await db.select().from(dripCampaignAssignments).orderBy(desc(dripCampaignAssignments.createdAt));
  }

  async getDripCampaignAssignment(id: number): Promise<DripCampaignAssignment | undefined> {
    const [assignment] = await db.select().from(dripCampaignAssignments).where(eq(dripCampaignAssignments.id, id));
    return assignment;
  }

  async getDripCampaignAssignmentCounts(): Promise<{ campaignId: number; count: number }[]> {
    const result = await db
      .select({
        campaignId: dripCampaignAssignments.campaignId,
        count: sql<number>`count(*)::int`,
      })
      .from(dripCampaignAssignments)
      .groupBy(dripCampaignAssignments.campaignId);
    return result;
  }

  async createDripCampaignAssignment(data: InsertDripCampaignAssignment): Promise<DripCampaignAssignment> {
    const [assignment] = await db.insert(dripCampaignAssignments).values(data).returning();
    return assignment;
  }

  async bulkCreateDripCampaignAssignments(data: InsertDripCampaignAssignment[]): Promise<DripCampaignAssignment[]> {
    if (data.length === 0) return [];
    const CHUNK = 200;
    const results: DripCampaignAssignment[] = [];
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      const rows = await db.insert(dripCampaignAssignments).values(chunk).returning();
      results.push(...rows);
    }
    return results;
  }

  async getActiveAssignmentsForCampaign(campaignId: number, customerIds: string[], leadIds: number[]): Promise<DripCampaignAssignment[]> {
    const conditions: any[] = [
      eq(dripCampaignAssignments.campaignId, campaignId),
      eq(dripCampaignAssignments.status, 'active'),
    ];
    const orParts: any[] = [];
    if (customerIds.length > 0) orParts.push(inArray(dripCampaignAssignments.customerId, customerIds));
    if (leadIds.length > 0) orParts.push(inArray(dripCampaignAssignments.leadId, leadIds));
    if (orParts.length > 0) conditions.push(or(...orParts));
    return await db.select().from(dripCampaignAssignments).where(and(...conditions));
  }

  async updateDripCampaignAssignment(id: number, data: Partial<InsertDripCampaignAssignment>): Promise<DripCampaignAssignment | undefined> {
    const [assignment] = await db
      .update(dripCampaignAssignments)
      .set(data)
      .where(eq(dripCampaignAssignments.id, id))
      .returning();
    return assignment;
  }

  // Drip Campaign Step Status
  async getDripCampaignStepStatuses(assignmentId: number): Promise<DripCampaignStepStatus[]> {
    return await db
      .select()
      .from(dripCampaignStepStatus)
      .where(eq(dripCampaignStepStatus.assignmentId, assignmentId))
      .orderBy(dripCampaignStepStatus.scheduledFor);
  }

  async getScheduledDripEmails(): Promise<DripCampaignStepStatus[]> {
    const now = new Date();
    return await db
      .select()
      .from(dripCampaignStepStatus)
      .where(and(
        eq(dripCampaignStepStatus.status, 'scheduled'),
        sql`${dripCampaignStepStatus.scheduledFor} <= ${now}`
      ))
      .orderBy(dripCampaignStepStatus.scheduledFor);
  }

  async createDripCampaignStepStatus(data: InsertDripCampaignStepStatus): Promise<DripCampaignStepStatus> {
    const [status] = await db.insert(dripCampaignStepStatus).values(data).returning();
    return status;
  }

  async bulkCreateDripCampaignStepStatuses(data: InsertDripCampaignStepStatus[]): Promise<void> {
    if (data.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < data.length; i += CHUNK) {
      await db.insert(dripCampaignStepStatus).values(data.slice(i, i + CHUNK));
    }
  }

  async updateDripCampaignStepStatus(id: number, data: Partial<InsertDripCampaignStepStatus>): Promise<DripCampaignStepStatus | undefined> {
    const [status] = await db
      .update(dripCampaignStepStatus)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dripCampaignStepStatus.id, id))
      .returning();
    return status;
  }

  // Media Uploads
  async getMediaUploads(): Promise<MediaUpload[]> {
    return await db.select().from(mediaUploads).orderBy(desc(mediaUploads.createdAt));
  }

  async createMediaUpload(data: InsertMediaUpload): Promise<MediaUpload> {
    const [upload] = await db.insert(mediaUploads).values(data).returning();
    return upload;
  }

  async deleteMediaUpload(id: number): Promise<void> {
    await db.delete(mediaUploads).where(eq(mediaUploads.id, id));
  }

  // ========================================
  // Now Mode Coaching Moments
  // ========================================

  async getCurrentMoment(userId: string): Promise<CoachingMoment | undefined> {
    const now = new Date();
    const [moment] = await db
      .select()
      .from(coachingMoments)
      .where(and(
        eq(coachingMoments.assignedTo, userId),
        eq(coachingMoments.status, 'pending'),
        sql`${coachingMoments.scheduledFor} <= ${now}`
      ))
      .orderBy(desc(coachingMoments.priority), coachingMoments.scheduledFor)
      .limit(1);
    return moment;
  }

  async getMomentsForUser(userId: string, status?: string): Promise<CoachingMoment[]> {
    if (status) {
      return await db
        .select()
        .from(coachingMoments)
        .where(and(
          eq(coachingMoments.assignedTo, userId),
          eq(coachingMoments.status, status)
        ))
        .orderBy(desc(coachingMoments.priority), coachingMoments.scheduledFor);
    }
    return await db
      .select()
      .from(coachingMoments)
      .where(eq(coachingMoments.assignedTo, userId))
      .orderBy(desc(coachingMoments.priority), coachingMoments.scheduledFor);
  }

  async createCoachingMoment(data: InsertCoachingMoment): Promise<CoachingMoment> {
    const [moment] = await db.insert(coachingMoments).values(data).returning();
    return moment;
  }

  async completeMoment(id: number, outcome: string, notes?: string): Promise<CoachingMoment | undefined> {
    const [moment] = await db
      .update(coachingMoments)
      .set({
        status: 'completed',
        outcome,
        outcomeNotes: notes,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coachingMoments.id, id))
      .returning();
    return moment;
  }

  async generateMomentsForUser(userId: string): Promise<CoachingMoment[]> {
    const pendingMoments = await db
      .select()
      .from(coachingMoments)
      .where(and(
        eq(coachingMoments.assignedTo, userId),
        eq(coachingMoments.status, 'pending')
      ));
    
    const slotsNeeded = targetTasks - stats.completed - pendingMoments.length;
    if (slotsNeeded <= 0) {
      return pendingMoments;
    }
    
    const newMoments: CoachingMoment[] = [];
    
    // Priority 1: Customers missing pricing tier, sales rep, or primary email
    const customersNeedingData = await db
      .select()
      .from(customers)
      .where(or(
        isNull(customers.pricingTier),
        isNull(customers.assignedSalesRep),
        isNull(customers.email)
      ))
      .limit(Math.min(2, slotsNeeded));
    
    for (const customer of customersNeedingData) {
      if (newMoments.length >= slotsNeeded) break;
      const [moment] = await db.insert(coachingMoments).values({
        customerId: customer.id,
        assignedTo: userId,
        action: 'update_customer_data',
        whyNow: `Missing: ${!customer.pricingTier ? 'Pricing Tier' : ''} ${!customer.assignedSalesRep ? 'Sales Rep' : ''} ${!customer.email ? 'Email' : ''}`.trim(),
        priority: 100, // Highest priority
        scheduledFor: new Date(),
        status: 'pending',
        sourceType: 'now_mode_generated',
      }).returning();
      newMoments.push(moment);
    }
    
    // Priority 2: Customers with missing address or email info
    if (newMoments.length < slotsNeeded) {
      const customersNeedingSync = await db
        .select()
        .from(customers)
        .where(and(
          isNotNull(customers.email),
          or(
            isNull(customers.address1),
            isNull(customers.city),
            sql`${customers.phone} IS NULL OR ${customers.phone} = ''`
          )
        ))
        .limit(Math.min(2, slotsNeeded - newMoments.length));
      
      for (const customer of customersNeedingSync) {
        if (newMoments.length >= slotsNeeded) break;
        const [moment] = await db.insert(coachingMoments).values({
          customerId: customer.id,
          assignedTo: userId,
          action: 'sync_address_email',
          whyNow: `Missing: ${!customer.address1 ? 'Address' : ''} ${!customer.phone ? 'Phone' : ''}`.trim(),
          priority: 90,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'now_mode_generated',
        }).returning();
        newMoments.push(moment);
      }
    }
    
    // Priority 3: Customers with no email communication
    if (newMoments.length < slotsNeeded) {
      const noContactCustomers = await db.execute(sql`
        SELECT c.id, c.company, c.email FROM customers c
        LEFT JOIN gmail_messages gm ON gm.customer_id = c.id
        WHERE gm.id IS NULL
        AND c.email IS NOT NULL
        AND c.id NOT IN (
          SELECT customer_id FROM coaching_moments WHERE status = 'pending' AND action = 'identify_no_contact'
        )
        LIMIT ${Math.min(2, slotsNeeded - newMoments.length)}
      `);
      
      for (const row of noContactCustomers.rows as any[]) {
        if (newMoments.length >= slotsNeeded) break;
        const [moment] = await db.insert(coachingMoments).values({
          customerId: row.id,
          assignedTo: userId,
          action: 'identify_no_contact',
          whyNow: 'No email communication found with this customer',
          priority: 80,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'now_mode_generated',
        }).returning();
        newMoments.push(moment);
      }
    }
    
    // Priority 4: Send marketing emails (customers not on drip campaigns)
    if (newMoments.length < slotsNeeded) {
      const marketingCandidates = await db.execute(sql`
        SELECT c.id, c.company, c.email FROM customers c
        WHERE c.email IS NOT NULL
        AND c.accepts_email_marketing = true
        AND c.id NOT IN (SELECT customer_id FROM drip_campaign_enrollments WHERE status = 'active')
        AND c.id NOT IN (SELECT customer_id FROM coaching_moments WHERE status = 'pending' AND action = 'send_marketing_email')
        LIMIT ${Math.min(2, slotsNeeded - newMoments.length)}
      `);
      
      for (const row of marketingCandidates.rows as any[]) {
        if (newMoments.length >= slotsNeeded) break;
        const [moment] = await db.insert(coachingMoments).values({
          customerId: row.id,
          assignedTo: userId,
          action: 'send_marketing_email',
          whyNow: 'Customer accepts marketing and not on active drip campaign',
          priority: 70,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'now_mode_generated',
        }).returning();
        newMoments.push(moment);
      }
    }
    
    // Priority 5-6: Send SwatchBook or Press Test Sheet
    if (newMoments.length < slotsNeeded) {
      const sampleCandidates = await db.execute(sql`
        SELECT c.id, c.company, c.email FROM customers c
        WHERE c.email IS NOT NULL
        AND c.id NOT IN (
          SELECT customer_id FROM customer_activity_events 
          WHERE event_type IN ('swatchbook_sent', 'press_test_sent')
        )
        AND c.id NOT IN (SELECT customer_id FROM coaching_moments WHERE status = 'pending' AND action IN ('send_swatchbook', 'send_press_test'))
        ORDER BY RANDOM()
        LIMIT ${Math.min(2, slotsNeeded - newMoments.length)}
      `);
      
      let swatchBookAdded = false;
      for (const row of sampleCandidates.rows as any[]) {
        if (newMoments.length >= slotsNeeded) break;
        const action = swatchBookAdded ? 'send_press_test' : 'send_swatchbook';
        swatchBookAdded = true;
        const [moment] = await db.insert(coachingMoments).values({
          customerId: row.id,
          assignedTo: userId,
          action,
          whyNow: action === 'send_swatchbook' ? 'Customer has not received a SwatchBook' : 'Customer has not received a Press Test Sheet',
          priority: action === 'send_swatchbook' ? 60 : 55,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'now_mode_generated',
        }).returning();
        newMoments.push(moment);
      }
    }
    
    // Priority 7: Send Price List (only if SwatchBook or Press Test was sent)
    if (newMoments.length < slotsNeeded) {
      const priceListCandidates = await db.execute(sql`
        SELECT DISTINCT c.id, c.company, c.email FROM customers c
        INNER JOIN customer_activity_events cae ON cae.customer_id = c.id
        WHERE cae.event_type IN ('swatchbook_sent', 'press_test_sent')
        AND c.id NOT IN (
          SELECT customer_id FROM customer_activity_events WHERE event_type = 'price_list_sent'
        )
        AND c.id NOT IN (SELECT customer_id FROM coaching_moments WHERE status = 'pending' AND action = 'send_price_list')
        LIMIT ${Math.min(1, slotsNeeded - newMoments.length)}
      `);
      
      for (const row of priceListCandidates.rows as any[]) {
        if (newMoments.length >= slotsNeeded) break;
        const [moment] = await db.insert(coachingMoments).values({
          customerId: row.id,
          assignedTo: userId,
          action: 'send_price_list',
          whyNow: 'Customer received SwatchBook or Press Test - ready for Price List',
          priority: 50,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'now_mode_generated',
        }).returning();
        newMoments.push(moment);
      }
    }
    
    // Priority 8: Follow up on materials sent
    if (newMoments.length < slotsNeeded) {
      const followUpCandidates = await db.execute(sql`
        SELECT DISTINCT c.id, c.company, cae.event_type, cae.created_at FROM customers c
        INNER JOIN customer_activity_events cae ON cae.customer_id = c.id
        WHERE cae.event_type IN ('swatchbook_sent', 'press_test_sent', 'price_list_sent')
        AND cae.created_at < NOW() - INTERVAL '3 days'
        AND c.id NOT IN (SELECT customer_id FROM coaching_moments WHERE status = 'pending' AND action = 'follow_up_materials')
        ORDER BY cae.created_at ASC
        LIMIT ${Math.min(2, slotsNeeded - newMoments.length)}
      `);
      
      for (const row of followUpCandidates.rows as any[]) {
        if (newMoments.length >= slotsNeeded) break;
        const eventName = (row.event_type as string).replace(/_/g, ' ').replace('sent', '').trim();
        const [moment] = await db.insert(coachingMoments).values({
          customerId: row.id,
          assignedTo: userId,
          action: 'follow_up_materials',
          whyNow: `Follow up on ${eventName} sent ${Math.floor((Date.now() - new Date(row.created_at as string).getTime()) / 86400000)} days ago`,
          priority: 40,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'now_mode_generated',
        }).returning();
        newMoments.push(moment);
      }
    }
    
    // Priority 9: Make calls (ensure at least 2 per day)
    const callsNeeded = Math.max(0, 2 - stats.calls);
    if (newMoments.length < slotsNeeded && callsNeeded > 0) {
      const callCandidates = await db.execute(sql`
        SELECT c.id, c.company, c.phone FROM customers c
        WHERE c.phone IS NOT NULL AND c.phone != ''
        AND c.id NOT IN (SELECT customer_id FROM coaching_moments WHERE status = 'pending' AND action = 'make_call')
        ORDER BY RANDOM()
        LIMIT ${Math.min(callsNeeded, slotsNeeded - newMoments.length)}
      `);
      
      for (const row of callCandidates.rows as any[]) {
        if (newMoments.length >= slotsNeeded) break;
        const [moment] = await db.insert(coachingMoments).values({
          customerId: row.id,
          assignedTo: userId,
          action: 'make_call',
          whyNow: 'Daily call target - reach out to build relationship',
          priority: 30,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'now_mode_generated',
        }).returning();
        newMoments.push(moment);
      }
    }
    
    // Fill remaining slots with general outreach or overdue follow-ups
    if (newMoments.length < slotsNeeded) {
      const overdueTasks = await db
        .select()
        .from(followUpTasks)
        .where(and(
          or(
            eq(followUpTasks.assignedTo, userId),
            isNull(followUpTasks.assignedTo)
          ),
          eq(followUpTasks.status, 'pending'),
          sql`${followUpTasks.dueDate} <= CURRENT_DATE`
        ))
        .orderBy(followUpTasks.dueDate)
        .limit(slotsNeeded - newMoments.length);
      
      for (const task of overdueTasks) {
        if (!task.customerId) continue;
        if (newMoments.length >= slotsNeeded) break;
        
        const actionMap: Record<string, string> = {
          quote_follow_up: 'follow_up_quote',
          sample_follow_up: 'follow_up_sample',
          check_in: 'schedule_call',
          reorder_check: 'check_reorder',
        };
        
        const action = actionMap[task.taskType] || 'schedule_call';
        const whyNow = task.description || `${task.taskType.replace(/_/g, ' ')} is overdue`;
        
        const [moment] = await db.insert(coachingMoments).values({
          customerId: task.customerId,
          assignedTo: userId,
          action,
          whyNow,
          priority: task.priority === 'urgent' ? 100 : task.priority === 'high' ? 80 : 50,
          scheduledFor: new Date(),
          status: 'pending',
          sourceType: 'follow_up_task',
          sourceId: task.id,
        }).returning();
        
        newMoments.push(moment);
      }
    }
    
    return [...pendingMoments, ...newMoments];
  }

  async updateUserActivity(userId: string): Promise<void> {
    await db.update(users)
      .set({ lastActivityAt: new Date() })
      .where(eq(users.id, userId));
  }

  // ========================================
  // Sketchboard Methods
  // ========================================

  async getSketchboardEntries(userId: string, column?: string): Promise<SketchboardEntry[]> {
    const conditions = [eq(sketchboardEntries.userId, userId)];
    if (column) {
      conditions.push(eq(sketchboardEntries.column, column));
    }
    return await db.select()
      .from(sketchboardEntries)
      .where(and(...conditions))
      .orderBy(sketchboardEntries.sortOrder, sketchboardEntries.createdAt);
  }

  async createSketchboardEntry(data: InsertSketchboardEntry): Promise<SketchboardEntry> {
    // Assign sortOrder as max(sortOrder)+1 to avoid duplicates with count-based approach
    const maxResult = await db.select({ maxOrder: sql<number>`coalesce(max(sort_order), -1)::int` })
      .from(sketchboardEntries)
      .where(and(eq(sketchboardEntries.userId, data.userId), eq(sketchboardEntries.column, data.column)));
    const nextOrder = (maxResult[0]?.maxOrder ?? -1) + 1;
    const { sortOrder: _ignored, ...rest } = data;
    const [entry] = await db.insert(sketchboardEntries).values({ ...rest, sortOrder: nextOrder }).returning();
    return entry;
  }

  async updateSketchboardEntry(id: number, userId: string, data: Partial<InsertSketchboardEntry>): Promise<SketchboardEntry | undefined> {
    const [entry] = await db.update(sketchboardEntries)
      .set(data)
      .where(and(eq(sketchboardEntries.id, id), eq(sketchboardEntries.userId, userId)))
      .returning();
    return entry;
  }

  async deleteSketchboardEntry(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(sketchboardEntries)
      .where(and(eq(sketchboardEntries.id, id), eq(sketchboardEntries.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async normalizeSketchboardSortOrder(userId: string, column: string): Promise<void> {
    const entries = await db.select({ id: sketchboardEntries.id })
      .from(sketchboardEntries)
      .where(and(eq(sketchboardEntries.userId, userId), eq(sketchboardEntries.column, column)))
      .orderBy(sketchboardEntries.sortOrder, sketchboardEntries.createdAt);
    for (let i = 0; i < entries.length; i++) {
      await db.update(sketchboardEntries)
        .set({ sortOrder: i })
        .where(eq(sketchboardEntries.id, entries[i].id));
    }
  }

  async getSketchboardColumnCount(userId: string, column: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(sketchboardEntries)
      .where(and(eq(sketchboardEntries.userId, userId), eq(sketchboardEntries.column, column)));
    return result[0]?.count ?? 0;
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
