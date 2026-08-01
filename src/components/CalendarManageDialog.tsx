import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CircleIcon from "@mui/icons-material/Circle";
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  type ICalendarList,
} from "../utils/calendarListTypes";
import { useIntl } from "react-intl";
import type { NotificationPreference } from "../utils/types";
import { PRESET_COLORS } from "../utils/calendarColorPresets";

interface CalendarManageDialogProps {
  open: boolean;
  onClose: () => void;
  calendar?: ICalendarList;
  onSave: (data: {
    title: string;
    description: string;
    color: string;
    notificationPreference: NotificationPreference;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

/** Create/edit dialog for Nostr calendars. See `DeviceCalendarManageDialog` for the color-only device variant. */
export function CalendarManageDialog({
  open,
  onClose,
  calendar,
  onSave,
  onDelete,
}: CalendarManageDialogProps) {
  const [title, setTitle] = useState(calendar?.title || "");
  const [description, setDescription] = useState(calendar?.description || "");
  const [color, setColor] = useState(calendar?.color || PRESET_COLORS[0]);
  const [notificationPreference, setNotificationPreference] =
    useState<NotificationPreference>(
      calendar?.notificationPreference ?? DEFAULT_NOTIFICATION_PREFERENCE,
    );
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(
    null,
  );
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(calendar?.title || "");
    setDescription(calendar?.description || "");
    setColor(calendar?.color || PRESET_COLORS[0]);
    setNotificationPreference(
      calendar?.notificationPreference ?? DEFAULT_NOTIFICATION_PREFERENCE,
    );
    setDeleteConfirm(false);
    setPendingAction(null);
    setActionError(false);
  }, [calendar, open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setPendingAction("save");
    setActionError(false);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        color,
        notificationPreference,
      });
      onClose();
    } catch (error) {
      console.error("Failed to save calendar", error);
      setActionError(true);
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setPendingAction("delete");
    setActionError(false);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error("Failed to delete calendar", error);
      setActionError(true);
    } finally {
      setPendingAction(null);
    }
  };

  const isEdit = !!calendar;
  const isPending = pendingAction !== null;

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={isPending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        sx={{
          pt: isMobile ? "calc(16px + var(--safe-area-top))" : 2,
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            {isEdit
              ? intl.formatMessage({ id: "calendarManage.editCalendar" })
              : intl.formatMessage({ id: "calendarManage.newCalendar" })}
          </Typography>
          <IconButton onClick={onClose} size="small" disabled={isPending}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={3}>
          <TextField
            fullWidth
            label={intl.formatMessage({ id: "calendarManage.calendarName" })}
            placeholder={intl.formatMessage({
              id: "calendarManage.calendarNamePlaceholder",
            })}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            size="small"
          />

          <TextField
            fullWidth
            label={intl.formatMessage({ id: "navigation.description" })}
            placeholder={intl.formatMessage({
              id: "calendarManage.optionalDescription",
            })}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            size="small"
          />

          <Box>
            <Typography variant="body2" mb={1} fontWeight={500}>
              {intl.formatMessage({ id: "calendarManage.color" })}
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {PRESET_COLORS.map((presetColor) => (
                <IconButton
                  key={presetColor}
                  aria-label={`${intl.formatMessage({
                    id: "calendarManage.color",
                  })} ${presetColor}`}
                  aria-pressed={color === presetColor}
                  data-color={presetColor}
                  onClick={() => setColor(presetColor)}
                  sx={{
                    p: 0.5,
                    border:
                      color === presetColor
                        ? `2px solid ${presetColor}`
                        : "2px solid transparent",
                    borderRadius: "50%",
                  }}
                >
                  <CircleIcon sx={{ fontSize: 24, color: presetColor }} />
                </IconButton>
              ))}
            </Box>
          </Box>

          <FormControl size="small" fullWidth>
            <InputLabel id="calendar-notifications-label">
              {intl.formatMessage({ id: "calendarManage.notifications" })}
            </InputLabel>
            <Select
              labelId="calendar-notifications-label"
              label={intl.formatMessage({ id: "calendarManage.notifications" })}
              value={notificationPreference}
              onChange={(e) =>
                setNotificationPreference(
                  e.target.value as NotificationPreference,
                )
              }
            >
              <MenuItem value="enabled">
                {intl.formatMessage({ id: "calendarManage.notificationsOn" })}
              </MenuItem>
              <MenuItem value="disabled">
                {intl.formatMessage({ id: "calendarManage.notificationsOff" })}
              </MenuItem>
            </Select>
          </FormControl>
          {actionError ? (
            <Alert severity="error">
              {intl.formatMessage({ id: "calendarManage.actionFailed" })}
            </Alert>
          ) : null}
        </Box>
      </DialogContent>

      <DialogActions>
        {deleteConfirm ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              width: "100%",
            }}
          >
            <Typography variant="body2" color="error">
              {intl.formatMessage({ id: "calendarManage.deleteWarning" })}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
              <Button
                onClick={() => setDeleteConfirm(false)}
                color="inherit"
                disabled={isPending}
              >
                {intl.formatMessage({ id: "navigation.cancel" })}
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={handleDelete}
                disabled={isPending}
                startIcon={
                  pendingAction === "delete" ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : undefined
                }
              >
                {pendingAction === "delete"
                  ? intl.formatMessage({ id: "deleteEvent.deleting" })
                  : intl.formatMessage({ id: "calendarManage.reallyDelete" })}
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            {isEdit && onDelete && (
              <Button
                color="error"
                onClick={() => setDeleteConfirm(true)}
                sx={{ mr: "auto" }}
              >
                {intl.formatMessage({ id: "navigation.delete" })}
              </Button>
            )}
            <Button onClick={onClose} color="inherit" disabled={isPending}>
              {intl.formatMessage({ id: "navigation.cancel" })}
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={!title.trim() || isPending}
              startIcon={
                pendingAction === "save" ? (
                  <CircularProgress size={16} color="inherit" />
                ) : undefined
              }
            >
              {isEdit
                ? intl.formatMessage({ id: "navigation.save" })
                : intl.formatMessage({ id: "navigation.create" })}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
