import { useTimeBasedEvents } from "../stores/events";
import { useUser } from "../stores/user";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { useLayout } from "../hooks/useLayout";
import { CalendarHeader } from "./CalendarHeader";
import { Box } from "@mui/material";
import { SwipeableView } from "./SwipeableView";
import { useCalendarLists } from "../stores/calendarLists";
import { useInvitations } from "../stores/invitations";
import { useEffect } from "react";

function Calendar() {
  const { user, isInitialized } = useUser();
  const events = useTimeBasedEvents((state) => state);
  const { calendars, isLoaded: calendarsLoaded } = useCalendarLists();
  const { fetchInvitations, stopInvitations, invitations } = useInvitations();

  // When user is logged in, fetch calendar lists and invitations.
  // Private events are fetched reactively when calendars are loaded.
  useEffect(() => {
    if (isInitialized && user) {
      useCalendarLists.getState().fetchCalendars();
    }
  }, [isInitialized, user]);

  // Fetch private events whenever visible calendars change.
  // This ensures events update when calendars load from network
  // or when the user toggles calendar visibility.
  useEffect(() => {
    if (user && isInitialized && calendarsLoaded) {
      events.fetchPrivateEvents();
      fetchInvitations();
    }
  }, [user, calendarsLoaded, events, fetchInvitations, isInitialized]);

  // Cleanup invitation listener on unmount
  useEffect(() => {
    return () => stopInvitations();
  }, []);

  const { layout } = useLayout();
  const visibileCalendars = new Set(
    calendars.filter((cal) => cal.isVisible).map((cal) => cal.id),
  );
  const visibleEvents = events.events.filter((evt) =>
    visibileCalendars.has(evt.calendarId ?? ""),
  );
  const allEvents = [
    ...visibleEvents,
    ...invitations.filter((inv) => inv.event).map((inv) => inv.event!),
  ];
  return (
    <Box p={2}>
      <CalendarHeader />
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
