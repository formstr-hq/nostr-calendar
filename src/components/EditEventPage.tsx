import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { NAddr } from "nostr-tools/nip19";
import { Alert, Box, CircularProgress } from "@mui/material";
import { fetchCalendarEvent, viewPrivateEvent } from "../common/nostr";
import { nostrEventToCalendar } from "../utils/parser";
import type { ICalendarEvent } from "../utils/types";
import CalendarEventEdit from "./CalendarEventEdit";
import { useIntl } from "react-intl";
import { useUser } from "../stores/user";
import { useCalendarLists } from "../stores/calendarLists";
import { useTypedLocationState } from "../hooks/useTypedLocationState";
import { CalendarEventState } from "../common/types";

interface ILoadState {
  event: ICalendarEvent | null;
  fetchState: "loading" | "fetched" | "error";
}

export const EditEventPage = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const defaultCalendarEvent = useTypedLocationState<CalendarEventState>();
  const [queryParams] = useSearchParams();
  const viewKey = queryParams.get("viewKey");
  const navigate = useNavigate();
  const intl = useIntl();
  const { user } = useUser();
  const { isLoaded: calendarsLoaded } = useCalendarLists();

  const [loadState, setLoadState] = React.useState<ILoadState>({
    event: null,
    fetchState: "loading",
  });
  React.useEffect(() => {
    if (defaultCalendarEvent) {
      setLoadState({ event: defaultCalendarEvent.calendarEvent, fetchState: "fetched" });
      return
    }
    if (!naddr) return;
    setLoadState({ event: null, fetchState: "loading" });
    fetchCalendarEvent(naddr as NAddr)
      .then(({ event, relayHint }) => {
        let parsedEvent: ICalendarEvent;
        if (viewKey) {
          const privateEvent = viewPrivateEvent(event, viewKey);
          if (!privateEvent) throw new Error("Failed to decrypt event");
          parsedEvent = nostrEventToCalendar(privateEvent, "", {
            viewKey,
            isPrivateEvent: true,
            relayHint,
          });
        } else {
          parsedEvent = nostrEventToCalendar(event, "", { relayHint });
        }
        setLoadState({ event: parsedEvent, fetchState: "fetched" });
      })
      .catch((e) => {
        console.error(e);
        setLoadState({ event: null, fetchState: "error" });
      });
  }, [naddr, viewKey]);

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
        {loadState.event && loadState.event.user !== user?.pubkey && (
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
        {loadState.event && loadState.event.user === user?.pubkey && (
          <CalendarEventEdit
            open={true}
            event={loadState.event}
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
