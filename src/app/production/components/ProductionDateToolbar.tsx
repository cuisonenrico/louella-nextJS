import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import PostAddIcon from '@mui/icons-material/PostAdd';
import TodayIcon from '@mui/icons-material/Today';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Tooltip,
} from '@mui/material';
import dayjs from 'dayjs';

type Props = {
  filterDate: string;
  today: string;
  missingProductionCount: number;
  missingInventoryBranchCount: number;
  isProdLoading: boolean;
  isInvLoading: boolean;
  isInitProdPending: boolean;
  isInitAllInvPending: boolean;
  onDateChange: (next: string) => void;
  onInitProduction: () => void;
  onInitAllInventory: () => void;
};

export default function ProductionDateToolbar({
  filterDate,
  today,
  missingProductionCount,
  missingInventoryBranchCount,
  isProdLoading,
  isInvLoading,
  isInitProdPending,
  isInitAllInvPending,
  onDateChange,
  onInitProduction,
  onInitAllInventory,
}: Props) {
  return (
    <Box display="flex" alignItems="center" gap={1} mb={3} flexWrap="wrap">
      <Tooltip title="Previous day">
        <IconButton
          onClick={() => onDateChange(dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD'))}
          size="small"
        >
          <ChevronLeftIcon />
        </IconButton>
      </Tooltip>
      <TextField
        size="small"
        type="date"
        label="Date"
        value={filterDate}
        onChange={(e) => onDateChange(e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ width: 150 }}
      />
      <Tooltip title="Next day">
        <IconButton
          onClick={() => onDateChange(dayjs(filterDate).add(1, 'day').format('YYYY-MM-DD'))}
          size="small"
        >
          <ChevronRightIcon />
        </IconButton>
      </Tooltip>
      {filterDate !== today && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<TodayIcon />}
          onClick={() => onDateChange(today)}
        >
          Today
        </Button>
      )}
      {!isProdLoading && missingProductionCount > 0 && (
        <Tooltip title={`Create production records for ${missingProductionCount} product${missingProductionCount !== 1 ? 's' : ''} with no entry on this date`}>
          <span>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={
                isInitProdPending ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <PostAddIcon />
                )
              }
              onClick={onInitProduction}
              disabled={isInitProdPending}
            >
              Init Production ({missingProductionCount})
            </Button>
          </span>
        </Tooltip>
      )}
      {!isInvLoading && missingInventoryBranchCount > 0 && (
        <Tooltip title={`Initialize inventory for ${missingInventoryBranchCount} branch${missingInventoryBranchCount !== 1 ? 'es' : ''} with no records on this date`}>
          <span>
            <Button
              size="small"
              variant="contained"
              color="secondary"
              startIcon={
                isInitAllInvPending ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <LibraryAddIcon />
                )
              }
              onClick={onInitAllInventory}
              disabled={isInitAllInvPending}
            >
              Init Inventory ({missingInventoryBranchCount})
            </Button>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}
