import { useEffect, useRef } from "react";
import { useTimeBasedEvents } from "../stores/events";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView, WeekHeader } from "./WeekView";
import { useLayout } from "../hooks/useLayout";
import { Box } from "@mui/material";
import { SwipeableView } from "./SwipeableView";
import { useCalendarLists } from "../stores/calendarLists";
import { useInvitations } from "../stores/invitations";
import { useDateWithRouting } from "../hooks/useDateWithRouting";
import { useVisibleDeviceEvents } from "../hooks/useVisibleDeviceEvents";
import { findCalendarForEvent } from "../utils/calendarListTypes";

function Calendar() {
  const events = useTimeBasedEvents((state) => state);
  const calendars = useCalendarLists((state) => state.calendars);
  const { invitations } = useInvitations();
  const { layout } = useLayout();
  const { date } = useDateWithRouting();
  const visibleDeviceEvents = useVisibleDeviceEvents(date, layout);

  const didInitialScroll = useRef(false);

  // Bring the current time into view once, after the calendar has mounted.
  // Subsequent date changes intentionally keep the document's scroll offset.
  useEffect(() => {
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;

    const frame = window.requestAnimationFrame(() => {
      const marker = document.querySelector<HTMLElement>(
        '[data-current-time-marker="true"]',
      );
      if (!marker) return;
      const top = marker.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, top - window.innerHeight * 0.35),
        left: 0,
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const visibleEvents = events.events.flatMap((event) => {
    // Calendar-list refs are the ownership source of truth. The event payload
    // can briefly retain its old calendar ID while the event edit is published.
    const owningCalendar = findCalendarForEvent(calendars, event);
    const calendarId = owningCalendar?.id ?? event.calendarId;
    if (
      !calendars.some(
        (calendar) => calendar.id === calendarId && calendar.isVisible,
      )
    ) {
      return [];
    }
    return calendarId === event.calendarId
      ? [event]
      : [{ ...event, calendarId }];
  });

  const allEvents = [
    ...visibleEvents,
    ...invitations.filter((inv) => inv.event).map((inv) => inv.event!),
    ...visibleDeviceEvents,
  ];

  return (
    <Box p={2}>
      {layout === "week" && <WeekHeader date={date} />}
      {layout === "day" && <SwipeableView View={DayView} events={allEvents} />}
      {layout === "week" && (
        <SwipeableView View={WeekView} events={allEvents} />
      )}
      {layout === "month" && (
        <SwipeableView View={MonthView} events={allEvents} />
      )}
    </Box>
  );
}

// export default withRouter(Calendar)
export default Calendar;
