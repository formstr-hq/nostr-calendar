import { describe, it, expect } from "vitest";
import {
  normalizeFilter,
  generateFilterHash,
  eventMatchesFilter,
  chunkFilter,
  extractTagKeys,
} from "./filterUtils";

// ─── normalizeFilter ─────────────────────────────────────────────

describe("normalizeFilter", () => {
  it("sorts object keys alphabetically", () => {
    const filter = { kinds: [1], authors: ["a"], ids: ["x"] };
    const result = normalizeFilter(filter);
    const keys = Object.keys(result);
    expect(keys).toEqual(["authors", "ids", "kinds"]);
  });

  it("sorts array values", () => {
    const filter = { kinds: [3, 1, 0], authors: ["c", "a", "b"] };
    const result = normalizeFilter(filter);
    expect(result.kinds).toEqual([0, 1, 3]);
    expect(result.authors).toEqual(["a", "b", "c"]);
  });

  it("removes undefined values", () => {
    const filter = { kinds: [1], since: undefined } as any;
    const result = normalizeFilter(filter);
    expect("since" in result).toBe(false);
  });

  it("preserves non-array values", () => {
    const filter = { since: 1000, until: 2000 };
    const result = normalizeFilter(filter);
    expect(result.since).toBe(1000);
    expect(result.until).toBe(2000);
  });

  it("returns a new object (does not mutate input)", () => {
    const filter = { kinds: [3, 1] };
    const result = normalizeFilter(filter);
    expect(result).not.toBe(filter);
    // Original should not be sorted
    expect(filter.kinds).toEqual([3, 1]);
  });
});

// ─── generateFilterHash ──────────────────────────────────────────

describe("generateFilterHash", () => {
  it("returns a string", () => {
    const hash = generateFilterHash([{ kinds: [1] }], ["wss://relay.com"]);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("returns the same hash for the same filters and relays", () => {
    const h1 = generateFilterHash([{ kinds: [1] }], ["wss://relay.com"]);
    const h2 = generateFilterHash([{ kinds: [1] }], ["wss://relay.com"]);
    expect(h1).toBe(h2);
  });

  it("returns the same hash regardless of relay order", () => {
    const h1 = generateFilterHash(
      [{ kinds: [1] }],
      ["wss://a.com", "wss://b.com"],
    );
    const h2 = generateFilterHash(
      [{ kinds: [1] }],
      ["wss://b.com", "wss://a.com"],
    );
    expect(h1).toBe(h2);
  });

  it("returns the same hash regardless of filter array order", () => {
    const h1 = generateFilterHash([{ kinds: [1, 3] }], ["wss://relay.com"]);
    const h2 = generateFilterHash([{ kinds: [3, 1] }], ["wss://relay.com"]);
    expect(h1).toBe(h2);
  });

  it("returns different hashes for different filters", () => {
    const h1 = generateFilterHash([{ kinds: [1] }], ["wss://relay.com"]);
    const h2 = generateFilterHash([{ kinds: [0] }], ["wss://relay.com"]);
    expect(h1).not.toBe(h2);
  });

  it("returns different hashes for different relays", () => {
    const h1 = generateFilterHash([{ kinds: [1] }], ["wss://a.com"]);
    const h2 = generateFilterHash([{ kinds: [1] }], ["wss://b.com"]);
    expect(h1).not.toBe(h2);
  });
});

// ─── eventMatchesFilter ──────────────────────────────────────────

describe("eventMatchesFilter", () => {
  const baseEvent = {
    id: "event1",
    pubkey: "author1",
    created_at: 1500,
    kind: 1,
    tags: [
      ["e", "ref-event"],
      ["p", "mentioned-pubkey"],
    ],
    content: "hello",
    sig: "sig",
  };

  it("matches when filter is empty (no constraints)", () => {
    expect(eventMatchesFilter(baseEvent, {})).toBe(true);
  });

  // IDs filter
  it("matches when event id is in filter.ids", () => {
    expect(eventMatchesFilter(baseEvent, { ids: ["event1"] })).toBe(true);
  });

  it("rejects when event id is not in filter.ids", () => {
    expect(eventMatchesFilter(baseEvent, { ids: ["event2"] })).toBe(false);
  });

  // Authors filter
  it("matches when event pubkey is in filter.authors", () => {
    expect(eventMatchesFilter(baseEvent, { authors: ["author1"] })).toBe(true);
  });

  it("rejects when event pubkey is not in filter.authors", () => {
    expect(eventMatchesFilter(baseEvent, { authors: ["author2"] })).toBe(false);
  });

  // Kinds filter
  it("matches when event kind is in filter.kinds", () => {
    expect(eventMatchesFilter(baseEvent, { kinds: [1, 7] })).toBe(true);
  });

  it("rejects when event kind is not in filter.kinds", () => {
    expect(eventMatchesFilter(baseEvent, { kinds: [0, 3] })).toBe(false);
  });

  // Since / Until
  it("matches when created_at >= since", () => {
    expect(eventMatchesFilter(baseEvent, { since: 1500 })).toBe(true);
    expect(eventMatchesFilter(baseEvent, { since: 1000 })).toBe(true);
  });

  it("rejects when created_at < since", () => {
    expect(eventMatchesFilter(baseEvent, { since: 2000 })).toBe(false);
  });

  it("matches when created_at <= until", () => {
    expect(eventMatchesFilter(baseEvent, { until: 1500 })).toBe(true);
    expect(eventMatchesFilter(baseEvent, { until: 2000 })).toBe(true);
  });

  it("rejects when created_at > until", () => {
    expect(eventMatchesFilter(baseEvent, { until: 1000 })).toBe(false);
  });

  // Tag filters
  it("matches on #e tag filter", () => {
    expect(eventMatchesFilter(baseEvent, { "#e": ["ref-event"] } as any)).toBe(
      true,
    );
  });

  it("rejects when #e tag value does not match", () => {
    expect(
      eventMatchesFilter(baseEvent, { "#e": ["other-event"] } as any),
    ).toBe(false);
  });

  it("matches on #p tag filter", () => {
    expect(
      eventMatchesFilter(baseEvent, { "#p": ["mentioned-pubkey"] } as any),
    ).toBe(true);
  });

  it("rejects when #p tag value does not match", () => {
    expect(
      eventMatchesFilter(baseEvent, { "#p": ["unknown-pubkey"] } as any),
    ).toBe(false);
  });

  // Combined filters
  it("matches when all filter criteria are met", () => {
    expect(
      eventMatchesFilter(baseEvent, {
        ids: ["event1"],
        authors: ["author1"],
        kinds: [1],
        since: 1000,
        until: 2000,
      }),
    ).toBe(true);
  });

  it("rejects when any filter criterion fails", () => {
    expect(
      eventMatchesFilter(baseEvent, {
        ids: ["event1"],
        authors: ["wrong-author"],
        kinds: [1],
      }),
    ).toBe(false);
  });
});

// ─── chunkFilter ─────────────────────────────────────────────────

describe("chunkFilter", () => {
  it("returns the filter as-is when authors list is small", () => {
    const filter = { kinds: [1], authors: ["a", "b", "c"] };
    const result = chunkFilter(filter, 1000);
    expect(result).toEqual([filter]);
  });

  it("returns the filter as-is when there are no authors", () => {
    const filter = { kinds: [1] };
    const result = chunkFilter(filter);
    expect(result).toEqual([filter]);
  });

  it("chunks authors into groups of specified size", () => {
    const authors = Array.from({ length: 5 }, (_, i) => `author-${i}`);
    const filter = { kinds: [1], authors };
    const result = chunkFilter(filter, 2);

    expect(result).toHaveLength(3);
    expect(result[0].authors).toEqual(["author-0", "author-1"]);
    expect(result[1].authors).toEqual(["author-2", "author-3"]);
    expect(result[2].authors).toEqual(["author-4"]);
  });

  it("preserves other filter fields in each chunk", () => {
    const authors = Array.from({ length: 4 }, (_, i) => `a${i}`);
    const filter = { kinds: [1, 3], authors, since: 1000 };
    const result = chunkFilter(filter, 2);

    for (const chunk of result) {
      expect(chunk.kinds).toEqual([1, 3]);
      expect(chunk.since).toBe(1000);
    }
  });

  it("handles exactly chunkSize authors (no chunking needed)", () => {
    const authors = Array.from({ length: 3 }, (_, i) => `a${i}`);
    const filter = { kinds: [1], authors };
    const result = chunkFilter(filter, 3);
    expect(result).toHaveLength(1);
    expect(result[0].authors).toEqual(authors);
  });

  it("handles chunkSize + 1 authors (two chunks)", () => {
    const authors = Array.from({ length: 4 }, (_, i) => `a${i}`);
    const filter = { kinds: [1], authors };
    const result = chunkFilter(filter, 3);
    expect(result).toHaveLength(2);
    expect(result[0].authors).toHaveLength(3);
    expect(result[1].authors).toHaveLength(1);
  });
});

// ─── extractTagKeys ──────────────────────────────────────────────

describe("extractTagKeys", () => {
  it("extracts tag keys as tagName:tagValue", () => {
    const event = {
      tags: [
        ["e", "event-id-123"],
        ["p", "pubkey-abc"],
      ],
    };
    const keys = extractTagKeys(event);
    expect(keys).toEqual(["e:event-id-123", "p:pubkey-abc"]);
  });

  it("skips tags with fewer than 2 elements", () => {
    const event = {
      tags: [["e"], ["p", "pubkey"]],
    };
    const keys = extractTagKeys(event);
    expect(keys).toEqual(["p:pubkey"]);
  });

  it("returns empty array for event with no tags", () => {
    const event = { tags: [] };
    const keys = extractTagKeys(event);
    expect(keys).toEqual([]);
  });

  it("handles event without tags property", () => {
    const event = {};
    const keys = extractTagKeys(event);
    expect(keys).toEqual([]);
  });

  it("handles custom tag types (t, d, etc.)", () => {
    const event = {
      tags: [
        ["t", "nostr"],
        ["d", "article-slug"],
        ["r", "https://example.com"],
      ],
    };
    const keys = extractTagKeys(event);
    expect(keys).toEqual([
      "t:nostr",
      "d:article-slug",
      "r:https://example.com",
    ]);
  });
});
