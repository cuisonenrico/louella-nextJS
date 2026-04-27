'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Calculator, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productionApi, productionOrdersApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, PlannedYield, Product, Production, ProductType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import MaterialConsumptionDrawer from './components/MaterialConsumptionDrawer';
import ProductionDateToolbar from './components/ProductionDateToolbar';
import ProductionPendingBar from './components/ProductionPendingBar';
import ProductionSummaryAccordion from './components/ProductionSummaryAccordion';
import { useProductionRowUpdate, type ProdRow } from './hooks/useProductionRowUpdate';
import { useProductionMutations } from './hooks/useProductionMutations';
import { useProductionSummary } from './hooks/useProductionSummary';
import {
  buildFinalizedPlannedYields,
  useProductionTabNavigation,
  useYieldAutoSync,
  useYieldEnterNavigation,
} from './hooks/useProductionPlannedYield';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Miscellaneous' };

export default function ProductionPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [rowError, setRowError] = useState('');
  const [consumptionId, setConsumptionId] = useState<number | null>(null);
  const [consumptionPlannedYield, setConsumptionPlannedYield] = useState<number | undefined>(undefined);

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list().then((r) => r.data) });
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const prodQuery = useQuery({
    queryKey: ['production', filterDate],
    queryFn: () => productionApi.byDateRange(filterDate).then((r) => r.data as Production[]),
  });

  const invQuery = useQuery({
    queryKey: ['inventory-for-production', filterDate],
    queryFn: () => inventoryApi.byDateRange(filterDate).then((r) => r.data as Inventory[]),
  });

  const { data: plannedYields = [] } = useQuery<PlannedYield[]>({
    queryKey: ['planned-yield', filterDate],
    queryFn: async () => buildFinalizedPlannedYields(await productionOrdersApi.byDate(filterDate).then((r) => r.data)),
  });

  const plannedByProduct = useMemo(
    () => new Map(plannedYields.map((p) => [p.productId, p.plannedYield])),
    [plannedYields],
  );

  const branchesWithNoInventory = useMemo(() => {
    const branchIdsWithRecords = new Set((invQuery.data ?? []).map((inv) => inv.branchId));
    return new Set(branches.filter((b) => !branchIdsWithRecords.has(b.id)).map((b) => b.id));
  }, [invQuery.data, branches]);

  const { pendingProduction, pendingInventory, handleFieldChange, resetPending } = useProductionRowUpdate();

  const { initBranchMutation, initAllBranchesMutation, initProductionMutation, savePendingMutation } = useProductionMutations({
    filterDate, products, branches, branchesWithNoInventory, prodQueryData: prodQuery.data, plannedByProduct, onError: setRowError,
  });

  useEffect(() => { resetPending(); }, [filterDate, resetPending]);

  // Lookup maps
  const productionByProduct = useMemo(
    () => new Map((prodQuery.data ?? []).map((p) => [p.productId, p])),
    [prodQuery.data],
  );

  const inventoryByProductBranch = useMemo(() => {
    const m = new Map<string, Inventory>();
    for (const inv of invQuery.data ?? []) m.set(`${inv.productId}:${inv.branchId}`, inv);
    return m;
  }, [invQuery.data]);

  // One row per active product
  const allRows = useMemo<ProdRow[]>(() => {
    return products.filter((p) => p.isActive).map((p) => {
      const prodRec = productionByProduct.get(p.id);
      const row: ProdRow = { id: p.id, productId: p.id, type: p.type, _productionId: prodRec?.id ?? null, yield: prodRec?.yield ?? 0 };
      for (const b of branches) {
        const inv = inventoryByProductBranch.get(`${p.id}:${b.id}`);
        row[`branch_${b.id}`] = inv?.delivery ?? 0;
        row[`_inv_${b.id}`] = inv?.id ?? null;
      }
      return row;
    });
  }, [products, branches, productionByProduct, inventoryByProductBranch]);

  useYieldAutoSync({ allRows, plannedByProduct, pendingProduction, handleFieldChange, filterDate });

  const rowsByType = useMemo(() => {
    const map = new Map<ProductType, ProdRow[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    for (const row of allRows) map.get(row.type)?.push(row);
    return map;
  }, [allRows]);

  const branchIds = useMemo(() => branches.map((b) => b.id), [branches]);
  const handleYieldEnter = useYieldEnterNavigation(rowsByType);
  const handleTabToNextInput = useProductionTabNavigation(rowsByType, branchIds);

  const discardPending = useCallback(() => {
    resetPending();
    qc.invalidateQueries({ queryKey: ['production'] });
    qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
  }, [resetPending, qc]);

  const summary = useProductionSummary(allRows, branches, productById, plannedByProduct);

  const today = dayjs().format('YYYY-MM-DD');
  const totalPending = pendingProduction.size + pendingInventory.size;
  const isLoading = prodQuery.isLoading || invQuery.isLoading;
  const missingProductionCount = products.filter(
    (p) => p.isActive && !(prodQuery.data ?? []).some((pr) => pr.productId === p.id),
  ).length;

  // Get effective value considering pending changes
  const getEffectiveValue = (row: ProdRow, field: string): number => {
    if (field === 'yield') {
      const prodId = row._productionId;
      if (prodId != null && pendingProduction.has(prodId)) return pendingProduction.get(prodId)!.yield;
      return row.yield;
    }
    if (field.startsWith('branch_')) {
      const branchSuffix = field.slice('branch_'.length);
      const invId = row[`_inv_${branchSuffix}`] as number | null;
      if (invId != null && pendingInventory.has(invId)) return pendingInventory.get(invId)!.delivery;
      return (row[field] as number) ?? 0;
    }
    return (row[field] as number) ?? 0;
  };

  const isRowDirty = (row: ProdRow): boolean => {
    if (row._productionId != null && pendingProduction.has(row._productionId)) return true;
    return branches.some((b) => {
      const invId = row[`_inv_${b.id}`] as number | null;
      return invId != null && pendingInventory.has(invId);
    });
  };

  const overAllocatedByProduct = useMemo(() => {
    const map = new Map<number, { assigned: number; yield: number; overBy: number }>();
    for (const row of allRows) {
      const yieldVal = getEffectiveValue(row, 'yield');
      const assigned = branches.reduce((sum, b) => sum + getEffectiveValue(row, `branch_${b.id}`), 0);
      if (assigned > yieldVal) {
        map.set(row.productId, { assigned, yield: yieldVal, overBy: assigned - yieldVal });
      }
    }
    return map;
  }, [allRows, branches, pendingProduction, pendingInventory]);

  const hasOverAllocation = overAllocatedByProduct.size > 0;

  return (
    <AuthGuard>
      <AppLayout title="Production">
        <TooltipProvider>
          <ProductionDateToolbar
            filterDate={filterDate}
            today={today}
            missingProductionCount={missingProductionCount}
            missingInventoryBranchCount={branchesWithNoInventory.size}
            isProdLoading={prodQuery.isLoading}
            isInvLoading={invQuery.isLoading}
            isInitProdPending={initProductionMutation.isPending}
            isInitAllInvPending={initAllBranchesMutation.isPending}
            onDateChange={setFilterDate}
            onInitProduction={() => initProductionMutation.mutate()}
            onInitAllInventory={() => initAllBranchesMutation.mutate()}
          />

          <ProductionPendingBar
            totalPending={totalPending}
            isSaving={savePendingMutation.isPending}
            isSaveDisabled={hasOverAllocation}
            saveDisabledMessage={
              hasOverAllocation
                ? 'Cannot save while any branch allocation exceeds yield.'
                : undefined
            }
            onDiscard={discardPending}
            onSave={() => {
              if (hasOverAllocation) {
                setRowError('Cannot save: one or more products have total branch allocation greater than yield.');
                return;
              }
              savePendingMutation.mutate(
                { production: pendingProduction, inventory: pendingInventory },
                { onSuccess: resetPending },
              );
            }}
          />

          <ProductionSummaryAccordion summary={summary} branches={branches} />

          {/* Per-type grids */}
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : allRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No active products found.</p>
          ) : (
            PRODUCT_TYPE_ORDER.map((type) => {
              const typeRows = rowsByType.get(type) ?? [];
              if (typeRows.length === 0) return null;

              return (
                <div key={type} className="mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b-2 pb-1 mb-2">
                    {TYPE_LABELS[type]}
                  </h3>
                  <Card className="shadow-none overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[130px]">Product</TableHead>
                          <TableHead className="text-center w-[90px]">Planned</TableHead>
                          <TableHead className="text-center w-[90px]">Yield</TableHead>
                          <TableHead className="text-center w-[100px]">Discrepancy</TableHead>
                          {branches.map((b) => (
                            <TableHead key={b.id} className="text-center w-[100px]">
                              <div className="flex items-center justify-center gap-1">
                                <span className="truncate">{b.name}</span>
                                {branchesWithNoInventory.has(b.id) && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 p-0"
                                        onClick={(e) => { e.stopPropagation(); initBranchMutation.mutate(b.id); }}
                                        disabled={initBranchMutation.isPending && initBranchMutation.variables === b.id}
                                      >
                                        {initBranchMutation.isPending && initBranchMutation.variables === b.id
                                          ? <Loader2 className="h-3 w-3 animate-spin" />
                                          : <span className="text-xs text-primary font-bold">+</span>}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Initialize {b.name} inventory</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableHead>
                          ))}
                          <TableHead className="text-right w-[100px]">Exp. Sales</TableHead>
                          <TableHead className="text-center w-[80px]">Mat. Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {typeRows.map((row) => {
                          const dirty = isRowDirty(row);
                          const yieldVal = getEffectiveValue(row, 'yield');
                          const planned = plannedByProduct.get(row.productId) ?? 0;
                          const discrepancy = yieldVal - planned;
                          const totalAssigned = branches.reduce((sum, b) => sum + getEffectiveValue(row, `branch_${b.id}`), 0);
                          const overAllocation = overAllocatedByProduct.get(row.productId);
                          const price = productById.get(row.productId)?.price ?? 0;
                          const expSales = totalAssigned * price;

                          return (
                            <TableRow
                              key={row.id}
                              className={
                                overAllocation ? 'bg-red-50/60' : dirty ? 'bg-amber-50/50' : ''
                              }
                            >
                              <TableCell className="font-medium">{productById.get(row.productId)?.name ?? `Product #${row.productId}`}</TableCell>
                              <TableCell className="text-center">
                                {planned > 0 ? (
                                  <span className="text-muted-foreground font-medium">{planned}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {row._productionId != null ? (
                                  <Input
                                    id={`yield-input-${row.productId}`}
                                    type="number"
                                    className="w-[70px] h-7 text-center mx-auto"
                                    value={String(yieldVal)}
                                    onChange={(e) => handleFieldChange(row, 'yield', parseInt(e.target.value) || 0)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleYieldEnter(row.productId);
                                      } else if (e.key === 'Tab' && !e.shiftKey) {
                                        const moved = handleTabToNextInput(`yield-input-${row.productId}`);
                                        if (moved) e.preventDefault();
                                      }
                                    }}
                                    min={0}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={
                                  discrepancy < 0
                                    ? 'font-semibold text-red-600'
                                    : discrepancy > 0
                                      ? 'font-semibold text-green-600'
                                      : 'text-muted-foreground'
                                }>
                                  {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
                                </span>
                              </TableCell>
                              {branches.map((b) => {
                                const hasRecord = (row[`_inv_${b.id}`] as number | null) != null;
                                const val = getEffectiveValue(row, `branch_${b.id}`);
                                return (
                                  <TableCell key={b.id} className="text-center">
                                    {hasRecord ? (
                                      <Input
                                        id={`branch-input-${row.productId}-${b.id}`}
                                        type="number"
                                        className={`w-[70px] h-7 text-center mx-auto ${overAllocation ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                                        value={String(val)}
                                        onChange={(e) => handleFieldChange(row, `branch_${b.id}`, parseInt(e.target.value) || 0)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Tab' && !e.shiftKey) {
                                            const moved = handleTabToNextInput(`branch-input-${row.productId}-${b.id}`);
                                            if (moved) e.preventDefault();
                                          }
                                        }}
                                        min={0}
                                      />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right font-semibold">
                                <div className="flex items-center justify-end gap-1">
                                  {overAllocation ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertTriangle className="h-4 w-4 text-red-600" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Assigned {overAllocation.assigned} exceeds yield {overAllocation.yield} by {overAllocation.overBy}.
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                  <span>₱{expSales.toLocaleString()}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {row._productionId != null && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setConsumptionId(row._productionId!); setConsumptionPlannedYield(planned || undefined); }}>
                                        <Calculator className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>View material consumption</TooltipContent>
                                  </Tooltip>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              );
            })
          )}

          {/* Error snackbar */}
          {rowError && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
              <Alert variant="destructive" className="shadow-lg">
                <AlertDescription className="flex items-center gap-2">
                  {rowError}
                  <Button variant="ghost" size="sm" onClick={() => setRowError('')}>×</Button>
                </AlertDescription>
              </Alert>
            </div>
          )}

          <MaterialConsumptionDrawer consumptionId={consumptionId} plannedYield={consumptionPlannedYield} onClose={() => { setConsumptionId(null); setConsumptionPlannedYield(undefined); }} />
        </TooltipProvider>
      </AppLayout>
    </AuthGuard>
  );
}
