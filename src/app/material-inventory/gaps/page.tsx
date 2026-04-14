'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { materialInventoryApi, jobsApi } from '@/lib/apiServices';
import type { MaterialGapEntry } from '@/types';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FastForwardIcon from '@mui/icons-material/FastForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function MaterialStockGapsPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const sevenDaysAgo = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  const [startDate, setStartDate] = useState(sevenDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false,
    msg: '',
    severity: 'success',
  });

  const qc = useQueryClient();

  const { data: gapsResult, isLoading, error } = useQuery({
    queryKey: ['material-gaps', startDate, endDate],
    queryFn: () =>
      materialInventoryApi.gaps(startDate, endDate).then((r) => r.data),
    enabled: !!startDate && !!endDate,
  });

  const initTodayMutation = useMutation({
    mutationFn: () => jobsApi.autofillMaterialStock(today).then((r) => r.data),
    onSuccess: (result) => {
      setSnack({
        open: true,
        msg: `Init complete for today: ${result.created} missing stock card${result.created !== 1 ? 's' : ''} created.`,
        severity: 'success',
      });
      qc.invalidateQueries({ queryKey: ['material-gaps'] });
      qc.invalidateQueries({ queryKey: ['material-inventory'] });
    },
    onError: () => {
      setSnack({ open: true, msg: 'Init failed. Check permissions.', severity: 'error' });
    },
  });

  const initDateMutation = useMutation({
    mutationFn: (date: string) => jobsApi.autofillMaterialStock(date).then((r) => r.data),
    onSuccess: (result, date) => {
      setSnack({
        open: true,
        msg: `Init complete for ${date}: ${result.created} stock card${result.created !== 1 ? 's' : ''} created.`,
        severity: 'success',
      });
      qc.invalidateQueries({ queryKey: ['material-gaps'] });
      qc.invalidateQueries({ queryKey: ['material-inventory'] });
    },
    onError: () => {
      setSnack({ open: true, msg: 'Init failed. Check permissions.', severity: 'error' });
    },
  });

  const backfillRangeMutation = useMutation({
    mutationFn: ({ start, end }: { start: string; end: string }) =>
      jobsApi.autofillMaterialStockRange(start, end).then((r) => r.data),
    onSuccess: (result) => {
      setSnack({
        open: true,
        msg: `Backfill complete: ${result.totalCreated} stock card${result.totalCreated !== 1 ? 's' : ''} created across ${result.datesProcessed} day${result.datesProcessed !== 1 ? 's' : ''}.`,
        severity: 'success',
      });
      qc.invalidateQueries({ queryKey: ['material-gaps'] });
      qc.invalidateQueries({ queryKey: ['material-inventory'] });
    },
    onError: () => {
      setSnack({ open: true, msg: 'Backfill failed. Check permissions.', severity: 'error' });
    },
  });

  const isBusy =
    initTodayMutation.isPending ||
    initDateMutation.isPending ||
    backfillRangeMutation.isPending;

  const groupedByDate = (gaps: MaterialGapEntry[]) => {
    const map = new Map<string, MaterialGapEntry[]>();
    for (const gap of gaps) {
      const list = map.get(gap.date) ?? [];
      list.push(gap);
      map.set(gap.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  };

  const missing = gapsResult?.missing ?? [];
  const grouped = groupedByDate(missing);

  return (
    <AuthGuard>
      <AppLayout title="Material Stock — Gap Audit">
        <Box sx={{ p: 3 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <EventBusyIcon sx={{ color: 'warning.main', fontSize: 32 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>
                Material Stock Gap Audit
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Dates where one or more materials are missing a stock card entry
              </Typography>
            </Box>
          </Box>

          {/* Filters */}
          <Paper
            sx={{
              p: 2,
              mb: 3,
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Box
              component="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 14,
              }}
            />
            <Typography variant="body2" color="text.secondary">
              to
            </Typography>
            <Box
              component="input"
              type="date"
              value={endDate}
              max={today}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 14,
              }}
            />

            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<PlayArrowIcon />}
                onClick={() => initTodayMutation.mutate()}
                disabled={isBusy}
              >
                {initTodayMutation.isPending ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  'Init Today'
                )}
              </Button>
              <Tooltip
                title={`Create missing stock cards for every material from ${startDate} to ${endDate}, seeding quantity from the prior day's closing stock`}
              >
                <span>
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<FastForwardIcon />}
                    onClick={() =>
                      backfillRangeMutation.mutate({ start: startDate, end: endDate })
                    }
                    disabled={isBusy || !startDate || !endDate}
                  >
                    {backfillRangeMutation.isPending ? (
                      <>
                        <CircularProgress size={18} color="inherit" sx={{ mr: 1 }} />
                        Backfilling…
                      </>
                    ) : (
                      'Backfill This Range'
                    )}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Paper>

          {/* Progress bar during backfill */}
          {isBusy && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress color="warning" />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {backfillRangeMutation.isPending
                  ? 'Backfilling date range — this may take a moment…'
                  : 'Initialising missing stock cards…'}
              </Typography>
            </Box>
          )}

          {/* Summary chip */}
          {!isLoading && gapsResult && (
            <Box sx={{ mb: 2 }}>
              {missing.length === 0 ? (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="No gaps found — all materials have stock cards for this period."
                  color="success"
                  variant="outlined"
                />
              ) : (
                <Chip
                  icon={<EventBusyIcon />}
                  label={`${missing.length} missing stock card${missing.length === 1 ? '' : 's'} across ${grouped.length} date${grouped.length === 1 ? '' : 's'}`}
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
          )}

          {/* Loading / error */}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load gap data. Please try again.
            </Alert>
          )}

          {/* Gaps table */}
          {!isLoading && !error && missing.length > 0 && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell>
                      <strong>Date</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Material</strong>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="text"
                        color="warning"
                        onClick={() =>
                          backfillRangeMutation.mutate({ start: startDate, end: endDate })
                        }
                        disabled={isBusy}
                      >
                        Fill All Gaps
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {grouped.map(([date, entries]) =>
                    entries.map((entry, idx) => (
                      <TableRow
                        key={`${entry.materialId}-${entry.date}`}
                        sx={{ bgcolor: '#fff8e1' }}
                      >
                        {idx === 0 ? (
                          <TableCell
                            rowSpan={entries.length}
                            sx={{ verticalAlign: 'top', fontWeight: 600 }}
                          >
                            {dayjs(date).format('ddd, MMM D, YYYY')}
                          </TableCell>
                        ) : null}
                        <TableCell>{entry.materialName}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={() => initDateMutation.mutate(entry.date)}
                            disabled={isBusy}
                          >
                            Fill
                          </Button>
                        </TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Empty state */}
          {!isLoading && !error && missing.length === 0 && (
            <Paper sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
              <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
              <Typography variant="h6">All entries accounted for</Typography>
              <Typography variant="body2">
                No missing stock cards in the selected range.
              </Typography>
            </Paper>
          )}
        </Box>

        <Snackbar
          open={snack.open}
          autoHideDuration={5000}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={snack.severity}
            onClose={() => setSnack((s) => ({ ...s, open: false }))}
          >
            {snack.msg}
          </Alert>
        </Snackbar>
      </AppLayout>
    </AuthGuard>
  );
}
