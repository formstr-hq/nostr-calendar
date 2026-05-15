import { describe, it, expect } from "vitest";
import { parseEventRef, buildEventRef } from "./calendarListTypes";

describe("parseEventRef", () => {
  it("parses an event ref correctly", () => {
    const ref = ["32678:abc123pubkey:my-event-id", "", "nsec1abc123"];
    const result = parseEventRef(ref);

    expect(result.kind).toBe(32678);
    expect(result.authorPubkey).toBe("abc123pubkey");
    expect(result.eventDTag).toBe("my-event-id");
    expect(result.relayUrl).toBe("");
    expect(result.viewKey).toBe("nsec1abc123");
  });

  it("parses a ref with a relay URL", () => {
    const ref = ["32678:abc123pubkey:my-event-id", "wss://relay.example.com", "nsec1abc123"];
    const result = parseEventRef(ref);

    expect(result.relayUrl).toBe("wss://relay.example.com");
    expect(result.eventDTag).toBe("my-event-id");
    expect(result.viewKey).toBe("nsec1abc123");
  });

  it("handles missing third element gracefully", () => {
    const ref = ["32678:abc123pubkey:my-event-id", ""];
    const result = parseEventRef(ref);

    expect(result.viewKey).toBe("");
  });
});

describe("buildEventRef", () => {
  it("builds an event ref array with empty relay URL", () => {
    const ref = buildEventRef({
      kind: 32678,
      authorPubkey: "testpubkey",
      eventDTag: "my-event",
      viewKey: "nsec1test",
    });

    expect(ref).toEqual(["32678:testpubkey:my-event", "", "nsec1test"]);
  });

  it("builds a ref with a relay URL", () => {
    const ref = buildEventRef({
      kind: 32678,
      authorPubkey: "testpubkey",
      eventDTag: "my-event",
      relayUrl: "wss://relay.example.com",
      viewKey: "nsec1test",
    });

    expect(ref).toEqual(["32678:testpubkey:my-event", "wss://relay.example.com", "nsec1test"]);
  });

  it("builds a ref with an empty viewKey (booking placeholder)", () => {
    const ref = buildEventRef({
      kind: 32678,
      authorPubkey: "testpubkey",
      eventDTag: "my-event",
      viewKey: "",
    });

    expect(ref).toEqual(["32678:testpubkey:my-event", "", ""]);
  });

  it("round-trips through build and parse", () => {
    const original = {
      kind: 32678,
      authorPubkey: "roundtrippubkey",
      eventDTag: "round-trip-test",
      viewKey: "nsec1roundtrip",
    };

    const ref = buildEventRef(original);
    const parsed = parseEventRef(ref);

    expect(parsed).toEqual({ ...original, relayUrl: "" });
  });
});
