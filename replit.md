# Replit.md - Quote Calculator Application

## Overview
This is a full-stack TypeScript application that provides a quote calculator for product pricing. It features a React frontend, a Node.js/Express backend, a PostgreSQL database with Drizzle ORM, and is styled with Tailwind CSS and shadcn/ui components. The application's UI is redesigned to emulate Odoo ERP's aesthetic, incorporating sidebar navigation, card-based layouts, and muted purple accents. Key capabilities include comprehensive product management, tiered pricing calculations, customer relationship management, and professional PDF generation for quotes and price lists. The project aims to provide an efficient, user-friendly tool for sales staff to generate accurate product quotes and manage pricing data.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (December 23, 2025)
- **Bento Grid App Switcher & Command Palette**: Major UI redesign inspired by Odoo's app switcher
  - **App Switcher Drawer**: Bento grid layout with adaptive tile sizing based on usage frequency. Frequently used apps (3+ uses) display larger 2x1 tiles. Glass design styling with hover effects.
  - **Command Palette**: Global search triggered by '/' or 'Cmd+K'. Search across all apps, view recent apps, quick actions (logout, reset cache). Built with shadcn/ui Command components (cmdk).
  - **Usage Tracking**: App usage persisted in localStorage. Tracks visit count and last used timestamp. Used for adaptive icon sizing and recent apps.
  - **Mobile Responsiveness**: Sheet-based mobile sidebar for screens below lg breakpoint. Floating menu button on mobile.
  - New components: `CommandPalette.tsx`, `AppSwitcherDrawer.tsx`
  - New hooks: `useAppUsage.tsx` (React Context + localStorage), `useCommandPalette` (keyboard shortcut handler)
  - Shared navigation config: `NAV_ITEMS` exported from CommandPalette for consistent app metadata

## Previous Changes (December 22, 2025)
- **Shipment Labeler Integration**: Added two new label generation features
  - **Shipping Labels** (`/shipping-labels`): Professional shipping label generator with support for multiple formats (4x6 thermal, 4x8 thermal, 8.5x11 laser 2-up, local transport). Features include barcode generation using react-barcode, saved recipients, shipping company management, address validation, Google Maps integration, shipment history, and pallet details per label.
  - **Product Labels** (`/product-labels`): Product label generator with QR codes (qrcode.react), support for thermal 4x3 and Avery 4-up formats, ink compatibility options (Dry Toner, HP Indigo, UV, etc.), sample pack designation, and saved template management. Includes Notion product search integration.
  - Database schema: Added `shipments`, `shippingCompanies`, `savedRecipients`, `productLabels`, and `notionProducts` tables
  - New packages: react-barcode, qrcode.react
  - API endpoints: Full CRUD for all new entities plus Notion product search
  - Glass design styling applied to both pages

- **Shiny Glass Design System Implementation**: Redesigned UI with glassmorphism effects featuring frosted glass cards, animated gradient backgrounds, and floating ambient orbs
  - **Glass card styling**: Subtle frosted glass effect with `backdrop-filter: blur(24px) saturate(120%)`, semi-transparent white backgrounds, and soft shadows
  - **Animated background**: OdooLayout features animated gradient background (`linear-gradient` with gentle color shift animation) and three floating ambient orbs with smooth animations
  - **Glass sidebar**: Collapsible navigation with frosted glass effect and subtle borders
  - **Cool muted color palette**: Blue, purple, and teal accent colors with soft indigo shadows
  - **Hover effects**: Cards have subtle lift animation (`translateY(-2px)`) on hover
  - All major pages updated: Dashboard, QuickQuotes, Price List, Client Database, Saved Quotes, Admin, PDF Settings, Activity Logs, Shipping Calculator, Area Pricer, Market Prices, Shipping Labels, Product Labels
  - Legacy Contra styles replaced with `glass-card`, `glass-btn`, `glass-btn-primary` utility classes

## Previous Changes (December 3, 2025)
- **Codebase Optimization**: Removed unused files and dead code to improve maintainability
- **Fixed React DOM Warnings**: Resolved nested anchor tag issues in `OdooLayout.tsx` and `dashboard-odoo.tsx`
- **Bulk Edit Enhancement**: Expanded bulk edit to allow selection of any products via checkboxes
- **Production Cookie Fix**: Added `sameSite: 'lax'` to production session cookie configuration
- **Improved Error Messages**: Frontend now displays actual HTTP status codes on API failures

## Previous Changes (November 18, 2025)
- **Enhanced Production Error Diagnostics**: Added comprehensive error logging to API endpoints with structured console logs (===START/END markers), duration tracking, and specific error suggestions based on error type (database connection, query errors, permissions, etc.)
- **Secure Error Display**: Frontend now extracts and displays only sanitized error fields from backend (details, suggestion, message, type, timestamp, duration) without exposing raw responses or stack traces
- **Health Monitoring**: Created `/api/diagnostics` endpoint for system health checks (environment variables, database connection, API endpoint status)
- **Debugging Documentation**: Added DEBUGGING_GUIDE.md with step-by-step instructions for using browser DevTools Network tab to inspect API failures and diagnose connection problems

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: shadcn/ui component library built on Radix UI
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Build Tool**: Vite for development and production builds
- **UI/UX Decisions**: Odoo ERP-inspired clean, business-friendly design with sidebar navigation, card-based layouts, and muted purple accent colors. Features include professional favicon implementation, adaptive column resizing, color-coded quantity logic, and responsive design for various screen sizes.

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Style**: RESTful API endpoints
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: PostgreSQL session store (connect-pg-simple)
- **Development**: tsx for TypeScript execution
- **Technical Implementations**: Server-side PDF generation using html-pdf-node configured for system Chromium, robust authentication system with role-based access control, comprehensive CSV upload and synchronization logic with hash-based change detection, and dynamic logo fetching with fallback mechanisms.
- **Error Handling & Diagnostics**: Production-ready error logging with timestamped structured logs, performance tracking (request duration), and detailed error responses with actionable suggestions. Frontend displays only sanitized error fields (never raw responses or stack traces). Includes `/api/diagnostics` health check endpoint for system status monitoring.
- **AI Chatbot**: Hybrid RAG system with automatic fallback - uses OpenAI GPT-4o when available, falls back to local BM25 search over troubleshooting PDFs when quota exceeded. Features context-only answering with similarity scoring (threshold 0.25), retrieves relevant products from database, enforces strict "no guessing" policy, provides source citations from PDFs, and guides users to appropriate app sections when lacking data. Works offline with local search even without OpenAI credits.

### Database Architecture
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Migration**: Drizzle Kit for schema migrations
- **Connection**: Neon Database serverless connection
- **Schema Location**: `/shared/schema.ts` for shared types between frontend and backend
- **System Design Choices**: Implemented comprehensive foreign key constraints with cascade delete for data integrity across product categories, types, sizes, and pricing. Utilizes a unified `productPricingMaster` table. Data parsing includes robust NaN validation and boolean parsing enhancements.

## External Dependencies

### Frontend Dependencies
- **React Ecosystem**: React, React DOM, React Query
- **UI Libraries**: Radix UI primitives, Lucide React icons, shadcn/ui
- **Styling**: Tailwind CSS, class-variance-authority
- **Forms**: React Hook Form with Zod validation
- **Utilities**: clsx, tailwind-merge, date-fns, file-saver, react-beautiful-dnd

### Backend Dependencies
- **Core**: Express.js, Node.js types
- **Database**: Drizzle ORM, Neon Database serverless client, pg
- **Session**: connect-pg-simple
- **Validation**: Zod
- **File Handling**: Multer
- **PDF Generation**: html-pdf-node
- **Development**: tsx, cross-env

### Development Tools
- **Build**: Vite, esbuild
- **TypeScript**: Strict configuration
- **Linting**: ESLint
- **Database**: Drizzle Kit
- **Other**: axios, csv-parse, pdf-lib, pug, puppeteer, zod-validation-error
```