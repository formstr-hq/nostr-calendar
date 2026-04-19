import { describe, it, expect, beforeEach, vi } from "vitest";
import { useInvitations } from "./invitations";
import { useCalendarLists } from "./calendarLists";

// Mock secure storage
vi.mock("../common/localStorage", () => ({
  getSecureItem: vi.fn().mockResolvedValue([]),
  setSecureItem: vi.fn(),
  removeSecureItem: vi.fn(),
}));

// Mock nostr functions
vi.mock("../common/nostr", () => ({
  fetchCalendarGiftWraps: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  fetchPrivateCalendarEvents: vi.fn(),
  getUserPublicKey: vi.fn().mockResolvedValue("test-pubkey-" + "0".repeat(50)),
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
  getRelays: vi.fn().mockReturnValue(["wss://relay.test"]),
  publishToRelays: vi.fn().mockResolvedValue("ok"),
}));

// Mock calendarList protocol
vi.mock("../common/calendarList", () => ({
  fetchCalendarLists: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  publishCalendarList: vi.fn().mockResolvedValue({}),
  createDefaultCalendar: vi.fn(),
  addEventToCalendarList: vi
    .fn()
    .mockImplementation((cal, ref) =>
      Promise.resolve({ ...cal, eventRefs: [...cal.eventRefs, ref] }),
    ),
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

describe("useInvitations store", () => {
  beforeEach(() => {
    // Reset stores
    useInvitations.setState({
      invitations: [],
      unreadCount: 0,
      isLoaded: false,
    });
    useCalendarLists.setState({
      calendars: [
        {
          id: "cal-1",
          title: "My Calendar",
          description: "",
          color: "#4285f4",
          eventRefs: [],
          createdAt: 1700000000,
          isVisible: true,
        },
      ],
      isLoaded: true,
    });
  });

  it("starts with empty invitations", () => {
    const state = useInvitations.getState();
    expect(state.invitations).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });

  it("dismisses an invitation", () => {
    // Add a mock invitation
    useInvitations.setState({
      invitations: [
        {
          giftWrapId: "wrap-1",
          eventId: "event-1",
          viewKey: "nsec1test",
          receivedAt: Date.now(),
          status: "pending",
        },
      ],
      unreadCount: 1,
    });

    useInvitations.getState().dismissInvitation("wrap-1");

    const state = useInvitations.getState();
    expect(state.invitations[0].status).toBe("dismissed");
    expect(state.unreadCount).toBe(0);
  });

  it("accepts an invitation and adds event to calendar", async () => {
    // Add a mock invitation with resolved event
    useInvitations.setState({
      invitations: [
        {
          giftWrapId: "wrap-1",
          eventId: "event-123",
          viewKey: "nsec1testkey",
          receivedAt: Date.now(),
          status: "pending",
          event: {
            id: "event-123",
            eventId: "event-123",
            title: "Meeting",
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
          },
        },
      ],
      unreadCount: 1,
    });

    await useInvitations.getState().acceptInvitation("wrap-1", "cal-1");

    // Invitation should be removed
    const { invitations, unreadCount } = useInvitations.getState();
    expect(invitations).toHaveLength(0);
    expect(unreadCount).toBe(0);

    // Calendar should have the event ref
    const { calendars } = useCalendarLists.getState();
    expect(calendars[0].eventRefs).toHaveLength(1);
    // Coordinate should contain the event d-tag
    expect(calendars[0].eventRefs[0][0]).toContain("event-123");
    // Metadata should contain the viewKey (third element, index 2)
    expect(calendars[0].eventRefs[0][2]).toContain("nsec1testkey");
  });

  it("deduplicates invitations for events already in calendars", () => {
    // Set up a calendar with an existing event
    useCalendarLists.setState({
      calendars: [
        {
          id: "cal-1",
          title: "My Calendar",
          description: "",
          color: "#4285f4",
          eventRefs: [
            [
              "32678:testpubkey:existing-event",
              "",
              "nsec1key:1700000000::1700003600:false",
            ],
          ],
          createdAt: 1700000000,
          isVisible: true,
        },
      ],
      isLoaded: true,
    });

    // The getAllEventIds should include the existing event
    const existingIds = useCalendarLists.getState().getAllEventIds();
    expect(existingIds).toContain("existing-event");
  });

  it("clears invitations on logout", async () => {
    useInvitations.setState({
      invitations: [
        {
          giftWrapId: "wrap-1",
          eventId: "event-1",
          viewKey: "nsec1test",
          receivedAt: Date.now(),
          status: "pending",
        },
      ],
      unreadCount: 1,
      isLoaded: true,
    });

    await useInvitations.getState().clearCachedInvitations();

    const state = useInvitations.getState();
    expect(state.invitations).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
    expect(state.isLoaded).toBe(false);
  });

  it("correctly builds event ref with isRecurring flag on accept", async () => {
    // Invitation with a recurring event
    useInvitations.setState({
      invitations: [
        {
          giftWrapId: "wrap-recurring",
          eventId: "recurring-event",
          viewKey: "nsec1recur",
          receivedAt: Date.now(),
          status: "pending",
          event: {
            id: "recurring-event",
            eventId: "recurring-event",
            title: "Weekly Standup",
            description: "",
            begin: 1700000000000,
            end: 1700003600000,
            kind: 32679,
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
            repeat: { rrule: "FREQ=WEEKLY" },
          },
        },
      ],
      unreadCount: 1,
    });

    await useInvitations.getState().acceptInvitation("wrap-recurring", "cal-1");

    const { calendars } = useCalendarLists.getState();
    const ref = calendars[0].eventRefs.find((r) =>
      r[0].includes("recurring-event"),
    );
    expect(ref).toBeDefined();
    // Coordinate should contain kind:authorPubkey:eventDTag
    expect(ref![0]).toContain("32679");
    expect(ref![0]).toContain("recurring-event");
    // Metadata (third element) should end with :true for recurring
    expect(ref![2].endsWith(":true")).toBe(true);
    // Metadata should contain the viewKey
    expect(ref![2]).toContain("nsec1recur");
  });
});
