-- Register every feature key from src/lib/rbac/features.ts in the Feature table.
--
-- WHY THIS IS A MIGRATION AND NOT JUST A SEED
--   RoleFeaturePermission.featureKey and UserFeaturePermission.featureKey are
--   foreign keys onto Feature.key. Until a key exists here, an admin toggling
--   it in the permissions matrix gets a foreign-key violation rather than a
--   saved override. The sixteen new keys are therefore a schema-level
--   prerequisite for the feature, not optional sample data.
--
-- WHAT IT DOES NOT DO
--   It grants nothing. Effective permissions come from ROLE_DEFAULTS in code,
--   layered with RoleFeaturePermission / UserFeaturePermission overrides. Those
--   override tables are deliberately left untouched: seeding them would
--   silently diverge the database from the defaults in code.
--
-- BACKWARD COMPATIBILITY
--   Purely additive. The frozen Cloud Run image and the shipped Flutter build
--   read only the original ten keys and ignore rows they do not recognise.

INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  -- Original ten. Mirrored in louella_mobile/lib/core/constants/feature_keys.dart;
  -- renaming any of these breaks the shipped mobile build.
  ('dashboard',             'Dashboard',             'Revenue and KPI summary cards',                        NOW()),
  ('analytics',             'Revenue & Analytics',   'Sales charts, revenue trends and product performance', NOW()),
  ('inventory-history',     'Inventory',             'Daily inventory history, gaps and rejections',         NOW()),
  ('quick-entry',           'Quick Entry',           'Fast daily inventory entry sheet (mobile)',            NOW()),
  ('branch-comparison',     'Branch Comparison',     'Side-by-side branch performance (mobile)',             NOW()),
  ('waste-report',          'Waste Report',          'Reject and leftover analysis (mobile)',                NOW()),
  ('low-stock',             'Low Stock',             'Materials at or below reorder level (mobile)',         NOW()),
  ('approval-queue',        'Approval Queue',        'Adjustments and orders awaiting approval (mobile)',    NOW()),
  ('notifications',         'Notifications',         'Push notification delivery and history (mobile)',      NOW()),
  ('user-management',       'User Management',       'Create and manage accounts, roles and branches',       NOW()),

  -- New in this migration.
  ('inventory-adjustments', 'Inventory Adjustments', 'Pull-ins, pull-outs, transfers and anomaly corrections', NOW()),
  ('production',            'Production',            'Daily production board',                               NOW()),
  ('production-orders',     'Production Orders',     'Branch production orders and approvals',               NOW()),
  ('production-cost',       'Production Cost',       'Cost-per-unit breakdown by product and branch',        NOW()),
  ('production-efficiency', 'Production Efficiency', 'Planned versus actual yield analysis',                 NOW()),
  ('inventory-import',      'Inventory Import',      'Spreadsheet import and its history log',               NOW()),
  ('material-stock',        'Material Stock',        'Raw material stock levels and gaps',                   NOW()),
  ('products',              'Products',              'Product catalog and pricing',                          NOW()),
  ('materials',             'Materials',             'Raw material catalog and price history',               NOW()),
  ('recipes',               'Recipes',               'Product recipes and costing',                          NOW()),
  ('branches',              'Branches',              'Branch directory and configuration',                   NOW()),
  ('suppliers',             'Suppliers',             'Supplier directory',                                   NOW()),
  ('unit-conversions',      'Unit Conversions',      'Measurement unit conversion rules',                    NOW()),
  ('product-order-config',  'Product Order Config',  'Display ordering of products across sheets',           NOW()),
  ('permissions',           'Permissions',           'Role and per-user feature permission matrix',          NOW()),
  ('jobs',                  'Jobs',                  'Scheduled job runs and on-demand autofill',            NOW())
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description;
