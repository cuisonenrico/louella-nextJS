'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { RevenueTrendChart } from '@/components/charts/lazy';

export type TrendDay = {
  date: string;
  revenue: number;
  sold: number;
  delivery: number;
  leftover: number;
};

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
        <RevenueTrendChart data={data} height={220} />
      </CardContent>
    </Card>
  );
}
