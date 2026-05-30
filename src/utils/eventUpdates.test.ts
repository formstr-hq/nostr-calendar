import { describe, expect, it } from "vitest";
import { getEventUpdateSummary } from "./eventUpdates";
import type { ICalendarEvent } from "./types";

const HOUR = 60 * 60 * 1000;

function makeEvent(overrides: Partial<ICalendarEvent> = {}): ICalendarEvent {
  return {
    id: "event-1",
    eventId: "nostr-event-1",
    title: "Weekly Sync",
    description: "Discuss project updates",
    kind: 32678,
    begin: 1_700_000_000_000,
    end: 1_700_000_000_000 + HOUR,
    createdAt: 1_700_000_000,
    categories: [],
    participants: ["alice"],
    rsvpResponses: [],
    reference: [],
    location: ["Room A"],
    geoHash: [],
    website: "",
    user: "author",
    isPrivateEvent: true,
    repeat: { rrule: null },
    ...overrides,
  };
}

describe("getEventUpdateSummary", () => {
  it("does not notify when only a participant was removed", () => {
    const summary = getEventUpdateSummary(
      makeEvent({ participants: ["alice", "bob"] }),
      makeEvent({ participants: ["alice"] }),
    );

    expect(summary.hasParticipantRemoval).toBe(true);
    expect(summary.shouldNotify).toBe(false);
    expect(summary.changedAttributes).toEqual([]);
  });

  it("reports newly added participants", () => {
    const summary = getEventUpdateSummary(
      makeEvent({ participants: ["ALICE"] }),
      makeEvent({ participants: ["alice", "BOB"] }),
    );

    expect(summary.addedParticipants).toEqual(["bob"]);
    expect(summary.changedAttributes).toEqual(["participants"]);
    expect(summary.shouldNotify).toBe(true);
    expect(summary.body).toBe("A participant was added");
  });

  it("reports date and time changes with the new range", () => {
    const summary = getEventUpdateSummary(
      makeEvent(),
      makeEvent({
        begin: 1_700_003_600_000,
        end: 1_700_003_600_000 + HOUR,
      }),
    );

    expect(summary.timeChanged).toBe(true);
    expect(summary.changedAttributes).toContain("date/time");
    expect(summary.body).toContain("New time:");
    expect(summary.body).toMatch(/ - \d{1,2}:\d{2}/);
  });

  it("mentions changed non-time attributes", () => {
    const summary = getEventUpdateSummary(
      makeEvent(),
      makeEvent({
        title: "Planning",
        location: ["Room B"],
        description: "Updated agenda",
        categories: ["work"],
      }),
    );

    expect(summary.changedAttributes).toEqual([
      "title",
      "description",
      "location",
      "categories",
    ]);
    expect(summary.body).toBe(
      "Updated: title, description, location, categories",
    );
  });
});
