'use client';

import {
  Alert,
  Box,
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
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { PieChart } from '@mui/x-charts/PieChart';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, productionApi } from '@/lib/apiServices';
import type { Branch, ProductionEfficiencyItem, ProductType } from '@/types';

const TYPE_COLORS: Record<ProductType, string> = {
  BREAD: '#FA8128',
  CAKE: '#e91e63',
  SPECIAL: '#9c27b0',
  MISCELLANEOUS: '#607d8b',
};

function wasteColor(rate: number): 'success' | 'warning' | 'error' {
  if (rate > 0.25) return 'error';
  if (rate > 0.15) return 'warning';
  return 'success';
}

function rowBg(rate: number): string | undefined {
  if (rate > 0.25) return 'rgba(244,67,54,0.07)';
  if (rate > 0.15) return 'rgba(255,167,38,0.09)';
  return undefined;
}

export default function ProductionEfficiencyPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [branchId, setBranchId] = useState('');

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const effQuery = useQuery<ProductionEfficiencyItem[]>({
    queryKey: ['production-efficiency', startDate, endDate, branchId],
    queryFn: () =>
      productionApi
        .efficiency(startDate, endDate, branchId ? parseInt(branchId) : undefined)
        .then((r) => r.data),
    enabled: !!startDate && !!endDate,
  });

  const items = effQuery.data ?? [];

  // Pie chart data — aggregate by type: sold vs leftover vs reject
  const pieData = useMemo(() => {
    const agg: Record<string, { sold: number; leftover: number; reject: number }> = {};
    for (const item of items) {
      const t = item.productType;
      if (!agg[t]) agg[t] = { sold: 0, leftover: 0, reject: 0 };
      agg[t].sold += item.sold;
      agg[t].leftover += item.totalLeftover;
      agg[t].reject += item.totalReject;
    }
    return Object.entries(agg).flatMap(([type, vals]) => [
      { id: `${type}-sold`, label: `${type} Sold`, value: vals.sold, color: TYPE_COLORS[type as ProductType] ?? '#888' },
      { id: `${type}-leftover`, label: `${type} L/O`, value: vals.leftover, color: `${TYPE_COLORS[type as ProductType] ?? '#888'}88` },
      { id: `${type}-reject`, label: `${type} Rej`, value: vals.reject, color: '#ccc' },
    ]).filter((d) => d.value > 0);
  }, [items]);

  return (
    <AuthGuard>
      <AppLayout title="Production Efficiency">
        {/* Filters */}
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" mb={3}>
          <TextField
            size="small" label="Start Date" type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <TextField
            size="small" label="End Date" type="date" value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Branch</InputLabel>
            <Select value={branchId} label="Branch" onChange={(e) => setBranchId(e.target.value)}>
              <MenuItem value="">All Branches</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id.toString()}>{b.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {effQuery.isLoading && (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        )}

        {effQuery.isError && (
          <Alert severity="error">Failed to load efficiency data.</Alert>
        )}

        {!effQuery.isLoading && items.length === 0 && !effQuery.isError && (
          <Alert severity="info">No production data for the selected period.</Alert>
        )}

        {items.length > 0 && (
          <>
            {/* Legend */}
            <Box display="flex" gap={1} mb={2} flexWrap="wrap">
              <Chip size="small" label="Waste > 25%" sx={{ bgcolor: 'rgba(244,67,54,0.12)', color: 'error.dark' }} />
              <Chip size="small" label="Waste > 15%" sx={{ bgcolor: 'rgba(255,167,38,0.12)', color: 'warning.dark' }} />
              <Typography variant="caption" color="text.secondary" alignSelf="center">
                · Rows highlighted by waste rate threshold
              </Typography>
            </Box>

            {/* Efficiency Table */}
            <Paper variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.100' } }}>
                    <TableCell>Product</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Yield</TableCell>
                    <TableCell align="right">Delivered</TableCell>
                    <TableCell align="right">Sold</TableCell>
                    <TableCell align="right">Leftover</TableCell>
                    <TableCell align="right">Reject</TableCell>
                    <TableCell align="right">Sell-Through</TableCell>
                    <TableCell align="right">Waste Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.productId}
                      sx={{ bgcolor: rowBg(item.wasteRate), '&:last-child td': { border: 0 } }}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>{item.productName}</TableCell>
                      <TableCell>
                        <Chip
                          label={item.productType}
                          size="small"
                          sx={{
                            bgcolor: `${TYPE_COLORS[item.productType]}22`,
                            color: TYPE_COLORS[item.productType],
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">{item.totalYield.toLocaleString()}</TableCell>
                      <TableCell align="right">{item.totalDelivered.toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Chip label={item.sold} size="small" color={item.sold > 0 ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell align="right">{item.totalLeftover}</TableCell>
                      <TableCell align="right">{item.totalReject}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={`${(item.soldRate * 100).toFixed(1)}% sold out of delivered`}>
                          <Chip
                            label={`${(item.soldRate * 100).toFixed(0)}%`}
                            size="small"
                            color={item.soldRate >= 0.9 ? 'success' : item.soldRate >= 0.7 ? 'warning' : 'error'}
                            variant="outlined"
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={`${(item.wasteRate * 100).toFixed(1)}% (leftover + reject) / delivered`}>
                          <Chip
                            label={`${(item.wasteRate * 100).toFixed(1)}%`}
                            size="small"
                            color={wasteColor(item.wasteRate)}
                            variant={item.wasteRate > 0.15 ? 'filled' : 'outlined'}
                          />
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            {/* Pie chart — Sold vs Leftover vs Reject by type */}
            {pieData.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} mb={2}>
                  Sold vs Leftover vs Reject by Product Type
                </Typography>
                <PieChart
                  height={300}
                  series={[{
                    data: pieData,
                    arcLabel: (item) =>
                      item.value > 0 ? `${item.value}` : '',
                    arcLabelMinAngle: 20,
                    innerRadius: 40,
                    outerRadius: 120,
                  }]}
                  margin={{ top: 0, right: 160, bottom: 0, left: 0 }}
                />
              </Paper>
            )}
          </>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
