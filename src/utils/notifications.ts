import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./platform";
import type { ICalendarEvent, IScheduledNotification } from "./types";
import { getNextOccurrenceInRange } from "./repeatingEventsHelper";
import {
  formatNotificationOffsetLabel,
  getNotificationOffsetsForEvent,
} from "./notificationPreferences";

const scheduledNotificationKeys = new Set<string>();
let initialized = false;

/**
 * Load already-pending notification IDs so we don't re-schedule
 * after an app restart.
 */
async function initScheduledIds(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const { notifications } = await LocalNotifications.getPending();
    for (const notification of notifications) {
      const key = (notification.extra as Record<string, string> | undefined)
        ?.notificationKey;
      if (key) {
        scheduledNotificationKeys.add(key);
      }
    }
  } catch (err) {
    console.warn("Failed to load pending notifications", err);
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
  return `${eventId}:${occurrenceStart}:${offsetMinutes}`;
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

export async function scheduleEventNotifications(
  event: ICalendarEvent,
): Promise<IScheduledNotification[]> {
  if (!isNative) return [];

  await initScheduledIds();

  const now = Date.now();
  const nDaysFromNow = now + 5 * 24 * 60 * 60 * 1000;
  const isRepeating = !!event.repeat?.rrule;
  const reminderOffsets = await getNotificationOffsetsForEvent(event.id);

  if (reminderOffsets.length === 0) {
    return [];
  }

  let occurrenceStart: number;

  if (isRepeating) {
    const nextOccurrence = getNextOccurrenceInRange(event, now, nDaysFromNow);
    if (nextOccurrence === null) return [];
    occurrenceStart = nextOccurrence;
  } else {
    if (event.begin <= now) return [];
    if (event.begin > nDaysFromNow) return [];
    occurrenceStart = event.begin;
  }

  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date; allowWhileIdle: boolean };
    extra: { eventId: string; notificationKey: string };
  }> = [];
  const scheduledInfo: IScheduledNotification[] = [];

  for (const offsetMinutes of reminderOffsets) {
    const scheduledAt = occurrenceStart - offsetMinutes * 60 * 1000;
    if (scheduledAt <= now) {
      continue;
    }

    const notificationKey = buildNotificationKey(
      event.id,
      occurrenceStart,
      offsetMinutes,
    );

    scheduledInfo.push({
      label: formatNotificationOffsetLabel(offsetMinutes),
      scheduledAt,
    });

    if (scheduledNotificationKeys.has(notificationKey)) {
      continue;
    }

    const { title, body } = buildNotificationContent(event, offsetMinutes);
    notifications.push({
      id: hashToNumber(notificationKey),
      title,
      body,
      schedule: { at: new Date(scheduledAt), allowWhileIdle: true },
      extra: { eventId: event.id, notificationKey },
    });
  }

  if (scheduledInfo.length === 0) {
    return [];
  }

  if (notifications.length === 0) {
    return sortNotifications(scheduledInfo);
  }

  try {
    const permResult = await LocalNotifications.requestPermissions();
    if (permResult.display !== "granted") return [];

    await LocalNotifications.schedule({ notifications });
    notifications.forEach((notification) => {
      scheduledNotificationKeys.add(notification.extra.notificationKey);
    });

    console.log(
      `Scheduled notifications for ${event.id} (occurrence: ${new Date(occurrenceStart).toISOString()})`,
    );
    return sortNotifications(scheduledInfo);
  } catch (err) {
    console.warn("Failed to schedule notification", err);
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
      if (eventId) {
        onEventClick(eventId);
      }
    },
  );

  return () => {
    listener.then((l) => l.remove());
  };
}

export async function cancelAllNotifications(): Promise<void> {
  if (!isNative) return;

  try {
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.length > 0) {
      await LocalNotifications.cancel({ notifications });
    }
    scheduledNotificationKeys.clear();
  } catch (err) {
    console.warn("Failed to cancel all notifications", err);
  }
}

export async function cancelEventNotifications(eventId: string): Promise<void> {
  if (!isNative) return;

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
      if (key === eventId || key.startsWith(`${eventId}:`)) {
        scheduledNotificationKeys.delete(key);
      }
    }
  } catch (err) {
    console.warn("Failed to cancel notification", err);
  }
}
