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
