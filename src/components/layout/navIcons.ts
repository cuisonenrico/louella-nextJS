import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  ClipboardList,
  Coins,
  Factory,
  FlaskConical,
  Gauge,
  Layers,
  LayoutDashboard,
  Package,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Timer,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Warehouse,
} from 'lucide-react';

/**
 * Sidebar icons, keyed by feature key.
 *
 * Kept out of `src/lib/rbac/features.ts` on purpose: that manifest is imported
 * by the Nest server, so it must not pull lucide-react (or anything else) into
 * the server bundle.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: TrendingUp,
  'inventory-history': Package,
  'inventory-adjustments': SlidersHorizontal,
  production: Factory,
  'production-orders': ClipboardList,
  'production-cost': Coins,
  'production-efficiency': Gauge,
  'inventory-import': Upload,
  'material-stock': Warehouse,
  products: Layers,
  materials: FlaskConical,
  recipes: BookOpen,
  branches: Store,
  suppliers: Truck,
  'unit-conversions': Scale,
  'product-order-config': Layers,
  'user-management': Users,
  permissions: ShieldCheck,
  jobs: Activity,
};

/** Fallback so a newly added feature never renders a blank slot. */
export const DEFAULT_NAV_ICON: LucideIcon = Timer;
