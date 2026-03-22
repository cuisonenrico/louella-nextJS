import api from './api';
import type {
  AuthResponse,
  Branch,
  Inventory,
  Material,
  MaterialInventory,
  Product,
  Recipe,
  RecipeCost,
  SaleRecord,
  SaleSummary,
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

// ─── Products ────────────────────────────────────────────────────
export const productsApi = {
  list: () => api.get<Product[]>('/products'),
  search: (q: string) => api.get<Product[]>('/products/search', { params: { q } }),
  get: (id: number) => api.get<Product>(`/products/${id}`),
  create: (data: Partial<Product>) => api.post<Product>('/products', data),
  update: (id: number, data: Partial<Product>) =>
    api.patch<Product>(`/products/${id}`, data),
  delete: (id: number) => api.delete(`/products/${id}`),
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
  get: (id: number) => api.get<Inventory>(`/inventory/${id}`),
  create: (data: Partial<Inventory>) => api.post<Inventory>('/inventory', data),
  createBulk: (data: Partial<Inventory>[]) =>
    api.post<Inventory[]>('/inventory/bulk', data),
  update: (id: number, data: Partial<Inventory>) =>
    api.patch<Inventory>(`/inventory/${id}`, data),
  delete: (id: number) => api.delete(`/inventory/${id}`),
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
  list: (page = 1, limit = 50) =>
    api.get<{ data: MaterialInventory[]; total: number }>(
      '/material-inventory',
      { params: { page, limit } }
    ),
  byBranch: (branchId: number, page = 1, limit = 50) =>
    api.get<{ data: MaterialInventory[]; total: number }>(
      `/material-inventory/branch/${branchId}`,
      { params: { page, limit } }
    ),
  byBranchDate: (branchId: number, date: string) =>
    api.get<MaterialInventory[]>(
      `/material-inventory/branch/${branchId}/date`,
      { params: { date } }
    ),
  get: (id: number) =>
    api.get<MaterialInventory>(`/material-inventory/${id}`),
  create: (data: Partial<MaterialInventory>) =>
    api.post<MaterialInventory>('/material-inventory', data),
  update: (id: number, data: Partial<MaterialInventory>) =>
    api.patch<MaterialInventory>(`/material-inventory/${id}`, data),
  delete: (id: number) => api.delete(`/material-inventory/${id}`),
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
