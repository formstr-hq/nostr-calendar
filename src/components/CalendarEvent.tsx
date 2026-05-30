// import { useDraggable } from "@dnd-kit/core";
import {
  alpha,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Paper,
  Stack,
  Theme,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ICalendarEvent } from "../utils/types";
import { PositionedEvent } from "../common/calendarEngine";
import { TimeRenderer } from "./TimeRenderer";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopy from "@mui/icons-material/ContentCopy";
import OpenInNew from "@mui/icons-material/OpenInNew";
import Download from "@mui/icons-material/Download";
import Edit from "@mui/icons-material/Edit";
import FileCopy from "@mui/icons-material/FileCopy";
import Delete from "@mui/icons-material/Delete";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import dayjs from "dayjs";
import { exportICS, isMobile } from "../common/utils";
import { editPrivateCalendarEvent, encodeNAddr } from "../common/nostr";
import type { RSVPRecord } from "../common/nostr";
import {
  getDuplicateEventPage,
  getEditEventPage,
  getEventPage,
} from "../utils/routingHelper";
import { useNavigate } from "react-router";
import { getAppBaseUrl, isNative } from "../utils/platform";
import { useNotifications } from "../stores/notifications";
import { useCalendarLists } from "../stores/calendarLists";
import { useTimeBasedEvents } from "../stores/events";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import {
  DEVICE_CALENDAR_ID_PREFIX,
  deviceCalendarColor,
} from "../utils/deviceCalendarAdapter";
import { useIntl, type IntlShape } from "react-intl";
import { useUser } from "../stores/user";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EventBusyListToggle } from "./EventBusyListToggle";

import {
  buildEventRef,
  findCalendarForEvent,
  getCalendarEventCoordinate,
} from "../utils/calendarListTypes";
import {
  getEventDisplayRange,
  getEventOccurrenceRange,
} from "../utils/eventOccurrence";
import { EventCalendarListManagement } from "./EventCalendarListManagement";
import { FormFillerDialog } from "./FormFillerDialog";
import { FormAttachmentRow } from "./FormAttachmentRow";
import type { IFormAttachment } from "../utils/types";
import { useEventRsvps } from "../hooks/useEventRsvps";
import { RSVPBar } from "./RSVPBar";
import { RespondPanel } from "./RespondPanel";
import { RSVPParticipantList } from "./RSVPParticipantList";
import { CalendarEventState } from "../common/types";

interface CalendarEventCardProps {
  event: PositionedEvent;
  offset?: string;
}

export interface CalendarEventViewProps {
  event: ICalendarEvent;
  display?: "modal" | "page";
  open?: boolean;
  onClose?: () => void;
}

/**
 * Resolves the display color for an event by checking, in order:
 * 1. The owning Nostr calendar list's color, if `event.calendarId` matches one
 * 2. The device calendar's hex color when `event.source === "device"`
 * 3. `undefined` (caller falls back to the theme palette)
 */
function useResolvedCalendarColor(event: ICalendarEvent): string | undefined {
  const nostrCalendars = useCalendarLists.getState().calendars;
  const deviceCalendars = useDeviceCalendars((s) => s.calendars);

  const owning = event.calendarId
    ? nostrCalendars.find((c) => c.id === event.calendarId)
    : undefined;
  if (owning?.color) return owning.color;

  if (event.source === "device" && event.calendarId) {
    const nativeId = event.calendarId.startsWith(DEVICE_CALENDAR_ID_PREFIX)
      ? event.calendarId.slice(DEVICE_CALENDAR_ID_PREFIX.length)
      : event.calendarId;
    const info = deviceCalendars.find((c) => c.id === nativeId);
    if (info) return deviceCalendarColor(info);
  }
  return undefined;
}

/**
 * Returns color scheme for an event card based on its type:
 * - Invitation events: grey background with dashed border
 * - Private events with a calendar: themed by the calendar's color
 * - Other private events: default dark theme
 * - Public events: semi-transparent primary
 */
function getColorScheme(
  event: ICalendarEvent,
  theme: Theme,
  calendarColor?: string,
) {
  // Invitation events get a distinct grey/dashed style
  if (event.isInvitation) {
    return {
      color: theme.palette.text.secondary,
      backgroundColor: "#e0e0e0",
      border: "2px dashed #999",
    };
  }

  // Device-sourced events use the full calendar color so they carry the same
  // visual weight as other calendars.
  if (event.source === "device" && calendarColor) {
    return {
      color: "#fff",
      backgroundColor: calendarColor,
      border: `1px solid ${alpha(calendarColor, 0.9)}`,
    };
  }

  // Private events themed by their calendar's color
  if (event.isPrivateEvent && calendarColor) {
    return {
      color: "#fff",
      backgroundColor: alpha(calendarColor, 0.7),
    };
  }

  if (event.isPrivateEvent) {
    return {
      color: "#fff",
      backgroundColor: theme.palette.primary.light,
    };
  }

  return {
    backgroundColor: alpha(theme.palette.primary.main, 0.3),
    color: "#fff",
  };
}

function getEventDisplayTitle(
  event: ICalendarEvent,
  intl: IntlShape,
  maxDescLength = 20,
): string {
  const title = event.title?.trim();
  if (title) {
    return title;
  }

  const description = event.description?.trim() ?? "";
  if (description) {
    return description.length > maxDescLength
      ? `${description.substring(0, maxDescLength)}...`
      : description;
  }

  return intl.formatMessage({ id: "event.untitled" });
}

const uniqueParticipants = (participants: string[]) =>
  Array.from(
    new Set(participants.map((participant) => participant.toLowerCase())),
  );

export function CalendarEventCard({
  event,
  offset = "0px",
}: CalendarEventCardProps) {
  // const { attributes, listeners, setNodeRef } = useDraggable({ id: event.id });
  const [open, setOpen] = useState(false);
  const handleClose = () => setOpen(false);
  const intl = useIntl();
  const theme = useTheme();

  const resolvedColor = useResolvedCalendarColor(event);

  const colorScheme = getColorScheme(event, theme, resolvedColor);
  const title = getEventDisplayTitle(event, intl);
  return (
    <>
      <Paper
        // ref={setNodeRef}
        // {...listeners}
        // {...attributes}
        onClick={() => setOpen(true)}
        sx={{
          position: "absolute",
          backgroundColor: colorScheme.backgroundColor,
          border: colorScheme.border,
          top: `calc(${event.top}px + ${offset})`,
          left: `${(event.col / event.colSpan) * 100}%`,
          width: `${100 / event.colSpan}%`,
          height: event.height,
          p: 0.5,
          cursor: "pointer",
          userSelect: "none",
          overflow: "hidden",
          textOverflow: "clip",
        }}
      >
        <Typography
          variant="caption"
          color={colorScheme.color}
          fontWeight={600}
        >
          {event.source === "device" && (
            <PhoneAndroidIcon
              sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }}
            />
          )}
          {title}
        </Typography>
      </Paper>
      <CalendarEventView
        event={event}
        display="modal"
        open={open}
        onClose={handleClose}
      />
    </>
  );
}

export function CalendarEventView({
  event,
  display = "modal",
  open = false,
  onClose,
}: CalendarEventViewProps) {
  const intl = useIntl();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const title = getEventDisplayTitle(event, intl);

  const handleClose = () => onClose?.();

  const titleBar = (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      }}
    >
      <Typography component={"p"} variant="h5">
        {title}
      </Typography>
      <ActionButtons
        event={event}
        closeModal={handleClose}
        showClose={display === "modal"}
        showOpenInNew={display !== "page"}
      />
    </Box>
  );

  if (display === "page") {
    return (
      <Box
        sx={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: 3,
        }}
      >
        <Box sx={{ marginBottom: 2 }}>{titleBar}</Box>
        <CalendarEvent event={event} />
      </Box>
    );
  }

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      fullScreen={fullScreen}
      slotProps={{
        paper: {
          sx: {
            height: {
              sm: "100vh",
              md: "60vh",
            },
          },
        },
      }}
      open={open}
      onClose={handleClose}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {titleBar}
      </DialogTitle>
      <DialogContent dividers>
        <CalendarEvent event={event} />
      </DialogContent>
    </Dialog>
  );
}

function ActionButtons({
  event,
  closeModal,
  showClose = true,
  showOpenInNew = true,
}: {
  event: ICalendarEvent;
  closeModal: () => void;
  showClose?: boolean;
  showOpenInNew?: boolean;
}) {
  const intl = useIntl();
  const { user } = useUser();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const iconSize = isMobile ? "small" : "medium";

  // Device events have no Nostr coordinate; render a slim action bar that
  // only allows ICS export + close. No edit, delete, copy-link, or share.
  if (event.source === "device") {
    return (
      <Box
        minWidth={isMobile ? "inherit" : "80px"}
        sx={{ whiteSpace: "nowrap" }}
      >
        {!isNative && (
          <IconButton size={iconSize} onClick={() => exportICS(event)}>
            <Tooltip
              title={intl.formatMessage({ id: "event.downloadDetails" })}
            >
              <Download fontSize={iconSize} />
            </Tooltip>
          </IconButton>
        )}
        {showClose && (
          <IconButton
            size={iconSize}
            aria-label={intl.formatMessage({ id: "navigation.close" })}
            onClick={closeModal}
          >
            <CloseIcon fontSize={iconSize} />
          </IconButton>
        )}
      </Box>
    );
  }

  const occurrenceRange = getEventOccurrenceRange(event);
  const linkToEvent = getEventPage(
    encodeNAddr(
      {
        pubkey: event.user,
        identifier: event.id,
        kind: event.kind,
      },
      event.relayHint ? [event.relayHint] : undefined,
    ),
    event.viewKey,
    occurrenceRange,
  );
  const eventUrl = `${getAppBaseUrl()}${linkToEvent}`;
  const copyLinkToEvent = () => {
    navigator.clipboard.writeText(eventUrl);
  };
  const isEditable = event.user === user?.pubkey;

  const editEvent = () => {
    const editLink = getEditEventPage(
      encodeNAddr(
        {
          pubkey: event.user,
          identifier: event.id,
          kind: event.kind,
        },
        event.relayHint ? [event.relayHint] : undefined,
      ),
      event.viewKey,
    );
    closeModal();
    navigate(editLink, {
      state: {
        calendarEvent: event,
      } satisfies CalendarEventState,
    });
  };

  const duplicateEvent = () => {
    const duplicateLink = getDuplicateEventPage(
      encodeNAddr(
        {
          pubkey: event.user,
          identifier: event.id,
          kind: event.kind,
        },
        event.relayHint ? [event.relayHint] : undefined,
      ),
      event.viewKey,
    );
    closeModal();
    navigate(duplicateLink);
  };

  return (
    <Box
      minWidth={isMobile ? "inherit" : "160px"}
      sx={{ whiteSpace: "nowrap" }}
    >
      <IconButton size={iconSize} onClick={copyLinkToEvent}>
        <Tooltip title={intl.formatMessage({ id: "event.copyLink" })}>
          <ContentCopy fontSize={iconSize} />
        </Tooltip>
      </IconButton>
      {!isMobile && (
        <>
          {showOpenInNew && (
            <IconButton size={iconSize} component={Link} href={linkToEvent}>
              <Tooltip title={intl.formatMessage({ id: "event.openNewTab" })}>
                <OpenInNew fontSize={iconSize} />
              </Tooltip>
            </IconButton>
          )}
        </>
      )}

      {!isNative && (
        <IconButton size={iconSize} onClick={() => exportICS(event)}>
          <Tooltip title={intl.formatMessage({ id: "event.downloadDetails" })}>
            <Download fontSize={iconSize} />
          </Tooltip>
        </IconButton>
      )}
      {isEditable && (
        <IconButton size={iconSize} onClick={duplicateEvent}>
          <Tooltip title={intl.formatMessage({ id: "event.duplicateEvent" })}>
            <FileCopy fontSize={iconSize} />
          </Tooltip>
        </IconButton>
      )}
      {isEditable && (
        <IconButton size={iconSize} onClick={editEvent}>
          <Tooltip title={intl.formatMessage({ id: "event.editEvent" })}>
            <Edit fontSize={iconSize} />
          </Tooltip>
        </IconButton>
      )}
      <IconButton size={iconSize} onClick={() => setDeleteDialogOpen(true)}>
        <Tooltip title={intl.formatMessage({ id: "event.deleteEvent" })}>
          <Delete fontSize={iconSize} />
        </Tooltip>
      </IconButton>
      <DeleteEventDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          closeModal();
        }}
        event={event}
      />
      {showClose && (
        <IconButton
          size={iconSize}
          aria-label={intl.formatMessage({ id: "navigation.close" })}
          onClick={closeModal}
        >
          <CloseIcon fontSize={iconSize} />
        </IconButton>
      )}
    </Box>
  );
}

export function CalendarEvent({ event }: CalendarEventViewProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const eventDisplayRange = getEventDisplayRange(event);
  const locations = event.location.filter((location) => !!location?.trim?.());
  const participants = uniqueParticipants(event.participants);
  const { calendars, moveEventToCalendar } = useCalendarLists();
  const { updateEvent } = useTimeBasedEvents();
  const { user } = useUser();
  const isDeviceEvent = event.source === "device";
  const eventCoordinate = isDeviceEvent
    ? ""
    : getCalendarEventCoordinate(event);
  const [activeForm, setActiveForm] = useState<IFormAttachment | null>(null);

  const calendar = findCalendarForEvent(calendars, event);
  const isEditable = !!user && event.user === user.pubkey;

  // Subscribe once at this level so both the participants list and the
  // suggestions panel render off the same RSVP record set without
  // duplicating relay subscriptions.
  const {
    byPubkey: rsvpByPubkey,
    allParticipants: rsvpAllParticipants,
    myRsvp,
    isSubmitting: isRsvpSubmitting,
    submit: submitRsvp,
  } = useEventRsvps(event);
  const standaloneForms = calendar ? (event.forms ?? []) : [];
  const showStandaloneForms = standaloneForms.length > 0;

  const handleCalendarUpdate = async (nextCalendarId: string) => {
    if (!calendar) {
      throw new Error("Event is not in any calendar");
    }

    const currentEventRef = calendar.eventRefs.find(
      (ref) => ref[0] === eventCoordinate,
    );

    const eventRef =
      currentEventRef ||
      (event.viewKey
        ? buildEventRef({
            kind: event.kind,
            authorPubkey: event.user,
            eventDTag: event.id,
            relayUrl: event.relayHint ?? "",
            viewKey: event.viewKey,
          })
        : undefined);

    if (!eventRef) {
      throw new Error("Event reference not found");
    }

    await moveEventToCalendar(nextCalendarId, eventCoordinate, eventRef);
    updateEvent({
      ...event,
    });
  };

  const handleApplyRSVPSuggestion = async (record: RSVPRecord) => {
    if (
      !calendar ||
      !event.isPrivateEvent ||
      (record.suggestedStart === undefined && record.suggestedEnd === undefined)
    ) {
      return;
    }

    const eventStartSecs = Math.floor(event.begin / 1000);
    const eventDurationSecs = Math.floor((event.end - event.begin) / 1000);
    const nextStartSecs = record.suggestedStart ?? eventStartSecs;
    const updated = {
      ...event,
      begin: nextStartSecs * 1000,
      end: (record.suggestedEnd ?? nextStartSecs + eventDurationSecs) * 1000,
    };

    await editPrivateCalendarEvent(updated, calendar.id);
    updateEvent(updated);
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: theme.spacing(4),
        height: "100%",
        flexDirection: isMobile ? "column" : "row",
      }}
    >
      {event.image && (
        <Box
          sx={{
            flex: 1,
            backgroundImage: `url(${event.image})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: "8px",
          }}
        />
      )}
      <Box
        sx={{
          overflowY: "auto",
          flex: "1",
          padding: 3,
        }}
      >
        <Stack spacing={2}>
          <TimeRenderer
            begin={eventDisplayRange.begin}
            end={eventDisplayRange.end}
            repeat={event.repeat}
            allDay={event.allDay}
          ></TimeRenderer>

          <EventBusyListToggle event={event} />

          {event.description && (
            <>
              <Typography variant="subtitle1">
                {intl.formatMessage({ id: "navigation.description" })}
              </Typography>
              {/* component="div" avoids <p> nesting: Typography defaults to <p>
                  but react-markdown also wraps paragraphs in <p> tags */}
              <Typography component="div" variant="body2">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {event.description}
                </Markdown>
              </Typography>

              <Divider />
            </>
          )}

          {locations.length > 0 && (
            <>
              <Typography variant="subtitle1">
                {intl.formatMessage({ id: "navigation.location" })}
              </Typography>
              <Typography>{locations.join(", ")}</Typography>

              <Divider />
            </>
          )}

          {!calendar && (
            <>
              <RespondPanel event={event} />
              <Divider />
            </>
          )}

          {showStandaloneForms && (
            <>
              <Typography variant="subtitle1">
                {intl.formatMessage({ id: "form.attachments" })}
              </Typography>
              <Stack spacing={1}>
                {standaloneForms.map((attachment) => (
                  <FormAttachmentRow
                    key={attachment.naddr}
                    attachment={attachment}
                    eventAuthor={event.user}
                    onFill={setActiveForm}
                  />
                ))}
              </Stack>
              <Divider />
            </>
          )}

          <Box display={"flex"} flexWrap={"wrap"} gap={1}>
            <Typography width={"100%"} fontWeight={600}>
              {intl.formatMessage({ id: "navigation.participants" })}
            </Typography>
            <RSVPParticipantList
              event={event}
              participants={rsvpAllParticipants}
              recordsByPubkey={rsvpByPubkey}
              canApplySuggestions={
                isEditable && event.isPrivateEvent && !!calendar
              }
              onApplySuggestion={handleApplyRSVPSuggestion}
            />
          </Box>

          {calendar && (
            <>
              <Divider />
              <RSVPBar
                isAuthor={event.user === user?.pubkey}
                event={event}
                myRsvp={myRsvp}
                isSubmitting={isRsvpSubmitting}
                onSubmit={submitRsvp}
              />
            </>
          )}

          {calendar ? (
            <>
              <Divider />
              <EventCalendarListManagement
                calendarId={calendar.id}
                onCalendarUpdate={handleCalendarUpdate}
              />
            </>
          ) : isDeviceEvent ? (
            <>
              <Divider />
              <Typography variant="caption" color="text.secondary">
                {intl.formatMessage({ id: "event.deviceReadOnly" })}
              </Typography>
            </>
          ) : null}

          {!isDeviceEvent && (
            <ScheduledNotificationsSection eventId={event.id} />
          )}
        </Stack>
      </Box>
      {activeForm && (
        <FormFillerDialog
          open
          attachment={activeForm}
          onClose={() => setActiveForm(null)}
          onSubmitted={() => setActiveForm(null)}
        />
      )}
    </Box>
  );
}

function ScheduledNotificationsSection({ eventId }: { eventId: string }) {
  const intl = useIntl();
  const { byEventId } = useNotifications();

  const notifications = byEventId[eventId];
  if (!notifications?.length) return null;

  return (
    <>
      <Divider />
      <Box>
        <Box display="flex" alignItems="center" gap={0.5} mb={1}>
          <NotificationsActiveIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {intl.formatMessage({ id: "event.scheduledNotifications" })}
          </Typography>
        </Box>
        <Stack spacing={0.5}>
          {notifications?.map((n) => (
            <Typography
              key={n.scheduledAt}
              variant="body2"
              color="text.secondary"
            >
              {dayjs(n.scheduledAt).format("ddd, DD MMM YYYY ⋅ HH:mm")}
            </Typography>
          ))}
        </Stack>
      </Box>
    </>
  );
}

/** Compact pill used in the all-day banner row of Day and Week views. */
export function AllDayEventChip({ event }: { event: ICalendarEvent }) {
  const [open, setOpen] = useState(false);
  const intl = useIntl();
  const theme = useTheme();

  const resolvedColor = useResolvedCalendarColor(event);
  const colorScheme = getColorScheme(event, theme, resolvedColor);

  return (
    <>
      <Box
        onClick={() => setOpen(true)}
        sx={{
          bgcolor: colorScheme.backgroundColor,
          border: colorScheme.border,
          borderRadius: 0.5,
          px: 0.5,
          mb: 0.25,
          cursor: "pointer",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: colorScheme.color, fontWeight: 600 }}
        >
          {event.source === "device" && (
            <PhoneAndroidIcon
              sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }}
            />
          )}
          {getEventDisplayTitle(event, intl)}
        </Typography>
      </Box>
      <CalendarEventView
        event={event}
        display="modal"
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
