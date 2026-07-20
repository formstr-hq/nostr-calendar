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
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsIcon from "@mui/icons-material/Settings";
import { useLocation, useNavigate } from "react-router";
import { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import { SectionLabel } from "./ui/SectionLabel";
import { MiniCalendar } from "./ui/MiniCalendar";
import { ICSUpload } from "./ICSUpload";
import { CalendarManageDialog } from "./CalendarManageDialog";
import { ContactFormDialog } from "./ContactFormDialog";
import { SchedulingPagesList } from "./SchedulingPagesList";
import { useCalendarLists } from "../stores/calendarLists";
import { useTimeBasedEvents } from "../stores/events";
import { useUser } from "../stores/user";
import { useSettings } from "../stores/settings";
import { useAppointmentData } from "../hooks/useAppointmentData";
import {
  getDateFromPathname,
  getLayoutFromPathname,
  getRouteFromDate,
} from "../utils/dateBasedRouting";
import { buttonHeight, radius } from "../theme/tokens";
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  type ICalendarList,
} from "../utils/calendarListTypes";
import { ICalendarEvent } from "../utils/types";

interface SidebarContentProps {
  onNewEvent: () => void;
  onImportEvent?: (event: ICalendarEvent) => void;
  /** Called after an action that should close a container (e.g. mobile BottomSheet). */
  onNavigate?: () => void;
}

export function SidebarContent({
  onNewEvent,
  onImportEvent,
  onNavigate,
}: SidebarContentProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { isInitialized } = useUser();
  useAppointmentData();
  // Pathname-derived, not useParams() — SidebarContent is mounted above
  // <Routes> (see useCalendarTopBarProps for the same constraint).
  const layout = getLayoutFromPathname(location.pathname);
  const date = getDateFromPathname(location.pathname);
  const themeMode = useSettings((s) => s.settings.themeMode);
  const updateSetting = useSettings((s) => s.updateSetting);
  const isDark = themeMode === "dark";

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
  const [contactFormOpen, setContactFormOpen] = useState(false);

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

  const handleMiniCalendarSelect = (picked: Dayjs) => {
    navigate(getRouteFromDate(picked, layout));
    onNavigate?.();
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          p: 2,
          pt: isMobile ? "calc(16px + var(--safe-area-top))" : 2,
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          boxSizing: "border-box",
        }}
      >
        <Button
          fullWidth
          onClick={() => {
            onNewEvent();
            onNavigate?.();
          }}
          sx={{
            height: buttonHeight.md,
            borderRadius: `${radius.card}px`,
            bgcolor: "text.primary",
            color: "background.paper",
            "&:hover": { bgcolor: "text.primary" },
          }}
        >
          + New event
        </Button>

        <Box mt={2}>
          <MiniCalendar date={date} onSelect={handleMiniCalendarSelect} />
        </Box>

        <Box mt={2}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={1}
          >
            <Box display="flex" alignItems="center" gap={0.5}>
              <SectionLabel>
                {intl.formatMessage({ id: "sidebar.calendars" })}
              </SectionLabel>
              <Tooltip
                title={intl.formatMessage({
                  id: "calendarManage.notificationsAppOnly",
                })}
                arrow
              >
                <InfoOutlinedIcon
                  sx={{ fontSize: 14, color: "text.disabled", cursor: "help" }}
                />
              </Tooltip>
            </Box>
            <IconButton
              size="small"
              aria-label="create calendar"
              onClick={handleCreateCalendar}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>

          {calendars.map((calendar) => (
            <Box
              key={calendar.id}
              data-testid="calendar-row"
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
                data-testid="calendar-visibility-checkbox"
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

        {isInitialized && (
          <Box mt={3}>
            <SchedulingPagesList onNavigate={onNavigate} />
          </Box>
        )}
      </Box>

      <Box
        sx={{
          p: 2,
          pb: isMobile ? "calc(16px + var(--safe-area-bottom))" : 2,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          px={2}
          py={1.25}
        >
          <Button
            size="small"
            startIcon={<SettingsIcon fontSize="small" />}
            onClick={() => {
              navigate("/settings");
              onNavigate?.();
            }}
            sx={{ color: "text.secondary" }}
          >
            {intl.formatMessage({ id: "sidebar.settingsLink" })}
          </Button>
          <IconButton
            onClick={() =>
              updateSetting("themeMode", isDark ? "light" : "dark")
            }
            aria-label="toggle dark mode"
            size="small"
          >
            {isDark ? (
              <DarkModeIcon fontSize="small" />
            ) : (
              <LightModeIcon fontSize="small" />
            )}
          </IconButton>
        </Box>

        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          px={2}
          pb={1.5}
        >
          <Box display="flex" gap={1.5} flexWrap="wrap">
            <Typography
              variant="caption"
              component="a"
              href="https://about.formstr.app"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "text.secondary", textDecoration: "none" }}
            >
              {intl.formatMessage({ id: "sidebar.about" })}
            </Typography>
            <Typography
              variant="caption"
              component="a"
              href="https://about.formstr.app/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "text.secondary", textDecoration: "none" }}
            >
              {intl.formatMessage({ id: "sidebar.privacyPolicy" })}
            </Typography>
            <Typography
              variant="caption"
              component="span"
              onClick={() => setContactFormOpen(true)}
              sx={{ color: "text.secondary", cursor: "pointer" }}
            >
              {intl.formatMessage({ id: "sidebar.contactUs" })}
            </Typography>
          </Box>
          <ICSUpload onImportEvent={onImportEvent} />
        </Box>
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

      <ContactFormDialog
        open={contactFormOpen}
        onClose={() => setContactFormOpen(false)}
      />
    </Box>
  );
}
