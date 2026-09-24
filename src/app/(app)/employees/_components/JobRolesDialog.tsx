'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jobRolesApi } from '@/lib/apiServices';
import type { JobRole } from '@/types';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/** Job titles. Deactivating hides a role from new employees; nobody loses it. */
export function JobRolesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const { data: roles = [] } = useQuery({
    queryKey: ['job-roles', 'all'],
    queryFn: () => jobRolesApi.list(true).then((r) => r.data),
    enabled: open,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['job-roles'] });

  const create = useMutation({
    mutationFn: () => jobRolesApi.create(name.trim()),
    onSuccess: () => { setName(''); refresh(); },
    onError: (err) => toast.error(extractError(err)),
  });
  const toggle = useMutation({
    mutationFn: (role: JobRole) => jobRolesApi.update(role.id, { isActive: !role.isActive }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Job roles</DialogTitle></DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
        >
          <Input placeholder="e.g. Baker" value={name} onChange={(e) => setName(e.target.value)} aria-label="New job role" />
          <Button type="submit" disabled={!name.trim() || create.isPending}>Add</Button>
        </form>
        <ul className="divide-y">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center justify-between py-2">
              <span className={role.isActive ? '' : 'text-muted-foreground line-through'}>{role.name}</span>
              <Switch
                checked={role.isActive}
                disabled={toggle.isPending}
                onCheckedChange={() => toggle.mutate(role)}
                aria-label={`${role.name} active`}
              />
            </li>
          ))}
          {roles.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No job roles yet.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
