'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { inventoryApi } from '@/lib/apiServices';
import type { Branch, RejectionByProductItem, ProductType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

function rejectRateBadge(rate: number) {
  if (rate < 5) return <Badge className="bg-green-600 text-white">{rate.toFixed(1)}%</Badge>;
  if (rate <= 15) return <Badge className="bg-amber-500 text-white">{rate.toFixed(1)}%</Badge>;
  return <Badge variant="destructive">{rate.toFixed(1)}%</Badge>;
}

export default function RejectionByProductCard({
  startDate: externalFrom,
  endDate: externalTo,
  branchId: externalBranch,
  type,
  title = 'Rejected vs Delivered by Product',
  showFilters = false,
  branches = [],
}: Props) {
  const today = dayjs().format('YYYY-MM-DD');
  const [internalFrom, setInternalFrom] = useState(today);
  const [internalTo, setInternalTo] = useState(today);
  const [internalBranch, setInternalBranch] = useState('all');

  const startDate = showFilters ? internalFrom : externalFrom;
  const endDate = showFilters ? internalTo : externalTo;
  const branchId = showFilters ? (internalBranch === 'all' ? undefined : internalBranch) : externalBranch;

  const { data = [], isLoading, isError } = useQuery<RejectionByProductItem[]>({
    queryKey: ['rejection-by-product', startDate, endDate, branchId, type],
    queryFn: () =>
      inventoryApi
        .rejectionByProduct(startDate, endDate, branchId, type)
        .then((r) => r.data),
  });

  const chartData = data.map((item) => ({
    name: item.name,
    Delivered: item.totalDelivery,
    Rejected: item.totalReject,
  }));

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
                onChange={(e) => setInternalFrom(e.target.value)}
                className="w-36 h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={internalTo}
                min={internalFrom}
                max={today}
                onChange={(e) => setInternalTo(e.target.value)}
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
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Delivered" fill="#6B3FA0" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Rejected" fill="#d32f2f" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 space-y-0">
              {data.map((item) => (
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
