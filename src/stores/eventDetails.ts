import { create } from "zustand";
import { ICalendarEvent } from "./events";

type Action = "edit" | "create" | "view";

export const TEMP_CALENDAR_ID = "Temp calendar id";

export const useEventDetails = create<{
  event: ICalendarEvent | null;
  action: "edit" | "create" | "view";
  selectedEventId: string | null;
  updateEventDetails: <T extends keyof ICalendarEvent>(
    key: T,
    value: ICalendarEvent[T],
  ) => void;
  updateEvent: (event: ICalendarEvent, action?: Action) => void;
  closeEventDetails: () => void;
  setSelectedEvent: (eventId: string | null) => void;
}>((set) => ({
  event: null,
  action: "view",
  selectedEventId: null,
  updateEvent: (event, action = "view") => {
    set({ action, event, selectedEventId: event.id });
  },
  closeEventDetails: () =>
    set({ event: null, action: "view", selectedEventId: null }),
  updateEventDetails: (key, value) =>
    set(({ event }) => {
      if (!event) {
        return { event };
      }
      return { event: { ...event, [key]: value } };
    }),
  setSelectedEvent: (eventId) => set({ selectedEventId: eventId }),
}));
