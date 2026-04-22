ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "is_also_contact" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "also_contact_customer_id" varchar;
