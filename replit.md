# Quote Calculator & CRM Application

## Overview
This is a full-stack TypeScript sales management application designed for a specialty products business (printing/signage). It aims to streamline sales processes, enhance customer relationship management, and optimize pricing strategies. The project integrates with existing business tools like Odoo ERP, Gmail, and Shopify to provide a comprehensive sales platform.

**Key Capabilities:**
- Generate detailed quotes with tiered pricing and PDF output.
- Manage customer relationships with journey tracking and machine profiles.
- Visualize and manage leads through a pipeline with trust-building stages.
- Provide daily coaching for sales representatives via the SPOTLIGHT system.
- Conduct email drip campaigns and track engagement.
- Offer an AI chatbot with hybrid RAG for support.
- Employ a "Best Price Engine" to ensure margin protection and apply volume discounts.

## User Preferences
- **Communication style**: Simple, everyday language
- **Avoid**: Technical jargon in user-facing text
- **UI priority**: Clean, professional, low eye-strain

## System Architecture

**Core Technologies:**
- **Frontend:** React with TypeScript, utilizing TanStack Query for data fetching.
- **Backend:** Node.js with Express.js, written in TypeScript.
- **Database:** PostgreSQL, managed with Drizzle ORM for schema definition and interaction.

**Key Architectural Decisions & Features:**
- **UI/UX Design:** "Pastel & Soft" theme featuring a cream background (`#FDFBF7`), glassmorphism cards with soft shadows, and muted purple accents. Designed to reduce eye strain for professionals.
- **Data Flow:** A clear separation between the React frontend, Express backend, PostgreSQL database, and external APIs.
- **Odoo V19 Integration:** Synchronizes customer, product, pricelist, and order data. Handles specific Odoo V19 field limitations (e.g., `mobile` field for `res.partner`). Distinguishes between Odoo "Customers" (companies) and "Contacts" (individuals linked to companies).
- **Email as Universal ID:** All internal and external systems use a normalized email format for consistent cross-platform user identification.
- **SPOTLIGHT Coaching System:** A robust system for generating prioritized daily tasks for sales reps.
    - **Sequenced Task Pattern:** 50 tasks/day organized in 5 repeating cycles of 10 tasks each:
      1. **Data Hygiene (3 tasks)** - Start each cycle with easy wins
      2. **Quote Follow-up (1 task)** - Follow up on pending quotes
      3. **SwatchBooks/Press Test Kits (3 tasks)** - Trust building activities
      4. **Lapsed Customer Call (1 task)** - Reconnect with dormant customers
      5. **Data Hygiene (2 tasks)** - End cycle with easy tasks
    - **Fallback Priority** (when primary bucket exhausted):
      1. Connect with 3 Leads (email or phone)
      2. Follow up on 5 Quotes
      3. Follow up with 5 customers (calls or email)
      4. Send at least 3 Mailers/SwatchBooks/Press test kits
    - **Task Buckets:** Organizes tasks by difficulty and type (calls, follow-ups, outreach, data hygiene, enablement).
    - **Lead Integration:** Fully integrates leads into daily tasks based on urgency and stage.
    - **Cross-User Contact Prevention:** Automatically prevents multiple reps from contacting the same customer/lead on the same day.
    - **Territory Skip Tracking:** Allows reps to mark customers as "Not My Territory," cycling them to other reps, and flagging customers skipped by all for admin review.
    - **Bounced Email Detection:** Scans Gmail for bounce notifications, parses them, and creates high-priority hygiene tasks for investigation. Provides user options for resolution (Do Not Contact, Delete, Keep Active, Investigate Later).
    - **Remind Me Again Today:** A feature to defer tasks to later in the day, tracked via a "Later Today Scratch Pad."
    - **Session State Persistence:** Ensures progress bars and session state survive restarts.
    - **Performance Optimization:** Task prefetch cache (claim-on-serve), exclude list caching (10s TTL), and piggyback pattern where complete/skip responses include the next task data. Frontend uses `setQueryData` instead of `invalidateQueries` for instant card transitions. Generation counter guards against stale prefetch results.
    - **DRIP Email Integration:** Automatically surfaces urgent replies to drip campaigns and stale drip follow-ups as high-priority tasks.
    - **Differentiated Task Cards:** Visually distinct task cards based on their source (email, drip, lead, Odoo quote/sample) to provide context. Email intelligence cards show color-coded event type badges (PO=emerald, Pricing Objection=amber, Samples=blue, Urgent=red, AI Insight=purple), trigger text, confidence percentage, and coaching tips.
    - **Email Intelligence → Spotlight Bridge:** Two pipelines feed email signals into Spotlight:
      1. **Email Event Extractor** (regex-based): Detects 16 event types including `pricing_objection`, creates followUpTasks with `sourceType='email_event'`. Spotlight enriches these with event details from `emailSalesEvents` table.
      2. **Gmail Insights** (OpenAI-analyzed): High-confidence insights (≥0.70) for sales_opportunity/follow_up/promise/task types auto-create followUpTasks with `sourceType='gmail_insight'`. The separate `/email-insights` page now redirects to Spotlight.
    - **Odoo Quotation Follow-up:** Generates follow-up tasks for pending Odoo quotations with relevant details and actions.
    - **Odoo Sample Order Follow-up:** Detects sample orders from Odoo using two methods: (1) $0.00 sales orders, or (2) orders where Customer Reference field contains "Samples". Creates follow-up tasks with context about how the sample was identified.
    - **Coaching Compliance Metric:** Executive culture metric showing weighted composite score (50% task completion rate, 30% follow-up timeliness, 20% calls vs goal). Color-coded: green ≥80%, amber ≥60%, red <60%. Shows breakdown tiles for Tasks Done, On Time, and Calls.
    - **Today's Progress Bars:** Five dedicated progress bars tracking daily activity:
      1. **Quotes FollowedUp** (⭐ high priority): Count of Odoo/Shopify quotes followed up via call or email
      2. **SwatchBooks**: Count of swatch books + press test kits sent + $0 sample order follow-ups
      3. **Calls**: Count of all calls made today (any task with 'called' outcome)
      4. **Emails**: Count of all emails sent today (email_sent, send_drip, replied outcomes)
      5. **Data Hygiene**: Count of all data hygiene bucket tasks completed (includes research tasks)

- **Shared Batch Address Label Printing:** Team-wide shared queue stored in the database (`label_queue` table). All users contribute to and see the same queue simultaneously.
    - Users click the printer icon next to contacts/leads to add addresses to a label queue.
    - Bulk "Print Address Labels" button in Companies page multi-select bar adds all selected contacts to queue.
    - A floating indicator shows the queue count; min 1 label to print.
    - **Two label formats:**
      1. **4×6 Thermal** (default): 4 labels per page, stacked vertically with dashed cut lines.
      2. **Letter 30-up**: Avery 5160/5260 compatible, 3 columns × 10 rows = 30 labels per 8.5×11 sheet.
    - Print dialog asks "What are you sending?" (Swatch Book, Press Test Kit, Mailer, Letter, Something Else) for activity tracking.
    - Address format: Contact Name → Company Name → Street → Street 2 → City, State, ZIP.
    - No label type text on the printed PDF (clean address-only labels).
    - Each label logs activity to the correct customer (`sample_shipped` or `product_info_shared`) or lead (`sample_sent`).
    - Backend endpoint: `POST /api/labels/print-batch` (accepts array of customer/lead IDs + `labelFormat` field).
    - Old single-print endpoint (`POST /api/labels/print`) still works for Spotlight's inline label flow.
    - `LabelQueueProvider` wraps the app in `App.tsx`; `LabelQueueIndicator` shows the floating print button.

- **Win Path Visualization:** On customer detail pages, shows the chronological sequence of interactions (emails, mailers, swatch books, press test kits, calls, quotes, samples, meetings) that led to each Shopify order, when the order occurred after the first email sent from the app. Includes summary badges of interaction counts and "days from first touch" metric. Backend endpoint: `GET /api/customers/:customerId/win-path`. Dashboard also has `GET /api/dashboard/sales-wins` for team-wide win attribution.

- **Automatic Lead-to-Customer Conversion:** When a Shopify order over $50 is placed by someone whose email matches an active lead (not already converted or lost), the lead is automatically converted to a customer in Contacts. The conversion maps all lead fields (name, email, phone, address, sales rep, pricing tier, tags, etc.) to the new customer record, marks the lead stage as "converted", and logs an activity event. This runs in three places: Shopify order webhook, order sync, and order listing auto-match.

## Feature Backlog
Features requested but not yet built — carry forward to future sessions.

1. **Email Thread Continuity** — When sending follow-up emails (drip sequences or manual from Spotlight/Contacts), each subsequent email should send as a reply in the same Gmail thread, so both sender and recipient see the full conversation history. Requires:
   - Add `gmailMessageId` (varchar 255), `gmailThreadId` (varchar 100), `rawMessageId` (varchar 500) columns to `emailSends` table
   - Add `gmailThreadId` to `dripCampaignStepStatus` table
   - Update `sendEmail()` in `server/gmail-client.ts` and `sendEmailAsUser()` in `server/user-gmail-oauth.ts` to accept optional `threadingOptions?: { inReplyTo, references, gmailThreadId }`; pass `threadId` in the Gmail send API call; return `{ id, threadId, rawMessageId }`
   - Update `server/drip-email-worker.ts`: before sending step N, look up step N-1's `rawMessageId` + `gmailThreadId` via join, pass as `threadingOptions`; save returned `gmailThreadId` on the step status row
   - Update `POST /api/email/send` in `server/routes.ts`: query most recent `emailSend` for the `customerId`/`leadId` with a non-null `gmailThreadId`, auto-thread if found (unless `replyToThread: false` passed in body), save returned IDs to the new row
   - Add thread indicator in Spotlight email compose modal and Contact detail email modal: "Will be sent as a reply to keep your thread intact" with a small toggle to disable

## Lead-Contact Parity & Company Auto-Linking (v1 — complete)
- **`companies` table**: `id`, `name`, `domain` (unique), `odooCompanyPartnerId`, `odooSyncedAt`
- **New columns on `leads`**: `companyDomain` (text, auto-derived from email), `companyId` (FK → companies)
- **New columns on `customers`**: `companyDomain`, `jobTitle`, `companyId` (FK → companies), `odooCompanyId`
- **`extractCompanyDomain(email)`** added to `shared/email-normalizer.ts` — returns null for free providers
- **POST/PUT `/api/leads`**: auto-computes `companyDomain` from email on create/update
- **POST `/api/leads/:id/qualify`**: now does full company-aware conversion — validates requirements, finds/creates company, inserts customer record, auto-converts sibling leads from same domain, sets stage → `converted`
- **GET `/api/companies`**: lists companies with `contactCount` and `leadCount`
- **GET `/api/companies/:id/contacts`**: returns company + its linked contacts
- **Odoo push** (lead push-to-odoo): two-phase sync — checks local `companies.odooCompanyPartnerId` first; if missing, creates Odoo company partner and saves back; falls back to name search if no local company record
- **By Company view** in Contacts page: third toggle in view switcher (Building2 icon), groups contacts by `companyDomain` into collapsible company cards; standalone contacts shown last

## Sales Rep Dropdown — Consistent Rules (IMPORTANT)

**Single source of truth:** Every sales rep dropdown in the app MUST use `/api/sales-reps` — never `/api/users`.
This applies to: `ClientDetailView.tsx`, `spotlight.tsx`, `lead-detail.tsx`, `quote-calculator.tsx`, `odoo-company-detail.tsx`.

**Server-side filter** (`refreshSalesRepsCache` in `server/routes.ts`):
- Source is always Odoo (`odooClient.getUsers()`); local `users` table is only a fallback when Odoo is unreachable.
- Excluded logins (never shown): `admin`, `public`, `__system__`, `default`, `test`, `ashv`, `info`, `noreply`, `no-reply`, `support`, `sales`, `billing`, `demo`.
- Company-alias pattern: names with a hyphen but no space (e.g. `4SGraphics-Info`) are excluded.
- Raw-login echo: names ≤4 chars that are all-lowercase are excluded.
- Only accounts with a real email (contains `@`) are included.

**If a rep's name is appearing in raw/lowercase form** (e.g. `patricio`, `santiago`), the fix is to update their display name in Odoo to include their full first + last name.

## Odoo Pricelist → Local pricingTier Sync

**Problem:** The `property_product_pricelist` field from Odoo (e.g. "SHOPIFY2", "RETAIL") was NOT being mapped to the local `customers.pricing_tier` column during Odoo import or resync. The old code incorrectly tried to use `category_id` (which returns plain integer IDs, not tuples) as the source. This caused Spotlight to generate false-positive `hygiene_pricing_tier` tasks for customers already configured in Odoo.

**Fix (routes.ts):**
1. **Resync endpoint** (`POST /api/odoo/customer/:id/resync`): When `customer.pricingTier` is null, seed it from `partner.property_product_pricelist[1]` (the pricelist name string). Local value is authoritative once set — Odoo only seeds null values.
2. **Import endpoint** (`POST /api/odoo/import-partners`): Seed `pricingTier` from `partner.property_product_pricelist[1]` for newly imported customers.
3. **Bulk admin endpoint** (`POST /api/admin/pull-pricing-from-odoo`): Batch-fetches `property_product_pricelist` for all customers with `pricing_tier IS NULL AND odoo_partner_id IS NOT NULL`, updates local records. Exposed as "Sync Pricing Tiers from Odoo" card in Admin → Data Management.

**Spotlight hygiene false positive fix**: After running the bulk pull, customers with Odoo pricelists will have their local `pricingTier` populated and will no longer appear in the `hygiene_pricing_tier` Spotlight queue.

## Gmail Sent Mail Auto-Activity Sync (Task #3)

Automatically logs sent emails from Gmail as activity events on the corresponding customer/lead records.
- `server/gmail-sent-activity-sync.ts`: Core sync logic — scans the Gmail "Sent" folder, matches sent emails to customer/lead records by normalized email, creates `email_sent` activity events.
- Integrated into `server/gmail-intelligence.ts` and the periodic Gmail sync scheduler.
- Boot-time migration adds `last_sent_sync_at` column to `user_gmail_connections` table to track per-user sync progress.

## External Dependencies

- **Odoo V19 ERP:** Used for customer data, product catalogs, pricelists, and orders.
- **Gmail API:** Integrated for email intelligence, drip campaigns, engagement tracking, and bounce detection.
- **OpenAI API:** Powers the AI chatbot with a hybrid RAG approach.
- **Shopify:** Integrated for e-commerce data and storefront management.
- **PostgreSQL:** The primary database for storing application data.