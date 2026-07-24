import { Box, Button, styled } from "@mui/material";
import { radius, spacing } from "../../../theme/tokens";

/** Desktop "More options" / advanced-settings box: subtle recessed panel. */
export const AdvancedBox = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1.75),
  background:
    theme.vars?.palette.background.canvas ?? theme.palette.background.canvas,
  border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
  borderRadius: radius.card,
  padding: theme.spacing(2, 2.25),
}));

/** A label/control row inside an AdvancedBox. */
export const AdvRow = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing,
  minHeight: 32,
});

/** Mobile grouped white rounded card (WHEN/Calendar/Invitees/Attachments/…). */
export const GroupCard = styled(Box)(({ theme }) => ({
  background:
    theme.vars?.palette.background.paper ?? theme.palette.background.paper,
  border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
  borderRadius: radius.card,
  overflow: "hidden",
}));

/** A row inside a mobile GroupCard. Pass `first` to omit the top divider. */
export const GroupRow = styled(Box, {
  shouldForwardProp: (prop) => prop !== "first",
})<{ first?: boolean }>(({ theme, first }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing,
  padding: theme.spacing(1.5, 2),
  borderTop: first
    ? "none"
    : `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
  minHeight: 24,
}));

/** "▸ More options" / "▸ Attachments — Formstr form" collapse toggle. */
export const CollapseToggle = styled(Button)(({ theme }) => ({
  justifyContent: "flex-start",
  padding: theme.spacing(0.5, 0),
  minHeight: "auto",
  fontSize: 12.5,
  fontWeight: 600,
  color: theme.vars?.palette.text.secondary ?? theme.palette.text.secondary,
}));

/** Uppercase small section label above a desktop section (WHEN/PEOPLE/WHERE/NOTES). */
export const sectionLabelSx = {
  display: "block",
  mb: 1,
} as const;
