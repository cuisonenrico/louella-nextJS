'use client';

import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Layers, Store, FlaskConical, BookOpen, AlertTriangle, Factory, Loader2,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { dashboardApi } from '@/lib/apiServices';
import type { DashboardSummary } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const TYPE_LABELS: Record<string, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Misc',
};

export default function DashboardPage() {
  const today = dayjs().format('YYYY-MM-DD');

  const { data, isLoading, isError } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', today],
    queryFn: () => dashboardApi.summary(today).then((r) => r.data),
  });

  return (
    <AuthGuard>
      <AppLayout title="Dashboard">
        <div className="mb-6">
          <h2 className="text-xl font-bold">Welcome back 👋</h2>
          <p className="text-muted-foreground">{dayjs().format('dddd, MMMM D, YYYY')}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center mt-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError || !data ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load dashboard data.</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard title="Total Products" value={data.stats.products.total} icon={<Layers className="h-5 w-5" />} color="#6B3FA0" subtitle={`${data.stats.products.active} active`} />
              <StatCard title="Branches" value={data.stats.branches.total} icon={<Store className="h-5 w-5" />} color="#F4A261" subtitle={`${data.stats.branches.active} active`} />
              <StatCard title="Materials" value={data.stats.materials.total} icon={<FlaskConical className="h-5 w-5" />} color="#2e7d32" subtitle="in inventory" />
              <StatCard title="Recipes" value={data.stats.recipes.total} icon={<BookOpen className="h-5 w-5" />} color="#d32f2f" subtitle="configured" />
            </div>

            {/* Operational Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Low Stock */}
              <Card className={data.lowStock.length > 0 ? 'border-destructive border-2' : ''}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className={`h-5 w-5 ${data.lowStock.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                    <h3 className="font-semibold text-lg">Low Stock Alerts</h3>
                    {data.lowStock.length > 0 && (
                      <Badge variant="destructive">{data.lowStock.length}</Badge>
                    )}
                  </div>
                  {data.lowStock.length === 0 ? (
                    <Alert>
                      <AlertDescription>All materials are above their reorder levels.</AlertDescription>
                    </Alert>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Reorder At</TableHead>
                          <TableHead>Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.lowStock.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.name}</TableCell>
                            <TableCell className="text-right text-destructive font-bold">{m.currentStock}</TableCell>
                            <TableCell className="text-right">{m.reorderLevel}</TableCell>
                            <TableCell>{m.unit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Today's Production */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Factory className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Today&apos;s Production</h3>
                    <span className="text-xs text-muted-foreground ml-auto">{today}</span>
                  </div>
                  {data.production.totalYield === 0 ? (
                    <Alert>
                      <AlertDescription>No production records found for today.</AlertDescription>
                    </Alert>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Total Yield</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.production.byType.map(({ type, totalYield }) => (
                          <TableRow key={type}>
                            <TableCell>
                              <Badge variant="outline">{TYPE_LABELS[type] ?? type}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{totalYield.toLocaleString()} pcs</TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="font-bold">Total</TableCell>
                          <TableCell className="text-right font-bold">{data.production.totalYield.toLocaleString()} pcs</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Products & Branches */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">Products</h3>
                  <div className="space-y-0">
                    {data.products.map((p) => (
                      <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div>
                          <p className="text-sm font-semibold">{p.name}</p>
                          <Badge variant="secondary" className="text-[0.65rem] h-[18px] mt-0.5">{p.type}</Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">₱{p.price.toFixed(2)}</p>
                          <Badge variant={p.isActive ? 'default' : 'secondary'} className="text-[0.65rem] h-[18px]">
                            {p.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">Branches</h3>
                  <div className="space-y-0">
                    {data.branches.map((b) => (
                      <div key={b.id} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div>
                          <p className="text-sm font-semibold">{b.name}</p>
                          <p className="text-xs text-muted-foreground">{b.address ?? 'No address'}</p>
                        </div>
                        <Badge variant={b.isActive ? 'default' : 'secondary'} className="text-[0.7rem]">
                          {b.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </AppLayout>
    </AuthGuard>
  );
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-extrabold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="rounded-xl p-3 flex items-center" style={{ backgroundColor: `${color}18`, color }}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
