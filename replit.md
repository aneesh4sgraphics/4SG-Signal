# replit-Signal CRM — 4S Graphics

## Overview
A full-stack TypeScript sales management and CRM application designed for 4S Graphics. Its primary purpose is to streamline sales workflows, enhance customer relationship management, optimize pricing strategies, and provide daily AI-assisted coaching to sales representatives. The project aims to boost sales efficiency, improve customer engagement, and provide a competitive edge in the market.

Key capabilities include:
- Generating detailed quotes with tiered pricing.
- Comprehensive customer relationship management, including journey tracking.
- Visual sales pipeline management (Sales Kanban).
- AI-driven daily task coaching via the SPOTLIGHT system.
- Drip email campaigns with engagement tracking.
- An intelligent Task Inbox with auto-generated tasks.
- Best Price Engine for margin protection and volume discounts.
- Integration with Odoo ERP, Gmail, Google Calendar, and Shopify.
- Task delegation features.

## User Preferences
- **Communication style**: Simple, everyday language — no technical jargon
- **UI priority**: Clean, professional, low eye-strain ("Pastel & Soft" theme)
- **Sales rep dropdowns**: Always use `/api/sales-reps` — never `/api/users`

## System Architecture

### Core Technologies
- **Frontend:** React + TypeScript, TanStack Query v5, Wouter for routing, shadcn/ui + Tailwind CSS for styling.
- **Backend:** Node.js + Express.js, TypeScript.
- **Database:** PostgreSQL (Neon) managed with Drizzle ORM.
- **Authentication:** Replit Auth (OIDC) utilizing session cookies.

### UI/UX Decisions
The UI prioritizes a clean, professional aesthetic with a "Pastel & Soft" theme to reduce eye strain. Core components like the Task Inbox, Spotlight daily task engine, Dashboard, and Lead detail pages are designed for intuitive sales workflow management.

### Technical Implementations & Feature Specifications
- **SPOTLIGHT Task Engine:** Generates prioritized daily tasks across buckets like data hygiene, quote follow-up, trust-building, and lapsed customer engagement. It integrates with drip email campaigns, Odoo for follow-ups, and includes coaching compliance metrics. Features cross-user contact prevention and territory-based task reassignment.
- **Task Inbox:** Automatically generates actionable follow-up tasks from call logs, unreplied emails (based on keywords and thresholds), and drip sequence completions. It features inline rescheduling and delegation functionalities.
- **Task Delegation:** Allows sales reps or admins to reassign calendar-source tasks to other reps via a dedicated inline panel, updating `assignedTo` and `assignedToName` fields.
- **Dashboard — Today's Work Log:** Displays tasks completed on the current day, categorized by type with relevant contact links and completion times.
- **Drip Campaigns / Sequences:** Utilizes a background worker (`server/drip-email-worker.ts`) to send scheduled emails, track engagement, and surface urgent replies as Spotlight tasks.
- **Customer Journey:** A side panel feature supporting tracking and updating customer interaction milestones.
- **Sales Kanban / Opportunities:** Provides a drag-and-drop interface for managing sales pipeline stages, with activity logging for stage transitions.
- **Lead-Contact Parity & Companies:** Manages `companies` records to link `leads` and `customers`, with domain extraction and Odoo synchronization. Odoo contacts with $0 spending are imported as leads flagged `isAlsoContact`.
- **Shared Batch Address Label Printing:** Enables team-wide queueing for printing address labels for contacts and leads in various formats.
- **Win Path Visualization:** Displays a chronological sequence of interactions leading to Shopify orders on customer detail pages.
- **Automatic Lead-to-Customer Conversion:** Converts leads to customers upon a qualifying Shopify order, logging activity and mapping lead data.
- **Best Price Engine:** Implements logic for margin protection and volume discounts, synchronizing with Odoo Pricelists.

### System Design Choices
- **Database Schema:** Specific conventions for tables like `customers` (e.g., `company` for company name, `lastOutboundEmailAt`), `customerContacts`, `leads` (e.g., `street` for address), and `follow_up_tasks`. Emphasizes `id` column types and Drizzle ORM patterns.
- **Authentication:** Standardized pattern for extracting `userId` and `userEmail` from `req.user`. Requires `storage.getUser(userId)` for role checks due to production auth middleware limitations.
- **API Patterns:** New API routes must be placed before the catch-all in `routes.ts`. Frontend utilizes TanStack Query v5 for data fetching with specific cache invalidation strategies using array query keys.
- **Timezone Handling:** Server stores task due-dates at midnight UTC; client-side relies on `task.category === 'today'` as the authoritative source to prevent timezone-related display issues.

## External Dependencies

- **Odoo V19 ERP:** Manages customer data, product catalogs, pricelists, and orders.
- **Gmail API:** Powers email intelligence, drip campaigns, engagement tracking, and bounce detection.
- **OpenAI API:** Used for AI task extraction, email intelligence, and chatbot RAG.
- **Anthropic API:** Available for use via API key.
- **Shopify:** Provides e-commerce data and storefront management.
- **Google Calendar:** Integrates calendar functionalities for sales representatives.
- **Notion:** Used for knowledge base integration.
- **PostgreSQL (Neon):** The primary relational database for the application.