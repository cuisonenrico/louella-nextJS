# Seed order

Two different targets. Pick one — they are not compatible.

## A. Production-shaped database, ready for an XLSX history import

This is the path for the historical import. It builds the catalog and its
supporting tables and leaves every operational table empty, so the workbooks
are the only source of inventory.

| # | File | Owns | Notes |
|---|------|------|-------|
| 0 | `truncate.sql` | — | Wipes everything. Cascades through `Branch` to users. |
| 1 | `seed-branches.sql` | `Branch` | ⚠ Dev branch names. Confirm the real ones first — the workbooks carry a `BRANCH:` cell (`C2` in Apr14-28). |
| 2 | `seed-users.sql` | `User` | Idempotent and authoritative: re-running RESETS passwords to the documented values. See `SEED_CREDENTIALS.md`. |
| 3 | `seed-features.sql` | `Feature` | Optional. Only powers the admin permissions matrix; permissions themselves come from code defaults. |
| 4 | `seed-materials.sql` | `Material`, `Supplier`, `UnitConversion`, `MaterialInventory`, `MaterialPriceHistory`, `MaterialAdjustment` | No product dependency. |
| 5 | `seed-products-apr2026.sql` | `Product` | 169 products from `Apr14-28-2026.xlsx`. Same-named variants separated by price. |
| 6 | `seed-product-price-history.sql` | `ProductPriceHistory` | **Required, not optional** — see below. |
| 7 | `seed-product-aliases.sql` | `ProductAlias` | Currently seeds **no rows**, and that is correct — the catalog plus price history resolve the whole known archive. Run it anyway so the table is in a known state. |

Then import the workbooks **chronologically, oldest first**, per
`docs/HISTORICAL_IMPORT_RUNBOOK.md` (once written) and the plan in
`docs/superpowers/plans/2026-08-12-historical-xlsx-import.md`.

**Do not run `seed-local.sql` on this path.** Its synthetic inventory and
production rows occupy the same `(branchId, productId, date)` keys the import
writes to, and its `ProductPriceHistory` rows contradict step 6.

### Why step 6 is required

Two independent reasons:

1. **Matching.** The importer identifies same-named products by price *as of
   the sheet's date*. Without history, every sheet is compared against today's
   `Product.price`, so any older workbook refuses with "matches none". Measured
   over the three known workbooks: without history, 17 rows refuse; with it,
   none do.
2. **Money.** `computeSold` / revenue value historical rows through
   `getEffectivePrice()`. Without history, the whole archive is priced at
   today's rates. **117 of 169 products changed price at least once** across
   just three workbooks — one of them 16 times.

The history is built from **every day sheet**, not one snapshot per workbook,
so a price that changes part-way through a fortnight is recorded on the day it
took effect. That matters more than it sounds: `Pandesal Pack` (id 34) runs
₱40 → ₱300 on Jan 4 → ₱40 on Jan 6 → ₱4200 on May 7 → ₱40 on May 8. A
per-workbook snapshot sees only the ₱40 and those three sheets refuse.

### Verification after seeding

```sql
SELECT COUNT(*) FROM "Product";                 -- 169
SELECT COUNT(*) FROM "ProductPriceHistory";     -- 336
SELECT COUNT(*) FROM "ProductAlias";            --   0  (expected — see the file)
-- names deliberately carrying two products, separated by price
SELECT name, COUNT(*) FROM "Product" GROUP BY name HAVING COUNT(*) > 1;
--   Bonette, Cobra, Kasalo, Litro, Pandesal Pack, Vitamilk
-- price history must span the archive, not sit at one date
SELECT MIN("effectiveAt"), MAX("effectiveAt"), COUNT(DISTINCT "effectiveAt")
FROM "ProductPriceHistory";                     -- 2025-12-31 .. 2026-05-13, 29
```

Simulated over `Jan1-13-2026`, `Apr14-28-2026` and `Apr29-May13-2026` with all
seven files applied: **7,866 product rows resolved, 0 ambiguous, 0 unmatched —
with no aliases at all.**

## B. Local development with sample operational data

The original path, unchanged. Gives you a database with inventory, production
and orders already populated so screens have something to render.

```
truncate.sql -> seed-materials.sql -> seed-products.sql -> seed-local.sql
```

`seed-products.sql` is the OLD catalog (165 products, `(bote)` name suffixes,
no duplicate names). It is kept because `seed-local.sql` references its product
ids, and because it owns the recipe generator that `seed-products-apr2026.sql`
does not reproduce.

## Recipes

`seed-products-apr2026.sql` owns `Product` only, and truncating `Product`
cascades `Recipe` and `RecipeItem` away. Path A therefore ends with no recipes.

If you need them, the generator at the bottom of `seed-products.sql` resolves
ingredients by name pattern and can be adapted — but its final statement
hardcodes a soft-deleted test recipe on `productId 143`, which under the new
numbering is `Powerade`, not what that test intended. Re-point it before use.
