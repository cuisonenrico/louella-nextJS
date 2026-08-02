-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "deletedAt" TIMESTAMP(3);
