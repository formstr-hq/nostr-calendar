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
import { useCalendarLists } from "../../../stores/calendarLists";
import { useTimeBasedEvents } from "../../../stores/events";
import { useUser } from "../../../stores/user";
import { publishDeletionEvent } from "../../../nostr/events";
import { useInvitations } from "../../../stores/invitations";
import { useBusyList } from "../../../stores/busyList";
import type { ICalendarEvent } from "../../../utils/types";
import { TimeRenderer } from "../../../components/TimeRenderer";
import { getEventDisplayRange } from "../../../utils/eventOccurrence";
import { useIntl } from "react-intl";
import {
  findCalendarForEvent,
  getCalendarEventCoordinate,
} from "../../../utils/calendarListTypes";
import { getRelays } from "../../../common/relayConfig";
import {
  usePublishActivity,
  usePublishActivityStore,
  type PublishStepDefinition,
} from "../../../stores/publishActivity";
import { PublishActivityPanel } from "../../../components/PublishActivityPanel";
import { PublishActivityDialog } from "../../../components/PublishActivityDialog";

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);

  const isAuthor = event.user === user?.pubkey;
  const calendar = findCalendarForEvent(calendars, event);
  const isInCalendar = !!calendar;
  const eventCoordinate = getCalendarEventCoordinate(event);
  const flowId = `event-delete:${event.id}`;
  const flow = usePublishActivity(flowId);
  const steps = flow?.steps ?? [];

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
    if (!calendar) return null;
    const ref = calendar.eventRefs.find((r) => r[0] === eventCoordinate);
    return ref || null;
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const relays = getRelays();
      const stepDefs: PublishStepDefinition[] = [];
      switch (selectedOption) {
        case "deleteForEveryone": {
          stepDefs.push({
            id: "publish-deletion",
            labelId: "event.step.publishDeletion",
            relays,
            blocking: true,
            run: async (callbacks) => {
              await publishDeletionEvent({
                coordinates: [eventCoordinate],
                eventIds: event.eventId ? [event.eventId] : [],
                kinds: [event.kind],
                onRelayComplete: callbacks.onRelayComplete,
              });
            },
          });
          if (calendar) {
            const eventRef = findEventRef();
            if (eventRef) {
              stepDefs.push({
                id: "remove-from-calendar",
                labelId: "event.step.removeFromCalendar",
                relays,
                blocking: true,
                run: () => removeEventFromCalendar(calendar.id, eventRef),
              });
            }
          }
          // The author is rescinding the commitment — drop the matching
          // public busy entry if any. No-op when none exists.
          void useBusyList
            .getState()
            .removeBusyRange({ start: event.begin, end: event.end });
          break;
        }
        case "removeFromCalendar": {
          if (calendar) {
            const eventRef = findEventRef();
            if (eventRef) {
              stepDefs.push({
                id: "remove-from-calendar",
                labelId: "event.step.removeFromCalendar",
                relays,
                blocking: true,
                run: () => removeEventFromCalendar(calendar.id, eventRef),
              });
            }
            // Whether or not the user is the author, this slot is no longer
            // a personal commitment from this client — remove busy entry.
            void useBusyList
              .getState()
              .removeBusyRange({ start: event.begin, end: event.end });
          }
          break;
        }
        case "ignore": {
          break;
        }
      }
      await usePublishActivityStore.getState().runFlow(flowId, stepDefs);
      if (selectedOption === "ignore") dismissInvitation(event.id);
      removeEvent(event.id);
      onClose();
    } catch (error) {
      console.error("Failed to delete event:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryStep = async (stepId: string) => {
    setRetryingStepId(stepId);
    try {
      await usePublishActivityStore.getState().retryStep(flowId, stepId);
    } finally {
      setRetryingStepId(null);
    }
  };

  const getConfirmButtonColor = (): "error" | "inherit" => {
    if (selectedOption === "deleteForEveryone") return "error";
    return "inherit";
  };

  const eventDisplayRange = getEventDisplayRange(event);

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        sx={{ pt: isMobile ? "calc(16px + var(--safe-area-top))" : 2 }}
      >
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
              begin={eventDisplayRange.begin}
              end={eventDisplayRange.end}
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
                data-testid="delete-option-everyone"
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
                data-testid="delete-option-remove"
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
              data-testid="delete-option-ignore"
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
        {steps.length > 0 && (
          <PublishActivityPanel
            steps={steps}
            onDetailsClick={
              steps.some((step) => step.status === "error")
                ? () => setDetailsOpen(true)
                : undefined
            }
            detailsLabel={intl.formatMessage({ id: "event.relayDetails" })}
          />
        )}
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
      <PublishActivityDialog
        open={detailsOpen}
        steps={steps}
        onClose={() => setDetailsOpen(false)}
        onRetryStep={handleRetryStep}
        retryingStepId={retryingStepId}
      />
    </Dialog>
  );
}
