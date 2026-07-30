import { useRef, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import type { ICalendarEvent } from "../../../utils/types";
import { isAllDayEvent } from "../../../utils/dateHelper";

interface UseEventDateTimeOptions {
  initialEvent: ICalendarEvent | null;
  eventDetails: ICalendarEvent;
  updateField: <K extends keyof ICalendarEvent>(
    key: K,
    value: ICalendarEvent[K],
  ) => void;
  /** Called after a begin-date change with the new begin-of-day, so the
   * caller can clamp a recurrence "until" date that's now before it. */
  onBeginDateChanged?: (beginDay: Dayjs) => void;
}

/** All-day toggle + begin/end date & time state for the editor (deviation
 * #8): does not change the storage shape — an event is still just
 * begin/end timestamps — this only derives display values and snaps them
 * to day boundaries. Moved out of `EventEditor.tsx` to stay under the
 * file-size guardrail. */
export function useEventDateTime({
  initialEvent,
  eventDetails,
  updateField,
  onBeginDateChanged,
}: UseEventDateTimeOptions) {
  const [allDay, setAllDay] = useState<boolean>(() =>
    initialEvent ? isAllDayEvent(initialEvent.begin, initialEvent.end) : false,
  );
  const lastTimesRef = useRef<{ begin: number; end: number } | null>(null);

  const handleToggleAllDay = (checked: boolean) => {
    if (checked) {
      lastTimesRef.current = {
        begin: eventDetails.begin,
        end: eventDetails.end,
      };
      const beginOfDay = dayjs(eventDetails.begin).startOf("day");
      const endDay = dayjs(eventDetails.end).startOf("day");
      updateField("begin", beginOfDay.valueOf());
      updateField("end", endDay.add(1, "day").valueOf());
    } else if (lastTimesRef.current) {
      const { begin, end } = lastTimesRef.current;
      lastTimesRef.current = null;
      updateField("begin", begin);
      updateField("end", end);
    } else {
      const begin = dayjs(eventDetails.begin)
        .hour(9)
        .minute(0)
        .second(0)
        .millisecond(0);
      updateField("begin", begin.valueOf());
      updateField("end", begin.add(1, "hour").valueOf());
    }
    setAllDay(checked);
  };

  const onBeginDateChange = (date: Dayjs | null) => {
    if (!date) return;
    const beginDay = date.startOf("day");
    const current = dayjs(eventDetails.begin);
    const nextBegin = allDay
      ? beginDay.valueOf()
      : beginDay.hour(current.hour()).minute(current.minute()).valueOf();
    updateField("begin", nextBegin);
    onBeginDateChanged?.(beginDay);
  };

  const onBeginTimeChange = (time: Dayjs | null) => {
    if (!time) return;
    const current = dayjs(eventDetails.begin);
    updateField(
      "begin",
      current
        .hour(time.hour())
        .minute(time.minute())
        .second(0)
        .millisecond(0)
        .valueOf(),
    );
  };

  const onEndDateChange = (date: Dayjs | null) => {
    if (!date) return;
    if (allDay) {
      updateField("end", date.startOf("day").add(1, "day").valueOf());
      return;
    }
    const current = dayjs(eventDetails.end);
    updateField(
      "end",
      date
        .hour(current.hour())
        .minute(current.minute())
        .second(0)
        .millisecond(0)
        .valueOf(),
    );
  };

  const onEndTimeChange = (time: Dayjs | null) => {
    if (!time) return;
    const current = dayjs(eventDetails.end);
    updateField(
      "end",
      current
        .hour(time.hour())
        .minute(time.minute())
        .second(0)
        .millisecond(0)
        .valueOf(),
    );
  };

  const beginDate = dayjs(eventDetails.begin);
  const beginTime = dayjs(eventDetails.begin);
  const endDate = allDay
    ? dayjs(eventDetails.end).subtract(1, "day")
    : dayjs(eventDetails.end);
  const endTime = dayjs(eventDetails.end);

  return {
    allDay,
    handleToggleAllDay,
    beginDate,
    beginTime,
    endDate,
    endTime,
    onBeginDateChange,
    onBeginTimeChange,
    onEndDateChange,
    onEndTimeChange,
  };
}
