import { Box, BoxProps, styled } from "@mui/material";

interface SecondaryHeaderProps extends BoxProps {
  topOffset?: number;
  nativeTopOffset?: number;
}

// TOPBAR_HEIGHT (src/components/ui/TopBar.tsx) is constant across breakpoints,
// so secondary headers stick at the same offset on mobile and desktop.
export const StyledSecondaryHeader = styled(Box, {
  shouldForwardProp: (prop) =>
    prop !== "topOffset" && prop !== "nativeTopOffset",
})<SecondaryHeaderProps>(({ theme, topOffset = 0, nativeTopOffset = 0 }) => ({
  position: "sticky",
  top: `calc(var(--safe-area-top) + ${64 + topOffset}px)`,
  "html.ios-native &": {
    top: nativeTopOffset,
  },
  background:
    theme.vars?.palette.background.paper ?? theme.palette.background.paper,
  zIndex: 1,
}));
