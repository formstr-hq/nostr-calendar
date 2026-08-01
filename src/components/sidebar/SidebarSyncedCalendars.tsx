import { useState } from "react";
import {
  Box,
  Checkbox,
  Typography,
  IconButton,
  Button,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useIntl } from "react-intl";
import { CollapsibleGroup } from "../ui/CollapsibleGroup";
import { CalendarManageDialog } from "../CalendarManageDialog";
import { useCalendarLists } from "../../stores/calendarLists";
import { useTimeBasedEvents } from "../../stores/events";
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  type ICalendarList,
} from "../../utils/calendarListTypes";

/** Sidebar's "Synced" (Nostr) calendar group — self-contained (own store wiring + manage dialog). */
export function SidebarSyncedCalendars() {
  const intl = useIntl();
  const {
    calendars,
    toggleVisibility,
    createCalendar,
    updateCalendar,
    deleteCalendar,
  } = useCalendarLists();

  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<
    ICalendarList | undefined
  >();

  const handleCreateCalendar = () => {
    setEditingCalendar(undefined);
    setManageDialogOpen(true);
  };

  const handleEditCalendar = (calendar: ICalendarList) => {
    setEditingCalendar(calendar);
    setManageDialogOpen(true);
  };

  const handleSave = async (data: {
    title: string;
    description: string;
    color: string;
    notificationPreference: "enabled" | "disabled";
  }) => {
    if (editingCalendar) {
      const preferenceChanged =
        (editingCalendar.notificationPreference ??
          DEFAULT_NOTIFICATION_PREFERENCE) !== data.notificationPreference;

      await updateCalendar({ ...editingCalendar, ...data });
      if (preferenceChanged) {
        useTimeBasedEvents
          .getState()
          .refreshNotificationPreferencesForCalendar(editingCalendar.id);
      }
    } else {
      await createCalendar(
        data.title,
        data.description,
        data.color,
        data.notificationPreference,
      );
    }
  };

  const handleDelete = async () => {
    if (editingCalendar) {
      await deleteCalendar(editingCalendar.id);
      setManageDialogOpen(false);
    }
  };

  return (
    <>
      <CollapsibleGroup
        title={intl.formatMessage({ id: "sidebar.calendarsSynced" })}
        count={calendars.length}
        defaultOpen
        trailingAction={
          <Box display="flex" alignItems="center" gap={0.25}>
            <Tooltip
              title={intl.formatMessage({
                id: "calendarManage.notificationsAppOnly",
              })}
              arrow
            >
              <InfoOutlinedIcon
                sx={{ fontSize: 14, color: "text.disabled", cursor: "help" }}
              />
            </Tooltip>
            <IconButton
              size="small"
              aria-label="create calendar"
              onClick={handleCreateCalendar}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        {calendars.map((calendar) => (
          <Box
            key={calendar.id}
            data-testid="calendar-row"
            display="flex"
            alignItems="center"
            sx={{
              py: 0.5,
              "&:hover": { backgroundColor: "action.hover" },
              borderRadius: 1,
            }}
          >
            <Checkbox
              checked={calendar.isVisible}
              data-testid="calendar-visibility-checkbox"
              onChange={() => toggleVisibility(calendar.id)}
              size="small"
              sx={{
                color: calendar.color,
                "&.Mui-checked": { color: calendar.color },
                p: 0.5,
              }}
            />
            <Box
              display="flex"
              alignItems="center"
              gap={1}
              flex={1}
              minWidth={0}
              sx={{ cursor: "pointer", ml: 0.5 }}
              onClick={() => handleEditCalendar(calendar)}
            >
              <CircleIcon sx={{ fontSize: 10, color: calendar.color }} />
              <Typography
                variant="body2"
                sx={{ wordBreak: "break-word", whiteSpace: "normal" }}
              >
                {calendar.title}
              </Typography>
            </Box>
          </Box>
        ))}

        {calendars.length === 0 && (
          <Box py={2} textAlign="center">
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "sidebar.noCalendarsYet" })}
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={handleCreateCalendar}
              sx={{ mt: 1 }}
            >
              {intl.formatMessage({ id: "sidebar.createCalendar" })}
            </Button>
          </Box>
        )}
      </CollapsibleGroup>

      {manageDialogOpen && (
        <CalendarManageDialog
          open={manageDialogOpen}
          onClose={() => setManageDialogOpen(false)}
          calendar={editingCalendar}
          onSave={handleSave}
          onDelete={editingCalendar ? handleDelete : undefined}
        />
      )}
    </>
  );
}
