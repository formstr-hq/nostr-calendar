import { describe, it, expect } from "vitest";
import {
  isReplaceableEvent,
  isEphemeralEvent,
  getReplaceableKey,
  shouldReplaceEvent,
  isValidEventStructure,
} from "./eventValidation";
import { Event } from "nostr-tools";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 1000000,
    kind: 1,
    tags: [],
    content: "test content",
    sig: "c".repeat(128),
    ...overrides,
  };
}

// ─── isReplaceableEvent ──────────────────────────────────────────

describe("isReplaceableEvent", () => {
  it("returns true for kind 0 (metadata)", () => {
    expect(isReplaceableEvent(0)).toBe(true);
  });

  it("returns true for kind 3 (contacts)", () => {
    expect(isReplaceableEvent(3)).toBe(true);
  });

  it("returns true for kinds 10000-19999", () => {
    expect(isReplaceableEvent(10000)).toBe(true);
    expect(isReplaceableEvent(10002)).toBe(true);
    expect(isReplaceableEvent(19999)).toBe(true);
  });

  it("returns true for kinds 30000-39999 (parameterized replaceable)", () => {
    expect(isReplaceableEvent(30000)).toBe(true);
    expect(isReplaceableEvent(31923)).toBe(true);
    expect(isReplaceableEvent(39999)).toBe(true);
  });

  it("returns false for kind 1 (short text note)", () => {
    expect(isReplaceableEvent(1)).toBe(false);
  });

  it("returns false for kind 4 (encrypted DM)", () => {
    expect(isReplaceableEvent(4)).toBe(false);
  });

  it("returns false for kind 20000 (start of ephemeral range)", () => {
    expect(isReplaceableEvent(20000)).toBe(false);
  });

  it("returns false for regular event kinds", () => {
    expect(isReplaceableEvent(7)).toBe(false);
    expect(isReplaceableEvent(1000)).toBe(false);
    expect(isReplaceableEvent(9999)).toBe(false);
    expect(isReplaceableEvent(40000)).toBe(false);
  });
});

// ─── isEphemeralEvent ────────────────────────────────────────────

describe("isEphemeralEvent", () => {
  it("returns true for kinds 20000-29999", () => {
    expect(isEphemeralEvent(20000)).toBe(true);
    expect(isEphemeralEvent(25000)).toBe(true);
    expect(isEphemeralEvent(29999)).toBe(true);
  });

  it("returns false for kinds outside ephemeral range", () => {
    expect(isEphemeralEvent(0)).toBe(false);
    expect(isEphemeralEvent(1)).toBe(false);
    expect(isEphemeralEvent(19999)).toBe(false);
    expect(isEphemeralEvent(30000)).toBe(false);
  });
});

// ─── getReplaceableKey ───────────────────────────────────────────

describe("getReplaceableKey", () => {
  it("returns kind:pubkey for regular replaceable events", () => {
    const event = makeEvent({ kind: 0, pubkey: "abc" });
    expect(getReplaceableKey(event)).toBe("0:abc");
  });

  it("returns kind:pubkey:d for parameterized replaceable events", () => {
    const event = makeEvent({
      kind: 30023,
      pubkey: "abc",
      tags: [["d", "my-article"]],
    });
    expect(getReplaceableKey(event)).toBe("30023:abc:my-article");
  });

  it("uses empty string for d tag value when d tag has no value", () => {
    const event = makeEvent({
      kind: 30023,
      pubkey: "abc",
      tags: [["d"]],
    });
    expect(getReplaceableKey(event)).toBe("30023:abc:");
  });

  it("uses empty string when d tag is missing entirely", () => {
    const event = makeEvent({
      kind: 30023,
      pubkey: "abc",
      tags: [],
    });
    expect(getReplaceableKey(event)).toBe("30023:abc:");
  });

  it("handles kind 10002 (relay list) as regular replaceable", () => {
    const event = makeEvent({ kind: 10002, pubkey: "abc" });
    expect(getReplaceableKey(event)).toBe("10002:abc");
  });
});

// ─── shouldReplaceEvent ──────────────────────────────────────────

describe("shouldReplaceEvent", () => {
  it("returns true when eventA is newer", () => {
    const a = makeEvent({ created_at: 2000 });
    const b = makeEvent({ created_at: 1000 });
    expect(shouldReplaceEvent(a, b)).toBe(true);
  });

  it("returns false when eventA is older", () => {
    const a = makeEvent({ created_at: 1000 });
    const b = makeEvent({ created_at: 2000 });
    expect(shouldReplaceEvent(a, b)).toBe(false);
  });

  it("uses lexicographic ID comparison as tiebreaker when timestamps are equal", () => {
    const a = makeEvent({ created_at: 1000, id: "b".repeat(64) });
    const b = makeEvent({ created_at: 1000, id: "a".repeat(64) });
    expect(shouldReplaceEvent(a, b)).toBe(true);
    expect(shouldReplaceEvent(b, a)).toBe(false);
  });

  it("returns false when both events are identical", () => {
    const a = makeEvent({ created_at: 1000, id: "a".repeat(64) });
    const b = makeEvent({ created_at: 1000, id: "a".repeat(64) });
    expect(shouldReplaceEvent(a, b)).toBe(false);
  });
});

// ─── isValidEventStructure ───────────────────────────────────────

describe("isValidEventStructure", () => {
  it("returns true for a valid event", () => {
    const event = makeEvent();
    expect(isValidEventStructure(event)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidEventStructure(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidEventStructure(undefined)).toBe(false);
  });

  it("returns false for a non-object", () => {
    expect(isValidEventStructure("string")).toBe(false);
    expect(isValidEventStructure(42)).toBe(false);
  });

  it("returns false when id is missing", () => {
    const event = makeEvent();
    delete (event as any).id;
    expect(isValidEventStructure(event)).toBe(false);
  });

  it("returns false when id is not a string", () => {
    expect(isValidEventStructure({ ...makeEvent(), id: 123 })).toBe(false);
  });

  it("returns false when pubkey is missing", () => {
    const event = makeEvent();
    delete (event as any).pubkey;
    expect(isValidEventStructure(event)).toBe(false);
  });

  it("returns false when created_at is not a number", () => {
    expect(isValidEventStructure({ ...makeEvent(), created_at: "1000" })).toBe(
      false,
    );
  });

  it("returns false when kind is not a number", () => {
    expect(isValidEventStructure({ ...makeEvent(), kind: "1" })).toBe(false);
  });

  it("returns false when tags is not an array", () => {
    expect(isValidEventStructure({ ...makeEvent(), tags: "[]" })).toBe(false);
  });

  it("returns false when content is not a string", () => {
    expect(isValidEventStructure({ ...makeEvent(), content: 123 })).toBe(false);
  });

  it("returns false when sig is not a string", () => {
    expect(isValidEventStructure({ ...makeEvent(), sig: 123 })).toBe(false);
  });
});
