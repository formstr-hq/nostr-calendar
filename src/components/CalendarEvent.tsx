// import { useDraggable } from "@dnd-kit/core";
import {
  alpha,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Paper,
  Stack,
  TextField,
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
import { Participant } from "./Participant";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CloseIcon from "@mui/icons-material/Close";
import ShareIcon from "@mui/icons-material/Share";
import OpenInNew from "@mui/icons-material/OpenInNew";
import Download from "@mui/icons-material/Download";
import Edit from "@mui/icons-material/Edit";
import Delete from "@mui/icons-material/Delete";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import dayjs from "dayjs";
import { exportICS, isMobile } from "../common/utils";
import { encodeNAddr } from "../common/nostr";
import { getEditEventPage, getEventPage } from "../utils/routingHelper";
import { useNavigate } from "react-router";
import { isNative } from "../utils/platform";
import { useNotifications } from "../stores/notifications";
import { useCalendarLists } from "../stores/calendarLists";
import { FormattedMessage, useIntl } from "react-intl";
import { useUser } from "../stores/user";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { CalendarListSelect } from "./CalendarListSelect";
import { useInvitations } from "../stores/invitations";

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
    encodeNAddr({
      pubkey: event.user,
      identifier: event.id,
      kind: event.kind,
    }),
    event.viewKey,
  );
  
  const { user } = useUser();
  const navigate = useNavigate();
  const isEditable = event.user === user?.pubkey;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const editEvent = () => {
    const editLink = getEditEventPage(
      encodeNAddr({
        pubkey: event.user,
        identifier: event.id,
        kind: event.kind,
      }),
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
      <IconButton size={iconSize} onClick={() => setShareDialogOpen(true)}>
        <Tooltip title={intl.formatMessage({ id: "event.shareEvent", defaultMessage: "Share Event" })}>
          <ShareIcon fontSize={iconSize} />
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
      <ShareEventDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        linkToEvent={linkToEvent}
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

function ShareEventDialog({
  open,
  onClose,
  linkToEvent,
}: {
  open: boolean;
  onClose: () => void;
  linkToEvent: string;
}) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);

  // We only concatenate if access via browser (to get domain name)
  const fullUrl = `${window.location.origin}${linkToEvent}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({
        title: intl.formatMessage({ id: "event.shareTitle", defaultMessage: "Calendar Event" }),
        url: fullUrl,
      }).catch(console.error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{intl.formatMessage({ id: "event.shareEvent", defaultMessage: "Share Event" })}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {intl.formatMessage({ id: "event.shareInstructions", defaultMessage: "Anyone with this link can view the event details." })}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <TextField
            fullWidth
            size="small"
            value={fullUrl}
            InputProps={{
              readOnly: true,
            }}
          />
          <Button variant={copied ? "outlined" : "contained"} color={copied ? "success" : "primary"} onClick={handleCopy} sx={{ whiteSpace: "nowrap" }}>
            {copied ? intl.formatMessage({ id: "event.copied", defaultMessage: "Copied!" }) : intl.formatMessage({ id: "event.copyLink", defaultMessage: "Copy Link" })}
          </Button>
        </Box>
        {!!navigator.share && (
          <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
            <Button startIcon={<ShareIcon />} onClick={handleNativeShare}>
              {intl.formatMessage({ id: "event.nativeShare", defaultMessage: "Share via Device" })}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{intl.formatMessage({ id: "navigation.close", defaultMessage: "Close" })}</Button>
      </DialogActions>
    </Dialog>
  );
}

export function CalendarEvent({ event }: CalendarEventViewProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const locations = event.location.filter((location) => !!location?.trim?.());
  const calendars = useCalendarLists.getState().calendars;
  const calendar = event.calendarId
    ? calendars.find((c) => c.id === event.calendarId)
    : undefined;
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
              <Typography variant="body2">
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

          <Box display={"flex"} flexWrap={"wrap"} gap={1}>
            <Typography width={"100%"} fontWeight={600}>
              {intl.formatMessage({ id: "navigation.participants" })}
            </Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {event.participants.map((p) => (
                <Box width={"100%"} key={p}>
                  <Participant pubKey={p} isAuthor={p === event.user} />
                </Box>
              ))}
            </Stack>
          </Box>

          {calendar ? (
            <>
              <Divider />
              <Box display="flex" alignItems="center" gap={1}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: calendar.color,
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2">{calendar.title}</Typography>
              </Box>
            </>
          ) : (
            <>
              <Divider />
              <InvitationAcceptBar event={event} />
            </>
          )}

          <ScheduledNotificationsSection eventId={event.id} />
        </Stack>
      </Box>
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

function InvitationAcceptBar({ event }: { event: ICalendarEvent }) {
  const intl = useIntl();
  const { calendars } = useCalendarLists();
  const { acceptInvitation } = useInvitations();
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    calendars[0]?.id || "",
  );
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    if (!selectedCalendarId) return;
    setAccepting(true);
    await acceptInvitation(event.id, selectedCalendarId);
    setAccepting(false);
  };

  return (
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
            id="invitation.invitedBy"
            values={{
              participant: <Participant pubKey={event.user} isAuthor={false} />,
            }}
          />
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({ id: "event.notInCalendar" })}
        </Typography>
      </Box>
      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
        <Box maxWidth={500} flex={1} minWidth={150}>
          <CalendarListSelect
            value={selectedCalendarId}
            onChange={setSelectedCalendarId}
            size="small"
          />
        </Box>
        <Button
          variant="contained"
          size="small"
          disabled={!selectedCalendarId || accepting}
          onClick={handleAccept}
          sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {intl.formatMessage({ id: "invitation.acceptInvitation" })}
        </Button>
      </Box>
    </Stack>
  );
}
