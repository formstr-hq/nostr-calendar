import { useCallback } from "react";
import dayjs from "dayjs";
import { useLocation, useNavigate } from "react-router";
import type { Layout } from "./useLayout";
import {
  getDateFromPathname,
  getLayoutFromPathname,
  getRouteFromDate,
} from "../utils/dateBasedRouting";
import { useSettings } from "../stores/settings";
import { startOfConfiguredWeek } from "../utils/calendarSettings";
import type { WeekStart } from "../stores/settings";

function formatDateLabel(
  date: ReturnType<typeof dayjs>,
  layout: Layout,
  weekStart: WeekStart,
): string {
  if (layout === "month") return date.format("MMMM YYYY");
  if (layout === "day") return date.format("MMM D, YYYY");
  const start = startOfConfiguredWeek(date, weekStart);
  return `${start.format("DD")}-${start
    .add(6, "day")
    .format("DD")} ${date.format("MMM YY")}`;
}

function staticTitleFor(pathname: string): string {
  if (
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/notification-event")
  )
    return "Notifications";
  if (pathname.startsWith("/bookings")) return "Bookings";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/schedule")) return "Scheduling";
  if (pathname.startsWith("/event")) return "Event";
  return "Calendar";
}

export interface CalendarTopBarProps {
  mode: "calendar" | "title";
  title?: string;
  dateLabel?: string;
  view?: Layout;
  onViewChange?: (view: Layout) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
}

/**
 * Container logic behind TopBar: derives calendar-nav props on /m /w /d
 * routes, a static title elsewhere. Reads the date/layout straight from the
 * pathname (not useParams()) because TopBar is mounted above <Routes> in
 * AppShell, so useParams() there would always be empty.
 */
export function useCalendarTopBarProps(): CalendarTopBarProps {
  const location = useLocation();
  const navigate = useNavigate();
  const weekStart = useSettings((state) => state.settings.general.weekStart);

  const isCalendarRoute =
    location.pathname.startsWith("/m") ||
    location.pathname.startsWith("/w") ||
    location.pathname.startsWith("/d");

  const layout = getLayoutFromPathname(location.pathname);
  const date = getDateFromPathname(location.pathname);

  const move = useCallback(
    (dir: number) => navigate(getRouteFromDate(date.add(dir, layout), layout)),
    [date, layout, navigate],
  );

  const onToday = useCallback(() => {
    const route = getRouteFromDate(dayjs(), layout);
    if (route !== location.pathname) navigate(route);
  }, [layout, location.pathname, navigate]);

  if (!isCalendarRoute) {
    return { mode: "title", title: staticTitleFor(location.pathname) };
  }

  return {
    mode: "calendar",
    dateLabel: formatDateLabel(date, layout, weekStart),
    view: layout,
    onViewChange: (newLayout) => navigate(getRouteFromDate(date, newLayout)),
    onPrev: () => move(-1),
    onNext: () => move(1),
    onToday,
  };
}
