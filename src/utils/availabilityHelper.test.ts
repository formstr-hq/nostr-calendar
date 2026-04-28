import { describe, expect, it } from "vitest";
import {
  expandAvailabilitySlots,
  splitIntoBookableSlots,
  isSlotInPast,
  doTimeSlotsOverlap,
  getBookableSlots,
} from "./availabilityHelper";
import type { ISchedulingPage, ITimeSlot } from "./types";

function makePage(overrides: Partial<ISchedulingPage> = {}): ISchedulingPage {
  return {
    id: "test-page",
    eventId: "event-hash",
    user: "pubkey123",
    title: "Test Scheduling",
    description: "",
    slotDurations: [30],
    durationMode: "fixed",
    availabilityWindows: [],
    blockedDates: [],
    timezone: "UTC",
    minNotice: 0,
    maxAdvance: 30 * 24 * 3600, // 30 days
    buffer: 0,
    expiry: 172800,
    location: "",
    createdAt: 0,
    ...overrides,
  };
}

describe("expandAvailabilitySlots", () => {
  it("expands recurring weekly windows", () => {
    // Monday availability 09:00-17:00 UTC
    const page = makePage({
      timezone: "UTC",
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
    });

    // 2026-04-13 is a Monday
    const from = new Date("2026-04-13T00:00:00Z");
    const to = new Date("2026-04-19T23:59:59Z"); // Full week
    const now = new Date("2026-04-12T00:00:00Z"); // Before the range

    const slots = expandAvailabilitySlots(page, from, to, now);
    expect(slots.length).toBe(1);
    expect(slots[0].start.toISOString()).toBe("2026-04-13T09:00:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-04-13T17:00:00.000Z");
  });

  it("handles multiple days of recurring availability", () => {
    const page = makePage({
      timezone: "UTC",
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "12:00",
        },
        {
          type: "recurring",
          dayOfWeek: 3,
          startTime: "14:00",
          endTime: "17:00",
        },
      ],
    });

    // 2026-04-13 (Mon) – 2026-04-17 (Fri)
    const from = new Date("2026-04-13T00:00:00Z");
    const to = new Date("2026-04-17T23:59:59Z");
    const now = new Date("2026-04-12T00:00:00Z");

    const slots = expandAvailabilitySlots(page, from, to, now);
    expect(slots.length).toBe(2);
    // Monday slot
    expect(slots[0].start.toISOString()).toBe("2026-04-13T09:00:00.000Z");
    // Wednesday slot
    expect(slots[1].start.toISOString()).toBe("2026-04-15T14:00:00.000Z");
  });

  it("expands one-off date windows", () => {
    const page = makePage({
      timezone: "UTC",
      availabilityWindows: [
        {
          type: "date",
          date: "2026-04-15",
          startTime: "10:00",
          endTime: "14:00",
        },
      ],
    });

    const from = new Date("2026-04-14T00:00:00Z");
    const to = new Date("2026-04-16T23:59:59Z");
    const now = new Date("2026-04-14T00:00:00Z");

    const slots = expandAvailabilitySlots(page, from, to, now);
    expect(slots.length).toBe(1);
    expect(slots[0].start.toISOString()).toBe("2026-04-15T10:00:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-04-15T14:00:00.000Z");
  });

  it("excludes blocked dates", () => {
    const page = makePage({
      timezone: "UTC",
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
      blockedDates: ["2026-04-13"],
    });

    const from = new Date("2026-04-13T00:00:00Z");
    const to = new Date("2026-04-19T23:59:59Z");
    const now = new Date("2026-04-12T00:00:00Z");

    const slots = expandAvailabilitySlots(page, from, to, now);
    expect(slots.length).toBe(0);
  });

  it("respects minNotice", () => {
    const page = makePage({
      timezone: "UTC",
      minNotice: 3600, // 1 hour
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
    });

    const from = new Date("2026-04-13T00:00:00Z");
    const to = new Date("2026-04-13T23:59:59Z");
    // now is 08:30 — so earliest bookable is 09:30
    const now = new Date("2026-04-13T08:30:00Z");

    const slots = expandAvailabilitySlots(page, from, to, now);
    expect(slots.length).toBe(1);
    // Start should be clamped to 09:30 (now + 1h minNotice)
    expect(slots[0].start.toISOString()).toBe("2026-04-13T09:30:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-04-13T17:00:00.000Z");
  });

  it("respects maxAdvance", () => {
    const page = makePage({
      timezone: "UTC",
      maxAdvance: 7 * 24 * 3600, // 7 days
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
    });

    const now = new Date("2026-04-12T00:00:00Z");
    const from = new Date("2026-04-13T00:00:00Z");
    const to = new Date("2026-04-27T23:59:59Z"); // Beyond 7 days

    const slots = expandAvailabilitySlots(page, from, to, now);
    // Only Mon Apr 13 is within 7 days. Apr 20 is exactly 8 days out.
    expect(slots.length).toBe(1);
    expect(slots[0].start.toISOString()).toBe("2026-04-13T09:00:00.000Z");
  });

  it("returns empty for range entirely in the past", () => {
    const page = makePage({
      timezone: "UTC",
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
    });

    const from = new Date("2026-04-06T00:00:00Z");
    const to = new Date("2026-04-06T23:59:59Z");
    const now = new Date("2026-04-13T00:00:00Z"); // After the range

    const slots = expandAvailabilitySlots(page, from, to, now);
    expect(slots.length).toBe(0);
  });
});

describe("splitIntoBookableSlots", () => {
  it("splits a window into fixed-duration slots", () => {
    const window: ITimeSlot = {
      start: new Date("2026-04-13T09:00:00Z"),
      end: new Date("2026-04-13T12:00:00Z"),
    };

    const slots = splitIntoBookableSlots(window, 30, 0);
    // 3 hours / 30 min = 6 slots
    expect(slots.length).toBe(6);
    expect(slots[0].start.toISOString()).toBe("2026-04-13T09:00:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-04-13T09:30:00.000Z");
    expect(slots[5].start.toISOString()).toBe("2026-04-13T11:30:00.000Z");
    expect(slots[5].end.toISOString()).toBe("2026-04-13T12:00:00.000Z");
  });

  it("respects buffer between slots", () => {
    const window: ITimeSlot = {
      start: new Date("2026-04-13T09:00:00Z"),
      end: new Date("2026-04-13T12:00:00Z"),
    };

    // 30 min duration + 15 min buffer = 45 min step
    // 180 min / 45 = 4 slots
    const slots = splitIntoBookableSlots(window, 30, 15);
    expect(slots.length).toBe(4);
    expect(slots[0].start.toISOString()).toBe("2026-04-13T09:00:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-04-13T09:30:00.000Z");
    expect(slots[1].start.toISOString()).toBe("2026-04-13T09:45:00.000Z");
    expect(slots[1].end.toISOString()).toBe("2026-04-13T10:15:00.000Z");
  });

  it("handles window shorter than duration", () => {
    const window: ITimeSlot = {
      start: new Date("2026-04-13T09:00:00Z"),
      end: new Date("2026-04-13T09:20:00Z"),
    };

    const slots = splitIntoBookableSlots(window, 30, 0);
    expect(slots.length).toBe(0);
  });
});

describe("isSlotInPast", () => {
  it("returns true for past slots", () => {
    const slot: ITimeSlot = {
      start: new Date("2026-04-10T09:00:00Z"),
      end: new Date("2026-04-10T10:00:00Z"),
    };
    const now = new Date("2026-04-11T00:00:00Z");
    expect(isSlotInPast(slot, now)).toBe(true);
  });

  it("returns false for future slots", () => {
    const slot: ITimeSlot = {
      start: new Date("2026-04-15T09:00:00Z"),
      end: new Date("2026-04-15T10:00:00Z"),
    };
    const now = new Date("2026-04-11T00:00:00Z");
    expect(isSlotInPast(slot, now)).toBe(false);
  });
});

describe("doTimeSlotsOverlap", () => {
  it("detects overlapping ranges", () => {
    expect(
      doTimeSlotsOverlap({ start: 100, end: 200 }, { start: 150, end: 250 }),
    ).toBe(true);
  });

  it("returns false for non-overlapping ranges", () => {
    expect(
      doTimeSlotsOverlap({ start: 100, end: 200 }, { start: 200, end: 300 }),
    ).toBe(false);
  });

  it("detects containment", () => {
    expect(
      doTimeSlotsOverlap({ start: 100, end: 300 }, { start: 150, end: 250 }),
    ).toBe(true);
  });
});

describe("getBookableSlots", () => {
  it("returns full set of bookable slots", () => {
    const page = makePage({
      timezone: "UTC",
      slotDurations: [60],
      buffer: 900, // 15 min
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "12:00",
        },
      ],
    });

    const from = new Date("2026-04-13T00:00:00Z"); // Monday
    const to = new Date("2026-04-13T23:59:59Z");
    const now = new Date("2026-04-12T00:00:00Z");

    const slots = getBookableSlots(page, from, to, 60, now);
    // 3 hours, 60 min + 15 min buffer = 75 min step → 2 full slots (slot at 2:30 wouldn't fit: 2:30+1h=3:30 > 3:00)
    // 09:00-10:00, 10:15-11:15 → next would be 11:30-12:30 which exceeds 12:00
    expect(slots.length).toBe(2);
    expect(slots[0].start.toISOString()).toBe("2026-04-13T09:00:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-04-13T10:00:00.000Z");
    expect(slots[1].start.toISOString()).toBe("2026-04-13T10:15:00.000Z");
    expect(slots[1].end.toISOString()).toBe("2026-04-13T11:15:00.000Z");
  });

  it("filters out past slots", () => {
    const page = makePage({
      timezone: "UTC",
      slotDurations: [60],
      availabilityWindows: [
        {
          type: "recurring",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
    });

    const from = new Date("2026-04-13T00:00:00Z");
    const to = new Date("2026-04-13T23:59:59Z");
    // now is 13:00 — slots before 13:00 should be filtered out
    const now = new Date("2026-04-13T13:00:00Z");

    const slots = getBookableSlots(page, from, to, 60, now);
    // Available from 13:00 to 17:00 = 4 hours = 4 slots
    expect(slots.length).toBe(4);
    expect(slots[0].start.toISOString()).toBe("2026-04-13T13:00:00.000Z");
  });
});
