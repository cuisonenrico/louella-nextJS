'use client';

import { useState } from 'react';
import { Box, Toolbar } from '@mui/material';
import Sidebar, { COLLAPSED_WIDTH, DRAWER_WIDTH } from './Sidebar';
import Header from './Header';

export default function AppLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <Header title={title} sidebarWidth={sidebarWidth} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: `calc(100% - ${sidebarWidth}px)`,
          bgcolor: 'background.default',
          minHeight: '100vh',
          transition: 'width 0.2s, margin 0.2s',
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
