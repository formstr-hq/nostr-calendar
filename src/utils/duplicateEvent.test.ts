import { describe, expect, it, vi, afterEach } from "vitest";
import { buildDuplicatedEventDraft } from "./duplicateEvent";
import { TEMP_CALENDAR_ID } from "../stores/eventDetails";
import type { ICalendarEvent } from "./types";

function makeEvent(overrides: Partial<ICalendarEvent> = {}): ICalendarEvent {
  return {
    begin: Date.UTC(2026, 3, 28, 9),
    description: "Sprint planning",
    kind: 31923,
    end: Date.UTC(2026, 3, 28, 10),
    id: "original-event-id",
    eventId: "nostr-event-id",
    title: "Planning",
    createdAt: Date.UTC(2026, 3, 1, 12),
    categories: ["team"],
    participants: ["npub1participant"],
    rsvpResponses: [
      {
        participantId: "npub1participant",
        response: "accepted",
        timestamp: Date.UTC(2026, 3, 2, 12),
      },
    ],
    reference: ["https://example.com/doc"],
    image: "https://example.com/image.png",
    location: ["Office"],
    geoHash: [],
    website: "https://example.com",
    user: "npub1author",
    isPrivateEvent: true,
    viewKey: "nsec1viewkey",
    repeat: { rrule: "FREQ=WEEKLY" },
    notificationPreference: "enabled",
    calendarId: "work-calendar",
    isInvitation: true,
    relayHint: "wss://relay.example.com",
    ...overrides,
  };
}

describe("buildDuplicatedEventDraft", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps event content but resets identity-specific fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:30:00Z"));

    const duplicated = buildDuplicatedEventDraft(makeEvent());

    expect(duplicated.title).toBe("Planning");
    expect(duplicated.begin).toBe(Date.UTC(2026, 3, 28, 9));
    expect(duplicated.end).toBe(Date.UTC(2026, 3, 28, 10));
    expect(duplicated.participants).toEqual(["npub1participant"]);
    expect(duplicated.repeat.rrule).toBe("FREQ=WEEKLY");

    expect(duplicated.id).toBe(TEMP_CALENDAR_ID);
    expect(duplicated.eventId).toBe("");
    expect(duplicated.createdAt).toBe(
      new Date("2026-04-28T12:30:00Z").valueOf(),
    );
    expect(duplicated.user).toBe("");
    expect(duplicated.viewKey).toBeUndefined();
    expect(duplicated.isInvitation).toBe(false);
    expect(duplicated.relayHint).toBeUndefined();
    expect(duplicated.rsvpResponses).toEqual([]);
  });
});
