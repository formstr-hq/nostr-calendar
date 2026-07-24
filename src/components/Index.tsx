import { useNavigate } from "react-router";
import { useEffect } from "react";
import dayjs from "dayjs";
import { useSettings } from "../stores/settings";
import { getRouteFromDate } from "../utils/dateBasedRouting";

export function Index() {
  const navigate = useNavigate();
  const layout = useSettings((state) => state.settings.layout);
  useEffect(() => {
    navigate(getRouteFromDate(dayjs(), layout), { replace: true });
  }, [layout, navigate]);
  return <></>;
}
