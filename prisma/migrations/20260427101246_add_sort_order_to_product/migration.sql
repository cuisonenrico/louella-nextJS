-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill sortOrder per type
DO $$
BEGIN
  UPDATE "Product" p
  SET "sortOrder" = rp.row_index
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY type ORDER BY "createdAt" ASC, id ASC) - 1 AS row_index
    FROM "Product"
    WHERE "deletedAt" IS NULL
  ) rp
  WHERE p.id = rp.id;
END $$;

-- CreateIndex
CREATE INDEX "Product_type_sortOrder_idx" ON "Product"("type", "sortOrder");
