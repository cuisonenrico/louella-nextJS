'use client';

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { inventoryImportApi, branchesApi } from '@/lib/apiServices';
import { useQuery } from '@tanstack/react-query';
import type { Branch, ParsedWorkbook, InventoryImportResult } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Step = 'upload' | 'preview' | 'branch' | 'result';

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function InventoryImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedWorkbook | null>(null);
  const [branchId, setBranchId] = useState('');
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const [error, setError] = useState('');

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const previewMut = useMutation({
    mutationFn: (f: File) => inventoryImportApi.preview(f),
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
    previewMut.mutate(f);
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
          {(['upload', 'preview', 'branch', 'result'] as Step[]).map((s, i) => (
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

        {/* Step 2: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Preview: {file?.name}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{preview.sheetNames.length} sheet(s): {preview.sheetNames.join(', ')}</p>
                {preview.sheets.map((sheet) => (
                  <div key={sheet.name} className="mb-4">
                    <h4 className="font-semibold text-sm mb-2">{sheet.name} ({sheet.rows.length} rows)</h4>
                    {sheet.rows.length > 0 && (
                      <div className="overflow-x-auto max-h-64">
                        <Table>
                          <TableHeader>
                            <TableRow>{Object.keys(sheet.rows[0]).map((key) => <TableHead key={key}>{key}</TableHead>)}</TableRow>
                          </TableHeader>
                          <TableBody>
                            {sheet.rows.slice(0, 5).map((row, i) => (
                              <TableRow key={i}>{Object.values(row).map((val, j) => <TableCell key={j}>{String(val ?? '')}</TableCell>)}</TableRow>
                            ))}
                            {sheet.rows.length > 5 && <TableRow><TableCell colSpan={Object.keys(sheet.rows[0]).length} className="text-center text-muted-foreground">…and {sheet.rows.length - 5} more rows</TableCell></TableRow>}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={() => setStep('branch')}>Continue</Button>
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('preview')}>Back</Button>
                <Button onClick={handleImport} disabled={!branchId || importMut.isPending}>
                  {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Import
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
            <Button onClick={reset}>Import Another</Button>
          </div>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
