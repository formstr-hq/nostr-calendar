import {
  getOfflineCacheKey,
  isOfflineCacheRecord,
  type OfflineEventCache,
  type OfflineEventCacheRecord,
} from "./types";

const DB_NAME = "nostr-calendar-offline-cache";
const DB_VERSION = 1;
const STORE_NAME = "offline-events";

interface IndexedDbOfflineRecord extends OfflineEventCacheRecord {
  key: string;
}

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

export class WebOfflineEventCache implements OfflineEventCache {
  async readRecord(pubkey: string): Promise<OfflineEventCacheRecord | null> {
    const key = getOfflineCacheKey(pubkey);
    const record = await withStore<IndexedDbOfflineRecord>(
      "readonly",
      (store) => store.get(key),
    );

    return isOfflineCacheRecord(record) && record.pubkey === pubkey
      ? record
      : null;
  }

  async writeRecord(record: OfflineEventCacheRecord): Promise<void> {
    await withStore("readwrite", (store) =>
      store.put({
        key: getOfflineCacheKey(record.pubkey),
        ...record,
      } satisfies IndexedDbOfflineRecord),
    );
  }

  async deleteRecord(pubkey: string): Promise<void> {
    await withStore("readwrite", (store) =>
      store.delete(getOfflineCacheKey(pubkey)),
    );
  }
}
