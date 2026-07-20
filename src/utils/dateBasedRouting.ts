import dayjs, { Dayjs } from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import type { Layout } from "../hooks/useLayout";

dayjs.extend(weekOfYear);

type DayRouteParams = {
  year: string;
  month: string;
  day: string;
};

type MonthRouteParams = {
  year: string;
  monthNumber: string;
};

type WeekRouteParams = {
  year: string;
  weekNumber: string;
};

type CalendarRouteParams =
  | Partial<DayRouteParams>
  | Partial<MonthRouteParams>
  | Partial<WeekRouteParams>;

export function getDateFromRoute(params: CalendarRouteParams): Dayjs {
  const { year } = params;

  // Day route: /d/:year/:month/:day
  if (year && "month" in params && "day" in params) {
    return dayjs(`${year}-${params.month}-${params.day}`);
  }

  // Month route: /m/:year/:monthNumber
  if (year && "monthNumber" in params) {
    // default to 1st of the month
    return dayjs(`${year}-${params.monthNumber}-01`);
  }

  // Week route: /w/:year/:weekNumber
  if (year && "weekNumber" in params) {
    // Use local week boundaries so rendered days line up with local midnight.
    return dayjs()
      .year(Number(year))
      .week(Number(params.weekNumber))
      .startOf("week");
  }

  // fallback (optional)
  return dayjs();
}

/**
 * Layout/date derived straight from a pathname string via useLocation(),
 * rather than useParams(). Needed by components mounted above <Routes>
 * (the shell — TopBar, Sidebar) since useParams() only sees the params of
 * the closest matched <Route>, which doesn't include anything above it.
 */
export function getLayoutFromPathname(pathname: string): Layout {
  if (pathname.startsWith("/m")) return "month";
  if (pathname.startsWith("/d")) return "day";
  return "week";
}

export function getDateFromPathname(pathname: string): Dayjs {
  const day = pathname.match(/^\/d\/(\d+)\/(\d+)\/(\d+)/);
  if (day) {
    return getDateFromRoute({ year: day[1], month: day[2], day: day[3] });
  }
  const month = pathname.match(/^\/m\/(\d+)\/(\d+)/);
  if (month) {
    return getDateFromRoute({ year: month[1], monthNumber: month[2] });
  }
  const week = pathname.match(/^\/w\/(\d+)\/(\d+)/);
  if (week) {
    return getDateFromRoute({ year: week[1], weekNumber: week[2] });
  }
  return dayjs();
}

export function getRouteFromDate(date: Dayjs, type: Layout): string {
  let year = date.year();

  switch (type) {
    case "day": {
      const month = date.month() + 1; // dayjs months are 0-based
      const day = date.date();

      return `/d/${year}/${month}/${day}`;
    }

    case "month": {
      const month = date.month() + 1;

      return `/m/${year}/${month}`;
    }

    case "week": {
      const weekNumber = date.week();
      if (weekNumber === 1) {
        year = date.endOf("week").year();
      }
      return `/w/${year}/${weekNumber}`;
    }
  }
}
