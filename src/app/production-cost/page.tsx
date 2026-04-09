'use client';

import {
  Alert,
  Box,
  Card,
  CardContent,
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
  Typography,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, productionApi } from '@/lib/apiServices';
import type { Branch, ConsumptionSummary } from '@/types';

export default function ProductionCostPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState('');

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const summaryQuery = useQuery<ConsumptionSummary>({
    queryKey: ['production-cost-summary', date, branchId],
    queryFn: () =>
      productionApi
        .consumptionSummary(date, branchId ? parseInt(branchId) : undefined)
        .then((r) => r.data),
  });

  const summary = summaryQuery.data;
  const chartData = summary?.items ?? [];

  return (
    <AuthGuard>
      <AppLayout title="Production Cost">
        {/* Filters */}
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" mb={3}>
          <TextField
            size="small"
            type="date"
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Branch</InputLabel>
            <Select
              value={branchId}
              label="Branch"
              onChange={(e) => setBranchId(e.target.value)}
            >
              <MenuItem value="">All Branches</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {summaryQuery.isLoading && (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        )}

        {summaryQuery.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load consumption summary.
          </Alert>
        )}

        {summary && (
          <>
            {/* Grand total card */}
            <Card
              variant="outlined"
              sx={{ mb: 3, borderColor: 'primary.main', maxWidth: 320 }}
            >
              <CardContent>
                <Typography variant="caption" color="text.secondary" fontWeight={700} letterSpacing={1}>
                  GRAND TOTAL MATERIAL COST
                </Typography>
                <Typography variant="h4" fontWeight={800} color="primary" mt={0.5}>
                  ₱{summary.grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {dayjs(date).format('MMMM D, YYYY')}
                  {branchId
                    ? ` · ${branches.find((b) => b.id.toString() === branchId)?.name}`
                    : ' · All Branches'}
                </Typography>
              </CardContent>
            </Card>

            {summary.items.length === 0 ? (
              <Alert severity="info">
                No production records with recipe data found for this date.
              </Alert>
            ) : (
              <>
                {/* Table */}
                <Paper variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.100' } }}>
                        <TableCell>Material</TableCell>
                        <TableCell align="right">Consumed</TableCell>
                        <TableCell align="center">Unit</TableCell>
                        <TableCell align="right">Total Cost</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.items
                        .slice()
                        .sort((a, b) => b.totalCost - a.totalCost)
                        .map((item) => (
                          <TableRow
                            key={item.materialId}
                            sx={{ '&:last-child td': { border: 0 } }}
                          >
                            <TableCell>{item.materialName}</TableCell>
                            <TableCell align="right">
                              {item.totalConsumed.toLocaleString()}
                            </TableCell>
                            <TableCell align="center">{item.unit}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              ₱{item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))}
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell colSpan={3} sx={{ fontWeight: 700 }}>
                          Total
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                          ₱{summary.grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Paper>

                {/* Bar Chart */}
                {chartData.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} mb={2}>
                      Cost by Material
                    </Typography>
                    <BarChart
                      height={300}
                      xAxis={[
                        {
                          scaleType: 'band',
                          data: chartData
                            .slice()
                            .sort((a, b) => b.totalCost - a.totalCost)
                            .map((i) =>
                              i.materialName.length > 12
                                ? i.materialName.slice(0, 12) + '…'
                                : i.materialName
                            ),
                        },
                      ]}
                      series={[
                        {
                          data: chartData
                            .slice()
                            .sort((a, b) => b.totalCost - a.totalCost)
                            .map((i) => i.totalCost),
                          label: 'Cost (₱)',
                          color: '#FA8128',
                        },
                      ]}
                      margin={{ left: 70, right: 20, bottom: 80, top: 20 }}
                    />
                  </Paper>
                )}
              </>
            )}
          </>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
