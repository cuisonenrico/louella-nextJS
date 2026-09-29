'use client';

import { usePageHeader } from '@/components/layout/usePageHeader';
import { HolidaysCard } from './_components/HolidaysCard';
import { MultipliersCard } from './_components/MultipliersCard';

export default function PayrollSettingsPage() {
  usePageHeader({ title: 'Payroll settings' });
  return (
    <div className="flex flex-col gap-4">
      <MultipliersCard />
      <HolidaysCard />
    </div>
  );
}
