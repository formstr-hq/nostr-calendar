import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTimeBasedEvents, getTimeRangeConfig } from "./events";
import { useCalendarLists } from "./calendarLists";
import { parseEventRef, buildEventRef } from "../utils/calendarListTypes";

// Mock secure storage
vi.mock("../common/localStorage", () => ({
  getSecureItem: vi.fn().mockResolvedValue([]),
  setSecureItem: vi.fn(),
  removeSecureItem: vi.fn(),
}));

// Mock nostr functions
vi.mock("../common/nostr", () => ({
  fetchCalendarEvents: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  fetchPrivateCalendarEvents: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  viewPrivateEvent: vi.fn().mockReturnValue({
    tags: [
      ["title", "Test Event"],
      ["d", "event-123"],
      ["start", "1700000000"],
      ["end", "1700003600"],
    ],
    content: "",
    kind: 32678,
    pubkey: "test-pubkey",
    created_at: 1700000000,
    id: "event-123",
    sig: "sig",
  }),
  getUserPublicKey: vi.fn().mockResolvedValue("test-pubkey-" + "0".repeat(50)),
  getRelays: vi.fn().mockReturnValue(["wss://relay.test"]),
  publishToRelays: vi.fn().mockResolvedValue("ok"),
}));

// Mock calendarList protocol
vi.mock("../common/calendarList", () => ({
  fetchCalendarLists: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  publishCalendarList: vi.fn().mockResolvedValue({}),
  createDefaultCalendar: vi.fn(),
  addEventToCalendarList: vi.fn(),
  removeEventFromCalendarList: vi.fn(),
}));

// Mock parser
vi.mock("../utils/parser", () => ({
  nostrEventToCalendar: vi.fn().mockReturnValue({
    id: "event-123",
    eventId: "event-123",
    title: "Test Event",
    description: "",
    begin: 1700000000000,
    end: 1700003600000,
    kind: 32678,
    createdAt: 1700000000,
    categories: [],
    participants: [],
    rsvpResponses: [],
    reference: [],
    location: [],
    geoHash: [],
    website: "",
    user: "test-pubkey",
    isPrivateEvent: true,
    repeat: { rrule: null },
  }),
}));

// Mock notifications
vi.mock("../utils/notifications", () => ({
  scheduleEventNotifications: vi.fn(),
  cancelEventNotifications: vi.fn(),
}));

describe("parseEventRef", () => {
  it("parses a non-recurring event ref", () => {
    const ref = [
      "32678:testpubkey:my-event",
      "",
      "nsec1viewkey:1700000000::1700003600:false",
    ];
    const parsed = parseEventRef(ref);

    expect(parsed.kind).toBe(32678);
    expect(parsed.authorPubkey).toBe("testpubkey");
    expect(parsed.eventDTag).toBe("my-event");
    expect(parsed.relayUrl).toBe("");
    expect(parsed.viewKey).toBe("nsec1viewkey");
    expect(parsed.beginTimeSecs).toBe(1700000000);
    expect(parsed.endTimeSecs).toBe(1700003600);
    expect(parsed.isRecurring).toBe(false);
  });

  it("parses a recurring event ref", () => {
    const ref = [
      "32679:testpubkey:weekly-standup",
      "",
      "nsec1recur:1700000000::1700003600:true",
    ];
    const parsed = parseEventRef(ref);

    expect(parsed.kind).toBe(32679);
    expect(parsed.authorPubkey).toBe("testpubkey");
    expect(parsed.eventDTag).toBe("weekly-standup");
    expect(parsed.relayUrl).toBe("");
    expect(parsed.viewKey).toBe("nsec1recur");
    expect(parsed.beginTimeSecs).toBe(1700000000);
    expect(parsed.endTimeSecs).toBe(1700003600);
    expect(parsed.isRecurring).toBe(true);
  });
});

describe("buildEventRef", () => {
  it("builds a correctly formatted event ref array", () => {
    const ref = buildEventRef({
      kind: 32678,
      authorPubkey: "testpubkey",
      eventDTag: "my-event",
      viewKey: "nsec1key",
      beginTimeSecs: 1700000000,
      endTimeSecs: 1700003600,
      isRecurring: false,
    });

    expect(ref).toEqual([
      "32678:testpubkey:my-event",
      "",
      "nsec1key:1700000000::1700003600:false",
    ]);
  });

  it("round-trips with parseEventRef", () => {
    const original = {
      kind: 32679,
      authorPubkey: "testpubkey",
      eventDTag: "recurring-event",
      viewKey: "nsec1abc",
      beginTimeSecs: 1700500000,
      endTimeSecs: 1700503600,
      isRecurring: true,
    };

    const ref = buildEventRef(original);
    const parsed = parseEventRef(ref);

    expect(parsed).toEqual({ ...original, relayUrl: "" });
  });
});

describe("useTimeBasedEvents store", () => {
  beforeEach(() => {
    useTimeBasedEvents.setState({
      events: [],
      eventById: {},
      isCacheLoaded: false,
    });
    useCalendarLists.setState({
      calendars: [],
      isLoaded: false,
    });
  });

  it("starts with empty events", () => {
    const state = useTimeBasedEvents.getState();
    expect(state.events).toEqual([]);
    expect(state.eventById).toEqual({});
  });

  it("has correct default time range config", () => {
    const config = getTimeRangeConfig();
    expect(config.daysBefore).toBe(14);
    expect(config.daysAfter).toBe(28);
  });

  it("resetPrivateEvents keeps only public events", () => {
    useTimeBasedEvents.setState({
      events: [
        {
          id: "public-1",
          eventId: "public-1",
          title: "Public",
          description: "",
          begin: 1700000000000,
          end: 1700003600000,
          kind: 31923,
          createdAt: 1700000000,
          categories: [],
          participants: [],
          rsvpResponses: [],
          reference: [],
          location: [],
          geoHash: [],
          website: "",
          user: "someone",
          isPrivateEvent: false,
          repeat: { rrule: null },
        },
        {
          id: "private-1",
          eventId: "private-1",
          title: "Private",
          description: "",
          begin: 1700000000000,
          end: 1700003600000,
          kind: 32678,
          createdAt: 1700000000,
          categories: [],
          participants: [],
          rsvpResponses: [],
          reference: [],
          location: [],
          geoHash: [],
          website: "",
          user: "me",
          isPrivateEvent: true,
          repeat: { rrule: null },
        },
      ],
    });

    useTimeBasedEvents.getState().resetPrivateEvents();

    const { events } = useTimeBasedEvents.getState();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("public-1");
  });

  it("fetchPrivateEvents does nothing when no visible refs exist", () => {
    useCalendarLists.setState({
      calendars: [
        {
          id: "cal-1",
          title: "Empty",
          description: "",
          color: "#4285f4",
          eventRefs: [],
          createdAt: 1700000000,
          isVisible: true,
        },
      ],
      isLoaded: true,
    });

    // Should not throw
    useTimeBasedEvents.getState().fetchPrivateEvents();
  });

  it("fetchPrivateEvents skips hidden calendars", async () => {
    const nostr = await import("../common/nostr");

    useCalendarLists.setState({
      calendars: [
        {
          id: "cal-1",
          title: "Hidden",
          description: "",
          color: "#4285f4",
          eventRefs: [
            [
              "32678:testpubkey:hidden-event",
              "",
              "nsec1key:1700000000::1700003600:false",
            ],
          ],
          createdAt: 1700000000,
          isVisible: false,
        },
      ],
      isLoaded: true,
    });

    // Clear any previous calls
    vi.mocked(nostr.fetchPrivateCalendarEvents).mockClear();

    useTimeBasedEvents.getState().fetchPrivateEvents();

    // No visible refs, so fetchPrivateCalendarEvents should not be called
    expect(nostr.fetchPrivateCalendarEvents).not.toHaveBeenCalled();
  });

  it("clears cached events", async () => {
    useTimeBasedEvents.setState({
      events: [
        {
          id: "evt-1",
          eventId: "evt-1",
          title: "Cached",
          description: "",
          begin: 1700000000000,
          end: 1700003600000,
          kind: 32678,
          createdAt: 1700000000,
          categories: [],
          participants: [],
          rsvpResponses: [],
          reference: [],
          location: [],
          geoHash: [],
          website: "",
          user: "me",
          isPrivateEvent: true,
          repeat: { rrule: null },
        },
      ],
    });

    await useTimeBasedEvents.getState().clearCachedEvents();

    const { events, eventById } = useTimeBasedEvents.getState();
    expect(events).toHaveLength(0);
    expect(eventById).toEqual({});
  });
});
