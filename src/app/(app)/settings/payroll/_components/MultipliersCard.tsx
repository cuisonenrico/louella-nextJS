'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PayrollSettings } from '@/types';
import { payrollApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/** Whole percent, 100–500: a multiplier of 1.00–5.00 with two decimals. */
const PERCENT = /^\d{3}$/;
const toPercent = (m: number) => String(Math.round(m * 100));
const validPercent = (v: string) => PERCENT.test(v) && Number(v) >= 100 && Number(v) <= 500;

/**
 * Rendered only once `data` has loaded, so the lazy initial state below
 * seeds from the fetched settings without an effect. A background refetch
 * (e.g. after a save) re-renders this same instance rather than reseeding
 * it, which is what we want: it does not clobber an in-progress edit.
 */
function MultipliersForm({ data }: { data: PayrollSettings }) {
  const qc = useQueryClient();
  const [regular, setRegular] = useState(() => toPercent(data.regularHolidayMultiplier));
  const [special, setSpecial] = useState(() => toPercent(data.specialHolidayMultiplier));

  const save = useMutation({
    mutationFn: () =>
      payrollApi.updateSettings({
        regularHolidayMultiplier: Number(regular) / 100,
        specialHolidayMultiplier: Number(special) / 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Multipliers saved');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const valid = validPercent(regular) && validPercent(special);

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-semibold">Holiday multipliers</h2>
        <p className="text-sm text-muted-foreground">
          Pay for a worked holiday, as a percentage of the daily rate. Applies to drafts; finalized payslips keep the rate they used.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="regular-multiplier">Regular holiday worked (%)</Label>
          <Input id="regular-multiplier" inputMode="numeric" value={regular} onChange={(e) => setRegular(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="special-multiplier">Special holiday worked (%)</Label>
          <Input id="special-multiplier" inputMode="numeric" value={special} onChange={(e) => setSpecial(e.target.value)} />
        </div>
      </div>
      {!valid && <p className="text-sm text-destructive">Enter a whole percentage from 100 to 500.</p>}
      <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>Save multipliers</Button>
    </Card>
  );
}

export function MultipliersCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'settings'],
    queryFn: () => payrollApi.settings().then((r) => r.data),
  });

  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;
  return <MultipliersForm data={data} />;
}
