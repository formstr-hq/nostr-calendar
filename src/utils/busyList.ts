import { busyListMonthKeysForRange } from "./dateHelper";
import type { IBusyList, IBusyRange, ICalendarEvent } from "./types";

type BusyListSupportCandidate = Pick<
  ICalendarEvent,
  "begin" | "end" | "id" | "repeat" | "source"
>;

type BusyListRelevantEvent = Pick<
  ICalendarEvent,
  "begin" | "end" | "id" | "calendarId" | "source" | "user"
>;

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

function canEventContributeToBusyList(
  event: BusyListRelevantEvent,
  userPubkey?: string,
): boolean {
  if (!userPubkey || event.source === "device") {
    return false;
  }

  return Boolean(event.calendarId) || event.user === userPubkey;
}

export function hasBusyListTimeConflict(
  event: BusyListSupportCandidate,
  events: BusyListRelevantEvent[],
  userPubkey?: string,
): boolean {
  const busyRange = getBusyRangeForEvent(event);
  if (!busyRange || !userPubkey) {
    return false;
  }

  return events.some(
    (existingEvent) =>
      existingEvent.id !== event.id &&
      canEventContributeToBusyList(existingEvent, userPubkey) &&
      existingEvent.begin === busyRange.start &&
      existingEvent.end === busyRange.end,
  );
}

/**
 * Public busy lists currently store only raw time ranges, so recurring events
 * and distinct events with the exact same range cannot be toggled safely as an
 * event-specific action.
 */
export function isBusyListRangeSupportedForEvent(
  event: BusyListSupportCandidate,
  events: BusyListRelevantEvent[],
  userPubkey?: string,
): boolean {
  if (
    !userPubkey ||
    event.source === "device" ||
    !getBusyRangeForEvent(event) ||
    Boolean(event.repeat?.rrule)
  ) {
    return false;
  }

  return !hasBusyListTimeConflict(event, events, userPubkey);
}
