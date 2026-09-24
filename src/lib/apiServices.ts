import api from './api';
import { idempotencyHeader } from './useIdempotencyKey';
import type {
  Absence, CutoffSummary, CutoffView, Employee, EmployeeAccount, EmployeeInput, EmployeeRate, JobRole, PayrollAdjustment, PayrollAdjustmentCategory, PayrollAdjustmentKind, PayrollRun, PayslipWithRun, RecurringDeduction,
  AuthResponse,
  Branch,
  PermissionsMatrixResponse,
  UserPermissionsResponse,
  UserRole,
  ConsumptionSummary,
  DashboardSummary,
  Inventory,
  InventoryAdjustment,
  InventoryDashboardData,
  InventoryGapsResult,
  InventoryImportResult,
  InventorySummaryData,
  InventoryUpdateResult,
  InventoryBulkUpdateItem,
  InventoryBulkUpdateResult,
  ImportLogsResponse,
  JobRunsResponse,
  Material,
  MaterialAdjustment,
  MaterialConsumption,
  MaterialInventory,
  MaterialInventoryBulkUpdateItem,
  MaterialPriceHistory,
  PaginatedResponse,
  DryRunResult,
  PlannedYield,
  Product,
  ProductPriceHistory,
  ProductType,
  Production,
  ProductionEfficiencyItem,
  ProductionOrder,
  ProductionSuggestionsResponse,
  Recipe,
  RecipeCost,
  SaleRecord,
  SaleSummary,
  Supplier,
  SuggestionPeriod,
  PendingTransfer,
  AuditEvent,
  TransferResult,
  UnitConversion,
  User,
  RejectionByProductItem,
} from '@/types';

// ─── Auth ────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  me: () => api.get<User>('/auth/me'),
  logout: () => api.post('/auth/logout', {}),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch<{ success: boolean }>('/auth/change-password', { currentPassword, newPassword }),
};

// ─── Users (Admin) ───────────────────────────────────────────────
export const usersApi = {
  list: (page = 1, limit = 20, search?: string) =>
    api.get<PaginatedResponse<User>>('/users', { params: { page, limit, search } }),
  get: (id: number) => api.get<User>(`/users/${id}`),
  create: (data: {
    email: string;
    password: string;
    role: UserRole;
    branchId?: number;
    mustChangePassword?: boolean;
  }) => api.post<User>('/users', data),
  updateRole: (id: number, role: UserRole) =>
    api.patch<User>(`/users/${id}/role`, { role }),
  updateBranch: (id: number, branchId: number | null) =>
    api.patch<User>(`/users/${id}/branch`, { branchId }),
  setActive: (id: number, isActive: boolean) =>
    api.patch<User>(`/users/${id}/status`, { isActive }),
  resetPassword: (id: number, newPassword: string) =>
    api.post<{ success: boolean }>(`/users/${id}/reset-password`, { newPassword }),
  myPermissions: () => api.get<{ features: string[] }>('/users/me/permissions'),
};

// ─── Permissions (Admin) ─────────────────────────────────────────
export const permissionsApi = {
  matrix: () => api.get<PermissionsMatrixResponse>('/permissions/matrix'),
  userMatrix: (userId: number) =>
    api.get<UserPermissionsResponse>(`/permissions/users/${userId}/matrix`),
  setRolePermission: (role: UserRole, featureKey: string, enabled: boolean) =>
    api.put(`/permissions/roles/${role}`, { featureKey, enabled }),
  setUserPermission: (userId: number, featureKey: string, enabled: boolean) =>
    api.put(`/permissions/users/${userId}`, { featureKey, enabled }),
  resetUserPermission: (userId: number, featureKey: string) =>
    api.delete(`/permissions/users/${userId}/${featureKey}`),
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
  updateOrder: (data: { type: Product['type']; items: { id: number; sortOrder: number }[] }) =>
    api.patch<Product[]>('/products/order', data),
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
  /** Every recorded change to one row, newest first. */
  history: (id: number) => api.get<AuditEvent[]>(`/inventory/${id}/history`),
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
  // One request for a whole sheet save. Sending one PATCH per row hits the
  // global 20/min throttle on any real sheet, and a partial save is worse than
  // a slow one.
  updateBulk: (data: InventoryBulkUpdateItem[]) =>
    api.patch<InventoryBulkUpdateResult>('/inventory/bulk', data),
  delete: (id: number) => api.delete(`/inventory/${id}`),
  summary: (startDate?: string, endDate?: string, branchId?: string) =>
    api.get<InventorySummaryData>('/inventory/summary', {
      params: { startDate, endDate, branchId },
    }),
  dashboard: (startDate?: string, endDate?: string, branchId?: string) =>
    api.get<InventoryDashboardData>('/inventory/dashboard', {
      params: { startDate, endDate, branchId },
    }),
  exportSales: (startDate: string, endDate: string, branchId?: string) =>
    api.get<Blob>('/inventory/export-sales', {
      params: { startDate, endDate, ...(branchId ? { branchId } : {}) },
      responseType: 'blob',
    }),
  gaps: (startDate: string, endDate: string, branchId?: number) =>
    api.get<InventoryGapsResult>('/inventory/gaps', {
      params: { startDate, endDate, ...(branchId ? { branchId } : {}) },
    }),
  recascade: (branchId: number, productId: number, fromDate: string) =>
    api.post<{ updated: number }>('/inventory/recascade', { branchId, productId, fromDate }),
  rejectionByProduct: (startDate?: string, endDate?: string, branchId?: string, type?: string) =>
    api.get<RejectionByProductItem[]>('/inventory/rejection-by-product', {
      params: { startDate, endDate, branchId, type },
    }),
};

// ─── Inventory Import ────────────────────────────────────────────
export const inventoryImportApi = {
  preview: (file: File, branchId?: number) => {
    const form = new FormData();
    form.append('file', file);
    if (branchId !== undefined) form.append('branchId', String(branchId));
    return api.post<DryRunResult>('/inventory-import/preview', form);
  },
  importFile: (
    file: File,
    branchId: number,
    conflictMode?: 'skip' | 'overwrite',
    // Decisions for labels that matched no product. The server refuses the
    // import unless every unknown label appears in one of these two lists.
    createProducts?: { label: string; type: ProductType }[],
    acknowledgeUnmatched?: string[],
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('branchId', String(branchId));
    if (conflictMode) form.append('conflictMode', conflictMode);
    if (createProducts?.length)
      form.append('createProducts', JSON.stringify(createProducts));
    if (acknowledgeUnmatched?.length)
      form.append(
        'acknowledgeUnmatched',
        JSON.stringify(acknowledgeUnmatched),
      );
    return api.post<InventoryImportResult>('/inventory-import/import', form);
  },
};

export const importLogsApi = {
  list: (params?: { branchId?: number; page?: number; limit?: number }) =>
    api.get<ImportLogsResponse>('/inventory-import/logs', { params }),
  delete: (id: number) => api.delete<void>(`/inventory-import/logs/${id}`),
};

// ─── Inventory Adjustments ───────────────────────────────────────
export const inventoryAdjustmentsApi = {
  listByInventory: (inventoryId: number) =>
    api.get<InventoryAdjustment[]>(`/inventory-adjustments/inventory/${inventoryId}`),
  create: (
    data: { inventoryId: number; type: InventoryAdjustment['type']; value: number; notes?: string },
    idempotencyKey?: string,
  ) => api.post<InventoryAdjustment>('/inventory-adjustments', data, idempotencyHeader(idempotencyKey)),
  transfer: (
    data: { fromInventoryId: number; toInventoryId: number; value: number; notes?: string },
    idempotencyKey?: string,
  ) => api.post<TransferResult>('/inventory-adjustments/transfer', data, idempotencyHeader(idempotencyKey)),
  pendingTransfers: (branchId?: number) =>
    api.get<PendingTransfer[]>('/inventory-adjustments/transfers/pending', {
      params: branchId != null ? { branchId } : undefined,
    }),
  // One answer per transfer, so its id makes a stable key: a double click on
  // Accept replays instead of racing.
  acceptTransfer: (id: number) =>
    api.post<TransferResult>(`/inventory-adjustments/${id}/accept`, undefined, idempotencyHeader(`transfer-${id}-accept`)),
  rejectTransfer: (id: number) =>
    api.post<{ status: 'REJECTED' }>(`/inventory-adjustments/${id}/reject`, undefined, idempotencyHeader(`transfer-${id}-reject`)),
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
  createBulk: (data: Partial<MaterialInventory>[]) =>
    api.post<MaterialInventory[]>('/material-inventory/bulk', data),
  create: (data: Partial<MaterialInventory>) =>
    api.post<MaterialInventory>('/material-inventory', data),
  // One request for a whole sheet save — see inventoryApi.updateBulk.
  updateBulk: (data: MaterialInventoryBulkUpdateItem[]) =>
    api.patch<{ updated: number }>('/material-inventory/bulk', data),
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
  create: (
    data: { materialInventoryId: number; type: string; value: number; notes?: string },
    idempotencyKey?: string,
  ) => api.post<MaterialAdjustment>('/material-adjustments', data, idempotencyHeader(idempotencyKey)),
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
  upsertBulk: (data: Array<{ productId: number; date: string; yield: number; branchId?: number }>) =>
    api.post<Production[]>('/production/upsert-bulk', data),
  update: (id: number, data: { yield?: number; notes?: string | null }) =>
    api.patch<Production>(`/production/${id}`, data),
  delete: (id: number) => api.delete(`/production/${id}`),
  materialConsumption: (id: number, plannedYield?: number) =>
    api.get<MaterialConsumption>(`/production/${id}/material-consumption`, {
      params: plannedYield != null ? { plannedYield } : undefined,
    }),
  consumptionSummary: (date: string, branchId?: number) =>
    api.get<ConsumptionSummary>('/production/material-consumption/summary', {
      params: branchId ? { date, branchId } : { date },
    }),
  efficiency: (startDate: string, endDate: string, branchId?: number) =>
    api.get<ProductionEfficiencyItem[]>('/production/efficiency', {
      params: branchId ? { startDate, endDate, branchId } : { startDate, endDate },
    }),
};

// ─── Production Orders ───────────────────────────────────────────
export const productionOrdersApi = {
  list: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<ProductionOrder>>('/production-orders', { params: { page, limit } }),
  byDate: (date: string, branchId?: number) =>
    api.get<ProductionOrder[]>('/production-orders/by-date', {
      params: branchId ? { date, branchId } : { date },
    }),
  plannedYield: (date: string, branchId?: number) =>
    api.get<PlannedYield[]>('/production-orders/planned-yield', {
      params: branchId ? { date, branchId } : { date },
    }),
  suggestions: (branchId: number, period: SuggestionPeriod = '7d', date?: string) =>
    api.get<ProductionSuggestionsResponse>('/production-orders/suggestions', {
      params: { branchId, period, ...(date ? { date } : {}) },
    }),
  get: (id: number) =>
    api.get<ProductionOrder>(`/production-orders/${id}`),
  create: (
    data: { branchId: number; date: string; notes?: string; items: { productId: number; yield?: number }[] },
    idempotencyKey?: string,
  ) => api.post<ProductionOrder>('/production-orders', data, idempotencyHeader(idempotencyKey)),
  update: (id: number, data: { branchId?: number; status?: string; notes?: string; items?: { productId: number; yield?: number }[] }) =>
    api.patch<ProductionOrder>(`/production-orders/${id}`, data),
  delete: (id: number) =>
    api.delete(`/production-orders/${id}`),
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
  runs: (jobName?: string, limit = 20) =>
    api.get<JobRunsResponse>('/jobs/runs', {
      params: { limit, ...(jobName ? { jobName } : {}) },
    }),
};

// ─── Notifications ────────────────────────────────────────────────
export const notificationsApi = {
  registerToken: (token: string, platform?: string) =>
    api.post<{ message: string }>('/notifications/register', { token, platform }),
  removeToken: (token: string) =>
    api.delete(`/notifications/token/${encodeURIComponent(token)}`),
};
// ─── Employees & payroll (admin only) ─────────────────────────────
export const jobRolesApi = {
  list: (includeInactive = false) =>
    api.get<JobRole[]>('/job-roles', { params: { includeInactive } }),
  create: (name: string) => api.post<JobRole>('/job-roles', { name }),
  update: (id: number, data: { name?: string; isActive?: boolean }) =>
    api.patch<JobRole>(`/job-roles/${id}`, data),
};

export const employeesApi = {
  list: (params?: { branchId?: number; jobRoleId?: number; status?: 'active' | 'separated' | 'all' }) =>
    api.get<Employee[]>('/employees', { params }),
  get: (id: number) => api.get<Employee>(`/employees/${id}`),
  create: (data: EmployeeInput) => api.post<Employee>('/employees', data),
  update: (id: number, data: Partial<Omit<EmployeeInput, 'dailyRate'>>) =>
    api.patch<Employee>(`/employees/${id}`, data),
  setSeparation: (id: number, separatedOn: string | null) =>
    api.patch<Employee>(`/employees/${id}/status`, { separatedOn }),
  rates: (id: number) => api.get<EmployeeRate[]>(`/employees/${id}/rates`),
  addRate: (id: number, data: { dailyRate: number; effectiveOn: string }) =>
    api.post<EmployeeRate>(`/employees/${id}/rates`, data),
  removeRate: (id: number, rateId: number) => api.delete(`/employees/${id}/rates/${rateId}`),
  deductions: (id: number) => api.get<RecurringDeduction[]>(`/employees/${id}/recurring-deductions`),
  addDeduction: (id: number, data: { name: string; employeeShare: number; employerShare: number }) =>
    api.post<RecurringDeduction>(`/employees/${id}/recurring-deductions`, data),
  updateDeduction: (
    id: number,
    dedId: number,
    data: Partial<{ name: string; employeeShare: number; employerShare: number; isActive: boolean }>,
  ) => api.patch<RecurringDeduction>(`/employees/${id}/recurring-deductions/${dedId}`, data),
  createAccount: (id: number, data: { email: string; password: string; role: UserRole; branchId?: number }) =>
    api.post<EmployeeAccount>(`/employees/${id}/account`, data),
  linkAccount: (id: number, userId: number) =>
    api.post<EmployeeAccount>(`/employees/${id}/account/link`, { userId }),
  deactivateAccount: (id: number) => api.delete<EmployeeAccount>(`/employees/${id}/account`),
};

export const absencesApi = {
  list: (params: { from: string; to: string; employeeId?: number }) =>
    api.get<Absence[]>('/absences', { params }),
  create: (data: { employeeId: number; date: string; note?: string }) => api.post<Absence>('/absences', data),
  remove: (id: number) => api.delete(`/absences/${id}`),
};

export const payrollApi = {
  cutoffs: (year: number) => api.get<CutoffSummary[]>('/payroll/cutoffs', { params: { year } }),
  cutoff: (periodStart: string) => api.get<CutoffView>(`/payroll/cutoffs/${periodStart}`),
  addAdjustment: (
    data: {
      employeeId: number;
      periodStart: string;
      kind: PayrollAdjustmentKind;
      category: PayrollAdjustmentCategory;
      description: string;
      amount: number;
    },
    idempotencyKey?: string,
  ) => api.post<PayrollAdjustment>('/payroll/adjustments', data, idempotencyHeader(idempotencyKey)),
  removeAdjustment: (id: number) => api.delete(`/payroll/adjustments/${id}`),
  skip: (periodStart: string, data: { employeeId: number; recurringDeductionId: number }) =>
    api.post<{ id: number }>(`/payroll/cutoffs/${periodStart}/skips`, data),
  unskip: (id: number) => api.delete(`/payroll/skips/${id}`),
  finalize: (periodStart: string, idempotencyKey?: string) =>
    api.post<PayrollRun>(`/payroll/cutoffs/${periodStart}/finalize`, {}, idempotencyHeader(idempotencyKey)),
  markPaid: (runId: number) => api.post<PayrollRun>(`/payroll/runs/${runId}/paid`),
  voidRun: (runId: number, reason: string) => api.post<PayrollRun>(`/payroll/runs/${runId}/void`, { reason }),
  run: (runId: number) => api.get<PayrollRun>(`/payroll/runs/${runId}`),
  payslip: (id: number) => api.get<PayslipWithRun>(`/payroll/payslips/${id}`),
};
