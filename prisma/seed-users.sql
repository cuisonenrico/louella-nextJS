-- ---------------------------------------------------------------------------
-- LOUELLA BAKERY — Standard User Accounts Seed
--
-- Creates (or RESETS) the five standard accounts with KNOWN credentials.
-- See prisma/SEED_CREDENTIALS.md for the full email/password table.
--
-- IMPORTANT — this seed is idempotent AND authoritative:
--   ON CONFLICT (email) DO UPDATE re-applies the passwordHash, role, and
--   isActive=true every run. This means re-running the seed RESETS the
--   password of an existing account back to the documented value, and
--   re-enables any account that was disabled. This is intentional: it
--   guarantees the documented credentials always work after a (re)deploy.
--
-- The bcrypt hashes below were generated with cost factor 10 (matching
-- AuthService) and verified against their plaintext passwords.
-- ---------------------------------------------------------------------------

INSERT INTO "User" (email, "passwordHash", role, "isActive", "createdAt", "updatedAt") VALUES
  ('admin@louella.com',
   '$2b$10$Q4oO3Q9W5RjxmeA35W10huYtXd/VQw9hRdCrW3agV9cjZg9zypxHW',  -- Admin@123
   'ADMIN', true, NOW(), NOW()),
  ('manager.marikina@louella.com',
   '$2b$10$l2Kv1x.cYE/gswR8mauGEe7DqS3TQpR13ztLk8HJiQ4gXS.S20T.C',  -- Manager@123
   'MANAGER', true, NOW(), NOW()),
  ('manager.cubao@louella.com',
   '$2b$10$HPCtJItzM8.uXHPesEkXl.Q4LfF39BNk5FoyZ/UGQ0pQQiSScLXUO',  -- Manager@123
   'MANAGER', true, NOW(), NOW()),
  ('inventory@louella.com',
   '$2b$10$0ugWTuQZ4NDsy9PciLc3G.4ooYPheWDSH46jem05dVWVke/RF2dUG',  -- Inventory@123
   'INVENTORY', true, NOW(), NOW()),
  ('viewer@louella.com',
   '$2b$10$FC3QJ5xx0Rndr0BSMbbJ9OAJKCgR7iCOSz3LLHZeN4P.JF3gPv6Ge',  -- Viewer@123
   'VIEWER', true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  role           = EXCLUDED.role,
  "isActive"     = true,
  "updatedAt"    = NOW();
