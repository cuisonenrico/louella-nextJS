# Single-Deploy Consolidation — Design

**Date:** 2026-08-02
**Status:** Approved, in implementation
**Branch:** `feature/single-deploy-consolidation` (louella-web)

## Problem

The system deploys as two units on two platforms:

| Unit | Platform | Deploy method |
|---|---|---|
| `louella-web` (Next.js 16) | Vercel (`louella-web-2.vercel.app`) | git push |
| `louella-be` (NestJS 11) | Cloud Run `louella-be`, region `asia-southeast3` | `gcloud builds submit` + `gcloud run deploy` |

This costs money for the Cloud Run container and requires a manual Docker build
and deploy for every backend change. The stated motivation for consolidating is
**deployment and cost** — not dev ergonomics, latency, or codebase cleanliness.
Those may improve as side effects, but they are not the goal and must not be
used to justify extra scope.

A secondary defect worth noting: Cloud Run runs in Korea (`asia-southeast3`)
while Supabase is in Tokyo (`ap-northeast-1`), adding a cross-region hop to
every statement.

## Goal

One hosting target — Vercel — deploying one project on git push. Cloud Run is
retired as a deploy target.

## Non-goals

- Rewriting business logic. The services move as-is.
- Changing the HTTP contract. All 141 endpoints keep their paths, verbs,
  request shapes, and response shapes.
- Migrating the Flutter app in this phase (see Cutover).
- Any refactoring not required to make the above work.

## Constraints discovered

1. **The Flutter app (`louella_mobile`) consumes the REST API.** The HTTP
   surface cannot disappear or change shape.
2. **~10.5k lines / 22 controllers / 141 endpoints / 27 Prisma models.** Large
   enough that a hand-rewrite is a multi-week project with real drift risk.
3. **Three `@nestjs/schedule` CRON jobs**, all `Asia/Manila`:
   - `autofillMissingEntries` — 11pm — has HTTP trigger `POST /jobs/autofill`
   - `autofillMaterialStock` — 11pm — has HTTP trigger `POST /jobs/autofill-material-stock`
   - `autofillMorningInit` — 6am — **has no HTTP trigger; one must be added**
4. **Global guards** (`JwtAuthGuard`, `RolesGuard`, `ThrottlerGuard`) and a
   global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`. Behavior
   depends on these; they must survive intact.
5. `FIREBASE_SERVICE_ACCOUNT` (inline JSON env var) is already supported
   alongside the file path variant — no work needed for serverless secrets.
6. `validateEnv` fails fast on missing `DATABASE_URL` / JWT secrets. On
   serverless this now throws at first-request bootstrap rather than at deploy.

## Approach

**Chosen: A now, B per-module later.**

- **Phase 1 (this spec):** Move the Nest app into the Next.js project and serve
  it from a single catch-all route handler. Nest stays Nest. Ship it, stop
  deploying Cloud Run.
- **Phase 2 (later, optional):** Port modules one at a time to native Next
  route handlers, behind the same URL space. Never a big-bang rewrite.

**Rejected: B now (full port).** 2–3 weeks of hand-translating 141 endpoints
against a live UAT system, for a benefit (cleaner code) that is not the stated
goal.

## Architecture

### Repo layout

```
louella-web/
├─ src/
│  ├─ app/api/v1/[...path]/route.ts   ← single API entrypoint, all verbs
│  ├─ server/                          ← louella-be/src, moved verbatim
│  │  ├─ app.module.ts, auth/, inventory/, jobs/, …
│  │  └─ nest-handler.ts               ← bootstrap + instance cache + shim
│  └─ components/, contexts/, lib/, types/    (unchanged)
├─ prisma/                             ← moved from louella-be
├─ tsconfig.server.json                ← tsc build for Nest (decorators)
├─ vercel.json                         ← cron schedule + function region
└─ package.json                        ← merged deps + prebuild step
```

### Request path

`main.ts` is deleted. Everything it configured moves into `nest-handler.ts`:
global prefix `api/v1`, `ValidationPipe`, `PrismaExceptionFilter`,
`cookie-parser`, body limits, and the `Prisma.Decimal.toJSON` numeric patch.
The only thing dropped is `app.listen()` — Vercel owns the socket.

The Nest app is created once per lambda instance and cached in module scope, so
it boots on the first request and is reused by every subsequent request on that
instance. Because all endpoints share **one** function, warmth is shared across
the entire API rather than per-route.

```ts
// src/app/api/v1/[...path]/route.ts
export const runtime = 'nodejs';
export { handle as GET, handle as POST, handle as PATCH,
         handle as PUT, handle as DELETE };
```

`helmet` and `enableCors` move out of Nest into `next.config.ts` headers /
middleware — security headers are now the whole app's concern, and Next owns
the edge. CORS becomes largely moot for the web app (same origin) but is still
required for the Flutter app's cross-origin calls; note that native mobile
clients do not enforce CORS, so this is defense-in-depth only.

### The Web ↔ Node shim (primary risk)

Next route handlers speak Web `Request`/`Response`. Nest speaks Node
`IncomingMessage`/`ServerResponse`. A ~80-line adapter bridges them:
Web `Request` → a readable stream with `method`/`url`/`headers`, and a mock
`ServerResponse` that captures status, headers, and body into a Web `Response`.

**This is validated by a spike before anything else is built.** If a trivial
endpoint cannot round-trip through the shim, the correct response is to fall
back to Approach B rather than fight the runtime.

### Build pipeline

Nest requires `emitDecoratorMetadata`, which Next's SWC/Turbopack compiler does
not emit. Nest is therefore compiled by its own `tsc` pass before `next build`:

```jsonc
"scripts": {
  "prebuild": "prisma generate && tsc -p tsconfig.server.json",
  "build": "next build"
}
```

`next.config.ts` declares `serverExternalPackages` for `@nestjs/*`,
`@prisma/client`, `firebase-admin`, and the AWS SDK so Next does not attempt to
bundle reflection-dependent code. Vercel's file tracing pulls the compiled
output into the function.

## Serverless-forced changes

These follow from leaving a long-lived container, independent of approach.

| Concern | Change |
|---|---|
| **DB connections** | `DATABASE_URL` moves to the Supabase transaction pooler (`:6543`, `pgbouncer=true&connection_limit=1`). Session-mode `:5432` exhausts connections under lambda fan-out. Prisma `directUrl` keeps `:5432` for migrations. |
| **CRON** | `ScheduleModule` and the three `@Cron` decorators stop firing. Replaced by `vercel.json` cron entries hitting the `/jobs/*` endpoints, authenticated by `CRON_SECRET`. A trigger endpoint is added for `morning-init`. |
| **Throttler** | `ThrottlerModule` is in-memory, so limits become per-instance and effectively unenforced. Documented as a known regression; the existing shared-bucket defect is tracked separately and not fixed here. |
| **Cache** | `CacheModule` (45s TTL) likewise becomes per-instance. Acceptable — it is a latency optimization, not a correctness mechanism. |
| **Region** | Vercel functions pinned to `hnd1` (Tokyo), co-located with Supabase. Net improvement over today's Korea→Tokyo hop. |
| **Cold start** | ~1–2s to boot Nest + Prisma on a cold instance. Accepted. |
| **Timeouts** | Vercel's function duration cap is far lower than Cloud Run's. Bulk paths (`inventory-import`, autofill ranges) are the risk; they must be verified against real data volumes and batched if they exceed budget. |

## Cutover

Deliberately staged so nothing breaks in one step:

1. Deploy the consolidated app to a Vercel **preview** and verify the API there.
2. Promote to production. The web app now calls its own origin.
3. **Cloud Run is left running, not deleted.** Its current image is immutable
   and keeps serving the existing Flutter build. Deploys to it simply stop.
4. Flutter base URL is repointed to the Vercel domain in a later phase; only
   then is the Cloud Run service deleted and the cost actually eliminated.

**Consequence to accept:** between steps 3 and 4, every Prisma migration must
remain backward-compatible with the frozen Cloud Run image, since both talk to
the same database.

`louella-be/` is a separate git repo. Its source is **copied** into
`louella-web`, not moved — the original is left on disk and marked deprecated.
Deleting the repo is the user's call, made after the Flutter cutover.

## Verification

- Spike gate: trivial endpoint responds through the shim under `next build` +
  `next start`, not just `next dev`.
- Existing backend Jest suites pass against the relocated source.
- Existing web Vitest suites pass.
- `next build` succeeds with the Nest prebuild in place.
- Manual smoke of the highest-risk paths: login → refresh, an inventory read,
  an inventory save with cascade, and one `/jobs/*` trigger.

## Risks

| Risk | Mitigation |
|---|---|
| Shim fails under Vercel's runtime | Day-1 spike gates the whole approach; fall back to B |
| Decorator metadata lost in build | Separate `tsc` pass, never SWC, for `src/server` |
| Function size limit exceeded | `serverExternalPackages`; measure after first build |
| Long jobs exceed function timeout | Measure `inventory-import` and autofill-range against real volumes |
| Throttling silently weakened | Documented regression, tracked separately |
| Migration breaks frozen Cloud Run image | Backward-compatible migrations until Flutter cutover |
