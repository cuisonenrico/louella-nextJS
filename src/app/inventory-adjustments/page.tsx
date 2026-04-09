'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import {
  branchesApi,
  inventoryApi,
  inventoryAdjustmentsApi,
  productsApi,
} from '@/lib/apiServices';
import type { AdjustmentType, Branch, Inventory, InventoryAdjustment, Product } from '@/types';

const ADJ_COLORS: Record<AdjustmentType, 'success' | 'error' | 'warning'> = {
  PULL_IN: 'success',
  PULL_OUT: 'error',
  ANOMALY: 'warning',
};

const ADJ_LABELS: Record<AdjustmentType, string> = {
  PULL_IN: 'Pull In',
  PULL_OUT: 'Pull Out',
  ANOMALY: 'Anomaly',
};

// ── Adjustments sub-row ───────────────────────────────────────────────────────
function AdjustmentRows({
  inventoryId,
  onAdd,
}: {
  inventoryId: number;
  onAdd: (inventoryId: number) => void;
}) {
  const qc = useQueryClient();
  const { data: adjustments = [], isLoading } = useQuery<InventoryAdjustment[]>({
    queryKey: ['adjustments', inventoryId],
    queryFn: () =>
      inventoryAdjustmentsApi.listByInventory(inventoryId).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryAdjustmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adjustments', inventoryId] }),
  });

  if (isLoading)
    return (
      <Box px={2} py={1}>
        <CircularProgress size={16} />
      </Box>
    );

  return (
    <Box px={3} pb={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>
          ADJUSTMENTS ({adjustments.length})
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onAdd(inventoryId)}
        >
          New Adjustment
        </Button>
      </Box>
      {adjustments.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No adjustments recorded.
        </Typography>
      ) : (
        <Table size="small" sx={{ '& td': { py: 0.5 } }}>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem' } }}>
              <TableCell>Type</TableCell>
              <TableCell align="right">Value</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell align="right">Date</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {adjustments.map((adj) => (
              <TableRow key={adj.id} sx={{ '&:last-child td': { border: 0 } }}>
                <TableCell>
                  <Chip
                    label={ADJ_LABELS[adj.type]}
                    size="small"
                    color={ADJ_COLORS[adj.type]}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {adj.type === 'PULL_IN' ? '+' : '-'}{adj.value}
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                  {adj.notes ?? '—'}
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {dayjs(adj.createdAt).format('MMM D, HH:mm')}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteMutation.mutate(adj.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

// ── New Adjustment Dialog ─────────────────────────────────────────────────────
interface NewAdjDialogProps {
  inventoryId: number | null;
  onClose: () => void;
}

function NewAdjustmentDialog({ inventoryId, onClose }: NewAdjDialogProps) {
  const qc = useQueryClient();
  const [type, setType] = useState<AdjustmentType>('PULL_OUT');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      inventoryAdjustmentsApi.create({
        inventoryId: inventoryId!,
        type,
        value: parseFloat(value),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adjustments', inventoryId] });
      onClose();
    },
  });

  return (
    <Dialog open={inventoryId !== null} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Adjustment</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <FormControl fullWidth size="small">
          <InputLabel>Type</InputLabel>
          <Select
            value={type}
            label="Type"
            onChange={(e) => setType(e.target.value as AdjustmentType)}
          >
            {(Object.keys(ADJ_LABELS) as AdjustmentType[]).map((t) => (
              <MenuItem key={t} value={t}>
                {ADJ_LABELS[t]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Value"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputProps={{ min: 0, step: 0.01 }}
          required
        />
        <TextField
          size="small"
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          rows={2}
        />
        {createMutation.isError && (
          <Alert severity="error">Failed to save adjustment.</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => createMutation.mutate()}
          disabled={!value || createMutation.isPending}
        >
          {createMutation.isPending ? <CircularProgress size={18} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InventoryAdjustmentsPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adjInventoryId, setAdjInventoryId] = useState<number | null>(null);
  const [snack, setSnack] = useState('');

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const invQuery = useQuery<Inventory[]>({
    queryKey: ['inventory-adj-page', date, branchId],
    enabled: !!branchId,
    queryFn: () =>
      inventoryApi.byBranchDate(parseInt(branchId), date).then((r) => r.data as Inventory[]),
  });

  if (invQuery.isError && !snack) setSnack('Failed to load inventory records.');

  const getProductName = (id: number) =>
    products.find((p) => p.id === id)?.name ?? `Product #${id}`;

  const rows = invQuery.data ?? [];

  return (
    <AuthGuard>
      <AppLayout title="Inventory Adjustments">
        {/* Filters */}
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" mb={3}>
          <TextField
            size="small"
            type="date"
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Branch</InputLabel>
            <Select
              value={branchId}
              label="Branch"
              onChange={(e) => setBranchId(e.target.value)}
            >
              <MenuItem value="" disabled>Select branch</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {!branchId && (
          <Alert severity="info">Select a branch to view inventory records.</Alert>
        )}

        {branchId && invQuery.isLoading && (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        )}

        {branchId && !invQuery.isLoading && rows.length === 0 && (
          <Alert severity="info">No inventory records for this date and branch.</Alert>
        )}

        {rows.length > 0 && (
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.100' } }}>
                  <TableCell width={40} />
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Delivery</TableCell>
                  <TableCell align="right">Leftover</TableCell>
                  <TableCell align="right">Reject</TableCell>
                  <TableCell align="right">Sold</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((inv) => (
                  <>
                    <TableRow
                      key={inv.id}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: expandedId === inv.id ? 'action.selected' : undefined,
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                      onClick={() =>
                        setExpandedId(expandedId === inv.id ? null : inv.id)
                      }
                    >
                      <TableCell>
                        <IconButton size="small">
                          {expandedId === inv.id ? (
                            <ExpandLessIcon fontSize="small" />
                          ) : (
                            <ExpandMoreIcon fontSize="small" />
                          )}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>
                        {getProductName(inv.productId)}
                      </TableCell>
                      <TableCell align="right">{inv.delivery}</TableCell>
                      <TableCell align="right">{inv.leftover}</TableCell>
                      <TableCell align="right">{inv.reject}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {inv.delivery - inv.leftover - inv.reject}
                      </TableCell>
                    </TableRow>
                    <TableRow key={`${inv.id}-adj`}>
                      <TableCell colSpan={6} sx={{ p: 0, borderBottom: expandedId === inv.id ? 1 : 0, borderColor: 'divider' }}>
                        <Collapse in={expandedId === inv.id} unmountOnExit>
                          <AdjustmentRows
                            inventoryId={inv.id}
                            onAdd={(id) => setAdjInventoryId(id)}
                          />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        <NewAdjustmentDialog
          inventoryId={adjInventoryId}
          onClose={() => setAdjInventoryId(null)}
        />

        <Snackbar
          open={!!snack}
          autoHideDuration={4000}
          onClose={() => setSnack('')}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="error" onClose={() => setSnack('')}>
            {snack}
          </Alert>
        </Snackbar>
      </AppLayout>
    </AuthGuard>
  );
}
