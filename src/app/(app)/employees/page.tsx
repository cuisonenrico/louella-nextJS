'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Tags } from 'lucide-react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { employeesApi } from '@/lib/apiServices';
import { peso, restDaysLabel } from '@/lib/payroll/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';
import { EmployeeFormDialog } from './_components/EmployeeFormDialog';
import { JobRolesDialog } from './_components/JobRolesDialog';

type StatusFilter = 'active' | 'separated' | 'all';

export default function EmployeesPage() {
  usePageHeader({ title: 'Employees' });
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);

  const { data: employees = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employees', status],
    queryFn: () => employeesApi.list({ status }).then((r) => r.data),
  });
  const term = search.trim().toLowerCase();
  const filtered = employees.filter((e) => e.fullName.toLowerCase().includes(term));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Input placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-64" />
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-36" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="separated">Separated</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRolesOpen(true)}><Tags className="mr-2 h-4 w-4" />Job roles</Button>
          <Button onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />Add employee</Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Job role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Daily rate</TableHead>
              <TableHead>Rest days</TableHead>
              <TableHead>Login</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton rows={6} columns={7} />
            ) : isError ? (
              <TableRow><TableCell colSpan={7} className="p-0"><QueryError error={error} onRetry={() => refetch()} /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No employees found.</TableCell></TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-semibold">
                    <Link href={`/employees/${e.id}`} className="hover:underline">{e.fullName}</Link>
                  </TableCell>
                  <TableCell>{e.jobRole.name}</TableCell>
                  <TableCell>{e.branch?.name ?? 'Central kitchen'}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.currentDailyRate === null ? '—' : peso(e.currentDailyRate)}</TableCell>
                  <TableCell>{restDaysLabel(e.restDays)}</TableCell>
                  <TableCell>
                    {e.account ? (
                      <span className={e.account.isActive ? '' : 'text-muted-foreground line-through'}>
                        {e.account.email} · {e.account.role}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.isActive ? 'default' : 'secondary'}>{e.isActive ? 'Active' : 'Separated'}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {adding && <EmployeeFormDialog open onOpenChange={setAdding} />}
      <JobRolesDialog open={rolesOpen} onOpenChange={setRolesOpen} />
    </>
  );
}
