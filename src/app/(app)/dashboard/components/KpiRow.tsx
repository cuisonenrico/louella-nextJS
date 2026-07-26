'use client';

import Link from 'next/link';
import { AlertTriangle, Factory, PhilippinePeso, ShoppingCart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

function peso(v: number): string {
  return `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function KpiRow({
  revenue,
  sold,
  productionYield,
  lowStockCount,
}: {
  revenue: number | null;
  sold: number | null;
  productionYield: number;
  lowStockCount: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Kpi
        title="Today's Revenue"
        value={revenue === null ? '—' : peso(revenue)}
        subtitle={revenue === null ? 'unavailable' : 'across all branches'}
        icon={<PhilippinePeso className="h-5 w-5" />}
        tone="primary"
      />
      <Kpi
        title="Items Sold Today"
        value={sold === null ? '—' : sold.toLocaleString()}
        subtitle={sold === null ? 'unavailable' : 'pieces sold'}
        icon={<ShoppingCart className="h-5 w-5" />}
        tone="secondary"
      />
      <Kpi
        title="Production Today"
        value={productionYield.toLocaleString()}
        subtitle="pieces baked"
        icon={<Factory className="h-5 w-5" />}
        tone="success"
      />
      <Link href="/material-inventory" className="block">
        <Kpi
          title="Low Stock"
          value={lowStockCount}
          subtitle={lowStockCount > 0 ? 'materials need reordering' : 'all materials stocked'}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={lowStockCount > 0 ? 'destructive' : 'muted'}
        />
      </Link>
    </div>
  );
}

const TONES: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

function Kpi({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
}) {
  return (
    <Card className={tone === 'destructive' ? 'border-destructive/40' : undefined}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="font-display text-3xl font-semibold tracking-tight truncate">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className={`rounded-xl p-3 flex items-center shrink-0 ${TONES[tone]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
