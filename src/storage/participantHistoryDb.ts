export const PARTICIPANT_HISTORY_DB_NAME = "nostr-calendar-participants";
const PARTICIPANT_HISTORY_DB_VERSION = 1;
const PARTICIPANTS_STORE = "participants";

export interface ParticipantHistoryRecord {
  accountPubkey: string;
  participantPubkey: string;
  firstInteractionAt: number;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  profileCreatedAt?: number;
}

let databasePromise: Promise<IDBDatabase> | undefined;

const openDatabase = (): Promise<IDBDatabase> | undefined => {
  if (typeof indexedDB === "undefined") return undefined;
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      PARTICIPANT_HISTORY_DB_NAME,
      PARTICIPANT_HISTORY_DB_VERSION,
    );
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PARTICIPANTS_STORE)) {
        request.result.createObjectStore(PARTICIPANTS_STORE, {
          keyPath: ["accountPubkey", "participantPubkey"],
        });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });

  return databasePromise;
};

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });

export const loadParticipantHistory = async (
  accountPubkey: string,
): Promise<ParticipantHistoryRecord[]> => {
  const pendingDatabase = openDatabase();
  if (!pendingDatabase) return [];

  const database = await pendingDatabase;
  const transaction = database.transaction(PARTICIPANTS_STORE, "readonly");
  const request = transaction
    .objectStore(PARTICIPANTS_STORE)
    .getAll(IDBKeyRange.bound([accountPubkey, ""], [accountPubkey, "\uffff"]));
  const records = await new Promise<ParticipantHistoryRecord[]>(
    (resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    },
  );
  await transactionDone(transaction);
  return records;
};

export const upsertParticipantHistory = async (
  records: ParticipantHistoryRecord[],
): Promise<void> => {
  if (records.length === 0) return;
  const pendingDatabase = openDatabase();
  if (!pendingDatabase) return;

  const database = await pendingDatabase;
  const transaction = database.transaction(PARTICIPANTS_STORE, "readwrite");
  const store = transaction.objectStore(PARTICIPANTS_STORE);

  for (const record of records) {
    const request = store.get([record.accountPubkey, record.participantPubkey]);
    request.onsuccess = () => {
      const existing = request.result as ParticipantHistoryRecord | undefined;
      store.put({
        ...existing,
        ...record,
        firstInteractionAt: existing
          ? Math.min(existing.firstInteractionAt, record.firstInteractionAt)
          : record.firstInteractionAt,
      });
    };
  }

  await transactionDone(transaction);
};

export const deleteParticipantHistoryDatabase = async (): Promise<void> => {
  if (typeof indexedDB === "undefined") return;

  const pendingDatabase = databasePromise;
  databasePromise = undefined;
  if (pendingDatabase) {
    try {
      (await pendingDatabase).close();
    } catch {
      // A failed open has no live connection to close.
    }
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PARTICIPANT_HISTORY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
