import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateSecretKey,
  getPublicKey,
  nip19,
  nip44,
  type Event,
} from "nostr-tools";
import { EventKinds } from "./EventConfigs";

/* ------------------------------------------------------------------ *
 * Mock the network boundary; keep all crypto (nip44/nip19/hash) real. *
 * ------------------------------------------------------------------ */

// A fake Relay so publishToRelays/ensureRelay never touch the network. Each
// instance's behaviour is looked up per-URL from `relayState.behavior`, and
// every published event is recorded for assertions.
const { relayState } = vi.hoisted(() => ({
  relayState: {
    behavior: new Map<string, "ok" | "reject" | "hang">(),
    published: [] as { url: string; event: Event }[],
    created: [] as string[],
  },
}));

vi.mock("nostr-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nostr-tools")>();
  class FakeRelay {
    url: string;
    connectionTimeout = 0;
    constructor(url: string) {
      this.url = url;
      relayState.created.push(url);
    }
    async connect() {
      if (relayState.behavior.get(this.url) === "reject") {
        // still connects; failure happens at publish
      }
    }
    async publish(event: Event) {
      relayState.published.push({ url: this.url, event });
      const b = relayState.behavior.get(this.url) ?? "ok";
      if (b === "reject") throw new Error("rejected");
      if (b === "hang") return new Promise<string>(() => {}); // never settles
      return "ok";
    }
    async close() {}
  }
  return { ...actual, Relay: FakeRelay };
});

const {
  mockSigner,
  mockNip59,
  mockRuntime,
  mockCalendarLists,
  mockRelayStore,
} = vi.hoisted(() => ({
  mockSigner: {
    getPublicKey: vi.fn(),
    signEvent: vi.fn(),
    nip44Encrypt: vi.fn(),
    nip44Decrypt: vi.fn(),
  },
  mockNip59: { wrapEvent: vi.fn(), unwrapEvent: vi.fn() },
  mockRuntime: {
    subscribe: vi.fn(() => ({ id: "sub", unsubscribe: vi.fn() })),
    querySync: vi.fn().mockResolvedValue([]),
    fetchOne: vi.fn().mockResolvedValue(null),
    addEvent: vi.fn(),
  },
  mockCalendarLists: {
    moveEventToCalendar: vi.fn().mockResolvedValue(undefined),
    updateEventRefViewKey: vi.fn().mockResolvedValue(undefined),
    calendars: [] as unknown[],
  },
  mockRelayStore: { relays: [] as string[] },
}));

vi.mock("./signer", () => ({
  signerManager: {
    getSigner: vi.fn().mockResolvedValue(mockSigner),
    getSignerRelays: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("./nip59", () => mockNip59);
vi.mock("./nostrRuntime", () => ({ nostrRuntime: mockRuntime }));
vi.mock("../stores/relays", () => ({
  useRelayStore: { getState: () => mockRelayStore },
}));
vi.mock("../stores/calendarLists", () => ({
  useCalendarLists: { getState: () => mockCalendarLists },
}));
vi.mock("../stores/eventDetails", () => ({ TEMP_CALENDAR_ID: "TEMP" }));
vi.mock("../stores/events", () => ({}));

import {
  getUserPublicKey,
  getRelays,
  getPrivateRSVPPublishRelays,
  ensureRelay,
  publishToRelays,
  republishEventToRelays,
  viewPrivateEvent,
  encodeNAddr,
  getDetailsFromGiftWrap,
  fetchCalendarGiftWraps,
  fetchCalendarEvents,
  fetchPrivateCalendarEvents,
  fetchPrivateEventRSVPs,
  fetchPublicEventRSVPs,
  fetchCalendarEvent,
  fetchUserProfile,
  fetchRelayList,
  fetchRelayLists,
  publishRelayList,
  publishPublicCalendarEvent,
  publishPrivateCalendarEvent,
  editPrivateCalendarEvent,
  rotatePrivateEventKey,
  publishDeletionEvent,
  publishParticipantRemovalEvent,
  publishPrivateRSVPEvent,
  publishPublicRSVPEvent,
  publishBusyList,
  fetchBusyListsForUser,
  publishSchedulingPageKey,
  publishEmptySchedulingPageKey,
  fetchOwnSchedulingPageKeys,
  fetchPrivateRSVPResponderPubkeys,
  getAllResponsesForForm,
  defaultRelays,
} from "./nostr";
import type { ICalendarEvent } from "../utils/types";
import { RSVPStatus } from "../utils/types";

const AUTHOR_SK = generateSecretKey();
const AUTHOR = getPublicKey(AUTHOR_SK);
const PARTICIPANT_A = "a".repeat(64);
const PARTICIPANT_B = "b".repeat(64);

// Decrypt a private-event content blob using its nsec viewKey (real NIP-44).
function decryptContent(content: string, viewKeyNsec: string): string[][] {
  const sk = nip19.decode(viewKeyNsec as `nsec1${string}`).data as Uint8Array;
  const plaintext = nip44.decrypt(
    content,
    nip44.getConversationKey(sk, getPublicKey(sk)),
  );
  return JSON.parse(plaintext);
}

function makeEvent(overrides: Partial<ICalendarEvent> = {}): ICalendarEvent {
  return {
    begin: 1_700_000_000_000,
    end: 1_700_003_600_000,
    id: "event-dtag",
    eventId: "",
    kind: EventKinds.PrivateCalendarEvent,
    title: "Lunch",
    createdAt: 1_700_000_000,
    description: "desc",
    calendarId: "cal-1",
    location: ["Cafe"],
    categories: [],
    reference: [],
    geoHash: [],
    participants: [PARTICIPANT_A],
    rsvpResponses: [],
    website: "",
    user: AUTHOR,
    isPrivateEvent: true,
    repeat: { rrule: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  relayState.behavior.clear();
  relayState.published.length = 0;
  relayState.created.length = 0;
  mockRelayStore.relays = ["wss://relay.test"];
  mockCalendarLists.calendars = [];

  // Re-assign fresh fns each test — some tests null these out to exercise the
  // "no NIP-44 signer" branches, so we can't rely on the previous instances.
  mockSigner.getPublicKey = vi.fn().mockResolvedValue(AUTHOR);
  mockSigner.signEvent = vi.fn().mockImplementation(async (e) => ({
    ...e,
    sig: "sig",
  }));
  mockSigner.nip44Encrypt = vi
    .fn()
    .mockImplementation(async (_peer, pt) => `enc(${pt})`);
  mockSigner.nip44Decrypt = vi
    .fn()
    .mockImplementation(async (_peer, ct) =>
      ct.replace(/^enc\((.*)\)$/s, "$1"),
    );
  mockRuntime.querySync.mockResolvedValue([]);
  mockRuntime.fetchOne.mockResolvedValue(null);
  mockNip59.wrapEvent.mockImplementation(
    async (_rumor, recipient: string, kind: number) => ({
      id: `wrap-${recipient}`,
      kind,
      pubkey: "ephemeral",
      tags: [["p", recipient]],
      content: "wrapped",
      created_at: 1,
      sig: "s",
    }),
  );
});

const publishedOfKind = (kind: number) =>
  relayState.published.find((p) => p.event.kind === kind)?.event;

describe("relay helpers", () => {
  it("getRelays prefers user relays, falling back to defaults", () => {
    mockRelayStore.relays = ["wss://user.relay"];
    expect(getRelays()).toEqual(["wss://user.relay"]);
    mockRelayStore.relays = [];
    expect(getRelays()).toEqual(defaultRelays);
  });

  it("getPrivateRSVPPublishRelays uses the hint when given, else user relays", () => {
    expect(getPrivateRSVPPublishRelays("wss://hint.relay")).toEqual([
      "wss://hint.relay/",
    ]);
    mockRelayStore.relays = ["wss://user.relay"];
    expect(getPrivateRSVPPublishRelays()).toEqual(["wss://user.relay/"]);
  });

  it("getUserPublicKey returns the signer's pubkey", async () => {
    expect(await getUserPublicKey()).toBe(AUTHOR);
  });

  it("ensureRelay connects and honours a connection timeout", async () => {
    const relay = await ensureRelay("wss://relay.test", {
      connectionTimeout: 1234,
    });
    expect(relay.connectionTimeout).toBe(1234);
    expect(relayState.created).toContain("wss://relay.test");
  });
});

describe("publishToRelays", () => {
  it("publishes to every relay and reports per-relay success (waitForAll)", async () => {
    mockRelayStore.relays = ["wss://r1", "wss://r2"];
    const accepted: string[] = [];
    const completed: { url: string; ok: boolean }[] = [];
    const event = { kind: 1, id: "x" } as unknown as Event;

    await publishToRelays(event, (url) => accepted.push(url), undefined, {
      waitForAll: true,
      onRelayComplete: (url, ok) => completed.push({ url, ok }),
    });

    expect(accepted.sort()).toEqual(["wss://r1/", "wss://r2/"]);
    expect(completed).toHaveLength(2);
    expect(completed.every((c) => c.ok)).toBe(true);
  });

  it("returns results on partial success without throwing", async () => {
    relayState.behavior.set("wss://r2/", "reject");
    const completed: { url: string; ok: boolean }[] = [];
    const event = { kind: 1, id: "x" } as unknown as Event;

    const results = await publishToRelays(
      event,
      undefined,
      ["wss://r1", "wss://r2"],
      {
        waitForAll: true,
        onRelayComplete: (url, ok) => completed.push({ url, ok }),
      },
    );

    expect(Array.isArray(results)).toBe(true);
    expect(completed).toContainEqual({ url: "wss://r1/", ok: true });
    expect(completed).toContainEqual({ url: "wss://r2/", ok: false });
  });

  it("throws AggregateError when no relay accepts (waitForAll)", async () => {
    relayState.behavior.set("wss://r1/", "reject");
    const event = { kind: 1, id: "x" } as unknown as Event;
    await expect(
      publishToRelays(event, undefined, ["wss://r1"], { waitForAll: true }),
    ).rejects.toThrow(/No relays accepted/);
  });

  it("resolves with the first success when not waiting for all (Promise.any)", async () => {
    relayState.behavior.set("wss://r2/", "reject");
    const event = { kind: 1, id: "x" } as unknown as Event;
    await expect(
      publishToRelays(event, undefined, ["wss://r1", "wss://r2"]),
    ).resolves.toBeDefined();
  });

  it("times out a hanging relay after 5s", async () => {
    vi.useFakeTimers();
    try {
      relayState.behavior.set("wss://slow/", "hang");
      const event = { kind: 1, id: "x" } as unknown as Event;
      const p = publishToRelays(event, undefined, ["wss://slow"], {
        waitForAll: true,
      }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await p;
      expect(result).toBeInstanceOf(AggregateError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("republishEventToRelays re-sends to the given subset", async () => {
    const event = { kind: 1, id: "x" } as unknown as Event;
    await republishEventToRelays(event, ["wss://retry"]);
    expect(relayState.published.map((p) => p.url)).toContain("wss://retry/");
  });
});

describe("viewPrivateEvent", () => {
  it("decrypts a private event into parsed tags", () => {
    const viewSk = generateSecretKey();
    const tags = [
      ["title", "Secret"],
      ["d", "evt"],
    ];
    const content = nip44.encrypt(
      JSON.stringify(tags),
      nip44.getConversationKey(viewSk, getPublicKey(viewSk)),
    );
    const event = { content, id: "x", kind: 32678 } as unknown as Event;

    const decrypted = viewPrivateEvent(event, nip19.nsecEncode(viewSk));
    expect(decrypted?.tags).toEqual(tags);
  });

  it("returns null when decryption fails", () => {
    const wrongKey = nip19.nsecEncode(generateSecretKey());
    const event = {
      content: "garbage",
      id: "x",
      kind: 32678,
    } as unknown as Event;
    expect(viewPrivateEvent(event, wrongKey)).toBeNull();
  });
});

describe("encodeNAddr", () => {
  it("encodes an naddr with relay hints", () => {
    const naddr = encodeNAddr(
      { pubkey: AUTHOR, identifier: "evt", kind: 32678 },
      ["wss://relay.test"],
    );
    const decoded = nip19.decode(naddr);
    expect(decoded.type).toBe("naddr");
  });
});

describe("getDetailsFromGiftWrap", () => {
  it("extracts coordinate parts and viewKey from the rumor", async () => {
    mockNip59.unwrapEvent.mockResolvedValue({
      tags: [
        ["a", "32678:author-pk:dtag", "wss://hint"],
        ["viewKey", "nsec1key"],
      ],
      created_at: 42,
    });
    const details = await getDetailsFromGiftWrap({ id: "w" } as Event);
    expect(details).toMatchObject({
      eventId: "dtag",
      authorPubkey: "author-pk",
      kind: 32678,
      relayHint: "wss://hint",
      viewKey: "nsec1key",
      createdAt: 42,
    });
  });

  it("throws when the rumor has no 'a' tag", async () => {
    mockNip59.unwrapEvent.mockResolvedValue({ tags: [], created_at: 1 });
    await expect(getDetailsFromGiftWrap({ id: "w" } as Event)).rejects.toThrow(
      /a tag not found/,
    );
  });

  it("throws when the rumor has no viewKey", async () => {
    mockNip59.unwrapEvent.mockResolvedValue({
      tags: [["a", "32678:pk:dtag"]],
      created_at: 1,
    });
    await expect(getDetailsFromGiftWrap({ id: "w" } as Event)).rejects.toThrow(
      /viewKey not found/,
    );
  });
});

describe("subscriptions", () => {
  it("fetchCalendarGiftWraps subscribes to kind 1052 for the participant", () => {
    fetchCalendarGiftWraps({ participants: [AUTHOR] }, vi.fn(), vi.fn());
    const [, filters] = mockRuntime.subscribe.mock.calls[0];
    expect(filters[0]).toMatchObject({
      kinds: [EventKinds.CalendarEventGiftWrap],
      "#p": [AUTHOR],
    });
  });

  it("fetchCalendarGiftWraps forwards unwrapped details and swallows unwrap errors", async () => {
    const onEvent = vi.fn();
    fetchCalendarGiftWraps({ participants: [AUTHOR] }, onEvent, vi.fn());
    const handlers = mockRuntime.subscribe.mock.calls[0][2];

    mockNip59.unwrapEvent.mockResolvedValueOnce({
      tags: [
        ["a", "32678:pk:dtag", "wss://hint"],
        ["viewKey", "nsec1k"],
      ],
      created_at: 7,
    });
    await handlers.onEvent({ id: "wrap-1" });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "dtag",
        originalInvitationId: "wrap-1",
      }),
    );

    mockNip59.unwrapEvent.mockRejectedValueOnce(new Error("bad wrap"));
    await handlers.onEvent({ id: "wrap-2" });
    expect(onEvent).toHaveBeenCalledTimes(1); // error swallowed
  });

  it("fetchCalendarEvents subscribes to public kind 31923 and forwards events", () => {
    const onEvent = vi.fn();
    fetchCalendarEvents({ since: 100, until: 200 }, onEvent);
    const [, filters, opts] = mockRuntime.subscribe.mock.calls[0];
    expect(filters[0]).toMatchObject({
      kinds: [EventKinds.PublicCalendarEvent],
      since: 100,
      until: 200,
    });
    const evt = { id: "pub" } as Event;
    opts.onEvent(evt);
    expect(onEvent).toHaveBeenCalledWith(evt);
  });

  it("fetchPrivateCalendarEvents merges relay hints ahead of defaults and forwards events", () => {
    const onEvent = vi.fn();
    fetchPrivateCalendarEvents(
      {
        kinds: [32678],
        eventIds: ["d1"],
        authors: [AUTHOR],
        relays: ["wss://hint"],
      },
      onEvent,
    );
    const [relays, filters, opts] = mockRuntime.subscribe.mock.calls[0];
    expect(relays[0]).toBe("wss://hint");
    expect(filters[0]).toMatchObject({ kinds: [32678], "#d": ["d1"] });
    const evt = { id: "priv" } as Event;
    opts.onEvent(evt);
    expect(onEvent).toHaveBeenCalledWith(evt);
  });

  it("fetchPrivateCalendarEvents falls back to default relays when no hints given", () => {
    fetchPrivateCalendarEvents({ kinds: [32678], eventIds: ["d1"] }, vi.fn());
    const [relays] = mockRuntime.subscribe.mock.calls[0];
    expect(relays).toEqual(mockRelayStore.relays);
  });
});

describe("fetch helpers", () => {
  it("fetchCalendarEvent returns the event or throws EVENT_NOT_FOUND", async () => {
    const naddr = encodeNAddr({
      pubkey: AUTHOR,
      identifier: "evt",
      kind: 32678,
    });
    // fetchCalendarEvent first resolves the author's relay list (kind 10002),
    // then fetches the event (kind 32678) — discriminate by filter kind.
    mockRuntime.fetchOne.mockImplementation(async (_relays, filter) =>
      filter.kinds?.includes(32678)
        ? { id: "found", kind: 32678, tags: [] }
        : null,
    );
    const { event } = await fetchCalendarEvent(naddr);
    expect(event.id).toBe("found");

    mockRuntime.fetchOne.mockResolvedValue(null);
    await expect(fetchCalendarEvent(naddr)).rejects.toThrow("EVENT_NOT_FOUND");
  });

  it("fetchCalendarEvent tolerates a failing relay-list lookup", async () => {
    const naddr = encodeNAddr({
      pubkey: AUTHOR,
      identifier: "evt",
      kind: 32678,
    });
    mockRuntime.fetchOne.mockImplementation(async (_relays, filter) => {
      if (filter.kinds?.includes(EventKinds.RelayList)) {
        throw new Error("relay list down");
      }
      return { id: "found", kind: 32678, tags: [] };
    });
    const { event } = await fetchCalendarEvent(naddr);
    expect(event.id).toBe("found");
  });

  it("fetchUserProfile queries kind 0", async () => {
    mockRuntime.fetchOne.mockResolvedValueOnce({ id: "p", kind: 0 });
    await fetchUserProfile(AUTHOR);
    const [, filter] = mockRuntime.fetchOne.mock.calls[0];
    expect(filter).toMatchObject({ kinds: [0], authors: [AUTHOR] });
  });

  it("fetchRelayList maps r-tags, returning [] when none found", async () => {
    mockRuntime.fetchOne.mockResolvedValueOnce({
      tags: [
        ["r", "wss://a"],
        ["r", "wss://b"],
        ["x", "ignored"],
      ],
    });
    expect(await fetchRelayList(AUTHOR)).toEqual(["wss://a", "wss://b"]);

    mockRuntime.fetchOne.mockResolvedValueOnce(null);
    expect(await fetchRelayList(AUTHOR)).toEqual([]);
  });

  it("fetchRelayLists returns a pubkey->relays map and skips empties", async () => {
    mockRuntime.querySync.mockResolvedValueOnce([
      { pubkey: PARTICIPANT_A, tags: [["r", "wss://a"]] },
      { pubkey: PARTICIPANT_B, tags: [["x", "none"]] },
    ]);
    const map = await fetchRelayLists([PARTICIPANT_A, PARTICIPANT_B]);
    expect(map.get(PARTICIPANT_A)).toEqual(["wss://a"]);
    expect(map.has(PARTICIPANT_B)).toBe(false);

    expect((await fetchRelayLists([])).size).toBe(0);
  });

  it("getAllResponsesForForm queries kind 1069 by coordinate", async () => {
    mockRuntime.querySync.mockResolvedValueOnce([{ id: "resp" }]);
    const res = await getAllResponsesForForm("30168:pk:form");
    expect(res).toHaveLength(1);
    const [, filter] = mockRuntime.querySync.mock.calls[0];
    expect(filter).toMatchObject({ kinds: [EventKinds.FormResponse] });
  });

  it("fetchPrivateRSVPResponderPubkeys returns distinct responder pubkeys", async () => {
    mockRuntime.querySync.mockResolvedValueOnce([
      { pubkey: PARTICIPANT_A },
      { pubkey: PARTICIPANT_A },
      { pubkey: PARTICIPANT_B },
    ]);
    const responders =
      await fetchPrivateRSVPResponderPubkeys("32678:author:dtag");
    expect(responders.sort()).toEqual([PARTICIPANT_A, PARTICIPANT_B].sort());
  });

  it("fetchBusyListsForUser parses busy lists, skipping empty month sets", async () => {
    expect(await fetchBusyListsForUser(AUTHOR, [])).toEqual([]);
    mockRuntime.querySync.mockResolvedValueOnce([
      {
        pubkey: AUTHOR,
        kind: 31926,
        created_at: 1,
        id: "b",
        tags: [
          ["d", "2026-04"],
          ["block", "1000", "2000"],
        ],
      },
    ]);
    const lists = await fetchBusyListsForUser(AUTHOR, ["2026-04"]);
    expect(lists[0].monthKey).toBe("2026-04");
  });
});

describe("public publishing", () => {
  it("publishPublicCalendarEvent builds a kind 31923 event", async () => {
    const { signedEvent, id, pubKey } = await publishPublicCalendarEvent(
      makeEvent({ isPrivateEvent: false }),
    );
    expect(signedEvent.kind).toBe(EventKinds.PublicCalendarEvent);
    expect(pubKey).toBe(AUTHOR);
    expect(signedEvent.tags).toContainEqual(["name", "Lunch"]);
    expect(signedEvent.tags).toContainEqual(["d", id]);
    expect(signedEvent.tags).toContainEqual(["p", PARTICIPANT_A]);
    expect(signedEvent.content).toBe("desc");
  });

  it("publishPublicRSVPEvent publishes a kind 31925 with status + comment", async () => {
    await publishPublicRSVPEvent({
      authorPubKey: AUTHOR,
      eventId: "dtag",
      payload: { status: RSVPStatus.accepted, comment: "see you" },
    });
    const rsvp = publishedOfKind(EventKinds.PublicRSVPEvent)!;
    expect(rsvp.content).toBe("see you");
    expect(rsvp.tags).toContainEqual(["status", "accepted"]);
  });

  it("publishDeletionEvent emits kind 5 with e/a/k tags and stores it", async () => {
    const signed = await publishDeletionEvent({
      kinds: [32678],
      coordinates: ["32678:pk:dtag"],
      eventIds: ["evt-id"],
      reason: "cleanup",
    });
    expect(signed.kind).toBe(EventKinds.DeletionEvent);
    expect(signed.tags).toContainEqual(["e", "evt-id"]);
    expect(signed.tags).toContainEqual(["a", "32678:pk:dtag"]);
    expect(signed.tags).toContainEqual(["k", "32678"]);
    expect(mockRuntime.addEvent).toHaveBeenCalledWith(signed);
  });

  it("publishParticipantRemovalEvent emits kind 84", async () => {
    const signed = await publishParticipantRemovalEvent({
      kinds: [1052],
      eventIds: ["gw-id"],
    });
    expect(signed.kind).toBe(EventKinds.ParticipantRemoval);
    expect(signed.tags).toContainEqual(["e", "gw-id"]);
    expect(mockRuntime.addEvent).toHaveBeenCalledWith(signed);
  });

  it("publishRelayList emits kind 10002 with r-tags", async () => {
    await publishRelayList(["wss://a", "wss://b"]);
    const list = publishedOfKind(EventKinds.RelayList)!;
    expect(list.tags).toContainEqual(["r", "wss://a"]);
    expect(list.tags).toContainEqual(["r", "wss://b"]);
  });

  it("publishBusyList emits kind 31926 and stores it", async () => {
    await publishBusyList({
      user: AUTHOR,
      monthKey: "2026-04",
      ranges: [{ start: 1_000_000, end: 2_000_000 }],
      eventId: "",
      createdAt: 0,
    });
    const busy = publishedOfKind(EventKinds.PublicBusyList)!;
    expect(busy.tags).toContainEqual(["d", "2026-04"]);
    expect(mockRuntime.addEvent).toHaveBeenCalled();
  });
});

describe("private RSVP publishing", () => {
  it("encrypts the payload with the viewKey and publishes kind 32069", async () => {
    const viewKey = nip19.nsecEncode(generateSecretKey());
    await publishPrivateRSVPEvent({
      authorPubKey: AUTHOR,
      eventId: "dtag",
      referenceKind: EventKinds.PrivateCalendarEvent,
      viewKey,
      payload: { status: RSVPStatus.tentative },
    });
    const rsvp = publishedOfKind(EventKinds.PrivateRSVPEvent)!;
    const decrypted = decryptContent(rsvp.content, viewKey);
    expect(decrypted).toMatchObject({ status: "tentative" });
    expect(rsvp.tags.find((t) => t[0] === "a")?.[1]).toBe(
      "32678:" + AUTHOR + ":dtag",
    );
    expect(mockRuntime.addEvent).toHaveBeenCalled();
  });
});

describe("RSVP fetch + suggested times", () => {
  it("publishPublicRSVPEvent includes suggested start/end and relay hint", async () => {
    await publishPublicRSVPEvent({
      authorPubKey: AUTHOR,
      eventId: "dtag",
      relayHint: "wss://hint",
      payload: {
        status: RSVPStatus.tentative,
        suggestedStart: 111,
        suggestedEnd: 222,
        comment: "",
      },
    });
    const rsvp = publishedOfKind(EventKinds.PublicRSVPEvent)!;
    expect(rsvp.tags).toContainEqual([
      "a",
      "31923:" + AUTHOR + ":dtag",
      "wss://hint",
    ]);
    expect(rsvp.tags).toContainEqual(["start", "111"]);
    expect(rsvp.tags).toContainEqual(["end", "222"]);
  });

  it("fetchPrivateEventRSVPs decrypts matching RSVPs and ignores the rest", () => {
    const viewKey = nip19.nsecEncode(generateSecretKey());
    const coord = "32678:" + AUTHOR + ":dtag";
    const onRSVP = vi.fn();
    const handle = fetchPrivateEventRSVPs(
      { eventCoord: coord, viewKey },
      onRSVP,
    );
    const opts = mockRuntime.subscribe.mock.calls[0][2];

    const sk = nip19.decode(viewKey as `nsec1${string}`).data as Uint8Array;
    const ck = nip44.getConversationKey(sk, getPublicKey(sk));
    const rsvpEvent = (aCoord: string, payload: object) => ({
      content: nip44.encrypt(JSON.stringify(payload), ck),
      tags: [["a", aCoord]],
      pubkey: PARTICIPANT_A,
      created_at: 1,
      id: "r",
      kind: 32069,
    });

    opts.onEvent(rsvpEvent(coord, { status: "accepted" })); // matches
    expect(onRSVP).toHaveBeenCalledTimes(1);
    opts.onEvent(rsvpEvent(coord + "x", { status: "accepted" })); // wrong coord
    expect(onRSVP).toHaveBeenCalledTimes(1);
    opts.onEvent(rsvpEvent(coord, { status: "bogus" })); // invalid -> null
    expect(onRSVP).toHaveBeenCalledTimes(1);
    opts.onEvent({ content: "garbage", tags: [["a", coord]], pubkey: "x" }); // decrypt throws -> swallowed
    expect(onRSVP).toHaveBeenCalledTimes(1);

    // Exercise the returned close/unsubscribe handles.
    expect(() => {
      handle.close();
      handle.unsubscribe();
    }).not.toThrow();
  });

  it("fetchPublicEventRSVPs parses tag-based RSVPs and ignores tagless ones", () => {
    const coord = "31923:" + AUTHOR + ":dtag";
    const onRSVP = vi.fn();
    fetchPublicEventRSVPs({ eventCoord: coord }, onRSVP);
    const opts = mockRuntime.subscribe.mock.calls[0][2];

    opts.onEvent({
      pubkey: PARTICIPANT_A,
      created_at: 1,
      content: "hi",
      tags: [
        ["a", coord],
        ["status", "accepted"],
        ["start", "111"],
        ["end", "222"],
      ],
    });
    expect(onRSVP).toHaveBeenCalledTimes(1);

    opts.onEvent({
      pubkey: PARTICIPANT_A,
      created_at: 1,
      content: "",
      tags: [["status", "accepted"]], // no "a" tag -> ignored
    });
    expect(onRSVP).toHaveBeenCalledTimes(1);
  });
});

describe("publishPrivateCalendarEvent", () => {
  it("encrypts content, gift-wraps participants, and returns a ref + viewKey", async () => {
    const result = await publishPrivateCalendarEvent(makeEvent(), {});

    // Returned calendar event content decrypts with the returned viewKey.
    const tags = decryptContent(result.calendarEvent.content, result.viewKey);
    expect(tags).toContainEqual(["title", "Lunch"]);
    expect(tags).toContainEqual(["d", result.dTag]);
    expect(tags).toContainEqual(["p", AUTHOR]); // creator
    expect(tags).toContainEqual(["p", PARTICIPANT_A]);

    // A gift wrap was produced for the participant carrying the new viewKey.
    expect(mockNip59.wrapEvent).toHaveBeenCalledTimes(1);
    const [rumor, recipient, kind] = mockNip59.wrapEvent.mock.calls[0];
    expect(recipient).toBe(PARTICIPANT_A);
    expect(kind).toBe(EventKinds.CalendarEventGiftWrap);
    expect(rumor.tags).toContainEqual(["viewKey", result.viewKey]);
    expect(result.eventRef[0]).toBe(
      `${EventKinds.PrivateCalendarEvent}:${AUTHOR}:${result.dTag}`,
    );
  });

  it("reuses an existing d-tag and view key when supplied", async () => {
    const existingViewKey = nip19.nsecEncode(generateSecretKey());
    const result = await publishPrivateCalendarEvent(makeEvent(), {
      existingDTag: "fixed-dtag",
      existingViewKey,
    });
    expect(result.dTag).toBe("fixed-dtag");
    expect(result.viewKey).toBe(existingViewKey);
  });

  it("encodes recurring events with an rrule label", async () => {
    const result = await publishPrivateCalendarEvent(
      makeEvent({ repeat: { rrule: "FREQ=WEEKLY" } }),
      {},
    );
    const tags = decryptContent(result.calendarEvent.content, result.viewKey);
    expect(tags).toContainEqual(["L", "rrule"]);
    expect(tags).toContainEqual(["l", "FREQ=WEEKLY"]);
  });

  it("encodes notification preference and form attachments (with/without viewKey)", async () => {
    const result = await publishPrivateCalendarEvent(
      makeEvent({
        notificationPreference: "disabled",
        forms: [
          { naddr: "naddr1form", viewKey: "formkey" },
          { naddr: "naddr2form" },
        ],
      }),
      {},
    );
    const tags = decryptContent(result.calendarEvent.content, result.viewKey);
    expect(tags).toContainEqual(["notification", "disabled"]);
    expect(tags).toContainEqual(["form", "naddr1form", "formkey"]);
    expect(tags).toContainEqual(["form", "naddr2form"]);
  });

  it("passes invitation gift-wrap tags through to each wrap", async () => {
    await publishPrivateCalendarEvent(makeEvent(), {
      invitationGiftWrapTags: [["booking", "true"]],
    });
    expect(mockNip59.wrapEvent.mock.calls[0][3]).toEqual([["booking", "true"]]);
  });
});

describe("editPrivateCalendarEvent", () => {
  it("reuses the key and gift-wraps only newly-added participants", async () => {
    const viewKey = nip19.nsecEncode(generateSecretKey());
    const event = makeEvent({
      viewKey,
      participants: [PARTICIPANT_A, PARTICIPANT_B],
    });

    const result = await editPrivateCalendarEvent(event, "cal-1", [
      PARTICIPANT_A,
    ]);

    // Same key reused (no rotation).
    expect(result.event.viewKey).toBe(viewKey);
    // Only the new participant (B) is gift-wrapped.
    expect(mockNip59.wrapEvent).toHaveBeenCalledTimes(1);
    expect(mockNip59.wrapEvent.mock.calls[0][1]).toBe(PARTICIPANT_B);
    expect(mockCalendarLists.moveEventToCalendar).toHaveBeenCalled();
    expect(mockCalendarLists.updateEventRefViewKey).not.toHaveBeenCalled();
  });

  it("rotates the key when a participant is removed and re-keys the rest", async () => {
    const viewKey = nip19.nsecEncode(generateSecretKey());
    const event = makeEvent({ viewKey, participants: [PARTICIPANT_B] });
    // A RSVP responder (link invitee) who should keep access.
    const responder = "c".repeat(64);
    mockRuntime.querySync.mockResolvedValueOnce([{ pubkey: responder }]);

    const result = await editPrivateCalendarEvent(event, "cal-1", [
      PARTICIPANT_A, // removed (was a participant before, not now)
      PARTICIPANT_B,
    ]);

    // New key minted.
    expect(result.event.viewKey).not.toBe(viewKey);
    // Gift wraps went to remaining participant + responder, never the removed A.
    const recipients = mockNip59.wrapEvent.mock.calls.map((c) => c[1]);
    expect(recipients).toContain(PARTICIPANT_B);
    expect(recipients).toContain(responder);
    expect(recipients).not.toContain(PARTICIPANT_A);
    // Author's own ref view key was updated in place.
    expect(mockCalendarLists.updateEventRefViewKey).toHaveBeenCalled();
  });
});

describe("rotatePrivateEventKey", () => {
  it("re-encrypts under a fresh key, gift-wraps recipients, updates own ref", async () => {
    const event = makeEvent({
      viewKey: nip19.nsecEncode(generateSecretKey()),
    });
    const result = await rotatePrivateEventKey(event, "cal-1", [
      PARTICIPANT_A,
      AUTHOR, // self must be excluded from gift wraps
    ]);

    expect(result.viewKey).not.toBe(event.viewKey);
    const recipients = mockNip59.wrapEvent.mock.calls.map((c) => c[1]);
    expect(recipients).toEqual([PARTICIPANT_A]); // self excluded
    expect(mockCalendarLists.updateEventRefViewKey).toHaveBeenCalledWith(
      "cal-1",
      `${EventKinds.PrivateCalendarEvent}:${AUTHOR}:${event.id}`,
      result.viewKey,
      expect.anything(),
    );
    // Re-encrypted content is decryptable with the new key.
    const tags = decryptContent(result.signedEvent.content, result.viewKey);
    expect(tags).toContainEqual(["title", "Lunch"]);
  });

  it("skips gift wraps when there are no recipients", async () => {
    const event = makeEvent();
    await rotatePrivateEventKey(event, "cal-1", []);
    expect(mockNip59.wrapEvent).not.toHaveBeenCalled();
    expect(mockCalendarLists.updateEventRefViewKey).toHaveBeenCalled();
  });
});

describe("scheduling page keys", () => {
  it("publishSchedulingPageKey self-encrypts the viewKey payload (kind 32680)", async () => {
    await publishSchedulingPageKey({
      dTag: "page-1",
      viewKeyNsec: "nsec1page",
    });
    const ev = publishedOfKind(EventKinds.SchedulingPagesList)!;
    expect(ev.tags).toContainEqual(["d", "page-1"]);
    expect(mockSigner.nip44Encrypt).toHaveBeenCalled();
    expect(mockRuntime.addEvent).toHaveBeenCalled();
  });

  it("publishSchedulingPageKey throws without a NIP-44 signer", async () => {
    mockSigner.nip44Encrypt = undefined as never;
    await expect(
      publishSchedulingPageKey({ dTag: "p", viewKeyNsec: "nsec1" }),
    ).rejects.toThrow(/NIP-44-capable signer/);
  });

  it("publishEmptySchedulingPageKey writes a tombstone (empty content)", async () => {
    await publishEmptySchedulingPageKey("page-1");
    const ev = publishedOfKind(EventKinds.SchedulingPagesList)!;
    expect(ev.content).toBe("");
  });

  it("fetchOwnSchedulingPageKeys decrypts entries, skipping tombstones and bad payloads", async () => {
    const goodPayload = JSON.stringify({
      v: 1,
      viewKey: "nsec1good",
      dTag: "page-good",
      createdAt: 1,
    });
    mockRuntime.querySync.mockResolvedValueOnce([
      { tags: [["d", "page-good"]], content: `enc(${goodPayload})` },
      { tags: [["d", "page-tomb"]], content: "" }, // tombstone -> skipped
      { tags: [["d", "page-bad"]], content: "enc(not-json)" }, // throws -> skipped
      { tags: [], content: "enc({})" }, // no d-tag -> skipped
    ]);

    const map = await fetchOwnSchedulingPageKeys();
    expect(map.get("page-good")).toBe("nsec1good");
    expect(map.has("page-tomb")).toBe(false);
    expect(map.has("page-bad")).toBe(false);
  });

  it("fetchOwnSchedulingPageKeys returns empty when the signer cannot decrypt", async () => {
    mockSigner.nip44Decrypt = undefined as never;
    mockRuntime.querySync.mockResolvedValueOnce([
      { tags: [["d", "x"]], content: "enc(stuff)" },
    ]);
    expect((await fetchOwnSchedulingPageKeys()).size).toBe(0);
  });
});
