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
import ContentCopy from "@mui/icons-material/ContentCopy";
import OpenInNew from "@mui/icons-material/OpenInNew";
import Download from "@mui/icons-material/Download";
import Edit from "@mui/icons-material/Edit";
import FileCopy from "@mui/icons-material/FileCopy";
import Delete from "@mui/icons-material/Delete";
import { ICalendarEvent } from "../../../utils/types";
import { CalendarEventState } from "../../../common/types";
import { exportICS, isMobile } from "../../../common/utils";
import { encodeNAddr } from "../../../nostr/events";
import {
  getDuplicateEventPage,
  getEditEventPage,
  getEventPage,
} from "../../../utils/routingHelper";
import { getAppBaseUrl, isNative } from "../../../utils/platform";
import { useUser } from "../../../stores/user";
import { getEventOccurrenceRange } from "../../../utils/eventOccurrence";
import { DeleteEventDialog } from "./DeleteEventDialog";

/**
 * Overlaid on the event banner's top-right corner (mockup 12's edit/kebab
 * treatment, now used everywhere — modal, mobile sheet, and page). A single
 * "more" menu holds every secondary action; Close stays a separate icon
 * since it's a primary, always-reachable control, not an "option".
 */
export function EventActionsBar({
  event,
  closeModal,
  showClose = true,
  showOpenInNew = true,
}: {
  event: ICalendarEvent;
  closeModal: () => void;
  showClose?: boolean;
  showOpenInNew?: boolean;
}) {
  const intl = useIntl();
  const { user } = useUser();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const iconSize = isMobile ? "small" : "medium";
  const closeMenu = () => setMenuAnchor(null);

  // Device events have no Nostr coordinate; only ICS export applies.
  if (event.source === "device") {
    return (
      <Box sx={{ display: "flex" }}>
        {!isNative && (
          <>
            <IconButton
              size={iconSize}
              aria-label={intl.formatMessage({ id: "event.moreOptions" })}
              onClick={(e) => setMenuAnchor(e.currentTarget)}
            >
              <MoreVertIcon fontSize={iconSize} />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
              <MenuItem
                onClick={() => {
                  closeMenu();
                  exportICS(event);
                }}
              >
                <ListItemIcon>
                  <Download fontSize="small" />
                </ListItemIcon>
                <ListItemText>
                  {intl.formatMessage({ id: "event.downloadDetails" })}
                </ListItemText>
              </MenuItem>
            </Menu>
          </>
        )}
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

  const occurrenceRange = getEventOccurrenceRange(event);
  const linkToEvent = getEventPage(
    encodeNAddr(
      {
        pubkey: event.user,
        identifier: event.id,
        kind: event.kind,
      },
      event.relayHint ? [event.relayHint] : undefined,
    ),
    event.viewKey,
    occurrenceRange,
  );
  const eventUrl = `${getAppBaseUrl()}${linkToEvent}`;
  const copyLinkToEvent = () => {
    navigator.clipboard.writeText(eventUrl);
  };
  const isEditable = event.user === user?.pubkey;

  const editEvent = () => {
    const editLink = getEditEventPage(
      encodeNAddr(
        {
          pubkey: event.user,
          identifier: event.id,
          kind: event.kind,
        },
        event.relayHint ? [event.relayHint] : undefined,
      ),
      event.viewKey,
    );
    closeModal();
    navigate(editLink, {
      state: {
        calendarEvent: event,
      } satisfies CalendarEventState,
    });
  };

  const duplicateEvent = () => {
    const duplicateLink = getDuplicateEventPage(
      encodeNAddr(
        {
          pubkey: event.user,
          identifier: event.id,
          kind: event.kind,
        },
        event.relayHint ? [event.relayHint] : undefined,
      ),
      event.viewKey,
    );
    closeModal();
    navigate(duplicateLink, {
      state: {
        calendarEvent: event,
      } satisfies CalendarEventState,
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
        <MenuItem
          onClick={() => {
            closeMenu();
            copyLinkToEvent();
          }}
        >
          <ListItemIcon>
            <ContentCopy fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {intl.formatMessage({ id: "event.copyLink" })}
          </ListItemText>
        </MenuItem>

        {showOpenInNew && !isMobile && (
          <MenuItem component="a" href={linkToEvent} onClick={closeMenu}>
            <ListItemIcon>
              <OpenInNew fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {intl.formatMessage({ id: "event.openNewTab" })}
            </ListItemText>
          </MenuItem>
        )}

        {!isNative && (
          <MenuItem
            onClick={() => {
              closeMenu();
              exportICS(event);
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

        {isEditable && (
          <MenuItem
            onClick={() => {
              closeMenu();
              duplicateEvent();
            }}
          >
            <ListItemIcon>
              <FileCopy fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {intl.formatMessage({ id: "event.duplicateEvent" })}
            </ListItemText>
          </MenuItem>
        )}

        {isEditable && (
          <MenuItem
            onClick={() => {
              closeMenu();
              editEvent();
            }}
          >
            <ListItemIcon>
              <Edit fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {intl.formatMessage({ id: "event.editEvent" })}
            </ListItemText>
          </MenuItem>
        )}

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

      <DeleteEventDialog
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
