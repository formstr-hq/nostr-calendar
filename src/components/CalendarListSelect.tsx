import { useState } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import AddIcon from "@mui/icons-material/Add";
import { useCalendarLists } from "../stores/calendarLists";
import { CalendarManageDialog } from "./CalendarManageDialog";
import { useIntl } from "react-intl";

interface CalendarListSelectProps {
  value: string;
  onChange: (calendarId: string) => void;
  label?: string;
  size?: "small" | "medium";
  fullWidth?: boolean;
}

export function CalendarListSelect({
  value,
  onChange,
  label,
  size = "small",
  fullWidth = true,
}: CalendarListSelectProps) {
  const intl = useIntl();
  const { calendars, createCalendar } = useCalendarLists();
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  const displayLabel =
    label || intl.formatMessage({ id: "addToCalendar.selectCalendar" });

  const handleChange = (selectedValue: string) => {
    if (selectedValue === "__add_new__") {
      setManageDialogOpen(true);
      return;
    }
    onChange(selectedValue);
  };

  const handleCreateCalendar = async (data: {
    title: string;
    description: string;
    color: string;
    notificationPreference: "enabled" | "disabled";
  }) => {
    const newCalendar = await createCalendar(
      data.title,
      data.description,
      data.color,
      data.notificationPreference,
    );
    if (newCalendar) {
      onChange(newCalendar.id);
    }
  };

  return (
    <>
      <FormControl fullWidth={fullWidth} size={size}>
        <InputLabel>{displayLabel}</InputLabel>
        <Select
          value={value}
          label={displayLabel}
          onChange={(e) => handleChange(e.target.value)}
          renderValue={(selected) => {
            const cal = calendars.find((c) => c.id === selected);
            return (
              <Box display="flex" alignItems="center" gap={1}>
                <CircleIcon sx={{ fontSize: 12, color: cal?.color }} />
                {cal?.title ||
                  intl.formatMessage({ id: "event.selectCalendar" })}
              </Box>
            );
          }}
        >
          {calendars.map((cal) => (
            <MenuItem key={cal.id} value={cal.id}>
              <Box display="flex" alignItems="center" gap={1}>
                <CircleIcon sx={{ fontSize: 12, color: cal.color }} />
                {cal.title}
              </Box>
            </MenuItem>
          ))}
          <Divider />
          <MenuItem value="__add_new__">
            <ListItemIcon sx={{ minWidth: 28 }}>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {intl.formatMessage({ id: "addToCalendar.addNewCalendar" })}
            </ListItemText>
          </MenuItem>
        </Select>
      </FormControl>

      {manageDialogOpen && (
        <CalendarManageDialog
          open={manageDialogOpen}
          onClose={() => setManageDialogOpen(false)}
          onSave={handleCreateCalendar}
        />
      )}
    </>
  );
}
