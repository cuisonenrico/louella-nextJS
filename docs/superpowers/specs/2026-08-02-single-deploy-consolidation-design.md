# Single-Deploy Consolidation — Design

**Date:** 2026-08-02
**Status:** Phase 1 implemented — see "Implementation notes" for where the
build diverged from the plan, and "Outstanding" for what is not yet verified.
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

`helmet` moves out of Nest into `next.config.ts` headers, so the security
headers now cover the whole site rather than only the API — a real gain, since
the Vercel-hosted pages previously got none of them. **CSP is deliberately not
carried over:** helmet's `default-src 'self'` was fine for a JSON API but would
break Next's inline bootstrap scripts, which need per-request nonces. A
nonce-based CSP is worth doing and is tracked as outstanding work below.

**CORS stays in Nest**, contrary to the initial sketch. The allowlist is
dynamic (`ALLOWED_ORIGINS`) and credentialed, which Next's static `headers()`
cannot express. It is also now largely vestigial: the web app is same-origin,
and native mobile clients do not enforce CORS at all.

### The Web ↔ Node shim (primary risk)

Next route handlers speak Web `Request`/`Response`. Nest speaks Node
`IncomingMessage`/`ServerResponse`. A ~80-line adapter bridges them:
Web `Request` → a readable stream with `method`/`url`/`headers`, and a mock
`ServerResponse` that captures status, headers, and body into a Web `Response`.

**This is validated by a spike before anything else is built.** If a trivial
endpoint cannot round-trip through the shim, the correct response is to fall
back to Approach B rather than fight the runtime.

### Build pipeline

The plan assumed Nest would need its own `tsc` pass, because Next's compiler
was expected to drop `emitDecoratorMetadata`. **That turned out to be
unnecessary** — Next's SWC reads both decorator flags straight from
`tsconfig.json`, and the metadata survives the Turbopack build. Verified by
observing DI-constructed guards and `class-validator` DTO rules working against
a production build, not just `next dev`.

So there is no separate server build. `tsconfig.json` gains:

```jsonc
"experimentalDecorators": true,
"emitDecoratorMetadata": true,
"strictPropertyInitialization": false
```

`next.config.ts` declares `serverExternalPackages` for the Nest ecosystem and
`class-transformer` / `class-validator`. This is not optional: Nest reaches
`class-transformer/storage` through a bare `require` inside a try/catch, which
the bundler cannot resolve statically — without it the build fails outright.
Next already externalises `@prisma/client`, `express`, `bcrypt`,
`firebase-admin`, and `@aws-sdk/*`.

`prebuild` is still used, but only for `prisma generate`.

## Serverless-forced changes

These follow from leaving a long-lived container, independent of approach.

| Concern | Change |
|---|---|
| **DB connections** | `DATABASE_URL` moves to the Supabase transaction pooler (`:6543`, `pgbouncer=true&connection_limit=1`). Session-mode `:5432` exhausts connections under lambda fan-out. Prisma `directUrl` keeps `:5432` for migrations. |
| **CRON** | `ScheduleModule` and the three `@Cron` decorators are removed. Replaced by `vercel.json` entries hitting a new `CronController` at `/api/v1/jobs/cron/*`, authenticated by `CRON_SECRET` via `CronSecretGuard`. Separate from the existing manual triggers because Vercel Cron issues **GET** with a shared secret, not authenticated POST. |
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

## Implementation notes

Where the build diverged from the plan, and why:

1. **No separate `tsc` build.** The predicted decorator-metadata problem did not
   materialise; Next's SWC honours the tsconfig flags. This removed an entire
   build stage and keeps `next dev` hot-reloading server code.
2. **`strictPropertyInitialization: false`** added app-wide. 80 of the 82 type
   errors from the relocated source were Nest DTOs declaring properties that
   the ValidationPipe populates. The flag only affects class property
   declarations and the frontend has zero classes, so the blast radius is
   exactly the Nest DTOs it is meant for.
3. **Two real type errors were fixed rather than suppressed.**
   `jwt.strategy.ts` passed a possibly-undefined secret to passport-jwt, which
   silently accepts every token when handed `undefined` — it now throws at
   construction. The bridge's response body needed an explicitly
   `ArrayBuffer`-backed view to satisfy `BodyInit`.
4. **Three cron jobs became two endpoints.** Vercel's Hobby plan allows two
   cron jobs per project. The two former 11 PM jobs now run back to back behind
   `/jobs/cron/nightly`, which is also gentler on a connection-limited pooler
   than firing both simultaneously. Each still records its own `JobRun`, and a
   failure in the first does not skip the second.
5. **Cron schedules are UTC**, while the business rules are Manila. Recorded in
   `cron.controller.ts` because `vercel.json` cannot hold comments.
6. **Test runners are split**: Jest owns `src/server` (18 suites carried over
   unchanged), Vitest owns the frontend, with `src/server` excluded from its
   glob. Rewriting 130 backend tests was not in scope for a deployment change.
7. **The frontend API base URL is now the relative `/api/v1`.** Same-origin
   removes the CORS preflight and makes the auth cookie first-party — which
   also dissolves the `SameSite=none` requirement that previously existed only
   because Vercel and Cloud Run were different sites.

## Verification

Performed against a production build (`next build` + `next start`), not
`next dev`:

- ✅ Routing, DI, and guards — `GET /api/v1/products` returns 401 from
  `JwtAuthGuard` with `x-powered-by: Express`. The whole module graph resolves
  at boot, so a DI failure would have thrown before any request.
- ✅ Body parsing and decorator metadata — `POST /api/v1/auth/login` with an
  invalid body returns the exact `class-validator` messages, and
  `forbidNonWhitelisted` still rejects unknown properties.
- ✅ Cron auth — 401 with no secret and with a wrong secret; 200 with the
  correct one, with both jobs running independently.
- ✅ 404 for unknown paths (Nest's router, not Next's).
- ✅ Security headers present on every response.
- ✅ `next build` succeeds; `/api/v1/[...path]` registered as dynamic.
- ✅ 19 Jest suites / 130 tests pass. 4 Vitest suites / 51 tests pass.
- ✅ 12 new `http-bridge` tests covering multi-value `Set-Cookie`, binary
  payloads, chunked writes, `writeHead` headers, bodiless statuses, and
  `Content-Length` invalidation.

## Outstanding

- ⛔ **DB-backed smoke test is blocked.** The Supabase pooler rejects the
  configured credential — `FATAL: (ENOTFOUND) tenant/user
  postgres.sdcfpfcgdxdeddvdmeyn not found` — reproduced with `prisma db
  execute` outside the app entirely, so it is a pre-existing environment
  problem, not a consequence of this work. Once credentials are restored,
  verify: login round-trip and `Set-Cookie` over real HTTP, an inventory read,
  an inventory save with cascade, and a real cron run.
- Function bundle size has not been measured against Vercel's limit.
- `inventory-import` and the autofill range endpoints have not been timed
  against the 60s function cap with production data volumes.
- Nonce-based CSP (see the header section above).

## Risks

| Risk | Status |
|---|---|
| Shim fails under Vercel's runtime | Retired — verified against a production build locally. Still to confirm on a Vercel preview. |
| Decorator metadata lost in build | Retired — SWC emits it; verified via working DI and DTO validation. |
| Function size limit exceeded | Open — `serverExternalPackages` set, size not yet measured. |
| Long jobs exceed function timeout | Open — needs timing against real volumes. |
| Throttling silently weakened | Accepted — per-instance now; tracked separately. |
| Migration breaks frozen Cloud Run image | Open — backward-compatible migrations required until Flutter cutover. |
