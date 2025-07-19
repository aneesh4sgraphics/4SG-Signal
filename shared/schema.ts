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
  categoryId: integer("category_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
});

export const productSizes = pgTable("product_sizes", {
  id: serial("id").primaryKey(),
  typeId: integer("type_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  width: decimal("width", { precision: 10, scale: 2 }).notNull(),
  height: decimal("height", { precision: 10, scale: 2 }).notNull(),
  widthUnit: varchar("width_unit", { length: 10 }).notNull(), // 'inch' or 'feet'
  heightUnit: varchar("height_unit", { length: 10 }).notNull(), // 'inch' or 'feet'
  squareMeters: decimal("square_meters", { precision: 10, scale: 4 }).notNull(),
  itemCode: varchar("item_code", { length: 50 }),
  minOrderQty: varchar("min_order_qty", { length: 50 }),
});

export const pricingTiers = pgTable("pricing_tiers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
});

export const productPricing = pgTable("product_pricing", {
  id: serial("id").primaryKey(),
  productTypeId: integer("product_type_id").notNull(),
  tierId: integer("tier_id").notNull(),
  pricePerSquareMeter: decimal("price_per_square_meter", { precision: 10, scale: 2 }).notNull(),
});

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

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  acceptsEmailMarketing: boolean("accepts_email_marketing").default(false),
  company: varchar("company", { length: 255 }).notNull(),
  address1: varchar("address1", { length: 255 }),
  address2: varchar("address2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  province: varchar("province", { length: 255 }),
  country: varchar("country", { length: 255 }),
  zip: varchar("zip", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  note: text("note"),
  tags: varchar("tags", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sentQuotes = pgTable("sent_quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: varchar("quote_number", { length: 50 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  quoteItems: text("quote_items").notNull(), // JSON string of quote items
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: varchar("created_at", { length: 50 }).notNull(),
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

export const insertProductPricingSchema = createInsertSchema(productPricing).omit({
  id: true,
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
export type ProductPricing = typeof productPricing.$inferSelect;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type SentQuote = typeof sentQuotes.$inferSelect;
export type CompetitorPricing = typeof competitorPricing.$inferSelect;

export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type InsertProductType = z.infer<typeof insertProductTypeSchema>;
export type InsertProductSize = z.infer<typeof insertProductSizeSchema>;
export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type InsertProductPricing = z.infer<typeof insertProductPricingSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertSentQuote = z.infer<typeof insertSentQuoteSchema>;
export type InsertCompetitorPricing = z.infer<typeof insertCompetitorPricingSchema>;
