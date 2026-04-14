import api from './api';
import type {
  AuthResponse,
  Branch,
  ConsumptionSummary,
  DashboardSummary,
  Inventory,
  InventoryAdjustment,
  InventoryDashboardData,
  InventoryGapsResult,
  InventoryImportResult,
  InventorySummaryData,
  InventoryUpdateResult,
  Material,
  MaterialAdjustment,
  MaterialConsumption,
  MaterialInventory,
  MaterialPriceHistory,
  ParsedWorkbook,
  Product,
  ProductPriceHistory,
  Production,
  ProductionEfficiencyItem,
  Recipe,
  RecipeCost,
  SaleRecord,
  SaleSummary,
  Supplier,
  TransferResult,
  UnitConversion,
  User,
} from '@/types';

// ─── Auth ────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  register: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, password }),
  me: () => api.get<User>('/auth/me'),
  logout: (refreshToken?: string) =>
    api.post('/auth/logout', { refreshToken }),
};

// ─── Suppliers ───────────────────────────────────────────────────
export const suppliersApi = {
  list: () => api.get<Supplier[]>('/suppliers'),
  search: (q: string) =>
    api.get<Supplier[]>('/suppliers/search', { params: { q } }),
  get: (id: number) => api.get<Supplier>(`/suppliers/${id}`),
  create: (data: Partial<Supplier>) =>
    api.post<Supplier>('/suppliers', data),
  update: (id: number, data: Partial<Supplier>) =>
    api.patch<Supplier>(`/suppliers/${id}`, data),
  delete: (id: number) => api.delete(`/suppliers/${id}`),
};

// ─── Products ────────────────────────────────────────────────────
export const productsApi = {
  list: () => api.get<Product[]>('/products'),
  search: (q: string) => api.get<Product[]>('/products/search', { params: { q } }),
  get: (id: number) => api.get<Product>(`/products/${id}`),
  create: (data: Partial<Product>) => api.post<Product>('/products', data),
  update: (id: number, data: Partial<Product>) =>
    api.patch<Product>(`/products/${id}`, data),
  delete: (id: number) => api.delete(`/products/${id}`),
  priceHistory: (id: number) =>
    api.get<ProductPriceHistory[]>(`/products/${id}/price-history`),
};

// ─── Branches ────────────────────────────────────────────────────
export const branchesApi = {
  list: () => api.get<Branch[]>('/branches'),
  search: (q: string) => api.get<Branch[]>('/branches/search', { params: { q } }),
  get: (id: number) => api.get<Branch>(`/branches/${id}`),
  create: (data: Partial<Branch>) => api.post<Branch>('/branches', data),
  update: (id: number, data: Partial<Branch>) =>
    api.patch<Branch>(`/branches/${id}`, data),
  delete: (id: number) => api.delete(`/branches/${id}`),
};

// ─── Inventory ───────────────────────────────────────────────────
export const inventoryApi = {
  list: (page = 1, limit = 50) =>
    api.get<{ data: Inventory[]; total: number }>('/inventory', {
      params: { page, limit },
    }),
  byBranch: (branchId: number, page = 1, limit = 50) =>
    api.get<{ data: Inventory[]; total: number }>(
      `/inventory/branch/${branchId}`,
      { params: { page, limit } }
    ),
  byBranchDate: (branchId: number, date: string) =>
    api.get<Inventory[]>(`/inventory/branch/${branchId}/date`, {
      params: { date },
    }),
  byBranchDateRange: (branchId: number, startDate: string, endDate?: string) =>
    api.get<Inventory[]>(`/inventory/branch/${branchId}/date-range`, {
      params: endDate ? { startDate, endDate } : { startDate },
    }),
  byDateRange: (startDate: string, endDate?: string) =>
    api.get<Inventory[]>('/inventory/date', {
      params: endDate ? { startDate, endDate } : { startDate },
    }),
  get: (id: number) => api.get<Inventory>(`/inventory/${id}`),
  create: (data: Partial<Inventory>) => api.post<Inventory>('/inventory', data),
  createBulk: (data: Partial<Inventory>[]) =>
    api.post<Inventory[]>('/inventory/bulk', data),
  update: (id: number, data: Partial<Inventory>) =>
    api.patch<InventoryUpdateResult>(`/inventory/${id}`, data),
  delete: (id: number) => api.delete(`/inventory/${id}`),
  summary: (startDate?: string, endDate?: string, branchId?: string) =>
    api.get<InventorySummaryData>('/inventory/summary', {
      params: { startDate, endDate, branchId },
    }),
  dashboard: (startDate?: string, endDate?: string, branchId?: string) =>
    api.get<InventoryDashboardData>('/inventory/dashboard', {
      params: { startDate, endDate, branchId },
    }),
  gaps: (startDate: string, endDate: string, branchId?: number) =>
    api.get<InventoryGapsResult>('/inventory/gaps', {
      params: { startDate, endDate, ...(branchId ? { branchId } : {}) },
    }),
  recascade: (branchId: number, productId: number, fromDate: string) =>
    api.post<{ updated: number }>('/inventory/recascade', { branchId, productId, fromDate }),
};

// ─── Inventory Import ────────────────────────────────────────────
export const inventoryImportApi = {
  preview: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ParsedWorkbook>('/inventory-import/preview', form);
  },
  importFile: (file: File, branchId: number) => {
    const form = new FormData();
    form.append('file', file);
    form.append('branchId', String(branchId));
    return api.post<InventoryImportResult>('/inventory-import/import', form);
  },
};

// ─── Inventory Adjustments ───────────────────────────────────────
export const inventoryAdjustmentsApi = {
  listByInventory: (inventoryId: number) =>
    api.get<InventoryAdjustment[]>(`/inventory-adjustments/inventory/${inventoryId}`),
  create: (data: { inventoryId: number; type: InventoryAdjustment['type']; value: number; notes?: string }) =>
    api.post<InventoryAdjustment>('/inventory-adjustments', data),
  transfer: (data: { fromInventoryId: number; toInventoryId: number; value: number; notes?: string }) =>
    api.post<TransferResult>('/inventory-adjustments/transfer', data),
  update: (id: number, data: { type?: InventoryAdjustment['type']; value?: number; notes?: string }) =>
    api.patch<InventoryAdjustment>(`/inventory-adjustments/${id}`, data),
  delete: (id: number) => api.delete(`/inventory-adjustments/${id}`),
};

// ─── Materials ───────────────────────────────────────────────────
export const materialsApi = {
  list: () => api.get<Material[]>('/materials'),
  search: (q: string) =>
    api.get<Material[]>('/materials/search', { params: { q } }),
  get: (id: number) => api.get<Material>(`/materials/${id}`),
  create: (data: Partial<Material>) => api.post<Material>('/materials', data),
  update: (id: number, data: Partial<Material>) =>
    api.patch<Material>(`/materials/${id}`, data),
  delete: (id: number) => api.delete(`/materials/${id}`),
  lowStock: () => api.get<(Material & { currentStock: number })[]>('/materials/low-stock'),
  priceHistory: (id: number) =>
    api.get<MaterialPriceHistory[]>(`/materials/${id}/price-history`),
};

// ─── Recipes ─────────────────────────────────────────────────────
export const recipesApi = {
  list: () => api.get<Recipe[]>('/recipes'),
  search: (q: string) =>
    api.get<Recipe[]>('/recipes/search', { params: { q } }),
  get: (id: number) => api.get<Recipe>(`/recipes/${id}`),
  byProduct: (productId: number) =>
    api.get<Recipe>(`/recipes/product/${productId}`),
  cost: (id: number) => api.get<RecipeCost>(`/recipes/${id}/cost`),
  create: (data: {
    productId: number;
    recipeYield?: number;
    notes?: string;
    items: { materialId: number; quantity: number; unit: string }[];
  }) => api.post<Recipe>('/recipes', data),
  update: (
    id: number,
    data: {
      recipeYield?: number;
      notes?: string;
      items?: { materialId: number; quantity: number; unit: string }[];
    }
  ) => api.patch<Recipe>(`/recipes/${id}`, data),
  delete: (id: number) => api.delete(`/recipes/${id}`),
};

// ─── Sales ───────────────────────────────────────────────────────
export const salesApi = {
  byBranchDate: (branchId: number, date: string) =>
    api.get<SaleRecord[]>(`/sales/branch/${branchId}/date`, {
      params: { date },
    }),
  byBranchRange: (branchId: number, startDate: string, endDate: string) =>
    api.get<SaleRecord[]>(`/sales/branch/${branchId}`, {
      params: { startDate, endDate },
    }),
  summary: (branchId: number, startDate: string, endDate: string) =>
    api.get<SaleSummary[]>(`/sales/branch/${branchId}/summary`, {
      params: { startDate, endDate },
    }),
  byProduct: (productId: number, startDate: string, endDate: string) =>
    api.get<SaleRecord[]>(`/sales/product/${productId}`, {
      params: { startDate, endDate },
    }),
};

// ─── Material Inventory ──────────────────────────────────────────
export const materialInventoryApi = {
  list: (page = 1, limit = 200) =>
    api.get<{ data: MaterialInventory[]; total: number }>(
      '/material-inventory',
      { params: { page, limit } }
    ),
  byDate: (date: string) =>
    api.get<MaterialInventory[]>('/material-inventory/by-date', { params: { date } }),
  listDates: () =>
    api.get<string[]>('/material-inventory/dates'),
  initDate: (date: string) =>
    api.post<{ created: number }>('/material-inventory/init', null, { params: { date } }),
  get: (id: number) =>
    api.get<MaterialInventory>(`/material-inventory/${id}`),
  create: (data: Partial<MaterialInventory>) =>
    api.post<MaterialInventory>('/material-inventory', data),
  update: (id: number, data: Partial<MaterialInventory>) =>
    api.patch<MaterialInventory>(`/material-inventory/${id}`, data),
  gaps: (startDate: string, endDate: string) =>
    api.get<{ missing: import('@/types').MaterialGapEntry[]; total: number }>('/material-inventory/gaps', {
      params: { startDate, endDate },
    }),
  initRange: (startDate: string, endDate?: string) =>
    api.post<{ totalCreated: number; datesProcessed: number }>(
      '/material-inventory/init-range',
      null,
      { params: { startDate, endDate } },
    ),
  delete: (id: number) => api.delete(`/material-inventory/${id}`),
};

export const materialAdjustmentsApi = {
  list: (materialInventoryId: number) =>
    api.get<MaterialAdjustment[]>('/material-adjustments', {
      params: { materialInventoryId },
    }),
  create: (data: { materialInventoryId: number; type: string; value: number; notes?: string }) =>
    api.post<MaterialAdjustment>('/material-adjustments', data),
  delete: (id: number) => api.delete(`/material-adjustments/${id}`),
};

// ─── Production ──────────────────────────────────────────────────
export const productionApi = {
  list: (page = 1, limit = 50) =>
    api.get<{ data: Production[]; total: number }>('/production', {
      params: { page, limit },
    }),
  byBranch: (branchId: number, page = 1, limit = 50) =>
    api.get<{ data: Production[]; total: number }>(`/production/branch/${branchId}`, {
      params: { page, limit },
    }),
  byBranchDate: (branchId: number, date: string) =>
    api.get<Production[]>(`/production/branch/${branchId}/date`, {
      params: { date },
    }),
  byDateRange: (startDate: string, endDate?: string) =>
    api.get<Production[]>('/production/date', {
      params: endDate ? { startDate, endDate } : { startDate },
    }),
  get: (id: number) => api.get<Production>(`/production/${id}`),
  create: (data: Partial<Production>) => api.post<Production>('/production', data),
  createBulk: (data: Partial<Production>[]) =>
    api.post<Production[]>('/production/bulk', data),
  update: (id: number, data: { yield?: number; notes?: string | null }) =>
    api.patch<Production>(`/production/${id}`, data),
  delete: (id: number) => api.delete(`/production/${id}`),
  materialConsumption: (id: number) =>
    api.get<MaterialConsumption>(`/production/${id}/material-consumption`),
  consumptionSummary: (date: string, branchId?: number) =>
    api.get<ConsumptionSummary>('/production/material-consumption/summary', {
      params: branchId ? { date, branchId } : { date },
    }),
  efficiency: (startDate: string, endDate: string, branchId?: number) =>
    api.get<ProductionEfficiencyItem[]>('/production/efficiency', {
      params: branchId ? { startDate, endDate, branchId } : { startDate, endDate },
    }),
};

// ─── Unit Conversions ────────────────────────────────────────────
export const unitConversionsApi = {
  list: () => api.get<UnitConversion[]>('/unit-conversions'),
  get: (id: number) => api.get<UnitConversion>(`/unit-conversions/${id}`),
  create: (data: Partial<UnitConversion>) =>
    api.post<UnitConversion>('/unit-conversions', data),
  update: (id: number, factor: number) =>
    api.patch<UnitConversion>(`/unit-conversions/${id}`, { factor }),
  delete: (id: number) => api.delete(`/unit-conversions/${id}`),
  convert: (quantity: number, fromUnit: string, toUnit: string) =>
    api.post('/unit-conversions/convert', { quantity, fromUnit, toUnit }),
};

// ─── Dashboard ───────────────────────────────────────────────────
export const dashboardApi = {
  summary: (date?: string) =>
    api.get<DashboardSummary>('/dashboard/summary', { params: date ? { date } : undefined }),
};

// ─── Jobs ────────────────────────────────────────────────────────
export const jobsApi = {
  autofill: (targetDate?: string) =>
    api.post<{ inventoryCreated: number; productionCreated: number; date: string }>(
      '/jobs/autofill',
      targetDate ? { targetDate } : {},
    ),
  autofillRange: (startDate: string, endDate?: string) =>
    api.post<{ totalInventoryCreated: number; totalProductionCreated: number; datesProcessed: number }>(
      '/jobs/autofill-range',
      { startDate, ...(endDate ? { endDate } : {}) },
    ),
  autofillMaterialStock: (targetDate?: string) =>
    api.post<{ created: number; date: string }>(
      '/jobs/autofill-material-stock',
      targetDate ? { targetDate } : {},
    ),
  autofillMaterialStockRange: (startDate: string, endDate?: string) =>
    api.post<{ totalCreated: number; datesProcessed: number }>(
      '/jobs/autofill-material-stock-range',
      { startDate, ...(endDate ? { endDate } : {}) },
    ),
};

// ─── Notifications ────────────────────────────────────────────────
export const notificationsApi = {
  registerToken: (token: string, platform?: string) =>
    api.post<{ message: string }>('/notifications/register', { token, platform }),
  removeToken: (token: string) =>
    api.delete(`/notifications/token/${encodeURIComponent(token)}`),
};
