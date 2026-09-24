'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { branchCashApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { BRANCH_CASH_KEY } from '@/components/branch-cash/BranchCashPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/** Add, rename, reorder and (de)activate expense categories. Never deletes. */
export default function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const { data: categories = [] } = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'categories', 'all'],
    queryFn: () => branchCashApi.categories(true).then((r) => r.data),
    enabled: open,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: [...BRANCH_CASH_KEY, 'categories'] });

  const create = useMutation({
    mutationFn: () => branchCashApi.createCategory({ name: name.trim(), sortOrder: (categories.length + 1) * 10 }),
    onSuccess: () => {
      setName('');
      refresh();
    },
    onError: (err) => toast.error(extractError(err)),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; requiresNote?: boolean; sortOrder?: number; isActive?: boolean } }) =>
      branchCashApi.updateCategory(id, data),
    onSuccess: refresh,
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {categories.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Name of ${c.name}`}
                defaultValue={c.name}
                className="h-8 min-w-0 flex-1"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== c.name) update.mutate({ id: c.id, data: { name: next } });
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move ${c.name} up`}
                disabled={i === 0}
                onClick={() => {
                  const prev = categories[i - 1];
                  update.mutate({ id: c.id, data: { sortOrder: prev.sortOrder } });
                  update.mutate({ id: prev.id, data: { sortOrder: c.sortOrder } });
                }}
              >
                ↑
              </Button>
              <label className="flex items-center gap-1 text-xs">
                <Switch
                  checked={c.requiresNote}
                  onCheckedChange={(v) => update.mutate({ id: c.id, data: { requiresNote: v } })}
                />
                Note required
              </label>
              <label className="flex items-center gap-1 text-xs">
                <Switch checked={c.isActive} onCheckedChange={(v) => update.mutate({ id: c.id, data: { isActive: v } })} />
                Active
              </label>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={60} />
          <Button type="submit" disabled={!name.trim() || create.isPending}>Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
