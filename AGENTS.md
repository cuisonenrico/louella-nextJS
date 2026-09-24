<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Louella — the application

This project is **one deployable**: the Next.js 16 frontend and the NestJS 11
API (in `src/server/`) build and ship together as a single Vercel project.
There is no separate backend service.

There is no mobile client: phones use this app's responsive layouts (the
Flutter app was dropped in September 2026). A deprecated copy of the API,
`louella-be`, may exist in an older checkout; nothing there runs. If a search
turns up a file in it, you are in the wrong folder.

## Development

```bash
npm run dev              # app + API on http://localhost:4000, API at /api/v1
npm run build            # prisma generate, then next build
npm run lint             # ESLint
npm run test             # vitest (frontend) + jest (server)
npm run test:web         # vitest only
npm run test:server      # jest only — the src/server suites
npm run prisma:migrate   # run pending migrations (dev)
npm run prisma:generate  # regenerate the Prisma client after schema changes
npm run prisma:deploy    # apply migrations to a deployed database
```

Run a single server test: `npx jest src/server/inventory/inventory.service.spec.ts`

Run the production build locally (the only way to reproduce deployed
behaviour — `next dev` forces `NODE_ENV=development`):

```bash
npm run build && npm start
```

> **Windows:** `prisma generate` fails with `EPERM ... query_engine-windows.dll.node`
> while a dev server holds the engine DLL. Stop the dev server first.

## Architecture

### Backend (`src/server/`)

The whole API is served by one Next.js catch-all route,
`src/app/api/v1/[...path]/route.ts`, which hands every request to Nest via
`src/server/nest-handler.ts` (this replaced `main.ts`) and
`src/server/http-bridge.ts` (Web ↔ Node request translation). Nest boots once
per serverless instance and is cached.

Standard NestJS module structure — each domain has a `*.module.ts`,
`*.controller.ts`, `*.service.ts`, and a `dto/` folder:

`auth`, `users`, `permissions`, `branches`, `products`, `inventory`,
`inventory-adjustments`, `inventory-import`, `production`, `production-orders`,
`materials`, `material-inventory`, `material-adjustments`, `recipes`, `sales`,
`suppliers`, `unit-conversions`, `dashboard`, `jobs`, `notifications`, `files`,
`employees`, `payroll`, `branch-cash`

Plus infrastructure-only: `prisma`, `json_body`.

Key cross-cutting pieces in `src/server/common/`:
- `guards/jwt-auth.guard.ts` — applied globally; use `@Public()` to exempt an endpoint
- `decorators/` — `@Public()`, `@CurrentUser()`, `@Roles()`, `@Autofill()`
- `filters/` — global exception filter
- `config/env.validation.ts` — fail-fast boot check for `DATABASE_URL` and both JWT secrets

**Auth flow:** JWT access token (15 min) via `Authorization: Bearer`. The
access token lives **only in memory** (`src/lib/tokenStore.ts`) — deliberately
never in `localStorage`/`sessionStorage`, so XSS cannot read a live bearer
token. The refresh token is an **HttpOnly cookie**, hashed at rest in the
`RefreshToken` table. Endpoints: `POST /api/v1/auth/login`, `/refresh`,
`/logout`, `GET /auth/me`.

**Authorization asymmetry, by design:** list/read endpoints are generally open
to any authenticated user (`@Get()` with no `@Roles`), while writes carry
`@Roles(UserRole.MANAGER)` and admin surfaces carry `@Roles(UserRole.ADMIN)`.
Sidebar filtering is navigation UX, *not* a security boundary — a viewer can
read the catalog and operational data directly from the API.

**Exception: payroll.** `employees`, `job-roles`, `absences` and `payroll`
controllers carry `@Roles(UserRole.ADMIN)` and their feature key at the class
level, reads included. `rbac-matrix.spec.ts` and `payroll.authz.http.spec.ts`
pin this.

**Database:** PostgreSQL (Supabase) via Prisma. All soft-deletes use
`deletedAt DateTime?`. No record in any operational table should ever be
hard-deleted by application code.

### Timezone: pin it, never rely on the process zone

**Vercel reserves the `TZ` environment variable and refuses to set it**, so
functions always run in UTC. Cloud Run allowed `TZ=Asia/Manila`; Vercel does
not. Every date boundary must resolve the zone explicitly:

```ts
new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
```

`en-CA` is what yields `YYYY-MM-DD`. A `getFullYear()/getMonth()/getDate()`
reading is wrong from 16:00–23:59 UTC — which is **00:00–08:00 Manila**, the
early-morning baking shift. Never derive a date from the system clock here.

### Jobs: on-demand, no scheduler

**There is no cron and no scheduler.** `@nestjs/schedule` cannot fire on
serverless, and the old `onModuleInit` backfill re-ran on every cold start.
Instead `AutofillOnDemandService` + `AutofillInterceptor` top up today's rows
when an endpoint marked `@Autofill(...)` is read (inventory, production,
material inventory). It is memoised (5 min/instance), in-flight deduplicated,
capped at 7 days of catch-up, and never throws. Runs are recorded in `JobRun`
with `trigger: 'auto'`. See `docs/DEPLOYMENT.md`.

`POST /api/v1/jobs/autofill-range` (MANAGER) closes a gap wider than the cap.

### Payroll

Admin-only. Spec: `docs/superpowers/specs/2026-09-24-payroll-design.md`.

- **Cutoffs** are the 1st–15th and 16th–last day, Manila calendar
  (`src/lib/payroll/cutoff.ts`). `periodStart` identifies one.
- **Pay = daily rate × days worked + additions − deductions.** Everyone is
  present on every non-rest working day unless an `Absence` says otherwise.
  Rates are dated history (`EmployeeRate`); a mid-cutoff raise splits basic pay.
- **Recurring deductions** (SSS, PhilHealth, Pag-IBIG…) are monthly amounts,
  taken on the 1–15 cutoff only. Employer shares are recorded, never deducted.
- **One function computes pay:** `src/server/payroll/compute-payslip.ts`. The
  live draft and finalize both call it.
- **Drafts are never stored.** Finalize writes a frozen `PayrollRun` +
  `Payslip` + `PayslipLine` snapshot. Fix a mistake by voiding the run (kept,
  status `VOIDED`) and finalizing again — never by editing a run.
- **Finalized cutoffs are locked.** Absence, adjustment and skip writers call
  `assertCutoffOpen` (advisory lock namespace 4; stock chains use 1–3).
- Job role (`JobRole`) is not access level (`UserRole`). An employee's login is
  optional (`Employee.userId`) and can be at most `MANAGER` from that screen.

### Branch cash

Spec: `docs/superpowers/specs/2026-09-24-branch-cash-design.md`.

- **The bottom of the paper sheet.** Managers record drawer expenses (by
  admin-managed `ExpenseCategory`), vale (cash advances, per `Employee`) and the
  counted cash on `/inventory/details`; admins review and verify on
  `/branch-cash`.
- **Sales comes from `SalesService`**, never recomputed here, so the figure
  matches the sales page.
- **A verified branch-day is locked** (expenses, vale, counted cash) until an
  admin reopens it. Writers take advisory lock namespace **5**. Inventory is
  never locked; a sales change after verification shows as drift.
- **Vale is deducted by payroll automatically.** `computePayslip` reads
  `BranchVale` rows in the cutoff; nothing is copied. A vale in a finalized
  cutoff cannot change (`assertCutoffOpen`), and employee date changes that
  would leave a vale outside employment are refused.
- Managers get `branch-cash` + `:create/:edit/:delete`; only admins get
  `:verify` and `:categories`.

### Known serverless trade-offs

- **Rate limiting is per-instance.** `ThrottlerModule` keeps its bucket in
  memory, so the limit applies per lambda, not globally.
- **The 45s cache is per-instance**, so the impact is a lower hit rate, not
  staleness beyond the TTL. `CACHE_ENABLED=false` disables it.
- **`src/server/files/` (pre-signed S3 uploads) is built but unwired.** No
  caller exists in this app, and the AWS env vars are
  placeholders. The XLSX import does *not* use it. `FilesModule` is **not
  registered** in `app.module.ts`, so `/files/*` routes do not exist — import
  it there again when a real caller appears.
- **Branch scoping must survive Express 5.** `req.query` is a re-parsing
  getter, so assigning into it is silently discarded. `BranchGuard` replaces
  the property instead; anything else that rewrites query values must do the
  same. `branch.guard.http.spec.ts` is the test that catches a regression —
  mocked-request unit tests cannot.

### Frontend

State and data:
- **TanStack Query** for all server state / API calls
- **Zustand** for client-side global state
- **AuthContext** (`src/contexts/AuthContext.tsx`) — wraps the app, exposes
  `useAuth()`, and re-mints the access token from the HttpOnly cookie on load

API layer: all calls go through `src/lib/apiServices.ts` (typed wrappers around
the axios instance in `src/lib/api.ts`, which auto-refreshes on 401). The base
URL is the relative `/api/v1` — same origin. **Leave `NEXT_PUBLIC_API_URL`
unset**; setting it re-introduces a split that no longer exists, and it is
inlined at build time.

UI: shadcn/ui components in `src/components/ui/`. Layout shell in
`src/components/layout/`. Editable tables use the shared spreadsheet module in
`src/components/sheet` + `src/lib/sheet`.

Route structure mirrors backend modules (`/inventory`, `/production`,
`/materials`, …).

## Domain context

Louella Bakery inventory management. The **inventory** and **production**
modules are the most business-critical — the bakery previously used printed
Excel sheets and these modules replace that workflow entirely.

Key domain rules (the original `PROJECT_SPEC.md` is gone; these, plus the
decisions recorded at the end of `audit-findings.md`, are the spec):

- **Sold is derived, never recorded:** `quantity + delivery + Σadj − leftover
  − reject` (`src/lib/inventory/metrics.ts`). There is no POS or returns table.
- **Expenses and vale are not sales.** They are recorded per branch per day in
  `branch-cash` and only change the *expected cash*:
  `sales − expenses − vale` (`src/server/branch-cash/compute-cash-day.ts`).
  Sales, revenue and the dashboard are unaffected.
- **Opening stock always equals the previous day's close**, for finished goods
  and material cards alike. Every stock writer keeps this true through
  `src/server/common/utils/stock-chain.ts`, inside its own transaction, after
  taking the chain's advisory lock. Never write `quantity` or a card's opening
  any other way. `scripts/repair-stock-chains.ts` repairs history.
- **Leftover carries forward and is still sellable; waste means rejects only.**
- **Several production orders for one product and day add up**; finalizing
  one adds to kitchen yield and branch delivery and consumes materials.
- **Transfers need the receiving branch to accept.** Sending books the
  sender's PULL_OUT at once; the receiver's PULL_IN exists only after accept.
- **Past days use that day's recipe and prices** (`RecipeVersion`,
  `MaterialPriceHistory`, `ProductPriceHistory`; see
  `common/utils/recipe-version.util.ts`). Every price and recipe change is
  dated to the Manila day.
- The suggestion feature must use real historical sales data, never hardcoded
  estimates
- No record in the audit trail (production orders, adjustments) can ever be
  hard-deleted — cancelled orders get status `cancelled`
- Branch managers see only their own branch's data

## Gotchas

- **Next.js 16** has breaking API changes — don't rely on patterns from earlier
  versions
- After any `prisma/schema.prisma` change, run `npm run prisma:generate` **in
  this folder**
- The `AdjustmentType` enum (`PULL_IN` / `PULL_OUT` / `ANOMALY`) is shared
  between `InventoryAdjustment` and `MaterialAdjustment`
- Material and recipe quantities are `numeric(14,4)`, factors `numeric(18,9)`,
  prices `numeric`. Prisma returns them as `Decimal`: read through `num()`, round
  quantities with `q4()` before writing, and add money in centavos
  (`common/utils/decimal.util.ts`). `DecimalInterceptor` sends every Decimal
  as a JSON number; the DTOs reject more decimals than the column holds
- `UnitConversion` always stores both directions (e.g. KG→G and G→KG) as
  separate rows
- `MaterialInventory` has **no `branchId`** on purpose — stock is tracked
  globally for the central kitchen. Do not add one
- The XLSX import never stores the uploaded file. It parses in memory and
  writes rows; `ImportLog` keeps only `fileName` + SHA-256 `fileHash` (used to
  reject duplicate imports), so an imported spreadsheet cannot be re-downloaded
