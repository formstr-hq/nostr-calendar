import type { NotificationPreference } from "./types";
import { DEFAULT_NOTIFICATION_PREFERENCE } from "./calendarListTypes";

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
  return resolveNotificationPreference(eventPreference, listPreference) === "enabled";
}
