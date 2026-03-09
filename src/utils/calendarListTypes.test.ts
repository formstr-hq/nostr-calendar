import { describe, it, expect } from "vitest";
import { parseEventRef, buildEventRef } from "./calendarListTypes";

describe("parseEventRef", () => {
  it("parses a non-recurring event ref correctly", () => {
    const ref = ["32678:abc123pubkey:my-event-id", "", "nsec1abc123:1700000000::1700003600:false"];
    const result = parseEventRef(ref);

    expect(result.kind).toBe(32678);
    expect(result.authorPubkey).toBe("abc123pubkey");
    expect(result.eventDTag).toBe("my-event-id");
    expect(result.relayUrl).toBe("");
    expect(result.viewKey).toBe("nsec1abc123");
    expect(result.beginTimeSecs).toBe(1700000000);
    expect(result.endTimeSecs).toBe(1700003600);
    expect(result.isRecurring).toBe(false);
  });

  it("parses a recurring event ref correctly", () => {
    const ref = ["32679:xyz789pubkey:recurring-event", "", "nsec1xyz789:1699000000::1699003600:true"];
    const result = parseEventRef(ref);

    expect(result.kind).toBe(32679);
    expect(result.authorPubkey).toBe("xyz789pubkey");
    expect(result.eventDTag).toBe("recurring-event");
    expect(result.relayUrl).toBe("");
    expect(result.viewKey).toBe("nsec1xyz789");
    expect(result.beginTimeSecs).toBe(1699000000);
    expect(result.endTimeSecs).toBe(1699003600);
    expect(result.isRecurring).toBe(true);
  });

  it("parses a ref with a relay URL", () => {
    const ref = ["32678:abc123pubkey:my-event-id", "wss://relay.example.com", "nsec1abc123:1700000000::1700003600:false"];
    const result = parseEventRef(ref);

    expect(result.relayUrl).toBe("wss://relay.example.com");
    expect(result.eventDTag).toBe("my-event-id");
    expect(result.viewKey).toBe("nsec1abc123");
  });
});

describe("buildEventRef", () => {
  it("builds a non-recurring event ref array with empty relay URL", () => {
    const ref = buildEventRef({
      kind: 32678,
      authorPubkey: "testpubkey",
      eventDTag: "my-event",
      viewKey: "nsec1test",
      beginTimeSecs: 1700000000,
      endTimeSecs: 1700003600,
      isRecurring: false,
    });

    expect(ref).toEqual(["32678:testpubkey:my-event", "", "nsec1test:1700000000::1700003600:false"]);
  });

  it("builds a recurring event ref array", () => {
    const ref = buildEventRef({
      kind: 32679,
      authorPubkey: "testpubkey",
      eventDTag: "recurring",
      viewKey: "nsec1key",
      beginTimeSecs: 1699000000,
      endTimeSecs: 1699003600,
      isRecurring: true,
    });

    expect(ref).toEqual(["32679:testpubkey:recurring", "", "nsec1key:1699000000::1699003600:true"]);
  });

  it("builds a ref with a relay URL", () => {
    const ref = buildEventRef({
      kind: 32678,
      authorPubkey: "testpubkey",
      eventDTag: "my-event",
      relayUrl: "wss://relay.example.com",
      viewKey: "nsec1test",
      beginTimeSecs: 1700000000,
      endTimeSecs: 1700003600,
      isRecurring: false,
    });

    expect(ref).toEqual(["32678:testpubkey:my-event", "wss://relay.example.com", "nsec1test:1700000000::1700003600:false"]);
  });

  it("round-trips through build and parse", () => {
    const original = {
      kind: 32678,
      authorPubkey: "roundtrippubkey",
      eventDTag: "round-trip-test",
      viewKey: "nsec1roundtrip",
      beginTimeSecs: 1700500000,
      endTimeSecs: 1700503600,
      isRecurring: false,
    };

    const ref = buildEventRef(original);
    const parsed = parseEventRef(ref);

    expect(parsed).toEqual({ ...original, relayUrl: "" });
  });

  it("round-trips recurring events", () => {
    const original = {
      kind: 32679,
      authorPubkey: "weeklypubkey",
      eventDTag: "weekly-meeting",
      viewKey: "nsec1weekly",
      beginTimeSecs: 1698000000,
      endTimeSecs: 1698003600,
      isRecurring: true,
    };

    const ref = buildEventRef(original);
    const parsed = parseEventRef(ref);

    expect(parsed).toEqual({ ...original, relayUrl: "" });
  });
});
