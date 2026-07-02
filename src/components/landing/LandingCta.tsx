'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

/** Top-right nav button: Login for guests, Dashboard when a session exists. */
export default function LandingCta() {
  const { isAuthenticated, isLoading } = useAuth();
  const authed = !isLoading && isAuthenticated;

  return (
    <Button asChild size="sm" className="rounded-full px-5">
      <Link href={authed ? '/dashboard' : '/login'}>
        {authed ? 'Dashboard' : 'Login'}
      </Link>
    </Button>
  );
}
