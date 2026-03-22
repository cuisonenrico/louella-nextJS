'use client';

import { Box, Toolbar } from '@mui/material';
import Sidebar, { DRAWER_WIDTH } from './Sidebar';
import Header from './Header';

export default function AppLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Header title={title} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
