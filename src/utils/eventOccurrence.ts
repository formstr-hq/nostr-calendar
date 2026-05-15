import type { ICalendarEvent } from "./types";

export const OCCURRENCE_START_PARAM = "occurrenceStart";
export const OCCURRENCE_END_PARAM = "occurrenceEnd";

export interface EventOccurrenceRange {
  begin: number;
  end: number;
}

const isValidTimestamp = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isValidRange = (
  range: EventOccurrenceRange | undefined,
): range is EventOccurrenceRange =>
  !!range && isValidTimestamp(range.begin) && range.end > range.begin;

const parseTimestampParam = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const timestamp = Number(value);
  return isValidTimestamp(timestamp) ? timestamp : undefined;
};

export function getEventOccurrenceRange(
  event: ICalendarEvent,
): EventOccurrenceRange | undefined {
  if (!event.repeat?.rrule) return undefined;

  const range = {
    begin: event.occurrenceBegin,
    end: event.occurrenceEnd,
  };

  return isValidRange(range) ? range : undefined;
}

export function getEventDisplayRange(
  event: ICalendarEvent,
): EventOccurrenceRange {
  return (
    getEventOccurrenceRange(event) ?? {
      begin: event.begin,
      end: event.end,
    }
  );
}

export function applyEventOccurrenceRange(
  event: ICalendarEvent,
  occurrenceRange: EventOccurrenceRange | undefined,
): ICalendarEvent {
  if (!event.repeat?.rrule || !isValidRange(occurrenceRange)) {
    return event;
  }

  return {
    ...event,
    occurrenceBegin: occurrenceRange.begin,
    occurrenceEnd: occurrenceRange.end,
  };
}

export function getEventOccurrenceRangeFromQuery(
  occurrenceStartParam: string | null,
  occurrenceEndParam: string | null,
  event: ICalendarEvent,
): EventOccurrenceRange | undefined {
  const begin = parseTimestampParam(occurrenceStartParam);
  if (!begin) return undefined;

  const end = parseTimestampParam(occurrenceEndParam);
  if (end && end > begin) {
    return { begin, end };
  }

  const duration = event.end - event.begin;
  if (duration <= 0) return undefined;

  return {
    begin,
    end: begin + duration,
  };
}
