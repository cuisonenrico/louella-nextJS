-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "respondedById" INTEGER,
ADD COLUMN     "transferStatus" "TransferStatus",
ADD COLUMN     "transferToInventoryId" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryAdjustment_transferToInventoryId_idx" ON "InventoryAdjustment"("transferToInventoryId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_transferStatus_idx" ON "InventoryAdjustment"("transferStatus");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_respondedById_idx" ON "InventoryAdjustment"("respondedById");

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_transferToInventoryId_fkey" FOREIGN KEY ("transferToInventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: transfers made before confirmation existed were booked on both
-- legs at once, which is what ACCEPTED now means. Mark both legs so pending
-- lists never show them.
UPDATE "InventoryAdjustment"
SET "transferStatus" = 'ACCEPTED'
WHERE "linkedAdjustmentId" IS NOT NULL;
