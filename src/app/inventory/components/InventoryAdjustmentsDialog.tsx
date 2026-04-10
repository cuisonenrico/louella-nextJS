'use client';

import {
  Alert,
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
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { inventoryApi, inventoryAdjustmentsApi } from '@/lib/apiServices';
import type { AdjustmentType, Branch, Inventory } from '@/types';

const ADJ_TYPE_LABELS: Record<AdjustmentType, string> = {
  PULL_IN: 'Pull In',
  PULL_OUT: 'Pull Out',
  ANOMALY: 'Anomaly',
};

interface InventoryAdjustmentsDialogProps {
  inventory: Inventory;
  productName: string;
  branches: Branch[];
  onClose: () => void;
}

export default function InventoryAdjustmentsDialog({ inventory, productName, branches, onClose }: InventoryAdjustmentsDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ type: AdjustmentType; value: string; notes: string; toBranchId: string }>({
    type: 'PULL_IN',
    value: '',
    notes: '',
    toBranchId: '',
  });
  const [formError, setFormError] = useState('');

  const currentAdjustments = inventory.adjustments ?? [];
  const adjSum = currentAdjustments.reduce((acc, a) => acc + a.value, 0);

  const destInventoryQuery = useQuery<Inventory[]>({
    queryKey: ['inventory-dest', form.toBranchId, inventory.productId, inventory.date],
    queryFn: () =>
      inventoryApi
        .byBranchDate(parseInt(form.toBranchId), inventory.date.slice(0, 10))
        .then((r) => r.data as Inventory[]),
    enabled: form.type === 'PULL_OUT' && !!form.toBranchId,
  });
  const destInventory = destInventoryQuery.data?.find((r) => r.productId === inventory.productId) ?? null;

  const createMutation = useMutation({
    mutationFn: (data: { inventoryId: number; type: AdjustmentType; value: number; notes?: string }) =>
      inventoryAdjustmentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setForm((f) => ({ ...f, value: '', notes: '', toBranchId: '' }));
      setFormError('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to add adjustment.'));
    },
  });

  const transferMutation = useMutation({
    mutationFn: (data: { fromInventoryId: number; toInventoryId: number; value: number; notes?: string }) =>
      inventoryAdjustmentsApi.transfer(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setForm((f) => ({ ...f, value: '', notes: '', toBranchId: '' }));
      setFormError('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Transfer failed.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryAdjustmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const isPending = createMutation.isPending || transferMutation.isPending;
  const isTransfer = form.type === 'PULL_OUT' && !!form.toBranchId;

  const handleAdd = () => {
    setFormError('');
    const parsedValue = parseInt(form.value, 10);
    if (!form.value.trim() || isNaN(parsedValue) || parsedValue <= 0) {
      setFormError('Please enter a positive integer value.');
      return;
    }
    if (isTransfer) {
      if (!destInventory) {
        setFormError(
          `${branches.find((b) => b.id === parseInt(form.toBranchId))?.name ?? 'Destination branch'} has no inventory record for ${productName} on ${inventory.date.slice(0, 10)}. Create it first.`,
        );
        return;
      }
      transferMutation.mutate({
        fromInventoryId: inventory.id,
        toInventoryId: destInventory.id,
        value: parsedValue,
        notes: form.notes || undefined,
      });
    } else {
      createMutation.mutate({
        inventoryId: inventory.id,
        type: form.type,
        value: parsedValue,
        notes: form.notes || undefined,
      });
    }
  };

  const otherBranches = branches.filter((b) => b.id !== inventory.branchId && b.isActive);

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
                {adj.linkedAdjustmentId && (
                  <Tooltip title="Linked inter-branch transfer">
                    <Chip label="Transfer" size="small" variant="outlined" color="info" />
                  </Tooltip>
                )}
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
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AdjustmentType, toBranchId: '' }))}
            >
              <MenuItem value="PULL_IN">Pull In — Add stock</MenuItem>
              <MenuItem value="PULL_OUT">Pull Out — Remove stock</MenuItem>
              <MenuItem value="ANOMALY">Anomaly — Unexplained variance</MenuItem>
            </Select>
          </FormControl>

          {form.type === 'PULL_OUT' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Transfer to Branch (optional)</InputLabel>
              <Select
                label="Transfer to Branch (optional)"
                value={form.toBranchId}
                onChange={(e) => setForm((f) => ({ ...f, toBranchId: e.target.value }))}
              >
                <MenuItem value="">— Standalone pull-out (no transfer) —</MenuItem>
                {otherBranches.map((b) => (
                  <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {isTransfer && (
            destInventoryQuery.isLoading ? (
              <Box display="flex" alignItems="center" gap={1}>
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">Checking destination…</Typography>
              </Box>
            ) : destInventory ? (
              <Alert severity="success" sx={{ py: 0.5 }}>
                Destination found — current stock: {destInventory.quantity + destInventory.delivery} pcs
              </Alert>
            ) : (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                Destination branch has no inventory record for {productName} on this date. Create it first.
              </Alert>
            )
          )}

          <TextField
            size="small"
            label="Value"
            type="number"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            helperText={isTransfer ? 'Units to move from this branch to the destination' : 'Positive integer'}
            inputProps={{ min: 1, step: 1 }}
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
          startIcon={isPending ? <CircularProgress size={16} /> : <AddIcon />}
          onClick={handleAdd}
          disabled={isPending || (isTransfer && !destInventory)}
          color={isTransfer ? 'info' : 'primary'}
        >
          {isPending ? 'Saving…' : isTransfer ? 'Transfer' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
