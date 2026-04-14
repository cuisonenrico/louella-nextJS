'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Paper,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { InventorySummaryData, ProductType } from '@/types';
import dayjs from 'dayjs';

interface InventorySummaryPanelProps {
  summary: InventorySummaryData | null;
  filterDateFrom: string;
  filterDateTo: string;
}

export default function InventorySummaryPanel({
  summary,
  filterDateFrom,
  filterDateTo,
}: InventorySummaryPanelProps) {
  if (!summary) return null;

  const isRange = filterDateFrom !== filterDateTo;
  const dayCount = dayjs(filterDateTo).diff(dayjs(filterDateFrom), 'day') + 1;

  return (
    <Accordion
      disableGutters
      defaultExpanded
      sx={{
        mb: 3,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        '&:before': { display: 'none' },
        boxShadow: 'none',
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2, minHeight: 48 }}>
        <Typography fontWeight={700}>
          {isRange ? `Period Summary (${dayCount} days)` : 'Day Summary'}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
        {/* Revenue cards */}
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(170px, 1fr))"
          gap={2}
          mb={3}
        >
          {(
            [
              { label: 'Total Revenue', value: `₱${summary.totalRevenue.toLocaleString()}`, color: 'success.main', big: true },
              { label: 'Bread Revenue', value: `₱${summary.revenueByType.BREAD.toLocaleString()}`, color: 'text.primary' },
              { label: 'Cake Revenue', value: `₱${summary.revenueByType.CAKE.toLocaleString()}`, color: 'text.primary' },
              { label: 'Special Revenue', value: `₱${summary.revenueByType.SPECIAL.toLocaleString()}`, color: 'text.primary' },
              { label: 'Misc Revenue', value: `₱${summary.revenueByType.MISCELLANEOUS.toLocaleString()}`, color: 'text.primary' },
            ] as { label: string; value: string; color: string; big?: boolean }[]
          ).map(({ label, value, color, big }) => (
            <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ letterSpacing: 0.5 }}
              >
                {label.toUpperCase()}
              </Typography>
              <Typography variant={big ? 'h5' : 'h6'} fontWeight={700} color={color} mt={0.25}>
                {value}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Unit stats */}
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))"
          gap={2}
          mb={3}
        >
          {(
            [
              { label: 'Units Sold', value: summary.totalSold, color: 'success.main' },
              { label: 'Delivered', value: summary.totalDelivery, color: 'text.primary' },
              { label: 'Leftover', value: summary.totalLeftover, color: 'warning.main' },
              { label: 'Rejected', value: summary.totalReject, color: 'error.main' },
            ] as { label: string; value: number; color: string }[]
          ).map(({ label, value, color }) => (
            <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ letterSpacing: 0.5 }}
              >
                {label.toUpperCase()}
              </Typography>
              <Typography variant="h6" fontWeight={700} color={color} mt={0.25}>
                {value.toLocaleString()}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Insights row */}
        <Box display="flex" gap={2} flexWrap="wrap">
          {summary.topProduct && (
            <Paper
              variant="outlined"
              sx={{ p: 2, borderRadius: 2, flexGrow: 1, minWidth: 200 }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ letterSpacing: 0.5 }}
              >
                TOP PRODUCT
              </Typography>
              <Typography variant="body1" fontWeight={700} mt={0.25}>
                {summary.topProduct.name}
              </Typography>
              <Typography variant="body2" color="success.main">
                ₱{summary.topProduct.revenue.toLocaleString()} &mdash;{' '}
                {summary.topProduct.sold} sold
              </Typography>
            </Paper>
          )}
          {summary.zeroSales.length > 0 && (
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                flexGrow: 1,
                minWidth: 200,
                borderColor: 'warning.main',
              }}
            >
              <Typography
                variant="caption"
                color="warning.dark"
                fontWeight={600}
                sx={{ letterSpacing: 0.5 }}
              >
                NO SALES ({summary.zeroSales.length})
              </Typography>
              <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
                {summary.zeroSales.map((r) => (
                  <Chip key={r.name} label={r.name} size="small" color="warning" variant="outlined" />
                ))}
              </Box>
            </Paper>
          )}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
