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
  odooItemCode: varchar("odoo_item_code", { length: 100 }), // Odoo default_code for display
  productName: varchar("product_name", { length: 255 }).notNull(),
  productType: varchar("product_type", { length: 255 }).notNull(),
  productTypeId: integer("product_type_id").references(() => productTypes.id, { onDelete: "cascade" }),
  // Catalog linkage (set by CSV import)
  catalogCategoryId: integer("catalog_category_id"), // Links to adminCategories.id
  catalogProductTypeId: integer("catalog_product_type_id"), // Links to catalogProductTypes.id
  size: varchar("size", { length: 100 }).notNull(),
  totalSqm: decimal("total_sqm", { precision: 10, scale: 6 }).notNull(),
  minQuantity: integer("min_quantity").notNull().default(50),
  // Product classification
  rollSheet: varchar("roll_sheet", { length: 10 }), // 'roll' or 'sheet'
  unitOfMeasure: varchar("unit_of_measure", { length: 20 }), // 'sheets', 'rolls', 'packets', 'cartons'
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
  // Merge tracking
  isArchived: boolean("is_archived").default(false), // Set true when merged into another product
  mergeParentId: integer("merge_parent_id"), // Points to the primary product this was merged into
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product merge suggestions - tracks fuzzy matches between Odoo and local products
export const productMergeSuggestions = pgTable("product_merge_suggestions", {
  id: serial("id").primaryKey(),
  localProductId: integer("local_product_id").notNull().references(() => productPricingMaster.id, { onDelete: "cascade" }),
  odooDefaultCode: varchar("odoo_default_code", { length: 100 }).notNull(),
  odooProductName: varchar("odoo_product_name", { length: 255 }),
  odooProductId: integer("odoo_product_id"), // Odoo product.template ID if available
  matchScore: decimal("match_score", { precision: 5, scale: 4 }).notNull(), // 0-1 similarity score
  matchType: varchar("match_type", { length: 20 }).notNull(), // 'exact', 'fuzzy', 'prefix'
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'accepted', 'rejected'
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product to Odoo mapping table - links QuickQuotes products to Odoo products
export const productOdooMappings = pgTable("product_odoo_mappings", {
  id: serial("id").primaryKey(),
  itemCode: varchar("item_code", { length: 100 }).notNull().unique(), // QuickQuotes product item code
  odooProductId: integer("odoo_product_id").notNull(), // Odoo product.template ID
  odooDefaultCode: varchar("odoo_default_code", { length: 100 }), // Odoo product SKU/reference
  odooProductName: varchar("odoo_product_name", { length: 255 }), // Cached Odoo product name
  syncStatus: varchar("sync_status", { length: 20 }).notNull().default("mapped"), // 'mapped', 'pending_sync', 'synced', 'error'
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by", { length: 255 }),
});

// Odoo price sync queue - pending price updates awaiting approval
export const odooPriceSyncQueue = pgTable("odoo_price_sync_queue", {
  id: serial("id").primaryKey(),
  mappingId: integer("mapping_id").notNull().references(() => productOdooMappings.id, { onDelete: "cascade" }),
  itemCode: varchar("item_code", { length: 100 }).notNull(),
  odooProductId: integer("odoo_product_id").notNull(),
  priceTier: varchar("price_tier", { length: 50 }).notNull(), // Which price tier to sync (e.g., 'dealerPrice', 'retailPrice')
  currentOdooPrice: decimal("current_odoo_price", { precision: 10, scale: 2 }),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'approved', 'rejected', 'synced', 'error'
  requestedBy: varchar("requested_by", { length: 255 }),
  requestedAt: timestamp("requested_at").defaultNow(),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  syncedAt: timestamp("synced_at"),
  syncError: text("sync_error"),
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
  allowedTiers: text("allowed_tiers").array(), // Array of tier keys user can see (null = all tiers for admins)
  efficiencyScore: integer("efficiency_score").default(0), // NOW MODE efficiency score (0-100)
  totalTasksCompleted: integer("total_tasks_completed").default(0), // Total NOW MODE tasks completed
  lastActivityAt: timestamp("last_activity_at"), // Last user activity for dormancy detection
  odooUserId: integer("odoo_user_id"), // Link to Odoo res.users ID (matched by email)
  odooUserName: varchar("odoo_user_name"), // Cached Odoo user display name
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
  emailNormalized: varchar("email_normalized", { length: 320 }), // Canonical normalized email for matching
  email2: varchar("email2", { length: 255 }), // Secondary email for contacts with multiple emails
  email2Normalized: varchar("email2_normalized", { length: 320 }), // Normalized secondary email
  acceptsEmailMarketing: boolean("accepts_email_marketing").default(false),
  company: varchar("company", { length: 255 }),
  address1: varchar("address1", { length: 255 }),
  address2: varchar("address2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  province: varchar("province", { length: 255 }),
  country: varchar("country", { length: 255 }),
  zip: varchar("zip", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  cell: varchar("cell", { length: 50 }),
  website: varchar("website", { length: 255 }),
  defaultAddressPhone: varchar("default_address_phone", { length: 50 }),
  acceptsSmsMarketing: boolean("accepts_sms_marketing").default(false),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  note: text("note"),
  taxExempt: boolean("tax_exempt").default(false),
  tags: varchar("tags", { length: 500 }),
  sources: text("sources").array().default([]), // Track import sources: ['odoo', 'shopify']
  pausedUntil: timestamp("paused_until"), // Account paused for coaching - stop nudges until this date
  pauseReason: varchar("pause_reason", { length: 100 }), // Why account was paused
  isHotProspect: boolean("is_hot_prospect").default(false), // Mark customer as hot lead for priority follow-up
  salesRepId: varchar("sales_rep_id"), // Assigned sales rep user ID
  salesRepName: varchar("sales_rep_name", { length: 255 }), // Assigned sales rep display name
  pricingTier: varchar("pricing_tier", { length: 50 }), // Mandatory pricing tier for quotes
  pricingTierSetBy: varchar("pricing_tier_set_by", { length: 255 }), // Email of user who set the tier
  pricingTierSetAt: timestamp("pricing_tier_set_at"), // When tier was first set (locks for non-admins)
  lastOdooSyncAt: timestamp("last_odoo_sync_at"), // When this customer was last synced from Odoo
  odooPartnerId: integer("odoo_partner_id"), // Linked Odoo res.partner ID
  odooWriteDate: timestamp("odoo_write_date"), // Last write_date from Odoo for conflict detection
  odooSyncStatus: varchar("odoo_sync_status", { length: 20 }).default("synced"), // 'synced', 'pending', 'conflict', 'error'
  odooPendingChanges: jsonb("odoo_pending_changes"), // JSON of pending field changes to push to Odoo
  odooLastSyncError: text("odoo_last_sync_error"), // Last sync error message if any
  odooParentId: integer("odoo_parent_id"), // Parent partner ID in Odoo (for tree structure)
  parentCustomerId: varchar("parent_customer_id"), // Local parent customer ID (resolved after import)
  contactType: varchar("contact_type", { length: 50 }), // 'company', 'contact', 'delivery', 'invoice', 'other'
  isCompany: boolean("is_company").default(false), // True if this is a company, false if individual/address
  doNotContact: boolean("do_not_contact").default(false), // Mark as bad fit / do not contact - excludes from NOW MODE cards
  doNotContactReason: varchar("do_not_contact_reason", { length: 255 }), // Why marked as DNC
  doNotContactSetBy: varchar("do_not_contact_set_by", { length: 255 }), // Who set the DNC flag
  doNotContactSetAt: timestamp("do_not_contact_set_at"), // When DNC was set
  lastOutboundEmailAt: timestamp("last_outbound_email_at"), // Track last outbound email for eligibility
  swatchbookSentAt: timestamp("swatchbook_sent_at"), // Track swatchbook send date
  pressTestSentAt: timestamp("press_test_sent_at"), // Track press test send date
  priceListSentAt: timestamp("price_list_sent_at"), // Track price list send date
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Performance indexes for list view filters and search
  index("IDX_customers_sales_rep_id").on(table.salesRepId),
  index("IDX_customers_email").on(table.email),
  index("IDX_customers_email_normalized").on(table.emailNormalized),
  index("IDX_customers_company").on(table.company),
  index("IDX_customers_province").on(table.province),
  index("IDX_customers_pricing_tier").on(table.pricingTier),
  index("IDX_customers_updated_at").on(table.updatedAt),
  index("IDX_customers_is_hot_prospect").on(table.isHotProspect),
  index("IDX_customers_is_company").on(table.isCompany),
  index("IDX_customers_do_not_contact").on(table.doNotContact),
  index("IDX_customers_odoo_partner_id").on(table.odooPartnerId),
  index("IDX_customers_phone").on(table.phone),
  index("IDX_customers_website").on(table.website),
]);

// Predefined pricing tiers - every customer must have one
export const PRICING_TIERS = [
  'LANDED PRICE',
  'EXPORT ONLY', 
  'DISTRIBUTOR',
  'DEALER-VIP',
  'DEALER',
  'SHOPIFY LOWEST',
  'SHOPIFY3',
  'SHOPIFY2',
  'SHOPIFY1',
  'SHOPIFY-ACCOUNT',
  'RETAIL'
] as const;

export type PricingTierType = typeof PRICING_TIERS[number];

// Customer schema types
// export type Customer = typeof customers.$inferSelect;
// export type InsertCustomer = typeof customers.$inferInsert;

// Customer Sync Queue - tracks pending changes to push to Odoo
export const customerSyncQueue = pgTable("customer_sync_queue", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  odooPartnerId: integer("odoo_partner_id").notNull(), // Odoo partner ID to update
  fieldName: varchar("field_name", { length: 100 }).notNull(), // Field that changed
  oldValue: text("old_value"), // Previous value
  newValue: text("new_value"), // New value to push to Odoo
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'processing', 'synced', 'conflict', 'error'
  errorMessage: text("error_message"), // Error details if sync failed
  retryCount: integer("retry_count").default(0), // Number of retry attempts
  changedBy: varchar("changed_by", { length: 255 }), // User email who made the change
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"), // When the change was synced/processed
}, (table) => [
  index("IDX_sync_queue_customer_id").on(table.customerId),
  index("IDX_sync_queue_status").on(table.status),
  index("IDX_sync_queue_created_at").on(table.createdAt),
]);

export type CustomerSyncQueue = typeof customerSyncQueue.$inferSelect;
export type InsertCustomerSyncQueue = typeof customerSyncQueue.$inferInsert;
export const insertCustomerSyncQueueSchema = createInsertSchema(customerSyncQueue).omit({
  id: true,
  createdAt: true,
});

// Do Not Merge - pairs of customers that should NOT be merged (they are separate entities)
export const customerDoNotMerge = pgTable("customer_do_not_merge", {
  id: serial("id").primaryKey(),
  customerId1: varchar("customer_id_1").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  customerId2: varchar("customer_id_2").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  markedBy: varchar("marked_by", { length: 255 }), // User email who marked
  reason: varchar("reason", { length: 255 }), // Optional reason
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_do_not_merge_customer1").on(table.customerId1),
  index("IDX_do_not_merge_customer2").on(table.customerId2),
]);

export type CustomerDoNotMerge = typeof customerDoNotMerge.$inferSelect;
export type InsertCustomerDoNotMerge = typeof customerDoNotMerge.$inferInsert;

// Deleted Customer Exclusions - customers deleted by users should not be re-imported from Odoo or Shopify
export const deletedCustomerExclusions = pgTable("deleted_customer_exclusions", {
  id: serial("id").primaryKey(),
  odooPartnerId: integer("odoo_partner_id"), // Odoo res.partner ID (if from Odoo)
  shopifyCustomerId: varchar("shopify_customer_id", { length: 100 }), // Shopify customer ID (if from Shopify)
  originalCustomerId: varchar("original_customer_id", { length: 255 }), // Original CRM customer ID
  companyName: varchar("company_name", { length: 255 }), // Company name for reference
  email: varchar("email", { length: 255 }), // Email for reference
  deletedBy: varchar("deleted_by", { length: 255 }).notNull(), // User email who deleted
  reason: varchar("reason", { length: 500 }), // Optional reason for deletion
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_exclusions_odoo_partner").on(table.odooPartnerId),
  index("IDX_exclusions_shopify_customer").on(table.shopifyCustomerId),
  index("IDX_exclusions_email").on(table.email),
]);

export type DeletedCustomerExclusion = typeof deletedCustomerExclusions.$inferSelect;
export type InsertDeletedCustomerExclusion = typeof deletedCustomerExclusions.$inferInsert;

// Customer Contacts - multiple contacts per customer company
export const customerContacts = pgTable("customer_contacts", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  emailNormalized: varchar("email_normalized", { length: 320 }), // Canonical normalized email for matching
  phone: varchar("phone", { length: 50 }),
  role: varchar("role", { length: 100 }), // e.g., "Buyer", "Production Manager", "Owner"
  isPrimary: boolean("is_primary").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_customer_contacts_customer_id").on(table.customerId),
  index("IDX_customer_contacts_email_normalized").on(table.emailNormalized),
]);

export const insertCustomerContactSchema = createInsertSchema(customerContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CustomerContact = typeof customerContacts.$inferSelect;
export type InsertCustomerContact = z.infer<typeof insertCustomerContactSchema>;

// Leads table - prospects with no business history who need trust-building
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  // Source tracking
  odooLeadId: integer("odoo_lead_id"), // Odoo crm.lead ID if imported from Odoo
  sourceType: varchar("source_type", { length: 50 }).notNull().default("manual"), // 'odoo', 'manual', 'converted_contact'
  sourceCustomerId: varchar("source_customer_id"), // If converted from a contact
  // Contact information
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  emailNormalized: varchar("email_normalized", { length: 320 }), // For matching
  phone: varchar("phone", { length: 50 }),
  mobile: varchar("mobile", { length: 50 }),
  company: varchar("company", { length: 255 }),
  jobTitle: varchar("job_title", { length: 255 }),
  website: varchar("website", { length: 255 }),
  // Address
  street: varchar("street", { length: 255 }),
  street2: varchar("street2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 255 }),
  zip: varchar("zip", { length: 20 }),
  country: varchar("country", { length: 255 }),
  // Lead status and scoring
  stage: varchar("stage", { length: 50 }).notNull().default("new"), // 'new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost'
  priority: varchar("priority", { length: 10 }).default("medium"), // 'low', 'medium', 'high', 'urgent'
  score: integer("score").default(0), // Lead score (0-100) based on engagement
  probability: integer("probability").default(10), // % chance of conversion
  expectedRevenue: decimal("expected_revenue", { precision: 10, scale: 2 }),
  // Trust-building tracking
  firstEmailSentAt: timestamp("first_email_sent_at"), // When first outreach email was sent
  firstEmailReplyAt: timestamp("first_email_reply_at"), // When lead first replied to an email
  swatchbookSentAt: timestamp("swatchbook_sent_at"),
  sampleSentAt: timestamp("sample_sent_at"),
  priceListSentAt: timestamp("price_list_sent_at"),
  catalogSentAt: timestamp("catalog_sent_at"),
  firstContactAt: timestamp("first_contact_at"),
  lastContactAt: timestamp("last_contact_at"),
  totalTouchpoints: integer("total_touchpoints").default(0), // Number of interactions
  // Communication preferences
  preferredContact: varchar("preferred_contact", { length: 50 }), // 'email', 'phone', 'whatsapp'
  bestTimeToCall: varchar("best_time_to_call", { length: 100 }),
  // Notes and context
  description: text("description"),
  internalNotes: text("internal_notes"),
  lostReason: varchar("lost_reason", { length: 255 }), // If stage = 'lost'
  // Assignment
  salesRepId: varchar("sales_rep_id"), // Assigned sales rep
  salesRepName: varchar("sales_rep_name", { length: 255 }),
  // Pricing and customer type (same fields as customers for consistency)
  pricingTier: varchar("pricing_tier", { length: 50 }), // Uses same tiers as customers
  pricingTierSetBy: varchar("pricing_tier_set_by", { length: 255 }),
  pricingTierSetAt: timestamp("pricing_tier_set_at"),
  customerType: varchar("customer_type", { length: 50 }), // 'reseller' or 'printer'
  // Machine profile (what equipment they own - for printers)
  machineTypes: text("machine_types").array().default([]), // ['roland', 'hp_latex', 'mimaki', etc.]
  // Tags for categorization
  tags: varchar("tags", { length: 500 }),
  // Odoo sync fields
  odooWriteDate: timestamp("odoo_write_date"),
  lastOdooSyncAt: timestamp("last_odoo_sync_at"),
  // Origin tracking (for leads converted from contacts)
  existsInOdooAsContact: boolean("exists_in_odoo_as_contact").default(false), // True if source contact was linked to Odoo res.partner
  existsInShopify: boolean("exists_in_shopify").default(false), // True if source contact had Shopify origin
  sourceContactOdooPartnerId: integer("source_contact_odoo_partner_id"), // Original Odoo partner ID if any
  // Company/Contact relationship (for converted contacts)
  isCompany: boolean("is_company").default(false), // True if this lead represents a company
  primaryContactName: varchar("primary_contact_name", { length: 255 }), // Name of primary contact person
  primaryContactEmail: varchar("primary_contact_email", { length: 255 }), // Email of primary contact person
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_leads_email_normalized").on(table.emailNormalized),
  index("IDX_leads_stage").on(table.stage),
  index("IDX_leads_sales_rep").on(table.salesRepId),
  index("IDX_leads_odoo_lead_id").on(table.odooLeadId),
  index("IDX_leads_score").on(table.score),
  index("IDX_leads_created_at").on(table.createdAt),
]);

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

// Lead activity log - track all interactions with leads
export const leadActivities = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: 'cascade' }),
  activityType: varchar("activity_type", { length: 50 }).notNull(), // 'email_sent', 'call_made', 'sample_sent', 'meeting', 'note'
  summary: varchar("summary", { length: 500 }).notNull(),
  details: text("details"),
  performedBy: varchar("performed_by", { length: 255 }),
  performedByName: varchar("performed_by_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_lead_activities_lead_id").on(table.leadId),
  index("IDX_lead_activities_created_at").on(table.createdAt),
]);

export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({
  id: true,
  createdAt: true,
});

export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;

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
  // Quote follow-up and outcome tracking
  ownerEmail: varchar("owner_email", { length: 255 }), // User who created the quote
  followUpDueAt: timestamp("follow_up_due_at"), // 10 days after creation
  outcome: varchar("outcome", { length: 20 }).default("pending"), // 'pending', 'won', 'lost'
  outcomeNotes: text("outcome_notes"), // Why won/lost
  competitorName: varchar("competitor_name", { length: 255 }), // If lost to competitor
  objectionSummary: text("objection_summary"), // Objection details
  outcomeUpdatedAt: timestamp("outcome_updated_at"),
  outcomeUpdatedBy: varchar("outcome_updated_by", { length: 255 }),
  reminderCount: integer("reminder_count").default(0), // How many reminders sent
  lostNotificationSent: boolean("lost_notification_sent").default(false),
  // Source tracking for Shopify integration
  source: varchar("source", { length: 50 }).default("quickquote"), // 'quickquote', 'shopify_draft', 'shopify_abandoned_cart', 'email', 'pdf'
  shopifyDraftOrderId: varchar("shopify_draft_order_id", { length: 100 }), // Shopify draft order ID for dedup
  shopifyCheckoutId: varchar("shopify_checkout_id", { length: 100 }), // Shopify abandoned checkout ID for dedup  
  shopifyOrderId: varchar("shopify_order_id", { length: 100 }), // If converted to order (marks as won)
  priority: varchar("priority", { length: 20 }).default("normal"), // 'high', 'normal', 'low' - Shopify items get 'high'
  customerId: varchar("customer_id", { length: 100 }), // CRM customer ID for linking
}, (table) => [
  index("IDX_sent_quotes_created_at").on(table.createdAt),
  index("IDX_sent_quotes_customer_email").on(table.customerEmail),
  index("IDX_sent_quotes_follow_up_due").on(table.followUpDueAt),
  index("IDX_sent_quotes_outcome").on(table.outcome),
  index("IDX_sent_quotes_owner").on(table.ownerEmail),
  index("IDX_sent_quotes_source").on(table.source),
  index("IDX_sent_quotes_shopify_draft").on(table.shopifyDraftOrderId),
  index("IDX_sent_quotes_shopify_checkout").on(table.shopifyCheckoutId),
  index("IDX_sent_quotes_priority").on(table.priority),
]);

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

// Mapping between competitor pricing entries and internal products
export const productCompetitorMappings = pgTable("product_competitor_mappings", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productPricingMaster.id, { onDelete: "cascade" }),
  competitorPricingId: integer("competitor_pricing_id").notNull().references(() => competitorPricing.id, { onDelete: "cascade" }),
  matchConfidence: varchar("match_confidence", { length: 20 }).default("manual"), // 'manual', 'high', 'medium', 'low'
  status: varchar("status", { length: 20 }).default("active"), // 'active', 'inactive', 'pending_review'
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_product_competitor_mappings_product").on(table.productId),
  index("IDX_product_competitor_mappings_competitor").on(table.competitorPricingId),
]);

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
}, (table) => [
  index("IDX_activity_logs_user_id").on(table.userId),
  index("IDX_activity_logs_created_at").on(table.createdAt),
]);

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

export const insertProductOdooMappingSchema = createInsertSchema(productOdooMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOdooPriceSyncQueueSchema = createInsertSchema(odooPriceSyncQueue).omit({
  id: true,
  requestedAt: true,
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

export const insertProductCompetitorMappingSchema = createInsertSchema(productCompetitorMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type ProductOdooMapping = typeof productOdooMappings.$inferSelect;
export type OdooPriceSyncQueue = typeof odooPriceSyncQueue.$inferSelect;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type SentQuote = typeof sentQuotes.$inferSelect;
export type CompetitorPricing = typeof competitorPricing.$inferSelect;
export type ProductCompetitorMapping = typeof productCompetitorMappings.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;

export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type InsertProductType = z.infer<typeof insertProductTypeSchema>;
export type InsertProductSize = z.infer<typeof insertProductSizeSchema>;
export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type InsertProductPricingMaster = z.infer<typeof insertProductPricingMasterSchema>;
export type InsertProductOdooMapping = z.infer<typeof insertProductOdooMappingSchema>;
export type InsertOdooPriceSyncQueue = z.infer<typeof insertOdooPriceSyncQueueSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertSentQuote = z.infer<typeof insertSentQuoteSchema>;
export type InsertCompetitorPricing = z.infer<typeof insertCompetitorPricingSchema>;
export type InsertProductCompetitorMapping = z.infer<typeof insertProductCompetitorMappingSchema>;
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
}, (table) => [
  index("IDX_press_profiles_customer_id").on(table.customerId),
]);

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
  trackingNumber: varchar("tracking_number", { length: 100 }), // Shipping tracking number
  shippedAt: timestamp("shipped_at"), // When sample was shipped
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_sample_requests_customer_id").on(table.customerId),
  index("IDX_sample_requests_created_at").on(table.createdAt),
]);

export const insertSampleRequestSchema = createInsertSchema(sampleRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SampleRequest = typeof sampleRequests.$inferSelect;
export type InsertSampleRequest = z.infer<typeof insertSampleRequestSchema>;

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
}, (table) => [
  index("IDX_swatch_book_shipments_customer_id").on(table.customerId),
]);

export const insertSwatchBookShipmentSchema = createInsertSchema(swatchBookShipments).omit({
  id: true,
  createdAt: true,
});
export type SwatchBookShipment = typeof swatchBookShipments.$inferSelect;
export type InsertSwatchBookShipment = z.infer<typeof insertSwatchBookShipmentSchema>;

// Press Kit Shipments - track press kit sends to customers
export const pressKitShipments = pgTable("press_kit_shipments", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  pressKitVersion: varchar("press_kit_version", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, shipped, delivered, returned
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPressKitShipmentSchema = createInsertSchema(pressKitShipments).omit({
  id: true,
  createdAt: true,
});
export type PressKitShipment = typeof pressKitShipments.$inferSelect;
export type InsertPressKitShipment = z.infer<typeof insertPressKitShipmentSchema>;

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
}, (table) => [
  index("IDX_quote_events_customer_id").on(table.customerId),
  index("IDX_quote_events_created_at").on(table.createdAt),
]);

export const insertQuoteEventSchema = createInsertSchema(quoteEvents).omit({
  id: true,
  createdAt: true,
});
export type QuoteEvent = typeof quoteEvents.$inferSelect;
export type InsertQuoteEvent = z.infer<typeof insertQuoteEventSchema>;

// Quote Category Links - track quotes linked to product categories with follow-up stages
export const QUOTE_FOLLOW_UP_STAGES = ['initial', 'second', 'final', 'expired', 'closed'] as const;
export type QuoteFollowUpStage = typeof QUOTE_FOLLOW_UP_STAGES[number];

export const quoteCategoryLinks = pgTable("quote_category_links", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  quoteId: integer("quote_id").references(() => sentQuotes.id, { onDelete: "cascade" }),
  quoteNumber: varchar("quote_number", { length: 50 }),
  categoryName: varchar("category_name", { length: 100 }).notNull(), // product category (e.g., "Graffiti STICK")
  followUpStage: varchar("follow_up_stage", { length: 50 }).notNull().default("initial"), // initial, second, final, expired, closed
  nextFollowUpDue: timestamp("next_follow_up_due"), // when next follow-up is due
  lastFollowUpAt: timestamp("last_follow_up_at"), // when last follow-up was done
  followUpCount: integer("follow_up_count").default(0),
  outcome: varchar("outcome", { length: 50 }), // won, lost, pending, no_response
  urgencyScore: integer("urgency_score").default(0), // 0-100, higher = more urgent
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_quote_category_links_customer_id").on(table.customerId),
  index("IDX_quote_category_links_next_follow_up").on(table.nextFollowUpDue),
]);

export const insertQuoteCategoryLinkSchema = createInsertSchema(quoteCategoryLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QuoteCategoryLink = typeof quoteCategoryLinks.$inferSelect;
export type InsertQuoteCategoryLink = z.infer<typeof insertQuoteCategoryLinkSchema>;

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
}, (table) => [
  index("IDX_price_list_events_customer_id").on(table.customerId),
  index("IDX_price_list_events_created_at").on(table.createdAt),
]);

export const insertPriceListEventSchema = createInsertSchema(priceListEvents).omit({
  id: true,
  createdAt: true,
});
export type PriceListEvent = typeof priceListEvents.$inferSelect;
export type InsertPriceListEvent = z.infer<typeof insertPriceListEventSchema>;

// Price List Event Items - normalized line items with actual prices sent
export const priceListEventItems = pgTable("price_list_event_items", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => priceListEvents.id, { onDelete: "cascade" }),
  itemCode: varchar("item_code", { length: 50 }).notNull(),
  productType: varchar("product_type", { length: 255 }),
  size: varchar("size", { length: 100 }),
  minQty: integer("min_qty"),
  pricePerUnit: decimal("price_per_unit", { precision: 10, scale: 4 }),
  pricePerPack: decimal("price_per_pack", { precision: 10, scale: 4 }),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 4 }),
  priceTier: varchar("price_tier", { length: 50 }),
  category: varchar("category", { length: 100 }),
}, (table) => [
  index("IDX_price_list_event_items_event_id").on(table.eventId),
  index("IDX_price_list_event_items_item_code").on(table.itemCode),
]);

export const insertPriceListEventItemSchema = createInsertSchema(priceListEventItems).omit({
  id: true,
});
export type PriceListEventItem = typeof priceListEventItems.$inferSelect;
export type InsertPriceListEventItem = z.infer<typeof insertPriceListEventItemSchema>;

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

// =====================================================
// CUSTOMER ACTIVITY SYSTEM - Auto-tracked engagement
// =====================================================

// Activity Event Types - all possible auto-tracked events
export const ACTIVITY_EVENT_TYPES = [
  'quote_sent',           // QuickQuote created and sent
  'quote_viewed',         // Customer viewed the quote
  'quote_accepted',       // Customer accepted the quote
  'quote_rejected',       // Customer rejected the quote
  'price_list_sent',      // Price list downloaded/sent
  'price_list_viewed',    // Customer viewed price list
  'sample_requested',     // Sample request created
  'sample_shipped',       // Sample shipped with tracking
  'sample_delivered',     // Sample delivered
  'sample_feedback',      // Feedback received on sample
  'call_made',            // Phone call made
  'call_received',        // Phone call received
  'email_sent',           // Email sent to customer
  'email_received',       // Email received from customer
  'meeting_scheduled',    // Meeting scheduled
  'meeting_completed',    // Meeting completed
  'product_info_shared',  // Product brochure/info shared
  'order_placed',         // Customer placed an order
  'note_added',           // Manual note added
] as const;
export type ActivityEventType = typeof ACTIVITY_EVENT_TYPES[number];

// Customer Activity Events - unified timeline of all interactions (auto-logged)
export const customerActivityEvents = pgTable("customer_activity_events", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(), // from ACTIVITY_EVENT_TYPES
  title: varchar("title", { length: 255 }).notNull(), // e.g., "Quote #Q-1234 sent"
  description: text("description"), // Details about the event
  
  // Auto-tracking source
  sourceType: varchar("source_type", { length: 50 }), // 'auto' or 'manual'
  sourceId: varchar("source_id"), // ID of the source record (quote ID, sample ID, etc.)
  sourceTable: varchar("source_table", { length: 50 }), // Table name for reference
  
  // Financial info (for quotes/orders)
  amount: decimal("amount", { precision: 10, scale: 2 }),
  itemCount: integer("item_count"),
  
  // Product info (for samples, product shares)
  productId: integer("product_id").references(() => productPricingMaster.id),
  productName: varchar("product_name", { length: 255 }),
  
  // Who did this action
  createdBy: varchar("created_by"),
  createdByName: varchar("created_by_name", { length: 255 }),
  
  // Timestamps
  eventDate: timestamp("event_date").defaultNow(), // When the event occurred
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_customer_activity_customer_id").on(table.customerId),
  index("IDX_customer_activity_event_date").on(table.eventDate),
]);

export const insertCustomerActivityEventSchema = createInsertSchema(customerActivityEvents).omit({
  id: true,
  createdAt: true,
});
export type CustomerActivityEvent = typeof customerActivityEvents.$inferSelect;
export type InsertCustomerActivityEvent = z.infer<typeof insertCustomerActivityEventSchema>;

// Follow-up Task Status
export const FOLLOW_UP_STATUS = ['pending', 'completed', 'snoozed', 'cancelled'] as const;
export type FollowUpStatus = typeof FOLLOW_UP_STATUS[number];

// Follow-up Task Priority
export const FOLLOW_UP_PRIORITY = ['low', 'normal', 'high', 'urgent'] as const;
export type FollowUpPriority = typeof FOLLOW_UP_PRIORITY[number];

// Follow-up Tasks - scheduled actions for sales team (auto-created from events)
export const followUpTasks = pgTable("follow_up_tasks", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  
  // Task details
  title: varchar("title", { length: 255 }).notNull(), // e.g., "Follow up on Quote #Q-1234"
  description: text("description"),
  taskType: varchar("task_type", { length: 50 }).notNull(), // quote_follow_up, sample_follow_up, check_in, etc.
  priority: varchar("priority", { length: 20 }).notNull().default("normal"), // low, normal, high, urgent
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, completed, snoozed, cancelled
  
  // Scheduling
  dueDate: timestamp("due_date").notNull(), // When this should be done
  reminderDate: timestamp("reminder_date"), // Optional reminder before due date
  snoozedUntil: timestamp("snoozed_until"), // If snoozed, when to resurface
  
  // Link to source activity
  sourceEventId: integer("source_event_id").references(() => customerActivityEvents.id, { onDelete: "set null" }),
  sourceType: varchar("source_type", { length: 50 }), // What triggered this: 'quote', 'sample', 'idle_account', etc.
  sourceId: varchar("source_id"), // ID of the source (quote ID, sample ID)
  
  // Assignment
  assignedTo: varchar("assigned_to"), // User ID of assignee
  assignedToName: varchar("assigned_to_name", { length: 255 }),
  
  // Completion
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  completionNotes: text("completion_notes"),
  
  // Auto-created flag
  isAutoGenerated: boolean("is_auto_generated").default(false),
  
  // Google Calendar integration
  calendarEventId: varchar("calendar_event_id"), // ID of synced Google Calendar event
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_follow_up_tasks_customer_id").on(table.customerId),
  index("IDX_follow_up_tasks_due_date").on(table.dueDate),
  index("IDX_follow_up_tasks_status").on(table.status),
  index("IDX_follow_up_tasks_assigned_to").on(table.assignedTo),
]);

export const insertFollowUpTaskSchema = createInsertSchema(followUpTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type FollowUpTask = typeof followUpTasks.$inferSelect;
export type InsertFollowUpTask = z.infer<typeof insertFollowUpTaskSchema>;

// Product Exposure Log - which products have been shared with each customer
export const productExposureLog = pgTable("product_exposure_log", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productPricingMaster.id),
  productName: varchar("product_name", { length: 255 }).notNull(),
  productCategory: varchar("product_category", { length: 100 }),
  
  // How was it shared
  exposureType: varchar("exposure_type", { length: 50 }).notNull(), // 'quote', 'sample', 'brochure', 'price_list', 'email', 'meeting'
  sourceId: varchar("source_id"), // Link to quote, sample, etc.
  
  // Outcome tracking
  customerInterest: varchar("customer_interest", { length: 50 }), // 'high', 'medium', 'low', 'none', 'unknown'
  hasOrdered: boolean("has_ordered").default(false),
  orderDate: timestamp("order_date"),
  
  // Who shared it
  sharedBy: varchar("shared_by"),
  sharedByName: varchar("shared_by_name", { length: 255 }),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductExposureLogSchema = createInsertSchema(productExposureLog).omit({
  id: true,
  createdAt: true,
});
export type ProductExposureLog = typeof productExposureLog.$inferSelect;
export type InsertProductExposureLog = z.infer<typeof insertProductExposureLogSchema>;

// Customer Engagement Summary - aggregated stats for quick access (updated periodically)
export const customerEngagementSummary = pgTable("customer_engagement_summary", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().unique().references(() => customers.id, { onDelete: "cascade" }),
  
  // Contact cadence
  lastContactDate: timestamp("last_contact_date"),
  daysSinceLastContact: integer("days_since_last_contact"),
  totalContactsLast30Days: integer("total_contacts_last_30_days").default(0),
  totalContactsLast90Days: integer("total_contacts_last_90_days").default(0),
  
  // Quote activity
  totalQuotesSent: integer("total_quotes_sent").default(0),
  quotesLast30Days: integer("quotes_last_30_days").default(0),
  lastQuoteDate: timestamp("last_quote_date"),
  openQuotesCount: integer("open_quotes_count").default(0),
  quotesWithoutFollowUp: integer("quotes_without_follow_up").default(0),
  
  // Sample activity
  totalSamplesSent: integer("total_samples_sent").default(0),
  samplesLast90Days: integer("samples_last_90_days").default(0),
  lastSampleDate: timestamp("last_sample_date"),
  samplesWithoutConversion: integer("samples_without_conversion").default(0), // Samples that didn't lead to orders
  
  // Product exposure
  productsExposedCount: integer("products_exposed_count").default(0),
  productCategoriesExposed: text("product_categories_exposed").array().default([]),
  
  // Engagement score (0-100)
  engagementScore: integer("engagement_score").default(0),
  engagementTrend: varchar("engagement_trend", { length: 20 }), // 'improving', 'declining', 'stable'
  
  // Alerts/flags
  needsAttention: boolean("needs_attention").default(false),
  attentionReason: varchar("attention_reason", { length: 255 }),
  
  // Timestamps
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerEngagementSummarySchema = createInsertSchema(customerEngagementSummary).omit({
  id: true,
  updatedAt: true,
});
export type CustomerEngagementSummary = typeof customerEngagementSummary.$inferSelect;
export type InsertCustomerEngagementSummary = z.infer<typeof insertCustomerEngagementSummarySchema>;

// Follow-up Configuration - settings for auto-generated follow-ups
export const followUpConfig = pgTable("follow_up_config", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 50 }).notNull().unique(), // from ACTIVITY_EVENT_TYPES
  isEnabled: boolean("is_enabled").default(true),
  defaultDelayDays: integer("default_delay_days").notNull().default(1), // Days until follow-up due
  defaultPriority: varchar("default_priority", { length: 20 }).default("normal"),
  taskTitle: varchar("task_title", { length: 255 }).notNull(), // Template: "Follow up on {event}"
  taskDescription: text("task_description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFollowUpConfigSchema = createInsertSchema(followUpConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type FollowUpConfig = typeof followUpConfig.$inferSelect;
export type InsertFollowUpConfig = z.infer<typeof insertFollowUpConfigSchema>;

// User Tutorial Progress - tracks which tutorials each user has completed
export const userTutorialProgress = pgTable("user_tutorial_progress", {
  id: serial("id").primaryKey(),
  userEmail: varchar("user_email", { length: 255 }).notNull(),
  tutorialId: varchar("tutorial_id", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("not_started"), // not_started, in_progress, completed, skipped
  currentStep: integer("current_step").default(0),
  totalSteps: integer("total_steps").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  skippedAt: timestamp("skipped_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserTutorialProgressSchema = createInsertSchema(userTutorialProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type UserTutorialProgress = typeof userTutorialProgress.$inferSelect;
export type InsertUserTutorialProgress = z.infer<typeof insertUserTutorialProgressSchema>;

// Email Templates - pre-composed email templates with dynamic variables
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  category: varchar("category", { length: 100 }).default("general"), // general, marketing, follow_up, product_info, account_payments, other
  usageType: varchar("usage_type", { length: 50 }).default("client_email"), // quick_quotes, price_list, client_email, marketing
  variables: jsonb("variables").$type<string[]>().default([]), // List of variable names used in template
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// Email Sends - log of sent emails for tracking
export const emailSends = pgTable("email_sends", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => emailTemplates.id, { onDelete: "set null" }),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  recipientName: varchar("recipient_name", { length: 255 }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  variableData: jsonb("variable_data").$type<Record<string, string>>().default({}), // Snapshot of variables used
  status: varchar("status", { length: 50 }).default("sent"), // draft, sent, failed
  sentBy: varchar("sent_by", { length: 255 }),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_email_sends_customer_id").on(table.customerId),
  index("IDX_email_sends_sent_at").on(table.sentAt),
]);

export const insertEmailSendSchema = createInsertSchema(emailSends).omit({
  id: true,
  sentAt: true,
  createdAt: true,
});
export type EmailSend = typeof emailSends.$inferSelect;
export type InsertEmailSend = z.infer<typeof insertEmailSendSchema>;

// Available template variables - defines what variables can be used in templates
export const EMAIL_TEMPLATE_VARIABLES = {
  // Client variables
  'client.name': { label: 'Client Name', description: 'Full name or company name', source: 'customer' },
  'client.firstName': { label: 'First Name', description: 'Client first name', source: 'customer' },
  'client.lastName': { label: 'Last Name', description: 'Client last name', source: 'customer' },
  'client.company': { label: 'Company', description: 'Company name', source: 'customer' },
  'client.email': { label: 'Client Email', description: 'Client email address', source: 'customer' },
  'client.salesRep': { label: 'Sales Rep', description: 'Assigned sales representative', source: 'customer' },
  // Product variables
  'product.name': { label: 'Product Name', description: 'Product name', source: 'product' },
  'product.type': { label: 'Product Type', description: 'Product type/category', source: 'product' },
  'product.size': { label: 'Product Size', description: 'Product size', source: 'product' },
  'product.itemCode': { label: 'Item Code', description: 'Product item code', source: 'product' },
  // Price variables
  'price.dealer': { label: 'Dealer Price', description: 'Dealer price tier', source: 'pricing' },
  'price.retail': { label: 'Retail Price', description: 'Retail price tier', source: 'pricing' },
  'price.export': { label: 'Export Price', description: 'Export price tier', source: 'pricing' },
  'price.masterDistributor': { label: 'Master Distributor Price', description: 'Master distributor price tier', source: 'pricing' },
  // User variables
  'user.name': { label: 'Your Name', description: 'Sender name', source: 'user' },
  'user.email': { label: 'Your Email', description: 'Sender email', source: 'user' },
  'user.signature': { label: 'Your Signature', description: 'Your email signature block', source: 'user' },
  // Custom variables
  'custom.text1': { label: 'Custom Text 1', description: 'Custom text field', source: 'custom' },
  'custom.text2': { label: 'Custom Text 2', description: 'Custom text field', source: 'custom' },
} as const;

export type EmailTemplateVariableKey = keyof typeof EMAIL_TEMPLATE_VARIABLES;

// ========================================
// EMAIL TRACKING - Open & Click Tracking
// ========================================

// Email Tracking Tokens - unique token per email for tracking
export const emailTrackingTokens = pgTable("email_tracking_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(), // Unique tracking token
  emailSendId: integer("email_send_id").references(() => emailSends.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  sentBy: varchar("sent_by", { length: 255 }),
  openCount: integer("open_count").default(0),
  clickCount: integer("click_count").default(0),
  firstOpenedAt: timestamp("first_opened_at"),
  lastOpenedAt: timestamp("last_opened_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_email_tracking_tokens_token").on(table.token),
  index("IDX_email_tracking_tokens_customer_id").on(table.customerId),
  index("IDX_email_tracking_tokens_email_send_id").on(table.emailSendId),
]);

export const insertEmailTrackingTokenSchema = createInsertSchema(emailTrackingTokens).omit({
  id: true,
  openCount: true,
  clickCount: true,
  firstOpenedAt: true,
  lastOpenedAt: true,
  createdAt: true,
});
export type EmailTrackingToken = typeof emailTrackingTokens.$inferSelect;
export type InsertEmailTrackingToken = z.infer<typeof insertEmailTrackingTokenSchema>;

// Email Tracking Events - log of opens and clicks
export const emailTrackingEvents = pgTable("email_tracking_events", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id").references(() => emailTrackingTokens.id, { onDelete: "cascade" }).notNull(),
  eventType: varchar("event_type", { length: 20 }).notNull(), // 'open' or 'click'
  linkUrl: text("link_url"), // For clicks, the original destination URL
  linkText: varchar("link_text", { length: 255 }), // For clicks, the link text or description
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_email_tracking_events_token_id").on(table.tokenId),
  index("IDX_email_tracking_events_event_type").on(table.eventType),
  index("IDX_email_tracking_events_created_at").on(table.createdAt),
]);

export const insertEmailTrackingEventSchema = createInsertSchema(emailTrackingEvents).omit({
  id: true,
  createdAt: true,
});
export type EmailTrackingEvent = typeof emailTrackingEvents.$inferSelect;
export type InsertEmailTrackingEvent = z.infer<typeof insertEmailTrackingEventSchema>;

// Email Signatures - user-configurable email signatures
export const emailSignatures = pgTable("email_signatures", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  title: varchar("title", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  signatureHtml: text("signature_html").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailSignatureSchema = createInsertSchema(emailSignatures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EmailSignature = typeof emailSignatures.$inferSelect;
export type InsertEmailSignature = z.infer<typeof insertEmailSignatureSchema>;

// ========================================
// COACH-STYLE B2B CUSTOMER JOURNEY
// ========================================

// Account States - auto-computed from order/engagement data
export const ACCOUNT_STATES = ['prospect', 'first_trust', 'expansion_possible', 'expansion_in_progress', 'multi_category', 'embedded'] as const;
export type AccountState = typeof ACCOUNT_STATES[number];

export const ACCOUNT_STATE_CONFIG = {
  prospect: { label: 'Prospect', description: 'No orders yet', color: 'gray' },
  first_trust: { label: 'First Trust', description: '1 category adopted', color: 'blue' },
  expansion_possible: { label: 'Expansion Possible', description: 'Could expand to more categories', color: 'purple' },
  expansion_in_progress: { label: 'Expansion In Progress', description: 'Testing new categories', color: 'indigo' },
  multi_category: { label: 'Multi-Category', description: 'Ordering multiple categories', color: 'green' },
  embedded: { label: 'Embedded', description: 'Fully integrated supplier', color: 'emerald' },
} as const;

// Machine Profile - customer's press/machine types
export const MACHINE_FAMILIES = [
  { id: 'offset', label: 'Offset', brands: ['Heidelberg', 'Komori', 'KBA', 'Manroland'] },
  { id: 'digital_toner', label: 'Digital Toner', brands: ['Xerox', 'Canon', 'Ricoh', 'Konica Minolta'] },
  { id: 'digital_inkjet', label: 'Digital Inkjet', brands: ['HP Indigo', 'Screen', 'Fujifilm'] },
  { id: 'wide_format', label: 'Wide Format', brands: ['HP Latex', 'Roland', 'Mimaki', 'Canon'] },
  { id: 'flexo', label: 'Flexo', brands: ['Mark Andy', 'Nilpeter', 'Gallus'] },
  { id: 'label', label: 'Label Press', brands: ['HP Indigo', 'Epson', 'Durst'] },
  { id: 'distributor', label: 'Distributor', brands: [], autoAssignToAneesh: true },
  { id: 'dealer', label: 'Dealer', brands: [], autoAssignToAneesh: true },
] as const;

// Machine families that should auto-assign customer to Aneesh
export const ANEESH_AUTO_ASSIGN_MACHINE_TYPES = ['distributor', 'dealer'] as const;

export type MachineFamily = typeof MACHINE_FAMILIES[number]['id'];

// Category Trust States - 5 progression levels
export const CATEGORY_STATES = ['not_introduced', 'introduced', 'evaluated', 'adopted', 'habitual'] as const;
export type CategoryState = typeof CATEGORY_STATES[number];

export const CATEGORY_STATE_CONFIG = {
  not_introduced: { label: 'Not Introduced', progress: 0, color: 'gray' },
  introduced: { label: 'Introduced', progress: 25, color: 'blue' },
  evaluated: { label: 'Evaluated', progress: 50, color: 'purple' },
  adopted: { label: 'Adopted', progress: 75, color: 'green' },
  habitual: { label: 'Habitual', progress: 100, color: 'emerald' },
} as const;

// Objection Types for logging
export const OBJECTION_TYPES = ['price', 'compatibility', 'moq', 'lead_time', 'has_supplier', 'other'] as const;
export type ObjectionType = typeof OBJECTION_TYPES[number];

// Reorder Status
export const REORDER_STATUSES = ['upcoming', 'due', 'overdue', 'at_risk'] as const;
export type ReorderStatus = typeof REORDER_STATUSES[number];

// Legacy aliases for backwards compatibility
export const CUSTOMER_STATES = ACCOUNT_STATES;
export type CustomerState = AccountState;
export const TRUST_LEVELS = CATEGORY_STATES;
export type TrustLevel = CategoryState;

// Category Trust - tracks trust level per customer per product category + machine type
export const categoryTrust = pgTable("category_trust", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  categoryCode: varchar("category_code", { length: 100 }).notNull(), // canonical immutable code (GRAFFITI_POLY_PAPER, SOLVIT_SIGN, etc.)
  categoryName: varchar("category_name", { length: 100 }), // display name (for backwards compatibility, deprecated)
  machineType: varchar("machine_type", { length: 100 }), // press type (offset, digital, flexo, etc.)
  trustLevel: varchar("trust_level", { length: 50 }).notNull().default("unknown"), // matches TRUST_LEVELS
  samplesSent: integer("samples_sent").default(0),
  samplesApproved: integer("samples_approved").default(0),
  quotesSent: integer("quotes_sent").default(0),
  ordersPlaced: integer("orders_placed").default(0),
  lastSampleDate: timestamp("last_sample_date"),
  lastOrderDate: timestamp("last_order_date"),
  firstOrderDate: timestamp("first_order_date"),
  totalOrderValue: decimal("total_order_value", { precision: 12, scale: 2 }).default("0"),
  avgOrderFrequencyDays: integer("avg_order_frequency_days"), // average days between orders
  nextReorderDue: timestamp("next_reorder_due"), // predicted reorder date
  reorderStatus: varchar("reorder_status", { length: 50 }), // on_track, due_soon, overdue, at_risk
  notes: text("notes"),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCategoryTrustSchema = createInsertSchema(categoryTrust).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CategoryTrust = typeof categoryTrust.$inferSelect;
export type InsertCategoryTrust = z.infer<typeof insertCategoryTrustSchema>;

// Customer Coach State - aggregated customer state with single nudge
export const customerCoachState = pgTable("customer_coach_state", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().unique().references(() => customers.id, { onDelete: "cascade" }),
  currentState: varchar("current_state", { length: 50 }).notNull().default("prospect"), // matches CUSTOMER_STATES
  stateConfidence: integer("state_confidence").default(0), // 0-100% confidence in state
  primaryCategoryCode: varchar("primary_category_code", { length: 100 }), // main product category code (canonical)
  totalLifetimeValue: decimal("total_lifetime_value", { precision: 12, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  avgOrderValue: decimal("avg_order_value", { precision: 10, scale: 2 }),
  daysSinceLastOrder: integer("days_since_last_order"),
  daysSinceLastContact: integer("days_since_last_contact"),
  nextNudgeAction: varchar("next_nudge_action", { length: 100 }), // single coach action
  nextNudgeReason: text("next_nudge_reason"), // why this action
  nextNudgePriority: varchar("next_nudge_priority", { length: 20 }).default("normal"), // low, normal, high, urgent
  nextNudgeDueDate: timestamp("next_nudge_due_date"),
  stuckCategoryCode: varchar("stuck_category_code", { length: 100 }), // category code where progress stalled
  stuckDays: integer("stuck_days"), // days stuck in current state
  lastStateChange: timestamp("last_state_change"),
  lastCalculated: timestamp("last_calculated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerCoachStateSchema = createInsertSchema(customerCoachState).omit({
  id: true,
  lastCalculated: true,
  createdAt: true,
  updatedAt: true,
});
export type CustomerCoachState = typeof customerCoachState.$inferSelect;
export type InsertCustomerCoachState = z.infer<typeof insertCustomerCoachStateSchema>;

// Coach Nudge Actions - predefined actions with click tracking
export const COACH_NUDGE_ACTIONS = {
  send_swatchbook: { label: 'Send SwatchBook', icon: 'palette', priority: 'normal' },
  send_sample: { label: 'Send Sample', icon: 'package', priority: 'normal' },
  follow_up_sample: { label: 'Follow Up on Sample', icon: 'phone', priority: 'high' },
  send_quote: { label: 'Send Quote', icon: 'file-text', priority: 'normal' },
  follow_up_quote: { label: 'Follow Up Quote', icon: 'phone', priority: 'high' },
  check_reorder: { label: 'Check Reorder Status', icon: 'refresh-cw', priority: 'high' },
  win_back: { label: 'Win Back Customer', icon: 'heart', priority: 'urgent' },
  schedule_call: { label: 'Schedule Call', icon: 'calendar', priority: 'normal' },
  celebrate_milestone: { label: 'Celebrate Milestone', icon: 'trophy', priority: 'low' },
} as const;

export type CoachNudgeAction = keyof typeof COACH_NUDGE_ACTIONS;

// Customer Machine Profiles - tracks which machines customer has
export const customerMachineProfiles = pgTable("customer_machine_profiles", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  machineFamily: varchar("machine_family", { length: 50 }).notNull(), // matches MACHINE_FAMILIES id
  status: varchar("status", { length: 20 }).notNull().default("inferred"), // inferred, confirmed
  source: varchar("source", { length: 100 }), // how we know (sample request, order, user confirmed)
  otherDetails: text("other_details"), // additional details when machineFamily is 'other'
  touchCount: integer("touch_count").default(0), // number of interactions related to this machine
  confirmedAt: timestamp("confirmed_at"),
  confirmedBy: varchar("confirmed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerMachineProfileSchema = createInsertSchema(customerMachineProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CustomerMachineProfile = typeof customerMachineProfiles.$inferSelect;
export type InsertCustomerMachineProfile = z.infer<typeof insertCustomerMachineProfileSchema>;

// Category Objections - log objections for each category
export const categoryObjections = pgTable("category_objections", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  categoryTrustId: integer("category_trust_id").references(() => categoryTrust.id, { onDelete: "cascade" }),
  categoryName: varchar("category_name", { length: 100 }).notNull(),
  objectionType: varchar("objection_type", { length: 50 }).notNull(), // matches OBJECTION_TYPES
  details: text("details"),
  status: varchar("status", { length: 50 }).notNull().default("open"), // open, addressed, won, lost
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCategoryObjectionSchema = createInsertSchema(categoryObjections).omit({
  id: true,
  createdAt: true,
});
export type CategoryObjection = typeof categoryObjections.$inferSelect;
export type InsertCategoryObjection = z.infer<typeof insertCategoryObjectionSchema>;

// Category-Machine Compatibility - defines which categories work with which machines
export const CATEGORY_MACHINE_COMPATIBILITY: Record<string, string[]> = {
  'offset': ['Commodity Cut-Size', 'Specialty Coated', 'Cover Stock', 'Text Weight', 'Opaque Offset'],
  'digital_toner': ['Digital Toner', 'Specialty Coated', 'Cover Stock', 'Labels'],
  'digital_inkjet': ['Digital Inkjet', 'Photo Paper', 'Proofing', 'Fine Art'],
  'wide_format': ['Large Format', 'Banner Material', 'Vinyl', 'Canvas', 'Backlit Film'],
  'flexo': ['Label Stocks', 'Tag Stock', 'Flexible Packaging'],
  'label': ['Label Stocks', 'Synthetic Labels', 'Thermal Transfer'],
};

// Next Best Move Rules - configurable nudge rules
export const COACH_RULES = [
  { id: 'confirm_machine', trigger: 'unprofiled_after_touches', touchThreshold: 2, priority: 'high', action: 'confirm_machine', message: 'Confirm machine type' },
  { id: 'reorder_reminder', trigger: 'reorder_due_soon', daysThreshold: 5, priority: 'high', action: 'check_reorder', message: 'Reorder due soon' },
  { id: 'follow_up_intro', trigger: 'introduced_no_followup', daysThreshold: 14, priority: 'normal', action: 'follow_up', message: 'Follow up on introduction' },
  { id: 'stuck_evaluation', trigger: 'evaluated_too_long', daysThreshold: 30, priority: 'normal', action: 'log_objection', message: 'Evaluation stalled - log objection' },
  { id: 'expand_category', trigger: 'single_category_adopted', priority: 'low', action: 'introduce_category', message: 'Introduce new category' },
] as const;

// Customer Journey Progress Stages
export const JOURNEY_PROGRESS_STAGES = [
  'machine_profile',
  'quotes',
  'press_kit',
  'call',
  'email',
  'rep_visit',
  'buyer',
  'try_and_try',
  'dont_worry',
] as const;

export type JourneyProgressStage = typeof JOURNEY_PROGRESS_STAGES[number];

// Customer Journey Progress - tracks which stages are completed per customer
export const customerJourneyProgress = pgTable("customer_journey_progress", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  stage: varchar("stage", { length: 50 }).notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerJourneyProgressSchema = createInsertSchema(customerJourneyProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CustomerJourneyProgress = typeof customerJourneyProgress.$inferSelect;
export type InsertCustomerJourneyProgress = z.infer<typeof insertCustomerJourneyProgressSchema>;

// Shopify Orders - synced from Shopify for coaching triggers
export const shopifyOrders = pgTable("shopify_orders", {
  id: serial("id").primaryKey(),
  shopifyOrderId: varchar("shopify_order_id", { length: 100 }).notNull().unique(),
  shopifyCustomerId: varchar("shopify_customer_id", { length: 100 }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  orderNumber: varchar("order_number", { length: 50 }),
  email: varchar("email", { length: 255 }),
  customerName: varchar("customer_name", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  financialStatus: varchar("financial_status", { length: 50 }),
  fulfillmentStatus: varchar("fulfillment_status", { length: 50 }),
  lineItems: jsonb("line_items"),
  shippingAddress: jsonb("shipping_address"),
  billingAddress: jsonb("billing_address"),
  tags: text("tags"),
  note: text("note"),
  shopifyCreatedAt: timestamp("shopify_created_at"),
  processedForCoaching: boolean("processed_for_coaching").default(false),
  coachingProcessedAt: timestamp("coaching_processed_at"),
  // Odoo sync tracking
  odooSynced: boolean("odoo_synced").default(false),
  odooSyncedAt: timestamp("odoo_synced_at"),
  odooOrderId: integer("odoo_order_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyOrderSchema = createInsertSchema(shopifyOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopifyOrder = typeof shopifyOrders.$inferSelect;
export type InsertShopifyOrder = z.infer<typeof insertShopifyOrderSchema>;

// Shopify Product Category Mappings - maps Shopify product tags/titles to coaching categories
export const shopifyProductMappings = pgTable("shopify_product_mappings", {
  id: serial("id").primaryKey(),
  shopifyProductTitle: varchar("shopify_product_title", { length: 255 }),
  shopifyProductTag: varchar("shopify_product_tag", { length: 255 }),
  shopifyProductType: varchar("shopify_product_type", { length: 255 }),
  categoryName: varchar("category_name", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyProductMappingSchema = createInsertSchema(shopifyProductMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopifyProductMapping = typeof shopifyProductMappings.$inferSelect;
export type InsertShopifyProductMapping = z.infer<typeof insertShopifyProductMappingSchema>;

// Shopify Customer Mappings - maps Shopify customers to CRM accounts for future auto-matching
export const shopifyCustomerMappings = pgTable("shopify_customer_mappings", {
  id: serial("id").primaryKey(),
  shopifyEmail: varchar("shopify_email", { length: 255 }),
  shopifyCompanyName: varchar("shopify_company_name", { length: 255 }),
  shopifyCustomerId: varchar("shopify_customer_id", { length: 100 }),
  crmCustomerId: varchar("crm_customer_id", { length: 100 }).notNull(),
  crmCustomerName: varchar("crm_customer_name", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyCustomerMappingSchema = createInsertSchema(shopifyCustomerMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopifyCustomerMapping = typeof shopifyCustomerMappings.$inferSelect;
export type InsertShopifyCustomerMapping = z.infer<typeof insertShopifyCustomerMappingSchema>;

// Shopify Integration Settings
export const shopifySettings = pgTable("shopify_settings", {
  id: serial("id").primaryKey(),
  shopDomain: varchar("shop_domain", { length: 255 }),
  webhookSecret: varchar("webhook_secret", { length: 255 }),
  isActive: boolean("is_active").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  ordersProcessed: integer("orders_processed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shopify App Install - stores OAuth access tokens for installed shops
export const shopifyInstalls = pgTable("shopify_installs", {
  id: serial("id").primaryKey(),
  shop: varchar("shop", { length: 255 }).notNull().unique(), // e.g., "mystore.myshopify.com"
  accessToken: varchar("access_token", { length: 255 }).notNull(),
  scope: varchar("scope", { length: 500 }),
  isActive: boolean("is_active").default(true),
  installedAt: timestamp("installed_at").defaultNow(),
  uninstalledAt: timestamp("uninstalled_at"),
  lastApiCallAt: timestamp("last_api_call_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyInstallSchema = createInsertSchema(shopifyInstalls).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopifyInstall = typeof shopifyInstalls.$inferSelect;
export type InsertShopifyInstall = z.infer<typeof insertShopifyInstallSchema>;

// Shopify Webhook Events - logs all incoming webhooks for debugging and processing
export const shopifyWebhookEvents = pgTable("shopify_webhook_events", {
  id: serial("id").primaryKey(),
  shop: varchar("shop", { length: 255 }).notNull(),
  topic: varchar("topic", { length: 100 }).notNull(), // e.g., "orders/paid", "customers/create"
  shopifyId: varchar("shopify_id", { length: 100 }), // order_id or customer_id
  payload: jsonb("payload").notNull(),
  hmacValid: boolean("hmac_valid"),
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShopifyWebhookEventSchema = createInsertSchema(shopifyWebhookEvents).omit({
  id: true,
  createdAt: true,
});
export type ShopifyWebhookEvent = typeof shopifyWebhookEvents.$inferSelect;
export type InsertShopifyWebhookEvent = z.infer<typeof insertShopifyWebhookEventSchema>;

// QuickQuote to Shopify Variant Mappings - maps QuickQuote products to Shopify variants for draft orders
export const shopifyVariantMappings = pgTable("shopify_variant_mappings", {
  id: serial("id").primaryKey(),
  productPricingId: integer("product_pricing_id").references(() => productPricingMaster.id, { onDelete: "cascade" }),
  itemCode: varchar("item_code", { length: 100 }), // QuickQuote item code
  productName: varchar("product_name", { length: 255 }), // QuickQuote product name for display
  shopifyProductId: varchar("shopify_product_id", { length: 100 }), // Shopify product GID
  shopifyVariantId: varchar("shopify_variant_id", { length: 100 }).notNull(), // Shopify variant GID
  shopifyProductTitle: varchar("shopify_product_title", { length: 255 }), // Shopify product title for display
  shopifyVariantTitle: varchar("shopify_variant_title", { length: 255 }), // Shopify variant title
  shopifyPrice: decimal("shopify_price", { precision: 10, scale: 2 }), // Current Shopify price
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyVariantMappingSchema = createInsertSchema(shopifyVariantMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopifyVariantMapping = typeof shopifyVariantMappings.$inferSelect;
export type InsertShopifyVariantMapping = z.infer<typeof insertShopifyVariantMappingSchema>;

// Shopify Draft Orders - tracks draft orders created from QuickQuotes
export const shopifyDraftOrders = pgTable("shopify_draft_orders", {
  id: serial("id").primaryKey(),
  sentQuoteId: integer("sent_quote_id").references(() => sentQuotes.id, { onDelete: "set null" }),
  quoteNumber: varchar("quote_number", { length: 50 }),
  customerId: varchar("customer_id", { length: 100 }), // CRM customer ID
  customerEmail: varchar("customer_email", { length: 255 }),
  shopifyDraftOrderId: varchar("shopify_draft_order_id", { length: 100 }), // Shopify draft order GID
  shopifyDraftOrderNumber: varchar("shopify_draft_order_number", { length: 50 }), // e.g., #D123
  invoiceUrl: varchar("invoice_url", { length: 1000 }), // URL customer can use to complete purchase
  status: varchar("status", { length: 50 }).default("open"), // open, invoice_sent, completed, cancelled
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
  lineItemsCount: integer("line_items_count"),
  shopifyOrderId: varchar("shopify_order_id", { length: 100 }), // If converted to order
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyDraftOrderSchema = createInsertSchema(shopifyDraftOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopifyDraftOrder = typeof shopifyDraftOrders.$inferSelect;
export type InsertShopifyDraftOrder = z.infer<typeof insertShopifyDraftOrderSchema>;

// ============================================
// ADMIN RULES & CONFIG SYSTEM
// ============================================

// Admin Config Versions - tracks published config snapshots for rollback
export const adminConfigVersions = pgTable("admin_config_versions", {
  id: serial("id").primaryKey(),
  configType: varchar("config_type", { length: 50 }).notNull(), // 'machine_types', 'categories', 'coaching_timers', 'nudge_settings', 'scripts', 'sku_mappings'
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // 'draft', 'published', 'archived'
  configData: jsonb("config_data").notNull(), // Full snapshot of config at this version
  publishedBy: varchar("published_by"),
  publishedAt: timestamp("published_at"),
  validationErrors: jsonb("validation_errors"), // Any validation warnings/errors
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminConfigVersionSchema = createInsertSchema(adminConfigVersions).omit({
  id: true,
  createdAt: true,
});
export type AdminConfigVersion = typeof adminConfigVersions.$inferSelect;
export type InsertAdminConfigVersion = z.infer<typeof insertAdminConfigVersionSchema>;

// Admin Audit Log - tracks all admin changes
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  configType: varchar("config_type", { length: 50 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(), // 'create', 'update', 'delete', 'publish', 'rollback'
  entityId: varchar("entity_id", { length: 100 }), // ID of the affected entity
  entityName: varchar("entity_name", { length: 255 }), // Display name for context
  beforeData: jsonb("before_data"), // State before change
  afterData: jsonb("after_data"), // State after change
  userId: varchar("user_id").notNull(),
  userEmail: varchar("user_email", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({
  id: true,
  createdAt: true,
});
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;

// Admin Machine Types - configurable machine types for category compatibility
export const adminMachineTypes = pgTable("admin_machine_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(), // 'offset', 'digital_dry_toner', 'hp_indigo', 'inkjet', 'flexo', 'wide_format'
  label: varchar("label", { length: 100 }).notNull(), // Display name
  icon: varchar("icon", { length: 50 }), // Icon name from lucide-react
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminMachineTypeSchema = createInsertSchema(adminMachineTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminMachineType = typeof adminMachineTypes.$inferSelect;
export type InsertAdminMachineType = z.infer<typeof insertAdminMachineTypeSchema>;

// Admin Category Groups - groups for organizing categories
export const adminCategoryGroups = pgTable("admin_category_groups", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(), // 'labels', 'synthetic', 'specialty', etc.
  label: varchar("label", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }), // Badge color
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminCategoryGroupSchema = createInsertSchema(adminCategoryGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminCategoryGroup = typeof adminCategoryGroups.$inferSelect;
export type InsertAdminCategoryGroup = z.infer<typeof insertAdminCategoryGroupSchema>;

// Admin Categories - the 48 product categories with machine compatibility
export const adminCategories = pgTable("admin_categories", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(), // 'graffitistick', 'rang_lux', etc.
  label: varchar("label", { length: 255 }).notNull(), // Display name
  groupId: integer("group_id").references(() => adminCategoryGroups.id, { onDelete: "set null" }),
  compatibleMachineTypes: text("compatible_machine_types").array(), // Array of machine type codes
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminCategorySchema = createInsertSchema(adminCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminCategory = typeof adminCategories.$inferSelect;
export type InsertAdminCategory = z.infer<typeof insertAdminCategorySchema>;

// Admin Category Variants - sub-variants of categories (e.g., GraffitiStick variants)
export const adminCategoryVariants = pgTable("admin_category_variants", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => adminCategories.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminCategoryVariantSchema = createInsertSchema(adminCategoryVariants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminCategoryVariant = typeof adminCategoryVariants.$inferSelect;
export type InsertAdminCategoryVariant = z.infer<typeof insertAdminCategoryVariantSchema>;

// Admin SKU Mappings - maps Shopify SKUs to internal categories
export const adminSkuMappings = pgTable("admin_sku_mappings", {
  id: serial("id").primaryKey(),
  ruleType: varchar("rule_type", { length: 20 }).notNull().default("exact"), // 'exact', 'prefix', 'regex'
  pattern: varchar("pattern", { length: 255 }).notNull(), // SKU pattern or exact match
  categoryId: integer("category_id").references(() => adminCategories.id, { onDelete: "cascade" }),
  categoryCode: varchar("category_code", { length: 100 }), // Fallback if category deleted
  priority: integer("priority").default(0), // Higher priority = checked first (for overrides)
  description: text("description"), // Notes about this mapping
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminSkuMappingSchema = createInsertSchema(adminSkuMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminSkuMapping = typeof adminSkuMappings.$inferSelect;
export type InsertAdminSkuMapping = z.infer<typeof insertAdminSkuMappingSchema>;

// Admin Coaching Timers - configurable timing parameters
export const adminCoachingTimers = pgTable("admin_coaching_timers", {
  id: serial("id").primaryKey(),
  timerKey: varchar("timer_key", { length: 100 }).notNull().unique(), // 'quote_followup_soft', 'quote_followup_risk', etc.
  label: varchar("label", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // 'quote_followup', 'press_test', 'habitual', 'stale_account'
  valueDays: integer("value_days").notNull(), // Number of days
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminCoachingTimerSchema = createInsertSchema(adminCoachingTimers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminCoachingTimer = typeof adminCoachingTimers.$inferSelect;
export type InsertAdminCoachingTimer = z.infer<typeof insertAdminCoachingTimerSchema>;

// Admin Nudge Settings - configurable nudge engine parameters
export const adminNudgeSettings = pgTable("admin_nudge_settings", {
  id: serial("id").primaryKey(),
  nudgeKey: varchar("nudge_key", { length: 100 }).notNull().unique(), // 'press_test_followup', 'quote_followup', 'reorder_due', etc.
  label: varchar("label", { length: 255 }).notNull(),
  priority: integer("priority").notNull().default(50), // Lower = higher priority
  severity: varchar("severity", { length: 20 }).notNull().default("medium"), // 'low', 'medium', 'high', 'critical'
  isEnabled: boolean("is_enabled").default(true),
  description: text("description"),
  triggerConditions: jsonb("trigger_conditions"), // Optional conditions for when nudge applies
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminNudgeSettingSchema = createInsertSchema(adminNudgeSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminNudgeSetting = typeof adminNudgeSettings.$inferSelect;
export type InsertAdminNudgeSetting = z.infer<typeof insertAdminNudgeSettingSchema>;

// Admin Conversation Scripts - editable conversation templates
export const adminConversationScripts = pgTable("admin_conversation_scripts", {
  id: serial("id").primaryKey(),
  scriptKey: varchar("script_key", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  stage: varchar("stage", { length: 50 }).notNull(), // 'prospect', 'expansion', 'retention'
  persona: varchar("persona", { length: 50 }).notNull(), // 'distributor', 'end_customer', 'all'
  situation: varchar("situation", { length: 100 }), // 'cold_call', 'followup', 'objection_handling', etc.
  scriptContent: text("script_content").notNull(), // The actual script text
  talkingPoints: text("talking_points").array(), // Key bullet points
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminConversationScriptSchema = createInsertSchema(adminConversationScripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdminConversationScript = typeof adminConversationScripts.$inferSelect;
export type InsertAdminConversationScript = z.infer<typeof insertAdminConversationScriptSchema>;

// Catalog Product Types - ProductType within each category (from CSV)
// Maps to the "ProductType" column in pricing CSV
export const catalogProductTypes = pgTable("catalog_product_types", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => adminCategories.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 255 }).notNull().unique(), // Slugified ProductType
  label: varchar("label", { length: 255 }).notNull(), // Original ProductType value
  subfamily: varchar("subfamily", { length: 100 }), // For Rang Duo/Lux, EiE/eLe split
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCatalogProductTypeSchema = createInsertSchema(catalogProductTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CatalogProductType = typeof catalogProductTypes.$inferSelect;
export type InsertCatalogProductType = z.infer<typeof insertCatalogProductTypeSchema>;

// Shopify Unmapped Items - queue for order line items that couldn't be matched
export const shopifyUnmappedItems = pgTable("shopify_unmapped_items", {
  id: serial("id").primaryKey(),
  shopifyOrderId: varchar("shopify_order_id", { length: 100 }).notNull(),
  shopifyLineItemId: varchar("shopify_line_item_id", { length: 100 }),
  sku: varchar("sku", { length: 255 }),
  productTitle: varchar("product_title", { length: 500 }),
  variantTitle: varchar("variant_title", { length: 255 }),
  quantity: integer("quantity").default(1),
  price: decimal("price", { precision: 10, scale: 2 }),
  // Resolution fields
  resolvedCategoryId: integer("resolved_category_id").references(() => adminCategories.id, { onDelete: "set null" }),
  resolvedProductTypeId: integer("resolved_product_type_id").references(() => catalogProductTypes.id, { onDelete: "set null" }),
  resolvedItemCode: varchar("resolved_item_code", { length: 100 }),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  resolvedAt: timestamp("resolved_at"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'resolved', 'ignored'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyUnmappedItemSchema = createInsertSchema(shopifyUnmappedItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopifyUnmappedItem = typeof shopifyUnmappedItems.$inferSelect;
export type InsertShopifyUnmappedItem = z.infer<typeof insertShopifyUnmappedItemSchema>;

// Catalog Import Logs - track CSV import batches
export const catalogImportLogs = pgTable("catalog_import_logs", {
  id: serial("id").primaryKey(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  importedBy: varchar("imported_by", { length: 255 }),
  importedByEmail: varchar("imported_by_email", { length: 255 }),
  categoriesCreated: integer("categories_created").default(0),
  categoriesUpdated: integer("categories_updated").default(0),
  productTypesCreated: integer("product_types_created").default(0),
  productTypesUpdated: integer("product_types_updated").default(0),
  variantsCreated: integer("variants_created").default(0),
  variantsUpdated: integer("variants_updated").default(0),
  errors: jsonb("errors"), // Array of error messages
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'completed', 'failed'
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCatalogImportLogSchema = createInsertSchema(catalogImportLogs).omit({
  id: true,
  createdAt: true,
});
export type CatalogImportLog = typeof catalogImportLogs.$inferSelect;
export type InsertCatalogImportLog = z.infer<typeof insertCatalogImportLogSchema>;

// ===== DRIP EMAIL CAMPAIGNS =====

// Drip Campaigns - main campaign configuration
export const dripCampaigns = pgTable("drip_campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(false),
  triggerType: varchar("trigger_type", { length: 50 }).default("manual"), // manual, on_signup, on_purchase, on_quote
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDripCampaignSchema = createInsertSchema(dripCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DripCampaign = typeof dripCampaigns.$inferSelect;
export type InsertDripCampaign = z.infer<typeof insertDripCampaignSchema>;

// Drip Campaign Steps - individual email steps with delays
export const dripCampaignSteps = pgTable("drip_campaign_steps", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => dripCampaigns.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(), // HTML content from rich text editor
  delayAmount: integer("delay_amount").notNull().default(0), // 0 = send immediately
  delayUnit: varchar("delay_unit", { length: 20 }).default("days"), // minutes, hours, days, weeks
  templateId: integer("template_id").references(() => emailTemplates.id, { onDelete: "set null" }), // Optional base template
  attachments: jsonb("attachments").$type<Array<{ url: string; filename: string; type: string }>>().default([]),
  variables: jsonb("variables").$type<string[]>().default([]), // Variables used in this step
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDripCampaignStepSchema = createInsertSchema(dripCampaignSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DripCampaignStep = typeof dripCampaignSteps.$inferSelect;
export type InsertDripCampaignStep = z.infer<typeof insertDripCampaignStepSchema>;

// Drip Campaign Assignments - customer enrollments
export const dripCampaignAssignments = pgTable("drip_campaign_assignments", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => dripCampaigns.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("active"), // active, paused, completed, cancelled
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  pausedAt: timestamp("paused_at"),
  cancelledAt: timestamp("cancelled_at"),
  assignedBy: varchar("assigned_by", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDripCampaignAssignmentSchema = createInsertSchema(dripCampaignAssignments).omit({
  id: true,
  createdAt: true,
});
export type DripCampaignAssignment = typeof dripCampaignAssignments.$inferSelect;
export type InsertDripCampaignAssignment = z.infer<typeof insertDripCampaignAssignmentSchema>;

// Drip Campaign Step Status - tracking sent status for each step per assignment
export const dripCampaignStepStatus = pgTable("drip_campaign_step_status", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => dripCampaignAssignments.id, { onDelete: "cascade" }),
  stepId: integer("step_id").notNull().references(() => dripCampaignSteps.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status", { length: 20 }).default("scheduled"), // scheduled, sending, sent, failed, skipped
  sentAt: timestamp("sent_at"),
  emailSendId: integer("email_send_id").references(() => emailSends.id, { onDelete: "set null" }),
  gmailMessageId: varchar("gmail_message_id", { length: 255 }),
  lastError: text("last_error"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDripCampaignStepStatusSchema = createInsertSchema(dripCampaignStepStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DripCampaignStepStatus = typeof dripCampaignStepStatus.$inferSelect;
export type InsertDripCampaignStepStatus = z.infer<typeof insertDripCampaignStepStatusSchema>;

// Media Uploads - for storing images used in drip emails
export const mediaUploads = pgTable("media_uploads", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  uploadedBy: varchar("uploaded_by", { length: 255 }),
  usedIn: varchar("used_in", { length: 50 }).default("drip_email"), // drip_email, template, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMediaUploadSchema = createInsertSchema(mediaUploads).omit({
  id: true,
  createdAt: true,
});
export type MediaUpload = typeof mediaUploads.$inferSelect;
export type InsertMediaUpload = z.infer<typeof insertMediaUploadSchema>;

// ===== GMAIL INTELLIGENCE =====

// User Gmail Connections - per-user OAuth tokens for Gmail access
export const userGmailConnections = pgTable("user_gmail_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  gmailAddress: varchar("gmail_address", { length: 255 }).notNull(),
  gmailAddressNormalized: varchar("gmail_address_normalized", { length: 320 }), // Normalized gmail address
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  scope: text("scope"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("user_gmail_connections_user_id_idx").on(table.userId),
  gmailNormalizedIdx: index("user_gmail_connections_gmail_normalized_idx").on(table.gmailAddressNormalized),
}));

export const insertUserGmailConnectionSchema = createInsertSchema(userGmailConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type UserGmailConnection = typeof userGmailConnections.$inferSelect;
export type InsertUserGmailConnection = z.infer<typeof insertUserGmailConnectionSchema>;

// Gmail Sync State - track sync progress per user
export const gmailSyncState = pgTable("gmail_sync_state", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastHistoryId: varchar("last_history_id", { length: 100 }), // Gmail historyId for incremental sync
  lastSyncedAt: timestamp("last_synced_at"),
  syncStatus: varchar("sync_status", { length: 20 }).default("idle"), // idle, syncing, error
  lastError: text("last_error"),
  messagesProcessed: integer("messages_processed").default(0),
  insightsExtracted: integer("insights_extracted").default(0),
  // Enhanced tracking for debug panel
  lastQuery: text("last_query"), // The Gmail query used (e.g. "in:inbox after:...")
  threadsFound: integer("threads_found").default(0),
  messagesStored: integer("messages_stored").default(0),
  matchedToCustomers: integer("matched_to_customers").default(0),
  unmatchedCount: integer("unmatched_count").default(0),
  eventsExtracted: integer("events_extracted").default(0),
  syncStartedAt: timestamp("sync_started_at"),
  syncCompletedAt: timestamp("sync_completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGmailSyncStateSchema = createInsertSchema(gmailSyncState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type GmailSyncState = typeof gmailSyncState.$inferSelect;
export type InsertGmailSyncState = z.infer<typeof insertGmailSyncStateSchema>;

// Gmail Messages - store processed email messages
export const gmailMessages = pgTable("gmail_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  gmailMessageId: varchar("gmail_message_id", { length: 100 }).notNull(),
  threadId: varchar("thread_id", { length: 100 }),
  direction: varchar("direction", { length: 10 }).notNull(), // 'inbound' or 'outbound'
  fromEmail: varchar("from_email", { length: 255 }),
  fromEmailNormalized: varchar("from_email_normalized", { length: 320 }), // Normalized sender email
  fromName: varchar("from_name", { length: 255 }),
  toEmail: varchar("to_email", { length: 255 }),
  toEmailNormalized: varchar("to_email_normalized", { length: 320 }), // Normalized recipient email
  toName: varchar("to_name", { length: 255 }),
  ccEmails: text("cc_emails"), // CC recipients (comma-separated raw)
  ccEmailsNormalized: text("cc_emails_normalized"), // Normalized CC emails (comma-separated)
  subject: varchar("subject", { length: 1000 }),
  snippet: text("snippet"),
  bodyText: text("body_text"), // Plain text version
  sentAt: timestamp("sent_at"),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }), // Matched customer
  contactId: integer("contact_id").references(() => customerContacts.id, { onDelete: "set null" }), // Matched contact
  matchConfidence: decimal("match_confidence", { precision: 3, scale: 2 }), // 0.00-1.00 match confidence
  matchType: varchar("match_type", { length: 30 }), // exact_email, alias, domain, none
  matchedEmailNormalized: varchar("matched_email_normalized", { length: 320 }), // The email that triggered the match
  analysisStatus: varchar("analysis_status", { length: 20 }).default("pending"), // pending, processing, completed, failed
  analyzedAt: timestamp("analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  gmailMessageIdIdx: index("gmail_messages_gmail_id_idx").on(table.gmailMessageId),
  userIdIdx: index("gmail_messages_user_id_idx").on(table.userId),
  customerIdIdx: index("gmail_messages_customer_id_idx").on(table.customerId),
  fromEmailNormalizedIdx: index("gmail_messages_from_email_normalized_idx").on(table.fromEmailNormalized),
  toEmailNormalizedIdx: index("gmail_messages_to_email_normalized_idx").on(table.toEmailNormalized),
  userFromNormalizedIdx: index("gmail_messages_user_from_normalized_idx").on(table.userId, table.fromEmailNormalized),
}));

export const insertGmailMessageSchema = createInsertSchema(gmailMessages).omit({
  id: true,
  createdAt: true,
});
export type GmailMessage = typeof gmailMessages.$inferSelect;
export type InsertGmailMessage = z.infer<typeof insertGmailMessageSchema>;

// Gmail Insights - AI-extracted insights from emails
export const gmailInsights = pgTable("gmail_insights", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => gmailMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  insightType: varchar("insight_type", { length: 50 }).notNull(), // 'sales_opportunity', 'promise', 'follow_up', 'task', 'question'
  summary: text("summary").notNull(), // Brief description of the insight
  details: text("details"), // Full context from the email
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0.00 - 1.00
  dueDate: timestamp("due_date"), // When action is needed (for promises/follow-ups)
  priority: varchar("priority", { length: 10 }).default("medium"), // low, medium, high, urgent
  status: varchar("status", { length: 20 }).default("pending"), // pending, acknowledged, completed, dismissed
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by", { length: 255 }),
  dismissedAt: timestamp("dismissed_at"),
  dismissedReason: text("dismissed_reason"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}), // Additional AI context
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("gmail_insights_user_id_idx").on(table.userId),
  customerIdIdx: index("gmail_insights_customer_id_idx").on(table.customerId),
  statusIdx: index("gmail_insights_status_idx").on(table.status),
  dueDateIdx: index("gmail_insights_due_date_idx").on(table.dueDate),
}));

export const insertGmailInsightSchema = createInsertSchema(gmailInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type GmailInsight = typeof gmailInsights.$inferSelect;
export type InsertGmailInsight = z.infer<typeof insertGmailInsightSchema>;

// Gmail Deliverability Stats - track email deliverability health
// NOTE: This table is defined but not currently used in the application
export const gmailDeliverabilityStats = pgTable("gmail_deliverability_stats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  emailsSent: integer("emails_sent").default(0),
  emailsOpened: integer("emails_opened").default(0),
  emailsClicked: integer("emails_clicked").default(0),
  bounces: integer("bounces").default(0),
  spamReports: integer("spam_reports").default(0),
  openRate: decimal("open_rate", { precision: 5, scale: 2 }),
  clickRate: decimal("click_rate", { precision: 5, scale: 2 }),
  bounceRate: decimal("bounce_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGmailDeliverabilityStatsSchema = createInsertSchema(gmailDeliverabilityStats).omit({
  id: true,
  createdAt: true,
});
export type GmailDeliverabilityStats = typeof gmailDeliverabilityStats.$inferSelect;
export type InsertGmailDeliverabilityStats = z.infer<typeof insertGmailDeliverabilityStatsSchema>;

// Gmail Message Matches - link emails to customers with confidence scoring
export const gmailMessageMatches = pgTable("gmail_message_matches", {
  id: serial("id").primaryKey(),
  gmailMessageId: integer("gmail_message_id").notNull().references(() => gmailMessages.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => customerContacts.id, { onDelete: "set null" }), // Matched contact
  matchType: varchar("match_type", { length: 30 }).notNull(), // 'exact_email', 'alias', 'domain', 'manual'
  matchedEmail: varchar("matched_email", { length: 255 }),
  matchedEmailNormalized: varchar("matched_email_normalized", { length: 320 }), // Normalized email that triggered match
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(), // 0.00 - 1.00
  isConfirmed: boolean("is_confirmed").default(false),
  confirmedBy: varchar("confirmed_by", { length: 255 }),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  messageIdIdx: index("gmail_message_matches_message_idx").on(table.gmailMessageId),
  customerIdIdx: index("gmail_message_matches_customer_idx").on(table.customerId),
  normalizedEmailIdx: index("gmail_message_matches_email_normalized_idx").on(table.matchedEmailNormalized),
}));

export const insertGmailMessageMatchSchema = createInsertSchema(gmailMessageMatches).omit({
  id: true,
  createdAt: true,
});
export type GmailMessageMatch = typeof gmailMessageMatches.$inferSelect;
export type InsertGmailMessageMatch = z.infer<typeof insertGmailMessageMatchSchema>;

// Gmail Unmatched Emails - queue for manual customer linking
export const gmailUnmatchedEmails = pgTable("gmail_unmatched_emails", {
  id: serial("id").primaryKey(),
  gmailMessageId: integer("gmail_message_id").notNull().references(() => gmailMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }), // Gmail owner
  email: varchar("email", { length: 255 }).notNull(),
  emailNormalized: varchar("email_normalized", { length: 320 }), // Normalized email for matching
  domain: varchar("domain", { length: 255 }),
  senderName: varchar("sender_name", { length: 255 }),
  messageDate: timestamp("message_date"),
  subject: varchar("subject", { length: 500 }),
  matchAttempts: integer("match_attempts").default(1),
  lastAttemptAt: timestamp("last_attempt_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'linked', 'ignored'
  linkedCustomerId: varchar("linked_customer_id").references(() => customers.id, { onDelete: "set null" }),
  linkedContactId: integer("linked_contact_id").references(() => customerContacts.id, { onDelete: "set null" }),
  linkedBy: varchar("linked_by", { length: 255 }),
  linkedAt: timestamp("linked_at"),
  ignoredReason: text("ignored_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  emailIdx: index("gmail_unmatched_email_idx").on(table.email),
  emailNormalizedIdx: index("gmail_unmatched_email_normalized_idx").on(table.emailNormalized),
  domainIdx: index("gmail_unmatched_domain_idx").on(table.domain),
  statusIdx: index("gmail_unmatched_status_idx").on(table.status),
  userStatusIdx: index("gmail_unmatched_user_status_idx").on(table.userId, table.status),
}));

// Gmail Email Aliases - track email aliases for contacts (e.g., john@company.com and j.doe@company.com)
export const gmailEmailAliases = pgTable("gmail_email_aliases", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // User scope for data isolation
  primaryEmailNormalized: varchar("primary_email_normalized", { length: 320 }).notNull(), // The canonical email
  aliasEmailNormalized: varchar("alias_email_normalized", { length: 320 }).notNull(), // The alias email
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => customerContacts.id, { onDelete: "cascade" }),
  isVerified: boolean("is_verified").default(false), // Whether this alias has been confirmed
  source: varchar("source", { length: 50 }).default("auto"), // 'auto', 'manual', 'imported'
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userAliasIdx: index("gmail_email_aliases_user_alias_idx").on(table.userId, table.aliasEmailNormalized), // User-scoped alias lookup
  primaryIdx: index("gmail_email_aliases_primary_idx").on(table.primaryEmailNormalized),
  aliasIdx: index("gmail_email_aliases_alias_idx").on(table.aliasEmailNormalized),
  customerIdx: index("gmail_email_aliases_customer_idx").on(table.customerId),
  uniqueUserAlias: index("gmail_email_aliases_user_unique").on(table.userId, table.aliasEmailNormalized), // Unique alias per user
}));

export const insertGmailEmailAliasSchema = createInsertSchema(gmailEmailAliases).omit({
  id: true,
  createdAt: true,
});
export type GmailEmailAlias = typeof gmailEmailAliases.$inferSelect;
export type InsertGmailEmailAlias = z.infer<typeof insertGmailEmailAliasSchema>;

export const insertGmailUnmatchedEmailSchema = createInsertSchema(gmailUnmatchedEmails).omit({
  id: true,
  createdAt: true,
});
export type GmailUnmatchedEmail = typeof gmailUnmatchedEmails.$inferSelect;
export type InsertGmailUnmatchedEmail = z.infer<typeof insertGmailUnmatchedEmailSchema>;

// Bounced Email Detection - tracks emails that bounced for hygiene tasks
export const bouncedEmails = pgTable("bounced_emails", {
  id: serial("id").primaryKey(),
  bouncedEmail: varchar("bounced_email", { length: 255 }).notNull(),
  bouncedEmailNormalized: varchar("bounced_email_normalized", { length: 255 }).notNull(),
  bounceSubject: varchar("bounce_subject", { length: 500 }),
  bounceDate: timestamp("bounce_date").notNull(),
  bounceReason: text("bounce_reason"),
  gmailMessageId: varchar("gmail_message_id", { length: 100 }).notNull(),
  detectedBy: varchar("detected_by").notNull(),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => customerContacts.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  matchType: varchar("match_type", { length: 20 }),
  status: varchar("status", { length: 20 }).default("pending"),
  investigateUntil: timestamp("investigate_until"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolution: varchar("resolution", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_bounced_emails_email_normalized").on(table.bouncedEmailNormalized),
  index("IDX_bounced_emails_gmail_message_id").on(table.gmailMessageId),
  index("IDX_bounced_emails_status").on(table.status),
  index("IDX_bounced_emails_customer_id").on(table.customerId),
  index("IDX_bounced_emails_lead_id").on(table.leadId),
]);

export const insertBouncedEmailSchema = createInsertSchema(bouncedEmails).omit({
  id: true,
  createdAt: true,
});
export type BouncedEmail = typeof bouncedEmails.$inferSelect;
export type InsertBouncedEmail = z.infer<typeof insertBouncedEmailSchema>;

// Email Sales Events - rule-based extracted events from emails
export const EMAIL_SALES_EVENT_TYPES = [
  'po',                 // Purchase Orders - customer placing/confirming orders
  'approval',           // Approval - pricing/quote approvals, sign-offs
  'samples',            // Samples - sample requests, swatch requests
  'urgent',             // Urgent - time-sensitive requests, ASAP needs
  'opportunity',        // Opportunities - new projects, interest expressions
  'commitment',         // Commitments - scheduled meetings, confirmed timelines
  'action',             // Actions - specific tasks or follow-ups requested
  'feedback',           // Feedback - reviews, concerns, praise, issues
  'sales_win',          // Sales Win - order confirmed, deal closed, thank you for order
  'press_test_success', // Press Test Success - positive feedback on press test kit results
  'swatch_received',    // Swatch Received - customer confirming they received swatchbook
  'lead',               // Lead - new potential customer, first-time inquiry, referral
  'price_sent',         // Price Sent - pricing information sent to customer (outbound)
  'pricelist_sent',     // Price List Sent - PDF price list sent to customer (outbound)
  'quote_sent',         // Quote Sent - formal quote from Odoo sent to customer (outbound)
] as const;

export const emailSalesEvents = pgTable("email_sales_events", {
  id: serial("id").primaryKey(),
  gmailMessageId: integer("gmail_message_id").notNull().references(() => gmailMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 50 }).notNull(), // from EMAIL_SALES_EVENT_TYPES
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(), // 0.00 - 1.00
  triggerText: text("trigger_text"), // The text that triggered this event
  triggerKeywords: text("trigger_keywords"), // Matched keywords (comma-separated)
  occurredAt: timestamp("occurred_at").notNull(),
  followUpTaskId: integer("follow_up_task_id"), // Link to generated follow-up task
  coachingTip: text("coaching_tip"), // AI-generated tip (added later)
  isProcessed: boolean("is_processed").default(false),
  processedAt: timestamp("processed_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  messageIdIdx: index("email_sales_events_message_idx").on(table.gmailMessageId),
  userIdIdx: index("email_sales_events_user_idx").on(table.userId),
  customerIdIdx: index("email_sales_events_customer_idx").on(table.customerId),
  eventTypeIdx: index("email_sales_events_type_idx").on(table.eventType),
  occurredAtIdx: index("email_sales_events_occurred_idx").on(table.occurredAt),
}));

export const insertEmailSalesEventSchema = createInsertSchema(emailSalesEvents).omit({
  id: true,
  createdAt: true,
});
export type EmailSalesEvent = typeof emailSalesEvents.$inferSelect;
export type InsertEmailSalesEvent = z.infer<typeof insertEmailSalesEventSchema>;

// Email Intelligence Blacklist - emails/domains to exclude from event detection
export const emailIntelligenceBlacklist = pgTable("email_intelligence_blacklist", {
  id: serial("id").primaryKey(),
  pattern: varchar("pattern", { length: 255 }).notNull(), // email or domain pattern
  patternType: varchar("pattern_type", { length: 20 }).notNull().default("email"), // 'email' or 'domain'
  reason: text("reason"), // Why this was blacklisted
  addedBy: varchar("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  patternIdx: index("email_blacklist_pattern_idx").on(table.pattern),
}));

export const insertEmailIntelligenceBlacklistSchema = createInsertSchema(emailIntelligenceBlacklist).omit({
  id: true,
  createdAt: true,
});
export type EmailIntelligenceBlacklist = typeof emailIntelligenceBlacklist.$inferSelect;
export type InsertEmailIntelligenceBlacklist = z.infer<typeof insertEmailIntelligenceBlacklistSchema>;

// Daily User Performance - track achievements and wins per day
// NOTE: This table is defined but not currently used in the application
export const dailyUserPerformance = pgTable("daily_user_performance", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  purchaseOrdersReceived: integer("purchase_orders_received").default(0),
  pricingApprovalsReceived: integer("pricing_approvals_received").default(0),
  quotesCreated: integer("quotes_created").default(0),
  followUpsCompleted: integer("follow_ups_completed").default(0),
  emailsSent: integer("emails_sent").default(0),
  newCustomersAdded: integer("new_customers_added").default(0),
  coachingTip: text("coaching_tip"), // AI-generated coaching tip for improvement
  celebrationShown: boolean("celebration_shown").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateIdx: index("daily_performance_user_date_idx").on(table.userId, table.date),
}));

export const insertDailyUserPerformanceSchema = createInsertSchema(dailyUserPerformance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DailyUserPerformance = typeof dailyUserPerformance.$inferSelect;
export type InsertDailyUserPerformance = z.infer<typeof insertDailyUserPerformanceSchema>;

// Shipment Follow-up Tasks - track outbound shipments awaiting customer response
export const shipmentFollowUpTasks = pgTable("shipment_follow_up_tasks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  gmailMessageId: integer("gmail_message_id").references(() => gmailMessages.id, { onDelete: "set null" }),
  threadId: varchar("thread_id", { length: 100 }), // Gmail thread ID for tracking replies
  shipmentType: varchar("shipment_type", { length: 50 }).notNull(), // 'swatchbook', 'press_test_kit', 'samples', 'package'
  carrier: varchar("carrier", { length: 50 }), // 'ups', 'fedex', 'usps', 'other'
  trackingNumber: varchar("tracking_number", { length: 100 }),
  subject: varchar("subject", { length: 500 }), // Original email subject
  recipientEmail: varchar("recipient_email", { length: 255 }),
  recipientName: varchar("recipient_name", { length: 255 }),
  customerCompany: varchar("customer_company", { length: 255 }),
  sentAt: timestamp("sent_at"), // When shipment email was sent
  followUpDueDate: timestamp("follow_up_due_date").notNull(), // When to remind (default +4 days)
  status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'completed', 'dismissed'
  replyReceived: boolean("reply_received").default(false), // Auto-detected reply
  replyReceivedAt: timestamp("reply_received_at"),
  completedAt: timestamp("completed_at"),
  dismissedAt: timestamp("dismissed_at"),
  dismissedReason: text("dismissed_reason"),
  lastReminderAt: timestamp("last_reminder_at"),
  reminderCount: integer("reminder_count").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("shipment_followup_user_id_idx").on(table.userId),
  customerIdIdx: index("shipment_followup_customer_id_idx").on(table.customerId),
  statusIdx: index("shipment_followup_status_idx").on(table.status),
  dueDateIdx: index("shipment_followup_due_date_idx").on(table.followUpDueDate),
  threadIdIdx: index("shipment_followup_thread_id_idx").on(table.threadId),
}));

export const insertShipmentFollowUpTaskSchema = createInsertSchema(shipmentFollowUpTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShipmentFollowUpTask = typeof shipmentFollowUpTasks.$inferSelect;
export type InsertShipmentFollowUpTask = z.infer<typeof insertShipmentFollowUpTaskSchema>;

// API Cost Tracking - monitor usage and spending on external APIs
export const apiCostLogs = pgTable("api_cost_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  apiProvider: varchar("api_provider", { length: 50 }).notNull(), // 'openai', 'perplexity', 'google', etc.
  model: varchar("model", { length: 100 }), // 'gpt-4o', 'gpt-4o-mini', etc.
  operation: varchar("operation", { length: 100 }).notNull(), // 'gmail_analysis', 'chatbot', 'email_draft', etc.
  functionName: varchar("function_name", { length: 255 }), // The exact function that made the call
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }).default('0'), // In USD
  requestDurationMs: integer("request_duration_ms"), // How long the API call took
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("api_cost_logs_user_id_idx").on(table.userId),
  apiProviderIdx: index("api_cost_logs_api_provider_idx").on(table.apiProvider),
  operationIdx: index("api_cost_logs_operation_idx").on(table.operation),
  createdAtIdx: index("api_cost_logs_created_at_idx").on(table.createdAt),
}));

export const insertApiCostLogSchema = createInsertSchema(apiCostLogs).omit({
  id: true,
  createdAt: true,
});
export type ApiCostLog = typeof apiCostLogs.$inferSelect;
export type InsertApiCostLog = z.infer<typeof insertApiCostLogSchema>;

// Now Mode Coaching Moments - single-focus coaching stream
export const MOMENT_OUTCOMES = ['called', 'emailed', 'no_answer', 'pause', 'completed', 'skipped'] as const;
export type MomentOutcome = typeof MOMENT_OUTCOMES[number];

// NOW MODE Task Types - Priority order (1 = highest)
export const NOW_MODE_TASK_TYPES = {
  update_customer_data: { label: 'Update Customer Data', icon: 'user-cog', category: 'data', priority: 1, description: 'Mark Pricing Tiers, Sales Reps & Primary Email' },
  sync_address_email: { label: 'Sync Address/Email', icon: 'refresh-cw', category: 'data', priority: 2, description: 'Update missing address and email information' },
  identify_no_contact: { label: 'Identify No-Contact Customers', icon: 'user-x', category: 'outreach', priority: 3, description: 'Find customers with no emails or communication' },
  send_marketing_email: { label: 'Send Marketing Email', icon: 'mail', category: 'marketing', priority: 4, description: 'Send drip campaign or marketing email' },
  send_swatchbook: { label: 'Send SwatchBook', icon: 'book-open', category: 'samples', priority: 5, description: 'Send product swatchbook to customer' },
  send_press_test: { label: 'Send Press Test Sheet', icon: 'file-text', category: 'samples', priority: 6, description: 'Send press test sheet to customer' },
  send_price_list: { label: 'Send Price List', icon: 'list', category: 'sales', priority: 7, description: 'Send price list (after SwatchBook or Press Test)' },
  follow_up_materials: { label: 'Follow Up on Materials', icon: 'phone', category: 'follow_up', priority: 8, description: 'Follow up on SwatchBook, Press Test, or Price List sent' },
  make_call: { label: 'Make Call', icon: 'phone-call', category: 'outreach', priority: 9, description: 'Call at least 2 customers per day' },
} as const;
export type NowModeTaskType = keyof typeof NOW_MODE_TASK_TYPES;

export const MOMENT_ACTIONS = {
  follow_up_quote: { label: 'Follow Up on Quote', icon: 'phone', category: 'sales' },
  follow_up_sample: { label: 'Follow Up on Sample', icon: 'package', category: 'samples' },
  check_reorder: { label: 'Check Reorder Status', icon: 'refresh-cw', category: 'retention' },
  win_back: { label: 'Win Back Customer', icon: 'heart', category: 'retention' },
  send_sample: { label: 'Send Sample', icon: 'package', category: 'samples' },
  send_quote: { label: 'Send Quote', icon: 'file-text', category: 'sales' },
  confirm_machine: { label: 'Confirm Machine Type', icon: 'settings', category: 'data' },
  schedule_call: { label: 'Schedule a Call', icon: 'calendar', category: 'sales' },
  check_feedback: { label: 'Check Sample Feedback', icon: 'message-circle', category: 'samples' },
  introduce_category: { label: 'Introduce New Category', icon: 'layers', category: 'expansion' },
  ...NOW_MODE_TASK_TYPES,
} as const;
export type MomentAction = keyof typeof MOMENT_ACTIONS;

export const coachingMoments = pgTable("coaching_moments", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  assignedTo: varchar("assigned_to").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 100 }).notNull(),
  whyNow: text("why_now").notNull(),
  priority: integer("priority").notNull().default(50),
  scheduledFor: timestamp("scheduled_for").notNull().defaultNow(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  outcome: varchar("outcome", { length: 50 }),
  outcomeNotes: text("outcome_notes"),
  completedAt: timestamp("completed_at"),
  sourceType: varchar("source_type", { length: 50 }),
  sourceId: integer("source_id"),
  nextMomentId: integer("next_moment_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assignedToIdx: index("coaching_moments_assigned_to_idx").on(table.assignedTo),
  statusIdx: index("coaching_moments_status_idx").on(table.status),
  scheduledForIdx: index("coaching_moments_scheduled_for_idx").on(table.scheduledFor),
  customerIdx: index("coaching_moments_customer_id_idx").on(table.customerId),
}));

export const insertCoachingMomentSchema = createInsertSchema(coachingMoments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CoachingMoment = typeof coachingMoments.$inferSelect;
export type InsertCoachingMoment = z.infer<typeof insertCoachingMomentSchema>;

// ========================================
// SPOTLIGHT - Coaching Treadmill Events
// ========================================

export const spotlightEvents = pgTable("spotlight_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  bucket: varchar("bucket", { length: 30 }).notNull(),
  taskSubtype: varchar("task_subtype", { length: 50 }),
  outcomeId: varchar("outcome_id", { length: 50 }),
  outcomeLabel: varchar("outcome_label", { length: 100 }),
  skipReason: varchar("skip_reason", { length: 100 }),
  timeToActionMs: integer("time_to_action_ms"),
  scheduledFollowUpDays: integer("scheduled_follow_up_days"),
  markedDnc: boolean("marked_dnc").default(false),
  dayOfWeek: integer("day_of_week"),
  hourOfDay: integer("hour_of_day"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  eventTypeIdx: index("spotlight_events_event_type_idx").on(table.eventType),
  userIdx: index("spotlight_events_user_idx").on(table.userId),
  bucketIdx: index("spotlight_events_bucket_idx").on(table.bucket),
  createdAtIdx: index("spotlight_events_created_at_idx").on(table.createdAt),
  userDateIdx: index("spotlight_events_user_date_idx").on(table.userId, table.createdAt),
}));

export const insertSpotlightEventSchema = createInsertSchema(spotlightEvents).omit({
  id: true,
  createdAt: true,
});
export type SpotlightEvent = typeof spotlightEvents.$inferSelect;
export type InsertSpotlightEvent = z.infer<typeof insertSpotlightEventSchema>;

// Territory skip tracking - flags customers that all users have marked as "not my territory"
export const territorySkipFlags = pgTable("territory_skip_flags", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  skippedByUsers: text("skipped_by_users").array().notNull().default([]), // Array of user IDs who skipped
  totalActiveUsers: integer("total_active_users").notNull(), // Number of active users when flagged
  flaggedForAdminReview: boolean("flagged_for_admin_review").default(false),
  adminReviewedAt: timestamp("admin_reviewed_at"),
  adminReviewedBy: varchar("admin_reviewed_by"),
  adminDecision: varchar("admin_decision", { length: 20 }), // 'keep', 'delete', 'reassign'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  customerIdx: index("territory_skip_flags_customer_idx").on(table.customerId),
  flaggedIdx: index("territory_skip_flags_flagged_idx").on(table.flaggedForAdminReview),
}));

export const insertTerritorySkipFlagSchema = createInsertSchema(territorySkipFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TerritorySkipFlag = typeof territorySkipFlags.$inferSelect;
export type InsertTerritorySkipFlag = z.infer<typeof insertTerritorySkipFlagSchema>;

// ========================================
// SPOTLIGHT ENHANCED COACHING SCHEMA
// ========================================

// Spotlight Session State - persistent per-user progress, gamification, and energy tracking
export const spotlightSessionState = pgTable("spotlight_session_state", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionDate: varchar("session_date", { length: 10 }).notNull(), // YYYY-MM-DD
  
  // Task interleaving tracking
  lastTaskTypes: jsonb("last_task_types").$type<string[]>().default([]), // Rolling window of recent task types
  currentEnergy: integer("current_energy").default(100), // 0-100 energy level
  energyCheckShown: boolean("energy_check_shown").default(false),
  
  // Gamification
  comboCount: integer("combo_count").default(0), // Different task types in a row
  comboMultiplier: decimal("combo_multiplier", { precision: 3, scale: 1 }).default("1.0"),
  tasksCompletedToday: integer("tasks_completed_today").default(0),
  hardTasksCompletedToday: integer("hard_tasks_completed_today").default(0),
  powerUpsAvailable: integer("power_ups_available").default(0), // Free skips earned
  powerUpsUsedToday: integer("power_ups_used_today").default(0),
  
  // Micro-coaching
  lastMicroCardAt: timestamp("last_micro_card_at"),
  tasksSinceMicroCard: integer("tasks_since_micro_card").default(0),
  microCardsShownToday: jsonb("micro_cards_shown_today").$type<number[]>().default([]),
  
  // Session flow
  warmupShown: boolean("warmup_shown").default(false),
  recapShown: boolean("recap_shown").default(false),
  
  // Cross-user task claiming - prevents same customer shown to multiple users
  currentClaimedCustomerId: varchar("current_claimed_customer_id"),
  claimedAt: timestamp("claimed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateIdx: index("spotlight_session_state_user_date_idx").on(table.userId, table.sessionDate),
  userIdx: index("spotlight_session_state_user_idx").on(table.userId),
  claimedCustomerIdx: index("spotlight_session_state_claimed_customer_idx").on(table.currentClaimedCustomerId),
}));

export const insertSpotlightSessionStateSchema = createInsertSchema(spotlightSessionState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SpotlightSessionState = typeof spotlightSessionState.$inferSelect;
export type InsertSpotlightSessionState = z.infer<typeof insertSpotlightSessionStateSchema>;

// Spotlight Customer Claims - atomic cross-user task claiming
// customer_id is the PRIMARY KEY to enforce at most one claim per customer
export const spotlightCustomerClaims = pgTable("spotlight_customer_claims", {
  customerId: varchar("customer_id").primaryKey(), // The customer being claimed
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionDate: varchar("session_date", { length: 10 }).notNull(), // YYYY-MM-DD
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const insertSpotlightCustomerClaimSchema = createInsertSchema(spotlightCustomerClaims);
export type SpotlightCustomerClaim = typeof spotlightCustomerClaims.$inferSelect;

// Spotlight Micro Cards - coaching content for product quizzes, objection practice, etc.
export const spotlightMicroCards = pgTable("spotlight_micro_cards", {
  id: serial("id").primaryKey(),
  cardType: varchar("card_type", { length: 30 }).notNull(), // 'product_quiz', 'objection_practice', 'customer_story', 'competitor_intel', 'machine_profile_check'
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  
  // For quizzes
  question: text("question"),
  options: jsonb("options").$type<string[]>(),
  correctAnswer: integer("correct_answer"),
  explanation: text("explanation"),
  
  // For objection practice
  objectionType: varchar("objection_type", { length: 50 }),
  suggestedResponses: jsonb("suggested_responses").$type<{ id: string; text: string; isRecommended: boolean }[]>(),
  
  // For linking to taxonomy
  categoryCode: varchar("category_code", { length: 50 }),
  machineTypeCode: varchar("machine_type_code", { length: 50 }),
  
  // Metadata
  difficulty: varchar("difficulty", { length: 20 }).default("medium"), // 'easy', 'medium', 'hard'
  tags: jsonb("tags").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  cardTypeIdx: index("spotlight_micro_cards_type_idx").on(table.cardType),
  activeIdx: index("spotlight_micro_cards_active_idx").on(table.isActive),
}));

export const insertSpotlightMicroCardSchema = createInsertSchema(spotlightMicroCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SpotlightMicroCard = typeof spotlightMicroCards.$inferSelect;
export type InsertSpotlightMicroCard = z.infer<typeof insertSpotlightMicroCardSchema>;

// Spotlight Card Engagements - log user interactions with micro cards
// NOTE: This table is defined but not currently used in the application
export const spotlightCardEngagements = pgTable("spotlight_card_engagements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardId: integer("card_id").notNull().references(() => spotlightMicroCards.id, { onDelete: "cascade" }),
  cardType: varchar("card_type", { length: 30 }).notNull(),
  
  // Engagement data
  selectedAnswer: integer("selected_answer"), // For quizzes
  selectedResponseId: varchar("selected_response_id", { length: 50 }), // For objection practice
  wasCorrect: boolean("was_correct"),
  timeSpentMs: integer("time_spent_ms"),
  skipped: boolean("skipped").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("spotlight_card_engagements_user_idx").on(table.userId),
  cardIdx: index("spotlight_card_engagements_card_idx").on(table.cardId),
  createdAtIdx: index("spotlight_card_engagements_created_at_idx").on(table.createdAt),
}));

export const insertSpotlightCardEngagementSchema = createInsertSchema(spotlightCardEngagements).omit({
  id: true,
  createdAt: true,
});
export type SpotlightCardEngagement = typeof spotlightCardEngagements.$inferSelect;
export type InsertSpotlightCardEngagement = z.infer<typeof insertSpotlightCardEngagementSchema>;

// Spotlight Coach Tips - AI-generated contextual tips
export const spotlightCoachTips = pgTable("spotlight_coach_tips", {
  id: serial("id").primaryKey(),
  tipType: varchar("tip_type", { length: 30 }).notNull(), // 'pre_call', 'post_task', 'product_suggestion', 'objection_handler'
  triggerContext: varchar("trigger_context", { length: 50 }).notNull(), // What triggers this tip (e.g., 'sales_call', 'hygiene_pricing_tier')
  content: text("content").notNull(),
  
  // For machine/product-specific tips
  machineTypeCode: varchar("machine_type_code", { length: 50 }),
  categoryCode: varchar("category_code", { length: 50 }),
  
  // Metadata
  priority: integer("priority").default(10),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSpotlightCoachTipSchema = createInsertSchema(spotlightCoachTips).omit({
  id: true,
  createdAt: true,
});
export type SpotlightCoachTip = typeof spotlightCoachTips.$inferSelect;
export type InsertSpotlightCoachTip = z.infer<typeof insertSpotlightCoachTipSchema>;

// Label print types
export const LABEL_TYPES = ['swatch_book', 'press_test_kit', 'mailer', 'other'] as const;
export type LabelType = typeof LABEL_TYPES[number];

export const LABEL_TYPE_LABELS: Record<LabelType, string> = {
  'swatch_book': 'Swatch Book',
  'press_test_kit': 'Press Test Kit',
  'mailer': 'Mailer',
  'other': 'Something Else',
};

// Label prints table - tracks address labels printed for customers
export const labelPrints = pgTable("label_prints", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  labelType: varchar("label_type", { length: 30 }).notNull(), // 'swatch_book', 'press_test_kit', 'mailer', 'other'
  otherDescription: varchar("other_description", { length: 255 }), // Description when type is 'other'
  quantity: integer("quantity").notNull().default(1),
  
  // Address snapshot (captured at print time)
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  province: varchar("province", { length: 255 }),
  country: varchar("country", { length: 255 }),
  postalCode: varchar("postal_code", { length: 50 }),
  
  // Tracking
  printedByUserId: varchar("printed_by_user_id").notNull().references(() => users.id),
  printedByUserName: varchar("printed_by_user_name", { length: 255 }),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  customerIdx: index("label_prints_customer_idx").on(table.customerId),
  labelTypeIdx: index("label_prints_type_idx").on(table.labelType),
  printedByIdx: index("label_prints_printed_by_idx").on(table.printedByUserId),
  createdAtIdx: index("label_prints_created_at_idx").on(table.createdAt),
}));

export const insertLabelPrintSchema = createInsertSchema(labelPrints).omit({
  id: true,
  createdAt: true,
});
export type LabelPrint = typeof labelPrints.$inferSelect;
export type InsertLabelPrint = z.infer<typeof insertLabelPrintSchema>;

// Admin settings - configurable system-wide settings for cost optimization
export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedByUserId: varchar("updated_by_user_id").references(() => users.id),
});

export const insertAdminSettingSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});
export type AdminSetting = typeof adminSettings.$inferSelect;
export type InsertAdminSetting = z.infer<typeof insertAdminSettingSchema>;

// Task difficulty/energy cost configuration
export const TASK_ENERGY_COSTS: Record<string, { energyCost: number; difficulty: 'easy' | 'medium' | 'hard' }> = {
  'sales_call': { energyCost: 25, difficulty: 'hard' },
  'sales_follow_up': { energyCost: 15, difficulty: 'medium' },
  'sales_quote_follow_up': { energyCost: 15, difficulty: 'medium' },
  'outreach_no_contact': { energyCost: 10, difficulty: 'medium' },
  'outreach_drip': { energyCost: 8, difficulty: 'easy' },
  'hygiene_sales_rep': { energyCost: 5, difficulty: 'easy' },
  'hygiene_pricing_tier': { energyCost: 5, difficulty: 'easy' },
  'hygiene_email': { energyCost: 8, difficulty: 'easy' },
  'hygiene_name': { energyCost: 3, difficulty: 'easy' },
  'hygiene_company': { energyCost: 3, difficulty: 'easy' },
  'hygiene_phone': { energyCost: 5, difficulty: 'easy' },
  'hygiene_machine_profile': { energyCost: 10, difficulty: 'medium' },
  'enablement_swatchbook': { energyCost: 12, difficulty: 'medium' },
  'enablement_press_test': { energyCost: 12, difficulty: 'medium' },
  'enablement_price_list': { energyCost: 10, difficulty: 'easy' },
};

