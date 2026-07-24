import dayjs, { Dayjs } from "dayjs";
import { normalizeRule, parseRuleParts } from "./repeatingEventsHelper";

export type CustomUnit = "day" | "week";
export type CustomEndMode = "never" | "until" | "count";

export interface CustomRecurrenceDraft {
  interval: number;
  unit: CustomUnit;
  weekDays: string[];
  endMode: CustomEndMode;
  endDate: Dayjs | null;
  count: number;
}

export const WEEKDAY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "SU", label: "S" },
  { code: "MO", label: "M" },
  { code: "TU", label: "T" },
  { code: "WE", label: "W" },
  { code: "TH", label: "T" },
  { code: "FR", label: "F" },
  { code: "SA", label: "S" },
];

function parseUntilDate(untilValue?: string): Dayjs | null {
  if (!untilValue) {
    return null;
  }

  const value = untilValue.trim().toUpperCase();

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return dayjs(
      new Date(
        Date.UTC(
          Number.parseInt(value.slice(0, 4), 10),
          Number.parseInt(value.slice(4, 6), 10) - 1,
          Number.parseInt(value.slice(6, 8), 10),
          Number.parseInt(value.slice(9, 11), 10),
          Number.parseInt(value.slice(11, 13), 10),
          Number.parseInt(value.slice(13, 15), 10),
        ),
      ),
    ).startOf("day");
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    return dayjs(
      new Date(
        Number.parseInt(value.slice(0, 4), 10),
        Number.parseInt(value.slice(4, 6), 10) - 1,
        Number.parseInt(value.slice(6, 8), 10),
        Number.parseInt(value.slice(9, 11), 10),
        Number.parseInt(value.slice(11, 13), 10),
        Number.parseInt(value.slice(13, 15), 10),
      ),
    ).startOf("day");
  }

  if (/^\d{8}$/.test(value)) {
    return dayjs(
      new Date(
        Number.parseInt(value.slice(0, 4), 10),
        Number.parseInt(value.slice(4, 6), 10) - 1,
        Number.parseInt(value.slice(6, 8), 10),
      ),
    ).startOf("day");
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.startOf("day") : null;
}

function formatUntilDate(date: Dayjs): string {
  return `${
    date.endOf("day").toDate().toISOString().replace(/[-:]/g, "").split(".")[0]
  }Z`;
}

export function createDefaultCustomDraft(
  baseDate: Dayjs,
): CustomRecurrenceDraft {
  return {
    interval: 1,
    unit: "week",
    weekDays: ["MO"],
    endMode: "never",
    endDate: baseDate.startOf("day"),
    count: 1,
  };
}

export function getCustomDraftFromRule(
  rule: string,
  fallbackDate: Dayjs,
): CustomRecurrenceDraft {
  const draft = createDefaultCustomDraft(fallbackDate);
  const parsed = parseRuleParts(rule);

  if (parsed.FREQ === "DAILY") {
    draft.unit = "day";
  } else if (parsed.FREQ === "WEEKLY") {
    draft.unit = "week";
  }

  const interval = Number.parseInt(parsed.INTERVAL ?? "1", 10);
  draft.interval = Number.isFinite(interval) && interval > 0 ? interval : 1;

  if (draft.unit === "week") {
    const weekDays = (parsed.BYDAY ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) =>
        WEEKDAY_OPTIONS.some((weekday) => weekday.code === part),
      );

    if (weekDays.length > 0) {
      draft.weekDays = Array.from(new Set(weekDays));
    }
  }

  const count = Number.parseInt(parsed.COUNT ?? "", 10);
  if (Number.isFinite(count) && count > 0) {
    draft.endMode = "count";
    draft.count = count;
  } else {
    const untilDate = parseUntilDate(parsed.UNTIL);
    if (untilDate) {
      draft.endMode = "until";
      draft.endDate = untilDate;
    }
  }

  return draft;
}

export function buildCustomRecurrenceRule(
  draft: CustomRecurrenceDraft,
): string {
  const parts = [draft.unit === "day" ? "FREQ=DAILY" : "FREQ=WEEKLY"];

  if (draft.interval > 1) {
    parts.push(`INTERVAL=${draft.interval}`);
  }

  if (draft.unit === "week") {
    const weekDays = (draft.weekDays.length > 0 ? draft.weekDays : ["MO"]).join(
      ",",
    );
    parts.push(`BYDAY=${weekDays}`);
  }

  if (draft.endMode === "count") {
    parts.push(`COUNT=${Math.max(1, draft.count)}`);
  } else if (draft.endMode === "until" && draft.endDate) {
    parts.push(`UNTIL=${formatUntilDate(draft.endDate)}`);
  }

  return normalizeRule(parts.join(";"));
}
