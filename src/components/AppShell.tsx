import { ReactNode, useState } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useNavigate } from "react-router";
import { Sidebar } from "./ui/Sidebar";
import { TopBar } from "./ui/TopBar";
import { MOBILE_TAB_BAR_HEIGHT, MobileTabBar } from "./ui/MobileTabBar";
import { BottomSheet } from "./ui/BottomSheet";
import { SidebarContent } from "./SidebarContent";
import { UserMenu } from "./UserMenu";
import CalendarEventEdit from "./CalendarEventEdit";
import { useCalendarTopBarProps } from "../hooks/useCalendarTopBarProps";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useRelayStatusPlaceholder } from "../hooks/useRelayStatusPlaceholder";
import { useInvitations } from "../stores/invitations";
import { ICalendarEvent } from "../utils/types";
import { RelaySettingsPage } from "../features/settings/RelaySettingsPage";

interface AppShellProps {
  children: ReactNode;
  onImportEvent?: (event: ICalendarEvent) => void;
}

export function AppShell({ children, onImportEvent }: AppShellProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const { unreadCount } = useInvitations();
  const relays = useRelayStatusPlaceholder();
  const topBar = useCalendarTopBarProps();

  const [newEventOpen, setNewEventOpen] = useState(false);
  const [relaySettingsOpen, setRelaySettingsOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const openNewEvent = () => setNewEventOpen(true);

  useKeyboardShortcuts({
    onNewEvent: openNewEvent,
    topBar,
  });

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100dvh",
        "html.ios-native &": {
          height: "100dvh",
          minHeight: 0,
          overflow: "hidden",
        },
      }}
    >
      {!isMobile && (
        <Sidebar onNewEvent={openNewEvent} onImportEvent={onImportEvent} />
      )}

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          "html.ios-native &": { minHeight: 0 },
        }}
      >
        <TopBar
          isMobile={isMobile}
          unreadCount={unreadCount}
          onBellClick={() => navigate("/notifications")}
          onRelayStatusClick={() => setRelaySettingsOpen(true)}
          onOpenCalendars={
            isMobile ? () => setMobileSheetOpen(true) : undefined
          }
          relays={relays}
          avatarSlot={<UserMenu />}
          {...topBar}
        />

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            "html.ios-native &": {
              minHeight: 0,
              overflowX: "hidden",
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            },
            pb: isMobile
              ? `calc(${MOBILE_TAB_BAR_HEIGHT}px + var(--safe-area-bottom))`
              : undefined,
          }}
        >
          {children}
        </Box>

        {isMobile && <MobileTabBar unreadCount={unreadCount} />}
      </Box>

      {isMobile && (
        <BottomSheet
          open={mobileSheetOpen}
          onClose={() => setMobileSheetOpen(false)}
          background="canvas"
        >
          <SidebarContent
            onNewEvent={openNewEvent}
            onImportEvent={onImportEvent}
            onNavigate={() => setMobileSheetOpen(false)}
          />
        </BottomSheet>
      )}

      <Dialog
        open={relaySettingsOpen}
        onClose={() => setRelaySettingsOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        aria-labelledby="relay-settings-heading"
        slotProps={{
          paper: {
            sx: {
              borderRadius: { xs: 0, sm: 3 },
              p: { xs: 1, sm: 2 },
            },
          },
        }}
      >
        <DialogContent sx={{ p: { xs: 1.5, sm: 2 } }}>
          <RelaySettingsPage
            isDialog
            onClose={() => setRelaySettingsOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {newEventOpen && (
        <CalendarEventEdit
          open
          event={null}
          mode="create"
          onClose={() => setNewEventOpen(false)}
        />
      )}
    </Box>
  );
}
