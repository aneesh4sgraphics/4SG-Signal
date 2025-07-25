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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer schema types
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

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

export type ProductCategory = typeof productCategories.$inferSelect;
export type ProductType = typeof productTypes.$inferSelect;
export type ProductSize = typeof productSizes.$inferSelect;
export type PricingTier = typeof pricingTiers.$inferSelect;
export type ProductPricingMaster = typeof productPricingMaster.$inferSelect;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type SentQuote = typeof sentQuotes.$inferSelect;
export type CompetitorPricing = typeof competitorPricing.$inferSelect;

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
