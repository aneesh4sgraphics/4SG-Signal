# Replit.md - Quote Calculator Application

## Overview

This is a full-stack TypeScript application that provides a quote calculator for product pricing. The application uses a React frontend with a Node.js/Express backend, PostgreSQL database with Drizzle ORM, and is styled with Tailwind CSS and shadcn/ui components.

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