# Modernization audit — louella-nextJS

Audit date: 2026-11-21. Branch: `chore/modernization` (from master `97d1630`).
Status: **complete** (see `PROGRESS.md`). Rebased onto master `7e4370b` (payroll companies) on 2026-11-21.

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

## What changed (Phase 2)

| Phase | Change | Files |
|---|---|---|
| 1 Foundations | First Load JS measurement (Next 16 prints no sizes); root `error.tsx` reads 16.4's `retry` prop | `scripts/measure-first-load.mjs`, `src/app/error.tsx` |
| 2 Boundaries/data | No change — see *Needs human decision* | — |
| 3 Loading | Sidebar click shows a spinner on its item until the next page renders (`useTransition` around `router.push`), screen-reader "Loading page"; prefetch on hover/focus. `/branch-cash` placeholder table. Category controls and holiday delete disabled while their write is in flight. Holiday list skeleton. | `src/components/layout/SidebarContent.tsx`, `src/app/(app)/branch-cash/page.tsx`, `…/_components/CategoriesDialog.tsx`, `src/app/(app)/settings/payroll/_components/HolidaysCard.tsx` |
| 4 Errors | `(app)/error.tsx`: a crashing page keeps sidebar + header, retry also drops the query cache | `src/app/(app)/error.tsx` |
| 5 Performance | Recharts loads after the page via `next/dynamic`, same-height placeholders | `src/components/charts/*`, dashboard, sales, rejections pages |
| 6 UX/a11y | `aria-current="page"` on the active nav item; skip-to-content link; browser tab titled per page; reduced motion makes transitions/decorative animation instant (spinners keep turning) | `SidebarContent.tsx`, `AppShell.tsx`, `Header.tsx`, `globals.css` |
| Payroll (requested mid-run) | `/payroll` is a dashboard: current cutoff (projected net pay, employees, holidays, blocking/review counts, days left), year so far, *Waiting on you* (ended cutoffs still open since payroll began; runs not marked paid), net pay per cutoff chart, started cutoffs (phone list). Cutoff page: Open → Finalized → Paid steps, totals of the payslips on screen, search / company / warnings-only filters, finalize bar kept in reach. | `src/app/(app)/payroll/**`, `src/lib/payroll/dashboard.ts`, `src/components/charts/PayrollTrendChart.tsx` |
| Bug found by the run | **Deadlock** between on-demand autofill and a production-order finalize (Postgres 40P01): autofill locked inventory chains, then inserted production rows without the production lock. It now takes production keys first, the fixed order in `stock-chain.ts`. This came from the 2026-11 audit fix already on master. | `src/server/jobs/jobs.service.ts` |

Tests added: `e2e/full/app-shell-ux.spec.ts` (8), `e2e/full/payroll-dashboard.spec.ts` (2),
`src/lib/payroll/dashboard.spec.ts` (12), autofill lock-order unit test.

## Before / after

First Load JS (gzip kB, `scripts/measure-first-load.mjs`):

| Route | Before | After | Δ |
|---|---:|---:|---:|
| `/dashboard` | 416.1 | 308.3 | **−107.7** |
| `/sales` | 415.2 | 307.1 | **−108.1** |
| `/inventory/rejections` | 410.3 | 305.8 | **−104.5** |
| `/payroll` | 293.8 | 299.7 | +5.9 (dashboard; its chart is lazy) |
| `/inventory/details` | 330.6 | 331.9 | +1.4 |
| other app pages (`/branches`, `/branch-cash`, …) | ~293–310 | +1.3–1.4 | shell additions |
| `/`, `/login` | 249.5, 254.2 | 249.6, 254.3 | ±0.1 |

Routes: 38 static / 4 dynamic before and after. All client JS: 728.5 → 746.9 kB gzip — more,
but split: the charts (and the payroll dashboard and the companies feature that arrived with the
rebase) are separate chunks fetched only where used.

Lighthouse (mobile preset, simulated throttling, single run each — treat ±5 as noise):

| Route | Perf | A11y | LCP | CLS | TBT |
|---|---|---|---|---|---|
| `/login` before → after | 78 → 83 | 96 → 96 | 4.8 s → 4.8 s | 0 → 0 | 260 → 60 ms |
| `/` before → after | 70 → 78 | 100 → 100 | 6.0 s → 5.9 s | 0 → 0 | 350 → 60 ms |

Authenticated pages can't be audited by the Lighthouse CLI (the token is memory-only); the
chart pages' gain is the First Load JS table above. Verification on the final build: typecheck,
lint, Vitest 622, Jest 1,395, Playwright desktop 92 / iPad 81 / phone 31 — all passing.
Screenshots: `ux-review/` (desktop 1366 px and phone 412 px; key routes, loading, error, 404).

## Deliberately left alone

- **Optimistic updates**: counts and payroll are guarded by server locks; optimistic UI would
  show a write the server then refuses.
- **`(app)/loading.tsx`**: tried and removed. With the segment-cache router a sibling navigation
  keeps the old page until the new one is ready, so it never showed; the sidebar spinner is the feedback.
- **Landing page LCP**: it comes from Lighthouse's simulated slow 4G (render delay of server-rendered
  text, no data wait); nothing in the page holds it back.

## Remaining P2 / next steps

- Open Graph metadata for the public page.
- A history screen for the audit trail (production orders, adjustments).
- Phone drawer navigation gives no pending feedback (the drawer closes at once).

## Manual QA (risky changes)

1. **Autofill vs finalize** (lock order): open `/production/orders` on two devices; finalize an order
   while another opens `/inventory/details` for a new day. Both succeed; no "Internal server error".
2. **Error boundary**: any page that fails to render now shows *This page ran into a problem* with the
   menu still there; *Try again* reloads its data.
3. **Payroll dashboard**: the figures match the cutoff page and the runs; *Waiting on you* lists only
   cutoffs since payroll started plus the one just ended.
4. **Reduced motion** (OS setting on): dialogs and sheets open without animation; spinners still turn.

## Decisions made

- Autonomy mode: Phase 1 did not stop for approval (second instruction overrides the first).
- Work on branch `chore/modernization`, one commit per task, not pushed. Unrelated uncommitted seed
  files are left out of every commit. Rebased onto master after the user asked.
- Builds and measurements use `.env.e2e` (local throwaway DB), never `.env` (production).
- Port 4100 was held by another checkout's e2e server (`louella-nextJS-payroll-companies`); runs used
  4200 through temporary, uncommitted edits, now reverted.
- Page titles from the existing `usePageHeader` store (`document.title`), not per-route `layout.tsx`.
- Payroll chart bars use `#C2570A`: the brand orange is 2.7:1 against the card (validator), under 3:1.

## Needs human decision

- **Next.js 16.4.4 → 16.4.6** (patch, security advisories; `next build` stops on every other run).
- **Brand orange contrast**: white text on `--primary` is ~2.9:1 (Lighthouse flags the login button).
  Fixing it changes the brand colour.
- **Server-side data fetching** for app pages: needs cookie-based auth on the server.
- **Sidebar as `<Link>`**: would add open-in-new-tab, but touches the unsaved-changes guard.
- **Content-Security-Policy**: still off (documented in `next.config.ts`); needs a nonce design.

## Blocked

(none)
