'use client';

import { useState } from 'react';
import type { PayrollAdjustmentCategory, PayrollAdjustmentKind } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MONEY = /^\d+(\.\d{1,2})?$/;

/** Mirrors the server's CATEGORIES_BY_KIND. */
const CATEGORIES: Record<PayrollAdjustmentKind, { value: PayrollAdjustmentCategory; label: string }[]> = {
  ADDITION: [
    { value: 'OVERTIME', label: 'Overtime' },
    { value: 'BONUS', label: 'Bonus' },
    { value: 'HOLIDAY', label: 'Holiday pay' },
    { value: 'ALLOWANCE', label: 'Allowance' },
    { value: 'OTHER', label: 'Other' },
  ],
  DEDUCTION: [
    { value: 'OFFENSE', label: 'Offense' },
    { value: 'OTHER', label: 'Other' },
  ],
};

export interface AdjustmentInput {
  category: PayrollAdjustmentCategory;
  description: string;
  amount: number;
}

export function AdjustmentDialog({
  kind,
  employeeName,
  pending,
  onSubmit,
  onClose,
}: {
  kind: PayrollAdjustmentKind;
  employeeName: string;
  pending: boolean;
  onSubmit: (input: AdjustmentInput) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<PayrollAdjustmentCategory>(CATEGORIES[kind][0].value);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const valid = description.trim() !== '' && MONEY.test(amount) && Number(amount) > 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'ADDITION' ? `Add to ${employeeName}` : `Deduct from ${employeeName}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as PayrollAdjustmentCategory)}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES[kind].map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjustment-description">Description (shown on the payslip)</Label>
            <Input id="adjustment-description" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjustment-amount">Amount (₱)</Label>
            <Input id="adjustment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || pending}
            onClick={() => onSubmit({ category, description: description.trim(), amount: Number(amount) })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
