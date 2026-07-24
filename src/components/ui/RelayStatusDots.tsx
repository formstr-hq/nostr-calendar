import { Box, Tooltip } from "@mui/material";

export type RelayStatus = "ok" | "pending" | "error";

export interface RelayStatusEntry {
  url: string;
  status: RelayStatus;
}

const STATUS_COLOR: Record<RelayStatus, string> = {
  ok: "#10b981",
  pending: "#f4a83a",
  error: "#f43f5e",
};

interface RelayStatusDotsProps {
  relays: RelayStatusEntry[];
}

/**
 * Presentational only. No live per-relay connection tracking exists in the
 * app yet (see docs/REDESIGN_PROGRESS.md) — the shell currently feeds this
 * component a placeholder "ok" status per configured relay via
 * useRelayStatusPlaceholder. Real connection health is a follow-up.
 */
export function RelayStatusDots({ relays }: RelayStatusDotsProps) {
  const connected = relays.filter((r) => r.status === "ok").length;

  return (
    <Tooltip title={`${connected}/${relays.length} relays connected`}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "3px",
          px: 1.25,
          py: 0.75,
          borderRadius: 10,
          border: "1.5px solid",
          borderColor: "divider",
        }}
      >
        {relays.map((relay) => (
          <Box
            key={relay.url}
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor: STATUS_COLOR[relay.status],
            }}
          />
        ))}
      </Box>
    </Tooltip>
  );
}
