'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { permissionsApi, usersApi } from '@/lib/apiServices';
import type { UserRole, PermissionsMatrixFeature } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const DISPLAY_ROLES: UserRole[] = ['VIEWER', 'INVENTORY', 'MANAGER', 'ADMIN'];
const ROLE_LABELS: Record<string, string> = {
  VIEWER: 'Viewer', INVENTORY: 'Inventory', MANAGER: 'Manager', ADMIN: 'Admin',
};

export default function PermissionsPage() {
  return (
    <AuthGuard>
      <AppLayout title="Permissions">
        <Tabs defaultValue="matrix">
          <TabsList className="mb-4">
            <TabsTrigger value="matrix">Role Permissions</TabsTrigger>
            <TabsTrigger value="users">User Overrides</TabsTrigger>
          </TabsList>
          <TabsContent value="matrix"><RoleMatrixTab /></TabsContent>
          <TabsContent value="users"><UserOverridesTab /></TabsContent>
        </Tabs>
      </AppLayout>
    </AuthGuard>
  );
}

function RoleMatrixTab() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
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
    onError: () => toast.error('Failed to update permission'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const features = data?.features ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-semibold w-64">Feature</th>
              {DISPLAY_ROLES.map((r) => (
                <th key={r} className="text-center px-4 py-3 font-semibold min-w-[120px]">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f, i) => (
              <tr key={f.key} className={cn('border-b last:border-0', i % 2 === 1 && 'bg-muted/20')}>
                <td className="px-4 py-3">
                  <p className="font-medium">{f.label}</p>
                  {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                </td>
                {DISPLAY_ROLES.map((role) => {
                  const state = f.roles[role];
                  if (!state) return <td key={role} />;
                  return (
                    <td key={role} className="text-center px-4 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <Switch
                          checked={state.effective}
                          disabled={mutation.isPending}
                          onCheckedChange={(v) => mutation.mutate({ role, featureKey: f.key, enabled: v })}
                        />
                        {state.overridden && (
                          <span className="text-[10px] font-semibold text-amber-600 uppercase">
                            Overridden
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UserOverridesTab() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', 1, ''],
    queryFn: () => usersApi.list(1, 100).then((r) => r.data),
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ['permissions-matrix'],
    queryFn: () => permissionsApi.matrix().then((r) => r.data),
  });

  const permMutation = useMutation({
    mutationFn: ({ userId, featureKey, enabled }: { userId: number; featureKey: string; enabled: boolean }) =>
      permissionsApi.setUserPermission(userId, featureKey, enabled),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permissions-matrix'] }); toast.success('Permission updated'); },
    onError: () => toast.error('Failed to update permission'),
  });

  const resetMutation = useMutation({
    mutationFn: ({ userId, featureKey }: { userId: number; featureKey: string }) =>
      permissionsApi.resetUserPermission(userId, featureKey),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permissions-matrix'] }); toast.success('Permission reset'); },
    onError: () => toast.error('Failed to reset permission'),
  });

  const users = usersData?.data ?? [];
  const selectedUser = users.find((u) => u.id === selectedUserId);
  const features = matrix?.features ?? [];
  const isPending = permMutation.isPending || resetMutation.isPending;

  return (
    <div className="flex gap-4">
      {/* User list */}
      <Card className="w-64 shrink-0 overflow-hidden">
        <div className="p-3 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select User</p>
        </div>
        <div className="overflow-y-auto max-h-[600px]">
          {usersLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                className={cn(
                  'w-full text-left px-3 py-2.5 text-sm border-b last:border-0 transition-colors hover:bg-muted/50',
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

      {/* Permission panel */}
      <div className="flex-1">
        {!selectedUser ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Select a user to view and edit their permission overrides.
          </div>
        ) : (
          <Card>
            <div className="p-4 border-b flex items-center gap-3">
              <div>
                <p className="font-semibold">{selectedUser.email}</p>
                <p className="text-xs text-muted-foreground">
                  Role: {selectedUser.role} · {selectedUser.isActive ? 'Active' : 'Disabled'}
                </p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {matrixLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <UserFeatureList
                  features={features}
                  userRole={selectedUser.role}
                  userId={selectedUser.id}
                  onToggle={(fk, v) => permMutation.mutate({ userId: selectedUser.id, featureKey: fk, enabled: v })}
                  onReset={(fk) => resetMutation.mutate({ userId: selectedUser.id, featureKey: fk })}
                  isPending={isPending}
                />
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function UserFeatureList({
  features,
  userRole,
  userId: _userId,
  onToggle,
  onReset,
  isPending,
}: {
  features: PermissionsMatrixFeature[];
  userRole: string;
  userId: number;
  onToggle: (featureKey: string, enabled: boolean) => void;
  onReset: (featureKey: string) => void;
  isPending: boolean;
}) {
  return (
    <>
      {features.map((f) => {
        const state = f.roles[userRole];
        if (!state) return null;
        const { effective, overridden, default: def } = state;
        return (
          <div key={f.key} className="flex items-center justify-between rounded-lg border px-3 py-2 gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{f.label}</p>
                {overridden && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 px-1 py-0">
                    Override
                  </Badge>
                )}
              </div>
              {f.description && <p className="text-xs text-muted-foreground truncate">{f.description}</p>}
              {overridden && (
                <p className="text-xs text-muted-foreground">Role default: {def ? 'enabled' : 'disabled'}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch checked={effective} disabled={isPending} onCheckedChange={(v) => onToggle(f.key, v)} />
              {overridden && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isPending} onClick={() => onReset(f.key)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset to role default</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
