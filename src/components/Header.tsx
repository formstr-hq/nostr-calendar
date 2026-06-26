import React from "react";
import {
  Toolbar,
  IconButton,
  Drawer,
  Badge,
  Stack,
  Box,
  styled,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import AppBar from "@mui/material/AppBar";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { Link, useNavigate } from "react-router";
import { UserMenu } from "./UserMenu";
import { ICSUpload } from "./ICSUpload";
import { CalendarSidebar } from "./CalendarSidebar";
import { ICalendarEvent } from "../utils/types";
import { useInvitations } from "../stores/invitations";
import { isIOSNative } from "../utils/platform";

export const HEADER_HEIGHT = 56;

export const HeaderSpacer = styled(Box)({
  height: `calc(${HEADER_HEIGHT}px + var(--safe-area-top))`,
  flexShrink: 0,
});

interface HeaderProps {
  onImportEvent?: (event: ICalendarEvent) => void;
}

export const Header = ({ onImportEvent }: HeaderProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const compactIOSHeader = isIOSNative() && isMobile;
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const navigate = useNavigate();
  const { unreadCount } = useInvitations();

  return (
    <>
      <AppBar
        position="fixed"
        color="default"
        style={{
          justifyContent: "start",
          backgroundColor: "white",
          paddingTop: "var(--safe-area-top)",
        }}
      >
        <Toolbar
          style={{
            display: "flex",
            justifyContent: "space-between",
            minHeight: `${HEADER_HEIGHT}px`,
            gap: 8,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
            }}
          >
            <IconButton onClick={() => setDrawerOpen(true)} edge="start">
              <MenuIcon />
            </IconButton>
            <Link
              to={"/"}
              style={{
                display: "flex",
                alignItems: "center",
                width: "fit-content",
                flexShrink: 0,
              }}
            >
              <img
                src="/formstr.png"
                style={{
                  objectFit: "contain",
                  height: compactIOSHeader ? "32px" : "40px",
                  width: "fit-content",
                  maxWidth: compactIOSHeader ? "96px" : "unset",
                }}
                alt="Calendar Logo"
              />
            </Link>
            {!compactIOSHeader && <ICSUpload onImportEvent={onImportEvent} />}
          </Box>
          <Stack
            direction={"row"}
            sx={{ flexShrink: 0, alignItems: "center", ml: 1 }}
          >
            <IconButton
              sx={{ width: compactIOSHeader ? "44px" : "56px" }}
              onClick={() => navigate("/notifications")}
            >
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
            <UserMenu />
          </Stack>
        </Toolbar>
      </AppBar>
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        PaperProps={{ sx: { width: { xs: "100vw", sm: 340 } } }}
      >
        <CalendarSidebar onClose={closeDrawer} />
      </Drawer>
    </>
  );
};
