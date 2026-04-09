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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { materialsApi } from '@/lib/apiServices';
import type { Material, MaterialPriceHistory, MeasurementUnit } from '@/types';

const UNITS: MeasurementUnit[] = [
  'KG', 'G', 'LITER', 'ML', 'PIECE', 'DOZEN', 'BAG', 'SACHET', 'CUP', 'TBSP', 'TSP',
];

interface MaterialForm {
  name: string;
  unit: MeasurementUnit;
  pricePerUnit: string;
  reorderLevel: string;
}

const defaultForm: MaterialForm = {
  name: '',
  unit: 'KG',
  pricePerUnit: '0',
  reorderLevel: '0',
};

function MaterialPriceHistoryTab({ materialId }: { materialId: number }) {
  const { data: history = [], isLoading } = useQuery<MaterialPriceHistory[]>({
    queryKey: ['material-price-history', materialId],
    queryFn: () => materialsApi.priceHistory(materialId).then((r) => r.data),
  });

  if (isLoading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} /></Box>;
  if (history.length === 0) return <Typography color="text.secondary" py={2}>No price changes recorded yet.</Typography>;

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Effective Date</TableCell>
          <TableCell align="right">Price / Unit</TableCell>
          <TableCell>Supplier</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {history.map((h) => (
          <TableRow key={h.id} hover>
            <TableCell>{dayjs(h.effectiveAt).format('MMM D, YYYY')}</TableCell>
            <TableCell align="right">₱{h.pricePerUnit.toFixed(2)}</TableCell>
            <TableCell>{h.supplier?.name ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function MaterialsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState(0);

  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Material>) => materialsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
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
    mutationFn: ({ id, data }: { id: number; data: Partial<Material> }) =>
      materialsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
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
    mutationFn: (id: number) => materialsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setFormError('');
    setActiveTab(0);
    setDialogOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditTarget(m);
    setForm({
      name: m.name,
      unit: m.unit,
      pricePerUnit: m.pricePerUnit.toString(),
      reorderLevel: m.reorderLevel.toString(),
    });
    setFormError('');
    setActiveTab(0);
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Material name is required.');
      return;
    }
    const payload: Partial<Material> = {
      name: form.name.trim(),
      unit: form.unit,
      pricePerUnit: parseFloat(form.pricePerUnit) || 0,
      reorderLevel: parseFloat(form.reorderLevel) || 0,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard>
      <AppLayout title="Materials">
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <TextField
            size="small"
            placeholder="Search materials…"
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
            Add Material
          </Button>
        </Box>

        <Paper>
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell align="right">Price / Unit</TableCell>
                  <TableCell align="right">Reorder Level</TableCell>
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
                      <Typography color="text.secondary">No materials found.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m) => (
                    <TableRow key={m.id} hover>
                      <TableCell>
                        <Typography fontWeight={600}>{m.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={m.unit} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">₱{m.pricePerUnit.toFixed(2)}</TableCell>
                      <TableCell align="right">
                        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                          {m.reorderLevel > 0 && (
                            <Tooltip title="Has reorder level set">
                              <WarningAmberIcon
                                fontSize="small"
                                sx={{ color: 'warning.main', opacity: 0.7 }}
                              />
                            </Tooltip>
                          )}
                          {m.reorderLevel} {m.unit}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(m)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteTarget(m)}
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
          <DialogTitle>{editTarget ? 'Edit Material' : 'New Material'}</DialogTitle>
          {editTarget && (
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
              <Tab label="Details" />
              <Tab label="Price History" />
            </Tabs>
          )}
          <DialogContent sx={{ pt: 2 }}>
            {activeTab === 0 && (
              <>
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
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Unit</InputLabel>
                  <Select
                    value={form.unit}
                    label="Unit"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, unit: e.target.value as MeasurementUnit }))
                    }
                  >
                    {UNITS.map((u) => (
                      <MenuItem key={u} value={u}>
                        {u}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Price per Unit (₱)"
                  type="number"
                  fullWidth
                  value={form.pricePerUnit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pricePerUnit: e.target.value }))
                  }
                  sx={{ mb: 2 }}
                  inputProps={{ min: 0, step: 0.01 }}
                />
                <TextField
                  label="Reorder Level"
                  type="number"
                  fullWidth
                  value={form.reorderLevel}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reorderLevel: e.target.value }))
                  }
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </>
            )}
            {activeTab === 1 && editTarget && (
              <MaterialPriceHistoryTab materialId={editTarget.id} />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            {activeTab === 0 && (
              <Button variant="contained" onClick={handleSave} disabled={saving}>
                {saving ? <CircularProgress size={18} /> : 'Save'}
              </Button>
            )}
          </DialogActions>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete Material</DialogTitle>
          <DialogContent>
            <Typography>
              Delete <strong>{deleteTarget?.name}</strong>?
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
