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
const FLUSH_DEBOUNCE_MS = 3000;

const pendingEventsByPubkey = new Map<string, Map<string, Event>>();
const flushTimersByPubkey = new Map<string, ReturnType<typeof setTimeout>>();
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

export const persistOfflineEvent = (pubkey: string, event: Event): void => {
  if (!isOfflineCacheableEvent(event)) return;

  const pendingEvents = pendingEventsByPubkey.get(pubkey) ?? new Map();
  pendingEvents.set(event.id, event);
  pendingEventsByPubkey.set(pubkey, pendingEvents);

  scheduleFlush(pubkey);
};

const scheduleFlush = (pubkey: string): void => {
  const existing = flushTimersByPubkey.get(pubkey);
  if (existing) clearTimeout(existing);

  flushTimersByPubkey.set(
    pubkey,
    setTimeout(() => {
      flushTimersByPubkey.delete(pubkey);
      const previous = activeFlushesByPubkey.get(pubkey) ?? Promise.resolve();
      const active = previous.then(() => flushPendingEvents(pubkey));
      activeFlushesByPubkey.set(pubkey, active);
      active.finally(() => {
        if (activeFlushesByPubkey.get(pubkey) === active) {
          activeFlushesByPubkey.delete(pubkey);
        }
        if ((pendingEventsByPubkey.get(pubkey)?.size ?? 0) > 0) {
          scheduleFlush(pubkey);
        }
      });
    }, FLUSH_DEBOUNCE_MS),
  );
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
  const timer = flushTimersByPubkey.get(pubkey);
  if (timer) {
    clearTimeout(timer);
    flushTimersByPubkey.delete(pubkey);
  }
  await activeFlushesByPubkey.get(pubkey)?.catch(() => undefined);
  pendingEventsByPubkey.delete(pubkey);
  persistedEventsByPubkey.delete(pubkey);
  await cache.deleteRecord(pubkey);
};
