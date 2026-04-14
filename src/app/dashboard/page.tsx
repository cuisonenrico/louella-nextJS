'use client';

import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import CategoryIcon from '@mui/icons-material/Category';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ScienceIcon from '@mui/icons-material/Science';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { dashboardApi } from '@/lib/apiServices';
import type { DashboardSummary } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Misc',
};

export default function DashboardPage() {
  const today = dayjs().format('YYYY-MM-DD');

  const { data, isLoading, isError } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', today],
    queryFn: () => dashboardApi.summary(today).then((r) => r.data),
  });

  return (
    <AuthGuard>
      <AppLayout title="Dashboard">
        <Box mb={3}>
          <Typography variant="h5" fontWeight={700}>
            Welcome back 👋
          </Typography>
          <Typography color="text.secondary">
            {dayjs().format('dddd, MMMM D, YYYY')}
          </Typography>
        </Box>

        {isLoading ? (
          <Box display="flex" justifyContent="center" mt={8}>
            <CircularProgress />
          </Box>
        ) : isError || !data ? (
          <Alert severity="error">Failed to load dashboard data.</Alert>
        ) : (
          <>
            {/* ── Stat Cards ── */}
            <Grid container spacing={3} mb={4}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Total Products"
                  value={data.stats.products.total}
                  icon={<CategoryIcon />}
                  color="#6B3FA0"
                  subtitle={`${data.stats.products.active} active`}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Branches"
                  value={data.stats.branches.total}
                  icon={<StorefrontIcon />}
                  color="#F4A261"
                  subtitle={`${data.stats.branches.active} active`}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Materials"
                  value={data.stats.materials.total}
                  icon={<ScienceIcon />}
                  color="#2e7d32"
                  subtitle="in inventory"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Recipes"
                  value={data.stats.recipes.total}
                  icon={<MenuBookIcon />}
                  color="#d32f2f"
                  subtitle="configured"
                />
              </Grid>
            </Grid>

            {/* ── Operational Sections ── */}
            <Grid container spacing={3} mb={4}>
              {/* Low Stock Alerts */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card
                  sx={{
                    border: data.lowStock.length > 0 ? '1.5px solid' : undefined,
                    borderColor: 'error.main',
                  }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <WarningAmberIcon color={data.lowStock.length > 0 ? 'error' : 'disabled'} />
                      <Typography variant="h6">Low Stock Alerts</Typography>
                      {data.lowStock.length > 0 && (
                        <Chip label={data.lowStock.length} color="error" size="small" />
                      )}
                    </Box>

                    {data.lowStock.length === 0 ? (
                      <Alert severity="success" sx={{ mt: 1 }}>
                        All materials are above their reorder levels.
                      </Alert>
                    ) : (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Material</TableCell>
                            <TableCell align="right">Stock</TableCell>
                            <TableCell align="right">Reorder At</TableCell>
                            <TableCell>Unit</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.lowStock.map((m) => (
                            <TableRow key={m.id} hover>
                              <TableCell sx={{ fontWeight: 500 }}>{m.name}</TableCell>
                              <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                                {m.currentStock}
                              </TableCell>
                              <TableCell align="right">{m.reorderLevel}</TableCell>
                              <TableCell>{m.unit}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Today's Production Summary */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <PrecisionManufacturingIcon color="primary" />
                      <Typography variant="h6">Today&apos;s Production</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        {today}
                      </Typography>
                    </Box>

                    {data.production.totalYield === 0 ? (
                      <Alert severity="info">
                        No production records found for today.
                      </Alert>
                    ) : (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell align="right">Total Yield</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.production.byType.map(({ type, totalYield }) => (
                            <TableRow key={type} hover>
                              <TableCell>
                                <Chip
                                  label={TYPE_LABELS[type] ?? type}
                                  size="small"
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>
                                {totalYield.toLocaleString()} pcs
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {data.production.totalYield.toLocaleString()} pcs
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* ── Products & Branches Detail ── */}
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" mb={2}>
                      Products
                    </Typography>
                    {data.products.map((p) => (
                      <Box
                        key={p.id}
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        py={0.75}
                        borderBottom="1px solid"
                        sx={{ borderColor: 'divider' }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {p.name}
                          </Typography>
                          <Chip
                            label={p.type}
                            size="small"
                            sx={{ fontSize: '0.65rem', height: 18, mt: 0.25 }}
                          />
                        </Box>
                        <Box textAlign="right">
                          <Typography variant="body2" fontWeight={700}>
                            ₱{p.price.toFixed(2)}
                          </Typography>
                          <Chip
                            label={p.isActive ? 'Active' : 'Inactive'}
                            size="small"
                            color={p.isActive ? 'success' : 'default'}
                            sx={{ fontSize: '0.65rem', height: 18 }}
                          />
                        </Box>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" mb={2}>
                      Branches
                    </Typography>
                    {data.branches.map((b) => (
                      <Box
                        key={b.id}
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        py={0.75}
                        borderBottom="1px solid"
                        sx={{ borderColor: 'divider' }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {b.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {b.address ?? 'No address'}
                          </Typography>
                        </Box>
                        <Chip
                          label={b.isActive ? 'Active' : 'Inactive'}
                          size="small"
                          color={b.isActive ? 'success' : 'default'}
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </>
        )}
      </AppLayout>
    </AuthGuard>
  );
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={800}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              bgcolor: `${color}18`,
              color,
              borderRadius: 3,
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
