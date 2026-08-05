import { Box, Typography } from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import { useIntl } from "react-intl";
import { useDeviceCalendars } from "../../../stores/deviceCalendars";
import {
  deviceCalendarColor,
  stripDeviceCalendarPrefix,
} from "../../../utils/deviceCalendarAdapter";

/**
 * Read-only replacement for `CalendarListSelect` when editing a device event.
 * Moving events between OS calendars/accounts isn't a safe portable operation
 * on either platform, so the picker is locked to a static name + color row
 * instead of a dropdown — sourced from `useDeviceCalendars()` by stripping
 * the `device:` prefix off the event's synthetic calendarId.
 */
export function DeviceCalendarStaticRow({
  calendarId,
}: {
  calendarId: string;
}) {
  const intl = useIntl();
  const calendars = useDeviceCalendars((s) => s.calendars);
  const colorOverrides = useDeviceCalendars((s) => s.colorOverrides);
  const nativeId = stripDeviceCalendarPrefix(calendarId);
  const calendar = calendars.find((c) => c.id === nativeId);
  const color = calendar
    ? deviceCalendarColor(calendar, colorOverrides[nativeId])
    : "#4285f4";

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <CircleIcon sx={{ fontSize: 12, color, flexShrink: 0 }} />
      <Typography variant="body2" color="text.secondary" noWrap>
        {calendar?.name.trim() ||
          intl.formatMessage({ id: "deviceCalendar.unnamed" })}
      </Typography>
    </Box>
  );
}
