import { useState } from "react";
import React from "react";
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
  /**
   * "pill": borderless compact trigger for placing inline next to another
   * pill (e.g. the desktop Repeat pill). "row": borderless, full-width,
   * value right-aligned — for a group-card row on mobile. Omitted keeps the
   * original labeled FormControl look used by every other call site.
   */
  variant?: "pill" | "row";
}

export function CalendarListSelect({
  value,
  onChange,
  label,
  size = "small",
  fullWidth = true,
  variant,
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

  const renderValue = (selected: string) => {
    const cal = calendars.find((c) => c.id === selected);
    return (
      <Box display="flex" alignItems="center" gap={1}>
        <CircleIcon sx={{ fontSize: 12, color: cal?.color }} />
        {cal?.title || intl.formatMessage({ id: "event.selectCalendar" })}
      </Box>
    );
  };

  // MUI's Select/Menu only recognize direct MenuItem children — a Fragment
  // wrapping them is treated as one opaque child and silently breaks the
  // option list, so this must be a flat array, not `<>...</>`.
  const menuItems = [
    ...calendars.map((cal) => (
      <MenuItem key={cal.id} value={cal.id}>
        <Box display="flex" alignItems="center" gap={1}>
          <CircleIcon sx={{ fontSize: 12, color: cal.color }} />
          {cal.title}
        </Box>
      </MenuItem>
    )),
    <Divider key="__divider__" />,
    <MenuItem key="__add_new__" value="__add_new__">
      <ListItemIcon sx={{ minWidth: 28 }}>
        <AddIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>
        {intl.formatMessage({ id: "addToCalendar.addNewCalendar" })}
      </ListItemText>
    </MenuItem>,
  ];

  const selectDisplayProps = {
    "data-testid": "calendar-list-select",
  } as React.HTMLAttributes<HTMLDivElement>;

  return (
    <>
      {variant === "pill" ? (
        <Select
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          SelectDisplayProps={selectDisplayProps}
          renderValue={renderValue}
          size="small"
          aria-label={displayLabel}
          sx={{
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            "& .MuiSelect-select": { py: "8px", px: "14px" },
          }}
        >
          {menuItems}
        </Select>
      ) : variant === "row" ? (
        <Select
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          SelectDisplayProps={selectDisplayProps}
          renderValue={renderValue}
          size="small"
          aria-label={displayLabel}
          variant="standard"
          fullWidth
          sx={{
            fontSize: 14,
            "&:before, &:after": { display: "none" },
            "& .MuiSelect-select": { py: 0, pr: "24px !important" },
          }}
        >
          {menuItems}
        </Select>
      ) : (
        <FormControl fullWidth={fullWidth} size={size}>
          <InputLabel>{displayLabel}</InputLabel>
          <Select
            value={value}
            label={displayLabel}
            onChange={(e) => handleChange(e.target.value)}
            SelectDisplayProps={selectDisplayProps}
            renderValue={renderValue}
          >
            {menuItems}
          </Select>
        </FormControl>
      )}

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
