'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePageHeaderStore } from '@/lib/pageHeaderStore';
import { guardNavigation } from '@/lib/navigationGuard';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createCountStore } from '@/lib/mobile/countQueue';

export default function Header({ onOpenNav }: { onOpenNav?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const title = usePageHeaderStore((s) => s.title);
  const headerContent = usePageHeaderStore((s) => s.content);
  const headerActions = usePageHeaderStore((s) => s.actions);

  const [unsent, setUnsent] = useState(0);

  const doLogout = () => {
    guardNavigation(async () => {
      await logout();
      router.replace('/login');
    });
  };

  // Counts typed on a phone wait in a queue until they reach the server. Signing
  // out keeps them on this device (they send at the next sign-in as this user),
  // but nobody should find that out after the fact.
  const handleLogout = () => {
    const waiting = user ? createCountStore(user.id).read().length : 0;
    if (waiting > 0) setUnsent(waiting);
    else doLogout();
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    // A flow child of the content column, not a fixed bar measured against the
    // sidebar's pixel width. `sticky` keeps it in view without taking it out of
    // the layout, so `main` needs no compensating top padding.
    <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:flex-nowrap md:gap-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden size-11 shrink-0"
        aria-label="Open navigation"
        onClick={onOpenNav}
      >
        <Menu className="size-5" />
      </Button>

      {title && <h2 className="font-display text-xl font-semibold tracking-tight shrink-0">{title}</h2>}
      {headerContent && <div className="flex items-center gap-4">{headerContent}</div>}
      <div className="flex-1" />
      {headerActions && <div className="flex items-center gap-2 mr-2">{headerActions}</div>}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[0.8rem] font-bold text-primary-foreground">
              {initials}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={unsent > 0} onOpenChange={(open) => !open && setUnsent(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              {unsent === 1 ? "1 count hasn't" : `${unsent} counts haven't`} reached the server yet. They stay on this
              phone and send when you sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={doLogout}>Log out anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
