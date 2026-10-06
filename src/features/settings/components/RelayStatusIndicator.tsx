import { Box, CircularProgress, Tooltip } from "@mui/material";
import { useIntl } from "react-intl";
import type { ConnectionStatus } from "../../../nostr/relayConnection";

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  untested: "#9a9a97", // neutral grey
  testing: "#f4a83a", // amber/yellow
  ok: "#10b981", // green
  slow: "#f4a83a", // amber/yellow
  error: "#f43f5e", // red
};

interface RelayStatusIndicatorProps {
  status: ConnectionStatus;
  latencyMs?: number;
  errorMessage?: string;
}

export function RelayStatusIndicator({
  status,
  latencyMs,
  errorMessage,
}: RelayStatusIndicatorProps) {
  const intl = useIntl();

  const tooltipContent = (() => {
    switch (status) {
      case "untested":
        return intl.formatMessage({ id: "relay.statusUntested" });
      case "testing":
        return intl.formatMessage({ id: "relay.statusTesting" });
      case "ok":
        return intl.formatMessage(
          { id: "relay.statusConnected" },
          { latency: latencyMs ?? 0 },
        );
      case "slow":
        return intl.formatMessage(
          { id: "relay.statusSlow" },
          { latency: latencyMs ?? 0 },
        );
      case "error":
        return errorMessage
          ? intl.formatMessage(
              { id: "relay.statusError" },
              { error: errorMessage },
            )
          : intl.formatMessage(
              { id: "relay.statusError" },
              { error: "Unknown error" },
            );
    }
  })();

  if (status === "testing") {
    return (
      <Tooltip title={tooltipContent} arrow>
        <Box
          data-testid="relay-status-indicator"
          data-status="testing"
          sx={{ display: "inline-flex", alignItems: "center" }}
        >
          <CircularProgress
            size={10}
            thickness={6}
            sx={{ color: STATUS_COLORS.testing }}
          />
        </Box>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={tooltipContent} arrow>
      <Box
        data-testid="relay-status-indicator"
        data-status={status}
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: STATUS_COLORS[status],
          flexShrink: 0,
          transition: "background-color 0.25s ease",
        }}
      />
    </Tooltip>
  );
}
