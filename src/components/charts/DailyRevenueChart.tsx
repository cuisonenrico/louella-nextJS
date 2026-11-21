'use client';

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type DailyRevenuePoint = { label: string; revenue: number; sold: number };

/** Sales: revenue bars with sold units per day. Loaded lazily (see ./lazy.tsx). */
export default function DailyRevenueChart({ data, height }: { data: DailyRevenuePoint[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(33 30% 88%)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          yAxisId="rev"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          width={52}
          tickFormatter={(v: number) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <YAxis yAxisId="sold" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={40} />
        <Tooltip
          formatter={(value, name) =>
            name === 'Revenue'
              ? [`₱${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, name]
              : [Number(value).toLocaleString(), name]
          }
        />
        <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="#F4780B" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Line yAxisId="sold" type="monotone" dataKey="sold" name="Sold" stroke="#6B3FA0" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
