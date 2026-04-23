/**
 * Invitation Panel
 *
 * Displays pending gift-wrap invitations as a list.
 * - Desktop: shown as a page (navigated to via /notifications route)
 * - Mobile: shown full-page with back navigation
 *
 * Each invitation card shows the event details with grey background
 * and dashed border styling. Users can accept (add to calendar) or dismiss.
 */

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  IconButton,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router";
import { useInvitations } from "../stores/invitations";
import { AddToCalendarDialog } from "./AddToCalendarDialog";
import { TimeRenderer } from "./TimeRenderer";
import { Participant } from "./Participant";
import type { ICalendarEvent } from "../utils/types";
import { FormattedMessage, useIntl } from "react-intl";
import { useCalendarLists } from "../stores/calendarLists";

export function InvitationPanel() {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const { invitations, acceptInvitation, dismissInvitation, fetchInvitations } =
    useInvitations();
  const { isLoaded: calendarsLoaded, fetchCalendars } = useCalendarLists();

  useEffect(() => {
    fetchCalendars();
  }, []);

  useEffect(() => {
    if (calendarsLoaded) {
      fetchInvitations();
    }
  }, [calendarsLoaded, fetchInvitations]);
  const [addDialogEvent, setAddDialogEvent] = useState<ICalendarEvent | null>(
    null,
  );
  const [addDialogGiftWrapId, setAddDialogGiftWrapId] = useState<string>("");

  const pendingInvitations = invitations
    .filter((inv) => inv.status === "pending")
    .sort((a, b) => b.receivedAt - a.receivedAt);

  const handleAccept = (giftWrapId: string, event?: ICalendarEvent) => {
    if (event) {
      setAddDialogEvent(event);
      setAddDialogGiftWrapId(giftWrapId);
    }
  };

  const handleAcceptConfirm = async (calendarId: string) => {
    await acceptInvitation(addDialogGiftWrapId, calendarId);
    setAddDialogEvent(null);
  };

  return (
    <Box p={2} maxWidth={isMobile ? "100%" : 600} mx="auto">
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={600}>
          {intl.formatMessage({ id: "invitation.invitations" })}
        </Typography>
        {pendingInvitations.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            ({pendingInvitations.length})
          </Typography>
        )}
      </Box>

      {pendingInvitations.length === 0 && (
        <Box py={4} textAlign="center">
          <Typography variant="body1" color="text.secondary">
            {intl.formatMessage({ id: "invitation.noPendingInvitations" })}
          </Typography>
        </Box>
      )}

      {pendingInvitations.map((invitation) => (
        <Paper
          key={invitation.giftWrapId}
          sx={{
            mb: 2,
            p: 2,
            backgroundColor: "#e0e0e0",
            border: "2px dashed #999",
            borderRadius: 2,
          }}
        >
          {invitation.event ? (
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {invitation.event.title}
              </Typography>
              <TimeRenderer
                begin={invitation.event.begin}
                end={invitation.event.end}
                repeat={invitation.event.repeat}
              />
              {invitation.event.description && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  mt={1}
                  noWrap
                >
                  {invitation.event.description}
                </Typography>
              )}
              <Box
                display="flex"
                alignItems="center"
                gap={0.5}
                mt={1}
                flexWrap="wrap"
              >
                <FormattedMessage
                  id="invitation.invitedBy"
                  values={{
                    participant: (
                      <Participant
                        pubKey={invitation.event.user}
                        isAuthor={false}
                      />
                    ),
                  }}
                />
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "invitation.loadingEventDetails" })}
            </Typography>
          )}

          <Box display="flex" gap={1} mt={2} justifyContent="flex-end">
            <Button
              size="small"
              color="inherit"
              onClick={() => dismissInvitation(invitation.giftWrapId)}
            >
              {intl.formatMessage({ id: "invitation.dismiss" })}
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={!invitation.event?.user}
              onClick={() =>
                handleAccept(invitation.giftWrapId, invitation.event)
              }
            >
              {intl.formatMessage({ id: "addToCalendar.addToCalendar" })}
            </Button>
          </Box>
        </Paper>
      ))}

      {/* Add to Calendar dialog */}
      {addDialogEvent && (
        <AddToCalendarDialog
          open={!!addDialogEvent}
          onClose={() => setAddDialogEvent(null)}
          event={addDialogEvent}
          onAccept={handleAcceptConfirm}
        />
      )}
    </Box>
  );
}
