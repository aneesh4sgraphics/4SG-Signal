ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "product_types" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
