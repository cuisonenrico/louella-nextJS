-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Product Alias Seed
--
-- Owns: ProductAlias. Run AFTER seed-products-apr2026.sql.
--
-- CURRENTLY EMPTY, AND THAT IS THE CORRECT STATE.
--
-- Every label in the known archive resolves from the catalog alone, because
-- products are identified by (name, price-as-of-the-sheet-date) and
-- seed-product-price-history.sql records every price change on the day it took
-- effect. Verified over Jan1-13-2026, Apr14-28-2026 and Apr29-May13-2026:
-- 7,866 product rows, 0 ambiguous, 0 unmatched, no aliases needed.
--
-- An earlier revision of this file carried four Pandesal Pack rows to cover
-- one-off prices (₱300 in January, ₱4200 in May). Those were a workaround for
-- a price history built from one snapshot per workbook, which could not see a
-- change that happened mid-fortnight. The history is now built from every day
-- sheet, so those prices are recorded as what they are — price changes on the
-- days they took effect — and the aliases are no longer needed.
--
-- WHEN YOU WOULD ADD A ROW HERE
--   The escape hatch remains, for the cases (name, price) genuinely cannot
--   express:
--     * a sheet label whose text matches no product name at all, e.g. the
--       sheet is renamed but the catalog is not;
--     * two same-named products that end up at the SAME price on the same
--       date, which price can no longer separate (the importer refuses these
--       with "cannot separate them — add a ProductAlias to disambiguate").
--
-- HOW MATCHING USES IT (src/server/inventory-import/label-resolver.ts)
--   Aliases are consulted BEFORE the catalog, section-scoped: a row inside the
--   "Bote:" block only sees rows with section='bote', a main-body row only
--   sees section=NULL. sheetLabel is normalised to lowercase+trimmed on load.
--
--   ⚠ Adding ANY price-hinted alias for a label makes EVERY uncovered price
--   for that label refuse, by design — a label someone thought worth pinning
--   by price must never silently fall back to the catalog. So if you add one
--   price for a label you must add ALL of its valid prices. Prefer recording a
--   genuine price change in seed-product-price-history.sql instead.
-- ---------------------------------------------------------------------------

BEGIN;

TRUNCATE TABLE "ProductAlias" RESTART IDENTITY;

COMMIT;
