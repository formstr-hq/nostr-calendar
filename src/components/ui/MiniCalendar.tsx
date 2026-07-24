import {
  DateCalendar,
  DateCalendarProps,
} from "@mui/x-date-pickers/DateCalendar";
import dayjs, { Dayjs } from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import type { WeekStart } from "../../stores/settings";
import { weekStartIndex } from "../../utils/calendarSettings";

dayjs.extend(updateLocale);

interface MiniCalendarProps {
  date: Dayjs;
  weekStart: WeekStart;
  onSelect: (date: Dayjs) => void;
}

/**
 * Compact month-grid date picker, used in the Sidebar for date jumping.
 * Wraps MUI's static DateCalendar (not the popup DatePicker) so day cells
 * keep the accessible gridcell role e2e specs already rely on.
 */
export function MiniCalendar({ date, weekStart, onSelect }: MiniCalendarProps) {
  // MUI's Dayjs adapter reads the locale's `weekStart` for the month grid.
  // Keep the sidebar picker in sync with the calendar preference.
  dayjs.updateLocale(date.locale(), { weekStart: weekStartIndex[weekStart] });
  const onChange: DateCalendarProps["onChange"] = (newDate) => {
    if (newDate) onSelect(newDate);
  };

  return (
    <DateCalendar
      value={dayjs(date.format())}
      onChange={onChange}
      sx={{
        width: "100%",
        maxHeight: 280,
        "& .MuiPickersCalendarHeader-root": { pl: 1, pr: 0.5 },
        "& .MuiDayCalendar-weekDayLabel": { fontSize: 11 },
        "& .MuiPickersDay-root": {
          fontSize: 12.5,
          width: 28,
          height: 28,
          margin: "0 1px",
          flexShrink: 0,
        },
      }}
    />
  );
}
