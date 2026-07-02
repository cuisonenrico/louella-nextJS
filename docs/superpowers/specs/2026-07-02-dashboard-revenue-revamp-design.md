# Dashboard Revamp + Revenue Page Improvements — Design

**Date:** 2026-07-02
**Status:** Approved
**Scope:** `louella-web` only. Frontend-only — no backend changes.

## Goal

Make the dashboard operationally useful (today's numbers, not catalog counts),
visually consistent with the new warm-artisanal theme, and fix the overlong
Low Stock Alerts card. Improve the Revenue page with a chart and copy fixes.

## Decisions (confirmed with owner)

- KPI cards become **operational**: today's revenue, items sold, production
  yield, low-stock count. Catalog counts removed.
- Low stock shows **top 5 by severity** (stock as % of reorder level, worst
  first) + "View all N" link. No pagination.
- Bottom **Products and Branches catalog lists removed**.
- **Frontend-only**; all data comes from existing endpoints.

## Data sources (all existing)

- `dashboardApi.summary(today)` — stats, production byType, lowStock list.
- `inventoryApi.dashboard(weekAgo, today)` — totalRevenue, totalSold,
  dailyBreakdown (per-day revenue/sold/delivery/leftover). Queried once for
  the trailing 7 days; today's KPI values come from the last entry of
  `dailyBreakdown` matching today.
- `productionOrdersApi.byDate(today)`, `branchesApi.list()`,
  `inventoryApi.byDateRange(today)` — unchanged (orders, coverage).

**Error handling:** if the `/inventory/dashboard` query errors (e.g. a role
without analytics access), the revenue/sold KPI cards render an em-dash with
"unavailable" subtitle and the revenue trend card is hidden. The rest of the
dashboard is unaffected. Existing error handling for `dashboardApi.summary`
stays (page-level destructive alert).

## Dashboard layout (top → bottom)

1. **Greeting** — serif heading, no emoji, date line kept.
2. **KPI row** (4 cards): Today's Revenue (₱), Items Sold, Production
   (pcs today, from `data.production.totalYield`), Low Stock (count;
   destructive tint when > 0, links to /material-inventory).
3. **Charts row**: Revenue trend (lg:col-span-2) — 7-day area chart, crust
   orange, tooltip shows revenue/sold/delivered/leftover per day; Production
   mix donut (existing, recolored: BREAD=crust `#F4780B`, CAKE=ube `#6B3FA0`,
   SPECIAL=`#2e7d32`, MISCELLANEOUS=`#8B7355`).
4. **Operations row** (3 cards): Branch Orders Today (adds a thin
   draft-vs-finalized progress bar), Inventory Coverage (unchanged logic),
   Low Stock top-5 severity card.
5. **Wastage Analysis** (RejectionByProductCard) unchanged.

### Component extraction

`src/app/dashboard/page.tsx` (~370 lines) delegates to new focused files in
`src/app/dashboard/components/`:

- `KpiRow.tsx` — the 4 KPI cards. Props: `revenue: number | null`,
  `sold: number | null`, `productionYield: number`, `lowStockCount: number`
  (null = unavailable → em-dash).
- `RevenueTrendCard.tsx` — props: `days: { date, revenue, sold, delivery,
  leftover }[]` (the 7-day dailyBreakdown).
- `LowStockCard.tsx` — props: `items: LowStock[]` (full list; card sorts by
  severity and slices 5 itself, link shows full count).

Orders/coverage/production-mix cards stay in `page.tsx` (small edits only).

## Revenue page (`src/app/sales/page.tsx`)

1. **Daily revenue chart** card between the metric cards row and the daily
   table: Recharts `ComposedChart` — revenue bars (crust) on left axis, sold
   line (ube) on right axis, X = day. Uses the already-fetched
   `dashboard.dailyBreakdown`; hidden when < 2 days of data.
2. Copy fixes: "Weekly Breakdown" → "`{N}-day range`" computed from the
   picked dates; Waste & Rejects card label "Critical Threshold" → "Rejected".
3. Revenue-by-category bars: per-type theme colors (same map as production
   donut) and a percent label next to each amount.
4. Status chips recolored to theme: RECORD=primary, PEAK=secondary,
   HIGH=accent-foreground on accent, STABLE=muted (labels/logic unchanged).
5. 🏆 emoji → `Trophy` lucide icon.
6. Table, date search, CSV export, zero-sales card unchanged.

## Shared bits

`PRODUCT_TYPE_COLORS` map (BREAD/CAKE/SPECIAL/MISCELLANEOUS) currently exists
only inside the dashboard page; move to `src/lib/productTypeColors.ts` and
consume from both pages.

## Testing / verification

- `npm run build`, `npm run lint`, `npm run test` pass.
- Playwright visual pass: login against a **local** backend (env overrides
  `NEXT_PUBLIC_API_URL` + backend `ALLOWED_ORIGINS`, seed credentials from
  `louella-be/prisma/SEED_CREDENTIALS.md`), screenshot dashboard and revenue
  pages. Never authenticate against the production API for this.

## Out of scope

- Backend changes, new endpoints, week-over-week comparisons.
- Changes to Wastage Analysis, inventory coverage logic, CSV export.
