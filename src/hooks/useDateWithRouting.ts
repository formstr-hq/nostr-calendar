import { useCallback, useMemo } from "react";
import type { Dayjs } from "dayjs";
import { useNavigate, useParams } from "react-router";
import { getDateFromRoute, getRouteFromDate } from "../utils/dateBasedRouting";
import { Layout } from "./useLayout";
import { useSettings } from "../stores/settings";

export function useDateWithRouting() {
  const params = useParams();
  const navigate = useNavigate();
  const weekStart = useSettings((state) => state.settings.general.weekStart);

  // 1. Extract date from route params
  const date: Dayjs = useMemo(() => {
    return getDateFromRoute(params);
  }, [params]);

  // 2. Update date + route based on view
  const setDate = useCallback(
    (nextDate: Dayjs, view: Layout) => {
      const nextRoute = getRouteFromDate(nextDate, view, weekStart);
      navigate(nextRoute);
    },
    [navigate, weekStart],
  );

  return {
    date,
    setDate,
  };
}
