// ────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────
export type UserRole = 'USER' | 'VIEWER' | 'INVENTORY' | 'MANAGER' | 'ADMIN';
export type FileStatus = 'PENDING' | 'UPLOADED' | 'PROCESSING' | 'FAILED';
export type ProductType = 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type AdjustmentType = 'PULL_IN' | 'PULL_OUT' | 'ANOMALY';
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
export interface InventoryAdjustment {
  id: number;
  inventoryId: number;
  type: AdjustmentType;
  value: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  adjustments?: InventoryAdjustment[];
}

// ────────────────────────────────────────────────────────────────
// Suppliers
// ────────────────────────────────────────────────────────────────
export interface Supplier {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
export interface MaterialAdjustment {
  id: number;
  materialInventoryId: number;
  type: 'PULL_IN' | 'PULL_OUT' | 'ANOMALY';
  value: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialInventory {
  id: number;
  materialId: number;
  date: string;
  supplierId: number | null;
  createdById: number | null;
  batchNumber: string | null;
  expiresAt: string | null;
  quantity: number;
  delivery: number;
  used: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  material?: Material;
  supplier?: Supplier;
  adjustments?: MaterialAdjustment[];
}

// ────────────────────────────────────────────────────────────────
// Production
// ────────────────────────────────────────────────────────────────
export interface Production {
  id: number;
  branchId: number;
  productId: number;
  date: string;
  yield: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  branch?: Branch;
  product?: Product;
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
// Inventory Import
// ────────────────────────────────────────────────────────────────
export interface SheetImportResult {
  sheetName: string;
  date: string;
  processed: number;
  skipped: number;
  errors: string[];
}

export interface InventoryImportResult {
  summary: {
    totalSheets: number;
    totalProcessed: number;
    totalSkipped: number;
    totalErrors: number;
  };
  sheets: SheetImportResult[];
}

// ────────────────────────────────────────────────────────────────
// Price History
// ────────────────────────────────────────────────────────────────
export interface MaterialPriceHistory {
  id: number;
  materialId: number;
  supplierId: number | null;
  pricePerUnit: number;
  effectiveAt: string;
  createdAt: string;
  supplier?: Supplier;
}

export interface ProductPriceHistory {
  id: number;
  productId: number;
  price: number;
  effectiveAt: string;
  createdAt: string;
}

// ────────────────────────────────────────────────────────────────
// Material Consumption (Production → Materials)
// ────────────────────────────────────────────────────────────────
export interface MaterialConsumptionItem {
  materialId: number;
  materialName: string;
  materialUnit: string;
  recipeUnit: string;
  consumed: number;
  pricePerUnit: number;
  totalCost: number;
}

export interface MaterialConsumption {
  productionId: number;
  productName: string;
  date: string;
  yield: number;
  items: MaterialConsumptionItem[];
  totalMaterialCost: number;
}

// ────────────────────────────────────────────────────────────────
// Consumption Summary (Daily batch total)
// ────────────────────────────────────────────────────────────────
export interface ConsumptionSummaryItem {
  materialId: number;
  materialName: string;
  unit: string;
  totalConsumed: number;
  totalCost: number;
}

export interface ConsumptionSummary {
  date: string;
  items: ConsumptionSummaryItem[];
  grandTotalCost: number;
}

// ────────────────────────────────────────────────────────────────
// Production Efficiency
// ────────────────────────────────────────────────────────────────
export interface ProductionEfficiencyItem {
  productId: number;
  productName: string;
  productType: ProductType;
  totalYield: number;
  totalDelivered: number;
  totalLeftover: number;
  totalReject: number;
  sold: number;
  soldRate: number;
  wasteRate: number;
}

// ────────────────────────────────────────────────────────────────
// Inventory Import Preview
// ────────────────────────────────────────────────────────────────
export interface ParsedSheet {
  name: string;
  rows: Record<string, unknown>[];
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: ParsedSheet[];
}

// ────────────────────────────────────────────────────────────────
// Pagination
// ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
