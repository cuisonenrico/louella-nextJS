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
| 7 | `seed-product-aliases.sql` | `ProductAlias` | One-off prices that are not catalog price changes. |

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
   over the three known workbooks: history takes the refusals from 17 to 3.
2. **Money.** `computeSold` / revenue value historical rows through
   `getEffectivePrice()`. Without history, two years of sales are priced at
   today's rates. 112 of 169 products already changed price across just three
   workbooks.

### Verification after seeding

```sql
SELECT COUNT(*) FROM "Product";                 -- 169
SELECT COUNT(*) FROM "ProductPriceHistory";     -- 286
SELECT COUNT(*) FROM "ProductAlias";            -- 4
-- names deliberately carrying two products, separated by price
SELECT name, COUNT(*) FROM "Product" GROUP BY name HAVING COUNT(*) > 1;
--   Bonette, Cobra, Kasalo, Litro, Pandesal Pack, Vitamilk
```

Simulated over `Jan1-13-2026`, `Apr14-28-2026` and `Apr29-May13-2026` with all
seven files applied: **7,866 product rows resolved, 0 ambiguous, 0 unmatched.**

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
