import {
  getDeviceItem,
  removeDeviceItem,
  setDeviceItem,
} from "../common/localStorage";
import { DEFAULT_NOTIFICATION_PREFERENCE } from "./calendarListTypes";
import type { NotificationPreference } from "./types";
import { reconcileNotificationSchedule } from "../plugins/notificationScheduler";

export interface EventNotificationPreference {
  offsetsMinutes: number[];
}

export const DEFAULT_NOTIFICATION_OFFSETS = [10, 0];
export const NOTIFICATION_PREFERENCES_STORAGE_KEY =
  "cal:notification-preferences";

let preferenceCache: Record<string, EventNotificationPreference> | null = null;

export function normalizeNotificationOffsets(
  offsetsMinutes: number[],
): number[] {
  return Array.from(
    new Set(
      offsetsMinutes
        .map((offset) => Math.floor(offset))
        .filter((offset) => Number.isFinite(offset) && offset >= 0),
    ),
  ).sort((a, b) => b - a);
}

export function areNotificationOffsetsEqual(
  left: number[],
  right: number[],
): boolean {
  const normalizedLeft = normalizeNotificationOffsets(left);
  const normalizedRight = normalizeNotificationOffsets(right);

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

export function formatNotificationOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) {
    return "At event start";
  }

  if (offsetMinutes % (24 * 60) === 0) {
    const days = offsetMinutes / (24 * 60);
    return `${days} day${days === 1 ? "" : "s"} before`;
  }

  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before`;
  }

  if (offsetMinutes === 1) {
    return "1 minute before";
  }

  return `${offsetMinutes} minutes before`;
}

async function loadPreferenceMap(): Promise<
  Record<string, EventNotificationPreference>
> {
  if (preferenceCache) {
    return preferenceCache;
  }

  const stored = await getDeviceItem<
    Record<string, EventNotificationPreference>
  >(NOTIFICATION_PREFERENCES_STORAGE_KEY, {});
  preferenceCache = stored;
  return stored;
}

async function savePreferenceMap(
  preferences: Record<string, EventNotificationPreference>,
) {
  preferenceCache = preferences;

  if (Object.keys(preferences).length === 0) {
    await removeDeviceItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    await reconcileNotificationSchedule();
    return;
  }

  await setDeviceItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, preferences);
  await reconcileNotificationSchedule();
}

export async function getNotificationPreference(
  eventId: string,
): Promise<EventNotificationPreference | null> {
  if (!eventId) {
    return null;
  }

  const preferences = await loadPreferenceMap();
  return preferences[eventId] ?? null;
}

export async function getNotificationOffsetsForEvent(
  eventId: string,
): Promise<number[]> {
  const preference = await getNotificationPreference(eventId);
  if (!preference) {
    return DEFAULT_NOTIFICATION_OFFSETS;
  }

  return preference.offsetsMinutes;
}

export async function setNotificationPreference(
  eventId: string,
  offsetsMinutes: number[],
) {
  if (!eventId) {
    return;
  }

  const preferences = await loadPreferenceMap();
  const nextPreferences = {
    ...preferences,
    [eventId]: {
      offsetsMinutes: normalizeNotificationOffsets(offsetsMinutes),
    },
  };

  await savePreferenceMap(nextPreferences);
}

export async function clearNotificationPreference(eventId: string) {
  if (!eventId) {
    return;
  }

  const preferences = await loadPreferenceMap();
  if (!(eventId in preferences)) {
    return;
  }

  const { [eventId]: _removed, ...rest } = preferences;
  await savePreferenceMap(rest);
}

export function resetNotificationPreferencesCache() {
  preferenceCache = null;
}

export function normalizeNotificationPreference(
  value: unknown,
): NotificationPreference | undefined {
  if (value === "enabled" || value === "disabled") {
    return value;
  }
  return undefined;
}

export function resolveNotificationPreference(
  eventPreference?: NotificationPreference,
  listPreference?: NotificationPreference,
): NotificationPreference {
  return (
    normalizeNotificationPreference(eventPreference) ??
    normalizeNotificationPreference(listPreference) ??
    DEFAULT_NOTIFICATION_PREFERENCE
  );
}

export function shouldScheduleNotifications(
  eventPreference?: NotificationPreference,
  listPreference?: NotificationPreference,
): boolean {
  return (
    resolveNotificationPreference(eventPreference, listPreference) === "enabled"
  );
}
