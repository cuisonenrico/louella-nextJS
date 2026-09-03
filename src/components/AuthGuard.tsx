'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AppShellSkeleton } from '@/components/loading/Skeletons';
import { Button } from '@/components/ui/button';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, authError } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading || authError) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (user?.mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [isLoading, isAuthenticated, user, router, pathname, authError]);

  if (isLoading) {
    return <AppShellSkeleton />;
  }

  // Reaching the server failed, which is not the same as being signed out.
  // Sending someone to the login screen here would discard a session that is
  // still perfectly valid, and they would sign in again to fix nothing.
  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">{authError}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are still signed in. This usually clears in a moment.
          </p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (user?.mustChangePassword && pathname !== '/change-password') return null;

  return <>{children}</>;
}
