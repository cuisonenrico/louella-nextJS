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
| `CRON_SECRET` | Required. `CronSecretGuard` fails closed, so cron silently 401s if unset. |
| `TZ` | Must be `Asia/Manila`. |
| `ALLOWED_ORIGINS` | Only for cross-origin clients (the Flutter app). The web app is same-origin and needs no entry. |
| `FIREBASE_SERVICE_ACCOUNT` | Inline JSON. There is no writable filesystem for the file-path variant. |

## Scheduled jobs

`@nestjs/schedule` is gone — an in-process scheduler cannot fire on a platform
that does not keep processes alive. Jobs run via Vercel Cron (`vercel.json`)
hitting `/api/v1/jobs/cron/*`, authenticated with `CRON_SECRET`.

**Vercel Cron schedules are UTC. The business rules are Manila (UTC+8).**

| Endpoint | Cron (UTC) | Manila | Runs |
|---|---|---|---|
| `/api/v1/jobs/cron/morning-init` | `0 22 * * *` | 6 AM next day | Seeds the day's rows |
| `/api/v1/jobs/cron/nightly` | `0 15 * * *` | 11 PM same day | Inventory gap-fill, then material stock |

Two entries, not three: Vercel's Hobby plan allows two cron jobs per project,
so the two former 11 PM jobs share one endpoint and run sequentially. Each
still writes its own `JobRun` row, and the second runs even if the first fails.

The manual `POST /api/v1/jobs/*` triggers are unchanged and still require a
MANAGER JWT.

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

## Local development

```bash
npm run dev          # app + API together on http://localhost:4000
npm run test         # vitest (frontend) + jest (server)
```

One process now serves both. Copy `.env.example` to `.env.local` first.

> **Windows note:** `prisma generate` fails with `EPERM ... query_engine-windows.dll.node`
> while a dev server is running — the process holds the engine DLL. Stop the
> dev server before regenerating.
