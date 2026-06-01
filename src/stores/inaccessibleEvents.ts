/**
 * Inaccessible Events Store
 *
 * Tracks event references the client knows about (from a calendar list) but
 * cannot currently decrypt — usually because the author rotated the view key
 * and has not re-shared it with this user yet.
 *
 * These are surfaced on the "Events Without Access" page so the user can ask
 * the author for access or remove the reference from their calendar. Entries
 * are keyed by event coordinate and cleared automatically once the event
 * decrypts successfully (e.g. after applying an access update).
 *
 * Persistence mirrors the other stores: secure storage on native, in-memory
 * only on web (getSecureItem is a no-op there).
 */

import { create } from "zustand";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";
import type { IInaccessibleEvent } from "../utils/calendarListTypes";

const INACCESSIBLE_EVENTS_STORAGE_KEY = "cal:inaccessible_events";

const persist = (events: Record<string, IInaccessibleEvent>) => {
  setSecureItem(INACCESSIBLE_EVENTS_STORAGE_KEY, Object.values(events));
};

interface InaccessibleEventsState {
  /** Map of event coordinate → inaccessible event entry. */
  byCoordinate: Record<string, IInaccessibleEvent>;

  loadCached: () => Promise<void>;
  /** Records (or refreshes) an event the client could not decrypt. */
  record: (event: Omit<IInaccessibleEvent, "lastSeenAt">) => void;
  /** Removes an entry once access is regained or it is no longer relevant. */
  remove: (coordinate: string) => void;
  /** Returns all inaccessible events, most recently seen first. */
  list: () => IInaccessibleEvent[];
  clearCached: () => Promise<void>;
}

export const useInaccessibleEvents = create<InaccessibleEventsState>(
  (set, get) => ({
    byCoordinate: {},

    loadCached: async () => {
      const cached = await getSecureItem<IInaccessibleEvent[]>(
        INACCESSIBLE_EVENTS_STORAGE_KEY,
        [],
      );
      if (cached.length === 0) return;
      const byCoordinate: Record<string, IInaccessibleEvent> = {};
      cached.forEach((entry) => {
        byCoordinate[entry.coordinate] = entry;
      });
      set({ byCoordinate });
    },

    record: (event) => {
      set((state) => {
        const byCoordinate = {
          ...state.byCoordinate,
          [event.coordinate]: {
            ...event,
            lastSeenAt: Math.floor(Date.now() / 1000),
          },
        };
        persist(byCoordinate);
        return { byCoordinate };
      });
    },

    remove: (coordinate) => {
      set((state) => {
        if (!state.byCoordinate[coordinate]) return state;
        const { [coordinate]: _removed, ...byCoordinate } = state.byCoordinate;
        persist(byCoordinate);
        return { byCoordinate };
      });
    },

    list: () =>
      Object.values(get().byCoordinate).sort(
        (a, b) => b.lastSeenAt - a.lastSeenAt,
      ),

    clearCached: async () => {
      await removeSecureItem(INACCESSIBLE_EVENTS_STORAGE_KEY);
      set({ byCoordinate: {} });
    },
  }),
);
