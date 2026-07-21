import { Box } from "@mui/material";
import { SidebarContent } from "../SidebarContent";
import { ICalendarEvent } from "../../utils/types";

export const SIDEBAR_WIDTH = 268;

interface SidebarProps {
  onNewEvent: () => void;
  onImportEvent?: (event: ICalendarEvent) => void;
}

/** Desktop-only persistent rail. Mobile exposes the same SidebarContent via a BottomSheet. */
export function Sidebar({ onNewEvent, onImportEvent }: SidebarProps) {
  return (
    <Box
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        bgcolor: "background.canvas",
        borderRight: "1px solid",
        borderColor: "divider",
      }}
    >
      <SidebarContent onNewEvent={onNewEvent} onImportEvent={onImportEvent} />
    </Box>
  );
}
