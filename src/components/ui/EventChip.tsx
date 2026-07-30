import { forwardRef } from "react";
import {
  Box,
  alpha,
  useColorScheme,
  type SxProps,
  type Theme,
} from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";
import { publicTint, getContrastText, radius } from "../../theme/tokens";
import { isMobile } from "../../common/utils";

interface EventChipProps {
  title: string;
  color: string;
  time?: string;
  isPublic?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  sx?: SxProps<Theme>;
}

/**
 * Public = tinted background (12%/16%) + globe + colored bold text.
 * Private = solid fill + contrast text.
 * Used across Month/Week/Day event rendering and the EventQuickPeek popover.
 */
export const EventChip = forwardRef<HTMLElement, EventChipProps>(
  function EventChip({ title, color, time, isPublic, onClick, sx }, ref) {
    const { mode, systemMode } = useColorScheme();
    const resolvedMode = mode === "system" ? systemMode : mode;
    const tint = resolvedMode === "dark" ? publicTint.dark : publicTint.light;

    return (
      <Box
        ref={ref}
        component={onClick ? "button" : "span"}
        onClick={onClick}
        sx={[
          {
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            width: "100%",
            border: `1px solid ${resolvedMode === "dark" ? "#000000" : "#ffffff"}`,
            cursor: onClick ? "pointer" : "default",
            px: 1,
            py: 0.375,
            borderRadius: `${radius.sm}px`,
            fontSize: 12.5,
            fontWeight: 700,
            fontFamily: "inherit",
            lineHeight: 1.3,
            textAlign: "left",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            bgcolor: isPublic ? alpha(color, tint) : color,
            color: isPublic ? color : getContrastText(color),
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {isPublic && <PublicIcon sx={{ fontSize: 13, flexShrink: 0 }} />}
        {time && !isMobile && (
          <Box component="span" sx={{ opacity: 0.85, flexShrink: 0 }}>
            {time}
          </Box>
        )}
        <Box
          component="span"
          sx={{
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </Box>
      </Box>
    );
  },
);
