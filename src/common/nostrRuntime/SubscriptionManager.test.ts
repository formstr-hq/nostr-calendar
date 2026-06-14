import { describe, it, expect, vi } from "vitest";
import type { Event, Filter, SimplePool } from "nostr-tools";
import { SubscriptionManager } from "./SubscriptionManager";
import { EventStore } from "./EventStore";

type Handlers = { onevent: (e: Event) => void; oneose: () => void };

function makeEvent(id: string, overrides: Partial<Event> = {}): Event {
  return {
    id,
    pubkey: "a".repeat(64),
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
    ...overrides,
  };
}

function makeFakePool() {
  const subs: Array<{
    relays: string[];
    filters: Filter[];
    handlers: Handlers;
    closer: { close: ReturnType<typeof vi.fn> };
  }> = [];
  const subscribeMany = vi.fn(
    (relays: string[], filters: Filter[], handlers: Handlers) => {
      const closer = { close: vi.fn() };
      subs.push({ relays, filters, handlers, closer });
      return closer;
    },
  );
  return {
    pool: { subscribeMany } as unknown as SimplePool,
    subs,
    subscribeMany,
  };
}

const RELAYS = ["wss://relay.test"];
const FILTERS: Filter[] = [{ kinds: [1], authors: ["a".repeat(64)] }];

describe("SubscriptionManager", () => {
  it("opens a network subscription and exposes a handle", () => {
    const { pool, subs, subscribeMany } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());

    const handle = mgr.subscribe(RELAYS, FILTERS, vi.fn(), vi.fn());

    expect(typeof handle.id).toBe("string");
    expect(subscribeMany).toHaveBeenCalledTimes(1);
    expect(subs[0].relays).toEqual(RELAYS);
    expect(mgr.getActiveCount()).toBe(1);
  });

  it("deduplicates identical subscriptions and reference counts", () => {
    const { pool, subs, subscribeMany } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());

    const a = mgr.subscribe(RELAYS, FILTERS, vi.fn(), vi.fn());
    const b = mgr.subscribe(RELAYS, FILTERS, vi.fn(), vi.fn());

    expect(a.id).toBe(b.id);
    expect(subscribeMany).toHaveBeenCalledTimes(1); // reused
    expect(mgr.getActiveCount()).toBe(1);

    // First unsubscribe: refCount 2 -> 1, still open.
    a.unsubscribe();
    expect(mgr.getActiveCount()).toBe(1);
    expect(subs[0].closer.close).not.toHaveBeenCalled();

    // Second unsubscribe: refCount -> 0, closed.
    b.unsubscribe();
    expect(mgr.getActiveCount()).toBe(0);
    expect(subs[0].closer.close).toHaveBeenCalledTimes(1);
  });

  it("forwards stored events to every callback and skips rejected ones", () => {
    const { pool, subs } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    mgr.subscribe(RELAYS, FILTERS, cb1);
    mgr.subscribe(RELAYS, FILTERS, cb2); // same sub, second callback

    const event = makeEvent("evt-1");
    subs[0].handlers.onevent(event);
    expect(cb1).toHaveBeenCalledWith(event);
    expect(cb2).toHaveBeenCalledWith(event);

    // Ephemeral events (20000-29999) are not stored: EventStore.addEvent
    // returns false, so the manager must NOT forward them to callbacks.
    subs[0].handlers.onevent(makeEvent("ephemeral-1", { kind: 20000 }));
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("fires EOSE callbacks once, clears them, and serves late subscribers immediately", () => {
    const { pool, subs } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());

    const eose1 = vi.fn();
    mgr.subscribe(RELAYS, FILTERS, vi.fn(), eose1);
    subs[0].handlers.oneose();
    expect(eose1).toHaveBeenCalledTimes(1);

    // A subscriber that joins after EOSE should be notified synchronously
    // without waiting for another network EOSE.
    const eoseLate = vi.fn();
    mgr.subscribe(RELAYS, FILTERS, vi.fn(), eoseLate);
    expect(eoseLate).toHaveBeenCalledTimes(1);

    // A second network EOSE must not re-fire the original callback.
    subs[0].handlers.oneose();
    expect(eose1).toHaveBeenCalledTimes(1);
  });

  it("chunks large author lists and only fires EOSE after every chunk", () => {
    const { pool, subs, subscribeMany } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());

    const authors = Array.from({ length: 2500 }, (_, i) =>
      i.toString(16).padStart(64, "0"),
    );
    const eose = vi.fn();
    mgr.subscribe(RELAYS, [{ kinds: [1], authors }], vi.fn(), eose);

    // 2500 authors / 1000 per chunk => 3 chunked subscriptions.
    expect(subscribeMany).toHaveBeenCalledTimes(3);
    expect(mgr.listSubscriptions()[0].isChunked).toBe(true);

    subs[0].handlers.oneose();
    subs[1].handlers.oneose();
    expect(eose).not.toHaveBeenCalled(); // not all chunks done yet
    subs[2].handlers.oneose();
    expect(eose).toHaveBeenCalledTimes(1);
  });

  it("closes every chunk closer when a chunked subscription is torn down", () => {
    const { pool, subs } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());
    const authors = Array.from({ length: 2500 }, (_, i) =>
      i.toString(16).padStart(64, "0"),
    );
    const handle = mgr.subscribe(RELAYS, [{ kinds: [1], authors }], vi.fn());
    expect(subs).toHaveLength(3); // chunked into 3

    handle.unsubscribe(); // refCount -> 0 -> closeSubscription closes all chunks
    expect(mgr.getActiveCount()).toBe(0);
    subs.forEach((s) => expect(s.closer.close).toHaveBeenCalledTimes(1));
  });

  it("routes events through chunked subscriptions to callbacks", () => {
    const { pool, subs } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());
    const authors = Array.from({ length: 1500 }, (_, i) =>
      i.toString(16).padStart(64, "0"),
    );
    const cb = vi.fn();
    mgr.subscribe(RELAYS, [{ kinds: [1], authors }], cb);

    subs[1].handlers.onevent(makeEvent("chunk-evt"));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("closeAll closes every managed subscription", () => {
    const { pool, subs } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());

    mgr.subscribe(RELAYS, [{ kinds: [1] }], vi.fn());
    mgr.subscribe(RELAYS, [{ kinds: [0] }], vi.fn());
    expect(mgr.getActiveCount()).toBe(2);

    mgr.closeAll();
    expect(mgr.getActiveCount()).toBe(0);
    subs.forEach((s) => expect(s.closer.close).toHaveBeenCalled());
  });

  it("listSubscriptions reports filters, relays, refcount and EOSE state", () => {
    const { pool } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());
    mgr.subscribe(RELAYS, FILTERS, vi.fn(), vi.fn());

    const info = mgr.listSubscriptions();
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({
      relays: RELAYS,
      filters: FILTERS,
      refCount: 1,
      callbackCount: 1,
      eoseReceived: false,
      isChunked: false,
    });
  });

  it("ignores unsubscribe for an unknown subscription id", () => {
    const { pool, subs } = makeFakePool();
    const mgr = new SubscriptionManager(pool, new EventStore());
    const handle = mgr.subscribe(RELAYS, FILTERS, vi.fn());

    handle.unsubscribe();
    // A second unsubscribe on the already-closed sub is a no-op (no throw).
    expect(() => handle.unsubscribe()).not.toThrow();
    expect(subs[0].closer.close).toHaveBeenCalledTimes(1);
  });
});
