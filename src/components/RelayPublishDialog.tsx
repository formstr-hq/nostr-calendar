import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { normalizeURL } from "nostr-tools/utils";
import { useIntl } from "react-intl";

interface RelayPublishDialogProps {
  open: boolean;
  relays: string[];
  acceptedRelays: string[];
  publishFailed?: boolean;
  onClose?: () => void;
}

export function RelayPublishDialog({
  open,
  relays,
  acceptedRelays,
  publishFailed = false,
  onClose,
}: RelayPublishDialogProps) {
  const intl = useIntl();
  const normalizedAcceptedRelays = new Set(acceptedRelays.map(normalizeURL));
  const normalizedRelays = Array.from(new Set(relays.map(normalizeURL)));
  const allRelaysAccepted =
    normalizedRelays.length > 0 &&
    normalizedRelays.every((url) => normalizedAcceptedRelays.has(url));
  const canClose = allRelaysAccepted || publishFailed;

  return (
    <Dialog
      open={open}
      onClose={canClose ? onClose : undefined}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {intl.formatMessage({ id: "event.publishingEvent" })}
      </DialogTitle>
      <DialogContent dividers>
        {allRelaysAccepted && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
              py: 3,
            }}
          >
            <CheckCircleIcon sx={{ color: "success.main", fontSize: 96 }} />
            <Typography variant="h6" fontWeight={600} textAlign="center">
              {intl.formatMessage({ id: "event.eventSaved" })}
            </Typography>
          </Box>
        )}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          {intl.formatMessage(
            { id: "event.relaysPublishStatus" },
            { complete: allRelaysAccepted ? " (Complete)" : "" },
          )}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {normalizedRelays.map((url) => {
            const isAccepted = normalizedAcceptedRelays.has(url);
            const showFailed = publishFailed && !isAccepted;

            return (
              <Box
                key={url}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                {isAccepted ? (
                  <CheckCircleIcon sx={{ color: "success.main" }} />
                ) : showFailed ? (
                  <ErrorIcon sx={{ color: "error.main" }} />
                ) : (
                  <CircularProgress size={20} />
                )}
                <Typography variant="body2">{url}</Typography>
              </Box>
            );
          })}
        </Box>
        {publishFailed && normalizedAcceptedRelays.size === 0 && (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            {intl.formatMessage({ id: "event.noRelaysAccepted" })}
          </Typography>
        )}
      </DialogContent>
      {canClose && (
        <DialogActions>
          <Button onClick={onClose} variant="contained">
            {intl.formatMessage({ id: "navigation.close" })}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
