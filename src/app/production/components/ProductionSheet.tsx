'use client';

import { Fragment, useCallback, useMemo } from 'react';
import { AlertTriangle, Calculator, Loader2 } from 'lucide-react';
import type { Branch, Product, ProductType } from '@/types';
import type { ProdRow } from '../hooks/useProductionRowUpdate';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SheetInput } from '@/components/sheet/SheetInput';
import { useSheetNavigation } from '@/components/sheet/useSheetNavigation';
import { SHEET_BANNER, SHEET_CELL, SHEET_CONTAINER, SHEET_HEAD, SHEET_TABLE } from '@/components/sheet/styles';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Miscellaneous',
};

interface ProductionSheetProps {
  rowsByType: Map<ProductType, ProdRow[]>;
  branches: Branch[];
  branchesWithNoInventory: Set<number>;
  overAllocatedByProduct: Map<number, { assigned: number; yield: number; overBy: number }>;
  plannedByProduct: Map<number, number>;
  productById: Map<number, Product>;
  getEffectiveValue: (row: ProdRow, field: string) => number;
  isRowDirty: (row: ProdRow) => boolean;
  handleFieldChange: (row: ProdRow, field: string, value: number) => void;
  onConsumptionClick: (productionId: number, plannedYield?: number) => void;
  onInitBranch: (branchId: number) => void;
  isInitBranchPending: (branchId: number) => boolean;
}

/**
 * The production board as one continuous spreadsheet: a single sticky-header
 * table with banner rows between product types, ruled cells, a frozen Product
 * column (the sheet scrolls horizontally when there are many branches), and
 * full arrow-key grid navigation across the Yield and per-branch cells.
 */
export function ProductionSheet({
  rowsByType,
  branches,
  branchesWithNoInventory,
  overAllocatedByProduct,
  plannedByProduct,
  productById,
  getEffectiveValue,
  isRowDirty,
  handleFieldChange,
  onConsumptionClick,
  onInitBranch,
  isInitBranchPending,
}: ProductionSheetProps) {
  const orderedRows = useMemo(
    () => PRODUCT_TYPE_ORDER.flatMap((type) => rowsByType.get(type) ?? []),
    [rowsByType],
  );
  const orderedRowIds = useMemo(() => orderedRows.map((row) => row.productId), [orderedRows]);

  // Editable columns share their names with the ProdRow field keys, so the
  // navigation column is also the field passed to handleFieldChange.
  const editableCols = useMemo(
    () => ['yield', ...branches.map((b) => `branch_${b.id}`)],
    [branches],
  );

  const getInputId = useCallback(
    (productId: number, col: string) => `production-input-${productId}-${col}`,
    [],
  );

  const { moveInColumn, moveLinear } = useSheetNavigation(orderedRowIds, editableCols, getInputId);

  const columnCount = 6 + branches.length; // Product, Planned, Yield, Discrepancy, branches…, Exp. Sales, Mat. Cost

  const editCell = (row: ProdRow, col: string, overAllocated: boolean) => (
    <SheetInput
      id={getInputId(row.productId, col)}
      value={getEffectiveValue(row, col)}
      onValueChange={(value) => handleFieldChange(row, col, value)}
      onColumnMove={(dir) => moveInColumn(row.productId, col, dir)}
      onLinearMove={(dir) => moveLinear(getInputId(row.productId, col), dir)}
      className={overAllocated ? 'text-red-700 focus:ring-red-400' : undefined}
    />
  );

  return (
    <Table containerClassName={SHEET_CONTAINER} className={SHEET_TABLE}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(SHEET_HEAD, 'sticky left-0 z-30 text-left min-w-[140px]')}>Product</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'z-20 text-right w-[80px]')}>Planned</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'z-20 text-right w-[90px]')}>Yield</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'z-20 text-right w-[100px]')}>
            <Tooltip>
              <TooltipTrigger className="underline decoration-dotted cursor-help">Discrepancy</TooltipTrigger>
              <TooltipContent className="max-w-[200px] text-center">Yield minus Planned. Negative = under-produced vs plan.</TooltipContent>
            </Tooltip>
          </TableHead>
          {branches.map((b) => (
            <TableHead key={b.id} className={cn(SHEET_HEAD, 'z-20 text-right min-w-[100px]')}>
              <div className="flex items-center justify-end gap-1">
                <span className="truncate">{b.name}</span>
                {branchesWithNoInventory.has(b.id) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 p-0"
                        onClick={(e) => { e.stopPropagation(); onInitBranch(b.id); }}
                        disabled={isInitBranchPending(b.id)}
                      >
                        {isInitBranchPending(b.id)
                          ? <Loader2 className="size-3 animate-spin" />
                          : <span className="text-xs text-primary font-bold">+</span>}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Initialize {b.name} inventory</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TableHead>
          ))}
          <TableHead className={cn(SHEET_HEAD, 'z-20 text-right w-[110px]')}>Exp. Sales</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'z-20 text-center w-[90px]')}>Mat. Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {PRODUCT_TYPE_ORDER.map((type) => {
          const typeRows = rowsByType.get(type) ?? [];
          if (typeRows.length === 0) return null;

          return (
            <Fragment key={type}>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className={SHEET_BANNER}>
                  {/* Sticky so the label stays visible while scrolling horizontally. */}
                  <div className="sticky left-0 w-fit">{TYPE_LABELS[type]}</div>
                </TableCell>
              </TableRow>
              {typeRows.map((row) => {
                const dirty = isRowDirty(row);
                const yieldVal = getEffectiveValue(row, 'yield');
                const planned = plannedByProduct.get(row.productId) ?? 0;
                const discrepancy = yieldVal - planned;
                const totalAssigned = branches.reduce((sum, b) => sum + getEffectiveValue(row, `branch_${b.id}`), 0);
                const overAllocation = overAllocatedByProduct.get(row.productId);
                const price = productById.get(row.productId)?.price ?? 0;
                const expSales = totalAssigned * price;
                const rowTint = overAllocation ? 'bg-red-50/60' : dirty ? 'bg-amber-50/50' : '';
                // The frozen Product cell needs a solid background so rows
                // scrolling under it don't show through; mirror the row tint.
                const stickyBg = overAllocation ? 'bg-red-50' : dirty ? 'bg-amber-50' : 'bg-background';

                return (
                  <TableRow key={row.id} className={rowTint}>
                    <TableCell className={cn(SHEET_CELL, 'sticky left-0 z-10 px-2 font-medium', stickyBg)}>
                      {productById.get(row.productId)?.name ?? `Product #${row.productId}`}
                    </TableCell>
                    <TableCell className={cn(SHEET_CELL, 'px-2 text-right tabular-nums text-muted-foreground')}>
                      {planned > 0 ? <span className="font-medium">{planned}</span> : '—'}
                    </TableCell>
                    <TableCell className={cn(SHEET_CELL, 'p-0')}>
                      {row._productionId != null
                        ? editCell(row, 'yield', !!overAllocation)
                        : <div className="px-2 text-right text-muted-foreground">—</div>}
                    </TableCell>
                    <TableCell className={cn(SHEET_CELL, 'px-2 text-right tabular-nums')}>
                      <span className={
                        discrepancy < 0 ? 'font-semibold text-red-600'
                          : discrepancy > 0 ? 'font-semibold text-green-600'
                          : 'text-muted-foreground'
                      }>
                        {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
                      </span>
                    </TableCell>
                    {branches.map((b) => {
                      const hasRecord = (row[`_inv_${b.id}`] as number | null) != null;
                      return (
                        <TableCell key={b.id} className={cn(SHEET_CELL, 'p-0')}>
                          {hasRecord
                            ? editCell(row, `branch_${b.id}`, !!overAllocation)
                            : <div className="px-2 text-right text-muted-foreground">—</div>}
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn(SHEET_CELL, 'px-2 text-right font-semibold tabular-nums')}>
                      <div className="flex items-center justify-end gap-1">
                        {overAllocation ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="size-4 text-red-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              Assigned {overAllocation.assigned} exceeds yield {overAllocation.yield} by {overAllocation.overBy}.
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        <span>₱{expSales.toLocaleString()}</span>
                      </div>
                    </TableCell>
                    <TableCell className={cn(SHEET_CELL, 'px-1 text-center')}>
                      {row._productionId != null && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1 text-primary border-primary/40 hover:bg-primary/5"
                              onClick={() => onConsumptionClick(row._productionId!, plannedByProduct.get(row.productId) || undefined)}
                            >
                              <Calculator className="size-3" />
                              ₱ Cost
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View recipe-based material cost</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
