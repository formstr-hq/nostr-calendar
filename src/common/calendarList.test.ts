import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  encryptCalendarList,
  decryptCalendarList,
  addEventToCalendarList,
  removeEventFromCalendarList,
} from "./calendarList";
import type { ICalendarList } from "../utils/calendarListTypes";
import { Event } from "nostr-tools";

// vi.hoisted runs before vi.mock hoisting, making these available to factory fns
const { mockEncrypt, mockDecrypt, mockSignEvent } = vi.hoisted(() => ({
  mockEncrypt: vi.fn().mockResolvedValue("encrypted-content"),
  mockDecrypt: vi.fn().mockResolvedValue(
    JSON.stringify([
      ["title", "Test Calendar"],
      ["content", "A test calendar"],
      ["color", "#d50000"],
      ["notifications", "disabled"],
      [
        "a",
        "32678:testpubkey:event-1",
        "",
        "nsec1key1:1700000000::1700003600:false",
      ],
      [
        "a",
        "32679:testpubkey:event-2",
        "",
        "nsec1key2:1700100000::1700103600:true",
      ],
    ]),
  ),
  mockSignEvent: vi.fn().mockImplementation((e: any) => ({ ...e, sig: "sig" })),
}));

vi.mock("./signer", () => ({
  signerManager: {
    getSigner: vi.fn().mockResolvedValue({
      nip44Encrypt: mockEncrypt,
      nip44Decrypt: mockDecrypt,
      signEvent: mockSignEvent,
    }),
  },
}));

vi.mock("./nostr", () => ({
  getUserPublicKey: vi.fn().mockResolvedValue("test-pubkey-" + "0".repeat(50)),
  getRelays: vi.fn().mockReturnValue(["wss://relay.test"]),
  publishToRelays: vi.fn().mockResolvedValue("ok"),
}));

vi.mock("./nostrRuntime", () => ({
  nostrRuntime: {
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    addEvent: vi.fn(),
  },
}));

// Mock getEventHash since signEvent mock doesn't produce a valid event
vi.mock("nostr-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nostr-tools")>();
  return {
    ...actual,
    getEventHash: vi.fn().mockReturnValue("mocked-event-hash"),
  };
});

const makeCalendar = (overrides?: Partial<ICalendarList>): ICalendarList => ({
  id: "cal-uuid-1",
  eventId: "abc123",
  title: "My Calendar",
  description: "Personal events",
  color: "#4285f4",
  eventRefs: [
    ["32678:testpubkey:event-1", "", "nsec1key:1700000000::1700003600:false"],
  ],
  createdAt: 1700000000,
  isVisible: true,
  ...overrides,
});

describe("calendarList protocol layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("encryptCalendarList", () => {
    it("encrypts calendar content as JSON tags array", async () => {
      const cal = makeCalendar();
      await encryptCalendarList(cal);

      expect(mockEncrypt).toHaveBeenCalledOnce();
      const encryptedPayload = mockEncrypt.mock.calls[0][1];
      const tags = JSON.parse(encryptedPayload);

      expect(tags).toContainEqual(["title", "My Calendar"]);
      expect(tags).toContainEqual(["content", "Personal events"]);
      expect(tags).toContainEqual(["color", "#4285f4"]);
      expect(tags).not.toContainEqual(["notifications", "enabled"]);
      expect(tags).toContainEqual([
        "a",
        "32678:testpubkey:event-1",
        "",
        "nsec1key:1700000000::1700003600:false",
      ]);
    });

    it("encrypts with the user's own pubkey (self-encryption)", async () => {
      const cal = makeCalendar();
      await encryptCalendarList(cal);

      // First arg to nip44Encrypt should be the user's own pubkey
      expect(mockEncrypt.mock.calls[0][0]).toBe(
        "test-pubkey-" + "0".repeat(50),
      );
    });

    it("includes all event refs as 'a' tags", async () => {
      const cal = makeCalendar({
        eventRefs: [
          ["32678:pub1:e1", "", "nsec1a:1700000000::1700003600:false"],
          ["32679:pub2:e2", "", "nsec1b:1700100000::1700103600:true"],
          ["32678:pub3:e3", "", "nsec1c:1700200000::1700203600:false"],
        ],
      });
      await encryptCalendarList(cal);

      const tags = JSON.parse(mockEncrypt.mock.calls[0][1]);
      const aTags = tags.filter((t: string[]) => t[0] === "a");
      expect(aTags).toHaveLength(3);
    });

    it("stores notification preference only when non-default", async () => {
      const cal = makeCalendar({ notificationPreference: "disabled" });
      await encryptCalendarList(cal);

      const tags = JSON.parse(mockEncrypt.mock.calls[0][1]);
      expect(tags).toContainEqual(["notifications", "disabled"]);
    });

    it("handles empty eventRefs", async () => {
      const cal = makeCalendar({ eventRefs: [] });
      await encryptCalendarList(cal);

      const tags = JSON.parse(mockEncrypt.mock.calls[0][1]);
      const aTags = tags.filter((t: string[]) => t[0] === "a");
      expect(aTags).toHaveLength(0);
    });
  });

  describe("decryptCalendarList", () => {
    it("decrypts a kind 32123 event into an ICalendarList", async () => {
      const event: Event = {
        id: "event-id",
        pubkey: "test-pubkey",
        created_at: 1700000000,
        kind: 32123,
        content: "encrypted-blob",
        tags: [["d", "cal-uuid-1"]],
        sig: "sig",
      };

      const result = await decryptCalendarList(event);

      expect(result.id).toBe("cal-uuid-1");
      expect(result.title).toBe("Test Calendar");
      expect(result.description).toBe("A test calendar");
      expect(result.color).toBe("#d50000");
      expect(result.notificationPreference).toBe("disabled");
      expect(result.eventRefs).toEqual([
        [
          "32678:testpubkey:event-1",
          "",
          "nsec1key1:1700000000::1700003600:false",
        ],
        [
          "32679:testpubkey:event-2",
          "",
          "nsec1key2:1700100000::1700103600:true",
        ],
      ]);
      expect(result.createdAt).toBe(1700000000);
      expect(result.isVisible).toBe(true);
    });

    it("uses default values for missing optional fields", async () => {
      mockDecrypt.mockResolvedValueOnce(JSON.stringify([["title", "Minimal"]]));

      const event: Event = {
        id: "event-id",
        pubkey: "test-pubkey",
        created_at: 1700000000,
        kind: 32123,
        content: "encrypted",
        tags: [["d", "min-cal"]],
        sig: "sig",
      };

      const result = await decryptCalendarList(event);
      expect(result.title).toBe("Minimal");
      expect(result.description).toBe("");
      expect(result.color).toBe("#4285f4"); // default color
      expect(result.notificationPreference).toBeUndefined();
      expect(result.eventRefs).toEqual([]);
    });

    it("extracts the d-tag as the calendar ID", async () => {
      const event: Event = {
        id: "event-id",
        pubkey: "test-pubkey",
        created_at: 1700000000,
        kind: 32123,
        content: "encrypted",
        tags: [["d", "unique-d-tag"]],
        sig: "sig",
      };

      const result = await decryptCalendarList(event);
      expect(result.id).toBe("unique-d-tag");
    });
  });

  describe("addEventToCalendarList", () => {
    it("adds a new event ref to the calendar", async () => {
      const cal = makeCalendar({ eventRefs: [] });
      const newRef = [
        "32678:testpubkey:new-event",
        "",
        "nsec1new:1700000000::1700003600:false",
      ];

      const result = await addEventToCalendarList(cal, newRef);

      expect(result.eventRefs).toContainEqual(newRef);
      expect(result.eventRefs).toHaveLength(1);
    });

    it("does not add duplicate refs (matched by coordinate)", async () => {
      const existingRef = [
        "32678:testpubkey:event-1",
        "",
        "nsec1key:1700000000::1700003600:false",
      ];
      const cal = makeCalendar({ eventRefs: [existingRef] });

      const result = await addEventToCalendarList(cal, existingRef);

      expect(result.eventRefs).toHaveLength(1);
    });

    it("updates createdAt timestamp when adding a ref", async () => {
      const cal = makeCalendar({ createdAt: 1000 });
      const ref = [
        "32678:testpubkey:new-event",
        "",
        "nsec1new:1700000000::1700003600:false",
      ];

      const result = await addEventToCalendarList(cal, ref);

      expect(result.createdAt).toBeGreaterThan(1000);
    });
  });

  describe("removeEventFromCalendarList", () => {
    it("removes an event ref from the calendar", async () => {
      const ref = [
        "32678:testpubkey:event-1",
        "",
        "nsec1key:1700000000::1700003600:false",
      ];
      const cal = makeCalendar({ eventRefs: [ref] });

      const result = await removeEventFromCalendarList(cal, ref);

      expect(result.eventRefs).toHaveLength(0);
    });

    it("does nothing when removing a non-existent ref", async () => {
      const cal = makeCalendar({
        eventRefs: [
          [
            "32678:testpubkey:event-1",
            "",
            "nsec1key:1700000000::1700003600:false",
          ],
        ],
      });

      const result = await removeEventFromCalendarList(cal, [
        "32678:testpubkey:nonexistent",
        "",
        "nsec1:1700000000::1700003600:false",
      ]);

      expect(result.eventRefs).toHaveLength(1);
    });
  });
});
