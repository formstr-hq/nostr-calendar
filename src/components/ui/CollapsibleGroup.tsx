import { useState, type ReactNode } from "react";
import { Box, Collapse, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

interface CollapsibleGroupProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  /** Rendered at the end of the header row, e.g. a create/connect button. Clicks are kept from toggling the group. */
  trailingAction?: ReactNode;
  /** Separator above the header, for groups stacked directly in a list (e.g. the sidebar). Omit when the group already sits inside its own bordered card (e.g. Settings), where it would double up with the card's border. */
  topBorder?: boolean;
  children: ReactNode;
}

/**
 * Header row (chevron + uppercase title + count) with a checkbox-list body
 * and an optional trailing action — used for the sidebar/settings "Synced" /
 * "Device only" calendar groups. Neither existing ad-hoc collapse pattern in
 * the codebase (`SettingsNavigation.tsx`'s heavier animated toggle, or
 * `styled.ts`'s single-toggle `CollapseToggle`) fits this shape.
 */
export function CollapsibleGroup({
  title,
  count,
  defaultOpen = true,
  trailingAction,
  topBorder = true,
  children,
}: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box
      sx={{
        borderTop: topBorder ? "1px solid" : "none",
        borderColor: "divider",
        pt: topBorder ? 1.5 : 0,
      }}
    >
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          borderRadius: 1,
          py: 0.5,
          px: 0.5,
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            color: "text.disabled",
            flexShrink: 0,
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 0.15s",
          }}
        />
        <Typography
          variant="overline"
          sx={{
            flex: 1,
            fontWeight: 700,
            letterSpacing: "1px",
            lineHeight: 1.4,
          }}
        >
          {title}
        </Typography>
        {count !== undefined && (
          <Typography variant="caption" color="text.disabled">
            {count}
          </Typography>
        )}
        {trailingAction && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex" }}>
            {trailingAction}
          </Box>
        )}
      </Box>
      <Collapse in={open}>
        <Box sx={{ pt: 0.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}
