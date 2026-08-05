import { useState } from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { useNavigate } from "react-router";
import { useIntl } from "react-intl";
import CloseIcon from "@mui/icons-material/Close";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Download from "@mui/icons-material/Download";
import Edit from "@mui/icons-material/Edit";
import Delete from "@mui/icons-material/Delete";
import { ICalendarEvent } from "../../../utils/types";
import { CalendarEventState } from "../../../common/types";
import { exportICS, isMobile } from "../../../common/utils";
import { getEditDeviceEventPage } from "../../../utils/routingHelper";
import { isNative } from "../../../utils/platform";
import { DeleteDeviceEventDialog } from "./DeleteDeviceEventDialog";

/**
 * Device (OS-calendar) variant of `EventActionsBar` — ICS export, edit, and
 * delete apply, but never duplicate/copy-link/open-in-new (no Nostr identity
 * to share). Split out as its own component so neither variant's menu logic
 * has to branch around the other's.
 */
export function DeviceEventActionsBar({
  event,
  closeModal,
  showClose = true,
}: {
  event: ICalendarEvent;
  closeModal: () => void;
  showClose?: boolean;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const iconSize = isMobile ? "small" : "medium";
  const closeMenu = () => setMenuAnchor(null);

  const editDeviceEvent = () => {
    closeModal();
    navigate(getEditDeviceEventPage(event.id), {
      state: { calendarEvent: event } satisfies CalendarEventState,
    });
  };

  return (
    <Box sx={{ display: "flex" }}>
      <IconButton
        size={iconSize}
        aria-label={intl.formatMessage({ id: "event.moreOptions" })}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
      >
        <MoreVertIcon fontSize={iconSize} />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        {!isNative && (
          <MenuItem
            onClick={() => {
              closeMenu();
              void exportICS(event);
            }}
          >
            <ListItemIcon>
              <Download fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {intl.formatMessage({ id: "event.downloadDetails" })}
            </ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            closeMenu();
            editDeviceEvent();
          }}
        >
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {intl.formatMessage({ id: "event.editEvent" })}
          </ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            setDeleteDialogOpen(true);
          }}
        >
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {intl.formatMessage({ id: "event.deleteEvent" })}
          </ListItemText>
        </MenuItem>
      </Menu>

      <DeleteDeviceEventDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          closeModal();
        }}
        event={event}
      />

      {showClose && (
        <IconButton
          size={iconSize}
          aria-label={intl.formatMessage({ id: "navigation.close" })}
          onClick={closeModal}
        >
          <CloseIcon fontSize={iconSize} />
        </IconButton>
      )}
    </Box>
  );
}
