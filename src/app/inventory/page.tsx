'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Calendar, Package, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { inventoryApi, branchesApi } from '@/lib/apiServices';
import type { Branch, InventoryDashboardData } from '@/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function InventoryPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['inventory-dashboard', startDate, endDate, branchId],
    queryFn: () => inventoryApi.dashboard(startDate, endDate, branchId || undefined).then((r) => r.data),
  });

  const typeEntries = dashboard ? Object.entries(dashboard.revenueByType) : [];

  return (
    <AuthGuard>
      <AppLayout title="Inventory">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" /></div>
          <div className="space-y-1">
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b: Branch) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-grow" />
          <Link href="/inventory/details">
            <Button variant="outline">
              In-depth Inventory Details <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !dashboard ? (
          <p className="text-center text-muted-foreground py-12">No data for the selected range.</p>
        ) : (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Revenue', value: `₱${Number(dashboard.totalRevenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-primary' },
                { label: 'Sold', value: dashboard.totalSold.toLocaleString(), icon: Package },
                { label: 'Delivered', value: dashboard.totalDelivery.toLocaleString(), icon: Package },
                { label: 'Leftover', value: dashboard.totalLeftover.toLocaleString(), icon: Package },
                { label: 'Reject', value: dashboard.totalReject.toLocaleString(), icon: Package, color: 'text-destructive' },
              ].map((m) => (
                <Card key={m.label}>
                  <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{m.label}</CardTitle></CardHeader>
                  <CardContent><p className={`text-lg font-bold ${m.color ?? ''}`}>{m.value}</p></CardContent>
                </Card>
              ))}
            </div>

            {/* Revenue by Type */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader><CardTitle className="text-sm">Revenue by Product Type</CardTitle></CardHeader>
                <CardContent>
                  {typeEntries.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No data.</p>
                  ) : (
                    <div className="space-y-3">
                      {typeEntries.map(([type, revenue]) => (
                        <div key={type} className="flex justify-between items-center">
                          <Badge variant="secondary">{type}</Badge>
                          <span className="font-semibold">₱{Number(revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Top Product</CardTitle></CardHeader>
                <CardContent>
                  {dashboard.topProduct ? (
                    <div>
                      <p className="text-lg font-bold">{dashboard.topProduct.name}</p>
                      <p className="text-muted-foreground text-sm">Sold: {dashboard.topProduct.sold} · Revenue: ₱{Number(dashboard.topProduct.revenue).toFixed(2)}</p>
                    </div>
                  ) : <p className="text-muted-foreground text-sm">No sales data.</p>}
                </CardContent>
              </Card>
            </div>

            {/* Daily Breakdown */}
            {dashboard.dailyBreakdown && dashboard.dailyBreakdown.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Daily Breakdown</CardTitle></CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead className="text-right">Leftover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.dailyBreakdown.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell>{dayjs(d.date).format('MMM D')}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">₱{Number(d.revenue).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{d.sold}</TableCell>
                        <TableCell className="text-right">{d.delivery}</TableCell>
                        <TableCell className="text-right">{d.leftover}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
