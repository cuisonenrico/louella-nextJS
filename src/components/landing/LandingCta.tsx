'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

/** Top-right nav button: Login for guests, Dashboard when a session exists. */
export default function LandingCta() {
  const { isAuthenticated, isLoading } = useAuth();
  const authed = !isLoading && isAuthenticated;

  return (
    <Link
      href={authed ? '/dashboard' : '/login'}
      className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-lp-brand ring-1 ring-lp-line transition-colors hover:bg-lp-blush"
    >
      {authed ? 'Dashboard' : 'Login'}
    </Link>
  );
}
