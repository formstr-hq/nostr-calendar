import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventStore } from "./EventStore";
import { Event } from "nostr-tools";

let idCounter = 0;

function makeEvent(overrides: Partial<Event> = {}): Event {
  idCounter++;
  return {
    id: `event-${idCounter}-${"a".repeat(50)}`,
    pubkey: "author1" + "0".repeat(57),
    created_at: 1000000 + idCounter,
    kind: 1,
    tags: [],
    content: `test content ${idCounter}`,
    sig: "s".repeat(128),
    ...overrides,
  };
}

let store: EventStore;

beforeEach(() => {
  store = new EventStore();
  idCounter = 0;
});

// ─── addEvent ────────────────────────────────────────────────────

describe("EventStore.addEvent", () => {
  it("adds a valid event and returns true", () => {
    const event = makeEvent();
    expect(store.addEvent(event)).toBe(true);
  });

  it("rejects duplicate events (same id)", () => {
    const event = makeEvent();
    store.addEvent(event);
    expect(store.addEvent(event)).toBe(false);
  });

  it("rejects events with invalid structure", () => {
    const invalid = { id: 123 } as any;
    expect(store.addEvent(invalid)).toBe(false);
  });

  it("does not store ephemeral events (kind 20000-29999)", () => {
    const event = makeEvent({ kind: 20001 });
    const result = store.addEvent(event);
    expect(result).toBe(false);
    expect(store.getById(event.id)).toBeUndefined();
  });

  it("notifies listeners for ephemeral events even though not stored", () => {
    const callback = vi.fn();
    store.subscribe({ kinds: [20001] }, callback);

    const event = makeEvent({ kind: 20001 });
    store.addEvent(event);

    expect(callback).toHaveBeenCalledWith(event);
  });

  it("handles replaceable events — keeps the newer one", () => {
    const pubkey = "x".repeat(64);
    const older = makeEvent({ kind: 0, pubkey, created_at: 1000 });
    const newer = makeEvent({ kind: 0, pubkey, created_at: 2000 });

    store.addEvent(older);
    store.addEvent(newer);

    expect(store.getById(older.id)).toBeUndefined();
    expect(store.getById(newer.id)).toBeDefined();
  });

  it("handles replaceable events — rejects older replacement", () => {
    const pubkey = "x".repeat(64);
    const newer = makeEvent({ kind: 0, pubkey, created_at: 2000 });
    const older = makeEvent({ kind: 0, pubkey, created_at: 1000 });

    store.addEvent(newer);
    const result = store.addEvent(older);
    expect(result).toBe(false);
    expect(store.getById(newer.id)).toBeDefined();
  });

  it("handles parameterized replaceable events with d tag", () => {
    const pubkey = "x".repeat(64);
    const event1 = makeEvent({
      kind: 30023,
      pubkey,
      created_at: 1000,
      tags: [["d", "slug"]],
    });
    const event2 = makeEvent({
      kind: 30023,
      pubkey,
      created_at: 2000,
      tags: [["d", "slug"]],
    });

    store.addEvent(event1);
    store.addEvent(event2);

    expect(store.getById(event1.id)).toBeUndefined();
    expect(store.getById(event2.id)).toBeDefined();
  });

  it("keeps different d-tag values as separate events", () => {
    const pubkey = "x".repeat(64);
    const event1 = makeEvent({
      kind: 30023,
      pubkey,
      created_at: 1000,
      tags: [["d", "article-a"]],
    });
    const event2 = makeEvent({
      kind: 30023,
      pubkey,
      created_at: 2000,
      tags: [["d", "article-b"]],
    });

    store.addEvent(event1);
    store.addEvent(event2);

    expect(store.getById(event1.id)).toBeDefined();
    expect(store.getById(event2.id)).toBeDefined();
  });
});

// ─── getById ─────────────────────────────────────────────────────

describe("EventStore.getById", () => {
  it("returns the event when found", () => {
    const event = makeEvent();
    store.addEvent(event);
    expect(store.getById(event.id)).toBe(event);
  });

  it("returns undefined when not found", () => {
    expect(store.getById("nonexistent")).toBeUndefined();
  });
});

// ─── query ───────────────────────────────────────────────────────

describe("EventStore.query", () => {
  it("returns all events when filter is empty", () => {
    const e1 = makeEvent();
    const e2 = makeEvent();
    store.addEvent(e1);
    store.addEvent(e2);

    const results = store.query({});
    expect(results).toHaveLength(2);
  });

  it("filters by ids", () => {
    const e1 = makeEvent();
    const e2 = makeEvent();
    store.addEvent(e1);
    store.addEvent(e2);

    const results = store.query({ ids: [e1.id] });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(e1.id);
  });

  it("filters by authors", () => {
    const e1 = makeEvent({ pubkey: "author-a" + "0".repeat(56) });
    const e2 = makeEvent({ pubkey: "author-b" + "0".repeat(56) });
    store.addEvent(e1);
    store.addEvent(e2);

    const results = store.query({ authors: [e1.pubkey] });
    expect(results).toHaveLength(1);
    expect(results[0].pubkey).toBe(e1.pubkey);
  });

  it("filters by kinds", () => {
    const e1 = makeEvent({ kind: 1 });
    const e2 = makeEvent({ kind: 7 });
    const e3 = makeEvent({ kind: 1 });
    store.addEvent(e1);
    store.addEvent(e2);
    store.addEvent(e3);

    const results = store.query({ kinds: [1] });
    expect(results).toHaveLength(2);
    results.forEach((e) => expect(e.kind).toBe(1));
  });

  it("filters by since", () => {
    const e1 = makeEvent({ created_at: 1000 });
    const e2 = makeEvent({ created_at: 2000 });
    store.addEvent(e1);
    store.addEvent(e2);

    const results = store.query({ since: 1500 });
    expect(results).toHaveLength(1);
    expect(results[0].created_at).toBe(2000);
  });

  it("filters by until", () => {
    const e1 = makeEvent({ created_at: 1000 });
    const e2 = makeEvent({ created_at: 2000 });
    store.addEvent(e1);
    store.addEvent(e2);

    const results = store.query({ until: 1500 });
    expect(results).toHaveLength(1);
    expect(results[0].created_at).toBe(1000);
  });

  it("filters by tag (#e)", () => {
    const e1 = makeEvent({ tags: [["e", "ref-1"]] });
    const e2 = makeEvent({ tags: [["e", "ref-2"]] });
    store.addEvent(e1);
    store.addEvent(e2);

    const results = store.query({ "#e": ["ref-1"] } as any);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(e1.id);
  });

  it("filters by tag (#p)", () => {
    const e1 = makeEvent({ tags: [["p", "user-1"]] });
    const e2 = makeEvent({ tags: [["p", "user-2"]] });
    store.addEvent(e1);
    store.addEvent(e2);

    const results = store.query({ "#p": ["user-1"] } as any);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(e1.id);
  });

  it("sorts results by created_at descending (newest first)", () => {
    const e1 = makeEvent({ created_at: 1000 });
    const e2 = makeEvent({ created_at: 3000 });
    const e3 = makeEvent({ created_at: 2000 });
    store.addEvent(e1);
    store.addEvent(e2);
    store.addEvent(e3);

    const results = store.query({});
    expect(results[0].created_at).toBe(3000);
    expect(results[1].created_at).toBe(2000);
    expect(results[2].created_at).toBe(1000);
  });

  it("applies limit", () => {
    for (let i = 0; i < 5; i++) {
      store.addEvent(makeEvent());
    }

    const results = store.query({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("returns empty array when no events match", () => {
    store.addEvent(makeEvent({ kind: 1 }));
    const results = store.query({ kinds: [99] });
    expect(results).toEqual([]);
  });
});

// ─── subscribe ───────────────────────────────────────────────────

describe("EventStore.subscribe", () => {
  it("calls callback immediately for existing matching events", () => {
    const event = makeEvent({ kind: 1 });
    store.addEvent(event);

    const callback = vi.fn();
    store.subscribe({ kinds: [1] }, callback);

    expect(callback).toHaveBeenCalledWith(event);
  });

  it("calls callback when new matching events are added", () => {
    const callback = vi.fn();
    store.subscribe({ kinds: [1] }, callback);

    const event = makeEvent({ kind: 1 });
    store.addEvent(event);

    expect(callback).toHaveBeenCalledWith(event);
  });

  it("does not call callback for non-matching events", () => {
    const callback = vi.fn();
    store.subscribe({ kinds: [7] }, callback);

    const event = makeEvent({ kind: 1 });
    store.addEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it("returns unsubscribe function that stops notifications", () => {
    const callback = vi.fn();
    const unsub = store.subscribe({ kinds: [1] }, callback);

    unsub();

    const event = makeEvent({ kind: 1 });
    store.addEvent(event);

    // Should not be called for new events after unsubscribe
    expect(callback).not.toHaveBeenCalled();
  });

  it("supports multiple concurrent subscriptions", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    store.subscribe({ kinds: [1] }, cb1);
    store.subscribe({ kinds: [7] }, cb2);

    const event1 = makeEvent({ kind: 1 });
    const event7 = makeEvent({ kind: 7 });
    store.addEvent(event1);
    store.addEvent(event7);

    expect(cb1).toHaveBeenCalledWith(event1);
    expect(cb1).not.toHaveBeenCalledWith(event7);
    expect(cb2).toHaveBeenCalledWith(event7);
    expect(cb2).not.toHaveBeenCalledWith(event1);
  });
});

// ─── clear ───────────────────────────────────────────────────────

describe("EventStore.clear", () => {
  it("removes all events", () => {
    store.addEvent(makeEvent());
    store.addEvent(makeEvent());
    store.clear();

    const results = store.query({});
    expect(results).toHaveLength(0);
  });

  it("clears all indexes", () => {
    store.addEvent(makeEvent({ kind: 1 }));
    store.clear();

    const stats = store.getStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.totalAuthors).toBe(0);
  });
});

// ─── getEventsByKind ─────────────────────────────────────────────

describe("EventStore.getEventsByKind", () => {
  it("returns events of the specified kind", () => {
    store.addEvent(makeEvent({ kind: 1 }));
    store.addEvent(makeEvent({ kind: 7 }));
    store.addEvent(makeEvent({ kind: 1 }));

    const kind1Events = store.getEventsByKind(1);
    expect(kind1Events).toHaveLength(2);
    kind1Events.forEach((e) => expect(e.kind).toBe(1));
  });

  it("returns empty array for kinds with no events", () => {
    const events = store.getEventsByKind(999);
    expect(events).toEqual([]);
  });

  it("returns events sorted by created_at descending", () => {
    store.addEvent(makeEvent({ kind: 1, created_at: 1000 }));
    store.addEvent(makeEvent({ kind: 1, created_at: 3000 }));
    store.addEvent(makeEvent({ kind: 1, created_at: 2000 }));

    const events = store.getEventsByKind(1);
    expect(events[0].created_at).toBe(3000);
    expect(events[1].created_at).toBe(2000);
    expect(events[2].created_at).toBe(1000);
  });
});

// ─── getStats ────────────────────────────────────────────────────

describe("EventStore.getStats", () => {
  it("returns correct total events count", () => {
    store.addEvent(makeEvent());
    store.addEvent(makeEvent());
    expect(store.getStats().totalEvents).toBe(2);
  });

  it("counts events by kind", () => {
    store.addEvent(makeEvent({ kind: 1 }));
    store.addEvent(makeEvent({ kind: 1 }));
    store.addEvent(makeEvent({ kind: 7 }));

    const stats = store.getStats();
    expect(stats.eventsByKind[1]).toBe(2);
    expect(stats.eventsByKind[7]).toBe(1);
  });

  it("tracks unique authors", () => {
    store.addEvent(makeEvent({ pubkey: "a".repeat(64) }));
    store.addEvent(makeEvent({ pubkey: "a".repeat(64) }));
    store.addEvent(makeEvent({ pubkey: "b".repeat(64) }));

    expect(store.getStats().totalAuthors).toBe(2);
  });

  it("tracks active listeners", () => {
    const unsub = store.subscribe({ kinds: [1] }, () => {});
    expect(store.getStats().totalListeners).toBe(1);

    unsub();
    expect(store.getStats().totalListeners).toBe(0);
  });
});

// ─── pruneOldEvents ──────────────────────────────────────────────

describe("EventStore.pruneOldEvents", () => {
  it("removes events older than maxAgeDays", () => {
    const now = Math.floor(Date.now() / 1000);
    const oldEvent = makeEvent({ created_at: now - 30 * 24 * 60 * 60 }); // 30 days old
    const recentEvent = makeEvent({ created_at: now - 1 * 24 * 60 * 60 }); // 1 day old

    store.addEvent(oldEvent);
    store.addEvent(recentEvent);

    const pruned = store.pruneOldEvents(7);
    expect(pruned).toBe(1);
    expect(store.getById(oldEvent.id)).toBeUndefined();
    expect(store.getById(recentEvent.id)).toBeDefined();
  });

  it("does not prune kind 0 (metadata) events", () => {
    const pubkey = "x".repeat(64);
    const now = Math.floor(Date.now() / 1000);
    const oldMetadata = makeEvent({
      kind: 0,
      pubkey,
      created_at: now - 30 * 24 * 60 * 60,
    });

    store.addEvent(oldMetadata);
    const pruned = store.pruneOldEvents(7);
    expect(pruned).toBe(0);
    expect(store.getById(oldMetadata.id)).toBeDefined();
  });

  it("does not prune kind 3 (contacts) events", () => {
    const pubkey = "x".repeat(64);
    const now = Math.floor(Date.now() / 1000);
    const oldContacts = makeEvent({
      kind: 3,
      pubkey,
      created_at: now - 30 * 24 * 60 * 60,
    });

    store.addEvent(oldContacts);
    const pruned = store.pruneOldEvents(7);
    expect(pruned).toBe(0);
    expect(store.getById(oldContacts.id)).toBeDefined();
  });

  it("returns 0 when there is nothing to prune", () => {
    const now = Math.floor(Date.now() / 1000);
    store.addEvent(makeEvent({ created_at: now }));
    const pruned = store.pruneOldEvents(7);
    expect(pruned).toBe(0);
  });
});
