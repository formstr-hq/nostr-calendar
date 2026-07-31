import { registerPlugin } from "@capacitor/core";
import { isNative } from "../utils/platform";

type NotificationSchedulerPlugin = {
  reconcile(): Promise<void>;
  clear(): Promise<void>;
  cancelEvent(options: { eventId: string }): Promise<void>;
};

const notificationScheduler = registerPlugin<NotificationSchedulerPlugin>(
  "NotificationScheduler",
);

export async function reconcileNotificationSchedule(): Promise<void> {
  if (!isNative) return;

  try {
    await notificationScheduler.reconcile();
  } catch (error) {
    console.warn("Failed to start notification reconciliation", error);
  }
}

export async function clearBackgroundNotificationSchedule(): Promise<void> {
  if (!isNative) return;

  try {
    await notificationScheduler.clear();
  } catch (error) {
    console.warn("Failed to clear background notifications", error);
  }
}

export async function cancelBackgroundEventNotifications(
  eventId: string,
): Promise<void> {
  if (!isNative || !eventId) return;

  try {
    await notificationScheduler.cancelEvent({ eventId });
  } catch (error) {
    console.warn("Failed to cancel background event notifications", error);
  }
}
