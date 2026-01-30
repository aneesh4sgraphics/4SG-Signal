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
    - **DRIP Email Integration:** Automatically surfaces urgent replies to drip campaigns and stale drip follow-ups as high-priority tasks.
    - **Differentiated Task Cards:** Visually distinct task cards based on their source (email, drip, lead, Odoo quote/sample) to provide context.
    - **Odoo Quotation Follow-up:** Generates follow-up tasks for pending Odoo quotations with relevant details and actions.
    - **Odoo Sample Order Follow-up:** Detects $0.00 Odoo sales orders (samples) and prompts follow-up with a "Pro Tip."
    - **Today's Progress Bars:** Five dedicated progress bars tracking daily activity:
      1. **Quotes FollowedUp** (⭐ high priority): Count of Odoo/Shopify quotes followed up via call or email
      2. **SwatchBooks**: Count of swatch books + press test kits sent + $0 sample order follow-ups
      3. **Calls**: Count of all calls made today (any task with 'called' outcome)
      4. **Emails**: Count of all emails sent today (email_sent, send_drip, replied outcomes)
      5. **Data Hygiene**: Count of all data hygiene bucket tasks completed (includes research tasks)

## External Dependencies

- **Odoo V19 ERP:** Used for customer data, product catalogs, pricelists, and orders.
- **Gmail API:** Integrated for email intelligence, drip campaigns, engagement tracking, and bounce detection.
- **OpenAI API:** Powers the AI chatbot with a hybrid RAG approach.
- **Shopify:** Integrated for e-commerce data and storefront management.
- **PostgreSQL:** The primary database for storing application data.