# RBAC: component-level granularity

**Date:** 2026-09-02
**Status:** implemented
**Branch:** `feature/rbac-component-granularity`
**Supersedes nothing.** Builds directly on
`2026-08-19-rbac-feature-manifest-design.md`, which established the manifest and
made feature permissions a real authorization boundary.

## Why

The matrix stopped at the screen. `products` was the smallest thing an admin
could grant or revoke, so "let a branch manager edit products but not delete
them" was not expressible. Two consequences drove this work:

1. **Branch managers were not actually limited.** `MANAGER` defaulted to 21 of
   the 26 feature keys — the broadest non-admin role by a wide margin. Keeping a
   manager narrow meant an admin revoking sixteen things they might forget.
2. **Component gating had nothing to gate on.** `useHasFeature` existed and was
   used exactly once in the entire app, because no key was finer than a screen.

Branch *data* isolation already existed (`BranchGuard`). Branch *functional*
isolation did not.

## Decisions

| Question | Decision |
|---|---|
| Granularity | Actions (write verbs) **and** named panels (regions of a screen) |
| Representation | Flat composite keys, `<feature>:<child>` |
| Panel enforcement | `sensitive` panels are withheld by the server, not just hidden |
| MANAGER default | Narrowed to a branch-operations core; everything else is a deliberate grant |
| Branch scope | An admin-controlled `all-branches` key, replacing a hardcoded role check |
| `@Roles` | **Retained** as a ceiling for now. Retiring it is a separate phase. |

### Why flat keys

The alternative was a nested permission object with `@RequireFeature('products',
'delete')`. It buys explicit typing at the cost of rewriting the JWT strategy's
aggregation, both override tables' key semantics, the permissions service, and
47 decorator call sites — to obtain a property a `key.startsWith(parent)` check
already gives.

Flat keys cost nothing structurally because everything downstream already treats
these strings as opaque: `resolvePermissions`, `FeatureGuard`,
`RoleFeaturePermission`, `UserFeaturePermission`, and the
`permissions: string[]` wire format. This was verified, not assumed.

The manifest still declares the tree — `FeatureDef.actions` / `.panels` — so the
structure is typed and the admin UI renders from it. `PermissionKey` is a
literal union derived from the `as const` entries, so `@RequireFeature('products:delte')`
is a compile error.

### The parent rule

A child key is only effective while its parent feature is. Enforced once, in
`enforceParentRule`, applied by `resolvePermissions`. Without it the matrix could
express a live delete grant on a screen the role cannot reach, and the guards
would disagree with the UI about what that means.

### Panels: what the server actually withholds

Most panels turned out to already have their own endpoints —
`production/material-consumption/summary`, `production/efficiency`,
`:id/price-history`, `:id/cost`. Those need no field-stripping at all; they take
the panel key on `@RequireFeature`.

The genuinely shared payload is `/dashboard/summary`, whose fields are built by
one service. `DashboardService.getSummary` now takes the caller's permissions and
assembles only the panels they hold. A denied panel's data is **not assembled and
then filtered** — it is never put in the response.

There is deliberately **no field-name list in the manifest**. The manifest is
import-free, so field names would be bare strings that silently stop matching
when a DTO is renamed — a security control whose failure mode is silence.
Stripping lives in typed server code where a rename is a compile error, with
tests asserting each sensitive panel actually omits something.

### `minRole` is verified, not trusted

`ActionDef.minRole` duplicates the `@Roles()` floor already on the controllers —
the exact drift the manifest exists to prevent. It is kept because the admin
matrix needs the ceiling as data at runtime, so the switch for an impossible
grant can render unavailable instead of producing a control that 403s.

It is not hand-trusted. `rbac-matrix.spec` sweeps the real controller classes,
reads `ROLES_KEY` off each handler via `Reflector`, and asserts the manifest
agrees. The same sweep asserts every declared action is wired to a real handler —
an action nobody enforces would be a switch that does nothing, which is worse
than no switch because it reads as a control.

## Security findings fixed along the way

**A manager with no branch was unscoped across the whole business.**
`BranchGuard` returned `true` when `user.branchId == null`, and `User.branchId`
is nullable. Creating a MANAGER without assigning a branch produced an account
that could read every branch. The guard now fails closed: no `all-branches` and
no branch assignment is a 403.

**The dashboard leaked the branch roster past `BranchGuard`.** The "Branches
missing inventory" card called the ungated `GET /branches` and cross-referenced
inventory in the browser, showing every branch manager a roster of every branch
and which ones were behind on data entry. `BranchGuard` never saw it, because
the leak was in a second, unscoped query rather than the guarded one. The
computation moved server-side into `getSummary`, where the branch query is
narrowed by the caller's scope — so a scoped manager can only ever learn about
their own branch.

This is a general class: **a widget assembling data from more than one endpoint
is only as scoped as its least-scoped source.** Panel keys alone do not fix it;
a granted card would still have leaked.

**Supplier reads broke the material stock screen.** Narrowing MANAGER surfaced
this via the existing `screen-dependencies` conformance test: the supplier picker
in the stock-card dialog needs `GET /suppliers`, which was gated at the class
level. Suppliers joined the open catalog reads, matching the existing documented
convention for products, materials and branches. Writes stay gated.

## Role defaults

`MANAGER` is now: dashboard (KPIs, production mix, low stock, branch orders),
quick entry, inventory history (create/edit), adjustments (create/transfer),
production (create/edit), production orders (create/edit), material stock
(create/edit), notifications, low stock, approval queue.

Absent by design: the whole catalog, recipes, imports, jobs, analytics,
cross-branch reporting, `all-branches`, and **every `:delete` action**.

`VIEWER`, `INVENTORY` and `ADMIN` keep what they had. In particular every role
except `MANAGER` is granted `all-branches`, exactly reproducing the old guard,
which only ever scoped `MANAGER`. `INVENTORY` looks like it should be scoped too,
but that is now a switch an admin can flip rather than a decision buried in a
guard.

`ADMIN` holds every key except the two orphan report pages, which nothing links
to and which stay URL-only until switched on deliberately.

## Migration

`20260902000000_rbac_action_and_panel_keys` registers all 89 keys. It is a
migration, not a seed, because both override tables have foreign keys onto
`Feature.key` — until a key has a row, toggling it fails with a constraint
violation rather than saving. It grants nothing: the narrowed MANAGER default is
a code change, reviewable and revertible as one.

**Rollout note.** Existing managers lose the extras on deploy. That is the
intent, but it is a visible change on day one and admins should be told before it
ships, not after.

## Verification

- **882 tests** — 588 server (27 suites), 294 frontend (11 files), 1 skipped.
- The skip is `matches feature_keys.dart exactly`: `louella_mobile` is a sibling
  checkout and is **not present in this workspace**. That test was already
  failing before this work. It now skips when the sibling repo is absent rather
  than reddening a suite about a different codebase.
- Typecheck clean, ESLint clean (0 errors; 26 pre-existing warnings, none in
  files touched here).
- Mutation-checked: forcing the branch-roster gate to always-true fails
  `omits the branch roster and gaps without dashboard:branch-gaps`.

## Not done

- **No Flutter work**, per instruction. `feature_keys.dart` is unchanged and the
  ten mobile contract keys are untouched; every new key is additive.
- **The migration has not been applied to the database.** It is written and
  conformance-tested against the manifest, but not run.
- **`@Roles` still gates the 47 feature-gated endpoints.** Retiring it would make
  the matrix the single authority, but landing that alongside a permission-model
  expansion makes any wrong 403 during rollout ambiguous between two changes.
  It belongs in a follow-up phase.
- **Panel gating beyond the dashboard is endpoint-level only.** Screens other
  than the dashboard hide panels by not calling the endpoint; no other service
  strips fields, because no other shared payload needed it.
