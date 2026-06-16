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
const pendingEventsByPubkey = new Map<string, Map<string, Event>>();
const scheduledFlushesByPubkey = new Map<string, Promise<void>>();
const activeFlushesByPubkey = new Map<string, Promise<void>>();
// In-memory mirror of what's persisted — avoids a read-before-write on every flush.
const persistedEventsByPubkey = new Map<string, Map<string, Event>>();

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
  const events = record?.events.filter(isOfflineCacheableEvent) ?? [];
  persistedEventsByPubkey.set(pubkey, new Map(events.map((e) => [e.id, e])));
  return events;
};

export const persistOfflineEvent = async (
  pubkey: string,
  event: Event,
): Promise<void> => {
  if (!isOfflineCacheableEvent(event)) return;

  const pendingEvents = pendingEventsByPubkey.get(pubkey) ?? new Map();
  pendingEvents.set(event.id, event);
  pendingEventsByPubkey.set(pubkey, pendingEvents);

  await scheduleFlush(pubkey);
};

const scheduleFlush = (pubkey: string): Promise<void> => {
  const scheduledFlush = scheduledFlushesByPubkey.get(pubkey);
  if (scheduledFlush) return scheduledFlush;

  const flush = new Promise<void>((resolve, reject) => {
    scheduleIdleTask(() => {
      scheduledFlushesByPubkey.delete(pubkey);
      const previousFlush =
        activeFlushesByPubkey.get(pubkey) ?? Promise.resolve();
      const activeFlush = previousFlush.then(() => flushPendingEvents(pubkey));
      activeFlushesByPubkey.set(pubkey, activeFlush);

      activeFlush.then(resolve, reject).finally(() => {
        if (activeFlushesByPubkey.get(pubkey) === activeFlush) {
          activeFlushesByPubkey.delete(pubkey);
        }
        if ((pendingEventsByPubkey.get(pubkey)?.size ?? 0) > 0) {
          void scheduleFlush(pubkey);
        }
      });
    });
  });

  scheduledFlushesByPubkey.set(pubkey, flush);
  return flush;
};

const scheduleIdleTask = (callback: () => void): void => {
  if (
    typeof window !== "undefined" &&
    typeof window.requestIdleCallback === "function"
  ) {
    window.requestIdleCallback(callback, { timeout: 1000 });
    return;
  }

  setTimeout(callback, 100);
};

const flushPendingEvents = async (pubkey: string): Promise<void> => {
  const pendingEvents = pendingEventsByPubkey.get(pubkey);
  if (!pendingEvents || pendingEvents.size === 0) return;

  pendingEventsByPubkey.delete(pubkey);
  const eventsToPersist = Array.from(pendingEvents.values()).filter(
    isOfflineCacheableEvent,
  );
  if (eventsToPersist.length === 0) return;

  // Use in-memory mirror — avoids a blocking Preferences.get + JSON.parse on every flush.
  const eventsById =
    persistedEventsByPubkey.get(pubkey) ?? new Map<string, Event>();
  if (!persistedEventsByPubkey.has(pubkey)) {
    persistedEventsByPubkey.set(pubkey, eventsById);
  }

  const newlyAdded: string[] = [];
  for (const event of eventsToPersist) {
    if (!eventsById.has(event.id)) newlyAdded.push(event.id);
    eventsById.set(event.id, event);
  }

  try {
    await cache.writeRecord({
      version: OFFLINE_CACHE_VERSION,
      pubkey,
      events: Array.from(eventsById.values()),
      updatedAt: Date.now(),
    });
  } catch (error) {
    const restoredEvents = pendingEventsByPubkey.get(pubkey) ?? new Map();
    for (const event of eventsToPersist) {
      restoredEvents.set(event.id, event);
    }
    pendingEventsByPubkey.set(pubkey, restoredEvents);
    // Revert mirror to pre-flush state for newly added events.
    for (const id of newlyAdded) {
      eventsById.delete(id);
    }
    throw error;
  }
};

export const clearOfflineCache = async (pubkey: string): Promise<void> => {
  await scheduledFlushesByPubkey.get(pubkey)?.catch(() => undefined);
  await activeFlushesByPubkey.get(pubkey)?.catch(() => undefined);
  pendingEventsByPubkey.delete(pubkey);
  persistedEventsByPubkey.delete(pubkey);
  await cache.deleteRecord(pubkey);
};
