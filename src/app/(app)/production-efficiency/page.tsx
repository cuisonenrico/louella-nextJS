'use client';

import { useState, useMemo } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { productionApi, branchesApi } from '@/lib/apiServices';
import type { Branch, ProductionEfficiencyItem } from '@/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';

export default function ProductionEfficiencyPage() {
  usePageHeader({ title: 'Production Efficiency' });
  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [branchId, setBranchId] = useState('');

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const { data: effItems = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['production-efficiency', startDate, endDate, branchId],
    queryFn: () => productionApi.efficiency(startDate, endDate, branchId && branchId !== 'all' ? parseInt(branchId) : undefined).then((r) => r.data),
    enabled: !!startDate && !!endDate,
    placeholderData: keepPreviousData,
  });

  // Rates are shares of what was available (sold + reject + still on hand),
  // matching the API. Leftover carries forward and is sold later, so it is
  // not waste; waste is rejects only.
  const totals = useMemo(() => {
    const sum = (f: (i: ProductionEfficiencyItem) => number) => effItems.reduce((s, i) => s + f(i), 0);
    const totalYield = sum((i) => i.totalYield);
    const totalSold = sum((i) => i.sold);
    const totalReject = sum((i) => i.totalReject);
    const totalAvailable = sum((i) => i.available);
    const avgSoldRate = totalAvailable > 0 ? (totalSold / totalAvailable) * 100 : 0;
    const avgWasteRate = totalAvailable > 0 ? (totalReject / totalAvailable) * 100 : 0;
    return { totalYield, totalSold, totalReject, avgSoldRate, avgWasteRate };
  }, [effItems]);

  return (
    <>
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div className="space-y-1"><Label className="text-xs" htmlFor="start-date">Start Date</Label><Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><Label className="text-xs" htmlFor="end-date">End Date</Label><Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" /></div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="branch">Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="branch" className="w-48"><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b: Branch) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Yield</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-bold">{totals.totalYield.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Sold</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-bold text-primary">{totals.totalSold.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Sold Rate</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{totals.avgSoldRate.toFixed(1)}%</p>
              <Progress value={totals.avgSoldRate} className="mt-1" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Waste Rate</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-destructive">{totals.avgWasteRate.toFixed(1)}%</p>
              <Progress value={totals.avgWasteRate} className="mt-1" />
            </CardContent>
          </Card>
        </div>

        {/* Breakdown by product type (visual) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {['BREAD', 'CAKE', 'SPECIAL'].map((type) => {
            const items = effItems.filter((i) => i.productType === type);
            const sold = items.reduce((s, i) => s + i.sold, 0);
            const leftover = items.reduce((s, i) => s + i.closingStock, 0);
            const reject = items.reduce((s, i) => s + i.totalReject, 0);
            const total = items.reduce((s, i) => s + i.available, 0);
            return (
              <Card key={type}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{type}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span>Sold</span><span className="font-semibold">{sold}</span></div>
                    {total > 0 && <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                      <div className="bg-primary" style={{ width: `${(sold / total) * 100}%` }} />
                      <div className="bg-yellow-400" style={{ width: `${(leftover / total) * 100}%` }} />
                      <div className="bg-destructive" style={{ width: `${(reject / total) * 100}%` }} />
                    </div>}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />Sold</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" />On hand</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" />Reject</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Detail Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Yield</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Reject</TableHead>
                <TableHead className="text-right">On hand (end)</TableHead>
                <TableHead className="text-right">Sold %</TableHead>
                <TableHead className="text-right">Waste %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRowsSkeleton rows={6} columns={10} />
              ) : isError ? (
                <TableRow><TableCell colSpan={10} className="p-0"><QueryError error={error} onRetry={() => refetch()} /></TableCell></TableRow>
              ) : effItems.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No efficiency data.</TableCell></TableRow>
              ) : effItems.map((item: ProductionEfficiencyItem) => (
                <TableRow key={item.productId}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell><Badge variant="secondary">{item.productType}</Badge></TableCell>
                  <TableCell className="text-right">{item.totalYield}</TableCell>
                  <TableCell className="text-right">{item.openingStock}</TableCell>
                  <TableCell className="text-right">{item.totalDelivered}</TableCell>
                  <TableCell className="text-right">{item.sold}</TableCell>
                  <TableCell className="text-right">{item.totalReject}</TableCell>
                  <TableCell className="text-right">{item.closingStock}</TableCell>
                  <TableCell className="text-right font-semibold">{(item.soldRate * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-destructive">{(item.wasteRate * 100).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </>
  );
}
