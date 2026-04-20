-- ============================================================
-- ONE-TIME MIGRATION: Convert tier prices from total-pack to $/m² rates
-- ============================================================
-- Date applied: 2026-04-20
-- Status: ALREADY APPLIED (438 rows updated via executeSql in dev session)
--
-- CONTEXT:
--   product_pricing_master previously stored the total price per pack/roll
--   in each tier column (e.g. landed_price = 1.90 for a pack whose totalSqm = 3.0161).
--   The QuickQuotes engine and BestPriceEngine always treated these values as $/m² rates
--   and multiplied by totalSqm again, producing doubly-inflated prices.
--
--   This migration divides each tier column by total_sqm so the stored value
--   becomes the correct $/m² rate (e.g. 1.90 / 3.0161 = 0.6300 $/m²).
--
-- VERIFICATION (run before/after to confirm):
--   SELECT item_code, total_sqm, landed_price,
--          ROUND(landed_price * total_sqm, 4) AS back_calculated_pack_price
--   FROM product_pricing_master
--   WHERE total_sqm > 0 AND landed_price IS NOT NULL
--   LIMIT 10;
--
-- BEFORE (sample):
--   GOSF05-08x11 | total_sqm=3.0161 | landed_price=1.90  | back_calc=5.7306 (wrong)
--   CMAT170-0811M | total_sqm=6.0322 | landed_price=2.17  | back_calc=13.0899 (wrong)
--
-- AFTER (confirmed applied):
--   GOSF05-08x11  | total_sqm=3.0161 | landed_price=0.6300 | back_calc=1.9001 ✓
--   CMAT170-0811M | total_sqm=6.0322 | landed_price=0.36   | back_calc=2.1716 ✓
-- ============================================================

BEGIN;

UPDATE product_pricing_master
SET
  landed_price             = CASE WHEN total_sqm > 0 AND landed_price             IS NOT NULL THEN ROUND(landed_price             / total_sqm, 4) ELSE landed_price             END,
  export_price             = CASE WHEN total_sqm > 0 AND export_price             IS NOT NULL THEN ROUND(export_price             / total_sqm, 4) ELSE export_price             END,
  master_distributor_price = CASE WHEN total_sqm > 0 AND master_distributor_price IS NOT NULL THEN ROUND(master_distributor_price / total_sqm, 4) ELSE master_distributor_price END,
  dealer_price             = CASE WHEN total_sqm > 0 AND dealer_price             IS NOT NULL THEN ROUND(dealer_price             / total_sqm, 4) ELSE dealer_price             END,
  dealer2_price            = CASE WHEN total_sqm > 0 AND dealer2_price            IS NOT NULL THEN ROUND(dealer2_price            / total_sqm, 4) ELSE dealer2_price            END,
  approval_needed_price    = CASE WHEN total_sqm > 0 AND approval_needed_price    IS NOT NULL THEN ROUND(approval_needed_price    / total_sqm, 4) ELSE approval_needed_price    END,
  tier_stage25_price       = CASE WHEN total_sqm > 0 AND tier_stage25_price       IS NOT NULL THEN ROUND(tier_stage25_price       / total_sqm, 4) ELSE tier_stage25_price       END,
  tier_stage2_price        = CASE WHEN total_sqm > 0 AND tier_stage2_price        IS NOT NULL THEN ROUND(tier_stage2_price        / total_sqm, 4) ELSE tier_stage2_price        END,
  tier_stage15_price       = CASE WHEN total_sqm > 0 AND tier_stage15_price       IS NOT NULL THEN ROUND(tier_stage15_price       / total_sqm, 4) ELSE tier_stage15_price       END,
  tier_stage1_price        = CASE WHEN total_sqm > 0 AND tier_stage1_price        IS NOT NULL THEN ROUND(tier_stage1_price        / total_sqm, 4) ELSE tier_stage1_price        END,
  retail_price             = CASE WHEN total_sqm > 0 AND retail_price             IS NOT NULL THEN ROUND(retail_price             / total_sqm, 4) ELSE retail_price             END
WHERE total_sqm > 0;

-- Expected: 438 rows updated (only rows with total_sqm > 0 are modified)
-- Rows with total_sqm = 0 are unchanged (no valid conversion possible)

COMMIT;
