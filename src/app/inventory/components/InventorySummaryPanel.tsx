'use client';

import { ChevronDown } from 'lucide-react';
import type { InventorySummaryData, ProductType } from '@/types';
import dayjs from 'dayjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible';
import { useState } from 'react';

interface InventorySummaryPanelProps {
  summary: InventorySummaryData | null;
  filterDateFrom: string;
  filterDateTo: string;
}

export default function InventorySummaryPanel({
  summary,
  filterDateFrom,
  filterDateTo,
}: InventorySummaryPanelProps) {
  const [open, setOpen] = useState(true);

  if (!summary) return null;

  const isRange = filterDateFrom !== filterDateTo;
  const dayCount = dayjs(filterDateTo).diff(dayjs(filterDateFrom), 'day') + 1;

  const revenueCards = [
    { label: 'Total Revenue', value: `₱${summary.totalRevenue.toLocaleString()}`, color: 'text-green-600', big: true },
    { label: 'Bread Revenue', value: `₱${(summary.revenueByType.BREAD ?? 0).toLocaleString()}` },
    { label: 'Cake Revenue', value: `₱${(summary.revenueByType.CAKE ?? 0).toLocaleString()}` },
    { label: 'Special Revenue', value: `₱${(summary.revenueByType.SPECIAL ?? 0).toLocaleString()}` },
    { label: 'Misc Revenue', value: `₱${(summary.revenueByType.MISCELLANEOUS ?? 0).toLocaleString()}` },
  ];

  const unitCards = [
    { label: 'Units Sold', value: summary.totalSold, color: 'text-green-600' },
    { label: 'Delivered', value: summary.totalDelivery },
    { label: 'Leftover', value: summary.totalLeftover, color: 'text-amber-600' },
    { label: 'Rejected', value: summary.totalReject, color: 'text-red-600' },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-4 border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 transition-colors">
        <span className="font-bold text-sm">
          {isRange ? `Period Summary (${dayCount} days)` : 'Day Summary'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {/* Revenue cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          {revenueCards.map(({ label, value, color, big }) => (
            <Card key={label} className="shadow-none">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">{label}</p>
                <p className={`${big ? 'text-xl' : 'text-lg'} font-bold ${color ?? ''} mt-0.5`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Unit stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {unitCards.map(({ label, value, color }) => (
            <Card key={label} className="shadow-none">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">{label}</p>
                <p className={`text-lg font-bold ${color ?? ''} mt-0.5`}>{value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Insights */}
        <div className="flex gap-2 flex-wrap">
          {summary.topProduct && (
            <Card className="shadow-none flex-grow min-w-[200px]">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wider">TOP PRODUCT</p>
                <p className="font-bold mt-0.5">{summary.topProduct.name}</p>
                <p className="text-sm text-green-600">₱{summary.topProduct.revenue.toLocaleString()} — {summary.topProduct.sold} sold</p>
              </CardContent>
            </Card>
          )}
          {summary.zeroSales.length > 0 && (
            <Card className="shadow-none flex-grow min-w-[200px] border-amber-300">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-amber-700 tracking-wider">NO SALES ({summary.zeroSales.length})</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {summary.zeroSales.map((r) => (
                    <Badge key={r.name} variant="outline" className="border-amber-400 text-amber-700">{r.name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
