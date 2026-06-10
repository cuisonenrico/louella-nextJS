'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2, History } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { importLogsApi, branchesApi } from '@/lib/apiServices';
import { useAuth } from '@/contexts/AuthContext';
import type { Branch, ImportLog } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function ImportHistoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const limit = 20;

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['import-logs', branchId, page],
    queryFn: () =>
      importLogsApi
        .list({ branchId: branchId ? parseInt(branchId) : undefined, page, limit })
        .then((r) => r.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => importLogsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      setError('');
    },
    onError: (err) => setError(extractError(err)),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <AuthGuard>
      <AppLayout title="Import History">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {data ? `${data.total} import${data.total !== 1 ? 's' : ''}` : '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={branchId} onValueChange={(v) => { setBranchId(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(branches as Branch[]).map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Logs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !data || data.items.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No imports found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Skipped</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Imported By</TableHead>
                    {isAdmin && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((log: ImportLog) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {new Date(log.importedAt).toLocaleDateString('en-PH', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>{log.branch.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm font-mono text-muted-foreground">
                        {log.fileName}
                      </TableCell>
                      <TableCell className="text-right">{log.rowCount}</TableCell>
                      <TableCell className="text-right">{log.skippedCount}</TableCell>
                      <TableCell>
                        <Badge variant={log.status === 'SUCCESS' ? 'default' : 'secondary'}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.importedByUser?.email ?? '—'}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete import log #{log.id}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the import record only — it does <strong>not</strong>{' '}
                                  delete the inventory data that was imported. After deletion,
                                  the same file can be re-imported.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMut.mutate(log.id)}
                                >
                                  Delete log
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-2">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
