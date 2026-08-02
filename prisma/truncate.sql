-- ─────────────────────────────────────────────────────────────────────────────
-- LOUELLA BAKERY — Truncate Script
-- Clears ALL seed data (truncating "Branch" cascades through User.branchId,
-- so User/RefreshToken/DeviceToken are wiped too — login accounts are
-- recreated by seed-local.sql or seed-users.sql).
-- Run this before re-seeding. Seed order:
--   seed-materials.sql  ->  seed-products.sql  ->  seed-local.sql
-- (materials before products so recipes resolve ingredient names; products
--  before local so operational rows reference the catalog. seed-materials has
--  no user dependency — MaterialInventory.createdById is seeded NULL.)
-- Login accounts are created by seed-local.sql (or standalone seed-users.sql).
-- ─────────────────────────────────────────────────────────────────────────────

-- Disable FK checks by truncating in dependency order (children first)
TRUNCATE TABLE
  "MaterialAdjustment",
  "MaterialInventory",
  "MaterialPriceHistory",
  "RecipeItem",
  "Recipe",
  "InventoryAdjustment",
  "Inventory",
  "Production",
  "ProductionOrder",
  "ProductionOrderItem",
  "UnitConversion",
  "ProductPriceHistory",
  "Product",
  "Material",
  "Supplier",
  "Branch"
RESTART IDENTITY CASCADE;
