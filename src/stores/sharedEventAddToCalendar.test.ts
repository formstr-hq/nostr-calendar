/**
 * Tests for the add-to-calendar flow triggered from a shared event link.
 *
 * When a user opens a shared link (`/event/:naddr`) they see the event through
 * ViewEventPage → CalendarEventView → CalendarEvent → InvitationAcceptBar.
 * Unlike gift-wrap invitations, a shared-link event has NO corresponding record
 * in the invitations store. The component therefore takes a direct path:
 *   buildEventRef(…) → addEventToCalendar(calendarId, ref)
 *
 * These tests exercise that store-level path and verify:
 *  1. Direct add works for a public event   (no viewKey)
 *  2. Direct add works for a private event  (with viewKey)
 *  3. Adding the same event twice is idempotent (coordinate deduplication)
 *  4. Invitation flow (gift-wrap path) is unaffected / continues to work
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCalendarLists } from "./calendarLists";
import { useInvitations } from "./invitations";
import { buildEventRef } from "../utils/calendarListTypes";
import type { IInvitation } from "../utils/calendarListTypes";

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("../common/localStorage", () => ({
  getSecureItem: vi.fn().mockResolvedValue([]),
  setSecureItem: vi.fn(),
  removeSecureItem: vi.fn(),
}));

vi.mock("../common/nostr", () => ({
  fetchCalendarGiftWraps: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  fetchPrivateCalendarEvents: vi.fn(),
  getUserPublicKey: vi.fn().mockResolvedValue("author-pubkey-" + "0".repeat(50)),
  viewPrivateEvent: vi.fn().mockReturnValue({
    tags: [],
    content: "",
    kind: 32678,
    pubkey: "",
    created_at: 0,
    id: "",
    sig: "",
  }),
  getRelays: vi.fn().mockReturnValue(["wss://relay.test"]),
  publishToRelays: vi.fn().mockResolvedValue("ok"),
  publishParticipantRemovalEvent: vi.fn(),
}));

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
  moveEventBetweenCalendarLists: vi.fn(),
}));

vi.mock("../utils/parser", () => ({
  nostrEventToCalendar: vi.fn(),
}));

// ── Shared fixtures ────────────────────────────────────────────────────────

const CALENDAR_ID = "my-calendar-id";
const AUTHOR_PUBKEY = "author-pubkey-abc123";

const BASE_CALENDAR = {
  id: CALENDAR_ID,
  title: "My Calendar",
  description: "",
  color: "#4285f4",
  eventRefs: [] as string[][],
  createdAt: 1700000000,
  isVisible: true,
  eventId: "",
};

function makePublicEvent() {
  return {
    id: "public-event-dtag",
    eventId: "nostr-event-id-public",
    kind: 31923,
    user: AUTHOR_PUBKEY,
    title: "Community Meetup",
    description: "Open to everyone",
    begin: 1_800_000_000_000,
    end: 1_800_003_600_000,
    createdAt: 1_700_000_000,
    categories: [],
    participants: [AUTHOR_PUBKEY],
    rsvpResponses: [],
    reference: [],
    location: [],
    geoHash: [],
    website: "",
    isPrivateEvent: false,
    repeat: { rrule: null },
    calendarId: undefined,
    isInvitation: false,
  };
}

function makePrivateEvent(viewKey = "nsec1privateviewkey") {
  return {
    ...makePublicEvent(),
    id: "private-event-dtag",
    eventId: "nostr-event-id-private",
    kind: 32678,
    isPrivateEvent: true,
    viewKey,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("shared-link add-to-calendar (direct store path)", () => {
  beforeEach(() => {
    useCalendarLists.setState({
      calendars: [{ ...BASE_CALENDAR, eventRefs: [] }],
      isLoaded: true,
    });
    useInvitations.setState({ invitations: [], unreadCount: 0, isLoaded: true });
  });

  it("adds a public event to the calendar with an empty viewKey", async () => {
    const event = makePublicEvent();
    const eventRef = buildEventRef({
      kind: event.kind,
      authorPubkey: event.user,
      eventDTag: event.id,
      viewKey: "", // public events have no viewKey
    });

    await useCalendarLists.getState().addEventToCalendar(CALENDAR_ID, eventRef);

    const { calendars } = useCalendarLists.getState();
    const refs = calendars[0].eventRefs;
    expect(refs).toHaveLength(1);
    // Coordinate: "kind:pubkey:dTag"
    expect(refs[0][0]).toBe(`${event.kind}:${event.user}:${event.id}`);
    // viewKey slot is empty for public events
    expect(refs[0][2]).toBe("");
  });

  it("adds a private event to the calendar with the viewKey preserved", async () => {
    const event = makePrivateEvent("nsec1secretkey");
    const eventRef = buildEventRef({
      kind: event.kind,
      authorPubkey: event.user,
      eventDTag: event.id,
      viewKey: event.viewKey!,
    });

    await useCalendarLists.getState().addEventToCalendar(CALENDAR_ID, eventRef);

    const { calendars } = useCalendarLists.getState();
    const refs = calendars[0].eventRefs;
    expect(refs).toHaveLength(1);
    expect(refs[0][0]).toBe(`${event.kind}:${event.user}:${event.id}`);
    expect(refs[0][2]).toBe("nsec1secretkey");
  });

  // Deduplication is tested in calendarList.test.ts ("adds an event ref to a
  // calendar" / "correctly prevents duplicate event refs"). The real
  // addEventToCalendarList compares ref[0] (coordinate) and skips duplicates.
  // Here we only verify that the coordinate is built correctly so the real
  // dedup logic would kick in when called twice with the same event.
  it("buildEventRef creates consistent coordinates so dedup works correctly", () => {
    const event = makePublicEvent();
    const ref1 = buildEventRef({ kind: event.kind, authorPubkey: event.user, eventDTag: event.id, viewKey: "" });
    const ref2 = buildEventRef({ kind: event.kind, authorPubkey: event.user, eventDTag: event.id, viewKey: "" });
    // Same inputs → same coordinate → dedup in addEventToCalendarList will match
    expect(ref1[0]).toBe(ref2[0]);
  });

  it("gift-wrap invitation path still resolves via giftWrapId (regression)", async () => {
    const event = makePrivateEvent("nsec1testinvitekey");
    const gift: IInvitation = {
      originalInvitationId: "inner-event-id",
      giftWrapId: "gift-wrap-nostr-event-id",
      eventId: event.id,
      pubkey: event.user,
      kind: event.kind,
      viewKey: "nsec1testinvitekey",
      receivedAt: Date.now(),
      status: "pending",
      event: { ...event },
    };

    useInvitations.setState({ invitations: [gift], unreadCount: 1 });

    // Core of the invitation lookup used in InvitationAcceptBar: find by eventId + pubkey
    const invitations = useInvitations.getState().invitations;
    const match = invitations.find(
      (inv) => inv.eventId === event.id && inv.pubkey === event.user,
    );

    expect(match).toBeDefined();
    expect(match!.giftWrapId).toBe("gift-wrap-nostr-event-id");

    // Calling acceptInvitation via the giftWrapId removes it from the store
    await useInvitations.getState().acceptInvitation(match!.giftWrapId, CALENDAR_ID);

    const { invitations: remaining } = useInvitations.getState();
    expect(remaining).toHaveLength(0);

    // And adds the event ref to the calendar
    const { calendars } = useCalendarLists.getState();
    expect(calendars[0].eventRefs).toHaveLength(1);
    expect(calendars[0].eventRefs[0][0]).toContain(event.id);
  });

  it("buildEventRef produces valid a-tag format for public events", () => {
    const ref = buildEventRef({
      kind: 31923,
      authorPubkey: "abc123pubkey",
      eventDTag: "my-event-id",
      viewKey: "",
    });

    // a-tag format: [coordinate, relayUrl, viewKey]
    expect(ref).toHaveLength(3);
    expect(ref[0]).toBe("31923:abc123pubkey:my-event-id");
    expect(ref[1]).toBe(""); // no relay URL by default
    expect(ref[2]).toBe(""); // no viewKey for public events
  });

  it("buildEventRef produces valid a-tag format for private events", () => {
    const ref = buildEventRef({
      kind: 32678,
      authorPubkey: "abc123pubkey",
      eventDTag: "private-event-id",
      viewKey: "nsec1viewkeyhere",
    });

    expect(ref).toHaveLength(3);
    expect(ref[0]).toBe("32678:abc123pubkey:private-event-id");
    expect(ref[1]).toBe("");
    expect(ref[2]).toBe("nsec1viewkeyhere");
  });
});
