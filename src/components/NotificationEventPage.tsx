import { useNavigate, useParams } from "react-router";
import { useTimeBasedEvents } from "../stores/events";
import { CalendarEvent } from "./CalendarEvent";
import { Box, IconButton, Toolbar, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import { Header } from "./Header";
import { useIntl } from "react-intl";

export const NotificationEventPage = () => {
  const intl = useIntl();
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const events = useTimeBasedEvents((s) => s.events);
  const event = events.find((e) => e.id === eventId);

  return (
    <>
      <Header />
      <Toolbar />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <IconButton onClick={() => navigate(-1)}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h5">
            {event?.title ?? intl.formatMessage({ id: "event.event" })}
          </Typography>
        </Box>
        {event ? (
          <CalendarEvent event={event} />
        ) : (
          <Typography>
            {intl.formatMessage({ id: "event.eventNotFound" })}
          </Typography>
        )}
      </Box>
    </>
  );
};
