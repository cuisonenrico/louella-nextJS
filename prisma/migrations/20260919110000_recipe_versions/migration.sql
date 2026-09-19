-- CreateTable
CREATE TABLE "RecipeVersion" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "recipeYield" DOUBLE PRECISION NOT NULL,
    "retired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVersionItem" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "MeasurementUnit" NOT NULL,

    CONSTRAINT "RecipeVersionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeVersion_recipeId_effectiveFrom_idx" ON "RecipeVersion"("recipeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVersion_recipeId_version_key" ON "RecipeVersion"("recipeId", "version");

-- CreateIndex
CREATE INDEX "RecipeVersionItem_versionId_idx" ON "RecipeVersionItem"("versionId");

-- CreateIndex
CREATE INDEX "RecipeVersionItem_materialId_idx" ON "RecipeVersionItem"("materialId");

-- CreateIndex
CREATE INDEX "MaterialPriceHistory_materialId_effectiveAt_idx" ON "MaterialPriceHistory"("materialId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_productId_effectiveAt_idx" ON "ProductPriceHistory"("productId", "effectiveAt");

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersionItem" ADD CONSTRAINT "RecipeVersionItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RecipeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersionItem" ADD CONSTRAINT "RecipeVersionItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill
--
-- Dates are Manila calendar days: timestamps are stored in UTC, so
-- `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'` reads them as Manila time
-- before taking the date.
-- ---------------------------------------------------------------------------

-- Every existing recipe as it stands now becomes version 1, in force from the
-- day it was created. (Earlier edits overwrote their items; they are gone.)
INSERT INTO "RecipeVersion" ("recipeId", "version", "effectiveFrom", "recipeYield", "retired")
SELECT r."id", 1,
       (r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date,
       r."recipeYield", false
FROM "Recipe" r;

INSERT INTO "RecipeVersionItem" ("versionId", "materialId", "quantity", "unit")
SELECT v."id", ri."materialId", ri."quantity", ri."unit"
FROM "RecipeItem" ri
JOIN "RecipeVersion" v ON v."recipeId" = ri."recipeId" AND v."version" = 1;

-- A deleted recipe stops consuming from the day it was deleted.
INSERT INTO "RecipeVersion" ("recipeId", "version", "effectiveFrom", "recipeYield", "retired")
SELECT r."id", 2,
       (r."deletedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date,
       r."recipeYield", true
FROM "Recipe" r
WHERE r."deletedAt" IS NOT NULL;

-- Opening price rows, so costing a past day never falls back to today's
-- price: materials and products created before every write recorded one.
INSERT INTO "MaterialPriceHistory" ("materialId", "pricePerUnit", "effectiveAt")
SELECT m."id", m."pricePerUnit",
       ((m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date)::timestamp
FROM "Material" m
WHERE NOT EXISTS (SELECT 1 FROM "MaterialPriceHistory" h WHERE h."materialId" = m."id");

INSERT INTO "ProductPriceHistory" ("productId", "price", "effectiveAt")
SELECT p."id", p."price",
       ((LEAST(p."date", p."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date)::timestamp
FROM "Product" p
WHERE NOT EXISTS (SELECT 1 FROM "ProductPriceHistory" h WHERE h."productId" = p."id");
