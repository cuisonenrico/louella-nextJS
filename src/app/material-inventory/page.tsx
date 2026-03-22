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
import SaveIcon from '@mui/icons-material/Save';
import TodayIcon from '@mui/icons-material/Today';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, materialInventoryApi, materialsApi } from '@/lib/apiServices';
import type { Branch, Material, MaterialInventory } from '@/types';

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

export default function MaterialInventoryPage() {
  const qc = useQueryClient();
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterDateTo, setFilterDateTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [rowError, setRowError] = useState('');
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, Partial<MaterialInventory>>>(
    new Map(),
  );

  useEffect(() => {
    setPendingUpdates(new Map());
  }, [filterBranch, filterDateFrom, filterDateTo]);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then((r) => r.data),
  });

  const MAX_RANGE_DAYS = 31;
  const isRange = filterDateFrom !== filterDateTo;

  const invQuery = useQuery({
    queryKey: ['material-inventory', filterBranch, filterDateFrom, filterDateTo],
    enabled: filterBranch !== '' || branches.length > 0,
    queryFn: async () => {
      const dates: string[] = [];
      let cur = dayjs(filterDateFrom);
      const end = dayjs(filterDateTo).isAfter(dayjs(filterDateFrom).add(MAX_RANGE_DAYS - 1, 'day'))
        ? dayjs(filterDateFrom).add(MAX_RANGE_DAYS - 1, 'day')
        : dayjs(filterDateTo);
      while (!cur.isAfter(end)) {
        dates.push(cur.format('YYYY-MM-DD'));
        cur = cur.add(1, 'day');
      }
      if (filterBranch) {
        const results = await Promise.all(
          dates.map((date) =>
            materialInventoryApi
              .byBranchDate(parseInt(filterBranch), date)
              .then((r) => r.data as MaterialInventory[]),
          ),
        );
        return results.flat();
      }
      // No byDate endpoint for material-inventory — fetch per branch per date
      const results = await Promise.all(
        dates.flatMap((date) =>
          branches.map((b) =>
            materialInventoryApi
              .byBranchDate(b.id, date)
              .then((r) => r.data as MaterialInventory[]),
          ),
        ),
      );
      return results.flat();
    },
  });

  const savePendingMutation = useMutation({
    mutationFn: async (updates: Map<number, Partial<MaterialInventory>>) => {
      await Promise.all(
        Array.from(updates.entries()).map(([id, data]) => materialInventoryApi.update(id, data)),
      );
    },
    onSuccess: () => {
      setPendingUpdates(new Map());
      qc.invalidateQueries({ queryKey: ['material-inventory'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setRowError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save changes.'));
    },
  });

  const handleProcessRowUpdate = useCallback(
    (newRow: MaterialInventory, oldRow: MaterialInventory) => {
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
    },
    [],
  );

  const discardPending = () => {
    setPendingUpdates(new Map());
    qc.invalidateQueries({ queryKey: ['material-inventory'] });
  };

  const today = dayjs().format('YYYY-MM-DD');
  const stepDate = (delta: number) => {
    const rangeLen = dayjs(filterDateTo).diff(dayjs(filterDateFrom), 'day') + 1;
    setFilterDateFrom(dayjs(filterDateFrom).add(delta * rangeLen, 'day').format('YYYY-MM-DD'));
    setFilterDateTo(dayjs(filterDateTo).add(delta * rangeLen, 'day').format('YYYY-MM-DD'));
  };

  const getBranchName = (id: number) =>
    branches.find((b) => b.id === id)?.name ?? `Branch #${id}`;
  const getMaterialName = (id: number) =>
    materials.find((m) => m.id === id)?.name ?? `Material #${id}`;
  const getMaterialUnit = (id: number) =>
    materials.find((m) => m.id === id)?.unit ?? '';

  const apiRef = useGridApiRef();

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
        field: 'materialId',
        headerName: 'Material',
        flex: 1.5,
        minWidth: 100,
        valueGetter: (value: number) => getMaterialName(value),
      },
      {
        field: 'unit',
        headerName: 'Unit',
        width: 70,
        valueGetter: (_value: unknown, row: MaterialInventory) => getMaterialUnit(row.materialId),
      },
      ...(!isRange
        ? [
            {
              field: 'quantity',
              headerName: 'Prev. Stock',
              type: 'number',
              width: 105,
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
              valueGetter: (_value: unknown, row: MaterialInventory) => row.quantity + row.delivery,
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
        field: 'used',
        headerName: 'Used',
        type: 'number',
        width: 80,
        headerAlign: 'center',
        align: 'center',
        valueGetter: (_value: unknown, row: MaterialInventory) =>
          row.delivery - row.leftover - row.reject,
        renderCell: (params: GridRenderCellParams) => {
          const used = (params.value as number) ?? 0;
          return (
            <Chip
              label={used}
              size="small"
              color={used > 0 ? 'success' : 'default'}
              sx={{ fontWeight: 600, minWidth: 40 }}
            />
          );
        },
      },
      {
        field: 'cost',
        headerName: 'Cost',
        type: 'number',
        width: 110,
        editable: false,
        headerAlign: 'right',
        align: 'right',
        valueGetter: (_value: unknown, row: MaterialInventory) => {
          const used = row.delivery - row.leftover - row.reject;
          const price = materials.find((m) => m.id === row.materialId)?.pricePerUnit ?? 0;
          return used * price;
        },
        renderCell: (params: GridRenderCellParams) => {
          const cost = (params.value as number) ?? 0;
          return (
            <Typography
              variant="body2"
              fontWeight={600}
              color={cost > 0 ? 'success.main' : 'text.secondary'}
            >
              ₱{cost.toLocaleString()}
            </Typography>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterBranch, isRange, branches, materials],
  );

  const rows = invQuery.data ?? [];

  // In range mode, aggregate rows by (branchId, materialId), summing delivery/leftover/reject.
  const displayRows = useMemo(() => {
    if (!isRange) return rows;
    const agg = new Map<string, MaterialInventory>();
    for (const inv of rows) {
      const key = `${inv.branchId}:${inv.materialId}`;
      const existing = agg.get(key);
      if (existing) {
        existing.delivery += inv.delivery;
        existing.leftover += inv.leftover;
        existing.reject += inv.reject;
      } else {
        agg.set(key, { ...inv, id: -(inv.branchId * 100000 + inv.materialId) });
      }
    }
    return Array.from(agg.values());
  }, [rows, isRange]);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const materialPriceMap = new Map(materials.map((m) => [m.id, m.pricePerUnit]));

    let totalCost = 0;
    let totalUsed = 0;
    let totalDelivery = 0;
    let totalLeftover = 0;
    let totalReject = 0;
    const costByMaterial = new Map<number, { name: string; cost: number; used: number }>();

    for (const inv of rows) {
      const used = inv.delivery - inv.leftover - inv.reject;
      const price = materialPriceMap.get(inv.materialId) ?? 0;
      const cost = used * price;
      totalCost += cost;
      totalUsed += used;
      totalDelivery += inv.delivery;
      totalLeftover += inv.leftover;
      totalReject += inv.reject;
      const prev = costByMaterial.get(inv.materialId);
      costByMaterial.set(inv.materialId, {
        name: materials.find((m) => m.id === inv.materialId)?.name ?? `#${inv.materialId}`,
        cost: (prev?.cost ?? 0) + cost,
        used: (prev?.used ?? 0) + used,
      });
    }

    const sorted = Array.from(costByMaterial.values()).sort((a, b) => b.cost - a.cost);
    const topMaterial = sorted[0] ?? null;
    const zeroUsage = sorted.filter((r) => r.used <= 0);

    return { totalCost, totalUsed, totalDelivery, totalLeftover, totalReject, topMaterial, zeroUsage };
  }, [rows, materials]);

  return (
    <AuthGuard>
      <AppLayout title="Material Inventory">
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
              <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={2} mb={3}>
                {([
                  { label: 'Total Cost', value: `₱${summary.totalCost.toLocaleString()}`, color: 'success.main', big: true },
                  { label: 'Units Used', value: summary.totalUsed.toLocaleString(), color: 'text.primary' },
                  { label: 'Delivered', value: summary.totalDelivery.toLocaleString(), color: 'text.primary' },
                  { label: 'Leftover', value: summary.totalLeftover.toLocaleString(), color: 'warning.main' },
                  { label: 'Rejected', value: summary.totalReject.toLocaleString(), color: 'error.main' },
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

              <Box display="flex" gap={2} flexWrap="wrap">
                {summary.topMaterial && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flexGrow: 1, minWidth: 200 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5 }}>
                      TOP MATERIAL
                    </Typography>
                    <Typography variant="body1" fontWeight={700} mt={0.25}>
                      {summary.topMaterial.name}
                    </Typography>
                    <Typography variant="body2" color="success.main">
                      ₱{summary.topMaterial.cost.toLocaleString()} &mdash; {summary.topMaterial.used} used
                    </Typography>
                  </Paper>
                )}
                {summary.zeroUsage.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flexGrow: 1, minWidth: 200, borderColor: 'warning.main' }}>
                    <Typography variant="caption" color="warning.dark" fontWeight={600} sx={{ letterSpacing: 0.5 }}>
                      NO USAGE ({summary.zeroUsage.length})
                    </Typography>
                    <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
                      {summary.zeroUsage.map((r) => (
                        <Chip key={r.name} label={r.name} size="small" color="warning" variant="outlined" />
                      ))}
                    </Box>
                  </Paper>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Grid */}
        {invQuery.isLoading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={6}>
            No material inventory records for this date.
          </Typography>
        ) : (
          <DataGrid
            apiRef={apiRef}
            rows={displayRows}
            columns={columns}
            processRowUpdate={isRange ? undefined : handleProcessRowUpdate}
            isCellEditable={() => !isRange}
            onCellKeyDown={(params, event) => {
              if (event.key !== 'Tab' || isRange || params.cellMode !== 'edit') return;
              const fieldIdx = EDITABLE_FIELDS.indexOf(params.field);
              if (fieldIdx === -1) return;
              event.preventDefault();
              event.defaultMuiPrevented = true;
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
