'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product } from '@/types';

interface InventoryForm {
  branchId: string;
  productId: string;
  date: string;
  quantity: string;
  delivery: string;
  leftover: string;
  reject: string;
  notes: string;
}

const defaultForm: InventoryForm = {
  branchId: '',
  productId: '',
  date: dayjs().format('YYYY-MM-DD'),
  quantity: '0',
  delivery: '0',
  leftover: '0',
  reject: '0',
  notes: '',
};

export default function InventoryPage() {
  const qc = useQueryClient();
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Inventory | null>(null);
  const [form, setForm] = useState<InventoryForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Inventory | null>(null);
  const [formError, setFormError] = useState('');

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const invQuery = useQuery({
    queryKey: ['inventory', filterBranch, filterDate],
    queryFn: async () => {
      if (filterBranch && filterDate) {
        const r = await inventoryApi.byBranchDate(
          parseInt(filterBranch),
          filterDate
        );
        return r.data as Inventory[];
      }
      if (filterBranch) {
        const r = await inventoryApi.byBranch(parseInt(filterBranch));
        return r.data.data ?? [];
      }
      const r = await inventoryApi.list();
      return r.data.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Inventory>) => inventoryApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Inventory> }) =>
      inventoryApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm({
      ...defaultForm,
      branchId: filterBranch,
      date: filterDate || dayjs().format('YYYY-MM-DD'),
    });
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (inv: Inventory) => {
    setEditTarget(inv);
    setForm({
      branchId: inv.branchId.toString(),
      productId: inv.productId.toString(),
      date: dayjs(inv.date).format('YYYY-MM-DD'),
      quantity: inv.quantity.toString(),
      delivery: inv.delivery.toString(),
      leftover: inv.leftover.toString(),
      reject: inv.reject.toString(),
      notes: inv.notes ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.branchId || !form.productId) {
      setFormError('Branch and product are required.');
      return;
    }
    const payload: Partial<Inventory> = {
      branchId: parseInt(form.branchId),
      productId: parseInt(form.productId),
      date: form.date,
      quantity: parseInt(form.quantity) || 0,
      delivery: parseInt(form.delivery) || 0,
      leftover: parseInt(form.leftover) || 0,
      reject: parseInt(form.reject) || 0,
      notes: form.notes || undefined,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = invQuery.data ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  const getBranchName = (id: number) =>
    branches.find((b) => b.id === id)?.name ?? `Branch #${id}`;
  const getProductName = (id: number) =>
    products.find((p) => p.id === id)?.name ?? `Product #${id}`;

  return (
    <AuthGuard>
      <AppLayout title="Inventory">
        {/* Filters */}
        <Box display="flex" gap={2} alignItems="center" mb={3} flexWrap="wrap">
          <FilterAltIcon color="action" />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Branch</InputLabel>
            <Select
              value={filterBranch}
              label="Branch"
              onChange={(e) => setFilterBranch(e.target.value)}
            >
              <MenuItem value="">All branches</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Date"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 180 }}
          />
          <Box flexGrow={1} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add Entry
          </Button>
        </Box>

        <Paper>
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Branch</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Delivery</TableCell>
                  <TableCell align="right">Leftover</TableCell>
                  <TableCell align="right">Reject</TableCell>
                  <TableCell align="right">Sold</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">
                        No inventory records found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((inv) => {
                    const sold = inv.delivery - inv.leftover - inv.reject;
                    return (
                      <TableRow key={inv.id} hover>
                        <TableCell>
                          {dayjs(inv.date).format('MMM D, YYYY')}
                        </TableCell>
                        <TableCell>{getBranchName(inv.branchId)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {getProductName(inv.productId)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{inv.quantity}</TableCell>
                        <TableCell align="right">{inv.delivery}</TableCell>
                        <TableCell align="right">{inv.leftover}</TableCell>
                        <TableCell align="right">{inv.reject}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={sold}
                            size="small"
                            color={sold > 0 ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEdit(inv)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(inv)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editTarget ? 'Edit Inventory' : 'New Inventory Entry'}</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}
            <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel>Branch</InputLabel>
              <Select
                value={form.branchId}
                label="Branch"
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                {branches.map((b) => (
                  <MenuItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel>Product</InputLabel>
              <Select
                value={form.productId}
                label="Product"
                onChange={(e) =>
                  setForm((f) => ({ ...f, productId: e.target.value }))
                }
              >
                {products.map((p) => (
                  <MenuItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Date"
              type="date"
              fullWidth
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
              <TextField
                label="Quantity (Total)"
                type="number"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                inputProps={{ min: 0 }}
              />
              <TextField
                label="Delivery"
                type="number"
                value={form.delivery}
                onChange={(e) => setForm((f) => ({ ...f, delivery: e.target.value }))}
                inputProps={{ min: 0 }}
              />
              <TextField
                label="Leftover"
                type="number"
                value={form.leftover}
                onChange={(e) => setForm((f) => ({ ...f, leftover: e.target.value }))}
                inputProps={{ min: 0 }}
              />
              <TextField
                label="Reject"
                type="number"
                value={form.reject}
                onChange={(e) => setForm((f) => ({ ...f, reject: e.target.value }))}
                inputProps={{ min: 0 }}
              />
            </Box>
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={18} /> : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete Entry</DialogTitle>
          <DialogContent>
            <Typography>Delete this inventory entry?</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }
              }}
            >
              {deleteMutation.isPending ? <CircularProgress size={18} /> : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </AppLayout>
    </AuthGuard>
  );
}
