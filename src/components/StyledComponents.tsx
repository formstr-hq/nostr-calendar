import { Box, BoxProps, styled } from "@mui/material";

interface SecondaryHeaderProps extends BoxProps {
  topOffset?: number;
}

export const StyledSecondaryHeader = styled(Box, {
  shouldForwardProp: (prop) => prop !== "topOffset",
})<SecondaryHeaderProps>(({ topOffset = 0 }) => ({
  position: "sticky",
  // mobile portrait
  top: `calc(var(--safe-area-top) + ${56 + topOffset}px)`,

  background: "#fff",
  zIndex: 1,

  // mobile landscape
  "@media (min-width:0px) and (orientation: landscape)": {
    top: `calc(var(--safe-area-top) + ${48 + topOffset}px)`,
  },

  // desktop
  "@media (min-width:600px)": {
    top: `calc(var(--safe-area-top) + ${64 + topOffset}px)`,
  },
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
