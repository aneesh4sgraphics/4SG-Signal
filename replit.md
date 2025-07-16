# Replit.md - Quote Calculator Application

## Overview

This is a full-stack TypeScript application that provides a quote calculator for product pricing. The application uses a React frontend with a Node.js/Express backend, PostgreSQL database with Drizzle ORM, and is styled with Tailwind CSS and shadcn/ui components.

## Recent Changes

- **Customer Selection Enhancement (2025-07-16)**: Added customer selection/creation functionality to Price List app. Users can now select existing customers or create new ones with Company Name, Address, City, State, Zip, Contact Name, Phone & Email. Removed client name input field from download dialog, using selected customer data instead. Fixed PDF print button visibility during download to eliminate "Print to PDF" text in generated files
- **Dimensions Column Removal (2025-07-16)**: Completely removed Dimensions column from Price List web display, PDF downloads, and CSV exports as requested. Table now shows Size, Item Code, Min Qty, Price/Sq.M, and Total Price columns only
- **Price List Download Enhancement (2025-07-16)**: Removed pricing tier information from PDF and CSV downloads, updated filenames to exclude tier name, and implemented automatic saving of generated files to Saved Quotes system. Fixed PDF generation to use HTML download approach for better browser compatibility
- **Dimensions CSV Export Fix (2025-07-16)**: Updated competitor pricing database CSV export to separate dimensions into two columns (Width and Height/Length) instead of single combined cell. Enhanced data structure to store width, length, and unit separately for better parsing accuracy
- **Code Cleanup (2025-07-16)**: Removed unused DatabaseStorage class, mock data, and unnecessary imports. Cleaned up user initialization to rely only on authenticated users with proper pre-approval system
- **Dashboard Redesign (2025-07-15)**: Redesigned dashboard with all apps in one horizontal line and separate admin section with download functionality for all databases
- **Email Product Name Fix (2025-07-15)**: Fixed product name duplication in email composition to show only product type instead of brand + type combination
- **Product Code Integration (2025-07-15)**: Added product code display to quote items table, email composition, and PDF generation. Updated all QuoteItem interfaces to include itemCode field from productSizes schema
- **Email Signature Removal (2025-07-15)**: Removed company signature section from email composition at user request while keeping product codes in quote items
- **Minimum Order Quantity Logic (2025-07-15)**: Implemented smart minimum order quantity display - Min Order Qty column appears only when needed, calculations use minimum when user quantity is below threshold
- **Authentication System (2025-07-15)**: Implemented Replit Auth with domain restriction to @4sgraphics.com emails only. Added admin approval workflow with aneesh@4sgraphics.com and oscar@4sgraphics.com as admins, all other users have user role only
- **New Dashboard Design (2025-07-15)**: Created employee portal dashboard matching user requirements with tool grid layout, proper branding, and personalized welcome message
- **Database Integration (2025-07-15)**: Added PostgreSQL database with Drizzle ORM for user management and session storage
- **PDF Typography (2025-07-15)**: Updated PDF styling to use Roboto font - 15px for company name, 10px for all other text with professional alternating row colors
- **Performance Optimization (2025-07-15)**: Implemented client-side and server-side caching to improve API response times and reduce loading delays
- **Role Management Removal (2025-07-15)**: Removed role assignment functionality from admin panel. Only aneesh@4sgraphics.com and oscar@4sgraphics.com have admin roles, all other users are regular users

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: shadcn/ui component library built on Radix UI
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Style**: RESTful API endpoints
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: PostgreSQL session store (connect-pg-simple)
- **Development**: tsx for TypeScript execution

### Database Architecture
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Migration**: Drizzle Kit for schema migrations
- **Connection**: Neon Database serverless connection
- **Schema Location**: `/shared/schema.ts` for shared types between frontend and backend

## Key Components

### Database Schema
The application manages a hierarchical product catalog with pricing tiers:
- **Product Categories**: Top-level product groupings
- **Product Types**: Subcategories within each category
- **Product Sizes**: Specific size options with dimensions and square meter calculations
- **Pricing Tiers**: Tiered pricing based on square meter ranges
- **Users**: Basic user authentication system

### Frontend Components
- **Quote Calculator**: Main application interface for calculating product quotes
- **UI Components**: Comprehensive shadcn/ui component library including forms, dialogs, cards, and navigation
- **Responsive Design**: Mobile-first approach with Tailwind CSS breakpoints

### Backend Services
- **Storage Interface**: Abstracted storage layer with both in-memory and database implementations
- **API Routes**: RESTful endpoints for product categories, types, sizes, and pricing
- **Error Handling**: Centralized error handling middleware
- **Development Tools**: Request logging and error overlay for development

## Data Flow

1. **User Interaction**: User selects product category, type, and size through the quote calculator interface
2. **API Requests**: Frontend makes requests to backend REST endpoints using TanStack Query
3. **Database Queries**: Backend queries PostgreSQL through Drizzle ORM
4. **Price Calculation**: System calculates pricing based on square meters and pricing tiers
5. **Response**: Formatted data returned to frontend for display

### API Endpoints
- `GET /api/product-categories` - Fetch all product categories
- `GET /api/product-types/:categoryId` - Fetch product types for a category
- `GET /api/product-sizes/:typeId` - Fetch product sizes for a type
- `GET /api/pricing-tiers` - Fetch all pricing tiers
- `POST /api/calculate-price` - Calculate price for custom dimensions

## External Dependencies

### Frontend Dependencies
- **React Ecosystem**: React, React DOM, React Query
- **UI Libraries**: Radix UI primitives, Lucide React icons
- **Styling**: Tailwind CSS, class-variance-authority for component variants
- **Forms**: React Hook Form with Zod validation
- **Utilities**: clsx, tailwind-merge, date-fns

### Backend Dependencies
- **Core**: Express.js, Node.js types
- **Database**: Drizzle ORM, Neon Database serverless client
- **Session**: connect-pg-simple for PostgreSQL session storage
- **Validation**: Zod for schema validation
- **Development**: tsx for TypeScript execution

### Development Tools
- **Build**: Vite, esbuild for production builds
- **TypeScript**: Strict configuration with path mapping
- **Linting**: ESLint configuration (implied by shadcn/ui setup)
- **Database**: Drizzle Kit for migrations and schema management

## Deployment Strategy

### Build Process
1. **Frontend Build**: Vite builds React application to `/dist/public`
2. **Backend Build**: esbuild bundles Express server to `/dist/index.js`
3. **Database Setup**: Drizzle migrations applied via `npm run db:push`

### Environment Configuration
- **Development**: Uses NODE_ENV=development with tsx for hot reloading
- **Production**: NODE_ENV=production with compiled JavaScript
- **Database**: Requires DATABASE_URL environment variable for PostgreSQL connection

### Deployment Architecture
- **Frontend**: Static assets served from `/dist/public`
- **Backend**: Express server handles API routes and serves static files
- **Database**: PostgreSQL database (configured for Neon serverless)
- **Session Storage**: PostgreSQL-backed sessions for authentication

### Development vs Production
- **Development**: Vite dev server with HMR, runtime error overlay
- **Production**: Static file serving with Express, compiled assets
- **Database**: Same PostgreSQL setup for both environments
- **Error Handling**: Enhanced error reporting in development mode

The application is designed to be deployed on platforms like Replit, Vercel, or similar Node.js hosting services with PostgreSQL database support.