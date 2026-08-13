-- CreateTable
CREATE TABLE "ProductAlias" (
    "id"         SERIAL NOT NULL,
    "productId"  INTEGER NOT NULL,
    "sheetLabel" TEXT NOT NULL,
    "section"    TEXT,
    "priceHint"  DECIMAL(10,2),
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAlias_productId_idx" ON "ProductAlias"("productId");

-- CreateIndex
CREATE INDEX "ProductAlias_sheetLabel_idx" ON "ProductAlias"("sheetLabel");

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma's @@unique leaves NULL section / priceHint rows non-distinct, which
-- would allow two conflicting aliases for the same label. COALESCE the
-- nullable columns to sentinels so the constraint actually holds. -1 is safe
-- as a price sentinel because prices are non-negative. Note: unlike a
-- Prisma-generated migration, no "ProductAlias_sheetLabel_section_priceHint_key"
-- index was ever created above (the plain @@unique is intentionally not
-- materialized in SQL — see the NOTE comment on the ProductAlias model in
-- schema.prisma), so there is nothing to DROP here; this expression index is
-- the only enforcement of that uniqueness.
--
-- sheetLabel is keyed as lower(trim(...)) because that is exactly how the
-- application looks it up (LabelResolver normalizes both the alias on load
-- and the sheet label on resolve). A case-sensitive index would let 'Litro'
-- and 'litro' both insert with conflicting productIds while only one of them
-- could ever match.
CREATE UNIQUE INDEX "ProductAlias_lookup_key"
  ON "ProductAlias" (lower(trim("sheetLabel")), COALESCE(section, ''), COALESCE("priceHint", -1));
