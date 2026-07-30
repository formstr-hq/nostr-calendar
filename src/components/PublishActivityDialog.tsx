import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { normalizeURL } from "nostr-tools/utils";
import { useIntl } from "react-intl";
import type { PublishStepState } from "../stores/publishActivity";
import type { RelayLineStatus } from "../utils/types";
import { getRelayPublishCounts } from "../utils/relayPublishStatus";

interface PublishActivityDialogProps {
  open: boolean;
  steps: PublishStepState[];
  onClose: () => void;
  /** Re-publish only the relays that failed for one step. */
  onRetryStep?: (stepId: string) => void | Promise<void>;
  retryingStepId?: string | null;
}

function statusForUrl(url: string, step: PublishStepState): RelayLineStatus {
  return step.relayStatus[normalizeURL(url)] ?? "pending";
}

export function PublishActivityDialog({
  open,
  steps,
  onClose,
  onRetryStep,
  retryingStepId = null,
}: PublishActivityDialogProps) {
  const intl = useIntl();
  const anyRetrying = retryingStepId !== null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {intl.formatMessage({ id: "event.publishActivityTitle" })}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {steps.map((step, index) => {
            const counts = getRelayPublishCounts(step.relays, step.relayStatus);
            const canRetry = step.status === "error" && !!onRetryStep;
            return (
              <Box key={step.id}>
                {index > 0 && <Divider sx={{ mb: 2.5 }} />}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    mb: 1,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {step.status === "ok" ? (
                      <CheckCircleIcon
                        fontSize="small"
                        sx={{ color: "success.main" }}
                      />
                    ) : step.status === "error" ? (
                      <ErrorIcon
                        fontSize="small"
                        sx={{ color: "error.main" }}
                      />
                    ) : (
                      <CircularProgress size={16} />
                    )}
                    <Typography variant="subtitle2">
                      {intl.formatMessage({ id: step.labelId })}
                    </Typography>
                  </Box>
                  {canRetry && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => onRetryStep?.(step.id)}
                      disabled={anyRetrying}
                      startIcon={
                        retryingStepId === step.id ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : null
                      }
                    >
                      {intl.formatMessage({ id: "event.retryFailedRelays" })}
                    </Button>
                  )}
                </Box>
                {counts.acceptedCount > 0 &&
                  counts.acceptedCount < counts.totalCount && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1 }}
                    >
                      {intl.formatMessage(
                        { id: "event.relayPartialSuccess" },
                        {
                          acceptedCount: counts.acceptedCount,
                          totalCount: counts.totalCount,
                        },
                      )}
                    </Typography>
                  )}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {step.relays.map((url) => {
                    const st = statusForUrl(url, step);
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
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ gap: 1, pr: 2, pb: 2 }}>
        <Button onClick={onClose} variant="outlined" disabled={anyRetrying}>
          {intl.formatMessage({ id: "navigation.close" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
