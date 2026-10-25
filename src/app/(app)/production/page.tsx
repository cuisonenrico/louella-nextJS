'use client';

import { useState } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { manilaToday } from '@/lib/manilaDate';
import { useIsMobile } from '@/lib/useIsMobile';
import ProductionDesktop from './components/ProductionDesktop';
import ProductionPhone from './components/phone/ProductionPhone';

export default function ProductionPage() {
  usePageHeader({ title: 'Production' });
  const [filterDate, setFilterDate] = useState(manilaToday);
  const isMobile = useIsMobile();
  return isMobile ? (
    <ProductionPhone filterDate={filterDate} setFilterDate={setFilterDate} />
  ) : (
    <ProductionDesktop filterDate={filterDate} setFilterDate={setFilterDate} />
  );
}
