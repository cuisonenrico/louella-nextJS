# Seed Account Credentials

These are the standard accounts created by the seed scripts
(`prisma/seed-users.sql` and `prisma/seed-local.sql`). **All passwords are
known and documented here** — they are dev/seed credentials.

> ⚠️ **Dev/seed only.** Change these before exposing the deployment publicly.
> The seed scripts are *authoritative*: re-running them resets each account's
> password back to the value below (`ON CONFLICT (email) DO UPDATE`) and
> re-enables the account (`isActive = true`).

## Accounts

| Email                           | Password        | Role      | Notes                                  |
| ------------------------------- | --------------- | --------- | -------------------------------------- |
| `admin@louella.com`             | `Admin@123`     | ADMIN     | Full access                            |
| `manager.marikina@louella.com`  | `Manager@123`   | MANAGER   | Scoped to **Marikina Branch** (seed-local) |
| `manager.cubao@louella.com`     | `Manager@123`   | MANAGER   | Scoped to **Cubao Branch** (seed-local)    |
| `inventory@louella.com`         | `Inventory@123` | INVENTORY | Inventory operations                   |
| `viewer@louella.com`            | `Viewer@123`    | VIEWER    | Read-only                              |

> Branch scoping (`branchId`) is applied by `seed-local.sql` only — it requires
> the branches to exist. `seed-users.sql` creates the accounts without branch
> links.

## Which script creates what

- **`seed-users.sql`** — just the five accounts above. Safe to run on any
  environment (production-ish), does not touch operational data.
- **`seed-products.sql`** — the canonical 165-product catalog plus rule-generated
  rough recipes. Owns `Product`, `Recipe`, `RecipeItem`. Run it **before**
  `seed-local.sql`; `seed-local.sql` no longer seeds products.
- **`seed-local.sql`** — full local-dev dataset (branches, production, inventory,
  adjustments, …; products come from `seed-products.sql`) and inlines the same
  five accounts with the same hashes, plus the manager→branch links.

**Run order:** `truncate.sql` → `seed-materials.sql` → `seed-products.sql` → `seed-local.sql`

(`seed-materials.sql` has no user dependency — `MaterialInventory.createdById` is
seeded `NULL` — so it can run first. Login accounts are created by `seed-local.sql`,
or run the standalone `seed-users.sql` any time.)

## Implementation notes

- Hashes are **bcrypt, cost factor 10**, matching `AuthService` (`bcrypt.hash(password, 10)`).
- Each hash was generated and verified against its plaintext password before
  being committed.
- Login requires `password` length ≥ 6 (`LoginDto`); all passwords above satisfy this.

## Regenerating hashes

If you change a password, regenerate its hash from the `louella-be/` directory:

```bash
node -e 'require("bcrypt").hash("NewPassword", 10).then(console.log)'
```

Paste the result into both seed scripts (keep them in sync) and update the
table above.
