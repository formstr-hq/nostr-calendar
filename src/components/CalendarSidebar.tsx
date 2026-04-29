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

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Checkbox,
  Typography,
  IconButton,
  Button,
  Stack,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DatePicker } from "./DatePicker";
import { useCalendarLists } from "../stores/calendarLists";
import { CalendarManageDialog } from "./CalendarManageDialog";
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  type ICalendarList,
} from "../utils/calendarListTypes";
import { useIntl } from "react-intl";
import { useTimeBasedEvents } from "../stores/events";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { deviceCalendarColor } from "../utils/deviceCalendarAdapter";

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
    <Box
      padding={theme.spacing(2)}
      sx={{
        width: "100%",
        maxHeight: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
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
      </Box>

      <DeviceCalendarsSection />

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

/**
 * Lists native calendars from the phone (Android only). Hidden on web/iOS
 * where the bridge is unavailable.
 */
function DeviceCalendarsSection() {
  const available = useDeviceCalendars((s) => s.available);
  const permission = useDeviceCalendars((s) => s.permission);
  const calendars = useDeviceCalendars((s) => s.calendars);
  const visibility = useDeviceCalendars((s) => s.visibility);
  const requestAccess = useDeviceCalendars((s) => s.requestAccess);
  const toggleVisibility = useDeviceCalendars((s) => s.toggleVisibility);
  const setAllVisibility = useDeviceCalendars((s) => s.setAllVisibility);
  const refreshCalendars = useDeviceCalendars((s) => s.refreshCalendars);
  const openAppSettings = useDeviceCalendars((s) => s.openAppSettings);
  const permanentlyDenied = useDeviceCalendars((s) => s.permanentlyDenied);
  const loading = useDeviceCalendars((s) => s.loading);
  const error = useDeviceCalendars((s) => s.error);

  const groupedCalendars = useMemo(() => {
    const groups = new Map<string, typeof calendars>();
    for (const calendar of calendars) {
      const key = calendar.accountName || "Local device";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(calendar);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [calendars]);

  const visibleCount = calendars.filter(
    (c) => visibility[c.id] !== false,
  ).length;

  if (!available) return null;

  return (
    <Box mt={3}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={1}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Device calendars
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {permission === "granted" && calendars.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {visibleCount}/{calendars.length} visible
            </Typography>
          )}
          {permission === "granted" && (
            <IconButton
              size="small"
              onClick={() => void refreshCalendars()}
              disabled={loading}
              title="Refresh device calendars"
            >
              <RefreshIcon
                fontSize="small"
                sx={{
                  animation: loading ? "spin 1s linear infinite" : undefined,
                  "@keyframes spin": {
                    from: { transform: "rotate(0deg)" },
                    to: { transform: "rotate(360deg)" },
                  },
                }}
              />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} variant="outlined">
          {error}
        </Alert>
      )}

      {permission !== "granted" ? (
        <Box py={1}>
          {permanentlyDenied ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Calendar permission was denied. Open system settings to grant
                access, then return here.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => void openAppSettings()}
              >
                Open settings
              </Button>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Show events from your phone's calendar apps alongside Nostr
                events.
              </Typography>
              <Button size="small" variant="outlined" onClick={requestAccess}>
                Connect device calendars
              </Button>
            </>
          )}
        </Box>
      ) : calendars.length === 0 ? (
        <Typography variant="body2" color="text.secondary" py={1}>
          No calendars found on this device.
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1} mb={1}>
            <Button
              size="small"
              variant="text"
              disabled={visibleCount === calendars.length}
              onClick={() => setAllVisibility(true)}
            >
              Show all
            </Button>
            <Button
              size="small"
              variant="text"
              disabled={visibleCount === 0}
              onClick={() => setAllVisibility(false)}
            >
              Hide all
            </Button>
          </Stack>

          <Box
            sx={{
              maxHeight: 260,
              overflowY: "auto",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              py: 0.5,
            }}
          >
            {groupedCalendars.map(([accountName, accountCalendars]) => (
              <Box key={accountName}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{
                    px: 1,
                    pt: 0.5,
                    wordBreak: "break-all",
                    whiteSpace: "normal",
                  }}
                >
                  {accountName}
                </Typography>

                {accountCalendars.map((c) => {
                  const color = deviceCalendarColor(c);
                  const visible = visibility[c.id] !== false;
                  return (
                    <Box
                      key={c.id}
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
                        onChange={() => toggleVisibility(c.id)}
                        size="small"
                        sx={{
                          color,
                          "&.Mui-checked": { color },
                          p: 0.5,
                        }}
                      />
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={1}
                        flex={1}
                        ml={0.5}
                        minWidth={0}
                      >
                        <CircleIcon
                          sx={{ fontSize: 10, color, flexShrink: 0 }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            wordBreak: "break-word",
                            whiteSpace: "normal",
                          }}
                        >
                          {c.name}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
