import { describe, expect, it } from "vitest";
import {
  getEventSegmentForDay,
  layoutDayEvents,
} from "./calendarEngine";
import type { ICalendarEvent } from "../utils/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function atLocal(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
): number {
  return new Date(year, month, day, hour, minute, 0, 0).getTime();
}

function makeEvent(
  overrides: Partial<ICalendarEvent> & { begin: number; end: number },
): ICalendarEvent {
  return {
    id: "event-id",
    eventId: "event-hash",
    title: "Multi-day Event",
    description: "",
    kind: 32678,
    begin: overrides.begin,
    end: overrides.end,
    createdAt: 1,
    categories: [],
    participants: [],
    rsvpResponses: [],
    reference: [],
    location: [],
    geoHash: [],
    website: "",
    user: "test-user",
    isPrivateEvent: true,
    repeat: { rrule: null },
    ...overrides,
  };
}

describe("getEventSegmentForDay", () => {
  it("keeps a single-day event unchanged on its day", () => {
    const dayStart = atLocal(2026, 3, 8);
    const event = makeEvent({
      begin: dayStart + 9 * HOUR_MS,
      end: dayStart + 11 * HOUR_MS,
    });

    const segment = getEventSegmentForDay(event, dayStart);

    expect(segment).not.toBeNull();
    expect(segment?.renderBegin).toBe(event.begin);
    expect(segment?.renderEnd).toBe(event.end);
  });

  it("splits an overnight event across two days", () => {
    const firstDayStart = atLocal(2026, 3, 8);
    const secondDayStart = firstDayStart + DAY_MS;
    const event = makeEvent({
      begin: firstDayStart + 22 * HOUR_MS,
      end: secondDayStart + 10 * HOUR_MS,
    });

    const firstDaySegment = getEventSegmentForDay(event, firstDayStart);
    const secondDaySegment = getEventSegmentForDay(event, secondDayStart);

    expect(firstDaySegment?.renderBegin).toBe(event.begin);
    expect(firstDaySegment?.renderEnd).toBe(secondDayStart);
    expect(secondDaySegment?.renderBegin).toBe(secondDayStart);
    expect(secondDaySegment?.renderEnd).toBe(event.end);
  });

  it("creates partial, full, and partial segments for a three-day event", () => {
    const firstDayStart = atLocal(2026, 3, 7);
    const middleDayStart = firstDayStart + DAY_MS;
    const lastDayStart = middleDayStart + DAY_MS;
    const event = makeEvent({
      begin: firstDayStart + 3 * HOUR_MS,
      end: lastDayStart + 9 * HOUR_MS,
    });

    const firstDaySegment = getEventSegmentForDay(event, firstDayStart);
    const middleDaySegment = getEventSegmentForDay(event, middleDayStart);
    const lastDaySegment = getEventSegmentForDay(event, lastDayStart);

    expect(firstDaySegment?.renderBegin).toBe(event.begin);
    expect(firstDaySegment?.renderEnd).toBe(middleDayStart);
    expect(middleDaySegment?.renderBegin).toBe(middleDayStart);
    expect(middleDaySegment?.renderEnd).toBe(lastDayStart);
    expect(lastDaySegment?.renderBegin).toBe(lastDayStart);
    expect(lastDaySegment?.renderEnd).toBe(event.end);
  });

  it("does not create a zero-length segment when the event ends at midnight", () => {
    const firstDayStart = atLocal(2026, 3, 8);
    const secondDayStart = firstDayStart + DAY_MS;
    const event = makeEvent({
      begin: firstDayStart + 20 * HOUR_MS,
      end: secondDayStart,
    });

    expect(getEventSegmentForDay(event, secondDayStart)).toBeNull();
  });

  it("handles month boundaries correctly", () => {
    const jan31Start = atLocal(2026, 0, 31);
    const feb1Start = atLocal(2026, 1, 1);
    const event = makeEvent({
      begin: jan31Start + 22 * HOUR_MS,
      end: feb1Start + 10 * HOUR_MS,
    });

    const jan31Segment = getEventSegmentForDay(event, jan31Start);
    const feb1Segment = getEventSegmentForDay(event, feb1Start);

    expect(jan31Segment?.renderEnd).toBe(feb1Start);
    expect(feb1Segment?.renderBegin).toBe(feb1Start);
    expect(feb1Segment?.renderEnd).toBe(event.end);
  });

  it("creates unique render keys for each visible day segment", () => {
    const firstDayStart = atLocal(2026, 3, 7);
    const secondDayStart = firstDayStart + DAY_MS;
    const thirdDayStart = secondDayStart + DAY_MS;
    const event = makeEvent({
      begin: firstDayStart + 3 * HOUR_MS,
      end: thirdDayStart + 9 * HOUR_MS,
    });

    const segments = [
      getEventSegmentForDay(event, firstDayStart),
      getEventSegmentForDay(event, secondDayStart),
      getEventSegmentForDay(event, thirdDayStart),
    ].filter((segment): segment is NonNullable<typeof segment> => !!segment);

    expect(new Set(segments.map((segment) => segment.renderKey)).size).toBe(3);
  });
});

describe("layoutDayEvents", () => {
  it("starts the second-day overnight segment at midnight", () => {
    const firstDayStart = atLocal(2026, 3, 8);
    const secondDayStart = firstDayStart + DAY_MS;
    const event = makeEvent({
      begin: firstDayStart + 22 * HOUR_MS,
      end: secondDayStart + 10 * HOUR_MS,
    });
    const segment = getEventSegmentForDay(event, secondDayStart);

    const [positioned] = layoutDayEvents(segment ? [segment] : []);

    expect(positioned.top).toBe(0);
    expect(positioned.height).toBe(10 * 60);
  });

  it("renders a middle-day segment as a full-day span", () => {
    const firstDayStart = atLocal(2026, 3, 7);
    const middleDayStart = firstDayStart + DAY_MS;
    const lastDayStart = middleDayStart + DAY_MS;
    const event = makeEvent({
      begin: firstDayStart + 3 * HOUR_MS,
      end: lastDayStart + 9 * HOUR_MS,
    });
    const segment = getEventSegmentForDay(event, middleDayStart);

    const [positioned] = layoutDayEvents(segment ? [segment] : []);

    expect(positioned.top).toBe(0);
    expect(positioned.height).toBe(24 * 60);
  });

  it("keeps the last-day segment clipped to the real end time", () => {
    const firstDayStart = atLocal(2026, 3, 7);
    const lastDayStart = firstDayStart + 2 * DAY_MS;
    const event = makeEvent({
      begin: firstDayStart + 3 * HOUR_MS,
      end: lastDayStart + 9 * HOUR_MS,
    });
    const segment = getEventSegmentForDay(event, lastDayStart);

    const [positioned] = layoutDayEvents(segment ? [segment] : []);

    expect(positioned.top).toBe(0);
    expect(positioned.height).toBe(9 * 60);
  });
});
