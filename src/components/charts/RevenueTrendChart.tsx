'use client';

import dayjs from 'dayjs';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type TrendPoint = {
  date: string;
  label: string;
  revenue: number;
  sold: number;
  delivery: number;
  leftover: number;
};

const CRUST = '#F4780B';

/** Dashboard: revenue over the last 7 days. Loaded lazily (see ./lazy.tsx). */
export default function RevenueTrendChart({ data, height }: { data: TrendPoint[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CRUST} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CRUST} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(33 30% 88%)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          width={52}
          tickFormatter={(v: number) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as TrendPoint;
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="font-semibold mb-1">{dayjs(d.date).format('MMM D, YYYY')}</p>
                <p>Revenue: <span className="font-semibold text-primary">₱{d.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
                <p>Sold: {d.sold.toLocaleString()} · Delivered: {d.delivery.toLocaleString()}</p>
                <p>Leftover: {d.leftover.toLocaleString()}</p>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="revenue" stroke={CRUST} strokeWidth={2} fill="url(#revFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
