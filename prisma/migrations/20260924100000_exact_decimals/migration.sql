-- Exact decimals (F20): material and recipe quantities become numeric(14,4),
-- conversion factors numeric(18,9). The cast rounds existing doubles to the
-- new scale, which can move a card's close by up to 0.0001 against the next
-- day's stored opening: run `npx tsx scripts/repair-stock-chains.ts --apply`
-- after deploying so every opening equals the rounded close again.

-- AlterTable
ALTER TABLE "Recipe" ALTER COLUMN "recipeYield" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "RecipeVersion" ALTER COLUMN "recipeYield" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "RecipeVersionItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "RecipeItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "MaterialInventory" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "delivery" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "used" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "MaterialAdjustment" ALTER COLUMN "value" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "UnitConversion" ALTER COLUMN "factor" SET DATA TYPE DECIMAL(18,9);

