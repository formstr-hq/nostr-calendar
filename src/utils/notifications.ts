import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./platform";
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

/** Must run in the foreground; native background schedulers never prompt. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;

  try {
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

  await reconcileNotificationSchedule();
  return sortNotifications(scheduledInfo);
}

export function addNotificationClickListener(
  onNotificationClick: (route: string) => void,
): () => void {
  if (!isNative) return () => {};

  const listener = LocalNotifications.addListener(
    "localNotificationActionPerformed",
    (action) => {
      const extra = action.notification.extra as
        | Record<string, string>
        | undefined;
      const route = extra?.openRoute;
      const eventId = extra?.eventId;
      if (route) onNotificationClick(route);
      else if (eventId) onNotificationClick(`/notification-event/${eventId}`);
    },
  );

  return () => {
    listener.then((registeredListener) => registeredListener.remove());
  };
}

export async function cancelAllNotifications(): Promise<void> {
  if (!isNative) return;

  try {
    await clearBackgroundNotificationSchedule();
  } catch (error) {
    console.warn("Failed to cancel all notifications", error);
  }
}

export async function cancelEventNotifications(eventId: string): Promise<void> {
  if (!isNative) return;

  try {
    await cancelBackgroundEventNotifications(eventId);
    await reconcileNotificationSchedule();
  } catch (error) {
    console.warn("Failed to cancel notification", error);
  }
}
