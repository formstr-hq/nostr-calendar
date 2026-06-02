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
import type { RelayLineStatus, RelayStatusMap } from "../utils/types";
import { getRelayPublishCounts } from "../utils/relayPublishStatus";

interface RelayPublishDialogProps {
  open: boolean;
  relays: string[];
  /** Keys must be normalizeURL(relay) */
  relayStatus: RelayStatusMap;
  onClose: () => void;
  /** Re-publish only to relays that did not accept */
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
  showRetry?: boolean;
}

function statusForUrl(
  url: string,
  relayStatus: RelayStatusMap,
): RelayLineStatus {
  const n = normalizeURL(url);
  return relayStatus[n] ?? "pending";
}

export function RelayPublishDialog({
  open,
  relays,
  relayStatus,
  onClose,
  onRetry,
  retrying = false,
  showRetry = false,
}: RelayPublishDialogProps) {
  const intl = useIntl();
  const {
    normalizedRelays,
    acceptedCount,
    failedCount,
    pendingCount,
    totalCount,
  } = getRelayPublishCounts(relays, relayStatus);
  const hasAcceptedRelays = acceptedCount > 0;
  const hasFailedRelays = failedCount > 0;
  const completed = totalCount > 0 && pendingCount === 0;
  const partialSuccess = hasAcceptedRelays && acceptedCount < totalCount;
  const titleId = hasAcceptedRelays
    ? "event.eventSaved"
    : "event.publishingEvent";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{intl.formatMessage({ id: titleId })}</DialogTitle>
      <DialogContent dividers>
        {partialSuccess && (
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
              mb: 2,
            }}
          >
            <CheckCircleIcon sx={{ color: "success.main", mt: 0.25 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {intl.formatMessage(
                  { id: "event.relayPartialSuccess" },
                  { acceptedCount, totalCount },
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "event.relayRetryHint" })}
              </Typography>
            </Box>
          </Box>
        )}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          {intl.formatMessage(
            { id: "event.relaysPublishStatus" },
            { complete: "" },
          )}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {normalizedRelays.map((url) => {
            const st = statusForUrl(url, relayStatus);
            return (
              <Box
                key={url}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                {st === "ok" ? (
                  <CheckCircleIcon sx={{ color: "success.main" }} />
                ) : st === "error" ? (
                  <ErrorIcon sx={{ color: "error.main" }} />
                ) : (
                  <CircularProgress size={20} />
                )}
                <Typography variant="body2">{url}</Typography>
              </Box>
            );
          })}
        </Box>
        {showRetry && !partialSuccess && (
          <Typography color="warning.main" variant="body2" sx={{ mt: 2 }}>
            {intl.formatMessage({ id: "event.relayRetryHint" })}
          </Typography>
        )}
        {!hasAcceptedRelays && completed && hasFailedRelays && (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            {intl.formatMessage({ id: "event.noRelaysAccepted" })}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ gap: 1, pr: 2, pb: 2 }}>
        {showRetry && onRetry && (
          <Button
            onClick={onRetry}
            variant="contained"
            color="primary"
            disabled={retrying}
            startIcon={
              retrying ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {intl.formatMessage({ id: "event.retryFailedRelays" })}
          </Button>
        )}
        <Button onClick={onClose} variant="outlined" disabled={retrying}>
          {intl.formatMessage({ id: "navigation.close" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
