/**
 * AppLoadingBar
 *
 * An indeterminate LinearProgress bar pinned directly below the AppBar.
 * Visible during all non-ready startup stages. Fades out smoothly when
 * the stage reaches "ready".
 */

import { LinearProgress, Box, useTheme } from "@mui/material";
import type { StartupStage } from "../hooks/useAppStartup";

interface AppLoadingBarProps {
  stage: StartupStage;
}

const TRANSITION = "opacity 400ms ease";

export function AppLoadingBar({ stage }: AppLoadingBarProps) {
  const visible = stage !== "ready" && stage !== "no_login";
  const theme = useTheme()
  
  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        opacity: visible ? 1 : 0,
        transition: TRANSITION,
        pointerEvents: "none",
      }}
    >
      <LinearProgress
        sx={{
          height: 3,
          "& .MuiLinearProgress-bar": {
            transition: "none",
          },
        }}
      />
    </Box>
  );
}
