/** Every reachable route, derived from src/app/**\/page.tsx + the RBAC nav manifest. */
export const PUBLIC_ROUTES = ['/', '/login', '/register'];

export const APP_ROUTES = [
  '/dashboard',
  '/sales',
  '/inventory',
  '/inventory/details',
  '/inventory/gaps',
  '/inventory/rejections',
  '/inventory-adjustments',
  '/production',
  '/production/orders',
  '/production-orders',
  '/production-cost',
  '/production-efficiency',
  '/inventory-import',
  '/inventory-import/history',
  '/material-inventory',
  '/material-inventory/gaps',
  '/materials',
  '/products',
  '/recipes',
  '/branches',
  '/suppliers',
  '/unit-conversions',
  '/config/product-order',
  '/settings/users',
  '/settings/permissions',
  '/settings/jobs',
  '/no-access',
  '/change-password',
];

export const ADMIN = { email: 'admin@louella.com', password: 'Admin@123' };
