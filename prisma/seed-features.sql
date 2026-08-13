-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Feature Registry Seed
--
-- Owns: Feature. Optional but recommended. Run any time after the database
-- exists; nothing else depends on it.
--
-- WHAT THIS DOES AND DOES NOT DO
--   Permissions are driven by code defaults in
--   PermissionsService.getDefaultsForRole() — the app works correctly with
--   this table empty, and seeding it grants nothing on its own.
--
--   Feature rows exist so the admin permissions matrix
--   (GET /api/v1/permissions/matrix, which calls feature.findMany) has
--   something to render. Without them that screen lists no features and an
--   admin cannot see or toggle role overrides.
--
--   RoleFeaturePermission / UserFeaturePermission are deliberately NOT seeded:
--   they are OVERRIDES layered on top of the code defaults, so seeding them
--   would silently diverge the database from the defaults in code.
--
-- Keys below mirror getDefaultsForRole() exactly. If a new feature key is
-- added there, add it here too or it will be invisible in the admin matrix.
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  ('quick-entry',       'Quick Entry',       'Fast daily inventory entry sheet',                NOW()),
  ('inventory-history', 'Inventory History', 'Browse and edit past inventory records',          NOW()),
  ('notifications',     'Notifications',     'In-app alerts for stock and approvals',           NOW()),
  ('dashboard',         'Dashboard',         'Revenue and sales overview',                      NOW()),
  ('branch-comparison', 'Branch Comparison', 'Compare performance across branches',             NOW()),
  ('waste-report',      'Waste Report',      'Reject and leftover analysis',                    NOW()),
  ('low-stock',         'Low Stock',         'Materials at or below reorder level',             NOW()),
  ('approval-queue',    'Approval Queue',    'Pending production orders awaiting approval',     NOW()),
  ('analytics',         'Analytics',         'Trends, suggestions and historical reporting',    NOW()),
  ('user-management',   'User Management',   'Create and manage accounts, roles and branches',  NOW())
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description;

COMMIT;
