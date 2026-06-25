import { normalizeURL } from "nostr-tools/utils";
import type { RelayStatusMap } from "./types";

export interface RelayPublishCounts {
  normalizedRelays: string[];
  acceptedCount: number;
  failedCount: number;
  pendingCount: number;
  totalCount: number;
}

export function getRelayPublishCounts(
  relays: string[],
  relayStatus: RelayStatusMap,
): RelayPublishCounts {
  const normalizedRelays = Array.from(new Set(relays.map(normalizeURL)));
  const acceptedCount = normalizedRelays.filter(
    (relayUrl) => relayStatus[relayUrl] === "ok",
  ).length;
  const failedCount = normalizedRelays.filter(
    (relayUrl) => relayStatus[relayUrl] === "error",
  ).length;
  const pendingCount = normalizedRelays.filter(
    (relayUrl) => (relayStatus[relayUrl] ?? "pending") === "pending",
  ).length;

  return {
    normalizedRelays,
    acceptedCount,
    failedCount,
    pendingCount,
    totalCount: normalizedRelays.length,
  };
}
