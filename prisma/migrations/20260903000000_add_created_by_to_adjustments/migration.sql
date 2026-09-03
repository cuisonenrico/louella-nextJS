-- Audit trail for adjustments.
--
-- Inventory, Production, ProductionOrder and MaterialInventory all record who
-- entered a row; the two adjustment tables did not — the one place a stock
-- discrepancy (ANOMALY) or an unexplained pull-out would be written down.
--
-- Additive and nullable, so the frozen Cloud Run image, which never writes
-- these columns, keeps working against this database unchanged. Both tables are
-- small, so a plain CREATE INDEX is instant; CONCURRENTLY is not an option
-- inside Prisma's migration transaction anyway.

-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "MaterialAdjustment" ADD COLUMN     "createdById" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryAdjustment_createdById_idx" ON "InventoryAdjustment"("createdById");

-- CreateIndex
CREATE INDEX "MaterialAdjustment_createdById_idx" ON "MaterialAdjustment"("createdById");

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialAdjustment" ADD CONSTRAINT "MaterialAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
