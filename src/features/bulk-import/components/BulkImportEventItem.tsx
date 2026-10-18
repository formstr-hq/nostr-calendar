import { memo } from "react";
import { Box, Checkbox, Typography } from "@mui/material";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import RepeatIcon from "@mui/icons-material/Repeat";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import type { ICalendarEvent } from "../../../utils/types";
import { radius } from "../../../theme/tokens";

interface BulkImportEventItemProps {
  event: ICalendarEvent;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  destinationName?: string;
  destinationColor?: string;
}

export const BulkImportEventItem = memo(function BulkImportEventItem({
  event,
  selected,
  onToggle,
  disabled = false,
  destinationName,
  destinationColor,
}: BulkImportEventItemProps) {
  const intl = useIntl();
  const isAllDay =
    event.allDay || dayjs(event.end).diff(dayjs(event.begin), "hour") >= 24;

  const allDayLabel = intl.formatMessage({ id: "event.allDayLabel" });
  const dateText = isAllDay
    ? `${dayjs(event.begin).format("MMM D, YYYY")} (${allDayLabel})`
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
          {destinationName && (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.75,
                py: 0.15,
                borderRadius: `${radius.sm}px`,
                bgcolor: "action.hover",
                border: "1px solid",
                borderColor: "divider",
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: destinationColor || "primary.main",
                }}
              />
              <Typography
                variant="caption"
                sx={{ fontSize: "0.7rem", fontWeight: 600 }}
              >
                → {destinationName}
              </Typography>
            </Box>
          )}
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
