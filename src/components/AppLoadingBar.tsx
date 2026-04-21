import { LinearProgress, Box, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import type { StartupStage } from "../hooks/useAppStartup";

interface AppLoadingBarProps {
  stage: StartupStage;
}

const TRANSITION = "opacity 400ms ease";

export function AppLoadingBar({ stage }: AppLoadingBarProps) {
  const visible = stage !== "ready" && stage !== "no_login";
  const intl = useIntl();

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        opacity: visible ? 1 : 0,
        transition: TRANSITION,
        pointerEvents: "none",
        zIndex: (theme) => theme.zIndex.appBar + 1,
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
      <Box
        sx={{
          bgcolor: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(6px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 2,
          py: 0.5,
          textAlign: "center",
        }}
      >
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {intl.formatMessage({ id: "startup.loadingNotice" })}
        </Typography>
      </Box>
    </Box>
  );
}
