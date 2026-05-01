import type { ISchedulingPage, ITimeSlot, IAvailabilityWindow } from "./types";

/**
 * Parse "HH:MM" string into { hours, minutes }.
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(":").map(Number);
  return { hours: h, minutes: m };
}

/**
 * Create a Date in a given IANA timezone for a specific date and time.
 * Returns the corresponding UTC Date.
 */
function dateInTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string,
): Date {
  // Build an ISO-like string and resolve it in the target timezone
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;

  // Use Intl to find the UTC offset for this datetime in the given timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Create a tentative date assuming UTC, then adjust
  const tentative = new Date(dateStr + "Z");

  // Format the tentative date in the target timezone to find offset
  const parts = formatter.formatToParts(tentative);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const tzYear = get("year");
  const tzMonth = get("month") - 1;
  const tzDay = get("day");
  const tzHour = get("hour") === 24 ? 0 : get("hour");
  const tzMinute = get("minute");

  const tzDate = new Date(
    Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, 0),
  );
  const offsetMs = tzDate.getTime() - tentative.getTime();

  // The actual UTC time = local time - offset
  const target = new Date(dateStr + "Z");
  target.setTime(target.getTime() - offsetMs);
  return target;
}

/**
 * Get the day of week for a date in a specific timezone.
 */
function getDayOfWeekInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekday = formatter.format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

/**
 * Get year, month, day for a Date in a specific timezone.
 */
function getDatePartsInTimezone(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

type BlockedTimeRange = {
  startMinutes: number;
  endMinutes: number;
};

function parseBlockedDates(entries: string[]): {
  fullDay: Set<string>;
  timedByDate: Map<string, BlockedTimeRange[]>;
} {
  const fullDay = new Set<string>();
  const timedByDate = new Map<string, BlockedTimeRange[]>();

  for (const entry of entries) {
    const [date, startTime, endTime] = entry.split("|");
    if (!date) continue;

    if (!startTime || !endTime) {
      fullDay.add(date);
      continue;
    }

    const start = parseTime(startTime);
    const end = parseTime(endTime);
    const startMinutes = start.hours * 60 + start.minutes;
    const endMinutes = end.hours * 60 + end.minutes;

    if (endMinutes <= startMinutes) {
      continue;
    }

    const list = timedByDate.get(date) ?? [];
    list.push({ startMinutes, endMinutes });
    timedByDate.set(date, list);
  }

  for (const [date, ranges] of timedByDate.entries()) {
    ranges.sort((a, b) => a.startMinutes - b.startMinutes);
    timedByDate.set(date, ranges);
  }

  return { fullDay, timedByDate };
}

function splitSlotByBlockedRanges(
  slot: ITimeSlot,
  blockedRanges: BlockedTimeRange[],
  year: number,
  month: number,
  day: number,
  timezone: string,
): ITimeSlot[] {
  if (blockedRanges.length === 0) return [slot];

  let segments: ITimeSlot[] = [slot];

  for (const range of blockedRanges) {
    const startHours = Math.floor(range.startMinutes / 60);
    const startMinutes = range.startMinutes % 60;
    const endHours = Math.floor(range.endMinutes / 60);
    const endMinutes = range.endMinutes % 60;

    const rangeStart = dateInTimezone(
      year,
      month,
      day,
      startHours,
      startMinutes,
      timezone,
    );
    const rangeEnd = dateInTimezone(
      year,
      month,
      day,
      endHours,
      endMinutes,
      timezone,
    );

    const nextSegments: ITimeSlot[] = [];

    for (const segment of segments) {
      if (rangeEnd <= segment.start || rangeStart >= segment.end) {
        nextSegments.push(segment);
        continue;
      }

      if (rangeStart > segment.start) {
        nextSegments.push({ start: segment.start, end: rangeStart });
      }
      if (rangeEnd < segment.end) {
        nextSegments.push({ start: rangeEnd, end: segment.end });
      }
    }

    segments = nextSegments;
    if (segments.length === 0) break;
  }

  return segments.filter((s) => s.end > s.start);
}

/**
 * Expand a single availability window on a specific date into a time slot.
 * Returns null if the date is blocked or doesn't match the window.
 */
function expandWindowForDate(
  window: IAvailabilityWindow,
  year: number,
  month: number,
  day: number,
  dayOfWeek: number,
  timezone: string,
  blockedDates: Set<string>,
): ITimeSlot | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  if (blockedDates.has(dateStr)) return null;

  if (window.type === "recurring") {
    if (window.dayOfWeek !== dayOfWeek) return null;
  } else if (window.type === "date") {
    if (window.date !== dateStr) return null;
  }

  const start = parseTime(window.startTime);
  const end = parseTime(window.endTime);

  const startDate = dateInTimezone(
    year,
    month,
    day,
    start.hours,
    start.minutes,
    timezone,
  );
  const endDate = dateInTimezone(
    year,
    month,
    day,
    end.hours,
    end.minutes,
    timezone,
  );

  if (endDate <= startDate) return null;

  return { start: startDate, end: endDate };
}

/**
 * Expand all availability windows from a scheduling page into concrete
 * ITimeSlots for a given date range.
 *
 * Handles:
 * - Recurring weekly patterns
 * - One-off date windows
 * - Blocked dates
 * - minNotice (minimum lead time before a slot)
 * - maxAdvance (maximum future booking window)
 */
export function expandAvailabilitySlots(
  page: ISchedulingPage,
  from: Date,
  to: Date,
  now: Date = new Date(),
): ITimeSlot[] {
  const slots: ITimeSlot[] = [];
  const timezone = page.timezone || "UTC";
  const parsedBlockedDates = parseBlockedDates(page.blockedDates);

  // Clamp the range based on maxAdvance
  const maxDate = new Date(now.getTime() + page.maxAdvance * 1000);
  const effectiveTo = to > maxDate ? maxDate : to;

  // The earliest bookable time based on minNotice
  const earliestStart = new Date(now.getTime() + page.minNotice * 1000);

  // Iterate day by day from `from` to `effectiveTo`
  const current = new Date(from);
  current.setUTCHours(0, 0, 0, 0);

  while (current <= effectiveTo) {
    const { year, month, day } = getDatePartsInTimezone(current, timezone);
    const dayOfWeek = getDayOfWeekInTimezone(current, timezone);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;

    if (parsedBlockedDates.fullDay.has(dateStr)) {
      current.setUTCDate(current.getUTCDate() + 1);
      continue;
    }

    const blockedRanges = parsedBlockedDates.timedByDate.get(dateStr) ?? [];

    for (const window of page.availabilityWindows) {
      const slot = expandWindowForDate(
        window,
        year,
        month,
        day,
        dayOfWeek,
        timezone,
        parsedBlockedDates.fullDay,
      );
      if (!slot) {
        continue;
      }

      const unblockedSlots = splitSlotByBlockedRanges(
        slot,
        blockedRanges,
        year,
        month,
        day,
        timezone,
      );

      for (const unblockedSlot of unblockedSlots) {
        // Keep the window at its original grid-aligned start so that
        // splitIntoBookableSlots produces clean slots (09:00, 09:45 …).
        // Filtering by minNotice / "now" is done per-slot in getBookableSlots.
        if (unblockedSlot.end > earliestStart && unblockedSlot.start < effectiveTo) {
          slots.push(unblockedSlot);
        }
      }
    }

    // Advance to next day
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return slots;
}

/**
 * Given an availability time slot and a duration, split it into bookable
 * fixed-duration sub-slots with buffer time between them.
 */
export function splitIntoBookableSlots(
  window: ITimeSlot,
  durationMinutes: number,
  bufferMinutes: number,
): ITimeSlot[] {
  const slots: ITimeSlot[] = [];
  const durationMs = durationMinutes * 60 * 1000;
  const bufferMs = bufferMinutes * 60 * 1000;
  const stepMs = durationMs + bufferMs;

  let cursor = window.start.getTime();
  const end = window.end.getTime();

  while (cursor + durationMs <= end) {
    slots.push({
      start: new Date(cursor),
      end: new Date(cursor + durationMs),
    });
    cursor += stepMs;
  }

  return slots;
}

/**
 * Check if a time slot is in the past.
 */
export function isSlotInPast(slot: ITimeSlot, now: Date = new Date()): boolean {
  return slot.start < now;
}

/**
 * Format a time slot for display in a specific timezone.
 */
export function formatSlotTime(
  slot: ITimeSlot,
  timezone: string,
): { startStr: string; endStr: string; dateStr: string } {
  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  const dateOpts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  };

  return {
    startStr: slot.start.toLocaleTimeString("en-US", timeOpts),
    endStr: slot.end.toLocaleTimeString("en-US", timeOpts),
    dateStr: slot.start.toLocaleDateString("en-US", dateOpts),
  };
}

/**
 * Check if two time ranges overlap.
 */
export function doTimeSlotsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Get all concrete bookable slots for a scheduling page over a date range,
 * split by the given duration.
 *
 * `busyRanges` is an optional list of `[startMs, endMs]` pairs (typically
 * sourced from kind-31926 public busy lists for the host); any candidate
 * slot that overlaps any range is filtered out.
 */
export function getBookableSlots(
  page: ISchedulingPage,
  from: Date,
  to: Date,
  durationMinutes: number,
  now: Date = new Date(),
  busyRanges: { start: number; end: number }[] = [],
): ITimeSlot[] {
  const windows = expandAvailabilitySlots(page, from, to, now);
  const bufferMinutes = page.buffer / 60;
  const allSlots: ITimeSlot[] = [];

  for (const window of windows) {
    const slots = splitIntoBookableSlots(
      window,
      durationMinutes,
      bufferMinutes,
    );
    allSlots.push(...slots);
  }

  // Filter out slots whose start is before now + minNotice.  We do this here
  // (not by clamping the window start) so splitIntoBookableSlots always runs
  // from the clean grid origin and produces times like 09:00, 09:45, 10:30.
  const earliestSlotStart = new Date(now.getTime() + page.minNotice * 1000);
  const deduped = new Map<string, ITimeSlot>();
  for (const slot of allSlots) {
    if (slot.start < earliestSlotStart) continue;

    // Drop any slot overlapping a public busy range from the host.
    const slotStart = slot.start.getTime();
    const slotEnd = slot.end.getTime();
    const overlapsBusy = busyRanges.some(
      (b) => slotStart < b.end && slotEnd > b.start,
    );
    if (overlapsBusy) continue;

    const key = `${slotStart}-${slotEnd}`;
    if (!deduped.has(key)) {
      deduped.set(key, slot);
    }
  }

  return Array.from(deduped.values()).sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
}

/**
 * A slot intended for the booker UI grid. Unlike `ITimeSlot`, this carries
 * an `unavailable` reason so the UI can render the slot greyed out instead
 * of dropping it (which would shift surrounding times and mislead viewers).
 */
export type IDisplaySlot = ITimeSlot & {
  unavailable?: "blocked" | "busy";
};

/**
 * Return every slot that falls inside the host's availability windows for
 * the given range, including ones overlapping blocked dates / blocked time
 * ranges / public busy ranges. Each unavailable slot carries an
 * `unavailable` reason so the UI can render it disabled.
 *
 * Slot grid alignment is identical to `getBookableSlots` so the two
 * functions can be swapped in the booking UI without visual jumps. Slots
 * before `now + minNotice` and after `maxAdvance` are still dropped.
 */
export function getDisplaySlots(
  page: ISchedulingPage,
  from: Date,
  to: Date,
  durationMinutes: number,
  now: Date = new Date(),
  busyRanges: { start: number; end: number }[] = [],
): IDisplaySlot[] {
  const timezone = page.timezone || "UTC";
  const parsedBlockedDates = parseBlockedDates(page.blockedDates);
  const bufferMinutes = page.buffer / 60;

  const maxDate = new Date(now.getTime() + page.maxAdvance * 1000);
  const effectiveTo = to > maxDate ? maxDate : to;
  const earliestSlotStart = new Date(now.getTime() + page.minNotice * 1000);

  const result: IDisplaySlot[] = [];
  const seen = new Set<string>();

  const current = new Date(from);
  current.setUTCHours(0, 0, 0, 0);

  while (current <= effectiveTo) {
    const { year, month, day } = getDatePartsInTimezone(current, timezone);
    const dayOfWeek = getDayOfWeekInTimezone(current, timezone);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    const fullDayBlocked = parsedBlockedDates.fullDay.has(dateStr);
    const blockedRanges = parsedBlockedDates.timedByDate.get(dateStr) ?? [];

    // Resolve timed blocked ranges to absolute UTC instants for overlap checks.
    const absoluteBlocked = blockedRanges.map((range) => {
      const startHours = Math.floor(range.startMinutes / 60);
      const startMin = range.startMinutes % 60;
      const endHours = Math.floor(range.endMinutes / 60);
      const endMin = range.endMinutes % 60;
      return {
        start: dateInTimezone(
          year,
          month,
          day,
          startHours,
          startMin,
          timezone,
        ).getTime(),
        end: dateInTimezone(year, month, day, endHours, endMin, timezone).getTime(),
      };
    });

    for (const window of page.availabilityWindows) {
      // Pass an empty fullDay set so we still get the window even on a
      // fully blocked day; we'll mark the resulting slots as blocked below.
      const fullWindow = expandWindowForDate(
        window,
        year,
        month,
        day,
        dayOfWeek,
        timezone,
        new Set<string>(),
      );
      if (!fullWindow) continue;
      if (fullWindow.end <= earliestSlotStart) continue;
      if (fullWindow.start >= effectiveTo) continue;

      const slots = splitIntoBookableSlots(
        fullWindow,
        durationMinutes,
        bufferMinutes,
      );
      for (const slot of slots) {
        if (slot.start < earliestSlotStart) continue;

        const slotStart = slot.start.getTime();
        const slotEnd = slot.end.getTime();
        const key = `${slotStart}-${slotEnd}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let unavailable: IDisplaySlot["unavailable"];
        if (fullDayBlocked) {
          unavailable = "blocked";
        } else if (
          absoluteBlocked.some((b) => slotStart < b.end && slotEnd > b.start)
        ) {
          unavailable = "blocked";
        } else if (
          busyRanges.some((b) => slotStart < b.end && slotEnd > b.start)
        ) {
          unavailable = "busy";
        }

        result.push(unavailable ? { ...slot, unavailable } : slot);
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}
