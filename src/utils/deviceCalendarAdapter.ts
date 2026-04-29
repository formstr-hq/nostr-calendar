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
    title: evt.title || "(No title)",
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
 * Stable display color for a device calendar. Falls back to a neutral blue if
 * the native side returned an empty/invalid color.
 */
export function deviceCalendarColor(info: DeviceCalendarInfo): string {
  const c = (info.color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#4285f4";
}
