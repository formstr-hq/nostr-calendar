import dayjs, { Dayjs } from "dayjs";

export function isWeekend(date: string | Date | Dayjs): boolean {
  const d = dayjs(date);
  const day = d.day(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

/**
 * True when an event spans one or more complete local days: starts and ends
 * at local midnight (hour/minute 00:00) some whole number of days apart.
 * There is no explicit "all day" toggle in the editor — this is derived
 * purely from begin/end so any event that happens to span full days (e.g. a
 * multi-day trip) renders as an all-day chip automatically.
 *
 * Deliberately checks only hour/minute, not seconds/ms: the event editor's
 * DateTimePicker has no seconds field, so a value the user set to "12:00 AM"
 * still carries whatever seconds/ms it inherited from the picker's initial
 * "now" default — an exact-millisecond midnight check would never match
 * anything a user could actually create through the UI.
 */
export function isAllDayEvent(begin: number, end: number): boolean {
  if (!(end > begin)) return false;
  const start = dayjs(begin);
  const finish = dayjs(end);
  if (start.hour() !== 0 || start.minute() !== 0) return false;
  if (finish.hour() !== 0 || finish.minute() !== 0) return false;
  const durationDays = finish.startOf("day").diff(start.startOf("day"), "day");
  return durationDays >= 1;
}

export const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString();

/**
 * Format a Date (or ms timestamp) as the busy-list month partition key
 * `YYYY-MM` (UTC). Example: `2026-04`.
 */
export function busyListMonthKey(value: number | Date): string {
  const d = typeof value === "number" ? new Date(value) : value;
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${year}-${month}`;
}

/**
 * Return the set of `YYYY-MM` partition keys that the given absolute time
 * range `[startMs, endMs]` touches. Always at least one entry; multi-month
 * ranges (rare, e.g. last-day-of-month meetings spilling past midnight)
 * return every month inclusive.
 */
export function busyListMonthKeysForRange(
  startMs: number,
  endMs: number,
): string[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
  const start = startMs <= endMs ? startMs : endMs;
  const end = startMs <= endMs ? endMs : startMs;

  const keys: string[] = [];
  const cursor = new Date(
    Date.UTC(
      new Date(start).getUTCFullYear(),
      new Date(start).getUTCMonth(),
      1,
    ),
  );
  const endMonth = new Date(
    Date.UTC(new Date(end).getUTCFullYear(), new Date(end).getUTCMonth(), 1),
  );
  while (cursor.getTime() <= endMonth.getTime()) {
    keys.push(busyListMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}
