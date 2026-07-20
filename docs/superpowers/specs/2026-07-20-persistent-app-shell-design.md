# Persistent App Shell — Design

**Date:** 2026-07-20
**Status:** Approved (pending spec review)

## Goal

Make the authenticated **Sidebar + Header shell** mount once and persist across
client-side navigation, so it is no longer part of any per-page loading state.
Today the sidebar unmounts and remounts on every navigation; it should stay put
while only the page **content** swaps and shows loading.

## Motivation / current problem

There is only one layout in the app: the root `src/app/layout.tsx`. Every
authenticated page individually renders its own wrapper:

```tsx
return (
  <AuthGuard>
    <AppLayout title="Revenue" ...>
      {pageContent}
    </AppLayout>
  </AuthGuard>
);
```

`AppLayout` renders `Sidebar` + `Header` + `<main>` + `RouteGuard`. Because this
wrapper lives *inside each page* rather than in a shared Next.js layout, the
entire shell (sidebar included) is torn down and rebuilt on every route change.
The sidebar visibly "loads with the page."

Note: the sidebar's nav items are **permission-gated** (`Sidebar.canSee()` reads
`role`/`permissions` from `useAuth()`), so the nav list genuinely depends on auth
state — but that state is global (AuthProvider is in the root `Providers`), so
once hydrated it is stable and the shell has no reason to remount.

## Target architecture

Introduce a **route group** `(app)` whose `layout.tsx` renders the shell once:

```
src/app/
  layout.tsx                 (root — Providers, fonts, Toaster; unchanged)
  page.tsx                   (landing "/" — no shell, unchanged)
  login/ register/ change-password/   (no shell, stay put)
  (app)/
    layout.tsx               (NEW — AuthGuard + Sidebar + Header + <main> + RouteGuard)
    dashboard/ sales/ inventory/ ...  (all authenticated routes moved here)
```

Route groups do **not** affect URLs — `(app)/dashboard/page.tsx` still serves
`/dashboard`. The `(app)/layout.tsx` persists across every navigation within the
group; only `{children}` (the page) changes.

### `(app)/layout.tsx` (new)

A client component that is essentially today's `AppLayout` + `AuthGuard` hoisted
one level up:

- Wraps everything in `<AuthGuard>` (unchanged behavior — shows `AppShellSkeleton`
  during auth hydration, redirects to `/login` when unauthenticated).
- Owns the `collapsed` sidebar state (localStorage-backed) — unchanged logic,
  just relocated. No global store needed for collapse, since the layout owns both
  `Sidebar` and `<main>`.
- Renders `Sidebar`, `Header`, and `<main style={{ marginLeft: sidebarWidth }}>`
  containing `<RouteGuard>{children}</RouteGuard>`.
- The `Header` reads its title/content/actions from the page-header store (below).

### Page-header store (Zustand — approach 3)

The `Header` now lives in the layout, so pages need a channel to feed it their
title and (for one page) stateful controls. Chosen mechanism: a small Zustand
store (Zustand is already a dependency).

`src/lib/pageHeaderStore.ts`:

```ts
import { create } from 'zustand';
import type { ReactNode } from 'react';

type PageHeader = { title: string; content: ReactNode | null; actions: ReactNode | null };

type PageHeaderStore = PageHeader & {
  setHeader: (h: Partial<PageHeader>) => void;
  reset: () => void;
};

const EMPTY: PageHeader = { title: '', content: null, actions: null };

export const usePageHeaderStore = create<PageHeaderStore>((set) => ({
  ...EMPTY,
  setHeader: (h) => set({ ...EMPTY, ...h }),
  reset: () => set(EMPTY),
}));
```

`src/components/layout/usePageHeader.ts` — the hook each page calls:

```ts
export function usePageHeader(header: { title?: string; content?: ReactNode; actions?: ReactNode }) {
  // Runs after every render so dynamic content (e.g. sales' export button state)
  // stays in sync. Header re-render is cheap; the page is the only writer.
  useEffect(() => {
    usePageHeaderStore.getState().setHeader(header);
  });
  // Clear when the page unmounts so a title never leaks to the next route.
  useEffect(() => () => usePageHeaderStore.getState().reset(), []);
}
```

**Flash prevention:** the store title is `''` until the page's effect runs (one
frame after paint). To avoid a blank title on navigation, the layout `Header`
falls back to a `ROUTE_TITLES` lookup (path → title) when the store title is
empty. This map covers the static-title routes; pages still declare their own
title via `usePageHeader`, which wins when present (and is required for dynamic
titles).

### Per-page changes (24 pages)

Each authenticated page is edited to:

1. Remove the `<AuthGuard><AppLayout title=…>` … `</AppLayout></AuthGuard>` wrapper.
2. Return the page **content** directly (whatever was inside `AppLayout`).
3. Add a `usePageHeader({ title: '…' })` call near the top (replaces the old
   `title=` prop). For **sales only**, also pass `content` and `actions`.

Redundant per-page `<TooltipProvider>` wrappers (inventory/details, production,
unit-conversions) are left as-is — harmless; `TooltipProvider` is already global
in `Providers`. Not in scope to remove.

### Folder moves (18 folders → `(app)/`)

Move into `src/app/(app)/`: `branches`, `config`, `dashboard`, `inventory`,
`inventory-adjustments`, `inventory-import`, `material-inventory`, `materials`,
`production`, `production-cost`, `production-efficiency`, `production-orders`,
`products`, `recipes`, `sales`, `settings`, `suppliers`, `unit-conversions`.

Stay at `src/app/` (no shell): `page.tsx` (landing), `login`, `register`,
`change-password`, and the root `layout.tsx` / `error.tsx` / `global-error.tsx` /
`loading.tsx` / `not-found.tsx` / assets.

Imports using the `@/` alias, `next/link` hrefs, and `router.push('/path')` are
unaffected by the group (URLs unchanged). Only **two** `@/app/...` references
point *into* moved folders and must be updated:

- `src/app/(app)/production-orders/page.tsx`: `@/app/production/components/ProductionTabNav`
  → `@/app/(app)/production/components/ProductionTabNav`
- `src/app/(app)/production/orders/page.tsx`: re-export `@/app/production-orders/page`
  → `@/app/(app)/production-orders/page`

### Optional: `(app)/loading.tsx` and `(app)/error.tsx`

Add segment-level `loading.tsx` / `error.tsx` under `(app)` so route-transition
loading and errors render **within** the shell. Optional; the existing root ones
remain as global fallbacks. Will include `(app)/loading.tsx` (reuse the content
skeleton) since it directly reinforces the goal; `(app)/error.tsx` optional.

## Old code disposition

- `src/components/layout/AppLayout.tsx`: its logic moves into `(app)/layout.tsx`.
  After migration it has no consumers → **delete** it.
- `src/components/AuthGuard.tsx`, `Header.tsx`, `Sidebar.tsx`, `RouteGuard.tsx`,
  `AppShellSkeleton`: kept, consumed by the new layout.

## Non-goals

- Making the sidebar shell render statically *during* auth hydration (the "Both"
  option). Hydration still shows `AppShellSkeleton`. Can be revisited later.
- Removing redundant per-page `TooltipProvider`s.
- Any change to routing, auth, or permission logic.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Broken imports after folder moves | Only 2 `@/app/...` refs into moved folders (listed above); everything else is `@/`-alias or intra-folder relative and moves as a unit. Verify with `next build`. |
| Title flash on navigation | `ROUTE_TITLES` fallback in Header. |
| Stale header leaking between pages | `usePageHeader` resets the store on unmount. |
| Dynamic sales header goes stale | `usePageHeader` re-syncs the store on every render. |
| `useLayoutEffect`/SSR warnings | Use `useEffect` (not layout effect); pages are `'use client'`. |

## Verification

1. `npm run lint` — 0 errors.
2. `npm run build` — all routes compile; URLs unchanged (spot-check the route
   table still lists `/dashboard`, `/production/orders`, `/settings/users`, etc.).
3. Manual (dev server on :3000, logged in): navigate between several pages and
   confirm the sidebar does **not** remount/flash — only the content area shows
   loading. Confirm each page's title (and sales' header controls) render.
