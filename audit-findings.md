# Louella — Repo Audit (read-only)

Audit date: 2026-09-18 · Commit: `ab8d64b` (master, clean) · Scope: `louella-nextJS/` only.

**Method and limits**
- Every claim below cites `path:line` in this repo. Where I couldn't find something, I say "not found".
- **I did not run the tests.** `node_modules/` is not installed (`npm outdated` reports every package as `MISSING`). Installing would have changed the working tree, and this audit was read-only. Test coverage below comes from reading the spec files, not from running them.
- `npm audit` read the lockfile and reported `found 0 vulnerabilities`.
- `PROJECT_SPEC.md` (cited by `AGENTS.md:160`) is **not found** in the repo. Domain rules are taken from `AGENTS.md`.

---

## Architecture

### Stack and entry points

| Concern | What it is | Evidence |
|---|---|---|
| Frontend | Next.js 16.3.5 App Router, React 19, TanStack Query, Zustand, shadcn/ui | `package.json` deps |
| API | NestJS 11 on Express 5, served **inside** Next via one catch-all route | `src/app/api/v1/[...path]/route.ts` → `src/server/nest-handler.ts` → `src/server/http-bridge.ts` |
| Nest bootstrap | Global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})`, `PrismaExceptionFilter`, CORS, cookie-parser | `src/server/nest-handler.ts:65-70` |
| DB | Postgres (Supabase) via Prisma 6. Runtime uses the transaction pooler; migrations use `DIRECT_URL` | `prisma/schema.prisma:5-14` |
| Global guards | `JwtAuthGuard` → `RolesGuard` → `FeatureGuard` → `ThrottlerGuard` (20 req/min, in-memory) | `src/server/app.module.ts:44,72-79` |
| Deploy | One Vercel project, region `hnd1`, API function 1 GB / **60 s max** | `vercel.json` |
| Scheduling | None. Placeholder rows are created on read by `AutofillInterceptor` | `src/server/common/interceptors/autofill.interceptor.ts:378-389` |

**Commands** (`package.json` scripts): `dev` (port 4000), `build` (`prebuild` runs `prisma generate`), `start`, `lint`, `test` = `vitest run` + `jest`, `prisma:migrate|generate|deploy`.
**CI: not found.** There is no `.github/` directory and no other CI config. Deploys go through Vercel's Git integration (inferred from `vercel.json` plus `docs/DEPLOYMENT.md`), so nothing runs lint, typecheck or tests before a deploy.

### Directory map

| Path | Owns |
|---|---|
| `src/app/` | Next routes. `(app)/*` holds one folder per business screen; `api/v1/[...path]` is the whole backend entry |
| `src/components/` | shadcn `ui/`, layout shell, the shared `sheet` spreadsheet module, analytics cards |
| `src/lib/` | axios client + typed API wrappers, token store, **shared metrics** (`lib/inventory/metrics.ts`), RBAC manifest (`lib/rbac/features.ts`) |
| `src/contexts/` | `AuthContext` (re-mints the access token from the refresh cookie) |
| `src/server/` | NestJS app: one folder per domain (controller/service/dto), plus `common/` (guards, decorators, utils, cache) and `prisma/` |
| `prisma/` | `schema.prisma`, 19 migrations, seed SQL |
| `e2e/` | Playwright specs (auth/refresh/route sweeps) |
| `scripts/` | One-off import audit and inventory seeding |
| `docs/` | `DEPLOYMENT.md`, import audit report, superpowers plans/specs |

### Data model

| Entity | Key relations | Role |
|---|---|---|
| `Inventory` | branch × product × **date** (unique, `schema.prisma:291`) | **The finished-goods ledger.** One row per branch/product/day holding `quantity` (opening), `delivery`, `leftover` (counted close), `reject`. `sold` is **derived** |
| `InventoryAdjustment` | → Inventory; self-link for transfers | Signed movements (`PULL_IN` +, `PULL_OUT`/`ANOMALY` −) folded into `sold` |
| `Production` | branch × product × date (unique, `:350`) | Kitchen yield. Drives `MaterialInventory.used` |
| `ProductionOrder` / `ProductionOrderItem` | → Branch, → Product | Plans. On FINALIZE they write Production + Inventory.delivery |
| `MaterialInventory` | material × date (unique, `:491`), **no branch** | **The raw-material ledger.** `quantity` (opening, snapshot), `delivery`, `used` (incremented by production) |
| `MaterialAdjustment` | → MaterialInventory | Signed material movements (Float) |
| `Material`, `Recipe` (1:1 Product), `RecipeItem`, `UnitConversion` | | Consumption = yield / recipeYield × qty × factor |
| `Product`, `ProductPriceHistory`, `Material`, `MaterialPriceHistory` | | Prices (Decimal). Revenue uses ProductPriceHistory |
| `Branch`, `Supplier`, `ProductAlias`, `ImportLog`, `JobRun` | | Reference data / audit logs |
| `User`, `RefreshToken`, `Feature`, `RoleFeaturePermission`, `UserFeaturePermission`, `DeviceToken`, `File`, `Job` | | Auth, RBAC, FCM, and the unwired S3 upload |

**Source of truth for quantity on hand**
- **Finished goods:** there is no single balance column. The day's closing stock is the **counted** `Inventory.leftover`. Opening stock `Inventory.quantity` is a **stored copy** of the previous day's leftover (`jobs.service.ts:273-281`). "Sold" is derived as `quantity + delivery + Σadj − leftover − reject` (`src/lib/inventory/metrics.ts:50-58`). This model is a chain of stored snapshots, not a movement ledger.
- **Materials:** closing stock is **derived** (`quantity + delivery + Σadj − used`, clamped at ≥0, `metrics.ts:80-85`). The next day's opening `quantity` is a **stored snapshot** of that value, taken once when the card is created (`material-inventory.service.ts:181-191`).
- **No POS/sales, delivery-receipt, or returns table exists** (schema has none). "Sold" is inferred from counts, not recorded transactions.

### Write path traced: a sheet save (`PATCH /api/v1/inventory/bulk`)

1. **Browser**: sheet → `src/lib/apiServices.ts` → axios instance `src/lib/api.ts` (Bearer from memory; retries once after refreshing on a 401, `api.ts:82-96`).
2. **Next route** `src/app/api/v1/[...path]/route.ts` → `nest-handler.ts` (cached Nest app) → `http-bridge.ts` (Web Request → Node req/res).
3. **Nest global pipeline**: `JwtAuthGuard` → `RolesGuard` (`@Roles(INVENTORY)`, `inventory.controller.ts:77`) → `FeatureGuard` (`inventory-history:edit`, `:76`) → `ThrottlerGuard` → controller-level `BranchGuard` (`inventory.controller.ts:48`; pins `req.query.branchId` for branch-scoped users, `branch.guard.ts:135-143,210`) → `ValidationPipe` on `UpdateInventoryItemDto`.
4. **Service** `InventoryService.updateBulk` (`inventory.service.ts:610-703`): one read scoped to the branch (`:619-639`), all-or-nothing existence check (`:643-649`), per-row `assertRowIsPossible` (`:655-664`), **transaction 1**: batched `update`s (`:666-682`), then `cascadeMany` → one read plus **transaction 2**: carry-forward writes into the following placeholder days (`:714-797`).
5. **Prisma extension** bumps the `inventory-agg` and `dashboard-agg` cache versions after each write (`prisma/prisma-cache-invalidation.ts:31-59`).
6. **Postgres**: `Inventory` rows updated. No history row is written anywhere.

### Read path traced: the sales dashboard (`GET /api/v1/inventory/dashboard?startDate&endDate`)

1. Browser `sales/page.tsx` → axios → Next route → Nest bridge (same as above).
2. Guards: JWT → Roles(VIEWER) → Feature(`inventory-history` or `dashboard:revenue-trend`, `inventory.controller.ts:192`) → Throttler → BranchGuard (pins the branch).
3. `InventoryService.getDashboard` → `CacheNamespaceService.wrap('inventory-agg', …)` (`inventory.service.ts:882-888`; in-memory, 45 s, per instance, `cache-namespace.service.ts`).
4. On a miss: `getDashboardUncached` (`:890-1003`) → `inventory.findMany` with non-deleted adjustments and product (`:900-912`) → `fetchHistoryMap` over `ProductPriceHistory` (`:365-380`) → `aggregateInventoryMetrics` (`:279-363`) using `computeSold` and `getEffectivePrice` in JS floating point → daily breakdown.
5. JSON response. Numbers are JS doubles.

---

## Phase 2 — Inventory invariants

### 1. Single source of truth — **both stored and derived, and they can diverge**

| Balance | Stored as | Derived as | Where they diverge |
|---|---|---|---|
| Finished-goods opening `Inventory.quantity[d]` | Copy of `leftover[d-1]` when the placeholder is created (`jobs.service.ts:273-281`, `production-orders.service.ts:316-331`) | Should equal the previous day's closing | (a) `create`/`createBulk` (`inventory.service.ts:102-183`), the XLSX import (`inventory-import.service.ts:623-662`), PO finalization (`production-orders.service.ts:208-227`) and adjustment writes (`inventory-adjustments.service.ts:98-329`) **never re-cascade**. Only `PATCH /:id` and `PATCH /bulk` do (`inventory.service.ts:571-579,697`). (b) The cascade deliberately stops at the first manual row (`:1224`), so a corrected leftover never reaches a manual next day. Only a count is returned as a warning (`:582-592`). Nothing reports or reconciles chain breaks. |
| Placeholder closing | `leftover = quantity + delivery + Σadj` (cascade, `inventory.service.ts:1225`) | `sold = quantity + delivery + Σadj − leftover − reject` → **0** | The PO finalization path writes `delivery` onto an **auto** placeholder without touching `leftover` (`production-orders.service.ts:216`), so `computeSold` reports the **whole delivery as sold** while the cascade rule assumes nothing was sold. Both formulas run on the same row. |
| Material opening `MaterialInventory.quantity[d]` | Snapshot of `computeMaterialClosing(prev)` at card creation (`material-inventory.service.ts:181-191,437-448`) | `quantity + delivery + Σadj − used` of the previous card | **No material re-cascade exists at all** (not found). Editing a past card, a past production yield (which moves `used` on that date, `production.service.ts:559-593`) or a past material adjustment changes that day's closing, and every later opening keeps the stale value. |
| `MaterialInventory.used` | Running total via `increment` (`production.service.ts:114,176`) | Σ over production of `yield / recipeYield × qty × factor` (recomputed in `production-analytics.service.ts:107-196`) | Direct overwrites of `used` (`material-inventory.service.ts:288,335`). PO finalization writes Production but **no** `used` (`production-orders.service.ts:188-205`). Soft-deleted recipes still consume (see 10). A production update that changes product/date doesn't reverse the old consumption (`production.service.ts:565-587`). Production batches and consumption are written in **separate transactions** (`:267-291` vs `:326`, `:365-387` vs `:424`). |

### 2. Concurrency — **no locking, no versioning, one atomic increment**

- **Row locks** (`FOR UPDATE`, advisory), **optimistic version columns**, and **Serializable isolation**: **not found** anywhere in `src/server` or `prisma/`.
- **Atomic `UPDATE … SET x = x + n`:** only `MaterialInventory.used: { increment }` (`production.service.ts:114,176`). Every other quantity write is an **absolute overwrite** (last writer wins): `inventory.service.ts:118-126,552-567,666-682`, `material-inventory.service.ts:279-293`, `production-orders.service.ts:197,216`.
- **Read-modify-write outside a transaction:**
  - Adjustment stock cap: `assertStockAvailable` reads (`inventory-adjustments.service.ts:64-96`), then the insert runs separately (`:111-113`). Transfer: the check at `:298` sits outside the interactive transaction at `:301-326`. Materials: `material-adjustments.service.ts:15-44`.
  - Production consumption: `oldYield` is read **before** the transaction (`production.service.ts:203-207`), and the delta is computed against it inside (`:235-241`). Bulk paths build `existingMap` outside the transaction too (`:255-265,353-363`).
  - Inventory row validity: `update()` reads the adjustments, validates, then writes (`inventory.service.ts:533-567`). A concurrent adjustment isn't seen.
- **Two simultaneous deductions of the last unit:** request A and request B each call `assertStockAvailable`, both see `available = 1`, both pass, and both insert a `PULL_OUT` of 1. On-hand becomes −1 and `sold` for that row drops by 1 (possibly below 0). Nothing detects it. For transfers, the destination also gains 2.
- **Two simultaneous production saves** for the same product and day both read `oldYield = 0` and both increment `used` by the full amount. Material consumption is **double-counted** permanently.

### 3. Idempotency — **none by design; safe only where writes are absolute**

- Idempotency keys: **not found**. The client explicitly disables mutation retries (`src/components/Providers.tsx:36-38`, "they are not idempotent here").
- **Safe on retry** (absolute upserts keyed on the unique triple): inventory create/bulk/update, material card create/update, the autofill jobs (`createMany … skipDuplicates`, `jobs.service.ts:184-198`).
- **Not safe on retry or double-submit:** `POST /inventory-adjustments` and `/transfer` (`inventory-adjustments.service.ts:111,301`), and `POST /material-adjustments` (`material-adjustments.service.ts:36`). Each resend inserts another movement. No unique constraint prevents it (`schema.prisma:305-328,512-528`).
- **Production** is idempotent under a *sequential* retry (the second call sees `oldYield = newYield`, so the delta is 0) but not under a *concurrent* one (§2).
- **Import:** a SHA-256 guard exists (`inventory-import.service.ts:828-840`), but it is check-then-act. Two concurrent uploads both pass. The second `ImportLog` insert then hits `@@unique([branchId, fileHash])`, and that error is **swallowed** (`:1042-1046`). The rows are upserts, so the data result is the same, but a log-write failure leaves the file re-importable.
- Webhooks: none exist (not found).

### 4. Negative stock

| Path | Behaviour | Evidence |
|---|---|---|
| Inventory `PATCH` / `PATCH bulk` | **Blocked** when leftover + reject > on-hand | `inventory.service.ts:84-100,541-547,655-664` |
| Inventory `POST` / `POST bulk` | **Silently allowed**. There's no `assertRowIsPossible` on the create path, so `sold` can be negative | `inventory.service.ts:102-183` |
| XLSX import | Allowed on purpose (it replays history) | `inventory.service.ts:79-82` |
| `PULL_OUT` adjustment / transfer | Blocked against quantity + delivery + Σadj, but racy (§2) | `inventory-adjustments.service.ts:64-96` |
| `ANOMALY` | Never capped (intentional) | `inventory-adjustments.service.ts:60-62` |
| Deleting a `PULL_IN` / editing an adjustment down | Not re-validated against leftover, so `sold` can go negative | `inventory-adjustments.service.ts:220-247` |
| Material consumption by production | **Unchecked.** `used` can exceed stock. Closing is then **clamped to 0** (`metrics.ts:80-85`), so the shortfall disappears instead of showing up | `production.service.ts:103-125` |
| Material `PULL_OUT` | Blocked using the **unclamped** formula (differs from the clamped display when negative) | `material-adjustments.service.ts:26-34` |

### 5. Units

- Conversion lives only on the material side: `RecipeItem.unit` → `Material.unit` via the `UnitConversion` table (`unit-conversion.util.ts:148-186`). Finished goods are whole pieces (`Int`).
- **A missing conversion silently becomes factor 1** (`unit-conversion.util.ts:181-183`, repeated as `?? 1` at `production.service.ts:86,168`, `production-analytics.service.ts:64,161`). A recipe in `G` against a material in `KG` with no G→KG row consumes **1000×**. `DELETE /unit-conversions/:id` hard-deletes both directions (`unit-conversions.service.ts:114-119`), which triggers this with no warning.
- **Rounding:** consumption is never rounded before being added to `used` (Float `increment`, `production.service.ts:114,176`), so binary-float residue builds up on every edit (for example +0.1 then −0.1 doesn't return to exactly 0). Display rounding happens only in analytics (`production-analytics.service.ts:78,80,188-189`). Pack sizes (DOZEN, BAG, SACHET) depend entirely on user-entered factors. There's no validation that a factor is positive or finite: see `unit-conversions.service.ts:96` (`1 / body.factor`).

### 6. Numeric types — every float

**Schema (Postgres `double precision`):**
- `Recipe.recipeYield` Float — `schema.prisma:427`
- `RecipeItem.quantity` Float — `:441`
- `MaterialInventory.quantity`, `.delivery`, `.used` Float — `:473-475`
- `MaterialAdjustment.value` Float — `:516`
- `UnitConversion.factor` Float — `:589`

Money is `Decimal` in the DB (`Product.price :148`, `Material.pricePerUnit :413`, `reorderLevel :414`, both price histories `:554,:568`, `ProductAlias.priceHint :193`). **It is converted to JS `number` before any arithmetic:**
- Revenue: `Number(inv.product.price)` × sold, summed as doubles — `inventory.service.ts:332-337,961-967`; `sales.service.ts:37,50,252`; price history `h.price.toNumber()` — `inventory.service.ts:376`, `sales.service.ts:85`.
- Material cost: `pricePerUnit.toNumber()` — `production-analytics.service.ts:71,79,168`.
- Import catalog: `Number(p.price)`, `Number(r.price)` — `inventory-import.service.ts:282,300,336`.
- Dashboard: `price.toNumber()` — `dashboard.service.ts:191`; `Number(material.reorderLevel)` — `:325`.

**Serialization is inconsistent.** Endpoints that return raw Prisma rows with `product: true` (for example `inventory.service.ts:394-413`, `production.service.ts:494`) serialize `Decimal` as a **JSON string** (`"12.50"`). The dashboard and aggregate endpoints return `number`. `effectivePrice` is a `number`. Clients have to `Number(...)` defensively (`app/(app)/material-inventory/page.tsx:151`).

**Rounding differs by endpoint.** Sales rounds each row to 2 dp and then sums (`sales.service.ts:50,252`). The dashboard sums unrounded doubles and rounds only for CSV (`inventory.service.ts:335-337,1019`). The two can disagree by centavos for the same period.

### 7. Date boundaries — "today" is Manila on the server, and not everywhere else

| Layer | How "today" / the day is resolved | Evidence |
|---|---|---|
| DB | `Inventory.date`, `Production.date`, `ProductionOrder.date`, `MaterialInventory.date` are `@db.Date` (no zone). `ProductPriceHistory.effectiveAt` and `MaterialPriceHistory.effectiveAt` are **timestamps** | `schema.prisma:278,340,372,467,555,569` |
| Server (good) | `toUtcDay` / `localToday` pin `Asia/Manila` | `date-range.util.ts:80-117`, `inventory.service.ts:63-68`, `autofill-on-demand.service.ts:175-179`, `suggestions.service.ts:31-36` |
| Server (**UTC bug**) | Manual `POST /jobs/autofill-material-stock` with no date → `new Date().toISOString().slice(0,10)` (UTC). Range jobs default `endDate` to "yesterday UTC" | `jobs.service.ts:411`, `:336-338`, `:461-463` |
| Server (unnormalized) | `new Date(date)` instead of `toUtcDay` — equivalent for `YYYY-MM-DD`, but `@IsDateString` also accepts datetimes, which then match nothing | `production.service.ts:487,503-504`; `sales.service.ts:94,120,156,188,213`; `production-analytics.service.ts:108,199-200`; `production-orders.service.ts:52,88,250`; `dashboard.service.ts:126` |
| Client | `dayjs().format('YYYY-MM-DD')` = **browser-local** zone (correct only if the device is set to Manila) | `app/(app)/inventory/details/page.tsx:49` and most other pages (dashboard, sales, production, gaps…) |
| Client (**UTC bug**) | Material stock page: `new Date().toISOString().slice(0,10)` → **yesterday's card from 00:00–08:00 Manila** | `app/(app)/material-inventory/page.tsx:38` |
| Price effectivity | A price change stamps `effectiveAt = new Date()` (a mid-day instant). Rows are keyed at `00:00Z`, so **the new price applies from the next day**, not the day it was set | `products.service.ts:130-132`, `price-history.util.ts:133` |

### 8. Soft deletes

- Inventory, InventoryAdjustment, MaterialInventory, MaterialAdjustment, Product, Branch, Material, Recipe, Supplier and ProductionOrder all have `deletedAt`. **`Production` has none** (`schema.prisma:334-357`) and is **hard-deleted** (`production.service.ts:601`).
- **Deleted rows that still count:**
  - Soft-deleted **recipes still drive material consumption and cost.** `recipe.findUnique/findMany({ where: { productId } })` has no `deletedAt` filter: `production.service.ts:151-153,303-306,398-401`; `production-analytics.service.ts:23-30,117-124`. The dashboard recipe KPI counts deleted recipes too (`dashboard.service.ts:146`).
  - Production efficiency reads **soft-deleted inventory rows** (no `deletedAt` in `invWhere`, `production-analytics.service.ts:206-226`).
  - PO placeholder seeding takes the prior leftover from **soft-deleted rows** (`production-orders.service.ts:304-308`).
- **Uniqueness:** the unique keys deliberately exclude `deletedAt`, and re-entry clears the tombstone. That's handled consistently for Inventory and MaterialInventory (`inventory.service.ts:103-126`, `material-inventory.service.ts:47-50`, `production.service.ts:111-114`). **`Recipe.productId @unique`** (`schema.prisma:426`) combined with a soft delete means that once a recipe is deleted, **a new recipe for that product cannot be created**. `create()` checks `deletedAt: null` (`recipes.service.ts:23-25`), then the insert hits P2002.
- Sums and reports otherwise filter `deletedAt: null` correctly (inventory, sales, suggestions, dashboard gaps, material cards).

### 9. Branch isolation — central guard plus per-service checks; mostly sound

- **Central:** `BranchGuard` is controller-local and applied on inventory, production, production-orders, sales and dashboard (`inventory.controller.ts:48`, `production.controller.ts:39`, `production-orders.controller.ts:36`, `sales.controller.ts:20`, `dashboard.controller.ts:18`). It checks path, query and body (arrays included), and pins `req.query` in a way that survives Express 5 (`branch.guard.ts:135-143,173-240`). A real HTTP test covers it (`branch.guard.http.spec.ts`).
- **Repeated per endpoint (missable):** every `:id` handler must remember to pass `parseBranchScope(query.branchId)` into the service. Adjustments and import scope themselves in the service (`inventory-adjustments.service.ts:37-42,105,136,222,296`; `inventory-import.service.ts:678,825,1069`).
- **Missed:** `GET /production/:id/material-consumption` ignores scope (`production.controller.ts:175-184` → `production-analytics.service.ts:14`). A branch-scoped user can read any branch's production record and cost by id. Read-only, low impact.
- **By design, but worth confirming:** a transfer checks only the **source** branch (`inventory-adjustments.service.ts:291-296`), so a scoped manager can post a `PULL_IN` into any other branch's row and raise that branch's computed `sold` and revenue.
- Materials are global on purpose (`schema.prisma:454-458`), so any `material-stock` holder at any branch edits central-kitchen stock.

### 10. Competing formulas — **divergent (HIGH)**

| Metric | Implementation | Formula | Agrees with canonical? |
|---|---|---|---|
| **sold** | `src/lib/inventory/metrics.ts:50-58` (canonical; used by `inventory.service.ts:328,960`, `sales.service.ts:27`, `suggestions.service.ts:70`, the sheet) | `quantity + delivery + Σadj − leftover − reject` | — |
| **sold** | `production-analytics.service.ts:282` (Production Efficiency page) | `Σdelivery − Σleftover − Σreject` | **No.** It ignores opening `quantity` and all adjustments. Any day with opening stock under-reports sold (it can go negative). Transfers are invisible. Deleted rows are included (`:216-226`). `metrics.ts:8-9` claims the two match. **They don't.** |
| **sold on a placeholder with a PO delivery** | cascade `inventory.service.ts:1225` vs `computeSold` | cascade: closing = opening + delivery (0 sold). computeSold: sold = delivery | **No** (see §1) |
| **wastage** | Rejections card `inventory.service.ts:1299-1300` | `reject / delivery` | Differs from the one below |
| **wastage** | Efficiency `production-analytics.service.ts:284-287` | `(leftover + reject) / delivery` | Counts leftover as waste, but leftover **carries forward as the next day's opening stock** (`jobs.service.ts:279`). Different numerator **and** meaning. The UI labels both "waste" (`app/(app)/production-efficiency/page.tsx:83`) |
| **revenue** | `inventory.service.ts:335` (dashboard/summary/CSV) | Σ(sold × effectivePrice), rounded at the end | Rounding differs (§6) |
| **revenue** | `sales.service.ts:50,252` (Sales API) | Σ round2(sold × effectivePrice) | Rounding differs (§6) |
| **material consumed** | Stored `MaterialInventory.used` (incremental, `production.service.ts:114,176`) | Running sum of deltas at the recipe/conversion/price in force **at each edit** | **No.** It diverges on recipe edits, conversion edits, manual `used` overwrites, PO finalization (never incremented), deleted recipes, and partial writes |
| **material consumed** | Recomputed `production-analytics.service.ts:155-184` | Σ over current Production × **current** recipe × **current** conversion | Doesn't equal stored `used` in the cases above. Cost uses **current** `pricePerUnit` for past dates. `MaterialPriceHistory` is written (`materials.service.ts:88`) but never read for costing |
| **material on-hand** | `metrics.ts:80-85` (card carry-over) | `max(0, q + d + Σadj − used)` | — |
| **material on-hand** | `src/lib/materialStock.ts:23-32` (frontend copy) | Same, clamped | Agrees (duplicate code) |
| **material on-hand** | `materials.service.ts:167` (low stock) and `dashboard.service.ts:323` | Same, inlined, clamped | Agrees (duplicate code) |
| **material on-hand** | `material-adjustments.service.ts:27-28` (PULL_OUT cap) | Same, **unclamped** | Differs only when negative |
| **settled days** | `sales.service.ts:51,255-256` | `leftover !== null` | `leftover` is non-nullable `Int @default(0)` (`schema.prisma:276`), so **`unsettledDays` is always 0** |

### 11. Audit trail — **you can't reconstruct how a quantity got there**

- There's no history or event table (not found). Inventory and material cards are overwritten in place and keep only `createdById`, `updatedById` and `updatedAt`. Material cards and Production have **no `updatedById` for most writers**: Production has only `createdById` (`schema.prisma:338`), and production-driven `used` changes aren't attributed at all (`production.service.ts:114,176`).
- **Prior values are not kept anywhere.** Adjustment edits mutate `value` in place (`inventory-adjustments.service.ts:154-163,180-183`). Recipe items are **hard-deleted and re-created** (`recipes.service.ts:134`), so historical consumption can't be re-derived. `Production` is **hard-deleted** (`production.service.ts:601`). `ImportLog` is **hard-deleted** (`inventory-import.service.ts:1090`). Unit conversions are hard-deleted (`unit-conversions.service.ts:114-119`).
- Import overwrite mode replaces a day's manually entered counts with only `updatedById` changing (`inventory-import.service.ts:644-649`).
- What *is* reconstructable: the set of **live** adjustments per row with who/when, the transfer pairing, and `JobRun` records.

---

## Phase 3 — Cross-cutting

**Auth / permissions.** JWT is global (`app.module.ts:74`). `@Public()` appears only on `auth/login`, `/refresh` and `/logout` (`auth.controller.ts:26,45,76`). `GET /api/v1` (`app.controller.ts:8`) requires a JWT. Roles and features are enforced globally (`roles.guard.ts:265-286`, `feature.guard.ts:306-328`). No write endpoint without `@Roles` was found. One gap:
- `POST /production/upsert-bulk` takes a **plain inline-typed array** (`production.controller.ts:67-77`). `ValidationPipe` doesn't validate `Array` metatypes, so `yield` is **unvalidated**: negative, fractional, or ±1e308. A negative yield produces negative material consumption.

**Performance.**
- *Unbounded ranges:*
  - `GET /inventory/date` with no `startDate` returns **the entire Inventory table plus adjustments** (`inventory.service.ts:465-472`). The same applies to `GET /production/date` (`production.service.ts:503-520`).
  - Every `/sales/*` range endpoint has no `assertDateRange` (`sales.service.ts:117-121,152-157,184-189,210-214`).
  - `/production/efficiency` has no cap (`production-analytics.service.ts:198-227`).
- *Sequential round trips inside interactive transactions:* PO finalization runs 2 statements per item (`production-orders.service.ts:188-229`), and `production.create` with a transaction awaits each recipe item (`production.service.ts:190-191`). At the ~300 ms/statement cross-region latency noted in `inventory.service.ts:603-605`, a 20-item PO is about 12 s. That exceeds Prisma's default 5 s interactive-transaction timeout (Prisma default; no `timeout` option set; not verified live).
- *Loops:* the manual `autofill-range` allows up to 365 days of sequential work (`jobs.service.ts:352-387`) inside a 60 s function (`vercel.json`). A kill leaves `JobRun` stuck in `RUNNING`, because the status update never runs.
- *Over-fetch:* `ensureInventoryForDate` pulls full history to find one prior leftover (`production-orders.service.ts:304-312`). Use `DISTINCT ON` like `jobs.service.ts:245-256`.
- *Indexes:* the report queries are well served by `(branchId, productId, date)` unique, `(branchId, date)` and `(productId, date)`. I'd add **`ProductPriceHistory(productId, effectiveAt)`**, which is read on every revenue call (`inventory.service.ts:369-372`, `sales.service.ts:78-81`) and currently has only separate single-column indexes (`schema.prisma:574-575`). Redundant indexes add write cost on the busiest tables: `Inventory [branchId]` and `[productId]` (`:292-293`) are prefixes of existing composites, and the same holds for `Production :351-352`, `RecipeItem [recipeId] :450` and `ProductionOrderItem [productionOrderId] :401`.

**Caching.**
- Versions are per instance (`cache-namespace.service.ts`). A write on instance A doesn't invalidate instance B, so other lambdas can serve data up to 45 s stale. This is documented.
- Invalidation hooks only fire on Inventory, InventoryAdjustment, MaterialInventory, MaterialAdjustment and Production writes (`prisma-cache-invalidation.ts:50-58`). **Revenue (`inventory-agg`) also depends on `Product.price`/`type` and `ProductPriceHistory`, and the gap reports depend on Product/Branch `isActive`/`deletedAt`.** Those writers don't bump, so a price change doesn't show in revenue for up to 45 s. Low impact.
- The version-token design is race-safe: a value computed before a bump is stored under the orphaned key.

**Error handling / partial writes.**
- Two-transaction writes with no rollback link:
  - `inventory.update` then cascade (`inventory.service.ts:552` / `:573`)
  - `updateBulk` (`:666` / `:787`)
  - production bulk (`production.service.ts:267` / `:326`, `:365` / `:424`). A failure in the second transaction leaves `used` permanently out of sync.
  - Import: one transaction per sheet (`inventory-import.service.ts:973`, `:660`). A 60 s timeout mid-file leaves some days imported and **no `ImportLog`**.
- Swallowed errors:
  - `production.update` maps **every** error to 404 (`production.service.ts:590-592`). The material-inventory service fixed the same pattern (`material-inventory.service.ts:259-265`).
  - `ImportLog` create failure is logged and swallowed (`inventory-import.service.ts:1042-1046`).
  - Autofill swallows failures by design (`autofill-on-demand.service.ts:100-105`).

**Tests** (read, not run).
- 57 spec files. The server suites mock Prisma. Only `branch.guard.http.spec.ts` goes through real HTTP, and **none uses a real database**, so transaction, locking and constraint behaviour is untestable as written.
- Invariants with **no test found:**
  - concurrency of any kind
  - adjustment double-submit
  - PO finalization (no `FINALIZED` in any spec)
  - price-history fallback (no spec references `getEffectivePrice` or `priceHistory`)
  - production-efficiency formula (only in the RBAC matrix)
  - soft-deleted recipe consumption
  - the unit-conversion fallback to 1
  - material carry-forward after a past edit
  - production re-key on update
  - the create path bypassing `assertRowIsPossible`
- `metrics.ts` has a spec (`inventory-metrics.util.spec.ts`).

**Dependencies / CI.**
- `npm audit`: 0 vulnerabilities (lockfile, after `ab8d64b`).
- Major versions behind: `@nestjs/*` 11 → 12, `@prisma/client` 6 → 7 (`npm outdated`).
- **No CI (not found)**, so none of the above failures would be caught before deploy, and the existing tests don't run automatically.

**Docs vs code (code wins):**
- `README.md:27,37,280` says to set `NEXT_PUBLIC_API_URL`. `AGENTS.md` says leave it unset.
- `jobs.service.ts:405-406` says "Scheduled by Vercel Cron at 11 PM". There are no crons (`vercel.json`, `docs/DEPLOYMENT.md:60`).
- Schema comments still say "daily CRON job" (`schema.prisma:280,342`).
- `Inventory.quantity` is commented "total pieces produced / available" (`:274`) but is used as the opening balance.
- `AGENTS.md:15-17` lists `../louella_mobile/` and `../louella-be/`. **Neither exists in the parent directory.**
- `AGENTS.md` says "no record in any operational table should ever be hard-deleted". Production, ImportLog, RecipeItem and UnitConversion are hard-deleted.
- `AGENTS.md` says "Inventory is never set directly". `PATCH /inventory/:id` sets every count directly.
- `metrics.ts:8-9` claims parity with the efficiency report.

---

## Phase 4 — Report

### What's working well

1. **Branch isolation is careful and tested.** `BranchGuard` rejects mismatches in path, query and body (arrays too), stamps missing values, and pins `req.query` so the pin survives Express 5's re-parsing getter (`branch.guard.ts:135-143,173-240`). A real HTTP test covers it (`branch.guard.http.spec.ts`). The routes the guard can't reach (id-addressed adjustments; multipart import) check in the service against the same rule (`common/utils/branch-access.ts`). A scoped user without a branch is **denied**, not left unscoped (`branch.guard.ts:163-167`).
2. **Server-side "today" is correct.** `toUtcDay` and `localToday` resolve Manila explicitly and the day columns are `@db.Date` (`date-range.util.ts:103-117`, `schema.prisma:278,467`). The autofill, suggestions and summary paths all use it.
3. **One canonical `sold`/`adjSum` shared by the API and the sheet** (`src/lib/inventory/metrics.ts`, re-exported at `inventory-metrics.util.ts:10-18`). That removed a real drift.
4. **The soft-delete versus unique-key trap is handled deliberately.** Every upsert on the unique triple clears `deletedAt` (`inventory.service.ts:125,166`, `material-inventory.service.ts:50,81`, `production.service.ts:114,176`, `inventory-import.service.ts:647`), and reads filter consistently.
5. **Transfers are atomic and stay paired.** Both legs are created in one interactive transaction (`inventory-adjustments.service.ts:301-326`). Delete removes both (`:229-240`). A value edit mirrors to the counterpart and freezes the type (`:143-165`).
6. **The bulk sheet save validates everything before writing anything** and fails closed on rows outside the caller's branch (`inventory.service.ts:641-664`).
7. **Cache invalidation is centralized** in a Prisma extension, so no writer can forget it, and the version-token scheme is race-safe (`prisma-cache-invalidation.ts:31-59`).
8. **Autofill is race-safe and bounded.** It uses `createMany … skipDuplicates`, an in-flight dedup, a 7-day cap, and a `DISTINCT ON` prior-leftover lookup (`jobs.service.ts:184-198,245-256`, `autofill-on-demand.service.ts:59,67-77`).
9. **The client doesn't auto-retry writes** (`Providers.tsx:36-38`), which avoids most accidental double-posting of non-idempotent adjustments.
10. **Input bounds:** `MAX_UNITS`, page-size clamps and notes limits on most DTOs (`common/constants/inventory.constants.ts`). Money is `Decimal` at rest.
11. **Import safety:** the hash dedup doesn't burn the hash on zero-row runs (`inventory-import.service.ts:1009-1023`), ambiguity blocks the import server-side (`:999-1007`), and unknown labels must be explicitly resolved (`:869-898`).

### Findings

Severity = blast radius on real stock or money data.

| ID | Sev | Area | What breaks in business terms | Evidence | Fix sketch | Effort |
|---|---|---|---|---|---|---|
| F01 | **HIGH** | PO finalization | Finalizing a production order (1) **overwrites** the kitchen's yield and the branch's delivery instead of adding to them, so with two orders for the same product and day the last one wins; (2) **never consumes materials**, so flour stock stays high; (3) puts delivery on an auto placeholder, so **the whole delivery is reported as sold** until someone counts; (4) doesn't cascade to the next day | `production-orders.service.ts:188-229` (`update: { yield }` at 197, `update: { delivery }` at 216); no `updateMaterialUsed` call; `inventory.service.ts:1225` vs `metrics.ts:50` | Route finalization through `ProductionService` (delta-based, consumes materials) and add deliveries with `increment`; mark rows manual or run the cascade; decide single versus summed orders | M |
| F02 | **HIGH** | Materials ledger | Material opening stock is a one-time snapshot. Any later edit to a past day (production yield, delivery, spoilage, `used`) **never reaches later days**, so every subsequent balance, low-stock alert and reorder is wrong and the error compounds | `material-inventory.service.ts:181-191,437-448`; no material cascade found; `production.service.ts:559-593` changes past `used` | Add a material forward-cascade (the same shape as `buildCarryForward`) triggered by any write to a past card, **or** stop storing opening stock and derive it | M |
| F03 | **HIGH** | Unit conversion | A missing or deleted unit conversion silently uses factor 1. A recipe in grams against a kilogram material **consumes 1000× the flour** and costs 1000× | `unit-conversion.util.ts:181-183`; `production.service.ts:86,168`; `production-analytics.service.ts:64,161`; `unit-conversions.service.ts:114-119` | Throw (or refuse to save the recipe) when a conversion is missing; block deleting a conversion referenced by a recipe item | S |
| F04 | **HIGH** | Recipes / soft delete | A **deleted recipe keeps consuming materials** on every production save and still appears in costing. The product can then **never get a new recipe** (unique `productId`) | `production.service.ts:151-153,303-306,398-401`; `production-analytics.service.ts:23-30,117-124`; `schema.prisma:426`; `recipes.service.ts:23-25,154` | Filter `deletedAt: null` in all five lookups; make uniqueness partial (`WHERE "deletedAt" IS NULL`), or revive on create | S |
| F05 | **HIGH** | Revenue / price history | Products created via the API get no price-history row. On the first price change, **all past revenue is recomputed at the new price** (fallback = current price). The same-day change takes effect only from tomorrow | `products.service.ts:20-33,111-133`; `price-history.util.ts:124-140` | Write an opening `ProductPriceHistory` row on create (effective from `Product.date`); backfill products without one; normalize `effectiveAt` to the Manila day | S |
| F06 | **HIGH** | Competing formulas | The Production Efficiency "sold" ignores opening stock and transfers, and its "waste" counts carried-forward leftover as waste. It disagrees with Sales and Dashboard for the same days, and it reads **deleted** rows | `production-analytics.service.ts:206-226,282-287`; `metrics.ts:8-9,50-58`; `inventory.service.ts:1299-1300` | Use `computeSold` with adjustments; define one wastage metric (reject, plus unsellable leftover if that's the business rule); filter `deletedAt` | S |
| F07 | **HIGH** | Finished-goods chain | Opening stock (`quantity`) is a stored copy of yesterday's leftover. POST entry, bulk create, XLSX import, PO finalization and any adjustment **don't cascade**, so the next placeholder days keep the stale opening and **sold/revenue is misstated**. Nothing reports where `quantity[d] ≠ leftover[d-1]` | `inventory.service.ts:102-183,571-579,1224`; `inventory-import.service.ts:623-662`; `production-orders.service.ts:208-227`; `inventory-adjustments.service.ts:98-329` | Run the same `cascadeMany` from every writer (one shared "after write" hook); add a chain-break report/endpoint | M |
| F08 | **HIGH** | Date boundary | The material stock page defaults to **yesterday's card from 00:00–08:00 Manila**, which is exactly the early baking shift. Deliveries entered then land on yesterday, and because of F02 they never reach today's opening | `app/(app)/material-inventory/page.tsx:38`; also `jobs.service.ts:411,336-338,461-463` | Use a shared `manilaToday()` on the client and server; default the job dates the same way | S |
| F09 | **HIGH** | Production integrity | Changing a production record's product or date doesn't reverse consumption on the old product/day. Unvalidated `upsert-bulk` accepts negative or fractional yields, so negative consumption is possible. **Every** update error becomes 404 | `production.service.ts:565-587,590-592`; `production.controller.ts:64-78` | Reverse the old key, then apply the new one in one transaction; give `upsert-bulk` a DTO with `ParseArrayPipe`; drop the catch-all | S |
| F10 | MED | Concurrency | Two people deducting the last unit both succeed, giving **negative stock**. Two simultaneous production saves **double-count material usage**. Concurrent sheet edits silently overwrite each other | `inventory-adjustments.service.ts:64-113,298-326`; `material-adjustments.service.ts:15-44`; `production.service.ts:203-243,255-291` | Move check-and-insert into one interactive transaction with `SELECT … FOR UPDATE` on the Inventory/MaterialInventory row; read `oldYield` inside the transaction with a lock; add an `updatedAt`/`version` precondition on sheet edits | M |
| F11 | MED | Idempotency | A double-click or network resend of an adjustment/transfer **deducts twice** (Flutter retry behaviour unknown) | `inventory-adjustments.service.ts:111,301`; `material-adjustments.service.ts:36`; no idempotency key found | `Idempotency-Key` header stored in a unique table, or a client-generated UUID column with a unique index | S |
| F12 | MED | Partial writes | A failed second step leaves production yield saved but materials unconsumed, or a leftover saved but not cascaded, with no reconciliation. A timed-out import leaves some days written and no log | `production.service.ts:267/326, 365/424`; `inventory.service.ts:552/573, 666/787`; `inventory-import.service.ts:973,1025-1046` | Put each logical write in a single transaction; whole-file import in one transaction (or resumable, with a log per sheet) | M |
| F13 | MED | Audit trail | You can't answer "who changed this count from what". Production, ImportLog, RecipeItem and UnitConversion are **hard-deleted**, against the stated rule | `production.service.ts:601`; `inventory-import.service.ts:1090`; `recipes.service.ts:134`; `unit-conversions.service.ts:114-119`; `schema.prisma:266-299` (no history) | Append-only `InventoryChange` (row, field, old, new, user, at) written in the same transaction; soft-delete Production (add `deletedAt`, `updatedById`) and ImportLog; version recipes | M |
| F14 | MED | Negative stock | Creating inventory through `POST /inventory` or `/inventory/bulk` skips the "leftover ≤ on-hand" check, so **negative sold and revenue** can reach reports. Material consumption is never capped, and the clamp to 0 hides the shortfall | `inventory.service.ts:102-183`; `metrics.ts:80-85`; `production.service.ts:103-125` | Call `assertRowIsPossible` on create; surface negative material balances instead of clamping | S |
| F15 | MED | Autofill | Any row dated in the future (a pre-entered delivery, or a manual `POST /jobs/autofill` for tomorrow) makes the system think today is filled, so **no placeholders or carry-forward for today** | `autofill-on-demand.service.ts:85-91,109-123` | Check "rows exist for *today*" (`where: { date: today }`), not max(date) | S |
| F16 | MED | Performance | `GET /inventory/date` or `/production/date` with no `startDate` returns the whole table. Sales and efficiency ranges are uncapped, which risks timeouts and DB load | `inventory.service.ts:465-472`; `production.service.ts:503-520`; `sales.service.ts:117-214`; `production-analytics.service.ts:198-227` | Require `startDate`; apply `assertDateRange` everywhere | S |
| F17 | MED | Timeouts | PO finalization and production create run N sequential statements in an interactive transaction. At about 300 ms per statement, a normal-sized order likely exceeds Prisma's 5 s default and **fails to finalize**. A 365-day backfill exceeds 60 s and leaves `JobRun` stuck in `RUNNING` | `production-orders.service.ts:143-175,188-229`; `production.service.ts:190-191`; `jobs.service.ts:352-387`; `vercel.json` | Batch with `createMany`/`updateMany` or raw `INSERT … ON CONFLICT … SET x = x + EXCLUDED.x`; cap manual ranges to what fits in 60 s | M |
| F18 | MED | Tests / CI | No CI, and the server tests are all mocked-Prisma. None of F01–F12 would be caught | `.github/` not found; spec inventory above | GitHub Action: `lint`, `tsc`, `test`, plus a Postgres service for transaction/constraint tests | M |
| F19 | LOW | Money precision | Revenue is summed in JS doubles. The Sales page and the Dashboard/CSV round differently and can disagree by centavos. Decimal comes back as a string on some endpoints and a number on others | `sales.service.ts:50,252`; `inventory.service.ts:335-337,1019`; `inventory.service.ts:394-413` | Do money maths in integer centavos (or `Prisma.Decimal`); round once; serialize consistently | S |
| F20 | LOW | Float quantities | Material quantities, `used`, factors and recipe yields are `double`; repeated `increment` of float deltas drifts | `schema.prisma:427,441,473-475,516,589`; `production.service.ts:114,176` | `Decimal(12,4)` columns; round deltas to 4 dp before increment | M |
| F21 | LOW | Sales API | `unsettledDays` is always 0 because `leftover` can't be null, so "settled" status is meaningless | `sales.service.ts:51,255-256`; `schema.prisma:276` | Base it on `isAutoGenerated` (a placeholder means not counted) | S |
| F22 | LOW | Caching | Price and product changes don't invalidate cached revenue or gap reports (≤45 s stale, per instance) | `prisma-cache-invalidation.ts:50-58` | Hook `product`, `productPriceHistory` and `branch` into `inventory-agg` | S |
| F23 | LOW | Branch scope | `GET /production/:id/material-consumption` ignores branch scope | `production.controller.ts:175-184` | Pass `parseBranchScope` and filter | S |
| F24 | LOW | Soft deletes | PO placeholder seeding uses a deleted row's leftover and fetches full history. The dashboard counts deleted recipes | `production-orders.service.ts:304-312`; `dashboard.service.ts:146` | Add `deletedAt: null`; use `DISTINCT ON` | S |
| F25 | LOW | PO update | Changing the branch and finalizing in one request delivers to the **old** branch | `production-orders.service.ts:147,166-171` | Use `order.branchId` after the update | S |
| F26 | LOW | Indexes | The hot price-history read lacks a composite index; several redundant single-column indexes slow writes on the busiest tables | `schema.prisma:292-293,351-352,401,450,574-575` | Add `@@index([productId, effectiveAt])` on ProductPriceHistory; drop the prefix-redundant indexes | S |
| F27 | LOW | Docs | Several docs contradict the code, and a new dev following them would misconfigure the app | `README.md:27,37,280`; `jobs.service.ts:405-406`; `schema.prisma:274,280,342`; `AGENTS.md:15-17,160`; `metrics.ts:8-9` | Update README/AGENTS/comments; restore or remove the `PROJECT_SPEC.md` reference | S |

### Top 5, ranked

1. **F03 (unit-conversion fallback to 1) and F04 (deleted recipes still consume).** They're small changes (S), and they currently **inflate central-kitchen material usage every day**, possibly by 1000×. Every material figure downstream (F02's chain, low-stock, cost) is built on `used`. Fix the input before fixing the ledger.
2. **F01 (PO finalization).** It's the workflow that replaced the printed sheets. It overwrites yield and delivery, skips material consumption, and books unsold deliveries as sales. It touches kitchen output, branch stock and revenue in one action, and it has no test.
3. **F02 + F08 (material chain never re-cascades, and the material page defaults to yesterday during the baking shift).** Together they mean a delivery entered at 06:00 goes onto yesterday's card and never reaches today's opening balance. The error is permanent and compounding. F08 is a one-liner, so ship it immediately and then build the cascade.
4. **F07 + F05 (finished-goods opening drift, and retroactive repricing).** Both corrupt the **revenue** numbers the business reads: F07 through missing cascades on four write paths, F05 by repricing every sale before a product's first price change. F05 also needs a one-off backfill, so do it before more products are created through the API.
5. **F10 + F11 + F12 (concurrency, idempotency, partial writes).** Lower frequency for a small team, but these are the failures that silently create negative stock or double consumption, and the current tests can't detect them. Fix them together by consolidating each write into one locked transaction. Do F18 (CI plus a DB-backed test) alongside so the fixes stay fixed.

F06 (efficiency formula) is HIGH and small, but it misleads a report rather than corrupting stored data, so it ranks just below these.

### Open questions for you

1. **Multiple production orders for the same product and day:** should finalization **sum** them into Production and Inventory, or is one order per branch/day the rule? That decides F01's fix.
2. **Is leftover waste?** Does unsold bread carry forward and get sold the next day (as `jobs.service.ts:279` assumes), or is it discarded or sold as day-old? That decides the one true wastage formula (F06).
3. **Is a manual row's opening stock authoritative?** The cascade stops at manual rows. When yesterday's leftover changes, should a manual today's `quantity` follow it, or only be flagged? (F07)
4. **The Flutter app:** which endpoints does it write through (POST `/inventory` versus PATCH), and does it retry on timeouts? That sets the priority of F11/F14. `../louella_mobile/` isn't present next to this repo, so I couldn't check.
5. **Where is the Supabase database region?** `vercel.json` pins `hnd1` (Tokyo). The ~300 ms per statement noted in code suggests a far-away DB, which makes F17's transaction timeouts likely rather than theoretical.
6. **Transfers into another branch:** is it intended that a branch-scoped manager can post a `PULL_IN` into any other branch (source-only scoping, `inventory-adjustments.service.ts:291-296`)?
7. **The `upsert-bulk` production endpoint:** is it still used by the UI? If not, remove it rather than validating it (F09).
8. **Existing data:** do you want me to write read-only diagnostic SQL to size the damage? For example: rows where `quantity[d] ≠ leftover[d-1]`; products without a price-history row; production on products whose recipe is soft-deleted; recipe items whose unit pair has no conversion; material cards whose opening doesn't match the previous closing.
9. **`PROJECT_SPEC.md`:** where does it live now? `AGENTS.md:160` cites it for the domain rules, and it isn't in this repo.
10. **Material costing:** should past-date cost use `MaterialPriceHistory` (it's recorded but never read), or is current-price costing intended?

---

## Decisions (answered 2026-09-19)

| # | Question | Decision | Effect on findings |
|---|---|---|---|
| 1 | Several production orders for the same product and day | **Sum them.** Kitchen yield = total of all finalized orders; each branch's delivery = its own order's quantity | F01 fix: finalization adds to Production yield and Inventory delivery (increment), and goes through `ProductionService` so materials are consumed |
| 2 | Is unsold leftover waste? | **No. It carries forward and is sellable.** Waste = rejects only | F06 fix: efficiency uses `computeSold`; waste rate = reject ÷ units available; the "leftover" slice is no longer called waste |
| 3 | Is a hand-entered opening stock authoritative? | **No. Opening always follows yesterday's leftover.** A corrected leftover updates the next day's opening even on hand-entered rows; typed delivery, leftover and reject stay untouched | F07 fix: the cascade no longer stops at manual rows. It updates `quantity` on every following day but walks leftover forward only through placeholders. **Follow-up:** the XLSX import currently takes opening from the sheet's "Yesterday LO", so it must switch to the previous day's leftover (or surface the difference) |
| 4 | Flutter app | **Dropped.** Mobile is served by the responsive web app | The only client is the web app, which never retries writes (`Providers.tsx:36-38`). F11 and F14 stay MED; still fix server-side. Remove the Flutter lines from `AGENTS.md` (F27) |
| 5 | Database region | **Asia** (same area as `hnd1`) | F17 → LOW. The "~300 ms per statement" comment (`inventory.service.ts:603-605`) is likely stale. Still batch the per-item statements |
| 6 | Transfers into another branch | **The receiver must confirm.** Stock leaves the sender **on send**. The receiver's PULL_IN counts only **on accept**. Unanswered transfers **stay pending and are flagged** on both branches until accepted or rejected; a rejection reverses the sender's PULL_OUT | New work: a transfer status (`PENDING`/`ACCEPTED`/`REJECTED`), receiver-side accept/reject endpoints scoped to the destination branch, and pending counts on the sheets and dashboard. `computeAdjSum` must ignore a pending PULL_IN |
| 7 | Is `upsert-bulk` still used? | **Yes.** The production sheet saves through it (`useProductionMutations.ts:69`) | F09: keep the endpoint and add a DTO + `ParseArrayPipe` (integer yield ≥ 0, ≤ `MAX_UNITS`) |
| 8 | Size the existing damage? | **Yes.** See `audit-diagnostics.sql` (14 SELECT-only queries, one per finding) | Run each query on its own in the Supabase SQL editor |
| 9 | `PROJECT_SPEC.md` | **Lost/outdated.** Drop the reference | `AGENTS.md` plus these decisions are the spec. Remove the POS and returns rules from `AGENTS.md`, since neither exists in the schema |
| 10 | Cost of a past day | **Use that day's material prices *and* that day's recipe** | Read `MaterialPriceHistory` by date (normalize `effectiveAt` to the Manila day, as in F05). New work: **recipe versioning** (a recipe edit writes a new version instead of hard-deleting items, `recipes.service.ts:134`). Days before versioning starts can only be costed with the recipe at the moment versioning launches |

---

## Diagnostics run (2026-09-19)

I ran `audit-diagnostics.sql` against the database in `.env` (`aws-1-ap-northeast-1`, session pooler). Each query ran in a `READ ONLY` transaction that was rolled back.

**What the database holds.** It is small: 1 branch, 171 products, 31 materials, **0 recipes**, **0 production orders**, **0 production rows with yield > 0**, **0 import logs**. There are 1,690 inventory rows covering 2026-08-31 to 2026-09-09, and only 161 of them were entered by hand (all on 2026-09-04). There are 248 material cards covering 2026-08-28 to 2026-09-04, and 2 inventory adjustments. This looks like a test or seed database, not live trading data.

| Query | Result | Reading |
|---|---|---|
| Q1/Q1b chain breaks (F07) | 0 | The chain is intact, but nearly every row is a placeholder, so there was little to break |
| Q2 negative sold (F14) | 0 | — |
| Q3 placeholders with delivery (F01) | 0 | There are no production orders, so nothing to find |
| Q4/Q4b repricing (F05) | 0 / 0 | All 171 products have price history seeded from 2025-12-31, so the risk only applies to products created from now on |
| Q5/Q6 conversion / deleted recipe (F03/F04) | 0 | There are no recipes |
| Q7 stored vs expected `used` | 186 | Every card has `used` > 0 but there are no recipes or production, so all of it was typed or seeded directly (for example Condensed Milk used 3800, 3801, 3802…). This is the manual-overwrite path in F02, not a production bug |
| **Q8 material opening ≠ previous closing (F02)** | **7** | **This is real damage.** For example All-Purpose Flour opened 2026-09-03 at 60.5 kg against a previous closing of 57.5 kg (+3.0). Cheese Powder opened 2026-09-02 at 177.5 g against 227.5 g (−50). Earlier cards were edited after the next day's card had been created, and nothing carried the change forward |
| Q9 negative material (F14) | 0 | — |
| Q10 double submits (F11) | 0 | — |
| Q11 transfer legs out of sync | 0 | — |
| Q12 PO overwrite (F01) | 0 | There are no orders |
| Q13 future-dated rows (F15) | 0 | — |
| Q14 material deliveries on the wrong day (F08) | 0 | — |

**Conclusion.** Apart from F02 (7 material cards), these findings are **risks in the code, not damage already in the data**. The riskiest paths (production, recipes, orders, import) have never been used on this database. That makes now the cheapest time to fix them, and only a small repair is needed afterwards (re-cascading the material cards after the F02 fix).

---

## Fix status (2026-09-19)

| Step | Commit | Findings addressed |
|---|---|---|
| 1 | `f716e1a` | F03 (unit conversion refuses instead of ×1), F04 (deleted recipes stop consuming; recipes can be re-created), F05 (opening price rows; earliest price before history), F06 (efficiency uses the shared sold formula; waste = rejects), F08 (Manila date on the material page and jobs), F09 partly (upsert-bulk validated) |
| 2 | `02854ed` | F01 (production-order finalization adds yield and deliveries, consumes materials, claims the transition atomically), F24, F25 |
| 3 | `2d69fd6` | F02 and F07 (opening stock follows the previous close from every writer, materials included), F14 partly (POST /inventory validated), the double-counted range leftover; the test database's 7 broken material cards repaired (21 rewritten) |
| 4 | `0fa925c` | F10 (advisory chain locks; checks under lock; verified 5/5 on the test database), F12 for production (single transaction), the rest of F09 (re-keying moves consumption; no catch-all 404) |
| 5a | `d34d276` | Transfers need the receiver to accept (decision 6) |
| 5b | `54baade` | Past-day consumption and cost use that day's recipe version and prices (decision 10); F26 indexes; material unit changes refused once used |
| A | `c5f73ef` | F18 (CI), F16 (sales ranges capped at 90 days; `/inventory/date` and `/production/date` default to today), F22 (cache invalidation), F23 (branch-scoped material consumption), F27 (README) |
| B | `398701b` | F11 (idempotency keys on adjustments, transfers, accept/reject and new production orders) |
| C | `fffda51` | F13 (AuditEvent change history; Production and ImportLog soft-deleted) |
| D | `570fcca` | F19/F20 (material and recipe quantities `numeric(14,4)`, factors `numeric(18,9)`, money summed in centavos, every Decimal serialised as a number) |

**Still open**
- F17: PO finalization, production saves and long manual backfills still run many sequential statements in one interactive transaction, so a large order can hit Prisma's 5 s transaction timeout. Not measured against the test database yet.
- **Deploying:** run `npm run prisma:deploy`, then `npx tsx scripts/repair-stock-chains.ts` (dry run), then add `--apply` against production. The exact-decimals migration rounds existing doubles to 4 dp, so run the repair after it.

