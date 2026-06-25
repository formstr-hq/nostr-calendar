import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Bridge to the device's native calendar database.
 *
 * Android: backed by `CalendarContract` (Calendars + Instances + Events).
 * iOS: not implemented yet — `isAvailable()` returns false on non-Android.
 * Web: not implemented — calls reject; UI must gate on `isAvailable()`.
 */

export type DeviceCalendarPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";

export interface DeviceCalendarPermissionStatus {
  calendar: DeviceCalendarPermissionState;
}

export interface DeviceCalendarInfo {
  /** Native calendar id (string form). */
  id: string;
  /** Display name shown in the system calendar app. */
  name: string;
  /** Owning account name (e.g. Google account email). */
  accountName: string;
  /** Hex color string `#RRGGBB`, falls back to `#4285f4` when missing. */
  color: string;
  /** True if this calendar is the user's primary one for its account. */
  isPrimary: boolean;
  /** True if events can be inserted into this calendar (access level >= contributor). */
  canWrite: boolean;
}

export interface DeviceCalendarEvent {
  /** Native event/instance id. Unique per occurrence (recurring events expand to many). */
  id: string;
  /** Native calendar id this event belongs to. */
  calendarId: string;
  title: string;
  description: string;
  location: string;
  /** Begin time, milliseconds since epoch (UTC). */
  beginMs: number;
  /** End time, milliseconds since epoch (UTC). */
  endMs: number;
  allDay: boolean;
  organizer: string;
  /** RRULE string if the source event is recurring; undefined for one-off events. */
  rrule?: string;
}

export interface ListEventsOptions {
  /** Native calendar ids to query. Empty array = all calendars. */
  calendarIds: string[];
  startMs: number;
  endMs: number;
}

export interface DeviceCalendarPluginShape {
  checkPermissions(): Promise<DeviceCalendarPermissionStatus>;
  requestPermissions(): Promise<DeviceCalendarPermissionStatus>;
  listCalendars(): Promise<{ calendars: DeviceCalendarInfo[] }>;
  listEvents(
    options: ListEventsOptions,
  ): Promise<{ events: DeviceCalendarEvent[] }>;
}

const deviceCalendar =
  registerPlugin<DeviceCalendarPluginShape>("DeviceCalendar");

/** True only on platforms where the native plugin is implemented. */
export function isAvailable(): boolean {
  return Capacitor.getPlatform() === "android";
}

export const DeviceCalendar = {
  isAvailable,
  async checkPermissions(): Promise<DeviceCalendarPermissionStatus> {
    if (!isAvailable()) return { calendar: "denied" };
    return deviceCalendar.checkPermissions();
  },
  async requestPermissions(): Promise<DeviceCalendarPermissionStatus> {
    if (!isAvailable()) return { calendar: "denied" };
    return deviceCalendar.requestPermissions();
  },
  async listCalendars(): Promise<DeviceCalendarInfo[]> {
    if (!isAvailable()) return [];
    const result = await deviceCalendar.listCalendars();
    return result.calendars ?? [];
  },
  async listEvents(options: ListEventsOptions): Promise<DeviceCalendarEvent[]> {
    if (!isAvailable()) return [];
    const result = await deviceCalendar.listEvents(options);
    return result.events ?? [];
  },
};
