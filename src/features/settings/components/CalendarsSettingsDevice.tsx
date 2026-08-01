import { useMemo, useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useIntl } from "react-intl";
import { DeviceCalendarManageDialog } from "../../../components/DeviceCalendarManageDialog";
import { CollapsibleGroup } from "../../../components/ui/CollapsibleGroup";
import { GroupCardShell } from "./GroupCardShell";
import { useDeviceCalendars } from "../../../stores/deviceCalendars";
import { deviceCalendarColor } from "../../../utils/deviceCalendarAdapter";
import type { DeviceCalendarInfo } from "../../../plugins/deviceCalendar";

/** Settings → Calendars "Device only" card — self-contained (own store wiring + manage dialog). Renders nothing when the native bridge isn't available on this platform. */
export function CalendarsSettingsDevice() {
  const intl = useIntl();
  const available = useDeviceCalendars((s) => s.available);
  const permission = useDeviceCalendars((s) => s.permission);
  const calendars = useDeviceCalendars((s) => s.calendars);
  const colorOverrides = useDeviceCalendars((s) => s.colorOverrides);
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
    <GroupCardShell>
      <CollapsibleGroup
        title={intl.formatMessage({ id: "sidebar.calendarsDeviceOnly" })}
        count={permission === "granted" ? calendars.length : undefined}
        defaultOpen
        topBorder={false}
      >
        {permission !== "granted" ? (
          <Box
            sx={{
              py: 2.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2.5,
              flexWrap: "wrap",
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: 440 }}
            >
              {intl.formatMessage({ id: "sidebar.connectDeviceCalendarHelp" })}
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => void requestWriteAccess()}
            >
              {intl.formatMessage({ id: "sidebar.connectDeviceCalendar" })}
            </Button>
          </Box>
        ) : calendars.length === 0 ? (
          <Typography variant="body2" color="text.secondary" py={2}>
            {intl.formatMessage({ id: "deviceCalendar.empty" })}
          </Typography>
        ) : (
          groupedCalendars.map(([accountName, accountCalendars]) => (
            <Box key={accountName}>
              <Box
                display="flex"
                alignItems="center"
                gap={0.75}
                sx={{ pt: 1.5, pb: 0.5 }}
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
                return (
                  <Box
                    key={deviceCal.id}
                    data-testid="device-calendar-settings-row"
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
                        bgcolor: color,
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {deviceCal.name.trim() ||
                          intl.formatMessage({ id: "deviceCalendar.unnamed" })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {deviceCal.canWrite
                          ? intl.formatMessage({
                              id: "calendarManage.readWrite",
                            })
                          : intl.formatMessage({
                              id: "calendarManage.readOnly",
                            })}
                      </Typography>
                    </Box>
                    <IconButton
                      aria-label={`${intl.formatMessage({
                        id: "calendarManage.manageCalendar",
                      })}: ${deviceCal.name}`}
                      onClick={() => setEditingCalendar(deviceCal)}
                      size="small"
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
    </GroupCardShell>
  );
}
