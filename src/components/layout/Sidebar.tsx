'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Chip,
  Tooltip,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import StorefrontIcon from '@mui/icons-material/Storefront';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import ScienceIcon from '@mui/icons-material/Science';
import BalanceIcon from '@mui/icons-material/Balance';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import { useAuth } from '@/contexts/AuthContext';

export const DRAWER_WIDTH = 240;

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Products', href: '/products', icon: <CategoryIcon /> },
  { label: 'Branches', href: '/branches', icon: <StorefrontIcon /> },
  { label: 'Inventory', href: '/inventory', icon: <InventoryIcon /> },
  { label: 'Materials', href: '/materials', icon: <ScienceIcon /> },
  { label: 'Recipes', href: '/recipes', icon: <MenuBookIcon /> },
  { label: 'Sales', href: '/sales', icon: <PointOfSaleIcon /> },
  {
    label: 'Material Stock',
    href: '/material-inventory',
    icon: <WarehouseIcon />,
  },
  {
    label: 'Production',
    href: '/production',
    icon: <PrecisionManufacturingIcon />,
  },
  {
    label: 'Unit Conversions',
    href: '/unit-conversions',
    icon: <BalanceIcon />,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #c25500 0%, #FA8128 100%)',
          color: '#fff',
          border: 'none',
        },
      }}
    >
      <Toolbar sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={800} color="white" lineHeight={1.1}>
            🧁 Louella
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Bakery Management
          </Typography>
        </Box>
      </Toolbar>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', mx: 2 }} />

      {user && (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            {user.email}
          </Typography>
          <Box mt={0.5}>
            <Chip
              label={user.role}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: '#fff',
                fontSize: '0.65rem',
                height: 18,
              }}
            />
          </Box>
        </Box>
      )}

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', mx: 2, mb: 1 }} />

      <List dense sx={{ px: 1 }}>
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Tooltip key={item.href} title="" placement="right">
              <ListItemButton
                onClick={() => router.push(item.href)}
                selected={active}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                  bgcolor: active ? 'rgba(255,255,255,0.18) !important' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                    minWidth: 36,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: active ? 700 : 400,
                  }}
                />
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
    </Drawer>
  );
}
