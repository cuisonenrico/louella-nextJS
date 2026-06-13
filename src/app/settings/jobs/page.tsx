'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import QueryError from '@/components/QueryError';
import { jobsApi } from '@/lib/apiServices';
import type { JobRun, JobRunsResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { extractError } from '@/lib/errors';

const JOB_LABELS: Record<string, string> = {
  'inventory-autofill': 'Inventory Autofill (11 PM)',
  'morning-init': 'Morning Init (6 AM)',
  'material-autofill': 'Material Autofill (11 PM)',
  'boot-backfill': 'Boot Backfill',
  'inventory-autofill-range': 'Inventory Backfill (range)',
  'material-autofill-range': 'Material Backfill (range)',
};

const STATUS_VARIANT: Record<JobRun['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  COMPLETED: 'default',
  RUNNING: 'secondary',
  PENDING: 'secondary',
  FAILED: 'destructive',
};

function formatResult(run: JobRun): string {
  if (run.status === 'FAILED') return run.error ?? 'failed';
  if (!run.result) return '—';
  return Object.entries(run.result)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ') || '—';
}

export default function JobsSettingsPage() {
  const qc = useQueryClient();

  const runsQuery = useQuery<JobRunsResponse>({
    queryKey: ['job-runs'],
    queryFn: () => jobsApi.runs(undefined, 30).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['job-runs'] });

  const runInventory = useMutation({
    mutationFn: () => jobsApi.autofill(),
    onSuccess: () => { invalidate(); toast.success('Inventory autofill completed'); },
    onError: (err) => { invalidate(); toast.error(extractError(err)); },
  });

  const runMaterials = useMutation({
    mutationFn: () => jobsApi.autofillMaterialStock(),
    onSuccess: () => { invalidate(); toast.success('Material autofill completed'); },
    onError: (err) => { invalidate(); toast.error(extractError(err)); },
  });

  const latest = runsQuery.data?.latest ?? [];
  const runs = runsQuery.data?.runs ?? [];

  return (
    <AuthGuard>
      <AppLayout title="Background Jobs">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Daily autofill jobs keep inventory and material stock cards seeded. Every run is logged here.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={() => runInventory.mutate()} disabled={runInventory.isPending}>
              {runInventory.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Run inventory autofill
            </Button>
            <Button size="sm" variant="secondary" onClick={() => runMaterials.mutate()} disabled={runMaterials.isPending}>
              {runMaterials.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Run material autofill
            </Button>
          </div>
        </div>

        {runsQuery.isError ? (
          <QueryError error={runsQuery.error} onRetry={() => runsQuery.refetch()} />
        ) : runsQuery.isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {latest.map((run) => (
                <Card key={run.jobName}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-xs text-muted-foreground">
                      {JOB_LABELS[run.jobName] ?? run.jobName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {dayjs(run.startedAt).format('MMM D, h:mm A')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground break-words">{formatResult(run)}</p>
                  </CardContent>
                </Card>
              ))}
              {latest.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  No job runs recorded yet. Runs appear after the next scheduled or manual execution.
                </p>
              )}
            </div>

            <Card className="shadow-none overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Started</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {dayjs(run.startedAt).format('MMM D, YYYY h:mm A')}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {JOB_LABELS[run.jobName] ?? run.jobName}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{run.trigger}</Badge></TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[run.status]} className="text-xs">{run.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">
                        {formatResult(run)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No runs yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
