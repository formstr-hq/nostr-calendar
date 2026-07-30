import { useCallback, useState } from "react";
import type { ICalendarEvent } from "../utils/types";

/**
 * Shared "open the full CalendarEventView modal for some event" state.
 * One instance handles any event — used directly by view grids and by
 * EventQuickPeek's "Open" link so they don't each own separate dialog state.
 */
export function useEventModal() {
  const [event, setEvent] = useState<ICalendarEvent | null>(null);

  const open = useCallback((next: ICalendarEvent) => setEvent(next), []);
  const close = useCallback(() => setEvent(null), []);

  return { event, isOpen: event !== null, open, close };
}
