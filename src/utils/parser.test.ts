import { describe, it, expect } from "vitest";
import { nostrEventToCalendar } from "./parser";
import { Event } from "nostr-tools";

function makeNostrEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-id-123",
    pubkey: "pubkey-abc",
    created_at: 1700000000,
    kind: 31923,
    tags: [],
    content: "Event description",
    sig: "sig-xyz",
    ...overrides,
  };
}

describe("nostrEventToCalendar", () => {
  it("maps basic event fields correctly", () => {
    const event = makeNostrEvent();
    const result = nostrEventToCalendar(event);

    expect(result.description).toBe("Event description");
    expect(result.user).toBe("pubkey-abc");
    expect(result.eventId).toBe("event-id-123");
    expect(result.kind).toBe(31923);
    expect(result.createdAt).toBe(1700000000);
    expect(result.isPrivateEvent).toBe(false);
  });

  it("parses start and end tags (converts unix seconds to ms)", () => {
    const event = makeNostrEvent({
      tags: [
        ["start", "1700000000"],
        ["end", "1700003600"],
      ],
    });
    const result = nostrEventToCalendar(event);

    expect(result.begin).toBe(1700000000 * 1000);
    expect(result.end).toBe(1700003600 * 1000);
  });

  it("parses the d tag as the event id", () => {
    const event = makeNostrEvent({
      tags: [["d", "my-calendar-event"]],
    });
    const result = nostrEventToCalendar(event);
    expect(result.id).toBe("my-calendar-event");
  });

  it("parses the title tag", () => {
    const event = makeNostrEvent({
      tags: [["title", "My Event"]],
    });
    const result = nostrEventToCalendar(event);
    expect(result.title).toBe("My Event");
  });

  it("parses the name tag as title", () => {
    const event = makeNostrEvent({
      tags: [["name", "Named Event"]],
    });
    const result = nostrEventToCalendar(event);
    expect(result.title).toBe("Named Event");
  });

  it("parses the description tag (overrides content)", () => {
    const event = makeNostrEvent({
      content: "content description",
      tags: [["description", "tag description"]],
    });
    const result = nostrEventToCalendar(event);
    expect(result.description).toBe("tag description");
  });

  it("parses reference tags", () => {
    const event = makeNostrEvent({
      tags: [
        ["r", "https://example.com"],
        ["r", "https://other.com"],
      ],
    });
    const result = nostrEventToCalendar(event);
    expect(result.reference).toEqual([
      "https://example.com",
      "https://other.com",
    ]);
  });

  it("parses the image tag", () => {
    const event = makeNostrEvent({
      tags: [["image", "https://example.com/image.jpg"]],
    });
    const result = nostrEventToCalendar(event);
    expect(result.image).toBe("https://example.com/image.jpg");
  });

  it("parses category tags (t)", () => {
    const event = makeNostrEvent({
      tags: [
        ["t", "meetup"],
        ["t", "nostr"],
      ],
    });
    const result = nostrEventToCalendar(event);
    expect(result.categories).toEqual(["meetup", "nostr"]);
  });

  it("parses location tags", () => {
    const event = makeNostrEvent({
      tags: [["location", "NYC"]],
    });
    const result = nostrEventToCalendar(event);
    expect(result.location).toEqual(["NYC"]);
  });

  it("parses participant tags (p)", () => {
    const event = makeNostrEvent({
      tags: [
        ["p", "participant-1"],
        ["p", "participant-2"],
      ],
    });
    const result = nostrEventToCalendar(event);
    expect(result.participants).toEqual(["participant-1", "participant-2"]);
  });

  it("parses geohash tags (g)", () => {
    const event = makeNostrEvent({
      tags: [["g", "u4pruydqqvj"]],
    });
    const result = nostrEventToCalendar(event);
    expect(result.geoHash).toEqual(["u4pruydqqvj"]);
  });

  it("parses recurring event via L/l labels", () => {
    const event = makeNostrEvent({
      tags: [
        ["L", "rrule"],
        ["l", "FREQ=WEEKLY"],
      ],
    });
    const result = nostrEventToCalendar(event);
    expect(result.repeat.rrule).toBe("FREQ=WEEKLY");
  });

  it("sets repeat.rrule to null for non-recurring events", () => {
    const event = makeNostrEvent({ tags: [] });
    const result = nostrEventToCalendar(event);
    expect(result.repeat.rrule).toBeNull();
  });

  it("sets isPrivateEvent from options", () => {
    const event = makeNostrEvent();
    const result = nostrEventToCalendar(event, { isPrivateEvent: true });
    expect(result.isPrivateEvent).toBe(true);
  });

  it("sets viewKey from options", () => {
    const event = makeNostrEvent();
    const result = nostrEventToCalendar(event, { viewKey: "secret-key" });
    expect(result.viewKey).toBe("secret-key");
  });

  it("defaults to empty arrays for missing collection fields", () => {
    const event = makeNostrEvent({ tags: [] });
    const result = nostrEventToCalendar(event);

    expect(result.categories).toEqual([]);
    expect(result.reference).toEqual([]);
    expect(result.location).toEqual([]);
    expect(result.geoHash).toEqual([]);
    expect(result.participants).toEqual([]);
    expect(result.rsvpResponses).toEqual([]);
  });

  it("defaults to 0 for begin and end when tags are missing", () => {
    const event = makeNostrEvent({ tags: [] });
    const result = nostrEventToCalendar(event);
    expect(result.begin).toBe(0);
    expect(result.end).toBe(0);
  });

  it("defaults to empty string for title and website", () => {
    const event = makeNostrEvent({ tags: [] });
    const result = nostrEventToCalendar(event);
    expect(result.title).toBe("");
    expect(result.website).toBe("");
  });

  it("parses a fully populated event", () => {
    const event = makeNostrEvent({
      content: "A great event",
      tags: [
        ["d", "full-event"],
        ["title", "Full Event"],
        ["start", "1700000000"],
        ["end", "1700003600"],
        ["t", "nostr"],
        ["t", "dev"],
        ["location", "Berlin"],
        ["g", "u33d"],
        ["p", "alice"],
        ["p", "bob"],
        ["r", "https://nostr.com"],
        ["image", "https://img.com/pic.png"],
        ["L", "rrule"],
        ["l", "FREQ=DAILY"],
      ],
    });
    const result = nostrEventToCalendar(event);

    expect(result.id).toBe("full-event");
    expect(result.title).toBe("Full Event");
    expect(result.begin).toBe(1700000000000);
    expect(result.end).toBe(1700003600000);
    expect(result.categories).toEqual(["nostr", "dev"]);
    expect(result.location).toEqual(["Berlin"]);
    expect(result.geoHash).toEqual(["u33d"]);
    expect(result.participants).toEqual(["alice", "bob"]);
    expect(result.reference).toEqual(["https://nostr.com"]);
    expect(result.image).toBe("https://img.com/pic.png");
    expect(result.repeat.rrule).toBe("FREQ=DAILY");
  });
});
