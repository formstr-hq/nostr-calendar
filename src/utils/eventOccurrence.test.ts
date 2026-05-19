import { describe, expect, it } from "vitest";
import {
  applyEventOccurrenceRange,
  getEventDisplayRange,
  getEventOccurrenceRange,
  getEventOccurrenceRangeFromQuery,
} from "./eventOccurrence";
import type { ICalendarEvent } from "./types";

function makeEvent(overrides: Partial<ICalendarEvent> = {}): ICalendarEvent {
  return {
    id: "event-id",
    eventId: "event-hash",
    title: "Recurring Event",
    description: "",
    kind: 31923,
    begin: 1_775_296_800_000,
    end: 1_775_300_400_000,
    createdAt: 1,
    categories: [],
    participants: [],
    rsvpResponses: [],
    reference: [],
    location: [],
    geoHash: [],
    website: "",
    user: "test-user",
    isPrivateEvent: false,
    repeat: { rrule: "FREQ=WEEKLY" },
    ...overrides,
  };
}

describe("event occurrence helpers", () => {
  it("uses the clicked occurrence range for recurring event display", () => {
    const event = makeEvent({
      occurrenceBegin: 1_775_901_600_000,
      occurrenceEnd: 1_775_905_200_000,
    });

    expect(getEventOccurrenceRange(event)).toEqual({
      begin: 1_775_901_600_000,
      end: 1_775_905_200_000,
    });
    expect(getEventDisplayRange(event)).toEqual({
      begin: 1_775_901_600_000,
      end: 1_775_905_200_000,
    });
  });

  it("keeps canonical times for non-recurring events", () => {
    const event = makeEvent({
      repeat: { rrule: null },
      occurrenceBegin: 1_775_901_600_000,
      occurrenceEnd: 1_775_905_200_000,
    });

    expect(getEventOccurrenceRange(event)).toBeUndefined();
    expect(getEventDisplayRange(event)).toEqual({
      begin: event.begin,
      end: event.end,
    });
  });

  it("applies a valid query occurrence range without changing canonical times", () => {
    const event = makeEvent();
    const updated = applyEventOccurrenceRange(event, {
      begin: 1_775_901_600_000,
      end: 1_775_905_200_000,
    });

    expect(updated.begin).toBe(event.begin);
    expect(updated.end).toBe(event.end);
    expect(updated.occurrenceBegin).toBe(1_775_901_600_000);
    expect(updated.occurrenceEnd).toBe(1_775_905_200_000);
  });

  it("derives occurrence end from event duration when query end is missing", () => {
    const event = makeEvent();
    const occurrence = getEventOccurrenceRangeFromQuery(
      "1775901600000",
      null,
      event,
    );

    expect(occurrence).toEqual({
      begin: 1_775_901_600_000,
      end: 1_775_905_200_000,
    });
  });
});
