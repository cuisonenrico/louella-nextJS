-- Who last amended a row, as opposed to who first entered it.
--
-- Inventory, InventoryAdjustment and MaterialInventory all recorded createdById
-- and nothing else, so every subsequent edit was anonymous — including the ones
-- that move revenue, since adjustments feed `sold`. "Who entered this" was
-- answerable; "who changed it to this" was not.
--
-- Additive and nullable, so the frozen Cloud Run image keeps working against
-- this database unchanged: it never writes these columns. Existing rows keep a
-- NULL updatedById, which reads correctly as "never edited since this column
-- existed" rather than as a false attribution.

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "MaterialInventory" ADD COLUMN     "updatedById" INTEGER;

-- CreateIndex
CREATE INDEX "Inventory_updatedById_idx" ON "Inventory"("updatedById");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_updatedById_idx" ON "InventoryAdjustment"("updatedById");

-- CreateIndex
CREATE INDEX "MaterialInventory_updatedById_idx" ON "MaterialInventory"("updatedById");

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialInventory" ADD CONSTRAINT "MaterialInventory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
