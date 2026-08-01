import { useNavigate } from "react-router";
import { Alert, Box } from "@mui/material";
import { useIntl } from "react-intl";
import CalendarEventEdit from "./CalendarEventEdit";
import { useTypedLocationState } from "../hooks/useTypedLocationState";
import { CalendarEventState } from "../common/types";

/**
 * Sibling of `EditEventPage.tsx` for device (OS-calendar) events. Device
 * events have no Nostr identity — the pubkey-authorization gate in
 * `EditEventPage.tsx` does not apply and is deliberately left untouched;
 * this is a separate entry point, not a branch inside it. The event can only
 * come from navigation state (there's no naddr to fetch a device event by),
 * so a direct link/refresh with no state shows a load error instead of
 * crashing.
 */
export const EditDeviceEventPage = () => {
  const navigate = useNavigate();
  const intl = useIntl();
  const locationState = useTypedLocationState<CalendarEventState>();
  const event = locationState?.calendarEvent;

  if (!event || event.source !== "device") {
    return (
      <Box
        component="main"
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
    );
  }

  return (
    <Box component="main" style={{ width: "100%", minHeight: "100vh" }}>
      <CalendarEventEdit
        open={true}
        event={event}
        onClose={() => navigate(-1)}
        mode="edit"
        display="page"
      />
    </Box>
  );
};
