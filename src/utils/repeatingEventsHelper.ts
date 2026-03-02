import { ICalendarEvent } from "../stores/events";
import { RepeatingFrequency } from "./types";
import { RRule } from "rrule";

const RRULE_TO_FREQUENCY: Record<string, RepeatingFrequency> = {
  "FREQ=DAILY": RepeatingFrequency.Daily,
  "FREQ=WEEKLY": RepeatingFrequency.Weekly,
  "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR": RepeatingFrequency.Weekday,
  "FREQ=MONTHLY": RepeatingFrequency.Monthly,
  "FREQ=MONTHLY;INTERVAL=3": RepeatingFrequency.Quarterly,
  "FREQ=YEARLY": RepeatingFrequency.Yearly,
};

const FREQUENCY_TO_RRULE: Record<RepeatingFrequency, string | null> = {
  [RepeatingFrequency.None]: null,
  [RepeatingFrequency.Daily]: "FREQ=DAILY",
  [RepeatingFrequency.Weekly]: "FREQ=WEEKLY",
  [RepeatingFrequency.Weekday]: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  [RepeatingFrequency.Monthly]: "FREQ=MONTHLY",
  [RepeatingFrequency.Quarterly]: "FREQ=MONTHLY;INTERVAL=3",
  [RepeatingFrequency.Yearly]: "FREQ=YEARLY",
};

export function frequencyToRRule(freq: RepeatingFrequency): string | null {
  return FREQUENCY_TO_RRULE[freq] ?? null;
}

export function rruleToFrequency(rule: string): RepeatingFrequency | null {
  // Normalize: remove "RRULE:" prefix if present
  const normalized = rule.replace(/^RRULE:/i, "").trim();
  return RRULE_TO_FREQUENCY[normalized] ?? null;
}

function parseRRule(rruleStr: string, dtstart: Date): RRule {
  const normalized = rruleStr.replace(/^RRULE:/i, "").trim();
  return RRule.fromString(
    `DTSTART:${dtstart.toISOString().replace(/[-:]/g, "").split(".")[0]}Z\nRRULE:${normalized}`,
  );
}

export function isEventInDateRange(
  event: ICalendarEvent,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  const { begin, end, repeat } = event;
  const duration = end - begin;

  // Non-repeating: simple overlap check
  if (!repeat?.rrule) {
    return (
      (begin >= rangeStart && begin <= rangeEnd) ||
      (end >= rangeStart && end <= rangeEnd) ||
      (begin <= rangeStart && end >= rangeEnd)
    );
  }

  const dtstart = new Date(begin);
  const rule = parseRRule(repeat.rrule, dtstart);

  // Search for occurrences that could overlap with the range.
  // An occurrence overlaps if its start <= rangeEnd and its end >= rangeStart.
  // So we need occurrences starting between (rangeStart - duration) and rangeEnd.
  const searchStart = new Date(Math.max(begin, rangeStart - duration));
  const searchEnd = new Date(rangeEnd);

  const occurrences = rule.between(searchStart, searchEnd, true);

  return occurrences.some((occ) => {
    const occStart = occ.getTime();
    const occEnd = occStart + duration;
    return occStart <= rangeEnd && occEnd >= rangeStart;
  });
}

/**
 * Get the start timestamp of the next occurrence of a recurring event
 * that falls within [rangeStart, rangeEnd], or null if none.
 */
export function getNextOccurrenceInRange(
  event: ICalendarEvent,
  rangeStart: number,
  rangeEnd: number,
): number | null {
  const { begin, repeat } = event;

  if (!repeat?.rrule) {
    // Non-repeating: return begin if it's in range
    if (begin >= rangeStart && begin <= rangeEnd) {
      return begin;
    }
    return null;
  }

  const dtstart = new Date(begin);
  const rule = parseRRule(repeat.rrule, dtstart);

  const searchStart = new Date(Math.max(begin, rangeStart));
  const searchEnd = new Date(rangeEnd);

  const occurrences = rule.between(searchStart, searchEnd, true);

  if (occurrences.length > 0) {
    return occurrences[0].getTime();
  }

  return null;
}
