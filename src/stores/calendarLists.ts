/**
 * Calendar Lists Store
 *
 * Manages the user's private calendar collections (kind 32123).
 * Each calendar is a named, colored list of event references.
 *
 * Key behaviors:
 * - Loads cached calendars from secure storage on init
 * - Fetches calendars from relays and merges with cache
 * - Auto-creates a default calendar if user has none
 * - Tracks visibility toggles (client-side only, not synced to relay)
 * - Provides helper to get all event refs from visible calendars
 */

import { create } from "zustand";
import {
  getSecureItem,
  setSecureItem,
  setItem,
  getItem,
  removeSecureItem,
} from "../common/localStorage";
import {
  fetchCalendarLists,
  publishCalendarList,
  addEventToCalendarList as addEventToCalList,
  removeEventFromCalendarList as removeEventFromCalList,
  moveEventBetweenCalendarLists,
  createCalendar,
} from "../common/calendarList";
import { getUserPublicKey, publishDeletionEvent } from "../common/nostr";
import { EventKinds } from "../common/EventConfigs";
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  type ICalendarList,
} from "../utils/calendarListTypes";
import type { SubscriptionHandle } from "../common/nostrRuntime";
import { isNative } from "../utils/platform";

const CALENDAR_LISTS_STORAGE_KEY = "cal:calendar_lists";
const CALENDAR_VISIBILITY_KEY = "cal:calendar_visibility";

/**
 * Saves calendars to secure storage for offline access.
 */
const saveCalendarsToStorage = (calendars: ICalendarList[]) => {
  setSecureItem(CALENDAR_LISTS_STORAGE_KEY, calendars);
};

/**
 * Saves visibility state separately (it's client-side only,
 * not part of the Nostr event).
 */
const saveVisibilityToStorage = (visibility: Record<string, boolean>) => {
  setItem(CALENDAR_VISIBILITY_KEY, visibility);
};

let subscriptionHandle: SubscriptionHandle | undefined;

const withNotificationPreference = (
  calendar: ICalendarList,
): ICalendarList => ({
  ...calendar,
  notificationPreference:
    calendar.notificationPreference ?? DEFAULT_NOTIFICATION_PREFERENCE,
});

const normalizePreferenceForPublish = (
  preference?: "enabled" | "disabled",
): "disabled" | undefined => {
  return preference === "disabled" ? "disabled" : undefined;
};

interface CalendarListsState {
  calendars: ICalendarList[];
  isLoaded: boolean;

  loadCachedCalendars: () => Promise<void>;
  fetchCalendars: () => Promise<void>;
  createCalendar: (
    title: string,
    description?: string,
    color?: string,
    notificationPreference?: "enabled" | "disabled",
  ) => Promise<ICalendarList>;
  updateCalendar: (calendar: ICalendarList) => Promise<void>;
  deleteCalendar: (calendarId: string) => Promise<void>;
  toggleVisibility: (calendarId: string) => void;
  addEventToCalendar: (calendarId: string, eventRef: string[]) => Promise<void>;
  removeEventFromCalendar: (
    calendarId: string,
    eventRef: string[],
  ) => Promise<void>;
  moveEventToCalendar: (
    targetCalendarId: string,
    eventCoordinate: string,
    eventRef: string[],
  ) => Promise<void>;
  getVisibleEventRefs: () => string[][];
  getAllEventIds: () => string[];
  clearCachedCalendars: () => Promise<void>;
}

export const useCalendarLists = create<CalendarListsState>((set, get) => ({
  calendars: [],
  isLoaded: false,

  /**
   * Loads calendars from secure storage for immediate display
   * before network fetch completes.
   */
  loadCachedCalendars: async () => {
    if (!isNative) {
      return;
    }
    const cached = await getSecureItem<ICalendarList[]>(
      CALENDAR_LISTS_STORAGE_KEY,
      [],
    );
    const visibility = await getSecureItem<Record<string, boolean>>(
      CALENDAR_VISIBILITY_KEY,
      {},
    );

    // Restore visibility state from separate storage
    const calendarsWithVisibility = cached.map((cal) =>
      withNotificationPreference({
        ...cal,
        isVisible: visibility[cal.id] !== undefined ? visibility[cal.id] : true,
      }),
    );

    if (calendarsWithVisibility.length > 0) {
      set({ calendars: calendarsWithVisibility, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  /**
   * Fetches calendar lists from relays via nostrRuntime.
   * Merges fetched calendars with existing state (keeps newer versions).
   * Auto-creates a default calendar if user has no calendars after fetch.
   */
  fetchCalendars: async () => {
    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    const visibility = getItem<Record<string, boolean>>(
      CALENDAR_VISIBILITY_KEY,
      {},
    );

    // Track fetched calendar IDs to detect when fetch is complete
    const fetchedCalendars: ICalendarList[] = [];

    subscriptionHandle = fetchCalendarLists(
      userPubkey,
      (list) => {
        // Preserve client-side visibility state
        list.isVisible =
          visibility[list.id] !== undefined ? visibility[list.id] : true;
        list.notificationPreference =
          list.notificationPreference ?? DEFAULT_NOTIFICATION_PREFERENCE;
        fetchedCalendars.push(list);

        // Merge with existing: replace if newer, add if new
        set((state) => {
          const existingIndex = state.calendars.findIndex(
            (c) => c.id === list.id,
          );
          let updatedCalendars: ICalendarList[];

          if (existingIndex >= 0) {
            // Replace only if the fetched version is newer
            if (list.createdAt > state.calendars[existingIndex].createdAt) {
              updatedCalendars = [...state.calendars];
              updatedCalendars[existingIndex] = list;
            } else {
              return state; // Keep existing, no update
            }
          } else {
            updatedCalendars = [...state.calendars, list];
          }

          saveCalendarsToStorage(updatedCalendars);
          return { calendars: updatedCalendars };
        });
      },
      // At EOSE, create a default calendar if no calendars are found for the user.
      // This handles the case where the user has no calendars at all.
      () => {
        set(() => {
          return {
            isLoaded: true,
          };
        });
      },
    );

    setTimeout(async () => {
      const { calendars } = get();
      if (calendars.length === 0) {
        set({ isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    }, 5000);
  },

  /**
   * Creates a new calendar with the given properties and publishes it.
   */
  createCalendar: async (
    title,
    description = "",
    color = "#4285f4",
    notificationPreference = DEFAULT_NOTIFICATION_PREFERENCE,
  ) => {
    const newCalendar = await createCalendar({
      title,
      description,
      color,
      notificationPreference: normalizePreferenceForPublish(
        notificationPreference,
      ),
      eventId: "",
      eventRefs: [],
      isVisible: true,
    });
    const calendarWithDefaults = withNotificationPreference(newCalendar);

    set((state) => {
      const updated = [...state.calendars, calendarWithDefaults];
      saveCalendarsToStorage(updated);
      return { calendars: updated };
    });

    return calendarWithDefaults;
  },

  /**
   * Updates calendar metadata (title, description, color) and republishes.
   */
  updateCalendar: async (calendar) => {
    const updatedForPublish = {
      ...calendar,
      notificationPreference: normalizePreferenceForPublish(
        calendar.notificationPreference,
      ),
      createdAt: Math.floor(Date.now() / 1000),
    };
    const publishedEvent = await publishCalendarList(updatedForPublish);
    const updatedForState = withNotificationPreference({
      ...updatedForPublish,
      eventId: publishedEvent.id,
    });

    set((state) => {
      const calendars = state.calendars.map((c) =>
        c.id === calendar.id ? updatedForState : c,
      );
      saveCalendarsToStorage(calendars);
      return { calendars };
    });
  },

  /**
   * Deletes a calendar by publishing a NIP-09 kind 5 deletion event
   * and removing it from local state.
   */
  deleteCalendar: async (calendarId) => {
    const userPubkey = await getUserPublicKey();
    const coordinate = `${EventKinds.PrivateCalendarList}:${userPubkey}:${calendarId}`;
    const calendar = get().calendars.find((c) => c.id === calendarId);
    const eventIds = calendar?.eventId ? [calendar.eventId] : [];

    await publishDeletionEvent({
      coordinates: [coordinate],
      eventIds,
      kinds: [EventKinds.PrivateCalendarList],
    });

    set((state) => {
      const calendars = state.calendars.filter((c) => c.id !== calendarId);
      saveCalendarsToStorage(calendars);
      return { calendars };
    });
  },

  /**
   * Toggles a calendar's visibility in the UI.
   * This is client-side only and persisted separately from the Nostr event.
   */
  toggleVisibility: (calendarId) => {
    set((state) => {
      const calendars = state.calendars.map((c) =>
        c.id === calendarId ? { ...c, isVisible: !c.isVisible } : c,
      );

      // Persist visibility state
      const visibility: Record<string, boolean> = {};
      calendars.forEach((c) => {
        visibility[c.id] = c.isVisible;
      });
      saveVisibilityToStorage(visibility);
      saveCalendarsToStorage(calendars);

      return { calendars };
    });
  },

  /**
   * Adds an event reference to a specific calendar and republishes.
   */
  addEventToCalendar: async (calendarId, eventRef) => {
    const calendar = get().calendars.find((c) => c.id === calendarId);
    if (!calendar) {
      throw new Error(`Calendar not found: ${calendarId}`);
    }

    const updated = await addEventToCalList(calendar, eventRef);

    set((state) => {
      const calendars = state.calendars.map((c) =>
        c.id === calendarId ? updated : c,
      );
      saveCalendarsToStorage(calendars);
      return { calendars };
    });
  },

  /**
   * Removes an event reference from a specific calendar and republishes.
   */
  removeEventFromCalendar: async (calendarId, eventRef) => {
    const calendar = get().calendars.find((c) => c.id === calendarId);
    if (!calendar) return;

    const updated = await removeEventFromCalList(calendar, eventRef);

    set((state) => {
      const calendars = state.calendars.map((c) =>
        c.id === calendarId ? updated : c,
      );
      saveCalendarsToStorage(calendars);
      return { calendars };
    });
  },

  /**
   * Moves an event from its current calendar to a different one.
   * If the event is already in the target calendar, this is a no-op.
   */
  moveEventToCalendar: async (targetCalendarId, eventCoordinate, eventRef) => {
    const { calendars } = get();

    const result = await moveEventBetweenCalendarLists(
      calendars,
      targetCalendarId,
      eventCoordinate,
      eventRef,
    );

    if (result) {
      set((state) => {
        let updated = state.calendars;
        if (result.source) {
          updated = updated.map((c) =>
            c.id === result.source?.id ? result.source : c,
          );
        }
        updated = updated.map((c) =>
          c.id === result.target.id ? result.target : c,
        );
        saveCalendarsToStorage(updated);
        return { calendars: updated };
      });
    }
  },

  /**
   * Returns all event references from currently visible calendars.
   * Used by the events store to determine which events to fetch and display.
   */
  getVisibleEventRefs: () => {
    const { calendars } = get();
    return calendars.filter((c) => c.isVisible).flatMap((c) => c.eventRefs);
  },

  /**
   * Returns all event d-tag IDs across all calendars (visible or not).
   * Used to deduplicate invitations — if an event is already in any calendar,
   * its gift wrap should not show as a new invitation.
   */
  getAllEventIds: () => {
    const { calendars } = get();
    return calendars.flatMap((c) =>
      c.eventRefs.map((ref) => ref[0].split(":")[2]),
    );
  },

  /**
   * Clears all cached calendar data. Called on logout.
   */
  clearCachedCalendars: async () => {
    if (subscriptionHandle) {
      subscriptionHandle.unsubscribe();
      subscriptionHandle = undefined;
    }
    await removeSecureItem(CALENDAR_LISTS_STORAGE_KEY);
    await removeSecureItem(CALENDAR_VISIBILITY_KEY);
    set({ calendars: [], isLoaded: false });
  },
}));
