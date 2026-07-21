import { Box, BoxProps, styled } from "@mui/material";

interface SecondaryHeaderProps extends BoxProps {
  topOffset?: number;
}

// TOPBAR_HEIGHT (src/components/ui/TopBar.tsx) is constant across breakpoints,
// so secondary headers stick at the same offset on mobile and desktop.
export const StyledSecondaryHeader = styled(Box, {
  shouldForwardProp: (prop) => prop !== "topOffset",
})<SecondaryHeaderProps>(({ theme, topOffset = 0 }) => ({
  position: "sticky",
  top: `calc(var(--safe-area-top) + ${64 + topOffset}px)`,
  background: theme.vars.palette.background.paper,
  zIndex: 1,
}));

export const EventAttributeEditContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(2),
  alignItems: "center",

  [theme.breakpoints.down("sm")]: {
    alignItems: "start",
    flexDirection: "column",
  },
}));
