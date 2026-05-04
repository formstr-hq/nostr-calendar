import { describe, expect, it } from "vitest";
import {
  canManageEventBusyList,
  getBusyRangeForEvent,
  isExactBusyRangeInLists,
} from "./busyList";
import type { IBusyList, ICalendarEvent } from "./types";

function makeEvent(overrides: Partial<ICalendarEvent> = {}): ICalendarEvent {
  return {
    id: "event-id",
    eventId: "event-hash",
    title: "Team Sync",
    description: "",
    kind: 32678,
    begin: Date.UTC(2026, 0, 10, 10),
    end: Date.UTC(2026, 0, 10, 11),
    createdAt: 1,
    categories: [],
    participants: ["participant-pubkey"],
    rsvpResponses: [],
    reference: [],
    location: [],
    geoHash: [],
    website: "",
    user: "author-pubkey",
    isPrivateEvent: true,
    repeat: { rrule: null },
    calendarId: "calendar-id",
    ...overrides,
  };
}

function makeBusyList(
  monthKey: string,
  ranges: IBusyList["ranges"],
): IBusyList {
  return {
    user: "participant-pubkey",
    monthKey,
    ranges,
    eventId: "busy-list-event-id",
    createdAt: 1,
  };
}

describe("busy list event helpers", () => {
  it("returns a valid busy range for an event", () => {
    const event = makeEvent();

    expect(getBusyRangeForEvent(event)).toEqual({
      start: event.begin,
      end: event.end,
    });
  });

  it("rejects invalid event ranges", () => {
    expect(
      getBusyRangeForEvent(makeEvent({ end: Date.UTC(2026, 0, 10, 9) })),
    ).toBeNull();
    expect(getBusyRangeForEvent(makeEvent({ begin: Number.NaN }))).toBeNull();
  });

  it("detects an exact range in the touched busy-list months", () => {
    const range = {
      start: Date.UTC(2026, 0, 31, 23),
      end: Date.UTC(2026, 1, 1, 1),
    };
    const lists = {
      "2026-01": makeBusyList("2026-01", [range]),
      "2026-02": makeBusyList("2026-02", []),
    };

    expect(isExactBusyRangeInLists(lists, range)).toBe(true);
  });

  it("does not match partially overlapping busy ranges", () => {
    const range = {
      start: Date.UTC(2026, 0, 10, 10),
      end: Date.UTC(2026, 0, 10, 11),
    };
    const lists = {
      "2026-01": makeBusyList("2026-01", [
        {
          start: Date.UTC(2026, 0, 10, 10),
          end: Date.UTC(2026, 0, 10, 12),
        },
      ]),
    };

    expect(isExactBusyRangeInLists(lists, range)).toBe(false);
  });

  it("allows authors and participants to manage an event busy-list range", () => {
    const event = makeEvent();

    expect(canManageEventBusyList(event, "author-pubkey")).toBe(true);
    expect(canManageEventBusyList(event, "participant-pubkey")).toBe(true);
  });

  it("rejects unrelated, device, and not-yet-added events", () => {
    expect(canManageEventBusyList(makeEvent(), "other-pubkey")).toBe(false);
    expect(
      canManageEventBusyList(makeEvent({ source: "device" }), "author-pubkey"),
    ).toBe(false);
    expect(
      canManageEventBusyList(
        makeEvent({ calendarId: undefined }),
        "author-pubkey",
      ),
    ).toBe(false);
  });
});
