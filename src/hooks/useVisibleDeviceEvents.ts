import { useEffect } from "react";
import type { Dayjs } from "dayjs";
import type { Layout } from "./useLayout";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { DeviceCalendar } from "../plugins/deviceCalendar";
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

export function useVisibleDeviceEvents(date: Dayjs, layout: Layout) {
  const deviceInit = useDeviceCalendars((state) => state.init);
  const deviceSyncPermission = useDeviceCalendars(
    (state) => state.syncPermission,
  );
  const deviceRefreshEvents = useDeviceCalendars(
    (state) => state.refreshEvents,
  );
  const devicePermission = useDeviceCalendars((state) => state.permission);
  const deviceCalendars = useDeviceCalendars((state) => state.calendars);
  const deviceVisibility = useDeviceCalendars((state) => state.visibility);
  const deviceEvents = useDeviceCalendars((state) => state.events);

  useEffect(() => {
    void deviceInit();
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
    void deviceRefreshEvents(getDeviceEventRange(date, layout));
  }, [
    date,
    deviceCalendars,
    devicePermission,
    deviceRefreshEvents,
    deviceVisibility,
    layout,
  ]);

  const visibleDeviceCalendarIds = new Set(
    deviceCalendars
      .filter((calendar) => deviceVisibility[calendar.id] !== false)
      .map((calendar) => deviceCalendarIdFor(calendar.id)),
  );

  return deviceEvents.filter((event) =>
    visibleDeviceCalendarIds.has(event.calendarId ?? ""),
  );
}
