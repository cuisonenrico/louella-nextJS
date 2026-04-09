'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryImportApi } from '@/lib/apiServices';
import type { Branch, InventoryImportResult, ParsedWorkbook } from '@/types';

const STEPS = ['Upload & Preview', 'Confirm & Import'];

export default function InventoryImportPage() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [branchId, setBranchId] = useState('');
  const [preview, setPreview] = useState<ParsedWorkbook | null>(null);
  const [importResult, setImportResult] = useState<InventoryImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const previewMutation = useMutation({
    mutationFn: (f: File) => inventoryImportApi.preview(f).then((r) => r.data),
    onSuccess: (data) => {
      setPreview(data);
      setStep(1);
    },
  });

  const importMutation = useMutation({
    mutationFn: () =>
      inventoryImportApi.importFile(file!, parseInt(branchId)).then((r) => r.data),
    onSuccess: (data) => {
      setImportResult(data);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setImportResult(null);
    setStep(0);
  };

  const handlePreview = () => {
    if (!file) return;
    previewMutation.mutate(file);
  };

  const handleImport = () => {
    if (!file || !branchId) return;
    importMutation.mutate();
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setImportResult(null);
    setStep(0);
    setBranchId('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <AuthGuard>
      <AppLayout title="Inventory Import">
        <Stepper activeStep={step} sx={{ mb: 4, maxWidth: 480 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0 — Upload */}
        {step === 0 && (
          <Box display="flex" flexDirection="column" gap={3} maxWidth={480}>
            <Paper
              variant="outlined"
              sx={{
                p: 4,
                borderRadius: 2,
                borderStyle: 'dashed',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                bgcolor: file ? 'success.50' : undefined,
                borderColor: file ? 'success.main' : 'divider',
              }}
              onClick={() => fileRef.current?.click()}
            >
              <UploadFileIcon sx={{ fontSize: 48, color: file ? 'success.main' : 'text.disabled' }} />
              {file ? (
                <>
                  <Typography fontWeight={700} color="success.main">
                    {file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(file.size / 1024).toFixed(1)} KB · Click to change
                  </Typography>
                </>
              ) : (
                <>
                  <Typography fontWeight={600}>Click to select an Excel file</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Supports .xlsx and .xls
                  </Typography>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={handleFileChange}
              />
            </Paper>

            {previewMutation.isError && (
              <Alert severity="error">Failed to parse file. Check the format.</Alert>
            )}

            <Button
              variant="contained"
              size="large"
              disabled={!file || previewMutation.isPending}
              onClick={handlePreview}
              startIcon={
                previewMutation.isPending ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <UploadFileIcon />
                )
              }
            >
              {previewMutation.isPending ? 'Parsing…' : 'Preview'}
            </Button>
          </Box>
        )}

        {/* Step 1 — Preview + Confirm */}
        {step === 1 && preview && !importResult && (
          <Box display="flex" flexDirection="column" gap={3}>
            <Alert severity="info" sx={{ maxWidth: 600 }}>
              Found <strong>{preview.sheets.length} sheet(s)</strong> with{' '}
              <strong>
                {preview.sheets.reduce((s, sh) => s + sh.rows.length, 0)} data rows
              </strong>{' '}
              in <strong>{file?.name}</strong>.
            </Alert>

            {/* Sheet summary table */}
            <Paper variant="outlined" sx={{ maxWidth: 600, borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.100' } }}>
                    <TableCell>Sheet</TableCell>
                    <TableCell align="right">Rows</TableCell>
                    <TableCell>Sample Columns</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.sheets.map((sh) => (
                    <TableRow key={sh.name} sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell sx={{ fontWeight: 500 }}>{sh.name}</TableCell>
                      <TableCell align="right">
                        <Chip label={sh.rows.length} size="small" color="primary" />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {sh.rows[0]
                          ? Object.keys(sh.rows[0]).slice(0, 4).join(', ')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            {/* Branch selector for import */}
            <Box display="flex" gap={2} alignItems="center" maxWidth={480}>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>Target Branch</InputLabel>
                <Select
                  value={branchId}
                  label="Target Branch"
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <MenuItem value="" disabled>Select branch</MenuItem>
                  {branches.map((b: Branch) => (
                    <MenuItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {importMutation.isError && (
              <Alert severity="error" sx={{ maxWidth: 600 }}>
                Import failed. Please check the file format and try again.
              </Alert>
            )}

            <Box display="flex" gap={2}>
              <Button variant="outlined" onClick={handleReset}>
                Start Over
              </Button>
              <Button
                variant="contained"
                color="success"
                disabled={!branchId || importMutation.isPending}
                onClick={handleImport}
                startIcon={
                  importMutation.isPending ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <CheckCircleIcon />
                  )
                }
              >
                {importMutation.isPending ? 'Importing…' : 'Confirm Import'}
              </Button>
            </Box>
          </Box>
        )}

        {/* Import result */}
        {importResult && (
          <Box display="flex" flexDirection="column" gap={3} maxWidth={560}>
            <Alert severity="success" icon={<CheckCircleIcon />}>
              Import complete!{' '}
              <strong>{importResult.summary.totalProcessed}</strong> records processed across{' '}
              <strong>{importResult.summary.totalSheets}</strong> sheet(s).
            </Alert>

            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.100' } }}>
                    <TableCell>Sheet</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Processed</TableCell>
                    <TableCell align="right">Skipped</TableCell>
                    <TableCell align="right">Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {importResult.sheets.map((sh) => (
                    <TableRow key={sh.sheetName} sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell>{sh.sheetName}</TableCell>
                      <TableCell>{sh.date}</TableCell>
                      <TableCell align="right">
                        <Chip label={sh.processed} size="small" color="success" />
                      </TableCell>
                      <TableCell align="right">
                        <Chip label={sh.skipped} size="small" color="default" />
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={sh.errors.length}
                          size="small"
                          color={sh.errors.length > 0 ? 'error' : 'default'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Button variant="outlined" onClick={handleReset}>
              Import Another File
            </Button>
          </Box>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
