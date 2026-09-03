'use client';

import { useState, useMemo } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DollarSign } from 'lucide-react';
import dayjs from 'dayjs';
import { productionApi, branchesApi } from '@/lib/apiServices';
import type { Branch } from '@/types';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import QueryError from '@/components/QueryError';
import { CardGridSkeleton } from '@/components/loading/Skeletons';

export default function ProductionCostPage() {
  usePageHeader({ title: 'Production Cost' });
  const today = dayjs().format('YYYY-MM-DD');
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState('');

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['production-cost', date, branchId],
    queryFn: () => productionApi.consumptionSummary(date, branchId && branchId !== 'all' ? parseInt(branchId) : undefined).then((r) => r.data),
    enabled: !!date,
    placeholderData: keepPreviousData,
  });

  const maxCost = useMemo(() => {
    if (!summary?.items) return 1;
    return Math.max(...summary.items.map((i) => i.totalCost), 1);
  }, [summary]);

  return (
    <>
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div className="space-y-1"><Label className="text-xs" htmlFor="date">Date</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></div>
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

        {isLoading ? (
          <CardGridSkeleton count={4} height="h-24" />
        ) : isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : !summary ? (
          <p className="text-center text-muted-foreground py-12">No cost data for this date.</p>
        ) : (
          <>
            {/* Grand Total Card */}
            <Card className="mb-6">
              <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><DollarSign className="h-4 w-4" />Grand Total Material Cost</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">₱{Number(summary.grandTotalCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-muted-foreground mt-1">{dayjs(summary.date).format('MMMM D, YYYY')}</p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cost Bar Chart (CSS-based) */}
              <Card>
                <CardHeader><CardTitle className="text-sm">Material Cost Breakdown</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {summary.items.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No consumption data.</p>
                  ) : summary.items.map((item) => (
                    <div key={item.materialId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{item.materialName}</span>
                        <span className="font-semibold">₱{item.totalCost.toFixed(2)}</span>
                      </div>
                      <Progress value={(item.totalCost / maxCost) * 100} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Detail Table */}
              <Card>
                <CardHeader><CardTitle className="text-sm">Consumption Details</CardTitle></CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Consumed</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.items.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No data.</TableCell></TableRow>
                    ) : summary.items.map((item) => (
                      <TableRow key={item.materialId}>
                        <TableCell className="font-medium">{item.materialName}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell className="text-right">{item.totalConsumed.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold">₱{item.totalCost.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right text-primary">₱{Number(summary.grandTotalCost).toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Card>
            </div>
          </>
        )}
      </>
  );
}
