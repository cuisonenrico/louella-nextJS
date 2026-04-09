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
import { branchesApi, materialsApi, productsApi, productionApi, recipesApi } from '@/lib/apiServices';
import type { Branch, Material, Product, Production, Recipe } from '@/types';


// function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
//   return (
//     <Card>
//       <CardContent>
//         <Box display="flex" alignItems="center" justifyContent="space-between">
//           <Box>
//             <Typography variant="body2" color="text.secondary" gutterBottom>
//               {title}
//             </Typography>
//             <Typography variant="h4" fontWeight={800}>
//               {value}
//             </Typography>
//             {subtitle && (
//               <Typography variant="caption" color="text.secondary">
//                 {subtitle}
//               </Typography>
//             )}
//           </Box>
//           <Box
//             sx={{
//               bgcolor: `${color}18`,
//               color,
//               borderRadius: 3,
//               p: 1.5,
//               display: 'flex',
//               alignItems: 'center',
//             }}
//           >
//             {icon}
//           </Box>
//         </Box>
//       </CardContent>
//     </Card>
//   );
// }

const TYPE_LABELS: Record<string, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Misc',
};

export default function DashboardPage() {
  const today = dayjs().format('YYYY-MM-DD');

  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const { data: branches, isLoading: loadingBranches } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: materials, isLoading: loadingMaterials } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then((r) => r.data),
  });

  const { data: recipes, isLoading: loadingRecipes } = useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: () => recipesApi.list().then((r) => r.data),
  });

  const { data: lowStockItems = [], isLoading: loadingLowStock } = useQuery<
    (Material & { currentStock: number })[]
  >({
    queryKey: ['materials-low-stock'],
    queryFn: () => materialsApi.lowStock().then((r) => r.data),
  });

  const { data: todayProduction = [], isLoading: loadingProduction } = useQuery<Production[]>({
    queryKey: ['production-today', today],
    queryFn: () =>
      productionApi.byDateRange(today, today).then((r) => r.data),
  });

  const statsLoading = loadingProducts || loadingBranches || loadingMaterials || loadingRecipes;

  const activeProducts = products?.filter((p) => p.isActive).length ?? 0;
  const activeBranches = branches?.filter((b) => b.isActive).length ?? 0;

  // Aggregate today's yield by product type
  const yieldByType: Record<string, number> = {};
  for (const rec of todayProduction) {
    const type = (rec.product as Product | undefined)?.type ?? 'UNKNOWN';
    yieldByType[type] = (yieldByType[type] ?? 0) + rec.yield;
  }
  const totalYieldToday = Object.values(yieldByType).reduce((s, v) => s + v, 0);

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

        {statsLoading ? (
          <Box display="flex" justifyContent="center" mt={8}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* ── Stat Cards ── */}
            <Grid container spacing={3} mb={4}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Total Products"
                  value={products?.length ?? 0}
                  icon={<CategoryIcon />}
                  color="#6B3FA0"
                  subtitle={`${activeProducts} active`}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Branches"
                  value={branches?.length ?? 0}
                  icon={<StorefrontIcon />}
                  color="#F4A261"
                  subtitle={`${activeBranches} active`}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Materials"
                  value={materials?.length ?? 0}
                  icon={<ScienceIcon />}
                  color="#2e7d32"
                  subtitle="in inventory"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Recipes"
                  value={recipes?.length ?? 0}
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
                    border: lowStockItems.length > 0 ? '1.5px solid' : undefined,
                    borderColor: 'error.main',
                  }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <WarningAmberIcon color={lowStockItems.length > 0 ? 'error' : 'disabled'} />
                      <Typography variant="h6">
                        Low Stock Alerts
                      </Typography>
                      {lowStockItems.length > 0 && (
                        <Chip
                          label={lowStockItems.length}
                          color="error"
                          size="small"
                        />
                      )}
                    </Box>

                    {loadingLowStock ? (
                      <Box display="flex" justifyContent="center" py={2}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : lowStockItems.length === 0 ? (
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
                          {lowStockItems.map((m) => (
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
                      <Typography variant="h6">
                        Today&apos;s Production
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        {today}
                      </Typography>
                    </Box>

                    {loadingProduction ? (
                      <Box display="flex" justifyContent="center" py={2}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : totalYieldToday === 0 ? (
                      <Alert severity="info">
                        No production records found for today.
                      </Alert>
                    ) : (
                      <>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Type</TableCell>
                              <TableCell align="right">Total Yield</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {Object.entries(yieldByType).map(([type, total]) => (
                              <TableRow key={type} hover>
                                <TableCell>
                                  <Chip
                                    label={TYPE_LABELS[type] ?? type}
                                    size="small"
                                    variant="outlined"
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>
                                  {total.toLocaleString()} pcs
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>
                                {totalYieldToday.toLocaleString()} pcs
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </>
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
                    {products?.slice(0, 8).map((p) => (
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
                    {branches?.map((b) => (
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
