'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Search, Plus, Pencil, KeyRound, Power, ShieldCheck, Loader2, GitBranch,
} from 'lucide-react';
import { usersApi, branchesApi, permissionsApi } from '@/lib/apiServices';
import type { Branch, User, UserRole, UserPermissionRow } from '@/types';
import { ROLE_DEFAULTS, FEATURE_LIST, type RoleName } from '@/lib/rbac/features';
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
import { cn } from '@/lib/utils';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';

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
  usePageHeader({ title: 'User Management' });
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search);

  // ── Create dialog ──
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '', password: '', role: 'VIEWER' as UserRole, branchId: '' as string, mustChangePassword: true,
  });
  // Per-user overrides ticked before the account exists. Applied immediately
  // after creation, so an admin never has to go and find the Permissions tab to
  // finish provisioning someone.
  const [createOverrides, setCreateOverrides] = useState<Record<string, boolean>>({});
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
  const { data: usersData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-users', page, debouncedSearch],
    queryFn: () => usersApi.list(page, 20, debouncedSearch || undefined).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  // Drives the create dialog's access preview, so it is fetched up front rather
  // than only when the permissions drawer opens.
  const { data: matrix } = useQuery({
    queryKey: ['permissions-matrix'],
    queryFn: () => permissionsApi.matrix().then((r) => r.data),
  });

  const { data: userMatrix, isLoading: userMatrixLoading } = useQuery({
    queryKey: ['user-matrix', permTarget?.id],
    queryFn: () => permissionsApi.userMatrix(permTarget!.id).then((r) => r.data),
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

  const permErr = (err: unknown) => {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    toast.error(msg ?? 'Failed to update permission');
  };

  const permMutation = useMutation({
    mutationFn: ({ userId, featureKey, enabled }: { userId: number; featureKey: string; enabled: boolean }) =>
      permissionsApi.setUserPermission(userId, featureKey, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-matrix'] });
      toast.success('Permission updated');
    },
    onError: permErr,
  });

  const resetPermMutation = useMutation({
    mutationFn: ({ userId, featureKey }: { userId: number; featureKey: string }) =>
      permissionsApi.resetUserPermission(userId, featureKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-matrix'] });
      toast.success('Permission reset to role default');
    },
    onError: permErr,
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
      onSuccess: async (res) => {
        // Overrides can only be written once the account has an id, so they are
        // applied here rather than being part of the create payload. A failure
        // is surfaced but does not undo the account, which already exists.
        const created = res.data;
        const pending = Object.entries(createOverrides);
        if (pending.length > 0) {
          try {
            await Promise.all(
              pending.map(([featureKey, enabled]) =>
                permissionsApi.setUserPermission(created.id, featureKey, enabled),
              ),
            );
            toast.success(`Applied ${pending.length} permission override(s)`);
          } catch {
            toast.error('Account created, but some permission overrides failed to apply');
          }
        }
        setGeneratedPw(createForm.password);
        setCreateForm({ email: '', password: '', role: 'VIEWER', branchId: '', mustChangePassword: true });
        setCreateOverrides({});
      },
    });
  };

  const openCreate = () => {
    setCreateError('');
    setGeneratedPw('');
    setCreateForm({ email: '', password: '', role: 'VIEWER', branchId: '', mustChangePassword: true });
    setCreateOverrides({});
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
    <>
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
                <TableRowsSkeleton rows={6} columns={6} />
              ) : isError ? (
                <TableRow><TableCell colSpan={6} className="p-0"><QueryError error={error} onRetry={() => refetch()} /></TableCell></TableRow>
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
                        <Button variant="ghost" size="icon" className="size-11 md:size-8" onClick={() => openRole(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent>Edit Role</TooltipContent></Tooltip>

                      {u.role === 'MANAGER' && (
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-11 md:size-8" onClick={() => openBranch(u)}>
                            <GitBranch className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger><TooltipContent>Assign Branch</TooltipContent></Tooltip>
                      )}

                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-11 md:size-8" onClick={() => openReset(u)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent>Reset Password</TooltipContent></Tooltip>

                      <Tooltip><TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          className={`size-11 md:size-8 ${u.isActive ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-700'}`}
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: u.id, isActive: !u.isActive })}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent>{u.isActive ? 'Deactivate' : 'Activate'}</TooltipContent></Tooltip>

                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-11 md:size-8" onClick={() => setPermTarget(u)}>
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
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

                <AccessPreview
                  role={createForm.role}
                  roleMatrix={matrix?.features ?? []}
                  overrides={createOverrides}
                  onToggle={(key, enabled, roleGrants) =>
                    setCreateOverrides((prev) => {
                      const next = { ...prev };
                      // Ticking a box back to what the role already gives is not
                      // an override — drop it so the account keeps inheriting.
                      if (enabled === roleGrants) delete next[key];
                      else next[key] = enabled;
                      return next;
                    })
                  }
                />
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
              rows={userMatrix?.features ?? []}
              isLoading={userMatrixLoading}
              onToggle={(featureKey, enabled) => permTarget && permMutation.mutate({ userId: permTarget.id, featureKey, enabled })}
              onReset={(featureKey) => permTarget && resetPermMutation.mutate({ userId: permTarget.id, featureKey })}
              isPending={permMutation.isPending || resetPermMutation.isPending}
            />
          </SheetContent>
        </Sheet>
      </>
  );
}

/**
 * Shows what an account will be able to reach, before it exists.
 *
 * The baseline comes from the live role matrix so that any role-level override
 * an admin has already made is reflected; ROLE_DEFAULTS is the fallback for the
 * moment before that query resolves. Ticking a box records a per-user override,
 * which is written straight after the account is created.
 */
function AccessPreview({
  role,
  roleMatrix,
  overrides,
  onToggle,
}: {
  role: UserRole;
  roleMatrix: { key: string; label: string; group: string | null; platform: string; roles: Record<string, { effective: boolean }> }[];
  overrides: Record<string, boolean>;
  onToggle: (key: string, enabled: boolean, roleGrants: boolean) => void;
}) {
  const roleGrantsKey = (key: string): boolean => {
    const row = roleMatrix.find((f) => f.key === key);
    if (row) return row.roles[role]?.effective ?? false;
    return (ROLE_DEFAULTS[role as RoleName] ?? []).includes(key as never);
  };

  const screens = FEATURE_LIST.filter((f) => f.nav);
  const granted = screens.filter((f) => overrides[f.key] ?? roleGrantsKey(f.key));
  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          This account will see
        </p>
        <p className="text-xs text-muted-foreground">
          {granted.length} of {screens.length} screens
          {overrideCount > 0 && ` · ${overrideCount} override${overrideCount === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
        {screens.map((f) => {
          const roleGrants = roleGrantsKey(f.key);
          const checked = overrides[f.key] ?? roleGrants;
          const isOverride = f.key in overrides;
          return (
            <label
              key={f.key}
              className="flex cursor-pointer items-center gap-2 text-xs"
              title={f.description}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 accent-primary"
                checked={checked}
                aria-label={f.label}
                onChange={(e) => onToggle(f.key, e.target.checked, roleGrants)}
              />
              <span className={cn('truncate', isOverride && 'font-semibold text-amber-600')}>
                {f.nav?.label ?? f.label}
              </span>
            </label>
          );
        })}
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Unticked boxes come from the <strong>{ROLE_LABELS[role]}</strong> role.
        Changing one here creates an override for this account only.
      </p>
    </div>
  );
}

/**
 * Per-user override drawer.
 *
 * Reads GET /permissions/users/:id/matrix, which returns one row per feature for
 * this account. It previously read the ROLE matrix and indexed it by the user's
 * role, which rendered plausibly but could not distinguish "inherited from the
 * role" from "overridden for this person".
 */
function UserPermissionsPanel({
  user,
  rows,
  isLoading,
  onToggle,
  onReset,
  isPending,
}: {
  user: User | null;
  rows: UserPermissionRow[];
  isLoading: boolean;
  onToggle: (featureKey: string, enabled: boolean) => void;
  onReset: (featureKey: string) => void;
  isPending: boolean;
}) {
  if (!user) return null;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Overrides apply on top of the <strong>{user.role}</strong> role defaults.
        Toggle to override; reset to restore the role default.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {rows.map((f) => {
        const overridden = f.userOverride !== null;
        return (
          <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.label}</p>
              <p className="truncate text-xs text-muted-foreground">{f.description}</p>
              {overridden && (
                <span className="text-[10px] font-semibold uppercase text-amber-600">
                  Overridden (role default: {f.roleEffective ? 'on' : 'off'})
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                checked={f.effective}
                disabled={isPending || f.locked}
                aria-label={f.label}
                onCheckedChange={(v) => onToggle(f.key, v)}
              />
              {overridden && !f.locked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isPending}
                  onClick={() => onReset(f.key)}
                >
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
