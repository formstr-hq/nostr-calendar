import { useEffect } from "react";
import type { Dayjs } from "dayjs";
import type { Layout } from "./useLayout";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { DeviceCalendar } from "../plugins/deviceCalendar";
import { deviceCalendarIdFor } from "../utils/deviceCalendarAdapter";
import { useSettings } from "../stores/settings";
import { startOfConfiguredWeek } from "../utils/calendarSettings";
import type { WeekStart } from "../stores/settings";

function getDeviceEventRange(
  date: Dayjs,
  layout: Layout,
  weekStart: WeekStart,
) {
  let rangeStart = date.startOf("day");
  let rangeEnd = date.endOf("day");

  if (layout === "week") {
    rangeStart = startOfConfiguredWeek(date, weekStart);
    rangeEnd = rangeStart.add(6, "day").endOf("day");
  } else if (layout === "month") {
    rangeStart = startOfConfiguredWeek(date.startOf("month"), weekStart);
    rangeEnd = startOfConfiguredWeek(date.endOf("month"), weekStart)
      .add(6, "day")
      .endOf("day");
  }

  return {
    // Pad by a day on each side so spanning all-day and overnight events are
    // present when the visible range clips them at the boundary.
    startMs: rangeStart.subtract(1, "day").valueOf(),
    endMs: rangeEnd.add(1, "day").valueOf(),
  };
}

export function useVisibleDeviceEvents(date: Dayjs, layout: Layout) {
  const weekStart = useSettings((state) => state.settings.general.weekStart);
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
    void deviceRefreshEvents(getDeviceEventRange(date, layout, weekStart));
  }, [
    date,
    deviceCalendars,
    devicePermission,
    deviceRefreshEvents,
    deviceVisibility,
    layout,
    weekStart,
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
