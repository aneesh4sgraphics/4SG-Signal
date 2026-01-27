# Quote Calculator & CRM Application

## Overview
A full-stack TypeScript sales management application for a specialty products business (printing/signage). Built with React frontend, Node.js/Express backend, and PostgreSQL database. The system integrates with Odoo V19 ERP for customer/product data, Gmail for email intelligence, and Shopify for e-commerce.

**Key Capabilities:**
- Quote generation with tiered pricing and PDF output
- CRM with customer journey tracking and machine profiles
- Leads pipeline with trust-building workflow stages
- SPOTLIGHT daily coaching system for sales reps
- Email Studio with drip campaigns and engagement tracking
- AI chatbot with hybrid RAG (OpenAI + BM25 fallback)
- Best Price Engine with margin protection and volume discounts

## Quick Start
```bash
npm run dev         # Start the app (frontend + backend on port 5000)
npm run db:push     # Push schema changes to database
```

---

## Environment Setup

### Required Secrets (set in Replit Secrets tab)
| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Replit) |
| `ODOO_URL` | Odoo instance URL (e.g., `https://company.odoo.com`) |
| `ODOO_DATABASE` | Odoo database name |
| `ODOO_USERNAME` | Odoo API username |
| `ODOO_API_KEY` | Odoo API key |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `SHOPIFY_STORE_DOMAIN` | Shopify store domain |
| `SHOPIFY_ACCESS_TOKEN` | Shopify Admin API token |
| `SESSION_SECRET` | Session encryption key |

### Environment Variables (shared)
- `GOOGLE_REDIRECT_URI` - Gmail OAuth callback URL
- `SHOPIFY_APP_URL` - Shopify app base URL
- `SHOPIFY_SCOPES` - Shopify API permissions

---

## Project Structure

### Frontend (`client/src/`)
```
pages/                        # Main application pages
├── dashboard-odoo.tsx        # Home dashboard with sales metrics
├── quote-calculator.tsx      # Core quote generation tool
├── price-list.tsx            # Price list viewer/generator
├── odoo-contacts.tsx         # Customer list (card view)
├── odoo-company-detail.tsx   # Customer detail page with contacts
├── odoo-products.tsx         # Product catalog from Odoo
├── odoo-product-detail.tsx   # Individual product view
├── leads.tsx                 # Leads pipeline kanban board
├── lead-detail.tsx           # Individual lead management
├── spotlight.tsx             # Daily coaching treadmill
├── gmail-insights.tsx        # Email intelligence dashboard
├── email-app.tsx             # Email composer/viewer
├── calendar.tsx              # Appointments/follow-ups
├── admin-config.tsx          # Admin settings (rules, coaching)
├── reports.tsx               # Financial metrics (admin only)
├── crm-journey.tsx           # Customer journey builder
└── competitor-pricing-fixed.tsx  # Market price tracking

components/                   # Reusable UI components
├── ui/                       # shadcn/ui components
│   └── sidebar.tsx           # Main navigation sidebar
├── OdooLayout.tsx            # Page layout wrapper
├── AIChatbot.tsx             # AI assistant modal
├── CustomerCoachPanel.tsx    # Sales coaching widget
└── DailyProgressHero.tsx     # SPOTLIGHT progress display

lib/                          # Utilities
└── queryClient.ts            # TanStack Query setup

hooks/                        # Custom React hooks
└── use-toast.ts              # Toast notifications
```

### Backend (`server/`)
```
index.ts                  # Express server entry point
routes.ts                 # All API routes (~5000 lines)
storage.ts                # Database interface (IStorage)
odoo.ts                   # Odoo ERP JSON-RPC client
gmail-client.ts           # Gmail API integration
gmail-intelligence.ts     # Email analysis & insights
spotlight-engine.ts       # Daily task generation logic
best-price-engine.ts      # Pricing recommendation system
pdf-generator.ts          # Quote/label PDF generation
replitAuth.ts             # Authentication handling
shopify.ts                # Shopify integration
odoo-sync-worker.ts       # Background Odoo sync
gmail-sync-worker.ts      # Background email sync
```

### Shared (`shared/`)
```
schema.ts                 # Database tables (Drizzle ORM)
```

---

## Key Concepts for New Developers

### 1. Odoo V19 Integration
- Syncs customers, products, pricelists, and orders
- **Important**: Odoo V19's `res.partner` doesn't support the `mobile` field
  - `server/odoo.ts` has `UNSUPPORTED_PARTNER_FIELDS` that auto-filters these
- Customers = Companies (`is_company: true`)
- Contacts = Child partners linked via `parent_id`

### 2. Email as Universal ID
All systems use normalized email for cross-platform matching:
```typescript
normalizeEmail("John.Doe@GMAIL.COM") → "johndoe@gmail.com"
```

### 3. SPOTLIGHT Coaching System
Generates daily prioritized tasks for sales reps:
- Overdue follow-ups
- Hot leads needing attention
- Customers with declining engagement
- Reorder opportunities

### 4. UI Design Pattern ("Pastel & Soft")
- Cream background: `#FDFBF7`
- Glassmorphism cards with soft shadows
- Muted purple accents for actions
- Designed for professionals 30-50 to reduce eye strain

### 5. Data Flow Architecture
```
Frontend (React + TanStack Query)
    ↓ API calls
Backend (Express routes.ts)
    ↓ Storage interface
PostgreSQL (Drizzle ORM)
    ↕ External APIs
Odoo V19 | Gmail | Shopify
```

---

## Database

### Migrations
```bash
npm run db:push          # Push schema changes
npm run db:push --force  # Force push if normal fails
```

### Key Tables
| Table | Purpose |
|-------|---------|
| `customers` | Local CRM data (synced with Odoo) |
| `leads` | Sales leads with trust-building stages |
| `quotes` | Generated quotes |
| `productPricingMaster` | Unified product/pricing data |
| `spotlightTasks` | Daily coaching tasks |
| `customerJourneys` | Journey definitions |
| `emailThreads` | Gmail sync data |

---

## Common Development Tasks

### Adding a New Page
1. Create file in `client/src/pages/`
2. Add route in `client/src/App.tsx`
3. Add sidebar link in `client/src/components/ui/sidebar.tsx`

### Adding an API Endpoint
1. Add route in `server/routes.ts`
2. Add storage method in `server/storage.ts` if needed
3. Update types in `shared/schema.ts` if new data

### Fixing Odoo Integration Issues
1. Check `UNSUPPORTED_PARTNER_FIELDS` in `server/odoo.ts`
2. Verify field names match Odoo V19 schema
3. Test with small data set first

---

## User Preferences
- **Communication style**: Simple, everyday language
- **Avoid**: Technical jargon in user-facing text
- **UI priority**: Clean, professional, low eye-strain

## Troubleshooting
See `DEBUGGING_GUIDE.md` for connection issues and error diagnosis.
