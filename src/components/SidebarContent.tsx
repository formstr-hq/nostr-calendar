import { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Button,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import ContrastIcon from "@mui/icons-material/Contrast";
import SettingsIcon from "@mui/icons-material/Settings";
import { useLocation, useNavigate } from "react-router";
import { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import { MiniCalendar } from "./ui/MiniCalendar";
import { ICSUpload } from "./ICSUpload";
import { ContactFormDialog } from "./ContactFormDialog";
import { SchedulingPagesList } from "./SchedulingPagesList";
import { SidebarSyncedCalendars } from "./sidebar/SidebarSyncedCalendars";
import { SidebarDeviceCalendars } from "./sidebar/SidebarDeviceCalendars";
import { useUser } from "../stores/user";
import { useSettings } from "../stores/settings";
import { useAppointmentData } from "../hooks/useAppointmentData";
import {
  getDateFromPathname,
  getLayoutFromPathname,
  getRouteFromDate,
} from "../utils/dateBasedRouting";
import { buttonHeight, radius } from "../theme/tokens";
import { ICalendarEvent } from "../utils/types";

interface SidebarContentProps {
  onNewEvent: () => void;
  onImportEvent?: (event: ICalendarEvent) => void;
  /** The desktop shell renders its own New event control when it needs a drawer toggle beside it. */
  showNewEvent?: boolean;
  /** Called after an action that should close a container (e.g. mobile BottomSheet). */
  onNavigate?: () => void;
}

export function SidebarContent({
  onNewEvent,
  onImportEvent,
  showNewEvent = true,
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
  const weekStart = useSettings((s) => s.settings.general.weekStart);
  const updateSetting = useSettings((s) => s.updateSetting);
  const nextThemeMode =
    themeMode === "dark" ? "light" : themeMode === "light" ? "system" : "dark";
  const themeIcon =
    themeMode === "dark" ? (
      <DarkModeIcon fontSize="small" />
    ) : themeMode === "light" ? (
      <LightModeIcon fontSize="small" />
    ) : (
      <ContrastIcon fontSize="small" />
    );

  const [contactFormOpen, setContactFormOpen] = useState(false);

  const handleMiniCalendarSelect = (picked: Dayjs) => {
    navigate(getRouteFromDate(picked, layout, weekStart));
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
        {showNewEvent && (
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
        )}

        <Box mt={showNewEvent ? 2 : 0}>
          <MiniCalendar
            date={date}
            weekStart={weekStart}
            onSelect={handleMiniCalendarSelect}
          />
        </Box>

        <Box mt={2}>
          <SidebarSyncedCalendars />
          <SidebarDeviceCalendars />
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
            onClick={() => updateSetting("themeMode", nextThemeMode)}
            aria-label={`Theme: ${themeMode}`}
            size="small"
          >
            {themeIcon}
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

      <ContactFormDialog
        open={contactFormOpen}
        onClose={() => setContactFormOpen(false)}
      />
    </Box>
  );
}
