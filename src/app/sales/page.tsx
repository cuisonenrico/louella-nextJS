'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, ShoppingCart, Truck, AlertTriangle, Calendar, MapPin, BarChart3, Download } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { inventoryApi, branchesApi } from '@/lib/apiServices';
import type { Branch } from '@/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function getDayStatus(sold: number, allSold: number[]): { label: string; className: string } {
  if (allSold.length === 0) return { label: 'STABLE', className: 'bg-muted text-muted-foreground' };
  const max = Math.max(...allSold);
  const avg = allSold.reduce((a, b) => a + b, 0) / allSold.length;
  if (sold >= max) return { label: 'RECORD', className: 'bg-orange-500 text-white' };
  if (sold >= avg * 1.1) return { label: 'PEAK', className: 'bg-teal-500 text-white' };
  if (sold >= avg * 0.9) return { label: 'HIGH', className: 'bg-amber-400 text-white' };
  return { label: 'STABLE', className: 'bg-muted text-muted-foreground' };
}

export default function SalesPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [dateSearch, setDateSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await inventoryApi.exportSales(startDate, endDate, branchId || undefined);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['inventory-dashboard', startDate, endDate, branchId],
    queryFn: () => inventoryApi.dashboard(startDate, endDate, branchId || undefined).then((r) => r.data),
  });

  const typeEntries = useMemo(() => (dashboard ? Object.entries(dashboard.revenueByType) : []), [dashboard]);
  const totalTypeRevenue = useMemo(() => typeEntries.reduce((s, [, v]) => s + Number(v), 0), [typeEntries]);
  const conversionRate = useMemo(() => {
    if (!dashboard || dashboard.totalDelivery === 0) return 0;
    return Math.round((dashboard.totalSold / dashboard.totalDelivery) * 100);
  }, [dashboard]);
  const allSold = useMemo(() => dashboard?.dailyBreakdown.map((d) => d.sold) ?? [], [dashboard]);
  const filteredBreakdown = useMemo(() => {
    if (!dashboard) return [];
    if (!dateSearch.trim()) return dashboard.dailyBreakdown;
    return dashboard.dailyBreakdown.filter((d) =>
      dayjs(d.date).format('MMM D, YYYY').toLowerCase().includes(dateSearch.toLowerCase()),
    );
  }, [dashboard, dateSearch]);

  const headerContent = (
    <div className="flex items-center gap-5">
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none mb-0.5">Start Date</p>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-6 text-xs border-0 shadow-none p-0 focus-visible:ring-0 w-28 cursor-pointer" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none mb-0.5">End Date</p>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-6 text-xs border-0 shadow-none p-0 focus-visible:ring-0 w-28 cursor-pointer" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none mb-0.5">Branch</p>
          <Select value={branchId || '__all__'} onValueChange={(v) => setBranchId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-6 text-xs border-0 shadow-none p-0 focus:ring-0 w-28 gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Branches</SelectItem>
              {branches.map((b: Branch) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <AuthGuard>
      <AppLayout
        title="Revenue"
        headerContent={headerContent}
        headerActions={
          <Button onClick={handleExport} disabled={isExporting} size="sm">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Export Revenue Report
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !dashboard ? (
          <p className="text-center text-muted-foreground py-20">No data for the selected range.</p>
        ) : (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                      <p className="text-2xl font-bold text-primary mt-1">
                        ₱{Number(dashboard.totalRevenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dayjs(startDate).format('MMM D')} – {dayjs(endDate).format('MMM D, YYYY')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Items Sold</p>
                      <p className="text-2xl font-bold mt-1">{dashboard.totalSold.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">{conversionRate}% conversion rate</p>
                    </div>
                    <div className="rounded-lg bg-blue-500/10 p-2">
                      <ShoppingCart className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivered</p>
                      <p className="text-2xl font-bold mt-1">{dashboard.totalDelivery.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">Total units dispatched</p>
                    </div>
                    <div className="rounded-lg bg-green-500/10 p-2">
                      <Truck className="h-5 w-5 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Waste & Rejects</p>
                    <div className="rounded-lg bg-destructive/10 p-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-2xl font-bold text-destructive">{dashboard.totalReject.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Critical Threshold</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{dashboard.totalLeftover.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Leftover</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue by Category + Top Performer */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm uppercase tracking-wide">Revenue by Product Category</CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">Weekly Breakdown</span>
                </CardHeader>
                <CardContent>
                  {typeEntries.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No data.</p>
                  ) : (
                    <div className="space-y-4">
                      {typeEntries.map(([type, revenue]) => {
                        const pct = totalTypeRevenue > 0 ? (Number(revenue) / totalTypeRevenue) * 100 : 0;
                        return (
                          <div key={type}>
                            <div className="flex justify-between items-center mb-1.5">
                              <Badge variant="secondary" className="text-xs font-semibold">{type}</Badge>
                              <span className="text-sm font-semibold">
                                ₱{Number(revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                  <span>🏆</span>
                  <CardTitle className="text-sm uppercase tracking-wide">Top Performer</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboard.topProduct ? (
                    <>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Best Selling Product</p>
                      <p className="text-xl font-bold mb-4">{dashboard.topProduct.name}</p>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Sold</p>
                          <p className="text-lg font-bold">{dashboard.topProduct.sold.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue</p>
                          <p className="text-lg font-bold text-primary">
                            ₱{Number(dashboard.topProduct.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">No sales data.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Daily Performance Breakdown */}
            {dashboard.dailyBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">Daily Performance Breakdown</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Comprehensive log of bakery output and sales from {dayjs(startDate).format('MMM D')} to {dayjs(endDate).format('MMM D, YYYY')}.
                      </p>
                    </div>
                    <Input
                      placeholder="Search date..."
                      value={dateSearch}
                      onChange={(e) => setDateSearch(e.target.value)}
                      className="h-8 w-40 text-xs shrink-0"
                    />
                  </div>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead className="text-right">Leftover</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBreakdown.map((d) => {
                      const status = getDayStatus(d.sold, allSold);
                      return (
                        <TableRow key={d.date}>
                          <TableCell className="font-medium">{dayjs(d.date).format('MMM D')}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ₱{Number(d.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">{d.sold.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{d.delivery.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{d.leftover.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
                              {status.label}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                  Showing {filteredBreakdown.length} of {dashboard.dailyBreakdown.length} days
                </div>
              </Card>
            )}

            {/* Zero Sales */}
            {dashboard.zeroSales && dashboard.zeroSales.length > 0 && (
              <Card className="mt-6">
                <CardHeader><CardTitle className="text-sm text-destructive">Zero Sales Products</CardTitle></CardHeader>
                <div className="flex flex-wrap gap-2 p-4 pt-0">
                  {dashboard.zeroSales.map((z) => <Badge key={z.name} variant="outline">{z.name}</Badge>)}
                </div>
              </Card>
            )}
          </>
        )}
      </AppLayout>
    </AuthGuard>
  );
}