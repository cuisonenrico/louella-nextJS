'use client';

import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams, useGridApiRef } from '@mui/x-data-grid';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import PostAddIcon from '@mui/icons-material/PostAdd';
import SaveIcon from '@mui/icons-material/Save';
import TodayIcon from '@mui/icons-material/Today';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productionApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product, Production, ProductType } from '@/types';

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

// Row type: named fields + dynamic branch_X and _inv_X fields via index signature
type ProdRow = {
  id: number;
  productId: number;
  branchId?: 1;
  type: ProductType;
  _productionId: number | null;
  yield: number;
  [key: string]: unknown;
};

export default function ProductionPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [rowError, setRowError] = useState('');
  const [pendingProduction, setPendingProduction] = useState<Map<number, { yield: number }>>(
    new Map(),
  );
  const [pendingInventory, setPendingInventory] = useState<Map<number, { delivery: number }>>(
    new Map(),
  );

  useEffect(() => {
    setPendingProduction(new Map());
    setPendingInventory(new Map());
  }, [filterDate]);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const prodQuery = useQuery({
    queryKey: ['production', filterDate],
    queryFn: () =>
      productionApi.byDateRange(filterDate).then((r) => r.data as Production[]),
  });

  const invQuery = useQuery({
    queryKey: ['inventory-for-production', filterDate],
    queryFn: () =>
      inventoryApi.byDateRange(filterDate).then((r) => r.data as Inventory[]),
  });

  // Branch IDs that have zero inventory records for the current date
  const branchesWithNoInventory = useMemo(() => {
    const branchIdsWithRecords = new Set((invQuery.data ?? []).map((inv) => inv.branchId));
    return new Set(branches.filter((b) => !branchIdsWithRecords.has(b.id)).map((b) => b.id));
  }, [invQuery.data, branches]);

  const initBranchMutation = useMutation({
    mutationFn: async (branchId: number) => {
      const yesterday = dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD');
      const prevRes = await inventoryApi.byBranchDate(branchId, yesterday);
      const prevData = (prevRes.data ?? []) as Inventory[];
      const prevMap = new Map(
        prevData.map((i) => [i.productId, Math.max(0, i.leftover - i.reject)]),
      );
      const payload = products
        .filter((p) => p.isActive)
        .map((p) => ({
          branchId,
          productId: p.id,
          date: filterDate,
          quantity: prevMap.get(p.id) ?? 0,
          delivery: 0,
          leftover: 0,
          reject: 0,
        }));
      return inventoryApi.createBulk(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setRowError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to initialize inventory.'));
    },
  });

  const initAllBranchesMutation = useMutation({
    mutationFn: async () => {
      const yesterday = dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD');
      const missingBranches = branches.filter((b) => branchesWithNoInventory.has(b.id));
      await Promise.all(
        missingBranches.map(async (b) => {
          const prevRes = await inventoryApi.byBranchDate(b.id, yesterday);
          const prevData = (prevRes.data ?? []) as Inventory[];
          const prevMap = new Map(
            prevData.map((i) => [i.productId, Math.max(0, i.leftover - i.reject)]),
          );
          const payload = products
            .filter((p) => p.isActive)
            .map((p) => ({
              branchId: b.id,
              productId: p.id,
              date: filterDate,
              quantity: prevMap.get(p.id) ?? 0,
              delivery: 0,
              leftover: 0,
              reject: 0,
            }));
          return inventoryApi.createBulk(payload);
        }),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setRowError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to initialize inventory.'));
    },
  });

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

  const savePendingMutation = useMutation({
    mutationFn: async (data: {
      production: Map<number, { yield: number }>;
      inventory: Map<number, { delivery: number }>;
    }) => {
      await Promise.all([
        ...Array.from(data.production.entries()).map(([id, d]) => productionApi.update(id, d)),
        ...Array.from(data.inventory.entries()).map(([id, d]) => inventoryApi.update(id, d)),
      ]);
    },
    onSuccess: () => {
      setPendingProduction(new Map());
      setPendingInventory(new Map());
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setRowError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save changes.'));
    },
  });

  const handleProcessRowUpdate = useCallback(
    (newRow: ProdRow, oldRow: ProdRow): ProdRow => {
      // Guard: total assigned across all branches must not exceed yield
      const newYield = Number(newRow.yield);
      const totalAssigned = branches.reduce((sum, b) => {
        const val = Number(newRow[`branch_${b.id}`] ?? 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      if (totalAssigned > newYield) {
        throw new Error(
          `Total assigned (${totalAssigned}) exceeds yield (${newYield}) for this product.`,
        );
      }

      // Yield change -> queue production update
      if (newRow.yield !== oldRow.yield) {
        const prodId = newRow._productionId;
        if (prodId != null) {
          setPendingProduction((prev) => {
            const next = new Map(prev);
            next.set(prodId, { yield: Number(newRow.yield) });
            return next;
          });
        }
      }
      // Branch delivery changes -> queue inventory updates
      for (const b of branches) {
        const field = `branch_${b.id}`;
        if (newRow[field] !== oldRow[field]) {
          const invId = newRow[`_inv_${b.id}`] as number | null;
          if (invId != null) {
            setPendingInventory((prev) => {
              const next = new Map(prev);
              next.set(invId, { delivery: Number(newRow[field]) });
              return next;
            });
          }
        }
      }
      return newRow;
    },
    [branches],
  );

  const discardPending = () => {
    setPendingProduction(new Map());
    setPendingInventory(new Map());
    qc.invalidateQueries({ queryKey: ['production'] });
    qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
  };

  const initProductionMutation = useMutation({
    mutationFn: () => {
      const existingProductIds = new Set((prodQuery.data ?? []).map((p) => p.productId));
      const payload = products
        .filter((p) => p.isActive && !existingProductIds.has(p.id))
        .map((p) => ({ branchId: 1, productId: p.id, date: filterDate, yield: 0 }));
      return productionApi.createBulk(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setRowError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to create production records.'));
    },
  });

  const today = dayjs().format('YYYY-MM-DD');
  const totalPending = pendingProduction.size + pendingInventory.size;
  const isLoading = prodQuery.isLoading || invQuery.isLoading;
  const missingProductionCount = products.filter(
    (p) => p.isActive && !(prodQuery.data ?? []).some((pr) => pr.productId === p.id),
  ).length;

  const columns = useMemo<GridColDef[]>(
    () => [
      {
        field: 'productId',
        headerName: 'Product',
        width: 130,
        valueGetter: (value: number) =>
          products.find((p) => p.id === value)?.name ?? `Product #${value}`,
      },
      {
        field: 'yield',
        headerName: 'Yield',
        type: 'number',
        width: 90,
        editable: true,
        headerAlign: 'center',
        align: 'center',
        renderCell: (params: GridRenderCellParams) => {
          const row = params.row as ProdRow;
          const hasRecord = row._productionId != null;
          return (
            <Typography
              variant="body2"
              fontWeight={hasRecord ? 700 : 400}
              color={hasRecord ? 'primary' : 'text.disabled'}
            >
              {(params.value as number) ?? 0}
            </Typography>
          );
        },
      },
      ...branches.map(
        (b) =>
          ({
            field: `branch_${b.id}`,
            headerName: b.name,
            type: 'number',
            width: 110,
            editable: true,
            headerAlign: 'center',
            align: 'center',
            renderHeader: () => {
              const isMissing = branchesWithNoInventory.has(b.id);
              const isLoading =
                initBranchMutation.isPending && initBranchMutation.variables === b.id;
              return (
                <Box display="flex" alignItems="center" gap={0.25} sx={{ fontWeight: 700, overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </span>
                  {isMissing && (
                    <Tooltip title={`Initialize ${b.name} inventory for this day`}>
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            initBranchMutation.mutate(b.id);
                          }}
                          disabled={isLoading}
                          sx={{ p: 0.25 }}
                        >
                          {isLoading ? (
                            <CircularProgress size={14} />
                          ) : (
                            <LibraryAddIcon fontSize="small" />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Box>
              );
            },
            renderCell: (params: GridRenderCellParams) => {
              const row = params.row as ProdRow;
              const hasRecord = (row[`_inv_${b.id}`] as number | null) != null;
              return (
                <Typography
                  variant="body2"
                  fontWeight={hasRecord ? 600 : 400}
                  color={hasRecord ? 'text.primary' : 'text.disabled'}
                >
                  {hasRecord ? ((params.value as number) ?? 0) : '—'}
                </Typography>
              );
            },
          }) satisfies GridColDef,
      ),
      {
        field: 'unassigned',
        headerName: 'Unassigned',
        type: 'number',
        width: 100,
        editable: false,
        headerAlign: 'center',
        align: 'center',
        renderCell: (params: GridRenderCellParams) => {
          const row = params.row as ProdRow;
          const totalAssigned = branches.reduce(
            (sum, b) => sum + Number(row[`branch_${b.id}`] ?? 0),
            0,
          );
          const unassigned = Math.max(0, Number(row.yield) - totalAssigned);
          return (
            <Typography
              variant="body2"
              fontWeight={600}
              color={unassigned > 0 ? 'warning.main' : 'success.main'}
            >
              {unassigned}
            </Typography>
          );
        },
      } satisfies GridColDef,
      {
        field: 'expectedSales',
        headerName: 'Exp. Sales',
        type: 'number',
        width: 110,
        editable: false,
        headerAlign: 'right',
        align: 'right',
        renderCell: (params: GridRenderCellParams) => {
          const row = params.row as ProdRow;
          const totalAssigned = branches.reduce(
            (sum, b) => sum + Number(row[`branch_${b.id}`] ?? 0),
            0,
          );
          const price = products.find((p) => p.id === row.productId)?.price ?? 0;
          const sales = totalAssigned * price;
          return (
            <Typography variant="body2" fontWeight={600} color="text.primary">
              ₱{sales.toLocaleString()}
            </Typography>
          );
        },
      } satisfies GridColDef,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, products, branchesWithNoInventory, initBranchMutation.isPending, initBranchMutation.variables],
  );

  const summary = useMemo(() => {
    const prodRows = allRows.filter((r) => r._productionId != null);
    if (prodRows.length === 0) return null;
    let totalYield = 0;
    let expectedRevenue = 0;
    const yieldByType: Record<ProductType, number> = { BREAD: 0, CAKE: 0, SPECIAL: 0, MISCELLANEOUS: 0 };
    const assignedByBranch = new Map<number, number>(branches.map((b) => [b.id, 0]));
    for (const row of prodRows) {
      totalYield += row.yield;
      yieldByType[row.type] += row.yield;
      let rowAssigned = 0;
      for (const b of branches) {
        const assigned = (row[`branch_${b.id}`] as number) ?? 0;
        assignedByBranch.set(b.id, (assignedByBranch.get(b.id) ?? 0) + assigned);
        rowAssigned += assigned;
      }
      const price = products.find((p) => p.id === row.productId)?.price ?? 0;
      expectedRevenue += rowAssigned * price;
    }
    const totalAssigned = Array.from(assignedByBranch.values()).reduce((a, v) => a + v, 0);
    const totalUnassigned = Math.max(0, totalYield - totalAssigned);
    return { totalYield, yieldByType, assignedByBranch, totalAssigned, totalUnassigned, expectedRevenue };
  }, [allRows, branches, products]);

  const apiRefBread = useGridApiRef();
  const apiRefCake = useGridApiRef();
  const apiRefSpecial = useGridApiRef();
  const apiRefMiscellaneous = useGridApiRef();
  const typeApiRefs = { BREAD: apiRefBread, CAKE: apiRefCake, SPECIAL: apiRefSpecial, MISCELLANEOUS: apiRefMiscellaneous };

  return (
    <AuthGuard>
      <AppLayout title="Production">
        {/* Single date navigation */}
        <Box display="flex" alignItems="center" gap={1} mb={3} flexWrap="wrap">
          <Tooltip title="Previous day">
            <IconButton
              onClick={() =>
                setFilterDate(dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD'))
              }
              size="small"
            >
              <ChevronLeftIcon />
            </IconButton>
          </Tooltip>
          <TextField
            size="small"
            type="date"
            label="Date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <Tooltip title="Next day">
            <IconButton
              onClick={() =>
                setFilterDate(dayjs(filterDate).add(1, 'day').format('YYYY-MM-DD'))
              }
              size="small"
            >
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
          {filterDate !== today && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<TodayIcon />}
              onClick={() => setFilterDate(today)}
            >
              Today
            </Button>
          )}
          {!prodQuery.isLoading && missingProductionCount > 0 && (
            <Tooltip title={`Create production records for ${missingProductionCount} product${missingProductionCount !== 1 ? 's' : ''} with no entry on this date`}>
              <span>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={
                    initProductionMutation.isPending ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <PostAddIcon />
                    )
                  }
                  onClick={() => initProductionMutation.mutate()}
                  disabled={initProductionMutation.isPending}
                >
                  Init Production ({missingProductionCount})
                </Button>
              </span>
            </Tooltip>
          )}
          {!invQuery.isLoading && branchesWithNoInventory.size > 0 && (
            <Tooltip title={`Initialize inventory for ${branchesWithNoInventory.size} branch${branchesWithNoInventory.size !== 1 ? 'es' : ''} with no records on this date`}>
              <span>
                <Button
                  size="small"
                  variant="contained"
                  color="secondary"
                  startIcon={
                    initAllBranchesMutation.isPending ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <LibraryAddIcon />
                    )
                  }
                  onClick={() => initAllBranchesMutation.mutate()}
                  disabled={initAllBranchesMutation.isPending}
                >
                  Init Inventory ({branchesWithNoInventory.size})
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>

        {/* Pending save bar */}
        {totalPending > 0 && (
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
              {totalPending} unsaved change{totalPending !== 1 ? 's' : ''}
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
              onClick={() =>
                savePendingMutation.mutate({
                  production: pendingProduction,
                  inventory: pendingInventory,
                })
              }
              disabled={savePendingMutation.isPending}
            >
              Save Changes
            </Button>
          </Box>
        )}

        {/* Summary accordion */}
        {summary && (
          <Accordion
            disableGutters
            defaultExpanded
            sx={{
              mb: 3,
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              '&:before': { display: 'none' },
              boxShadow: 'none',
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2, minHeight: 48 }}>
              <Typography fontWeight={700}>Day Summary</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
              <Box
                display="grid"
                gridTemplateColumns="repeat(auto-fill, minmax(150px, 1fr))"
                gap={2}
                mb={2}
              >
                {(
                  [
                    {
                      label: 'Total Yield',
                      value: summary.totalYield.toLocaleString(),
                      color: 'primary.main',
                      big: true,
                    },
                    {
                      label: 'Bread',
                      value: summary.yieldByType.BREAD.toLocaleString(),
                      color: 'text.primary',
                    },
                    {
                      label: 'Cake',
                      value: summary.yieldByType.CAKE.toLocaleString(),
                      color: 'text.primary',
                    },
                    {
                      label: 'Special',
                      value: summary.yieldByType.SPECIAL.toLocaleString(),
                      color: 'text.primary',
                    },
                    {
                      label: 'Misc',
                      value: summary.yieldByType.MISCELLANEOUS.toLocaleString(),
                      color: 'text.primary',
                    },
                    {
                      label: 'Total Assigned',
                      value: summary.totalAssigned.toLocaleString(),
                      color:
                        summary.totalAssigned === summary.totalYield
                          ? 'success.main'
                          : 'warning.main',
                    },
                    {
                      label: 'Unassigned',
                      value: summary.totalUnassigned.toLocaleString(),
                      color: summary.totalUnassigned > 0 ? 'warning.main' : 'success.main',
                    },
                    {
                      label: 'Expected Revenue',
                      value: `₱${summary.expectedRevenue.toLocaleString()}`,
                      color: 'success.dark',
                      big: true,
                    },
                  ] as { label: string; value: string; color: string; big?: boolean }[]
                ).map(({ label, value, color, big }) => (
                  <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      fontWeight={600}
                      sx={{ letterSpacing: 0.5 }}
                    >
                      {label.toUpperCase()}
                    </Typography>
                    <Typography
                      variant={big ? 'h5' : 'h6'}
                      fontWeight={700}
                      color={color}
                      mt={0.25}
                    >
                      {value}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              {/* Per-branch assignment totals */}
              {branches.length > 0 && (
                <Box display="flex" gap={1} flexWrap="wrap">
                  {branches.map((b) => (
                    <Paper key={b.id} variant="outlined" sx={{ px: 2, py: 1, borderRadius: 2 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={600}
                        sx={{ letterSpacing: 0.5 }}
                      >
                        {b.name.toUpperCase()}
                      </Typography>
                      <Typography variant="body1" fontWeight={700} color="primary.main">
                        {(summary.assignedByBranch.get(b.id) ?? 0).toLocaleString()}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        )}

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
                  onCellKeyDown={(params, event) => {
                    if (event.key !== 'Tab' || params.cellMode !== 'edit') return;
                    const fieldIdx = editableFields.indexOf(params.field);
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
                      targetFieldIdx = editableFields.length - 1;
                    } else if (targetFieldIdx >= editableFields.length) {
                      if (rowIdx >= sortedIds.length - 1) return;
                      targetId = sortedIds[rowIdx + 1];
                      targetFieldIdx = 0;
                    }
                    const nextField = editableFields[targetFieldIdx];
                    apiRef.current.stopCellEditMode({ id: params.id, field: params.field });
                    setTimeout(() => {
                      apiRef.current!.startCellEditMode({ id: targetId, field: nextField });
                    }, 0);
                  }}
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
      </AppLayout>
    </AuthGuard>
  );
}