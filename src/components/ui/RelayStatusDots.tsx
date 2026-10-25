import { Box, Tooltip } from "@mui/material";
import { useIntl } from "react-intl";
import { relayStatusColors } from "../../theme/tokens";

export type RelayStatus = "ok" | "pending" | "error" | "untested";

export interface RelayStatusEntry {
  url: string;
  status: RelayStatus;
}

interface RelayStatusDotsProps {
  relays: RelayStatusEntry[];
  onClick?: () => void;
}

/**
 * Presentational only. No live per-relay connection tracking exists in the
 * app yet (see docs/REDESIGN_PROGRESS.md) — the shell currently feeds this
 * component a placeholder "ok" status per configured relay via
 * useRelayStatusPlaceholder. Real connection health is a follow-up.
 */
export function RelayStatusDots({ relays, onClick }: RelayStatusDotsProps) {
  const intl = useIntl();
  const connected = relays.filter((r) => r.status === "ok").length;

  return (
    <Tooltip title={`${connected}/${relays.length} relays connected`}>
      <Box
        component={onClick ? "button" : "div"}
        type={onClick ? "button" : undefined}
        aria-label={
          onClick ? intl.formatMessage({ id: "relay.manageRelays" }) : undefined
        }
        onClick={onClick}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "3px",
          px: 1.25,
          py: 0.75,
          bgcolor: "transparent",
          color: "inherit",
          font: "inherit",
          cursor: onClick ? "pointer" : "default",
          borderRadius: 10,
          border: "1.5px solid",
          borderColor: "divider",
          ...(onClick && {
            "&:hover": { bgcolor: "action.hover" },
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
            },
          }),
        }}
      >
        {relays.map((relay) => (
          <Box
            key={relay.url}
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor: relayStatusColors[relay.status],
            }}
          />
        ))}
      </Box>
    </Tooltip>
  );
}
