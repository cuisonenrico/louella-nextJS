'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePageHeaderStore } from '@/lib/pageHeaderStore';
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

export default function Header({ onOpenNav }: { onOpenNav?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const title = usePageHeaderStore((s) => s.title);
  const headerContent = usePageHeaderStore((s) => s.content);
  const headerActions = usePageHeaderStore((s) => s.actions);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
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
    </header>
  );
}
