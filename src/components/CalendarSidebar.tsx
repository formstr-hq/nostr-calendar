/**
 * Calendar Sidebar
 *
 * Renders inside the hamburger menu drawer. Shows:
 * - DatePicker for navigation
 * - List of calendars with color dots and visibility checkboxes
 * - "Add Calendar" button
 * - Public events filter
 *
 * Clicking a calendar name opens the management dialog for editing.
 */

import { useState } from "react";
import {
  Box,
  Checkbox,
  Typography,
  IconButton,
  Button,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { DatePicker } from "./DatePicker";
import { useCalendarLists } from "../stores/calendarLists";
import { CalendarManageDialog } from "./CalendarManageDialog";
import type { ICalendarList } from "../utils/calendarListTypes";
import { useIntl } from "react-intl";
import { useTimeBasedEvents } from "../stores/events";

interface CalendarSidebarProps {
  onClose: () => void;
}

export function CalendarSidebar({ onClose }: CalendarSidebarProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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
        (editingCalendar.notificationPreference || "enabled") !==
        data.notificationPreference;

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
    <Box padding={theme.spacing(2)} minWidth={260}>
      <Box width="100%" justifyContent="end" display="flex">
        {isMobile && (
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      <DatePicker onSelect={onClose} />

      {/* Calendar list section */}
      <Box mt={3}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={1}
        >
          <Box display="flex" alignItems="center" gap={0.5}>
            <Typography variant="subtitle2" fontWeight={600}>
              {intl.formatMessage({ id: "sidebar.calendars" })}
            </Typography>
            <Tooltip
              title={intl.formatMessage({
                id: "calendarManage.notificationsAppOnly",
              })}
              arrow
            >
              <InfoOutlinedIcon
                sx={{ fontSize: 16, color: "text.secondary", cursor: "help" }}
              />
            </Tooltip>
          </Box>
          <IconButton size="small" onClick={handleCreateCalendar}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>

        {calendars.map((calendar) => (
          <Box
            key={calendar.id}
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
              sx={{ cursor: "pointer", ml: 0.5 }}
              onClick={() => handleEditCalendar(calendar)}
            >
              <CircleIcon sx={{ fontSize: 10, color: calendar.color }} />
              <Typography variant="body2" noWrap>
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
      </Box>


      {manageDialogOpen && (
        <CalendarManageDialog
          open={manageDialogOpen}
          onClose={() => setManageDialogOpen(false)}
          calendar={editingCalendar}
          onSave={handleSave}
          onDelete={editingCalendar ? handleDelete : undefined}
        />
      )}
    </Box>
  );
}
