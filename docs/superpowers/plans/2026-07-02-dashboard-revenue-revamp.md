# Dashboard Revamp + Revenue Page Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operational KPI dashboard with a 7-day revenue trend chart and a severity-capped low-stock card, plus a daily revenue chart and copy fixes on the Revenue page.

**Architecture:** Frontend-only. New focused components under `src/app/dashboard/components/`; pure low-stock severity helpers in `src/app/dashboard/lib/lowStock.ts` (vitest-covered); shared product-type color map in `src/lib/productTypeColors.ts` consumed by both pages. Data comes from existing endpoints (`dashboardApi.summary`, `inventoryApi.dashboard`).

**Tech Stack:** Next.js 16, TanStack Query, Recharts 3, shadcn/ui, Tailwind 4, vitest.

## Global Constraints

- Frontend-only; **no backend changes** (spec).
- Low stock: **top 5 by severity** (stock as % of reorder level, worst first) + "View all N" link (spec).
- Catalog count cards and bottom Products/Branches lists **removed** (spec).
- If `/inventory/dashboard` errors, revenue/sold KPIs show em-dash + "unavailable"; trend card hidden; rest of dashboard unaffected (spec).
- Chart colors: BREAD `#F4780B`, CAKE `#6B3FA0`, SPECIAL `#2e7d32`, MISCELLANEOUS `#8B7355` (spec).
- Never authenticate against the production API during verification (spec).

---

### Task 1: Shared color map + low-stock severity helpers (TDD)

**Files:**
- Create: `src/lib/productTypeColors.ts`
- Create: `src/app/dashboard/lib/lowStock.ts`
- Test: `src/app/dashboard/lib/lowStock.spec.ts`

**Interfaces:**
- Produces: `PRODUCT_TYPE_COLORS: Record<ProductType, string>`, `PRODUCT_TYPE_LABELS: Record<ProductType, string>`; `severityPct(item: LowStockEntry): number`, `sortBySeverity(items: LowStockEntry[]): LowStockEntry[]`, `type LowStockEntry = { id: number; name: string; unit: string; currentStock: number; reorderLevel: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/lib/lowStock.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { severityPct, sortBySeverity, type LowStockEntry } from './lowStock';

function entry(over: Partial<LowStockEntry>): LowStockEntry {
  return { id: 1, name: 'Flour', unit: 'KG', currentStock: 5, reorderLevel: 10, ...over };
}

describe('severityPct', () => {
  it('returns stock as % of reorder level', () => {
    expect(severityPct(entry({ currentStock: 5, reorderLevel: 10 }))).toBe(50);
  });

  it('clamps to 100 when stock exceeds reorder level', () => {
    expect(severityPct(entry({ currentStock: 15, reorderLevel: 10 }))).toBe(100);
  });

  it('returns 0 when reorder level is 0 (no divide-by-zero)', () => {
    expect(severityPct(entry({ currentStock: 5, reorderLevel: 0 }))).toBe(0);
  });

  it('returns 0 when stock is 0', () => {
    expect(severityPct(entry({ currentStock: 0, reorderLevel: 10 }))).toBe(0);
  });
});

describe('sortBySeverity', () => {
  it('sorts worst (lowest %) first', () => {
    const items = [
      entry({ id: 1, name: 'Sugar', currentStock: 9, reorderLevel: 10 }),   // 90%
      entry({ id: 2, name: 'Flour', currentStock: 1, reorderLevel: 10 }),   // 10%
      entry({ id: 3, name: 'Yeast', currentStock: 5, reorderLevel: 10 }),   // 50%
    ];
    expect(sortBySeverity(items).map((i) => i.name)).toEqual(['Flour', 'Yeast', 'Sugar']);
  });

  it('breaks ties by name and does not mutate input', () => {
    const items = [
      entry({ id: 1, name: 'Yeast', currentStock: 5, reorderLevel: 10 }),
      entry({ id: 2, name: 'Butter', currentStock: 5, reorderLevel: 10 }),
    ];
    const sorted = sortBySeverity(items);
    expect(sorted.map((i) => i.name)).toEqual(['Butter', 'Yeast']);
    expect(items.map((i) => i.name)).toEqual(['Yeast', 'Butter']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/dashboard/lib/lowStock.spec.ts`
Expected: FAIL — cannot resolve `./lowStock`.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/lib/lowStock.ts`:

```ts
export type LowStockEntry = {
  id: number;
  name: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
};

/** Stock as a percentage of the reorder level, clamped to [0, 100]. */
export function severityPct(item: LowStockEntry): number {
  if (item.reorderLevel <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (item.currentStock / item.reorderLevel) * 100)));
}

/** Worst first (lowest % of reorder level); ties broken by name. */
export function sortBySeverity(items: LowStockEntry[]): LowStockEntry[] {
  return [...items].sort(
    (a, b) => severityPct(a) - severityPct(b) || a.name.localeCompare(b.name),
  );
}
```

Create `src/lib/productTypeColors.ts`:

```ts
import type { ProductType } from '@/types';

export const PRODUCT_TYPE_COLORS: Record<ProductType, string> = {
  BREAD: '#F4780B',          /* crust  */
  CAKE: '#6B3FA0',           /* ube    */
  SPECIAL: '#2e7d32',
  MISCELLANEOUS: '#8B7355',
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Misc',
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/dashboard/lib/lowStock.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/productTypeColors.ts src/app/dashboard/lib/
git commit -m "feat(web): low-stock severity helpers + shared product-type colors"
```

---

### Task 2: Dashboard components (KpiRow, RevenueTrendCard, LowStockCard)

**Files:**
- Create: `src/app/dashboard/components/KpiRow.tsx`
- Create: `src/app/dashboard/components/RevenueTrendCard.tsx`
- Create: `src/app/dashboard/components/LowStockCard.tsx`

**Interfaces:**
- Consumes: Task 1 helpers/colors; shadcn `Card`, lucide icons, Recharts.
- Produces:
  - `KpiRow({ revenue, sold, productionYield, lowStockCount }: { revenue: number | null; sold: number | null; productionYield: number; lowStockCount: number })`
  - `RevenueTrendCard({ days }: { days: TrendDay[] })` with `type TrendDay = { date: string; revenue: number; sold: number; delivery: number; leftover: number }` (exported)
  - `LowStockCard({ items }: { items: LowStockEntry[] })`

- [ ] **Step 1: KpiRow**

Create `src/app/dashboard/components/KpiRow.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { AlertTriangle, Factory, PhilippinePeso, ShoppingCart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

function peso(v: number): string {
  return `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function KpiRow({
  revenue,
  sold,
  productionYield,
  lowStockCount,
}: {
  revenue: number | null;
  sold: number | null;
  productionYield: number;
  lowStockCount: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Kpi
        title="Today's Revenue"
        value={revenue === null ? '—' : peso(revenue)}
        subtitle={revenue === null ? 'unavailable' : 'across all branches'}
        icon={<PhilippinePeso className="h-5 w-5" />}
        tone="primary"
      />
      <Kpi
        title="Items Sold Today"
        value={sold === null ? '—' : sold.toLocaleString()}
        subtitle={sold === null ? 'unavailable' : 'pieces sold'}
        icon={<ShoppingCart className="h-5 w-5" />}
        tone="secondary"
      />
      <Kpi
        title="Production Today"
        value={productionYield.toLocaleString()}
        subtitle="pieces baked"
        icon={<Factory className="h-5 w-5" />}
        tone="success"
      />
      <Link href="/material-inventory" className="block">
        <Kpi
          title="Low Stock"
          value={lowStockCount}
          subtitle={lowStockCount > 0 ? 'materials need reordering' : 'all materials stocked'}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={lowStockCount > 0 ? 'destructive' : 'muted'}
        />
      </Link>
    </div>
  );
}

const TONES: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

function Kpi({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
}) {
  return (
    <Card className={tone === 'destructive' ? 'border-destructive/40' : undefined}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="font-display text-3xl font-semibold tracking-tight truncate">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className={`rounded-xl p-3 flex items-center shrink-0 ${TONES[tone]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
```

Note: if `PhilippinePeso` is not exported by lucide-react@1.8, use `Banknote` instead — check with `npx tsc --noEmit` in Step 4.

- [ ] **Step 2: RevenueTrendCard**

Create `src/app/dashboard/components/RevenueTrendCard.tsx`:

```tsx
'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';

export type TrendDay = {
  date: string;
  revenue: number;
  sold: number;
  delivery: number;
  leftover: number;
};

const CRUST = '#F4780B';

export default function RevenueTrendCard({ days }: { days: TrendDay[] }) {
  const data = days.map((d) => ({ ...d, label: dayjs(d.date).format('ddd D') }));

  return (
    <Card className="lg:col-span-2">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Revenue — Last 7 Days</h3>
          <Link href="/sales" className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
            Full report <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CRUST} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CRUST} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(33 30% 88%)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={52}
              tickFormatter={(v: number) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as TrendDay & { label: string };
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-semibold mb-1">{dayjs(d.date).format('MMM D, YYYY')}</p>
                    <p>Revenue: <span className="font-semibold text-primary">₱{d.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
                    <p>Sold: {d.sold.toLocaleString()} · Delivered: {d.delivery.toLocaleString()}</p>
                    <p>Leftover: {d.leftover.toLocaleString()}</p>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="revenue" stroke={CRUST} strokeWidth={2} fill="url(#revFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: LowStockCard**

Create `src/app/dashboard/components/LowStockCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { severityPct, sortBySeverity, type LowStockEntry } from '../lib/lowStock';

const TOP_N = 5;

export default function LowStockCard({ items }: { items: LowStockEntry[] }) {
  const top = sortBySeverity(items).slice(0, TOP_N);

  return (
    <Card className={items.length > 0 ? 'border-destructive/50' : undefined}>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className={`h-5 w-5 ${items.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          <h3 className="font-semibold text-lg">Low Stock</h3>
          {items.length > 0 && <Badge variant="destructive">{items.length}</Badge>}
        </div>
        {items.length === 0 ? (
          <Alert>
            <AlertDescription>All materials are above their reorder levels.</AlertDescription>
          </Alert>
        ) : (
          <>
            <ul className="space-y-3">
              {top.map((m) => {
                const pct = severityPct(m);
                return (
                  <li key={m.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <span className="font-bold text-destructive">{m.currentStock}</span>
                        {' / '}{m.reorderLevel} {m.unit}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-destructive rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/material-inventory"
              className="mt-4 flex items-center justify-center gap-1 text-xs text-primary hover:underline"
            >
              View all {items.length} low-stock material{items.length === 1 ? '' : 's'}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (fix the `PhilippinePeso` import if lucide lacks it).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/components/
git commit -m "feat(web): dashboard KPI, revenue-trend, and low-stock cards"
```

---

### Task 3: Rewire dashboard page

**Files:**
- Modify: `src/app/dashboard/page.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `KpiRow`, `RevenueTrendCard` (+ `TrendDay`), `LowStockCard` from Task 2; `PRODUCT_TYPE_COLORS`, `PRODUCT_TYPE_LABELS` from Task 1; existing `inventoryApi.dashboard(startDate, endDate)`.

- [ ] **Step 1: Replace `src/app/dashboard/page.tsx`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Link from 'next/link';
import {
  Store, Loader2, ArrowRight, ClipboardList, CheckCircle2, FileEdit, Factory,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { dashboardApi, productionOrdersApi, branchesApi, inventoryApi } from '@/lib/apiServices';
import type { DashboardSummary, InventoryDashboardData, ProductionOrder, Branch, Inventory } from '@/types';
import RejectionByProductCard from '@/components/analytics/RejectionByProductCard';
import KpiRow from './components/KpiRow';
import RevenueTrendCard, { type TrendDay } from './components/RevenueTrendCard';
import LowStockCard from './components/LowStockCard';
import { PRODUCT_TYPE_COLORS, PRODUCT_TYPE_LABELS } from '@/lib/productTypeColors';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
} from 'recharts';

export default function DashboardPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  const { data, isLoading, isError } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', today],
    queryFn: () => dashboardApi.summary(today).then((r) => r.data),
  });

  // Revenue KPIs + trend; some roles may lack access — degrade quietly.
  const { data: revenueData, isError: revenueError } = useQuery<InventoryDashboardData>({
    queryKey: ['dashboard-revenue', weekAgo, today],
    queryFn: () => inventoryApi.dashboard(weekAgo, today).then((r) => r.data),
    retry: false,
  });

  const { data: todayOrders = [] } = useQuery<ProductionOrder[]>({
    queryKey: ['dashboard-orders', today],
    queryFn: () => productionOrdersApi.byDate(today).then((r) => r.data),
  });

  const { data: allBranches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: todayInventory = [] } = useQuery<Inventory[]>({
    queryKey: ['dashboard-inventory', today],
    queryFn: () => inventoryApi.byDateRange(today).then((r) => r.data),
  });

  const orderStats = {
    total: todayOrders.length,
    drafts: todayOrders.filter((o) => o.status === 'DRAFT').length,
    finalized: todayOrders.filter((o) => o.status === 'FINALIZED').length,
  };

  const activeBranches = allBranches.filter((b) => b.isActive);
  const branchesWithInventory = new Set(todayInventory.map((inv) => inv.branchId));
  const branchesMissingInventory = activeBranches.filter((b) => !branchesWithInventory.has(b.id));

  const trendDays: TrendDay[] = (revenueData?.dailyBreakdown ?? []).map((d) => ({
    date: d.date,
    revenue: Number(d.revenue),
    sold: d.sold,
    delivery: d.delivery,
    leftover: d.leftover,
  }));
  const todayEntry = trendDays.find((d) => dayjs(d.date).format('YYYY-MM-DD') === today);
  const revenueUnavailable = revenueError || !revenueData;

  return (
    <AuthGuard>
      <AppLayout title="Dashboard">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground">{dayjs().format('dddd, MMMM D, YYYY')}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center mt-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError || !data ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load dashboard data.</AlertDescription>
          </Alert>
        ) : (
          <>
            <KpiRow
              revenue={revenueUnavailable ? null : (todayEntry?.revenue ?? 0)}
              sold={revenueUnavailable ? null : (todayEntry?.sold ?? 0)}
              productionYield={data.production.totalYield}
              lowStockCount={data.lowStock.length}
            />

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {!revenueUnavailable && trendDays.length >= 2 && (
                <RevenueTrendCard days={trendDays} />
              )}

              {/* Production mix */}
              <Card className={revenueUnavailable || trendDays.length < 2 ? 'lg:col-span-3' : ''}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Factory className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Today&apos;s Production</h3>
                    <Link href="/production" className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                      Open board <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {data.production.totalYield === 0 ? (
                    <Alert>
                      <AlertDescription>No production records found for today.</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={data.production.byType
                              .filter((x) => x.totalYield > 0)
                              .map((x) => ({
                                name: PRODUCT_TYPE_LABELS[x.type] ?? x.type,
                                value: x.totalYield,
                              }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            dataKey="value"
                            paddingAngle={4}
                          >
                            {data.production.byType
                              .filter((x) => x.totalYield > 0)
                              .map(({ type }) => (
                                <Cell key={type} fill={PRODUCT_TYPE_COLORS[type] ?? '#8B7355'} />
                              ))}
                          </Pie>
                          <RechartsTooltip formatter={(v) => [`${(v as number).toLocaleString()} pcs`, '']} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap justify-center gap-3 mt-1 mb-2">
                        {data.production.byType.filter((x) => x.totalYield > 0).map(({ type, totalYield }) => (
                          <div key={type} className="flex items-center gap-1.5 text-xs">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: PRODUCT_TYPE_COLORS[type] ?? '#8B7355' }} />
                            <span>{PRODUCT_TYPE_LABELS[type] ?? type}</span>
                            <span className="font-semibold">{totalYield.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-center text-sm text-muted-foreground">
                        Total: <span className="font-bold text-foreground">{data.production.totalYield.toLocaleString()} pcs</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Operations row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* Branch Orders Today */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Branch Orders</h3>
                    <Link href="/production/orders" className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                      Manage <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {orderStats.total === 0 ? (
                    <Alert>
                      <AlertDescription>No branch orders created yet today.</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-3">
                      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                        <div
                          className="h-full bg-success"
                          style={{ width: `${(orderStats.finalized / orderStats.total) * 100}%` }}
                        />
                        <div
                          className="h-full bg-warning/70"
                          style={{ width: `${(orderStats.drafts / orderStats.total) * 100}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <FileEdit className="h-4 w-4" /> Draft
                        </span>
                        <span className={`font-bold text-lg ${orderStats.drafts > 0 && orderStats.finalized === 0 ? 'text-amber-600' : ''}`}>
                          {orderStats.drafts}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-green-600" /> Finalized
                        </span>
                        <span className="font-bold text-lg text-green-600">{orderStats.finalized}</span>
                      </div>
                      {orderStats.drafts > 0 && orderStats.finalized === 0 && (
                        <Alert className="mt-2">
                          <AlertDescription className="text-xs">
                            All orders are drafts — finalize them so the Production Board shows planned yield.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Inventory Coverage */}
              <Card className={branchesMissingInventory.length > 0 ? 'border-amber-400' : ''}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Store className={`h-5 w-5 ${branchesMissingInventory.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
                    <h3 className="font-semibold text-lg">Inventory Coverage</h3>
                    {branchesMissingInventory.length > 0 && (
                      <Badge variant="outline" className="border-amber-400 text-amber-600">{branchesMissingInventory.length} missing</Badge>
                    )}
                    <Link href="/inventory/details" className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {branchesMissingInventory.length === 0 ? (
                    <Alert>
                      <AlertDescription>All active branches have inventory records for today.</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-2">
                      {branchesMissingInventory.map((b) => (
                        <div key={b.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                          <span className="text-sm font-medium">{b.name}</span>
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600">No entries</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <LowStockCard items={data.lowStock} />
            </div>

            {/* Wastage Analysis */}
            <div className="mb-6">
              <RejectionByProductCard
                showFilters
                branches={activeBranches}
                title="Wastage Analysis"
              />
            </div>
          </>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(web): operational KPI dashboard with revenue trend"
```

---

### Task 4: Revenue page improvements

**Files:**
- Modify: `src/app/sales/page.tsx`

**Interfaces:**
- Consumes: `PRODUCT_TYPE_COLORS` from Task 1; Recharts `ComposedChart`.

- [ ] **Step 1: Imports**

In `src/app/sales/page.tsx`, replace the lucide import line with:

```tsx
import { Loader2, TrendingUp, ShoppingCart, Truck, AlertTriangle, Calendar, MapPin, BarChart3, Download, Trophy } from 'lucide-react';
```

Add after the existing imports:

```tsx
import { PRODUCT_TYPE_COLORS } from '@/lib/productTypeColors';
import type { ProductType } from '@/types';
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
```

- [ ] **Step 2: Status chip theme colors**

Replace the `getDayStatus` function body's return values:

```tsx
function getDayStatus(sold: number, allSold: number[]): { label: string; className: string } {
  if (allSold.length === 0) return { label: 'STABLE', className: 'bg-muted text-muted-foreground' };
  const max = Math.max(...allSold);
  const avg = allSold.reduce((a, b) => a + b, 0) / allSold.length;
  if (sold >= max) return { label: 'RECORD', className: 'bg-primary text-primary-foreground' };
  if (sold >= avg * 1.1) return { label: 'PEAK', className: 'bg-secondary text-secondary-foreground' };
  if (sold >= avg * 0.9) return { label: 'HIGH', className: 'bg-accent text-accent-foreground' };
  return { label: 'STABLE', className: 'bg-muted text-muted-foreground' };
}
```

- [ ] **Step 3: Range-length label + waste card label**

Compute range length after `conversionRate` memo:

```tsx
  const rangeDays = useMemo(() => dayjs(endDate).diff(dayjs(startDate), 'day') + 1, [startDate, endDate]);
```

In the Revenue by Product Category header, replace
`<span className="text-xs text-muted-foreground uppercase tracking-widest">Weekly Breakdown</span>` with:

```tsx
<span className="text-xs text-muted-foreground uppercase tracking-widest">{rangeDays}-day range</span>
```

In the Waste & Rejects card, replace the label `Critical Threshold` with `Rejected`.

- [ ] **Step 4: Category bars get per-type colors + share %**

Replace the `typeEntries.map` block inside Revenue by Product Category with:

```tsx
{typeEntries.map(([type, revenue]) => {
  const pct = totalTypeRevenue > 0 ? (Number(revenue) / totalTypeRevenue) * 100 : 0;
  const color = PRODUCT_TYPE_COLORS[type as ProductType] ?? '#8B7355';
  return (
    <div key={type}>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-xs font-semibold">{type}</span>
          <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
        </div>
        <span className="text-sm font-semibold">
          ₱{Number(revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
})}
```

(The `Badge` import remains used elsewhere — zero-sales card.)

- [ ] **Step 5: Trophy icon**

In the Top Performer card header, replace `<span>🏆</span>` with:

```tsx
<Trophy className="h-4 w-4 text-primary" />
```

- [ ] **Step 6: Daily revenue chart card**

Insert between the “Revenue by Category + Top Performer” grid and the “Daily Performance Breakdown” card:

```tsx
{/* Daily Revenue Chart */}
{dashboard.dailyBreakdown.length >= 2 && (
  <Card className="mb-6">
    <CardHeader className="pb-3">
      <CardTitle className="text-base">Daily Revenue</CardTitle>
      <p className="text-xs text-muted-foreground">
        Revenue bars with sold units, {dayjs(startDate).format('MMM D')} – {dayjs(endDate).format('MMM D, YYYY')}.
      </p>
    </CardHeader>
    <CardContent>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={dashboard.dailyBreakdown.map((d) => ({
            ...d,
            revenue: Number(d.revenue),
            label: dayjs(d.date).format('MMM D'),
          }))}
          margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(33 30% 88%)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="rev"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={52}
            tickFormatter={(v: number) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          />
          <YAxis yAxisId="sold" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={40} />
          <RechartsTooltip
            formatter={(value, name) =>
              name === 'Revenue'
                ? [`₱${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, name]
                : [Number(value).toLocaleString(), name]
            }
          />
          <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="#F4780B" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Line yAxisId="sold" type="monotone" dataKey="sold" name="Sold" stroke="#6B3FA0" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 7: Verify build + lint + tests**

Run: `npm run build; npm run lint; npm run test`
Expected: all pass (no new lint errors).

- [ ] **Step 8: Commit**

```bash
git add src/app/sales/page.tsx
git commit -m "feat(web): daily revenue chart + themed revenue page polish"
```

---

### Task 5: Verification pass

**Files:** none.

- [ ] **Step 1: Full checks** — `npm run build; npm run lint; npm run test` in `louella-web/`. Expected: all pass.

- [ ] **Step 2: Visual pass (local backend only)**

Per dev-environment notes: start the local backend with CORS override
(`$env:ALLOWED_ORIGINS = "http://localhost:3000,http://localhost:4100"` then `npm run start:dev` in `louella-be/`; it listens on **3001** after the startup gap-fill CRON, ~3 min), and the frontend with
`$env:NEXT_PUBLIC_API_URL = "http://localhost:3001/api/v1"; npx next dev -p 4100`.
Log in with seed credentials from `louella-be/prisma/SEED_CREDENTIALS.md` (admin@louella.com). Screenshot `/dashboard` and `/sales`. **Never against prod.**
If the local backend can't be run (remote DB unreachable), fall back to build-level verification and say so in the report.

- [ ] **Step 3: Fix anything the screenshots reveal, commit, report.**

---

## Self-review notes

- **Spec coverage:** KPI row → T2/T3; trend chart → T2/T3; low-stock top-5 → T1/T2/T3; catalog cards removed → T3; donut recolor + greeting → T3; revenue chart/copy/colors/chips/trophy → T4; shared color map → T1; error degradation → T3 (`revenueUnavailable`); verification → T5. ✓
- **Placeholders:** none. ✓
- **Type consistency:** `LowStockEntry` (T1) matches `DashboardSummary['lowStock'][number]` shape; `TrendDay` exported from RevenueTrendCard and consumed in T3. ✓
