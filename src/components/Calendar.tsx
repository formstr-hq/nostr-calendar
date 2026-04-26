import { useTimeBasedEvents } from "../stores/events";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { useLayout } from "../hooks/useLayout";
import { CalendarHeader } from "./CalendarHeader";
import { Box } from "@mui/material";
import { SwipeableView } from "./SwipeableView";
import { useCalendarLists } from "../stores/calendarLists";
import { useInvitations } from "../stores/invitations";

function Calendar() {
  const events = useTimeBasedEvents((state) => state);
  const { calendars, isLoaded: calendarsLoaded } = useCalendarLists();
  const { fetchInvitations, stopInvitations, invitations } = useInvitations();

  // Fetch private events and invitations whenever visible calendars change.
  // Calendar list fetching is handled in App.tsx so it works on every route.
  useEffect(() => {
    if (user && calendarsLoaded) {
      fetchInvitations();
      events.fetchPrivateEvents();
    }
  }, [user, calendarsLoaded, calendars]);

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
