import { useNavigate } from "react-router";
import { ROUTES } from "../utils/routingHelper";
import { useEffect } from "react";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";

dayjs.extend(weekOfYear);

export function Index() {
  const year = dayjs().get("year");
  const weekNumber = dayjs().week();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(
      ROUTES.WeekCalendar.replace(":year", year.toString()).replace(
        ":weekNumber",
        weekNumber.toString(),
      ),
      { replace: true },
    );
  }, [navigate]);
  return <></>;
}
