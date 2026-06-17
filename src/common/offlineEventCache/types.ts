import type { Event } from "nostr-tools";

export const OFFLINE_CACHE_VERSION = 1;

export interface OfflineEventCacheRecord {
  version: typeof OFFLINE_CACHE_VERSION;
  pubkey: string;
  events: Event[];
  updatedAt: number;
}

export interface OfflineEventCache {
  readRecord(pubkey: string): Promise<OfflineEventCacheRecord | null>;
  writeRecord(record: OfflineEventCacheRecord): Promise<void>;
  deleteRecord(pubkey: string): Promise<void>;
}

export const getOfflineCacheKey = (pubkey: string): string =>
  `cal:offline:v${OFFLINE_CACHE_VERSION}:${pubkey}`;

export const isOfflineCacheRecord = (
  value: unknown,
): value is OfflineEventCacheRecord => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfflineEventCacheRecord>;
  return (
    candidate.version === OFFLINE_CACHE_VERSION &&
    typeof candidate.pubkey === "string" &&
    Array.isArray(candidate.events) &&
    typeof candidate.updatedAt === "number"
  );
};
