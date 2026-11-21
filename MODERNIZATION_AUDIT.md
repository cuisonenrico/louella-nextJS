# Modernization audit — louella-nextJS

Audit date: 2026-11-21. Branch: `chore/modernization` (from master `97d1630`).
Status: **Phase 1 complete; Phase 2 in progress** (see `PROGRESS.md`).

## Stack (detected)

| Area | What is there |
|---|---|
| Framework | Next.js **16.4.4**, App Router only (no `pages/`), Turbopack build |
| React | 19.2.4 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), shadcn/ui on Radix, tokens in `src/app/globals.css` |
| Fonts | `next/font/google` (Inter, Fraunces) in `src/app/layout.tsx` |
| Data | TanStack Query 5 over axios (`src/lib/api.ts`, `src/lib/apiServices.ts`); API is NestJS 11 inside the same deployable (`src/app/api/v1/[...path]`) |
| Auth | JWT access token **in memory only** (`src/lib/tokenStore.ts`), HttpOnly refresh cookie; `AuthGuard` + `RouteGuard` on the client |
| State | Zustand (page header, UI), AuthContext |
| Tests | Vitest (609), Jest (1,345), Playwright e2e (177 across desktop / iPad / phone) |
| TypeScript | `strict: true`; **0** `any` in frontend code, 2 in server code |

## 1. Baseline metrics

`next build` (Turbopack) — 42 page routes: **38 static, 4 dynamic** (`/employees/[id]`,
`/payroll/[periodStart]`, `/payroll/payslips/[id]`, `/payroll/runs/[id]/print`), plus the
`/api/v1/[...path]` handler. `/` is ISR (5 min).

Next 16 no longer prints route sizes, so `scripts/measure-first-load.mjs` (added) sums the
chunks each prerendered page loads up front.

| Route | First Load JS (gzip kB) |
|---|---:|
| `/` (landing) | 249.5 |
| `/login` | 254.2 |
| typical app page (`/branches`, `/materials`, …) | 292–313 |
| `/inventory/details` | 330.6 |
| `/settings/landing` | 352.5 |
| `/inventory/rejections` | **410.3** |
| `/sales` | **415.2** |
| `/dashboard` | **416.1** |

All client JS: **728.5 kB gzip** (2,333 kB raw) in 68 files.

Heaviest client modules (`next analyze`, compressed, deduplicated across chunks):

| # | Module | kB | Loaded on | Imported from |
|---|---|---:|---|---|
| 1 | app source (`src/`) | 308.0 | 42 routes | — |
| 2 | `next` (incl. React DOM runtime) | 238.1 | 42 | framework |
| 3 | **`recharts`** (+ `d3-*`, `@reduxjs/toolkit`, `es-toolkit`) | **~156** | 3 | `dashboard/page.tsx`, `dashboard/components/RevenueTrendCard.tsx`, `sales/page.tsx`, `inventory/rejections/page.tsx` |
| 4 | `lucide-react` | 44.7 | 41 | icons everywhere (already per-icon imports) |
| 5 | `zod` | 33.2 | 1 | `src/lib/landing/schema.ts` (landing editor only) |
| 6 | `axios` | 24.3 | 41 | `src/lib/api.ts` |
| 7 | `@tanstack/query-core` | 13.1 | 41 | Providers |
| 8 | `@radix-ui/react-label` | 9.9 | 24 | forms |
| 9 | `sonner` | 9.0 | 41 | root Toaster |
| 10 | `tailwind-merge` | 7.9 | 41 | `cn()` |

## 2. Architecture

- **`"use client"`**: 149 files; 37 of 40 pages are client components. This is a consequence of
  the auth design, not an oversight: the access token lives only in browser memory (deliberately,
  against XSS), so a Server Component **cannot** fetch the user's data. Moving data fetching to the
  server means cookie-based server auth — an auth/data-layer rewrite → **Needs human decision**.
  The public landing page (`/`) is already a Server Component reading Prisma directly, cached with
  `unstable_cache` and revalidated on publish.
- **Data fetching**: all reads go through TanStack Query (no raw `useEffect` fetches found; the six
  `useEffect` + API files only sync form state). Independent queries run in parallel; query keys
  dedupe. No waterfalls found of the kind `Promise.all` would fix.
- **Legacy patterns**: none. No Pages Router leftovers, no `getServerSideProps`, no
  `next/legacy/image`, no `<img>` tags (5 files use `next/image`), config is current.

## 3. Performance

- **P1 — recharts on first load** (`dashboard`, `sales`, `inventory/rejections`): ~110 kB gzip more
  than other pages, though the charts sit below the KPIs/tables and need data first anyway.
  → lazy-load with `next/dynamic` and a chart-sized placeholder.
- Images: `next/image` everywhere images exist; landing hero uses it. Fonts: `next/font` (no CLS from
  font swap). Third-party scripts: none. `zod` is already limited to the landing editor route.
- LCP/INP/CLS risks: authenticated pages render a shell skeleton during the auth bootstrap
  (`AppShellSkeleton`), then each page its own skeleton — low CLS. Main INP risk is large sheets
  (inventory, production), already memoised.

## 4. Loading & async UX

| Concern | Finding | Rank |
|---|---|---|
| Route-level loading | Only `src/app/loading.tsx` (a full-page spinner) exists. It sits **above** the `(app)` layout, so a soft navigation between app pages shows nothing until the next page is ready. Sidebar items are `<button>` + `router.push` (no prefetch), so the wait is real on a slow line. | **P1** |
| Page-level skeletons | Every data page has `isLoading` skeletons + `QueryError` with retry, except **`/branch-cash`**, which renders nothing while its summary loads. | **P1** |
| Pending states | Mutations show pending/disable on submit almost everywhere. Gaps: `branch-cash/_components/CategoriesDialog.tsx` (rename / reorder / toggles fire while a previous update is in flight — reorder sends two writes), `settings/payroll/_components/HolidaysCard.tsx` (delete not disabled while pending). | **P1** |
| Optimistic UI | Not used; the sheet stages edits locally then saves in one PATCH, which is the right model for counts. Optimistic toggles would hide refusals from the server's locks. | P2 (leave) |
| Error boundaries | Root `error.tsx` + `global-error.tsx` exist, but **no `(app)/error.tsx`**: a render error in any app page replaces the whole shell (sidebar and header disappear) instead of just the content. | **P1** |
| Not found | Root `not-found.tsx` styled, links to dashboard. | ok |
| Empty states | Pages show "No … yet" messages; sheets explain what to select. | ok |

## 5. UX & accessibility

| Finding | File | Rank |
|---|---|---|
| Active sidebar item is only visual: no `aria-current="page"`. | `src/components/layout/SidebarContent.tsx` | **P1** |
| No "Skip to content" link; keyboard users tab through the whole sidebar on every page. | `src/components/layout/AppShell.tsx` | **P1** |
| Browser tab title is "Louella Bakery" on every page (pages set an in-app header only). | `src/components/layout/usePageHeader.ts` | **P1** |
| Sidebar items don't prefetch their route (buttons, not links). | `SidebarContent.tsx` | P1 |
| `prefers-reduced-motion` honoured for the marquee; Tailwind `animate-*` used elsewhere (spinners, pulses) is not reduced. | `globals.css` | P2 |
| Inputs are 16px on phones (no iOS zoom), tap targets 44px on phones (toggle/button sizes). | — | ok |
| Metadata: root title/description, favicon and icon via file conventions. Open Graph for the public page missing. | `src/app/layout.tsx` | P2 |

## 6. Code health

`strict: true`, almost no `any`, lint clean, tests broad. Dependencies: all used (`passport` is a
runtime peer of `@nestjs/passport`). Next 16.4.4 has a patch advisory (fixed in 16.4.6). `npm audit`
flags `prisma` (ReDoS in its CLI) with a major-version fix only.

## Phased plan (as executed)

1. **Foundations** — measurement script; ignore scratch output. No config/API fixes needed.
2. **Server/client boundaries** — no change (see Needs human decision).
3. **Loading** — `(app)/loading.tsx` content skeleton inside the shell, shown after a short delay;
   `/branch-cash` skeleton; pending guards in CategoriesDialog and HolidaysCard.
4. **Errors** — `(app)/error.tsx` that keeps the shell and offers retry.
5. **Performance** — lazy-load recharts on the three chart pages.
6. **UX/a11y** — `aria-current`, skip link, per-page document titles, prefetch sidebar routes on
   hover/focus, reduced-motion for animations.
7. **Cleanup** — remove what the above makes dead.

## Decisions made

- Autonomy mode: Phase 1 did not stop for approval (second instruction overrides the first).
- Work on branch `chore/modernization`, one commit per task, not pushed. Unrelated uncommitted seed
  files are left out of every commit.
- Builds and measurements use `.env.e2e` (local throwaway DB), never `.env` (production).
- Page titles set from the existing `usePageHeader` hook (`document.title`) rather than a
  `layout.tsx` with `metadata` per route: 37 pages are client components and the header title is
  already the single source of truth.

## Needs human decision

- **Next.js 16.4.4 → 16.4.6** (patch, security advisories). Not done: dependency change.
- **Server-side data fetching** for app pages: requires cookie-based auth on the server (the access
  token is deliberately memory-only). Auth/data-layer change.
- **Sidebar as `<Link>`**: real links would give middle-click/open-in-new-tab, but navigation goes
  through `guardNavigation` (unsaved-changes guard). Changing it touches that guard on every page.
- **Content-Security-Policy**: still off (documented in `next.config.ts`); needs a nonce design.

## Blocked

(none yet)
