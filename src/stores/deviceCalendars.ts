/**
 * Device Calendars Store
 *
 * Holds calendars and events read from the phone's native calendar database
 * via the `DeviceCalendar` Capacitor plugin. Lives in its own store so that
 * device-sourced events never enter the Nostr publish/RSVP code paths in
 * `useTimeBasedEvents`. Merged into rendering at the `Calendar.tsx` boundary.
 */

import { create } from "zustand";
import { getItem, setItem } from "../common/localStorage";
import {
  DeviceCalendar,
  type DeviceCalendarInfo,
  type DeviceCalendarPermissionState,
} from "../plugins/deviceCalendar";
import { deviceEventToCalendarEvent } from "../utils/deviceCalendarAdapter";
import type { ICalendarEvent } from "../utils/types";

const VISIBILITY_STORAGE_KEY = "cal:device_visibility";
const PERMISSION_STORAGE_KEY = "cal:device_permission";

type Visibility = Record<string, boolean>;

interface DeviceCalendarsState {
  /** Whether the native bridge is implemented on this platform. */
  available: boolean;
  /** Permission state mirrored from the native side. */
  permission: DeviceCalendarPermissionState | "unknown";
  /**
   * True once the user has explicitly denied a request in-app and Android is
   * no longer surfacing the OS dialog. Drives the "Open settings" recovery
   * UI in the sidebar.
   */
  permanentlyDenied: boolean;
  calendars: DeviceCalendarInfo[];
  /** Native -> visible flag, persisted to localStorage. Default-on once discovered. */
  visibility: Visibility;
  /** Already converted to ICalendarEvent. */
  events: ICalendarEvent[];
  loading: boolean;
  error?: string;

  init: () => Promise<void>;
  syncPermission: () => Promise<void>;
  requestAccess: () => Promise<void>;
  openAppSettings: () => Promise<void>;
  refreshCalendars: () => Promise<void>;
  refreshEvents: (range: { startMs: number; endMs: number }) => Promise<void>;
  toggleVisibility: (nativeCalendarId: string) => void;
  setAllVisibility: (visible: boolean) => void;
}

const getInitialPermission = (): DeviceCalendarPermissionState | "unknown" => {
  if (!DeviceCalendar.isAvailable()) {
    return "denied";
  }
  return getItem<DeviceCalendarPermissionState | "unknown">(
    PERMISSION_STORAGE_KEY,
    "unknown",
  );
};

const persistPermission = (
  permission: DeviceCalendarPermissionState | "unknown",
) => {
  setItem(PERMISSION_STORAGE_KEY, permission);
};

export const useDeviceCalendars = create<DeviceCalendarsState>((set, get) => {
  // Monotonic token used to drop stale `listEvents` responses when a newer
  // refresh has been kicked off (e.g. user toggling a calendar twice quickly).
  let refreshGeneration = 0;

  const invalidateEventQueries = () => {
    refreshGeneration += 1;
  };

  return {
    available: DeviceCalendar.isAvailable(),
    permission: getInitialPermission(),
    permanentlyDenied: false,
    calendars: [],
    visibility: getItem<Visibility>(VISIBILITY_STORAGE_KEY, {}),
    events: [],
    loading: false,
    error: undefined,

    async init() {
      if (!DeviceCalendar.isAvailable()) {
        persistPermission("denied");
        invalidateEventQueries();
        set({ available: false, permission: "denied", events: [] });
        return;
      }
      await get().syncPermission();
    },

    async syncPermission() {
      if (!DeviceCalendar.isAvailable()) {
        persistPermission("denied");
        invalidateEventQueries();
        set({ available: false, permission: "denied", events: [] });
        return;
      }
      try {
        const status = await DeviceCalendar.checkPermissions();
        persistPermission(status.calendar);
        // syncPermission runs on app resume etc.; we never *infer* permanent
        // denial here, only requestAccess can flip the flag, and only granted
        // can clear it.
        set({
          available: true,
          permission: status.calendar,
          ...(status.calendar === "granted"
            ? { permanentlyDenied: false }
            : {}),
        });
        if (status.calendar === "granted") {
          await get().refreshCalendars();
        } else {
          invalidateEventQueries();
          set({ events: [] });
        }
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },

    async requestAccess() {
      if (!DeviceCalendar.isAvailable()) return;
      const previous = get().permission;
      try {
        const status = await DeviceCalendar.requestPermissions();
        persistPermission(status.calendar);
        // If the user was already "denied" before this call and the OS still
        // returned "denied" without a prompt, treat it as permanently denied.
        // "prompt-with-rationale" still has a path forward via another request,
        // so it is not considered permanent.
        const permanentlyDenied =
          status.calendar === "denied" && previous === "denied";
        set({
          permission: status.calendar,
          permanentlyDenied:
            status.calendar === "granted" ? false : permanentlyDenied,
        });
        if (status.calendar === "granted") {
          await get().refreshCalendars();
        } else {
          invalidateEventQueries();
          set({ events: [] });
        }
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },

    async openAppSettings() {
      try {
        await DeviceCalendar.openAppSettings();
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },

    async refreshCalendars() {
      if (get().permission !== "granted") return;
      set({ loading: true, error: undefined });
      try {
        const calendars = await DeviceCalendar.listCalendars();
        // Default any newly-discovered calendar to visible.
        const current = get().visibility;
        const next: Visibility = { ...current };
        let changed = false;
        for (const c of calendars) {
          if (next[c.id] === undefined) {
            next[c.id] = true;
            changed = true;
          }
        }
        if (changed) setItem(VISIBILITY_STORAGE_KEY, next);
        set({ calendars, visibility: next, loading: false });
      } catch (e) {
        set({ loading: false, error: (e as Error).message });
      }
    },

    async refreshEvents({ startMs, endMs }) {
      if (get().permission !== "granted") {
        invalidateEventQueries();
        set({ events: [] });
        return;
      }
      const visible = get().visibility;
      const calendarIds = get()
        .calendars.filter((c) => visible[c.id] !== false)
        .map((c) => c.id);
      if (calendarIds.length === 0) {
        invalidateEventQueries();
        set({ events: [] });
        return;
      }
      const generation = ++refreshGeneration;
      try {
        const native = await DeviceCalendar.listEvents({
          calendarIds,
          startMs,
          endMs,
        });
        // Drop stale responses: a newer refresh has been kicked off in the
        // meantime (e.g. user toggled visibility twice quickly).
        if (generation !== refreshGeneration) return;
        set({ events: native.map(deviceEventToCalendarEvent) });
      } catch (e) {
        if (generation !== refreshGeneration) return;
        set({ error: (e as Error).message });
      }
    },

    toggleVisibility(nativeCalendarId) {
      const current = get().visibility;
      const next = {
        ...current,
        [nativeCalendarId]: !(current[nativeCalendarId] ?? true),
      };
      invalidateEventQueries();
      setItem(VISIBILITY_STORAGE_KEY, next);
      set({ visibility: next });
    },

    setAllVisibility(visible) {
      const next: Visibility = { ...get().visibility };
      for (const calendar of get().calendars) {
        next[calendar.id] = visible;
      }
      invalidateEventQueries();
      setItem(VISIBILITY_STORAGE_KEY, next);
      set({ visibility: next });
    },
  };
});
