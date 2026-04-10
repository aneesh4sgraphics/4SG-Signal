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
- Task delegation — reassign any calendar task to another sales rep

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
| `server/routes.ts` | Core API routes + catch-all (new routes MUST go before the `/api/*` catch-all) |
| `server/routes-tasks.ts` | All task-related API routes (list, complete, reschedule, critical, reassign, etc.) |
| `server/routes-leads.ts` | Lead API routes |
| `server/spotlight-engine.ts` | Spotlight task generation engine |
| `server/storage.ts` | Database access layer |
| `server/drip-email-worker.ts` | Drip campaign background worker |
| `server/cache.ts` | Server-side cache helpers |
| `shared/schema.ts` | Drizzle ORM schema + Zod insert types |
| `client/src/App.tsx` | Route definitions and providers |
| `client/src/pages/task-inbox.tsx` | Task Inbox page (filters, detail dialog, reschedule, delegate) |
| `client/src/pages/spotlight.tsx` | Spotlight daily task engine UI |
| `client/src/pages/dashboard-odoo.tsx` | Main dashboard (Kanban + Today's Work Log card) |
| `client/src/pages/lead-detail.tsx` | Lead detail page (tasks tab, edit, calls) |
| `client/src/pages/sequences.tsx` | Drip Campaign / Sequences page |
| `client/src/components/FloatingCallLogger.tsx` | Floating call logger widget |
| `client/src/components/CustomerJourneyPanel.tsx` | Customer journey side panel |
| `client/src/pages/integrations-settings.tsx` | Gmail/Calendar/Odoo integration settings |

---

## Critical Rules & Known Pitfalls

### Database Schema
- `customers` table: **NO `name` column** — company name is in `company` field
- `customers` table: **NO `lastContactAt`** — use `lastOutboundEmailAt`; **NO `assignedTo`** — use `salesRepName`; `id` is varchar (UUID)
- `customerContacts` table: **NO `title` column** — use `role`
- `leads` table address field: `street` (NOT `address`)
- `follow_up_tasks` table: has both `customerId` and `leadId` columns; also has `assignedTo` (email) and `assignedToName` columns
- `emailSends` table: has `leadId`, `customerId`, `subject`, `sentAt`, `status`
- **NEVER change primary key ID column types** (serial ↔ varchar breaks migrations)
- **Drizzle pattern:** Never mix raw column references with `sql<>` template

### Auth & Users
- **Dev user ID:** `dev-user-123`
- **Production Aneesh ID:** `45980257` | patricio: `45163473` | santiago: `45165274`
- Production auth middleware does **NOT** populate `req.user.role` — always use `storage.getUser(userId)` for role checks
- **Canonical auth pattern in routes:** `const userId = (req.user as any)?.claims?.sub || req.user?.id;` and `const userEmail = ((req.user as any)?.claims?.email || req.user?.email || '').toLowerCase();`
- All sales rep dropdowns must use `/api/sales-reps` (returns `{ id, name, email }[]`) — never `/api/users`

### API Patterns
- `routes.ts` is 30,700+ lines — use `sed -n 'X,Yp'` for targeted reads
- **CRITICAL:** Any new API route must be placed **before** the `app.use('/api/*', ...)` catch-all in `routes.ts`
- TanStack Query v5: always use object form `useQuery({ queryKey: [...] })`
- Mutations must invalidate cache by `queryKey` using `queryClient` from `@lib/queryClient`
- Array query keys for hierarchical invalidation: `['/api/recipes', id]` not `` [`/api/recipes/${id}`] ``

### Timezone Handling
- Server stores task due-dates at midnight UTC; client timezone (PDT) shifts them to the previous evening
- **Fix:** Always trust `task.category === 'today'` (server-authoritative) as fallback when `isPast()` is true — do NOT rely solely on client-side date comparison

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
- **Lead Integration:** Leads appear based on urgency and stage; lead tasks use synthetic `lead-{id}` customerId in memory but store `null` + `{ leadId }` in metadata in DB
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

- **Call logs (Call Follow-ups tab):** AI-extracted tasks + manual date picker after each logged call. Dedicated sidebar nav item with a **blue badge** showing count. A small blue "Call" badge appears on every call-originated task row across all other tabs too.
- **Emails Not Replied:** 5-day threshold for emails with specific subject keywords (Price per Sheet, Pricing, Price List, Press Test Sheets, Press Kit, Samples) and Gmail-sent emails
- **Drip sequence follow-up:** Auto-task 3 days after a drip sequence step completes
- **Tasks navigation:** Visible in main sidebar at all times (not collapsed under Automations)
- **Reschedule:** Inline date/time picker panel in task detail dialog (indigo color scheme)
- **Delegate:** Inline rep-picker panel in task detail dialog (violet color scheme) — only shown for calendar-source tasks; calls `PATCH /api/tasks/:id/reassign`; available to assignee or admin
- **Task completion invalidation:** invalidates `["/api/tasks/list"]`, `["/api/tasks/summary"]`, `["/api/tasks/completed-today"]`, `["/api/dashboard/kanban"]`

### Task Delegation
- **Button:** Purple "Delegate" button appears in the task detail dialog for calendar-type tasks when sales reps exist
- **UI:** Inline panel (mirrors Reschedule UX) with a native `<select>` of all reps from `/api/sales-reps`; Reschedule and Delegate panels are mutually exclusive; both reset on dialog close
- **Endpoint:** `PATCH /api/tasks/:id/reassign` — updates `assignedTo` (email) and `assignedToName` on `followUpTasks`; requires caller to be the current assignee **or** an admin
- **Local state update:** `selectedTask` is updated immediately on success so the dialog reflects the new assignee without re-fetch

### Dashboard — Today's Work Log
- New card on the main dashboard showing tasks completed **today**
- **Endpoint:** `GET /api/tasks/completed-today` — returns tasks completed today with linked lead/customer names
- **Display:** Emoji icons per task type, linked contact names (clickable to detail pages), completion times, rep name (for admins), "Done" badge
- Card is hidden when there are no completions for the day

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

### April 10 — Task Delegation
- **Delegate button** added to task detail dialog (violet, ArrowUpDown icon) — visible for calendar-source tasks when sales reps are available
- **Inline delegate panel** opens below the action buttons (same UX as Reschedule); contains a native `<select>` populated from `/api/sales-reps`; Reschedule and Delegate panels are mutually exclusive; both reset on dialog close
- **New endpoint:** `PATCH /api/tasks/:id/reassign` in `routes-tasks.ts` — updates `assignedTo` and `assignedToName`; caller must be the assignee or an admin
- `selectedTask` state updated immediately on delegate success so the dialog reflects the new assignee without waiting for a re-fetch

### April 10 — Call Follow-ups & Dashboard Work Log
- **Call Follow-ups tab** added to Task Inbox sidebar nav with a blue badge showing count; filters tasks by `sourceType='call_log'`; a small blue "Call" badge appears on call-originated task rows across all tabs
- **Timezone bug fixed:** Tasks due at midnight UTC were invisible due to client-side PDT offset; now trusts `task.category === 'today'` (server-authoritative) as the source of truth
- **Today's Work Log** card added to main dashboard: `GET /api/tasks/completed-today` endpoint returns tasks completed today; card shows emoji per task type, linked contact names, completion time, rep name (admin view), and "Done" badges; hidden when empty

### April 10 — Spotlight & UX Bug Fixes (6 bugs)
- Lead edit form: toast now fires correctly after save
- Create Lead dialog: all fields now render properly
- Cmd+K command palette: restored and functional
- Lead Tasks tab: now shows real persisted data (not empty)
- BulkEmailComposer preview: fixed rendering issue
- Calls tab + Log Call button: now working correctly on lead detail page

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
