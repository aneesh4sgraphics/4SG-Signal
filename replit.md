# Replit.md - Quote Calculator Application

## Overview

This is a full-stack TypeScript application that provides a quote calculator for product pricing. The application uses a React frontend with a Node.js/Express backend, PostgreSQL database with Drizzle ORM, and is styled with Tailwind CSS and shadcn/ui components.

## Recent Changes

- **App Name Changes (2025-07-18)**: Updated "Quote Calculator" app name to "QuickQuotes" and "Area Pricer" to "SqM Calculator" throughout the entire application including dashboard, page titles, and navigation for better branding and user experience
- **Enhanced File Upload System with Smart Duplicate Handling (2025-07-18)**: Completely rebuilt file upload functionality to handle duplicates intelligently. System now adds new records, updates existing records when new data is found in columns, and skips true duplicates. Enhanced user notifications provide detailed feedback showing count of new records added, existing records updated, and duplicates skipped. Applied to customer data, product data, and pricing data uploads with comprehensive CSV parsing and data validation. All uploaded data is immediately available to all users with proper cache clearing
- **Multer Security Update Compatibility (2025-07-18)**: Successfully upgraded to multer v2.0.1 and verified full compatibility with existing file upload functionality. Enhanced error handling and file validation for secure CSV uploads across customer, product, and pricing data management systems
- **Find Duplicates Feature (2025-07-18)**: Added comprehensive duplicate detection functionality to competitor pricing app. New "Find Duplicates" button compares all columns for exact matches and highlights duplicate groups with different colors (red, blue, green, yellow, purple, pink, indigo, orange). Includes smart filtering that works with current filters, toast notifications for results, and toggle controls to show/hide highlighting. Each duplicate group is visually distinct with colored borders and backgrounds
- **Area Pricer Dropdown Fix (2025-07-18)**: Fixed missing dropdown functionality in Area Pricer app by restoring proper Select components for Thickness, Product Kind, and Surface Finish fields. Added comprehensive dropdown options including thickness values (1mil-20mil), product kinds (Vinyl, Paper, Fabric, etc.), and surface finishes (Matte, Gloss, Satin, etc.). Users can now properly select from predefined options instead of typing in text fields
- **Micro-Interaction Feedback System (2025-07-18)**: Implemented comprehensive micro-interaction feedback system with ripple effects, particle animations, success states, loading indicators, and form feedback. Created reusable components (RippleButton, FloatingSuccess, ParticleEffect, etc.) and hooks (useMicroInteractions, useAsyncOperation, useFormFeedback) for enhanced user experience. Integrated MicroFeedbackProvider globally and applied ripple effects to competitor pricing delete buttons
- **Competitor Pricing UI Enhancement (2025-07-18)**: Removed Price/in² and Price/ft² columns from competitor pricing table display and CSV export as requested. Made delete button always visible without horizontal scrolling by using sticky positioning. Added better responsive design with whitespace-nowrap classes and truncated notes with hover tooltips for better table layout
- **Fixed ADD TO COMP INFO Button Functionality (2025-07-18)**: Completely rewrote the ADD TO COMP INFO button in Area Pricer with simplified, inline implementation using direct fetch calls instead of React Query mutations. Removed complex function chains and conditional rendering issues that were preventing button clicks from registering. Button now provides immediate feedback, clear error messages, and successfully adds calculation data to competitor pricing database with proper field validation and data conversion
- **Fixed Competitor Pricing Data Type Issues (2025-07-18)**: Resolved critical blank screen issue in Competitor Pricing Intelligence app caused by database storing numeric values as strings while frontend expected numbers. Fixed with parseFloat() conversions for all numeric fields (inputPrice, pricePerSqIn, pricePerSqFt, pricePerSqMeter), updated TypeScript interfaces to handle mixed data types, and enhanced price filtering logic. Authentication system working properly with development bypass for testing environments
- **Complete Competitor Pricing App Rebuild (2025-07-17)**: Completely rebuilt the Competitor Pricing Intelligence app from scratch with clean, robust architecture. New implementation features proper authentication flow with clear loading states, comprehensive error handling that prevents blank pages, streamlined data filtering and CSV export functionality, and reliable file upload system. The app now gracefully handles all authentication states, data loading errors, and user interactions without crashes or blank pages. Simplified code structure for better maintainability and performance
- **CSV Upload System Rebuild (2025-07-17)**: Completely rebuilt CSV upload system with comprehensive debugging and error handling to prevent page crashes during file uploads. Added detailed logging throughout the upload process, improved CSV parsing with proper quote handling, and enhanced frontend error handling with try-catch blocks. System now provides clear feedback for upload success/failure and handles malformed CSV data gracefully without crashing the application
- **Automatic Competitor Data Collection (2025-07-17)**: Enhanced Area Pricing Calculator to automatically save all calculations to the shared competitor pricing database. Now when users click "Add to Sheet", their calculations are automatically shared with all users for collective intelligence. Added admin CSV upload functionality for competitor pricing data with flexible header mapping. Updated data storage to use shared database instead of in-memory storage for persistent data across all users
- **Server-Side Deployment Fix (2025-07-17)**: Fixed critical deployment issue where localStorage migration was causing "fetch is not a valid HTTP method" errors in server-side rendering environment. Added proper browser environment checks to ensure localStorage operations only run client-side. Migration function now safely handles both browser and server environments with error handling for corrupted data
- **Competitor Pricing Database Migration (2025-07-17)**: Successfully migrated competitor pricing data from localStorage to server-side PostgreSQL database with shared visibility across all users. Implemented automatic data migration functionality that preserves existing localStorage data while transitioning to centralized storage. Updated all apps (Competitor Pricing, Area Pricer, Admin panel) to use server API instead of localStorage
- **Shipping Calculator Email Enhancement (2025-07-16)**: Successfully implemented "Email This" functionality for individual shipping rates in Shipping Calculator app. Each shipping option row now has a dedicated "Email This" button with mail icon that opens user's default email client with pre-composed message containing complete shipping details: route information, package specifications, selected service details, pricing, and any calculation notes. Fixed React Query deprecation warnings by replacing `cacheTime` with `gcTime` across all query configurations. Email composition includes professional signature from 4S Graphics and toast notification for user feedback
- **Adaptive Login Animation System (2025-07-16)**: Implemented intelligent login animation system that adapts to user experience level. New users (≤10 logins) get full 7-second welcome animation with login count indicator and snail icon. Experienced users (10-100 logins) get faster 60% speed animation. Expert users (100+ logins) skip animation entirely and go straight to dashboard. Added sarcastic "welcome back" animation with orange styling and clock icon for users returning after 30+ minutes of inactivity. Motivational quotes now show once per login session and auto-hide after 5 seconds. Created EmailCelebrationAnimation component for quote sending success feedback
- **User Activity Tracking (2025-07-16)**: Added loginCount and lastLoginDate fields to user schema with automatic incrementation on each login. Implemented activity tracking with localStorage to detect user inactivity periods for personalized return experience. Updated authentication system to track user engagement patterns for adaptive UX optimization
- **Price List Column Structure Update (2025-07-16)**: Updated Price List app with proper three-column pricing structure: (1) Price/Sq.M shows original CSV pricing data, (2) Price/Sheet shows actual price per individual sheet (sq.m price × square meters), (3) Price Per Pack shows price per sheet × minimum order quantity with 99-cent rounding applied only to retail pricing tier
- **Role-Based Pricing Tier Filtering (2025-07-16)**: Implemented comprehensive role-based pricing tier visibility across Quote Calculator and Price List apps. Admin users see all tiers, Santiago sees only Approval/Stage tiers (1, 15, 2, 25), Patricio sees Santiago's tiers plus Dealer/Dealer2/Master Distributor tiers. Added zero-price tier filtering that automatically hides tiers with zero pricing values from CSV data. Created roleBasedTiers.ts utility for consistent tier filtering with getUserRoleFromEmail function for role determination
- **Retail Pricing Rounding (2025-07-16)**: Implemented 99-cent rounding for retail pricing tiers across Quote Calculator and Price List apps. When "Retail" tier is selected, prices are automatically rounded to .99 cents (e.g., 17.89 becomes 17.99, 16.40 becomes 16.99). Applied to all price displays including web interface, PDF exports, and CSV downloads for consistent pricing presentation
- **Shipping Calculator App (2025-07-16)**: Built comprehensive shipping calculator app inspired by SpeedShip functionality. Features include package dimension and weight input, automatic dimensional weight calculation, zone-based pricing, multiple service levels (Ground, Priority, Express, Overnight), surcharge calculations for high-value packages, calculation history with CSV export, and responsive design. Added to dashboard with truck icon and integrated into main navigation. App starts fresh each time user visits (no data persistence) but maintains session history for current use and CSV export functionality
- **Icon and Font Enhancement (2025-07-16)**: Updated all CSV export buttons across entire application to use Sheet icon instead of Download icon for better user experience. Fixed Quote Calculator product dropdown to properly apply brand-specific fonts to category and type selection lists. Completed font implementation: "Graffiti" uses Lobster font, "Polyester", "Paper", "Blended", "Poly", "Stick" use Roboto font, "Solvit" uses Inter 700, "CLiQ" uses Franklin Gothic, "Rang" uses Inter 400, "eLe/EiE" use Roboto, all other text uses Inter font. Font styling applies to individual words within product names for precise branding across all apps
- **UI/UX Enhancement (2025-07-16)**: Removed Configure button from Price List interface for cleaner design. Updated button styling across entire app: Download PDF buttons now use blue color with PDF icon, Export CSV buttons use green color with Excel icon. Implemented brand-specific font requirements: "Graffiti" uses Lobster font, "Polyester", "Paper", "Blended", "Poly", "Stick" use Roboto font, "Solvit" uses Inter 700, "CLiQ" uses Franklin Gothic, "Rang" uses Inter 400, "eLe/EiE" use Roboto, all other text uses Inter font. Font styling applies to individual words within product names for precise branding
- **PDF Generation Enhancement (2025-07-16)**: Fixed Price List PDF generation with proper pagination (page X of Y), 8.5x11 portrait orientation, updated column headers to "Price per Sheet" and added "Price Per Pack" column. Implemented automatic file saving for product updates and proper CSS print media queries for professional formatting. Fixed customer display to show selected customer's company name or hide "Price List for:" line when no customer is selected. Added "No Company Name Found" error message for PDF downloads without customer selection. Removed grayed out "Area Pricer" and "Data Guide" apps from dashboard to avoid confusion. Moved Customer Management and Product Management apps to Admin Tools section for better organization
- **Product Management App (2025-07-16)**: Created comprehensive Product Management app with Excel-like interface. Features include product catalog display with categories, types, sizes, dimensions, and pricing tiers. Admin-only editing capabilities with inline cell editing for dimensions, item codes, and quantities. Includes category filtering, upload functionality placeholder, and automatic CSV file saving. Added to dashboard and router with proper API endpoints
- **Customer Management Integration (2025-07-16)**: Added Customer Management card to main dashboard and implemented complete CRUD API endpoints for customer operations. Fixed Price List download to use selected customer data instead of manual input
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