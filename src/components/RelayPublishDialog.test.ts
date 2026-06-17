import { describe, expect, it } from "vitest";
import { getRelayPublishCounts } from "../utils/relayPublishStatus";

describe("getRelayPublishCounts", () => {
  it("deduplicates relays and counts accepted, failed, and pending states", () => {
    const counts = getRelayPublishCounts(
      [
        "wss://relay.damus.io",
        "wss://relay.damus.io/",
        "wss://relay.primal.net",
        "wss://nos.lol",
      ],
      {
        "wss://relay.damus.io/": "ok",
        "wss://relay.primal.net/": "error",
      },
    );

    expect(counts).toEqual({
      normalizedRelays: [
        "wss://relay.damus.io/",
        "wss://relay.primal.net/",
        "wss://nos.lol/",
      ],
      acceptedCount: 1,
      failedCount: 1,
      pendingCount: 1,
      totalCount: 3,
    });
  });
});
