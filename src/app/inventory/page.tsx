'use client';

import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Snackbar,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams, useGridApiRef } from '@mui/x-data-grid';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import SaveIcon from '@mui/icons-material/Save';
import TodayIcon from '@mui/icons-material/Today';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product, ProductType } from '@/types';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL'];
const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
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
  const [filterDateFrom, setFilterDateFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterDateTo, setFilterDateTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [rowError, setRowError] = useState('');
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, Partial<Inventory>>>(
    new Map(),
  );

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

      // Specific branch: loop per date (no branch range endpoint)
      const dates: string[] = [];
      let cur = dayjs(filterDateFrom);
      const end = dayjs(clampedEnd);
      while (!cur.isAfter(end)) {
        dates.push(cur.format('YYYY-MM-DD'));
        cur = cur.add(1, 'day');
      }
      const results = await Promise.all(
        dates.map((date) =>
          inventoryApi
            .byBranchDate(parseInt(filterBranch), date)
            .then((r) => r.data as Inventory[]),
        ),
      );
      return results.flat();
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

  const today = dayjs().format('YYYY-MM-DD');
  const stepDate = (delta: number) => {
    const rangeLen = dayjs(filterDateTo).diff(dayjs(filterDateFrom), 'day') + 1;
    setFilterDateFrom(dayjs(filterDateFrom).add(delta * rangeLen, 'day').format('YYYY-MM-DD'));
    setFilterDateTo(dayjs(filterDateTo).add(delta * rangeLen, 'day').format('YYYY-MM-DD'));
  };

  const getBranchName = (id: number) =>
    branches.find((b) => b.id === id)?.name ?? `Branch #${id}`;
  const getProductName = (id: number) =>
    products.find((p) => p.id === id)?.name ?? `Product #${id}`;

  const apiRefBread = useGridApiRef();
  const apiRefCake = useGridApiRef();
  const apiRefSpecial = useGridApiRef();
  const typeApiRefs = {
    BREAD: apiRefBread,
    CAKE: apiRefCake,
    SPECIAL: apiRefSpecial,
  };

  const columns = useMemo<GridColDef[]>(
    () => [
      ...(filterBranch === ''
        ? [
            {
              field: 'branchId',
              headerName: 'Branch',
              width: 140,
              valueGetter: (value: number) => getBranchName(value),
            } satisfies GridColDef,
          ]
        : []),
      {
        field: 'productId',
        headerName: 'Product',
        flex: 1.5,
        minWidth: 80,
        valueGetter: (value: number) => getProductName(value),
      },
      ...(!isRange
        ? [
            {
              field: 'quantity',
              headerName: 'Prev. Leftover',
              type: 'number',
              width: 115,
              editable: false,
              headerAlign: 'center',
              align: 'center',
            } satisfies GridColDef,
          ]
        : []),
      {
        field: 'delivery',
        headerName: 'Delivery',
        type: 'number',
        width: 95,
        editable: true,
        headerAlign: 'center',
        align: 'center',
      },
      ...(!isRange
        ? [
            {
              field: 'totalStock',
              headerName: 'Total Stock',
              type: 'number',
              width: 100,
              editable: false,
              headerAlign: 'center',
              align: 'center',
              valueGetter: (_value: unknown, row: Inventory) => row.quantity + row.delivery,
              renderCell: (params: GridRenderCellParams) => (
                <Typography variant="body2" fontWeight={600} color="primary">
                  {(params.value as number) ?? 0}
                </Typography>
              ),
            } satisfies GridColDef,
          ]
        : []),
      {
        field: 'leftover',
        headerName: 'Leftover',
        type: 'number',
        width: 95,
        editable: true,
        headerAlign: 'center',
        align: 'center',
      },
      {
        field: 'reject',
        headerName: 'Reject',
        type: 'number',
        width: 80,
        editable: true,
        headerAlign: 'center',
        align: 'center',
      },
      {
        field: 'sold',
        headerName: 'Sold',
        type: 'number',
        width: 80,
        headerAlign: 'center',
        align: 'center',
        valueGetter: (_value: unknown, row: Inventory) =>
          row.delivery - row.leftover - row.reject,
        renderCell: (params: GridRenderCellParams) => {
          const sold = (params.value as number) ?? 0;
          return (
            <Chip
              label={sold}
              size="small"
              color={sold > 0 ? 'success' : 'default'}
              sx={{ fontWeight: 600, minWidth: 40 }}
            />
          );
        },
      },
      {
        field: 'revenue',
        headerName: 'Revenue',
        type: 'number',
        width: 110,
        editable: false,
        headerAlign: 'right',
        align: 'right',
        valueGetter: (_value: unknown, row: Inventory) => {
          const sold = row.delivery - row.leftover - row.reject;
          const price = products.find((p) => p.id === row.productId)?.price ?? 0;
          return sold * price;
        },
        renderCell: (params: GridRenderCellParams) => {
          const revenue = (params.value as number) ?? 0;
          return (
            <Typography variant="body2" fontWeight={600} color={revenue > 0 ? 'success.main' : 'text.secondary'}>
              ₱{revenue.toLocaleString()}
            </Typography>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterBranch, isRange, branches, products],
  );

  const rows = invQuery.data ?? [];

  // In range mode, aggregate rows by (branchId, productId), summing delivery/leftover/reject.
  const displayRows = useMemo(() => {
    if (!isRange) return rows;
    const agg = new Map<string, Inventory>();
    for (const inv of rows) {
      const key = `${inv.branchId}:${inv.productId}`;
      const existing = agg.get(key);
      if (existing) {
        existing.delivery += inv.delivery;
        existing.leftover += inv.leftover;
        existing.reject += inv.reject;
      } else {
        // Synthetic id: won't collide with real DB ids (which are positive)
        agg.set(key, { ...inv, id: -(inv.branchId * 100000 + inv.productId) });
      }
    }
    return Array.from(agg.values());
  }, [rows, isRange]);

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

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const productPriceMap = new Map(products.map((p) => [p.id, p.price]));
    const productTypeMap = new Map(products.map((p) => [p.id, p.type]));

    let totalRevenue = 0;
    let totalSold = 0;
    let totalDelivery = 0;
    let totalLeftover = 0;
    let totalReject = 0;
    const revenueByType: Record<ProductType, number> = { BREAD: 0, CAKE: 0, SPECIAL: 0 };
    const revenueByProduct = new Map<number, { name: string; revenue: number; sold: number }>();

    for (const inv of rows) {
      const sold = inv.delivery - inv.leftover - inv.reject;
      const price = productPriceMap.get(inv.productId) ?? 0;
      const revenue = sold * price;
      const type = productTypeMap.get(inv.productId);
      totalRevenue += revenue;
      totalSold += sold;
      totalDelivery += inv.delivery;
      totalLeftover += inv.leftover;
      totalReject += inv.reject;
      if (type) revenueByType[type] += revenue;
      const prev = revenueByProduct.get(inv.productId);
      revenueByProduct.set(inv.productId, {
        name: products.find((p) => p.id === inv.productId)?.name ?? `#${inv.productId}`,
        revenue: (prev?.revenue ?? 0) + revenue,
        sold: (prev?.sold ?? 0) + sold,
      });
    }

    const sorted = Array.from(revenueByProduct.values()).sort((a, b) => b.revenue - a.revenue);
    const topProduct = sorted[0] ?? null;
    const zeroSales = sorted.filter((r) => r.sold <= 0);

    return { totalRevenue, totalSold, totalDelivery, totalLeftover, totalReject, revenueByType, topProduct, zeroSales };
  }, [rows, products]);

  return (
    <AuthGuard>
      <AppLayout title="Inventory">
        {/* Date range navigation */}
        <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
          <Tooltip title="Previous period">
            <IconButton onClick={() => stepDate(-1)} size="small">
              <ChevronLeftIcon />
            </IconButton>
          </Tooltip>
          <TextField
            size="small"
            type="date"
            label="From"
            value={filterDateFrom}
            onChange={(e) => {
              setFilterDateFrom(e.target.value);
              if (e.target.value > filterDateTo) setFilterDateTo(e.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <Typography variant="body2" color="text.secondary">—</Typography>
          <TextField
            size="small"
            type="date"
            label="To"
            value={filterDateTo}
            onChange={(e) => {
              setFilterDateTo(e.target.value);
              if (e.target.value < filterDateFrom) setFilterDateFrom(e.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <Tooltip title="Next period">
            <IconButton onClick={() => stepDate(1)} size="small">
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
          {(filterDateFrom !== today || filterDateTo !== today) && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<TodayIcon />}
              onClick={() => { setFilterDateFrom(today); setFilterDateTo(today); }}
            >
              Today
            </Button>
          )}
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setFilterDateFrom(dayjs().subtract(6, 'day').format('YYYY-MM-DD'));
              setFilterDateTo(today);
            }}
          >
            Last 7d
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setFilterDateFrom(dayjs().startOf('month').format('YYYY-MM-DD'));
              setFilterDateTo(today);
            }}
          >
            This Month
          </Button>
          <Box flexGrow={1} />
          {!isRange && uninitializedCount > 0 && (
            <Tooltip
              title={`${uninitializedCount} active product${uninitializedCount !== 1 ? 's' : ''} missing entries for this day. Click to create them, seeded from yesterday's leftover.`}
            >
              <span>
                <Button
                  variant="contained"
                  startIcon={
                    bulkCreateMutation.isPending ? (
                      <CircularProgress size={16} />
                    ) : (
                      <LibraryAddIcon />
                    )
                  }
                  onClick={() => bulkCreateMutation.mutate()}
                  disabled={bulkCreateMutation.isPending}
                >
                  Sync {uninitializedCount} Product{uninitializedCount !== 1 ? 's' : ''}
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>

        {/* Branch selector */}
        <Box mb={2}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mb: 0.5, display: 'block', fontWeight: 600, letterSpacing: 1 }}
          >
            BRANCH
          </Typography>
          <ToggleButtonGroup
            value={filterBranch}
            exclusive
            onChange={(_, val) => setFilterBranch(val ?? '')}
            size="small"
            sx={{ flexWrap: 'wrap', gap: 0.5 }}
          >
            <ToggleButton value="" sx={{ px: 2 }}>
              All
            </ToggleButton>
            {branches.map((b) => (
              <ToggleButton key={b.id} value={b.id.toString()} sx={{ px: 2 }}>
                {b.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

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

        {/* Summary panel */}
        {summary && (
          <Accordion
            disableGutters
            defaultExpanded
            sx={{ mb: 3, border: 1, borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' }, boxShadow: 'none' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2, minHeight: 48 }}>
              <Typography fontWeight={700}>
                {isRange
                  ? `Period Summary (${dayjs(filterDateTo).diff(dayjs(filterDateFrom), 'day') + 1} days)`
                  : 'Day Summary'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
              {/* Revenue cards */}
              <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(170px, 1fr))" gap={2} mb={3}>
                {([
                  { label: 'Total Revenue', value: `₱${summary.totalRevenue.toLocaleString()}`, color: 'success.main', big: true },
                  { label: 'Bread Revenue', value: `₱${summary.revenueByType.BREAD.toLocaleString()}`, color: 'text.primary' },
                  { label: 'Cake Revenue', value: `₱${summary.revenueByType.CAKE.toLocaleString()}`, color: 'text.primary' },
                  { label: 'Special Revenue', value: `₱${summary.revenueByType.SPECIAL.toLocaleString()}`, color: 'text.primary' },
                ] as { label: string; value: string; color: string; big?: boolean }[]).map(({ label, value, color, big }) => (
                  <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5 }}>
                      {label.toUpperCase()}
                    </Typography>
                    <Typography variant={big ? 'h5' : 'h6'} fontWeight={700} color={color} mt={0.25}>
                      {value}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              {/* Unit stats */}
              <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={2} mb={3}>
                {([
                  { label: 'Units Sold', value: summary.totalSold, color: 'success.main' },
                  { label: 'Delivered', value: summary.totalDelivery, color: 'text.primary' },
                  { label: 'Leftover', value: summary.totalLeftover, color: 'warning.main' },
                  { label: 'Rejected', value: summary.totalReject, color: 'error.main' },
                ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
                  <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5 }}>
                      {label.toUpperCase()}
                    </Typography>
                    <Typography variant="h6" fontWeight={700} color={color} mt={0.25}>
                      {value.toLocaleString()}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              {/* Insights row */}
              <Box display="flex" gap={2} flexWrap="wrap">
                {summary.topProduct && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flexGrow: 1, minWidth: 200 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5 }}>
                      TOP PRODUCT
                    </Typography>
                    <Typography variant="body1" fontWeight={700} mt={0.25}>
                      {summary.topProduct.name}
                    </Typography>
                    <Typography variant="body2" color="success.main">
                      ₱{summary.topProduct.revenue.toLocaleString()} &mdash; {summary.topProduct.sold} sold
                    </Typography>
                  </Paper>
                )}
                {summary.zeroSales.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flexGrow: 1, minWidth: 200, borderColor: 'warning.main' }}>
                    <Typography variant="caption" color="warning.dark" fontWeight={600} sx={{ letterSpacing: 0.5 }}>
                      NO SALES ({summary.zeroSales.length})
                    </Typography>
                    <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
                      {summary.zeroSales.map((r) => (
                        <Chip key={r.name} label={r.name} size="small" color="warning" variant="outlined" />
                      ))}
                    </Box>
                  </Paper>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

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
                  processRowUpdate={isRange ? undefined : handleProcessRowUpdate}
                  isCellEditable={() => !isRange}
                  onCellKeyDown={(params, event) => {
                    if (event.key !== 'Tab' || isRange || params.cellMode !== 'edit') return;
                    const fieldIdx = EDITABLE_FIELDS.indexOf(params.field);
                    if (fieldIdx === -1) return;
                    event.preventDefault();
                    event.defaultMuiPrevented = true;
                    const apiRef = typeApiRefs[type];
                    if (!apiRef.current) return;
                    const sortedIds = apiRef.current.getSortedRowIds();
                    const rowIdx = sortedIds.findIndex((id) => id === params.id);
                    let targetId = params.id;
                    let targetFieldIdx = event.shiftKey ? fieldIdx - 1 : fieldIdx + 1;
                    if (targetFieldIdx < 0) {
                      if (rowIdx <= 0) return;
                      targetId = sortedIds[rowIdx - 1];
                      targetFieldIdx = EDITABLE_FIELDS.length - 1;
                    } else if (targetFieldIdx >= EDITABLE_FIELDS.length) {
                      if (rowIdx >= sortedIds.length - 1) return;
                      targetId = sortedIds[rowIdx + 1];
                      targetFieldIdx = 0;
                    }
                    const nextField = EDITABLE_FIELDS[targetFieldIdx];
                    apiRef.current.stopCellEditMode({ id: params.id, field: params.field });
                    setTimeout(() => {
                      apiRef.current!.startCellEditMode({ id: targetId, field: nextField });
                    }, 0);
                  }}
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
