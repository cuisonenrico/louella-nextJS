'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Calendar, TrendingUp } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { salesApi, branchesApi } from '@/lib/apiServices';
import type { Branch, SaleRecord, SaleSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SalesPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const bid = branchId ? parseInt(branchId) : (branches.length > 0 ? branches[0].id : 0);

  const { data: records = [], isLoading: loadingRecords } = useQuery({
    queryKey: ['sales-records', bid, startDate, endDate],
    queryFn: () => salesApi.byBranchRange(bid, startDate, endDate).then((r) => r.data),
    enabled: bid > 0,
  });

  const { data: summary = [], isLoading: loadingSummary } = useQuery({
    queryKey: ['sales-summary', bid, startDate, endDate],
    queryFn: () => salesApi.summary(bid, startDate, endDate).then((r) => r.data),
    enabled: bid > 0,
  });

  const totals = useMemo(() => {
    const totalSold = records.reduce((s, r) => s + r.sold, 0);
    const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);
    return { totalSold, totalRevenue };
  }, [records]);

  const selectedBranch = branches.find((b: Branch) => b.id === bid);
  const loading = loadingRecords || loadingSummary;

  return (
    <AuthGuard>
      <AppLayout title="Sales">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div className="space-y-1">
            <Label className="text-xs">Branch</Label>
            <Select value={branchId || (branches.length > 0 ? String(branches[0].id) : '')} onValueChange={setBranchId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branches.map((b: Branch) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" /></div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Branch</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-bold">{selectedBranch?.name ?? '—'}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Total Sold</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-bold">{totals.totalSold.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-bold text-primary">₱{totals.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="details">
          <TabsList><TabsTrigger value="details">Product Details</TabsTrigger><TabsTrigger value="summary">Daily Summary</TabsTrigger></TabsList>

          <TabsContent value="details">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Delivery</TableHead>
                    <TableHead className="text-right">Leftover</TableHead>
                    <TableHead className="text-right">Reject</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : records.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No sales data for this range.</TableCell></TableRow>
                  ) : records.map((r: SaleRecord, i: number) => (
                    <TableRow key={`${r.productId}-${r.date}-${i}`}>
                      <TableCell className="font-medium">{r.productName}</TableCell>
                      <TableCell>{dayjs(r.date).format('MMM D')}</TableCell>
                      <TableCell className="text-right">{r.delivery}</TableCell>
                      <TableCell className="text-right">{r.leftover}</TableCell>
                      <TableCell className="text-right">{r.reject}</TableCell>
                      <TableCell className="text-right font-semibold">{r.sold}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">₱{Number(r.revenue).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="summary">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total Sold</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSummary ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : summary.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No summary data.</TableCell></TableRow>
                  ) : summary.map((s: SaleSummary) => (
                    <TableRow key={s.date}>
                      <TableCell>{dayjs(s.date).format('MMM D, YYYY')}</TableCell>
                      <TableCell className="text-right">{s.totalSold.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">₱{Number(s.totalRevenue).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </AppLayout>
    </AuthGuard>
  );
}
