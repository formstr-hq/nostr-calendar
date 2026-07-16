import { LocalNotifications } from "@capacitor/local-notifications";
import { isAndroidNative, isNative } from "./platform";
import type { ICalendarEvent, IScheduledNotification } from "./types";
import { getOccurrencesInRange } from "./repeatingEventsHelper";
import {
  formatNotificationOffsetLabel,
  getNotificationOffsetsForEvent,
} from "./notificationPreferences";
import {
  cancelBackgroundEventNotifications,
  clearBackgroundNotificationSchedule,
  reconcileNotificationSchedule,
} from "../plugins/notificationScheduler";

export const NOTIFICATION_SCHEDULE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

const scheduledNotificationKeys = new Set<string>();
let initialized = false;
const NOTIFICATION_KEY_VERSION = "v2";
const NOTIFICATION_KEY_PREFIX = `${NOTIFICATION_KEY_VERSION}:`;

/** Load iOS pending IDs and remove notifications from older schedulers. */
async function initScheduledIds(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const { notifications } = await LocalNotifications.getPending();

    // Android event reminders are now owned exclusively by NotificationWorker.
    if (isAndroidNative()) {
      if (notifications.length > 0) {
        await LocalNotifications.cancel({ notifications });
      }
      return;
    }

    const legacyNotifications = [];
    for (const notification of notifications) {
      const key = (notification.extra as Record<string, string> | undefined)
        ?.notificationKey;
      if (key?.startsWith(NOTIFICATION_KEY_PREFIX)) {
        scheduledNotificationKeys.add(key);
      } else {
        legacyNotifications.push(notification);
      }
    }

    if (legacyNotifications.length > 0) {
      await LocalNotifications.cancel({ notifications: legacyNotifications });
    }
  } catch (error) {
    console.warn("Failed to load pending notifications", error);
  }
}

function hashToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) || 1;
}

function buildNotificationKey(
  eventId: string,
  occurrenceStart: number,
  offsetMinutes: number,
): string {
  return `${NOTIFICATION_KEY_VERSION}:${eventId}:${occurrenceStart}:m${offsetMinutes}`;
}

function notificationKeyMatchesEvent(key: string, eventId: string): boolean {
  return key.startsWith(`${NOTIFICATION_KEY_PREFIX}${eventId}:`);
}

function getLocationSuffix(event: ICalendarEvent): string {
  const firstLocation = event.location.find((location) => !!location);
  return firstLocation ? ` at ${firstLocation}` : "";
}

function buildNotificationContent(
  event: ICalendarEvent,
  offsetMinutes: number,
): { title: string; body: string } {
  const locationSuffix = getLocationSuffix(event);

  if (offsetMinutes === 0) {
    return {
      title: event.title,
      body: `Starting now${locationSuffix}`,
    };
  }

  return {
    title: `Upcoming: ${event.title}`,
    body: `Starts in ${offsetMinutes} minute${offsetMinutes === 1 ? "" : "s"}${locationSuffix}`,
  };
}

function sortNotifications(
  notifications: IScheduledNotification[],
): IScheduledNotification[] {
  return [...notifications].sort(
    (left, right) => left.scheduledAt - right.scheduledAt,
  );
}

type NotificationCandidate = {
  occurrenceStart: number;
  offsetMinutes: number;
  scheduledAt: number;
};

function buildCandidates(
  event: ICalendarEvent,
  reminderOffsets: number[],
  now: number,
): NotificationCandidate[] {
  if (reminderOffsets.length === 0) return [];

  const scheduleEnd = now + NOTIFICATION_SCHEDULE_WINDOW_MS;
  const maxOffsetMs = Math.max(...reminderOffsets) * 60 * 1000;
  const occurrences = getOccurrencesInRange(
    event,
    now,
    scheduleEnd + maxOffsetMs,
  );
  const candidates: NotificationCandidate[] = [];

  for (const occurrenceStart of occurrences) {
    for (const offsetMinutes of reminderOffsets) {
      const scheduledAt = occurrenceStart - offsetMinutes * 60 * 1000;
      if (scheduledAt > now && scheduledAt <= scheduleEnd) {
        candidates.push({ occurrenceStart, offsetMinutes, scheduledAt });
      }
    }
  }

  return candidates.sort((left, right) => left.scheduledAt - right.scheduledAt);
}

export async function getEventNotificationSchedule(
  event: ICalendarEvent,
  now = Date.now(),
): Promise<IScheduledNotification[]> {
  const reminderOffsets = await getNotificationOffsetsForEvent(event.id);
  return buildCandidates(event, reminderOffsets, now).map((candidate) => ({
    label: formatNotificationOffsetLabel(candidate.offsetMinutes),
    scheduledAt: candidate.scheduledAt,
  }));
}

/** Must run in the foreground; the Android worker never prompts the user. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;

  try {
    await initScheduledIds();
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") {
      await reconcileNotificationSchedule();
      return true;
    }
    const requested = await LocalNotifications.requestPermissions();
    if (requested.display === "granted") {
      await reconcileNotificationSchedule();
      return true;
    }
    return false;
  } catch (error) {
    console.warn("Failed to request notification permission", error);
    return false;
  }
}

export async function scheduleEventNotifications(
  event: ICalendarEvent,
): Promise<IScheduledNotification[]> {
  if (!isNative) return [];

  const permissionGranted = await requestNotificationPermission();
  if (!permissionGranted) return [];

  const reminderOffsets = await getNotificationOffsetsForEvent(event.id);
  const candidates = buildCandidates(event, reminderOffsets, Date.now());
  const scheduledInfo = candidates.map((candidate) => ({
    label: formatNotificationOffsetLabel(candidate.offsetMinutes),
    scheduledAt: candidate.scheduledAt,
  }));

  if (isAndroidNative()) {
    await reconcileNotificationSchedule();
    return scheduledInfo;
  }

  await initScheduledIds();
  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date; allowWhileIdle: boolean };
    extra: { eventId: string; notificationKey: string };
  }> = [];

  for (const candidate of candidates) {
    const notificationKey = buildNotificationKey(
      event.id,
      candidate.occurrenceStart,
      candidate.offsetMinutes,
    );
    if (scheduledNotificationKeys.has(notificationKey)) continue;

    const { title, body } = buildNotificationContent(
      event,
      candidate.offsetMinutes,
    );
    notifications.push({
      id: hashToNumber(notificationKey),
      title,
      body,
      schedule: {
        at: new Date(candidate.scheduledAt),
        allowWhileIdle: true,
      },
      extra: { eventId: event.id, notificationKey },
    });
  }

  if (notifications.length === 0) return sortNotifications(scheduledInfo);

  try {
    await LocalNotifications.schedule({ notifications });
    notifications.forEach((notification) => {
      scheduledNotificationKeys.add(notification.extra.notificationKey);
    });
    return sortNotifications(scheduledInfo);
  } catch (error) {
    console.warn("Failed to schedule notification", error);
    return [];
  }
}

export function addNotificationClickListener(
  onEventClick: (eventId: string) => void,
): () => void {
  if (!isNative) return () => {};

  const listener = LocalNotifications.addListener(
    "localNotificationActionPerformed",
    (action) => {
      const eventId = (
        action.notification.extra as Record<string, string> | undefined
      )?.eventId;
      if (eventId) onEventClick(eventId);
    },
  );

  return () => {
    listener.then((registeredListener) => registeredListener.remove());
  };
}

export async function cancelAllNotifications(): Promise<void> {
  if (!isNative) return;

  try {
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.length > 0) {
      await LocalNotifications.cancel({ notifications });
    }
    await clearBackgroundNotificationSchedule();
    scheduledNotificationKeys.clear();
    initialized = false;
  } catch (error) {
    console.warn("Failed to cancel all notifications", error);
  }
}

export async function cancelEventNotifications(eventId: string): Promise<void> {
  if (!isNative) return;

  if (isAndroidNative()) {
    // Cancel synchronously so a deleted/edited event cannot fire while Android
    // is waiting to run the follow-up WorkManager reconciliation.
    await cancelBackgroundEventNotifications(eventId);
    await reconcileNotificationSchedule();
    return;
  }

  try {
    const { notifications } = await LocalNotifications.getPending();
    const toCancel = notifications.filter((notification) => {
      const extra = notification.extra as Record<string, string> | undefined;
      return extra?.eventId === eventId;
    });

    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel });
    }

    for (const key of scheduledNotificationKeys) {
      if (notificationKeyMatchesEvent(key, eventId)) {
        scheduledNotificationKeys.delete(key);
      }
    }
  } catch (error) {
    console.warn("Failed to cancel notification", error);
  }
}
