-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY - Product Catalog Seed
-- Source: PRICELIST_SEED.md (from Inv_Sheet_As_of_May_23_2025.xlsx)
--
-- Owns: Product, Recipe, RecipeItem.
-- Run AFTER seed-materials.sql (recipe generator resolves materials by name)
-- and BEFORE seed-local.sql (which repopulates inventory/production).
--
-- Dedup: first occurrence wins; skipped duplicates are omitted below.
-- Bote deposits renamed with a " (bote)" suffix to avoid beverage collisions.
-- Equipment excluded entirely. Page-1 placeholders seeded active.
-- sortOrder = id (staff reorder later via Config -> Product Order).
-- ---------------------------------------------------------------------------

BEGIN;

TRUNCATE TABLE "RecipeItem", "Recipe", "Product" RESTART IDENTITY CASCADE;

INSERT INTO "Product" (id, name, type, "sortOrder", price, "isActive", date, "createdAt") VALUES
  (1,  'Buns Big',        'BREAD', 1,  35.00, true, NOW(), NOW()),
  (2,  'Buns Small',      'BREAD', 2,  25.00, true, NOW(), NOW()),
  (3,  'Buns Hotdog',     'BREAD', 3,  35.00, true, NOW(), NOW()),
  (4,  'Cinnamon Round',  'BREAD', 4,  39.00, true, NOW(), NOW()),
  (5,  'Ensaymada Big',   'BREAD', 5,  27.00, true, NOW(), NOW()),
  (6,  'Ensaymada Small', 'BREAD', 6,   8.00, true, NOW(), NOW()),
  (7,  'Pandecoco',       'BREAD', 7,  10.00, true, NOW(), NOW()),
  (8,  'Pandesal',        'BREAD', 8,   2.50, true, NOW(), NOW()),
  (9,  'Pineapple Pie',   'BREAD', 9,   8.00, true, NOW(), NOW()),
  (10, 'Putok Square',    'BREAD', 10,  7.00, true, NOW(), NOW()),
  (11, 'Raisin Bread',    'BREAD', 11, 67.00, true, NOW(), NOW()),
  (12, 'Silang Small',    'BREAD', 12, 12.00, true, NOW(), NOW()),
  (13, 'Spanish Bread',   'BREAD', 13,  7.00, true, NOW(), NOW()),
  (14, 'Sweet Monay',     'BREAD', 14, 39.00, true, NOW(), NOW()),
  (15, 'Tasty Jumbo',     'BREAD', 15, 69.00, true, NOW(), NOW()),
  (16, 'Tasty Medium',    'BREAD', 16, 59.00, true, NOW(), NOW()),
  (17, 'Tasty Small',     'BREAD', 17, 37.00, true, NOW(), NOW()),
  (18, 'Toasted Small',   'BREAD', 18, 28.00, true, NOW(), NOW()),
  (19, 'Toasted Med',     'BREAD', 19, 30.00, true, NOW(), NOW()),
  (20, 'Toasted Large',   'BREAD', 20, 32.00, true, NOW(), NOW()),
  (21, 'Others',          'BREAD', 21, 20.00, true, NOW(), NOW()),
  (22, 'Bread 1',         'BREAD', 22, 15.00, true, NOW(), NOW()),
  (23, 'Bread 2',         'BREAD', 23, 13.00, true, NOW(), NOW()),
  (24, 'Bread 3',         'BREAD', 24, 18.00, true, NOW(), NOW()),
  (25, 'Bread 4',         'BREAD', 25, 25.00, true, NOW(), NOW()),
  (26, 'Jumbo',           'BREAD', 26, 69.00, true, NOW(), NOW()),
  (27, 'Med',             'BREAD', 27, 59.00, true, NOW(), NOW()),
  (28, 'Small',           'BREAD', 28, 37.00, true, NOW(), NOW()),
  (29, 'Halfmoon',        'BREAD', 29,  7.00, true, NOW(), NOW()),
  (30, 'Ensaymada Pack',  'BREAD', 30, 35.00, true, NOW(), NOW()),
  (31, 'Silang Pack',     'BREAD', 31, 45.00, true, NOW(), NOW()),
  (32, 'Putok Pack',      'BREAD', 32, 30.00, true, NOW(), NOW()),
  (33, 'Pandecoco Pack',  'BREAD', 33, 45.00, true, NOW(), NOW()),
  (34, 'Pandesal Pack',   'BREAD', 34, 40.00, true, NOW(), NOW()),
  (35, 'B-day Cake Rd',        'CAKE', 35, 470.00, true, NOW(), NOW()),
  (36, 'B-day Cake Sq',        'CAKE', 36, 500.00, true, NOW(), NOW()),
  (37, 'Banana Loaf',          'CAKE', 37,  95.00, true, NOW(), NOW()),
  (38, 'Banana Cake Slice',    'CAKE', 38,  25.00, true, NOW(), NOW()),
  (39, 'Beehive',              'CAKE', 39,  25.00, true, NOW(), NOW()),
  (40, 'Brownies',             'CAKE', 40,  25.00, true, NOW(), NOW()),
  (41, 'Butter Cake',          'CAKE', 41,  20.00, true, NOW(), NOW()),
  (42, 'Butter Cake Rnd',      'CAKE', 42, 510.00, true, NOW(), NOW()),
  (43, 'Butter Cake Sq',       'CAKE', 43, 530.00, true, NOW(), NOW()),
  (44, 'Cheese Cake',          'CAKE', 44,  10.00, true, NOW(), NOW()),
  (45, 'Choco Cupcake',        'CAKE', 45,  12.00, true, NOW(), NOW()),
  (46, 'Choco Cake Rd',        'CAKE', 46, 520.00, true, NOW(), NOW()),
  (47, 'Choco Cake Sq',        'CAKE', 47, 550.00, true, NOW(), NOW()),
  (48, 'Choco Rolls',          'CAKE', 48, 350.00, true, NOW(), NOW()),
  (49, 'Choco Rolls 1/2',      'CAKE', 49, 240.00, true, NOW(), NOW()),
  (50, 'Crinkles',             'CAKE', 50,  12.00, true, NOW(), NOW()),
  (51, 'Custard Medium',       'CAKE', 51,  25.00, true, NOW(), NOW()),
  (52, 'Cheese Bar',           'CAKE', 52,  15.00, true, NOW(), NOW()),
  (53, 'Egg pie',              'CAKE', 53,  35.00, true, NOW(), NOW()),
  (54, 'Hopia',                'CAKE', 54,   8.00, true, NOW(), NOW()),
  (55, 'Jelly Roll',           'CAKE', 55,  15.00, true, NOW(), NOW()),
  (56, 'Kababayan',            'CAKE', 56,   7.00, true, NOW(), NOW()),
  (57, 'Kababayan (pack)',     'CAKE', 57,  35.00, true, NOW(), NOW()),
  (58, 'Macaroons',            'CAKE', 58,   5.00, true, NOW(), NOW()),
  (59, 'Mini Roll',            'CAKE', 59,  33.00, true, NOW(), NOW()),
  (60, 'Mocha Cake Rd',        'CAKE', 60, 500.00, true, NOW(), NOW()),
  (61, 'Mocha Cake Sq',        'CAKE', 61, 520.00, true, NOW(), NOW()),
  (62, 'Mocha Rolls',          'CAKE', 62, 330.00, true, NOW(), NOW()),
  (63, 'Mocha Rolls 1/2',      'CAKE', 63, 200.00, true, NOW(), NOW()),
  (64, 'Orange Cake',          'CAKE', 64,  60.00, true, NOW(), NOW()),
  (65, 'Plaka cookies',        'CAKE', 65,   6.00, true, NOW(), NOW()),
  (66, 'Sliced Cake Rd',       'CAKE', 66,  26.00, true, NOW(), NOW()),
  (67, 'Special Mamon',        'CAKE', 67,  25.00, true, NOW(), NOW()),
  (68, 'Ube Bar',              'CAKE', 68,   5.00, true, NOW(), NOW()),
  (69, 'Ube Rolls',            'CAKE', 69, 330.00, true, NOW(), NOW()),
  (70, 'Ube Rolls 1/2',        'CAKE', 70, 200.00, true, NOW(), NOW()),
  (71, 'Yema Rolls',           'CAKE', 71, 340.00, true, NOW(), NOW()),
  (72, 'Yema Rolls 1/2',       'CAKE', 72, 210.00, true, NOW(), NOW()),
  (73, 'Yema Toast',           'CAKE', 73,  12.00, true, NOW(), NOW()),
  (74, 'Sliced Cake (others)', 'CAKE', 74, 470.00, true, NOW(), NOW()),
  (75, 'Marble Choco',         'CAKE', 75, 330.00, true, NOW(), NOW()),
  (76, 'Bday small',           'CAKE', 76, 390.00, true, NOW(), NOW()),
  (77, 'Choco small',          'CAKE', 77, 390.00, true, NOW(), NOW()),
  (78, 'Yema Round',           'CAKE', 78, 500.00, true, NOW(), NOW()),
  (79, 'Yema Square',          'CAKE', 79, 530.00, true, NOW(), NOW()),
  (80, 'Butter small',         'CAKE', 80, 530.00, true, NOW(), NOW()),
  (81, 'Yema Roll Slice',      'CAKE', 81,  30.00, true, NOW(), NOW()),
  (82, 'Mocha Small',          'CAKE', 82, 390.00, true, NOW(), NOW()),
  (83, 'Ube Square',           'CAKE', 83, 530.00, true, NOW(), NOW()),
  (84, 'Ube Small',            'CAKE', 84, 390.00, true, NOW(), NOW()),
  (85, 'Ube Round',            'CAKE', 85, 490.00, true, NOW(), NOW()),
  (86, 'Brazo De Mercedes',    'CAKE', 86, 380.00, true, NOW(), NOW()),
  (87, 'Inipit',               'CAKE', 87,  12.00, true, NOW(), NOW()),
  (88, 'Banana Cupcake',       'CAKE', 88,  15.00, true, NOW(), NOW()),
  (89, 'Pianono',              'CAKE', 89,  12.00, true, NOW(), NOW()),
  (90,  'American Bread',      'SPECIAL', 90,   6.00, true, NOW(), NOW()),
  (91,  'Binangkal',           'SPECIAL', 91,   7.00, true, NOW(), NOW()),
  (92,  'Butchi / Buko Slice', 'SPECIAL', 92,  10.00, true, NOW(), NOW()),
  (93,  'Cheese Bread',        'SPECIAL', 93,   7.00, true, NOW(), NOW()),
  (94,  'Cheese Doughnut',     'SPECIAL', 94,  15.00, true, NOW(), NOW()),
  (95,  'Cheese Roll',         'SPECIAL', 95,  12.00, true, NOW(), NOW()),
  (96,  'Cinnamon loaf',       'SPECIAL', 96,  70.00, true, NOW(), NOW()),
  (97,  'Cookies Choco',       'SPECIAL', 97,   6.00, true, NOW(), NOW()),
  (98,  'Ham & Chiz Orig',     'SPECIAL', 98,  12.00, true, NOW(), NOW()),
  (99,  'Monggo Loaf',         'SPECIAL', 99,  58.00, true, NOW(), NOW()),
  (100, 'Toasted Siopao',      'SPECIAL', 100, 15.00, true, NOW(), NOW()),
  (101, 'Pudding',             'SPECIAL', 101,  7.00, true, NOW(), NOW()),
  (102, 'Sampaloc',            'SPECIAL', 102,  6.00, true, NOW(), NOW()),
  (103, 'Spl Ensaymada B',     'SPECIAL', 103, 65.00, true, NOW(), NOW()),
  (104, 'Bibingka',            'SPECIAL', 104, 25.00, true, NOW(), NOW()),
  (105, 'Ube Loaf',            'SPECIAL', 105, 58.00, true, NOW(), NOW()),
  (106, 'Kalihim',             'SPECIAL', 106,  8.00, true, NOW(), NOW()),
  (107, 'Snowball',            'SPECIAL', 107, 10.00, true, NOW(), NOW()),
  (108, 'Hawaiian Pizza',      'SPECIAL', 108, 65.00, true, NOW(), NOW()),
  (109, 'Rolyo',               'SPECIAL', 109, 10.00, true, NOW(), NOW()),
  (110, 'Ube Special Semada',  'SPECIAL', 110, 25.00, true, NOW(), NOW()),
  (111, 'Ham Pork Floss',      'SPECIAL', 111, 20.00, true, NOW(), NOW()),
  (112, 'Pandesiosa',          'SPECIAL', 112, 58.00, true, NOW(), NOW()),
  (113, 'Ham and Cheese Spl',  'SPECIAL', 113, 25.00, true, NOW(), NOW()),
  (114, 'Bavarian',            'SPECIAL', 114, 20.00, true, NOW(), NOW()),
  (115, 'Dinner Roll',         'SPECIAL', 115, 65.00, true, NOW(), NOW()),
  (116, 'Torta',               'SPECIAL', 116, 15.00, true, NOW(), NOW()),
  (117, 'Choco buns',          'SPECIAL', 117, 15.00, true, NOW(), NOW()),
  (118, 'Mexico b',            'SPECIAL', 118, 15.00, true, NOW(), NOW()),
  (119, 'Bonette',             'SPECIAL', 119, 30.00, true, NOW(), NOW()),
  (120, 'Custard creme',       'SPECIAL', 120, 15.00, true, NOW(), NOW()),
  (121, 'Monggo roll',         'SPECIAL', 121, 15.00, true, NOW(), NOW()),
  (122, 'Ube roll',            'SPECIAL', 122, 15.00, true, NOW(), NOW()),
  (123, 'Mushroom',            'SPECIAL', 123, 30.00, true, NOW(), NOW()),
  (124, 'Lambingan',           'SPECIAL', 124,  7.00, true, NOW(), NOW()),
  (125, 'Butter Cookies',      'SPECIAL', 125, 30.00, true, NOW(), NOW()),
  (126, 'Otap',                'SPECIAL', 126, 30.00, true, NOW(), NOW()),
  (127, 'Merengue',            'SPECIAL', 127,  7.00, true, NOW(), NOW()),
  (128, 'Litro (bote)',    'MISCELLANEOUS', 128, 10.00, true, NOW(), NOW()),
  (129, 'Kasalo (bote)',   'MISCELLANEOUS', 129, 10.00, true, NOW(), NOW()),
  (130, '8oz (bote)',      'MISCELLANEOUS', 130,  5.00, true, NOW(), NOW()),
  (131, 'Cobra (bote)',    'MISCELLANEOUS', 131,  5.00, true, NOW(), NOW()),
  (132, 'Vitamilk (bote)', 'MISCELLANEOUS', 132,  5.00, true, NOW(), NOW()),
  (133, 'Vitamilk',        'MISCELLANEOUS', 133, 23.00, true, NOW(), NOW()),
  (134, 'Solo',            'MISCELLANEOUS', 134, 18.00, true, NOW(), NOW()),
  (135, 'Nestea',          'MISCELLANEOUS', 135, 25.00, true, NOW(), NOW()),
  (136, 'C2 350ml',        'MISCELLANEOUS', 136, 30.00, true, NOW(), NOW()),
  (137, 'Dari Crème',      'MISCELLANEOUS', 137, 45.00, true, NOW(), NOW()),
  (138, 'Tetra',           'MISCELLANEOUS', 138, 25.00, true, NOW(), NOW()),
  (139, 'P Juice',         'MISCELLANEOUS', 139, 32.00, true, NOW(), NOW()),
  (140, 'Chuckie',         'MISCELLANEOUS', 140, 37.00, true, NOW(), NOW()),
  (141, 'Powerade',        'MISCELLANEOUS', 141, 18.00, true, NOW(), NOW()),
  (142, 'Boost',           'MISCELLANEOUS', 142, 30.00, true, NOW(), NOW()),
  (143, 'Mineral Big',     'MISCELLANEOUS', 143, 15.00, true, NOW(), NOW()),
  (144, 'Mineral Sm',      'MISCELLANEOUS', 144, 12.00, true, NOW(), NOW()),
  (145, 'Cobra',           'MISCELLANEOUS', 145, 18.00, true, NOW(), NOW()),
  (146, 'Kasalo',          'MISCELLANEOUS', 146, 32.00, true, NOW(), NOW()),
  (147, 'Litro',           'MISCELLANEOUS', 147, 42.00, true, NOW(), NOW()),
  (148, '1.5',             'MISCELLANEOUS', 148, 75.00, true, NOW(), NOW()),
  (149, 'Gatorade',        'MISCELLANEOUS', 149, 35.00, true, NOW(), NOW()),
  (150, 'Pulpy',           'MISCELLANEOUS', 150, 17.00, true, NOW(), NOW()),
  (151, 'Pepsi / Mdew',    'MISCELLANEOUS', 151, 20.00, true, NOW(), NOW()),
  (152, 'Peanut Butter',   'MISCELLANEOUS', 152, 75.00, true, NOW(), NOW()),
  (153, 'Zest O',          'MISCELLANEOUS', 153, 12.00, true, NOW(), NOW()),
  (154, 'Fuze',            'MISCELLANEOUS', 154, 15.00, true, NOW(), NOW()),
  (155, 'Wilkins Big',     'MISCELLANEOUS', 155, 15.00, true, NOW(), NOW()),
  (156, 'Wilkins Sm',      'MISCELLANEOUS', 156, 12.00, true, NOW(), NOW()),
  (157, 'Boost Sm',        'MISCELLANEOUS', 157, 15.00, true, NOW(), NOW()),
  (158, 'Chuckie Sm',      'MISCELLANEOUS', 158, 23.00, true, NOW(), NOW()),
  (159, 'Yakult',          'MISCELLANEOUS', 159, 13.00, true, NOW(), NOW()),
  (160, 'Sakto/Swakto',    'MISCELLANEOUS', 160, 16.00, true, NOW(), NOW()),
  (161, 'Mismo',           'MISCELLANEOUS', 161, 20.00, true, NOW(), NOW()),
  (162, '8oz Softdrinks',  'MISCELLANEOUS', 162, 15.00, true, NOW(), NOW()),
  (163, 'Drum',            'MISCELLANEOUS', 163, 250.00, true, NOW(), NOW()),
  (164, 'Real Leaf',       'MISCELLANEOUS', 164, 28.00, true, NOW(), NOW()),
  (165, 'Predator',        'MISCELLANEOUS', 165, 20.00, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"Product"', 'id'), COALESCE(MAX(id), 1)) FROM "Product";

-- ---------------------------------------------------------------------------
-- ROUGH RECIPE GENERATOR (placeholder data — business audits quantities later)
-- Base recipe by type + keyword add-ons matched on product name.
-- Ingredients resolved by name; a missing material is silently skipped so the
-- generator never fails on an absent ingredient.
-- ---------------------------------------------------------------------------

-- Helper: insert a recipe item by material NAME, no-op if the material is absent.
CREATE OR REPLACE FUNCTION pg_temp.add_ri(p_recipe INT, p_mat TEXT, p_qty FLOAT, p_unit TEXT)
RETURNS void AS $f$
  INSERT INTO "RecipeItem" ("recipeId", "materialId", quantity, unit, "createdAt", "updatedAt")
  SELECT p_recipe, m.id, p_qty, p_unit::"MeasurementUnit", NOW(), NOW()
  FROM "Material" m
  WHERE m.name = p_mat AND m."deletedAt" IS NULL
  ON CONFLICT ("recipeId", "materialId") DO NOTHING;
$f$ LANGUAGE sql;

DO $$
DECLARE
  p    RECORD;
  rid  INT;
  yld  FLOAT;
BEGIN
  FOR p IN
    SELECT id, name, type, price
    FROM "Product"
    WHERE type IN ('BREAD', 'CAKE', 'SPECIAL') AND "deletedAt" IS NULL
    ORDER BY id
  LOOP
    yld := CASE p.type
             WHEN 'BREAD'   THEN 50.0
             WHEN 'SPECIAL' THEN 30.0
             ELSE (CASE WHEN p.price > 300 THEN 1.0 ELSE 20.0 END)  -- CAKE
           END;

    INSERT INTO "Recipe" ("productId", "recipeYield", notes, "createdAt", "updatedAt")
    VALUES (p.id, yld, 'Auto-generated rough recipe — verify quantities before use', NOW(), NOW())
    RETURNING id INTO rid;

    -- Base recipe by type
    IF p.type = 'BREAD' THEN
      PERFORM pg_temp.add_ri(rid, 'All-Purpose Flour', 2.0,  'KG');
      PERFORM pg_temp.add_ri(rid, 'Sugar',             0.4,  'KG');
      PERFORM pg_temp.add_ri(rid, 'Yeast',             40.0, 'G');
      PERFORM pg_temp.add_ri(rid, 'Salt',              20.0, 'G');
      PERFORM pg_temp.add_ri(rid, 'Margarine',         0.3,  'KG');
    ELSIF p.type = 'SPECIAL' THEN
      PERFORM pg_temp.add_ri(rid, 'All-Purpose Flour', 1.5,  'KG');
      PERFORM pg_temp.add_ri(rid, 'Sugar',             0.35, 'KG');
      PERFORM pg_temp.add_ri(rid, 'Yeast',             30.0, 'G');
      PERFORM pg_temp.add_ri(rid, 'Eggs',              0.5,  'DOZEN');
      PERFORM pg_temp.add_ri(rid, 'Butter',            0.3,  'KG');
    ELSE  -- CAKE
      PERFORM pg_temp.add_ri(rid, 'Cake Flour',        1.2,  'KG');
      PERFORM pg_temp.add_ri(rid, 'Sugar',             0.6,  'KG');
      PERFORM pg_temp.add_ri(rid, 'Eggs',              1.0,  'DOZEN');
      PERFORM pg_temp.add_ri(rid, 'Butter',            0.4,  'KG');
      PERFORM pg_temp.add_ri(rid, 'Baking Powder',     30.0, 'G');
      PERFORM pg_temp.add_ri(rid, 'Fresh Milk',        300.0,'ML');
    END IF;

    -- Keyword add-ons (ON CONFLICT in add_ri dedups if two rules add the same material)
    IF p.name ILIKE '%ube%' THEN
      PERFORM pg_temp.add_ri(rid, 'Ube Halaya', 0.3, 'KG');
      PERFORM pg_temp.add_ri(rid, 'Ube Flavor', 20.0, 'ML');
    END IF;
    IF p.name ILIKE '%choco%' OR p.name ILIKE '%brownie%' OR p.name ILIKE '%crinkle%' OR p.name ILIKE '%marble%' THEN
      PERFORM pg_temp.add_ri(rid, 'Cocoa Powder', 150.0, 'G');
    END IF;
    IF p.name ILIKE '%cheese%' OR p.name ILIKE '%chiz%' THEN
      PERFORM pg_temp.add_ri(rid, 'Cheese', 0.25, 'KG');
    END IF;
    IF p.name ILIKE '%mocha%' THEN
      PERFORM pg_temp.add_ri(rid, 'Coffee Paste', 40.0, 'G');
    END IF;
    IF p.name ILIKE '%yema%' OR p.name ILIKE '%custard%' OR p.name ILIKE '%leche%' OR p.name ILIKE '%egg pie%' THEN
      PERFORM pg_temp.add_ri(rid, 'Condensed Milk', 200.0, 'ML');
    END IF;
    IF p.name ILIKE '%coco%' OR p.name ILIKE '%macaroon%' THEN
      PERFORM pg_temp.add_ri(rid, 'Desiccated Coconut', 0.2, 'KG');
    END IF;
    IF p.name ILIKE '%monggo%' OR p.name ILIKE '%mongo%' THEN
      PERFORM pg_temp.add_ri(rid, 'Mung Bean Filling', 0.3, 'KG');
    END IF;
    IF p.name ILIKE '%ham%' THEN
      PERFORM pg_temp.add_ri(rid, 'Ham', 0.2, 'KG');
    END IF;
    IF p.name ILIKE '%raisin%' THEN
      PERFORM pg_temp.add_ri(rid, 'Raisins', 0.2, 'KG');
    END IF;
    IF p.name ILIKE '%banana%' THEN
      PERFORM pg_temp.add_ri(rid, 'Banana', 0.3, 'KG');
    END IF;
    IF p.name ILIKE '%pineapple%' THEN
      PERFORM pg_temp.add_ri(rid, 'Pineapple Filling', 0.25, 'KG');
    END IF;
    IF p.name ILIKE '%cinnamon%' THEN
      PERFORM pg_temp.add_ri(rid, 'Cinnamon Powder', 30.0, 'G');
    END IF;
  END LOOP;
END $$;

-- Soft-deleted test recipe on a MISCELLANEOUS product (generator skips MISC, so
-- no productId collision). Verifies GET /recipes and cost calc exclude it.
INSERT INTO "Recipe" ("productId", "recipeYield", notes, "createdAt", "updatedAt", "deletedAt")
VALUES (143, 1.0, 'Deleted test recipe – should not appear in any query', NOW(), NOW(), NOW());

SELECT setval(pg_get_serial_sequence('"Recipe"', 'id'), COALESCE(MAX(id), 1)) FROM "Recipe";

COMMIT;
