// Every route that has a page.tsx under src/app. Keep in sync with spec §8.1 — the adding-e2e-coverage skill enforces it.
export const PUBLIC_ROUTES = ['/', '/login', '/register'];

export const STATIC_ROUTES = [
  '/dashboard',
  '/sales',
  '/inventory',
  '/inventory/details',
  '/inventory/gaps',
  '/inventory/rejections',
  '/inventory-adjustments',
  '/inventory-import',
  '/inventory-import/history',
  '/production',
  '/production/orders',
  '/production-orders',
  '/production-cost',
  '/production-efficiency',
  '/material-inventory',
  '/material-inventory/gaps',
  '/materials',
  '/products',
  '/recipes',
  '/branches',
  '/suppliers',
  '/unit-conversions',
  '/config/product-order',
  '/employees',
  '/payroll',
  '/branch-cash',
  '/settings/users',
  '/settings/permissions',
  '/settings/jobs',
  '/settings/payroll',
  '/settings/landing',
  '/no-access',
  '/change-password',
];

export function dynamicRoutes(ctx: { employeeId: number; periodStart: string }): string[] {
  return [`/employees/${ctx.employeeId}`, `/payroll/${ctx.periodStart}`];
}
