# End-to-end test suite (Playwright) — design

Date: 2026-09-29
Status: draft, awaiting review

## 1. Purpose

Replace the one-off QA audit harness in `e2e/` with a regression suite that:

- **gates CI** with a small, fast `@smoke` set on every push and PR, and
- gives a **fuller local suite** (tablet WebKit project, `@stress` repeat runs)
  that is run on demand before risky changes.

It asserts business outcomes — sold is derived, opening follows yesterday's
close, verified days lock, finalized cutoffs lock — not merely that pages load.

It **never touches production.** Local `.env` points at the production Supabase
project; the suite uses its own throwaway Postgres and refuses to run otherwise.

Execution of the implementation plan is intended for Sonnet 5.5; this document
is written to be followed without re-deriving decisions.

### Decisions already made

| Decision | Choice |
|---|---|
| Role of the suite | Both: `@smoke` gates CI, full suite runs locally |
| Database | Docker `postgres:16`, local port 54329, database `louella_e2e`, tmpfs (throwaway) |
| Server | Production build (`next build && next start -p 4100`) started by Playwright |
| Test data | Per-test isolated "world" created through the API; minimal base seed only |
| Time | No clock override. Dates are relative to Manila today; payroll uses the previous (ended) cutoff |
| v1 flows | Auth, inventory sheet, production orders, branch cash, payroll + route sweep |
| Later flows | Everything else, listed in the coverage matrix (§8) |
| Keeping it current | A project skill + an AGENTS.md rule require an e2e test with every user-facing change (§10) |

## 2. What exists today and what happens to it

`playwright.config.ts` and `e2e/` hold a QA audit harness (9 specs, ~540
lines). It logs findings with `console.log` rather than asserting, targets the
running dev server on :4000 — **the production database** — and
`06-flows.spec.ts` creates `QA-AUDIT-*` products there. `@playwright/test`
1.62 is already a devDependency; `.gitignore` already ignores `/e2e-results/`,
`/e2e/.auth/`, `/playwright-report/`.

| File | Fate | Reason / what is kept |
|---|---|---|
| `e2e/01-route-sweep.spec.ts` | Replaced by `e2e/smoke/route-sweep.spec.ts` | Idea kept, now asserts |
| `e2e/03-refresh-throttle.spec.ts` | Deleted | Refresh behaviour covered by `auth.spec.ts`; throttle is a unit concern |
| `e2e/04-states-responsive.spec.ts` | Deleted | Superseded by the `tablet-webkit` project |
| `e2e/05-error-timing.spec.ts` | Deleted | Error boundary covered by the route sweep |
| `e2e/06-flows.spec.ts` | Deleted | Wrote to production; flows re-specified below |
| `e2e/08-verify-fixes.spec.ts` | Deleted | One-off verification |
| `e2e/09-reload-probe.spec.ts` | Deleted | Reload-keeps-session is in `auth.spec.ts` |
| `e2e/11-retry-count.spec.ts` | Deleted | One-off probe |
| `e2e/12-session-migration.spec.ts` | Deleted | One-off migration probe (`has_session` flag) |
| `e2e/auth.setup.ts` | Deleted | Shared storage states cannot work (refresh-token rotation, §4.3); sign-in is per test |
| `e2e/routes.ts` | Rewritten | Adds every missing route (§8); drops hardcoded credentials |
| `playwright.config.ts` | Rewritten | §4 |

## 3. Safety: the suite cannot reach production

1. **`e2e/global-setup.ts` guard, first statement.** Parse `DATABASE_URL` and
   `DIRECT_URL`; abort with a clear error unless both have host `localhost` or
   `127.0.0.1` **and** database name `louella_e2e`. Nothing (no reset, no
   migrate, no build) runs before this check.
2. **Nothing may fall through from `.env` / `.env.local`.** `playwright.config.ts`
   loads `.env.e2e` explicitly and passes it to `webServer.env`. Next.js still
   loads `.env*` files itself, and it fills in **any variable not already set**
   in the process environment — so a key missing from `.env.e2e` (e.g.
   `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT`) would silently pick
   up the production value. Therefore `.env.e2e` lists **every key in
   `.env.example` and `.env.local`**, set to an empty string where unused
   (an empty value counts as set, so Next does not replace it).
   `global-setup.ts` asserts that every key of `.env.example` is present in
   `.env.e2e` and fails naming the missing key.
3. **`E2E_RELAX_THROTTLE` is refused outside a local database.**
   `src/server/common/config/env.validation.ts` throws at boot if
   `E2E_RELAX_THROTTLE` is set and `DATABASE_URL`'s host is not
   `localhost`/`127.0.0.1`. A unit test in `env.validation.spec.ts` pins it.
4. `.env.e2e` is committed and contains only fake secrets (≥ 16 chars, not in
   the forbidden list).

## 4. Runtime and configuration

### 4.1 Database

`docker-compose.e2e.yml`:

```yaml
services:
  db:
    image: postgres:16
    ports: ["54329:5432"]
    environment:
      POSTGRES_USER: louella
      POSTGRES_PASSWORD: louella
      POSTGRES_DB: louella_e2e
    tmpfs: ["/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U louella -d louella_e2e"]
      interval: 2s
      retries: 30
```

`.env.e2e` (committed):

```
DATABASE_URL=postgresql://louella:louella@localhost:54329/louella_e2e
DIRECT_URL=postgresql://louella:louella@localhost:54329/louella_e2e
JWT_ACCESS_SECRET=e2e-access-secret-0123456789
JWT_REFRESH_SECRET=e2e-refresh-secret-0123456789
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=
PRODUCTION_BRANCH_ID=1
CACHE_ENABLED=false
E2E_RELAX_THROTTLE=1
E2E_ADMIN_PASSWORD=E2e-Admin-Pass-1
E2E_MANAGER_PASSWORD=E2e-Manager-Pass-1
NEXT_TELEMETRY_DISABLED=1
TZ=
ALLOWED_ORIGINS=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
FIREBASE_SERVICE_ACCOUNT=
VERCEL_OIDC_TOKEN=
```

`CACHE_ENABLED=false` removes the 45 s per-instance cache as a source of stale
reads between a write and the next assertion. Storage, S3, Firebase and the
Vercel token are blanked on purpose (§3.2) — uploads and push are out of v1.
`TZ` is blank to match Vercel, which runs in UTC; this keeps the
"never rely on the process zone" rule tested.

**`NEXT_PUBLIC_API_URL` is deliberately absent — not blank.** It is inlined at
build time and `src/lib/api.ts` does `NEXT_PUBLIC_API_URL ?? '/api/v1'`, so a
blank value is *not* unset: the browser would post to `/auth/login` and every
UI login would fail. It is not a fall-through risk to omit (no env file sets it),
and `assertNoApiUrlOverride()` in `playwright.config.ts` fails the run if the key
appears in `.env`, `.env.local`, `.env.production(.local)` or `.env.e2e`.

`PRODUCTION_BRANCH_ID=1` names the base-seed kitchen branch (§5.1).

### 4.2 `e2e/global-setup.ts`

In order:

1. Safety guard (§3.1).
2. Reset: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` via Prisma
   `$executeRawUnsafe` (tmpfs already gives a clean DB per container start;
   this makes re-runs against a running container clean too).
3. `npx prisma migrate deploy` with the `.env.e2e` environment.
4. Base seed (`e2e/seed/base.ts`, §5.1).

### 4.3 `playwright.config.ts`

- `testDir: './e2e'`, `globalSetup: './e2e/global-setup.ts'`.
- `fullyParallel: true`; `workers`: 4 locally, 2 on CI.
- `retries`: 1 on CI, 0 locally. Flaky results are reported, not hidden.
- `reporter`: `line` locally; `[['line'], ['html', { open: 'never' }]]` on CI.
- `use`: `baseURL: 'http://localhost:4100'`, `trace: 'retain-on-failure'`,
  `screenshot: 'only-on-failure'`, `timezoneId: 'Asia/Manila'`.
- `webServer`: `command: 'npm run build && npx next start -p 4100'`,
  `url: 'http://localhost:4100/login'` (the API root is behind the JWT guard,
  so it is not a readiness probe), `env` = parsed `.env.e2e`,
  `reuseExistingServer: !process.env.CI`, `timeout: 300_000`.
- Projects: `desktop-chromium` (`devices['Desktop Chrome']`) and
  `tablet-webkit` (`devices['iPad (gen 7) landscape']`, excluded from CI).
  **There is no `setup` project and no `storageState` file.** Refresh tokens
  rotate on every page load and the predecessor lives only 60 s
  (`auth.service.ts`), so a token file shared by parallel, minutes-long tests
  dies mid-run. `fixtures/test.ts` instead overrides `context` to sign in as
  admin per test (option `asAdmin`, default true; `test.use({ asAdmin: false })`
  for tests that start signed out), and `managerPage()` does the same for a
  world's manager.
- Build note (Windows): `npm run build` runs `prisma generate`, which fails
  with `EPERM` while a dev server holds the engine DLL. Stop the dev server, or
  start the e2e server yourself and rely on `reuseExistingServer`. Document in
  `e2e/README.md`.

### 4.4 The throttle change (only production-code change besides test ids)

`app.module.ts` — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])`
becomes a limit read from the environment: 20 by default, 10 000 when
`E2E_RELAX_THROTTLE=1`. The `@Throttle` overrides on `auth.controller.ts`
(login 5/min, refresh 60/min) are raised by the same flag. Implement through
the throttler's `limit` option accepting a function or a value computed once
at module load; keep defaults byte-for-byte identical when the flag is unset.

### 4.5 npm scripts

| Script | Command |
|---|---|
| `e2e:db` | `docker compose -f docker-compose.e2e.yml up -d --wait` |
| `e2e:db:down` | `docker compose -f docker-compose.e2e.yml down` |
| `e2e` | `playwright test` |
| `e2e:smoke` | `playwright test --project=desktop-chromium --grep @smoke` |
| `e2e:stress` | `playwright test --project=desktop-chromium --grep @stress --repeat-each=10 --workers=4` |
| `e2e:ui` | `playwright test --ui` |

## 5. Test data

### 5.1 Base seed (`e2e/seed/base.ts`, Prisma, runs once per run)

Only what the API cannot create or what every test needs:

- Branch `E2E Kitchen` (id 1 — the `PRODUCTION_BRANCH_ID`).
- Admin user `e2e-admin@louella.test` / `E2E_ADMIN_PASSWORD`, bcrypt-hashed
  with the same cost as `users.service`.
- Manager `e2e-manager@louella.test` / `E2E_MANAGER_PASSWORD`, assigned to
  `E2E Kitchen`. (`User.branchId` is `@unique`: one user per branch.)
- Viewer `e2e-viewer@louella.test` (role `VIEWER`, no branch, same password as
  the manager) for the redirect check in §6.1.
- One `JobRole`, one `ExpenseCategory`.
- Features come from migration `20260819000000_seed_rbac_feature_registry`;
  `PayrollSettings` from its migration. Do not re-seed them.

### 5.2 The world fixture (`e2e/fixtures/world.ts`)

A Playwright fixture that builds isolated data per test through
`e2e/fixtures/api.ts` (logged in as admin). All names carry a short test id,
e.g. `E2E-7f3a Pandesal`.

```ts
const world = await buildWorld({
  products: 3,           // with a ProductPriceHistory row dated before yesterday
  withRecipe: true,      // one material + recipe for products[0]
  employees: 1,          // with a daily rate; hired TODAY unless hireDate given
  hireDate?: string,
  recurringDeduction?: number, // monthly amount on each employee (payroll spec)
});
// → { branch, manager: { user, page }, products, material?, recipe?, employees }
```

- Every test gets **its own branch** and **its own manager** assigned to it.
  `managerPage(browser, world)` returns a page signed in as that manager (login
  via the API cookie flow, no UI).
- Stock chains, branch-day locks and cash verification are per branch, so
  tests are independent and safe under `--repeat-each` and parallel workers.
- **Materials are global** (`MaterialInventory` has no `branchId`); each test
  uses its own material and asserts only that material's stock.
- **Employees are hired today** by default so they never enter the previous
  cutoff that the payroll spec finalizes; an employee missing from a cutoff
  cannot block its finalize.
- No teardown: the database is thrown away per run. Nothing is soft-deleted
  for cleanup.

### 5.3 API client (`e2e/fixtures/api.ts`)

Thin typed wrapper over Playwright's `APIRequestContext` against
`/api/v1`. Logs in once per worker, keeps the bearer token, and re-logs in on
401. Methods are added only as specs need them. Used for **setup and for
cross-checking results** — never to perform the action under test.

### 5.4 Dates (`e2e/fixtures/dates.ts`)

Re-exports `manilaToday` and `addDays` from `src/lib/manilaDate.ts` and
`cutoffOf` from `src/lib/payroll/cutoff.ts`, plus `yesterday()` and
`previousCutoff()`. Tests never call `new Date().getDate()` or similar.

## 6. v1 specs

Layout:

```
e2e/
  global-setup.ts
  routes.ts
  README.md
  fixtures/{api,world,dates,test}.ts   # test.ts extends base test with world + api
  pages/{login,inventory-sheet,production-orders,branch-cash-day,branch-cash-review,payroll-cutoff,payslip}.page.ts
  seed/base.ts
  smoke/{auth,inventory-sheet,branch-cash,route-sweep}.spec.ts
  full/{auth,inventory-sheet,production-orders,branch-cash,payroll}.spec.ts
```

`smoke/` holds only `@smoke` tests; `full/` holds the rest. A test may carry
both `@smoke`-worthy assertions and extra ones — split it so the smoke test
stays short.

### 6.1 Auth — `smoke/auth.spec.ts` (@smoke), `full/auth.spec.ts`

Smoke:
- Admin logs in through the form and lands off `/login`.
- Wrong password shows an error message and stays on `/login`.
- After reload, the user is still signed in (access token re-minted from the
  HttpOnly refresh cookie; assert a `/auth/refresh` 200 and a rendered page).

Full:
- Logout returns to `/login`; visiting `/dashboard` afterwards redirects to
  `/login`.
- Manager branch scoping: `GET /branches` is an open catalog read, so the
  picker lists every branch; the scoping is on **data**. The manager's own
  branch is selectable and `GET /inventory/summary?branchId=<own>` is 200,
  while the same route for another world's branch is **403** (`BranchGuard`).
- A viewer-level user visiting an admin page (e.g. `/settings/users`) is sent
  to their first permitted route (`/dashboard`) by `RouteGuard`; `/no-access`
  is only where an account with no permitted route lands.
- `/change-password` changes the password; the old one no longer logs in.

### 6.2 Inventory sheet — `smoke/inventory-sheet.spec.ts` (@smoke @stress), `full/inventory-sheet.spec.ts` (@stress)

Driven as **admin** on `/inventory/details` for the world branch. A scoped
manager cannot load the sheet today (see §6.2a), and the rules under test are
role-independent. Rows are created with the **Initialize** button; edits are
staged and saved with **Save Changes**; only Delivery, Leftover and Reject are
editable (the "Prev. Leftover" column is the derived opening).

Smoke:
- For **yesterday**, enter delivery, reject and leftover for `products[0]`.
  Sold shown = `quantity + delivery + Σadj − leftover − reject`.
- **Today's opening** for that product equals yesterday's close.

Full:
- Editing yesterday's leftover changes today's opening by the same amount
  (carry-forward through the stock chain).
- A row with no leftover entered is shown as uncounted and contributes sold 0
  (`leftoverCountedAt` null) — cross-check via the sales API.
- An adjustment (`PULL_IN`) added for the day appears in Σadj and moves sold.
- **Initialize** creates a row for every active product. (Autofill is *not*
  asserted: it keys off the newest inventory row across all branches with a
  5-minute memo, so it is order-dependent in a shared database.)

### 6.2a Known production bug (found while writing this suite)

A scoped branch manager gets `400 "property branchId should not exist"` on
`GET /inventory/branch/:id/date` and `GET /inventory/date`, so their own daily
sheet fails to load. `BranchGuard` pins `branchId` into `req.query`; the app's
`ValidationPipe({ whitelist, forbidNonWhitelisted })` rejects it on DTOs that
lack the field. `full/inventory-sheet.spec.ts` carries a `test.fixme` for the
manager case; remove the `.fixme` when it is fixed.

### 6.3 Production orders — `full/production-orders.spec.ts` (@stress)

Uses `withRecipe: true`. Set the material's stock through the API first.

- Create **two** orders for `products[0]` on the same day, finalize both
  through the UI. Kitchen yield = sum of both; the world branch's delivery for
  that product/day rises by the same sum; the material's stock falls by
  `recipe qty × total` (compare with `q4` rounding tolerance of 0).
- Cancel a third, unfinalized order: it stays listed with status `cancelled`
  and changes no stock.

### 6.4 Branch cash — `smoke/branch-cash.spec.ts` (@smoke @stress), `full/branch-cash.spec.ts` (@stress)

Manager on `/inventory/details` (cash section); admin on `/branch-cash`.

Smoke:
- Manager records an expense, a vale for the world employee, and counted cash
  for today. Expected cash shown = `sales − expenses − vale`, where `sales`
  equals the value the sales page shows for that branch/day.
- With every leftover counted, admin verifies; the manager's cash inputs
  become disabled.

Full:
- While any product row is uncounted, the admin's verify action is disabled or
  refused with the uncounted message.
- Admin reopens a verified day; the manager can edit again.
- A sales change after verification shows as drift on `/branch-cash`.

### 6.5 Payroll — `full/payroll.spec.ts` (serial)

`test.describe.configure({ mode: 'serial' })`. Not tagged `@stress` (a cutoff
has one run for everyone). Uses `previousCutoff()` and an employee created with
`hireDate` before that cutoff and a daily rate.

- `beforeAll`: void any non-voided run on the previous cutoff (API), so reruns
  and `--repeat-each` start clean.
- Add one absence on a working day and one REGULAR holiday marked worked in
  that cutoff (API). On `/payroll/[periodStart]`, the draft for the employee
  shows: `rate × days worked + rate × regular multiplier (from PayrollSettings)
  − nothing for the absence`. Compute the expected figure in the test from the
  cutoff's working days and the employee's rest days — not a hardcoded total.
- The world is built with `recurringDeduction: 500`. If the previous cutoff is
  a 1–15 cutoff, the draft deducts 500; if it is 16–end, it deducts nothing.
  (Branch on `previousCutoff()` so the test passes on either half of the
  month.)
- Finalize through the UI. The payslip (`/payroll/payslips/[id]`) matches the
  draft figures.
- Adding an absence in that cutoff is refused (cutoff locked).
- Void the run through the UI; finalize again succeeds.

### 6.6 Route sweep — `smoke/route-sweep.spec.ts` (@smoke)

As admin, visit every route in `routes.ts` (dynamic routes resolved to an id
the base seed or a world provides). For each: no Next.js error overlay/boundary
text, no response ≥ 500 from `/api/v1`, and the page's main heading is visible.

## 7. Writing rules (copied into `e2e/README.md`)

1. No `page.waitForTimeout`. Use web-first assertions and `waitForResponse`.
2. Locate by role, label or text. Add `data-testid` only where a grid cell or
   control has no accessible name; those attributes are the only other
   production edits allowed by this work.
3. Setup and cross-checks go through the API fixture; the behaviour under test
   goes through the UI.
4. Every test builds its own world. No test depends on another test's data or
   on execution order, except inside `full/payroll.spec.ts`.
5. Expected numbers are computed from the rule (the formula in AGENTS.md), not
   hardcoded totals.
6. Dates come from `fixtures/dates.ts`.
7. Tag `@smoke` only if the test is fast (< 20 s) and guards a money or stock
   rule or login. Tag `@stress` only if the test is safe to repeat in parallel.
8. Keep output small: no `console.log` in specs.

## 8. Coverage matrix — every route and module

This is the authoritative list. `routes.ts` must contain every route below.
Phase **v1** is built (2026-09-29: auth, inventory sheet, production orders,
branch cash, payroll, and the route sweep over all 40 pages); **v2** is the next
pass; **v3** needs extra infrastructure. The skill (§10) requires updating this
table when a feature lands or changes.

v1 rows that were built: `/login`, `/change-password`, `/inventory/details`,
`/production-orders` (and its re-export `/production/orders`), `/branch-cash`,
`/payroll`, `/payroll/[periodStart]`, `/payroll/payslips/[id]`. Everything
marked "sweep v1" is covered by the route sweep only.

### 8.1 Routes (`src/app/**/page.tsx`)

| Route | Module(s) | Phase | Planned scenarios |
|---|---|---|---|
| `/` | landing | sweep v1; v3 | Renders published content; defaults when DB empty |
| `/login` | auth | v1 | §6.1 |
| `/register` | auth | v2 | Registration form validates; new user cannot reach admin pages |
| `/change-password` | auth | v1 | §6.1 |
| `/no-access` | permissions | sweep v1 | Only for an account with no permitted route; a denied page redirects to the first permitted route instead (§6.1) |
| `/dashboard` | dashboard | sweep v1; v2 | Figures for a world branch match the sales API for the day |
| `/sales` | sales | sweep v1; v2 | Branch/day sales equals Σ sold × effective price; uncounted rows shown |
| `/inventory` | inventory | sweep v1; v2 | Branch overview lists the world's products with today's figures |
| `/inventory/details` | inventory, branch-cash | v1 | §6.2, §6.4 |
| `/inventory/gaps` | inventory, jobs | sweep v1; v2 | A missing day appears as a gap; autofill-range closes it |
| `/inventory/rejections` | inventory | sweep v1; v2 | Rejects entered in §6.2 appear by product |
| `/inventory-adjustments` | inventory-adjustments | sweep v1; v2 | Transfer send → receiver accept; pull-out cap; accepted transfer immutable; ANOMALY adjustment |
| `/inventory-import` | inventory-import | sweep v1; v2 | Import a fixture XLSX; rows written; same file re-import refused (hash) |
| `/inventory-import/history` | inventory-import | sweep v1; v2 | Import appears with file name, no download |
| `/production` | production | sweep v1; v2 | Kitchen yield per product/day equals finalized orders (links §6.3) |
| `/production/orders` | production-orders | v1 | §6.3 |
| `/production-orders` | production-orders | v1 | §6.3 (same feature, second entry point — sweep both) |
| `/production-cost` | recipes, materials | sweep v1; v2 | Cost for a past day uses that day's recipe version and material price |
| `/production-efficiency` | production | sweep v1; v2 | Renders for the world branch; figures match API |
| `/material-inventory` | material-inventory | sweep v1; v2 | Opening = yesterday's close; consumption from §6.3 visible |
| `/material-inventory/gaps` | material-inventory, jobs | sweep v1; v2 | Missing day shown as gap |
| `/materials` | materials, material-adjustments | sweep v1; v2 | CRUD; price change dated to Manila today; adjustment moves stock |
| `/products` | products | sweep v1; v2 | CRUD with validation; double-submit creates one; price change creates history; soft delete hides it |
| `/recipes` | recipes | sweep v1; v2 | Edit recipe creates a new version; past days keep the old one |
| `/branches` | branches | sweep v1; v2 | Create/edit branch; inactive branch hidden from pickers |
| `/suppliers` | suppliers | sweep v1; v2 | CRUD |
| `/unit-conversions` | unit-conversions | sweep v1; v2 | Creating KG→G also shows G→KG |
| `/config/product-order` | products | sweep v1; v2 | Reorder persists and changes sheet row order |
| `/employees` | employees | sweep v1; v2 | Create employee with rate; admin-only (a manager is redirected to their first permitted route) |
| `/employees/[id]` | employees | sweep v1; v2 | Rate history; rest days; hire/separation change crossing a finalized cutoff refused |
| `/payroll` | payroll | v1 | Cutoff list; §6.5 entry point |
| `/payroll/[periodStart]` | payroll | v1 | §6.5 |
| `/payroll/payslips/[id]` | payroll | v1 | §6.5 |
| `/payroll/runs/[id]/print` | payroll | sweep v1; v2 | Print view lists every payslip of the run |
| `/branch-cash` | branch-cash | v1 | §6.4 |
| `/settings/users` | users | sweep v1; v2 | Create user, change role/branch, deactivate → cannot log in |
| `/settings/permissions` | permissions | sweep v1; v2 | Revoking a feature hides the nav item and redirects the user to their first permitted route |
| `/settings/jobs` | jobs | sweep v1; v2 | Job runs listed with `trigger: 'auto'` after an autofill |
| `/settings/payroll` | payroll | sweep v1; v2 | Holiday multipliers editable; used by drafts only |
| `/settings/landing` | landing | sweep v1; v3 | Edit draft, publish, `/` shows it; restore revision (needs Storage for images) |

"sweep v1" means the route is covered in v1 only by the route sweep (§6.6).

### 8.2 Server modules (`src/server/`)

| Module | Covered by |
|---|---|
| auth | §6.1 |
| users | §6.1 (fixture), v2 `/settings/users` |
| permissions | §6.1 (route redirect), v2 `/settings/permissions` |
| branches | fixture, v2 `/branches` |
| products | fixture, v2 `/products`, `/config/product-order` |
| inventory | §6.2 |
| inventory-adjustments | §6.2 (PULL_IN), v2 transfers |
| inventory-import | v2 |
| production | §6.3 (yield), v2 `/production` |
| production-orders | §6.3 |
| materials | fixture, v2 |
| material-inventory | §6.3 (consumption), v2 |
| material-adjustments | v2 `/materials` |
| recipes | fixture, v2 `/recipes`, `/production-cost` |
| sales | §6.4 (expected cash), v2 `/sales` |
| suppliers | v2 |
| unit-conversions | v2 |
| dashboard | sweep, v2 |
| jobs | §6.2 (autofill), v2 `/settings/jobs`, gaps pages |
| notifications | v3 — push needs Firebase; out of scope until a test project exists |
| files | not covered — not registered in `app.module.ts`, no routes |
| employees | §6.4 (vale), §6.5, v2 |
| payroll | §6.5 |
| branch-cash | §6.4 |
| landing | sweep `/`, v3 |
| prisma, json_body | infrastructure; exercised by every test |

## 9. CI

New job `e2e-smoke` in `.github/workflows/ci.yml`, parallel to `verify`:

```yaml
  e2e-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: louella
          POSTGRES_PASSWORD: louella
          POSTGRES_DB: louella_e2e
        ports: ["54329:5432"]
        options: >-
          --health-cmd "pg_isready -U louella -d louella_e2e"
          --health-interval 2s --health-retries 30
    env:
      CI: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e:smoke
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            e2e-results/
          retention-days: 7
```

The job reads everything from `.env.e2e` via `playwright.config.ts`; it needs
no secrets. Target: smoke tests under 3 minutes (build excluded).

**Not a deploy gate yet.** Vercel deploys every push to `master` regardless of
CI. For CI to block a deploy, work on branches/PRs or enable Vercel's "wait
for checks" setting. Changing that is out of scope; `e2e/README.md` says so.

## 10. Keeping the suite current: skill + rule

### 10.1 AGENTS.md

Add to **Development**:

```
npm run e2e:db           # start the throwaway e2e Postgres (Docker, :54329)
npm run e2e:smoke        # CI gate; npm run e2e for everything
```

Add a short **E2E tests** section: the suite uses `.env.e2e` and a local
database only, never `.env`; any task that changes user-facing behaviour adds
or updates its e2e test — load the `adding-e2e-coverage` skill.

AGENTS.md is always in context, so the rule is what makes the skill fire;
the skill holds the how.

### 10.2 Skill `.claude/skills/adding-e2e-coverage/SKILL.md`

Created **after** the fixtures exist (last implementation task), because it
must reference real fixture names. It is a discipline skill, so it is built
test-first per `superpowers:writing-skills`:

- **RED:** give a subagent, without the skill, a small feature task in this
  repo under time pressure ("add a `notes` field to expenses, quick please") and
  record whether it adds an e2e test and what it says to justify skipping.
- **GREEN:** write the skill against those rationalizations; rerun; it must
  add the test in the right folder with the right tags and update §8.
- **REFACTOR:** close any new loophole; rerun.

Draft content (final wording comes from the RED run):

```markdown
---
name: adding-e2e-coverage
description: Use when a task in louella-nextJS adds or changes anything a user can see or do — a page, form, button, figure, permission, lock, or business rule — including bug fixes, before claiming the task is complete
---

# Adding e2e coverage

Every user-facing change ships with the Playwright test that proves it, in the
same commit. Unit tests do not count as the e2e test.

## Steps
1. Find the route(s) in the coverage matrix
   (docs/superpowers/specs/2026-09-29-e2e-playwright-design.md §8).
2. Add or extend a spec: `e2e/full/<feature>.spec.ts`; add to `e2e/smoke/`
   only if it guards login, money or stock and runs < 20 s.
3. Build data with the world fixture (`e2e/fixtures/test.ts`); act through the
   UI; cross-check through `api`.
4. New route → add it to `e2e/routes.ts`.
5. Update the matrix row (phase → v1/done, scenarios).
6. Run `npm run e2e -- <spec>`; for `@stress` tests also
   `npm run e2e:stress -- <spec>`. Paste the result line.

## Red flags — stop, write the test
| Thought | Reality |
|---|---|
| "Unit tests cover it" | They cannot see the UI, the API wiring or RBAC together. |
| "Too small for e2e" | Small changes break sheets. Extend an existing spec. |
| "I'll add it later" | Later never comes; the matrix drifts. |
| "No DB/Docker here" | Say so explicitly and leave the test written; do not skip writing it. |
| "It's a backend-only change" | If a user can observe it, it needs a test. |

## Not needed
Pure refactors with no observable change, docs, CI config, and server-only
changes with no user-visible effect — state which in the summary.
```

## 11. Files created or changed

| Path | Action |
|---|---|
| `playwright.config.ts` | rewrite |
| `docker-compose.e2e.yml` | new |
| `.env.e2e` | new (committed, fake secrets) |
| `package.json` | add `e2e*` scripts |
| `e2e/global-setup.ts` | new |
| `e2e/auth.setup.ts` | rewrite |
| `e2e/routes.ts` | rewrite (all routes in §8.1) |
| `e2e/README.md` | new |
| `e2e/seed/base.ts` | new |
| `e2e/fixtures/{api,world,dates,test}.ts` | new |
| `e2e/pages/*.page.ts` | new (7 page objects, §6) |
| `e2e/smoke/*.spec.ts` | new (4) |
| `e2e/full/*.spec.ts` | new (5) |
| `e2e/0*-*.spec.ts`, `e2e/1*-*.spec.ts` | delete (§2) |
| `src/server/app.module.ts` | throttle limit from env |
| `src/server/auth/auth.controller.ts` | `@Throttle` limits from env |
| `src/server/common/config/env.validation.ts` | refuse `E2E_RELAX_THROTTLE` off-localhost |
| `src/server/common/config/env.validation.spec.ts` | new/extended test |
| `src/components/**` | `data-testid` only where no accessible name exists |
| `.github/workflows/ci.yml` | add `e2e-smoke` job |
| `AGENTS.md` | Development scripts + E2E section |
| `.claude/skills/adding-e2e-coverage/SKILL.md` | new (last task, test-first) |
| `docs/superpowers/specs/2026-09-29-e2e-playwright-design.md` | this file; §8 kept current |

## 12. Out of scope

Visual regression; a server clock override; v2/v3 scenarios in §8; Supabase
Storage and Firebase in tests; making CI a Vercel deploy gate; load testing
beyond `@stress`.

## 13. Done when

- `npm run e2e:db && npm run e2e` passes locally on both projects.
- `npm run e2e:stress` passes 10/10 repeats.
- The `e2e-smoke` CI job passes on a PR.
- Pointing `.env.e2e` at a non-local host makes the run abort before any
  database or build step (checked manually once, noted in the PR).
- `npm run test` still passes, including the new env-validation test.
- The skill passed its RED/GREEN runs, recorded in the implementation PR.
