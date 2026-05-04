import { busyListMonthKeysForRange } from "./dateHelper";
import type { IBusyList, IBusyRange, ICalendarEvent } from "./types";

export function getBusyRangeForEvent(
  event: Pick<ICalendarEvent, "begin" | "end">,
): IBusyRange | null {
  if (!Number.isFinite(event.begin) || !Number.isFinite(event.end)) {
    return null;
  }

  if (event.end <= event.begin) {
    return null;
  }

  return { start: event.begin, end: event.end };
}

export function isExactBusyRangeInLists(
  listsByMonth: Record<string, IBusyList>,
  range: IBusyRange,
): boolean {
  const monthKeys = busyListMonthKeysForRange(range.start, range.end);

  return monthKeys.some((monthKey) =>
    listsByMonth[monthKey]?.ranges.some(
      (busyRange) =>
        busyRange.start === range.start && busyRange.end === range.end,
    ),
  );
}

export function canManageEventBusyList(
  event: Pick<
    ICalendarEvent,
    "calendarId" | "participants" | "source" | "user"
  >,
  userPubkey?: string,
): boolean {
  if (!userPubkey || event.source === "device" || !event.calendarId) {
    return false;
  }

  return event.user === userPubkey || event.participants.includes(userPubkey);
}
