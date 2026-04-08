# replit-Signal CRM — 4S Graphics

## Overview
Full-stack TypeScript sales management and CRM application for 4S Graphics. Streamlines sales workflows, enhances customer relationship management, optimizes pricing, and provides daily AI-assisted coaching for sales reps.

**Key Capabilities:**
- Generate detailed quotes with tiered pricing and PDF output
- Manage customer relationships including journey tracking and machine profiles
- Visualize and manage leads through a sales pipeline (Sales Kanban)
- Daily task coaching for sales reps via the SPOTLIGHT system
- Drip email campaigns with engagement tracking
- Task Inbox with auto-generated tasks from calls, emails, and drip sequences
- Bounced email detection and hygiene tasks
- Best Price Engine for margin protection and volume discounts
- Integration with Odoo ERP, Gmail, Google Calendar, and Shopify

---

## User Preferences
- **Communication style**: Simple, everyday language — no technical jargon
- **UI priority**: Clean, professional, low eye-strain ("Pastel & Soft" theme)
- **Sales rep dropdowns**: Always use `/api/sales-reps` — never `/api/users`

---

## System Architecture

### Core Technologies
- **Frontend:** React + TypeScript, TanStack Query v5, Wouter routing, shadcn/ui + Tailwind CSS
- **Backend:** Node.js + Express.js, TypeScript
- **Database:** PostgreSQL (Neon), managed with Drizzle ORM
- **Auth:** Replit Auth (OIDC) with session cookies

### Key Files
| File | Purpose |
|---|---|
| `server/routes.ts` | All API routes (~30,700 lines) |
| `server/spotlight-engine.ts` | Spotlight task generation engine (~6,600 lines) |
| `server/storage.ts` | Database access layer |
| `server/drip-email-worker.ts` | Drip campaign background worker |
| `shared/schema.ts` | Drizzle ORM schema + Zod insert types |
| `client/src/App.tsx` | Route definitions and providers |
| `client/src/pages/task-inbox.tsx` | Task Inbox page |
| `client/src/pages/spotlight.tsx` | Spotlight daily task engine UI |
| `client/src/pages/sequences.tsx` | Drip Campaign / Sequences page |
| `client/src/components/FloatingCallLogger.tsx` | Floating call logger widget |
| `client/src/components/CustomerJourneyPanel.tsx` | Customer journey side panel |
| `client/src/pages/integrations-settings.tsx` | Gmail/Calendar/Odoo integration settings |

---

## Critical Rules & Known Pitfalls

### Database Schema
- `customers` table: **NO `name` column** — company name is in `company` field
- `customerContacts` table: **NO `title` column** — use `role`
- `leads` table address field: `street` (NOT `address`)
- `follow_up_tasks` table: has both `customerId` and `leadId` columns
- `emailSends` table: has `leadId`, `customerId`, `subject`, `sentAt`, `status`
- **NEVER change primary key ID column types** (serial ↔ varchar breaks migrations)

### Auth & Users
- **Dev user ID:** `dev-user-123`
- **Production Aneesh ID:** `45980257` | patricio: `45163473` | santiago: `45165274`
- Production auth middleware does **NOT** populate `req.user.role` — always use `storage.getUser(userId)` for role checks
- All sales rep dropdowns must use `/api/sales-reps` — never `/api/users`

### API Patterns
- `routes.ts` is 30,700+ lines — use `sed -n 'X,Yp'` for targeted reads
- TanStack Query v5: always use object form `useQuery({ queryKey: [...] })`
- Mutations must invalidate cache by `queryKey` using `queryClient` from `@lib/queryClient`
- Array query keys for hierarchical invalidation: `['/api/recipes', id]` not `` [`/api/recipes/${id}`] ``

### Gmail OAuth
- Gmail OAuth **only works on production URL** `https://4sgraphics.replit.app`
- Dev preview returns 403 from Google — this is expected behavior
- OAuth connect flow: `GET /api/gmail-oauth/connect` → Google → callback

### Tiptap / Rich Text
- `@tiptap/react` does **NOT** export `BubbleMenu` — use inline state tracking instead

### Logo
- Served at `window.location.origin + '/4s-logo.png'` (`client/public/4s-logo.png`)
- Email signature width: 60px

---

## Feature Details

### SPOTLIGHT Task Engine
Generates prioritized daily tasks for sales reps (50 tasks/day in 5 repeating cycles).

- **Task Buckets:** Data hygiene, quote follow-up, trust-building, lapsed customer engagement
- **Fallback Priority:** Connect leads → follow up quotes → contact customers → send mailers/samples
- **Lead Integration:** Leads appear based on urgency and stage
- **Cross-User Contact Prevention:** Prevents multiple reps contacting the same entity
- **Territory Skip Tracking:** "Not My Territory" marks for reassignment
- **Bounced Email Detection:** Scans Gmail for bounces, creates high-priority hygiene tasks
- **Remind Me Again Today:** Defers tasks to "Later Today Scratch Pad"
- **Session State Persistence:** Preserves progress across page refreshes
- **Performance:** Task prefetch cache, `setQueryData` for instant UI updates, piggyback pattern
- **DRIP Email Integration:** Surfaces urgent drip replies and stale follow-ups as high-priority tasks
- **Email Intelligence Bridge:** Email Event Extractor (regex) + Gmail Insights (OpenAI) → Spotlight tasks
- **Odoo Follow-up Tasks:** Generates tasks for pending Odoo quotes and sample orders
- **Coaching Compliance Metric:** Weighted composite score (task completion, timeliness, calls vs. goal)
- **Today's Progress Bars:** Quotes FollowedUp, SwatchBooks, Calls, Emails, Data Hygiene
- **Known recurring issue:** `ReferenceError: repId is not defined` at `spotlight-engine.ts:4497` in `findEnablementTask` — fires on every page load, not yet resolved

### Task Inbox (Auto-Task Generation)
Auto-generates actionable follow-up tasks from multiple sources:

- **Call logs:** AI-extracted tasks + manual date picker after each logged call
- **Emails Not Replied:** 5-day threshold for emails with specific subject keywords (Price per Sheet, Pricing, Price List, Press Test Sheets, Press Kit, Samples) and Gmail-sent emails
- **Drip sequence follow-up:** Auto-task 3 days after a drip sequence step completes
- **Tasks navigation:** Visible in main sidebar at all times (not collapsed under Automations)

### Drip Campaigns / Sequences
- Background worker: `server/drip-email-worker.ts`
- Sends Gmail emails on configured schedule intervals
- Tracks engagement (opens, clicks, replies)
- Surfaces urgent replies as Spotlight tasks

### Customer Journey
- Side panel: `client/src/components/CustomerJourneyPanel.tsx`
- Supports `PUT` and `PATCH` (both aliased) on `PATCH /api/crm/journey-instances/:id`
- ISO date string coercion applied for `completedAt` / `startedAt` fields

### Sales Kanban / Opportunities
- Full drag-and-drop pipeline board at `/opportunities`
- Stage transitions logged as activities

### Lead-Contact Parity & Companies
- `companies` table links `leads` and `customers` to shared company records
- Company domain auto-extracted from email
- Odoo synchronization for companies is two-phase

### Gmail Integration
- **Connect Gmail:** Real OAuth button in Integrations Settings → triggers `/api/gmail-oauth/connect`
- **Disconnect Gmail:** Revokes tokens and clears stored credentials
- **Gmail Sent Mail Auto-Activity Sync:** Logs sent emails from Gmail as activity events on customer/lead records
- **IMAP client:** `server/imap-client.ts` for reading inbox
- **Sync worker:** `server/gmail-sync-worker.ts` runs on 30-minute interval

### Shared Batch Address Label Printing
- Team-wide queue for printing address labels (contacts/leads)
- Formats: 4×6 Thermal and Letter 30-up
- Logs activity based on item sent

### Win Path Visualization
- Chronological interaction sequence leading to Shopify orders on customer detail pages
- Shows interaction counts and time-from-first-touch

### Automatic Lead-to-Customer Conversion
- Converts leads to customers when a Shopify order (>$50) is placed by matching email
- Logs activity and maps lead fields

### Best Price Engine
- `server/best-price-engine.ts`
- Margin protection and volume discount logic
- Odoo Pricelist → local `pricingTier` sync

---

## External Dependencies

| Service | Purpose |
|---|---|
| **Odoo V19 ERP** | Customer data, product catalogs, pricelists, orders |
| **Gmail API** | Email intelligence, drip campaigns, engagement tracking, bounce detection |
| **OpenAI API** | AI task extraction, email intelligence, chatbot RAG |
| **Anthropic API** | Available via `ANTHROPIC_API_KEY` secret |
| **Shopify** | E-commerce data, storefront management |
| **Google Calendar** | Calendar integration for sales reps |
| **Notion** | Knowledge base integration |
| **PostgreSQL (Neon)** | Primary database |

---

## Background Workers (server/index.ts startup)

| Worker | Schedule |
|---|---|
| `drip-email-worker` | Continuous (checks pending sends) |
| `quote-followup-worker` | Periodic |
| `data-retention` | Daily cleanup |
| `odoo-sync-worker` | Daily Odoo sync |
| `spotlightDigestWorker` | Periodic digest |
| `gmail-sync-worker` | Every 30 minutes |
| `taxonomy-seed` | On startup (idempotent) |
| `spotlight-coaching-seed` | On startup (idempotent) |

---

## Recent Changes (April 2026)

### April 8 — Click Flow & Matching Bug Fixes
- **Broken link fixed:** `admin-config.tsx` pointed to `/odoo-company/:id` (nonexistent) — corrected to `/odoo-contacts/:id`
- **Contact auto-linking:** `POST /api/customers` now auto-sets `parentCustomerId` when a contact's company name matches an existing company entity (`isCompany=true`)
- **Task Inbox clickable names:** Customer/lead names in task list, emails-not-replied, sequence follow-ups, and press test entries are now clickable links to their detail pages
- **Gmail emails clickable:** Email rows on company detail page now open Gmail search on click (was non-interactive)
- **Products clickable:** "Products Purchased" on company detail page now links to `/odoo-products/:productId` (added `productId` to Odoo metrics response)
- **Contact tab fixes:** `hashCode` crash replaced with index-based IDs; local contacts show "Local" badge and are clickable links; `POST /api/odoo/customer/:id/contacts` saves locally with `parentCustomerId`

### April 2 — Codebase Cleanup
- Deleted 4 unused component files: `TutorialCenter.tsx`, `AIChatbot.tsx`, `AppSwitcherDrawer.tsx`, `TutorialOverlay.tsx` (none imported anywhere — reduces JS bundle)
- Removed 4 unguarded `console.log` statements from `quote-calculator.tsx` that were firing in production on every page load (filter validation logs, PDF retry log)

### April 2 — Task Inbox Overhaul (Task #8, merged)
- Tasks navigation moved to always-visible main sidebar (no longer buried under "Automations")
- Auto-task generation from call logs (AI-extracted + manual date picker)
- "Emails Not Replied" auto-tasks after 5-day threshold with subject keyword detection
- Drip sequence follow-up auto-tasks (3 days after step completion)
- `follow_up_tasks` table gained `leadId` column for lead-scoped tasks

### April 1 — Integrations Page Rebuild
- Gmail: real "Connect Gmail" OAuth button (`/api/gmail-oauth/connect`) + Disconnect button
- Calendar: step-by-step reconnect guide added
- Odoo integration panel improved

### April 1 — Bug Fixes
- **Gmail OAuth crash fixed:** Replaced `require('crypto').randomUUID()` with `const { randomUUID } = await import('node:crypto')` (ESM compatibility)
- **Customer Journey PATCH fix:** Frontend was calling `PATCH` but only `PUT` existed — added PATCH alias; ISO date coercion added for `completedAt`/`startedAt`
