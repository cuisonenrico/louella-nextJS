'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DRAWER_WIDTH } from './Sidebar';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Header({ title, sidebarWidth = DRAWER_WIDTH }: { title?: string; sidebarWidth?: number }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <header
      className="fixed top-0 z-30 flex h-14 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 transition-all duration-200"
      style={{ left: sidebarWidth, width: `calc(100% - ${sidebarWidth}px)` }}
    >
      {title && <h2 className="text-lg font-bold flex-1">{title}</h2>}
      {!title && <div className="flex-1" />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
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
