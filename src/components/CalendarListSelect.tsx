import { useState } from "react";
import React from "react";
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  ListSubheader,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import { useCalendarLists } from "../stores/calendarLists";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { CalendarManageDialog } from "./CalendarManageDialog";
import { useIntl } from "react-intl";
import { typography } from "../theme/tokens";
import {
  deviceCalendarColor,
  deviceCalendarIdFor,
} from "../utils/deviceCalendarAdapter";
import type { DeviceCalendarInfo } from "../plugins/deviceCalendar";

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
  /**
   * When true, the dropdown also surfaces the device calendars (read from
   * `useDeviceCalendars()`). Nostr calendars render first in a labeled
   * subheader, followed by a divider and a "Device calendars" subheader of
   * prefixed-phone-icon entries. Native-bridge absence or denied permission
   * collapses the device group entirely (the picker degrades to its plain
   * Nostr shape).
   */
  includeDeviceCalendars?: boolean;
}

const SELECT_DISPLAY_DATA_TESTID = "calendar-list-select";

const PILL_SX = {
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  "& .MuiSelect-select": { py: "8px", px: "14px" },
} as const;

const ROW_SX = {
  fontSize: 14,
  "&:before, &:after": { display: "none" },
  "& .MuiSelect-select": { py: 0, pr: "24px !important" },
} as const;

const SECTION_SUBHEADER_SX = {
  ...typography.sectionLabel,
  lineHeight: 2,
  color: "text.secondary",
  backgroundImage: "none",
  bgcolor: "background.paper",
  pointerEvents: "none" as const,
};

const SELECTED_TEXT_SX = {
  fontSize: 14,
  fontWeight: 500,
  color: "text.primary",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

type NostrCalendarLite = { id: string; title: string; color: string };

function TriggerDisplay({
  selected,
  nostrCalendars,
  deviceCalendars,
  colorOverrides,
  intl,
}: {
  selected: string;
  nostrCalendars: NostrCalendarLite[];
  deviceCalendars: DeviceCalendarInfo[];
  colorOverrides: Record<string, string>;
  intl: ReturnType<typeof useIntl>;
}) {
  if (selected.startsWith("device:")) {
    const nativeId = selected.slice("device:".length);
    const calendar = deviceCalendars.find((c) => c.id === nativeId);
    const color = calendar
      ? deviceCalendarColor(calendar, colorOverrides[nativeId])
      : "#4285f4";
    return (
      <Box display="inline-flex" alignItems="center" gap={1}>
        <PhoneIphoneIcon sx={{ fontSize: 14, color, flexShrink: 0 }} />
        {calendar?.name.trim() ||
          intl.formatMessage({ id: "deviceCalendar.unnamed" })}
      </Box>
    );
  }
  const cal = nostrCalendars.find((c) => c.id === selected);
  const hasSelectedCalendar = Boolean(cal);
  return (
    <Box
      display="inline-flex"
      alignItems="center"
      gap={1}
      color={hasSelectedCalendar ? undefined : "warning.main"}
    >
      <CircleIcon
        sx={{
          fontSize: 12,
          color: cal?.color || "warning.main",
        }}
      />
      {cal?.title || intl.formatMessage({ id: "addToCalendar.selectCalendar" })}
    </Box>
  );
}

/**
 * Builds the flat array of `<MenuItem>` children for `<Select>`. The
 * MenuItems MUST be returned as direct JSX (not wrapped in a Fragment or a
 * component) so MUI's `<Select>` can `cloneElement` each one and override
 * its `role` to `"option"`. Wrapping in a Fragment breaks the option list
 * silently (the original bug this file warns about); wrapping in a
 * component loses the role override and items end up as `role="menuitem"`,
 * breaking Playwright's `getByRole("option")` lookups.
 */
function buildMenuItems(
  nostrCalendars: NostrCalendarLite[],
  includeDeviceSection: boolean,
  visibleDeviceCalendars: DeviceCalendarInfo[],
  colorOverrides: Record<string, string>,
  intl: ReturnType<typeof useIntl>,
): React.ReactNode[] {
  const items: React.ReactNode[] = [];

  if (nostrCalendars.length > 0) {
    if (includeDeviceSection) {
      items.push(
        <ListSubheader
          key="__hdr_nostr__"
          sx={SECTION_SUBHEADER_SX}
          disableSticky
        >
          {intl.formatMessage({
            id: "deviceCalendar.picker.sectionNostr",
          })}
        </ListSubheader>,
      );
    }
    for (const cal of nostrCalendars) {
      items.push(
        <MenuItem key={cal.id} value={cal.id}>
          <ListItemIcon sx={{ minWidth: 24 }}>
            <CircleIcon
              sx={{
                fontSize: 12,
                color: cal.color,
              }}
            />
          </ListItemIcon>
          <ListItemText primary={cal.title} />
        </MenuItem>,
      );
    }
  }

  if (includeDeviceSection) {
    items.push(<Divider key="__divider_calendars__" />);
    items.push(
      <ListSubheader
        key="__hdr_device__"
        sx={SECTION_SUBHEADER_SX}
        disableSticky
      >
        {intl.formatMessage({
          id: "deviceCalendar.picker.sectionDevice",
        })}
      </ListSubheader>,
    );
    if (visibleDeviceCalendars.length === 0) {
      items.push(
        <MenuItem
          key="__no_device_calendars__"
          disabled
          value="__no_device_calendars__"
        >
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({
              id: "deviceCalendar.picker.noDeviceCalendars",
            })}
          </Typography>
        </MenuItem>,
      );
    } else {
      for (const calendar of visibleDeviceCalendars) {
        const value = deviceCalendarIdFor(calendar.id);
        items.push(
          <MenuItem key={value} value={value}>
            <ListItemIcon sx={{ minWidth: 24 }}>
              <PhoneIphoneIcon
                fontSize="small"
                sx={{
                  color: deviceCalendarColor(
                    calendar,
                    colorOverrides[calendar.id],
                  ),
                }}
              />
            </ListItemIcon>
            <ListItemText
              primary={calendar.name}
              secondary={calendar.accountName ?? null}
              primaryTypographyProps={{ sx: SELECTED_TEXT_SX }}
              secondaryTypographyProps={{
                variant: "caption",
                noWrap: true,
              }}
            />
          </MenuItem>,
        );
      }
    }
  }

  items.push(<Divider key="__divider__" />);
  items.push(
    <MenuItem key="__add_new__" value="__add_new__">
      <ListItemIcon sx={{ minWidth: 28 }}>
        <AddIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>
        {intl.formatMessage({ id: "addToCalendar.addNewCalendar" })}
      </ListItemText>
    </MenuItem>,
  );

  return items;
}

export function CalendarListSelect({
  value,
  onChange,
  label,
  size = "small",
  fullWidth = true,
  variant,
  includeDeviceCalendars = false,
}: CalendarListSelectProps) {
  const intl = useIntl();
  const { calendars, createCalendar } = useCalendarLists();
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const deviceCalendarsState = useDeviceCalendars();
  const includeDeviceSection =
    includeDeviceCalendars &&
    deviceCalendarsState.available &&
    deviceCalendarsState.permission === "granted";
  const visibleDeviceCalendars = includeDeviceSection
    ? deviceCalendarsState.calendars.filter((calendar) => {
        const isVisible = deviceCalendarsState.visibility[calendar.id] ?? true;
        return isVisible;
      })
    : [];

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

  const menuProps = includeDeviceCalendars
    ? { PaperProps: { sx: { maxHeight: 360 } } }
    : undefined;

  const menuItems = buildMenuItems(
    calendars,
    includeDeviceSection,
    visibleDeviceCalendars,
    deviceCalendarsState.colorOverrides,
    intl,
  );

  const renderValue = () => (
    <TriggerDisplay
      selected={value}
      nostrCalendars={calendars}
      deviceCalendars={deviceCalendarsState.calendars}
      colorOverrides={deviceCalendarsState.colorOverrides}
      intl={intl}
    />
  );

  const baseSelectProps = {
    value,
    displayEmpty: true,
    SelectDisplayProps: {
      "data-testid": SELECT_DISPLAY_DATA_TESTID,
    } as React.HTMLAttributes<HTMLDivElement>,
    renderValue,
    onChange: (e: { target: { value: string } }) =>
      handleChange(e.target.value),
    MenuProps: menuProps,
  };

  return (
    <>
      {variant === "pill" ? (
        <Select
          {...baseSelectProps}
          size="small"
          aria-label={displayLabel}
          sx={PILL_SX}
        >
          {menuItems}
        </Select>
      ) : variant === "row" ? (
        <Select
          {...baseSelectProps}
          size="small"
          aria-label={displayLabel}
          variant="standard"
          fullWidth
          sx={ROW_SX}
        >
          {menuItems}
        </Select>
      ) : (
        <FormControl fullWidth={fullWidth} size={size}>
          <InputLabel>{displayLabel}</InputLabel>
          <Select {...baseSelectProps} label={displayLabel}>
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
