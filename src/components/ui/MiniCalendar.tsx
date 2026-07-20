import {
  DateCalendar,
  DateCalendarProps,
} from "@mui/x-date-pickers/DateCalendar";
import dayjs, { Dayjs } from "dayjs";

interface MiniCalendarProps {
  date: Dayjs;
  onSelect: (date: Dayjs) => void;
}

/**
 * Compact month-grid date picker, used in the Sidebar for date jumping.
 * Wraps MUI's static DateCalendar (not the popup DatePicker) so day cells
 * keep the accessible gridcell role e2e specs already rely on.
 */
export function MiniCalendar({ date, onSelect }: MiniCalendarProps) {
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
        "& .MuiPickersDay-root": { fontSize: 12.5 },
      }}
    />
  );
}
