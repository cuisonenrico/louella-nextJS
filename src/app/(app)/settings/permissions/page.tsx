'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronDown, ChevronRight, EyeOff, Loader2, Lock, Pencil, RotateCcw, Smartphone,
} from 'lucide-react';
import { permissionsApi, usersApi } from '@/lib/apiServices';
import type {
  UserRole, PermissionsMatrixFeature, PermissionRowMeta, UserPermissionRow,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import QueryError from '@/components/QueryError';
import { TableSkeleton } from '@/components/loading/Skeletons';

const DISPLAY_ROLES: UserRole[] = ['VIEWER', 'INVENTORY', 'MANAGER', 'ADMIN'];
const ROLE_LABELS: Record<string, string> = {
  VIEWER: 'Viewer', INVENTORY: 'Inventory', MANAGER: 'Manager', ADMIN: 'Admin',
};

/** Section headings, in the order the sidebar renders them. */
const GROUP_ORDER = ['Overview', 'Operations', 'Stock', 'Catalog', 'Config', 'Settings'];

type Node<T> = { row: T; children: T[] };

/**
 * Nest actions and panels under the screen they belong to.
 *
 * The API returns one flat list because the keys themselves are flat -
 * `products:delete` is stored and enforced exactly like `products`. The tree is
 * a presentation concern, rebuilt here from each row's `parent`.
 */
function buildTree<T extends PermissionRowMeta>(rows: T[]): Node<T>[] {
  const byParent = new Map<string, T[]>();
  const roots: T[] = [];
  for (const row of rows) {
    if (row.parent === null) {
      roots.push(row);
    } else {
      byParent.set(row.parent, [...(byParent.get(row.parent) ?? []), row]);
    }
  }
  return roots.map((row) => ({ row, children: byParent.get(row.key) ?? [] }));
}

function groupNodes<T extends PermissionRowMeta>(rows: T[]) {
  const buckets = new Map<string, Node<T>[]>();
  for (const node of buildTree(rows)) {
    // Mobile-only features have no sidebar group; they get their own section so
    // it is obvious they unlock nothing on the web.
    const key = node.row.group ?? 'Mobile app';
    buckets.set(key, [...(buckets.get(key) ?? []), node]);
  }
  return [...GROUP_ORDER, 'Mobile app']
    .filter((g) => buckets.has(g))
    .map((group) => ({ group, nodes: buckets.get(group)! }));
}

/** "3 actions · 2 panels", or null when a screen has no children. */
function childSummary(children: PermissionRowMeta[]): string | null {
  const actions = children.filter((c) => c.kind === 'action').length;
  const panels = children.filter((c) => c.kind === 'panel').length;
  const parts: string[] = [];
  if (actions) parts.push(`${actions} action${actions === 1 ? '' : 's'}`);
  if (panels) parts.push(`${panels} panel${panels === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : null;
}

function MobileBadge({ platform }: { platform: string }) {
  if (platform !== 'mobile') return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      </TooltipTrigger>
      <TooltipContent side="right">Mobile app only — unlocks no web screen</TooltipContent>
    </Tooltip>
  );
}

function LockedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[220px]">
        Admins cannot have this revoked — without it, the screen that undoes the
        change would be unreachable.
      </TooltipContent>
    </Tooltip>
  );
}

/** Marks a panel whose data the server withholds, not merely hides. */
function SensitiveBadge({ sensitivity }: { sensitivity: PermissionRowMeta['sensitivity'] }) {
  if (sensitivity !== 'sensitive') return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[240px]">
        Withheld by the server, not just hidden — the data never reaches the
        browser when this is off.
      </TooltipContent>
    </Tooltip>
  );
}

function KindIcon({ kind }: { kind: PermissionRowMeta['kind'] }) {
  if (kind !== 'action') return null;
  return <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/60" />;
}

export default function PermissionsPage() {
  usePageHeader({ title: 'Permissions' });
  return (
    <Tabs defaultValue="matrix">
      <TabsList className="mb-4">
        <TabsTrigger value="matrix">Role Permissions</TabsTrigger>
        <TabsTrigger value="users">User Overrides</TabsTrigger>
      </TabsList>
      <TabsContent value="matrix"><RoleMatrixTab /></TabsContent>
      <TabsContent value="users"><UserOverridesTab /></TabsContent>
    </Tabs>
  );
}

function RoleMatrixTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['permissions-matrix'],
    queryFn: () => permissionsApi.matrix().then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: ({ role, featureKey, enabled }: { role: UserRole; featureKey: string; enabled: boolean }) =>
      permissionsApi.setRolePermission(role, featureKey, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions-matrix'] });
      toast.success('Permission updated');
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Failed to update permission'),
  });

  if (isLoading) return <TableSkeleton rows={10} columns={5} className="py-4" />;
  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;

  const groups = groupNodes(data?.features ?? []);
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card className="overflow-hidden">
      {/* The matrix is six columns wide and the permission name is what makes a
          row identifiable, so it is frozen while the role columns scroll. The
          sticky cells carry a solid background — a translucent one shows the
          scrolling columns through it. */}
      <Table containerClassName="overflow-x-auto">
        <TableHeader>
          <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-80 bg-muted px-4 py-3 text-left font-semibold text-foreground sticky left-0 z-30 border-r border-border">
              Feature
            </TableHead>
            {DISPLAY_ROLES.map((r) => (
              <TableHead key={r} className="min-w-[120px] px-4 py-3 text-center font-semibold text-foreground">
                {ROLE_LABELS[r]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
            {groups.map(({ group, nodes }) => (
              <FeatureGroup
                key={group}
                group={group}
                nodes={nodes}
                expanded={expanded}
                onToggleExpanded={toggleExpanded}
                pending={mutation.isPending}
                onToggle={(role, featureKey, enabled) =>
                  mutation.mutate({ role, featureKey, enabled })
                }
              />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function FeatureGroup({
  group,
  nodes,
  expanded,
  onToggleExpanded,
  pending,
  onToggle,
}: {
  group: string;
  nodes: Node<PermissionsMatrixFeature>[];
  expanded: Set<string>;
  onToggleExpanded: (key: string) => void;
  pending: boolean;
  onToggle: (role: UserRole, featureKey: string, enabled: boolean) => void;
}) {
  return (
    <>
      <TableRow className="border-b bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={DISPLAY_ROLES.length + 1} className="px-4 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {group}
          </span>
        </TableCell>
      </TableRow>
      {nodes.map(({ row: f, children }) => {
        const isOpen = expanded.has(f.key);
        const summary = childSummary(children);
        return (
          // Keyed on the Fragment, not the TableRow inside it: the fragment is
          // the list child, so a key on its child does not identify it and
          // React reconciles rows by position.
          <Fragment key={f.key}>
            <TableRow className="border-b last:border-0">
              <TableCell className="px-4 py-3 sticky left-0 z-20 border-r border-border bg-card">
                <div className="flex items-center gap-1.5">
                  {children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onToggleExpanded(f.key)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${f.label}`}
                      className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
                    >
                      {isOpen
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span className="w-[18px]" />
                  )}
                  <p className="font-medium">{f.label}</p>
                  <MobileBadge platform={f.platform} />
                </div>
                {f.description && (
                  <p className="ml-[18px] text-xs text-muted-foreground">{f.description}</p>
                )}
                {summary && !isOpen && (
                  <button
                    type="button"
                    onClick={() => onToggleExpanded(f.key)}
                    className="ml-[18px] text-xs text-primary hover:underline"
                  >
                    {summary}
                  </button>
                )}
              </TableCell>
              {DISPLAY_ROLES.map((role) => (
                <MatrixCell
                  key={role}
                  role={role}
                  label={f.label}
                  featureKey={f.key}
                  state={f.roles[role]}
                  pending={pending}
                  onToggle={onToggle}
                />
              ))}
            </TableRow>

            {isOpen && children.map((c) => (
              <TableRow key={c.key} className="border-b bg-muted/20 last:border-0">
                <TableCell className="py-2 pl-12 pr-4 sticky left-0 z-20 border-r border-border bg-card">
                  <div className="flex items-center gap-1.5">
                    <KindIcon kind={c.kind} />
                    <p className="text-[13px]">{c.label}</p>
                    <SensitiveBadge sensitivity={c.sensitivity} />
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                  )}
                </TableCell>
                {DISPLAY_ROLES.map((role) => (
                  <MatrixCell
                    key={role}
                    role={role}
                    label={c.label}
                    featureKey={c.key}
                    state={c.roles[role]}
                    parentGranted={f.roles[role]?.effective ?? false}
                    minRole={c.minRole}
                    pending={pending}
                    onToggle={onToggle}
                  />
                ))}
              </TableRow>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function MatrixCell({
  role,
  label,
  featureKey,
  state,
  parentGranted = true,
  minRole,
  pending,
  onToggle,
}: {
  role: UserRole;
  label: string;
  featureKey: string;
  state: PermissionsMatrixFeature['roles'][string] | undefined;
  parentGranted?: boolean;
  minRole?: string | null;
  pending: boolean;
  onToggle: (role: UserRole, featureKey: string, enabled: boolean) => void;
}) {
  if (!state) return <TableCell />;

  // Two different reasons a switch cannot be used, and they need different
  // explanations: the role hierarchy would refuse the grant outright, or the
  // screen it belongs to is not granted so the child is inert either way.
  const unavailable = !state.available;
  const blockedByParent = !unavailable && !parentGranted;
  const disabled = pending || state.locked || unavailable || blockedByParent;

  const control = (
    <Switch
      checked={state.effective}
      disabled={disabled}
      aria-label={`${label} for ${ROLE_LABELS[role]}`}
      onCheckedChange={(v) => onToggle(role, featureKey, v)}
    />
  );

  return (
    <TableCell className="text-center px-4 py-3">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          {unavailable || blockedByParent ? (
            <Tooltip>
              <TooltipTrigger asChild><span>{control}</span></TooltipTrigger>
              <TooltipContent side="left" className="max-w-[220px]">
                {unavailable
                  ? `Endpoints for this action require ${minRole} or higher, so this role cannot hold it.`
                  : 'The screen this belongs to is not granted to this role, so this has no effect.'}
              </TooltipContent>
            </Tooltip>
          ) : control}
          {state.locked && <LockedBadge />}
        </div>
        {state.overridden && (
          <span className="text-[10px] font-semibold uppercase text-amber-600">
            Overridden
          </span>
        )}
      </div>
    </TableCell>
  );
}

function UserOverridesTab() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', 1, ''],
    queryFn: () => usersApi.list(1, 100).then((r) => r.data),
  });

  const {
    data: userMatrix,
    isLoading: matrixLoading,
    isError: matrixError,
    error: matrixErrorObj,
    refetch: refetchMatrix,
  } = useQuery({
    queryKey: ['user-matrix', selectedUserId],
    queryFn: () => permissionsApi.userMatrix(selectedUserId!).then((r) => r.data),
    enabled: selectedUserId !== null,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['user-matrix', selectedUserId] });
  const onError = (err: { response?: { data?: { message?: string } } }) =>
    toast.error(err?.response?.data?.message ?? 'Failed to update permission');

  const permMutation = useMutation({
    mutationFn: ({ userId, featureKey, enabled }: { userId: number; featureKey: string; enabled: boolean }) =>
      permissionsApi.setUserPermission(userId, featureKey, enabled),
    onSuccess: () => { invalidate(); toast.success('Permission updated'); },
    onError,
  });

  const resetMutation = useMutation({
    mutationFn: ({ userId, featureKey }: { userId: number; featureKey: string }) =>
      permissionsApi.resetUserPermission(userId, featureKey),
    onSuccess: () => { invalidate(); toast.success('Reset to role default'); },
    onError,
  });

  const users = usersData?.data ?? [];
  const selected = userMatrix?.user;
  const isPending = permMutation.isPending || resetMutation.isPending;

  return (
    <div className="flex gap-4">
      <Card className="w-64 shrink-0 overflow-hidden">
        <div className="p-3 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Select User
          </p>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {usersLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                className={cn(
                  'w-full border-b px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-muted/50',
                  selectedUserId === u.id && 'bg-primary/10 font-semibold',
                )}
                onClick={() => setSelectedUserId(u.id)}
              >
                <p className="truncate">{u.email}</p>
                <p className="text-xs text-muted-foreground">{u.role}</p>
              </button>
            ))
          )}
        </div>
      </Card>

      <div className="flex-1">
        {selectedUserId === null ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Select a user to view and edit their permission overrides.
          </div>
        ) : (
          <Card>
            {selected && (
              <div className="border-b p-4">
                <p className="font-semibold">{selected.email}</p>
                <p className="text-xs text-muted-foreground">
                  Role: {selected.role} · {selected.isActive ? 'Active' : 'Disabled'}
                </p>
              </div>
            )}
            <div className="space-y-2 p-4">
              {matrixLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : matrixError ? (
                <QueryError error={matrixErrorObj} onRetry={() => refetchMatrix()} />
              ) : (
                groupNodes(userMatrix?.features ?? []).map(({ group, nodes }) => (
                  <div key={group}>
                    <p className="mb-1 mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground first:mt-0">
                      {group}
                    </p>
                    <div className="space-y-2">
                      {nodes.map(({ row, children }) => (
                        <div key={row.key} className="space-y-1">
                          <UserFeatureRow
                            row={row}
                            isPending={isPending}
                            onToggle={(enabled) =>
                              permMutation.mutate({ userId: selectedUserId, featureKey: row.key, enabled })
                            }
                            onReset={() =>
                              resetMutation.mutate({ userId: selectedUserId, featureKey: row.key })
                            }
                          />
                          {children.length > 0 && (
                            <div className="ml-6 space-y-1">
                              {children.map((c) => (
                                <UserFeatureRow
                                  key={c.key}
                                  row={c}
                                  nested
                                  isPending={isPending}
                                  onToggle={(enabled) =>
                                    permMutation.mutate({ userId: selectedUserId, featureKey: c.key, enabled })
                                  }
                                  onReset={() =>
                                    resetMutation.mutate({ userId: selectedUserId, featureKey: c.key })
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function UserFeatureRow({
  row,
  nested = false,
  isPending,
  onToggle,
  onReset,
}: {
  row: UserPermissionRow;
  nested?: boolean;
  isPending: boolean;
  onToggle: (enabled: boolean) => void;
  onReset: () => void;
}) {
  const overridden = row.userOverride !== null;
  const unavailable = !row.available;
  const blockedByParent = !unavailable && !row.parentEffective;
  const disabled = isPending || row.locked || unavailable || blockedByParent;

  const control = (
    <Switch
      checked={row.effective}
      disabled={disabled}
      aria-label={row.label}
      onCheckedChange={onToggle}
    />
  );

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
        nested && 'border-dashed bg-muted/20 py-1.5',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <KindIcon kind={row.kind} />
          <p className={cn('truncate font-medium', nested ? 'text-[13px]' : 'text-sm')}>
            {row.label}
          </p>
          <MobileBadge platform={row.platform} />
          <SensitiveBadge sensitivity={row.sensitivity} />
          {overridden && (
            <Badge variant="outline" className="shrink-0 border-amber-300 px-1 py-0 text-[10px] text-amber-600">
              Override
            </Badge>
          )}
        </div>
        {row.description && (
          <p className="truncate text-xs text-muted-foreground">{row.description}</p>
        )}
        {overridden && (
          <p className="text-xs text-muted-foreground">
            Role default: {row.roleEffective ? 'enabled' : 'disabled'}
          </p>
        )}
        {blockedByParent && (
          <p className="text-xs text-muted-foreground">
            No effect while the screen it belongs to is not granted.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {unavailable ? (
          <Tooltip>
            <TooltipTrigger asChild><span>{control}</span></TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Endpoints for this action require {row.minRole} or higher, so this
              account&apos;s role cannot hold it.
            </TooltipContent>
          </Tooltip>
        ) : control}
        {row.locked && <LockedBadge />}
        {overridden && !row.locked && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isPending}
                onClick={onReset}
                aria-label={`Reset ${row.label} to role default`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset to role default</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
