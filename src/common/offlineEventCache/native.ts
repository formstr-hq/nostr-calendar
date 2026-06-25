import { Preferences } from "@capacitor/preferences";
import {
  getOfflineCacheKey,
  isOfflineCacheRecord,
  type OfflineEventCache,
  type OfflineEventCacheRecord,
} from "./types";

export class NativeOfflineEventCache implements OfflineEventCache {
  async readRecord(pubkey: string): Promise<OfflineEventCacheRecord | null> {
    const { value } = await Preferences.get({
      key: getOfflineCacheKey(pubkey),
    });
    if (!value) return null;

    try {
      const parsed = JSON.parse(value) as unknown;
      return isOfflineCacheRecord(parsed) && parsed.pubkey === pubkey
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  async writeRecord(record: OfflineEventCacheRecord): Promise<void> {
    await Preferences.set({
      key: getOfflineCacheKey(record.pubkey),
      value: JSON.stringify(record),
    });
  }

  async deleteRecord(pubkey: string): Promise<void> {
    await Preferences.remove({ key: getOfflineCacheKey(pubkey) });
  }
}
