/**
 * Events Without Access Page
 *
 * Lists private events the client knows about (they're referenced in a
 * calendar list) but cannot decrypt — usually because the author rotated the
 * view key and hasn't re-shared it with this user yet.
 *
 * For each event the user can either ask the author for access (the author is
 * shown via their profile) or remove the dangling reference from their
 * calendar.
 */

import { useEffect } from "react";
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
import { FormattedMessage, useIntl } from "react-intl";
import { useInaccessibleEvents } from "../stores/inaccessibleEvents";
import { useCalendarLists } from "../stores/calendarLists";
import { useTimeBasedEvents } from "../stores/events";
import { Participant } from "./Participant";

export function EventsWithoutAccessPage() {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const { byCoordinate, remove } = useInaccessibleEvents();
  const { removeEventFromCalendar } = useCalendarLists();
  const { removeEvent } = useTimeBasedEvents();

  // Surface the freshest snapshot when re-entering the page.
  useEffect(() => {
    void useCalendarLists.getState().fetchCalendars();
  }, []);

  const events = Object.values(byCoordinate).sort(
    (a, b) => b.lastSeenAt - a.lastSeenAt,
  );

  const handleRemove = async (coordinate: string) => {
    const entry = byCoordinate[coordinate];
    if (!entry) return;
    // Drop the dangling reference from the calendar list (republishes it),
    // then clear local traces of the event.
    await removeEventFromCalendar(entry.calendarId, [coordinate]);
    removeEvent(entry.dTag);
    remove(coordinate);
  };

  return (
    <Box p={2} maxWidth={isMobile ? "100%" : 600} mx="auto">
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={600}>
          {intl.formatMessage({ id: "eventsWithoutAccess.title" })}
        </Typography>
        {events.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            ({events.length})
          </Typography>
        )}
      </Box>

      {events.length === 0 && (
        <Box py={4} textAlign="center">
          <Typography variant="body1" color="text.secondary">
            {intl.formatMessage({ id: "eventsWithoutAccess.empty" })}
          </Typography>
        </Box>
      )}

      {events.map((entry) => (
        <Paper
          key={entry.coordinate}
          sx={{
            mb: 2,
            p: 2,
            backgroundColor: "#e0e0e0",
            border: "2px dashed #999",
            borderRadius: 2,
          }}
        >
          <Box display="flex" alignItems="center" flexWrap="wrap" gap={0.5}>
            <FormattedMessage
              id="eventsWithoutAccess.invitedBy"
              values={{
                dTag: (
                  <Typography component="span" fontWeight={600}>
                    {entry.dTag}
                  </Typography>
                ),
                participant: (
                  <Participant pubKey={entry.authorPubkey} isAuthor={false} />
                ),
              }}
            />
          </Box>

          <Box display="flex" justifyContent="flex-end" mt={2}>
            <Button
              size="small"
              color="inherit"
              onClick={() => handleRemove(entry.coordinate)}
            >
              {intl.formatMessage({ id: "eventsWithoutAccess.remove" })}
            </Button>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
