'use client';

import { useState } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { manilaToday } from '@/lib/manilaDate';
import ProductionDesktop from './components/ProductionDesktop';

export default function ProductionPage() {
  usePageHeader({ title: 'Production' });
  const [filterDate, setFilterDate] = useState(manilaToday);
  return <ProductionDesktop filterDate={filterDate} setFilterDate={setFilterDate} />;
}
