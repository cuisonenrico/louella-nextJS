'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';

export type TrendDay = {
  date: string;
  revenue: number;
  sold: number;
  delivery: number;
  leftover: number;
};

const CRUST = '#F4780B';

export default function RevenueTrendCard({ days }: { days: TrendDay[] }) {
  const data = days.map((d) => ({ ...d, label: dayjs(d.date).format('ddd D') }));

  return (
    <Card className="lg:col-span-2">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Revenue — Last 7 Days</h3>
          <Link href="/sales" className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
            Full report <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <ResponsiveContainer width="100%" height={220}>
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
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as TrendDay & { label: string };
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
      </CardContent>
    </Card>
  );
}
