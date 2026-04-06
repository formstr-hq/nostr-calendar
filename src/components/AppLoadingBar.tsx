/**
 * AppLoadingBar
 *
 * An indeterminate LinearProgress bar pinned directly below the AppBar.
 * Visible during all non-ready startup stages. Fades out smoothly when
 * the stage reaches "ready".
 */

import { LinearProgress, Box } from "@mui/material";
import { HEADER_HEIGHT } from "./Header";
import type { StartupStage } from "../hooks/useAppStartup";

interface AppLoadingBarProps {
  stage: StartupStage;
}

const TRANSITION = "opacity 400ms ease";

export function AppLoadingBar({ stage }: AppLoadingBarProps) {
  const visible = stage !== "ready" && stage !== "no_login";

  return (
    <Box
      sx={{
        position: "fixed",
        top: HEADER_HEIGHT,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar - 1,
        opacity: visible ? 1 : 0,
        transition: TRANSITION,
        pointerEvents: "none",
      }}
    >
      <LinearProgress
        color="info"
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
