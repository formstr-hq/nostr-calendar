import { TEMP_CALENDAR_ID } from "../stores/eventDetails";
import type { ICalendarEvent } from "./types";

export function buildDuplicatedEventDraft(
  event: ICalendarEvent,
): ICalendarEvent {
  return {
    ...event,
    id: TEMP_CALENDAR_ID,
    eventId: "",
    createdAt: Date.now(),
    user: "",
    viewKey: undefined,
    isInvitation: false,
    relayHint: undefined,
    rsvpResponses: [],
  };
}
