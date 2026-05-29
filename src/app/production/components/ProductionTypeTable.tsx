'use client';

import { AlertTriangle, Calculator, Loader2 } from 'lucide-react';
import type { Branch, Product, ProductType } from '@/types';
import type { ProdRow } from '../hooks/useProductionRowUpdate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ProductionTypeTableProps {
  type: ProductType;
  label: string;
  rows: ProdRow[];
  branches: Branch[];
  branchesWithNoInventory: Set<number>;
  overAllocatedByProduct: Map<number, { assigned: number; yield: number; overBy: number }>;
  plannedByProduct: Map<number, number>;
  productById: Map<number, Product>;
  getEffectiveValue: (row: ProdRow, field: string) => number;
  isRowDirty: (row: ProdRow) => boolean;
  handleFieldChange: (row: ProdRow, field: string, value: number) => void;
  handleYieldEnter: (productId: number) => void;
  handleTabToNextInput: (inputId: string) => boolean;
  onConsumptionClick: (productionId: number, plannedYield?: number) => void;
  onInitBranch: (branchId: number) => void;
  isInitBranchPending: (branchId: number) => boolean;
}

export function ProductionTypeTable({
  label,
  rows,
  branches,
  branchesWithNoInventory,
  overAllocatedByProduct,
  plannedByProduct,
  productById,
  getEffectiveValue,
  isRowDirty,
  handleFieldChange,
  handleYieldEnter,
  handleTabToNextInput,
  onConsumptionClick,
  onInitBranch,
  isInitBranchPending,
}: ProductionTypeTableProps) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b-2 pb-1 mb-2">
        {label}
      </h3>
      <Card className="shadow-none overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[130px] sticky left-0 bg-muted/50 z-10">Product</TableHead>
              <TableHead className="text-center w-[90px]">Planned</TableHead>
              <TableHead className="text-center w-[90px]">Yield</TableHead>
              <TableHead className="text-center w-[100px]">
                <Tooltip>
                  <TooltipTrigger className="underline decoration-dotted cursor-help">Discrepancy</TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-center">Yield minus Planned. Negative = under-produced vs plan.</TooltipContent>
                </Tooltip>
              </TableHead>
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
                            onClick={(e) => { e.stopPropagation(); onInitBranch(b.id); }}
                            disabled={isInitBranchPending(b.id)}
                          >
                            {isInitBranchPending(b.id)
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
              <TableHead className="text-right w-[110px]">Exp. Sales</TableHead>
              <TableHead className="text-center w-[90px]">Mat. Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
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
                  className={overAllocation ? 'bg-red-50/60' : dirty ? 'bg-amber-50/50' : ''}
                >
                  <TableCell className="font-medium sticky left-0 bg-background z-10">
                    {productById.get(row.productId)?.name ?? `Product #${row.productId}`}
                  </TableCell>
                  <TableCell className="text-center">
                    {planned > 0
                      ? <span className="text-muted-foreground font-medium">{planned}</span>
                      : <span className="text-muted-foreground">—</span>}
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
                          if (e.key === 'Enter') { e.preventDefault(); handleYieldEnter(row.productId); }
                          else if (e.key === 'Tab' && !e.shiftKey) {
                            if (handleTabToNextInput(`yield-input-${row.productId}`)) e.preventDefault();
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
                      discrepancy < 0 ? 'font-semibold text-red-600'
                        : discrepancy > 0 ? 'font-semibold text-green-600'
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
                                if (handleTabToNextInput(`branch-input-${row.productId}-${b.id}`)) e.preventDefault();
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-primary border-primary/40 hover:bg-primary/5"
                            onClick={() => onConsumptionClick(row._productionId!, planned || undefined)}
                          >
                            <Calculator className="h-3 w-3" />
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
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
