-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Feature Registry Seed
--
-- Owns: Feature. Optional but recommended. Run any time after the database
-- exists; nothing else depends on it.
--
-- WHAT THIS DOES AND DOES NOT DO
--   Permissions are driven by ROLE_DEFAULTS in src/lib/rbac/features.ts, so
--   seeding this table grants nothing on its own.
--
--   Feature rows exist so that role and per-user overrides can reference them:
--   both override tables have a foreign key onto Feature.key, so an
--   unregistered key cannot be toggled at all.
--
--   RoleFeaturePermission / UserFeaturePermission are deliberately NOT seeded:
--   they are OVERRIDES layered on top of the code defaults, so seeding them
--   would silently diverge the database from the defaults in code.
--
-- Keys below mirror src/lib/rbac/features.ts exactly, and a conformance test
-- fails the build if they drift apart.
-- ---------------------------------------------------------------------------


-- SUPERSEDED BY A MIGRATION
--   As of 20260819000000_seed_rbac_feature_registry the feature registry ships
--   as a migration, because both override tables carry a foreign key onto
--   Feature.key and an unregistered key cannot be toggled at all. A migrated
--   database already has every key; this file remains for databases built from
--   the seed scripts alone.
--
--   The authoritative list lives in src/lib/rbac/features.ts. `npx prisma db seed`
--   derives from it directly; a conformance test asserts this file agrees.

BEGIN;

INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  -- dashboard
  ('dashboard',                       'Dashboard',                  'Revenue and KPI summary cards', NOW()),
  ('dashboard:kpis',                  'KPI row',                    'Product, branch, material and recipe counts', NOW()),
  ('dashboard:revenue-trend',         'Revenue trend',              'Daily revenue, sold, delivery and leftover trend', NOW()),
  ('dashboard:production-mix',        'Production mix',             'Today''s yield broken down by product type', NOW()),
  ('dashboard:branch-orders',         'Branch orders',              'Draft and finalised production order counts for today', NOW()),
  ('dashboard:branch-gaps',           'Branches missing inventory', 'Which active branches have not entered inventory today. Names other branches, so it is cross-branch information.', NOW()),
  ('dashboard:low-stock',             'Low stock card',             'Materials at or below reorder level', NOW()),
  ('dashboard:rejections',            'Rejections by product',      'Reject counts per product for the period', NOW()),
  -- analytics
  ('analytics',                       'Revenue & Analytics',        'Sales charts, revenue trends and product performance', NOW()),
  -- inventory-history
  ('inventory-history',               'Inventory',                  'Daily inventory history, gaps and rejections', NOW()),
  ('inventory-history:create',        'Create entries',             'Add inventory rows, singly or in bulk', NOW()),
  ('inventory-history:edit',          'Edit entries',               'Amend an existing inventory row', NOW()),
  ('inventory-history:delete',        'Delete entries',             'Remove an inventory row', NOW()),
  ('inventory-history:recascade',     'Recascade',                  'Recompute carried-forward stock across subsequent days', NOW()),
  ('inventory-history:gaps',          'Gap analysis',               'Days with missing inventory entries', NOW()),
  ('inventory-history:export-sales',  'Sales export',               'Download the sales spreadsheet for a period', NOW()),
  -- inventory-adjustments
  ('inventory-adjustments',           'Inventory Adjustments',      'Pull-ins, pull-outs, transfers and anomaly corrections', NOW()),
  ('inventory-adjustments:create',    'Create adjustment',          'Record a pull-in or pull-out', NOW()),
  ('inventory-adjustments:transfer',  'Transfer between branches',  'Move stock from one branch to another', NOW()),
  ('inventory-adjustments:edit',      'Edit adjustment',            'Amend an existing adjustment', NOW()),
  ('inventory-adjustments:delete',    'Delete adjustment',          'Remove an adjustment and reverse its effect', NOW()),
  -- production
  ('production',                      'Production',                 'Daily production board', NOW()),
  ('production:create',               'Record production',          'Add production rows, singly or in bulk', NOW()),
  ('production:edit',                 'Edit production',            'Amend a production row', NOW()),
  ('production:delete',               'Delete production',          'Remove a production row', NOW()),
  -- production-orders
  ('production-orders',               'Production Orders',          'Branch production orders and approvals', NOW()),
  ('production-orders:create',        'Create order',               'Raise a branch production order', NOW()),
  ('production-orders:edit',          'Edit order',                 'Amend or finalise an order', NOW()),
  ('production-orders:delete',        'Delete order',               'Remove a production order', NOW()),
  ('production-orders:suggestions',   'Order suggestions',          'Suggested quantities derived from recent sales', NOW()),
  ('production-orders:planned-yield', 'Planned yield',              'Aggregate planned yield across orders', NOW()),
  -- production-cost
  ('production-cost',                 'Production Cost',            'Cost-per-unit breakdown by product and branch', NOW()),
  -- production-efficiency
  ('production-efficiency',           'Production Efficiency',      'Planned versus actual yield analysis', NOW()),
  -- inventory-import
  ('inventory-import',                'Inventory Import',           'Spreadsheet import and its history log', NOW()),
  ('inventory-import:preview',        'Preview a file',             'Parse a spreadsheet and show what would be imported', NOW()),
  ('inventory-import:import',         'Commit an import',           'Write a previewed spreadsheet into inventory', NOW()),
  ('inventory-import:delete-log',     'Delete a log entry',         'Remove an import history record', NOW()),
  -- material-stock
  ('material-stock',                  'Material Stock',             'Raw material stock levels and gaps', NOW()),
  ('material-stock:create',           'Record stock',               'Add material stock rows, singly or in bulk', NOW()),
  ('material-stock:edit',             'Edit stock',                 'Amend a material stock row', NOW()),
  ('material-stock:delete',           'Delete stock',               'Remove a material stock row', NOW()),
  ('material-stock:init',             'Initialise a period',        'Seed stock rows for a date or date range', NOW()),
  ('material-stock:adjust',           'Adjust stock',               'Record or remove a material stock adjustment', NOW()),
  -- products
  ('products',                        'Products',                   'Product catalog and pricing', NOW()),
  ('products:create',                 'Create products',            'Add products, singly or in bulk', NOW()),
  ('products:edit',                   'Edit products',              'Amend a product, including its price', NOW()),
  ('products:delete',                 'Delete products',            'Remove a product from the catalog', NOW()),
  ('products:price-history',          'Price history',              'Historical selling prices for a product', NOW()),
  -- materials
  ('materials',                       'Materials',                  'Raw material catalog and price history', NOW()),
  ('materials:create',                'Create materials',           'Add materials, singly or in bulk', NOW()),
  ('materials:edit',                  'Edit materials',             'Amend a material, including its cost', NOW()),
  ('materials:delete',                'Delete materials',           'Remove a material from the catalog', NOW()),
  ('materials:price-history',         'Cost history',               'Historical purchase costs for a material', NOW()),
  -- recipes
  ('recipes',                         'Recipes',                    'Product recipes and costing', NOW()),
  ('recipes:create',                  'Create recipes',             'Define a new product recipe', NOW()),
  ('recipes:edit',                    'Edit recipes',               'Amend a recipe and its ingredients', NOW()),
  ('recipes:delete',                  'Delete recipes',             'Remove a recipe', NOW()),
  ('recipes:cost',                    'Recipe costing',             'Computed material cost per unit for a recipe', NOW()),
  -- branches
  ('branches',                        'Branches',                   'Branch directory and configuration', NOW()),
  ('branches:create',                 'Create branches',            'Add a branch to the directory', NOW()),
  ('branches:edit',                   'Edit branches',              'Amend branch details', NOW()),
  ('branches:delete',                 'Delete branches',            'Remove a branch', NOW()),
  -- suppliers
  ('suppliers',                       'Suppliers',                  'Supplier directory', NOW()),
  ('suppliers:create',                'Create suppliers',           'Add a supplier', NOW()),
  ('suppliers:edit',                  'Edit suppliers',             'Amend supplier details', NOW()),
  ('suppliers:delete',                'Delete suppliers',           'Remove a supplier', NOW()),
  -- unit-conversions
  ('unit-conversions',                'Unit Conversions',           'Measurement unit conversion rules', NOW()),
  ('unit-conversions:create',         'Create conversions',         'Add a unit conversion rule', NOW()),
  ('unit-conversions:edit',           'Edit conversions',           'Amend a conversion rule', NOW()),
  ('unit-conversions:delete',         'Delete conversions',         'Remove a conversion rule', NOW()),
  -- product-order-config
  ('product-order-config',            'Product Order Config',       'Display ordering of products across sheets', NOW()),
  ('product-order-config:edit',       'Reorder products',           'Change the display order products appear in', NOW()),
  -- user-management
  ('user-management',                 'User Management',            'Create and manage accounts, roles and branches', NOW()),
  ('user-management:create',          'Create accounts',            'Register a new user account', NOW()),
  ('user-management:set-role',        'Change roles',               'Change an account''s role', NOW()),
  ('user-management:set-branch',      'Assign branches',            'Change an account''s branch assignment', NOW()),
  ('user-management:set-status',      'Activate / deactivate',      'Enable or disable an account', NOW()),
  ('user-management:reset-password',  'Reset passwords',            'Issue a temporary password for an account', NOW()),
  -- permissions
  ('permissions',                     'Permissions',                'Role and per-user feature permission matrix', NOW()),
  ('permissions:edit',                'Change permissions',         'Write role and per-user permission overrides', NOW()),
  -- jobs
  ('jobs',                            'Jobs',                       'Scheduled job runs and on-demand autofill', NOW()),
  ('jobs:run',                        'Run jobs on demand',         'Trigger autofill and material-stock autofill jobs', NOW()),
  -- all-branches
  ('all-branches',                    'All Branches',               'See and act on data for every branch. Without this, a user is confined to the branch assigned to their account.', NOW()),
  -- quick-entry
  ('quick-entry',                     'Quick Entry',                'Fast daily inventory entry sheet (mobile)', NOW()),
  -- branch-comparison
  ('branch-comparison',               'Branch Comparison',          'Side-by-side branch performance (mobile)', NOW()),
  -- waste-report
  ('waste-report',                    'Waste Report',               'Reject and leftover analysis (mobile)', NOW()),
  -- low-stock
  ('low-stock',                       'Low Stock',                  'Materials at or below reorder level (mobile)', NOW()),
  -- approval-queue
  ('approval-queue',                  'Approval Queue',             'Adjustments and orders awaiting approval (mobile)', NOW()),
  -- notifications
  ('notifications',                   'Notifications',              'Push notification delivery and history (mobile)', NOW())
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description;

COMMIT;
