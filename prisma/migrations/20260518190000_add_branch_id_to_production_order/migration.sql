-- Add branch linkage for production orders (nullable for backward compatibility)
ALTER TABLE "ProductionOrder"
ADD COLUMN "branchId" INTEGER;

CREATE INDEX "ProductionOrder_branchId_idx" ON "ProductionOrder"("branchId");
CREATE INDEX "ProductionOrder_branchId_date_idx" ON "ProductionOrder"("branchId", "date");

ALTER TABLE "ProductionOrder"
ADD CONSTRAINT "ProductionOrder_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
