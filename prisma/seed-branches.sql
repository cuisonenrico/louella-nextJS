-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Branch Seed
--
-- Owns: Branch. Run BEFORE seed-users.sql (User.branchId references it) and
-- before any inventory import (the import writes rows against a branchId).
--
-- SINGLE BRANCH: C2
--   Only C2 is seeded for now. The bakery has others (C3, B1, …) — add them
--   here as they come online. Every workbook currently on disk belongs to C2:
--   Jan1-13-2026, Apr14-28-2026 and Apr29-May13-2026 all carry "BRANCH: C2"
--   in their day sheets, so the whole known archive imports into this one row.
--
-- WHY id = 1
--   PRODUCTION_BRANCH_ID defaults to 1 and is currently set to 1 in .env.
--   production.service.ts and production-orders.service.ts treat that branch
--   as the production kitchen. With a single branch, C2 is both the selling
--   branch and the production branch, which is consistent. When a second
--   branch is added, decide deliberately which id is the kitchen and set
--   PRODUCTION_BRANCH_ID to match — do NOT let it stay 1 by accident.
--
-- address / phone are left NULL rather than invented. Fill them in when the
-- real details are known; both columns are nullable.
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO "Branch" (id, name, address, phone, "isActive", "createdAt", "updatedAt") VALUES
  (1, 'C2', NULL, NULL, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  "isActive"  = true,
  "updatedAt" = NOW();

SELECT setval(pg_get_serial_sequence('"Branch"', 'id'), COALESCE(MAX(id), 1)) FROM "Branch";

COMMIT;
