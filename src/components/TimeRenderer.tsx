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
      <Typography>{intl.formatMessage({ id: "event.repeats" }, { label })}</Typography>
    </>
  );
};

export const TimeRenderer = ({
  begin,
  end,
  repeat,
}: {
  begin: number;
  end: number;
  repeat: ICalendarEvent["repeat"];
}) => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <AccessTimeIcon />
        <Typography>
          {dayjs(begin).format("ddd, DD MMMM YYYY ⋅ HH:mm -")}{" "}
          {dayjs(end).format("HH:mm")}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Repeat repeat={repeat} />
      </Box>
    </Box>
  );
};
