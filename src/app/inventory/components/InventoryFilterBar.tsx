'use client';

import {
  Box,
  Button,
  IconButton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  CircularProgress,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import TodayIcon from '@mui/icons-material/Today';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DateRangeIcon from '@mui/icons-material/DateRange';
import EventIcon from '@mui/icons-material/Event';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { Branch } from '@/types';

interface InventoryFilterBarProps {
  dateMode: 'date' | 'range';
  draftFrom: string;
  draftTo: string;
  filterBranch: string;
  branches: Branch[];
  today: string;
  uninitializedCount: number;
  isBulkCreatePending: boolean;
  isReinitializePending: boolean;
  onDateModeChange: (mode: 'date' | 'range') => void;
  onDraftFromChange: (v: string) => void;
  onDraftToChange: (v: string) => void;
  onCommitDates: (from: string, to: string) => void;
  onStepDate: (delta: number) => void;
  onBranchChange: (branchId: string) => void;
  onImportOpen: () => void;
  onBulkCreate: () => void;
  onReinitialize: () => void;
}

export default function InventoryFilterBar({
  dateMode,
  draftFrom,
  draftTo,
  filterBranch,
  branches,
  today,
  uninitializedCount,
  isBulkCreatePending,
  isReinitializePending,
  onDateModeChange,
  onDraftFromChange,
  onDraftToChange,
  onCommitDates,
  onStepDate,
  onBranchChange,
  onImportOpen,
  onBulkCreate,
  onReinitialize,
}: InventoryFilterBarProps) {
  const isRange = draftFrom !== draftTo;

  return (
    <>
      {/* Date navigation */}
      <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
        {/* Mode toggle */}
        <ToggleButtonGroup
          value={dateMode}
          exclusive
          size="small"
          onChange={(_, val) => {
            if (val) onDateModeChange(val as 'date' | 'range');
          }}
        >
          <ToggleButton value="date">
            <Tooltip title="Single date">
              <EventIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="range">
            <Tooltip title="Date range">
              <DateRangeIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title="Previous period">
          <IconButton onClick={() => onStepDate(-1)} size="small">
            <ChevronLeftIcon />
          </IconButton>
        </Tooltip>

        {dateMode === 'date' ? (
          <TextField
            size="small"
            type="date"
            label="Date"
            value={draftFrom}
            onChange={(e) => {
              const v = e.target.value;
              onDraftFromChange(v);
              onDraftToChange(v);
              onCommitDates(v, v);
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
        ) : (
          <>
            <TextField
              size="small"
              type="date"
              label="From"
              value={draftFrom}
              onChange={(e) => {
                const v = e.target.value;
                onDraftFromChange(v);
                if (v > draftTo) onDraftToChange(v);
              }}
              onBlur={() => onCommitDates(draftFrom, draftTo)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 150 }}
            />
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
            <TextField
              size="small"
              type="date"
              label="To"
              value={draftTo}
              onChange={(e) => {
                const v = e.target.value;
                onDraftToChange(v);
                if (v < draftFrom) onDraftFromChange(v);
              }}
              onBlur={() => onCommitDates(draftFrom, draftTo)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 150 }}
            />
          </>
        )}

        <Tooltip title="Next period">
          <IconButton onClick={() => onStepDate(1)} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Tooltip>

        {(draftFrom !== today || draftTo !== today) && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<TodayIcon />}
            onClick={() => {
              onDraftFromChange(today);
              onDraftToChange(today);
              onCommitDates(today, today);
            }}
          >
            Today
          </Button>
        )}

        {dateMode === 'range' && (
          <>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                const from = new Date();
                from.setDate(from.getDate() - 6);
                const fromStr = from.toISOString().slice(0, 10);
                onDraftFromChange(fromStr);
                onDraftToChange(today);
                onCommitDates(fromStr, today);
              }}
            >
              Last 7d
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                const now = new Date();
                const fromStr = new Date(now.getFullYear(), now.getMonth(), 1)
                  .toISOString()
                  .slice(0, 10);
                onDraftFromChange(fromStr);
                onDraftToChange(today);
                onCommitDates(fromStr, today);
              }}
            >
              This Month
            </Button>
          </>
        )}

        <Box flexGrow={1} />

        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={onImportOpen}
        >
          Import XLSX
        </Button>

        {!isRange && filterBranch !== '' && (
          <Tooltip title="Reset all entries for this day using yesterday's leftover as opening quantity. Zeroes delivery, leftover, and reject.">
            <span>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={
                  isReinitializePending ? <CircularProgress size={16} /> : <RestartAltIcon />
                }
                onClick={onReinitialize}
                disabled={isReinitializePending}
              >
                Reinitialize
              </Button>
            </span>
          </Tooltip>
        )}

        {!isRange && uninitializedCount > 0 && (
          <Tooltip
            title={`${uninitializedCount} active product${uninitializedCount !== 1 ? 's' : ''} missing entries for this day. Click to create them, seeded from yesterday's leftover.`}
          >
            <span>
              <Button
                variant="contained"
                startIcon={
                  isBulkCreatePending ? <CircularProgress size={16} /> : <LibraryAddIcon />
                }
                onClick={onBulkCreate}
                disabled={isBulkCreatePending}
              >
                Sync {uninitializedCount} Product{uninitializedCount !== 1 ? 's' : ''}
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {/* Branch selector */}
      <Box mb={2}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mb: 0.5, display: 'block', fontWeight: 600, letterSpacing: 1 }}
        >
          BRANCH
        </Typography>
        <ToggleButtonGroup
          value={filterBranch}
          exclusive
          onChange={(_, val) => onBranchChange(val ?? '')}
          size="small"
          sx={{ flexWrap: 'wrap', gap: 0.5 }}
        >
          <ToggleButton value="" sx={{ px: 2 }}>
            All
          </ToggleButton>
          {branches.map((b) => (
            <ToggleButton key={b.id} value={b.id.toString()} sx={{ px: 2 }}>
              {b.name}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
    </>
  );
}
