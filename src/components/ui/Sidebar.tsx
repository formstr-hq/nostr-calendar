import { Box, Button, IconButton, Stack, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LinkIcon from "@mui/icons-material/Link";
import SettingsIcon from "@mui/icons-material/Settings";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import { useState } from "react";
import { useNavigate } from "react-router";
import { SidebarContent } from "../SidebarContent";
import { ICSUpload } from "../ICSUpload";
import { ICalendarEvent } from "../../utils/types";
import { buttonHeight, radius } from "../../theme/tokens";

export const SIDEBAR_WIDTH = 268;
export const COLLAPSED_SIDEBAR_WIDTH = 56;

interface SidebarProps {
  onNewEvent: () => void;
  onImportEvent?: (event: ICalendarEvent) => void;
}

/** Desktop-only persistent rail. Mobile exposes the same SidebarContent via a BottomSheet. */
export function Sidebar({ onNewEvent, onImportEvent }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();

  const navigateTo = (path: string) => () => navigate(path);

  return (
    <Box
      component="nav"
      sx={{
        width: isCollapsed ? COLLAPSED_SIDEBAR_WIDTH : SIDEBAR_WIDTH,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        bgcolor: "background.canvas",
        borderRight: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
        transition: "width 180ms ease",
      }}
    >
      {isCollapsed ? (
        <Stack alignItems="center" spacing={1} sx={{ pt: 1 }}>
          <Tooltip title="Show sidebar" placement="right">
            <IconButton
              aria-label="Show sidebar"
              onClick={() => setIsCollapsed(false)}
            >
              <ViewSidebarIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="New event" placement="right">
            <IconButton aria-label="New event" onClick={onNewEvent}>
              <AddIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Calendar settings" placement="right">
            <IconButton
              aria-label="Calendar settings"
              onClick={navigateTo("/settings/calendars")}
            >
              <CalendarMonthIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Create booking link" placement="right">
            <IconButton
              aria-label="Create booking link"
              onClick={navigateTo("/schedule/create")}
            >
              <LinkIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings" placement="right">
            <IconButton aria-label="Settings" onClick={navigateTo("/settings")}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Import .ics file" placement="right">
            <Box>
              <ICSUpload onImportEvent={onImportEvent} size="medium" />
            </Box>
          </Tooltip>
        </Stack>
      ) : (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box sx={{ display: "flex", gap: 1, p: 2, pb: 0 }}>
            <Tooltip title="Hide sidebar">
              <IconButton
                aria-label="Hide sidebar"
                onClick={() => setIsCollapsed(true)}
                sx={{ height: buttonHeight.md, width: buttonHeight.md }}
              >
                <ViewSidebarIcon />
              </IconButton>
            </Tooltip>
            <Button
              fullWidth
              onClick={onNewEvent}
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
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <SidebarContent
              onNewEvent={onNewEvent}
              onImportEvent={onImportEvent}
              showNewEvent={false}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
