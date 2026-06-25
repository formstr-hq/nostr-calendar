import { getYear, getMonth, getDate, getTime } from "date-fns";

function getSelectedWeekIndex(
  selectedDate: Date,
  weeks: Date[][],
  startTime: number,
) {
  const _year = getYear(selectedDate);
  const _month = getMonth(selectedDate);
  const _day = getDate(selectedDate);

  return weeks.findIndex((week) =>
    week.find(
      (day: Date) =>
        getTime(day) ===
        getTime(new Date(_year, _month, _day, startTime, 0, 0)),
    ),
  );
}
export default getSelectedWeekIndex;
