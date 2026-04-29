import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  RadioGroup,
  Radio,
  FormControlLabel,
  useMediaQuery,
  useTheme,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useCalendarLists } from "../stores/calendarLists";
import { useTimeBasedEvents } from "../stores/events";
import { useUser } from "../stores/user";
import {
  publishDeletionEvent,
  publishParticipantRemovalEvent,
} from "../common/nostr";
import { useInvitations } from "../stores/invitations";
import type { ICalendarEvent } from "../utils/types";
import { EventKinds } from "../common/EventConfigs";
import { TimeRenderer } from "./TimeRenderer";
import { useIntl } from "react-intl";

type DeleteOption = "deleteForEveryone" | "removeFromCalendar" | "ignore";

interface DeleteEventDialogProps {
  open: boolean;
  onClose: () => void;
  event: ICalendarEvent;
}

export function DeleteEventDialog({
  open,
  onClose,
  event,
}: DeleteEventDialogProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { user } = useUser();
  const { calendars, removeEventFromCalendar } = useCalendarLists();
  const { removeEvent } = useTimeBasedEvents();
  const { dismissInvitation } = useInvitations();
  const [loading, setLoading] = useState(false);

  const isAuthor = event.user === user?.pubkey;
  const isInCalendar = !!event.calendarId;
  const eventCoordinate = `${event.kind}:${event.user}:${event.id}`;

  const getDefaultOption = (): DeleteOption => {
    if (isAuthor) return "deleteForEveryone";
    if (isInCalendar) return "removeFromCalendar";
    return "ignore";
  };

  const [selectedOption, setSelectedOption] =
    useState<DeleteOption>(getDefaultOption);

  // Defensive: device events have no Nostr identity and must never be deleted
  // through Nostr. The UI hides the entry point, but bail here as well.
  if (event.source === "device") {
    return null;
  }

  const findEventRef = (): string[] | null => {
    if (!event.calendarId) return null;
    const calendar = calendars.find((c) => c.id === event.calendarId);
    if (!calendar) return null;
    const ref = calendar.eventRefs.find((r) => r[0] === eventCoordinate);
    return ref || null;
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      switch (selectedOption) {
        case "deleteForEveryone": {
          await publishDeletionEvent({
            coordinates: [eventCoordinate],
            eventIds: event.eventId ? [event.eventId] : [],
            kinds: [event.kind],
          });
          if (isInCalendar && event.calendarId) {
            const eventRef = findEventRef();
            if (eventRef) {
              await removeEventFromCalendar(event.calendarId, eventRef);
            }
          }
          removeEvent(event.id);
          break;
        }
        case "removeFromCalendar": {
          if (isInCalendar && event.calendarId) {
            const eventRef = findEventRef();
            if (eventRef) {
              await removeEventFromCalendar(event.calendarId, eventRef);
            }
            removeEvent(event.id);
          }
          break;
        }
        case "ignore": {
          await publishParticipantRemovalEvent({
            coordinates: [eventCoordinate],
            eventIds: event.eventId ? [event.eventId] : [],
            kinds: [event.kind, EventKinds.CalendarEventGiftWrap],
          });
          dismissInvitation(event.id);
          removeEvent(event.id);
          break;
        }
      }
      onClose();
    } catch (error) {
      console.error("Failed to delete event:", error);
    } finally {
      setLoading(false);
    }
  };

  const getConfirmButtonColor = (): "error" | "inherit" => {
    if (selectedOption === "deleteForEveryone") return "error";
    return "inherit";
  };

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            {intl.formatMessage({ id: "deleteEvent.title" })}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={3}>
          {/* Event summary */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              {event.title}
            </Typography>
            <TimeRenderer
              begin={event.begin}
              end={event.end}
              repeat={event.repeat}
              allDay={event.allDay}
            />
          </Box>

          {/* Options */}
          <RadioGroup
            value={selectedOption}
            onChange={(e) => setSelectedOption(e.target.value as DeleteOption)}
          >
            {isAuthor && (
              <FormControlLabel
                value="deleteForEveryone"
                control={<Radio color="error" />}
                label={
                  <Box>
                    <Typography fontWeight={500} color="error">
                      {intl.formatMessage({
                        id: "deleteEvent.deleteForEveryone",
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {intl.formatMessage({
                        id: "deleteEvent.deleteForEveryoneDescription",
                      })}
                    </Typography>
                  </Box>
                }
              />
            )}

            {isInCalendar && (
              <FormControlLabel
                value="removeFromCalendar"
                control={<Radio />}
                label={
                  <Box>
                    <Typography fontWeight={500}>
                      {intl.formatMessage({
                        id: "deleteEvent.removeFromCalendar",
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {intl.formatMessage({
                        id: "deleteEvent.removeFromCalendarDescription",
                      })}
                    </Typography>
                  </Box>
                }
              />
            )}

            <FormControlLabel
              value="ignore"
              control={<Radio />}
              label={
                <Box>
                  <Typography fontWeight={500}>
                    {intl.formatMessage({
                      id: "deleteEvent.ignoreInvitation",
                    })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage({
                      id: "deleteEvent.ignoreInvitationDescription",
                    })}
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </Box>
      </DialogContent>

      <DialogActions sx={{ padding: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={loading}>
          {intl.formatMessage({ id: "navigation.cancel" })}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color={getConfirmButtonColor()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading
            ? intl.formatMessage({ id: "deleteEvent.deleting" })
            : intl.formatMessage({ id: "deleteEvent.confirm" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
