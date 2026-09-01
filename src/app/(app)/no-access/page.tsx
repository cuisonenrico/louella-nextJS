'use client';

import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { Card } from '@/components/ui/card';

/**
 * Terminal destination for an account with no permitted screens.
 *
 * `firstPermittedRoute()` sends users here rather than to a route they would be
 * bounced out of. It is deliberately ungated in the RBAC manifest — gating the
 * page that explains a lack of access would recreate the redirect loop it
 * exists to end.
 */
export default function NoAccessPage() {
  usePageHeader({ title: 'No access' });
  const { user } = useAuth();

  return (
    <div className="flex justify-center pt-10">
      <Card className="max-w-md p-8 text-center">
        <ShieldOff className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 font-display text-xl font-medium">
          This account has no screens assigned
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You are signed in as <span className="font-medium">{user?.email}</span>, but
          no features have been granted to it yet. An administrator can assign
          them from Settings, under Permissions.
        </p>
      </Card>
    </div>
  );
}
