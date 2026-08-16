'use client';

import { useState, useRef } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import { inventoryImportApi, branchesApi, importLogsApi } from '@/lib/apiServices';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Branch, DryRunResult, InventoryImportResult, ProductType, UnknownDecision } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveDecisions } from './lib/unknownDecisions';

type Step = 'upload' | 'branch' | 'preview' | 'result';

const PRODUCT_TYPES: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

const TYPE_LABEL: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Misc',
};

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function InventoryImportPage() {
  usePageHeader({ title: 'Inventory Import' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [branchId, setBranchId] = useState('');
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const [error, setError] = useState('');
  // One decision per unknown label, keyed by the label. Deliberately starts
  // empty rather than pre-filled with the suggested type: an operator must
  // look at every unknown name before the import can run, because the common
  // cause of one is a typo in the sheet, not a genuinely new product.
  const [decisions, setDecisions] = useState<Record<string, UnknownDecision>>({});

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const { data: branchLogs, isLoading: branchLogsLoading } = useQuery({
    queryKey: ['import-logs', branchId],
    queryFn: () =>
      importLogsApi.list({ branchId: parseInt(branchId), limit: 5 }).then((r) => r.data.items),
    enabled: !!branchId && step === 'branch',
    placeholderData: keepPreviousData,
  });

  const previewMut = useMutation({
    mutationFn: ({ f, bid }: { f: File; bid: number }) => inventoryImportApi.preview(f, bid),
    onSuccess: (res) => { setPreview(res.data); setDecisions({}); setStep('preview'); setError(''); },
    onError: (err) => setError(extractError(err)),
  });

  const importMut = useMutation({
    mutationFn: ({ f, bid, mode }: { f: File; bid: number; mode?: 'skip' | 'overwrite' }) =>
      inventoryImportApi.importFile(f, bid, mode, createProducts, acknowledgeUnmatched),
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

  const handleImport = (mode?: 'skip' | 'overwrite') => {
    if (!file || !branchId) return;
    importMut.mutate({ f: file, bid: parseInt(branchId), mode });
  };

  // Days in the preview whose date already holds real (manually entered or
  // previously imported) rows — the manager must choose skip vs overwrite.
  const conflictDates = (preview?.sheets ?? [])
    .filter((s) => (s.existing?.real ?? 0) > 0)
    .map((s) => s.date);

  // A sheet with any ambiguous label is dropped entirely by the real import
  // (see LabelResolver / collectSheetEntries). Importing must be blocked
  // until every ambiguous label is resolved with a ProductAlias — otherwise
  // an operator can launch an import that silently skips whole sheets.
  const hasAmbiguous = (preview?.sheets ?? []).some((s) => s.ambiguous.length > 0);

  // Labels that matched no product. Each needs a decision before importing:
  // the server refuses outright otherwise, so an unmatched label can no longer
  // cost a product its whole history while the summary still reads "success".
  const unknownProducts = preview?.unknownProducts ?? [];
  const { createProducts, acknowledgeUnmatched, undecided } = resolveDecisions(
    unknownProducts,
    decisions,
  );

  const decide = (label: string, decision: UnknownDecision) =>
    setDecisions((prev) => ({ ...prev, [label]: decision }));

  const importBlocked =
    !preview ||
    preview.summary.totalSheets === 0 ||
    !!preview.alreadyImported ||
    hasAmbiguous ||
    undecided.length > 0 ||
    importMut.isPending;

  const reset = () => {
    setStep('upload'); setFile(null); setPreview(null); setBranchId(''); setResult(null); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
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
                        <TableHead>Existing data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.sheets.map((sheet) => (
                        <TableRow key={sheet.sheetName}>
                          <TableCell className="font-medium">{sheet.sheetName}</TableCell>
                          <TableCell>{sheet.error ? <span className="text-destructive">{sheet.error}</span> : sheet.date}</TableCell>
                          <TableCell className="text-right">{sheet.matched}</TableCell>
                          <TableCell className="text-right">{sheet.unmatchedCount > 0 ? <span className="text-destructive">{sheet.unmatchedCount}</span> : 0}</TableCell>
                          <TableCell>
                            {(sheet.existing?.real ?? 0) > 0 ? (
                              <span className="text-destructive font-medium">{sheet.existing!.real} rows</span>
                            ) : (sheet.existing?.placeholders ?? 0) > 0 ? (
                              <span className="text-muted-foreground">placeholders</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {unknownProducts.length > 0 && (
                  <div className="mt-4 border rounded-lg">
                    <div className="px-4 py-3 border-b bg-muted/40">
                      <p className="font-medium text-sm">
                        {unknownProducts.length} name{unknownProducts.length > 1 ? 's' : ''} in this file{' '}
                        {unknownProducts.length > 1 ? 'do' : 'does'} not match any product
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Add each one to the catalog, or skip it. The name and price come from the sheet — only the
                        type is yours to set. A name you don&apos;t recognise is usually a typo in the spreadsheet.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name in sheet</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="text-right">Days</TableHead>
                            <TableHead>First seen</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Decision</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unknownProducts.map((u) => {
                            const d = decisions[u.label];
                            return (
                              <TableRow key={u.label} className={d ? '' : 'bg-destructive/5'}>
                                <TableCell className="font-medium">
                                  {u.label}
                                  {u.priceChanges.length > 1 && (
                                    <span className="block text-[11px] text-muted-foreground">
                                      {u.priceChanges.length} price changes — recorded as history
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">₱{u.price.toLocaleString()}</TableCell>
                                <TableCell className="text-right">{u.occurrences}</TableCell>
                                <TableCell className="text-muted-foreground">{u.firstSeen}</TableCell>
                                <TableCell>
                                  <Select
                                    value={d?.kind === 'create' ? d.type : u.suggestedType}
                                    onValueChange={(v) => decide(u.label, { kind: 'create', type: v as ProductType })}
                                    disabled={d?.kind === 'skip'}
                                  >
                                    <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {PRODUCT_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  <Button
                                    size="sm"
                                    variant={d?.kind === 'create' ? 'default' : 'outline'}
                                    onClick={() => decide(u.label, { kind: 'create', type: d?.kind === 'create' ? d.type : u.suggestedType })}
                                  >
                                    Add
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={d?.kind === 'skip' ? 'secondary' : 'ghost'}
                                    className="ml-1"
                                    onClick={() => decide(u.label, { kind: 'skip' })}
                                  >
                                    Skip
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {undecided.length > 0 && (
                      <p className="px-4 py-2 text-xs text-destructive border-t">
                        Decide on {undecided.length} more name{undecided.length > 1 ? 's' : ''} to enable importing.
                      </p>
                    )}
                  </div>
                )}
                {hasAmbiguous && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-1">
                        {preview.summary.totalAmbiguous} label{preview.summary.totalAmbiguous > 1 ? 's match' : ' matches'} more than one product and cannot be resolved automatically. The whole sheet{preview.sheets.filter((s) => s.ambiguous.length > 0).length > 1 ? 's containing them are' : ' containing it is'} skipped until a ProductAlias resolves each label:
                      </p>
                      <ul className="text-xs space-y-1">
                        {[...new Set(preview.sheets.flatMap((s) => s.ambiguous))].map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                      <p className="text-xs mt-1 font-medium">Importing is disabled until this is resolved.</p>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
            {conflictDates.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">
                    {conflictDates.length} day{conflictDates.length > 1 ? 's' : ''} in this file already{' '}
                    {conflictDates.length > 1 ? 'have' : 'has'} data for {preview.branch?.name ?? 'this branch'}:{' '}
                    {conflictDates.join(', ')}
                  </p>
                  <p className="text-xs">
                    Choose <span className="font-medium">Import (skip those days)</span> to keep the existing records,
                    or <span className="font-medium">Overwrite existing days</span> to replace them with this file.
                  </p>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('branch')}>Back</Button>
              {conflictDates.length > 0 ? (
                <>
                  <Button
                    onClick={() => handleImport('skip')}
                    disabled={importBlocked}
                  >
                    {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Import (skip {conflictDates.length} existing day{conflictDates.length > 1 ? 's' : ''})
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleImport('overwrite')}
                    disabled={importBlocked}
                  >
                    {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                    Overwrite existing days
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => handleImport()}
                  disabled={importBlocked}
                >
                  {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Import
                </Button>
              )}
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
                    {branchLogs.length > 1 ? 's' : ''}. Days that already hold data
                    are flagged in the preview, where you can choose to skip or
                    overwrite them. Uploading the exact same file will be rejected.
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
      </>
  );
}
