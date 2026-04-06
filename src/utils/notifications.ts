import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./platform";
import type { ICalendarEvent, IScheduledNotification } from "./types";
import { getNextOccurrenceInRange } from "./repeatingEventsHelper";

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
    for (const n of notifications) {
      const key = (n.extra as Record<string, string> | undefined)
        ?.notificationKey;
      if (key) {
        scheduledNotificationKeys.add(key);
      }
    }
  } catch (err) {
    console.warn("Failed to load pending notifications", err);
  }
}

/**
 * Generate a stable numeric ID from a string key.
 * Uses two IDs per occurrence: base for "10 min before", base+1 for "at event time".
 */
function hashToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  // Ensure positive and leave room for +1 (at-time notification)
  return (Math.abs(hash) >> 1) * 2;
}

/**
 * Build a unique key for a specific occurrence of an event.
 * For non-repeating events, this is just the eventId.
 * For repeating events, it includes the occurrence start time.
 */
function buildNotificationKey(
  id: string,
  occurrenceStart: number,
  isRepeating: boolean,
): string {
  if (!isRepeating) return id;
  return `${id}:${occurrenceStart}`;
}

export async function scheduleEventNotifications(
  event: ICalendarEvent,
): Promise<IScheduledNotification[]> {
  if (!isNative) return [];

  await initScheduledIds();

  const now = Date.now();
  const nDaysFromNow = now + 5 * 24 * 60 * 60 * 1000;

  const isRepeating = !!event.repeat?.rrule;

  // Determine the occurrence start time to schedule for
  let occurrenceStart: number;

  if (isRepeating) {
    const nextOccurrence = getNextOccurrenceInRange(event, now, nDaysFromNow);
    if (nextOccurrence === null) return [];
    occurrenceStart = nextOccurrence;
  } else {
    // Non-repeating: skip if already started
    if (event.begin <= now) return [];
    // Skip if more than 2 days away
    if (event.begin > nDaysFromNow) return [];
    occurrenceStart = event.begin;
  }

  const notificationKey = buildNotificationKey(
    event.id,
    occurrenceStart,
    isRepeating,
  );

  // Already scheduled for this specific occurrence — return existing info
  if (scheduledNotificationKeys.has(notificationKey)) {
    return buildNotificationInfo(occurrenceStart, now);
  }

  const baseId = hashToNumber(notificationKey);
  const tenMinBefore = occurrenceStart - 10 * 60 * 1000;

  const firstLocation = event.location?.find((location) =>
    location?.trim?.(),
  );
  const locationSuffix = firstLocation ? ` at ${firstLocation}` : "";

  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date; allowWhileIdle: boolean };
    extra: { eventId: string; notificationKey: string };
  }> = [];

  if (tenMinBefore > now) {
    notifications.push({
      id: baseId,
      title: `Upcoming: ${event.title}`,
      body: `Starts in 10 minutes${locationSuffix}`,
      schedule: { at: new Date(tenMinBefore), allowWhileIdle: true },
      extra: { eventId: event.id, notificationKey },
    });
  }

  if (occurrenceStart > now) {
    notifications.push({
      id: baseId + 1,
      title: event.title,
      body: `Starting now${locationSuffix}`,
      schedule: { at: new Date(occurrenceStart), allowWhileIdle: true },
      extra: { eventId: event.id, notificationKey },
    });
  }

  if (notifications.length === 0) return [];

  try {
    const permResult = await LocalNotifications.requestPermissions();
    if (permResult.display !== "granted") return [];

    await LocalNotifications.schedule({ notifications });
    scheduledNotificationKeys.add(notificationKey);
    console.log(
      `Scheduled notifications for ${event.id} (occurrence: ${new Date(occurrenceStart).toISOString()})`,
    );
    return buildNotificationInfo(occurrenceStart, now);
  } catch (err) {
    console.warn("Failed to schedule notification", err);
    return [];
  }
}

/**
 * Build notification info entries for the two scheduled notifications
 * (10 min before and at event time).
 */
function buildNotificationInfo(
  occurrenceStart: number,
  now: number,
): IScheduledNotification[] {
  const result: IScheduledNotification[] = [];
  const tenMinBefore = occurrenceStart - 10 * 60 * 1000;

  if (tenMinBefore > now) {
    result.push({ label: "10 minutes before", scheduledAt: tenMinBefore });
  }
  if (occurrenceStart > now) {
    result.push({ label: "At event start", scheduledAt: occurrenceStart });
  }
  return result;
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

  // Find and cancel all notifications belonging to this event
  // (covers all occurrences for recurring events)
  try {
    const { notifications } = await LocalNotifications.getPending();
    const toCancel = notifications.filter((n) => {
      const extra = n.extra as Record<string, string> | undefined;
      return extra?.eventId === eventId;
    });

    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel });
    }

    // Remove all keys for this event from the tracking set
    for (const key of scheduledNotificationKeys) {
      if (key === eventId || key.startsWith(`${eventId}:`)) {
        scheduledNotificationKeys.delete(key);
      }
    }
  } catch (err) {
    console.warn("Failed to cancel notification", err);
  }
}
