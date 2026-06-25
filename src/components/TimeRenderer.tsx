import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import { Box, Typography } from "@mui/material";
import { ICalendarEvent } from "../stores/events";
import dayjs from "dayjs";
import { RRule } from "rrule";
import { useIntl } from "react-intl";

const Repeat = ({ repeat }: { repeat: ICalendarEvent["repeat"] }) => {
  const intl = useIntl();
  if (!repeat.rrule) {
    return null;
  }
  let label: string;
  try {
    label = RRule.fromString(`RRULE:${repeat.rrule}`).toText();
  } catch {
    label = repeat.rrule;
  }
  return (
    <>
      <EventRepeatIcon />
      <Typography>
        {intl.formatMessage({ id: "event.repeats" }, { label })}
      </Typography>
    </>
  );
};

export const TimeRenderer = ({
  begin,
  end,
  repeat,
  allDay,
}: {
  begin: number;
  end: number;
  repeat: ICalendarEvent["repeat"];
  allDay?: boolean;
}) => {
  const intl = useIntl();
  // For all-day events, `end` is the exclusive midnight of the day after the
  // last full day, so subtract 1ms before formatting to get the inclusive
  // "last day" label users expect.
  const lastDay = dayjs(end - 1);
  const isMultiDay = allDay && !lastDay.isSame(dayjs(begin), "day");
  const allDayLabel = intl.formatMessage({ id: "event.allDayLabel" });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <AccessTimeIcon />
        <Typography>
          {allDay
            ? isMultiDay
              ? intl.formatMessage(
                  { id: "event.allDayDateRange" },
                  {
                    start: dayjs(begin).format("ddd, DD MMM"),
                    end: lastDay.format("ddd, DD MMM YYYY"),
                    label: allDayLabel,
                  },
                )
              : intl.formatMessage(
                  { id: "event.allDayDate" },
                  {
                    date: dayjs(begin).format("ddd, DD MMMM YYYY"),
                    label: allDayLabel,
                  },
                )
            : `${dayjs(begin).format(
                "ddd, DD MMMM YYYY ⋅ HH:mm -",
              )} ${dayjs(end).format("HH:mm")}`}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Repeat repeat={repeat} />
      </Box>
    </Box>
  );
};
