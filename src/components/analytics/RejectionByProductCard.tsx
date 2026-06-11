'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { inventoryApi } from '@/lib/apiServices';
import type { RejectionByProductItem, ProductType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  type?: ProductType;
  title?: string;
}

function rejectRateBadge(rate: number) {
  if (rate < 5) return <Badge className="bg-green-600 text-white">{rate.toFixed(1)}%</Badge>;
  if (rate <= 15) return <Badge className="bg-amber-500 text-white">{rate.toFixed(1)}%</Badge>;
  return <Badge variant="destructive">{rate.toFixed(1)}%</Badge>;
}

export default function RejectionByProductCard({
  startDate,
  endDate,
  branchId,
  type,
  title = 'Rejected vs Delivered by Product',
}: Props) {
  const { data = [], isLoading } = useQuery<RejectionByProductItem[]>({
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
        <h3 className="font-semibold text-lg mb-4">{title}</h3>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
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
