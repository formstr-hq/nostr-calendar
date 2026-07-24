import { useRef, useState } from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../../../utils/types";
import { PositionedEvent } from "../../../common/calendarEngine";
import { EventChip } from "../../../components/ui/EventChip";
import { EventQuickPeek } from "../../../components/ui/EventQuickPeek";
import { useEventModal } from "../../../hooks/useEventModal";
import {
  useResolvedCalendarColor,
  getEventChipColor,
} from "../../../utils/eventChipColor";
import { getEventDisplayTitle } from "../lib/getEventDisplayTitle";
import { CalendarEventView } from "../EventDetail";
import { useSettings } from "../../../stores/settings";
import { formatCalendarTime } from "../../../utils/calendarSettings";

interface CalendarEventCardProps {
  event: PositionedEvent;
  offset?: string;
}

export function CalendarEventCard({
  event,
  offset = "0px",
}: CalendarEventCardProps) {
  const chipRef = useRef<HTMLElement>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const modal = useEventModal();
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const timeFormat = useSettings((state) => state.settings.general.timeFormat);

  const resolvedColor = useResolvedCalendarColor(event);
  const { color, isPublic } = getEventChipColor(event, theme, resolvedColor);
  const title = getEventDisplayTitle(event, intl);
  const time = event.allDay
    ? undefined
    : formatCalendarTime(dayjs(event.renderBegin), timeFormat);

  // Mobile skips the quick peek and opens the full event bottom sheet
  // directly (design 21's full-detail sections replace it there).
  const handleClick = () => (isMobile ? modal.open(event) : setPeekOpen(true));

  return (
    <>
      <Box
        data-testid="event-card"
        sx={{
          position: "absolute",
          top: `calc(${event.top}px + ${offset})`,
          left: `${(event.col / event.colSpan) * 100}%`,
          width: `${100 / event.colSpan}%`,
          height: event.height,
          overflow: "hidden",
        }}
      >
        <EventChip
          ref={chipRef}
          title={title}
          color={color}
          isPublic={isPublic}
          time={time}
          onClick={handleClick}
          sx={{ height: "100%", alignItems: "flex-start" }}
        />
      </Box>
      {!isMobile && (
        <EventQuickPeek
          mode="event"
          open={peekOpen}
          anchorEl={chipRef.current}
          entry={{ event, color, isPublic }}
          onClose={() => setPeekOpen(false)}
          onOpen={(e) => {
            setPeekOpen(false);
            modal.open(e);
          }}
        />
      )}
      {modal.event && (
        <CalendarEventView
          event={modal.event}
          display="modal"
          open
          onClose={modal.close}
        />
      )}
    </>
  );
}

/** Compact pill used in the all-day banner row of Day and Week views. */
export function AllDayEventChip({ event }: { event: ICalendarEvent }) {
  const chipRef = useRef<HTMLElement>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const modal = useEventModal();
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const resolvedColor = useResolvedCalendarColor(event);
  const { color, isPublic } = getEventChipColor(event, theme, resolvedColor);
  const title = getEventDisplayTitle(event, intl);

  const handleClick = () => (isMobile ? modal.open(event) : setPeekOpen(true));

  return (
    <>
      <Box data-testid="event-card" sx={{ mb: 0.25 }}>
        <EventChip
          ref={chipRef}
          title={title}
          color={color}
          isPublic={isPublic}
          onClick={handleClick}
        />
      </Box>
      {!isMobile && (
        <EventQuickPeek
          mode="event"
          open={peekOpen}
          anchorEl={chipRef.current}
          entry={{ event, color, isPublic }}
          onClose={() => setPeekOpen(false)}
          onOpen={(e) => {
            setPeekOpen(false);
            modal.open(e);
          }}
        />
      )}
      {modal.event && (
        <CalendarEventView
          event={modal.event}
          display="modal"
          open
          onClose={modal.close}
        />
      )}
    </>
  );
}
