'use client';

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Typography,
} from '@mui/material';
import { DataGrid, useGridApiRef } from '@mui/x-data-grid';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product, ProductType } from '@/types';
import InventoryImportDialog from './components/InventoryImportDialog';
import InventoryAdjustmentsDialog from './components/InventoryAdjustmentsDialog';
import InventoryFilterBar from './components/InventoryFilterBar';
import InventorySummaryPanel from './components/InventorySummaryPanel';
import { useInventoryColumns } from './hooks/useInventoryColumns';
import { useInventoryDisplayRows } from './hooks/useInventoryDisplayRows';
import { useInventorySummary } from './hooks/useInventorySummary';
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

const EDITABLE_FIELDS = ['delivery', 'leftover', 'reject'];

export default function InventoryPage() {
  const qc = useQueryClient();
  const [filterBranch, setFilterBranch] = useState('');

  // Draft state drives the date inputs; committed state drives the query.
  // This prevents firing a (potentially large) range query on every keystroke
  // while the user is mid-edit on the From field.
  const today = dayjs().format('YYYY-MM-DD');
  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);

  // Commit both draft dates to query state at once.
  const commitDates = useCallback((from: string, to: string) => {
    setFilterDateFrom(from);
    setFilterDateTo(to);
  }, []);

  const [rowError, setRowError] = useState('');
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, Partial<Inventory>>>(
    new Map(),
  );
  const [importOpen, setImportOpen] = useState(false);
  const [dateMode, setDateMode] = useState<'date' | 'range'>('date');

  // When switching modes, normalise the dates
  const switchDateMode = useCallback((mode: 'date' | 'range') => {
    setDateMode(mode);
    if (mode === 'date') {
      // Collapse range to the From date
      setDraftTo(draftFrom);
      commitDates(draftFrom, draftFrom);
    }
  }, [draftFrom, commitDates]);

  useEffect(() => {
    setPendingUpdates(new Map());
  }, [filterBranch, filterDateFrom, filterDateTo]);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const MAX_RANGE_DAYS = 31;
  const isRange = filterDateFrom !== filterDateTo;

  const invQuery = useQuery({
    queryKey: ['inventory', filterBranch, filterDateFrom, filterDateTo],
    queryFn: async () => {
      const clampedEnd = dayjs(filterDateTo).isAfter(
        dayjs(filterDateFrom).add(MAX_RANGE_DAYS - 1, 'day'),
      )
        ? dayjs(filterDateFrom).add(MAX_RANGE_DAYS - 1, 'day').format('YYYY-MM-DD')
        : filterDateTo;
      if (!filterBranch) {
        // All branches: single range call to new endpoint
        return inventoryApi
          .byDateRange(filterDateFrom, isRange ? clampedEnd : undefined)
          .then((r) => r.data as Inventory[]);
      }

      // Specific branch: use dedicated branch range endpoint.
      return inventoryApi
        .byBranchDateRange(parseInt(filterBranch, 10), filterDateFrom, isRange ? clampedEnd : undefined)
        .then((r) => r.data as Inventory[]);
    },
  });

  const savePendingMutation = useMutation({
    mutationFn: async (updates: Map<number, Partial<Inventory>>) => {
      await Promise.all(
        Array.from(updates.entries()).map(([id, data]) => inventoryApi.update(id, data)),
      );
    },
    onSuccess: () => {
      setPendingUpdates(new Map());
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setRowError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save changes.'));
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const branchId = parseInt(filterBranch);
      const yesterday = dayjs(filterDateFrom).subtract(1, 'day').format('YYYY-MM-DD');
      const prevRes = await inventoryApi.byBranchDate(branchId, yesterday);
      const prevData = (prevRes.data ?? []) as Inventory[];
      const prevMap = new Map(prevData.map((i) => [i.productId, Math.max(0, i.leftover - i.reject)]));
      const existingProductIds = new Set((invQuery.data ?? []).map((r) => r.productId));
      const payload = products
        .filter((p) => p.isActive && !existingProductIds.has(p.id))
        .map((p) => ({
          branchId,
          productId: p.id,
          date: filterDateFrom,
          quantity: prevMap.get(p.id) ?? 0,
          delivery: 0,
          leftover: 0,
          reject: 0,
        }));
      if (payload.length === 0) throw new Error('All products already have entries for this day.');
      return inventoryApi.createBulk(payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setRowError(
        Array.isArray(msg)
          ? msg.join(', ')
          : ((err as Error)?.message ?? 'Failed to initialize day.'),
      );
    },
  });

  const handleProcessRowUpdate = useCallback((newRow: Inventory, oldRow: Inventory) => {
    if (
      newRow.delivery === oldRow.delivery &&
      newRow.leftover === oldRow.leftover &&
      newRow.reject === oldRow.reject
    ) {
      return oldRow;
    }
    setPendingUpdates((prev) => {
      const next = new Map(prev);
      next.set(newRow.id, {
        delivery: Number(newRow.delivery),
        leftover: Number(newRow.leftover),
        reject: Number(newRow.reject),
      });
      return next;
    });
    return newRow;
  }, []);

  const discardPending = () => {
    setPendingUpdates(new Map());
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  // ── Adjustments dialog ───────────────────────────────────────────
  const [adjustmentTarget, setAdjustmentTarget] = useState<Inventory | null>(null);

  const openAdjustments = (row: Inventory) => setAdjustmentTarget(row);

  const stepDate = (delta: number) => {
    const rangeLen = dayjs(filterDateTo).diff(dayjs(filterDateFrom), 'day') + 1;
    const newFrom = dayjs(filterDateFrom).add(delta * rangeLen, 'day').format('YYYY-MM-DD');
    const newTo = dayjs(filterDateTo).add(delta * rangeLen, 'day').format('YYYY-MM-DD');
    setDraftFrom(newFrom); setDraftTo(newTo);
    commitDates(newFrom, newTo);
  };

  const apiRefBread = useGridApiRef();
  const apiRefCake = useGridApiRef();
  const apiRefSpecial = useGridApiRef();
  const apiRefMiscellaneous = useGridApiRef();
  const typeApiRefs = {
    BREAD: apiRefBread,
    CAKE: apiRefCake,
    SPECIAL: apiRefSpecial,
    MISCELLANEOUS: apiRefMiscellaneous,
  };

  const columns = useInventoryColumns({ filterBranch, isRange, productById, openAdjustments });

  const rows = invQuery.data ?? [];
  const displayRows = useInventoryDisplayRows(rows, filterBranch, isRange);

  const rowsByType = useMemo(() => {
    const productTypeMap = new Map(products.map((p) => [p.id, p.type]));
    const map = new Map<ProductType, Inventory[]>(
      PRODUCT_TYPE_ORDER.map((t) => [t, []]),
    );
    for (const inv of displayRows) {
      const type = productTypeMap.get(inv.productId);
      if (type) map.get(type)?.push(inv);
    }
    return map;
  }, [displayRows, products]);

  const uninitializedCount =
    !isRange && filterBranch !== ''
      ? products.filter((p) => p.isActive && !rows.some((r) => r.productId === p.id)).length
      : 0;

  const summary = useInventorySummary(rows, products, productById);

  const adjustmentRow = adjustmentTarget
    ? (invQuery.data ?? []).find((r) => r.id === adjustmentTarget.id) ?? adjustmentTarget
    : null;

  return (
    <AuthGuard>
      <AppLayout title="Inventory">
        <InventoryFilterBar
          dateMode={dateMode}
          draftFrom={draftFrom}
          draftTo={draftTo}
          filterBranch={filterBranch}
          branches={branches}
          today={today}
          uninitializedCount={uninitializedCount}
          isBulkCreatePending={bulkCreateMutation.isPending}
          onDateModeChange={switchDateMode}
          onDraftFromChange={setDraftFrom}
          onDraftToChange={setDraftTo}
          onCommitDates={commitDates}
          onStepDate={stepDate}
          onBranchChange={setFilterBranch}
          onImportOpen={() => setImportOpen(true)}
          onBulkCreate={() => bulkCreateMutation.mutate()}
        />

        {/* Pending changes save bar */}
        {pendingUpdates.size > 0 && (
          <Box
            display="flex"
            alignItems="center"
            gap={2}
            px={2}
            py={1}
            mb={2}
            sx={{
              bgcolor: 'rgba(255, 167, 38, 0.10)',
              border: 1,
              borderColor: 'warning.main',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" color="warning.dark" sx={{ flexGrow: 1 }}>
              {pendingUpdates.size} unsaved change{pendingUpdates.size !== 1 ? 's' : ''}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<CloseIcon />}
              onClick={discardPending}
            >
              Discard
            </Button>
            <Button
              size="small"
              variant="contained"
              color="warning"
              startIcon={
                savePendingMutation.isPending ? (
                  <CircularProgress size={14} />
                ) : (
                  <SaveIcon />
                )
              }
              onClick={() => savePendingMutation.mutate(pendingUpdates)}
              disabled={savePendingMutation.isPending}
            >
              Save Changes
            </Button>
          </Box>
        )}

        <InventorySummaryPanel
          summary={summary}
          filterDateFrom={filterDateFrom}
          filterDateTo={filterDateTo}
        />

        {/* Per-type grids */}
        {invQuery.isLoading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={6}>
            No inventory records for this date.
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
                  processRowUpdate={isRange || filterBranch === '' ? undefined : handleProcessRowUpdate}
                  isCellEditable={() => !isRange && filterBranch !== ''}
                  onCellKeyDown={makeTabNavHandler(EDITABLE_FIELDS, typeApiRefs[type], !isRange)}
                  onProcessRowUpdateError={(err) =>
                    setRowError(err instanceof Error ? err.message : String(err))
                  }
                  getRowClassName={(params) =>
                    pendingUpdates.has(params.id as number) ? 'row--dirty' : ''
                  }
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

        {/* Import Dialog */}
        {importOpen && (
          <InventoryImportDialog
            branches={branches}
            onClose={() => setImportOpen(false)}
            onImported={() => qc.invalidateQueries({ queryKey: ['inventory'] })}
          />
        )}

        {/* Adjustments Dialog */}
        {adjustmentRow && (
          <InventoryAdjustmentsDialog
            inventory={adjustmentRow}
            productName={productById.get(adjustmentRow.productId)?.name ?? `Product #${adjustmentRow.productId}`}
            branches={branches}
            onClose={() => setAdjustmentTarget(null)}
          />
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
      </AppLayout>
    </AuthGuard>
  );
}
