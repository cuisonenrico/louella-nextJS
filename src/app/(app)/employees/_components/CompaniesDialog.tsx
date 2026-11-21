'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { companiesApi, type CompanyInput } from '@/lib/apiServices';
import type { Company } from '@/types';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const EMPTY: CompanyInput = { name: '', address: null, paymasterName: null, approverName: null };

const toInput = (c: Company): CompanyInput => ({
  name: c.name,
  address: c.address,
  paymasterName: c.paymasterName,
  approverName: c.approverName,
});

/** Name, address and the two signatories that head and close a company's payroll sheet. */
function CompanyFields({
  value,
  onChange,
  idPrefix,
}: {
  value: CompanyInput;
  onChange: (v: CompanyInput) => void;
  idPrefix: string;
}) {
  const field = (key: keyof CompanyInput, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <Input
        id={`${idPrefix}-${key}`}
        placeholder={placeholder}
        value={value[key] ?? ''}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">{field('name', 'Company name', "e.g. LOUELLA'S BAKESHOP (main)")}</div>
      <div className="sm:col-span-2">{field('address', 'Address', 'e.g. #29 Gov. Sison St., Lingayen, Pangasinan')}</div>
      {field('paymasterName', 'Paymaster (in-charge)', 'Signs as paymaster')}
      {field('approverName', 'Approved by (manager)', 'Approves for payment')}
    </div>
  );
}

const clean = (v: CompanyInput): CompanyInput => ({
  name: v.name.trim(),
  address: v.address?.trim() || null,
  paymasterName: v.paymasterName?.trim() || null,
  approverName: v.approverName?.trim() || null,
});

/**
 * The businesses employees are paid by. Each one gets its own payroll sheet
 * when a run is exported. Retiring hides a company from new assignments;
 * nobody loses it and past payslips keep its name.
 */
export function CompaniesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CompanyInput>(EMPTY);
  const [editing, setEditing] = useState<{ id: number; value: CompanyInput } | null>(null);
  const { data: companies = [] } = useQuery({
    queryKey: ['companies', 'all'],
    queryFn: () => companiesApi.list(true).then((r) => r.data),
    enabled: open,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['companies'] });
    qc.invalidateQueries({ queryKey: ['employees'] });
  };

  const create = useMutation({
    mutationFn: () => companiesApi.create(clean(draft)),
    onSuccess: () => { setDraft(EMPTY); refresh(); toast.success('Company added'); },
    onError: (err) => toast.error(extractError(err)),
  });
  const save = useMutation({
    mutationFn: (e: { id: number; value: CompanyInput }) => companiesApi.update(e.id, clean(e.value)),
    onSuccess: () => { setEditing(null); refresh(); toast.success('Company saved'); },
    onError: (err) => toast.error(extractError(err)),
  });
  const toggle = useMutation({
    mutationFn: (c: Company) => companiesApi.update(c.id, { isActive: !c.isActive }),
    onSuccess: refresh,
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Companies</DialogTitle>
          <DialogDescription>
            Each company gets its own payroll sheet when a finalized run is exported.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3 rounded-md border p-3"
          aria-label="New company"
          onSubmit={(e) => { e.preventDefault(); if (draft.name.trim()) create.mutate(); }}
        >
          <CompanyFields value={draft} onChange={setDraft} idPrefix="new-company" />
          <div className="flex justify-end">
            <Button type="submit" disabled={!draft.name.trim() || create.isPending}>Add company</Button>
          </div>
        </form>
        <ul className="divide-y">
          {companies.map((c) =>
            editing?.id === c.id ? (
              <li key={c.id} className="space-y-3 py-3">
                <CompanyFields
                  value={editing.value}
                  onChange={(value) => setEditing({ id: c.id, value })}
                  idPrefix={`company-${c.id}`}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button disabled={!editing.value.name.trim() || save.isPending} onClick={() => save.mutate(editing)}>
                    Save
                  </Button>
                </div>
              </li>
            ) : (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className={c.isActive ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>{c.name}</p>
                  {c.address && <p className="truncate text-xs text-muted-foreground">{c.address}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => setEditing({ id: c.id, value: toInput(c) })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={c.isActive}
                    disabled={toggle.isPending}
                    onCheckedChange={() => toggle.mutate(c)}
                    aria-label={`${c.name} active`}
                  />
                </div>
              </li>
            ),
          )}
          {companies.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No companies yet.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
