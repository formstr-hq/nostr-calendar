import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import { Box, Typography } from "@mui/material";
import type { ICalendarEvent } from "../utils/types";
import dayjs from "dayjs";
import { RRule } from "rrule";
import { useIntl } from "react-intl";
import { getEventRRules } from "../utils/repeatingEventsHelper";

const Repeat = ({ repeat }: { repeat: ICalendarEvent["repeat"] }) => {
  const intl = useIntl();
  const recurrenceRules = getEventRRules(repeat);
  if (recurrenceRules.length === 0) {
    return null;
  }

  const labels = recurrenceRules.map((rule) => {
    try {
      return RRule.fromString(`RRULE:${rule}`).toText();
    } catch {
      return rule;
    }
  });

  return (
    <>
      <EventRepeatIcon />
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {labels.map((label, index) => (
          <Typography key={`${label}-${index}`}>
            {intl.formatMessage({ id: "event.repeats" }, { label })}
          </Typography>
        ))}
      </Box>
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
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <Repeat repeat={repeat} />
      </Box>
    </Box>
  );
};
