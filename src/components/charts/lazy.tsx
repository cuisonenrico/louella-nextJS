'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Charts load on their own, after the page. Recharts (with its d3 and redux
 * dependencies) is ~110 kB gzip, used on three pages, always below the figures
 * that need no chart; loading it with the page held every one of those pages
 * back. Each placeholder has the chart's own height, so nothing shifts when the
 * chart arrives. `ssr: false`: a chart measures its container in the browser anyway.
 */
function placeholder(height: number) {
  function ChartPlaceholder() {
    return <Skeleton className="w-full" style={{ height }} role="status" aria-label="Loading chart" />;
  }
  return ChartPlaceholder;
}

export const ProductionPieChart = dynamic(() => import('./ProductionPieChart'), { ssr: false, loading: placeholder(180) });
export const RevenueTrendChart = dynamic(() => import('./RevenueTrendChart'), { ssr: false, loading: placeholder(220) });
export const DailyRevenueChart = dynamic(() => import('./DailyRevenueChart'), { ssr: false, loading: placeholder(260) });
export const RejectionsBarChart = dynamic(() => import('./RejectionsBarChart'), { ssr: false, loading: placeholder(260) });
export const PayrollTrendChart = dynamic(() => import('./PayrollTrendChart'), { ssr: false, loading: placeholder(240) });
