import { afterAll, beforeAll, describe, expect, it } from "vitest";

let parseICS: (icsContent: string) => ReturnType<typeof import("./utils")["parseICS"]>;

beforeAll(async () => {
  (globalThis as unknown as { window: { innerWidth: number; innerHeight: number } }).window = {
    innerWidth: 1024,
    innerHeight: 768,
  };

  ({ parseICS } = await import("./utils"));
});

afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("parseICS", () => {
  it("ignores empty recurrence rules", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Test Event
DTSTART:20260101T120000Z
DTEND:20260101T130000Z
RRULE:    
END:VEVENT
END:VCALENDAR`;

    const parsed = parseICS(ics);

    expect(parsed).not.toBeNull();
    expect(parsed?.repeat.rrules).toEqual([]);
  });

  it("normalizes and de-duplicates recurrence rules", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Recurring Event
DTSTART:20260101T120000Z
DTEND:20260101T130000Z
RRULE:FREQ=DAILY
RRULE: FREQ=DAILY 
RRULE:FREQ=WEEKLY
END:VEVENT
END:VCALENDAR`;

    const parsed = parseICS(ics);

    expect(parsed).not.toBeNull();
    expect(parsed?.repeat.rrules).toEqual(["FREQ=DAILY", "FREQ=WEEKLY"]);
  });
});
