import { describe, expect, it } from "vitest";
import { findCalendarForEvent } from "./calendarListTypes";

const makeCalendar = (id: string, eventRefs: string[][] = []) => ({
  id,
  eventId: `${id}-event`,
  title: id,
  description: "",
  color: "#4285f4",
  eventRefs,
  createdAt: 1700000000,
  isVisible: true,
});

describe("findCalendarForEvent", () => {
  it("prefers the explicit calendarId when it exists", () => {
    const calendars = [makeCalendar("work"), makeCalendar("personal")];

    const result = findCalendarForEvent(calendars, {
      calendarId: "personal",
      kind: 32678,
      user: "author-pubkey",
      id: "event-d-tag",
    });

    expect(result?.id).toBe("personal");
  });

  it("falls back to calendar refs when the event prop is stale", () => {
    const coordinate = "32678:author-pubkey:event-d-tag";
    const calendars = [
      makeCalendar("work"),
      makeCalendar("personal", [
        [coordinate, "wss://relay.example", "nsec1view"],
      ]),
    ];

    const result = findCalendarForEvent(calendars, {
      calendarId: undefined,
      kind: 32678,
      user: "author-pubkey",
      id: "event-d-tag",
    });

    expect(result?.id).toBe("personal");
  });

  it("returns undefined when the event is not in any calendar", () => {
    const calendars = [makeCalendar("work")];

    const result = findCalendarForEvent(calendars, {
      calendarId: undefined,
      kind: 31923,
      user: "author-pubkey",
      id: "missing-event",
    });

    expect(result).toBeUndefined();
  });
});
