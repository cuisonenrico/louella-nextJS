-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY - Local Development Seed (Core Modules)
-- Rolling 6-day window: CURRENT_DATE - 5 through CURRENT_DATE
--
-- Coverage:
--   Auth/users/tokens, notifications (device tokens), file/jobs,
--   branches/products/product price history,
--   production orders/items, production, inventory, inventory adjustments.
--   Inventory covers the FULL product catalog (all active products × all
--   branches × all 6 days) via a deterministic generator; see the
--   FULL-CATALOG INVENTORY GENERATOR section. Production also covers the
--   full catalog: a generator mirrors every non-MISCELLANEOUS inventory
--   delivery as a same-day Production row (yield = delivery), so the
--   recipes → production → delivery chain is coherent end to end.
--
-- NOTE: User, RefreshToken, and DeviceToken tables are NOT truncated.
--       Existing user records are preserved; inserts use ON CONFLICT DO NOTHING.
--
-- MIGRATION PREREQUISITES:
--   Apply these two migrations before running this seed:
--     prisma/migrations/20260610120000_money-float-to-decimal/migration.sql
--     prisma/migrations/20260610130000_add-soft-delete-inventory-recipe/migration.sql
--   Or run:  npx prisma migrate deploy
--
-- SCHEMA NOTES (post-migration):
--   - Product.price is DECIMAL(10,2)  — seed values are compatible as-is
--   - ProductPriceHistory.price is DECIMAL(10,2) — same
--   - Inventory.deletedAt is nullable; omitted rows default to NULL (active)
--   - One soft-deleted Inventory row is included to verify filter logic
-- ---------------------------------------------------------------------------

BEGIN;

TRUNCATE TABLE
  "InventoryAdjustment",
  "Inventory",
  "Production",
  "ProductionOrderItem",
  "ProductionOrder",
  "ProductPriceHistory",
  "Job",
  "File"
RESTART IDENTITY CASCADE;

-- Branch is DELETEd, not TRUNCATEd: TRUNCATE "Branch" CASCADE would cascade
-- through "User" (User.branchId → Branch) and wipe User, RefreshToken,
-- DeviceToken, MaterialInventory and MaterialAdjustment — destroying the data
-- seed-materials.sql just created. DELETE respects each FK's ON DELETE action
-- instead (User.branchId → SET NULL; managers are re-scoped below).
DELETE FROM "ImportLog";  -- references Branch with ON DELETE RESTRICT
DELETE FROM "Branch";

-- Idempotency: seeded refresh tokens have no unique key, so clear previous
-- seed rows to avoid duplicates on re-run.
DELETE FROM "RefreshToken" WHERE "tokenHash" LIKE 'seed-refresh-token-hash-%';

-- ---------------------------------------------------------------------------
-- USERS / AUTH / NOTIFICATIONS (preserved – not truncated above)
--
-- KNOWN CREDENTIALS — see prisma/SEED_CREDENTIALS.md for the full table.
-- ON CONFLICT (email) DO UPDATE is authoritative: re-running this seed RESETS
-- each account's passwordHash/role and re-enables it (isActive=true), so the
-- documented passwords always work after a (re)deploy. bcrypt cost 10,
-- verified against the plaintext passwords.
-- ---------------------------------------------------------------------------
INSERT INTO "User" (id, email, "passwordHash", role, "isActive", "createdAt", "updatedAt") VALUES
  (1, 'admin@louella.com',
   '$2b$10$Q4oO3Q9W5RjxmeA35W10huYtXd/VQw9hRdCrW3agV9cjZg9zypxHW',  -- Admin@123
   'ADMIN', true, NOW(), NOW()),
  (2, 'manager.marikina@louella.com',
   '$2b$10$l2Kv1x.cYE/gswR8mauGEe7DqS3TQpR13ztLk8HJiQ4gXS.S20T.C',  -- Manager@123
   'MANAGER', true, NOW(), NOW()),
  (3, 'manager.cubao@louella.com',
   '$2b$10$HPCtJItzM8.uXHPesEkXl.Q4LfF39BNk5FoyZ/UGQ0pQQiSScLXUO',  -- Manager@123
   'MANAGER', true, NOW(), NOW()),
  (4, 'inventory@louella.com',
   '$2b$10$0ugWTuQZ4NDsy9PciLc3G.4ooYPheWDSH46jem05dVWVke/RF2dUG',  -- Inventory@123
   'INVENTORY', true, NOW(), NOW()),
  (5, 'viewer@louella.com',
   '$2b$10$FC3QJ5xx0Rndr0BSMbbJ9OAJKCgR7iCOSz3LLHZeN4P.JF3gPv6Ge',  -- Viewer@123
   'VIEWER', true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  role           = EXCLUDED.role,
  "isActive"     = true,
  "updatedAt"    = NOW();

SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE(MAX(id), 1)) FROM "User";

INSERT INTO "RefreshToken" ("userId", "tokenHash", "expiresAt", revoked, "createdAt") VALUES
  (1, 'seed-refresh-token-hash-admin', NOW() + INTERVAL '14 days', false, NOW()),
  (2, 'seed-refresh-token-hash-mgr-1', NOW() + INTERVAL '14 days', false, NOW()),
  (3, 'seed-refresh-token-hash-mgr-2', NOW() + INTERVAL '14 days', false, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO "DeviceToken" ("userId", token, platform, "createdAt", "updatedAt") VALUES
  (1, 'seed-device-token-admin-web', 'web', NOW(), NOW()),
  (2, 'seed-device-token-marikina-web', 'web', NOW(), NOW()),
  (3, 'seed-device-token-cubao-android', 'android', NOW(), NOW())
ON CONFLICT (token) DO NOTHING;

INSERT INTO "File" (id, "userId", "s3Key", filename, status, "createdAt") VALUES
  (1, 1, 'inventory/seed-daily-inventory.xlsx', 'daily-inventory.xlsx', 'UPLOADED', NOW()),
  (2, 4, 'inventory/seed-materials.csv', 'materials.csv', 'PROCESSING', NOW()),
  (3, 2, 'inventory/seed-branch-audit.csv', 'branch-audit.csv', 'PENDING', NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"File"', 'id'), COALESCE(MAX(id), 1)) FROM "File";

INSERT INTO "Job" (id, "fileId", status, progress, "resultLocation", "createdAt") VALUES
  (1, 1, 'COMPLETED', 100, 's3://louella/results/daily-inventory.json', NOW()),
  (2, 2, 'RUNNING', 65, NULL, NOW()),
  (3, 3, 'PENDING', 0, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"Job"', 'id'), COALESCE(MAX(id), 1)) FROM "Job";

-- ---------------------------------------------------------------------------
-- BRANCHES / PRODUCTS / PRICE HISTORY
-- ---------------------------------------------------------------------------
INSERT INTO "Branch" (id, name, address, phone, "isActive", "createdAt", "updatedAt") VALUES
  (1, 'Marikina Branch', '123 Shoe Ave, Marikina City', '028712345', true, NOW(), NOW()),
  (2, 'Cubao Branch', '45 Araneta Center, Quezon City', '028719876', true, NOW(), NOW()),
  (3, 'Antipolo Branch', '88 Sumulong Hwy, Antipolo', '028765432', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"Branch"', 'id'), COALESCE(MAX(id), 1)) FROM "Branch";

-- Scope MANAGER accounts to their branch so BranchGuard restricts them to
-- their own branch's data. (User.branchId is unique → one manager per branch.)
UPDATE "User" SET "branchId" = (SELECT id FROM "Branch" WHERE name = 'Marikina Branch')
  WHERE email = 'manager.marikina@louella.com';
UPDATE "User" SET "branchId" = (SELECT id FROM "Branch" WHERE name = 'Cubao Branch')
  WHERE email = 'manager.cubao@louella.com';

-- Products are owned by seed-products.sql (run before this file). Handwritten
-- production and price-history rows below reference catalog product ids 1-7;
-- inventory covers the FULL catalog (handwritten rows for ids 1-7 that mirror
-- production, plus a generator that fills every remaining product × branch ×
-- day combo). A second generator then backfills Production for every
-- non-MISCELLANEOUS inventory delivery.

DO $$
DECLARE
  d1 DATE := CURRENT_DATE - 5;  -- May 19
  d2 DATE := CURRENT_DATE - 4;  -- May 20
  d3 DATE := CURRENT_DATE - 3;  -- May 21
  d4 DATE := CURRENT_DATE - 2;  -- May 22
  d5 DATE := CURRENT_DATE - 1;  -- May 23
  d6 DATE := CURRENT_DATE;      -- May 24 (today)
BEGIN

  -- -------------------------------------------------------------------------
  -- PRODUCT PRICE HISTORY
  -- -------------------------------------------------------------------------
  INSERT INTO "ProductPriceHistory" ("productId", price, "effectiveAt", "createdAt") VALUES
    (1, 3.75, d1::timestamp, NOW()),
    (1, 4.00, d4::timestamp, NOW()),
    (2, 5.75, d1::timestamp, NOW()),
    (2, 6.00, d4::timestamp, NOW()),
    (3, 11.00, d1::timestamp, NOW()),
    (3, 12.00, d4::timestamp, NOW()),
    (5, 24.00, d1::timestamp, NOW()),
    (5, 25.00, d4::timestamp, NOW()),
    (6, 42.00, d1::timestamp, NOW()),
    (6, 45.00, d4::timestamp, NOW()),
    (7,  9.00, d1::timestamp, NOW()),
    (7, 10.00, d4::timestamp, NOW());

  -- -------------------------------------------------------------------------
  -- PRODUCTION ORDERS / ORDER ITEMS
  -- -------------------------------------------------------------------------
  INSERT INTO "ProductionOrder"
    (id, "branchId", date, status, notes, "createdById", "createdAt", "updatedAt")
  VALUES
    -- d1
    (1,  1,    d1, 'FINALIZED', 'Morning run',               2, d1::timestamp + INTERVAL '04:30', d1::timestamp + INTERVAL '05:00'),
    (2,  2,    d1, 'FINALIZED', 'Morning run',               3, d1::timestamp + INTERVAL '04:30', d1::timestamp + INTERVAL '05:00'),
    -- d2
    (3,  1,    d2, 'FINALIZED', 'Weekend prep',              2, d2::timestamp + INTERVAL '04:30', d2::timestamp + INTERVAL '05:00'),
    (4,  2,    d2, 'FINALIZED', 'Weekend prep',              3, d2::timestamp + INTERVAL '04:40', d2::timestamp + INTERVAL '05:10'),
    -- d3
    (5,  1,    d3, 'FINALIZED', 'Peak planning',             2, d3::timestamp + INTERVAL '04:15', d3::timestamp + INTERVAL '04:45'),
    (6,  2,    d3, 'DRAFT',     'Potential noon top-up',     3, d3::timestamp + INTERVAL '08:30', d3::timestamp + INTERVAL '08:30'),
    (7,  2,    d3, 'FINALIZED', 'Noon top-up approved',      3, d3::timestamp + INTERVAL '10:00', d3::timestamp + INTERVAL '10:20'),
    (8,  NULL, d3, 'DRAFT',     'HQ scenario planning',      1, d3::timestamp + INTERVAL '11:00', d3::timestamp + INTERVAL '11:00'),
    -- d4
    (9,  1,    d4, 'FINALIZED', 'Pre-opening peak batch',    2, d4::timestamp + INTERVAL '04:00', d4::timestamp + INTERVAL '04:35'),
    (10, 2,    d4, 'FINALIZED', 'Pre-opening peak batch',    3, d4::timestamp + INTERVAL '04:00', d4::timestamp + INTERVAL '04:35'),
    (11, 1,    d4, 'CANCELLED', 'Cancelled due to overlap',  2, d4::timestamp + INTERVAL '09:00', d4::timestamp + INTERVAL '09:10'),
    -- d5
    (12, 1,    d5, 'FINALIZED', 'Regular morning batch',     2, d5::timestamp + INTERVAL '04:15', d5::timestamp + INTERVAL '04:50'),
    (13, 2,    d5, 'FINALIZED', 'Regular morning batch',     3, d5::timestamp + INTERVAL '04:15', d5::timestamp + INTERVAL '04:50'),
    (14, 3,    d5, 'FINALIZED', 'Branch 3 morning batch',    1, d5::timestamp + INTERVAL '04:30', d5::timestamp + INTERVAL '05:05'),
    -- d6 (today)
    (15, 1,    d6, 'FINALIZED', 'Today morning batch',       2, d6::timestamp + INTERVAL '04:00', d6::timestamp + INTERVAL '04:40'),
    (16, 2,    d6, 'FINALIZED', 'Today morning batch',       3, d6::timestamp + INTERVAL '04:00', d6::timestamp + INTERVAL '04:40'),
    (17, 1,    d6, 'DRAFT',     'Potential afternoon top-up',2, d6::timestamp + INTERVAL '09:30', d6::timestamp + INTERVAL '09:30')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO "ProductionOrderItem" (id, "productionOrderId", "productId", yield) VALUES
    -- Order 1 (d1, Branch 1)
    (1,  1,  1, 180), (2,  1,  2, 110), (3,  1,  3,  40), (4,  1,  7,  30),
    -- Order 2 (d1, Branch 2)
    (5,  2,  1, 140), (6,  2,  2,  90), (7,  2,  3,  30), (8,  2,  7,  20),
    -- Order 3 (d2, Branch 1)
    (9,  3,  1, 220), (10, 3,  2, 140), (11, 3,  3,  40), (12, 3,  5,  20),
    -- Order 4 (d2, Branch 2)
    (13, 4,  1, 170), (14, 4,  2, 110), (15, 4,  3,  30), (16, 4,  5,  15),
    -- Order 5 (d3, Branch 1, FINALIZED)
    (17, 5,  1, 240), (18, 5,  2, 150), (19, 5,  3,  50), (20, 5,  6,  20),
    -- Order 6 (d3, Branch 2, DRAFT)
    (21, 6,  4,  40), (22, 6,  6,  30),
    -- Order 7 (d3, Branch 2, FINALIZED)
    (23, 7,  1, 130), (24, 7,  2,  80), (25, 7,  3,  20),
    -- Order 8 (d3, NULL branch, DRAFT)
    (26, 8,  4,  60), (27, 8,  6,  50),
    -- Order 9 (d4, Branch 1)
    (28, 9,  1, 260), (29, 9,  2, 170), (30, 9,  3,  55), (31, 9,  5,  24), (32, 9,  6, 18),
    -- Order 10 (d4, Branch 2)
    (33, 10, 1, 200), (34, 10, 2, 130), (35, 10, 3,  40), (36, 10, 5,  16), (37, 10, 6, 12),
    -- Order 11 (d4, Branch 1, CANCELLED)
    (38, 11, 1,  90),
    -- Order 12 (d5, Branch 1)
    (39, 12, 1, 270), (40, 12, 2, 175), (41, 12, 3,  55), (42, 12, 5,  26), (43, 12, 6, 22), (44, 12, 7, 35),
    -- Order 13 (d5, Branch 2)
    (45, 13, 1, 210), (46, 13, 2, 135), (47, 13, 3,  45), (48, 13, 5,  18), (49, 13, 6, 16),
    -- Order 14 (d5, Branch 3)
    (50, 14, 1, 150), (51, 14, 2,  95), (52, 14, 3,  30),
    -- Order 15 (d6, Branch 1)
    (53, 15, 1, 280), (54, 15, 2, 185), (55, 15, 3,  58), (56, 15, 5,  28), (57, 15, 6, 24),
    -- Order 16 (d6, Branch 2)
    (58, 16, 1, 220), (59, 16, 2, 140), (60, 16, 3,  48), (61, 16, 5,  20), (62, 16, 6, 18),
    -- Order 17 (d6, Branch 1, DRAFT)
    (63, 17, 4,  45), (64, 17, 7,  40)
  ON CONFLICT (id) DO NOTHING;

  PERFORM setval(pg_get_serial_sequence('"ProductionOrder"', 'id'), COALESCE(MAX(id), 1)) FROM "ProductionOrder";
  PERFORM setval(pg_get_serial_sequence('"ProductionOrderItem"', 'id'), COALESCE(MAX(id), 1)) FROM "ProductionOrderItem";

  -- -------------------------------------------------------------------------
  -- PRODUCTION (FINALIZED ORDERS ONLY)
  -- -------------------------------------------------------------------------
  INSERT INTO "Production"
    ("branchId", "productId", "createdById", yield, date, notes, "isAutoGenerated", "createdAt", "updatedAt")
  VALUES
    -- d1 (orders 1, 2)
    (1, 1, 2, 180, d1, 'Daily production',       false, NOW(), NOW()),
    (1, 2, 2, 110, d1, 'Daily production',       false, NOW(), NOW()),
    (1, 3, 2,  40, d1, NULL,                     false, NOW(), NOW()),
    (1, 7, 2,  30, d1, NULL,                     false, NOW(), NOW()),
    (2, 1, 3, 140, d1, 'Daily production',       false, NOW(), NOW()),
    (2, 2, 3,  90, d1, 'Daily production',       false, NOW(), NOW()),
    (2, 3, 3,  30, d1, NULL,                     false, NOW(), NOW()),
    (2, 7, 3,  20, d1, NULL,                     false, NOW(), NOW()),
    -- d2 (orders 3, 4)
    (1, 1, 2, 220, d2, 'Weekend prep',           false, NOW(), NOW()),
    (1, 2, 2, 140, d2, 'Weekend prep',           false, NOW(), NOW()),
    (1, 3, 2,  40, d2, NULL,                     false, NOW(), NOW()),
    (1, 5, 2,  20, d2, NULL,                     false, NOW(), NOW()),
    (2, 1, 3, 170, d2, 'Weekend prep',           false, NOW(), NOW()),
    (2, 2, 3, 110, d2, 'Weekend prep',           false, NOW(), NOW()),
    (2, 3, 3,  30, d2, NULL,                     false, NOW(), NOW()),
    (2, 5, 3,  15, d2, NULL,                     false, NOW(), NOW()),
    -- d3 (orders 5, 7)
    (1, 1, 2, 240, d3, 'Peak planning',          false, NOW(), NOW()),
    (1, 2, 2, 150, d3, 'Peak planning',          false, NOW(), NOW()),
    (1, 3, 2,  50, d3, NULL,                     false, NOW(), NOW()),
    (1, 6, 2,  20, d3, 'Specials',               false, NOW(), NOW()),
    (2, 1, 3, 130, d3, 'Noon top-up approved',   false, NOW(), NOW()),
    (2, 2, 3,  80, d3, 'Noon top-up approved',   false, NOW(), NOW()),
    (2, 3, 3,  20, d3, NULL,                     false, NOW(), NOW()),
    -- d4 (orders 9, 10)
    (1, 1, 2, 260, d4, 'Pre-opening peak batch', false, NOW(), NOW()),
    (1, 2, 2, 170, d4, 'Pre-opening peak batch', false, NOW(), NOW()),
    (1, 3, 2,  55, d4, NULL,                     false, NOW(), NOW()),
    (1, 5, 2,  24, d4, NULL,                     false, NOW(), NOW()),
    (1, 6, 2,  18, d4, 'Specials',               false, NOW(), NOW()),
    (2, 1, 3, 200, d4, 'Pre-opening peak batch', false, NOW(), NOW()),
    (2, 2, 3, 130, d4, 'Pre-opening peak batch', false, NOW(), NOW()),
    (2, 3, 3,  40, d4, NULL,                     false, NOW(), NOW()),
    (2, 5, 3,  16, d4, NULL,                     false, NOW(), NOW()),
    (2, 6, 3,  12, d4, 'Specials',               false, NOW(), NOW()),
    -- d5 (orders 12, 13, 14)
    (1, 1, 2, 270, d5, 'Regular morning batch',  false, NOW(), NOW()),
    (1, 2, 2, 175, d5, 'Regular morning batch',  false, NOW(), NOW()),
    (1, 3, 2,  55, d5, NULL,                     false, NOW(), NOW()),
    (1, 5, 2,  26, d5, NULL,                     false, NOW(), NOW()),
    (1, 6, 2,  22, d5, 'Specials',               false, NOW(), NOW()),
    (1, 7, 2,  35, d5, NULL,                     false, NOW(), NOW()),
    (2, 1, 3, 210, d5, 'Regular morning batch',  false, NOW(), NOW()),
    (2, 2, 3, 135, d5, 'Regular morning batch',  false, NOW(), NOW()),
    (2, 3, 3,  45, d5, NULL,                     false, NOW(), NOW()),
    (2, 5, 3,  18, d5, NULL,                     false, NOW(), NOW()),
    (2, 6, 3,  16, d5, 'Specials',               false, NOW(), NOW()),
    (3, 1, 1, 150, d5, 'Branch 3 morning batch', false, NOW(), NOW()),
    (3, 2, 1,  95, d5, 'Branch 3 morning batch', false, NOW(), NOW()),
    (3, 3, 1,  30, d5, NULL,                     false, NOW(), NOW()),
    -- d6 (orders 15, 16)
    (1, 1, 2, 280, d6, 'Today morning batch',    false, NOW(), NOW()),
    (1, 2, 2, 185, d6, 'Today morning batch',    false, NOW(), NOW()),
    (1, 3, 2,  58, d6, NULL,                     false, NOW(), NOW()),
    (1, 5, 2,  28, d6, NULL,                     false, NOW(), NOW()),
    (1, 6, 2,  24, d6, 'Specials',               false, NOW(), NOW()),
    (2, 1, 3, 220, d6, 'Today morning batch',    false, NOW(), NOW()),
    (2, 2, 3, 140, d6, 'Today morning batch',    false, NOW(), NOW()),
    (2, 3, 3,  48, d6, NULL,                     false, NOW(), NOW()),
    (2, 5, 3,  20, d6, NULL,                     false, NOW(), NOW()),
    (2, 6, 3,  18, d6, 'Specials',               false, NOW(), NOW())
  ON CONFLICT ("branchId", "productId", date) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- INVENTORY
  -- Handwritten rows first (delivery mirrors production for product ids 1-7);
  -- a full-catalog generator below fills every remaining combination.
  -- -------------------------------------------------------------------------
  INSERT INTO "Inventory"
    ("branchId", "productId", "createdById", quantity, delivery, leftover, reject, date, notes, "isAutoGenerated", "createdAt", "updatedAt")
  VALUES
    -- d1
    (1, 1, 2,  20, 180,  25, 5, d1, NULL,                             false, NOW(), NOW()),
    (1, 2, 2,  14, 110,  16, 3, d1, NULL,                             false, NOW(), NOW()),
    (1, 3, 2,   6,  40,   8, 1, d1, NULL,                             false, NOW(), NOW()),
    (1, 7, 2,   3,  30,   6, 1, d1, NULL,                             false, NOW(), NOW()),
    (2, 1, 3,  16, 140,  20, 4, d1, NULL,                             false, NOW(), NOW()),
    (2, 2, 3,  10,  90,  12, 2, d1, NULL,                             false, NOW(), NOW()),
    (2, 3, 3,   5,  30,   6, 1, d1, NULL,                             false, NOW(), NOW()),
    (2, 7, 3,   2,  20,   4, 1, d1, NULL,                             false, NOW(), NOW()),
    -- d2
    (1, 1, 2,  20, 220,  22, 4, d2, NULL,                             false, NOW(), NOW()),
    (1, 2, 2,  13, 140,  15, 3, d2, NULL,                             false, NOW(), NOW()),
    (1, 3, 2,   7,  40,   6, 1, d2, NULL,                             false, NOW(), NOW()),
    (1, 5, 2,   2,  20,   3, 0, d2, NULL,                             false, NOW(), NOW()),
    (2, 1, 3,  16, 170,  18, 3, d2, NULL,                             false, NOW(), NOW()),
    (2, 2, 3,  10, 110,  11, 2, d2, NULL,                             false, NOW(), NOW()),
    (2, 3, 3,   5,  30,   5, 1, d2, NULL,                             false, NOW(), NOW()),
    (2, 5, 3,   1,  15,   2, 0, d2, NULL,                             false, NOW(), NOW()),
    -- d3
    (1, 1, 2,  18, 240,  24, 4, d3, NULL,                             false, NOW(), NOW()),
    (1, 2, 2,  12, 150,  14, 2, d3, NULL,                             false, NOW(), NOW()),
    (1, 3, 2,   5,  50,   7, 1, d3, NULL,                             false, NOW(), NOW()),
    (1, 5, 2,   3,   0,   2, 0, d3, 'No delivery, sell-through only', false, NOW(), NOW()),
    (1, 6, 2,   1,  20,   2, 0, d3, NULL,                             false, NOW(), NOW()),
    (2, 1, 3,  15, 130,  14, 2, d3, NULL,                             false, NOW(), NOW()),
    (2, 2, 3,   9,  80,   8, 1, d3, NULL,                             false, NOW(), NOW()),
    (2, 3, 3,   4,  20,   3, 0, d3, NULL,                             false, NOW(), NOW()),
    -- d4
    (1, 1, 2,  20, 260,  18, 3, d4, NULL,                             false, NOW(), NOW()),
    (1, 2, 2,  12, 170,  11, 2, d4, NULL,                             false, NOW(), NOW()),
    (1, 3, 2,   6,  55,   4, 1, d4, NULL,                             false, NOW(), NOW()),
    (1, 5, 2,   2,  24,   3, 0, d4, NULL,                             false, NOW(), NOW()),
    (1, 6, 2,   2,  18,   2, 0, d4, NULL,                             false, NOW(), NOW()),
    (2, 1, 3,  12, 200,  15, 2, d4, NULL,                             false, NOW(), NOW()),
    (2, 2, 3,   7, 130,   9, 1, d4, NULL,                             false, NOW(), NOW()),
    (2, 3, 3,   3,  40,   3, 0, d4, NULL,                             false, NOW(), NOW()),
    (2, 5, 3,   2,  16,   2, 0, d4, NULL,                             false, NOW(), NOW()),
    (2, 6, 3,   1,  12,   1, 0, d4, NULL,                             false, NOW(), NOW()),
    -- d5
    (1, 1, 2,  22, 270,  20, 4, d5, NULL,                             false, NOW(), NOW()),
    (1, 2, 2,  14, 175,  13, 2, d5, NULL,                             false, NOW(), NOW()),
    (1, 3, 2,   7,  55,   5, 1, d5, NULL,                             false, NOW(), NOW()),
    (1, 5, 2,   2,  26,   3, 0, d5, NULL,                             false, NOW(), NOW()),
    (1, 6, 2,   2,  22,   2, 0, d5, NULL,                             false, NOW(), NOW()),
    (1, 7, 2,   3,  35,   5, 1, d5, NULL,                             false, NOW(), NOW()),
    (2, 1, 3,  14, 210,  16, 3, d5, NULL,                             false, NOW(), NOW()),
    (2, 2, 3,   8, 135,  10, 2, d5, NULL,                             false, NOW(), NOW()),
    (2, 3, 3,   4,  45,   4, 0, d5, NULL,                             false, NOW(), NOW()),
    (2, 5, 3,   2,  18,   2, 0, d5, NULL,                             false, NOW(), NOW()),
    (2, 6, 3,   1,  16,   1, 0, d5, NULL,                             false, NOW(), NOW()),
    (3, 1, 1,   8, 150,  12, 2, d5, NULL,                             false, NOW(), NOW()),
    (3, 2, 1,   5,  95,   8, 1, d5, NULL,                             false, NOW(), NOW()),
    (3, 3, 1,   2,  30,   3, 0, d5, NULL,                             false, NOW(), NOW()),
    -- d6 (today)
    (1, 1, 2,  24, 280,  22, 3, d6, NULL,                             false, NOW(), NOW()),
    (1, 2, 2,  15, 185,  14, 2, d6, NULL,                             false, NOW(), NOW()),
    (1, 3, 2,   8,  58,   6, 1, d6, NULL,                             false, NOW(), NOW()),
    (1, 5, 2,   2,  28,   4, 0, d6, NULL,                             false, NOW(), NOW()),
    (1, 6, 2,   2,  24,   3, 0, d6, NULL,                             false, NOW(), NOW()),
    (2, 1, 3,  16, 220,  18, 2, d6, NULL,                             false, NOW(), NOW()),
    (2, 2, 3,   9, 140,  11, 1, d6, NULL,                             false, NOW(), NOW()),
    (2, 3, 3,   4,  48,   4, 0, d6, NULL,                             false, NOW(), NOW()),
    (2, 5, 3,   2,  20,   3, 0, d6, NULL,                             false, NOW(), NOW()),
    (2, 6, 3,   1,  18,   2, 0, d6, NULL,                             false, NOW(), NOW())
  ON CONFLICT ("branchId", "productId", date) DO NOTHING;

  -- FULL-CATALOG INVENTORY GENERATOR
  -- Every active product × every branch × all 6 days. Handwritten rows above
  -- win via ON CONFLICT DO NOTHING. Values are deterministic (hash of product,
  -- branch, day offset) and scaled by price tier: whole cakes (>=300) move in
  -- single digits, loaves/rolls (>=50) in the teens, small breads/beverages in
  -- volume. Ranges guarantee leftover + reject < quantity + delivery, so
  -- sold = quantity + delivery + adjSum - leftover - reject stays positive.
  -- NOTE: the FULL-CATALOG PRODUCTION GENERATOR below mirrors these deliveries
  -- (yield = delivery) for every non-MISCELLANEOUS product.
  INSERT INTO "Inventory"
    ("branchId", "productId", "createdById", quantity, delivery, leftover, reject, date, notes, "isAutoGenerated", "createdAt", "updatedAt")
  SELECT
    b.id,
    p.id,
    CASE b.id WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 1 END,
    v.qty,
    v.dlv,
    v.lft,
    v.rej,
    d.day,
    NULL,
    false, NOW(), NOW()
  FROM "Branch" b
  CROSS JOIN "Product" p
  CROSS JOIN (VALUES (d1, 0), (d2, 1), (d3, 2), (d4, 3), (d5, 4), (d6, 5)) AS d(day, doff)
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN p.price >= 300 THEN  2 + (p.id     + b.id      + d.doff     ) % 3   -- 2-4
        WHEN p.price >= 50  THEN  8 + (p.id * 3 + b.id * 5  + d.doff * 7 ) % 10  -- 8-17
        ELSE                     40 + (p.id * 7 + b.id * 11 + d.doff * 13) % 60  -- 40-99
      END AS dlv,
      CASE
        WHEN p.price >= 300 THEN      (p.id     + d.doff              ) % 2      -- 0-1
        WHEN p.price >= 50  THEN  1 + (p.id     + b.id     + d.doff   ) % 3      -- 1-3
        ELSE                      4 + (p.id * 5 + b.id * 3 + d.doff   ) % 9      -- 4-12
      END AS qty,
      CASE
        WHEN p.price >= 300 THEN      (p.id     + b.id + d.doff       ) % 2      -- 0-1
        WHEN p.price >= 50  THEN  1 + (p.id * 2 + d.doff              ) % 3      -- 1-3
        ELSE                      3 + (p.id * 3 + b.id + d.doff * 5   ) % 8      -- 3-10
      END AS lft,
      CASE
        WHEN p.price >= 300 THEN 0
        WHEN p.price >= 50  THEN      (p.id + b.id     + d.doff       ) % 2      -- 0-1
        ELSE                          (p.id + b.id * 2 + d.doff * 3   ) % 3      -- 0-2
      END AS rej
  ) v
  WHERE p."isActive" = true
    AND p."deletedAt" IS NULL
  ON CONFLICT ("branchId", "productId", date) DO NOTHING;

  -- Soft-deleted Inventory row — verifies that GET /inventory and revenue
  -- calculations exclude rows with deletedAt IS NOT NULL.
  -- (The generator above already created this row active; the conflict update
  -- soft-deletes it and stamps the explanatory note.)
  INSERT INTO "Inventory"
    ("branchId", "productId", "createdById", quantity, delivery, leftover, reject, date, notes, "isAutoGenerated", "createdAt", "updatedAt", "deletedAt")
  VALUES
    (3, 4, 1, 5, 30, 3, 0, d3, 'Deleted test row – should not appear in any query', false, NOW(), NOW(), NOW())
  ON CONFLICT ("branchId", "productId", date) DO UPDATE
    SET "deletedAt" = NOW(), notes = EXCLUDED.notes;

  -- -------------------------------------------------------------------------
  -- FULL-CATALOG PRODUCTION GENERATOR
  -- Every delivered quantity originates from a same-day production run:
  -- yield = Inventory.delivery for that (branch, product, day). Handwritten
  -- Production rows above win via ON CONFLICT (they already mirror their
  -- handwritten Inventory counterparts). MISCELLANEOUS products (beverages,
  -- bote deposits) are excluded — they are purchased, not baked, so their
  -- deliveries legitimately have no Production rows. Zero-delivery days are
  -- skipped (no production ran for that product that day).
  -- -------------------------------------------------------------------------
  INSERT INTO "Production"
    ("branchId", "productId", "createdById", yield, date, notes, "isAutoGenerated", "createdAt", "updatedAt")
  SELECT
    i."branchId",
    i."productId",
    CASE i."branchId" WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 1 END,
    i.delivery,
    i.date,
    NULL,
    false, NOW(), NOW()
  FROM "Inventory" i
  JOIN "Product" p ON p.id = i."productId"
  WHERE p.type <> 'MISCELLANEOUS'
    AND i."deletedAt" IS NULL
    AND i.delivery > 0
  ON CONFLICT ("branchId", "productId", date) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- INVENTORY ADJUSTMENTS
  -- -------------------------------------------------------------------------
  INSERT INTO "InventoryAdjustment" ("inventoryId", type, value, notes, "createdAt", "updatedAt")
  VALUES
    -- d3: inter-branch transfer Branch 1 → Branch 2 (Buns Big)
    (
      (SELECT id FROM "Inventory" WHERE "branchId" = 1 AND "productId" = 1 AND date = d3),
      'PULL_OUT', 12, 'Transfer to Cubao (seed)', NOW(), NOW()
    ),
    (
      (SELECT id FROM "Inventory" WHERE "branchId" = 2 AND "productId" = 1 AND date = d3),
      'PULL_IN',  12, 'Transfer from Marikina (seed)', NOW(), NOW()
    ),
    -- d4: spoilage anomaly (Buns Hotdog, Branch 1)
    (
      (SELECT id FROM "Inventory" WHERE "branchId" = 1 AND "productId" = 3 AND date = d4),
      'ANOMALY',   2, 'Unexpected spoilage', NOW(), NOW()
    ),
    -- d5: inter-branch transfer Branch 2 → Branch 3 (Buns Small)
    (
      (SELECT id FROM "Inventory" WHERE "branchId" = 2 AND "productId" = 2 AND date = d5),
      'PULL_OUT', 10, 'Transfer to Antipolo (seed)', NOW(), NOW()
    ),
    (
      (SELECT id FROM "Inventory" WHERE "branchId" = 3 AND "productId" = 2 AND date = d5),
      'PULL_IN',  10, 'Transfer from Cubao (seed)', NOW(), NOW()
    ),
    -- d6: count discrepancy (Buns Hotdog, Branch 1)
    (
      (SELECT id FROM "Inventory" WHERE "branchId" = 1 AND "productId" = 3 AND date = d6),
      'ANOMALY',   3, 'Buns Hotdog count discrepancy – recount required', NOW(), NOW()
    );

  -- Link transfer pairs
  UPDATE "InventoryAdjustment" out_adj
  SET "linkedAdjustmentId" = in_adj.id
  FROM "InventoryAdjustment" in_adj
  WHERE out_adj.notes = 'Transfer to Cubao (seed)'
    AND in_adj.notes  = 'Transfer from Marikina (seed)';

  UPDATE "InventoryAdjustment" in_adj
  SET "linkedAdjustmentId" = out_adj.id
  FROM "InventoryAdjustment" out_adj
  WHERE in_adj.notes  = 'Transfer from Marikina (seed)'
    AND out_adj.notes = 'Transfer to Cubao (seed)';

  UPDATE "InventoryAdjustment" out_adj
  SET "linkedAdjustmentId" = in_adj.id
  FROM "InventoryAdjustment" in_adj
  WHERE out_adj.notes = 'Transfer to Antipolo (seed)'
    AND in_adj.notes  = 'Transfer from Cubao (seed)';

  UPDATE "InventoryAdjustment" in_adj
  SET "linkedAdjustmentId" = out_adj.id
  FROM "InventoryAdjustment" out_adj
  WHERE in_adj.notes  = 'Transfer from Cubao (seed)'
    AND out_adj.notes = 'Transfer to Antipolo (seed)';

END $$;

COMMIT;
