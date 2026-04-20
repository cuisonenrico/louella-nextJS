'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, BarChart3 } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { productionApi, branchesApi } from '@/lib/apiServices';
import type { Branch, ProductionEfficiencyItem } from '@/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

export default function ProductionEfficiencyPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [branchId, setBranchId] = useState('');

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const { data: effItems = [], isLoading } = useQuery({
    queryKey: ['production-efficiency', startDate, endDate, branchId],
    queryFn: () => productionApi.efficiency(startDate, endDate, branchId ? parseInt(branchId) : undefined).then((r) => r.data),
    enabled: !!startDate && !!endDate,
  });

  const totals = useMemo(() => {
    const totalYield = effItems.reduce((s, i) => s + i.totalYield, 0);
    const totalSold = effItems.reduce((s, i) => s + i.sold, 0);
    const totalLeftover = effItems.reduce((s, i) => s + i.totalLeftover, 0);
    const totalReject = effItems.reduce((s, i) => s + i.totalReject, 0);
    const avgSoldRate = totalYield > 0 ? (totalSold / totalYield) * 100 : 0;
    const avgWasteRate = totalYield > 0 ? ((totalLeftover + totalReject) / totalYield) * 100 : 0;
    return { totalYield, totalSold, totalLeftover, totalReject, avgSoldRate, avgWasteRate };
  }, [effItems]);

  return (
    <AuthGuard>
      <AppLayout title="Production Efficiency">
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
            const yields = items.reduce((s, i) => s + i.totalYield, 0);
            const sold = items.reduce((s, i) => s + i.sold, 0);
            const leftover = items.reduce((s, i) => s + i.totalLeftover, 0);
            const reject = items.reduce((s, i) => s + i.totalReject, 0);
            const total = sold + leftover + reject;
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
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" />Leftover</span>
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
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Leftover</TableHead>
                <TableHead className="text-right">Reject</TableHead>
                <TableHead className="text-right">Sold %</TableHead>
                <TableHead className="text-right">Waste %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : effItems.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No efficiency data.</TableCell></TableRow>
              ) : effItems.map((item: ProductionEfficiencyItem) => (
                <TableRow key={item.productId}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell><Badge variant="secondary">{item.productType}</Badge></TableCell>
                  <TableCell className="text-right">{item.totalYield}</TableCell>
                  <TableCell className="text-right">{item.totalDelivered}</TableCell>
                  <TableCell className="text-right">{item.sold}</TableCell>
                  <TableCell className="text-right">{item.totalLeftover}</TableCell>
                  <TableCell className="text-right">{item.totalReject}</TableCell>
                  <TableCell className="text-right font-semibold">{(item.soldRate * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-destructive">{(item.wasteRate * 100).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </AppLayout>
    </AuthGuard>
  );
}
