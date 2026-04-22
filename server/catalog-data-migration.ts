import { db } from "./db";
import { sql } from "drizzle-orm";

const ORIGIN33_ITEM_CODES = [
  'SORIGIN-00A3S', 'SORIGIN-00A4S', 'SORIGIN-3378S', 'SORIGIN-33S',
  'SORIGIN-48S', 'SORIGIN-60S', 'SORIGIN-A3S', 'SORIGIN-A4S',
  'SORIGIN-BannerCarton', 'SORIGIN-DELUXE-33S', 'SREPEATSTAND - 56',
  'SZETABL-3378B', 'SZETABL-3378C',
];

/**
 * Idempotent catalog data migration.
 * Applies confirmed product-type category assignments, archives excluded products,
 * and ensures the Misc. Products category + Banner Stands type exist.
 * Safe to run on every startup — each step checks before acting.
 */
export async function runCatalogDataMigration(): Promise<void> {
  try {
    // ── 1. Graffiti Polyester Paper (Scuff Free) → category 1 ──────────────
    const scuffFreeResult = await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = 1
      WHERE id IN (80, 81, 82, 83, 85)
        AND (category_id IS NULL OR category_id != 1)
    `);

    // Update catalog_category_id on their SKUs
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 1
      WHERE catalog_product_type_id IN (80, 81, 82, 83, 85)
        AND (catalog_category_id IS NULL OR catalog_category_id != 1)
    `);

    // ── 2. CoHo DTF → category 13 (DTF Film) ────────────────────────────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = 13
      WHERE id = 138
        AND (category_id IS NULL OR category_id != 13)
    `);

    // Update CoHo SKUs
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 13
      WHERE catalog_product_type_id = 138
        AND (catalog_category_id IS NULL OR catalog_category_id != 13)
    `);

    // ── 3. Cleanse iT → exclude / archive ───────────────────────────────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET is_active = false
      WHERE id = 143 AND is_active = true
    `);
    const cleansedResult = await db.execute(sql`
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
    //    Use INSERT ... ON CONFLICT to ensure the type exists idempotently.
    await db.execute(sql`
      INSERT INTO catalog_product_types (code, label, category_id, is_active)
      SELECT 'misc_banner_stands', 'Banner Stands', ac.id, true
      FROM admin_categories ac
      WHERE ac.code = 'misc_products'
        AND NOT EXISTS (
          SELECT 1 FROM catalog_product_types cpt
          WHERE cpt.code = 'misc_banner_stands'
        )
    `);

    // ── 6. Remap the 13 Origin 33 SKUs to the Banner Stands type ────────────
    //    By item code — works regardless of what catalog_product_type_id was before.
    const itemCodeList = ORIGIN33_ITEM_CODES.map(c => `'${c}'`).join(', ');
    const remapResult = await db.execute(sql`
      UPDATE product_pricing_master ppm
      SET
        catalog_product_type_id = (
          SELECT id FROM catalog_product_types WHERE code = 'misc_banner_stands' LIMIT 1
        ),
        catalog_category_id = (
          SELECT id FROM admin_categories WHERE code = 'misc_products' LIMIT 1
        )
      WHERE ppm.item_code IN (${sql.raw(itemCodeList)})
        AND (
          ppm.catalog_product_type_id IS DISTINCT FROM (
            SELECT id FROM catalog_product_types WHERE code = 'misc_banner_stands' LIMIT 1
          )
          OR ppm.catalog_category_id IS DISTINCT FROM (
            SELECT id FROM admin_categories WHERE code = 'misc_products' LIMIT 1
          )
        )
    `);

    // ── 7. Keep legacy type 152 consistent (rename + assign category) ────────
    //    In case type 152 still exists with the old label.
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = (SELECT id FROM admin_categories WHERE code = 'misc_products'),
          label       = 'Banner Stands',
          code        = 'misc_banner_stands'
      WHERE id = 152
        AND code != 'misc_banner_stands'
    `);

    // ── Verification summary ─────────────────────────────────────────────────
    const verifyScuffFree = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types WHERE id IN (80,81,82,83,85) AND category_id = 1
    `);
    const verifyCoho = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types WHERE id = 138 AND category_id = 13
    `);
    const verifyCleanse = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM product_pricing_master
      WHERE item_code IN ('OCRMCL500ML','OCRMCL500ML-Carton') AND is_archived = true
    `);
    const verifyBannerStands = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM product_pricing_master ppm
      JOIN catalog_product_types cpt ON cpt.id = ppm.catalog_product_type_id
      WHERE cpt.code = 'misc_banner_stands'
        AND (ppm.is_archived IS NULL OR ppm.is_archived = false)
    `);

    const sfOk = (verifyScuffFree.rows[0] as any).cnt === 5;
    const cohoOk = (verifyCoho.rows[0] as any).cnt === 1;
    const cleanseOk = (verifyCleanse.rows[0] as any).cnt === 2;
    const bannerOk = (verifyBannerStands.rows[0] as any).cnt >= 13;

    console.log(
      `[CatalogMigration] Migration complete. ` +
      `ScuffFree→cat1: ${sfOk ? '✓' : '✗'} (${(verifyScuffFree.rows[0] as any).cnt}/5 types), ` +
      `CoHo→cat13: ${cohoOk ? '✓' : '✗'}, ` +
      `Cleanse archived: ${cleanseOk ? '✓' : '✗'} (${(verifyCleanse.rows[0] as any).cnt}/2 SKUs), ` +
      `BannerStands: ${bannerOk ? '✓' : '✗'} (${(verifyBannerStands.rows[0] as any).cnt} SKUs active)`
    );
  } catch (error) {
    console.error('[CatalogMigration] Error during catalog data migration:', error);
  }
}
