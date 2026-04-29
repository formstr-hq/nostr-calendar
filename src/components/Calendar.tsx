import { useTimeBasedEvents } from "../stores/events";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { useLayout, type Layout } from "../hooks/useLayout";
import { CalendarHeader } from "./CalendarHeader";
import { Box } from "@mui/material";
import { SwipeableView } from "./SwipeableView";
import { useCalendarLists } from "../stores/calendarLists";
import { useInvitations } from "../stores/invitations";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { useEffect } from "react";
import { DeviceCalendar } from "../plugins/deviceCalendar";
import { useDateWithRouting } from "../hooks/useDateWithRouting";
import type { Dayjs } from "dayjs";
import { deviceCalendarIdFor } from "../utils/deviceCalendarAdapter";

function getDeviceEventRange(date: Dayjs, layout: Layout) {
  let rangeStart = date.startOf("day");
  let rangeEnd = date.endOf("day");

  if (layout === "week") {
    rangeStart = date.startOf("week").startOf("day");
    rangeEnd = date.endOf("week").endOf("day");
  } else if (layout === "month") {
    rangeStart = date.startOf("month").startOf("week").startOf("day");
    rangeEnd = date.endOf("month").endOf("week").endOf("day");
  }

  return {
    // Pad by a day on each side so spanning all-day and overnight events are
    // present when the visible range clips them at the boundary.
    startMs: rangeStart.subtract(1, "day").valueOf(),
    endMs: rangeEnd.add(1, "day").valueOf(),
  };
}

function Calendar() {
  const events = useTimeBasedEvents((state) => state);
  const calendars = useCalendarLists((state) => state.calendars);
  const { invitations } = useInvitations();
  const { layout } = useLayout();
  const { date } = useDateWithRouting();
  const deviceInit = useDeviceCalendars((s) => s.init);
  const deviceSyncPermission = useDeviceCalendars((s) => s.syncPermission);
  const deviceRefreshEvents = useDeviceCalendars((s) => s.refreshEvents);
  const devicePermission = useDeviceCalendars((s) => s.permission);
  const deviceCalendarsList = useDeviceCalendars((s) => s.calendars);
  const deviceVisibility = useDeviceCalendars((s) => s.visibility);
  const deviceEvents = useDeviceCalendars((s) => s.events);

  useEffect(() => {
    deviceInit();
  }, [deviceInit]);

  useEffect(() => {
    if (!DeviceCalendar.isAvailable()) {
      return;
    }

    let cancelled = false;
    let removeResume: (() => Promise<void>) | undefined;

    void (async () => {
      try {
        const { App: CapacitorApp } = await import("@capacitor/app");
        const listener = await CapacitorApp.addListener("resume", () => {
          void deviceSyncPermission();
        });
        if (cancelled) {
          void listener.remove();
          return;
        }
        removeResume = () => listener.remove();
      } catch {
        // Ignore on platforms where lifecycle events are unavailable.
      }
    })();

    return () => {
      cancelled = true;
      void removeResume?.();
    };
  }, [deviceSyncPermission]);

  useEffect(() => {
    if (devicePermission !== "granted") return;
    deviceRefreshEvents(getDeviceEventRange(date, layout));
  }, [
    devicePermission,
    date,
    layout,
    deviceCalendarsList,
    deviceVisibility,
    deviceRefreshEvents,
  ]);

  const visibleCalendars = new Set(
    calendars.filter((cal) => cal.isVisible).map((cal) => cal.id),
  );
  const visibleEvents = events.events.filter((evt) =>
    visibleCalendars.has(evt.calendarId ?? ""),
  );

  const visibleDeviceCalendarIds = new Set(
    deviceCalendarsList
      .filter((calendar) => deviceVisibility[calendar.id] !== false)
      .map((calendar) => deviceCalendarIdFor(calendar.id)),
  );
  const visibleDeviceEvents = deviceEvents.filter((event) =>
    visibleDeviceCalendarIds.has(event.calendarId ?? ""),
  );

  const allEvents = [
    ...visibleEvents,
    ...invitations.filter((inv) => inv.event).map((inv) => inv.event!),
    ...visibleDeviceEvents,
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
