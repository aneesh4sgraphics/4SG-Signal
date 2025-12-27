import { pgTable, text, serial, integer, boolean, decimal, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
});

export const productTypes = pgTable("product_types", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => productCategories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
});

export const productSizes = pgTable("product_sizes", {
  id: serial("id").primaryKey(),
  typeId: integer("type_id").notNull().references(() => productTypes.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  width: decimal("width", { precision: 10, scale: 2 }).notNull(),
  height: decimal("height", { precision: 10, scale: 2 }).notNull(),
  widthUnit: varchar("width_unit", { length: 10 }).notNull(), // 'inch' or 'feet'
  heightUnit: varchar("height_unit", { length: 10 }).notNull(), // 'inch' or 'feet'
  squareMeters: decimal("square_meters", { precision: 10, scale: 4 }).notNull(),
  itemCode: varchar("item_code", { length: 50 }),
  minOrderQty: integer("min_order_qty").default(50),
});

export const pricingTiers = pgTable("pricing_tiers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
});

// Removed: productPricing table - replaced by productPricingMaster for consolidated pricing data

// Product pricing master table - replaces file-based system
export const productPricingMaster = pgTable("product_pricing_master", {
  id: serial("id").primaryKey(),
  itemCode: varchar("item_code", { length: 100 }).notNull().unique(),
  productName: varchar("product_name", { length: 255 }).notNull(),
  productType: varchar("product_type", { length: 255 }).notNull(),
  productTypeId: integer("product_type_id").references(() => productTypes.id, { onDelete: "cascade" }),
  size: varchar("size", { length: 100 }).notNull(),
  totalSqm: decimal("total_sqm", { precision: 10, scale: 6 }).notNull(),
  minQuantity: integer("min_quantity").notNull().default(50),
  // Pricing tiers
  landedPrice: decimal("landed_price", { precision: 10, scale: 2 }),
  exportPrice: decimal("export_price", { precision: 10, scale: 2 }),
  masterDistributorPrice: decimal("master_distributor_price", { precision: 10, scale: 2 }),
  dealerPrice: decimal("dealer_price", { precision: 10, scale: 2 }),
  dealer2Price: decimal("dealer2_price", { precision: 10, scale: 2 }),
  approvalNeededPrice: decimal("approval_needed_price", { precision: 10, scale: 2 }),
  tierStage25Price: decimal("tier_stage25_price", { precision: 10, scale: 2 }),
  tierStage2Price: decimal("tier_stage2_price", { precision: 10, scale: 2 }),
  tierStage15Price: decimal("tier_stage15_price", { precision: 10, scale: 2 }),
  tierStage1Price: decimal("tier_stage1_price", { precision: 10, scale: 2 }),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }),
  // Metadata
  uploadBatch: varchar("upload_batch", { length: 100 }), // Track which upload this came from
  rowHash: varchar("row_hash", { length: 64 }), // Hash of row data for change detection
  sortOrder: integer("sort_order"), // Preserve CSV file order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Removed: pricingData table - legacy table replaced by productPricingMaster

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User authentication and management
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).notNull().default("user"), // 'admin', 'user'
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'approved', 'rejected'
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  loginCount: integer("login_count").default(0),
  lastLoginDate: varchar("last_login_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// File upload tracking for product data
export const fileUploads = pgTable("file_uploads", {
  id: serial("id").primaryKey(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(), // 'product_data', 'customer_data', etc.
  fileSize: integer("file_size").notNull(),
  uploadedBy: varchar("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  recordsProcessed: integer("records_processed").default(0),
  recordsAdded: integer("records_added").default(0),
  recordsUpdated: integer("records_updated").default(0),
  isActive: boolean("is_active").default(true), // Current active file for this type
});

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().notNull(), // Customer ID from CSV
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  acceptsEmailMarketing: boolean("accepts_email_marketing").default(false),
  company: varchar("company", { length: 255 }),
  address1: varchar("address1", { length: 255 }),
  address2: varchar("address2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  province: varchar("province", { length: 255 }),
  country: varchar("country", { length: 255 }),
  zip: varchar("zip", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  defaultAddressPhone: varchar("default_address_phone", { length: 50 }),
  acceptsSmsMarketing: boolean("accepts_sms_marketing").default(false),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  note: text("note"),
  taxExempt: boolean("tax_exempt").default(false),
  tags: varchar("tags", { length: 500 }),
  sources: text("sources").array().default([]), // Track import sources: ['odoo', 'shopify']
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer schema types
// export type Customer = typeof customers.$inferSelect;
// export type InsertCustomer = typeof customers.$inferInsert;

// Customer Contacts - multiple contacts per customer company
export const customerContacts = pgTable("customer_contacts", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: varchar("role", { length: 100 }), // e.g., "Buyer", "Production Manager", "Owner"
  isPrimary: boolean("is_primary").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerContactSchema = createInsertSchema(customerContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CustomerContact = typeof customerContacts.$inferSelect;
export type InsertCustomerContact = z.infer<typeof insertCustomerContactSchema>;

export const sentQuotes = pgTable("sent_quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: varchar("quote_number", { length: 50 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  quoteItems: text("quote_items").notNull(), // JSON string of quote items
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentVia: varchar("sent_via", { length: 20 }).notNull(), // 'email' or 'pdf'
  status: varchar("status", { length: 20 }).notNull().default("sent"), // 'sent', 'viewed', 'accepted'
});

export const competitorPricing = pgTable("competitor_pricing", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  dimensions: varchar("dimensions", { length: 100 }).notNull(),
  width: decimal("width", { precision: 10, scale: 2 }),
  length: decimal("length", { precision: 10, scale: 2 }),
  unit: varchar("unit", { length: 10 }),
  packQty: integer("pack_qty").notNull(),
  inputPrice: decimal("input_price", { precision: 10, scale: 2 }).notNull(),
  pricePerSheet: decimal("price_per_sheet", { precision: 10, scale: 4 }),
  thickness: varchar("thickness", { length: 50 }).notNull(),
  productKind: varchar("product_kind", { length: 100 }).notNull(),
  surfaceFinish: varchar("surface_finish", { length: 100 }).notNull(),
  supplierInfo: varchar("supplier_info", { length: 255 }).notNull(),
  infoReceivedFrom: varchar("info_received_from", { length: 255 }).notNull(),
  pricePerSqIn: decimal("price_per_sq_in", { precision: 10, scale: 4 }).notNull(),
  pricePerSqFt: decimal("price_per_sq_ft", { precision: 10, scale: 4 }).notNull(),
  pricePerSqMeter: decimal("price_per_sq_meter", { precision: 10, scale: 4 }).notNull(),
  notes: text("notes").notNull(),
  source: varchar("source", { length: 100 }).notNull(),
  addedBy: varchar("added_by").notNull(), // User ID who added this entry
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity tracking for user and admin actions
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  userEmail: varchar("user_email", { length: 255 }).notNull(),
  userName: varchar("user_name", { length: 255 }),
  userRole: varchar("user_role", { length: 20 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(), // 'quote_sent', 'price_list_updated', 'user_approved', etc.
  actionType: varchar("action_type", { length: 50 }).notNull(), // 'quote', 'admin', 'pricing', 'customer', etc.
  description: text("description").notNull(),
  metadata: jsonb("metadata"), // Additional data like quote amount, affected records, etc.
  targetId: varchar("target_id"), // ID of affected resource (quote ID, customer ID, etc.)
  targetType: varchar("target_type", { length: 50 }), // 'quote', 'customer', 'user', 'pricing', etc.
  status: varchar("status", { length: 20 }).default("completed"), // 'completed', 'failed', 'pending'
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductCategorySchema = createInsertSchema(productCategories).omit({
  id: true,
});

export const insertProductTypeSchema = createInsertSchema(productTypes).omit({
  id: true,
});

export const insertProductSizeSchema = createInsertSchema(productSizes).omit({
  id: true,
});

export const insertPricingTierSchema = createInsertSchema(pricingTiers).omit({
  id: true,
});

// Removed: insertProductPricingSchema and insertPricingDataSchema - legacy schemas replaced by productPricingMaster

export const insertProductPricingMasterSchema = createInsertSchema(productPricingMaster).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertSentQuoteSchema = createInsertSchema(sentQuotes).omit({
  id: true,
});

export const insertCompetitorPricingSchema = createInsertSchema(competitorPricing).omit({
  id: true,
  timestamp: true,
  createdAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export type ProductCategory = typeof productCategories.$inferSelect;
export type ProductType = typeof productTypes.$inferSelect;
export type ProductSize = typeof productSizes.$inferSelect;
export type PricingTier = typeof pricingTiers.$inferSelect;
export type ProductPricingMaster = typeof productPricingMaster.$inferSelect;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type SentQuote = typeof sentQuotes.$inferSelect;
export type CompetitorPricing = typeof competitorPricing.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;

export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type InsertProductType = z.infer<typeof insertProductTypeSchema>;
export type InsertProductSize = z.infer<typeof insertProductSizeSchema>;
export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type InsertProductPricingMaster = z.infer<typeof insertProductPricingMasterSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertSentQuote = z.infer<typeof insertSentQuoteSchema>;
export type InsertCompetitorPricing = z.infer<typeof insertCompetitorPricingSchema>;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// Upload batch history for rollback and comparison
export const uploadBatches = pgTable("upload_batches", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").notNull().unique(),
  filename: text("filename").notNull(),
  uploadDate: timestamp("upload_date").defaultNow().notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsAdded: integer("records_added").default(0),
  recordsUpdated: integer("records_updated").default(0),
  recordsDeleted: integer("records_deleted").default(0),
  clearDatabase: boolean("clear_database").default(false),
  changeLog: jsonb("change_log").$type<{
    added: Array<{ itemCode: string; productName: string; productType: string }>;
    updated: Array<{ itemCode: string; productName: string; changes: Record<string, { old: any; new: any }> }>;
    deleted: Array<{ itemCode: string; productName: string; productType: string }>;
  }>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// File upload types
export const insertFileUploadSchema = createInsertSchema(fileUploads);
export type FileUpload = typeof fileUploads.$inferSelect;
export type InsertFileUpload = z.infer<typeof insertFileUploadSchema>;

export const insertUploadBatchSchema = createInsertSchema(uploadBatches).omit({
  id: true,
  createdAt: true,
});
export type UploadBatch = typeof uploadBatches.$inferSelect;
export type InsertUploadBatch = z.infer<typeof insertUploadBatchSchema>;

// Parsed Contacts table for text parsing feature
export const parsedContacts = pgTable("parsed_contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").default(""),
  city: text("city").default(""),
  state: varchar("state", { length: 2 }).default(""),
  zip: varchar("zip", { length: 10 }).default(""),
  country: text("country").default("USA"),
  phone: varchar("phone", { length: 20 }).default(""),
  email: text("email").default(""),
  website: text("website").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Parsed Contacts schemas
export const insertParsedContactSchema = createInsertSchema(parsedContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ParsedContact = typeof parsedContacts.$inferSelect;
export type InsertParsedContact = z.infer<typeof insertParsedContactSchema>;

// PDF Product Category Details - configurable by admin for Price List PDFs
export const pdfCategoryDetails = pgTable("pdf_category_details", {
  id: serial("id").primaryKey(),
  categoryKey: varchar("category_key", { length: 50 }).notNull().unique(), // e.g., 'graffiti', 'cliq', 'solvit'
  displayName: varchar("display_name", { length: 255 }).notNull(), // e.g., 'Graffiti POLYESTER PAPER'
  logoFile: varchar("logo_file", { length: 255 }), // Logo filename in attached_assets
  featuresMain: text("features_main"), // Bold features: 'Scuff Free / Waterproof / Tear Resistant'
  featuresSub: text("features_sub"), // Italic sub-features: 'High Rigidity / Excellent Alcohol & Stain Resistance'
  compatibleWith: text("compatible_with"), // Compatibility text
  matchesPattern: text("matches_pattern"), // Description of what products match this category
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
});

// PDF Category Details schemas
export const insertPdfCategoryDetailsSchema = createInsertSchema(pdfCategoryDetails).omit({
  id: true,
  updatedAt: true,
});
export type PdfCategoryDetails = typeof pdfCategoryDetails.$inferSelect;
export type InsertPdfCategoryDetails = z.infer<typeof insertPdfCategoryDetailsSchema>;

// ========================================
// Shipment Labeler Tables
// ========================================

// Pallet schema for shipments
const palletSchema = z.object({
  weight: z.number(),
  dimensions: z.string(),
});

// Shipping companies for Local Transport forms
export const shippingCompanies = pgTable("shipping_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertShippingCompanySchema = createInsertSchema(shippingCompanies).omit({
  id: true,
  createdAt: true,
});
export type ShippingCompany = typeof shippingCompanies.$inferSelect;
export type InsertShippingCompany = z.infer<typeof insertShippingCompanySchema>;

// Saved recipients for quick selection
export const savedRecipients = pgTable("saved_recipients", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedRecipientSchema = createInsertSchema(savedRecipients).omit({
  id: true,
  createdAt: true,
});
export type SavedRecipient = typeof savedRecipients.$inferSelect;
export type InsertSavedRecipient = z.infer<typeof insertSavedRecipientSchema>;

// Shipments table for shipping labels
export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  shipFrom: text("ship_from").notNull(),
  companyName: text("company_name"),
  shipTo: text("ship_to"),
  invoiceNumber: text("invoice_number"),
  invoiceDate: text("invoice_date"),
  clientPO: text("client_po"),
  palletCount: integer("pallet_count").notNull(),
  pallets: jsonb("pallets").notNull().$type<Array<{ weight: number; dimensions: string }>>(),
  format: text("format").notNull(),
  shipVia: text("ship_via"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertShipmentSchema = createInsertSchema(shipments, {
  pallets: z.array(palletSchema),
}).omit({
  id: true,
  createdAt: true,
});
export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = z.infer<typeof insertShipmentSchema>;

// Product Labels for saving and reusing
export const productLabels = pgTable("product_labels", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  sku: text("sku"),
  description: text("description"),
  price: text("price"),
  barcode: text("barcode"),
  websiteUrl: text("website_url"),
  isSamplePack: boolean("is_sample_pack").default(false).notNull(),
  printTypes: jsonb("print_types").notNull().$type<string[]>().default([]),
  labelFormat: text("label_format").notNull().default("thermal4x3"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductLabelSchema = createInsertSchema(productLabels, {
  printTypes: z.array(z.string()),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
});
export type ProductLabel = typeof productLabels.$inferSelect;
export type InsertProductLabel = z.infer<typeof insertProductLabelSchema>;

// Notion Products - synced from Notion for local access
export const notionProducts = pgTable("notion_products", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  sku: text("sku"),
  description: text("description"),
  price: text("price"),
  barcode: text("barcode"),
  websiteUrl: text("website_url"),
  variantSize: text("variant_size"),
  printTypes: jsonb("print_types").notNull().$type<string[]>().default([]),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const insertNotionProductSchema = createInsertSchema(notionProducts, {
  printTypes: z.array(z.string()),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
  variantSize: z.string().optional().nullable(),
}).omit({
  id: true,
  syncedAt: true,
});
export type NotionProduct = typeof notionProducts.$inferSelect;
export type InsertNotionProduct = z.infer<typeof insertNotionProductSchema>;

// ========================================
// CRM / Paper Distribution Tables
// ========================================

// Journey stage enum values
export const JOURNEY_STAGES = [
  'trigger',           // 1. Price increase detected from competitor
  'internal_alarm',    // 2. Customer recognizes margin erosion
  'supplier_pushback', // 3. Customer challenges current supplier
  'pilot_alignment',   // 4. Internal approval to trial new supplier
  'controlled_trial',  // 5. Samples scheduled/in press
  'validation_proof',  // 6. Test outcomes recorded with gate sign-off
  'conversion',        // 7. Supplier change committed, expansion tracking
] as const;

export const PRODUCT_LINES = [
  'commodity_cut_size',
  'specialty_coated',
  'large_format',
  'label_stocks',
  'digital_media',
  'packaging',
] as const;

// Press Profiles - customer printing equipment
export const pressProfiles = pgTable("press_profiles", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  pressManufacturer: varchar("press_manufacturer", { length: 255 }),
  pressModel: varchar("press_model", { length: 255 }),
  pressType: varchar("press_type", { length: 100 }), // offset, digital, flexo, etc.
  inkType: varchar("ink_type", { length: 100 }), // dry_toner, hp_indigo, uv, aqueous, etc.
  substrateFocus: text("substrate_focus"), // comma-separated product categories
  maxSheetWidth: decimal("max_sheet_width", { precision: 10, scale: 2 }),
  maxSheetLength: decimal("max_sheet_length", { precision: 10, scale: 2 }),
  coaterType: varchar("coater_type", { length: 100 }),
  dryerType: varchar("dryer_type", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPressProfileSchema = createInsertSchema(pressProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type PressProfile = typeof pressProfiles.$inferSelect;
export type InsertPressProfile = z.infer<typeof insertPressProfileSchema>;

// Sample Requests - track customer sample requests
export const sampleRequests = pgTable("sample_requests", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productPricingMaster.id),
  productName: varchar("product_name", { length: 255 }),
  competitorPaper: varchar("competitor_paper", { length: 255 }),
  jobDescription: text("job_description"),
  plannedTestDate: timestamp("planned_test_date"),
  testOwnerName: varchar("test_owner_name", { length: 255 }),
  testOwnerRole: varchar("test_owner_role", { length: 100 }),
  quantity: integer("quantity"),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, shipped, testing, completed, cancelled
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSampleRequestSchema = createInsertSchema(sampleRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SampleRequest = typeof sampleRequests.$inferSelect;
export type InsertSampleRequest = z.infer<typeof insertSampleRequestSchema>;

// Test Outcomes - results from sample tests
export const testOutcomes = pgTable("test_outcomes", {
  id: serial("id").primaryKey(),
  sampleRequestId: integer("sample_request_id").notNull().references(() => sampleRequests.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  testDate: timestamp("test_date"),
  pressman: varchar("pressman", { length: 255 }),
  overallResult: varchar("overall_result", { length: 50 }), // pass, fail, conditional
  runScore: integer("run_score"), // 1-10
  printScore: integer("print_score"), // 1-10
  finishScore: integer("finish_score"), // 1-10
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTestOutcomeSchema = createInsertSchema(testOutcomes).omit({
  id: true,
  createdAt: true,
});
export type TestOutcome = typeof testOutcomes.$inferSelect;
export type InsertTestOutcome = z.infer<typeof insertTestOutcomeSchema>;

// Validation Events - gate completions in customer journey
export const validationEvents = pgTable("validation_events", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  stage: varchar("stage", { length: 50 }).notNull(), // matches JOURNEY_STAGES
  gateId: varchar("gate_id", { length: 100 }), // specific gate within stage
  completedAt: timestamp("completed_at").defaultNow(),
  completedBy: varchar("completed_by"),
  evidence: text("evidence"), // notes or link to supporting evidence
  metadata: jsonb("metadata"),
});

export const insertValidationEventSchema = createInsertSchema(validationEvents).omit({
  id: true,
});
export type ValidationEvent = typeof validationEvents.$inferSelect;
export type InsertValidationEvent = z.infer<typeof insertValidationEventSchema>;

// Swatches - paper samples in catalog
export const swatches = pgTable("swatches", {
  id: serial("id").primaryKey(),
  swatchCode: varchar("swatch_code", { length: 50 }).notNull().unique(),
  productLine: varchar("product_line", { length: 100 }), // matches PRODUCT_LINES
  sku: varchar("sku", { length: 100 }),
  name: varchar("name", { length: 255 }).notNull(),
  weight: varchar("weight", { length: 50 }), // e.g., "80lb", "100gsm"
  finish: varchar("finish", { length: 100 }), // matte, gloss, satin, etc.
  productId: integer("product_id").references(() => productPricingMaster.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSwatchSchema = createInsertSchema(swatches).omit({
  id: true,
  createdAt: true,
});
export type Swatch = typeof swatches.$inferSelect;
export type InsertSwatch = z.infer<typeof insertSwatchSchema>;

// Swatch Book Shipments - track swatch book sends to customers
export const swatchBookShipments = pgTable("swatch_book_shipments", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  swatchBookVersion: varchar("swatch_book_version", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, shipped, delivered, returned
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSwatchBookShipmentSchema = createInsertSchema(swatchBookShipments).omit({
  id: true,
  createdAt: true,
});
export type SwatchBookShipment = typeof swatchBookShipments.$inferSelect;
export type InsertSwatchBookShipment = z.infer<typeof insertSwatchBookShipmentSchema>;

// Swatch Selections - customer picks from swatch book
export const swatchSelections = pgTable("swatch_selections", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  swatchId: integer("swatch_id").notNull().references(() => swatches.id, { onDelete: "cascade" }),
  shipmentId: integer("shipment_id").references(() => swatchBookShipments.id),
  intendedJobName: varchar("intended_job_name", { length: 255 }),
  intendedTestDate: timestamp("intended_test_date"),
  testOwner: varchar("test_owner", { length: 255 }),
  sampleRequested: boolean("sample_requested").default(false),
  sampleRequestId: integer("sample_request_id").references(() => sampleRequests.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSwatchSelectionSchema = createInsertSchema(swatchSelections).omit({
  id: true,
  createdAt: true,
});
export type SwatchSelection = typeof swatchSelections.$inferSelect;
export type InsertSwatchSelection = z.infer<typeof insertSwatchSelectionSchema>;

// Customer Journey Tracking - extends customers with journey data
export const customerJourney = pgTable("customer_journey", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().unique().references(() => customers.id, { onDelete: "cascade" }),
  journeyStage: varchar("journey_stage", { length: 50 }).default("trigger"), // matches JOURNEY_STAGES
  primaryProductLine: varchar("primary_product_line", { length: 100 }), // matches PRODUCT_LINES
  currentSupplier: varchar("current_supplier", { length: 255 }),
  estimatedAnnualVolume: decimal("estimated_annual_volume", { precision: 12, scale: 2 }),
  quotesReceived: integer("quotes_received").default(0),
  priceListViews: integer("price_list_views").default(0),
  lastQuoteDate: timestamp("last_quote_date"),
  lastPriceListView: timestamp("last_price_list_view"),
  stageUpdatedAt: timestamp("stage_updated_at").defaultNow(),
  assignedSalesRep: varchar("assigned_sales_rep"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerJourneySchema = createInsertSchema(customerJourney).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CustomerJourney = typeof customerJourney.$inferSelect;
export type InsertCustomerJourney = z.infer<typeof insertCustomerJourneySchema>;

// Quote Events - track quotes sent to customers (links to sentQuotes)
export const quoteEvents = pgTable("quote_events", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  quoteId: integer("quote_id").references(() => sentQuotes.id),
  quoteNumber: varchar("quote_number", { length: 50 }),
  eventType: varchar("event_type", { length: 50 }).notNull(), // sent, viewed, accepted, rejected, expired
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  itemCount: integer("item_count"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQuoteEventSchema = createInsertSchema(quoteEvents).omit({
  id: true,
  createdAt: true,
});
export type QuoteEvent = typeof quoteEvents.$inferSelect;
export type InsertQuoteEvent = z.infer<typeof insertQuoteEventSchema>;

// Price List Events - track price list views/downloads
export const priceListEvents = pgTable("price_list_events", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(), // view, download, email
  priceTier: varchar("price_tier", { length: 50 }),
  productTypes: text("product_types").array(), // which product types were included
  userId: varchar("user_id"),
  userEmail: varchar("user_email", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPriceListEventSchema = createInsertSchema(priceListEvents).omit({
  id: true,
  createdAt: true,
});
export type PriceListEvent = typeof priceListEvents.$inferSelect;
export type InsertPriceListEvent = z.infer<typeof insertPriceListEventSchema>;

// Journey Types enum
export const JOURNEY_TYPES = ['press_test', 'swatch_book', 'quote_sent'] as const;
export type JourneyType = typeof JOURNEY_TYPES[number];

// ========================================
// Journey Templates (Custom Pipelines)
// ========================================

// Journey Templates - reusable pipeline definitions
export const journeyTemplates = pgTable("journey_templates", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(), // unique identifier like 'press_test_pipeline'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isSystemDefault: boolean("is_system_default").default(false), // true for built-in templates
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJourneyTemplateSchema = createInsertSchema(journeyTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type JourneyTemplate = typeof journeyTemplates.$inferSelect;
export type InsertJourneyTemplate = z.infer<typeof insertJourneyTemplateSchema>;

// Journey Template Stages - stages within a template
export const journeyTemplateStages = pgTable("journey_template_stages", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => journeyTemplates.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // order of stages (1, 2, 3, etc.)
  name: varchar("name", { length: 255 }).notNull(),
  guidance: text("guidance"), // stage guidance/description
  color: varchar("color", { length: 20 }), // visual color for the stage
  confidenceLevel: integer("confidence_level"), // optional confidence % when entering this stage
  overdueDays: integer("overdue_days"), // mark leads overdue if in stage longer than X days
  autoCloseDays: integer("auto_close_days"), // auto-close leads if in stage longer than X days
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJourneyTemplateStageSchema = createInsertSchema(journeyTemplateStages).omit({
  id: true,
  createdAt: true,
});
export type JourneyTemplateStage = typeof journeyTemplateStages.$inferSelect;
export type InsertJourneyTemplateStage = z.infer<typeof insertJourneyTemplateStageSchema>;

// Press Test Journey Steps
export const PRESS_TEST_STEPS = ['sample_requested', 'tracking_added', 'received', 'result'] as const;
export type PressTestStep = typeof PRESS_TEST_STEPS[number];

// Customer Journey Instances - unified tracking of all journey types
export const customerJourneyInstances = pgTable("customer_journey_instances", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  journeyType: varchar("journey_type", { length: 50 }).notNull(), // press_test, swatch_book, quote_sent, or 'custom'
  templateId: integer("template_id").references(() => journeyTemplates.id, { onDelete: "set null" }), // for custom template journeys
  currentStep: varchar("current_step", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("in_progress"), // in_progress, completed, cancelled
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerJourneyInstanceSchema = createInsertSchema(customerJourneyInstances).omit({
  id: true,
  startedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type CustomerJourneyInstance = typeof customerJourneyInstances.$inferSelect;
export type InsertCustomerJourneyInstance = z.infer<typeof insertCustomerJourneyInstanceSchema>;

// Customer Journey Steps - step-by-step tracking within each journey
export const customerJourneySteps = pgTable("customer_journey_steps", {
  id: serial("id").primaryKey(),
  instanceId: integer("instance_id").notNull().references(() => customerJourneyInstances.id, { onDelete: "cascade" }),
  stepKey: varchar("step_key", { length: 50 }).notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  payload: jsonb("payload"), // flexible data storage for step-specific info
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerJourneyStepSchema = createInsertSchema(customerJourneySteps).omit({
  id: true,
  createdAt: true,
});
export type CustomerJourneyStep = typeof customerJourneySteps.$inferSelect;
export type InsertCustomerJourneyStep = z.infer<typeof insertCustomerJourneyStepSchema>;

// Press Test Journey Details - specific to press test journeys
export const pressTestJourneyDetails = pgTable("press_test_journey_details", {
  id: serial("id").primaryKey(),
  instanceId: integer("instance_id").notNull().unique().references(() => customerJourneyInstances.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productPricingMaster.id),
  productName: varchar("product_name", { length: 255 }),
  sizeRequested: varchar("size_requested", { length: 100 }),
  quantityRequested: integer("quantity_requested"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
  result: varchar("result", { length: 50 }), // good, bad, neutral
  resultFeedback: text("result_feedback"),
  sampleRequestId: integer("sample_request_id").references(() => sampleRequests.id),
  testOutcomeId: integer("test_outcome_id").references(() => testOutcomes.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPressTestJourneyDetailSchema = createInsertSchema(pressTestJourneyDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type PressTestJourneyDetail = typeof pressTestJourneyDetails.$inferSelect;
export type InsertPressTestJourneyDetail = z.infer<typeof insertPressTestJourneyDetailSchema>;
