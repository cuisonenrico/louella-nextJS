-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Product Catalog Seed
-- Source: Apr14-28-2026.xlsx, sheet "Day (1)" (identical product layout on
--         every day sheet; the "pricelist" tab carries the same names/prices
--         but without the PAGE / "Bote:" grouping this file preserves).
--
-- Owns: Product only. Run BEFORE any recipe seed and BEFORE seed-local.sql.
--
-- NAMING RULE — products are identified by (name, price), not by name alone.
--   * A label appearing twice at the SAME price is ONE product listed on two
--     pages (two delivery batches): Pandesal and Spanish Bread. Deduped here.
--   * A label appearing at DIFFERENT prices is TWO real SKUs and BOTH are
--     seeded under the SAME name. Price tells them apart. Product.name has no
--     unique constraint, so this is legal and intentional.
--
-- Names carrying more than one product in this file (6):
--   pandesal pack
--   bonette
--   litro
--   kasalo
--   cobra
--   vitamilk
--
-- Ordering: sheet order is preserved. id = sortOrder, so the app lists
-- products exactly as the printed sheet does. Page 1 -> BREAD, page 2 -> CAKE,
-- page 3 -> SPECIAL, the "Bote:" block and page 4 -> MISCELLANEOUS.
--
-- Equipment excluded (10 rows: Ref, Estante, Freezer, Cake Chiller (C2),
-- Wooden Estante/Cab, Ref-type Chiller, Plancha, Trays, Thongs, Board Stand).
-- These are counted on the sheet but are not sellable stock, and the importer
-- already skips them via IGNORED_LABELS in sheet-sections.ts.
--
-- PRICES ARE A SNAPSHOT of the Apr 14-28 2026 fortnight. Prices drift
-- constantly (6 products were repriced in the very next fortnight), so these
-- values are only correct for that period. Backfill ProductPriceHistory from
-- each workbook's pricelist tab before importing history, or every historical
-- row will be valued at these prices.
-- ---------------------------------------------------------------------------

BEGIN;

TRUNCATE TABLE "Product" RESTART IDENTITY CASCADE;

INSERT INTO "Product" (id, name, type, "sortOrder", price, "isActive", date, "createdAt") VALUES
  (  1, 'Buns Big',             'BREAD',             1,     36.00, true, NOW(), NOW()),
  (  2, 'Buns Small',           'BREAD',             2,     26.00, true, NOW(), NOW()),
  (  3, 'Buns Hotdog',          'BREAD',             3,     36.00, true, NOW(), NOW()),
  (  4, 'Cinnamon Round',       'BREAD',             4,     40.00, true, NOW(), NOW()),
  (  5, 'Ensaymada Big',        'BREAD',             5,     27.00, true, NOW(), NOW()),
  (  6, 'Ensaymada Small',      'BREAD',             6,      8.00, true, NOW(), NOW()),
  (  7, 'Pandecoco',            'BREAD',             7,     10.00, true, NOW(), NOW()),
  (  8, 'Pandesal',             'BREAD',             8,      3.00, true, NOW(), NOW()),  -- also listed at sheet row 76 (same price = same product)
  (  9, 'Pineapple Pie',        'BREAD',             9,      8.00, true, NOW(), NOW()),
  ( 10, 'Putok Square',         'BREAD',            10,      7.00, true, NOW(), NOW()),
  ( 11, 'Raisin Bread',         'BREAD',            11,     70.00, true, NOW(), NOW()),
  ( 12, 'Silang Small',         'BREAD',            12,     12.00, true, NOW(), NOW()),
  ( 13, 'Spanish Bread',        'BREAD',            13,      8.00, true, NOW(), NOW()),  -- also listed at sheet row 80 (same price = same product)
  ( 14, 'Sweet Monay',          'BREAD',            14,     42.00, true, NOW(), NOW()),
  ( 15, 'Tasty Jumbo',          'BREAD',            15,     72.00, true, NOW(), NOW()),
  ( 16, 'Tasty Medium',         'BREAD',            16,     62.00, true, NOW(), NOW()),
  ( 17, 'Tasty Small',          'BREAD',            17,     38.00, true, NOW(), NOW()),
  ( 18, 'Toasted Small',        'BREAD',            18,     30.00, true, NOW(), NOW()),
  ( 19, 'Toasted Med',          'BREAD',            19,     32.00, true, NOW(), NOW()),
  ( 20, 'Toasted Large',        'BREAD',            20,     35.00, true, NOW(), NOW()),
  ( 21, 'Others',               'BREAD',            21,     20.00, true, NOW(), NOW()),
  ( 22, 'Bread 1',              'BREAD',            22,     15.00, true, NOW(), NOW()),
  ( 23, 'Bread 2',              'BREAD',            23,     20.00, true, NOW(), NOW()),
  ( 24, 'Bread 3',              'BREAD',            24,     30.00, true, NOW(), NOW()),
  ( 25, 'Bread 4',              'BREAD',            25,     25.00, true, NOW(), NOW()),
  ( 26, 'Jumbo',                'BREAD',            26,     72.00, true, NOW(), NOW()),
  ( 27, 'Med',                  'BREAD',            27,     62.00, true, NOW(), NOW()),
  ( 28, 'Small',                'BREAD',            28,     38.00, true, NOW(), NOW()),
  ( 29, 'Halfmoon',             'BREAD',            29,      7.00, true, NOW(), NOW()),
  ( 30, 'Ensaymada Pack',       'BREAD',            30,     35.00, true, NOW(), NOW()),
  ( 31, 'Silang Pack',          'BREAD',            31,     45.00, true, NOW(), NOW()),
  ( 32, 'Putok Pack',           'BREAD',            32,     30.00, true, NOW(), NOW()),
  ( 33, 'Pandecoco Pack',       'BREAD',            33,     45.00, true, NOW(), NOW()),
  ( 34, 'Pandesal Pack',        'BREAD',            34,     40.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 37)
  ( 35, 'Pandesal Pack',        'BREAD',            35,   1000.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 38)
  ( 36, 'B-day Cake Rd',        'CAKE',             36,    500.00, true, NOW(), NOW()),
  ( 37, 'B-day Cake Sq',        'CAKE',             37,    530.00, true, NOW(), NOW()),
  ( 38, 'Banana Loaf',          'CAKE',             38,    105.00, true, NOW(), NOW()),
  ( 39, 'Banana Cake Slice',    'CAKE',             39,     28.00, true, NOW(), NOW()),
  ( 40, 'Beehive',              'CAKE',             40,     30.00, true, NOW(), NOW()),
  ( 41, 'Brownies',             'CAKE',             41,     28.00, true, NOW(), NOW()),
  ( 42, 'Butter Cake',          'CAKE',             42,     25.00, true, NOW(), NOW()),
  ( 43, 'Butter Cake Rnd',      'CAKE',             43,    530.00, true, NOW(), NOW()),
  ( 44, 'Butter Cake Sq',       'CAKE',             44,    550.00, true, NOW(), NOW()),
  ( 45, 'Cheese Cake',          'CAKE',             45,     12.00, true, NOW(), NOW()),
  ( 46, 'Choco Cupcake',        'CAKE',             46,     15.00, true, NOW(), NOW()),
  ( 47, 'Choco Cake Rd',        'CAKE',             47,    530.00, true, NOW(), NOW()),
  ( 48, 'Choco Cake Sq',        'CAKE',             48,    560.00, true, NOW(), NOW()),
  ( 49, 'Choco Rolls',          'CAKE',             49,    380.00, true, NOW(), NOW()),
  ( 50, 'Choco Rolls 1/2',      'CAKE',             50,    250.00, true, NOW(), NOW()),
  ( 51, 'Crinkles',             'CAKE',             51,     12.00, true, NOW(), NOW()),
  ( 52, 'Custard Medium',       'CAKE',             52,     32.00, true, NOW(), NOW()),
  ( 53, 'Cheese Bar',           'CAKE',             53,     15.00, true, NOW(), NOW()),
  ( 54, 'Egg pie',              'CAKE',             54,     37.00, true, NOW(), NOW()),
  ( 55, 'Hopia',                'CAKE',             55,      8.00, true, NOW(), NOW()),
  ( 56, 'Jelly Roll',           'CAKE',             56,     17.00, true, NOW(), NOW()),
  ( 57, 'Kababayan',            'CAKE',             57,      8.00, true, NOW(), NOW()),
  ( 58, 'Kababayan (pack)',     'CAKE',             58,     50.00, true, NOW(), NOW()),
  ( 59, 'Macaroons',            'CAKE',             59,      6.00, true, NOW(), NOW()),
  ( 60, 'Mini Roll',            'CAKE',             60,     35.00, true, NOW(), NOW()),
  ( 61, 'Mocha Cake Rd',        'CAKE',             61,    520.00, true, NOW(), NOW()),
  ( 62, 'Mocha Cake Sq',        'CAKE',             62,    540.00, true, NOW(), NOW()),
  ( 63, 'Mocha Rolls',          'CAKE',             63,    360.00, true, NOW(), NOW()),
  ( 64, 'Mocha Rolls 1/2',      'CAKE',             64,    215.00, true, NOW(), NOW()),
  ( 65, 'Orange Cake',          'CAKE',             65,     62.00, true, NOW(), NOW()),
  ( 66, 'Plaka cookies',        'CAKE',             66,     10.00, true, NOW(), NOW()),
  ( 67, 'Sliced Cake Rd',       'CAKE',             67,     30.00, true, NOW(), NOW()),
  ( 68, 'Special Mamon',        'CAKE',             68,     28.00, true, NOW(), NOW()),
  ( 69, 'Ube Bar',              'CAKE',             69,      7.00, true, NOW(), NOW()),
  ( 70, 'Ube Rolls',            'CAKE',             70,    360.00, true, NOW(), NOW()),
  ( 71, 'Ube Rolls 1/2',        'CAKE',             71,    215.00, true, NOW(), NOW()),
  ( 72, 'Yema Rolls',           'CAKE',             72,    360.00, true, NOW(), NOW()),
  ( 73, 'Yema Rolls 1/2',       'CAKE',             73,    215.00, true, NOW(), NOW()),
  ( 74, 'Yema Toast',           'CAKE',             74,     15.00, true, NOW(), NOW()),
  ( 75, 'Sliced Cake (others)', 'CAKE',             75,    480.00, true, NOW(), NOW()),
  ( 76, 'Marble Choco',         'CAKE',             76,    360.00, true, NOW(), NOW()),
  ( 77, 'Bday small',           'CAKE',             77,    405.00, true, NOW(), NOW()),
  ( 78, 'Choco small',          'CAKE',             78,    405.00, true, NOW(), NOW()),
  ( 79, 'Yema Round',           'CAKE',             79,    520.00, true, NOW(), NOW()),
  ( 80, 'Yema Square',          'CAKE',             80,    550.00, true, NOW(), NOW()),
  ( 81, 'Butter small',         'CAKE',             81,    540.00, true, NOW(), NOW()),
  ( 82, 'Yema Roll Slice',      'CAKE',             82,     35.00, true, NOW(), NOW()),
  ( 83, 'Mocha Small',          'CAKE',             83,    405.00, true, NOW(), NOW()),
  ( 84, 'Ube Square',           'CAKE',             84,    550.00, true, NOW(), NOW()),
  ( 85, 'Ube Small',            'CAKE',             85,    405.00, true, NOW(), NOW()),
  ( 86, 'Ube Round',            'CAKE',             86,    520.00, true, NOW(), NOW()),
  ( 87, 'Brazo De Mercedes',    'CAKE',             87,    420.00, true, NOW(), NOW()),
  ( 88, 'Inipit',               'CAKE',             88,     15.00, true, NOW(), NOW()),
  ( 89, 'Banana Cupcake',       'CAKE',             89,     17.00, true, NOW(), NOW()),
  ( 90, 'Pianono',              'CAKE',             90,     15.00, true, NOW(), NOW()),
  ( 91, 'American Bread',       'SPECIAL',          91,      7.00, true, NOW(), NOW()),
  ( 92, 'Binangkal',            'SPECIAL',          92,      8.00, true, NOW(), NOW()),
  ( 93, 'Butchi / Buko Slice',  'SPECIAL',          93,     12.00, true, NOW(), NOW()),
  ( 94, 'Cheese Bread',         'SPECIAL',          94,      8.00, true, NOW(), NOW()),
  ( 95, 'Cheese Doughnut',      'SPECIAL',          95,     17.00, true, NOW(), NOW()),
  ( 96, 'Cheese Roll',          'SPECIAL',          96,     13.00, true, NOW(), NOW()),
  ( 97, 'Cinnamon loaf',        'SPECIAL',          97,     75.00, true, NOW(), NOW()),
  ( 98, 'Cookies Choco',        'SPECIAL',          98,      7.00, true, NOW(), NOW()),
  ( 99, 'Ham & Chiz Orig',      'SPECIAL',          99,     16.00, true, NOW(), NOW()),
  (100, 'Monggo Loaf',          'SPECIAL',         100,     62.00, true, NOW(), NOW()),
  (101, 'Toasted Siopao',       'SPECIAL',         101,     20.00, true, NOW(), NOW()),
  (102, 'Pudding',              'SPECIAL',         102,     10.00, true, NOW(), NOW()),
  (103, 'Sampaloc',             'SPECIAL',         103,      7.00, true, NOW(), NOW()),
  (104, 'Spl Ensaymada B',      'SPECIAL',         104,     70.00, true, NOW(), NOW()),
  (105, 'Bibingka',             'SPECIAL',         105,     25.00, true, NOW(), NOW()),
  (106, 'Ube Loaf',             'SPECIAL',         106,     62.00, true, NOW(), NOW()),
  (107, 'Kalihim',              'SPECIAL',         107,     10.00, true, NOW(), NOW()),
  (108, 'Snowball',             'SPECIAL',         108,     12.00, true, NOW(), NOW()),
  (109, 'Hawaiian Pizza',       'SPECIAL',         109,     80.00, true, NOW(), NOW()),
  (110, 'Rolyo',                'SPECIAL',         110,     12.00, true, NOW(), NOW()),
  (111, 'Ube Special Semada',   'SPECIAL',         111,     28.00, true, NOW(), NOW()),
  (112, 'Ham Pork Floss',       'SPECIAL',         112,     25.00, true, NOW(), NOW()),
  (113, 'Pandesiosa',           'SPECIAL',         113,     62.00, true, NOW(), NOW()),
  (114, 'Ham and Cheese Spl',   'SPECIAL',         114,     28.00, true, NOW(), NOW()),
  (115, 'Bavarian',             'SPECIAL',         115,     25.00, true, NOW(), NOW()),
  (116, 'Dinner Roll',          'SPECIAL',         116,     70.00, true, NOW(), NOW()),
  (117, 'Torta',                'SPECIAL',         117,     15.00, true, NOW(), NOW()),
  (118, 'Choco buns',           'SPECIAL',         118,     17.00, true, NOW(), NOW()),
  (119, 'Mexico b',             'SPECIAL',         119,     18.00, true, NOW(), NOW()),
  (120, 'Bonette',              'SPECIAL',         120,     30.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 142)
  (121, 'Custard creme',        'SPECIAL',         121,     20.00, true, NOW(), NOW()),
  (122, 'Monggo roll',          'SPECIAL',         122,     18.00, true, NOW(), NOW()),
  (123, 'Ube roll',             'SPECIAL',         123,     18.00, true, NOW(), NOW()),
  (124, 'Bonette',              'SPECIAL',         124,      8.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 146)
  (125, 'Mushroom',             'SPECIAL',         125,     15.00, true, NOW(), NOW()),
  (126, 'Lambingan',            'SPECIAL',         126,     10.00, true, NOW(), NOW()),
  (127, 'Butter Cookies',       'SPECIAL',         127,     35.00, true, NOW(), NOW()),
  (128, 'Otap',                 'SPECIAL',         128,     12.00, true, NOW(), NOW()),
  (129, 'Merengue',             'SPECIAL',         129,     12.00, true, NOW(), NOW()),
  (130, 'Litro',                'MISCELLANEOUS',   130,     10.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 156, Bote: section)
  (131, 'Kasalo',               'MISCELLANEOUS',   131,     10.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 157, Bote: section)
  (132, '8oz',                  'MISCELLANEOUS',   132,      5.00, true, NOW(), NOW()),
  (133, 'Cobra',                'MISCELLANEOUS',   133,      5.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 159, Bote: section)
  (134, 'Vitamilk',             'MISCELLANEOUS',   134,      5.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 160, Bote: section)
  (135, 'Vitamilk',             'MISCELLANEOUS',   135,     25.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 170)
  (136, 'Solo',                 'MISCELLANEOUS',   136,     18.00, true, NOW(), NOW()),
  (137, 'Nestea',               'MISCELLANEOUS',   137,     25.00, true, NOW(), NOW()),
  (138, 'C2 350ml',             'MISCELLANEOUS',   138,     30.00, true, NOW(), NOW()),
  (139, 'Dari Crème',           'MISCELLANEOUS',   139,     45.00, true, NOW(), NOW()),
  (140, 'Tetra',                'MISCELLANEOUS',   140,     25.00, true, NOW(), NOW()),
  (141, 'P Juice',              'MISCELLANEOUS',   141,     32.00, true, NOW(), NOW()),
  (142, 'Chuckie',              'MISCELLANEOUS',   142,     37.00, true, NOW(), NOW()),
  (143, 'Powerade',             'MISCELLANEOUS',   143,     18.00, true, NOW(), NOW()),
  (144, 'Boost',                'MISCELLANEOUS',   144,     30.00, true, NOW(), NOW()),
  (145, 'Mineral Big',          'MISCELLANEOUS',   145,     20.00, true, NOW(), NOW()),
  (146, 'Mineral Sm',           'MISCELLANEOUS',   146,     15.00, true, NOW(), NOW()),
  (147, 'Cobra',                'MISCELLANEOUS',   147,     20.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 182)
  (148, 'Kasalo',               'MISCELLANEOUS',   148,     35.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 183)
  (149, 'Litro',                'MISCELLANEOUS',   149,     45.00, true, NOW(), NOW()),  -- shares a name; price is the discriminator (sheet row 184)
  (150, '1.5',                  'MISCELLANEOUS',   150,     77.00, true, NOW(), NOW()),
  (151, 'Gatorade',             'MISCELLANEOUS',   151,     35.00, true, NOW(), NOW()),
  (152, 'Pulpy',                'MISCELLANEOUS',   152,     17.00, true, NOW(), NOW()),
  (153, 'Pepsi / Mdew',         'MISCELLANEOUS',   153,     20.00, true, NOW(), NOW()),
  (154, 'Peanut Butter',        'MISCELLANEOUS',   154,     75.00, true, NOW(), NOW()),
  (155, 'Zest O',               'MISCELLANEOUS',   155,     12.00, true, NOW(), NOW()),
  (156, 'Fuze',                 'MISCELLANEOUS',   156,     15.00, true, NOW(), NOW()),
  (157, 'Wilkins Big',          'MISCELLANEOUS',   157,     20.00, true, NOW(), NOW()),
  (158, 'Wilkins Sm',           'MISCELLANEOUS',   158,     15.00, true, NOW(), NOW()),
  (159, 'Boost Sm',             'MISCELLANEOUS',   159,     15.00, true, NOW(), NOW()),
  (160, 'Chuckie Sm',           'MISCELLANEOUS',   160,     23.00, true, NOW(), NOW()),
  (161, 'Yakult',               'MISCELLANEOUS',   161,     13.00, true, NOW(), NOW()),
  (162, 'Sakto/Swakto',         'MISCELLANEOUS',   162,     17.00, true, NOW(), NOW()),
  (163, 'Mismo',                'MISCELLANEOUS',   163,     22.00, true, NOW(), NOW()),
  (164, '8oz Softdrinks',       'MISCELLANEOUS',   164,     15.00, true, NOW(), NOW()),
  (165, 'Drum',                 'MISCELLANEOUS',   165,    250.00, true, NOW(), NOW()),
  (166, 'Real Leaf',            'MISCELLANEOUS',   166,     30.00, true, NOW(), NOW()),
  (167, 'Predator',             'MISCELLANEOUS',   167,     22.00, true, NOW(), NOW()),
  (168, 'Peanut Butter XL',     'MISCELLANEOUS',   168,    130.00, true, NOW(), NOW()),
  (169, 'Peanut Butter L',      'MISCELLANEOUS',   169,    100.00, true, NOW(), NOW());

SELECT setval(pg_get_serial_sequence('"Product"', 'id'), COALESCE(MAX(id), 1)) FROM "Product";

COMMIT;
