import dayjs, { Dayjs } from "dayjs";

export function isWeekend(date: string | Date | Dayjs): boolean {
  const d = dayjs(date);
  const day = d.day(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
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
