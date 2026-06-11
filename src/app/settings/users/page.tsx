'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Search, Plus, Pencil, KeyRound, Power, ShieldCheck, Loader2, GitBranch,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { usersApi, branchesApi, permissionsApi } from '@/lib/apiServices';
import type { Branch, User, UserRole, PermissionsMatrixFeature } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const ROLES: UserRole[] = ['VIEWER', 'INVENTORY', 'MANAGER', 'ADMIN'];
const ROLE_LABELS: Record<string, string> = {
  USER: 'User', VIEWER: 'Viewer', INVENTORY: 'Inventory', MANAGER: 'Manager', ADMIN: 'Admin',
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700 border-red-200',
  MANAGER: 'bg-blue-100 text-blue-700 border-blue-200',
  INVENTORY: 'bg-green-100 text-green-700 border-green-200',
  VIEWER: 'bg-gray-100 text-gray-700 border-gray-200',
  USER: 'bg-gray-100 text-gray-500 border-gray-200',
};

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join('');
}

function useDebounce<T>(value: T, delay = 300): T {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search);

  // ── Create dialog ──
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '', password: '', role: 'VIEWER' as UserRole, branchId: '' as string, mustChangePassword: true,
  });
  const [createError, setCreateError] = useState('');
  const [generatedPw, setGeneratedPw] = useState('');

  // ── Edit Role dialog ──
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('VIEWER');
  const [roleError, setRoleError] = useState('');

  // ── Assign Branch dialog ──
  const [branchTarget, setBranchTarget] = useState<User | null>(null);
  const [newBranchId, setNewBranchId] = useState<string>('null');
  const [branchError, setBranchError] = useState('');

  // ── Reset Password dialog ──
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPw, setNewPw] = useState('');
  const [resetError, setResetError] = useState('');

  // ── Permissions drawer ──
  const [permTarget, setPermTarget] = useState<User | null>(null);

  // ── Queries ──
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users', page, debouncedSearch],
    queryFn: () => usersApi.list(page, 20, debouncedSearch || undefined).then((r) => r.data),
  });

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const { data: matrix } = useQuery({
    queryKey: ['permissions-matrix'],
    queryFn: () => permissionsApi.matrix().then((r) => r.data),
    enabled: !!permTarget,
  });

  // branches without a manager (for assign/create dropdowns)
  const unassignedBranches = branches.filter(
    (b) => !b.manager || (branchTarget && b.manager.id === branchTarget.id),
  );
  const createUnassignedBranches = branches.filter((b) => !b.manager);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.create>[0]) => usersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('User created');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to create user.');
      setCreateError(text);
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: UserRole }) => usersApi.updateRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['branches'] });
      setRoleTarget(null);
      toast.success('Role updated');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setRoleError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to update role.'));
    },
  });

  const branchMutation = useMutation({
    mutationFn: ({ id, branchId }: { id: number; branchId: number | null }) => usersApi.updateBranch(id, branchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['branches'] });
      setBranchTarget(null);
      toast.success('Branch assignment updated');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setBranchError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to assign branch.'));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => usersApi.setActive(id, isActive),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(vars.isActive ? 'Account activated' : 'Account deactivated');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to update status.'));
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) => usersApi.resetPassword(id, newPassword),
    onSuccess: () => {
      setResetTarget(null);
      toast.success('Password reset — user will be required to change on next login');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setResetError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to reset password.'));
    },
  });

  const permMutation = useMutation({
    mutationFn: ({ userId, featureKey, enabled }: { userId: number; featureKey: string; enabled: boolean }) =>
      permissionsApi.setUserPermission(userId, featureKey, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions-matrix'] });
      toast.success('Permission updated');
    },
    onError: () => toast.error('Failed to update permission'),
  });

  const resetPermMutation = useMutation({
    mutationFn: ({ userId, featureKey }: { userId: number; featureKey: string }) =>
      permissionsApi.resetUserPermission(userId, featureKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions-matrix'] });
      toast.success('Permission reset to role default');
    },
    onError: () => toast.error('Failed to reset permission'),
  });

  // ── Handlers ──
  const handleCreate = () => {
    setCreateError('');
    if (!createForm.email) { setCreateError('Email is required.'); return; }
    if (!createForm.password) { setCreateError('Password is required.'); return; }
    const data: Parameters<typeof usersApi.create>[0] = {
      email: createForm.email,
      password: createForm.password,
      role: createForm.role,
      mustChangePassword: createForm.mustChangePassword,
      ...(createForm.role === 'MANAGER' && createForm.branchId && createForm.branchId !== 'null'
        ? { branchId: Number(createForm.branchId) }
        : {}),
    };
    createMutation.mutate(data, {
      onSuccess: () => {
        setGeneratedPw(createForm.password);
        setCreateForm({ email: '', password: '', role: 'VIEWER', branchId: '', mustChangePassword: true });
      },
    });
  };

  const openCreate = () => {
    setCreateError('');
    setGeneratedPw('');
    setCreateForm({ email: '', password: '', role: 'VIEWER', branchId: '', mustChangePassword: true });
    setCreateOpen(true);
  };

  const openRole = (u: User) => {
    setNewRole(u.role);
    setRoleError('');
    setRoleTarget(u);
  };

  const openBranch = (u: User) => {
    setNewBranchId(u.branchId != null ? String(u.branchId) : 'null');
    setBranchError('');
    setBranchTarget(u);
  };

  const openReset = (u: User) => {
    setNewPw('');
    setResetError('');
    setResetTarget(u);
  };

  const generateAndSet = useCallback(() => {
    const pw = generatePassword();
    setCreateForm((f) => ({ ...f, password: pw }));
  }, []);

  const users = usersData?.data ?? [];
  const totalPages = usersData?.totalPages ?? 1;

  return (
    <AuthGuard>
      <AppLayout title="User Management">
        {/* Toolbar */}
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create User</Button>
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found.</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${ROLE_COLORS[u.role] ?? ''}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.role === 'MANAGER' ? (u.managedBranch?.name ?? 'Unassigned') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'default' : 'secondary'}>{u.isActive ? 'Active' : 'Disabled'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.createdBy?.email ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRole(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent>Edit Role</TooltipContent></Tooltip>

                      {u.role === 'MANAGER' && (
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openBranch(u)}>
                            <GitBranch className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger><TooltipContent>Assign Branch</TooltipContent></Tooltip>
                      )}

                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openReset(u)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent>Reset Password</TooltipContent></Tooltip>

                      <Tooltip><TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          className={`h-8 w-8 ${u.isActive ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-700'}`}
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: u.id, isActive: !u.isActive })}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent>{u.isActive ? 'Deactivate' : 'Activate'}</TooltipContent></Tooltip>

                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPermTarget(u)}>
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent>Permissions</TooltipContent></Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="flex items-center text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}

        {/* ─── Create User Dialog ──────────────────────────── */}
        <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setGeneratedPw(''); setCreateOpen(o); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
            {generatedPw ? (
              <div className="space-y-4 py-2">
                <Alert>
                  <AlertDescription>
                    <p className="font-semibold mb-1">User created. Share this temporary password:</p>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="flex-1 bg-muted px-3 py-1.5 rounded text-sm font-mono break-all">{generatedPw}</code>
                      <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedPw); toast.success('Copied'); }}>
                        Copy
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {createError && <Alert variant="destructive"><AlertDescription>{createError}</AlertDescription></Alert>}
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as UserRole, branchId: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {createForm.role === 'MANAGER' && (
                  <div className="space-y-2">
                    <Label>Branch (optional)</Label>
                    <Select value={createForm.branchId || 'null'} onValueChange={(v) => setCreateForm((f) => ({ ...f, branchId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">Unassigned</SelectItem>
                        {createUnassignedBranches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Temporary Password</Label>
                  <div className="flex gap-2">
                    <Input
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 8 characters"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={generateAndSet} className="shrink-0">Generate</Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="mcp"
                    checked={createForm.mustChangePassword}
                    onCheckedChange={(v) => setCreateForm((f) => ({ ...f, mustChangePassword: v }))}
                  />
                  <Label htmlFor="mcp">Require password change on first login</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              {generatedPw ? (
                <Button onClick={() => { setGeneratedPw(''); setCreateOpen(false); }}>Done</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Edit Role Dialog ─────────────────────────────── */}
        <Dialog open={!!roleTarget} onOpenChange={(o) => !o && setRoleTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Edit Role — {roleTarget?.email}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {roleError && <Alert variant="destructive"><AlertDescription>{roleError}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {roleTarget?.role === 'MANAGER' && newRole !== 'MANAGER' && (
                <p className="text-sm text-muted-foreground">Branch assignment will be cleared when changing away from Manager role.</p>
              )}
              {roleTarget?.role !== 'MANAGER' && newRole === 'MANAGER' && (
                <p className="text-sm text-muted-foreground">Branch can be assigned from the users table after saving.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleTarget(null)}>Cancel</Button>
              <Button
                onClick={() => roleTarget && roleMutation.mutate({ id: roleTarget.id, role: newRole })}
                disabled={roleMutation.isPending}
              >
                {roleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Assign Branch Dialog ─────────────────────────── */}
        <Dialog open={!!branchTarget} onOpenChange={(o) => !o && setBranchTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Assign Branch — {branchTarget?.email}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {branchError && <Alert variant="destructive"><AlertDescription>{branchError}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={newBranchId} onValueChange={setNewBranchId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">Unassigned</SelectItem>
                    {unassignedBranches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBranchTarget(null)}>Cancel</Button>
              <Button
                onClick={() => branchTarget && branchMutation.mutate({
                  id: branchTarget.id,
                  branchId: newBranchId === 'null' ? null : Number(newBranchId),
                })}
                disabled={branchMutation.isPending}
              >
                {branchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Reset Password Dialog ────────────────────────── */}
        <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Reset Password — {resetTarget?.email}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {resetError && <Alert variant="destructive"><AlertDescription>{resetError}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label>New Password</Label>
                <div className="flex gap-2">
                  <Input
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Min. 8 characters"
                  />
                  <Button type="button" variant="outline" size="sm" className="shrink-0"
                    onClick={() => setNewPw(generatePassword())}>
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">User will be required to change this on next login.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
              <Button
                onClick={() => resetTarget && resetMutation.mutate({ id: resetTarget.id, newPassword: newPw })}
                disabled={resetMutation.isPending || newPw.length < 8}
              >
                {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── User Permissions Drawer ──────────────────────── */}
        <Sheet open={!!permTarget} onOpenChange={(o) => !o && setPermTarget(null)}>
          <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Permissions — {permTarget?.email}</SheetTitle>
            </SheetHeader>
            <UserPermissionsPanel
              user={permTarget}
              matrix={matrix?.features ?? []}
              onToggle={(featureKey, enabled) => permTarget && permMutation.mutate({ userId: permTarget.id, featureKey, enabled })}
              onReset={(featureKey) => permTarget && resetPermMutation.mutate({ userId: permTarget.id, featureKey })}
              isPending={permMutation.isPending || resetPermMutation.isPending}
            />
          </SheetContent>
        </Sheet>
      </AppLayout>
    </AuthGuard>
  );
}

function UserPermissionsPanel({
  user,
  matrix,
  onToggle,
  onReset,
  isPending,
}: {
  user: User | null;
  matrix: PermissionsMatrixFeature[];
  onToggle: (featureKey: string, enabled: boolean) => void;
  onReset: (featureKey: string) => void;
  isPending: boolean;
}) {
  if (!user) return null;

  const role = user.role;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Overrides apply on top of the <strong>{role}</strong> role defaults. Toggle to override; reset to restore the role default.
      </p>
      {matrix.length === 0 && (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}
      {matrix.map((f) => {
        const roleState = f.roles[role];
        if (!roleState) return null;
        const { effective, overridden, default: def } = roleState;
        return (
          <div key={f.key} className="flex items-center justify-between rounded-lg border px-3 py-2 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{f.label}</p>
              <p className="text-xs text-muted-foreground truncate">{f.description}</p>
              {overridden && (
                <span className="text-[10px] font-semibold uppercase text-amber-600">
                  Overridden (default: {def ? 'on' : 'off'})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={effective}
                disabled={isPending}
                onCheckedChange={(v) => onToggle(f.key, v)}
              />
              {overridden && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" disabled={isPending} onClick={() => onReset(f.key)}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
