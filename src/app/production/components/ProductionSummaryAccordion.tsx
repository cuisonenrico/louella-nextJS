import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Paper,
  Typography,
} from '@mui/material';
import type { Branch } from '@/types';
import type { ProductionSummaryData } from '../hooks/useProductionSummary';

type Props = {
  summary: ProductionSummaryData | null;
  branches: Branch[];
};

export default function ProductionSummaryAccordion({ summary, branches }: Props) {
  if (!summary) return null;

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
        <Typography fontWeight={700}>Day Summary</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(150px, 1fr))"
          gap={2}
          mb={2}
        >
          {(
            [
              {
                label: 'Total Yield',
                value: summary.totalYield.toLocaleString(),
                color: 'primary.main',
                big: true,
              },
              {
                label: 'Bread',
                value: summary.yieldByType.BREAD.toLocaleString(),
                color: 'text.primary',
              },
              {
                label: 'Cake',
                value: summary.yieldByType.CAKE.toLocaleString(),
                color: 'text.primary',
              },
              {
                label: 'Special',
                value: summary.yieldByType.SPECIAL.toLocaleString(),
                color: 'text.primary',
              },
              {
                label: 'Misc',
                value: summary.yieldByType.MISCELLANEOUS.toLocaleString(),
                color: 'text.primary',
              },
              {
                label: 'Total Assigned',
                value: summary.totalAssigned.toLocaleString(),
                color:
                  summary.totalAssigned === summary.totalYield
                    ? 'success.main'
                    : 'warning.main',
              },
              {
                label: 'Unassigned',
                value: summary.totalUnassigned.toLocaleString(),
                color: summary.totalUnassigned > 0 ? 'warning.main' : 'success.main',
              },
              {
                label: 'Expected Revenue',
                value: `₱${summary.expectedRevenue.toLocaleString()}`,
                color: 'success.dark',
                big: true,
              },
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
              <Typography
                variant={big ? 'h5' : 'h6'}
                fontWeight={700}
                color={color}
                mt={0.25}
              >
                {value}
              </Typography>
            </Paper>
          ))}
        </Box>

        {branches.length > 0 && (
          <Box display="flex" gap={1} flexWrap="wrap">
            {branches.map((b) => (
              <Paper key={b.id} variant="outlined" sx={{ px: 2, py: 1, borderRadius: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight={600}
                  sx={{ letterSpacing: 0.5 }}
                >
                  {b.name.toUpperCase()}
                </Typography>
                <Typography variant="body1" fontWeight={700} color="primary.main">
                  {(summary.assignedByBranch.get(b.id) ?? 0).toLocaleString()}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
