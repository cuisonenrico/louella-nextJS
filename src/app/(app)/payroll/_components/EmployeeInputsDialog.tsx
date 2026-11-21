'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { employeesApi } from '@/lib/apiServices';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QueryError from '@/components/QueryError';
import { AbsencesTab } from '../../employees/[id]/_components/AbsencesTab';
import { DeductionsTab } from '../../employees/[id]/_components/DeductionsTab';
import { RatesTab } from '../../employees/[id]/_components/RatesTab';

export type EmployeeInputsTab = 'absences' | 'rates' | 'deductions';

export interface EmployeeInputsTarget {
  employeeId: number;
  employeeName: string;
  tab: EmployeeInputsTab;
}

/**
 * An employee's pay inputs — absences, rates, monthly deductions — over the cutoff page, so the admin
 * keeps their place (filters, expanded rows, scroll) while correcting someone. The same tabs as the
 * employee page; their saves invalidate `['payroll']`, so the draft behind refreshes as they go.
 */
export function EmployeeInputsDialog({
  target,
  periodStart,
  onClose,
}: {
  target: EmployeeInputsTarget;
  periodStart: string;
  onClose: () => void;
}) {
  const { data: employee, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employee', target.employeeId],
    queryFn: () => employeesApi.get(target.employeeId).then((r) => r.data),
  });

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{target.employeeName}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Changes update this cutoff&apos;s draft as you make them.{' '}
            <Link href={`/employees/${target.employeeId}`} className="underline underline-offset-2">
              Full profile
            </Link>
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : employee ? (
          <Tabs defaultValue={target.tab}>
            <TabsList>
              <TabsTrigger value="absences">Absences</TabsTrigger>
              <TabsTrigger value="rates">Rates</TabsTrigger>
              <TabsTrigger value="deductions">Deductions</TabsTrigger>
            </TabsList>
            <TabsContent value="absences"><AbsencesTab employee={employee} initialMonth={periodStart.slice(0, 7)} /></TabsContent>
            <TabsContent value="rates"><RatesTab employee={employee} /></TabsContent>
            <TabsContent value="deductions"><DeductionsTab employee={employee} /></TabsContent>
          </Tabs>
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
