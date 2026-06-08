import { create } from "zustand";
import type { IScheduledNotification } from "../utils/types";

interface NotificationsState {
  /** Map of event ID → scheduled notifications for that event */
  byEventId: Record<string, IScheduledNotification[]>;
  setNotifications: (
    eventId: string,
    notifications: IScheduledNotification[],
  ) => void;
  removeNotifications: (eventId: string) => void;
  clear: () => void;
}

export const useNotifications = create<NotificationsState>((set) => ({
  byEventId: {},

  setNotifications: (eventId, notifications) => {
    set((state) => {
      if (notifications.length === 0) {
        const { [eventId]: _removed, ...rest } = state.byEventId;
        return { byEventId: rest };
      }

      return {
        byEventId: { ...state.byEventId, [eventId]: notifications },
      };
    });
  },

  removeNotifications: (eventId) => {
    set((state) => {
      const { [eventId]: _, ...rest } = state.byEventId;
      return { byEventId: rest };
    });
  },

  clear: () => set({ byEventId: {} }),
}));
