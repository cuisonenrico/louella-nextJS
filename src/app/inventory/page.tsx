'use client';

import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DateRangeIcon from '@mui/icons-material/DateRange';
import EventIcon from '@mui/icons-material/Event';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryAdjustmentsApi, inventoryApi, inventoryImportApi, productsApi } from '@/lib/apiServices';
import type { AdjustmentType, Branch, Inventory, InventoryImportResult, Product, ProductType, SheetImportResult } from '@/types';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

const ADJ_TYPE_LABELS: Record<AdjustmentType, string> = {
  PULL_IN: 'Pull In',
  PULL_OUT: 'Pull Out',
  ANOMALY: 'Anomaly',
};
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

// ── Import Dialog ──────────────────────────────────────────────────────────────
interface ImportDialogProps {
  branches: Branch[];
  onClose: () => void;
  onImported: () => void;
}

function InventoryImportDialog({ branches, onClose, onImported }: ImportDialogProps) {
  const [branchId, setBranchId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: () => inventoryImportApi.importFile(file!, parseInt(branchId)).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      onImported();
    },
  });

  const canSubmit = !!file && !!branchId && !importMutation.isPending && !result;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Inventory from XLSX</DialogTitle>
      <DialogContent>
        {result ? (
          <Box>
            <Alert
              severity={result.summary.totalErrors > 0 ? 'warning' : 'success'}
              sx={{ mb: 2 }}
            >
              Imported {result.summary.totalProcessed} records across {result.summary.totalSheets} sheet
              {result.summary.totalSheets !== 1 ? 's' : ''}.
              {result.summary.totalSkipped > 0 && (
                <> {result.summary.totalSkipped} product{result.summary.totalSkipped !== 1 ? 's' : ''} not matched (see details below).</>
              )}
            </Alert>
            {result.sheets.map((sheet: SheetImportResult) => (
              <Box key={sheet.sheetName} mb={1}>
                <Typography variant="body2" fontWeight={600}>
                  {sheet.sheetName} &mdash; {sheet.date} &mdash; {sheet.processed} records
                  {sheet.skipped > 0 && (
                    <Typography component="span" variant="body2" color="warning.main">
                      {' '}({sheet.skipped} skipped)
                    </Typography>
                  )}
                </Typography>
                {sheet.errors.length > 0 && (
                  <Box pl={1}>
                    {sheet.errors.map((e, i) => (
                      <Typography key={i} variant="caption" color="text.secondary" display="block">
                        &bull; {e}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            {importMutation.isError && (
              <Alert severity="error">
                {(importMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Import failed.'}
              </Alert>
            )}
            <FormControl size="small" fullWidth required>
              <InputLabel>Branch</InputLabel>
              <Select
                label="Branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
                fullWidth
              >
                {file ? file.name : 'Choose XLSX File'}
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!result && (
          <Button
            variant="contained"
            onClick={() => importMutation.mutate()}
            disabled={!canSubmit}
            startIcon={importMutation.isPending ? <CircularProgress size={16} /> : <UploadFileIcon />}
          >
            {importMutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── Adjustments Dialog (own component to prevent lag from re-rendering the full page) ──
interface AdjustmentsDialogProps {
  inventory: Inventory;
  productName: string;
  onClose: () => void;
}

function InventoryAdjustmentsDialog({ inventory, productName, onClose }: AdjustmentsDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ type: AdjustmentType; value: string; notes: string }>({
    type: 'PULL_IN',
    value: '',
    notes: '',
  });
  const [formError, setFormError] = useState('');

  const currentAdjustments = inventory.adjustments ?? [];
  const adjSum = currentAdjustments.reduce((acc, a) => acc + a.value, 0);

  const createMutation = useMutation({
    mutationFn: (data: { inventoryId: number; type: AdjustmentType; value: number; notes?: string }) =>
      inventoryAdjustmentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setForm({ type: 'PULL_IN', value: '', notes: '' });
      setFormError('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to add adjustment.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryAdjustmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const handleAdd = () => {
    setFormError('');
    const parsedValue = parseInt(form.value, 10);
    if (!form.value.trim() || isNaN(parsedValue)) {
      setFormError('Please enter a valid integer value.');
      return;
    }
    createMutation.mutate({
      inventoryId: inventory.id,
      type: form.type,
      value: parsedValue,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 10 }}>Adjustments — {productName}</DialogTitle>
      <Avatar
        sx={{
          position: 'absolute',
          top: 12,
          right: 16,
          width: 52,
          height: 52,
          fontSize: '0.85rem',
          fontWeight: 700,
          bgcolor:
            adjSum > 0
              ? 'success.main'
              : adjSum < 0
                ? 'error.main'
                : 'action.disabledBackground',
          color: adjSum === 0 ? 'text.secondary' : 'white',
        }}
      >
        {adjSum > 0 ? `+${adjSum}` : adjSum}
      </Avatar>
      <DialogContent>
        {currentAdjustments.length === 0 ? (
          <Typography color="text.secondary" variant="body2" sx={{ py: 1 }}>
            No adjustments yet.
          </Typography>
        ) : (
          <Box mb={2}>
            {currentAdjustments.map((adj) => (
              <Box key={adj.id} display="flex" alignItems="center" gap={1} py={0.75}
                sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Chip
                  label={ADJ_TYPE_LABELS[adj.type]}
                  size="small"
                  color={adj.type === 'PULL_IN' ? 'success' : adj.type === 'PULL_OUT' ? 'warning' : 'error'}
                  variant="outlined"
                  sx={{ minWidth: 80 }}
                />
                <Typography
                  variant="body2"
                  fontWeight={700}
                  sx={{ minWidth: 40 }}
                  color={adj.value > 0 ? 'success.main' : 'error.main'}
                >
                  {adj.value > 0 ? `+${adj.value}` : adj.value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {adj.notes ?? '—'}
                </Typography>
                <IconButton
                  size="small"
                  color="error"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(adj.id)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
          Add Adjustment
        </Typography>
        {formError && <Alert severity="error" sx={{ mb: 1.5 }}>{formError}</Alert>}
        <Box display="flex" gap={1.5} flexDirection="column">
          <FormControl size="small" fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AdjustmentType }))}
            >
              <MenuItem value="PULL_IN">Pull In — Add stock</MenuItem>
              <MenuItem value="PULL_OUT">Pull Out — Remove stock</MenuItem>
              <MenuItem value="ANOMALY">Anomaly — Unexplained variance</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Value"
            type="number"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            helperText="Positive integer adds stock; negative removes stock"
          />
          <TextField
            size="small"
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={createMutation.isPending ? <CircularProgress size={16} /> : <AddIcon />}
          onClick={handleAdd}
          disabled={createMutation.isPending}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

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

  const getBranchName = (id: number) =>
    branches.find((b) => b.id === id)?.name ?? `Branch #${id}`;
  const getProductName = (id: number) =>
    products.find((p) => p.id === id)?.name ?? `Product #${id}`;

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

  const columns = useMemo<GridColDef[]>(
    () => [
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
      ...(filterBranch !== ''
        ? [
            {
              field: 'adjustments',
              headerName: 'Adjustments',
              width: 140,
              sortable: false,
              headerAlign: 'center',
              align: 'center',
              renderCell: (params: GridRenderCellParams) => {
                const row = params.row as Inventory;
                const adj = row.adjustments ?? [];
                const sum = adj.reduce((acc, a) => acc + a.value, 0);
                return (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {adj.length > 0 && (
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color={sum > 0 ? 'success.main' : sum < 0 ? 'error.main' : 'text.secondary'}
                      >
                        {sum > 0 ? `+${sum}` : sum}
                      </Typography>
                    )}
                    {!isRange && (
                      <Tooltip title="Manage adjustments">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); openAdjustments(row); }}
                        >
                          <TuneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                );
              },
            } satisfies GridColDef,
          ]
        : []),
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
              valueGetter: (_value: unknown, row: Inventory) => {
                const adjSum = (row.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
                return row.quantity + row.delivery + adjSum;
              },
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
        valueGetter: (_value: unknown, row: Inventory) => {
          const adjSum = (row.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
          return row.quantity + row.delivery + adjSum - row.leftover;
        },
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
          const adjSum = (row.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
          const sold = row.quantity + row.delivery + adjSum - row.leftover;
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

  // When all branches selected: aggregate by productId across branches.
  // When specific branch + range: aggregate by productId across dates.
  const displayRows = useMemo(() => {
    if (filterBranch === '') {
      const agg = new Map<number, Inventory>();
      for (const inv of rows) {
        const existing = agg.get(inv.productId);
        if (existing) {
          existing.delivery += inv.delivery;
          existing.leftover += inv.leftover;
          existing.reject += inv.reject;
          existing.quantity += inv.quantity;
        } else {
          agg.set(inv.productId, { ...inv, id: -inv.productId });
        }
      }
      return Array.from(agg.values());
    }
    if (isRange) {
      const agg = new Map<number, Inventory>();
      for (const inv of rows) {
        const existing = agg.get(inv.productId);
        if (existing) {
          existing.delivery += inv.delivery;
          existing.leftover += inv.leftover;
          existing.reject += inv.reject;
          existing.adjustments = [...(existing.adjustments ?? []), ...(inv.adjustments ?? [])];
        } else {
          agg.set(inv.productId, { ...inv, adjustments: [...(inv.adjustments ?? [])], id: -(inv.branchId * 100000 + inv.productId) });
        }
      }
      return Array.from(agg.values());
    }
    return rows;
  }, [rows, isRange, filterBranch]);

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
    const revenueByType: Record<ProductType, number> = { BREAD: 0, CAKE: 0, SPECIAL: 0, MISCELLANEOUS: 0 };
    const revenueByProduct = new Map<number, { name: string; revenue: number; sold: number }>();

    for (const inv of rows) {
      const adjSum = (inv.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
      const sold = inv.quantity + inv.delivery + adjSum - inv.leftover;
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

  const adjustmentRow = adjustmentTarget
    ? (invQuery.data ?? []).find((r) => r.id === adjustmentTarget.id) ?? adjustmentTarget
    : null;

  return (
    <AuthGuard>
      <AppLayout title="Inventory">
        {/* Date navigation */}
        <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
          {/* Mode toggle */}
          <ToggleButtonGroup
            value={dateMode}
            exclusive
            size="small"
            onChange={(_, val) => { if (val) switchDateMode(val as 'date' | 'range'); }}
          >
            <ToggleButton value="date">
              <Tooltip title="Single date">
                <EventIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="range">
              <Tooltip title="Date range">
                <DateRangeIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title="Previous period">
            <IconButton onClick={() => stepDate(-1)} size="small">
              <ChevronLeftIcon />
            </IconButton>
          </Tooltip>

          {dateMode === 'date' ? (
            // ── Single date ──
            <TextField
              size="small"
              type="date"
              label="Date"
              value={draftFrom}
              onChange={(e) => {
                const v = e.target.value;
                setDraftFrom(v);
                setDraftTo(v);
                commitDates(v, v);
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 150 }}
            />
          ) : (
            // ── Date range ──
            <>
              <TextField
                size="small"
                type="date"
                label="From"
                value={draftFrom}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraftFrom(v);
                  if (v > draftTo) setDraftTo(v);
                }}
                onBlur={() => commitDates(draftFrom, draftTo)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
              <Typography variant="body2" color="text.secondary">—</Typography>
              <TextField
                size="small"
                type="date"
                label="To"
                value={draftTo}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraftTo(v);
                  if (v < draftFrom) setDraftFrom(v);
                }}
                onBlur={() => commitDates(draftFrom, draftTo)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
            </>
          )}

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
              onClick={() => { setDraftFrom(today); setDraftTo(today); commitDates(today, today); }}
            >
              Today
            </Button>
          )}
          {dateMode === 'range' && (
            <>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  const from = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
                  setDraftFrom(from); setDraftTo(today); commitDates(from, today);
                }}
              >
                Last 7d
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  const from = dayjs().startOf('month').format('YYYY-MM-DD');
                  setDraftFrom(from); setDraftTo(today); commitDates(from, today);
                }}
              >
                This Month
              </Button>
            </>
          )}
          <Box flexGrow={1} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => setImportOpen(true)}
          >
            Import XLSX
          </Button>
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
                  { label: 'Misc Revenue', value: `₱${summary.revenueByType.MISCELLANEOUS.toLocaleString()}`, color: 'text.primary' },
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
                  processRowUpdate={isRange || filterBranch === '' ? undefined : handleProcessRowUpdate}
                  isCellEditable={() => !isRange && filterBranch !== ''}
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
            productName={getProductName(adjustmentRow.productId)}
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
