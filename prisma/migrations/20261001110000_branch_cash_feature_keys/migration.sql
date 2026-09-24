-- Register the Cash Reports screen and its actions from src/lib/rbac/features.ts.
--
-- RoleFeaturePermission / UserFeaturePermission reference Feature.key, so the
-- keys must exist before the permissions matrix can store an override.
-- Grants nothing: role defaults live in ROLE_DEFAULTS in code.
INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  ('branch-cash', 'Cash Reports', 'Branch expenses, vale and the daily cash count', NOW()),
  ('branch-cash:create', 'Record entries', 'Add expenses and vale, and enter the counted cash', NOW()),
  ('branch-cash:edit', 'Edit entries', 'Amend an expense or vale on an unverified day', NOW()),
  ('branch-cash:delete', 'Void entries', 'Void an expense or vale on an unverified day', NOW()),
  ('branch-cash:verify', 'Verify days', 'Verify or reopen a branch-day', NOW()),
  ('branch-cash:categories', 'Manage categories', 'Add, rename, reorder and deactivate expense categories', NOW())
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;
