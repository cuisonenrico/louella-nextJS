// ────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────
export type UserRole = 'USER' | 'VIEWER' | 'INVENTORY' | 'MANAGER' | 'ADMIN';
export type FileStatus = 'PENDING' | 'UPLOADED' | 'PROCESSING' | 'FAILED';
export type ProductType = 'BREAD' | 'CAKE' | 'SPECIAL';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type MeasurementUnit =
  | 'KG'
  | 'G'
  | 'LITER'
  | 'ML'
  | 'PIECE'
  | 'DOZEN'
  | 'BAG'
  | 'SACHET'
  | 'CUP'
  | 'TBSP'
  | 'TSP';

// ────────────────────────────────────────────────────────────────
// Auth
// ────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// ────────────────────────────────────────────────────────────────
// Products
// ────────────────────────────────────────────────────────────────
export interface Product {
  id: number;
  name: string;
  type: ProductType;
  price: number;
  isActive: boolean;
  date: string;
  createdAt: string;
  deletedAt: string | null;
}

// ────────────────────────────────────────────────────────────────
// Branches
// ────────────────────────────────────────────────────────────────
export interface Branch {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ────────────────────────────────────────────────────────────────
// Inventory
// ────────────────────────────────────────────────────────────────
export interface Inventory {
  id: number;
  branchId: number;
  productId: number;
  createdById: number | null;
  quantity: number;
  delivery: number;
  leftover: number;
  reject: number;
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  branch?: Branch;
  product?: Product;
}

// ────────────────────────────────────────────────────────────────
// Materials
// ────────────────────────────────────────────────────────────────
export interface Material {
  id: number;
  name: string;
  unit: MeasurementUnit;
  pricePerUnit: number;
  reorderLevel: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ────────────────────────────────────────────────────────────────
// Recipes
// ────────────────────────────────────────────────────────────────
export interface RecipeItem {
  id: number;
  recipeId: number;
  materialId: number;
  quantity: number;
  unit: MeasurementUnit;
  material?: Material;
}

export interface Recipe {
  id: number;
  productId: number;
  recipeYield: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: RecipeItem[];
  product?: Product;
}

export interface RecipeCost {
  recipeId: number;
  productName: string;
  recipeYield: number;
  totalBatchCost: number;
  costPerUnit: number;
  productPrice: number;
  grossMargin: number;
  items: {
    materialId: number;
    materialName: string;
    quantity: number;
    unit: MeasurementUnit;
    pricePerUnit: number;
    cost: number;
  }[];
}

// ────────────────────────────────────────────────────────────────
// Sales
// ────────────────────────────────────────────────────────────────
export interface SaleRecord {
  productId: number;
  productName: string;
  date: string;
  delivery: number;
  leftover: number;
  reject: number;
  sold: number;
  revenue: number;
}

export interface SaleSummary {
  date: string;
  totalSold: number;
  totalRevenue: number;
}

// ────────────────────────────────────────────────────────────────
// Material Inventory
// ────────────────────────────────────────────────────────────────
export interface MaterialInventory {
  id: number;
  branchId: number;
  materialId: number;
  supplierId: number | null;
  createdById: number | null;
  batchNumber: string | null;
  expiresAt: string | null;
  quantity: number;
  delivery: number;
  leftover: number;
  reject: number;
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  branch?: Branch;
  material?: Material;
}

// ────────────────────────────────────────────────────────────────
// Unit Conversions
// ────────────────────────────────────────────────────────────────
export interface UnitConversion {
  id: number;
  fromUnit: MeasurementUnit;
  toUnit: MeasurementUnit;
  factor: number;
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────────
// Pagination
// ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
