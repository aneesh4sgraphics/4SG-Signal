import { db } from "./db";
import { sql } from "drizzle-orm";

const ORIGIN33_ITEM_CODES = [
  'SORIGIN-00A3S', 'SORIGIN-00A4S', 'SORIGIN-3378S', 'SORIGIN-33S',
  'SORIGIN-48S', 'SORIGIN-60S', 'SORIGIN-A3S', 'SORIGIN-A4S',
  'SORIGIN-BannerCarton', 'SORIGIN-DELUXE-33S', 'SREPEATSTAND - 56',
  'SZETABL-3378B', 'SZETABL-3378C',
];

interface CountRow { cnt: number; }

/**
 * Idempotent catalog data migration.
 * Applies confirmed product-type category assignments, archives excluded products,
 * and ensures the Misc. Products + Graffiti Polyester - SPECIALTIES categories exist.
 * Safe to run on every startup — each step uses conditional logic to avoid
 * duplicate-key violations and no-op on already-applied data.
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
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 1
      WHERE catalog_product_type_id IN (80, 81, 82, 83, 85)
        AND (catalog_category_id IS NULL OR catalog_category_id != 1)
    `);

    // ── 2. Graffiti Blockout Polyester 11 mil (id 84) → category 1 ──────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = 1
      WHERE id = 84
        AND (category_id IS NULL OR category_id != 1)
    `);
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 1
      WHERE catalog_product_type_id = 84
        AND (catalog_category_id IS NULL OR catalog_category_id != 1)
    `);

    // ── 3. CoHo DTF → category 13 (DTF Film) ────────────────────────────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = 13
      WHERE id = 138
        AND (category_id IS NULL OR category_id != 13)
    `);
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 13
      WHERE catalog_product_type_id = 138
        AND (catalog_category_id IS NULL OR catalog_category_id != 13)
    `);

    // ── 4. Cleanse iT → exclude / archive ───────────────────────────────────
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

    // ── 5. Pinnacle Aluminum Fabric (id 154) → category 8 (Solvit) ──────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = 8
      WHERE id = 154
        AND (category_id IS NULL OR category_id != 8)
    `);
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = 8
      WHERE catalog_product_type_id = 154
        AND (catalog_category_id IS NULL OR catalog_category_id != 8)
    `);

    // ── 6. Graffiti Polyester - SPECIALTIES category (new, user-confirmed) ───
    //    Assigned types (all were previously unmapped, category_id IS NULL):
    //    id 148 – Graffiti Metallic Polyester (Dual)
    //    id 144 – Graffiti Photo Paper - Sample Pack
    //    id 145 – Graffiti STRATA 8 mil
    //    id 146 – Graffiti STRATA 5 mil
    await db.execute(sql`
      INSERT INTO admin_categories (code, label, sort_order, is_active, created_at, updated_at)
      VALUES ('graffiti_poly_specialties', 'Graffiti Polyester - SPECIALTIES', 3, true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING
    `);
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = (SELECT id FROM admin_categories WHERE code = 'graffiti_poly_specialties')
      WHERE id IN (148, 144, 145, 146)
        AND (
          category_id IS NULL
          OR category_id != (SELECT id FROM admin_categories WHERE code = 'graffiti_poly_specialties')
        )
    `);
    await db.execute(sql`
      UPDATE product_pricing_master
      SET catalog_category_id = (SELECT id FROM admin_categories WHERE code = 'graffiti_poly_specialties')
      WHERE catalog_product_type_id IN (148, 144, 145, 146)
        AND (
          catalog_category_id IS NULL
          OR catalog_category_id != (SELECT id FROM admin_categories WHERE code = 'graffiti_poly_specialties')
        )
    `);

    // ── 7. Misc. Products category (code=misc_products) ─────────────────────
    await db.execute(sql`
      INSERT INTO admin_categories (code, label, sort_order, is_active, created_at, updated_at)
      VALUES ('misc_products', 'Misc. Products', 20, true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING
    `);

    // ── 8. Banner Stands type under Misc. Products ───────────────────────────
    await db.execute(sql`
      UPDATE catalog_product_types
      SET category_id = (SELECT id FROM admin_categories WHERE code = 'misc_products'),
          label       = 'Banner Stands',
          code        = 'misc_banner_stands'
      WHERE id = 152
        AND code != 'misc_banner_stands'
        AND NOT EXISTS (
          SELECT 1 FROM catalog_product_types
          WHERE code = 'misc_banner_stands' AND id != 152
        )
    `);
    // Fallback: create fresh row if code doesn't exist yet
    await db.execute(sql`
      INSERT INTO catalog_product_types (code, label, category_id, is_active)
      SELECT 'misc_banner_stands', 'Banner Stands', ac.id, true
      FROM admin_categories ac
      WHERE ac.code = 'misc_products'
        AND NOT EXISTS (
          SELECT 1 FROM catalog_product_types WHERE code = 'misc_banner_stands'
        )
    `);

    // ── 9. Remap the 13 Origin 33 SKUs to the Banner Stands type ────────────
    const itemCodeList = ORIGIN33_ITEM_CODES.map(c => `'${c}'`).join(', ');
    await db.execute(sql`
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

    // ── Verification summary ─────────────────────────────────────────────────
    const sfRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types WHERE id IN (80,81,82,83,85) AND category_id = 1
    `);
    const blockoutRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types WHERE id = 84 AND category_id = 1
    `);
    const cohoRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types WHERE id = 138 AND category_id = 13
    `);
    const cleanseRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM product_pricing_master
      WHERE item_code IN ('OCRMCL500ML','OCRMCL500ML-Carton') AND is_archived = true
    `);
    const pinnacleRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types WHERE id = 154 AND category_id = 8
    `);
    const specialtiesRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types cpt
      JOIN admin_categories ac ON ac.id = cpt.category_id
      WHERE cpt.id IN (148, 144, 145, 146)
        AND ac.code = 'graffiti_poly_specialties'
    `);
    const bannerRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM product_pricing_master ppm
      JOIN catalog_product_types cpt ON cpt.id = ppm.catalog_product_type_id
      WHERE cpt.code = 'misc_banner_stands'
        AND (ppm.is_archived IS NULL OR ppm.is_archived = false)
    `);
    const unmappedRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM catalog_product_types
      WHERE category_id IS NULL AND is_active = true
    `);

    const sfCnt       = (sfRows.rows[0]         as CountRow).cnt;
    const blkCnt      = (blockoutRows.rows[0]   as CountRow).cnt;
    const cohoCnt     = (cohoRows.rows[0]        as CountRow).cnt;
    const clnCnt      = (cleanseRows.rows[0]     as CountRow).cnt;
    const pinCnt      = (pinnacleRows.rows[0]    as CountRow).cnt;
    const specCnt     = (specialtiesRows.rows[0] as CountRow).cnt;
    const banCnt      = (bannerRows.rows[0]       as CountRow).cnt;
    const unmappedCnt = (unmappedRows.rows[0]    as CountRow).cnt;

    console.log(
      `[CatalogMigration] Migration complete. ` +
      `ScuffFree→cat1: ${sfCnt === 5 ? '✓' : '✗'} (${sfCnt}/5), ` +
      `Blockout→cat1: ${blkCnt === 1 ? '✓' : '✗'}, ` +
      `CoHo→cat13: ${cohoCnt === 1 ? '✓' : '✗'}, ` +
      `Cleanse archived: ${clnCnt === 2 ? '✓' : '✗'} (${clnCnt}/2 SKUs), ` +
      `Pinnacle→cat8: ${pinCnt === 1 ? '✓' : '✗'}, ` +
      `Specialties: ${specCnt === 4 ? '✓' : '✗'} (${specCnt}/4 types), ` +
      `BannerStands: ${banCnt >= 13 ? '✓' : '✗'} (${banCnt} SKUs active), ` +
      `Unmapped active types: ${unmappedCnt === 0 ? '✓' : '✗'} (${unmappedCnt})`
    );
  } catch (error) {
    console.error('[CatalogMigration] Error during catalog data migration:', error);
  }
}
