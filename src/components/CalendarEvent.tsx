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
import { Participant } from "./Participant";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopy from "@mui/icons-material/ContentCopy";
import OpenInNew from "@mui/icons-material/OpenInNew";
import Download from "@mui/icons-material/Download";
import Edit from "@mui/icons-material/Edit";
import Delete from "@mui/icons-material/Delete";
import { exportICS, isMobile } from "../common/utils";
import { encodeNAddr } from "../common/nostr";
import { getEventPage } from "../utils/routingHelper";
import { isNative } from "../utils/platform";
import { useCalendarLists } from "../stores/calendarLists";
import { useIntl } from "react-intl";
import { useUser } from "../stores/user";

interface CalendarEventCardProps {
  event: PositionedEvent;
  offset?: string;
}

export interface CalendarEventViewProps {
  event: ICalendarEvent;
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

  // Look up the calendar color for this event's calendar
  const calendars = useCalendarLists.getState().calendars;
  const calendarColor = event.calendarId
    ? calendars.find((c) => c.id === event.calendarId)?.color
    : undefined;
  const colorScheme = getColorScheme(event, theme, calendarColor);
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
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
          <Typography component={"p"} variant="h5">
            {title}
          </Typography>
          <ActionButtons event={event} closeModal={handleClose} />
        </DialogTitle>
        <DialogContent dividers>
          <CalendarEvent event={event}></CalendarEvent>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActionButtons({
  event,
  closeModal,
}: {
  event: ICalendarEvent;
  closeModal: () => void;
}) {
  const intl = useIntl();
  const linkToEvent = getEventPage(
    encodeNAddr({
      pubkey: event.user,
      identifier: event.eventId,
      kind: event.kind,
    }),
    event.viewKey,
  );
  const copyLinkToEvent = () => {
    navigator.clipboard.writeText(`${window.location.origin}${linkToEvent}`);
  };
  const { user } = useUser();
  const isEditable = event.user === user?.pubkey;
  return (
    <Box minWidth={isMobile ? "inherit" : "160px"}>
      {!isMobile && (
        <>
          <IconButton onClick={copyLinkToEvent}>
            <Tooltip title={intl.formatMessage({ id: "event.copyLink" })}>
              <ContentCopy />
            </Tooltip>
          </IconButton>

          <IconButton component={Link} href={linkToEvent}>
            <Tooltip title={intl.formatMessage({ id: "event.openNewTab" })}>
              <OpenInNew />
            </Tooltip>
          </IconButton>
        </>
      )}

      {!isNative && (
        <IconButton onClick={() => exportICS(event)}>
          <Tooltip title={intl.formatMessage({ id: "event.downloadDetails" })}>
            <Download />
          </Tooltip>
        </IconButton>
      )}
      {isEditable && (
        <IconButton onClick={() => window.alert("edit event")}>
          <Tooltip title={intl.formatMessage({ id: "event.editEvent" })}>
            <Edit />
          </Tooltip>
        </IconButton>
      )}
      <IconButton onClick={() => window.alert("delete event")}>
        <Tooltip title={intl.formatMessage({ id: "event.deleteEvent" })}>
          <Delete />
        </Tooltip>
      </IconButton>
      <IconButton
        aria-label={intl.formatMessage({ id: "navigation.close" })}
        onClick={closeModal}
      >
        <CloseIcon />
      </IconButton>
    </Box>
  );
}

export function CalendarEvent({ event }: CalendarEventViewProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const locations = event.location.filter((location) => !!location?.trim?.());
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
                  <Participant pubKey={p} />
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
