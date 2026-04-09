import os, pathlib

DEST = pathlib.Path(__file__).parent.parent / "src" / "app" / "material-inventory" / "page.tsx"

content = r'''"use client";

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
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import TuneIcon from "@mui/icons-material/Tune";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import AuthGuard from "@/components/AuthGuard";
import {
  materialAdjustmentsApi,
  materialInventoryApi,
  materialsApi,
  suppliersApi,
} from "@/lib/apiServices";
import type { Material, MaterialAdjustment, MaterialInventory, Supplier } from "@/types";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractError(err: unknown): string {
  const msg = (
    err as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(", ") : (msg ?? "An error occurred");
}

const ADJ_COLORS: Record<string, "success" | "warning" | "error"> = {
  PULL_IN: "success",
  PULL_OUT: "warning",
  ANOMALY: "error",
};

const GRID_SX = {
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  "& .MuiDataGrid-columnHeader": { bgcolor: "grey.100", fontWeight: 700 },
} as const;

// ── Adjustments Dialog ────────────────────────────────────────────────────────
interface AdjDialogProps {
  record: MaterialInventory | null;
  onClose: () => void;
}

function AdjustmentsDialog({ record, onClose }: AdjDialogProps) {
  const qc = useQueryClient();
  const [type, setType] = useState<"PULL_IN" | "PULL_OUT" | "ANOMALY">("PULL_OUT");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [formErr, setFormErr] = useState("");

  const adjustments: MaterialAdjustment[] = record?.adjustments ?? [];

  const createAdj = useMutation({
    mutationFn: () =>
      materialAdjustmentsApi.create({
        materialInventoryId: record!.id,
        type,
        value: parseFloat(value),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      setValue("");
      setNotes("");
      setFormErr("");
      qc.invalidateQueries({ queryKey: ["material-inventory"] });
    },
    onError: (e) => setFormErr(extractError(e)),
  });

  const deleteAdj = useMutation({
    mutationFn: (id: number) => materialAdjustmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-inventory"] }),
    onError: (e) => setFormErr(extractError(e)),
  });

  if (!record) return null;

  return (
    <Dialog open={!!record} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Adjustments &mdash; {record.material?.name ?? `ID ${record.materialId}`}
      </DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}
      >
        {adjustments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No adjustments yet.
          </Typography>
        ) : (
          <Box display="flex" flexDirection="column" gap={1}>
            {adjustments.map((adj) => (
              <Box key={adj.id} display="flex" alignItems="center" gap={1}>
                <Chip
                  label={adj.type}
                  size="small"
                  color={ADJ_COLORS[adj.type] ?? "default"}
                  sx={{ minWidth: 80 }}
                />
                <Typography variant="body2" fontWeight={600}>
                  {adj.value}
                </Typography>
                {adj.notes && (
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {adj.notes}
                  </Typography>
                )}
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => deleteAdj.mutate(adj.id)}
                  disabled={deleteAdj.isPending}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        <Typography variant="subtitle2" fontWeight={700} mt={1}>
          Add Adjustment
        </Typography>
        <Box display="flex" gap={1} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={type}
              label="Type"
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <MenuItem value="PULL_IN">Pull In</MenuItem>
              <MenuItem value="PULL_OUT">Pull Out</MenuItem>
              <MenuItem value="ANOMALY">Anomaly</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Value"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputProps={{ min: 0, step: 0.01 }}
            sx={{ width: 120 }}
          />
          <TextField
            size="small"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            sx={{ flexGrow: 1, minWidth: 140 }}
          />
          <Button
            variant="contained"
            size="small"
            disabled={!value || parseFloat(value) <= 0 || createAdj.isPending}
            onClick={() => createAdj.mutate()}
          >
            {createAdj.isPending ? <CircularProgress size={16} /> : "Add"}
          </Button>
        </Box>
        {formErr && <Alert severity="error">{formErr}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Stock Card Dialog ─────────────────────────────────────────────────────────
interface StockCardDialogProps {
  open: boolean;
  editRecord: MaterialInventory | null;
  filterDate: string;
  materials: Material[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}

interface StockForm {
  materialId: string;
  date: string;
  supplierId: string;
  quantity: string;
  delivery: string;
  batchNumber: string;
  notes: string;
}

function StockCardDialog({
  open,
  editRecord,
  filterDate,
  materials,
  suppliers,
  onClose,
  onSaved,
}: StockCardDialogProps) {
  const [form, setForm] = useState<StockForm>({
    materialId: "",
    date: filterDate,
    supplierId: "",
    quantity: "0",
    delivery: "0",
    batchNumber: "",
    notes: "",
  });
  const [err, setErr] = useState("");

  useMemo(() => {
    if (!open) return;
    if (editRecord) {
      setForm({
        materialId: String(editRecord.materialId),
        date: editRecord.date?.slice(0, 10) ?? filterDate,
        supplierId: editRecord.supplierId ? String(editRecord.supplierId) : "",
        quantity: String(editRecord.quantity),
        delivery: String(editRecord.delivery),
        batchNumber: editRecord.batchNumber ?? "",
        notes: editRecord.notes ?? "",
      });
    } else {
      setForm({
        materialId: "",
        date: filterDate,
        supplierId: "",
        quantity: "0",
        delivery: "0",
        batchNumber: "",
        notes: "",
      });
    }
    setErr("");
  }, [open, editRecord, filterDate]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        materialId: parseInt(form.materialId),
        date: form.date,
        supplierId: form.supplierId ? parseInt(form.supplierId) : undefined,
        quantity: parseFloat(form.quantity) || 0,
        delivery: parseFloat(form.delivery) || 0,
        batchNumber: form.batchNumber || undefined,
        notes: form.notes || undefined,
      };
      if (editRecord) {
        return materialInventoryApi.update(editRecord.id, payload as Partial<MaterialInventory>);
      }
      return materialInventoryApi.create(payload as Partial<MaterialInventory>);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setErr(extractError(e)),
  });

  const set =
    (field: keyof StockForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editRecord ? "Edit Stock Card" : "New Stock Card"}</DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "16px !important" }}
      >
        <TextField
          size="small"
          label="Date"
          type="date"
          value={form.date}
          onChange={set("date")}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        <FormControl fullWidth size="small" disabled={!!editRecord}>
          <InputLabel>Material *</InputLabel>
          <Select
            value={form.materialId}
            label="Material *"
            onChange={(e) => setForm((prev) => ({ ...prev, materialId: e.target.value }))}
          >
            {materials.map((m) => (
              <MenuItem key={m.id} value={String(m.id)}>
                {m.name} ({m.unit})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth size="small">
          <InputLabel>Supplier</InputLabel>
          <Select
            value={form.supplierId}
            label="Supplier"
            onChange={(e) => setForm((prev) => ({ ...prev, supplierId: e.target.value }))}
          >
            <MenuItem value="">— None —</MenuItem>
            {suppliers
              .filter((s) => s.isActive)
              .map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <Box display="flex" gap={2}>
          <TextField
            size="small"
            label="Opening Stock"
            type="number"
            value={form.quantity}
            onChange={set("quantity")}
            inputProps={{ min: 0, step: 0.01 }}
            fullWidth
          />
          <TextField
            size="small"
            label="Delivery"
            type="number"
            value={form.delivery}
            onChange={set("delivery")}
            inputProps={{ min: 0, step: 0.01 }}
            fullWidth
          />
        </Box>
        <Box display="flex" gap={2}>
          <TextField
            size="small"
            label="Batch Number"
            value={form.batchNumber}
            onChange={set("batchNumber")}
            fullWidth
          />
          <TextField
            size="small"
            label="Notes"
            value={form.notes}
            onChange={set("notes")}
            fullWidth
          />
        </Box>
        {err && <Alert severity="error">{err}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.materialId || !form.date || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MaterialInventoryPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(todayStr());
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<MaterialInventory | null>(null);
  const [adjRecord, setAdjRecord] = useState<MaterialInventory | null>(null);
  const [snackMsg, setSnackMsg] = useState("");
  const [snackErr, setSnackErr] = useState("");

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["materials"],
    queryFn: () => materialsApi.list().then((r) => r.data),
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list().then((r) => r.data),
  });

  const { data: rows = [], isLoading } = useQuery<MaterialInventory[]>({
    queryKey: ["material-inventory", filterDate],
    queryFn: () => materialInventoryApi.byDate(filterDate).then((r) => r.data),
    enabled: !!filterDate,
  });

  const initMutation = useMutation({
    mutationFn: () => materialInventoryApi.initDate(filterDate).then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["material-inventory", filterDate] });
      setSnackMsg(`Initialized ${res.created} records for ${filterDate}`);
    },
    onError: (e) => setSnackErr(extractError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => materialInventoryApi.delete(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["material-inventory", filterDate] }),
    onError: (e) => setSnackErr(extractError(e)),
  });

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    let totalClosingCost = 0;
    let totalCostUsed = 0;
    for (const r of rows) {
      const price =
        r.material?.pricePerUnit ??
        materials.find((m) => m.id === r.materialId)?.pricePerUnit ??
        0;
      totalClosingCost += Math.max(0, r.quantity + r.delivery - r.used) * price;
      totalCostUsed += r.used * price;
    }
    return { totalClosingCost, totalCostUsed };
  }, [rows, materials]);

  const columns = useMemo<GridColDef[]>(
    () => [
      {
        field: "material",
        headerName: "Material",
        flex: 1.5,
        minWidth: 130,
        valueGetter: (_v: unknown, row: MaterialInventory) =>
          row.material?.name ?? `#${row.materialId}`,
      },
      {
        field: "unit",
        headerName: "Unit",
        width: 70,
        valueGetter: (_v: unknown, row: MaterialInventory) =>
          row.material?.unit ?? "",
      },
      {
        field: "pricePerUnit",
        headerName: "Price/Unit",
        width: 105,
        headerAlign: "right",
        align: "right",
        valueGetter: (_v: unknown, row: MaterialInventory) =>
          row.material?.pricePerUnit ??
          materials.find((m) => m.id === row.materialId)?.pricePerUnit ??
          0,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" color="text.secondary">
            &#8369;{(params.value as number).toLocaleString()}
          </Typography>
        ),
      },
      {
        field: "quantity",
        headerName: "Opening",
        type: "number",
        width: 90,
        headerAlign: "center",
        align: "center",
      },
      {
        field: "delivery",
        headerName: "Delivery",
        type: "number",
        width: 90,
        headerAlign: "center",
        align: "center",
      },
      {
        field: "used",
        headerName: "Used",
        type: "number",
        width: 80,
        headerAlign: "center",
        align: "center",
        renderCell: (params: GridRenderCellParams) => {
          const used = (params.value as number) ?? 0;
          return (
            <Chip
              label={used}
              size="small"
              color={used > 0 ? "success" : "default"}
              sx={{ fontWeight: 600, minWidth: 40 }}
            />
          );
        },
      },
      {
        field: "closing",
        headerName: "Closing",
        type: "number",
        width: 90,
        headerAlign: "center",
        align: "center",
        valueGetter: (_v: unknown, row: MaterialInventory) =>
          Math.max(0, row.quantity + row.delivery - row.used),
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" fontWeight={700}>
            {params.value as number}
          </Typography>
        ),
      },
      {
        field: "costUsed",
        headerName: "Cost Used",
        width: 115,
        headerAlign: "right",
        align: "right",
        valueGetter: (_v: unknown, row: MaterialInventory) => {
          const price =
            row.material?.pricePerUnit ??
            materials.find((m) => m.id === row.materialId)?.pricePerUnit ??
            0;
          return row.used * price;
        },
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" fontWeight={600} color="success.main">
            &#8369;{(params.value as number).toLocaleString()}
          </Typography>
        ),
      },
      {
        field: "inventoryCost",
        headerName: "Closing Cost",
        width: 130,
        headerAlign: "right",
        align: "right",
        valueGetter: (_v: unknown, row: MaterialInventory) => {
          const price =
            row.material?.pricePerUnit ??
            materials.find((m) => m.id === row.materialId)?.pricePerUnit ??
            0;
          return Math.max(0, row.quantity + row.delivery - row.used) * price;
        },
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" fontWeight={600} color="primary.main">
            &#8369;{(params.value as number).toLocaleString()}
          </Typography>
        ),
      },
      {
        field: "_actions",
        headerName: "",
        width: 100,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MaterialInventory>) => (
          <Box display="flex" gap={0.5}>
            <IconButton
              size="small"
              onClick={() => {
                setEditRecord(params.row);
                setStockDialogOpen(true);
              }}
              title="Edit"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="secondary"
              onClick={() => setAdjRecord(params.row)}
              title="Adjustments"
            >
              <TuneIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => deleteMutation.mutate(params.row.id)}
              disabled={deleteMutation.isPending}
              title="Delete"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materials, deleteMutation.isPending],
  );

  return (
    <AuthGuard>
      <AppLayout title="Material Inventory">
        {/* Date navigation */}
        <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
          <IconButton size="small" onClick={() => setFilterDate(addDays(filterDate, -1))}>
            <ChevronLeftIcon />
          </IconButton>
          <TextField
            size="small"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            sx={{ width: 160 }}
            InputLabelProps={{ shrink: true }}
          />
          <IconButton
            size="small"
            onClick={() => setFilterDate(addDays(filterDate, 1))}
            disabled={filterDate >= todayStr()}
          >
            <ChevronRightIcon />
          </IconButton>
          <Button size="small" variant="outlined" onClick={() => setFilterDate(todayStr())}>
            Today
          </Button>
          <Box flexGrow={1} />
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            disabled={initMutation.isPending}
            onClick={() => initMutation.mutate()}
          >
            {initMutation.isPending ? <CircularProgress size={16} /> : `Init ${filterDate}`}
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditRecord(null);
              setStockDialogOpen(true);
            }}
          >
            New Stock Card
          </Button>
        </Box>

        {/* Summary */}
        {summary && (
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fill, minmax(220px, 1fr))"
            gap={2}
            mb={3}
          >
            {[
              {
                label: "CLOSING INVENTORY VALUE",
                value: `&#8369;${summary.totalClosingCost.toLocaleString()}`,
                color: "primary.main",
              },
              {
                label: "TOTAL COST USED",
                value: `&#8369;${summary.totalCostUsed.toLocaleString()}`,
                color: "success.main",
              },
            ].map(({ label, value, color }) => (
              <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight={600}
                  sx={{ letterSpacing: 0.5 }}
                >
                  {label}
                </Typography>
                <Typography variant="h5" fontWeight={700} color={color} mt={0.25}>
                  {value}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}

        {/* Grid */}
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" gap={2} py={8}>
            <Typography color="text.secondary">
              No stock entries for {filterDate}.
            </Typography>
            <Button
              variant="contained"
              color="secondary"
              disabled={initMutation.isPending}
              onClick={() => initMutation.mutate()}
            >
              {initMutation.isPending ? <CircularProgress size={18} /> : `Initialize ${filterDate}`}
            </Button>
          </Box>
        ) : (
          <DataGrid
            rows={rows}
            columns={columns}
            autoHeight
            disableRowSelectionOnClick
            hideFooter
            density="compact"
            sx={GRID_SX}
          />
        )}

        <Snackbar
          open={!!snackMsg}
          autoHideDuration={4000}
          onClose={() => setSnackMsg("")}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSnackMsg("")} sx={{ width: "100%" }}>
            {snackMsg}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!snackErr}
          autoHideDuration={4000}
          onClose={() => setSnackErr("")}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="error" onClose={() => setSnackErr("")} sx={{ width: "100%" }}>
            {snackErr}
          </Alert>
        </Snackbar>

        <StockCardDialog
          open={stockDialogOpen}
          editRecord={editRecord}
          filterDate={filterDate}
          materials={materials}
          suppliers={suppliers}
          onClose={() => setStockDialogOpen(false)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["material-inventory", filterDate] })
          }
        />

        <AdjustmentsDialog record={adjRecord} onClose={() => setAdjRecord(null)} />
      </AppLayout>
    </AuthGuard>
  );
}
'''

DEST.write_text(content, encoding="utf-8")
print(f"Written {len(content)} chars to {DEST}")
