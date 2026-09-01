# RBAC: shared feature manifest + API enforcement

**Date:** 2026-08-19
**Status:** approved, in implementation

## Problem

Three defects, found by audit:

1. **Feature permissions are decorative on the API.** `getEffectivePermissions()`
   is consumed in exactly one place — `GET /users/me/permissions`, to draw the
   sidebar. No guard reads it. Toggling `analytics` off for MANAGER hides the
   nav item; `GET /sales/...` still returns everything.
2. **The matrix covers ~40% of the app.** 10 feature keys vs ~26 routes.
   Everything else is gated by hardcoded `minRole` that the admin screen cannot
   reach. 6 of the 10 keys map to zero web routes (they are mobile-only).
3. **Policy is duplicated and has drifted.** `Sidebar.tsx` and `RouteGuard.tsx`
   encode the same rules independently and already disagree:
   - `/settings` is ADMIN-gated in RouteGuard while the sidebar shows Jobs to
     MANAGER — managers are bounced when they click it.
   - 7 routes have pages and route rules but no sidebar entry.
   - INVENTORY lacks `dashboard`, and both the login redirect and the denial
     redirect target `/dashboard` — that role redirects to a route it is denied,
     forever.
4. `getUserMatrix()` stamps one user's override onto every role column.
5. The permission cache is a per-instance 5-minute Map on serverless;
   invalidation only clears the lambda that handled the write.

## Decisions

- Feature permissions become a **real authorization boundary** on the API.
- Granularity is **per-screen**, with `@Roles` retaining the read/write split.
- Permissions resolve **per request, inside the auth query already being made**
  (no cache, no added round trip).
- A **single shared manifest** is the sole source of truth for keys, routes,
  nav, and role defaults.
- Admin account creation becomes **access-aware** (see Section 4).

## Section 1 — the manifest

`src/lib/rbac/features.ts`, pure TypeScript, zero imports so Nest can load it.

26 keys. The 10 existing keys keep byte-exact names: `louella_mobile`'s
`feature_keys.dart` and the frozen Cloud Run image must keep working. All 15
new keys are additive; mobile ignores what it does not know.

Judgment calls:
- `/production/orders` is a one-line re-export of `/production-orders`. Both are
  live and linked from different places, so one key owns both prefixes.
- `production-cost` / `production-efficiency` are orphans — pages exist, nothing
  links to them. They get keys and nav entries but default **off** for every
  role, staying URL-only until deliberately enabled.
- `permissions` splits from `user-management`, so managing users does not imply
  the ability to rewrite the permission matrix (which is privilege escalation).

Role defaults reproduce today's `minRole` gates exactly, so day-one behavior is
unchanged — **except** INVENTORY gains `dashboard`, which un-bricks that role.

## Section 2 — server enforcement

Resolution happens in `JwtStrategy.validate()`'s existing round trip via one
raw query using aggregated subqueries (a plain join across both override tables
would be a cartesian product):

```sql
SELECT u.id, u.email, u.role, u."branchId", u."isActive",
  COALESCE((SELECT json_agg(json_build_object('k', r."featureKey", 'e', r.enabled))
            FROM "RoleFeaturePermission" r WHERE r.role = u.role), '[]') AS role_overrides,
  COALESCE((SELECT json_agg(json_build_object('k', p."featureKey", 'e', p.enabled))
            FROM "UserFeaturePermission" p WHERE p."userId" = u.id), '[]') AS user_overrides
FROM "User" u WHERE u.id = $1
```

Merged as `ROLE_DEFAULTS[role]` -> role overrides -> user overrides onto
`req.user.permissions`. `permCache` is deleted. `GET /users/me/permissions`
becomes a zero-query read.

`@RequireFeature(...)` + `FeatureGuard` registered as the third `APP_GUARD`
(after `JwtAuthGuard` populates `req.user`, before `ThrottlerGuard`). No
decorator means allow, preserving the read-open default so the rollout cannot
lock anyone out. Multiple keys mean *any*.

**Lockout invariant:** once `PermissionsController` requires `permissions`, an
admin disabling that key for ADMIN would make the fix unreachable without SQL.
`setRolePermission` refuses to disable `permissions` or `user-management` for
ADMIN, mirroring the existing `assertNotLastAdmin`.

`getUserMatrix` returns one row per feature for the one user
(`roleDefault` / `roleEffective` / `userOverride` / `effective`).

## Section 3 — client gating

`Sidebar` and `RouteGuard` derive from the manifest and consult **only**
`permissions`. `ROLE_ORDER` and the `featureKey | minRole` fork are deleted from
both — role is no longer a client-side concept. Icons live in a separate
`key -> LucideIcon` map so the manifest stays import-free.

`RouteGuard` matches **longest prefix** (fixes `/settings` shadowing
`/settings/jobs`).

Denial and post-login redirects both resolve *the first permitted nav
destination* from the manifest instead of hardcoding `/dashboard`; a user with
no permitted destination gets `/no-access`. This fixes the loop for every role,
present and future.

`/auth/me` returns permissions, so `AuthContext` drops its second request.

## Section 4 — admin surfaces

The permissions matrix grows to 26 rows, grouped by manifest `group`, with the
ADMIN-invariant switches rendered disabled and explained.

The create-account dialog in `settings/users` becomes access-aware: choosing a
role live-previews the screens the account will get, and per-user overrides can
be ticked at creation time rather than in a separate tab afterwards. Overrides
chosen at creation are written after the user is created, via the existing
`PUT /permissions/users/:userId`.

## Section 5 — testing

- **L1 manifest conformance** (vitest, pure): globs `src/app/(app)/**/page.tsx`
  and fails if any page is uncovered; asserts no prefix shadows another; asserts
  the 10 mobile keys exist byte-exact; asserts seed SQL matches the manifest.
- **L2 server unit** (jest): `FeatureGuard`, `JwtStrategy` precedence chain,
  `PermissionsService` incl. the lockout invariant.
- **L3 role x endpoint matrix** (jest + supertest, already a dep): table-driven,
  5 roles x one representative endpoint per feature, asserting exact status.
- **L4 component** (vitest + jsdom + @testing-library/react): `Sidebar` renders
  exactly the expected items per permission set; `RouteGuard` allows/redirects
  and provably does not loop without `dashboard`.
- **L5 visual** (Playwright MCP, no repo deps): production build, walk all five
  seeded accounts, screenshot sidebars, attempt denied URLs.
  **Constraint:** the local env points at the shared remote Supabase
  (`aws-1-ap-northeast-1.pooler.supabase.com`). The walk never writes role-level
  state; toggle behavior is proven with user-level overrides on one throwaway
  account, which is deactivated afterwards.

## Outcome

Shipped and verified. 467 server tests + 141 frontend tests pass; lint clean;
production build succeeds.

Two defects were found during implementation that the design had not
anticipated:

1. **`jobs` was missing from the feature-registry migration.** Caught by the L1
   conformance test comparing the manifest against the migration, before it
   could reach a database. The manifest holds 26 keys, not the 25 first counted.

2. **The dashboard 403'd for VIEWER.** Found by the L5 browser walk, not by any
   unit test. The dashboard screen aggregates data from the inventory and
   production-order domains, so gating those controllers at their own screen key
   alone broke a screen VIEWER is entitled to. Fixed by accepting `dashboard` as
   an alternative key on exactly the four handlers the dashboard consumes
   (`/inventory/dashboard`, `/inventory/date`, `/inventory/rejection-by-product`,
   `/production-orders/by-date`), with matrix rows added so it cannot regress.

The second is the general hazard of this design: a screen whose data comes from
another domain's controller needs that controller to accept its key. Anything
similar will surface as a 403 on a screen the sidebar still offers.

### Verified live

| Role | Sidebar | API |
|---|---|---|
| VIEWER | Dashboard, Revenue | inventory/production/recipes/users/permissions all 403 |
| INVENTORY | Dashboard, Inventory, Adjustments | inventory 200; production/recipes/users 403 |
| MANAGER | 15 entries incl. Suppliers, Unit Conversions, Jobs | users + permissions 403 |
| ADMIN | all 18 web destinations | all 200 |

Denied routes redirect to the role's own first permitted destination; INVENTORY
no longer loops; managers can reach `/settings/jobs`. Disabling `permissions` or
`user-management` for ADMIN is refused with a 400, as is an unknown feature key.

### Not applied

The feature-registry migration has **not** been run against any database. It
must be applied before an admin can toggle any of the sixteen new keys — until
then those toggles fail on the foreign key onto `Feature.key`. Everything else
works without it, because effective permissions come from code.

## Follow-up sweep (same day)

The first browser walk checked route allow/deny but never rendered each screen
as each entitled role, so it could only have caught the dashboard by accident.
A full sweep found two more issues of the same family:

3. **The two off-by-default report screens would 403 the moment they were
   enabled.** `/production-cost` and `/production-efficiency` are governed by
   their own keys, but their data comes from the production controller, gated on
   `production`. Enabling either page for a role without `production` produced an
   empty screen. `/production/material-consumption/summary` and
   `/production/efficiency` now accept the screen key too, so switching a page on
   is one grant rather than two.

4. **`/inventory/gaps` showed autofill controls to roles that cannot run them.**
   Pre-existing rather than a regression — those endpoints already carried
   `@Roles(MANAGER)` — but it is exactly the "only display what is allowed" rule
   this work is about. The buttons are now behind `useHasFeature('jobs')`.

### The class is now covered statically

`src/lib/rbac/screen-dependencies.spec.ts` maps every API service to the feature
it is gated behind, walks every screen directory for the services it references,
and asserts that every role entitled to a screen can reach everything that screen
loads. Verified by mutation: reverting the dashboard fix in the map makes it fail
on `/dashboard` and `/sales`.

Controls deliberately gated tighter than their page are declared in
`GUARDED_IN_UI`, and each entry must correspond to a real conditional — the test
also asserts those screens and services exist.

### Live sweep results

All 200, no 403 on any screen loaded by a role entitled to it:

- VIEWER: `/dashboard`, `/sales`
- INVENTORY: `/inventory/details`, `/inventory/gaps`
- MANAGER: `/production`, `/material-inventory`, `/recipes`, `/inventory-adjustments`
- ADMIN: `/settings/users`, `/settings/permissions`, and the per-user drawer
  (26 rows, 21 checked for a MANAGER, matching ROLE_DEFAULTS exactly)

Totals: 477 server tests, 205 frontend tests.

### Write-path verification (authorised, completed)

The migration was applied to the shared database — it was the only pending one,
so nothing else rode along. The registry went from 10 keys to 26 with both
override tables untouched, confirming the migration grants nothing on its own.

A throwaway account (`rbac-test@louella.com`, VIEWER) was created through the
admin dialog with both default screens unticked, then removed. It established:

- **Create-with-overrides works.** The account was written and both overrides
  (`dashboard=false`, `analytics=false`) applied, leaving it with zero effective
  permissions.
- **`/no-access` renders** with an empty sidebar and no redirect loop.
- **New keys are toggleable.** Granting `products` (user level) and
  `production-cost` (VIEWER role level) both returned 200 — writes that would
  have failed the `Feature.key` foreign key before the migration.
- **Changes take effect on the next request**, with no cache lag: the account's
  permissions became exactly `['production-cost', 'products']`, `/products` and
  `/production/material-consumption/summary` returned 200, `/recipes` stayed 403,
  and the sidebar showed exactly Prod. Cost and Products.
- **The production-cost fix holds end to end** — granting the key alone produced
  a working page, which was the defect this sweep found.

Cleanup restored the database exactly: test user deleted (with its refresh tokens
and overrides), the role-level override removed. Final state is 26 features and
zero rows in both override tables.

### Admin screen component tests

Both admin screens now have component suites (35 tests), so the write paths that
previously existed only as live evidence have a regression net.

Harness additions: `vitest.setup.ts` shims the browser APIs Radix reaches for
under jsdom (matchMedia, ResizeObserver, DOMRect, pointer capture) — without them
the components throw on mount, which reads as a component bug rather than a
missing harness. `src/test/renderWithQuery.tsx` supplies QueryClient and
TooltipProvider, mirroring `components/Providers`. `src/test/permissionFixtures.ts`
builds both API response shapes from the real manifest, so a feature added to
`FEATURE_LIST` flows into these tests instead of leaving them asserting against a
frozen copy.

What they cover:

- **Permissions screen (18):** a row per manifest feature, manifest grouping with
  mobile-only features in their own section, defaults reflected as switch state,
  the overridden marker, toggle wiring, the ADMIN-locked switches disabled for
  ADMIN and editable for every other role, the server's refusal message relayed
  verbatim, query-error retry, and the user-override tab — inherited versus
  overridden, reset offered only where an override exists, per-user writes, locked
  rows for an admin target, and refetch on switching accounts.
- **Users screen (17):** the access preview and its counts, nav-only checkboxes,
  override tallying and clearing on revert, the preview reading live role
  overrides rather than code defaults, create-then-apply-overrides with exact
  arguments, no override call when nothing changed, the temporary-password
  handoff, an account surviving a failed override write, a rejected create not
  claiming success, validation, and the per-user drawer.

Both suites were mutation-verified: removing the lockout from the role matrix
fails the lockout test, and dropping the create-time override application fails
two creation tests.
