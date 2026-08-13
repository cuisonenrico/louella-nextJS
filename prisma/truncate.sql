-- ─────────────────────────────────────────────────────────────────────────────
-- LOUELLA BAKERY — Truncate Script
-- Clears ALL seed data (truncating "Branch" cascades through User.branchId,
-- so User/RefreshToken/DeviceToken are wiped too — login accounts are
-- recreated by seed-users.sql).
--
-- Seed order is documented in prisma/SEED_ORDER.md. Short version, for a
-- production-shaped database that will receive an XLSX history import:
--   truncate -> branches -> users -> features -> materials
--            -> products-apr2026 -> product-price-history -> product-aliases
-- Then import the workbooks; do NOT run seed-local.sql, whose synthetic
-- inventory/production rows would collide with the imported history.
-- ─────────────────────────────────────────────────────────────────────────────

-- Children first, so no FK blocks the truncate.
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
  "ProductAlias",
  "Product",
  "Material",
  "Supplier",
  "ImportLog",
  "JobRun",
  "Branch"
RESTART IDENTITY CASCADE;
