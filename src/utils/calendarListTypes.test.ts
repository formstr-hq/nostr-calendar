import { describe, it, expect } from "vitest";
import {
  parseEventRef,
  buildEventRef,
  replaceEventRefViewKey,
  resolveRotationRecipients,
  getRemovedParticipants,
  resolveRemovalRekeyRecipients,
} from "./calendarListTypes";

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
    const ref = [
      "32678:abc123pubkey:my-event-id",
      "wss://relay.example.com",
      "nsec1abc123",
    ];
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

    expect(ref).toEqual([
      "32678:testpubkey:my-event",
      "wss://relay.example.com",
      "nsec1test",
    ]);
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

describe("replaceEventRefViewKey", () => {
  const coordA = "32678:author:event-a";
  const coordB = "32678:author:event-b";

  it("replaces the view key of the matching ref only", () => {
    const refs = [
      [coordA, "wss://relay.a", "nsec1old"],
      [coordB, "wss://relay.b", "nsec1other"],
    ];

    const result = replaceEventRefViewKey(refs, coordA, "nsec1new");

    expect(result[0]).toEqual([coordA, "wss://relay.a", "nsec1new"]);
    // Other refs are untouched.
    expect(result[1]).toEqual([coordB, "wss://relay.b", "nsec1other"]);
  });

  it("updates the relay hint when one is supplied", () => {
    const refs = [[coordA, "wss://relay.a", "nsec1old"]];

    const result = replaceEventRefViewKey(
      refs,
      coordA,
      "nsec1new",
      "wss://relay.new",
    );

    expect(result[0]).toEqual([coordA, "wss://relay.new", "nsec1new"]);
  });

  it("keeps the original array contents when no ref matches", () => {
    const refs = [[coordA, "wss://relay.a", "nsec1old"]];

    const result = replaceEventRefViewKey(refs, coordB, "nsec1new");

    expect(result).toEqual(refs);
  });

  it("round-trips: rotated ref re-parses with the new key", () => {
    const refs = [
      buildEventRef({
        kind: 32678,
        authorPubkey: "author",
        eventDTag: "event-a",
        relayUrl: "wss://relay.a",
        viewKey: "nsec1old",
      }),
    ];

    const rotated = replaceEventRefViewKey(refs, coordA, "nsec1new");
    const parsed = parseEventRef(rotated[0]);

    expect(parsed.viewKey).toBe("nsec1new");
    expect(parsed.relayUrl).toBe("wss://relay.a");
  });
});

describe("resolveRotationRecipients", () => {
  it("returns invited participants only when responders are excluded", () => {
    const recipients = resolveRotationRecipients({
      invitedParticipants: ["alice", "bob"],
      rsvpResponders: ["carol"],
      includeRsvpResponders: false,
      selfPubkey: "me",
    });

    expect(recipients.sort()).toEqual(["alice", "bob"]);
  });

  it("unions invited participants and responders when included", () => {
    const recipients = resolveRotationRecipients({
      invitedParticipants: ["alice", "bob"],
      rsvpResponders: ["carol", "bob"],
      includeRsvpResponders: true,
      selfPubkey: "me",
    });

    expect(recipients.sort()).toEqual(["alice", "bob", "carol"]);
  });

  it("always excludes the author's own pubkey", () => {
    const recipients = resolveRotationRecipients({
      invitedParticipants: ["alice", "me"],
      rsvpResponders: ["me", "carol"],
      includeRsvpResponders: true,
      selfPubkey: "me",
    });

    expect(recipients).not.toContain("me");
    expect(recipients.sort()).toEqual(["alice", "carol"]);
  });
});

describe("getRemovedParticipants", () => {
  it("returns participants present before but not after", () => {
    const removed = getRemovedParticipants(
      ["alice", "bob", "carol"],
      ["alice", "carol"],
      "me",
    );
    expect(removed).toEqual(["bob"]);
  });

  it("never counts the author as removed", () => {
    const removed = getRemovedParticipants(["me", "alice"], ["alice"], "me");
    expect(removed).toEqual([]);
  });

  it("compares case-insensitively", () => {
    const removed = getRemovedParticipants(["AbC", "DeF"], ["abc"], "me");
    expect(removed).toEqual(["def"]);
  });

  it("returns empty when nobody was removed", () => {
    const removed = getRemovedParticipants(["alice"], ["alice", "bob"], "me");
    expect(removed).toEqual([]);
  });
});

describe("resolveRemovalRekeyRecipients", () => {
  it("keeps remaining invited and responders, drops the removed person", () => {
    const recipients = resolveRemovalRekeyRecipients({
      remainingParticipants: ["bob"],
      rsvpResponders: ["carol"],
      removedParticipants: ["alice"],
      selfPubkey: "me",
    });
    expect(recipients.sort()).toEqual(["bob", "carol"]);
  });

  it("excludes a removed participant even if they also RSVP'd", () => {
    const recipients = resolveRemovalRekeyRecipients({
      remainingParticipants: ["bob"],
      rsvpResponders: ["alice", "carol"],
      removedParticipants: ["alice"],
      selfPubkey: "me",
    });
    expect(recipients).not.toContain("alice");
    expect(recipients.sort()).toEqual(["bob", "carol"]);
  });

  it("excludes the author and de-duplicates across both sources", () => {
    const recipients = resolveRemovalRekeyRecipients({
      remainingParticipants: ["bob", "me"],
      rsvpResponders: ["bob", "carol"],
      removedParticipants: [],
      selfPubkey: "me",
    });
    expect(recipients).not.toContain("me");
    expect(recipients.sort()).toEqual(["bob", "carol"]);
  });
});
