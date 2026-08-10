# Deployment

The Next.js app and the NestJS API ship as **one Vercel project**. There is no
separate backend service to build or deploy.

## How the API is served

Every `/api/v1/*` request — all 141 endpoints across 23 Nest controllers — is
handled by a single catch-all route:

```
src/app/api/v1/[...path]/route.ts  →  src/server/nest-handler.ts  →  Nest
```

`nest-handler.ts` replaces the old `main.ts`. It boots Nest once per lambda
instance and caches it, so the first request pays ~1–2s of cold start and every
later request on that instance reuses the app. Because all endpoints share one
function, warmth is shared across the whole API.

`src/server/http-bridge.ts` translates between Next's Web `Request`/`Response`
and the Node `IncomingMessage`/`ServerResponse` that Express expects.

## Required environment variables

See `.env.example` for the full annotated list. The ones that will break the
deployment if wrong:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | **Transaction pooler, port 6543**, with `?pgbouncer=true&connection_limit=1`. The session pooler (5432) exhausts connections under serverless fan-out. |
| `DIRECT_URL` | Session pooler (5432). Used only by `prisma migrate`, which cannot run through the transaction pooler. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥16 chars. `validateEnv` fails the boot without them — on serverless that surfaces as a 500 on first request, not a deploy failure. |
| `TZ` | Must be `Asia/Manila`. |
| `ALLOWED_ORIGINS` | Only for cross-origin clients (the Flutter app). The web app is same-origin and needs no entry. |
| `FIREBASE_SERVICE_ACCOUNT` | Inline JSON. There is no writable filesystem for the file-path variant. |

## Autofill jobs (no scheduler)

There is **no cron and no scheduler**. Both mechanisms the old backend used are
incompatible with serverless:

- `@nestjs/schedule` needs a process that stays alive between requests.
- The `onModuleInit` boot backfill ran once per deploy on Cloud Run, but Nest
  bootstraps on every **cold start** here — and since `app.init()` awaits module
  init, the first request after any idle period would have blocked on a full
  gap scan.

Instead the jobs run **on demand, from the pages that need their output**.
`AutofillInterceptor` (global, but inert without the `@Autofill()` decorator)
tops up today's rows before these handlers read them:

| Endpoint | Page | Scope |
|---|---|---|
| `GET /inventory/date` | Inventory sheet | `inventory` |
| `GET /inventory/branch/:id/date` | Branch sheet, mobile quick entry | `inventory` |
| `GET /production/date` | Production sheet | `inventory` |
| `GET /production/branch/:id/date` | Branch production sheet | `inventory` |
| `GET /material-inventory/by-date` | Material stock sheet | `materials` |

Production shares the `inventory` scope because a single job creates both the
Inventory and Production placeholder rows for a date.

**Why this is safe on a hot read path:**

- **Cheap when current:** one indexed `findFirst` on the date column, then a
  5-minute per-instance memo suppresses even that. The TTL is what lets a
  product added mid-morning still get rows — that was the 11 PM pass's job.
- **Deduplicated:** concurrent requests on one instance share a single
  in-flight promise. A duplicate run across instances is possible but harmless,
  because the jobs are idempotent (`createMany` with `skipDuplicates`).
- **Bounded:** catch-up is capped at 7 days. The underlying range jobs allow
  365, which cannot finish inside a 60s function. A wider gap is an outage, not
  routine carry-over — it logs a warning and asks for a deliberate run.
- **Never fatal:** failures are logged and swallowed. A sheet rendering without
  fresh placeholders beats a sheet returning 500.

Runs are recorded in `JobRun` with `trigger: 'auto'`, so the Settings → Jobs
screen shows them alongside historical `cron` and `boot` rows. `trigger` is a
plain String column, so this needed no migration — which matters while the
Cloud Run image is frozen.

The manual `POST /api/v1/jobs/*` triggers are unchanged and still require a
MANAGER JWT. `POST /jobs/autofill-range` is the way to close a gap wider than
the on-demand cap.

**Trade-off to accept:** rows now appear when someone first opens a sheet,
rather than at a fixed hour. If nobody opens any sheet on a given day, that
day's placeholders are created whenever someone next does — which is also when
anyone could first notice they were missing.

## Deploying

Push to the branch connected to the Vercel project. `prebuild` runs
`prisma generate`; `next build` does the rest.

Migrations are **not** run by the build. Run them deliberately:

```bash
npm run prisma:deploy   # prisma migrate deploy, uses DIRECT_URL
```

## Cutover state (as of 2026-08-02)

Consolidation is complete on the web side, but the cutover is deliberately
staged:

1. ✅ API consolidated into this project.
2. ⬜ Deploy to a Vercel preview and verify.
3. ⬜ Promote to production.
4. ⬜ **Cloud Run `louella-be` is frozen, not deleted.** Its existing image
   keeps serving the current Flutter build. Stop deploying to it — do not
   delete it.
5. ⬜ Repoint the Flutter app's base URL to the Vercel domain, ship that build,
   *then* delete the Cloud Run service. Cost is only eliminated at this step.

> **While Cloud Run is frozen, every Prisma migration must stay
> backward-compatible with that image** — it and this app share one database.

`louella-be/` still exists on disk as a separate git repo. It is deprecated and
no longer the source of truth; see the deprecation notice in its README.
Deleting it is a decision for after the Flutter cutover.

## Known regressions

Consequences of leaving a long-lived container, not of the consolidation
approach:

- **Rate limiting is per-instance.** `ThrottlerModule` keeps its bucket in
  memory, so the 20/min limit now applies per lambda instance rather than
  globally. A shared store (Redis/Upstash) is the real fix.
- **The 45s cache is per-instance**, for the same reason. This is a latency
  optimisation, not a correctness mechanism, so the impact is a lower hit rate.
- **Swagger UI is not mounted.** It was already disabled in production, and
  under the catch-all its old `/swagger` path is unreachable. The
  `@ApiProperty` decorators are untouched, so it can be restored at
  `/api/v1/docs` if wanted.
- **No CSP header.** Helmet's API-only policy would break Next's inline
  scripts; a nonce-based policy is outstanding work.
- **`req.ip` is undefined in local dev.** The bridge's synthetic socket has no
  `remoteAddress`, so with no `X-Forwarded-For` there is nothing to fall back
  to. On Vercel the header is always present and `req.ip` resolves exactly as
  it did on Cloud Run, so this is a local-only difference. Nothing but
  `ThrottlerGuard`'s default tracker reads it.

## Security header parity

Every other header helmet used to set is reproduced in `next.config.ts` and now
covers the whole site, not just `/api/v1`. Two of them are easy to lose:

- `poweredByHeader: false` suppresses **Next's** `X-Powered-By`.
- `expressApp.disable('x-powered-by')` in `nest-handler.ts` suppresses
  **Express's**, which the Next setting does not touch. Helmet used to remove
  it; without this line the API advertises Express on every response.

CSP is the only member of helmet's set deliberately left out (see above).

## Local development

```bash
npm run dev          # app + API together on http://localhost:4000
npm run test         # vitest (frontend) + jest (server)
```

One process now serves both. Copy `.env.example` to `.env.local` first.

### Running against a local database

A local Postgres 18 instance is available on this machine and is the fastest
way to work without touching the shared Supabase DB. A scratch database
`louella_smoke` already exists, migrated and seeded:

```bash
export DATABASE_URL="postgresql://postgres:admin123@127.0.0.1:5432/louella_smoke"
export DIRECT_URL="$DATABASE_URL"
npx next start -p 4100
```

To rebuild it from scratch:

```bash
psql -h 127.0.0.1 -U postgres -c "DROP DATABASE IF EXISTS louella_smoke;"
psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE louella_smoke;"
npx prisma migrate deploy
for f in seed-users seed-products seed-materials seed-local; do
  npx prisma db execute --file ./prisma/$f.sql --schema ./prisma/schema.prisma
done
```

Drop it with `psql -h 127.0.0.1 -U postgres -c "DROP DATABASE louella_smoke;"`
when it is no longer wanted.

> **`DIRECT_URL` is now mandatory for every Prisma CLI call**, not just
> migrations — `schema.prisma` references it, so `prisma db execute` and
> `prisma generate` fail validation without it. Setting only `DATABASE_URL`
> produces a confusing `P1012 Environment variable not found: DIRECT_URL`.

> **Windows note:** `prisma generate` fails with `EPERM ... query_engine-windows.dll.node`
> while a dev server is running — the process holds the engine DLL. Stop the
> dev server before regenerating.
