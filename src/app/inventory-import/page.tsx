'use client';

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { inventoryImportApi, branchesApi, importLogsApi } from '@/lib/apiServices';
import { useQuery } from '@tanstack/react-query';
import type { Branch, DryRunResult, InventoryImportResult } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Step = 'upload' | 'branch' | 'preview' | 'result';

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function InventoryImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [branchId, setBranchId] = useState('');
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const [error, setError] = useState('');

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const { data: branchLogs, isLoading: branchLogsLoading } = useQuery({
    queryKey: ['import-logs', branchId],
    queryFn: () =>
      importLogsApi.list({ branchId: parseInt(branchId), limit: 5 }).then((r) => r.data.items),
    enabled: !!branchId && step === 'branch',
  });

  const previewMut = useMutation({
    mutationFn: ({ f, bid }: { f: File; bid: number }) => inventoryImportApi.preview(f, bid),
    onSuccess: (res) => { setPreview(res.data); setStep('preview'); setError(''); },
    onError: (err) => setError(extractError(err)),
  });

  const importMut = useMutation({
    mutationFn: ({ f, bid }: { f: File; bid: number }) => inventoryImportApi.importFile(f, bid),
    onSuccess: (res) => { setResult(res.data); setStep('result'); setError(''); },
    onError: (err) => setError(extractError(err)),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setError('');
    setStep('branch');
  };

  const handlePreview = () => {
    if (!file || !branchId) return;
    previewMut.mutate({ f: file, bid: parseInt(branchId) });
  };

  const handleImport = () => {
    if (!file || !branchId) return;
    importMut.mutate({ f: file, bid: parseInt(branchId) });
  };

  const reset = () => {
    setStep('upload'); setFile(null); setPreview(null); setBranchId(''); setResult(null); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <AuthGuard>
      <AppLayout title="Inventory Import">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          {(['upload', 'branch', 'preview', 'result'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <Badge variant={step === s ? 'default' : 'outline'} className="capitalize">{s}</Badge>
            </div>
          ))}
        </div>

        {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <Card className="max-w-md">
            <CardHeader><CardTitle className="text-base">Upload Excel File</CardTitle></CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {previewMut.isPending ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                ) : (
                  <>
                    <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to select an .xlsx file</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            </CardContent>
          </Card>
        )}

        {/* Step 2: Preview (dry-run) */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Preview: {preview.fileName}
                  {preview.branch && <span className="text-muted-foreground font-normal"> → {preview.branch.name}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {preview.alreadyImported && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      This exact file was already imported for {preview.branch?.name ?? 'this branch'} on{' '}
                      {preview.alreadyImported.importedAt} (log #{preview.alreadyImported.logId}). Importing again will be rejected — delete that log first or use a corrected file.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="text-center"><p className="text-2xl font-bold">{preview.summary.totalSheets}</p><p className="text-xs text-muted-foreground">Day sheets</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-primary">{preview.summary.totalMatched}</p><p className="text-xs text-muted-foreground">Products matched</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-destructive">{preview.summary.totalUnmatched}</p><p className="text-xs text-muted-foreground">Unmatched</p></div>
                  <div className="text-center"><p className="text-2xl font-bold">{preview.summary.datesDetected.length}</p><p className="text-xs text-muted-foreground">Dates</p></div>
                </div>
                {preview.summary.datesDetected.length > 0 && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Date range: {preview.summary.datesDetected[0]} → {preview.summary.datesDetected[preview.summary.datesDetected.length - 1]}
                  </p>
                )}
                {preview.summary.totalSheets === 0 && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>No recognizable “Day” sheets found in this file. Nothing would be imported.</AlertDescription>
                  </Alert>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sheet</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Matched</TableHead>
                        <TableHead className="text-right">Unmatched</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.sheets.map((sheet) => (
                        <TableRow key={sheet.sheetName}>
                          <TableCell className="font-medium">{sheet.sheetName}</TableCell>
                          <TableCell>{sheet.error ? <span className="text-destructive">{sheet.error}</span> : sheet.date}</TableCell>
                          <TableCell className="text-right">{sheet.matched}</TableCell>
                          <TableCell className="text-right">{sheet.unmatchedCount > 0 ? <span className="text-destructive">{sheet.unmatchedCount}</span> : 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {preview.summary.totalUnmatched > 0 && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-1">These names did not match any product and will be skipped:</p>
                      <p className="text-xs">{[...new Set(preview.sheets.flatMap((s) => s.unmatched))].join(', ')}</p>
                      <p className="text-xs mt-1">Add them to the product catalog first if they should be imported.</p>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('branch')}>Back</Button>
              <Button
                onClick={handleImport}
                disabled={preview.summary.totalSheets === 0 || !!preview.alreadyImported || importMut.isPending}
              >
                {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Import
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Branch selection */}
        {step === 'branch' && (
          <Card className="max-w-md">
            <CardHeader><CardTitle className="text-base">Select Branch</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b: Branch) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {branchLogsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Checking import history…
                </div>
              )}
              {!branchLogsLoading && branchLogs && branchLogs.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This branch has {branchLogs.length} previous import
                    {branchLogs.length > 1 ? 's' : ''}. If dates overlap, existing
                    records will be updated. Uploading the exact same file will be rejected.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset}>Back</Button>
                <Button onClick={handlePreview} disabled={!branchId || previewMut.isPending}>
                  {previewMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Preview
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Result */}
        {step === 'result' && result && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-5 w-5 text-primary" />Import Complete</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="text-center"><p className="text-2xl font-bold">{result.summary.totalSheets}</p><p className="text-xs text-muted-foreground">Sheets</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-primary">{result.summary.totalProcessed}</p><p className="text-xs text-muted-foreground">Processed</p></div>
                  <div className="text-center"><p className="text-2xl font-bold">{result.summary.totalSkipped}</p><p className="text-xs text-muted-foreground">Skipped</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-destructive">{result.summary.totalErrors}</p><p className="text-xs text-muted-foreground">Errors</p></div>
                </div>
                {result.sheets.map((sheet) => (
                  <div key={sheet.sheetName} className="border rounded-lg p-3 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{sheet.sheetName}</span>
                      <span className="text-sm text-muted-foreground">{sheet.date} · {sheet.processed} processed</span>
                    </div>
                    {sheet.errors.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {sheet.errors.map((e, i) => (
                          <li key={i} className="text-xs text-destructive flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="flex items-center gap-4">
              <Button onClick={reset}>Import Another</Button>
              <a href="/inventory-import/history" className="text-sm text-muted-foreground underline underline-offset-4">
                View import history →
              </a>
            </div>
          </div>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
