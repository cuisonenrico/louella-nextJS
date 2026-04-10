import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, CircularProgress, Typography } from '@mui/material';

type Props = {
  totalPending: number;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

export default function ProductionPendingBar({
  totalPending,
  isSaving,
  onDiscard,
  onSave,
}: Props) {
  if (totalPending <= 0) return null;

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={2}
      px={2}
      py={1}
      mb={2}
      sx={{
        bgcolor: 'rgba(255, 167, 38, 0.10)',
        border: 1,
        borderColor: 'warning.main',
        borderRadius: 1,
      }}
    >
      <Typography variant="body2" color="warning.dark" sx={{ flexGrow: 1 }}>
        {totalPending} unsaved change{totalPending !== 1 ? 's' : ''}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        color="warning"
        startIcon={<CloseIcon />}
        onClick={onDiscard}
      >
        Discard
      </Button>
      <Button
        size="small"
        variant="contained"
        color="warning"
        startIcon={
          isSaving ? (
            <CircularProgress size={14} />
          ) : (
            <SaveIcon />
          )
        }
        onClick={onSave}
        disabled={isSaving}
      >
        Save Changes
      </Button>
    </Box>
  );
}
