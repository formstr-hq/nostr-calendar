import type { Event } from "nostr-tools";
import { isNative } from "../../utils/platform";
import { NativeOfflineEventCache } from "./native";
import {
  OFFLINE_CACHE_VERSION,
  getOfflineCacheKey,
  type OfflineEventCache,
  type OfflineEventCacheRecord,
} from "./types";
import { WebOfflineEventCache } from "./web";

export type { OfflineEventCache, OfflineEventCacheRecord };
export { getOfflineCacheKey };

const OFFLINE_EVENT_KIND_BLACKLIST = new Set<number>();
const pendingWritesByPubkey = new Map<string, Promise<void>>();

const cache: OfflineEventCache = isNative
  ? new NativeOfflineEventCache()
  : new WebOfflineEventCache();

export const isOfflineCacheableEvent = (event: Event): boolean =>
  !OFFLINE_EVENT_KIND_BLACKLIST.has(event.kind);

export const readOfflineEventCache = async (
  pubkey: string,
): Promise<OfflineEventCacheRecord | null> => {
  return cache.readRecord(pubkey);
};

export const hydrateOfflineEvents = async (
  pubkey: string,
): Promise<Event[]> => {
  const record = await readOfflineEventCache(pubkey);
  return record?.events.filter(isOfflineCacheableEvent) ?? [];
};

export const persistOfflineEvent = async (
  pubkey: string,
  event: Event,
): Promise<void> => {
  if (!isOfflineCacheableEvent(event)) return;

  const previousWrite = pendingWritesByPubkey.get(pubkey) ?? Promise.resolve();
  const nextWrite = previousWrite.then(() =>
    persistOfflineEventOnce(pubkey, event),
  );
  const trackedWrite = nextWrite.finally(() => {
    if (pendingWritesByPubkey.get(pubkey) === trackedWrite) {
      pendingWritesByPubkey.delete(pubkey);
    }
  });
  pendingWritesByPubkey.set(pubkey, trackedWrite);
  await nextWrite;
};

const persistOfflineEventOnce = async (
  pubkey: string,
  event: Event,
): Promise<void> => {
  const current = await readOfflineEventCache(pubkey);
  const events = current?.events.filter(isOfflineCacheableEvent) ?? [];
  const existingIndex = events.findIndex((cached) => cached.id === event.id);

  if (existingIndex >= 0) {
    events[existingIndex] = event;
  } else {
    events.push(event);
  }

  await cache.writeRecord({
    version: OFFLINE_CACHE_VERSION,
    pubkey,
    events,
    updatedAt: Date.now(),
  });
};

export const clearOfflineCache = async (pubkey: string): Promise<void> => {
  await pendingWritesByPubkey.get(pubkey)?.catch(() => undefined);
  await cache.deleteRecord(pubkey);
};
