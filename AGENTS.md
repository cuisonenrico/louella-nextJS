<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Louella — the application

This project is **one deployable**: the Next.js 16 frontend and the NestJS 11
API (in `src/server/`) build and ship together as a single Vercel project.
There is no separate backend service.

Sibling folders outside this directory:

- `../louella_mobile/` — Flutter app, consumes this REST API. Still pointed at
  the old Cloud Run host until it is repointed and reshipped.
- `../louella-be/` — **DEPRECATED and not deployed.** It is a near-complete
  copy of `src/server/` (165 files, all 22 controllers). Nothing there runs.
  If a search turns up a file in it, you are in the wrong folder.

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
`suppliers`, `unit-conversions`, `dashboard`, `jobs`, `notifications`, `files`

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

### Known serverless trade-offs

- **Rate limiting is per-instance.** `ThrottlerModule` keeps its bucket in
  memory, so the limit applies per lambda, not globally.
- **The 45s cache is per-instance**, so the impact is a lower hit rate, not
  staleness beyond the TTL. `CACHE_ENABLED=false` disables it.
- **`src/server/files/` (pre-signed S3 uploads) is built but unwired.** No
  caller exists in this app or in the Flutter client, and the AWS env vars are
  placeholders. The XLSX import does *not* use it.

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

Key domain rules (from `PROJECT_SPEC.md`):

- Inventory is never set directly — it derives from deliveries, production, POS
  transactions, and adjustments
- The suggestion feature must use real historical sales data, never hardcoded
  estimates
- No record in the audit trail (production orders, POS, deliveries, returns,
  adjustments) can ever be hard-deleted — cancelled orders get status
  `cancelled`
- Returns do **not** auto-update inventory; a separate `InventoryAdjustment` is
  required (two-step process)
- Branch managers see only their own branch's data

## Gotchas

- **Next.js 16** has breaking API changes — don't rely on patterns from earlier
  versions
- After any `prisma/schema.prisma` change, run `npm run prisma:generate` **in
  this folder**
- The `AdjustmentType` enum (`PULL_IN` / `PULL_OUT` / `ANOMALY`) is shared
  between `InventoryAdjustment` and `MaterialAdjustment`
- `UnitConversion` always stores both directions (e.g. KG→G and G→KG) as
  separate rows
- `MaterialInventory` has **no `branchId`** on purpose — stock is tracked
  globally for the central kitchen. Do not add one
- The XLSX import never stores the uploaded file. It parses in memory and
  writes rows; `ImportLog` keeps only `fileName` + SHA-256 `fileHash` (used to
  reject duplicate imports), so an imported spreadsheet cannot be re-downloaded
