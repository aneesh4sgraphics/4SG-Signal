import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Idempotent catalog data migration.
 * Applies confirmed product-type category assignments, archives excluded products,
 * and ensures the Misc. Products category + Banner Stands type exist.
 * Safe to run on every startup — each step checks before acting.
 */
export async function runCatalogDataMigration(): Promise<void> {
  try {
    // ── 1. Graffiti Polyester Paper (Scuff Free) → category 1 ──────────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = 1
      WHERE id IN (80, 81, 82, 83, 85)
        AND (category_id IS NULL OR category_id != 1)
    `);

    // ── 2. CoHo DTF → category 13 (DTF Film) ────────────────────────────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = 13
      WHERE id = 138
        AND (category_id IS NULL OR category_id != 13)
    `);

    // ── 3. Cleanse iT → exclude / archive ───────────────────────────────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET is_active = false
      WHERE id = 143 AND is_active = true
    `);
    await db.execute(sql`
      UPDATE product_pricing_master
      SET is_archived = true
      WHERE (catalog_product_type_id = 143
             OR item_code IN ('OCRMCL500ML', 'OCRMCL500ML-Carton'))
        AND (is_archived IS NULL OR is_archived = false)
    `);

    // ── 4. Misc. Products category (code=misc_products) ─────────────────────
    await db.execute(sql`
      INSERT INTO admin_categories (code, label, sort_order, is_active, created_at, updated_at)
      VALUES ('misc_products', 'Misc. Products', 20, true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING
    `);

    // ── 5. Banner Stands type under Misc. Products ───────────────────────────
    //    Rename type 152 and assign it to Misc. Products category.
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = (SELECT id FROM admin_categories WHERE code = 'misc_products'),
          label       = 'Banner Stands',
          code        = 'misc_banner_stands'
      WHERE id = 152
        AND (category_id IS NULL
             OR label != 'Banner Stands')
    `);

    // Update catalog_category_id on product_pricing_master rows
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = (SELECT id FROM admin_categories WHERE code = 'misc_products')
      WHERE catalog_product_type_id = 152
        AND catalog_category_id IS DISTINCT FROM
            (SELECT id FROM admin_categories WHERE code = 'misc_products')
    `);

    // Also update Scuff Free SKUs' catalog_category_id to 1
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 1
      WHERE catalog_product_type_id IN (80, 81, 82, 83, 85)
        AND (catalog_category_id IS NULL OR catalog_category_id != 1)
    `);

    // CoHo SKUs → catalog_category_id 13
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 13
      WHERE catalog_product_type_id = 138
        AND (catalog_category_id IS NULL OR catalog_category_id != 13)
    `);

    console.log('[CatalogMigration] Catalog data migration complete');
  } catch (error) {
    console.error('[CatalogMigration] Error during catalog data migration:', error);
  }
}
