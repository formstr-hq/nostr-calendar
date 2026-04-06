/**
 * AppStatusMessage
 *
 * A non-blocking floating status row that appears below the loading bar.
 * Shows step-based messages keyed to the current StartupStage.
 * Renders a retry button when the stage is "error".
 * Invisible (opacity 0) once the stage reaches "ready" — no layout shifts.
 */

import { Box, Typography, Button, Fade } from "@mui/material";
import { HEADER_HEIGHT } from "./Header";
import type { StartupStage } from "../hooks/useAppStartup";

interface AppStatusMessageProps {
  stage: StartupStage;
  statusMessage: string;
  onRetry: () => void;
}

export function AppStatusMessage({
  stage,
  statusMessage,
  onRetry,
}: AppStatusMessageProps) {
  const visible = stage !== "ready" && Boolean(statusMessage);
  const isError = stage === "error";

  return (
    <Fade in={visible} timeout={300} unmountOnExit={false}>
      <Box
        sx={{
          position: "fixed",
          // Sit just below the loading bar (header + 3px bar)
          top: HEADER_HEIGHT + 3,
          left: 0,
          right: 0,
          zIndex: (theme) => theme.zIndex.appBar - 2,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 0.75,
          // Subtle background so text is readable over calendar content
          bgcolor: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(6px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          // When not visible, don't capture clicks
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: isError ? "error.main" : "text.secondary",
            fontWeight: isError ? 600 : 400,
            letterSpacing: "0.01em",
          }}
        >
          {statusMessage}
        </Typography>

        {isError && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={onRetry}
            sx={{ ml: 1, py: 0, minWidth: 0, fontSize: "0.7rem" }}
          >
            Retry
          </Button>
        )}
      </Box>
    </Fade>
  );
}
