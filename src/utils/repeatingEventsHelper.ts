import type { ICalendarEvent } from "./types";
import { RepeatingFrequency } from "./types";
import { RRule } from "rrule";

const RRULE_PREFIX = /^RRULE:/i;
const WEEKDAY_RULE = "MO,TU,WE,TH,FR";

const FREQUENCY_TO_RRULE: Record<RepeatingFrequency, string | null> = {
  [RepeatingFrequency.None]: null,
  [RepeatingFrequency.Daily]: "FREQ=DAILY",
  [RepeatingFrequency.Weekly]: "FREQ=WEEKLY",
  [RepeatingFrequency.Weekday]: `FREQ=WEEKLY;BYDAY=${WEEKDAY_RULE}`,
  [RepeatingFrequency.Monthly]: "FREQ=MONTHLY",
  [RepeatingFrequency.Quarterly]: "FREQ=MONTHLY;INTERVAL=3",
  [RepeatingFrequency.Yearly]: "FREQ=YEARLY",
};

export type RecurrenceEndMode = "never" | "count" | "until";

export interface ParsedRecurrenceRule {
  frequency: RepeatingFrequency | null;
  endMode: RecurrenceEndMode;
  count: number | null;
  untilDate: number | null;
}

interface ParsedRuleParts {
  freq?: string;
  interval?: string;
  byDay?: string;
  count?: string;
  until?: string;
  hasUnsupportedParts: boolean;
}

const EMPTY_RECURRENCE_RULE: ParsedRecurrenceRule = {
  frequency: null,
  endMode: "never",
  count: null,
  untilDate: null,
};

function normalizeRule(rule: string): string {
  return rule.replace(RRULE_PREFIX, "").trim();
}

function parseRuleParts(rule: string): ParsedRuleParts {
  const parts = normalizeRule(rule).split(";").filter(Boolean);
  const parsed: ParsedRuleParts = {
    hasUnsupportedParts: false,
  };

  for (const part of parts) {
    const [rawKey, rawValue] = part.split("=", 2);
    if (!rawKey || !rawValue) {
      parsed.hasUnsupportedParts = true;
      continue;
    }

    const key = rawKey.toUpperCase();
    const value = rawValue.toUpperCase();

    switch (key) {
      case "FREQ":
        parsed.freq = value;
        break;
      case "INTERVAL":
        parsed.interval = value;
        break;
      case "BYDAY":
        parsed.byDay = value;
        break;
      case "COUNT":
        parsed.count = value;
        break;
      case "UNTIL":
        parsed.until = value;
        break;
      default:
        parsed.hasUnsupportedParts = true;
        break;
    }
  }

  return parsed;
}

function getFrequencyFromParts(parts: ParsedRuleParts): RepeatingFrequency | null {
  if (parts.hasUnsupportedParts || !parts.freq) {
    return null;
  }

  if (!parts.interval && !parts.byDay) {
    if (parts.freq === "DAILY") return RepeatingFrequency.Daily;
    if (parts.freq === "WEEKLY") return RepeatingFrequency.Weekly;
    if (parts.freq === "MONTHLY") return RepeatingFrequency.Monthly;
    if (parts.freq === "YEARLY") return RepeatingFrequency.Yearly;
  }

  if (
    parts.freq === "WEEKLY" &&
    !parts.interval &&
    parts.byDay === WEEKDAY_RULE
  ) {
    return RepeatingFrequency.Weekday;
  }

  if (
    parts.freq === "MONTHLY" &&
    parts.interval === "3" &&
    !parts.byDay
  ) {
    return RepeatingFrequency.Quarterly;
  }

  return null;
}

function parsePositiveInteger(value?: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function parseRRuleDate(value: string): number | null {
  const clean = value.trim().toUpperCase();

  if (/^\d{8}T\d{6}Z$/.test(clean)) {
    return Date.UTC(
      Number.parseInt(clean.slice(0, 4), 10),
      Number.parseInt(clean.slice(4, 6), 10) - 1,
      Number.parseInt(clean.slice(6, 8), 10),
      Number.parseInt(clean.slice(9, 11), 10),
      Number.parseInt(clean.slice(11, 13), 10),
      Number.parseInt(clean.slice(13, 15), 10),
    );
  }

  if (/^\d{8}T\d{6}$/.test(clean)) {
    return Date.UTC(
      Number.parseInt(clean.slice(0, 4), 10),
      Number.parseInt(clean.slice(4, 6), 10) - 1,
      Number.parseInt(clean.slice(6, 8), 10),
      Number.parseInt(clean.slice(9, 11), 10),
      Number.parseInt(clean.slice(11, 13), 10),
      Number.parseInt(clean.slice(13, 15), 10),
    );
  }

  if (/^\d{8}$/.test(clean)) {
    return Date.UTC(
      Number.parseInt(clean.slice(0, 4), 10),
      Number.parseInt(clean.slice(4, 6), 10) - 1,
      Number.parseInt(clean.slice(6, 8), 10),
    );
  }

  return null;
}

function formatRRuleDate(timestamp: number): string {
  return (
    new Date(timestamp).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
  );
}

function alignUntilDateWithEventStart(
  untilDate: number,
  eventStart: number,
): number {
  const until = new Date(untilDate);
  const start = new Date(eventStart);

  return new Date(
    until.getFullYear(),
    until.getMonth(),
    until.getDate(),
    start.getHours(),
    start.getMinutes(),
    start.getSeconds(),
    start.getMilliseconds(),
  ).getTime();
}

export function frequencyToRRule(freq: RepeatingFrequency): string | null {
  return FREQUENCY_TO_RRULE[freq] ?? null;
}

export function rruleToFrequency(rule: string): RepeatingFrequency | null {
  return parseRecurrenceRule(rule).frequency;
}

export function parseRecurrenceRule(
  rule: string | null | undefined,
): ParsedRecurrenceRule {
  if (!rule) {
    return EMPTY_RECURRENCE_RULE;
  }

  const parts = parseRuleParts(rule);
  const frequency = getFrequencyFromParts(parts);
  if (!frequency) {
    return EMPTY_RECURRENCE_RULE;
  }

  const count = parsePositiveInteger(parts.count);
  const untilDate = parts.until ? parseRRuleDate(parts.until) : null;

  if (count !== null) {
    return {
      frequency,
      endMode: "count",
      count,
      untilDate: null,
    };
  }

  if (untilDate !== null) {
    return {
      frequency,
      endMode: "until",
      count: null,
      untilDate,
    };
  }

  return {
    frequency,
    endMode: "never",
    count: null,
    untilDate: null,
  };
}

export function buildRecurrenceRule({
  frequency,
  endMode = "never",
  count,
  untilDate,
  eventStart,
}: {
  frequency: RepeatingFrequency;
  endMode?: RecurrenceEndMode;
  count?: number | null;
  untilDate?: number | null;
  eventStart: number;
}): string | null {
  const baseRule = frequencyToRRule(frequency);
  if (!baseRule) {
    return null;
  }

  const ruleParts = [normalizeRule(baseRule)];

  if (endMode === "count") {
    const safeCount = Math.max(1, parsePositiveInteger(String(count ?? "")) ?? 1);
    ruleParts.push(`COUNT=${safeCount}`);
  } else if (endMode === "until" && untilDate !== null && untilDate !== undefined) {
    const alignedUntil = Math.max(
      alignUntilDateWithEventStart(untilDate, eventStart),
      eventStart,
    );
    ruleParts.push(`UNTIL=${formatRRuleDate(alignedUntil)}`);
  }

  return ruleParts.join(";");
}

function parseRRule(rruleStr: string, dtstart: Date): RRule {
  const normalized = normalizeRule(rruleStr);
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
