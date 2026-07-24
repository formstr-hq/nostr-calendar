import type { Dayjs } from "dayjs";
import type { TimeFormat, WeekStart } from "../stores/settings";

const weekStartIndex: Record<WeekStart, number> = {
  sunday: 0,
  monday: 1,
  saturday: 6,
};

export function startOfConfiguredWeek(date: Dayjs, weekStart: WeekStart) {
  const delta = (date.day() - weekStartIndex[weekStart] + 7) % 7;
  return date.startOf("day").subtract(delta, "day");
}

export function formatCalendarTime(
  value: Dayjs,
  timeFormat: TimeFormat,
): string {
  return value.format(timeFormat === "12h" ? "h:mm A" : "HH:mm");
}

export function hourLabel(hour: number, timeFormat: TimeFormat): string {
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}:00`;
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return `${hour % 12} ${hour < 12 ? "AM" : "PM"}`;
}

export function parseHour(value: string): number {
  return Number.parseInt(value.split(":")[0], 10);
}
