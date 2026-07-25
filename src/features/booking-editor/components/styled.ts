import { Box, Button, styled } from "@mui/material";
import { radius, spacing } from "../../../theme/tokens";

/** Mobile grouped white rounded card (matches F-EVENT-EDIT's GroupCard). */
export const GroupCard = styled(Box)(({ theme }) => ({
  background:
    theme.vars?.palette.background.paper ?? theme.palette.background.paper,
  border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
  borderRadius: radius.card,
  overflow: "hidden",
}));

/** A tappable row inside a mobile GroupCard, opening a BottomSheet editor.
 * Pass `first` to omit the top divider. */
export const GroupRow = styled(Button, {
  shouldForwardProp: (prop) => prop !== "first",
})<{ first?: boolean }>(({ theme, first }) => ({
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing,
  padding: theme.spacing(1.5, 2),
  borderRadius: 0,
  borderTop: first
    ? "none"
    : `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
  minHeight: 24,
  textAlign: "left",
  textTransform: "none",
  color: theme.vars?.palette.text.primary ?? theme.palette.text.primary,
  fontWeight: 400,
}));

export const sectionLabelSx = {
  display: "block",
  mb: 1,
} as const;
