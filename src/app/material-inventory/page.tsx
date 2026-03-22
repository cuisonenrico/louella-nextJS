'use client';

import {
  Alert,
  Box,
  Button,
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
import { branchesApi, materialInventoryApi, materialsApi } from '@/lib/apiServices';
import type { Branch, Material, MaterialInventory } from '@/types';

interface MatInvForm {
  branchId: string;
  materialId: string;
  date: string;
  quantity: string;
  delivery: string;
  leftover: string;
  reject: string;
  batchNumber: string;
  expiresAt: string;
  notes: string;
}

const defaultForm: MatInvForm = {
  branchId: '',
  materialId: '',
  date: dayjs().format('YYYY-MM-DD'),
  quantity: '0',
  delivery: '0',
  leftover: '0',
  reject: '0',
  batchNumber: '',
  expiresAt: '',
  notes: '',
};

export default function MaterialInventoryPage() {
  const qc = useQueryClient();
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MaterialInventory | null>(null);
  const [form, setForm] = useState<MatInvForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<MaterialInventory | null>(null);
  const [formError, setFormError] = useState('');

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then((r) => r.data),
  });

  const invQuery = useQuery({
    queryKey: ['material-inventory', filterBranch, filterDate],
    queryFn: async () => {
      if (filterBranch && filterDate) {
        const r = await materialInventoryApi.byBranchDate(
          parseInt(filterBranch),
          filterDate
        );
        return r.data as MaterialInventory[];
      }
      if (filterBranch) {
        const r = await materialInventoryApi.byBranch(parseInt(filterBranch));
        return r.data.data ?? [];
      }
      const r = await materialInventoryApi.list();
      return r.data.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<MaterialInventory>) =>
      materialInventoryApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-inventory'] });
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
    mutationFn: ({ id, data }: { id: number; data: Partial<MaterialInventory> }) =>
      materialInventoryApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-inventory'] });
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
    mutationFn: (id: number) => materialInventoryApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['material-inventory'] }),
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

  const openEdit = (inv: MaterialInventory) => {
    setEditTarget(inv);
    setForm({
      branchId: inv.branchId.toString(),
      materialId: inv.materialId.toString(),
      date: dayjs(inv.date).format('YYYY-MM-DD'),
      quantity: inv.quantity.toString(),
      delivery: inv.delivery.toString(),
      leftover: inv.leftover.toString(),
      reject: inv.reject.toString(),
      batchNumber: inv.batchNumber ?? '',
      expiresAt: inv.expiresAt
        ? dayjs(inv.expiresAt).format('YYYY-MM-DD')
        : '',
      notes: inv.notes ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.branchId || !form.materialId) {
      setFormError('Branch and material are required.');
      return;
    }
    const payload: Partial<MaterialInventory> = {
      branchId: parseInt(form.branchId),
      materialId: parseInt(form.materialId),
      date: form.date,
      quantity: parseFloat(form.quantity) || 0,
      delivery: parseFloat(form.delivery) || 0,
      leftover: parseFloat(form.leftover) || 0,
      reject: parseFloat(form.reject) || 0,
      batchNumber: form.batchNumber || undefined,
      expiresAt: form.expiresAt || undefined,
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
  const getMaterialName = (id: number) =>
    materials.find((m) => m.id === id)?.name ?? `Material #${id}`;
  const getMaterialUnit = (id: number) =>
    materials.find((m) => m.id === id)?.unit ?? '';

  return (
    <AuthGuard>
      <AppLayout title="Material Stock">
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
                  <TableCell>Material</TableCell>
                  <TableCell align="right">Stock</TableCell>
                  <TableCell align="right">Delivery</TableCell>
                  <TableCell align="right">Leftover</TableCell>
                  <TableCell align="right">Reject</TableCell>
                  <TableCell>Batch #</TableCell>
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
                        No material stock records found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((inv) => {
                    const unit = getMaterialUnit(inv.materialId);
                    return (
                      <TableRow key={inv.id} hover>
                        <TableCell>
                          {dayjs(inv.date).format('MMM D, YYYY')}
                        </TableCell>
                        <TableCell>{getBranchName(inv.branchId)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {getMaterialName(inv.materialId)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {inv.quantity} {unit}
                        </TableCell>
                        <TableCell align="right">
                          {inv.delivery} {unit}
                        </TableCell>
                        <TableCell align="right">
                          {inv.leftover} {unit}
                        </TableCell>
                        <TableCell align="right">
                          {inv.reject} {unit}
                        </TableCell>
                        <TableCell>{inv.batchNumber ?? '—'}</TableCell>
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
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {editTarget ? 'Edit Material Stock' : 'New Material Stock Entry'}
          </DialogTitle>
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
              <InputLabel>Material</InputLabel>
              <Select
                value={form.materialId}
                label="Material"
                onChange={(e) =>
                  setForm((f) => ({ ...f, materialId: e.target.value }))
                }
              >
                {materials.map((m) => (
                  <MenuItem key={m.id} value={m.id.toString()}>
                    {m.name} ({m.unit})
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
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2} mb={2}>
              <TextField
                label="Stock (Start)"
                type="number"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <TextField
                label="Delivery"
                type="number"
                value={form.delivery}
                onChange={(e) => setForm((f) => ({ ...f, delivery: e.target.value }))}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <TextField
                label="Leftover"
                type="number"
                value={form.leftover}
                onChange={(e) => setForm((f) => ({ ...f, leftover: e.target.value }))}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <TextField
                label="Reject"
                type="number"
                value={form.reject}
                onChange={(e) => setForm((f) => ({ ...f, reject: e.target.value }))}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Box>
            <TextField
              label="Batch Number"
              fullWidth
              value={form.batchNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, batchNumber: e.target.value }))
              }
              sx={{ mb: 2 }}
            />
            <TextField
              label="Expiry Date"
              type="date"
              fullWidth
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
        <Dialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Delete Entry</DialogTitle>
          <DialogContent>
            <Typography>Delete this material stock entry?</Typography>
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
