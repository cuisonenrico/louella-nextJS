'use client';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi } from '@/lib/apiServices';
import type { Branch, InventoryDashboardData, InventoryGapsResult, ProductType } from '@/types';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import StorefrontIcon from '@mui/icons-material/Storefront';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EventBusyIcon from '@mui/icons-material/EventBusy';

const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Miscellaneous',
};

const TYPE_COLORS: Record<ProductType, string> = {
  BREAD: '#FA8128',
  CAKE: '#e91e63',
  SPECIAL: '#6B3FA0',
  MISCELLANEOUS: '#607d8b',
};

function StatCard({
  label,
  value,
  color,
  icon,
  big,
  loading,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
  big?: boolean;
  loading?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Typography>
      </Box>
      {loading ? (
        <Skeleton width={80} height={big ? 48 : 36} />
      ) : (
        <Typography variant={big ? 'h4' : 'h5'} fontWeight={800} color={color}>
          {value}
        </Typography>
      )}
    </Paper>
  );
}

function RevenueByTypeCard({
  revenueByType,
  totalRevenue,
  loading,
}: {
  revenueByType: Record<ProductType, number> | undefined;
  totalRevenue: number;
  loading: boolean;
}) {
  const types: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>
          Revenue by Type
        </Typography>
        {loading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} height={32} sx={{ mb: 1 }} />)
        ) : (
          types.map((type) => {
            const rev = revenueByType?.[type] ?? 0;
            const pct = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
            return (
              <Box key={type} mb={1.5}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: TYPE_COLORS[type],
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" fontWeight={500}>
                      {TYPE_LABELS[type]}
                    </Typography>
                  </Box>
                  <Typography variant="body2" fontWeight={700}>
                    {'\u20B1'}{rev.toLocaleString()}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: 'grey.100',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${pct}%`,
                      bgcolor: TYPE_COLORS[type],
                      borderRadius: 3,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </Box>
              </Box>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function InventoryDashboardPage() {
  const router = useRouter();
  const today = dayjs().format('YYYY-MM-DD');
  const [filterDate, setFilterDate] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState('');
  const [rangeMode, setRangeMode] = useState(false);
  const [filterBranch, setFilterBranch] = useState('');

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const endDate = rangeMode && filterDateTo ? filterDateTo : filterDate;

  const sevenDaysAgo = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  const { data: gapsResult } = useQuery<InventoryGapsResult | null>({
    queryKey: ['inventory-gaps-coverage', filterBranch],
    queryFn: () =>
      inventoryApi
        .gaps(sevenDaysAgo, today, filterBranch ? Number(filterBranch) : undefined)
        .then((r) => r.data),
  });

  const missingCount = gapsResult?.missing.length ?? 0;

  const { data: summary, isLoading, isError } = useQuery<InventoryDashboardData | null>({
    queryKey: ['inventory-dashboard', filterBranch, filterDate, endDate],
    queryFn: () =>
      inventoryApi
        .dashboard(filterDate, endDate, filterBranch || undefined)
        .then((r) => r.data),
  });

  const hasData = summary && summary.totalSold > 0;

  return (
    <AuthGuard>
      <AppLayout title="Inventory">
        {/* Header row */}
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={2} mb={3}>
          <Box>
            <Typography variant="h5" fontWeight={800}>
              Inventory Dashboard
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Daily sales and revenue summary
            </Typography>
          </Box>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={() => router.push('/inventory/details')}
            sx={{ fontWeight: 700, borderRadius: 2, whiteSpace: 'nowrap' }}
          >
            In-depth Inventory Details
          </Button>
        </Box>

        {/* Filter bar */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <Box display="flex" alignItems="center" gap={1}>
              <CalendarTodayIcon fontSize="small" color="action" />
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                {rangeMode ? 'FROM' : 'DATE'}
              </Typography>
            </Box>
            <input
              type="date"
              value={filterDate}
              max={rangeMode && filterDateTo ? filterDateTo : today}
              onChange={(e) => setFilterDate(e.target.value || today)}
              style={{
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            />
            {rangeMode && (
              <>
                <Typography variant="body2" color="text.secondary">&mdash;</Typography>
                <Typography variant="body2" fontWeight={600} color="text.secondary">
                  TO
                </Typography>
                <input
                  type="date"
                  value={filterDateTo}
                  min={filterDate}
                  max={today}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                />
              </>
            )}
            <Button
              size="small"
              variant={rangeMode ? 'contained' : 'outlined'}
              onClick={() => {
                setRangeMode((v) => !v);
                setFilterDateTo('');
              }}
              sx={{ borderRadius: 2, fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              {rangeMode ? 'Date Range On' : 'Date Range'}
            </Button>
            <Divider orientation="vertical" flexItem />
            <Box display="flex" alignItems="center" gap={1}>
              <StorefrontIcon fontSize="small" color="action" />
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                BRANCH
              </Typography>
            </Box>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>All Branches</InputLabel>
              <Select
                value={filterBranch}
                label="All Branches"
                onChange={(e) => setFilterBranch(e.target.value)}
              >
                <MenuItem value="">All Branches</MenuItem>
                {branches.map((b) => (
                  <MenuItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Paper>

        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            Failed to load inventory summary.
          </Alert>
        )}

        {/* Revenue stat cards */}
        <Grid container spacing={2} mb={3}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Total Revenue"
              value={summary ? `\u20B1${summary.totalRevenue.toLocaleString()}` : '\u20B10'}
              color="#2e7d32"
              icon={<TrendingUpIcon />}
              big
              loading={isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Units Sold"
              value={summary?.totalSold ?? 0}
              color="#1565c0"
              icon={<InventoryIcon />}
              loading={isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Delivered"
              value={summary?.totalDelivery ?? 0}
              color="#FA8128"
              icon={<LocalShippingIcon />}
              loading={isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Leftover"
              value={summary?.totalLeftover ?? 0}
              color="#f57f17"
              icon={<WarningAmberIcon />}
              loading={isLoading}
            />
          </Grid>
        </Grid>

        {/* Coverage card (last 7 days gap count) */}
        <Box mb={3}>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              bgcolor: missingCount > 0 ? '#fff8e1' : undefined,
              borderColor: missingCount > 0 ? 'warning.main' : undefined,
            }}
          >
            <EventBusyIcon sx={{ color: missingCount > 0 ? 'warning.main' : 'success.main', fontSize: 32 }} />
            <Box flexGrow={1}>
              <Typography variant="subtitle2" fontWeight={700}>
                Coverage (last 7 days)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {missingCount === 0
                  ? 'All inventory entries are present — no gaps detected.'
                  : `${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'} detected in the last 7 days.`}
              </Typography>
            </Box>
            {missingCount > 0 && (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                href="/inventory/gaps"
                endIcon={<ArrowForwardIcon />}
              >
                View Gaps
              </Button>
            )}
          </Paper>
        </Box>

        {/* Middle row */}
        <Grid container spacing={2} mb={3}>
          {/* Revenue by type */}
          <Grid size={{ xs: 12, md: 5 }}>
            <RevenueByTypeCard
              revenueByType={summary?.revenueByType}
              totalRevenue={summary?.totalRevenue ?? 0}
              loading={isLoading}
            />
          </Grid>

          {/* Top product + rejects/zero sales */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Box display="flex" flexDirection="column" gap={2} height="100%">
              {/* Top product */}
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                    <EmojiEventsIcon sx={{ color: '#fbc02d' }} />
                    <Typography variant="subtitle1" fontWeight={700}>
                      Top Product
                    </Typography>
                  </Box>
                  {isLoading ? (
                    <Skeleton height={48} />
                  ) : summary?.topProduct ? (
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="h6" fontWeight={800}>
                          {summary.topProduct.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {summary.topProduct.sold} units sold
                        </Typography>
                      </Box>
                      <Typography variant="h5" fontWeight={800} color="success.main">
                        {'\u20B1'}{summary.topProduct.revenue.toLocaleString()}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography color="text.secondary" variant="body2">
                      No sales data for this period.
                    </Typography>
                  )}
                </CardContent>
              </Card>

              {/* Reject + Zero sales */}
              <Grid container spacing={2} sx={{ flex: 1 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <BlockIcon color="error" fontSize="small" />
                        <Typography variant="subtitle2" fontWeight={700}>
                          Rejected
                        </Typography>
                      </Box>
                      {isLoading ? (
                        <Skeleton height={40} />
                      ) : (
                        <Typography variant="h4" fontWeight={800} color="error.main">
                          {summary?.totalReject ?? 0}
                          <Typography component="span" variant="body2" color="text.secondary" ml={0.5}>
                            units
                          </Typography>
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      height: '100%',
                      ...(summary?.zeroSales?.length
                        ? { borderColor: 'warning.main' }
                        : {}),
                    }}
                  >
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <WarningAmberIcon
                          fontSize="small"
                          color={summary?.zeroSales?.length ? 'warning' : 'disabled'}
                        />
                        <Typography variant="subtitle2" fontWeight={700}>
                          Zero Sales
                        </Typography>
                        {!!summary?.zeroSales?.length && (
                          <Chip
                            label={summary.zeroSales.length}
                            size="small"
                            color="warning"
                            sx={{ ml: 'auto' }}
                          />
                        )}
                      </Box>
                      {isLoading ? (
                        <Skeleton height={40} />
                      ) : summary?.zeroSales?.length ? (
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {summary.zeroSales.map((r) => (
                            <Chip
                              key={r.name}
                              label={r.name}
                              size="small"
                              color="warning"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="success.main" fontWeight={600}>
                          All products sold
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          </Grid>
        </Grid>

        {/* Daily breakdown (range mode) */}
        {!isLoading && !isError && summary?.isRange && summary.dailyBreakdown.length > 0 && (
          <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                Daily Breakdown
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee' }}>
                      {['Date', 'Revenue', 'Sold', 'Delivered', 'Leftover'].map((h) => (
                        <th key={h} style={{ textAlign: h === 'Date' ? 'left' : 'right', padding: '6px 12px', fontWeight: 700, color: '#555' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.dailyBreakdown.map((row, i) => (
                      <tr key={row.date} style={{ background: i % 2 === 0 ? '#fafafa' : '#fff', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{dayjs(row.date).format('MMM D, YYYY')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#2e7d32', fontWeight: 700 }}>&#8369;{row.revenue.toLocaleString()}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>{row.sold}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>{row.delivery}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>{row.leftover}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!isLoading && !isError && !hasData && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            No inventory records found for{' '}
            {summary?.isRange
              ? <><strong>{dayjs(filterDate).format('MMM D')}</strong> &ndash; <strong>{dayjs(endDate).format('MMM D, YYYY')}</strong></>
              : <strong>{dayjs(filterDate).format('MMMM D, YYYY')}</strong>}
            {filterBranch
              ? ` at ${branches.find((b) => String(b.id) === filterBranch)?.name ?? 'selected branch'}`
              : ''}.
            Use <strong>In-depth Inventory Details</strong> to initialise records.
          </Alert>
        )}
      </AppLayout>
    </AuthGuard>
  );
}
