# E2E tests (Playwright)

Browser tests for the money and stock rules that unit tests cannot see end to end. Design:
`docs/superpowers/specs/2026-09-29-e2e-playwright-design.md` (its §8 is the coverage table).

**These tests never touch production.** `.env` points at the production Supabase project. The suite
uses its own throwaway Postgres (`louella_e2e` on `localhost:54329`, `.env.e2e`) and **aborts before
doing anything** unless both database URLs are exactly that. It also refuses to run if
`NEXT_PUBLIC_API_URL` appears in any env file Next reads (see *Gotchas*).

## Run it

```bash
npm run e2e:db          # start the throwaway Postgres (Docker) — tmpfs, so every start is empty
npm run e2e:smoke       # the CI gate (desktop Chromium, @smoke only)
npm run e2e             # everything: desktop Chromium + iPad WebKit side by side (payroll is desktop-only)
npm run e2e:stress      # @stress tests ×10 across 4 workers — the flake detector
npm run e2e:ui          # Playwright UI mode, for writing tests
npm run e2e:db:down
```

Playwright builds the app (`npm run build`) and serves it on **:4100**, then resets, migrates and
seeds the database (`e2e/global-setup.ts`). Your dev server on :4000 can keep running.

> **Windows:** `npm run build` runs `prisma generate`, which fails with `EPERM …query_engine-windows.dll.node`
> while a dev server holds the engine DLL. Stop `npm run dev` first.
>
> Don't start the :4100 server by hand: a plain `next start` loads `.env` (production). If something is already
> on :4100, Playwright reuses it, so `global-setup` checks that the seeded e2e admin can log in through it and
> aborts with "not the e2e server" if not. Let Playwright start the server.

Each `playwright test` invocation drops and rebuilds the schema. To check that a spec is safe to rerun
against leftover data, use `--repeat-each` (payroll: `--workers=1`), not two invocations.

Payroll (`full/payroll.spec.ts`) tests the two most recent ended cutoffs every run — always one 1–15 and one
16–end — so both halves of the recurring-deduction rule are covered whatever the date, and it also checks the
print page. It is desktop-only: the iPad project ignores it, so the projects can run in parallel, and the iPad
project has a 120 s test timeout (it is slower, and the sheet tests re-open the page several times).

## Layout

```
e2e/
  global-setup.ts        guard → reset DB → migrate deploy → base seed
  seed/base.ts           only what the API cannot create: kitchen branch, admin/manager/viewer, job role, expense category
  fixtures/
    test.ts              `test` with: api (admin, per worker), world (per test), page (signed in as admin)
    world.ts             buildWorld() / managerPage()
    api.ts               typed API client — setup and cross-checks only
    dates.ts             Manila today/yesterday/previousCutoff/workingDays
  pages/                 one page object per screen
  smoke/                 @smoke — the CI gate
  full/                  everything else
  support/               env guards, credentials, the app's own peso() formatter, response types
  routes.ts              every route in src/app (kept in sync with spec §8.1)
```

## The world fixture

`buildWorld(api, opts)` creates, through the API as admin: its own **branch**, a **manager** for it,
**products** (with price history), and optionally a **recipe + material** and **employees**. Names carry a
short id (`E2E-7f3a9c Bread 1`). Every test owns its data, so tests run in parallel and under `--repeat-each`.

Two things are shared, on purpose: **materials are global** (`MaterialInventory` has no branch), so each test
uses its own material; and **a payroll run covers everyone in the cutoff**, so `full/payroll.spec.ts` is serial.

## Rules

1. No `page.waitForTimeout`. Use web-first assertions (`expect(locator)…`) and `waitForResponse`.
2. Locate by role, label or text. `data-testid` only where a control has no accessible name — and those are the
   only production edits this suite is allowed. Icon-only buttons can be found by icon: `button:has(svg.lucide-check)`.
3. Setup and cross-checks go through the `api` fixture; the behaviour under test goes through the UI.
4. Every test builds its own world. No test depends on another's data or on order (except `full/payroll.spec.ts`).
5. Expected numbers are **computed from the rule** (`sold = quantity + delivery + Σadj − leftover − reject`;
   `expected cash = sales − expenses − vale`; pay = `rate × days worked + holiday pay − deductions`), never hard-coded.
6. Dates come from `fixtures/dates.ts` (Manila), never `new Date().getDate()`.
7. `@smoke` = fast (< 20 s) and guards login, money or stock. `@stress` = safe to repeat in parallel.
   Payroll is never `@stress`.
8. No `console.log` in specs.
9. In a `locator.filter({ has })`, the inner locator is matched **relative to each candidate**. Build it from
   `page`, never from a parent locator (`dialog.getByRole(…)` inside `has:` matches nothing).
10. Never `new PrismaClient()` without an explicit `datasources.db.url` (as `global-setup.ts` does). Prisma loads
   `.env` on its own, and the test workers inherit the runner's environment — a bare client would talk to production.

## Gotchas (each one cost a failing run)

| Gotcha | What to do |
|---|---|
| **A refresh token can't be shared between tests.** Each page load rotates it and the old one lives only 60 s (`auth.service.ts`). | Don't use a `storageState` file. The `page` fixture signs in as admin per test; `managerPage()` does the same for a world's manager. |
| **`NEXT_PUBLIC_API_URL` must be absent, not blank.** `api.ts` does `?? '/api/v1'`; a blank value sends the browser to `/auth/login`. | Keep it out of `.env.e2e`. `assertNoApiUrlOverride()` enforces this for every env file Next reads. |
| **The sheet and the orders page keep the previous query's rows on screen** (`keepPreviousData`, 30 s `staleTime`); with "All" selected the sheet shows one placeholder row *per branch*. Reading it mid-transition gives stale or duplicated rows. | Page objects `open()` a **fresh page** and wait for the exact `GET …?date=D` response before deciding anything. |
| **Five failed logins lock an account for 15 minutes.** | A wrong-password test uses a throwaway world manager, never the shared admin. |
| **`MANAGER` has no `analytics` feature**, so `/sales/*` is 403 for a manager on every branch. | Cross-check sales figures with the admin `api` fixture. |
| **`GET /branches` is an open catalog read**; only *data* is branch-scoped (`BranchGuard`). | Test scoping with a data route (own branch 200, other branch 403), not by counting branches in the picker. |
| **`RouteGuard` sends a denied page to the user's first permitted route**; `/no-access` is only for accounts with none. | Assert the redirect target, not `/no-access`. |
| **Autofill can't be asserted deterministically**: it keys off the newest inventory row across all branches with a 5-minute memo. | Test the explicit *Initialize* button instead. |
| **Autofill can also interfere with a test.** With no inventory row dated today anywhere, the first sheet read tops up EVERY branch with an uncounted placeholder for EVERY product ("39 products have no leftover count yet"), so a branch-cash day the test just counted becomes unverifiable — intermittently, depending on which test read a sheet first. | The base seed writes one row for today (`seed/base.ts`), so autofill sees the day as current for the whole run. |
| **React hydrates the login form after you type into it** and resets the controlled inputs; on WebKit under load the Email box came back empty and the browser's `required` check silently swallowed the click (18% of runs in a concurrent stress). | `LoginPage.login()` counts an attempt only once the page left `/login` or the error showed, and repeats fill + click otherwise. Use it; don't fill the form by hand. |

## A second production bug this suite found (fixed): managers couldn't send transfers

The adjustments dialog used to find a transfer's destination row by reading the *other* branch's daily sheet, which
`BranchGuard` answers 403 for a branch-confined manager — so a manager could not send from the UI (the server intends
them to). A transfer now names the destination **branch** and the server resolves (or opens) that branch's row; see
spec §6.7a. `full/transfers.spec.ts` runs both sides as the branches' real managers.

## A production bug this suite found (fixed)

A branch **manager** could not load their own branch's daily sheet: `GET /inventory/branch/:id/date` and
`GET /inventory/date` returned `400 "property branchId should not exist"`. `BranchGuard` pins `branchId` into
`req.query`, and the app's `forbidNonWhitelisted` `ValidationPipe` rejected it on DTOs without that field.
Fixed by `ScopedValidationPipe` (`src/server/common/pipes/`), which leaves out only the value the guard itself
stamped. `common/pipes/validation-pipe.http.spec.ts` covers the guard and the real pipe together (the older
`branch.guard.http.spec.ts` has no strict pipe, so it could not see this), and
`full/inventory-sheet.spec.ts › a branch manager loads their own daily sheet and can save it` guards it end to end.
The other sheet flows still run as admin — they test role-independent rules.

## CI

`.github/workflows/ci.yml` job `e2e-smoke`: a `postgres:16` service container, `npx playwright install chromium`,
`npm run e2e:smoke`; on failure the HTML report and traces are uploaded. It needs no secrets. `retries: 1` on CI:
a test that only passes on retry is reported as flaky, not hidden.

It is **not a deploy gate** yet: Vercel deploys every push to `master` regardless of CI. To make it block a
deploy, work on branches/PRs or enable Vercel's "wait for checks".

## Adding coverage

Any task that changes what a user can see or do adds or updates its e2e test in the same change — load the
`adding-e2e-coverage` skill. New route → add it to `routes.ts`. Update the row in the spec's §8 table.
