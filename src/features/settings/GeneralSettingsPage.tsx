import { MenuItem, Select, Stack, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { useCalendarLists } from "../../stores/calendarLists";
import {
  type DefaultDuration,
  type TimeFormat,
  useSettings,
  type WeekStart,
} from "../../stores/settings";
import { SettingsCard, SettingsRow } from "./components/SettingsCard";

const durations: DefaultDuration[] = [25, 30, 55, 60];
const reminders = [0, 5, 10, 15, 30, 60];
const times = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`,
);

export function GeneralSettingsPage() {
  const intl = useIntl();
  const general = useSettings((state) => state.settings.general);
  const update = useSettings((state) => state.updateGeneralSetting);
  const calendars = useCalendarLists((state) => state.calendars);

  return (
    <>
      <Typography variant="h5" fontWeight={800}>
        {intl.formatMessage({ id: "settings.general" })}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        {intl.formatMessage({ id: "settings.generalDescription" })}
      </Typography>

      <SettingsCard label={intl.formatMessage({ id: "settings.basics" })}>
        <SettingsRow label={intl.formatMessage({ id: "settings.weekStart" })}>
          <Select
            size="small"
            value={general.weekStart}
            onChange={(event) =>
              update("weekStart", event.target.value as WeekStart)
            }
            inputProps={{ "aria-label": "Start week on" }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="monday">Monday</MenuItem>
            <MenuItem value="sunday">Sunday</MenuItem>
            <MenuItem value="saturday">Saturday</MenuItem>
          </Select>
        </SettingsRow>
        <SettingsRow label={intl.formatMessage({ id: "settings.timeFormat" })}>
          <Select
            size="small"
            value={general.timeFormat}
            onChange={(event) =>
              update("timeFormat", event.target.value as TimeFormat)
            }
            inputProps={{ "aria-label": "Time format" }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="12h">12-hour</MenuItem>
            <MenuItem value="24h">24-hour</MenuItem>
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard label={intl.formatMessage({ id: "settings.newEvents" })}>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.defaultCalendar" })}
        >
          <Select
            size="small"
            displayEmpty
            value={general.defaultCalendarId}
            onChange={(event) =>
              update("defaultCalendarId", event.target.value)
            }
            inputProps={{ "aria-label": "Default calendar" }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">
              {intl.formatMessage({ id: "settings.firstCalendar" })}
            </MenuItem>
            {calendars.map((calendar) => (
              <MenuItem key={calendar.id} value={calendar.id}>
                {calendar.title}
              </MenuItem>
            ))}
          </Select>
        </SettingsRow>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.defaultDuration" })}
        >
          <Select
            size="small"
            value={general.defaultDuration}
            onChange={(event) =>
              update("defaultDuration", event.target.value as DefaultDuration)
            }
            inputProps={{ "aria-label": "Default duration" }}
            sx={{ minWidth: 150 }}
          >
            {durations.map((duration) => (
              <MenuItem key={duration} value={duration}>
                {duration} min
              </MenuItem>
            ))}
          </Select>
        </SettingsRow>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.defaultReminder" })}
        >
          <Select
            size="small"
            value={general.defaultReminderMinutes}
            onChange={(event) =>
              update("defaultReminderMinutes", Number(event.target.value))
            }
            inputProps={{ "aria-label": "Default reminder" }}
            sx={{ minWidth: 150 }}
          >
            {reminders.map((minutes) => (
              <MenuItem key={minutes} value={minutes}>
                {minutes === 0 ? "None" : `${minutes} min`}
              </MenuItem>
            ))}
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard
        label={intl.formatMessage({ id: "settings.calendarViews" })}
      >
        <SettingsRow
          label={intl.formatMessage({ id: "settings.workingHours" })}
          hint={intl.formatMessage({ id: "settings.workingHoursHint" })}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <Select
              size="small"
              value={general.workingHours.start}
              onChange={(event) =>
                update("workingHours", {
                  ...general.workingHours,
                  start: event.target.value,
                })
              }
              inputProps={{ "aria-label": "Working hours start" }}
            >
              {times.map((time) => (
                <MenuItem key={time} value={time}>
                  {time}
                </MenuItem>
              ))}
            </Select>
            <Typography color="text.secondary">–</Typography>
            <Select
              size="small"
              value={general.workingHours.end}
              onChange={(event) =>
                update("workingHours", {
                  ...general.workingHours,
                  end: event.target.value,
                })
              }
              inputProps={{ "aria-label": "Working hours end" }}
            >
              {times.map((time) => (
                <MenuItem key={time} value={time}>
                  {time}
                </MenuItem>
              ))}
            </Select>
          </Stack>
        </SettingsRow>
      </SettingsCard>
    </>
  );
}
