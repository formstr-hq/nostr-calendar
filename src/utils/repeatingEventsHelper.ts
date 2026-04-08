import { RRule } from "rrule";
import type { ICalendarEvent } from "./types";
import { RepeatingFrequency } from "./types";

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

export function normalizeRRule(rule: string): string {
  return rule.replace(/^RRULE:/i, "").trim();
}

export function formatRRuleUntil(timestampMs: number): string {
  return new Date(timestampMs)
    .toISOString()
    .replace(/[-:]/g, "")
    .split(".")[0] + "Z";
}

export function addUntilToRRule(rule: string, untilTimestampMs: number): string {
  const normalized = normalizeRRule(rule);
  if (!normalized) {
    return "";
  }

  const fragments = normalized
    .split(";")
    .map((fragment) => fragment.trim())
    .filter((fragment) => {
      const upperFragment = fragment.toUpperCase();
      return (
        fragment &&
        !upperFragment.startsWith("UNTIL=") &&
        !upperFragment.startsWith("COUNT=")
      );
    });

  fragments.push(`UNTIL=${formatRRuleUntil(untilTimestampMs)}`);
  return fragments.join(";");
}

export function getEventRRules(
  repeat: ICalendarEvent["repeat"] | undefined,
): string[] {
  if (!repeat) {
    return [];
  }

  const rules: string[] = [];

  const addRule = (rule: string | null | undefined) => {
    if (!rule) {
      return;
    }

    const normalized = normalizeRRule(rule);
    if (!normalized || rules.includes(normalized)) {
      return;
    }

    rules.push(normalized);
  };

  repeat.rrules.forEach(addRule);

  // Backward-compatibility for cached events that may still include repeat.rrule.
  const legacyRule = (repeat as { rrule?: string | null }).rrule;
  addRule(legacyRule);

  return rules;
}

export function rruleToFrequency(rule: string): RepeatingFrequency | null {
  const normalized = normalizeRRule(rule);
  return RRULE_TO_FREQUENCY[normalized] ?? null;
}

function parseRRule(rruleStr: string, dtstart: Date): RRule | null {
  const normalized = normalizeRRule(rruleStr);
  if (!normalized) {
    return null;
  }

  try {
    return RRule.fromString(
      `DTSTART:${dtstart.toISOString().replace(/[-:]/g, "").split(".")[0]}Z\nRRULE:${normalized}`,
    );
  } catch {
    return null;
  }
}

function eventOverlapsRange(
  begin: number,
  end: number,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  return (
    (begin >= rangeStart && begin <= rangeEnd) ||
    (end >= rangeStart && end <= rangeEnd) ||
    (begin <= rangeStart && end >= rangeEnd)
  );
}

export function isEventInDateRange(
  event: ICalendarEvent,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  const { begin, end, repeat } = event;
  const duration = end - begin;
  const recurrenceRules = getEventRRules(repeat);

  // Non-repeating: simple overlap check
  if (recurrenceRules.length === 0) {
    return eventOverlapsRange(begin, end, rangeStart, rangeEnd);
  }

  const dtstart = new Date(begin);
  const searchStart = new Date(Math.max(begin, rangeStart - duration));
  const searchEnd = new Date(rangeEnd);
  let hasValidRule = false;

  for (const recurrenceRule of recurrenceRules) {
    const rule = parseRRule(recurrenceRule, dtstart);
    if (!rule) {
      continue;
    }

    hasValidRule = true;
    const occurrences = rule.between(searchStart, searchEnd, true);

    const hasOverlap = occurrences.some((occ) => {
      const occStart = occ.getTime();
      const occEnd = occStart + duration;
      return occStart <= rangeEnd && occEnd >= rangeStart;
    });

    if (hasOverlap) {
      return true;
    }
  }

  // Fallback to base event overlap if recurrence tags are present but invalid.
  if (!hasValidRule) {
    return eventOverlapsRange(begin, end, rangeStart, rangeEnd);
  }

  return false;
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
  const recurrenceRules = getEventRRules(repeat);

  if (recurrenceRules.length === 0) {
    // Non-repeating: return begin if it's in range
    if (begin >= rangeStart && begin <= rangeEnd) {
      return begin;
    }
    return null;
  }

  const dtstart = new Date(begin);
  const searchStart = new Date(Math.max(begin, rangeStart));
  const searchEnd = new Date(rangeEnd);
  let hasValidRule = false;
  let nextOccurrence: number | null = null;

  for (const recurrenceRule of recurrenceRules) {
    const rule = parseRRule(recurrenceRule, dtstart);
    if (!rule) {
      continue;
    }

    hasValidRule = true;
    const occurrences = rule.between(searchStart, searchEnd, true);
    if (occurrences.length === 0) {
      continue;
    }

    const candidate = occurrences[0].getTime();
    if (nextOccurrence === null || candidate < nextOccurrence) {
      nextOccurrence = candidate;
    }
  }

  if (hasValidRule) {
    return nextOccurrence;
  }

  // Fallback to base event timing if recurrence tags are present but invalid.
  if (begin >= rangeStart && begin <= rangeEnd) {
    return begin;
  }

  return null;
}
