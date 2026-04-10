'use client';

import { Alert, Box, CircularProgress, Snackbar, Typography } from '@mui/material';
import { DataGrid, useGridApiRef } from '@mui/x-data-grid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productionApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product, Production, ProductType } from '@/types';
import MaterialConsumptionDrawer from './components/MaterialConsumptionDrawer';
import ProductionDateToolbar from './components/ProductionDateToolbar';
import ProductionPendingBar from './components/ProductionPendingBar';
import ProductionSummaryAccordion from './components/ProductionSummaryAccordion';
import { useProductionRowUpdate, type ProdRow } from './hooks/useProductionRowUpdate';
import { useProductionMutations } from './hooks/useProductionMutations';
import { useProductionColumns } from './hooks/useProductionColumns';
import { useProductionSummary } from './hooks/useProductionSummary';
import { makeTabNavHandler } from '@/lib/makeTabNavHandler';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Miscellaneous',
};

const GRID_SX = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
  '& .MuiDataGrid-columnHeader': { bgcolor: 'grey.100', fontWeight: 700 },
  '& .MuiDataGrid-cell--editable': {
    cursor: 'cell',
    '&:hover': { bgcolor: 'action.hover' },
  },
  '& .MuiDataGrid-cell--editing': {
    bgcolor: 'primary.50 !important',
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: '-2px',
  },
  '& .row--dirty': {
    bgcolor: 'rgba(255, 167, 38, 0.10)',
    '&:hover': { bgcolor: 'rgba(255, 167, 38, 0.18) !important' },
  },
} as const;

export default function ProductionPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [rowError, setRowError] = useState('');
  const [consumptionId, setConsumptionId] = useState<number | null>(null);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const prodQuery = useQuery({
    queryKey: ['production', filterDate],
    queryFn: () => productionApi.byDateRange(filterDate).then((r) => r.data as Production[]),
  });

  const invQuery = useQuery({
    queryKey: ['inventory-for-production', filterDate],
    queryFn: () => inventoryApi.byDateRange(filterDate).then((r) => r.data as Inventory[]),
  });

  const branchesWithNoInventory = useMemo(() => {
    const branchIdsWithRecords = new Set((invQuery.data ?? []).map((inv) => inv.branchId));
    return new Set(branches.filter((b) => !branchIdsWithRecords.has(b.id)).map((b) => b.id));
  }, [invQuery.data, branches]);

  const { pendingProduction, pendingInventory, handleProcessRowUpdate, resetPending } =
    useProductionRowUpdate(branches);

  const { initBranchMutation, initAllBranchesMutation, initProductionMutation, savePendingMutation } =
    useProductionMutations({
      filterDate,
      products,
      branches,
      branchesWithNoInventory,
      prodQueryData: prodQuery.data,
      onError: setRowError,
    });

  useEffect(() => {
    resetPending();
  }, [filterDate, resetPending]);

  // Lookup maps derived from query data
  const productionByProduct = useMemo(
    () => new Map((prodQuery.data ?? []).map((p) => [p.productId, p])),
    [prodQuery.data],
  );

  const inventoryByProductBranch = useMemo(() => {
    const m = new Map<string, Inventory>();
    for (const inv of invQuery.data ?? []) {
      m.set(`${inv.productId}:${inv.branchId}`, inv);
    }
    return m;
  }, [invQuery.data]);

  // One row per active product; branch delivery values read from inventory records
  const allRows = useMemo<ProdRow[]>(() => {
    return products.filter((p) => p.isActive).map((p) => {
      const prodRec = productionByProduct.get(p.id);
      const row: ProdRow = {
        id: p.id,
        productId: p.id,
        type: p.type,
        _productionId: prodRec?.id ?? null,
        yield: prodRec?.yield ?? 0,
      };
      for (const b of branches) {
        const inv = inventoryByProductBranch.get(`${p.id}:${b.id}`);
        row[`branch_${b.id}`] = inv?.delivery ?? 0;
        row[`_inv_${b.id}`] = inv?.id ?? null;
      }
      return row;
    });
  }, [products, branches, productionByProduct, inventoryByProductBranch]);

  const rowsByType = useMemo(() => {
    const map = new Map<ProductType, ProdRow[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    for (const row of allRows) map.get(row.type)?.push(row);
    return map;
  }, [allRows]);

  // Dynamic editable fields: yield + one per branch
  const editableFields = useMemo(
    () => ['yield', ...branches.map((b) => `branch_${b.id}`)],
    [branches],
  );

  const discardPending = useCallback(() => {
    resetPending();
    qc.invalidateQueries({ queryKey: ['production'] });
    qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
  }, [resetPending, qc]);

  const columns = useProductionColumns({
    branches,
    productById,
    branchesWithNoInventory,
    initBranchMutation,
    setConsumptionId: (id) => setConsumptionId(id),
  });

  const summary = useProductionSummary(allRows, branches, productById);

  const today = dayjs().format('YYYY-MM-DD');
  const totalPending = pendingProduction.size + pendingInventory.size;
  const isLoading = prodQuery.isLoading || invQuery.isLoading;
  const missingProductionCount = products.filter(
    (p) => p.isActive && !(prodQuery.data ?? []).some((pr) => pr.productId === p.id),
  ).length;

  const apiRefBread = useGridApiRef();
  const apiRefCake = useGridApiRef();
  const apiRefSpecial = useGridApiRef();
  const apiRefMiscellaneous = useGridApiRef();
  const typeApiRefs = { BREAD: apiRefBread, CAKE: apiRefCake, SPECIAL: apiRefSpecial, MISCELLANEOUS: apiRefMiscellaneous };

  return (
    <AuthGuard>
      <AppLayout title="Production">
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
          onDiscard={discardPending}
          onSave={() =>
            savePendingMutation.mutate(
              { production: pendingProduction, inventory: pendingInventory },
              { onSuccess: resetPending },
            )
          }
        />

        <ProductionSummaryAccordion summary={summary} branches={branches} />

        {/* Per-type grids */}
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : allRows.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={6}>
            No active products found.
          </Typography>
        ) : (
          PRODUCT_TYPE_ORDER.map((type) => {
            const typeRows = rowsByType.get(type) ?? [];
            if (typeRows.length === 0) return null;
            return (
              <Box key={type} mb={3}>
                <Typography
                  variant="subtitle1"
                  fontWeight={700}
                  sx={{
                    mb: 0.75,
                    pb: 0.5,
                    borderBottom: 2,
                    borderColor: 'divider',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: 'text.secondary',
                  }}
                >
                  {TYPE_LABELS[type]}
                </Typography>
                <DataGrid
                  apiRef={typeApiRefs[type]}
                  rows={typeRows}
                  columns={columns}
                  processRowUpdate={handleProcessRowUpdate}
                  isCellEditable={(params) => {
                    const row = params.row as ProdRow;
                    if (params.field === 'yield') return row._productionId != null;
                    if (params.field.startsWith('branch_')) {
                      const suffix = params.field.slice('branch_'.length);
                      return (row[`_inv_${suffix}`] as number | null) != null;
                    }
                    return false;
                  }}
                  onCellKeyDown={makeTabNavHandler(editableFields, typeApiRefs[type])}
                  onProcessRowUpdateError={(err) =>
                    setRowError(err instanceof Error ? err.message : String(err))
                  }
                  getRowClassName={(params) => {
                    const row = params.row as ProdRow;
                    const hasProd =
                      row._productionId != null && pendingProduction.has(row._productionId);
                    const hasInv = branches.some((b) => {
                      const invId = row[`_inv_${b.id}`] as number | null;
                      return invId != null && pendingInventory.has(invId);
                    });
                    return hasProd || hasInv ? 'row--dirty' : '';
                  }}
                  autoHeight
                  disableRowSelectionOnClick
                  hideFooter
                  density="compact"
                  sx={GRID_SX}
                />
              </Box>
            );
          })
        )}

        <Snackbar
          open={!!rowError}
          autoHideDuration={4000}
          onClose={() => setRowError('')}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="error" onClose={() => setRowError('')} sx={{ width: '100%' }}>
            {rowError}
          </Alert>
        </Snackbar>

        <MaterialConsumptionDrawer
          consumptionId={consumptionId}
          onClose={() => setConsumptionId(null)}
        />
      </AppLayout>
    </AuthGuard>
  );
}