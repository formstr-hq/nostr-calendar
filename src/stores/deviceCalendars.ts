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
  refreshCalendars: () => Promise<void>;
  refreshEvents: (range: { startMs: number; endMs: number }) => Promise<void>;
  toggleVisibility: (nativeCalendarId: string) => void;
  setAllVisibility: (visible: boolean) => void;
}

const DEVICE_CALENDAR_ERROR_MESSAGES = {
  invalidCalendarIds: "deviceCalendar.errorInvalidCalendarIds",
  invalidRange: "deviceCalendar.errorInvalidRange",
  permissionDenied: "deviceCalendar.errorPermissionDenied",
  readCalendars: "deviceCalendar.errorReadCalendars",
  readEvents: "deviceCalendar.errorReadEvents",
  unknown: "deviceCalendar.errorUnknown",
} as const;

const normalizeDeviceCalendarError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "Calendar permission not granted") {
    return DEVICE_CALENDAR_ERROR_MESSAGES.permissionDenied;
  }
  if (message === "Invalid calendarIds payload") {
    return DEVICE_CALENDAR_ERROR_MESSAGES.invalidCalendarIds;
  }
  if (
    message === "startMs and endMs are required, and endMs must be > startMs"
  ) {
    return DEVICE_CALENDAR_ERROR_MESSAGES.invalidRange;
  }
  if (message.startsWith("Failed to read calendars:")) {
    return DEVICE_CALENDAR_ERROR_MESSAGES.readCalendars;
  }
  if (message.startsWith("Failed to read events:")) {
    return DEVICE_CALENDAR_ERROR_MESSAGES.readEvents;
  }

  return DEVICE_CALENDAR_ERROR_MESSAGES.unknown;
};

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
        set({
          available: true,
          permission: status.calendar,
        });
        if (status.calendar === "granted") {
          await get().refreshCalendars();
        } else {
          invalidateEventQueries();
          set({ events: [] });
        }
      } catch (e) {
        set({ error: normalizeDeviceCalendarError(e) });
      }
    },

    async requestAccess() {
      if (!DeviceCalendar.isAvailable()) return;
      try {
        const status = await DeviceCalendar.requestPermissions();
        persistPermission(status.calendar);
        set({ permission: status.calendar });
        if (status.calendar === "granted") {
          await get().refreshCalendars();
        } else {
          invalidateEventQueries();
          set({ events: [] });
        }
      } catch (e) {
        set({ error: normalizeDeviceCalendarError(e) });
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
        set({ loading: false, error: normalizeDeviceCalendarError(e) });
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
        set({ error: normalizeDeviceCalendarError(e) });
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
