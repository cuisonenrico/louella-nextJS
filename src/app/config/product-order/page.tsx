'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Loader2, Save } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import AppLayout from '@/components/layout/AppLayout';
import { productsApi } from '@/lib/apiServices';
import type { Product, ProductType } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Miscellaneous',
};

type ProductOrderByType = Record<ProductType, Product[]>;

function toOrderByType(products: Product[]): ProductOrderByType {
  const grouped: ProductOrderByType = {
    BREAD: [],
    CAKE: [],
    SPECIAL: [],
    MISCELLANEOUS: [],
  };

  for (const product of products.filter((p) => p.isActive)) {
    grouped[product.type].push(product);
  }

  return grouped;
}

function moveProductInType(list: Product[], sourceId: number, targetId: number): Product[] {
  const sourceIndex = list.findIndex((item) => item.id === sourceId);
  const targetIndex = list.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return list;
  }

  const next = [...list];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function getIds(list: Product[]): number[] {
  return list.map((item) => item.id);
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export default function ProductOrderPage() {
  const qc = useQueryClient();
  const [overridesByType, setOverridesByType] = useState<Partial<ProductOrderByType>>({});
  const [dragState, setDragState] = useState<{ type: ProductType; productId: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const serverOrderByType = useMemo(() => toOrderByType(products), [products]);

  const initialIdsByType = useMemo(
    () => ({
      BREAD: getIds(serverOrderByType.BREAD),
      CAKE: getIds(serverOrderByType.CAKE),
      SPECIAL: getIds(serverOrderByType.SPECIAL),
      MISCELLANEOUS: getIds(serverOrderByType.MISCELLANEOUS),
    }),
    [serverOrderByType],
  );

  const getCurrentRows = (type: ProductType): Product[] => overridesByType[type] ?? serverOrderByType[type];

  const hasChanges = PRODUCT_TYPE_ORDER.some(
    (type) => !arraysEqual(getIds(getCurrentRows(type)), initialIdsByType[type]),
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const changedTypes = PRODUCT_TYPE_ORDER.filter(
        (type) => !arraysEqual(getIds(getCurrentRows(type)), initialIdsByType[type]),
      );

      await Promise.all(
        changedTypes.map((type) =>
          productsApi.updateOrder({
            type,
            items: getCurrentRows(type).map((item, index) => ({ id: item.id, sortOrder: index })),
          }),
        ),
      );
    },
    onSuccess: () => {
      setErrorMessage('');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setErrorMessage(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save product order.'));
    },
  });

  const handleDropOnRow = (type: ProductType, targetProductId: number) => {
    if (!dragState || dragState.type !== type || dragState.productId === targetProductId) {
      return;
    }

    setOverridesByType((prev) => {
      const source = prev[type] ?? serverOrderByType[type];
      return {
        ...prev,
        [type]: moveProductInType(source, dragState.productId, targetProductId),
      };
    });
    setDragState(null);
  };

  const resetToServerOrder = () => {
    setOverridesByType({});
    setErrorMessage('');
  };

  return (
    <AuthGuard>
      <AppLayout title="Config · Product Order">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Product Order</h2>
            <p className="text-sm text-muted-foreground">
              Drag rows to set product ordering. Inventory, production, and related product-row modules will follow this order.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={resetToServerOrder} disabled={!hasChanges || saveMutation.isPending}>
              Reset
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!hasChanges || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Order
            </Button>
          </div>
        </div>

        {errorMessage && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {PRODUCT_TYPE_ORDER.map((type) => {
              const rows = getCurrentRows(type);
              return (
                <Card key={type}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{TYPE_LABELS[type]}</CardTitle>
                      <Badge variant="secondary">{rows.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active products in this category.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[48px]">Move</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Current Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((product) => (
                            <TableRow
                              key={product.id}
                              draggable
                              onDragStart={() => setDragState({ type, productId: product.id })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => handleDropOnRow(type, product.id)}
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <TableCell>
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell className="text-right">₱{product.price.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
