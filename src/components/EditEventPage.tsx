import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { NAddr } from "nostr-tools/nip19";
import { Alert, Box, CircularProgress, Toolbar } from "@mui/material";
import { fetchCalendarEvent, viewPrivateEvent } from "../common/nostr";
import { nostrEventToCalendar } from "../utils/parser";
import type { ICalendarEvent } from "../utils/types";
import CalendarEventEdit from "./CalendarEventEdit";
import { useIntl } from "react-intl";
import { useUser } from "../stores/user";
import { useCalendarLists } from "../stores/calendarLists";

interface ILoadState {
  event: ICalendarEvent | null;
  fetchState: "loading" | "fetched" | "error";
}

export const EditEventPage = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const [queryParams] = useSearchParams();
  const viewKey = queryParams.get("viewKey");
  const navigate = useNavigate();
  const intl = useIntl();
  const { user } = useUser();
  const { calendars, isLoaded: calendarsLoaded } = useCalendarLists();

  const [loadState, setLoadState] = React.useState<ILoadState>({
    event: null,
    fetchState: "loading",
  });
  React.useEffect(() => {
    if (!naddr) return;
    setLoadState({ event: null, fetchState: "loading" });
    fetchCalendarEvent(naddr as NAddr)
      .then(({ event, relayHint }) => {
        let parsedEvent: ICalendarEvent;
        if (viewKey) {
          const privateEvent = viewPrivateEvent(event, viewKey);
          parsedEvent = nostrEventToCalendar(privateEvent, {
            viewKey,
            isPrivateEvent: true,
            relayHint,
          });
        } else {
          parsedEvent = nostrEventToCalendar(event, { relayHint });
        }
        setLoadState({ event: parsedEvent, fetchState: "fetched" });
      })
      .catch((e) => {
        console.error(e);
        setLoadState({ event: null, fetchState: "error" });
      });
  }, [naddr, viewKey]);

  // Once both the event and calendars are loaded, resolve the calendarId
  const eventWithCalendar = React.useMemo(() => {
    if (!loadState.event || !calendarsLoaded) return null;
    const event = loadState.event;
    const eventCoordinate = `${event.kind}:${event.user}:${event.id}`;
    const owningCalendar = calendars.find((cal) =>
      cal.eventRefs.some((ref) => ref[0] === eventCoordinate),
    );
    return {
      ...event,
      calendarId: owningCalendar?.id || "",
    };
  }, [loadState.event, calendarsLoaded, calendars]);

  if (!naddr) return null;

  return (
    <>
      <Box component="main" style={{ width: "100%", minHeight: "100vh" }}>
        {(loadState.fetchState === "loading" || !calendarsLoaded) && (
          <Box
            style={{
              width: "100%",
              minHeight: "80vh",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <CircularProgress />
          </Box>
        )}
        {loadState.fetchState === "error" && (
          <Box
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <Alert severity="error">
              {intl.formatMessage({ id: "event.loadError" })}
            </Alert>
          </Box>
        )}
        {eventWithCalendar && eventWithCalendar.user !== user?.pubkey && (
          <Box
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <Alert severity="error">
              {intl.formatMessage({ id: "event.notAuthorized" })}
            </Alert>
          </Box>
        )}
        {eventWithCalendar && eventWithCalendar.user === user?.pubkey && (
          <CalendarEventEdit
            open={true}
            event={eventWithCalendar}
            onClose={() => navigate(-1)}
            onSave={() => navigate(-1)}
            mode="edit"
            display="page"
          />
        )}
      </Box>
    </>
  );
};
