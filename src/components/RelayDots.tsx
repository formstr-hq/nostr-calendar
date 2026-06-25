import {
  Box,
  Button,
  CircularProgress,
  Tooltip,
  Typography,
} from "@mui/material";
import { normalizeURL } from "nostr-tools/utils";
import type { RelayStatusMap } from "../utils/types";

interface RelayDotsProps {
  relays: string[];
  relayStatus: RelayStatusMap;
  label: string;
  onDetailsClick?: () => void;
  detailsLabel?: string;
}

export function RelayDots({
  relays,
  relayStatus,
  label,
  onDetailsClick,
  detailsLabel,
}: RelayDotsProps) {
  const normalizedRelays = Array.from(new Set(relays.map(normalizeURL)));

  return (
    <Box
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
        minWidth: 0,
      }}
    >
      <Box style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="caption" color="textSecondary">
          {label}
        </Typography>
        {onDetailsClick && detailsLabel && (
          <Button
            size="small"
            sx={{ ml: 0.5, minWidth: "auto", p: 0.5, textTransform: "none" }}
            onClick={onDetailsClick}
          >
            {detailsLabel}
          </Button>
        )}
      </Box>
      {normalizedRelays.length > 0 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0.5,
            pl: 0.5,
          }}
        >
          {normalizedRelays.map((relayUrl) => {
            const status = relayStatus[relayUrl] ?? "pending";
            return (
              <Tooltip key={relayUrl} title={relayUrl} arrow>
                <span>
                  {status === "pending" && (
                    <Box sx={{ display: "inline-flex", alignItems: "center" }}>
                      <CircularProgress
                        size={8}
                        thickness={6}
                        color="inherit"
                      />
                    </Box>
                  )}
                  {status === "ok" && (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: "success.main",
                      }}
                    />
                  )}
                  {status === "error" && (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: "error.main",
                      }}
                    />
                  )}
                </span>
              </Tooltip>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
