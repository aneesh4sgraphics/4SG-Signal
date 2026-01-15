# Replit.md - Quote Calculator Application

## Overview
This full-stack TypeScript application is a quote calculator for product pricing. It features a React frontend and a Node.js/Express backend with a PostgreSQL database and Drizzle ORM. The application aims to provide sales staff with an efficient tool for generating accurate product quotes, managing pricing data, and enhancing sales workflows and customer interactions. Key capabilities include comprehensive product management, tiered pricing, CRM with customer journey tracking, professional PDF generation for quotes and price lists, advanced label generation, and integration with Odoo ERP and Shopify. The UI is inspired by Odoo, using sidebar navigation, card-based layouts, and muted purple accents.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack Query (React Query).
- **UI Components**: shadcn/ui built on Radix UI, styled with Tailwind CSS.
- **UI/UX Decisions**: Odoo ERP-inspired design with a clean, business-friendly aesthetic, including sidebar navigation, card-based layouts, muted purple accents, professional favicon, adaptive column resizing, color-coded quantity logic, and responsive design. Design system includes glassmorphism effects, animated gradient backgrounds, and floating ambient orbs.
- **Product Category Constants**: Shared `client/src/lib/productCategories.ts` module exports `ALLOWED_CATEGORIES` (11 curated categories), `CATEGORY_TYPE_KEYWORDS` (keyword-based type filtering), and helper functions. Used consistently across Quote Calculator, Product Mapping, Product Pricing Management, and Price List pages.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ESM modules).
- **API Style**: RESTful API.
- **Database**: PostgreSQL with Drizzle ORM.
- **Session Management**: PostgreSQL session store.
- **Technical Implementations**: Server-side PDF generation (puppeteer), robust authentication with role-based access control, comprehensive CSV upload/synchronization with hash-based change detection, and dynamic logo fetching.
- **Error Handling**: Production-ready error logging, performance tracking, and detailed error responses with actionable suggestions, exposing sanitized error fields. Includes a `/api/diagnostics` health check.
- **AI Chatbot**: Hybrid RAG system using OpenAI GPT-4o with fallback to local BM25 search. Provides context-only answers, product retrieval, strict "no guessing" policy, source citations, and guidance to app sections. Works offline.
- **CRM Integration**: Comprehensive customer journey tracking system, including account states, machine profile tracking, category trust grid, reorder intelligence, and "Next Best Move" coaching nudges.
- **QuickQuotes + Customer Journey Integration**: Native integration linking quote generation to CRM, automating category trust advancement and follow-up timers.
- **Email Studio & Drip Campaigns**: Pre-composed email templates with dynamic variables, admin-only template creation, user compose flow, email send logging, and automated multi-step email sequences with configurable delays. Features rich text editing with TipTap (bold, italic, underline, lists, alignment, colors, links, images), user-configurable email signatures with HTML support, and extended template variables including `client.salesRep` and `user.signature`.
- **Gmail Integration**: App-wide email compose popup, sending via connected Gmail account, with all sends logged and viewable in customer detail.
- **Email Engagement Tracking**: Open and click tracking for all outgoing emails with automated follow-up task creation based on engagement.
- **Email Intelligence V3**: Enhanced email matching using EMAIL as primary key with canonical normalization. Features Gmail-specific handling (dot removal, plus-tag stripping, gmail.com normalization), strict matching priority (exact normalized email 1.00 → alias lookup 0.95 → domain matching 0.70 → unmatched), and user-scoped queries to prevent cross-user data leakage. Hybrid visibility model: admins see all customers, regular users see only their assigned (salesRepId) or unassigned customers. Full 30-day Gmail sync with pagination, rules-first sales event extraction for 8 event types, auto-creation of follow-up tasks, and AI coaching tips. Schema includes normalized email columns (emailNormalized, email2Normalized) on customers, customerContacts, gmailMessages tables with composite (userId, normalized_email) indexes. Email alias tracking via gmailEmailAliases table with user scoping. Sync Debug panel at `/email-sync` for monitoring. Key files: `shared/email-normalizer.ts`, `server/gmail-sync-worker.ts`.
- **Odoo V19 Enterprise Integration**: JSON-RPC API client for Odoo V19 Enterprise. Features customer sync (incremental and full reset), full address field mapping, bidirectional data access (products, pricelists, sale orders, users), bulk sync, and a guided product creation wizard for unmapped Odoo products.
- **Shopify Integration**: Embedded Shopify Admin app with OAuth flow, automatic webhook registration (orders/paid, orders/updated, customers/create, customers/update), HMAC verification, and order sync mapping Shopify customers to CRM accounts. Customer sync now properly identifies companies (sets `isCompany=true`, `contactType='company'`) and creates `customerContacts` entries for person names associated with companies. Draft order sync imports Shopify draft orders via `/api/shopify/sync-draft-orders` and displays them in the Quotes & Price Lists tab of client details.
- **Integration Connection Status**: Proactive monitoring and user prompts for Odoo, Gmail, and Google Calendar connection statuses.
- **Admin Rules & Config System**: Admin-only area for adjusting coaching/journey logic without code changes, including product taxonomy, SKU-to-category mapping, coaching timers, nudge engine settings, conversation scripts, and an audit log with config versioning.
- **Setup Wizard**: Guided step-by-step configuration flow at `/admin/setup`. Tracks 7 setup steps (Machine Types, Category Groups, Categories, SKU Mappings, Timers, Nudges, Scripts) with completion percentages, "what breaks if you skip" warnings, and direct links to configure each. Includes Shopify SKU analysis for auto-detecting mapping patterns. API: `/api/admin/setup-status` returns completion status.
- **SPOTLIGHT (Coaching Treadmill)**: Daily task management system replacing NOW MODE. Presents one client + one action + one outcome at a time with a daily quota of 30 "moments" distributed across 5 buckets: Calls (2), Follow-ups (3), Outreach (10), Data Hygiene (10), and Enablement (5). Features outcome buttons (no typing required), auto-scheduling of follow-ups based on outcome selection, activity logging to customerActivityEvents, bucket progress indicators, and "Why Now" explanations for each task. Priority-based task selection within buckets (oldest calls first, overdue follow-ups, 30+ days no contact for outreach). In-memory session storage with daily reset. Key files: `server/spotlight-engine.ts`, `client/src/pages/spotlight.tsx`. Routes: `/api/spotlight/current`, `/api/spotlight/complete`, `/api/spotlight/skip`.

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Migration**: Drizzle Kit.
- **Connection**: Neon Database serverless connection.
- **Schema**: `/shared/schema.ts`.
- **System Design**: Comprehensive foreign key constraints with cascade delete, unified `productPricingMaster` table, NaN validation, and boolean parsing enhancements.
- **Performance Optimizations**: Database indexes on foreign key columns and timestamps, lazy-loading for Client Detail tabs, server-side pagination, parallel query execution, and batch operations.
- **Customer List Indexes**: B-tree indexes on customers table for list view filters: salesRepId, email, company, province, pricingTier, updatedAt, isHotProspect, isCompany, doNotContact, odooPartnerId.
- **Task Indexes**: B-tree indexes on follow_up_tasks table: assignedTo, dueDate, status, customerId.
- **Search Optimization**: pg_trgm extension with GIN trigram indexes on customer company, email, first_name, last_name columns for fast ILIKE searches.

### Cost & Performance Optimizations (January 2026)
- **Security Hardening**: Helmet middleware with custom CSP for Shopify embedding, HSTS, compression (gzip), x-powered-by disabled, strict CORS with explicit allowlist.
- **Rate Limiting**: Auth endpoints (20 req/15min), webhook endpoints (100 req/min).
- **Background Workers**: All workers (Drip Email, Quote Follow-up, Gmail Sync, Data Retention) use PostgreSQL advisory locks for singleton-safe execution in multi-instance deployments.
- **Config Caching**: `server/config-cache.ts` provides TTL-based caching with version invalidation for read-mostly config (taxonomy, SKU mappings, timers, scripts, pricing).
- **Customer Overview Endpoint**: `/api/customers/:id/overview` bundles customer data, recent activity, pending tasks, and stats for dashboard first paint, reducing API chattiness.
- **PDF Caching**: Generated quote PDFs cached by content hash with 24-hour TTL in `uploads/pdf-cache/`.
- **Data Retention**: `server/data-retention.ts` runs daily cleanup of events/files older than 180 days.
- **Response Logging**: Only request metadata (method, path, status, duration) logged in production; no response body logging to avoid PII exposure.

## External Dependencies

### Frontend
- **React Ecosystem**: React, React DOM, React Query.
- **UI Libraries**: Radix UI primitives, Lucide React icons, shadcn/ui.
- **Styling**: Tailwind CSS, class-variance-authority.
- **Forms**: React Hook Form with Zod validation.
- **Utilities**: clsx, tailwind-merge, date-fns, file-saver, react-beautiful-dnd, react-barcode, qrcode.react.

### Backend
- **Core**: Express.js.
- **Database**: Drizzle ORM, Neon Database client, pg, connect-pg-simple.
- **Validation**: Zod.
- **File Handling**: Multer.
- **PDF Generation**: puppeteer (direct browser-based PDF rendering).
- **AI/NLP**: OpenAI.
- **Other**: axios, csv-parse, pdf-lib, pug, puppeteer, zod-validation-error.