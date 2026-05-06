// import { useDraggable } from "@dnd-kit/core";
import {
  alpha,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Paper,
  Snackbar,
  Stack,
  Theme,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ICalendarEvent, RSVPStatus } from "../utils/types";
import { PositionedEvent } from "../common/calendarEngine";
import { TimeRenderer } from "./TimeRenderer";
import { useCallback, useEffect, useState } from "react";
import { Participant } from "./Participant";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopy from "@mui/icons-material/ContentCopy";
import OpenInNew from "@mui/icons-material/OpenInNew";
import Download from "@mui/icons-material/Download";
import Edit from "@mui/icons-material/Edit";
import Delete from "@mui/icons-material/Delete";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import dayjs from "dayjs";
import { exportICS, isMobile } from "../common/utils";
import { encodeNAddr } from "../common/nostr";
import type { RSVPPayload, RSVPRecord } from "../common/nostr";
import { getEditEventPage, getEventPage } from "../utils/routingHelper";
import { useNavigate } from "react-router";
import { getAppBaseUrl, isNative } from "../utils/platform";
import { useNotifications } from "../stores/notifications";
import { useCalendarLists } from "../stores/calendarLists";
import { useTimeBasedEvents } from "../stores/events";
import { FormattedMessage, useIntl } from "react-intl";
import { useUser } from "../stores/user";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { CalendarListSelect } from "./CalendarListSelect";
import { useInvitations } from "../stores/invitations";
import { useAcceptWithFormsFlow } from "../hooks/useAcceptWithFormsFlow";
import {
  buildEventRef,
  findCalendarForEvent,
  getCalendarEventCoordinate,
} from "../utils/calendarListTypes";
import { EventCalendarListManagement } from "./EventCalendarListManagement";
import { signerManager } from "../common/signer";
import { generateSecretKey } from "nostr-tools";
import { bytesToHex } from "nostr-tools/utils";
import { FormFillerDialog } from "./FormFillerDialog";
import { FormAttachmentRow } from "./FormAttachmentRow";
import type { IFormAttachment } from "../utils/types";
import { useEventRsvps } from "../hooks/useEventRsvps";
import { RSVPBar } from "./RSVPBar";
import { RSVPSuggestionsPanel } from "./RSVPSuggestionsPanel";
import { RSVPResponse } from "../stores/events";

interface CalendarEventCardProps {
  event: PositionedEvent;
  offset?: string;
}

function toParticipantRSVPResponse(
  status: RSVPStatus | undefined,
): RSVPResponse {
  switch (status) {
    case RSVPStatus.accepted:
      return RSVPResponse.accepted;
    case RSVPStatus.declined:
      return RSVPResponse.declined;
    case RSVPStatus.tentative:
      return RSVPResponse.tentative;
    default:
      return RSVPResponse.pending;
  }
}

export interface CalendarEventViewProps {
  event: ICalendarEvent;
  display?: "modal" | "page";
  open?: boolean;
  onClose?: () => void;
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

export function CalendarEventCard({
  event,
  offset = "0px",
}: CalendarEventCardProps) {
  // const { attributes, listeners, setNodeRef } = useDraggable({ id: event.id });
  const [open, setOpen] = useState(false);
  const handleClose = () => setOpen(false);
  const maxDescLength = 20;
  const theme = useTheme();

  // Look up the calendar for this event
  const calendars = useCalendarLists.getState().calendars;
  const calendar = event.calendarId
    ? calendars.find((c) => c.id === event.calendarId)
    : undefined;
  const colorScheme = getColorScheme(event, theme, calendar?.color);
  const title =
    event.title ??
    (event.description.length > maxDescLength
      ? `${event.description.substring(0, maxDescLength)}...`
      : event.description);
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
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const maxDescLength = 20;
  const title =
    event.title ??
    (event.description.length > maxDescLength
      ? `${event.description.substring(0, maxDescLength)}...`
      : event.description);

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
  );
  const eventUrl = `${getAppBaseUrl()}${linkToEvent}`;
  const copyLinkToEvent = () => {
    navigator.clipboard.writeText(eventUrl);
  };
  const { user } = useUser();
  const navigate = useNavigate();
  const isEditable = event.user === user?.pubkey;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
    navigate(editLink);
  };

  const iconSize = isMobile ? "small" : "medium";

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
  const locations = event.location.filter((location) => !!location?.trim?.());
  const { calendars, moveEventToCalendar } = useCalendarLists();
  const { updateEvent } = useTimeBasedEvents();
  const { user } = useUser();
  const eventCoordinate = getCalendarEventCoordinate(event);
  const [activeForm, setActiveForm] = useState<IFormAttachment | null>(null);

  const calendar = findCalendarForEvent(calendars, event);
  const currentCalendarId = calendar?.id ?? event.calendarId;
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
    const sourceCalendarId = currentCalendarId;
    if (!sourceCalendarId) {
      throw new Error("Event is not in any calendar");
    }

    const sourceCalendar = calendars.find((c) => c.id === sourceCalendarId);
    const currentEventRef = sourceCalendar?.eventRefs.find(
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
      calendarId: nextCalendarId,
    });
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
            begin={event.begin}
            end={event.end}
            repeat={event.repeat}
          ></TimeRenderer>

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
              <RespondPanel
                event={event}
                myRsvp={myRsvp}
                isRsvpSubmitting={isRsvpSubmitting}
                onSubmitRsvp={submitRsvp}
              />
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
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {rsvpAllParticipants.map((p) => (
                <Box width={"100%"} key={p}>
                  <Participant
                    pubKey={p}
                    isAuthor={p === event.user}
                    rsvpResponse={toParticipantRSVPResponse(
                      rsvpByPubkey[p]?.status,
                    )}
                  />
                </Box>
              ))}
            </Stack>
          </Box>

          {calendar && user && (
            <>
              <Divider />
              <RSVPBar
                event={event}
                myRsvp={myRsvp}
                isSubmitting={isRsvpSubmitting}
                onSubmit={submitRsvp}
              />
            </>
          )}

          {isEditable && (
            <RSVPSuggestionsPanel
              event={event}
              calendarId={currentCalendarId}
              records={Object.values(rsvpByPubkey)}
            />
          )}

          <RSVPDetailsPanel
            event={event}
            records={Object.values(rsvpByPubkey)}
          />

          {calendar ? (
            <>
              <Divider />
              <EventCalendarListManagement
                calendarId={currentCalendarId || ""}
                onCalendarUpdate={handleCalendarUpdate}
              />
            </>
          ) : null}

          <ScheduledNotificationsSection eventId={event.id} />
        </Stack>
      </Box>
      <FormFillerDialog
        open={!!activeForm}
        attachment={activeForm}
        onClose={() => setActiveForm(null)}
        onSubmitted={() => setActiveForm(null)}
      />
    </Box>
  );
}

function RSVPDetailsPanel({
  event,
  records,
}: {
  event: ICalendarEvent;
  records: RSVPRecord[];
}) {
  const intl = useIntl();

  const recordsWithDetails = [...records]
    .filter(
      (record) =>
        !!record.comment.trim() ||
        record.suggestedStart !== undefined ||
        record.suggestedEnd !== undefined,
    )
    .sort((left, right) => right.createdAt - left.createdAt);

  if (recordsWithDetails.length === 0) {
    return null;
  }

  const eventStartSec = Math.floor(event.begin / 1000);
  const eventEndSec = Math.floor(event.end / 1000);

  return (
    <Box>
      <Divider sx={{ mb: 1 }} />
      <Typography variant="subtitle2" gutterBottom>
        {intl.formatMessage({ id: "navigation.rsvpDetails" })}
      </Typography>
      <Stack spacing={1}>
        {recordsWithDetails.map((record) => {
          const hasSuggestedStart =
            record.suggestedStart !== undefined &&
            record.suggestedStart !== eventStartSec;
          const hasSuggestedEnd =
            record.suggestedEnd !== undefined &&
            record.suggestedEnd !== eventEndSec;

          return (
            <Paper
              key={`${record.pubkey}-${record.createdAt}`}
              variant="outlined"
              sx={{ p: 1.25 }}
            >
              <Stack spacing={0.75}>
                <Participant pubKey={record.pubkey} isAuthor={false} />
                {(hasSuggestedStart || hasSuggestedEnd) && (
                  <Typography variant="caption" color="text.secondary">
                    {hasSuggestedStart
                      ? `${intl.formatMessage({ id: "rsvp.suggestedStart" })}: ${dayjs(
                          (record.suggestedStart ?? eventStartSec) * 1000,
                        ).format("ddd, DD MMM YYYY ⋅ HH:mm")}`
                      : null}
                    {hasSuggestedStart && hasSuggestedEnd ? " · " : ""}
                    {hasSuggestedEnd
                      ? `${intl.formatMessage({ id: "rsvp.suggestedEnd" })}: ${dayjs(
                          (record.suggestedEnd ?? eventEndSec) * 1000,
                        ).format("ddd, DD MMM YYYY ⋅ HH:mm")}`
                      : null}
                  </Typography>
                )}
                {record.comment.trim() ? (
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {record.comment}
                  </Typography>
                ) : null}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
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

function RespondPanel({
  event,
  myRsvp,
  isRsvpSubmitting,
  onSubmitRsvp,
}: {
  event: ICalendarEvent;
  myRsvp?: RSVPRecord;
  isRsvpSubmitting: boolean;
  onSubmitRsvp: (payload: RSVPPayload) => Promise<void>;
}) {
  const intl = useIntl();
  const { user, updateLoginModal } = useUser();
  const {
    calendars,
    addEventToCalendar,
    isLoaded: calendarsLoaded,
    fetchCalendars,
  } = useCalendarLists();
  const { invitations, acceptInvitation } = useInvitations();
  const { updateEvent } = useTimeBasedEvents();
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    calendars[0]?.id || "",
  );
  const [accepting, setAccepting] = useState(false);
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const forms = event.forms ?? [];

  // Sync selected calendar once calendars load (e.g. right after login)
  useEffect(() => {
    if (!selectedCalendarId && calendars[0]?.id) {
      setSelectedCalendarId(calendars[0].id);
    }
  }, [calendars, selectedCalendarId]);

  // On ViewEventPage the Calendar component is never mounted, so
  // fetchCalendars() is never called. Trigger it here when needed.
  useEffect(() => {
    if (user && !calendarsLoaded) {
      fetchCalendars();
    }
  }, [user, calendarsLoaded, fetchCalendars]);

  const finalizeAccept = useCallback(
    async ({
      calendarId,
      giftWrapId,
      context: payload,
    }: {
      calendarId: string;
      giftWrapId?: string;
      context: RSVPPayload;
    }) => {
      if (giftWrapId) {
        await acceptInvitation(giftWrapId, calendarId);
      } else {
        const eventRef = buildEventRef({
          kind: event.kind,
          authorPubkey: event.user,
          eventDTag: event.id,
          relayUrl: event.relayHint ?? "",
          viewKey: event.viewKey || "",
        });
        await addEventToCalendar(calendarId, eventRef);
        updateEvent({
          ...event,
          calendarId,
          isInvitation: false,
        });
      }
      await onSubmitRsvp(payload);
    },
    [acceptInvitation, addEventToCalendar, event, onSubmitRsvp, updateEvent],
  );

  const {
    pendingAccept,
    pendingForm,
    formCount,
    startAccept,
    advanceAccept,
    cancelAccept,
  } = useAcceptWithFormsFlow<RSVPPayload>({
    onFinalize: finalizeAccept,
  });

  const handleRespond = async (payload: RSVPPayload) => {
    if (!selectedCalendarId) return;
    setAccepting(true);
    try {
      const matchingInvitation = invitations.find(
        (inv) => inv.eventId === event.id && inv.pubkey === event.user,
      );
      await startAccept({
        calendarId: selectedCalendarId,
        giftWrapId: matchingInvitation?.giftWrapId,
        attachments: forms,
        context: payload,
      });
    } catch {
      setErrorOpen(true);
    } finally {
      setAccepting(false);
    }
  };

  const handlePendingAcceptAdvance = async () => {
    setAccepting(true);
    try {
      await advanceAccept();
    } catch {
      setErrorOpen(true);
    } finally {
      setAccepting(false);
    }
  };

  const handleContinueAsGuest = async () => {
    setCreatingGuest(true);
    try {
      await signerManager.createGuestAccount(
        bytesToHex(generateSecretKey()),
        {},
      );
    } catch {
      setErrorOpen(true);
    } finally {
      setCreatingGuest(false);
    }
  };

  // ── Login gate ─────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <Stack
          spacing={1.5}
          sx={{ backgroundColor: "action.hover", borderRadius: 1, p: 1.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "invitation.loginToAdd" })}
          </Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              variant="contained"
              size="small"
              onClick={() => updateLoginModal(true)}
            >
              {intl.formatMessage({ id: "message.modeSelection_loginButton" })}
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={creatingGuest}
              onClick={handleContinueAsGuest}
              startIcon={
                creatingGuest ? (
                  <CircularProgress size={14} color="inherit" />
                ) : undefined
              }
            >
              {intl.formatMessage({ id: "message.modeSelection_guestButton" })}
            </Button>
          </Box>
        </Stack>
        <Snackbar
          open={errorOpen}
          autoHideDuration={4000}
          onClose={() => setErrorOpen(false)}
        >
          <Alert severity="error" onClose={() => setErrorOpen(false)}>
            {intl.formatMessage({ id: "event.calendarMoveError" })}
          </Alert>
        </Snackbar>
      </>
    );
  }

  // ── Calendars still loading after login ────────────────────────────────────
  if (calendars.length === 0) {
    return (
      <Stack
        spacing={1.5}
        sx={{ backgroundColor: "action.hover", borderRadius: 1, p: 1.5 }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "startup.fetchingEvents" })}
          </Typography>
        </Box>
      </Stack>
    );
  }

  return (
    <>
      <Stack
        spacing={1.5}
        sx={{
          backgroundColor: "action.hover",
          borderRadius: 1,
          p: 1.5,
        }}
      >
        <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
          <Typography
            variant="body1"
            color="text.primary"
            sx={{
              display: "flex",
              gap: "4px",
              alignItems: "center",
            }}
            component="span"
          >
            <FormattedMessage
              id={
                event.isInvitation
                  ? "invitation.invitedBy"
                  : "invitation.createdBy"
              }
              values={{
                participant: (
                  <Participant pubKey={event.user} isAuthor={false} />
                ),
              }}
            />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "event.notInCalendar" })}
          </Typography>
        </Box>
        <RSVPBar
          event={event}
          myRsvp={myRsvp}
          isSubmitting={accepting || isRsvpSubmitting}
          onSubmit={handleRespond}
          deferSubmit
          submitDisabled={!selectedCalendarId}
          submitLabel={intl.formatMessage({
            id: "invitation.acceptInvitation",
          })}
        />
        {forms.length > 0 ? (
          <>
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2">
                {intl.formatMessage({ id: "event.forms" })}
              </Typography>
              {forms.map((form, index) => (
                <FormAttachmentRow
                  key={`${form.naddr}-${index}`}
                  attachment={form}
                  eventAuthor={event.user}
                />
              ))}
            </Stack>
          </>
        ) : null}
        <Divider />
        <Box maxWidth={500}>
          <CalendarListSelect
            value={selectedCalendarId}
            onChange={setSelectedCalendarId}
            size="small"
          />
        </Box>
      </Stack>

      {pendingAccept && pendingForm && (
        <FormFillerDialog
          open
          attachment={pendingForm}
          index={pendingAccept.formIndex + 1}
          total={formCount}
          onClose={cancelAccept}
          onSubmitted={() => {
            void handlePendingAcceptAdvance();
          }}
        />
      )}

      <Snackbar
        open={errorOpen}
        autoHideDuration={4000}
        onClose={() => setErrorOpen(false)}
      >
        <Alert severity="error" onClose={() => setErrorOpen(false)}>
          {intl.formatMessage({ id: "event.calendarMoveError" })}
        </Alert>
      </Snackbar>
    </>
  );
}
