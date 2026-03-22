'use client';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CalculateIcon from '@mui/icons-material/Calculate';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { materialsApi, productsApi, recipesApi } from '@/lib/apiServices';
import type { Material, MeasurementUnit, Product, Recipe, RecipeCost } from '@/types';

const UNITS: MeasurementUnit[] = [
  'KG', 'G', 'LITER', 'ML', 'PIECE', 'DOZEN', 'BAG', 'SACHET', 'CUP', 'TBSP', 'TSP',
];

interface RecipeItemForm {
  materialId: string;
  quantity: string;
  unit: MeasurementUnit;
}

interface RecipeFormData {
  productId: string;
  recipeYield: string;
  notes: string;
  items: RecipeItemForm[];
}

const defaultForm: RecipeFormData = {
  productId: '',
  recipeYield: '1',
  notes: '',
  items: [{ materialId: '', quantity: '1', unit: 'KG' }],
};

export default function RecipesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<RecipeFormData>(defaultForm);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [costRecipe, setCostRecipe] = useState<RecipeCost | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: () => recipesApi.list().then((r) => r.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: RecipeFormData) =>
      recipesApi.create({
        productId: parseInt(data.productId),
        recipeYield: parseFloat(data.recipeYield) || 1,
        notes: data.notes || undefined,
        items: data.items.map((i) => ({
          materialId: parseInt(i.materialId),
          quantity: parseFloat(i.quantity) || 0,
          unit: i.unit,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      setCreateOpen(false);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => recipesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });

  const handleAddItem = () =>
    setForm((f) => ({
      ...f,
      items: [...f.items, { materialId: '', quantity: '1', unit: 'KG' }],
    }));

  const handleRemoveItem = (index: number) =>
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));

  const handleItemChange = (
    index: number,
    field: keyof RecipeItemForm,
    value: string
  ) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const handleSave = () => {
    setFormError('');
    if (!form.productId) {
      setFormError('Product is required.');
      return;
    }
    if (form.items.some((i) => !i.materialId)) {
      setFormError('All recipe items must have a material selected.');
      return;
    }
    createMutation.mutate(form);
  };

  const handleViewCost = async (recipe: Recipe) => {
    setCostLoading(true);
    try {
      const { data } = await recipesApi.cost(recipe.id);
      setCostRecipe(data);
    } finally {
      setCostLoading(false);
    }
  };

  const getProductName = (id: number) =>
    products.find((p) => p.id === id)?.name ?? `Product #${id}`;
  const getMaterialName = (id: number) =>
    materials.find((m) => m.id === id)?.name ?? `Material #${id}`;

  const filtered = recipes.filter((r) => {
    const product = products.find((p) => p.id === r.productId);
    return (
      product?.name.toLowerCase().includes(search.toLowerCase()) ?? false
    );
  });

  return (
    <AuthGuard>
      <AppLayout title="Recipes">
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <TextField
            size="small"
            placeholder="Search by product…"
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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setForm(defaultForm);
              setFormError('');
              setCreateOpen(true);
            }}
          >
            New Recipe
          </Button>
        </Box>

        {isLoading ? (
          <Box display="flex" justifyContent="center" mt={8}>
            <CircularProgress />
          </Box>
        ) : filtered.length === 0 ? (
          <Typography color="text.secondary" mt={4} textAlign="center">
            No recipes found.
          </Typography>
        ) : (
          <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(340px, 1fr))" gap={3}>
            {filtered.map((recipe) => (
              <Card key={recipe.id}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6" fontWeight={700}>
                        {getProductName(recipe.productId)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Yield: {recipe.recipeYield} unit{recipe.recipeYield !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Box>
                      <Tooltip title="View cost breakdown">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleViewCost(recipe)}
                        >
                          <CalculateIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteTarget(recipe)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  {recipe.notes && (
                    <Typography variant="body2" color="text.secondary" mt={1} mb={1}>
                      {recipe.notes}
                    </Typography>
                  )}

                  <Divider sx={{ my: 1 }} />

                  {recipe.items?.map((item) => (
                    <Box
                      key={item.id}
                      display="flex"
                      justifyContent="space-between"
                      py={0.4}
                    >
                      <Typography variant="body2">
                        {getMaterialName(item.materialId)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.quantity} {item.unit}
                      </Typography>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        {/* Create Recipe Dialog */}
        <Dialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>New Recipe</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}
            <Box display="flex" gap={2} mb={2}>
              <FormControl sx={{ flex: 2 }} required>
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
                label="Yield (units per batch)"
                type="number"
                sx={{ flex: 1 }}
                value={form.recipeYield}
                onChange={(e) =>
                  setForm((f) => ({ ...f, recipeYield: e.target.value }))
                }
                inputProps={{ min: 0.01, step: 0.01 }}
              />
            </Box>
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              sx={{ mb: 3 }}
            />

            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1" fontWeight={600}>
                Ingredients
              </Typography>
              <Button
                size="small"
                startIcon={<AddCircleOutlineIcon />}
                onClick={handleAddItem}
              >
                Add Ingredient
              </Button>
            </Box>

            <Paper variant="outlined" sx={{ p: 2 }}>
              {form.items.map((item, idx) => (
                <Box key={idx} display="flex" gap={2} alignItems="center" mb={1.5}>
                  <FormControl sx={{ flex: 3 }} size="small">
                    <InputLabel>Material</InputLabel>
                    <Select
                      value={item.materialId}
                      label="Material"
                      onChange={(e) =>
                        handleItemChange(idx, 'materialId', e.target.value)
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
                    label="Qty"
                    type="number"
                    size="small"
                    sx={{ flex: 1 }}
                    value={item.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                  <FormControl sx={{ flex: 1 }} size="small">
                    <InputLabel>Unit</InputLabel>
                    <Select
                      value={item.unit}
                      label="Unit"
                      onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                    >
                      {UNITS.map((u) => (
                        <MenuItem key={u} value={u}>
                          {u}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={form.items.length === 1}
                  >
                    <RemoveCircleOutlineIcon />
                  </IconButton>
                </Box>
              ))}
            </Paper>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <CircularProgress size={18} /> : 'Create Recipe'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Cost Breakdown Dialog */}
        <Dialog
          open={!!costRecipe || costLoading}
          onClose={() => setCostRecipe(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Cost Breakdown</DialogTitle>
          <DialogContent>
            {costLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : costRecipe ? (
              <>
                <Typography variant="h6" mb={0.5}>
                  {costRecipe.productName}
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Yield: {costRecipe.recipeYield} unit
                  {costRecipe.recipeYield !== 1 ? 's' : ''} per batch
                </Typography>

                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Ingredient</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Cost</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {costRecipe.items.map((item) => (
                        <TableRow key={item.materialId}>
                          <TableCell>{item.materialName}</TableCell>
                          <TableCell align="right">
                            {item.quantity} {item.unit}
                          </TableCell>
                          <TableCell align="right">
                            ₱{item.cost.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box
                  sx={{
                    bgcolor: 'background.default',
                    borderRadius: 2,
                    p: 2,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Total Batch Cost
                  </Typography>
                  <Typography variant="body2" fontWeight={700} textAlign="right">
                    ₱{costRecipe.totalBatchCost.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Cost per Unit
                  </Typography>
                  <Typography variant="body2" fontWeight={700} textAlign="right">
                    ₱{costRecipe.costPerUnit.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Selling Price
                  </Typography>
                  <Typography variant="body2" fontWeight={700} textAlign="right">
                    ₱{costRecipe.productPrice.toFixed(2)}
                  </Typography>
                  <Divider sx={{ gridColumn: '1/-1' }} />
                  <Typography variant="body2" fontWeight={700}>
                    Gross Margin
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    textAlign="right"
                    color={
                      costRecipe.grossMargin >= 0 ? 'success.main' : 'error.main'
                    }
                  >
                    {(costRecipe.grossMargin * 100).toFixed(1)}%
                  </Typography>
                </Box>
              </>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCostRecipe(null)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete Recipe</DialogTitle>
          <DialogContent>
            <Typography>
              Delete recipe for{' '}
              <strong>{getProductName(deleteTarget?.productId ?? 0)}</strong>?
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
