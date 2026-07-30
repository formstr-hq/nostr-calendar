import { Box } from "@mui/material";
import type { ReactNode } from "react";
import { ICalendarEvent } from "../../../utils/types";
import { EventBannerPlaceholder } from "../../../components/ui/EventBannerPlaceholder";

/**
 * Full-width event banner (mockups 12/20/21) — the event's `image` tag, or
 * a calm generic placeholder when it has none. `actions`, when given,
 * overlays the top-right corner (mobile bottom sheet's edit/kebab icons).
 */
export function EventBanner({
  event,
  actions,
  rounded = true,
}: {
  event: ICalendarEvent;
  actions?: ReactNode;
  rounded?: boolean;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        aspectRatio: { xs: "21 / 9", sm: "3 / 1" },
        overflow: "hidden",
        borderRadius: rounded ? "12px" : 0,
        flexShrink: 0,
      }}
    >
      {event.image ? (
        <Box
          component="img"
          src={event.image}
          alt=""
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <EventBannerPlaceholder />
      )}
      {actions && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            gap: 0.5,
            bgcolor: "background.paper",
            borderRadius: "999px",
            boxShadow: 1,
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
