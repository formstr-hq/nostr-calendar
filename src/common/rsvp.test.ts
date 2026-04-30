import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocks must come before importing nostr.ts.
const { mockSubscribe, mockSigner, mockUnwrap } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  mockSigner: {
    getPublicKey: vi.fn().mockResolvedValue("a".repeat(64)),
    signEvent: vi.fn().mockImplementation(async (e) => ({
      ...e,
      id: "signed-id",
      sig: "sig",
    })),
  },
  mockUnwrap: vi.fn(),
}));

vi.mock("./nostrRuntime", () => ({
  nostrRuntime: {
    subscribe: mockSubscribe,
    querySync: vi.fn(),
    fetchOne: vi.fn(),
    addEvent: vi.fn(),
  },
}));
vi.mock("./signer", () => ({
  signerManager: {
    getSigner: vi.fn().mockResolvedValue(mockSigner),
    getSignerRelays: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../stores/relays", () => ({
  useRelayStore: { getState: () => ({ relays: [] }) },
}));
vi.mock("../stores/calendarLists", () => ({ useCalendarLists: {} }));
vi.mock("../stores/eventDetails", () => ({ TEMP_CALENDAR_ID: "tmp" }));
vi.mock("../stores/events", () => ({}));
vi.mock("./nip59", () => ({
  unwrapEvent: (e: unknown) => mockUnwrap(e),
  wrapEvent: vi.fn(),
}));

import {
  fetchPrivateEventRSVPs,
  fetchPublicEventRSVPs,
  RSVPRecord,
} from "./nostr";
import { RSVPStatus } from "../utils/types";
import { EventKinds } from "./EventConfigs";

const AUTHOR = "b".repeat(64);
const RESPONDER = "c".repeat(64);
const RECIPIENT = "a".repeat(64);
const D_TAG = "evt-d-tag";
const COORD = `${EventKinds.PrivateCalendarEvent}:${AUTHOR}:${D_TAG}`;
const PUBLIC_COORD = `${EventKinds.PublicCalendarEvent}:${AUTHOR}:${D_TAG}`;

describe("RSVP fetch helpers", () => {
  beforeEach(() => {
    mockSubscribe.mockReset();
    mockUnwrap.mockReset();
  });

  it("fetchPrivateEventRSVPs parses status, suggested times, and comment from a rumor", async () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe.mockImplementation((_relays, _filters, { onEvent }) => {
      void onEvent({ id: "gw" }); // gift wrap is opaque to the test
      return { close: vi.fn() };
    });
    mockUnwrap.mockResolvedValueOnce({
      pubkey: RESPONDER,
      kind: EventKinds.RSVPRumor,
      created_at: 1700000000,
      content: "running 5 mins late",
      tags: [
        ["a", COORD, "wss://relay.example"],
        ["status", "tentative"],
        ["start", "1700000300"],
        ["end", "1700003900"],
      ],
    });

    fetchPrivateEventRSVPs(
      { eventCoord: COORD, recipientPubkey: RECIPIENT },
      (r) => collected.push(r),
    );
    // Allow the async unwrap to resolve.
    await new Promise((r) => setTimeout(r, 0));

    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({
      pubkey: RESPONDER,
      status: RSVPStatus.tentative,
      suggestedStart: 1700000300,
      suggestedEnd: 1700003900,
      comment: "running 5 mins late",
      eventCoord: COORD,
    });
  });

  it("fetchPrivateEventRSVPs ignores rumors that don't reference the event", async () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe.mockImplementation((_relays, _filters, { onEvent }) => {
      void onEvent({ id: "gw" });
      return { close: vi.fn() };
    });
    mockUnwrap.mockResolvedValueOnce({
      pubkey: RESPONDER,
      kind: EventKinds.RSVPRumor,
      created_at: 1700000000,
      content: "",
      tags: [
        ["a", `${EventKinds.PrivateCalendarEvent}:${AUTHOR}:OTHER`],
        ["status", "accepted"],
      ],
    });

    fetchPrivateEventRSVPs(
      { eventCoord: COORD, recipientPubkey: RECIPIENT },
      (r) => collected.push(r),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(collected).toHaveLength(0);
  });

  it("fetchPublicEventRSVPs parses tags directly off the public RSVP event", () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe.mockImplementation((_relays, _filters, { onEvent }) => {
      onEvent({
        pubkey: RESPONDER,
        created_at: 1700001000,
        content: "see you there",
        tags: [
          ["a", PUBLIC_COORD],
          ["status", "accepted"],
        ],
      });
      return { close: vi.fn() };
    });

    fetchPublicEventRSVPs({ eventCoord: PUBLIC_COORD }, (r) =>
      collected.push(r),
    );
    expect(collected[0]).toMatchObject({
      pubkey: RESPONDER,
      status: RSVPStatus.accepted,
      comment: "see you there",
      eventCoord: PUBLIC_COORD,
    });
  });

  it("rejects rumors with an invalid status tag", async () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe.mockImplementation((_relays, _filters, { onEvent }) => {
      void onEvent({ id: "gw" });
      return { close: vi.fn() };
    });
    mockUnwrap.mockResolvedValueOnce({
      pubkey: RESPONDER,
      kind: EventKinds.RSVPRumor,
      created_at: 1700000000,
      content: "",
      tags: [
        ["a", COORD],
        ["status", "going"], // not in the allowed enum
      ],
    });

    fetchPrivateEventRSVPs(
      { eventCoord: COORD, recipientPubkey: RECIPIENT },
      (r) => collected.push(r),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(collected).toHaveLength(0);
  });
});
