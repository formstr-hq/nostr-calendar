import { useMemo, useState } from "react";
import { Box, Checkbox, Typography, IconButton, Button } from "@mui/material";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import CircleIcon from "@mui/icons-material/Circle";
import { useIntl } from "react-intl";
import { CollapsibleGroup } from "../ui/CollapsibleGroup";
import { DeviceCalendarManageDialog } from "../DeviceCalendarManageDialog";
import { useDeviceCalendars } from "../../stores/deviceCalendars";
import { deviceCalendarColor } from "../../utils/deviceCalendarAdapter";
import type { DeviceCalendarInfo } from "../../plugins/deviceCalendar";

/** Sidebar's "Device only" calendar group — self-contained (own store wiring + manage dialog). Renders nothing when the native bridge isn't available on this platform. */
export function SidebarDeviceCalendars() {
  const intl = useIntl();
  const available = useDeviceCalendars((s) => s.available);
  const permission = useDeviceCalendars((s) => s.permission);
  const calendars = useDeviceCalendars((s) => s.calendars);
  const visibility = useDeviceCalendars((s) => s.visibility);
  const colorOverrides = useDeviceCalendars((s) => s.colorOverrides);
  const toggleVisibility = useDeviceCalendars((s) => s.toggleVisibility);
  const requestWriteAccess = useDeviceCalendars((s) => s.requestWriteAccess);
  const updateCalendarColor = useDeviceCalendars((s) => s.updateCalendarColor);
  const [editingCalendar, setEditingCalendar] = useState<
    DeviceCalendarInfo | undefined
  >();
  const localDeviceLabel = intl.formatMessage({
    id: "deviceCalendar.localDevice",
  });

  const groupedCalendars = useMemo(() => {
    const groups = new Map<string, DeviceCalendarInfo[]>();
    for (const calendar of calendars) {
      const key = calendar.accountName || localDeviceLabel;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(calendar);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [calendars, localDeviceLabel]);

  if (!available) return null;

  return (
    <>
      <CollapsibleGroup
        title={intl.formatMessage({ id: "sidebar.calendarsDeviceOnly" })}
        count={permission === "granted" ? calendars.length : undefined}
        defaultOpen
      >
        {permission !== "granted" ? (
          <Box
            sx={{
              border: "1.5px dashed",
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
              textAlign: "center",
              mt: 0.5,
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {intl.formatMessage({ id: "sidebar.connectDeviceCalendarHelp" })}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void requestWriteAccess()}
            >
              {intl.formatMessage({ id: "sidebar.connectDeviceCalendar" })}
            </Button>
          </Box>
        ) : calendars.length === 0 ? (
          <Typography variant="body2" color="text.secondary" py={1}>
            {intl.formatMessage({ id: "deviceCalendar.empty" })}
          </Typography>
        ) : (
          groupedCalendars.map(([accountName, accountCalendars]) => (
            <Box key={accountName}>
              <Box
                display="flex"
                alignItems="center"
                gap={0.75}
                sx={{ px: 0.5, pt: 1, pb: 0.25 }}
              >
                <PhoneIphoneIcon
                  sx={{ fontSize: 12, color: "text.disabled" }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: "0.4px",
                    wordBreak: "break-all",
                  }}
                >
                  {accountName}
                </Typography>
              </Box>
              {accountCalendars.map((deviceCal) => {
                const color = deviceCalendarColor(
                  deviceCal,
                  colorOverrides[deviceCal.id],
                );
                const visible = visibility[deviceCal.id] !== false;
                return (
                  <Box
                    key={deviceCal.id}
                    data-testid="device-calendar-row"
                    display="flex"
                    alignItems="center"
                    sx={{
                      py: 0.5,
                      "&:hover": { backgroundColor: "action.hover" },
                      borderRadius: 1,
                    }}
                  >
                    <Checkbox
                      checked={visible}
                      onChange={() => toggleVisibility(deviceCal.id)}
                      size="small"
                      sx={{ color, "&.Mui-checked": { color }, p: 0.5 }}
                    />
                    <Box
                      display="flex"
                      alignItems="center"
                      gap={1}
                      flex={1}
                      minWidth={0}
                      sx={{ ml: 0.5 }}
                    >
                      <CircleIcon sx={{ fontSize: 10, color }} />
                      <Typography
                        variant="body2"
                        sx={{ wordBreak: "break-word", whiteSpace: "normal" }}
                      >
                        {deviceCal.name.trim() ||
                          intl.formatMessage({ id: "deviceCalendar.unnamed" })}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      aria-label={intl.formatMessage({
                        id: "calendarManage.manageCalendar",
                      })}
                      onClick={() => setEditingCalendar(deviceCal)}
                      sx={{ color: "text.disabled" }}
                    >
                      <MoreHorizIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          ))
        )}
      </CollapsibleGroup>

      {editingCalendar && (
        <DeviceCalendarManageDialog
          open
          deviceCalendar={editingCalendar}
          onClose={() => setEditingCalendar(undefined)}
          onSaveColor={(color) =>
            updateCalendarColor(editingCalendar.id, color)
          }
        />
      )}
    </>
  );
}
