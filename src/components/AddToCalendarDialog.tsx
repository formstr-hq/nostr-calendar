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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useCalendarLists } from "../stores/calendarLists";
import type { ICalendarEvent } from "../utils/types";
import { TimeRenderer } from "./TimeRenderer";
import { CalendarListSelect } from "./CalendarListSelect";
import { useIntl } from "react-intl";

interface AddToCalendarDialogProps {
  open: boolean;
  onClose: () => void;
  event: ICalendarEvent;
  onAccept: (calendarId: string) => void;
}

export function AddToCalendarDialog({
  open,
  onClose,
  event,
  onAccept,
}: AddToCalendarDialogProps) {
  const intl = useIntl();
  const { calendars } = useCalendarLists();
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    calendars[0]?.id || "",
  );
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const handleAccept = () => {
    if (selectedCalendarId) {
      onAccept(selectedCalendarId);
      onClose();
    }
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
            {intl.formatMessage({ id: "addToCalendar.addToCalendar" })}
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

          {/* Calendar selector */}
          <CalendarListSelect
            value={selectedCalendarId}
            onChange={setSelectedCalendarId}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ padding: 2 }}>
        <Button onClick={onClose} color="inherit">
          {intl.formatMessage({ id: "navigation.cancel" })}
        </Button>
        <Button
          onClick={handleAccept}
          variant="contained"
          disabled={!selectedCalendarId}
        >
          {intl.formatMessage({ id: "navigation.add" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
