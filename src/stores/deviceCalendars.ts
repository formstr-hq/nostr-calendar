/**
 * Device Calendars Store
 *
 * Holds calendars and events read from the phone's native calendar database
 * via the `DeviceCalendar` Capacitor plugin. Lives in its own store so that
 * device-sourced events never enter the Nostr publish/RSVP code paths in
 * `useTimeBasedEvents`. Merged into rendering at the `Calendar.tsx` boundary.
 */

import { create } from "zustand";
import { getItem, setItem, setSecureItem } from "../common/localStorage";
import {
  DeviceCalendar,
  type DeviceCalendarInfo,
  type DeviceCalendarPermissionState,
} from "../plugins/deviceCalendar";
import {
  calendarEventToDeviceFields,
  deviceEventStableId,
  deviceEventToCalendarEvent,
  stripDeviceCalendarPrefix,
} from "../utils/deviceCalendarAdapter";
import { NOTIFICATION_SCHEDULE_WINDOW_MS } from "../utils/notifications";
import type { ICalendarEvent } from "../utils/types";
import { reconcileNotificationSchedule } from "../plugins/notificationScheduler";

const VISIBILITY_STORAGE_KEY = "cal:device_visibility";
const PERMISSION_STORAGE_KEY = "cal:device_permission";
const COLOR_OVERRIDES_STORAGE_KEY = "cal:device_color_overrides";
/** Native-readable snapshot: read by NotificationWorker.java / IOSNotificationScheduler.swift. */
const DEVICE_EVENTS_NATIVE_KEY = "cal:device_events";
const DEVICE_CALENDARS_NATIVE_KEY = "cal:device_calendars";
const DEVICE_EVENT_SNAPSHOT_WINDOW_MS = Math.max(
  NOTIFICATION_SCHEDULE_WINDOW_MS,
  5 * 24 * 60 * 60 * 1000,
);

type Visibility = Record<string, boolean>;
type ColorOverrides = Record<string, string>;

interface DeviceCalendarsState {
  /** Whether the native bridge is implemented on this platform. */
  available: boolean;
  /** Permission state mirrored from the native side. */
  permission: DeviceCalendarPermissionState | "unknown";
  calendars: DeviceCalendarInfo[];
  /** Native -> visible flag, persisted to localStorage. Default-on once discovered. */
  visibility: Visibility;
  /**
   * App-side display color override, keyed by native calendar id. Used when a
   * native color write-back was rejected by the OS/account (some Google-synced
   * calendars silently revert this) — deliberately plain localStorage, since
   * native code never needs to read it.
   */
  colorOverrides: ColorOverrides;
  /** Already converted to ICalendarEvent. */
  events: ICalendarEvent[];
  loading: boolean;
  error?: string;

  init: () => Promise<void>;
  syncPermission: () => Promise<void>;
  requestWriteAccess: () => Promise<void>;
  refreshCalendars: () => Promise<void>;
  refreshEvents: (range: { startMs: number; endMs: number }) => Promise<void>;
  toggleVisibility: (nativeCalendarId: string) => void;
  setAllVisibility: (visible: boolean) => void;
  createDeviceEvent: (
    fields: ReturnType<typeof calendarEventToDeviceFields>,
  ) => Promise<ICalendarEvent | null>;
  updateDeviceEvent: (event: ICalendarEvent) => Promise<void>;
  deleteDeviceEvent: (event: ICalendarEvent) => Promise<void>;
  setColorOverride: (nativeCalendarId: string, color: string) => void;
  clearColorOverride: (nativeCalendarId: string) => void;
  updateCalendarColor: (
    nativeCalendarId: string,
    color: string,
  ) => Promise<void>;
}

const DEVICE_CALENDAR_ERROR_MESSAGES = {
  invalidCalendarIds: "deviceCalendar.errorInvalidCalendarIds",
  invalidRange: "deviceCalendar.errorInvalidRange",
  permissionDenied: "deviceCalendar.errorPermissionDenied",
  readCalendars: "deviceCalendar.errorReadCalendars",
  readEvents: "deviceCalendar.errorReadEvents",
  writeFailed: "deviceCalendar.errorWriteFailed",
  deleteFailed: "deviceCalendar.errorDeleteFailed",
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
  if (message.startsWith("Failed to create event")) {
    return DEVICE_CALENDAR_ERROR_MESSAGES.writeFailed;
  }
  if (message.startsWith("Failed to update event")) {
    return DEVICE_CALENDAR_ERROR_MESSAGES.writeFailed;
  }
  if (message.startsWith("Failed to delete event")) {
    return DEVICE_CALENDAR_ERROR_MESSAGES.deleteFailed;
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

/**
 * Snapshot shape intentionally mirrors `cal:events` ("id"/"title"/"begin"/
 * "end"/"repeat"/"location") so NotificationWorker.java / IOSNotificationScheduler.swift
 * reuse their existing Nostr-event reconciliation logic unchanged for device
 * events too — they naturally fall back to the default reminder offsets since
 * neither native side finds a matching entry for a "device:..." id in the
 * Nostr-only calendar/preference maps.
 */
function toNativeDeviceEventSnapshot(events: ICalendarEvent[]) {
  const now = Date.now();
  const windowEnd = now + DEVICE_EVENT_SNAPSHOT_WINDOW_MS;
  return events
    .filter(
      (event) =>
        event.repeat.rrule || (event.end >= now && event.begin <= windowEnd),
    )
    .map((event) => ({
      id: deviceEventStableId(
        event.id,
        stripDeviceCalendarPrefix(event.calendarId),
      ),
      title: event.title,
      calendarId: stripDeviceCalendarPrefix(event.calendarId),
      begin: event.begin,
      end: event.end,
      allDay: event.allDay,
      repeat: { rrule: event.repeat.rrule },
      location: event.location,
    }));
}

async function writeNativeDeviceEventsSnapshot(events: ICalendarEvent[]) {
  await setSecureItem(
    DEVICE_EVENTS_NATIVE_KEY,
    toNativeDeviceEventSnapshot(events),
  );
  await reconcileNotificationSchedule();
}

async function writeNativeDeviceCalendarsSnapshot(
  calendars: DeviceCalendarInfo[],
) {
  await setSecureItem(
    DEVICE_CALENDARS_NATIVE_KEY,
    calendars.map(({ id, name, accountName }) => ({ id, name, accountName })),
  );
  await reconcileNotificationSchedule();
}

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
    colorOverrides: getItem<ColorOverrides>(COLOR_OVERRIDES_STORAGE_KEY, {}),
    events: [],
    loading: false,
    error: undefined,

    async init() {
      if (!DeviceCalendar.isAvailable()) {
        persistPermission("denied");
        invalidateEventQueries();
        set({ available: false, permission: "denied", events: [] });
        void writeNativeDeviceEventsSnapshot([]);
        void writeNativeDeviceCalendarsSnapshot([]);
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
          set({ calendars: [], events: [] });
          void writeNativeDeviceEventsSnapshot([]);
          void writeNativeDeviceCalendarsSnapshot([]);
        }
      } catch (e) {
        set({ error: normalizeDeviceCalendarError(e) });
      }
    },

    async requestWriteAccess() {
      if (!DeviceCalendar.isAvailable()) return;
      try {
        const status = await DeviceCalendar.requestPermissions();
        persistPermission(status.calendar);
        set({ permission: status.calendar });
        if (status.calendar === "granted") {
          await get().refreshCalendars();
        } else {
          invalidateEventQueries();
          set({ calendars: [], events: [] });
          void writeNativeDeviceEventsSnapshot([]);
          void writeNativeDeviceCalendarsSnapshot([]);
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
        void writeNativeDeviceCalendarsSnapshot(calendars);
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
        void writeNativeDeviceEventsSnapshot([]);
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
        const events = native.map(deviceEventToCalendarEvent);
        set({ events });
        void writeNativeDeviceEventsSnapshot(events);
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

    async createDeviceEvent(fields) {
      set({ error: undefined });
      try {
        const eventId = await DeviceCalendar.createEvent(fields);
        const created = deviceEventToCalendarEvent({
          id: eventId,
          calendarId: fields.calendarId,
          title: fields.title,
          description: fields.description,
          location: fields.location,
          beginMs: fields.beginMs,
          endMs: fields.endMs,
          allDay: fields.allDay,
          organizer: "",
          rrule: fields.rrule,
        });
        const events = [...get().events, created];
        set({ events });
        void writeNativeDeviceEventsSnapshot(events);
        return created;
      } catch (e) {
        set({ error: normalizeDeviceCalendarError(e) });
        return null;
      }
    },

    async updateDeviceEvent(event) {
      const fields = calendarEventToDeviceFields(event);
      await DeviceCalendar.updateEvent({
        id: event.id,
        title: fields.title,
        description: fields.description,
        location: fields.location,
        beginMs: fields.beginMs,
        endMs: fields.endMs,
        allDay: fields.allDay,
        rrule: fields.rrule ?? "",
      });
      const events = get().events.map((e) => (e.id === event.id ? event : e));
      set({ events });
      void writeNativeDeviceEventsSnapshot(events);
    },

    async deleteDeviceEvent(event) {
      await DeviceCalendar.deleteEvent(event.id);
      const events = get().events.filter((e) => e.id !== event.id);
      set({ events });
      void writeNativeDeviceEventsSnapshot(events);
    },

    setColorOverride(nativeCalendarId, color) {
      const next = { ...get().colorOverrides, [nativeCalendarId]: color };
      setItem(COLOR_OVERRIDES_STORAGE_KEY, next);
      set({ colorOverrides: next });
    },

    clearColorOverride(nativeCalendarId) {
      const next = { ...get().colorOverrides };
      delete next[nativeCalendarId];
      setItem(COLOR_OVERRIDES_STORAGE_KEY, next);
      set({ colorOverrides: next });
    },

    async updateCalendarColor(nativeCalendarId, color) {
      set({ error: undefined });
      try {
        const result = await DeviceCalendar.updateCalendarColor(
          nativeCalendarId,
          color,
        );
        if (result.applied) {
          const calendars = get().calendars.map((c) =>
            c.id === nativeCalendarId ? { ...c, color } : c,
          );
          set({ calendars });
          get().clearColorOverride(nativeCalendarId);
        } else {
          get().setColorOverride(nativeCalendarId, color);
        }
      } catch (e) {
        set({ error: normalizeDeviceCalendarError(e) });
        get().setColorOverride(nativeCalendarId, color);
      }
    },
  };
});
