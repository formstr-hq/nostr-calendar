import { NAddr } from "nostr-tools/nip19";
import React from "react";
import { useParams, useSearchParams } from "react-router";
import type { ICalendarEvent } from "../utils/types";
import { fetchCalendarEvent, viewPrivateEvent } from "../common/nostr";
import { nostrEventToCalendar } from "../utils/parser";
import { Header } from "./Header";
import { enUS } from "date-fns/locale/en-US";
import {
  Alert,
  Box,
  CircularProgress,
  Toolbar,
  Typography,
} from "@mui/material";
import { TimeRenderer } from "./TimeRenderer";
import { Participant } from "./Participant";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useIntl } from "react-intl";

interface ILoadState {
  event: ICalendarEvent | null;
  fetchState: "loading" | "fetched" | "error";
  error: typeof Error | null;
}

const getInitialLoadState = (): ILoadState => ({
  event: null,
  fetchState: "loading",
  error: null,
});

const EventRenderer = ({
  calendarEvent,
}: {
  calendarEvent: ICalendarEvent;
}) => {
  return (
    <Box style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <Box
        style={{ maxWidth: "1000px", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ display: "flex", justifyContent: "space-between" }}>
          <Box style={{ display: "flex", flexDirection: "column" }}>
            <Typography variant="h5">{calendarEvent.title || ""}</Typography>
            <TimeRenderer
              begin={calendarEvent.begin}
              end={calendarEvent.end}
              locale={enUS}
              repeat={calendarEvent.repeat}
            />
            <Typography variant="subtitle1">
              {calendarEvent?.participants.map((pubKey) => (
                <Participant pubKey={pubKey} key={pubKey} />
              ))}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle1">
              <img src={calendarEvent.image} />
            </Typography>
          </Box>
        </Box>
        <Box>
          <Typography variant="body2" component="div">
            <Markdown remarkPlugins={[remarkGfm]}>
              {calendarEvent.description}
            </Markdown>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

const ErrorRenderer = () => {
  const intl = useIntl();
  return (
    <Box
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Alert severity="error">
        {intl.formatMessage({ id: "event.loadError" })}
      </Alert>
    </Box>
  );
};

const LoaderRenderer = () => {
  return (
    <Box
      style={{
        width: "100%",
        minHeight: `max(100vh, 100%)`,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <CircularProgress />
    </Box>
  );
};

export const ViewEventPage = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const [queryParams] = useSearchParams();
  const viewKey = queryParams.get("viewKey");
  const [calendarEventLoadState, updateCalendarEventLoadState] =
    React.useState<ILoadState>(getInitialLoadState);

  React.useEffect(() => {
    updateCalendarEventLoadState(getInitialLoadState);
    fetchCalendarEvent(naddr as NAddr)
      .then((event) => {
        let parsedEvent: ICalendarEvent;
        if (viewKey) {
          const privateEvent = viewPrivateEvent(event, viewKey);
          parsedEvent = nostrEventToCalendar(privateEvent, {
            viewKey,
            isPrivateEvent: true,
          });
        } else {
          parsedEvent = nostrEventToCalendar(event);
        }
        updateCalendarEventLoadState((state) => ({
          ...state,
          event: parsedEvent,
          fetchState: "fetched",
        }));
      })
      .catch((e) => {
        updateCalendarEventLoadState((state) => ({
          ...state,
          error: Error,
          fetchState: "fetched",
        }));
        console.error(e);
      });
  }, [naddr, viewKey, updateCalendarEventLoadState]);
  if (!naddr) {
    return null;
  }
  return (
    <>
      <Header />
      <Box
        component={"main"}
        style={{ width: "100%", minHeight: `max(100vh, 100%)` }}
      >
        <Toolbar />
        {calendarEventLoadState.fetchState === "loading" ? (
          <LoaderRenderer />
        ) : null}
        {calendarEventLoadState.error !== null ? <ErrorRenderer /> : null}
        {calendarEventLoadState.event !== null ? (
          <EventRenderer calendarEvent={calendarEventLoadState.event} />
        ) : null}
      </Box>
    </>
  );
};
