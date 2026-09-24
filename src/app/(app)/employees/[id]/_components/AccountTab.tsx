'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { branchesApi, employeesApi, usersApi } from '@/lib/apiServices';
import type { Employee, UserRole } from '@/types';
import { extractError } from '@/lib/errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** ADMIN is not offered: granting it stays a deliberate Users-screen action. */
const LOGIN_ROLES: UserRole[] = ['USER', 'VIEWER', 'INVENTORY', 'MANAGER'];

export function AccountTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('VIEWER');
  const [branchId, setBranchId] = useState(employee.branch ? String(employee.branch.id) : '');
  const [linkUserId, setLinkUserId] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['employee', employee.id] });
    qc.invalidateQueries({ queryKey: ['employees'] });
  };
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
    enabled: role === 'MANAGER',
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'link-picker'],
    queryFn: () => usersApi.list(1, 100).then((r) => r.data.data),
    enabled: employee.account === null,
  });

  const create = useMutation({
    mutationFn: () =>
      employeesApi.createAccount(employee.id, {
        email: email.trim(),
        password,
        role,
        branchId: role === 'MANAGER' && branchId ? Number(branchId) : undefined,
      }),
    onSuccess: () => { setPassword(''); refresh(); toast.success('Login created — they must change the password at first sign-in'); },
    onError: (err) => toast.error(extractError(err)),
  });
  const link = useMutation({
    mutationFn: () => employeesApi.linkAccount(employee.id, Number(linkUserId)),
    onSuccess: () => { refresh(); toast.success('Login linked'); },
    onError: (err) => toast.error(extractError(err)),
  });
  const deactivate = useMutation({
    mutationFn: () => employeesApi.deactivateAccount(employee.id),
    onSuccess: () => { refresh(); toast.success('Login deactivated'); },
    onError: (err) => toast.error(extractError(err)),
  });

  if (employee.account) {
    const account = employee.account;
    return (
      <Card className="space-y-3 p-4">
        <p className="font-medium">{account.email}</p>
        <div className="flex gap-2">
          <Badge variant="outline">{account.role}</Badge>
          <Badge variant={account.isActive ? 'default' : 'secondary'}>{account.isActive ? 'Active' : 'Deactivated'}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Change the role or reset the password from Settings → Users.</p>
        {account.isActive && (
          <Button variant="destructive" disabled={deactivate.isPending} onClick={() => deactivate.mutate()}>Deactivate login</Button>
        )}
      </Card>
    );
  }

  const canCreate = email.trim() !== '' && password.length >= 8;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Create a login</h3>
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">Temporary password (8+ characters)</Label>
          <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Access level</Label>
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger aria-label="Access level"><SelectValue /></SelectTrigger>
            <SelectContent>{LOGIN_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {role === 'MANAGER' && (
          <div className="space-y-2">
            <Label>Managed branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger aria-label="Managed branch"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <Button disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>Create login</Button>
      </Card>

      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Link an existing login</h3>
        <Select value={linkUserId} onValueChange={setLinkUserId}>
          <SelectTrigger aria-label="Existing login"><SelectValue placeholder="Choose a login…" /></SelectTrigger>
          <SelectContent>
            {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.email} · {u.role}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={!linkUserId || link.isPending} onClick={() => link.mutate()}>Link login</Button>
      </Card>
    </div>
  );
}
