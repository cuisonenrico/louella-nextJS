'use client';

import { useState } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import dayjs from 'dayjs';
import { materialInventoryApi, jobsApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import type { MaterialGapEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';

export default function MaterialInventoryGapsPage() {
  usePageHeader({ title: 'Material Stock Gaps' });
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [message, setMessage] = useState('');

  const { data: gapsResult, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['material-inventory-gaps', startDate, endDate],
    queryFn: () => materialInventoryApi.gaps(startDate, endDate).then((r) => r.data),
    enabled: !!startDate && !!endDate,
    placeholderData: keepPreviousData,
  });

  const fillTodayMut = useMutation({
    mutationFn: () => jobsApi.autofillMaterialStock(today),
    onSuccess: (res) => { setMessage(`Created ${res.data.created} material stock records`); qc.invalidateQueries({ queryKey: ['material-inventory-gaps'] }); },
    onError: (err) => setMessage(`Error: ${extractError(err)}`),
  });

  const backfillMut = useMutation({
    mutationFn: () => jobsApi.autofillMaterialStockRange(startDate, endDate),
    onSuccess: (res) => { setMessage(`Backfilled ${res.data.totalCreated} records across ${res.data.datesProcessed} days`); qc.invalidateQueries({ queryKey: ['material-inventory-gaps'] }); },
    onError: (err) => setMessage(`Error: ${extractError(err)}`),
  });

  const gaps = gapsResult?.missing ?? [];
  const total = gapsResult?.total ?? 0;

  return (
    <>
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" /></div>
          <Button variant="outline" onClick={() => fillTodayMut.mutate()} disabled={fillTodayMut.isPending}>
            {fillTodayMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}Fill Today
          </Button>
          <Button onClick={() => backfillMut.mutate()} disabled={backfillMut.isPending}>
            {backfillMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Backfill Range
          </Button>
        </div>

        {message && <Alert className="mb-4"><AlertDescription>{message}</AlertDescription></Alert>}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Missing Material Stock Entries</CardTitle>
              {total > 0 && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{total} gaps</Badge>}
              {total === 0 && !isLoading && <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />No gaps</Badge>}
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRowsSkeleton rows={6} columns={2} />
              ) : isError ? (
                <TableRow><TableCell colSpan={2} className="p-0"><QueryError error={error} onRetry={() => refetch()} /></TableCell></TableRow>
              ) : gaps.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">All entries present. No gaps found.</TableCell></TableRow>
              ) : gaps.map((g: MaterialGapEntry, i: number) => (
                <TableRow key={`${g.materialId}-${g.date}-${i}`}>
                  <TableCell className="font-medium">{g.materialName}</TableCell>
                  <TableCell>{dayjs(g.date).format('MMM D, YYYY')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </>
  );
}
