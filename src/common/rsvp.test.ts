import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateSecretKey, getPublicKey, nip19, nip44 } from "nostr-tools";

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
const PRIVATE_VIEW_KEY_BYTES = generateSecretKey();
const PRIVATE_VIEW_KEY = nip19.nsecEncode(PRIVATE_VIEW_KEY_BYTES);

const encryptPrivatePayload = (payload: object) =>
  nip44.encrypt(
    JSON.stringify(payload),
    nip44.getConversationKey(
      PRIVATE_VIEW_KEY_BYTES,
      getPublicKey(PRIVATE_VIEW_KEY_BYTES),
    ),
  );

describe("RSVP fetch helpers", () => {
  beforeEach(() => {
    mockSubscribe.mockReset();
    mockUnwrap.mockReset();
  });

  it("fetchPrivateEventRSVPs parses status, suggested times, and comment from a private RSVP event", () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe.mockImplementation((_relays, _filters, { onEvent }) => {
      onEvent({
        pubkey: RESPONDER,
        kind: EventKinds.PrivateRSVPEvent,
        created_at: 1700000000,
        content: encryptPrivatePayload({
          status: RSVPStatus.tentative,
          suggestedStart: 1700000300,
          suggestedEnd: 1700003900,
          comment: "running 5 mins late",
        }),
        tags: [
          ["a", COORD],
          ["d", "private-rsvp-dtag"],
        ],
      });
      return { close: vi.fn() };
    });

    fetchPrivateEventRSVPs(
      { eventCoord: COORD, viewKey: PRIVATE_VIEW_KEY },
      (r) => collected.push(r),
    );

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

  it("fetchPrivateEventRSVPs ignores private responses that don't reference the event", () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe.mockImplementation((_relays, _filters, { onEvent }) => {
      onEvent({
        pubkey: RESPONDER,
        kind: EventKinds.PrivateRSVPEvent,
        created_at: 1700000000,
        content: encryptPrivatePayload({ status: RSVPStatus.accepted }),
        tags: [["a", `${EventKinds.PrivateCalendarEvent}:${AUTHOR}:OTHER`]],
      });
      return { close: vi.fn() };
    });

    fetchPrivateEventRSVPs(
      { eventCoord: COORD, viewKey: PRIVATE_VIEW_KEY },
      (r) => collected.push(r),
    );
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

  it("rejects private responses with an invalid status payload", () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe.mockImplementation((_relays, _filters, { onEvent }) => {
      onEvent({
        pubkey: RESPONDER,
        kind: EventKinds.PrivateRSVPEvent,
        created_at: 1700000000,
        content: encryptPrivatePayload({ status: "going" }),
        tags: [["a", COORD]],
      });
      return { close: vi.fn() };
    });

    fetchPrivateEventRSVPs(
      { eventCoord: COORD, viewKey: PRIVATE_VIEW_KEY },
      (r) => collected.push(r),
    );
    expect(collected).toHaveLength(0);
  });

  it("still parses legacy gift-wrapped private RSVPs when a recipient pubkey is provided", async () => {
    const collected: RSVPRecord[] = [];
    mockSubscribe
      .mockImplementationOnce(() => ({ close: vi.fn() }))
      .mockImplementationOnce((_relays, _filters, { onEvent }) => {
        void onEvent({ id: "gw" });
        return { close: vi.fn() };
      });
    mockUnwrap.mockResolvedValueOnce({
      pubkey: RESPONDER,
      kind: EventKinds.RSVPRumor,
      created_at: 1700000000,
      content: "legacy comment",
      tags: [
        ["a", COORD],
        ["status", "accepted"],
      ],
    });

    fetchPrivateEventRSVPs(
      {
        eventCoord: COORD,
        viewKey: PRIVATE_VIEW_KEY,
        recipientPubkey: RECIPIENT,
      },
      (r) => collected.push(r),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(collected[0]).toMatchObject({
      pubkey: RESPONDER,
      status: RSVPStatus.accepted,
      comment: "legacy comment",
    });
  });
});
