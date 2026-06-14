import { describe, it, expect, vi } from "vitest";
import type { Event, Filter, SimplePool } from "nostr-tools";
import { NostrRuntime, createNostrRuntime } from "./index";

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

function makeFakePool(opts: { throwOnSubscribe?: boolean } = {}) {
  const subs: Array<{
    relays: string[];
    filters: Filter[];
    handlers: Handlers;
    closer: { close: ReturnType<typeof vi.fn> };
  }> = [];
  const subscribeMany = vi.fn(
    (relays: string[], filters: Filter[], handlers: Handlers) => {
      if (opts.throwOnSubscribe) throw new Error("relay down");
      const closer = { close: vi.fn() };
      subs.push({ relays, filters, handlers, closer });
      return closer;
    },
  );
  return { pool: { subscribeMany } as unknown as SimplePool, subs };
}

const RELAYS = ["wss://relay.test"];

describe("NostrRuntime", () => {
  describe("createNostrRuntime", () => {
    it("constructs a runtime instance", () => {
      const { pool } = makeFakePool();
      expect(createNostrRuntime(pool)).toBeInstanceOf(NostrRuntime);
    });
  });

  describe("query / get / addEvent / addEvents", () => {
    it("delegates query and get to the event store", () => {
      const { pool } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const event = makeEvent("e1");

      expect(rt.addEvent(event)).toBe(true);
      expect(rt.query({ kinds: [1] })).toContainEqual(event);
      expect(rt.get("e1")).toEqual(event);
      expect(rt.get("missing")).toBeUndefined();
    });

    it("addEvents counts only the events the store accepts", () => {
      const { pool } = makeFakePool();
      const rt = new NostrRuntime(pool);
      // Two storable events -> 2.
      expect(rt.addEvents([makeEvent("a"), makeEvent("b")])).toBe(2);
      // Ephemeral events (20000-29999) are not stored, so they aren't counted.
      expect(
        rt.addEvents([makeEvent("c"), makeEvent("eph", { kind: 20000 })]),
      ).toBe(1);
    });
  });

  describe("subscribe", () => {
    it("localOnly: serves cache and calls EOSE without touching the network", () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      rt.addEvent(makeEvent("cached"));

      const onEvent = vi.fn();
      const onEose = vi.fn();
      const handle = rt.subscribe(RELAYS, [{ kinds: [1] }], {
        onEvent,
        onEose,
        localOnly: true,
      });

      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEose).toHaveBeenCalledTimes(1);
      expect(subs).toHaveLength(0); // no network sub
      expect(handle.id).toBe("local-only");
      expect(() => handle.unsubscribe()).not.toThrow();
    });

    it("localOnly without callbacks still returns a dummy handle", () => {
      const { pool } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const handle = rt.subscribe(RELAYS, [{ kinds: [1] }], {
        localOnly: true,
      });
      expect(handle.id).toBe("local-only");
    });

    it("delivers cached events first, then opens a network subscription", () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const cached = makeEvent("cached");
      rt.addEvent(cached);

      const onEvent = vi.fn();
      rt.subscribe(RELAYS, [{ kinds: [1] }], { onEvent });

      expect(onEvent).toHaveBeenCalledWith(cached); // cache-first
      expect(subs).toHaveLength(1); // network sub opened

      // New live event flows through to the same callback.
      subs[0].handlers.onevent(makeEvent("live"));
      expect(onEvent).toHaveBeenCalledTimes(2);
    });

    it("subscribes without an onEvent callback (no cache delivery)", () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      rt.addEvent(makeEvent("cached"));
      rt.subscribe(RELAYS, [{ kinds: [1] }], {});
      expect(subs).toHaveLength(1);
    });

    it("works when options are omitted entirely", () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      rt.subscribe(RELAYS, [{ kinds: [1] }]);
      expect(subs).toHaveLength(1);
    });
  });

  describe("querySync / fetchOne", () => {
    it("collects events until EOSE, de-duplicating by id", async () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);

      const p = rt.querySync(RELAYS, { kinds: [1] });
      const handlers = subs[subs.length - 1].handlers;
      handlers.onevent(makeEvent("dup"));
      handlers.onevent(makeEvent("dup")); // same id, collected once
      handlers.onevent(makeEvent("other"));
      handlers.oneose();

      const result = await p;
      expect(result.map((e) => e.id).sort()).toEqual(["dup", "other"]);
      expect(subs[0].closer.close).toHaveBeenCalled(); // closed on EOSE
    });

    it("resolves with whatever was collected when EOSE never arrives (timeout)", async () => {
      vi.useFakeTimers();
      try {
        const { pool, subs } = makeFakePool();
        const rt = new NostrRuntime(pool);
        const p = rt.querySync(RELAYS, { kinds: [1] });
        subs[subs.length - 1].handlers.onevent(makeEvent("late"));
        await vi.advanceTimersByTimeAsync(10000);
        const result = await p;
        expect(result.map((e) => e.id)).toEqual(["late"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("fetchOne returns the first match and applies limit:1", async () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const p = rt.fetchOne(RELAYS, { kinds: [1] });
      expect(subs[subs.length - 1].filters[0]).toMatchObject({ limit: 1 });
      subs[subs.length - 1].handlers.onevent(makeEvent("first"));
      subs[subs.length - 1].handlers.oneose();
      expect((await p)?.id).toBe("first");
    });

    it("fetchOne returns null when nothing matches", async () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const p = rt.fetchOne(RELAYS, { kinds: [1] });
      subs[subs.length - 1].handlers.oneose();
      expect(await p).toBeNull();
    });
  });

  describe("fetchBatched", () => {
    it("returns a cached event immediately without querying", async () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const cached = makeEvent("cached");
      rt.addEvent(cached);
      expect(await rt.fetchBatched(RELAYS, "cached")).toEqual(cached);
      expect(subs).toHaveLength(0);
    });

    it("batches calls within the window into a single query", async () => {
      vi.useFakeTimers();
      try {
        const { pool, subs } = makeFakePool();
        const rt = new NostrRuntime(pool);

        const p1 = rt.fetchBatched(RELAYS, "id1");
        const p2 = rt.fetchBatched(RELAYS, "id2");
        const p3 = rt.fetchBatched(RELAYS, "id1"); // same id as p1

        await vi.advanceTimersByTimeAsync(50); // flush batch -> one querySync
        expect(subs).toHaveLength(1);
        expect(subs[0].filters[0]).toMatchObject({ ids: ["id1", "id2"] });

        subs[0].handlers.onevent(makeEvent("id1"));
        subs[0].handlers.oneose();

        const [e1, e2, e3] = await Promise.all([p1, p2, p3]);
        expect(e1?.id).toBe("id1");
        expect(e2).toBeNull(); // id2 never arrived
        expect(e3?.id).toBe("id1"); // both id1 waiters resolved
      } finally {
        vi.useRealTimers();
      }
    });

    it("resolves all waiters with null when the underlying query throws", async () => {
      vi.useFakeTimers();
      try {
        const { pool } = makeFakePool({ throwOnSubscribe: true });
        const rt = new NostrRuntime(pool);
        const p = rt.fetchBatched(RELAYS, "boom");
        await vi.advanceTimersByTimeAsync(50);
        expect(await p).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("deletion / participant-removal priming", () => {
    it("fetchDeletionEvents queries kind 5 for the user", async () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const p = rt.fetchDeletionEvents(RELAYS, "user-pubkey");
      const filter = subs[subs.length - 1].filters[0];
      expect(filter).toMatchObject({ kinds: [5], authors: ["user-pubkey"] });
      subs[subs.length - 1].handlers.oneose();
      await p;
    });

    it("fetchParticipantRemovalEvents queries kind 84 for the user", async () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      const p = rt.fetchParticipantRemovalEvents(RELAYS, "user-pubkey");
      const filter = subs[subs.length - 1].filters[0];
      expect(filter).toMatchObject({ kinds: [84], authors: ["user-pubkey"] });
      subs[subs.length - 1].handlers.oneose();
      await p;
    });
  });

  describe("debug + cleanup", () => {
    it("exposes stats, subscription listing, kind lookup, clear and prune", () => {
      const { pool } = makeFakePool();
      const rt = new NostrRuntime(pool);
      rt.addEvent(makeEvent("e1", { kind: 1 }));
      rt.addEvent(makeEvent("e2", { kind: 0, pubkey: "b".repeat(64) }));
      rt.subscribe(RELAYS, [{ kinds: [1] }], { onEvent: vi.fn() });

      const stats = rt.debug.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.activeSubscriptions).toBe(1);
      expect(stats.estimatedMemory).toBeGreaterThan(0);

      expect(rt.debug.listSubscriptions()).toHaveLength(1);
      expect(rt.debug.getEventsByKind(1).map((e) => e.id)).toEqual(["e1"]);

      const oldEvent = makeEvent("old", {
        created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30,
      });
      rt.addEvent(oldEvent);
      expect(rt.debug.pruneOldEvents(7)).toBeGreaterThanOrEqual(1);

      rt.debug.clearEvents();
      expect(rt.debug.getStats().totalEvents).toBe(0);
    });

    it("cleanup closes subscriptions and clears the store", () => {
      const { pool, subs } = makeFakePool();
      const rt = new NostrRuntime(pool);
      rt.addEvent(makeEvent("e1"));
      rt.subscribe(RELAYS, [{ kinds: [1] }], { onEvent: vi.fn() });

      rt.cleanup();
      expect(subs[0].closer.close).toHaveBeenCalled();
      expect(rt.query({ kinds: [1] })).toHaveLength(0);
    });
  });
});
