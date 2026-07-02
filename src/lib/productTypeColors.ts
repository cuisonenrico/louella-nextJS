import type { ProductType } from '@/types';

export const PRODUCT_TYPE_COLORS: Record<ProductType, string> = {
  BREAD: '#F4780B',          /* crust  */
  CAKE: '#6B3FA0',           /* ube    */
  SPECIAL: '#2e7d32',
  MISCELLANEOUS: '#8B7355',
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Misc',
};
