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
- **Email Studio**: Pre-composed email templates with dynamic variables ({{client.name}}, {{product.type}}, {{price.dealer}}, etc.). Admin-only template creation, user compose flow with recipient selection and variable auto-fill, email send logging and activity tracking.

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