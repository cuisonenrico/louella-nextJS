-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MaterialAdjustment" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "deletedAt" TIMESTAMP(3);
