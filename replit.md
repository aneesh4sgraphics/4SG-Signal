# Replit.md - Quote Calculator Application

## Overview
This full-stack TypeScript application is a quote calculator for product pricing. It features a React frontend and a Node.js/Express backend with a PostgreSQL database and Drizzle ORM. The application aims to provide sales staff with an efficient tool for generating accurate product quotes, managing pricing data, and enhancing sales workflows and customer interactions. Key capabilities include comprehensive product management, tiered pricing, CRM with customer journey tracking, professional PDF generation for quotes and price lists, advanced label generation, and integration with Odoo ERP and Shopify. The UI is inspired by Odoo, using sidebar navigation, card-based layouts, and muted purple accents. The project's business vision is to provide sales staff with an efficient tool for generating accurate product quotes, managing pricing data, and enhancing sales workflows and customer interactions. It aims to streamline sales processes, improve customer engagement, and increase sales efficiency.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack Query (React Query).
- **UI Components**: shadcn/ui built on Radix UI, styled with Tailwind CSS.
- **UI/UX Decisions**: Odoo ERP-inspired design with a clean, business-friendly aesthetic, including sidebar navigation, card-based layouts, muted purple accents, professional favicon, adaptive column resizing, color-coded quantity logic, and responsive design. Design system includes glassmorphism effects, animated gradient backgrounds, and floating ambient orbs.
- **Product Category Constants**: Shared module for consistent product categorization across various application pages.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ESM modules).
- **API Style**: RESTful API.
- **Database Interaction**: PostgreSQL with Drizzle ORM.
- **Technical Implementations**: Server-side PDF generation, robust authentication with role-based access control, comprehensive CSV upload/synchronization, and dynamic logo fetching.
- **Error Handling**: Production-ready error logging, performance tracking, and detailed error responses with actionable suggestions.
- **AI Chatbot**: Hybrid RAG system using OpenAI GPT-4o with fallback to local BM25 search for context-only answers, product retrieval, and source citations.
- **CRM Integration**: Comprehensive customer journey tracking, including account states, machine profile tracking, category trust grid, reorder intelligence, and "Next Best Move" coaching nudges.
- **Email Studio & Drip Campaigns**: Pre-composed email templates with dynamic variables, rich text editing, user-configurable signatures, email send logging, and automated multi-step email sequences.
- **Email Engagement Tracking**: Open and click tracking for outgoing emails with automated follow-up task creation.
- **Email Intelligence V3**: Enhanced email matching and normalization for CRM and Gmail integration, sales event extraction, and AI coaching tips. Includes user-scoped queries and a hybrid visibility model.
- **Odoo V19 Enterprise Integration**: JSON-RPC API client for customer sync, address mapping, bidirectional data access (products, pricelists, sale orders, users), and a guided product creation wizard. Includes data quality rules for partner import and customer exclusion lists. **Odoo Contacts (Primary Customer Interface)**: The `/odoo-contacts` page is the primary customer management interface (legacy Client Database page has been removed). Defaults to card view showing only companies (isCompany=true). Cards display with red background when missing valid pricing tier tags (LANDED PRICE, EXPORT ONLY, DISTRIBUTOR, DEALER-VIP, DEALER, SHOPIFY variants, RETAIL). Clicking a company opens a detail page (`/odoo-contacts/:id`) displaying critical business metrics from Odoo: Sales Person, Payment Terms, Total Outstanding, Lifetime Sales, Average Margin, and Top 10 Products Most Purchased. **Tags, Payment Terms & Sales Person Editing**: Dropdowns for Payment Terms, Tags (Odoo partner categories), and Sales Person allow immediate updates to Odoo with visual feedback (loading spinner during save, green checkmark for 3 seconds on success). Tag updates propagate to child contacts. Uses optimistic cache updates via `setQueryData` for immediate UI refresh. **Tag Filtering**: Filter customers by Odoo partner category tags using `/api/odoo/partners-by-category/:categoryName` endpoint. API endpoints: `GET /api/odoo/customer/:customerId/business-metrics`, `POST /api/odoo/customer/:customerId/payment-terms`, `POST /api/odoo/customer/:customerId/category`, `GET /api/odoo/sales-people`, `POST /api/odoo/customer/:customerId/sales-person`, `GET /api/odoo/partners-by-category/:categoryName`. **App User-to-Odoo Mapping**: App users are automatically mapped to their Odoo counterparts via email matching at login. The `users` table stores `odoo_user_id` and `odoo_user_name` fields which are populated by looking up the user's email in Odoo's `res.users` table. **Odoo Products Page**: The `/odoo-products` page displays products from Odoo with grid/list view toggle, category filtering, and text search. Clicking any product navigates to `/odoo-products/:id` detail page showing: pricing tiers by pricelist, average cost, available inventory, purchase order quantities, and top customers who purchased the product. API endpoint: `GET /api/odoo/products/:id/details`.
- **Shopify Integration**: Embedded Shopify Admin app with OAuth, automatic webhook registration, and order/customer sync. Includes company identification and draft order import.
- **Integration Connection Status**: Proactive monitoring and user prompts for Odoo, Gmail, and Google Calendar connection statuses.
- **Admin Rules & Config System**: Admin-only area for adjusting coaching/journey logic, product taxonomy, SKU-to-category mapping, coaching timers, nudge engine settings, conversation scripts, and an audit log with config versioning.
- **Setup Wizard**: Guided step-by-step configuration flow for initial application setup, including machine types, categories, SKU mappings, timers, nudges, and scripts.
- **SPOTLIGHT (Coaching Treadmill)**: Daily task management system presenting prioritized client actions for calls, follow-ups, outreach, data hygiene, and enablement. Features outcome buttons, auto-scheduling of follow-ups, and dual activity logging. Includes pricing feedback and smart hints for task processing.
- **Do Not Merge Feature**: Allows users to explicitly mark customer pairs as separate entities to prevent future duplicate suggestions.
- **Bulk Editing**: Odoo Contacts page supports bulk editing of Tags, Sales Rep, and Payment Terms for multiple selected contacts. Selection is preserved on failure for retry.
- **Reports Page (Admin Only)**: Financial metrics dashboard at `/reports` restricted to admin users. Non-admins are redirected to dashboard. Displays: Total Invoices 2026 (from Odoo account.move), Conversion Rate (quotes to orders, capped at 100% to handle direct orders), Gross Profit (COGS vs Sales from invoice lines), and Debt to Equity Ratio (from Odoo liability/equity accounts). Endpoint: `GET /api/reports/debt-equity-2026`.
- **Auto Sales Rep Assignment**: When customers are created or updated without a sales rep, the system automatically assigns based on location rules:
  - Florida (US) → Santiago
  - Spanish-speaking countries (Mexico, Colombia, Spain, etc.) → Patricio Delgado
  - Other US states & English-speaking countries → Aneesh
  - Logic in `server/sales-rep-auto-assign.ts`, triggered on customer create/update in routes.ts

### Email as Key Identifier
Email is the primary identifier for connecting customers across all systems (Odoo, Shopify, Gmail, local CRM). The architecture ensures consistent matching and data integrity:

**Email Normalization System** (`shared/email-normalizer.ts`):
- Converts to lowercase, trims whitespace
- Handles Gmail-specific rules (removes dots, ignores plus tags)
- Removes surrounding angle brackets and quotes
- Stored in `emailNormalized` and `email2Normalized` fields for fast lookup

**Cross-System Email Matching**:
- **Odoo Sync**: Customers linked via `odooPartnerId` field, matched by email during import
- **Shopify Integration**: Green Shopify logo displayed on contacts whose email exists in Shopify customer mappings
- **Gmail Intelligence**: Matches incoming/outgoing emails to customers using normalized email, aliases, and domain fallback
- **Duplicate Detection**: `customerDoNotMerge` table prevents accidental merges of separate entities

**Email Fields in Customers Table**:
- `email` - Primary email address
- `email2` - Secondary email for contacts with multiple emails
- `emailNormalized` - Canonical normalized primary email
- `email2Normalized` - Canonical normalized secondary email

**Future Improvements Identified**:
1. Email validation on entry (catch typos like "gmial.com")
2. Duplicate detection dashboard for manual review
3. Email source icons (Gmail/Odoo alongside Shopify)
4. Secondary email display in Contacts section
5. Email health score badge

### Business Metrics Calculation Logic

**Average Margin Calculation** (Updated Jan 2026):
- **Source**: Odoo `sale.order` model with `margin_percent` field
- **Logic**: Arithmetic mean of `margin_percent` values from confirmed sale orders (state = 'sale' or 'done')
- **Important**: Odoo's `margin_percent` returns decimal fractions (0.76 = 76%), so we multiply by 100 to convert to actual percentages
- **Why**: Using Odoo's built-in `margin_percent` per order is more accurate than calculating from aggregated revenue/cost totals, which can produce extreme values (like -1023%) when product costs are missing or incorrect
- **Implementation**: `server/odoo.ts` → `getPartnerBusinessMetrics()` → queries sale.order with margin_percent field, multiplies by 100
- **Fallback**: If margin_percent unavailable, calculates from margin/amount_total * 100. Returns "N/A" if no valid data

**Pricing Tier for Non-Odoo Customers**:
- Customers not linked to Odoo can still have pricing tiers assigned locally
- Dropdown uses standard pricing tiers from `/api/pricing-tiers` database table
- Updates save to local `pricingTier` field via `PUT /api/customers/:id`
- QuickQuotes uses this field for price calculations regardless of Odoo link status

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Migration**: Drizzle Kit.
- **Connection**: Neon Database serverless connection.
- **Schema**: `/shared/schema.ts`.
- **System Design**: Comprehensive foreign key constraints with cascade delete, unified `productPricingMaster` table, NaN validation, and boolean parsing enhancements.
- **Performance Optimizations**: Database indexes on foreign key columns and timestamps, lazy-loading for Client Detail tabs, server-side pagination, parallel query execution, and batch operations.
- **Search Optimization**: pg_trgm extension with GIN trigram indexes for fast ILIKE searches on customer data.

## External Dependencies

### Frontend
- **React Ecosystem**: React, React DOM, React Query.
- **UI Libraries**: Radix UI primitives, Lucide React icons, shadcn/ui.
- **Styling**: Tailwind CSS.
- **Forms**: React Hook Form with Zod validation.
- **Utilities**: clsx, tailwind-merge, date-fns, file-saver, react-beautiful-dnd, react-barcode, qrcode.react.

### Backend
- **Core**: Express.js.
- **Database**: Drizzle ORM, Neon Database client, pg, connect-pg-simple.
- **Validation**: Zod.
- **File Handling**: Multer.
- **PDF Generation**: puppeteer.
- **AI/NLP**: OpenAI (cost-optimized with gpt-4o-mini for all AI features).
- **Other**: axios, csv-parse, pdf-lib, pug, zod-validation-error.