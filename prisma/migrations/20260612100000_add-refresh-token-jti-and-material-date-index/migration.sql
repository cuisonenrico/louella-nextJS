-- Add jti (JWT ID) to RefreshToken for single-insert token creation
ALTER TABLE "RefreshToken" ADD COLUMN "jti" TEXT;
CREATE UNIQUE INDEX "RefreshToken_jti_key" ON "RefreshToken"("jti");

-- Add date index to MaterialInventory for efficient date-only queries
CREATE INDEX "MaterialInventory_date_idx" ON "MaterialInventory"("date");
