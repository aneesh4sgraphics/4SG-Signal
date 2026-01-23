# Replit.md - Quote Calculator Application

## Overview
This full-stack TypeScript application is a quote calculator for product pricing, designed to empower sales staff with an efficient tool for generating accurate quotes, managing pricing data, and enhancing sales workflows. It features a React frontend and a Node.js/Express backend with a PostgreSQL database and Drizzle ORM. Key capabilities include comprehensive product management, tiered pricing, CRM with customer journey tracking, professional PDF generation, advanced label generation, and integration with Odoo ERP and Shopify. The UI is inspired by Odoo, focusing on a business-friendly aesthetic. The project's vision is to streamline sales processes, improve customer engagement, and increase sales efficiency.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript, using Wouter for routing and TanStack Query for state management.
- **UI/UX**: shadcn/ui built on Radix UI and Tailwind CSS, featuring an Odoo-inspired design with sidebar navigation, card-based layouts, muted purple accents, glassmorphism effects, and responsive design.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ESM modules).
- **API Style**: RESTful API.
- **Database Interaction**: PostgreSQL with Drizzle ORM.
- **Key Features**:
    - Server-side PDF generation.
    - Robust authentication with role-based access control.
    - Comprehensive CSV upload/synchronization.
    - AI Chatbot: Hybrid RAG system using OpenAI GPT-4o with local BM25 fallback.
    - CRM: Comprehensive customer journey tracking, reorder intelligence, and "Next Best Move" coaching.
    - Email Studio & Drip Campaigns: Automated multi-step email sequences with engagement tracking.
    - Odoo V19 Enterprise Integration: JSON-RPC API client for bidirectional data access (customers, products, pricelists, sale orders, users) and a guided product creation wizard. The `/odoo-contacts` page is the primary customer management interface, defaulting to company card view. `/odoo-products` displays products from Odoo with detailed pricing and inventory. App users are mapped to Odoo counterparts via email.
    - Shopify Integration: Embedded Shopify Admin app with OAuth, webhook registration, and order/customer sync.
    - Admin Rules & Config System: Admin-only area for adjusting coaching logic, product taxonomy, and an audit log.
    - SPOTLIGHT (Coaching Treadmill): Daily task management system for prioritized client actions. Data sync architecture prioritizes a local CRM database as the source of truth, queuing changes for weekly Odoo sync. **UI Redesign (Jan 2026)**: New "Pastel & Soft" three-column layout designed for professionals aged 30-50 to reduce eye strain. Left sidebar (w-72) with progress ring SVG, efficiency score, streak counter, and bucket progress bars. Center column with task cards. Right sidebar (w-64) with collapsible coaching trays (Calling Script Ideas, Email Ideas). Uses cream background (#FDFBF7), glassmorphism effects, and soft pastel accent colors.
    - Bulk Editing: Supports bulk editing of Tags, Sales Rep, and Payment Terms for multiple selected Odoo contacts.
    - Reports Page (Admin Only): Financial metrics dashboard at `/reports` displaying Total Invoices, Inventory Turnover, Gross Profit, and Debt to Equity Ratio.
    - Auto Sales Rep Assignment: Logic to automatically assign sales representatives based on customer location.
- **Email as Key Identifier**: Email is the primary identifier across all systems (Odoo, Shopify, Gmail, local CRM), utilizing an email normalization system for consistent matching and data integrity.
- **Business Metrics Calculation**:
    - Average Margin: Calculated from Odoo's `sale.order` `margin_percent` field.
    - Pricing Tier: For non-Odoo customers, pricing tiers can be assigned locally.
    - Best Price Engine: Calculates optimal price recommendations combining margin protection, loyalty rewards, inventory velocity, volume discounts, and competitor intelligence, with a cost fallback chain and confidence scoring.

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Migration**: Drizzle Kit.
- **Connection**: Neon Database serverless connection.
- **Schema**: Defined in `/shared/schema.ts`.
- **System Design**: Comprehensive foreign key constraints, unified `productPricingMaster` table, and performance optimizations including database indexes, lazy-loading, server-side pagination, and `pg_trgm` for search.

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
- **AI/NLP**: OpenAI.
- **Other**: axios, csv-parse, pdf-lib, pug, zod-validation-error.