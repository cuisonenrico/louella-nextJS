'use client';

import { Suspense, useState } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RejectionsBarChart } from '@/components/charts/lazy';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { manilaToday } from '@/lib/manilaDate';
import { branchesApi, inventoryApi } from '@/lib/apiServices';
import type { Branch, RejectionByProductItem } from '@/types';
import { rankByRejection, rejectRateBadge } from '@/components/analytics/RejectionByProductCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import QueryError from '@/components/QueryError';
import { DashboardSkeleton } from '@/components/loading/Skeletons';

const PAGE_SIZE = 15;

const truncate = (v: string, max = 12) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

function RejectionsReport() {
  const params = useSearchParams();
  const today = manilaToday();

  const [from, setFrom] = useState(params.get('startDate') ?? today);
  const [to, setTo] = useState(params.get('endDate') ?? today);
  const [branch, setBranch] = useState(params.get('branchId') ?? 'all');
  const [page, setPage] = useState(0);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const branchId = branch === 'all' ? undefined : branch;
  const { data = [], isLoading, isError, error, refetch } = useQuery<RejectionByProductItem[]>({
    queryKey: ['rejection-by-product', from, to, branchId, undefined],
    queryFn: () => inventoryApi.rejectionByProduct(from, to, branchId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const ranked = rankByRejection(data);
  const pageCount = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = ranked.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const chartData = pageItems.map((item) => ({
    name: item.name,
    'On hand': item.totalSupply,
    Rejected: item.totalReject,
  }));

  const setFilter = (apply: () => void) => {
    apply();
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFilter(() => {
            const v = e.target.value;
            setFrom(v);
            if (v > to) setTo(v);
          })}
          className="w-40 h-9"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => setFilter(() => {
            const v = e.target.value;
            setTo(v);
            if (v < from) setFrom(v);
          })}
          className="w-40 h-9"
        />
        <Select value={branch} onValueChange={(v) => setFilter(() => setBranch(v))}>
          <SelectTrigger className="w-44 h-9">
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

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : ranked.length === 0 ? (
        <Alert>
          <AlertDescription>No delivery data for this period.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <RejectionsBarChart data={chartData} height={260} formatName={truncate} />

              <div className="mt-4">
                {pageItems.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <span className="text-sm font-medium">{item.name}</span>
                      <Badge variant="secondary" className="ml-2 text-[0.65rem] h-[18px]">{item.type}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-right">
                      <span className="text-muted-foreground">
                        {item.totalSupply.toLocaleString()} on hand
                      </span>
                      <span className="text-destructive font-medium">
                        {item.totalReject.toLocaleString()} rejected
                      </span>
                      {rejectRateBadge(item.rejectRate)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {ranked.length} product{ranked.length !== 1 ? 's' : ''} · page {safePage + 1} of {pageCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 0}
              >
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= pageCount - 1}
              >
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function RejectionsPage() {
  usePageHeader({ title: 'Rejected vs On Hand by Product' });
  return (
    <>
        {/* useSearchParams must sit under a Suspense boundary for the static build */}
        <Suspense fallback={<DashboardSkeleton />}>
          <RejectionsReport />
        </Suspense>
      </>
  );
}
