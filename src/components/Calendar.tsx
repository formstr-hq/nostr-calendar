import { useTimeBasedEvents } from "../stores/events";
import { useSettings } from "../stores/settings";
import { useUser } from "../stores/user";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { useLayout } from "../hooks/useLayout";
import { CalendarHeader } from "./CalendarHeader";
import { Box } from "@mui/material";
import { SwipeableView } from "./SwipeableView";
import { isMobile } from "../common/utils";
import { useCalendarLists } from "../stores/calendarLists";
import { useInvitations } from "../stores/invitations";
import { useEffect } from "react";

function Calendar() {
  const {
    settings: { filters },
  } = useSettings((state) => state);
  const { user } = useUser();
  const events = useTimeBasedEvents((state) => state);
  const { calendars, isLoaded: calendarsLoaded } = useCalendarLists();
  const { fetchInvitations, invitations } = useInvitations();

  if (filters?.showPublicEvents && !isMobile) {
    events.fetchEvents();
  }

  // When user is logged in, fetch calendar lists and invitations.
  // Private events are fetched reactively when calendars are loaded.
  useEffect(() => {
    if (user) {
      useCalendarLists.getState().fetchCalendars();
    }
  }, [user]);

  // Fetch private events whenever visible calendars change.
  // This ensures events update when calendars load from network
  // or when the user toggles calendar visibility.
  useEffect(() => {
    if (user && calendarsLoaded) {
      console.log(calendars.length);
      fetchInvitations();
      events.fetchPrivateEvents();
    }
  }, [user, calendarsLoaded, calendars]);

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
      {layout === "month" && <MonthView events={allEvents} />}
    </Box>
  );
}

// export default withRouter(Calendar)
export default Calendar;
