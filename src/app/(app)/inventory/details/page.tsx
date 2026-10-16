'use client';

import { usePageHeader } from '@/components/layout/usePageHeader';
import InventoryDesktop from '../components/InventoryDesktop';
import { useInventoryDay } from '../hooks/useInventoryDay';

export default function InventoryDetailsPage() {
  usePageHeader({ title: 'Inventory Details' });
  const day = useInventoryDay();
  return <InventoryDesktop day={day} />;
}
