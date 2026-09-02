# Mobile-responsive web app

**Date:** 2026-09-02
**Status:** designed, not implemented
**Scope:** the Next.js web app only. No Flutter work.

## Goal

The web app is usable on a phone for **reading and light editing** — dashboards,
lists, detail views, approvals, single-record forms. Bulk grid entry stays a
desktop task and says so, rather than pretending a twelve-column sheet works at
390px.

This is deliberately not full parity. If responsive web is later meant to replace
the Flutter app, the three sheet screens need a purpose-built mobile input
surface, which is a separate project.

## What is actually broken

Measured, not assumed. Several things I expected to be broken are not:

| Checked | Result |
|---|---|
| Viewport meta | **Fine.** Next injects `width=device-width, initial-scale=1` by default. |
| Table overflow | **Fine.** `ui/table.tsx` already wraps in `relative w-full overflow-auto`; 28 files use it. |
| Raw `<table>` | **1 file** — `settings/permissions/page.tsx`. |
| Non-responsive `grid-cols-N` | **3 occurrences.** |
| Pages injecting header content | **1** — `sales`. |
| Dialogs | **14 sites.** `DialogContent` is `w-full max-w-lg` with no max-height and no scroll. |
| App shell | **Structurally desktop-only.** See below. |

### The shell is the load-bearing problem

Three components share a pixel contract driven by one `collapsed` boolean in
`(app)/layout.tsx`:

- `Sidebar` — `fixed inset-y-0 left-0`, rendered at `sidebarWidth`
- `Header` — `style={{ left: sidebarWidth, width: calc(100% - ${sidebarWidth}px) }}`
- `main` — `style={{ marginLeft: sidebarWidth }}`

Neither `Sidebar.tsx` nor `Header.tsx` contains a single breakpoint. The contract
has no way to express "no sidebar at all", which is why nothing below `md` can
work today. Fix this and most screens lay out correctly without being touched.

## Approach

**CSS-first for layout; JS breakpoint switching only where the standard uses it.**

The shadcn convention — confirmed against the registry — is a static sidebar that
becomes a `Sheet` drawer on mobile, driven by a `useIsMobile` hook, and dialogs
that become drawers on mobile. Everything else is Tailwind breakpoints.

**Hand-rolled, not adopted from the registry.** `npx shadcn@latest info` reports
`config: null` — there is no `components.json` and every component here was
vendored by hand. Running `shadcn init` would create one and wants to touch
`src/app/globals.css`, where the warm-artisanal design tokens live on an
unmerged branch. We match the registry's *behaviour and structure* using the
`Sheet` primitive already present. `drawer` is the one exception: there is no
local vaul equivalent, so it is added deliberately.

Container queries are **not** used in this pass. Tailwind v4 supports them
natively and they are the right tool for the sheet screens later, but the only
container that varies here is `<main>`, which a viewport breakpoint already
captures.

**Breakpoint:** `md` (768px) is the shell breakpoint — drawer below, static
sidebar above. One breakpoint, named once, so screens do not each invent their own.

## Phases

### Phase 0 — Foundations

- `src/lib/useIsMobile.ts` — `matchMedia`-based, SSR-safe (returns `false` on the
  server and on first client render, then corrects), subscribed via
  `useSyncExternalStore` so there is no hydration mismatch warning.
- Export the breakpoint as a named constant so the hook and the Tailwind classes
  cannot drift.

### Phase 1 — The shell

Delete the pixel contract.

- `(app)/layout.tsx` — a flex row. No `marginLeft`, no `sidebarWidth` prop
  threading. Holds drawer-open state.
- `Sidebar.tsx` — a normal flex child from `md` up, keeping the existing
  collapse-to-rail behaviour and its `localStorage` persistence. Below `md` its
  same content renders inside a `Sheet` with `side="left"`.
- `Header.tsx` — a flow child. No `left`/`width` computation. Gains a hamburger
  trigger below `md`; the collapse toggle stays desktop-only.

**Constraint:** the RBAC work that just landed derives nav from
`navigationFor(permissions)` and is covered by 12 Sidebar tests and 13 RouteGuard
tests. All must keep passing untouched — this refactor changes layout, never
which items a role sees.

### Phase 2 — Dialogs

- `ui/dialog.tsx` — add `max-h-[90dvh] overflow-y-auto` and mobile-width sizing to
  `DialogContent`. This alone fixes the worst failure: a tall form whose submit
  button is unreachable on a phone. `dvh` not `vh`, so mobile browser chrome does
  not clip it.
- Add `drawer` (vaul).
- `src/components/ui/responsive-dialog.tsx` — renders `Drawer` below `md`,
  `Dialog` above, with one API. Both need a title for accessibility.
- Convert the 14 dialog sites. The four in `material-inventory` and `inventory`
  are the ones that matter most; they are on the data-entry path.

### Phase 3 — Screen sweep

- `settings/permissions/page.tsx` — the one raw `<table>` becomes `<Table>`. Its
  role matrix is 5 columns wide and needs a sticky first column to be legible
  while scrolled.
- The 3 non-responsive `grid-cols-N` get `sm:`/`md:` prefixes.
- `sales` — its injected header controls need to wrap or move into the page body
  below `md`.
- Touch targets: audit icon-only buttons for a 44px minimum hit area.

### Phase 4 — The three sheet screens

`/inventory/details`, `/material-inventory`, `/production`.

These keep their desktop shape. They get:

- a guaranteed horizontal scroll container with a **sticky first column**, so the
  row's identity stays visible while scrolling
- an explicit, dismissible notice below `md` that entry works best on a larger
  screen

No mobile grid-entry UI. That is the honest position given the scope, and the
notice states it rather than leaving the user to discover it.

### Phase 5 — Verification

- **Component tests** driving `matchMedia` to assert the shell renders a drawer
  below the breakpoint and a static sidebar above, and that nav contents are
  identical in both.
- **Playwright MCP walk** at 390 / 768 / 1280, checking every screen for
  horizontal body overflow — asserted as
  `document.documentElement.scrollWidth <= innerWidth`, which is the objective
  version of "does it look broken".
- Existing suites stay green: 588 server, 294 frontend.

## Risks

- **The design-system branch.** `feature/landing-page-ui-refresh` reworks
  `globals.css` and the visual language. Shell changes will conflict. Sequence
  this after that merges, or accept a manual merge in `layout.tsx` and `Header.tsx`.
- **`Sheet` is used for two different things.** shadcn's `Sheet` primitive is the
  drawer; the project's "sheet" module (`src/components/sheet/`) is the
  spreadsheet. Same word, unrelated. Naming in code review will be confusing —
  refer to the latter as the grid.
- **Drawer adds a dependency.** vaul is small and is the shadcn standard, but it
  is a new runtime dependency on a single-deploy Vercel project.

## Out of scope

- Any Flutter work.
- Mobile grid entry for the three sheet screens.
- Container queries.
- Card-stacked table layouts. Horizontal scroll is the chosen baseline and is
  already the status quo.
