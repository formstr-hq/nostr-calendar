/**
 * Lists native calendars from the phone (Android only). Hidden on web/iOS
 * where the bridge is unavailable.
 */

import { useMemo } from "react";
import {
  Alert,
  Box,
  Checkbox,
  Typography,
  IconButton,
  Button,
  Stack,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CircleIcon from "@mui/icons-material/Circle";
import { useIntl } from "react-intl";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { deviceCalendarColor } from "../utils/deviceCalendarAdapter";

export function DeviceCalendarsSection() {
  const intl = useIntl();
  const available = useDeviceCalendars((s) => s.available);
  const permission = useDeviceCalendars((s) => s.permission);
  const calendars = useDeviceCalendars((s) => s.calendars);
  const visibility = useDeviceCalendars((s) => s.visibility);
  const requestAccess = useDeviceCalendars((s) => s.requestAccess);
  const toggleVisibility = useDeviceCalendars((s) => s.toggleVisibility);
  const setAllVisibility = useDeviceCalendars((s) => s.setAllVisibility);
  const refreshCalendars = useDeviceCalendars((s) => s.refreshCalendars);
  const loading = useDeviceCalendars((s) => s.loading);
  const error = useDeviceCalendars((s) => s.error);
  const localDeviceLabel = intl.formatMessage({
    id: "deviceCalendar.localDevice",
  });

  const groupedCalendars = useMemo(() => {
    const groups = new Map<string, typeof calendars>();
    for (const calendar of calendars) {
      const key = calendar.accountName || localDeviceLabel;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(calendar);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [calendars, localDeviceLabel]);

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
          {intl.formatMessage({ id: "deviceCalendar.title" })}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {permission === "granted" && calendars.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage(
                { id: "deviceCalendar.visibleCount" },
                {
                  visibleCount,
                  calendarCount: calendars.length,
                },
              )}
            </Typography>
          )}
          {permission === "granted" && (
            <IconButton
              size="small"
              onClick={() => void refreshCalendars()}
              disabled={loading}
              title={intl.formatMessage({ id: "deviceCalendar.refresh" })}
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
          {intl.formatMessage({ id: error })}
        </Alert>
      )}

      {permission !== "granted" ? (
        <Box py={1}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {intl.formatMessage({ id: "deviceCalendar.connectHelp" })}
          </Typography>
          <Button size="small" variant="outlined" onClick={requestAccess}>
            {intl.formatMessage({ id: "deviceCalendar.connect" })}
          </Button>
        </Box>
      ) : calendars.length === 0 ? (
        <Typography variant="body2" color="text.secondary" py={1}>
          {intl.formatMessage({ id: "deviceCalendar.empty" })}
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
              {intl.formatMessage({ id: "deviceCalendar.showAll" })}
            </Button>
            <Button
              size="small"
              variant="text"
              disabled={visibleCount === 0}
              onClick={() => setAllVisibility(false)}
            >
              {intl.formatMessage({ id: "deviceCalendar.hideAll" })}
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
                          {c.name.trim() ||
                            intl.formatMessage({
                              id: "deviceCalendar.unnamed",
                            })}
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
