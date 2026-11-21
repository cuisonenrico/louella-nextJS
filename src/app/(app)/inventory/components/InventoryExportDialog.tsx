'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Branch } from '@/types';
import { inventoryApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';

/** The server's limit (MAX_REPORT_RANGE_DAYS). */
const MAX_DAYS = 90;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** A failed blob request carries its JSON error as a Blob; read it back for the message. */
async function errorText(err: unknown): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const body = JSON.parse(await data.text()) as { message?: string | string[] };
      if (body.message) return Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* not JSON — fall through */
    }
  }
  return extractError(err);
}

interface InventoryExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  /** The page's branch and dates, used as the starting values. */
  branchId: number | null;
  from: string;
  to: string;
}

/**
 * Download one branch's days as an XLSX laid out like the paper sheet:
 * today's Pricelist, a sheet per day priced as that day was, then a Summary.
 */
export default function InventoryExportDialog({ open, onOpenChange, branches, branchId, from, to }: InventoryExportDialogProps) {
  const [branch, setBranch] = useState(branchId ? String(branchId) : branches.length === 1 ? String(branches[0].id) : '');
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = start && end ? daysBetween(start, end) : 0;
  const invalid = !branch ? 'Choose a branch.' : days < 1 ? 'The last day is before the first.' : days > MAX_DAYS ? `At most ${MAX_DAYS} days per file.` : null;

  const download = async () => {
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await inventoryApi.exportWorkbook(Number(branch), start, end);
      const name = branches.find((b) => String(b.id) === branch)?.name ?? 'branch';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-${name.replace(/[^\w-]+/g, '_')}-${start}-to-${end}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (err) {
      setError(await errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Export inventory</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Today&apos;s pricelist, one sheet per day like the paper sheet (each at that day&apos;s prices), then a summary of the range.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-branch">Branch</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger id="export-branch" className="w-full">
                <SelectValue placeholder="Choose a branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="export-from">From</Label>
              <Input id="export-from" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="export-to">To</Label>
              <Input id="export-to" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {days > 0 && !invalid ? (
            <p className="text-sm text-muted-foreground">
              Pricelist + {days} day sheet{days === 1 ? '' : 's'} + Summary
            </p>
          ) : null}
          {invalid && branch ? <p className="text-sm text-destructive">{invalid}</p> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={download} disabled={busy || !!invalid}>
            <Download data-icon="inline-start" />
            {busy ? 'Preparing…' : 'Download XLSX'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
