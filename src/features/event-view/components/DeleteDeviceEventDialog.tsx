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
  useMediaQuery,
  useTheme,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useIntl } from "react-intl";
import { useDeviceCalendars } from "../../../stores/deviceCalendars";
import {
  deviceEventStableId,
  stripDeviceCalendarPrefix,
} from "../../../utils/deviceCalendarAdapter";
import { cancelEventNotifications } from "../../../utils/notifications";
import { useNotifications } from "../../../stores/notifications";
import { clearNotificationPreference } from "../../../utils/notificationPreferences";
import type { ICalendarEvent } from "../../../utils/types";
import { TimeRenderer } from "../../../components/TimeRenderer";
import { getEventDisplayRange } from "../../../utils/eventOccurrence";

interface DeleteDeviceEventDialogProps {
  open: boolean;
  onClose: () => void;
  event: ICalendarEvent;
}

/**
 * Delete dialog for device (OS-calendar) events. None of `DeleteEventDialog`'s
 * `DeleteOption` state machine (delete-for-everyone / remove-from-calendar /
 * ignore-invitation) applies here — a device event has no Nostr identity to
 * delete "for everyone" and isn't a calendar-list membership to remove.
 */
export function DeleteDeviceEventDialog({
  open,
  onClose,
  event,
}: DeleteDeviceEventDialogProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const eventDisplayRange = getEventDisplayRange(event);

  const handleConfirm = async () => {
    setLoading(true);
    setError(false);
    try {
      await useDeviceCalendars.getState().deleteDeviceEvent(event);
      const stableId = deviceEventStableId(
        event.id,
        stripDeviceCalendarPrefix(event.calendarId),
      );
      await cancelEventNotifications(stableId);
      useNotifications.getState().removeNotifications(stableId);
      await clearNotificationPreference(stableId);
      onClose();
    } catch (e) {
      console.error("Failed to delete device event:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        sx={{ pt: isMobile ? "calc(16px + var(--safe-area-top))" : 2 }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            {intl.formatMessage({ id: "deleteDeviceEvent.title" })}
          </Typography>
          <IconButton onClick={onClose} size="small" disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={2}>
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
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "deleteDeviceEvent.description" })}
          </Typography>
          {error && (
            <Alert severity="error">
              {intl.formatMessage({ id: "deleteDeviceEvent.error" })}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ padding: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={loading}>
          {intl.formatMessage({ id: "navigation.cancel" })}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading
            ? intl.formatMessage({ id: "deleteEvent.deleting" })
            : intl.formatMessage({ id: "deleteDeviceEvent.confirm" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
