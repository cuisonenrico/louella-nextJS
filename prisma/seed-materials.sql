-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY - Materials Seed (Materials Modules)
-- Rolling 6-day window: CURRENT_DATE - 5 through CURRENT_DATE
--
-- Coverage:
--   suppliers, materials, unit conversions,
--   material price history, material inventory, material adjustments.
--   ALL 31 materials get price history and a 6-day stock card (carry-forward),
--   so every ingredient the recipe generator references has live-looking data.
--   `used` values are representative, not recipe-derived — in live operation
--   the backend recomputes `used` from finalized production.
--   (Recipes/RecipeItems are owned by seed-products.sql — run it after this.)
--
-- MIGRATION PREREQUISITES:
--   Apply these two migrations before running this seed:
--     prisma/migrations/20260610120000_money-float-to-decimal/migration.sql
--     prisma/migrations/20260610130000_add-soft-delete-inventory-recipe/migration.sql
--   Or run:  npx prisma migrate deploy
--
-- SCHEMA NOTES (post-migration):
--   - Material.pricePerUnit is DECIMAL(10,4) — seed values are compatible as-is
--   - Material.reorderLevel is DECIMAL(10,4) — same
--   - MaterialPriceHistory.pricePerUnit is DECIMAL(10,4) — same
-- ---------------------------------------------------------------------------

BEGIN;

TRUNCATE TABLE
  "MaterialAdjustment",
  "MaterialInventory",
  "MaterialPriceHistory",
  "UnitConversion",
  "Material",
  "Supplier"
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- SUPPLIERS / MATERIALS / UNIT CONVERSIONS
-- ---------------------------------------------------------------------------
INSERT INTO "Supplier" (id, name, contact, phone, email, address, "isActive", "createdAt", "updatedAt") VALUES
  (1, 'Golden Harvest Co.', 'Maria Santos', '09171234567', 'orders@goldenharvest.ph', 'Blk 3 Lot 5 Industrial Ave, Caloocan', true, NOW(), NOW()),
  (2, 'FreshPak Dairy', 'Jose Reyes', '09281234567', 'sales@freshpak.ph', '22 Agham Rd, Quezon City', true, NOW(), NOW()),
  (3, 'Manila Sugar Corp.', 'Ana Cruz', '09391234567', 'msc@mnlsugar.ph', '100 Deca Homes, Laguna', true, NOW(), NOW()),
  (4, 'ProBake Supplies', 'Leo Tan', '09501234567', 'leo@probake.ph', '8 Baker St, Pasig City', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"Supplier"', 'id'), COALESCE(MAX(id), 1)) FROM "Supplier";

INSERT INTO "Material" (id, name, unit, "pricePerUnit", "reorderLevel", "createdAt", "updatedAt") VALUES
  (1, 'All-Purpose Flour', 'KG',    55.00, 20.0, NOW(), NOW()),
  (2, 'Sugar',             'KG',    70.00, 10.0, NOW(), NOW()),
  (3, 'Butter',            'KG',   320.00,  5.0, NOW(), NOW()),
  (4, 'Eggs',              'DOZEN', 95.00,  3.0, NOW(), NOW()),
  (5, 'Fresh Milk',        'LITER', 75.00,  4.0, NOW(), NOW()),
  (6, 'Yeast',             'G',      0.25, 100.0, NOW(), NOW()),
  (7, 'Salt',              'KG',    25.00,  2.0, NOW(), NOW()),
  (8, 'Ube Flavor',        'ML',     1.20, 50.0, NOW(), NOW()),
  (9, 'Cheese Powder',     'G',      0.65, 80.0, NOW(), NOW()),
  (10, 'Bread Flour',       'KG',     60.00,  20.0, NOW(), NOW()),
  (11, 'Cake Flour',        'KG',     65.00,  15.0, NOW(), NOW()),
  (12, 'Brown Sugar',       'KG',     75.00,   8.0, NOW(), NOW()),
  (13, 'Powdered Sugar',    'KG',     90.00,   5.0, NOW(), NOW()),
  (14, 'Margarine',         'KG',    180.00,   6.0, NOW(), NOW()),
  (15, 'Shortening',        'KG',    150.00,   6.0, NOW(), NOW()),
  (16, 'Evaporated Milk',   'ML',      0.1200, 2000.0, NOW(), NOW()),
  (17, 'Condensed Milk',    'ML',      0.1500, 2000.0, NOW(), NOW()),
  (18, 'Baking Powder',     'G',       0.5000,  200.0, NOW(), NOW()),
  (19, 'Cocoa Powder',      'G',       0.9000,  300.0, NOW(), NOW()),
  (20, 'Ube Halaya',        'KG',    220.00,   4.0, NOW(), NOW()),
  (21, 'Cheese',            'KG',    380.00,   3.0, NOW(), NOW()),
  (22, 'Coffee Paste',      'G',       1.5000,  100.0, NOW(), NOW()),
  (23, 'Desiccated Coconut','KG',    120.00,   5.0, NOW(), NOW()),
  (24, 'Mung Bean Filling', 'KG',    140.00,   4.0, NOW(), NOW()),
  (25, 'Ham',               'KG',    260.00,   3.0, NOW(), NOW()),
  (26, 'Raisins',           'KG',    190.00,   3.0, NOW(), NOW()),
  (27, 'Cinnamon Powder',   'G',       2.0000,  100.0, NOW(), NOW()),
  (28, 'Banana',            'KG',     60.00,   5.0, NOW(), NOW()),
  (29, 'Pineapple Filling', 'KG',    130.00,   4.0, NOW(), NOW()),
  (30, 'Bread Crumbs',      'KG',     90.00,   5.0, NOW(), NOW()),
  (31, 'Vanilla',           'ML',      3.0000,  200.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"Material"', 'id'), COALESCE(MAX(id), 1)) FROM "Material";

INSERT INTO "UnitConversion" ("fromUnit", "toUnit", factor, "createdAt", "updatedAt") VALUES
  ('KG', 'G', 1000.0, NOW(), NOW()),
  ('G', 'KG', 0.001, NOW(), NOW()),
  ('LITER', 'ML', 1000.0, NOW(), NOW()),
  ('ML', 'LITER', 0.001, NOW(), NOW()),
  ('DOZEN', 'PIECE', 12.0, NOW(), NOW()),
  ('PIECE', 'DOZEN', 0.0833333333, NOW(), NOW())
ON CONFLICT ("fromUnit", "toUnit") DO NOTHING;

-- ---------------------------------------------------------------------------
-- DATED MATERIAL DATA (6-DAY WINDOW)
-- Each day's opening = previous day's closing  (carry-forward).
-- Closing = opening + delivery - used  (mirrors the backend initDate logic).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  d1 DATE := CURRENT_DATE - 5;
  d2 DATE := CURRENT_DATE - 4;
  d3 DATE := CURRENT_DATE - 3;
  d4 DATE := CURRENT_DATE - 2;
  d5 DATE := CURRENT_DATE - 1;
  d6 DATE := CURRENT_DATE;

  -- Per-day delivery and used deltas (index 1 = d1 … 6 = d6)
  del_delta  FLOAT[] := ARRAY[ 0.0,  0.0,  0.0,  6.0,  6.0,  8.0];
  used_delta FLOAT[] := ARRAY[ 0.0,  1.0,  2.0,  3.0,  3.5,  4.0];
  day_notes  TEXT[]  := ARRAY[
    NULL::TEXT,
    'Steady demand',
    'Weekend prep consumption',
    'Peak day replenishment',
    'Regular weekday usage',
    'Current day active'
  ];

  dates      DATE[];  -- populated in BEGIN from d1..d6
  mat        RECORD;
  i          INT;
  curr_open  FLOAT;
  curr_del   FLOAT;
  curr_used  FLOAT;
  prev_close FLOAT;
BEGIN
  dates := ARRAY[d1, d2, d3, d4, d5, d6];

  -- Price history — two entries per material: an older d1 price and the
  -- current price effective d4 (matches Material.pricePerUnit).
  INSERT INTO "MaterialPriceHistory" ("materialId", "supplierId", "pricePerUnit", "effectiveAt", "createdAt") VALUES
    (1,  1,  53.00, d1::timestamp, NOW()), (1,  1,  55.00, d4::timestamp, NOW()),
    (2,  3,  68.00, d1::timestamp, NOW()), (2,  3,  70.00, d4::timestamp, NOW()),
    (3,  2, 310.00, d1::timestamp, NOW()), (3,  2, 320.00, d4::timestamp, NOW()),
    (4,  2,  90.00, d1::timestamp, NOW()), (4,  2,  95.00, d4::timestamp, NOW()),
    (5,  2,  72.00, d1::timestamp, NOW()), (5,  2,  75.00, d4::timestamp, NOW()),
    (6,  4,   0.23, d1::timestamp, NOW()), (6,  4,   0.25, d4::timestamp, NOW()),
    (7,  NULL, 24.00, d1::timestamp, NOW()), (7, NULL, 25.00, d4::timestamp, NOW()),
    (8,  4,   1.10, d1::timestamp, NOW()), (8,  4,   1.20, d4::timestamp, NOW()),
    (9,  4,   0.60, d1::timestamp, NOW()), (9,  4,   0.65, d4::timestamp, NOW()),
    (10, 1,  58.00, d1::timestamp, NOW()), (10, 1,  60.00, d4::timestamp, NOW()),
    (11, 1,  62.00, d1::timestamp, NOW()), (11, 1,  65.00, d4::timestamp, NOW()),
    (12, 3,  72.00, d1::timestamp, NOW()), (12, 3,  75.00, d4::timestamp, NOW()),
    (13, 3,  87.00, d1::timestamp, NOW()), (13, 3,  90.00, d4::timestamp, NOW()),
    (14, 2, 175.00, d1::timestamp, NOW()), (14, 2, 180.00, d4::timestamp, NOW()),
    (15, 2, 145.00, d1::timestamp, NOW()), (15, 2, 150.00, d4::timestamp, NOW()),
    (16, 2,   0.1150, d1::timestamp, NOW()), (16, 2,   0.1200, d4::timestamp, NOW()),
    (17, 2,   0.1450, d1::timestamp, NOW()), (17, 2,   0.1500, d4::timestamp, NOW()),
    (18, 4,   0.4800, d1::timestamp, NOW()), (18, 4,   0.5000, d4::timestamp, NOW()),
    (19, 4,   0.8500, d1::timestamp, NOW()), (19, 4,   0.9000, d4::timestamp, NOW()),
    (20, 4, 210.00, d1::timestamp, NOW()), (20, 4, 220.00, d4::timestamp, NOW()),
    (21, 2, 370.00, d1::timestamp, NOW()), (21, 2, 380.00, d4::timestamp, NOW()),
    (22, 4,   1.4000, d1::timestamp, NOW()), (22, 4,   1.5000, d4::timestamp, NOW()),
    (23, 1, 115.00, d1::timestamp, NOW()), (23, 1, 120.00, d4::timestamp, NOW()),
    (24, 1, 135.00, d1::timestamp, NOW()), (24, 1, 140.00, d4::timestamp, NOW()),
    (25, 2, 250.00, d1::timestamp, NOW()), (25, 2, 260.00, d4::timestamp, NOW()),
    (26, 1, 185.00, d1::timestamp, NOW()), (26, 1, 190.00, d4::timestamp, NOW()),
    (27, 4,   1.9000, d1::timestamp, NOW()), (27, 4,   2.0000, d4::timestamp, NOW()),
    (28, 1,  55.00, d1::timestamp, NOW()), (28, 1,  60.00, d4::timestamp, NOW()),
    (29, 1, 125.00, d1::timestamp, NOW()), (29, 1, 130.00, d4::timestamp, NOW()),
    (30, 1,  85.00, d1::timestamp, NOW()), (30, 1,  90.00, d4::timestamp, NOW()),
    (31, 4,   2.8000, d1::timestamp, NOW()), (31, 4,   3.0000, d4::timestamp, NOW());

  -- Inventory with carry-forward: iterate per material then per day so that
  -- day[i].opening = GREATEST(0, day[i-1].opening + day[i-1].delivery - day[i-1].used)
  FOR mat IN
    SELECT * FROM (VALUES
      (1, 1,       12.0::float, 25.0::float, 18.0::float),  -- All-Purpose Flour
      (2, 3,        8.0::float, 15.0::float, 12.0::float),  -- Sugar
      (3, 2,        4.0::float,  6.0::float,  4.5::float),  -- Butter
      (4, 2,        2.0::float,  4.0::float,  2.8::float),  -- Eggs
      (5, 2,        2.5::float,  5.0::float,  3.8::float),  -- Fresh Milk
      (6, 4,       20.0::float, 70.0::float, 60.0::float),  -- Yeast
      (7, NULL::int, 2.0::float,  3.0::float,  2.0::float), -- Salt
      (8, 4,       18.0::float, 45.0::float, 38.0::float),  -- Ube Flavor
      (9, 4,       50.0::float,120.0::float, 95.0::float),  -- Cheese Powder
      (10, 1,      15.0::float, 20.0::float, 16.0::float),  -- Bread Flour (KG)
      (11, 1,      10.0::float, 12.0::float,  9.0::float),  -- Cake Flour (KG)
      (12, 3,       6.0::float,  8.0::float,  6.0::float),  -- Brown Sugar (KG)
      (13, 3,       4.0::float,  5.0::float,  3.5::float),  -- Powdered Sugar (KG)
      (14, 2,       5.0::float,  8.0::float,  6.5::float),  -- Margarine (KG)
      (15, 2,       5.0::float,  6.0::float,  4.5::float),  -- Shortening (KG)
      (16, 2,    3000.0::float,4000.0::float,3200.0::float),-- Evaporated Milk (ML)
      (17, 2,    3000.0::float,4500.0::float,3800.0::float),-- Condensed Milk (ML)
      (18, 4,     500.0::float, 600.0::float, 480.0::float),-- Baking Powder (G)
      (19, 4,     800.0::float, 900.0::float, 750.0::float),-- Cocoa Powder (G)
      (20, 4,       5.0::float,  6.0::float,  4.8::float),  -- Ube Halaya (KG)
      (21, 2,       4.0::float,  5.0::float,  4.2::float),  -- Cheese (KG)
      (22, 4,     300.0::float, 250.0::float, 200.0::float),-- Coffee Paste (G)
      (23, 1,       6.0::float,  5.0::float,  4.0::float),  -- Desiccated Coconut (KG)
      (24, 1,       5.0::float,  6.0::float,  4.5::float),  -- Mung Bean Filling (KG)
      (25, 2,       3.0::float,  4.0::float,  3.2::float),  -- Ham (KG)
      (26, 1,       3.0::float,  3.0::float,  2.2::float),  -- Raisins (KG)
      (27, 4,     200.0::float, 250.0::float, 190.0::float),-- Cinnamon Powder (G)
      (28, 1,       6.0::float,  8.0::float,  6.5::float),  -- Banana (KG)
      (29, 1,       5.0::float,  5.0::float,  4.0::float),  -- Pineapple Filling (KG)
      (30, 1,       4.0::float,  4.0::float,  3.0::float),  -- Bread Crumbs (KG)
      (31, 4,     400.0::float, 300.0::float, 250.0::float) -- Vanilla (ML)
    ) AS t(mat_id, supplier_id, init_qty, base_del, base_used)
  LOOP
    prev_close := NULL;

    FOR i IN 1..6 LOOP
      -- Carry-forward: day 1 uses the seeded initial qty; all later days inherit previous closing
      curr_open  := CASE WHEN i = 1 THEN mat.init_qty ELSE GREATEST(0.0, prev_close) END;
      curr_del   := mat.base_del  + del_delta[i];
      curr_used  := mat.base_used + used_delta[i];
      prev_close := curr_open + curr_del - curr_used;

      INSERT INTO "MaterialInventory"
        ("materialId", "supplierId", date, "createdById", "batchNumber",
         quantity, delivery, used, notes, "createdAt", "updatedAt")
      VALUES (
        mat.mat_id,
        mat.supplier_id,
        dates[i],
        NULL::int,  -- createdById: no user attribution (seed-materials has no user dependency)
        CASE WHEN i = 1 THEN CONCAT('BATCH-', mat.mat_id, '-', TO_CHAR(dates[i], 'YYYYMMDD')) ELSE NULL END,
        curr_open,
        curr_del,
        curr_used,
        day_notes[i],
        NOW(),
        NOW()
      )
      ON CONFLICT ("materialId", date) DO NOTHING;
    END LOOP;
  END LOOP;

  -- Adjustments (unchanged)
  INSERT INTO "MaterialAdjustment" ("materialInventoryId", type, value, notes, "createdAt", "updatedAt")
  VALUES
    -- d3: flour transferred to commissary
    (
      (SELECT id FROM "MaterialInventory" WHERE "materialId" = 1 AND date = d3),
      'PULL_OUT', 2.5, 'Transferred flour to commissary prep', NOW(), NOW()
    ),
    -- d4: butter spoilage + urgent yeast restock
    (
      (SELECT id FROM "MaterialInventory" WHERE "materialId" = 3 AND date = d4),
      'ANOMALY', 0.6, 'Butter spoilage adjustment', NOW(), NOW()
    ),
    (
      (SELECT id FROM "MaterialInventory" WHERE "materialId" = 6 AND date = d4),
      'PULL_IN', 8.0, 'Urgent yeast restock', NOW(), NOW()
    ),
    -- d5: sugar bag torn + extra cheese powder delivery
    (
      (SELECT id FROM "MaterialInventory" WHERE "materialId" = 2 AND date = d5),
      'ANOMALY', 1.5, 'Sugar bag torn – quantity loss recorded', NOW(), NOW()
    ),
    (
      (SELECT id FROM "MaterialInventory" WHERE "materialId" = 9 AND date = d5),
      'PULL_IN', 50.0, 'Additional cheese powder delivery', NOW(), NOW()
    ),
    -- d6: flour allocated for special event + milk spillage
    (
      (SELECT id FROM "MaterialInventory" WHERE "materialId" = 1 AND date = d6),
      'PULL_OUT', 3.0, 'Flour allocated to special event prep', NOW(), NOW()
    ),
    (
      (SELECT id FROM "MaterialInventory" WHERE "materialId" = 5 AND date = d6),
      'ANOMALY', 0.5, 'Fresh milk spillage', NOW(), NOW()
    );
END $$;

COMMIT;
