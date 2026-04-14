'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Drawer,
  IconButton,
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import MenuIcon from '@mui/icons-material/Menu';
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
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import TuneIcon from '@mui/icons-material/Tune';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import SpeedIcon from '@mui/icons-material/Speed';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { useAuth } from '@/contexts/AuthContext';

export const DRAWER_WIDTH = 240;
export const COLLAPSED_WIDTH = 64;

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Products', href: '/products', icon: <CategoryIcon /> },
  { label: 'Branches', href: '/branches', icon: <StorefrontIcon /> },
  { label: 'Inventory', href: '/inventory', icon: <InventoryIcon /> },
  { label: 'Gap Audit', href: '/inventory/gaps', icon: <EventBusyIcon /> },
  { label: 'Materials', href: '/materials', icon: <ScienceIcon /> },
  { label: 'Recipes', href: '/recipes', icon: <MenuBookIcon /> },
  { label: 'Sales', href: '/sales', icon: <PointOfSaleIcon /> },
  {
    label: 'Material Stock',
    href: '/material-inventory',
    icon: <WarehouseIcon />,
  },
  {
    label: 'Stock Gap Audit',
    href: '/material-inventory/gaps',
    icon: <EventBusyIcon />,
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
  {
    label: 'Suppliers',
    href: '/suppliers',
    icon: <LocalShippingIcon />,
  },
  {
    label: 'Adjustments',
    href: '/inventory-adjustments',
    icon: <TuneIcon />,
  },
  {
    label: 'Import',
    href: '/inventory-import',
    icon: <UploadFileIcon />,
  },
  {
    label: 'Production Cost',
    href: '/production-cost',
    icon: <MonetizationOnIcon />,
  },
  {
    label: 'Efficiency',
    href: '/production-efficiency',
    icon: <SpeedIcon />,
  },
];

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const width = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        transition: 'width 0.2s',
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #c25500 0%, #FA8128 100%)',
          color: '#fff',
          border: 'none',
          overflowX: 'hidden',
          transition: 'width 0.2s',
        },
      }}
    >
      <Toolbar
        sx={{
          px: collapsed ? 0 : 2,
          pt: 2,
          pb: 1,
          justifyContent: collapsed ? 'center' : 'space-between',
          minHeight: 56,
        }}
      >
        {!collapsed && (
          <Box>
            <Typography variant="h6" fontWeight={800} color="white" lineHeight={1.1}>
              Louella
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Bakery Management
            </Typography>
          </Box>
        )}
        <IconButton onClick={onToggle} size="small" sx={{ color: '#fff' }}>
          {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Toolbar>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', mx: collapsed ? 1 : 2 }} />

      {/* {user && !collapsed && (
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
      )} */}

      {!collapsed && <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', mx: 2, mb: 1 }} />}

      <List dense sx={{ px: collapsed ? 0.5 : 1, mt: collapsed ? 1 : 0 }}>
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Tooltip key={item.href} title={collapsed ? item.label : ''} placement="right">
              <ListItemButton
                onClick={() => router.push(item.href)}
                selected={active}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 1 : 2,
                  color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                  bgcolor: active ? 'rgba(255,255,255,0.18) !important' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                    minWidth: collapsed ? 0 : 36,
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.875rem',
                      fontWeight: active ? 700 : 400,
                    }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
    </Drawer>
  );
}
