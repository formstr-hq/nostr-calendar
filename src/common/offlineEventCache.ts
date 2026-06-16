import { Preferences } from "@capacitor/preferences";
import type { Event } from "nostr-tools";
import { EventKinds } from "./EventConfigs";
import { isNative } from "../utils/platform";

const OFFLINE_CACHE_VERSION = 1;
const DB_NAME = "nostr-calendar-offline-cache";
const DB_VERSION = 1;
const STORE_NAME = "offline-events";

export interface OfflineEventCacheRecord {
  version: typeof OFFLINE_CACHE_VERSION;
  pubkey: string;
  events: Event[];
  updatedAt: number;
}

interface IndexedDbOfflineRecord extends OfflineEventCacheRecord {
  key: string;
}

const OFFLINE_EVENT_KINDS = new Set<number>([
  EventKinds.PrivateCalendarList,
  EventKinds.PublicCalendarEvent,
  EventKinds.PrivateCalendarEvent,
  EventKinds.UserProfile,
  EventKinds.DeletionEvent,
  EventKinds.ParticipantRemoval,
  EventKinds.SchedulingPage,
  EventKinds.SchedulingPagesList,
  EventKinds.BookingRequestGiftWrap,
  EventKinds.BookingResponseGiftWrap,
  EventKinds.PublicBusyList,
  EventKinds.PrivateRSVPEvent,
  EventKinds.PublicRSVPEvent,
  EventKinds.FormTemplate,
  EventKinds.FormResponse,
]);

const pendingWritesByPubkey = new Map<string, Promise<void>>();

export const getOfflineCacheKey = (pubkey: string): string =>
  `cal:offline:v${OFFLINE_CACHE_VERSION}:${pubkey}`;

export const isOfflineCacheableEvent = (event: Event): boolean =>
  OFFLINE_EVENT_KINDS.has(event.kind);

const isOfflineCacheRecord = (
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

const openOfflineDb = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  const db = await openOfflineDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const readNativeRecord = async (
  pubkey: string,
): Promise<OfflineEventCacheRecord | null> => {
  const { value } = await Preferences.get({ key: getOfflineCacheKey(pubkey) });
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return isOfflineCacheRecord(parsed) && parsed.pubkey === pubkey
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const readWebRecord = async (
  pubkey: string,
): Promise<OfflineEventCacheRecord | null> => {
  const key = getOfflineCacheKey(pubkey);
  const record = await withStore<IndexedDbOfflineRecord>("readonly", (store) =>
    store.get(key),
  );

  return isOfflineCacheRecord(record) && record.pubkey === pubkey
    ? record
    : null;
};

export const readOfflineEventCache = async (
  pubkey: string,
): Promise<OfflineEventCacheRecord | null> => {
  if (isNative) {
    return readNativeRecord(pubkey);
  }

  return readWebRecord(pubkey);
};

const writeOfflineEventCache = async (
  record: OfflineEventCacheRecord,
): Promise<void> => {
  const key = getOfflineCacheKey(record.pubkey);
  if (isNative) {
    await Preferences.set({ key, value: JSON.stringify(record) });
    return;
  }

  await withStore("readwrite", (store) =>
    store.put({
      key,
      ...record,
    } satisfies IndexedDbOfflineRecord),
  );
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

  await writeOfflineEventCache({
    version: OFFLINE_CACHE_VERSION,
    pubkey,
    events,
    updatedAt: Date.now(),
  });
};

export const clearOfflineCache = async (pubkey: string): Promise<void> => {
  await pendingWritesByPubkey.get(pubkey)?.catch(() => undefined);
  const key = getOfflineCacheKey(pubkey);
  if (isNative) {
    await Preferences.remove({ key });
    return;
  }

  await withStore("readwrite", (store) => store.delete(key));
};
