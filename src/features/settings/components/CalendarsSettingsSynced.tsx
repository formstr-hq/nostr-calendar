import { useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import { useIntl } from "react-intl";
import { CalendarManageDialog } from "../../../components/CalendarManageDialog";
import { CollapsibleGroup } from "../../../components/ui/CollapsibleGroup";
import { GroupCardShell } from "./GroupCardShell";
import { useTimeBasedEvents } from "../../../stores/events";
import { useCalendarLists } from "../../../stores/calendarLists";
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  type ICalendarList,
} from "../../../utils/calendarListTypes";

/** Settings → Calendars "Synced" (Nostr) card — self-contained (own store wiring + manage dialog). */
export function CalendarsSettingsSynced() {
  const intl = useIntl();
  const { calendars, createCalendar, updateCalendar, deleteCalendar } =
    useCalendarLists();
  const [editingCalendar, setEditingCalendar] = useState<
    ICalendarList | undefined
  >();
  const [dialogOpen, setDialogOpen] = useState(false);

  const openCreate = () => {
    setEditingCalendar(undefined);
    setDialogOpen(true);
  };

  const openEdit = (calendar: ICalendarList) => {
    setEditingCalendar(calendar);
    setDialogOpen(true);
  };

  const handleSave = async (data: {
    title: string;
    description: string;
    color: string;
    notificationPreference: "enabled" | "disabled";
  }) => {
    if (!editingCalendar) {
      await createCalendar(
        data.title,
        data.description,
        data.color,
        data.notificationPreference,
      );
      return;
    }

    const preferenceChanged =
      (editingCalendar.notificationPreference ??
        DEFAULT_NOTIFICATION_PREFERENCE) !== data.notificationPreference;
    await updateCalendar({ ...editingCalendar, ...data });
    if (preferenceChanged) {
      useTimeBasedEvents
        .getState()
        .refreshNotificationPreferencesForCalendar(editingCalendar.id);
    }
  };

  return (
    <GroupCardShell>
      <CollapsibleGroup
        title={intl.formatMessage({ id: "sidebar.calendarsSynced" })}
        count={calendars.length}
        defaultOpen
        topBorder={false}
        trailingAction={
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={openCreate}
          >
            {intl.formatMessage({ id: "calendarManage.newCalendar" })}
          </Button>
        }
      >
        {calendars.length === 0 ? (
          <Box sx={{ py: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "sidebar.noCalendarsYet" })}
            </Typography>
            <Button startIcon={<AddIcon />} onClick={openCreate} sx={{ mt: 1 }}>
              {intl.formatMessage({ id: "sidebar.createCalendar" })}
            </Button>
          </Box>
        ) : (
          calendars.map((calendar) => (
            <Box
              key={calendar.id}
              data-testid="calendar-settings-row"
              sx={{
                minHeight: 64,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 1.25,
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  bgcolor: calendar.color,
                  flexShrink: 0,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {calendar.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {calendar.color.toUpperCase()}
                </Typography>
              </Box>
              <Box
                sx={{
                  px: 1.25,
                  py: 0.75,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  bgcolor: "background.default",
                  fontSize: 12,
                }}
              >
                {calendar.color.toUpperCase()}
              </Box>
              <IconButton
                aria-label={`${intl.formatMessage({
                  id: "calendarManage.editCalendar",
                })}: ${calendar.title}`}
                onClick={() => openEdit(calendar)}
                size="small"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Box>
          ))
        )}
      </CollapsibleGroup>

      {dialogOpen ? (
        <CalendarManageDialog
          open
          calendar={editingCalendar}
          onClose={() => setDialogOpen(false)}
          onSave={handleSave}
          onDelete={
            editingCalendar
              ? () => deleteCalendar(editingCalendar.id)
              : undefined
          }
        />
      ) : null}
    </GroupCardShell>
  );
}
