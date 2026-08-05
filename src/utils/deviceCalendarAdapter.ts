import type { ICalendarEvent } from "./types";
import type {
  DeviceCalendarEvent,
  DeviceCalendarInfo,
} from "../plugins/deviceCalendar";

/**
 * Synthetic calendarId namespace for device events. Lets the existing
 * visibility filter in `Calendar.tsx` work without source-specific code paths.
 */
export const DEVICE_CALENDAR_ID_PREFIX = "device:";

export function deviceCalendarIdFor(nativeId: string): string {
  return `${DEVICE_CALENDAR_ID_PREFIX}${nativeId}`;
}

export function stripDeviceCalendarPrefix(calendarId: string): string {
  return calendarId.startsWith(DEVICE_CALENDAR_ID_PREFIX)
    ? calendarId.slice(DEVICE_CALENDAR_ID_PREFIX.length)
    : calendarId;
}

/**
 * Convert a native event into the app's `ICalendarEvent` shape.
 *
 * Nostr-only fields (eventId, viewKey, rsvpResponses, etc.) are populated with
 * inert defaults. The `source: "device"` flag is the canonical read-only check.
 * `kind` is set to `-1` as a sentinel; rendering code already only branches on
 * `source` / `isInvitation`, never on the raw kind.
 */
export function deviceEventToCalendarEvent(
  evt: DeviceCalendarEvent,
): ICalendarEvent {
  return {
    id: evt.id,
    eventId: "",
    kind: -1,
    title: evt.title || "",
    description: evt.description || "",
    begin: evt.beginMs,
    end: evt.endMs,
    createdAt: 0,
    categories: [],
    participants: [],
    rsvpResponses: [],
    reference: [],
    image: undefined,
    location: evt.location ? [evt.location] : [],
    geoHash: [],
    website: "",
    user: evt.organizer || "",
    isPrivateEvent: false,
    repeat: { rrule: evt.rrule ?? null },
    calendarId: deviceCalendarIdFor(evt.calendarId),
    allDay: evt.allDay,
    source: "device",
  };
}

/**
 * Inverse mapping for writes: extract the native-shaped fields
 * `createDeviceEvent`/`updateDeviceEvent` need from an `ICalendarEvent`
 * that's been edited in the shared editor.
 */
export function calendarEventToDeviceFields(event: ICalendarEvent): {
  calendarId: string;
  title: string;
  description: string;
  location: string;
  beginMs: number;
  endMs: number;
  allDay: boolean;
  rrule?: string;
} {
  return {
    calendarId: stripDeviceCalendarPrefix(event.calendarId),
    title: event.title,
    description: event.description,
    location: event.location.join(", "),
    beginMs: event.begin,
    endMs: event.end,
    allDay: Boolean(event.allDay),
    rrule: event.repeat.rrule ?? undefined,
  };
}

/**
 * Stable notification-scheduling key for a device event. Derived from the
 * real-eventId half of the composite `"instanceId:eventId"` id (or the raw
 * eventIdentifier on iOS), since the instance-id half is an unstable,
 * regenerable cache key. Use this everywhere reminders are scheduled/
 * cancelled/looked up; the raw composite `event.id` stays as-is for React
 * `key` props and as the argument to native write/delete calls.
 */
export function deviceEventStableId(
  compositeOrBareId: string,
  nativeCalendarId: string,
): string {
  const separatorIndex = compositeOrBareId.lastIndexOf(":");
  const eventIdPart =
    separatorIndex >= 0
      ? compositeOrBareId.slice(separatorIndex + 1)
      : compositeOrBareId;
  return `device:${nativeCalendarId}:${eventIdPart}`;
}

/**
 * Stable display color for a device calendar. Falls back to a neutral blue if
 * the native side returned an empty/invalid color. `override`, when present,
 * takes precedence — it's the app-side fallback used when a native color
 * write was rejected by the OS/account (see `useDeviceCalendars.updateCalendarColor`).
 */
export function deviceCalendarColor(
  info: DeviceCalendarInfo,
  override?: string,
): string {
  if (override && /^#[0-9a-f]{6}$/i.test(override.trim())) {
    return override.trim();
  }
  const c = (info.color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#4285f4";
}
