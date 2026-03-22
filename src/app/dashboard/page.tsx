'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import CategoryIcon from '@mui/icons-material/Category';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ScienceIcon from '@mui/icons-material/Science';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, materialsApi, productsApi, recipesApi } from '@/lib/apiServices';
import type { Branch, Material, Product, Recipe } from '@/types';

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

export default function DashboardPage() {
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

  const isLoading =
    loadingProducts || loadingBranches || loadingMaterials || loadingRecipes;

  const activeProducts = products?.filter((p) => p.isActive).length ?? 0;
  const activeBranches = branches?.filter((b) => b.isActive).length ?? 0;

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
        ) : (
          <>
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

            <Grid container spacing={3}>
              {/* Recent Products */}
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

              {/* Branches */}
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
