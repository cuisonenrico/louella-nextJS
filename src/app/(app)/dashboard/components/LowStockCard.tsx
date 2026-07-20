'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { severityPct, sortBySeverity, type LowStockEntry } from '../lib/lowStock';

const TOP_N = 5;

export default function LowStockCard({ items }: { items: LowStockEntry[] }) {
  const top = sortBySeverity(items).slice(0, TOP_N);

  return (
    <Card className={items.length > 0 ? 'border-destructive/50' : undefined}>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className={`h-5 w-5 ${items.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          <h3 className="font-semibold text-lg">Low Stock</h3>
          {items.length > 0 && <Badge variant="destructive">{items.length}</Badge>}
        </div>
        {items.length === 0 ? (
          <Alert>
            <AlertDescription>All materials are above their reorder levels.</AlertDescription>
          </Alert>
        ) : (
          <>
            <ul className="space-y-3">
              {top.map((m) => {
                const pct = severityPct(m);
                return (
                  <li key={m.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <span className="font-bold text-destructive">{m.currentStock}</span>
                        {' / '}{m.reorderLevel} {m.unit}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-destructive rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/material-inventory"
              className="mt-4 flex items-center justify-center gap-1 text-xs text-primary hover:underline"
            >
              View all {items.length} low-stock material{items.length === 1 ? '' : 's'}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
