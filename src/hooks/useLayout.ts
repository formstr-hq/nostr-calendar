import { useLocation, useNavigate, useParams } from "react-router";
import { getDateFromRoute, getRouteFromDate } from "../utils/dateBasedRouting";

export type Layout = "week" | "month" | "day";

export const useLayout = (): {
  layout: Layout;
  updateLayout: (newLayout: Layout) => void;
} => {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  let currentLayout: Layout = "week";
  if (location.pathname.startsWith("/m")) {
    currentLayout = "month";
  } else if (location.pathname.startsWith("/d")) {
    currentLayout = "day";
  }
  const updateLayout = (newLayout: Layout) => {
    const date = getDateFromRoute(params);
    const route = getRouteFromDate(date, newLayout);
    navigate(route);
  };
  return { layout: currentLayout, updateLayout };
};
