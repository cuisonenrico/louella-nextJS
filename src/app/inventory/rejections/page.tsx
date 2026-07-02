'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
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

const PAGE_SIZE = 15;

const truncate = (v: string, max = 12) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

function RejectionsReport() {
  const params = useSearchParams();
  const today = dayjs().format('YYYY-MM-DD');

  const [from, setFrom] = useState(params.get('startDate') ?? today);
  const [to, setTo] = useState(params.get('endDate') ?? today);
  const [branch, setBranch] = useState(params.get('branchId') ?? 'all');
  const [page, setPage] = useState(0);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const branchId = branch === 'all' ? undefined : branch;
  const { data = [], isLoading, isError } = useQuery<RejectionByProductItem[]>({
    queryKey: ['rejection-by-product', from, to, branchId, undefined],
    queryFn: () => inventoryApi.rejectionByProduct(from, to, branchId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const ranked = rankByRejection(data);
  const pageCount = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = ranked.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const chartData = pageItems.map((item) => ({
    name: item.name,
    Delivered: item.totalDelivery,
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
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Failed to load rejection data.</AlertDescription>
        </Alert>
      ) : ranked.length === 0 ? (
        <Alert>
          <AlertDescription>No delivery data for this period.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncate(v)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Delivered" fill="#6B3FA0" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Rejected" fill="#d32f2f" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4">
                {pageItems.map((item) => (
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
  return (
    <AuthGuard>
      <AppLayout title="Rejected vs Delivered by Product">
        {/* useSearchParams must sit under a Suspense boundary for the static build */}
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <RejectionsReport />
        </Suspense>
      </AppLayout>
    </AuthGuard>
  );
}
