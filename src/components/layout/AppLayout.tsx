'use client';

import { useState } from 'react';
import Sidebar, { COLLAPSED_WIDTH, DRAWER_WIDTH } from './Sidebar';
import Header from './Header';

export default function AppLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  const handleToggle = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      <Header title={title} sidebarWidth={sidebarWidth} />
      <main
        className="flex-1 p-6 bg-background min-h-screen pt-20 transition-all duration-200"
        style={{ marginLeft: sidebarWidth }}
      >
        {children}
      </main>
    </div>
  );
}
