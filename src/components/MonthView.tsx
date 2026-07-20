import {
  alpha,
  Box,
  IconButton,
  Paper,
  styled,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { useRef, useState } from "react";
import { ICalendarEvent } from "../utils/types";
import { DateLabel } from "./DateLabel";
import { useDateWithRouting } from "../hooks/useDateWithRouting";
import { isWeekend } from "../utils/dateHelper";
import ShortcutIcon from "@mui/icons-material/Shortcut";
import { isMobile } from "../common/utils";
import { isEventInDateRange } from "../utils/repeatingEventsHelper";
import { useIntl } from "react-intl";
import { EventChip } from "./ui/EventChip";
import { EventQuickPeek } from "./ui/EventQuickPeek";
import { BottomSheet } from "./ui/BottomSheet";
import { useEventModal } from "../hooks/useEventModal";
import {
  getEventChipColor,
  resolveCalendarColor,
  useResolvedCalendarColor,
} from "../utils/eventChipColor";
import { useCalendarLists } from "../stores/calendarLists";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { CalendarEventView } from "./CalendarEvent";

interface MonthViewProps {
  events: ICalendarEvent[];
}

const MAX_CHIPS = 3;
const MAX_DOTS = 2;

const StyledPaper = styled(Paper)`
  .goto-week {
    visibility: hidden;
  }
  &:hover > .goto-week {
    visibility: visible;
  }
`;

function eventsForDay(events: ICalendarEvent[], day: Dayjs) {
  return events.filter((e) =>
    isEventInDateRange(
      e,
      day.unix() * 1000,
      day.unix() * 1000 + 24 * 60 * 60 * 1000,
    ),
  );
}

/** Wraps an event chip with the color resolution every call site needs. */
function ChipColor({
  event,
  children,
}: {
  event: ICalendarEvent;
  children: (color: string, isPublic: boolean) => React.ReactNode;
}) {
  const theme = useTheme();
  const resolvedColor = useResolvedCalendarColor(event);
  const { color, isPublic } = getEventChipColor(event, theme, resolvedColor);
  return <>{children(color, isPublic)}</>;
}

function DayCellEvent({
  event,
  onPeek,
}: {
  event: ICalendarEvent;
  onPeek: (el: HTMLElement, event: ICalendarEvent) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <ChipColor event={event}>
      {(color, isPublic) => (
        <EventChip
          ref={ref}
          title={event.title}
          color={color}
          isPublic={isPublic}
          time={event.allDay ? undefined : dayjs(event.begin).format("HH:mm")}
          onClick={() => ref.current && onPeek(ref.current, event)}
        />
      )}
    </ChipColor>
  );
}

export function MonthView({ events }: MonthViewProps) {
  const intl = useIntl();
  const { date, setDate } = useDateWithRouting();
  const end = date.endOf("month").endOf("week");
  const start = date.startOf("month").startOf("week");
  const theme = useTheme();
  const isMobileViewport = useMediaQuery(theme.breakpoints.down("sm"));
  const modal = useEventModal();
  const nostrCalendars = useCalendarLists((s) => s.calendars);
  const deviceCalendars = useDeviceCalendars((s) => s.calendars);

  const [eventPeek, setEventPeek] = useState<{
    anchorEl: HTMLElement;
    event: ICalendarEvent;
  } | null>(null);
  const [agendaPeek, setAgendaPeek] = useState<{
    anchorEl: HTMLElement;
    day: Dayjs;
  } | null>(null);
  // `mobileAgendaDay` is kept separately from `mobileSheetOpen` (rather than
  // conditionally mounting/unmounting BottomSheet on it directly) so the
  // Drawer.Root stays mounted permanently and only its `open` prop toggles —
  // vaul's body-scroll-lock cleanup runs on close, not on unmount, so forcing
  // an unmount mid-interaction risks leaking a locked-scroll state into
  // whichever view renders next.
  const [mobileAgendaDay, setMobileAgendaDay] = useState<Dayjs | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const openEvent = (el: HTMLElement, event: ICalendarEvent) =>
    setEventPeek({ anchorEl: el, event });

  const days: Dayjs[] = [];
  let d = start;
  while (d.isBefore(end)) {
    days.push(d);
    d = d.add(1, "day");
  }

  const mobileAgendaEvents = mobileAgendaDay
    ? eventsForDay(events, mobileAgendaDay)
    : [];

  return (
    <Box display="grid" gridTemplateColumns="repeat(7, 1fr)">
      {Array(7)
        .fill(null)
        .map((_, index) => {
          return (
            <Typography
              display={"flex"}
              justifyContent={"center"}
              variant="body1"
              key={index}
              fontWeight={600}
              marginBottom={theme.spacing(1)}
            >
              {dayjs().weekday(index).format("ddd")}
            </Typography>
          );
        })}
      {days.map((day) => {
        const dayEvents = eventsForDay(events, day);
        const visible = isMobileViewport
          ? dayEvents.slice(0, MAX_DOTS)
          : dayEvents.slice(0, MAX_CHIPS);
        const overflowCount = dayEvents.length - visible.length;

        return (
          <StyledPaper
            elevation={0}
            square
            key={day.toString()}
            onClick={
              isMobileViewport
                ? () => {
                    setMobileAgendaDay(day);
                    setMobileSheetOpen(true);
                  }
                : undefined
            }
            sx={{
              position: "relative",
              minHeight: 120,
              p: 0.5,
              wordBreak: "break-word",
              minWidth: 0,
              cursor: isMobileViewport ? "pointer" : "default",
              background: isWeekend(day)
                ? alpha(theme.palette.primary.main, 0.1)
                : "transparent",
            }}
          >
            <DateLabel day={day} size={30} />
            {isMobileViewport ? (
              <Box display="flex" justifyContent="center" gap={0.5} mt={0.5}>
                {visible.map((e) => (
                  <ChipColor key={e.id} event={e}>
                    {(color) => (
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          bgcolor: color,
                        }}
                      />
                    )}
                  </ChipColor>
                ))}
              </Box>
            ) : (
              <Box display={"flex"} flexDirection={"column"} gap={0.25}>
                {visible.map((e) => (
                  <DayCellEvent key={e.id} event={e} onPeek={openEvent} />
                ))}
                {overflowCount > 0 && (
                  <Typography
                    component="button"
                    variant="caption"
                    onClick={(ev) =>
                      setAgendaPeek({
                        anchorEl: ev.currentTarget,
                        day,
                      })
                    }
                    sx={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      p: 0,
                      textAlign: "left",
                      font: "inherit",
                      fontWeight: 600,
                      color: "text.secondary",
                    }}
                  >
                    +{overflowCount}{" "}
                    {intl.formatMessage({ id: "navigation.more" })}
                  </Typography>
                )}
              </Box>
            )}
            {!isMobile && (
              <IconButton
                className="goto-week"
                sx={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                }}
                title={intl.formatMessage({ id: "navigation.goToWeek" })}
                onClick={(e) => {
                  e.stopPropagation();
                  setDate(day, "week");
                }}
              >
                <ShortcutIcon />
              </IconButton>
            )}
          </StyledPaper>
        );
      })}

      {eventPeek && (
        <ChipColor event={eventPeek.event}>
          {(color, isPublic) => (
            <EventQuickPeek
              mode="event"
              anchorEl={eventPeek.anchorEl}
              entry={{ event: eventPeek.event, color, isPublic }}
              onClose={() => setEventPeek(null)}
              onOpen={(e) => {
                setEventPeek(null);
                modal.open(e);
              }}
            />
          )}
        </ChipColor>
      )}

      {agendaPeek && (
        <EventQuickPeek
          mode="agenda"
          anchorEl={agendaPeek.anchorEl}
          day={agendaPeek.day}
          entries={eventsForDay(events, agendaPeek.day).map((event) => {
            const resolvedColor = resolveCalendarColor(
              event,
              nostrCalendars,
              deviceCalendars,
            );
            const { color, isPublic } = getEventChipColor(
              event,
              theme,
              resolvedColor,
            );
            return {
              event,
              color,
              isPublic,
              time: event.allDay
                ? undefined
                : dayjs(event.begin).format("HH:mm"),
            };
          })}
          onClose={() => setAgendaPeek(null)}
          onOpen={(e) => {
            setAgendaPeek(null);
            modal.open(e);
          }}
        />
      )}

      {isMobileViewport && (
        <BottomSheet
          open={mobileSheetOpen}
          onClose={() => setMobileSheetOpen(false)}
        >
          {mobileAgendaDay && (
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                {mobileAgendaDay.format("dddd, D MMMM")}
              </Typography>
              <Box display="flex" flexDirection="column" gap={0.5}>
                {mobileAgendaEvents.map((e) => (
                  <DayCellEvent
                    key={e.id}
                    event={e}
                    onPeek={(_el, event) => {
                      setMobileSheetOpen(false);
                      modal.open(event);
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </BottomSheet>
      )}

      {modal.event && (
        <CalendarEventView
          event={modal.event}
          display="modal"
          open
          onClose={modal.close}
        />
      )}
    </Box>
  );
}
