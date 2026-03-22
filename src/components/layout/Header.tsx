'use client';

import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DRAWER_WIDTH } from './Sidebar';

export default function Header({ title }: { title?: string }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
    router.replace('/login');
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        width: `calc(100% - ${DRAWER_WIDTH}px)`,
        ml: `${DRAWER_WIDTH}px`,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
      }}
    >
      <Toolbar>
        {title && (
          <Typography variant="h6" fontWeight={700} flexGrow={1}>
            {title}
          </Typography>
        )}
        {!title && <Box flexGrow={1} />}

        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small">
          <Avatar
            sx={{
              width: 34,
              height: 34,
              bgcolor: 'primary.main',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
          >
            {initials}
          </Avatar>
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
          </MenuItem>
          <MenuItem onClick={handleLogout}>Logout</MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
