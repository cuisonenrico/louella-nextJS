# Mobile-responsive web app

**Date:** 2026-09-02 (revised after a full audit)
**Status:** designed, not implemented
**Scope:** the Next.js web app only. No Flutter work.
**Plan:** `docs/superpowers/plans/2026-09-02-mobile-responsive.md`

## Goal

The web app is usable on a phone for **reading and light editing** — dashboards,
lists, detail views, approvals, single-record forms. Bulk grid entry stays a
desktop task and says so, rather than pretending a twelve-column sheet works at
390px.

This is deliberately not full parity. If responsive web is later meant to replace
the Flutter app, the three grid screens need a purpose-built mobile input
surface, which is a separate project.

## The standards this is measured against

Cited so the numbers in the plan are traceable to something, not invented.

| Concern | Standard | What we adopt |
|---|---|---|
| Touch target | WCAG 2.2 **2.5.8 (AA)** = 24×24 CSS px; **2.5.5 (AAA)** = 44×44. Apple HIG 44pt, Material 48dp. | **44px for primary controls below `md`**; 24px is the absolute floor everywhere. Grid cells are exempt — see *Deliberate exemptions*. |
| Form zoom | iOS Safari zooms the viewport when a focused input's `font-size` < 16px. `user-scalable=no` "fixes" it by breaking WCAG 1.4.4. | `text-base md:text-sm` on inputs — 16px on phones, unchanged on desktop. |
| Viewport height | `vh` is the *large* viewport; it overflows while mobile browser chrome is showing. | `dvh` for any capped height. |
| Notches / home indicator | `env(safe-area-inset-*)` returns 0 unless the viewport meta carries `viewport-fit=cover`. | Add a Next `viewport` export; pad the bottom sheet and any fixed bottom edge. |
| Wide tables | Card-stacking aids scanning one record; horizontal scroll preserves cross-column comparison. Consensus for dense operational tables: scroll, but with a **frozen identity column** and a sticky header. | Scroll container everywhere + sticky first column on the grid screens. No card stacking. |
| Shell breakpoint | shadcn's own Sidebar switches to a Sheet at `md` and drives width from CSS variables. | `md` (768px), named once. |

**Sources:** [WCAG 2.5.8 target size](https://testparty.ai/blog/wcag-target-size-guide) ·
[WCAG 2.5.5 (AAA)](https://dequeuniversity.com/resources/wcag2.1/2.5.5-target-size) ·
[16px prevents iOS form zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/) ·
[Defensive CSS: input zoom](https://defensivecss.dev/tip/input-zoom-safari/) ·
[safe-area-inset layouts](https://polypane.app/blog/using-safe-area-inset-to-build-mobile-safe-layouts/) ·
[responsive data-table patterns](https://blog.logrocket.com/improving-responsive-data-table-ux-css/) ·
[shadcn Sidebar](https://ui.shadcn.com/docs/components/base/sidebar)

## Audit

Measured against the working tree at `18f459a`. Several things I expected to be
broken are not, and two things I previously reported were wrong.

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | **Every text input triggers an iOS zoom.** `Input`, `Textarea` and `SelectTrigger` are all `text-sm` (14px). Focusing any field on an iPhone zooms the viewport and leaves it zoomed. | `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx:19` | High |
| F2 | **The shell has no breakpoint at all.** `Sidebar`, `Header` and `main` share a pixel contract with no way to express "no sidebar". Neither component file contains one `md:`. | `(app)/layout.tsx:36-46`, `Sidebar.tsx:88`, `Header.tsx:32-35` | High |
| F3 | **Dialogs have no height cap.** `DialogContent` is `w-full max-w-lg` with no `max-h` and no scroll, so a tall form's submit button is unreachable on a phone. 14 sites. | `ui/dialog.tsx:38` | High |
| F4 | **Permission-gated cards leave holes in fixed-column grids.** Both dashboard rows are `lg:grid-cols-3` with conditionally-rendered children. A MANAGER holds `branch-orders` + `low-stock` but not `branch-gaps` → two cards in a three-column grid. The charts row is 2-of-3 even for an admin. | `dashboard/page.tsx:115,184` | Medium |
| F5 | **No `viewport-fit=cover`.** There is no `export const viewport` anywhere, so `env(safe-area-inset-*)` evaluates to 0 and a bottom sheet sits under the home indicator. | `src/app/layout.tsx` | Medium |
| F6 | **Grid height cap uses `vh`.** `SHEET_CONTAINER` is `max-h-[70vh]`, which overflows while mobile browser chrome is visible. | `components/sheet/styles.ts:20` | Medium |
| F7 | **`sales` injects header controls that cannot wrap.** A branch `Select` at `h-6 text-xs` (24px tall, 12px text) plus an export `Button`, all in the fixed header row. | `sales/page.tsx:101-128` | Medium |
| F8 | **One raw `<table>`.** The permissions matrix. 5 columns, no scroll container, no sticky identity column. | `settings/permissions/page.tsx:173` | Medium |
| F9 | **Two rigid `grid-cols-2`.** | `recipes/page.tsx:247`, `settings/users/page.tsx:654` | Low |
| F10 | **Sub-24px controls.** Sidebar collapse toggle `h-8 w-8`; `Button size="icon"` is `h-10 w-10` (passes AA, fails the 44px guideline). | `Sidebar.tsx:122`, `ui/button.tsx:24` | Low |

### Checked and already fine

| Checked | Result |
|---|---|
| Viewport meta | Next injects `width=device-width, initial-scale=1` by default. Only `viewport-fit` is missing (F5). |
| Table overflow | `ui/table.tsx` already wraps in `relative w-full overflow-auto` and takes a `containerClassName`. 28 files use it. |
| Dashboard grids | Already `grid-cols-1 lg:grid-cols-3` — responsive. The problem is the *column count*, not the breakpoint (F4). |
| Panel gating | `revenueUnavailable = !canRevenue || …` — the revenue card is genuinely gated, not just its row. |

### Two corrections to earlier claims

- **`ProductionSheet` already has a sticky first column** (`sticky left-0 z-30`,
  `ProductionSheet.tsx:95,162`). I had said all three grid screens needed one.
  Only `InventoryTypeTables` and `material-inventory` do — and `ProductionSheet`
  is the reference implementation to copy, including its `stickyBg` handling for
  dirty/over-allocated rows.
- **`src/lib/sheet` does not exist.** The grid module is `src/components/sheet`
  alone (5 files).

## Approach

**CSS-first for layout; JS breakpoint switching only where the standard uses it.**

The shadcn convention is a static sidebar that becomes a slide-out panel on
mobile at `md`, and modals that become bottom sheets on mobile. Everything else
is Tailwind breakpoints.

**Hand-rolled, not adopted from the registry.** `npx shadcn@latest info` reports
`config: null` — there is no `components.json` and every component here was
vendored by hand. More decisively, the registry now defaults to **Base UI**
(`docs/components/base/…`, api on `base-ui.com`) while this project is entirely
Radix (`@radix-ui/*` ×19). `npx shadcn add drawer` would drop a Base UI
component into a Radix codebase.

**No new dependency.** *(Reversed from the first draft, which added `vaul`.)* The
local `ui/sheet.tsx` already has a `bottom` side variant on the same Radix
Dialog primitive the Dialog uses. `ResponsiveDialog` renders `Dialog` above `md`
and `Sheet side="bottom"` below it — same a11y model, same jsdom shims already
in `vitest.setup.ts`, zero bytes added. The cost is no drag-to-dismiss; for an
internal ERP that is not worth a runtime dependency on a single-deploy project.

Container queries are **not** used in this pass. Tailwind v4 supports them and
they are the right tool for the grid screens later, but the only container that
varies here is `<main>`, which a viewport breakpoint already captures. The one
place we do use intrinsic sizing is F4's `auto-fit` grid, which needs no query.

## RBAC integration

The permission model landed in `87ddd7f` and this work must not perturb it. Four
concrete couplings:

**1. One nav source.** The drawer renders the *same* `SidebarContent`, from the
same `navigationFor(permissions)` call. A second nav source could drift and
offer a manager a link `RouteGuard` then bounces. Enforced by a test that
asserts the drawer's item list equals the desktop aside's for an identical
permission set — not by convention.

**2. Layout must follow the granted panel count, not a hardcoded one (F4).**
This is the interaction the two features have with each other. Narrowing MANAGER
means the dashboard now renders a *variable* number of cards, and a
`lg:grid-cols-3` row cannot express that. The fix is an intrinsic layout —
`grid-cols-[repeat(auto-fit,minmax(20rem,1fr))]` — where the column count is a
function of how many children survived their `useCan`. It is also what makes the
row responsive for free, so it replaces the breakpoint rather than adding to it.

**3. Gates move with the controls they guard.** When `sales` moves its header
controls into the page body below `md`, the branch `Select` (options come from
the `BranchGuard`-scoped `branchesApi`) and the export `Button` must move as one
gated unit. Rendering the mobile copy outside the gate would be a client-side
permission bypass of exactly the kind `screen-dependencies.spec.ts` exists to
catch.

**4. Notices render inside the guard.** The small-screen notice on the grid
screens goes inside the permission-gated body. Above it, a user who cannot open
the screen would still be told how to use it.

Out of bounds for this work: `src/lib/rbac/features.ts`, `navigationFor`,
`RouteGuard`, and every server guard. **12 Sidebar tests and 13 RouteGuard tests
must pass unedited at every step** — that is the proof this changed layout and
nothing else.

## Phases

### Phase 0 — Foundations
`useIsMobile` (`matchMedia` + `useSyncExternalStore`, SSR snapshot `false`),
with the breakpoint exported as a constant so CSS and JS cannot drift. Plus the
Next `viewport` export carrying `viewport-fit=cover` (F5).

### Phase 1 — Primitives
The fixes that pay off across every screen at once, before touching any screen:
- `Input` / `Textarea` / `SelectTrigger` → `text-base md:text-sm` (F1)
- `DialogContent` → `max-h-[90dvh]`, scrolling body, mobile width (F3)
- `SHEET_CONTAINER` → `dvh` (F6)

### Phase 2 — The shell
Delete the pixel contract (F2). `SidebarContent` extracted; `<aside>` is
`hidden md:flex`; below `md` the same content renders in a `Sheet side="left"`
opened from a header hamburger. Header becomes a flow child.

### Phase 3 — Screen sweep
The permissions matrix table (F8), the two rigid grids (F9), the `sales` header
(F7), and the dashboard's `auto-fit` rows (F4).

### Phase 4 — Dialogs
`ResponsiveDialog` (Dialog ↔ bottom Sheet) and the conversion of the four
data-entry dialogs that matter most. The other ten already work once F3 lands.

### Phase 5 — The three grid screens
Sticky identity column on the two that lack it, copying `ProductionSheet`. A
dismissible below-`md` notice, inside the permission gate.

### Phase 6 — Verification
Component tests driving `matchMedia`; a Playwright walk at 390 / 768 / 1280
asserting `documentElement.scrollWidth <= clientWidth` per screen and measuring
tap targets; 588 server + 294 frontend still green.

## Deliberate exemptions

- **Grid cells stay 32px** (`SHEET_CELL h-8`, `SheetInput h-8`). Enlarging them
  to 44px would halve the rows visible on the desktop screens these are built
  for, to benefit a phone workflow we are explicitly not shipping. The notice
  states the constraint instead.
- **No card-stacking** for tables. Horizontal scroll with a frozen first column
  is the chosen baseline and is already the status quo.
- **AAA touch targets are a target below `md` only.** Desktop pointer input does
  not need them and widening every icon button globally would reflow the header
  and toolbars on the screens that are working today.

## Risks

- **The design-system branch.** `feature/landing-page-ui-refresh` reworks
  `globals.css` and `Header.tsx`. Shell changes will conflict; expect a manual
  merge in `layout.tsx` and `Header.tsx`.
- **`Sheet` means two unrelated things.** `src/components/ui/sheet.tsx` is the
  Radix slide-out; `src/components/sheet/` is the spreadsheet module. Call the
  latter **the grid** in code review.
- **F1 changes every form's rendered size on mobile.** 16px inputs are taller
  and wider than 14px ones; dense filter bars will reflow. That is the point,
  but it is a visible change, not a no-op.

## Out of scope

Flutter. Mobile grid entry. Container queries. Card-stacked tables.
Retiring `@Roles` (a separate RBAC follow-up).
