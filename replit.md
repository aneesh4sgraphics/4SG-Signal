# Replit.md - Quote Calculator Application

## Overview
This full-stack TypeScript application provides a quote calculator for product pricing, featuring a React frontend, Node.js/Express backend, PostgreSQL with Drizzle ORM, and styled with Tailwind CSS and shadcn/ui. The UI is inspired by Odoo ERP, incorporating sidebar navigation, card-based layouts, and muted purple accents. Key capabilities include comprehensive product management, tiered pricing calculations, customer relationship management (CRM) with journey tracking, professional PDF generation for quotes and price lists, and advanced label generation. The project aims to provide an efficient, user-friendly tool for sales staff to generate accurate product quotes and manage pricing data, enhancing sales workflows and customer interactions.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Components**: shadcn/ui built on Radix UI
- **Styling**: Tailwind CSS with custom properties
- **Build Tool**: Vite
- **UI/UX Decisions**: Odoo ERP-inspired design with a clean, business-friendly aesthetic, sidebar navigation, card-based layouts, and muted purple accents. Features include professional favicon, adaptive column resizing, color-coded quantity logic, and responsive design. The design system incorporates glassmorphism effects with frosted glass cards, animated gradient backgrounds, and floating ambient orbs.

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Style**: RESTful API endpoints
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: PostgreSQL session store (connect-pg-simple)
- **Technical Implementations**: Server-side PDF generation (html-pdf-node), robust authentication with role-based access control, comprehensive CSV upload/synchronization with hash-based change detection, and dynamic logo fetching.
- **Error Handling & Diagnostics**: Production-ready error logging, performance tracking, and detailed error responses with actionable suggestions, exposing only sanitized error fields to the frontend. Includes a `/api/diagnostics` health check endpoint.
- **AI Chatbot**: Hybrid RAG system using OpenAI GPT-4o (with fallback to local BM25 search over troubleshooting PDFs). Features context-only answering, product retrieval from the database, strict "no guessing" policy, source citations, and guidance to appropriate app sections. Works offline with local search.
- **CRM Integration**: Comprehensive customer journey tracking system, including customer journey instances, press test journeys, sample requests, test outcomes, and swatch management.
- **Customer Coach Panel**: Coach-style B2B Customer Journey system for repeat buyers with minimal typing. Features:
  - Account State badges (Prospect→FirstTrust→ExpansionPossible→ExpansionInProgress→MultiCategory→Embedded)
  - Machine Profile tracking (6 machine families: Offset, Digital Dry Toner, HP Indigo, Inkjet, Flexo, Wide Format)
  - Category Trust Grid (48 product categories with 5-state progression: NotIntroduced→Introduced→Evaluated→Adopted→Habitual)
  - Reorder Intelligence with status alerts (Upcoming/Due/Overdue/AtRisk)
  - "Next Best Move" single actionable coach nudge based on customer state
  - One-click trust advancement and objection logging
  - Auto-sync capability from sample requests and test outcomes
- **QuickQuotes + Customer Journey Integration**: Native integration between quote generation and CRM:
  - Quotes auto-link to product categories via `quoteCategoryLinks` table
  - Category trust automatically advances from "not_introduced" to "introduced" when quotes are sent
  - Follow-up timers created: Initial (4 days), Second (7-10 days), Final (14+ days)
  - Test outcomes auto-advance category trust to "evaluated"
  - Next Best Move prioritizes overdue quote follow-ups
  - Quote close flow with "won/lost" outcome tracking and optional trust advancement to "adopted"
- **Email Studio**: Pre-composed email templates with dynamic variables ({{client.name}}, {{product.type}}, {{price.dealer}}, etc.). Admin-only template creation, user compose flow with recipient selection and variable auto-fill, email send logging and activity tracking.
- **Shopify Integration**: Embedded Shopify Admin app for single-store internal use:
  - OAuth flow: `/shopify/auth?shop=...` initiates install, `/shopify/callback` handles token exchange
  - Automatic webhook registration for orders/paid, orders/updated, customers/create, customers/update
  - HMAC verification for all webhooks using raw body capture before JSON parsing
  - Embedded app entry point at `/app` for loading CRM inside Shopify Admin iframe
  - App Bridge v4 integration via CDN script for navigation within Shopify Admin
  - Order sync maps Shopify customers to CRM accounts by email/company name
  - Paid orders auto-advance category trust to "adopted" via product mappings
  - Environment variables: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, SHOPIFY_APP_URL
  - Tables: `shopifyInstalls` (OAuth tokens), `shopifyWebhookEvents` (event logging), `shopifyOrders`, `shopifyProductMappings`
- **Admin Rules & Config System**: Admin-only area at `/admin/config` for adjusting coaching/journey logic without code changes:
  - **Product Taxonomy Tab**: Manage machine types (6 families), category groups, and product categories with machine compatibility settings
  - **SKU→Category Mapping Tab**: Map Shopify SKUs to internal categories using exact, prefix, or regex rules with priority ordering
  - **Coaching Timers Tab**: Editable timing parameters for quote follow-ups (4/7/14 days), press test delivery grace, habitual definitions, stale account thresholds
  - **Nudge Engine Settings Tab**: Configure nudge priority order, enable/disable nudges, severity levels (low/medium/high/critical)
  - **Conversation Scripts Tab**: Editable sales scripts by stage (prospect/expansion/retention) and persona (distributor/end_customer)
  - **Audit Log Tab**: Track all config changes with before/after states, user attribution, and timestamps
  - **Config Versioning**: Draft/publish flow with rollback capability to previous versions
  - **Seed Capability**: One-click initial config seeding with default timers and nudge settings
  - Tables: `adminMachineTypes`, `adminCategoryGroups`, `adminCategories`, `adminCategoryVariants`, `adminSkuMappings`, `adminCoachingTimers`, `adminNudgeSettings`, `adminConversationScripts`, `adminConfigVersions`, `adminAuditLog`

### Database Architecture
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Migration**: Drizzle Kit
- **Connection**: Neon Database serverless connection
- **Schema Location**: `/shared/schema.ts` for shared types.
- **System Design Choices**: Comprehensive foreign key constraints with cascade delete for data integrity across product categories, types, sizes, and pricing. Utilizes a unified `productPricingMaster` table. Includes robust NaN validation and boolean parsing enhancements.

## External Dependencies

### Frontend Dependencies
- **React Ecosystem**: React, React DOM, React Query
- **UI Libraries**: Radix UI primitives, Lucide React icons, shadcn/ui
- **Styling**: Tailwind CSS, class-variance-authority
- **Forms**: React Hook Form with Zod validation
- **Utilities**: clsx, tailwind-merge, date-fns, file-saver, react-beautiful-dnd, react-barcode, qrcode.react

### Backend Dependencies
- **Core**: Express.js, Node.js types
- **Database**: Drizzle ORM, Neon Database client, pg, connect-pg-simple
- **Validation**: Zod
- **File Handling**: Multer
- **PDF Generation**: html-pdf-node
- **Development**: tsx, cross-env
- **AI/NLP**: OpenAI (for GPT-4o integration)

### Development Tools
- **Build**: Vite, esbuild
- **TypeScript**: Strict configuration
- **Linting**: ESLint
- **Database**: Drizzle Kit
- **Other**: axios, csv-parse, pdf-lib, pug, puppeteer, zod-validation-error