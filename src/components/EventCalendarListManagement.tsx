import {
  Box,
  Button,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import Edit from "@mui/icons-material/Edit";
import { useIntl } from "react-intl";
import { CalendarListSelect } from "./CalendarListSelect";
import { useCalendarLists } from "../stores/calendarLists";

interface EventCalendarListManagementProps {
  calendarId: string;
  onCalendarUpdate: (nextCalendarId: string) => Promise<void>;
}

export function EventCalendarListManagement({
  calendarId,
  onCalendarUpdate,
}: EventCalendarListManagementProps) {
  const intl = useIntl();
  const { calendars } = useCalendarLists();
  const [selectedCalendarId, setSelectedCalendarId] = useState(calendarId);
  const [isEditingCalendar, setIsEditingCalendar] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [calendarEditError, setCalendarEditError] = useState(false);

  const calendar = calendars.find((c) => c.id === calendarId);

  useEffect(() => {
    if (!isEditingCalendar) {
      setSelectedCalendarId(calendarId);
    }
  }, [calendarId, isEditingCalendar]);

  if (!calendar) {
    return null;
  }

  const resetUiState = () => {
    setIsEditingCalendar(false);
    setSavingCalendar(false);
    setCalendarEditError(false);
    setSelectedCalendarId(calendarId);
  };

  const handleSaveCalendar = async () => {
    if (!selectedCalendarId) {
      return;
    }

    if (selectedCalendarId === calendarId) {
      resetUiState();
      return;
    }

    setSavingCalendar(true);
    setCalendarEditError(false);

    try {
      await onCalendarUpdate(selectedCalendarId);
      setIsEditingCalendar(false);
      setSavingCalendar(false);
      setCalendarEditError(false);
    } catch (error) {
      setCalendarEditError(true);
      setSavingCalendar(false);
      console.error("Failed to move event to selected calendar", error);
    }
  };

  if (isEditingCalendar) {
    return (
      <Stack spacing={1}>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Box maxWidth={500} flex={1} minWidth={150}>
            <CalendarListSelect
              value={selectedCalendarId}
              onChange={setSelectedCalendarId}
              size="small"
              label={intl.formatMessage({
                id: "event.selectCalendar",
              })}
            />
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={handleSaveCalendar}
            disabled={
              !selectedCalendarId ||
              selectedCalendarId === calendarId ||
              savingCalendar
            }
            sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {intl.formatMessage({ id: "navigation.save" })}
          </Button>
          <Button
            variant="text"
            size="small"
            disabled={savingCalendar}
            onClick={resetUiState}
            sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
        </Box>
        {calendarEditError ? (
          <Typography variant="caption" color="error">
            {intl.formatMessage({ id: "event.calendarMoveError" })}
          </Typography>
        ) : null}
      </Stack>
    );
  }

  return (
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
      <Tooltip
        title={intl.formatMessage({
          id: "calendarManage.editCalendar",
        })}
      >
        <IconButton
          size="small"
          onClick={() => {
            setSelectedCalendarId(calendarId);
            setIsEditingCalendar(true);
            setCalendarEditError(false);
          }}
        >
          <Edit fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
