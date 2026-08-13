-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Product Alias Seed
--
-- Owns: ProductAlias. Run AFTER seed-products-apr2026.sql.
--
-- WHAT THIS TABLE IS FOR
--   Products are normally identified by (name, price-as-of-the-sheet-date)
--   straight from the catalog — see seed-products-apr2026.sql. An alias is the
--   escape hatch for the cases that rule cannot express:
--     * a one-off price typed into a row that is NOT a catalog price change
--       (a bulk order recorded in the retail slot), which must NOT go into
--       ProductPriceHistory or it would reprice the product from that day on;
--     * a sheet label whose text matches no product name at all.
--
-- HOW MATCHING USES IT (src/server/inventory-import/label-resolver.ts)
--   Aliases are consulted BEFORE the catalog, section-scoped: a row inside the
--   "Bote:" block only sees rows with section='bote', and a main-body row only
--   sees section=NULL. sheetLabel is normalised to lowercase+trimmed on load.
--
--   ⚠ IMPORTANT: adding ANY price-hinted alias for a label makes EVERY
--   uncovered price for that label refuse, by design — a label someone thought
--   worth pinning by price must never silently fall back to the catalog. So if
--   you add one price for a label you must add ALL of its valid prices. That is
--   why the two ordinary Pandesal Pack prices appear below alongside the two
--   one-offs.
--
-- OBSERVED IN: Jan1-13-2026.xlsx, Apr14-28-2026.xlsx, Apr29-May13-2026.xlsx.
-- Re-check against the full archive: any further one-off price will refuse
-- (loudly, naming the label and price) until it is added here.
-- ---------------------------------------------------------------------------

BEGIN;

TRUNCATE TABLE "ProductAlias" RESTART IDENTITY;

-- "Pandesal Pack" occupies two catalog slots: the ₱40 retail pack (id 34) and
-- the ₱1000 bulk sack (id 35). Three day-sheet rows carry a third and fourth
-- price in the RETAIL slot (sheet row 37) with delivery = 1:
--   Jan1-13  Day (4) and Day (5)  @ ₱300
--   Apr29-May13 Day (9)           @ ₱4200
-- Read as one-off bulk orders booked against the retail product, following the
-- ordinal convention (first "Pandesal Pack" row on a sheet = id 34).
--
-- ⚠ CONFIRM WITH THE CLIENT before importing: if ₱4200 is really the sack
-- (id 35) rather than the retail pack, change the productId on that row.
INSERT INTO "ProductAlias" ("productId", "sheetLabel", section, "priceHint", notes)
VALUES
  (34, 'pandesal pack', NULL,   40.00, 'retail pack — ordinary catalog price'),
  (35, 'pandesal pack', NULL, 1000.00, 'bulk sack — ordinary catalog price'),
  (34, 'pandesal pack', NULL,  300.00, 'one-off order, Jan1-13 Day (4)/(5); NOT a price change'),
  (34, 'pandesal pack', NULL, 4200.00, 'one-off order, Apr29-May13 Day (9); NOT a price change');

SELECT setval(pg_get_serial_sequence('"ProductAlias"', 'id'), COALESCE(MAX(id), 1)) FROM "ProductAlias";

COMMIT;
