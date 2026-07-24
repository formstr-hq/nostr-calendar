import { useNavigate } from "react-router";
import { useEffect } from "react";
import dayjs from "dayjs";
import { useSettings } from "../stores/settings";
import { getRouteFromDate } from "../utils/dateBasedRouting";

export function Index() {
  const navigate = useNavigate();
  const layout = useSettings((state) => state.settings.layout);
  const weekStart = useSettings((state) => state.settings.general.weekStart);
  useEffect(() => {
    navigate(getRouteFromDate(dayjs(), layout, weekStart), { replace: true });
  }, [layout, navigate, weekStart]);
  return <></>;
}
