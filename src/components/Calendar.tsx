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
import { useDateWithRouting } from "../hooks/useDateWithRouting";
import { useVisibleDeviceEvents } from "../hooks/useVisibleDeviceEvents";
import { isIOSNative } from "../utils/platform";

function Calendar() {
  const events = useTimeBasedEvents((state) => state);
  const calendars = useCalendarLists((state) => state.calendars);
  const { invitations } = useInvitations();
  const { layout } = useLayout();
  const { date } = useDateWithRouting();
  const visibleDeviceEvents = useVisibleDeviceEvents(date, layout);

  const visibleCalendars = new Set(
    calendars.filter((cal) => cal.isVisible).map((cal) => cal.id),
  );
  const visibleEvents = events.events.filter((evt) =>
    visibleCalendars.has(evt.calendarId ?? ""),
  );

  const allEvents = [
    ...visibleEvents,
    ...invitations.filter((inv) => inv.event).map((inv) => inv.event!),
    ...visibleDeviceEvents,
  ];

  const calendarViews = (
    <>
      {layout === "day" && <SwipeableView View={DayView} events={allEvents} />}
      {layout === "week" && (
        <SwipeableView View={WeekView} events={allEvents} />
      )}
      {layout === "month" && (
        <SwipeableView View={MonthView} events={allEvents} />
      )}
    </>
  );

  if (!isIOSNative()) {
    return (
      <Box p={2}>
        <CalendarHeader />
        {calendarViews}
      </Box>
    );
  }

  return (
    <Box
      p={2}
      sx={{
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <CalendarHeader />
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {calendarViews}
      </Box>
    </Box>
  );
}

// export default withRouter(Calendar)
export default Calendar;
