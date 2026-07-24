import { Badge, Box } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SettingsIcon from "@mui/icons-material/Settings";
import { useLocation, useNavigate } from "react-router";

const TABS = [
  {
    key: "calendar",
    label: "Calendar",
    icon: CalendarMonthIcon,
    match: (p: string) => p === "/" || /^\/[mwd]\//.test(p),
    route: "/",
  },
  {
    key: "bookings",
    label: "Bookings",
    icon: BookmarkIcon,
    match: (p: string) => p.startsWith("/bookings"),
    route: "/bookings",
  },
  {
    key: "alerts",
    label: "Alerts",
    icon: NotificationsIcon,
    match: (p: string) => p.startsWith("/notifications"),
    route: "/notifications",
  },
  {
    key: "settings",
    label: "Settings",
    icon: SettingsIcon,
    match: (p: string) => p.startsWith("/settings"),
    route: "/settings",
  },
] as const;

export const MOBILE_TAB_BAR_HEIGHT = 58;

interface MobileTabBarProps {
  unreadCount: number;
}

export function MobileTabBar({ unreadCount }: MobileTabBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Box
      component="nav"
      sx={{
        position: "sticky",
        bottom: 0,
        display: "flex",
        minHeight: MOBILE_TAB_BAR_HEIGHT,
        pb: "var(--safe-area-bottom)",
        bgcolor: "background.paper",
        borderTop: "1px solid",
        borderColor: "divider",
        zIndex: (theme) => theme.zIndex.appBar,
      }}
    >
      {TABS.map(({ key, label, icon: Icon, match, route }) => {
        const active = match(location.pathname);
        return (
          <Box
            key={key}
            component="button"
            type="button"
            onClick={() => navigate(route)}
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.25,
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              color: active ? "text.primary" : "text.disabled",
            }}
          >
            {key === "alerts" ? (
              <Badge badgeContent={unreadCount} color="error">
                <Icon fontSize="small" />
              </Badge>
            ) : (
              <Icon fontSize="small" />
            )}
            <Box sx={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>
              {label}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
