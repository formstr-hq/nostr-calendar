import { memo } from "react";
import { Box, Checkbox, Typography } from "@mui/material";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import RepeatIcon from "@mui/icons-material/Repeat";
import dayjs from "dayjs";
import type { ICalendarEvent } from "../../../utils/types";
import { radius } from "../../../theme/tokens";

interface BulkImportEventItemProps {
  event: ICalendarEvent;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export const BulkImportEventItem = memo(function BulkImportEventItem({
  event,
  selected,
  onToggle,
  disabled = false,
}: BulkImportEventItemProps) {
  const isAllDay =
    event.allDay || dayjs(event.end).diff(dayjs(event.begin), "hour") >= 24;

  const dateText = isAllDay
    ? `${dayjs(event.begin).format("MMM D, YYYY")} (All day)`
    : `${dayjs(event.begin).format("MMM D, YYYY · h:mm A")} - ${dayjs(event.end).format("h:mm A")}`;

  const locationText =
    event.location && event.location.length > 0
      ? event.location.join(", ")
      : null;

  return (
    <Box
      onClick={disabled ? undefined : onToggle}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 1.25,
        borderRadius: `${radius.sm}px`,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background-color 120ms ease",
        "&:hover": {
          bgcolor: disabled ? "transparent" : "action.hover",
        },
      }}
    >
      <Checkbox
        checked={selected}
        onChange={disabled ? undefined : onToggle}
        disabled={disabled}
        size="small"
        sx={{ p: 0.5, mt: 0.25 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {event.title || "Imported Event"}
          </Typography>
          {event.repeat?.rrule && (
            <RepeatIcon
              fontSize="inherit"
              sx={{ color: "text.secondary", fontSize: 14 }}
            />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" display="block">
          {dateText}
        </Typography>
        {locationText && (
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}
          >
            <LocationOnOutlinedIcon
              sx={{ fontSize: 12, color: "text.secondary" }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {locationText}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
});
