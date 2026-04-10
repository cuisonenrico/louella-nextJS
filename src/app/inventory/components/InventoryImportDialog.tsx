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
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { inventoryImportApi } from '@/lib/apiServices';
import type { Branch, InventoryImportResult, SheetImportResult } from '@/types';

interface InventoryImportDialogProps {
  branches: Branch[];
  onClose: () => void;
  onImported: () => void;
}

export default function InventoryImportDialog({ branches, onClose, onImported }: InventoryImportDialogProps) {
  const [branchId, setBranchId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: () => inventoryImportApi.importFile(file!, parseInt(branchId)).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      onImported();
    },
  });

  const canSubmit = !!file && !!branchId && !importMutation.isPending && !result;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Inventory from XLSX</DialogTitle>
      <DialogContent>
        {result ? (
          <Box>
            <Alert
              severity={result.summary.totalErrors > 0 ? 'warning' : 'success'}
              sx={{ mb: 2 }}
            >
              Imported {result.summary.totalProcessed} records across {result.summary.totalSheets} sheet
              {result.summary.totalSheets !== 1 ? 's' : ''}.
              {result.summary.totalSkipped > 0 && (
                <> {result.summary.totalSkipped} product{result.summary.totalSkipped !== 1 ? 's' : ''} not matched (see details below).</>
              )}
            </Alert>
            {result.sheets.map((sheet: SheetImportResult) => (
              <Box key={sheet.sheetName} mb={1}>
                <Typography variant="body2" fontWeight={600}>
                  {sheet.sheetName} &mdash; {sheet.date} &mdash; {sheet.processed} records
                  {sheet.skipped > 0 && (
                    <Typography component="span" variant="body2" color="warning.main">
                      {' '}({sheet.skipped} skipped)
                    </Typography>
                  )}
                </Typography>
                {sheet.errors.length > 0 && (
                  <Box pl={1}>
                    {sheet.errors.map((e, i) => (
                      <Typography key={i} variant="caption" color="text.secondary" display="block">
                        &bull; {e}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            {importMutation.isError && (
              <Alert severity="error">
                {(importMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Import failed.'}
              </Alert>
            )}
            <FormControl size="small" fullWidth required>
              <InputLabel>Branch</InputLabel>
              <Select
                label="Branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
                fullWidth
              >
                {file ? file.name : 'Choose XLSX File'}
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!result && (
          <Button
            variant="contained"
            onClick={() => importMutation.mutate()}
            disabled={!canSubmit}
            startIcon={importMutation.isPending ? <CircularProgress size={16} /> : <UploadFileIcon />}
          >
            {importMutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
