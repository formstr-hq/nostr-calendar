import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock heavy deps before importing fetchUserFormResponse — nostr.ts imports
// many runtime modules we don't want to execute in this test.
const { mockQuerySync, mockRelayStore } = vi.hoisted(() => ({
  mockQuerySync: vi.fn(),
  mockRelayStore: { relays: [] as string[] },
}));
vi.mock("./nostrRuntime", () => ({
  nostrRuntime: {
    querySync: mockQuerySync,
    subscribe: vi.fn(),
    fetchOne: vi.fn(),
    addEvent: vi.fn(),
  },
}));
vi.mock("./signer", () => ({
  signerManager: {
    getSigner: vi.fn(),
    getSignerRelays: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../stores/relays", () => ({
  useRelayStore: { getState: () => mockRelayStore },
}));
vi.mock("../stores/calendarLists", () => ({ useCalendarLists: {} }));
vi.mock("../stores/eventDetails", () => ({ TEMP_CALENDAR_ID: "tmp" }));
vi.mock("../stores/events", () => ({}));

import { fetchUserFormResponse } from "./nostr";

const COORD = "30168:abcd:demo";
const USER = "e".repeat(64);

const make = (id: string, ts: number) => ({
  id,
  pubkey: USER,
  kind: 1069,
  created_at: ts,
  tags: [["a", COORD]],
  content: "",
  sig: "",
});

describe("fetchUserFormResponse", () => {
  beforeEach(() => {
    mockQuerySync.mockReset();
    mockRelayStore.relays = [];
  });

  it("returns null when relays return no events", async () => {
    mockQuerySync.mockResolvedValue([]);
    const result = await fetchUserFormResponse(COORD, USER);
    expect(result).toBeNull();
  });

  it("returns the latest response by created_at", async () => {
    const older = make("a", 100);
    const newer = make("b", 200);
    mockQuerySync.mockResolvedValue([older, newer]);
    const result = await fetchUserFormResponse(COORD, USER);
    expect(result?.id).toBe("b");
  });

  it("queries with correct filter (kind/authors/#a)", async () => {
    mockQuerySync.mockResolvedValue([]);
    await fetchUserFormResponse(COORD, USER, ["wss://relay.x"]);
    const [, filter] = mockQuerySync.mock.calls[0];
    expect(filter).toMatchObject({
      kinds: [1069],
      authors: [USER],
      "#a": [COORD],
    });
  });

  it("merges defaultRelays with extraRelays without duplicates", async () => {
    mockQuerySync.mockResolvedValue([]);
    await fetchUserFormResponse(COORD, USER, [
      "wss://relay.damus.io", // also in defaults
      "wss://relay.x",
    ]);
    const [relays] = mockQuerySync.mock.calls[0];
    const xCount = (relays as string[]).filter(
      (r) => r === "wss://relay.damus.io/",
    ).length;
    expect(xCount).toBe(1);
    expect(relays).toContain("wss://relay.x/");
  });

  it("includes user-configured relays for discovery", async () => {
    mockRelayStore.relays = ["wss://relay.user"];
    mockQuerySync.mockResolvedValue([]);
    await fetchUserFormResponse(COORD, USER, ["wss://relay.form"]);
    const [relays] = mockQuerySync.mock.calls[0];
    expect(relays).toContain("wss://relay.form/");
    expect(relays).toContain("wss://relay.user/");
  });
});
