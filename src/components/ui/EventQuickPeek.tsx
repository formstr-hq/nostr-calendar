import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  Popover,
  Typography,
} from "@mui/material";
import type { PopoverOrigin } from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import LinkIcon from "@mui/icons-material/Link";
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

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/g;

function extractLinks(text: string): string[] {
  return Array.from(new Set(text.match(URL_PATTERN) ?? []));
}

// Content height varies (links/avatars are optional), so this is a rough
// budget for deciding whether the popover should flip above the anchor
// instead of relying on MUI's viewport clamping, which just shifts the
// popover over the anchor rather than repositioning it above.
const ESTIMATED_POPOVER_HEIGHT = 260;

interface EventEntry {
  event: ICalendarEvent;
  color: string;
  isPublic: boolean;
  time?: string;
}

type EventQuickPeekProps =
  | {
      mode: "event";
      open: boolean;
      anchorEl: HTMLElement | null;
      entry: EventEntry;
      onClose: () => void;
      onOpen: (event: ICalendarEvent) => void;
    }
  | {
      mode: "agenda";
      open: boolean;
      anchorEl: HTMLElement | null;
      day: Dayjs;
      entries: EventEntry[];
      onClose: () => void;
      onOpen: (event: ICalendarEvent) => void;
    };

/**
 * Desktop-only floating quick-peek popover (mockup 02-B), with an inline
 * Yes/Maybe/No RSVP row. Mobile skips this entirely and opens the full
 * event bottom sheet directly (see CalendarEventCard/AllDayEventChip) —
 * design 21's full-detail sections replace the old mobile quick-peek sheet.
 * Also used in "day agenda" mode for Month view's "+N more" overflow
 * (mockup 02-A), desktop-only for the same reason.
 */
export function EventQuickPeek(props: EventQuickPeekProps) {
  const intl = useIntl();
  const navigate = useNavigate();

  const content =
    props.mode === "event" ? (
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
          {props.entries.map(({ event, color, isPublic, time }) => {
            const location = event.location.filter(Boolean).join(", ");
            return (
              <Box key={event.id}>
                <EventChip
                  title={event.title}
                  color={color}
                  isPublic={isPublic}
                  time={time}
                  onClick={() => props.onOpen(event)}
                />
                {location && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 1,
                      mt: 0.25,
                    }}
                  >
                    <LocationOnIcon
                      sx={{ fontSize: 14, color: "text.secondary" }}
                    />
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {location}
                    </Typography>
                  </Box>
                )}
              </Box>
            );
          })}
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
    );

  const openUpward =
    props.open &&
    props.anchorEl !== null &&
    window.innerHeight - props.anchorEl.getBoundingClientRect().bottom <
      ESTIMATED_POPOVER_HEIGHT &&
    props.anchorEl.getBoundingClientRect().top > ESTIMATED_POPOVER_HEIGHT;

  const anchorOrigin: PopoverOrigin = {
    vertical: openUpward ? "top" : "bottom",
    horizontal: "left",
  };
  const transformOrigin: PopoverOrigin = {
    vertical: openUpward ? "bottom" : "top",
    horizontal: "left",
  };

  return (
    <Popover
      open={props.open}
      anchorEl={props.anchorEl}
      onClose={props.onClose}
      disableScrollLock
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
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
      {content}
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
  const links = extractLinks(event.description ?? "");
  const { byPubkey, myRsvp, isSubmitting, submit } = useEventRsvps(event);
  const going = Object.values(byPubkey).filter(
    (r) => r.status === RSVPStatus.accepted,
  ).length;
  const avatarItems = Object.keys(byPubkey)
    .filter((pk) => byPubkey[pk].status === RSVPStatus.accepted)
    .map((pk) => ({ name: pk }));
  const activeRsvpStatus = myRsvp?.status ?? RSVPStatus.pending;

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

        {links.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              mt: 1,
            }}
          >
            {links.map((link) => (
              <Box
                key={link}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <LinkIcon fontSize="small" />
                <Typography
                  component="a"
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  variant="body2"
                  sx={{
                    color: "primary.main",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {link}
                </Typography>
              </Box>
            ))}
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

        {event.source !== "device" && (
          <ButtonGroup
            fullWidth
            size="small"
            disabled={isSubmitting}
            sx={{ mt: 1.5 }}
          >
            <Button
              variant={
                activeRsvpStatus === RSVPStatus.accepted
                  ? "contained"
                  : "outlined"
              }
              color="success"
              onClick={(e) => {
                e.stopPropagation();
                void submit({ status: RSVPStatus.accepted });
              }}
            >
              {intl.formatMessage({ id: "rsvp.yes" })}
            </Button>
            <Button
              variant={
                activeRsvpStatus === RSVPStatus.tentative
                  ? "contained"
                  : "outlined"
              }
              color="warning"
              onClick={(e) => {
                e.stopPropagation();
                void submit({ status: RSVPStatus.tentative });
              }}
            >
              {intl.formatMessage({ id: "rsvp.maybe" })}
            </Button>
            <Button
              variant={
                activeRsvpStatus === RSVPStatus.declined
                  ? "contained"
                  : "outlined"
              }
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                void submit({ status: RSVPStatus.declined });
              }}
            >
              {intl.formatMessage({ id: "rsvp.no" })}
            </Button>
          </ButtonGroup>
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
