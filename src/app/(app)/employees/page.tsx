'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, Tags } from 'lucide-react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { companiesApi, employeesApi } from '@/lib/apiServices';
import { peso, restDaysLabel } from '@/lib/payroll/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';
import { EmployeeFormDialog } from './_components/EmployeeFormDialog';
import { JobRolesDialog } from './_components/JobRolesDialog';
import { CompaniesDialog } from './_components/CompaniesDialog';
import { AssignCompanyDialog } from './_components/AssignCompanyDialog';

type StatusFilter = 'active' | 'separated' | 'all';
/** 'all', 'none' (no company) or a company id. */
type CompanyFilter = string;

export default function EmployeesPage() {
  usePageHeader({ title: 'Employees' });
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [company, setCompany] = useState<CompanyFilter>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const { data: employees = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employees', status],
    queryFn: () => employeesApi.list({ status }).then((r) => r.data),
  });
  const { data: companies = [] } = useQuery({
    queryKey: ['companies', 'all'],
    queryFn: () => companiesApi.list(true).then((r) => r.data),
  });
  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.fullName.toLowerCase().includes(term) &&
          (company === 'all' || (company === 'none' ? e.company === null : e.company?.id === Number(company))),
      ),
    [employees, term, company],
  );
  // Only rows still on screen count as selected.
  const selectedIds = filtered.filter((e) => selected.has(e.id)).map((e) => e.id);
  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;
  const toggleOne = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((e) => e.id)));

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
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="w-52" aria-label="Company filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              <SelectItem value="none">No company</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedIds.length > 0 && (
            <Button variant="secondary" onClick={() => setAssigning(true)}>
              Assign company ({selectedIds.length})
            </Button>
          )}
          <Button variant="outline" onClick={() => setCompaniesOpen(true)}><Building2 className="mr-2 h-4 w-4" />Companies</Button>
          <Button variant="outline" onClick={() => setRolesOpen(true)}><Tags className="mr-2 h-4 w-4" />Job roles</Button>
          <Button onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />Add employee</Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all employees" />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Job role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="text-right">Daily rate</TableHead>
              <TableHead>Rest days</TableHead>
              <TableHead>Login</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton rows={6} columns={9} />
            ) : isError ? (
              <TableRow><TableCell colSpan={9} className="p-0"><QueryError error={error} onRetry={() => refetch()} /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No employees found.</TableCell></TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id} data-state={selected.has(e.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(e.id)}
                      onCheckedChange={() => toggleOne(e.id)}
                      aria-label={`Select ${e.fullName}`}
                    />
                  </TableCell>
                  <TableCell className="font-semibold">
                    <Link href={`/employees/${e.id}`} className="hover:underline">{e.fullName}</Link>
                  </TableCell>
                  <TableCell>{e.jobRole.name}</TableCell>
                  <TableCell>{e.branch?.name ?? 'Central kitchen'}</TableCell>
                  <TableCell>{e.company?.name ?? <span className="text-muted-foreground">Not assigned</span>}</TableCell>
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
      <CompaniesDialog open={companiesOpen} onOpenChange={setCompaniesOpen} />
      {assigning && (
        <AssignCompanyDialog
          employeeIds={selectedIds}
          onOpenChange={setAssigning}
          onAssigned={() => { setAssigning(false); setSelected(new Set()); }}
        />
      )}
    </>
  );
}
