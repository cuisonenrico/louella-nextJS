'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { inventoryApi } from '@/lib/apiServices';
import type { Branch, RejectionByProductItem, ProductType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Props {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  type?: ProductType;
  title?: string;
  showFilters?: boolean;
  branches?: Branch[];
}

const TOP_COUNT = 5;

export function rejectRateBadge(rate: number) {
  if (rate < 5) return <Badge className="bg-green-600 text-white">{rate.toFixed(1)}%</Badge>;
  if (rate <= 15) return <Badge className="bg-amber-500 text-white">{rate.toFixed(1)}%</Badge>;
  return <Badge variant="destructive">{rate.toFixed(1)}%</Badge>;
}

/** Worst offenders first: highest reject rate, then most rejected units. */
export function rankByRejection(items: RejectionByProductItem[]): RejectionByProductItem[] {
  return [...items].sort((a, b) => b.rejectRate - a.rejectRate || b.totalReject - a.totalReject);
}

/**
 * Compact dashboard-analytic card: the top rejected products for the period,
 * with a "See more" link to the full paginated report at
 * /inventory/rejections.
 */
export default function RejectionByProductCard({
  startDate: externalFrom,
  endDate: externalTo,
  branchId: externalBranch,
  type,
  title = 'Top Rejected Products',
  showFilters = false,
  branches = [],
}: Props) {
  // useState so today can be updated at midnight without remount
  const [today, setToday] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [internalFrom, setInternalFrom] = useState(today);
  const [internalTo, setInternalTo] = useState(today);
  const [internalBranch, setInternalBranch] = useState('all');

  // reset today + internal dates when the calendar day rolls over
  useEffect(() => {
    const msUntilMidnight = dayjs().add(1, 'day').startOf('day').diff(dayjs());
    const timer = setTimeout(() => {
      const newToday = dayjs().format('YYYY-MM-DD');
      setToday(newToday);
      setInternalFrom(newToday);
      setInternalTo(newToday);
    }, msUntilMidnight);
    return () => clearTimeout(timer);
  }, [today]);

  const startDate = showFilters ? internalFrom : externalFrom;
  const endDate = showFilters ? internalTo : externalTo;
  const branchId = showFilters ? (internalBranch === 'all' ? undefined : internalBranch) : externalBranch;

  const { data = [], isLoading, isError } = useQuery<RejectionByProductItem[]>({
    queryKey: ['rejection-by-product', startDate, endDate, branchId, type],
    queryFn: () =>
      inventoryApi
        .rejectionByProduct(startDate, endDate, branchId, type)
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000, // avoid re-fetching on every focus/remount
  });

  const rejected = rankByRejection(data.filter((item) => item.totalReject > 0));
  const top = rejected.slice(0, TOP_COUNT);

  const seeMoreParams = new URLSearchParams();
  if (startDate) seeMoreParams.set('startDate', startDate);
  if (endDate) seeMoreParams.set('endDate', endDate);
  if (branchId) seeMoreParams.set('branchId', branchId);
  const seeMoreQuery = seeMoreParams.toString();
  const seeMoreHref = `/inventory/rejections${seeMoreQuery ? `?${seeMoreQuery}` : ''}`;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={internalFrom}
                max={internalTo}
                onChange={(e) => {
                  const v = e.target.value;
                  setInternalFrom(v);
                  // keep range valid — clamp end date forward if needed
                  if (v > internalTo) setInternalTo(v);
                }}
                className="w-36 h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={internalTo}
                min={internalFrom}
                max={today}
                onChange={(e) => {
                  const v = e.target.value;
                  setInternalTo(v);
                  // keep range valid — clamp start date back if needed
                  if (v < internalFrom) setInternalFrom(v);
                }}
                className="w-36 h-8 text-xs"
              />
              <Select value={internalBranch} onValueChange={setInternalBranch}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load rejection data.</AlertDescription>
          </Alert>
        ) : data.length === 0 ? (
          <Alert>
            <AlertDescription>No delivery data for this period.</AlertDescription>
          </Alert>
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No rejections in this period — nothing wasted. 🎉
          </p>
        ) : (
          <div>
            {top.map((item) => (
              <div key={item.productId} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <span className="text-sm font-medium">{item.name}</span>
                  <Badge variant="secondary" className="ml-2 text-[0.65rem] h-[18px]">{item.type}</Badge>
                </div>
                <div className="flex items-center gap-3 text-sm text-right">
                  <span className="text-muted-foreground">
                    {item.totalDelivery.toLocaleString()} delivered
                  </span>
                  <span className="text-destructive font-medium">
                    {item.totalReject.toLocaleString()} rejected
                  </span>
                  {rejectRateBadge(item.rejectRate)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-3">
          <Button asChild variant="ghost" size="sm">
            <Link href={seeMoreHref}>
              See more
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
