import type { Theme } from "@mui/material";
import { useCalendarLists } from "../stores/calendarLists";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import type { ICalendarList } from "./calendarListTypes";
import {
  DEVICE_CALENDAR_ID_PREFIX,
  deviceCalendarColor,
} from "./deviceCalendarAdapter";
import type { DeviceCalendarInfo } from "../plugins/deviceCalendar";
import type { ICalendarEvent } from "./types";

/**
 * Resolves the display color for an event by checking, in order:
 * 1. The owning Nostr calendar list's color, if `event.calendarId` matches one
 * 2. The device calendar's hex color when `event.source === "device"`
 * 3. `undefined` (caller falls back to the theme palette)
 *
 * Plain-data variant — usable inside a `.map()` over many events (hooks
 * can't be called in a loop; see `useResolvedCalendarColor` for the
 * single-event hook form).
 */
export function resolveCalendarColor(
  event: ICalendarEvent,
  nostrCalendars: ICalendarList[],
  deviceCalendars: DeviceCalendarInfo[],
): string | undefined {
  const owning = event.calendarId
    ? nostrCalendars.find((c) => c.id === event.calendarId)
    : undefined;
  if (owning?.color) return owning.color;

  if (event.source === "device" && event.calendarId) {
    const nativeId = event.calendarId.startsWith(DEVICE_CALENDAR_ID_PREFIX)
      ? event.calendarId.slice(DEVICE_CALENDAR_ID_PREFIX.length)
      : event.calendarId;
    const info = deviceCalendars.find((c) => c.id === nativeId);
    if (info) return deviceCalendarColor(info);
  }
  return undefined;
}

export function useResolvedCalendarColor(
  event: ICalendarEvent,
): string | undefined {
  const nostrCalendars = useCalendarLists.getState().calendars;
  const deviceCalendars = useDeviceCalendars((s) => s.calendars);
  return resolveCalendarColor(event, nostrCalendars, deviceCalendars);
}

/**
 * Maps an event + its resolved calendar color to EventChip's `{color,
 * isPublic}` props. Public (non-private, non-invitation, non-device) events
 * get the tinted/globe treatment; everything else renders solid.
 */
export function getEventChipColor(
  event: ICalendarEvent,
  theme: Theme,
  resolvedColor?: string,
): { color: string; isPublic: boolean } {
  if (event.isInvitation) {
    return { color: theme.palette.grey[500], isPublic: false };
  }
  if (event.source === "device" || event.isPrivateEvent) {
    return {
      color: resolvedColor ?? theme.palette.primary.main,
      isPublic: false,
    };
  }
  return {
    color: resolvedColor ?? theme.palette.primary.main,
    isPublic: true,
  };
}
