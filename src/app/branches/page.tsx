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
  InputAdornment,
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
import SearchIcon from '@mui/icons-material/Search';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi } from '@/lib/apiServices';
import type { Branch } from '@/types';

interface BranchForm {
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
}

const defaultForm: BranchForm = {
  name: '',
  address: '',
  phone: '',
  isActive: true,
};

export default function BranchesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [formError, setFormError] = useState('');

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Branch>) => branchesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
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
    mutationFn: ({ id, data }: { id: number; data: Partial<Branch> }) =>
      branchesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
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
    mutationFn: (id: number) => branchesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditTarget(b);
    setForm({
      name: b.name,
      address: b.address ?? '',
      phone: b.phone ?? '',
      isActive: b.isActive,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Branch name is required.');
      return;
    }
    const payload: Partial<Branch> = {
      name: form.name.trim(),
      address: form.address || undefined,
      phone: form.phone || undefined,
      isActive: form.isActive,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard>
      <AppLayout title="Branches">
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <TextField
            size="small"
            placeholder="Search branches…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: 260 }}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add Branch
          </Button>
        </Box>

        <Paper>
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">No branches found.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => (
                    <TableRow key={b.id} hover>
                      <TableCell>
                        <Typography fontWeight={600}>{b.name}</Typography>
                      </TableCell>
                      <TableCell>{b.address ?? '—'}</TableCell>
                      <TableCell>{b.phone ?? '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={b.isActive ? 'Active' : 'Inactive'}
                          color={b.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(b)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteTarget(b)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editTarget ? 'Edit Branch' : 'New Branch'}</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}
            <TextField
              label="Name"
              fullWidth
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              sx={{ mb: 2 }}
              autoFocus
            />
            <TextField
              label="Address"
              fullWidth
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Phone"
              fullWidth
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={form.isActive ? 'active' : 'inactive'}
                label="Status"
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.value === 'active' }))
                }
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
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
          <DialogTitle>Delete Branch</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            </Typography>
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
