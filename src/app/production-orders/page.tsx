'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Plus, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight,
  Check, X, ClipboardList,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { productionOrdersApi, productsApi } from '@/lib/apiServices';
import type { Product, ProductionOrder, ProductionOrderStatus, ProductType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Miscellaneous' };

const STATUS_BADGE: Record<ProductionOrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  FINALIZED: { label: 'Finalized', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function ProductionOrdersPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductionOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductionOrder | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<ProductionOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ProductionOrder | null>(null);
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<Map<number, number>>(new Map());
  const [formError, setFormError] = useState('');

  const invalidateProductionViews = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['production-orders'] });
    qc.invalidateQueries({ queryKey: ['planned-yield'] });
    qc.invalidateQueries({ queryKey: ['production'] });
  }, [qc]);

  // ── Data ──
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const { data: orders = [], isLoading } = useQuery<ProductionOrder[]>({
    queryKey: ['production-orders', filterDate],
    queryFn: () => productionOrdersApi.byDate(filterDate).then((r) => r.data),
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (data: { date: string; notes?: string; items: { productId: number; yield: number }[] }) =>
      productionOrdersApi.create(data),
    onSuccess: () => { invalidateProductionViews(); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { notes?: string; items?: { productId: number; yield: number }[] } }) =>
      productionOrdersApi.update(id, data),
    onSuccess: () => { invalidateProductionViews(); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ProductionOrderStatus }) =>
      productionOrdersApi.update(id, { status }),
    onSuccess: () => {
      invalidateProductionViews();
      setFinalizeTarget(null);
      setCancelTarget(null);
    },
    onError: (err) => setFormError(extractError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productionOrdersApi.delete(id),
    onSuccess: () => { invalidateProductionViews(); setDeleteTarget(null); },
  });

  // ── Dialog helpers ──
  const openCreate = useCallback(() => {
    setEditTarget(null);
    setFormNotes('');
    const defaultItems = new Map<number, number>();
    activeProducts.forEach((p) => defaultItems.set(p.id, 0));
    setFormItems(defaultItems);
    setFormError('');
    setDialogOpen(true);
  }, [activeProducts]);

  const openEdit = useCallback((order: ProductionOrder) => {
    setEditTarget(order);
    setFormNotes(order.notes ?? '');
    const items = new Map<number, number>();
    // Include all active products, filling from order items
    activeProducts.forEach((p) => items.set(p.id, 0));
    order.items.forEach((i) => items.set(i.productId, i.yield));
    setFormItems(items);
    setFormError('');
    setDialogOpen(true);
  }, [activeProducts]);

  const handleSave = useCallback(() => {
    setFormError('');
    const items = Array.from(formItems.entries()).map(([productId, yieldVal]) => ({
      productId,
      yield: yieldVal,
    }));

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: { notes: formNotes || undefined, items } });
    } else {
      createMutation.mutate({ date: filterDate, notes: formNotes || undefined, items });
    }
  }, [formItems, formNotes, filterDate, editTarget, createMutation, updateMutation]);

  const saving = createMutation.isPending || updateMutation.isPending;

  // ── Date nav ──
  const goDate = (days: number) => setFilterDate(dayjs(filterDate).add(days, 'day').format('YYYY-MM-DD'));
  const today = dayjs().format('YYYY-MM-DD');

  // ── Aggregated planned yield for the day ──
  const plannedByProduct = useMemo(() => {
    const map = new Map<number, number>();
    for (const order of orders) {
      if (order.status === 'CANCELLED') continue;
      for (const item of order.items) {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.yield);
      }
    }
    return map;
  }, [orders]);

  const totalPlannedYield = useMemo(
    () => Array.from(plannedByProduct.values()).reduce((a, b) => a + b, 0),
    [plannedByProduct],
  );

  const orderStats = useMemo(() => {
    let drafts = 0;
    let finalized = 0;
    for (const order of orders) {
      if (order.status === 'DRAFT') drafts++;
      if (order.status === 'FINALIZED') finalized++;
    }
    return { drafts, finalized };
  }, [orders]);

  // Group by type for the form
  const productsByType = useMemo(() => {
    const map = new Map<ProductType, Product[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    activeProducts.forEach((p) => map.get(p.type)?.push(p));
    return map;
  }, [activeProducts]);

  const plannedSummaryRows = useMemo(() => {
    return Array.from(plannedByProduct.entries())
      .filter(([, y]) => y > 0)
      .sort((a, b) => {
        const pA = productById.get(a[0]);
        const pB = productById.get(b[0]);
        if (!pA || !pB) return 0;
        const typeOrder = PRODUCT_TYPE_ORDER.indexOf(pA.type) - PRODUCT_TYPE_ORDER.indexOf(pB.type);
        if (typeOrder !== 0) return typeOrder;
        const orderDiff = pA.sortOrder - pB.sortOrder;
        return orderDiff !== 0 ? orderDiff : pA.name.localeCompare(pB.name);
      });
  }, [plannedByProduct, productById]);

  return (
    <AuthGuard>
      <AppLayout title="Production Orders">
        <TooltipProvider>
          {/* ── Date Toolbar ── */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => goDate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                className="w-[160px] h-9"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
              <Button variant="outline" size="icon" onClick={() => goDate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {filterDate !== today && (
                <Button variant="ghost" size="sm" onClick={() => setFilterDate(today)}>Today</Button>
              )}
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> New Order
            </Button>
          </div>

          {/* ── Day Summary Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs text-muted-foreground">Orders</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-2xl font-bold">{orders.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs text-muted-foreground">Total Planned Yield</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-2xl font-bold text-primary">{totalPlannedYield.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs text-muted-foreground">Finalized</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-2xl font-bold text-green-600">
                  {orderStats.finalized}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs text-muted-foreground">Drafts</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-2xl font-bold text-amber-600">
                  {orderStats.drafts}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Orders List ── */}
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : orders.length === 0 ? (
            <Card className="shadow-none">
              <CardContent className="py-12 text-center text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No production orders for this day.</p>
                <Button variant="outline" className="mt-3" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Create First Order
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const nonZeroItems = order.items.filter((i) => i.yield > 0);
                const totalYield = order.items.reduce((sum, i) => sum + i.yield, 0);
                const statusInfo = STATUS_BADGE[order.status];

                return (
                  <Card key={order.id} className="shadow-sm">
                    <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-sm font-semibold">PO #{order.id}</CardTitle>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {dayjs(order.createdAt).format('h:mm A')}
                          {order.createdBy ? ` by ${order.createdBy.email}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {order.status === 'DRAFT' && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFinalizeTarget(order)}>
                                  <Check className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Finalize</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCancelTarget(order)}>
                                  <X className="h-3.5 w-3.5 text-amber-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Cancel</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(order)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(order)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 pt-0">
                      {order.notes && <p className="text-xs text-muted-foreground mb-2">{order.notes}</p>}
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-semibold">{totalYield.toLocaleString()} total yield</span>
                        <span className="text-muted-foreground">{nonZeroItems.length} products with yield</span>
                      </div>
                      {nonZeroItems.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {nonZeroItems.map((item) => (
                            <Badge key={item.id} variant="outline" className="text-xs">
                              {item.product?.name ?? `#${item.productId}`}: {item.yield}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── Planned Yield Summary Table ── */}
          {plannedByProduct.size > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b-2 pb-1 mb-2">
                Day Planned Yield Summary
              </h3>
              <Card className="shadow-none overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Type</TableHead>
                      <TableHead className="text-right">Planned Yield</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plannedSummaryRows.map(([productId, plannedYield]) => {
                        const product = productById.get(productId);
                        return (
                          <TableRow key={productId}>
                            <TableCell className="font-medium">{product?.name ?? `#${productId}`}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-xs">{product?.type}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{plannedYield.toLocaleString()}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* ── Create/Edit Dialog ── */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editTarget ? `Edit PO #${editTarget.id}` : 'New Production Order'}</DialogTitle>
              </DialogHeader>

              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Order notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="h-16"
                />
              </div>

              {/* Products grouped by type */}
              {PRODUCT_TYPE_ORDER.map((type) => {
                const prods = productsByType.get(type) ?? [];
                if (prods.length === 0) return null;
                return (
                  <div key={type}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 mt-3">
                      {TYPE_LABELS[type]}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {prods.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <Label className="text-xs w-[100px] truncate" title={p.name}>{p.name}</Label>
                          <Input
                            type="number"
                            className="h-7 w-[80px]"
                            min={0}
                            value={String(formItems.get(p.id) ?? 0)}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setFormItems((prev) => {
                                const next = new Map(prev);
                                next.set(p.id, val);
                                return next;
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="text-sm text-right font-semibold text-primary mt-2">
                Total: {Array.from(formItems.values()).reduce((a, b) => a + b, 0).toLocaleString()}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editTarget ? 'Save' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── Finalize Confirm ── */}
          <AlertDialog open={!!finalizeTarget} onOpenChange={() => setFinalizeTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Finalize PO #{finalizeTarget?.id}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This marks the production order as finalized. It cannot be edited after this.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => finalizeTarget && statusMutation.mutate({ id: finalizeTarget.id, status: 'FINALIZED' })}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Finalize
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── Cancel Confirm ── */}
          <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel PO #{cancelTarget?.id}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This marks the order as cancelled. Its planned yield will no longer count toward the daily total.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => cancelTarget && statusMutation.mutate({ id: cancelTarget.id, status: 'CANCELLED' })}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Cancel Order
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── Delete Confirm ── */}
          <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete PO #{deleteTarget?.id}?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Error snackbar */}
          {formError && !dialogOpen && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
              <Alert variant="destructive" className="shadow-lg">
                <AlertDescription className="flex items-center gap-2">
                  {formError}
                  <Button variant="ghost" size="sm" onClick={() => setFormError('')}>×</Button>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </TooltipProvider>
      </AppLayout>
    </AuthGuard>
  );
}
