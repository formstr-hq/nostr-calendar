import { useLocation, useNavigate, useParams } from "react-router";
import { getDateFromRoute, getRouteFromDate } from "../utils/dateBasedRouting";
import { useEffect } from "react";
import { useSettings } from "../stores/settings";

export type Layout = "week" | "month" | "day";

export const useLayout = (): {
  layout: Layout;
  updateLayout: (newLayout: Layout) => void;
} => {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const updateSetting = useSettings((state) => state.updateSetting);
  const weekStart = useSettings((state) => state.settings.general.weekStart);
  let currentLayout: Layout = "week";
  if (location.pathname.startsWith("/m")) {
    currentLayout = "month";
  } else if (location.pathname.startsWith("/d")) {
    currentLayout = "day";
  }
  useEffect(() => {
    if (/^\/[mwd]\//.test(location.pathname)) {
      updateSetting("layout", currentLayout);
    }
  }, [currentLayout, location.pathname, updateSetting]);
  const updateLayout = (newLayout: Layout) => {
    const date = getDateFromRoute(params);
    const route = getRouteFromDate(date, newLayout, weekStart);
    navigate(route);
  };
  return { layout: currentLayout, updateLayout };
};
