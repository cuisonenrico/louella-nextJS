'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { Branch } from '@/types';
import type { ProductionSummaryData } from '../hooks/useProductionSummary';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible';

type Props = {
  summary: ProductionSummaryData | null;
  branches: Branch[];
};

export default function ProductionSummaryAccordion({ summary, branches }: Props) {
  const [open, setOpen] = useState(true);

  if (!summary) return null;

  const statCards = [
    { label: 'Total Planned', value: summary.totalPlanned.toLocaleString(), color: 'text-blue-600', big: true },
    { label: 'Total Yield', value: summary.totalYield.toLocaleString(), color: 'text-primary', big: true },
    { label: 'Bread', value: summary.yieldByType.BREAD.toLocaleString() },
    { label: 'Cake', value: summary.yieldByType.CAKE.toLocaleString() },
    { label: 'Special', value: summary.yieldByType.SPECIAL.toLocaleString() },
    { label: 'Misc', value: summary.yieldByType.MISCELLANEOUS.toLocaleString() },
    { label: 'Total Assigned', value: summary.totalAssigned.toLocaleString(), color: summary.totalAssigned === summary.totalYield ? 'text-green-600' : 'text-amber-600' },
    { label: 'Expected Revenue', value: `₱${summary.expectedRevenue.toLocaleString()}`, color: 'text-green-700', big: true },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-4 border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 transition-colors">
        <span className="font-bold text-sm">Day Summary</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-3">
          {statCards.map(({ label, value, color, big }) => (
            <Card key={label} className="shadow-none">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">{label}</p>
                <p className={`${big ? 'text-xl' : 'text-lg'} font-bold ${color ?? ''} mt-0.5`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {branches.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {branches.map((b) => (
              <Card key={b.id} className="shadow-none">
                <CardContent className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">{b.name}</p>
                  <p className="text-base font-bold text-primary">{(summary.assignedByBranch.get(b.id) ?? 0).toLocaleString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
