-- MaterialInventory.date becomes a DATE, matching Inventory.date.
--
-- As a bare timestamp this column stored whatever time came in. `@IsDateString()`
-- accepts a full ISO datetime, so `2026-09-08T10:00:00Z` was stored verbatim —
-- a second stock card for the same day, which @@unique([materialId, date])
-- cannot catch because the two values genuinely differ. Application writes are
-- now normalised to UTC midnight, and this stops the column holding anything
-- else.
--
-- Backward-compatible with the frozen Cloud Run image: Inventory.date is
-- already DATE and that image reads and writes it fine, so this is a shape it
-- demonstrably handles. Postgres applies an assignment cast on write, so a
-- timestamp it sends is truncated rather than rejected.
--
-- Guarded rather than forced. If legacy rows exist whose times differ within a
-- single day, truncating would violate the unique index; this aborts with an
-- explanation instead of failing on a constraint error or silently dropping a
-- card. Nothing is deleted or merged automatically — that is a data decision,
-- not a migration's to make.
DO $$
DECLARE
  collisions INTEGER;
BEGIN
  SELECT COUNT(*) INTO collisions FROM (
    SELECT "materialId", ("date")::date AS day
    FROM "MaterialInventory"
    GROUP BY "materialId", ("date")::date
    HAVING COUNT(*) > 1
  ) AS dupes;

  IF collisions > 0 THEN
    RAISE EXCEPTION
      'MaterialInventory has % (materialId, day) group(s) with more than one card, which would collide once date is truncated to a day. Inspect them with: SELECT "materialId", ("date")::date, COUNT(*) FROM "MaterialInventory" GROUP BY 1, 2 HAVING COUNT(*) > 1; then merge or remove the extras before re-running this migration.',
      collisions;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "MaterialInventory" ALTER COLUMN "date" SET DATA TYPE DATE;
