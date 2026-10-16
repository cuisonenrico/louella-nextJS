-- Register the inventory sheet's revenue panel from src/lib/rbac/features.ts.
--
-- RoleFeaturePermission / UserFeaturePermission reference Feature.key, so the
-- key must exist before the permissions matrix can store an override.
-- Grants nothing: role defaults live in ROLE_DEFAULTS in code (every role
-- except MANAGER).
INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  ('inventory-history:revenue', 'Revenue figures', 'Revenue column and revenue cards on the inventory sheet', NOW())
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;
