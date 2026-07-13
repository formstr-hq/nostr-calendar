import { TEMP_CALENDAR_ID } from "../stores/eventDetails";
export function getPersistedCalendarEventId(
  eventId: string | undefined,
): string | undefined {
  return eventId && eventId !== TEMP_CALENDAR_ID ? eventId : undefined;
}
