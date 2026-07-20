'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AppShellSkeleton } from '@/components/loading/Skeletons';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (user?.mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [isLoading, isAuthenticated, user, router, pathname]);

  if (isLoading) {
    return <AppShellSkeleton />;
  }

  if (!isAuthenticated) return null;
  if (user?.mustChangePassword && pathname !== '/change-password') return null;

  return <>{children}</>;
}
