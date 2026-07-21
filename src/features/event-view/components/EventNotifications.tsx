import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import Edit from "@mui/icons-material/Edit";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../../../utils/types";
import { useNotifications } from "../../../stores/notifications";
import { useCalendarLists } from "../../../stores/calendarLists";
import {
  areNotificationOffsetsEqual,
  clearNotificationPreference,
  DEFAULT_NOTIFICATION_OFFSETS,
  getNotificationPreference,
  normalizeNotificationOffsets,
  setNotificationPreference,
  shouldScheduleNotifications,
} from "../../../utils/notificationPreferences";
import {
  cancelEventNotifications,
  scheduleEventNotifications,
} from "../../../utils/notifications";
import { NotificationPreferenceEditor } from "../../../components/NotificationPreferenceEditor";

export function EventNotifications({ event }: { event: ICalendarEvent }) {
  const intl = useIntl();
  const { byEventId } = useNotifications();
  const calendars = useCalendarLists((state) => state.calendars);
  const [editorOpen, setEditorOpen] = useState(false);
  const [notificationOffsets, setNotificationOffsets] = useState<number[]>(
    DEFAULT_NOTIFICATION_OFFSETS,
  );
  const [loadingPreference, setLoadingPreference] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);

  const notifications = byEventId[event.id] ?? [];

  const openEditor = () => {
    setEditorOpen(true);
    setLoadingPreference(true);
    getNotificationPreference(event.id)
      .then((preference) => {
        setNotificationOffsets(
          preference?.offsetsMinutes ?? DEFAULT_NOTIFICATION_OFFSETS,
        );
      })
      .catch((error) => {
        console.warn("Failed to load notification preferences", error);
        setNotificationOffsets(DEFAULT_NOTIFICATION_OFFSETS);
      })
      .finally(() => {
        setLoadingPreference(false);
      });
  };

  const closeEditor = () => {
    if (savingPreference) return;
    setEditorOpen(false);
  };

  const saveNotificationPreference = async () => {
    const normalizedOffsets = normalizeNotificationOffsets(notificationOffsets);

    setSavingPreference(true);
    try {
      if (
        areNotificationOffsetsEqual(
          normalizedOffsets,
          DEFAULT_NOTIFICATION_OFFSETS,
        )
      ) {
        await clearNotificationPreference(event.id);
      } else {
        await setNotificationPreference(event.id, normalizedOffsets);
      }

      await cancelEventNotifications(event.id);
      useNotifications.getState().removeNotifications(event.id);

      const calendarPreference = calendars.find(
        (calendar) => calendar.id === event.calendarId,
      )?.notificationPreference;

      if (
        shouldScheduleNotifications(
          event.notificationPreference,
          calendarPreference,
        )
      ) {
        const scheduledNotifications = await scheduleEventNotifications(event);
        useNotifications
          .getState()
          .setNotifications(event.id, scheduledNotifications);
      }

      setEditorOpen(false);
    } finally {
      setSavingPreference(false);
    }
  };

  const notificationsValid = notificationOffsets.every(
    (offset) =>
      Number.isInteger(offset) && Number.isFinite(offset) && offset >= 0,
  );

  return (
    <>
      <Divider />
      <Box>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          mb={1}
        >
          <Box display="flex" alignItems="center" gap={0.5}>
            <NotificationsActiveIcon fontSize="small" color="action" />
            <Typography variant="subtitle2">
              {intl.formatMessage({ id: "event.scheduledNotifications" })}
            </Typography>
          </Box>
          <IconButton
            aria-label={intl.formatMessage({ id: "navigation.edit" })}
            size="small"
            onClick={openEditor}
          >
            <Edit fontSize="small" />
          </IconButton>
        </Box>
        {notifications.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "event.noNotifications" })}
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {notifications.map((n) => (
              <Typography
                key={`${n.label}-${n.scheduledAt}`}
                variant="body2"
                color="text.secondary"
              >
                {n.label} ·{" "}
                {dayjs(n.scheduledAt).format("ddd, DD MMM YYYY ⋅ HH:mm")}
              </Typography>
            ))}
          </Stack>
        )}
      </Box>
      <Dialog open={editorOpen} onClose={closeEditor} fullWidth maxWidth="xs">
        <DialogTitle>
          {intl.formatMessage({ id: "event.notifications" })}
        </DialogTitle>
        <DialogContent dividers>
          {loadingPreference ? (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "event.loadingEventDetails" })}
            </Typography>
          ) : (
            <NotificationPreferenceEditor
              offsets={notificationOffsets}
              onChange={setNotificationOffsets}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditor} disabled={savingPreference}>
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
          <Button
            onClick={saveNotificationPreference}
            disabled={
              savingPreference || loadingPreference || !notificationsValid
            }
          >
            {intl.formatMessage({ id: "navigation.save" })}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
