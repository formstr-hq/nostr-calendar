import type { ICalendarEvent } from "./types";

export function buildDuplicatedEventDraft(
  event: ICalendarEvent,
): ICalendarEvent {
  return {
    ...event,
    id: "",
    eventId: "",
    createdAt: Date.now(),
    user: "",
    viewKey: undefined,
    isInvitation: false,
    relayHint: undefined,
    rsvpResponses: [],
  };
}
