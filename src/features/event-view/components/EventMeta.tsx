import { Typography } from "@mui/material";
import { useIntl } from "react-intl";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ICalendarEvent } from "../../../utils/types";
import { TimeRenderer } from "../../../components/TimeRenderer";
import { EventBusyListToggle } from "../../../components/EventBusyListToggle";
import { getEventDisplayRange } from "../../../utils/eventOccurrence";
import { EventLocationCard } from "./EventLocationCard";

export function EventMeta({ event }: { event: ICalendarEvent }) {
  const intl = useIntl();
  const eventDisplayRange = getEventDisplayRange(event);
  const locations = event.location.filter((location) => !!location?.trim?.());

  return (
    <>
      <TimeRenderer
        begin={eventDisplayRange.begin}
        end={eventDisplayRange.end}
        repeat={event.repeat}
        allDay={event.allDay}
      />

      <EventBusyListToggle event={event} />

      {locations.length > 0 && (
        <EventLocationCard location={locations.join(", ")} />
      )}

      {event.description && (
        <>
          <Typography variant="subtitle1">
            {intl.formatMessage({ id: "navigation.description" })}
          </Typography>
          {/* component="div" avoids <p> nesting: Typography defaults to <p>
              but react-markdown also wraps paragraphs in <p> tags */}
          <Typography component="div" variant="body2">
            <Markdown remarkPlugins={[remarkGfm]}>{event.description}</Markdown>
          </Typography>
        </>
      )}
    </>
  );
}
