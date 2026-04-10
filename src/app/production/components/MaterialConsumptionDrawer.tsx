'use client';

import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { productionApi } from '@/lib/apiServices';
import type { MaterialConsumption } from '@/types';

interface MaterialConsumptionDrawerProps {
  consumptionId: number | null;
  onClose: () => void;
}

export default function MaterialConsumptionDrawer({ consumptionId, onClose }: MaterialConsumptionDrawerProps) {
  const consumptionQuery = useQuery<MaterialConsumption>({
    queryKey: ['production-consumption', consumptionId],
    queryFn: () => productionApi.materialConsumption(consumptionId!).then((r) => r.data),
    enabled: consumptionId != null,
  });

  return (
    <Drawer
      anchor="right"
      open={consumptionId != null}
      onClose={onClose}
      PaperProps={{ sx: { width: 440, p: 0 } }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" px={2} py={1.5} borderBottom={1} borderColor="divider">
        <Box>
          <Typography variant="h6" fontWeight={700}>Material Consumption</Typography>
          {consumptionQuery.data && (
            <Typography variant="caption" color="text.secondary">
              {consumptionQuery.data.productName} — {dayjs(consumptionQuery.data.date).format('MMM D, YYYY')} — {consumptionQuery.data.yield} pcs
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      <Box px={2} py={2} overflow="auto">
        {consumptionQuery.isLoading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : consumptionQuery.error ? (
          <Alert severity="error">Failed to load consumption data.</Alert>
        ) : !consumptionQuery.data || consumptionQuery.data.items.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            No recipe configured for this product. Set up a recipe to see material consumption.
          </Alert>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Material</TableCell>
                  <TableCell align="right">Used</TableCell>
                  <TableCell align="right">Unit Cost</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consumptionQuery.data.items.map((item) => (
                  <TableRow key={item.materialId} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{item.materialName}</TableCell>
                    <TableCell align="right">
                      {item.consumed} {item.materialUnit}
                    </TableCell>
                    <TableCell align="right">₱{item.pricePerUnit.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      ₱{item.totalCost.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Divider sx={{ my: 2 }} />
            <Box display="flex" justifyContent="space-between" alignItems="center" px={0.5}>
              <Typography variant="body2" fontWeight={700} color="text.secondary">
                TOTAL MATERIAL COST
              </Typography>
              <Typography variant="h6" fontWeight={800} color="primary.main">
                ₱{consumptionQuery.data.totalMaterialCost.toFixed(2)}
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
