import { describe, it, expect } from "vitest";
import {
  buildRecurrenceRule,
  isEventInDateRange,
  getNextOccurrenceInRange,
  frequencyToRRule,
  parseRecurrenceRule,
  rruleToFrequency,
} from "./repeatingEventsHelper";
import { RepeatingFrequency, ICalendarEvent } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeEvent(
  overrides: Partial<ICalendarEvent> & { begin: number },
): ICalendarEvent {
  return {
    id: "test-id",
    eventId: "test-event-id",
    title: "Test Event",
    description: "",
    kind: 31923,
    end: overrides.end ?? overrides.begin + HOUR,
    createdAt: Date.now(),
    categories: [],
    participants: [],
    rsvpResponses: [],
    reference: [],
    location: [],
    geoHash: [],
    website: "",
    user: "test-user",
    isPrivateEvent: false,
    repeat: { rrule: null },
    ...overrides,
  };
}

// ─── frequencyToRRule ───────────────────────────────────────────────

describe("frequencyToRRule", () => {
  it("converts frequencies to RRULE strings", () => {
    expect(frequencyToRRule(RepeatingFrequency.Daily)).toBe("FREQ=DAILY");
    expect(frequencyToRRule(RepeatingFrequency.Weekly)).toBe("FREQ=WEEKLY");
    expect(frequencyToRRule(RepeatingFrequency.Monthly)).toBe("FREQ=MONTHLY");
    expect(frequencyToRRule(RepeatingFrequency.Quarterly)).toBe(
      "FREQ=MONTHLY;INTERVAL=3",
    );
    expect(frequencyToRRule(RepeatingFrequency.Yearly)).toBe("FREQ=YEARLY");
    expect(frequencyToRRule(RepeatingFrequency.Weekday)).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    );
  });

  it("returns null for None", () => {
    expect(frequencyToRRule(RepeatingFrequency.None)).toBeNull();
  });
});

// ─── rruleToFrequency ───────────────────────────────────────────────

describe("rruleToFrequency", () => {
  it("converts RRULE strings to frequencies", () => {
    expect(rruleToFrequency("FREQ=DAILY")).toBe(RepeatingFrequency.Daily);
    expect(rruleToFrequency("FREQ=WEEKLY")).toBe(RepeatingFrequency.Weekly);
    expect(rruleToFrequency("FREQ=MONTHLY")).toBe(RepeatingFrequency.Monthly);
    expect(rruleToFrequency("FREQ=MONTHLY;INTERVAL=3")).toBe(
      RepeatingFrequency.Quarterly,
    );
    expect(rruleToFrequency("FREQ=YEARLY")).toBe(RepeatingFrequency.Yearly);
    expect(rruleToFrequency("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe(
      RepeatingFrequency.Weekday,
    );
  });

  it("detects the base frequency when COUNT is present", () => {
    expect(rruleToFrequency("FREQ=DAILY;COUNT=5")).toBe(
      RepeatingFrequency.Daily,
    );
    expect(rruleToFrequency("FREQ=MONTHLY;INTERVAL=3;COUNT=4")).toBe(
      RepeatingFrequency.Quarterly,
    );
  });

  it("detects the base frequency when UNTIL is present", () => {
    expect(rruleToFrequency("FREQ=WEEKLY;UNTIL=20250131T100000Z")).toBe(
      RepeatingFrequency.Weekly,
    );
    expect(
      rruleToFrequency("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20250131T100000Z"),
    ).toBe(RepeatingFrequency.Weekday);
  });

  it("handles RRULE: prefix", () => {
    expect(rruleToFrequency("RRULE:FREQ=DAILY")).toBe(RepeatingFrequency.Daily);
  });

  it("returns null for unknown rules", () => {
    expect(rruleToFrequency("FREQ=SECONDLY")).toBeNull();
    expect(rruleToFrequency("FREQ=DAILY;BYHOUR=10")).toBeNull();
    expect(rruleToFrequency("")).toBeNull();
  });
});

describe("parseRRuleDate", () => {
  it("parses UTC dates correctly", () => {
    const rrule = "FREQ=DAILY;UNTIL=20250101T120000Z";
    const parsed = parseRecurrenceRule(rrule);
    expect(parsed.untilDate).toBe(Date.UTC(2025, 0, 1, 12, 0, 0));
  });

  it("parses floating dates (without Z) as UTC to ensure timezone independence", () => {
    const rrule = "FREQ=DAILY;UNTIL=20250101T120000";
    const parsed = parseRecurrenceRule(rrule);
    // Should be UTC per RFC 5545 floating time requirement for this app's logic
    expect(parsed.untilDate).toBe(Date.UTC(2025, 0, 1, 12, 0, 0));
  });

  it("parses date-only strings as UTC to ensure timezone independence", () => {
    const rrule = "FREQ=DAILY;UNTIL=20250101";
    const parsed = parseRecurrenceRule(rrule);
    expect(parsed.untilDate).toBe(Date.UTC(2025, 0, 1, 0, 0, 0));
  });
});

// ─── parseRecurrenceRule / buildRecurrenceRule ─────────────────────

describe("parseRecurrenceRule", () => {
  it("parses count-limited recurrence rules", () => {
    expect(parseRecurrenceRule("FREQ=DAILY;COUNT=5")).toEqual({
      frequency: RepeatingFrequency.Daily,
      endMode: "count",
      count: 5,
      untilDate: null,
    });
  });

  it("parses until-limited recurrence rules", () => {
    const until = Date.UTC(2025, 0, 31, 10, 0, 0);

    expect(parseRecurrenceRule("FREQ=WEEKLY;UNTIL=20250131T100000Z")).toEqual({
      frequency: RepeatingFrequency.Weekly,
      endMode: "until",
      count: null,
      untilDate: until,
    });
  });

  it("falls back safely for malformed or unsupported rules", () => {
    expect(parseRecurrenceRule("FREQ=DAILY;BYHOUR=10")).toEqual({
      frequency: null,
      endMode: "never",
      count: null,
      untilDate: null,
    });
    expect(parseRecurrenceRule("")).toEqual({
      frequency: null,
      endMode: "never",
      count: null,
      untilDate: null,
    });
  });
});

describe("buildRecurrenceRule", () => {
  it("builds count-limited recurrence rules", () => {
    const jan1 = Date.UTC(2025, 0, 1, 10);

    expect(
      buildRecurrenceRule({
        frequency: RepeatingFrequency.Daily,
        endMode: "count",
        count: 5,
        eventStart: jan1,
      }),
    ).toBe("FREQ=DAILY;COUNT=5");
  });

  it("builds date-only until-limited rules using the event start time", () => {
    const eventStart = new Date(2026, 3, 15, 14, 30, 0).getTime();
    const untilDate = new Date(2026, 3, 18).getTime();
    const expectedUntil =
      new Date(2026, 3, 18, 14, 30, 0)
        .toISOString()
        .replace(/[-:]/g, "")
        .split(".")[0] + "Z";

    expect(
      buildRecurrenceRule({
        frequency: RepeatingFrequency.Daily,
        endMode: "until",
        untilDate,
        eventStart,
      }),
    ).toBe(`FREQ=DAILY;UNTIL=${expectedUntil}`);
  });
});

// ─── isEventInDateRange: non-repeating ──────────────────────────────

describe("isEventInDateRange – non-repeating events", () => {
  const jan1 = Date.UTC(2025, 0, 1, 10); // Jan 1 2025 10:00 UTC

  it("returns true when event falls entirely within range", () => {
    const event = makeEvent({ begin: jan1 });
    expect(isEventInDateRange(event, jan1 - DAY, jan1 + DAY)).toBe(true);
  });

  it("returns true when event starts inside range", () => {
    const event = makeEvent({ begin: jan1, end: jan1 + 2 * DAY });
    expect(isEventInDateRange(event, jan1 - HOUR, jan1 + HOUR)).toBe(true);
  });

  it("returns true when event spans the entire range", () => {
    const event = makeEvent({ begin: jan1 - DAY, end: jan1 + DAY });
    expect(isEventInDateRange(event, jan1 - HOUR, jan1 + HOUR)).toBe(true);
  });

  it("returns false when event is entirely before range", () => {
    const event = makeEvent({ begin: jan1, end: jan1 + HOUR });
    expect(isEventInDateRange(event, jan1 + 2 * DAY, jan1 + 3 * DAY)).toBe(
      false,
    );
  });

  it("returns false when event is entirely after range", () => {
    const event = makeEvent({ begin: jan1 + 5 * DAY });
    expect(isEventInDateRange(event, jan1, jan1 + DAY)).toBe(false);
  });

  it("handles null rrule the same as no recurrence", () => {
    const event = makeEvent({
      begin: jan1,
      repeat: { rrule: null },
    });
    expect(isEventInDateRange(event, jan1 - DAY, jan1 + DAY)).toBe(true);
    expect(isEventInDateRange(event, jan1 + 2 * DAY, jan1 + 3 * DAY)).toBe(
      false,
    );
  });
});

// ─── isEventInDateRange: daily recurrence ───────────────────────────

describe("isEventInDateRange – daily recurrence", () => {
  const jan1 = Date.UTC(2025, 0, 1, 10);
  const event = makeEvent({
    begin: jan1,
    repeat: { rrule: "FREQ=DAILY" },
  });

  it("matches on the original day", () => {
    expect(isEventInDateRange(event, jan1 - HOUR, jan1 + 2 * HOUR)).toBe(true);
  });

  it("matches on day 5", () => {
    const day5Start = jan1 + 5 * DAY;
    expect(
      isEventInDateRange(event, day5Start - HOUR, day5Start + 2 * HOUR),
    ).toBe(true);
  });

  it("matches far in the future (day 100)", () => {
    const day100Start = jan1 + 100 * DAY;
    expect(
      isEventInDateRange(event, day100Start - HOUR, day100Start + 2 * HOUR),
    ).toBe(true);
  });

  it("does not match before the event starts", () => {
    expect(isEventInDateRange(event, jan1 - 2 * DAY, jan1 - DAY)).toBe(false);
  });

  it("stops matching after the last occurrence when COUNT is present", () => {
    const limitedEvent = makeEvent({
      begin: jan1,
      repeat: { rrule: "FREQ=DAILY;COUNT=3" },
    });
    const day3 = jan1 + 3 * DAY;

    expect(isEventInDateRange(limitedEvent, day3 - HOUR, day3 + 2 * HOUR)).toBe(
      false,
    );
  });
});

// ─── isEventInDateRange: weekly recurrence ──────────────────────────

describe("isEventInDateRange – weekly recurrence", () => {
  // Starts on a Wednesday
  const wed = Date.UTC(2025, 0, 1, 10); // Jan 1 2025 is Wednesday
  const event = makeEvent({
    begin: wed,
    repeat: { rrule: "FREQ=WEEKLY" },
  });

  it("matches on the same day of week, 3 weeks later", () => {
    const threeWeeksLater = wed + 21 * DAY;
    expect(
      isEventInDateRange(
        event,
        threeWeeksLater - HOUR,
        threeWeeksLater + 2 * HOUR,
      ),
    ).toBe(true);
  });

  it("does not match on a different day of the week", () => {
    const thu = wed + DAY;
    expect(isEventInDateRange(event, thu, thu + HOUR)).toBe(false);
  });
});

// ─── isEventInDateRange: monthly recurrence ─────────────────────────

describe("isEventInDateRange – monthly recurrence", () => {
  const jan15 = Date.UTC(2025, 0, 15, 10);
  const event = makeEvent({
    begin: jan15,
    repeat: { rrule: "FREQ=MONTHLY" },
  });

  it("matches on Feb 15", () => {
    const feb15 = Date.UTC(2025, 1, 15, 10);
    expect(isEventInDateRange(event, feb15 - HOUR, feb15 + 2 * HOUR)).toBe(
      true,
    );
  });

  it("matches on Dec 15 (11 months later)", () => {
    const dec15 = Date.UTC(2025, 11, 15, 10);
    expect(isEventInDateRange(event, dec15 - HOUR, dec15 + 2 * HOUR)).toBe(
      true,
    );
  });

  it("does not match on Jan 20", () => {
    const jan20 = Date.UTC(2025, 0, 20, 10);
    expect(isEventInDateRange(event, jan20, jan20 + HOUR)).toBe(false);
  });
});

// ─── isEventInDateRange: yearly recurrence ──────────────────────────

describe("isEventInDateRange – yearly recurrence", () => {
  const jan1_2025 = Date.UTC(2025, 0, 1, 10);
  const event = makeEvent({
    begin: jan1_2025,
    repeat: { rrule: "FREQ=YEARLY" },
  });

  it("matches on Jan 1 2026", () => {
    const jan1_2026 = Date.UTC(2026, 0, 1, 10);
    expect(
      isEventInDateRange(event, jan1_2026 - HOUR, jan1_2026 + 2 * HOUR),
    ).toBe(true);
  });

  it("does not match on Feb 1 2026", () => {
    const feb1_2026 = Date.UTC(2026, 1, 1, 10);
    expect(
      isEventInDateRange(event, feb1_2026 - HOUR, feb1_2026 + 2 * HOUR),
    ).toBe(false);
  });
});

// ─── isEventInDateRange: quarterly recurrence ───────────────────────

describe("isEventInDateRange – quarterly recurrence", () => {
  const jan1 = Date.UTC(2025, 0, 1, 10);
  const event = makeEvent({
    begin: jan1,
    repeat: { rrule: "FREQ=MONTHLY;INTERVAL=3" },
  });

  it("matches 3 months later (April 1)", () => {
    const apr1 = Date.UTC(2025, 3, 1, 10);
    expect(isEventInDateRange(event, apr1 - HOUR, apr1 + 2 * HOUR)).toBe(true);
  });

  it("does not match 2 months later (March 1)", () => {
    const mar1 = Date.UTC(2025, 2, 1, 10);
    expect(isEventInDateRange(event, mar1, mar1 + HOUR)).toBe(false);
  });
});

// ─── isEventInDateRange: weekday recurrence ─────────────────────────

describe("isEventInDateRange – weekday recurrence", () => {
  // Monday Jan 6 2025
  const mon = Date.UTC(2025, 0, 6, 10);
  const event = makeEvent({
    begin: mon,
    repeat: { rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  });

  it("matches on the next weekday (Tuesday)", () => {
    const tue = mon + DAY;
    expect(isEventInDateRange(event, tue - HOUR, tue + 2 * HOUR)).toBe(true);
  });

  it("does not match on a Saturday", () => {
    const sat = Date.UTC(2025, 0, 11, 10);
    expect(isEventInDateRange(event, sat, sat + HOUR)).toBe(false);
  });

  it("does not match on a Sunday", () => {
    const sun = Date.UTC(2025, 0, 12, 10);
    expect(isEventInDateRange(event, sun, sun + HOUR)).toBe(false);
  });
});

// ─── getNextOccurrenceInRange ───────────────────────────────────────

describe("getNextOccurrenceInRange – non-repeating", () => {
  const jan1 = Date.UTC(2025, 0, 1, 10);

  it("returns begin when it falls in range", () => {
    const event = makeEvent({ begin: jan1 });
    expect(getNextOccurrenceInRange(event, jan1 - HOUR, jan1 + HOUR)).toBe(
      jan1,
    );
  });

  it("returns null when out of range", () => {
    const event = makeEvent({ begin: jan1 });
    expect(
      getNextOccurrenceInRange(event, jan1 + 2 * DAY, jan1 + 3 * DAY),
    ).toBeNull();
  });

  it("returns null for null rrule when out of range", () => {
    const event = makeEvent({
      begin: jan1,
      repeat: { rrule: null },
    });
    expect(
      getNextOccurrenceInRange(event, jan1 + 2 * DAY, jan1 + 3 * DAY),
    ).toBeNull();
  });
});

describe("getNextOccurrenceInRange – daily recurrence", () => {
  const jan1 = Date.UTC(2025, 0, 1, 10);
  const event = makeEvent({
    begin: jan1,
    repeat: { rrule: "FREQ=DAILY" },
  });

  it("returns the correct occurrence start for day 5", () => {
    const day5 = jan1 + 5 * DAY;
    const result = getNextOccurrenceInRange(event, day5 - HOUR, day5 + HOUR);
    expect(result).toBe(day5);
  });

  it("returns null when range falls between occurrences", () => {
    const day5Afternoon = jan1 + 5 * DAY + 3 * HOUR;
    const result = getNextOccurrenceInRange(
      event,
      day5Afternoon,
      day5Afternoon + HOUR,
    );
    expect(result).toBeNull();
  });

  it("returns null for range before event start", () => {
    expect(
      getNextOccurrenceInRange(event, jan1 - 2 * DAY, jan1 - DAY),
    ).toBeNull();
  });

  it("returns null after the final counted occurrence", () => {
    const limitedEvent = makeEvent({
      begin: jan1,
      repeat: { rrule: "FREQ=DAILY;COUNT=3" },
    });
    const day3 = jan1 + 3 * DAY;

    expect(
      getNextOccurrenceInRange(limitedEvent, day3 - HOUR, day3 + HOUR),
    ).toBeNull();
  });
});

describe("getNextOccurrenceInRange – weekly recurrence", () => {
  const wed = Date.UTC(2025, 0, 1, 10);
  const event = makeEvent({
    begin: wed,
    repeat: { rrule: "FREQ=WEEKLY" },
  });

  it("returns the occurrence 2 weeks out", () => {
    const twoWeeks = wed + 14 * DAY;
    const result = getNextOccurrenceInRange(
      event,
      twoWeeks - HOUR,
      twoWeeks + HOUR,
    );
    expect(result).toBe(twoWeeks);
  });

  it("finds occurrence within a 2-day window", () => {
    const nextWed = wed + 7 * DAY;
    const result = getNextOccurrenceInRange(
      event,
      nextWed - DAY,
      nextWed + DAY,
    );
    expect(result).toBe(nextWed);
  });

  it("returns null after the UNTIL date has passed", () => {
    const limitedEvent = makeEvent({
      begin: wed,
      repeat: { rrule: "FREQ=WEEKLY;UNTIL=20250115T100000Z" },
    });
    const jan22 = Date.UTC(2025, 0, 22, 10);

    expect(
      getNextOccurrenceInRange(limitedEvent, jan22 - HOUR, jan22 + HOUR),
    ).toBeNull();
    expect(
      isEventInDateRange(limitedEvent, jan22 - HOUR, jan22 + 2 * HOUR),
    ).toBe(false);
  });
});

describe("getNextOccurrenceInRange – monthly recurrence", () => {
  const jan15 = Date.UTC(2025, 0, 15, 10);
  const event = makeEvent({
    begin: jan15,
    repeat: { rrule: "FREQ=MONTHLY" },
  });

  it("returns the March 15 occurrence", () => {
    const mar15 = Date.UTC(2025, 2, 15, 10);
    const result = getNextOccurrenceInRange(event, mar15 - HOUR, mar15 + HOUR);
    expect(result).toBe(mar15);
  });

  it("returns null for a range that misses the 15th", () => {
    const mar10 = Date.UTC(2025, 2, 10, 10);
    const result = getNextOccurrenceInRange(event, mar10, mar10 + DAY);
    expect(result).toBeNull();
  });
});

describe("getNextOccurrenceInRange – yearly recurrence", () => {
  const jan1_2025 = Date.UTC(2025, 0, 1, 10);
  const event = makeEvent({
    begin: jan1_2025,
    repeat: { rrule: "FREQ=YEARLY" },
  });

  it("returns the 2027 occurrence", () => {
    const jan1_2027 = Date.UTC(2027, 0, 1, 10);
    const result = getNextOccurrenceInRange(
      event,
      jan1_2027 - HOUR,
      jan1_2027 + HOUR,
    );
    expect(result).toBe(jan1_2027);
  });
});

describe("getNextOccurrenceInRange – weekday recurrence", () => {
  // Monday Jan 6 2025
  const mon = Date.UTC(2025, 0, 6, 10);
  const event = makeEvent({
    begin: mon,
    repeat: { rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  });

  it("finds the Wednesday occurrence", () => {
    const wed = mon + 2 * DAY;
    const result = getNextOccurrenceInRange(event, wed - HOUR, wed + HOUR);
    expect(result).toBe(wed);
  });

  it("does not find occurrence on Saturday", () => {
    const sat = Date.UTC(2025, 0, 11, 10);
    const result = getNextOccurrenceInRange(event, sat, sat + HOUR);
    expect(result).toBeNull();
  });
});
