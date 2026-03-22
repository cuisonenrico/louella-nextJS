'use client';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
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
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, salesApi } from '@/lib/apiServices';
import type { Branch, SaleRecord, SaleSummary } from '@/types';

export default function SalesPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');

  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [viewMode, setViewMode] = useState<'detail' | 'summary'>('detail');
  const [error, setError] = useState('');

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const salesQuery = useQuery<SaleRecord[]>({
    queryKey: ['sales', branchId, startDate, endDate, viewMode],
    queryFn: async () => {
      if (!branchId) return [];
      setError('');
      try {
        const r = await salesApi.byBranchRange(
          parseInt(branchId),
          startDate,
          endDate
        );
        return r.data;
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Failed to load sales.';
        setError(msg);
        return [];
      }
    },
    enabled: !!branchId,
  });

  const summaryQuery = useQuery<SaleSummary[]>({
    queryKey: ['sales-summary', branchId, startDate, endDate],
    queryFn: async () => {
      if (!branchId) return [];
      const r = await salesApi.summary(parseInt(branchId), startDate, endDate);
      return r.data;
    },
    enabled: !!branchId && viewMode === 'summary',
  });

  const records = salesQuery.data ?? [];
  const summaries = summaryQuery.data ?? [];
  const isLoading = salesQuery.isLoading || summaryQuery.isLoading;

  // Aggregate totals from detail records
  const totalSold = records.reduce((s, r) => s + r.sold, 0);
  const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);
  const totalDelivery = records.reduce((s, r) => s + r.delivery, 0);

  return (
    <AuthGuard>
      <AppLayout title="Sales">
        {/* Filters */}
        <Box display="flex" gap={2} alignItems="center" mb={3} flexWrap="wrap">
          <FormControl size="small" required sx={{ minWidth: 180 }}>
            <InputLabel>Branch</InputLabel>
            <Select
              value={branchId}
              label="Branch"
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>View</InputLabel>
            <Select
              value={viewMode}
              label="View"
              onChange={(e) =>
                setViewMode(e.target.value as 'detail' | 'summary')
              }
            >
              <MenuItem value="detail">By Product</MenuItem>
              <MenuItem value="summary">Daily Summary</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Stats row */}
        {branchId && !isLoading && records.length > 0 && (
          <Box display="grid" gridTemplateColumns="repeat(3, 1fr)" gap={2} mb={3}>
            {[
              { label: 'Total Sold', value: totalSold.toString(), unit: 'pcs' },
              { label: 'Total Revenue', value: `₱${totalRevenue.toFixed(2)}` },
              {
                label: 'Delivery Rate',
                value: totalDelivery
                  ? `${((totalSold / totalDelivery) * 100).toFixed(1)}%`
                  : '—',
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent sx={{ py: '12px !important' }}>
                  <Typography variant="caption" color="text.secondary">
                    {stat.label}
                  </Typography>
                  <Typography variant="h5" fontWeight={800} mt={0.25}>
                    {stat.value}
                    {stat.unit && (
                      <Typography component="span" variant="body2" ml={0.5} color="text.secondary">
                        {stat.unit}
                      </Typography>
                    )}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        {!branchId ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            mt={8}
            color="text.secondary"
            gap={1}
          >
            <TrendingUpIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            <Typography>Select a branch to view sales data.</Typography>
          </Box>
        ) : isLoading ? (
          <Box display="flex" justifyContent="center" mt={8}>
            <CircularProgress />
          </Box>
        ) : viewMode === 'detail' ? (
          <Paper>
            <TableContainer>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Delivery</TableCell>
                    <TableCell align="right">Leftover</TableCell>
                    <TableCell align="right">Reject</TableCell>
                    <TableCell align="right">Sold</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          No sales records for the selected period.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((rec, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          {dayjs(rec.date).format('MMM D, YYYY')}
                        </TableCell>
                        <TableCell>
                          <Typography fontWeight={600}>{rec.productName}</Typography>
                        </TableCell>
                        <TableCell align="right">{rec.delivery}</TableCell>
                        <TableCell align="right">{rec.leftover}</TableCell>
                        <TableCell align="right">{rec.reject}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={rec.sold}
                            size="small"
                            color={rec.sold > 0 ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={600}>
                            ₱{rec.revenue.toFixed(2)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ) : (
          <Paper>
            <TableContainer>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Total Sold</TableCell>
                    <TableCell align="right">Total Revenue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summaries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">No data.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    summaries.map((s, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          {dayjs(s.date).format('dddd, MMM D, YYYY')}
                        </TableCell>
                        <TableCell align="right">{s.totalSold}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          ₱{s.totalRevenue.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
