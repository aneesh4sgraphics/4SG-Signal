# Replit.md - Quote Calculator Application

## Overview
This is a full-stack TypeScript application that provides a quote calculator for product pricing. It features a React frontend, a Node.js/Express backend, a PostgreSQL database with Drizzle ORM, and is styled with Tailwind CSS and shadcn/ui components. The application's UI is redesigned to emulate Odoo ERP's aesthetic, incorporating sidebar navigation, card-based layouts, and muted purple accents. Key capabilities include comprehensive product management, tiered pricing calculations, customer relationship management, and professional PDF generation for quotes and price lists. The project aims to provide an efficient, user-friendly tool for sales staff to generate accurate product quotes and manage pricing data.

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
- **UI/UX Decisions**: Odoo ERP-inspired clean, business-friendly design with sidebar navigation, card-based layouts, and muted purple accent colors. Features include professional favicon implementation, adaptive column resizing, color-coded quantity logic, and responsive design for various screen sizes.

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Style**: RESTful API endpoints
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: PostgreSQL session store (connect-pg-simple)
- **Development**: tsx for TypeScript execution
- **Technical Implementations**: Server-side PDF generation using html-pdf-node configured for system Chromium, robust authentication system with role-based access control, comprehensive CSV upload and synchronization logic with hash-based change detection, and dynamic logo fetching with fallback mechanisms.

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