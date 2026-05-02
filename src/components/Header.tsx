import React from "react";
import { Toolbar, IconButton, Drawer, Badge, Stack } from "@mui/material";
import AppBar from "@mui/material/AppBar";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { Link, useNavigate } from "react-router";
import { UserMenu } from "./UserMenu";
import { ICSUpload } from "./ICSUpload";
import { CalendarSidebar } from "./CalendarSidebar";
import { ICalendarEvent } from "../utils/types";
import { useInvitations } from "../stores/invitations";

export const HEADER_HEIGHT = 56;

interface HeaderProps {
  onImportEvent?: (event: ICalendarEvent) => void;
}

export const Header = ({ onImportEvent }: HeaderProps) => {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const navigate = useNavigate();
  const { unreadCount } = useInvitations();

  return (
    <>
      <AppBar
        position="fixed"
        color="primary"
        style={{
          justifyContent: "start",
          backgroundColor: "white",
        }}
      >
        <Toolbar
          style={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconButton onClick={() => setDrawerOpen(true)} edge="start">
              <MenuIcon />
            </IconButton>
            <Link
              to={"/"}
              style={{
                display: "flex",
                alignItems: "center",
                width: "fit-content",
              }}
            >
              <img
                src="/formstr.png"
                style={{
                  objectFit: "contain",
                  height: "40px",
                  width: "fit-content",
                }}
                alt="Calendar Logo"
              />
            </Link>
            <ICSUpload onImportEvent={onImportEvent} />
          </div>
          <Stack direction={"row"}>
            <IconButton
              sx={{ width: "56px" }}
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
