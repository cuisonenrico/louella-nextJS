'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { peso } from '@/lib/payroll/format';

export type PayrollTrendPoint = { label: string; netPay: number; employerShare: number; status: string };

/**
 * Payroll dashboard: net pay per finalized cutoff. One series, so no legend: the
 * card title names it. A darker crust than the brand orange, which is under 3:1
 * against the card surface. Loaded lazily (see ./lazy.tsx).
 */
const BAR = '#C2570A';

export default function PayrollTrendChart({ data, height }: { data: PayrollTrendPoint[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(33 30% 88%)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          width={52}
          tickFormatter={(v: number) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <Tooltip
          cursor={{ fill: 'hsl(33 30% 92%)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as PayrollTrendPoint;
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="mb-1 font-semibold">{d.label}</p>
                <p>Net pay: <span className="font-semibold">{peso(d.netPay)}</span></p>
                <p className="text-muted-foreground">Employer share: {peso(d.employerShare)}</p>
                <p className="text-muted-foreground">{d.status === 'PAID' ? 'Paid' : 'Finalized, not paid yet'}</p>
              </div>
            );
          }}
        />
        <Bar dataKey="netPay" name="Net pay" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
