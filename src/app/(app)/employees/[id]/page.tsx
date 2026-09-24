'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { employeesApi } from '@/lib/apiServices';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QueryError from '@/components/QueryError';
import { AbsencesTab } from './_components/AbsencesTab';
import { AccountTab } from './_components/AccountTab';
import { DeductionsTab } from './_components/DeductionsTab';
import { ProfileTab } from './_components/ProfileTab';
import { RatesTab } from './_components/RatesTab';

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;

  const { data: employee, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeesApi.get(id).then((r) => r.data),
    enabled: validId,
  });
  usePageHeader({ title: employee?.fullName ?? 'Employee' });

  if (!validId) return <Alert variant="destructive"><AlertDescription>That is not an employee.</AlertDescription></Alert>;
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!employee) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/employees"><ArrowLeft className="mr-1 h-4 w-4" />Employees</Link>
        </Button>
        <Badge variant={employee.isActive ? 'default' : 'secondary'}>{employee.isActive ? 'Active' : 'Separated'}</Badge>
        <span className="text-sm text-muted-foreground">
          {employee.jobRole.name}{employee.branch ? ` · ${employee.branch.name}` : ''}
        </span>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="rates">Rates</TabsTrigger>
          <TabsTrigger value="deductions">Deductions</TabsTrigger>
          <TabsTrigger value="absences">Absences</TabsTrigger>
          <TabsTrigger value="account">Login</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab employee={employee} /></TabsContent>
        <TabsContent value="rates"><RatesTab employee={employee} /></TabsContent>
        <TabsContent value="deductions"><DeductionsTab employee={employee} /></TabsContent>
        <TabsContent value="absences"><AbsencesTab employee={employee} /></TabsContent>
        <TabsContent value="account"><AccountTab employee={employee} /></TabsContent>
      </Tabs>
    </div>
  );
}
