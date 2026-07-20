import { Box, Divider, Popover, Typography } from "@mui/material";
import RepeatIcon from "@mui/icons-material/Repeat";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import type { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import type { ICalendarEvent } from "../../utils/types";
import { RSVPStatus } from "../../utils/types";
import { getEventDisplayRange } from "../../utils/eventOccurrence";
import { getRouteFromDate } from "../../utils/dateBasedRouting";
import { useEventRsvps } from "../../hooks/useEventRsvps";
import { useNavigate } from "react-router";
import { EventChip } from "./EventChip";
import { AvatarStack } from "./AvatarStack";
import { TimeRenderer } from "../TimeRenderer";
import { radius, shadow } from "../../theme/tokens";

interface EventEntry {
  event: ICalendarEvent;
  color: string;
  isPublic: boolean;
  time?: string;
}

type EventQuickPeekProps =
  | {
      mode: "event";
      anchorEl: HTMLElement | null;
      entry: EventEntry;
      onClose: () => void;
      onOpen: (event: ICalendarEvent) => void;
    }
  | {
      mode: "agenda";
      anchorEl: HTMLElement | null;
      day: Dayjs;
      entries: EventEntry[];
      onClose: () => void;
      onOpen: (event: ICalendarEvent) => void;
    };

/**
 * Shared floating quick-peek popover (mockup 02-B) — meta only, no inline
 * RSVP actions or relay-publish status (those stay in the full modal until
 * F-EVENT-VIEW decomposes RespondPanel). Also used in "day agenda" mode for
 * Month view's "+N more" overflow (mockup 02-A).
 */
export function EventQuickPeek(props: EventQuickPeekProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const open = props.anchorEl !== null;

  return (
    <Popover
      open={open}
      anchorEl={props.anchorEl}
      onClose={props.onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: `${radius.popover}px`,
            boxShadow: shadow.popover,
            width: 320,
            maxWidth: "90vw",
          },
        },
      }}
    >
      {props.mode === "event" ? (
        <EventPeekBody
          entry={props.entry}
          onOpen={() => {
            props.onOpen(props.entry.event);
          }}
        />
      ) : (
        <Box sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ px: 0.5, pb: 1 }}>
            {props.day.format("dddd, D MMMM")} · {props.entries.length}{" "}
            {intl.formatMessage({ id: "event.eventsCount" })}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {props.entries.map(({ event, color, isPublic, time }) => (
              <EventChip
                key={event.id}
                title={event.title}
                color={color}
                isPublic={isPublic}
                time={time}
                onClick={() => props.onOpen(event)}
              />
            ))}
          </Box>
          <Divider sx={{ my: 1 }} />
          <Typography
            component="button"
            onClick={() => {
              props.onClose();
              navigate(getRouteFromDate(props.day, "day"));
            }}
            sx={{
              border: "none",
              background: "none",
              cursor: "pointer",
              p: 0.5,
              font: "inherit",
              fontWeight: 600,
              color: "primary.main",
            }}
          >
            {intl.formatMessage({ id: "navigation.openDayView" })} →
          </Typography>
        </Box>
      )}
    </Popover>
  );
}

function EventPeekBody({
  entry,
  onOpen,
}: {
  entry: EventEntry;
  onOpen: () => void;
}) {
  const intl = useIntl();
  const { event, color } = entry;
  const range = getEventDisplayRange(event);
  const { byPubkey } = useEventRsvps(event);
  const going = Object.values(byPubkey).filter(
    (r) => r.status === RSVPStatus.accepted,
  ).length;
  const avatarItems = Object.keys(byPubkey)
    .filter((pk) => byPubkey[pk].status === RSVPStatus.accepted)
    .map((pk) => ({ name: pk }));

  return (
    <Box>
      <Box sx={{ height: 4, bgcolor: color }} />
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
          {event.title || intl.formatMessage({ id: "event.untitled" })}
        </Typography>

        <TimeRenderer
          begin={range.begin}
          end={range.end}
          repeat={event.repeat}
          allDay={event.allDay}
        />

        {event.location.filter(Boolean).length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
            <LocationOnIcon fontSize="small" />
            <Typography variant="body2">
              {event.location.filter(Boolean).join(", ")}
            </Typography>
          </Box>
        )}

        {event.repeat?.rrule && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
            <RepeatIcon fontSize="small" />
            <Typography variant="body2">
              {intl.formatMessage({ id: "event.repeatsBadge" })}
            </Typography>
          </Box>
        )}

        {avatarItems.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}>
            <AvatarStack items={avatarItems} size={24} max={3} />
            <Typography variant="body2" color="text.secondary">
              {going} {intl.formatMessage({ id: "event.going" })}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography
          component="button"
          onClick={onOpen}
          sx={{
            border: "none",
            background: "none",
            cursor: "pointer",
            p: 0,
            font: "inherit",
            fontWeight: 600,
            color: "primary.main",
          }}
        >
          {intl.formatMessage({ id: "event.open" })} →
        </Typography>
      </Box>
    </Box>
  );
}
