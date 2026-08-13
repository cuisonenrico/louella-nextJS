-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Branch Seed
--
-- Owns: Branch. Run BEFORE seed-users.sql (User.branchId references it) and
-- before any inventory import (the import writes rows against a branchId).
--
-- Extracted from seed-local.sql so a production-shaped database can be built
-- without also pulling in that file's synthetic inventory/production rows,
-- which would collide with an XLSX history import.
--
-- ⚠ These three branches are the development set. The real workbooks carry a
-- "BRANCH:" cell — Apr14-28-2026.xlsx reads "C2" — so the live branch names
-- and codes should be confirmed with the client before importing history
-- against them. Importing into the wrong branch is not silently detectable.
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO "Branch" (id, name, address, phone, "isActive", "createdAt", "updatedAt") VALUES
  (1, 'Marikina Branch', '123 Shoe Ave, Marikina City', '028712345', true, NOW(), NOW()),
  (2, 'Cubao Branch',    '45 Araneta Center, Quezon City', '028719876', true, NOW(), NOW()),
  (3, 'Antipolo Branch', '88 Sumulong Hwy, Antipolo', '028765432', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"Branch"', 'id'), COALESCE(MAX(id), 1)) FROM "Branch";

COMMIT;
