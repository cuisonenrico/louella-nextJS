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
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { unitConversionsApi } from '@/lib/apiServices';
import type { MeasurementUnit, UnitConversion } from '@/types';

const UNITS: MeasurementUnit[] = [
  'KG', 'G', 'LITER', 'ML', 'PIECE', 'DOZEN', 'BAG', 'SACHET', 'CUP', 'TBSP', 'TSP',
];

export default function UnitConversionsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    fromUnit: 'KG' as MeasurementUnit,
    toUnit: 'G' as MeasurementUnit,
    factor: '1000',
  });
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UnitConversion | null>(null);
  // Convert tool
  const [convertForm, setConvertForm] = useState({
    quantity: '1',
    fromUnit: 'KG' as MeasurementUnit,
    toUnit: 'G' as MeasurementUnit,
  });
  const [convertResult, setConvertResult] = useState<number | null>(null);
  const [convertError, setConvertError] = useState('');

  const { data: conversions = [], isLoading } = useQuery<UnitConversion[]>({
    queryKey: ['unit-conversions'],
    queryFn: () => unitConversionsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<UnitConversion>) => unitConversionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-conversions'] });
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
    mutationFn: (id: number) => unitConversionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-conversions'] }),
  });

  const handleSave = () => {
    setFormError('');
    if (form.fromUnit === form.toUnit) {
      setFormError('From and To units must be different.');
      return;
    }
    createMutation.mutate({
      fromUnit: form.fromUnit,
      toUnit: form.toUnit,
      factor: parseFloat(form.factor),
    });
  };

  const handleConvert = async () => {
    setConvertError('');
    setConvertResult(null);
    try {
      const { data } = await unitConversionsApi.convert(
        parseFloat(convertForm.quantity),
        convertForm.fromUnit,
        convertForm.toUnit
      );
      setConvertResult((data as { result: number }).result);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Conversion not available.';
      setConvertError(msg);
    }
  };

  return (
    <AuthGuard>
      <AppLayout title="Unit Conversions">
        <Box display="flex" gap={3} flexWrap="wrap" mb={4}>
          {/* Converter tool */}
          <Paper sx={{ p: 3, flex: '1 1 320px' }}>
            <Typography variant="h6" fontWeight={700} mb={2}>
              Convert Units
            </Typography>
            <Box display="flex" gap={1} alignItems="center" mb={1}>
              <TextField
                label="Quantity"
                type="number"
                size="small"
                value={convertForm.quantity}
                onChange={(e) =>
                  setConvertForm((f) => ({ ...f, quantity: e.target.value }))
                }
                sx={{ flex: 1 }}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>From</InputLabel>
                <Select
                  value={convertForm.fromUnit}
                  label="From"
                  onChange={(e) =>
                    setConvertForm((f) => ({
                      ...f,
                      fromUnit: e.target.value as MeasurementUnit,
                    }))
                  }
                >
                  {UNITS.map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <SwapHorizIcon color="action" />
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>To</InputLabel>
                <Select
                  value={convertForm.toUnit}
                  label="To"
                  onChange={(e) =>
                    setConvertForm((f) => ({
                      ...f,
                      toUnit: e.target.value as MeasurementUnit,
                    }))
                  }
                >
                  {UNITS.map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Button variant="outlined" onClick={handleConvert} sx={{ mb: 1 }}>
              Convert
            </Button>
            {convertError && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {convertError}
              </Alert>
            )}
            {convertResult !== null && !convertError && (
              <Typography variant="h6" mt={1} color="primary.main" fontWeight={700}>
                {convertForm.quantity} {convertForm.fromUnit} ={' '}
                <strong>{convertResult}</strong> {convertForm.toUnit}
              </Typography>
            )}
          </Paper>
        </Box>

        <Box display="flex" justifyContent="flex-end" mb={2}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setForm({ fromUnit: 'KG', toUnit: 'G', factor: '1000' });
              setFormError('');
              setDialogOpen(true);
            }}
          >
            Add Conversion
          </Button>
        </Box>

        <Paper>
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell align="right">Factor</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : conversions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">
                        No unit conversions defined.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  conversions.map((conv) => (
                    <TableRow key={conv.id} hover>
                      <TableCell>
                        <Typography fontWeight={600}>{conv.fromUnit}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={600}>{conv.toUnit}</Typography>
                      </TableCell>
                      <TableCell align="right">× {conv.factor}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteTarget(conv)}
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

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Add Unit Conversion</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>From Unit</InputLabel>
              <Select
                value={form.fromUnit}
                label="From Unit"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    fromUnit: e.target.value as MeasurementUnit,
                  }))
                }
              >
                {UNITS.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>To Unit</InputLabel>
              <Select
                value={form.toUnit}
                label="To Unit"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    toUnit: e.target.value as MeasurementUnit,
                  }))
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
              label="Factor (multiply From to get To)"
              type="number"
              fullWidth
              value={form.factor}
              onChange={(e) => setForm((f) => ({ ...f, factor: e.target.value }))}
              inputProps={{ min: 0.000001, step: 'any' }}
              helperText="e.g. KG→G = 1000, G→KG = 0.001"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <CircularProgress size={18} /> : 'Add'}
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
          <DialogTitle>Delete Conversion</DialogTitle>
          <DialogContent>
            <Typography>
              Delete conversion{' '}
              <strong>
                {deleteTarget?.fromUnit} → {deleteTarget?.toUnit}
              </strong>
              ? (Inverse pair will also be deleted.)
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
