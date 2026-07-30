import {
  Box,
  Dialog,
  DialogContent,
  Divider,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../../utils/types";
import { editPrivateCalendarEvent } from "../../nostr/events";
import type { RSVPRecord } from "../../nostr/rsvp";
import { useCalendarLists } from "../../stores/calendarLists";
import { useTimeBasedEvents } from "../../stores/events";
import { useUser } from "../../stores/user";
import {
  buildEventRef,
  findCalendarForEvent,
  getCalendarEventCoordinate,
} from "../../utils/calendarListTypes";
import { useEventRsvps } from "../../hooks/useEventRsvps";
import { EventCalendarListManagement } from "../../components/EventCalendarListManagement";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { getEventDisplayTitle } from "./lib/getEventDisplayTitle";
import { EventActionsBar } from "./components/EventActionsBar";
import { EventMeta } from "./components/EventMeta";
import { EventBanner } from "./components/EventBanner";
import { EventChipsRow } from "./components/EventChipsRow";
import { EventHostRow } from "./components/EventHostRow";
import { EventFormsSection } from "./components/EventFormsSection";
import { EventRsvpSection } from "./components/EventRsvpSection";
import { EventNotifications } from "./components/EventNotifications";
import { RespondPanel } from "./components/RespondPanel";

export interface CalendarEventViewProps {
  event: ICalendarEvent;
  display?: "modal" | "page";
  open?: boolean;
  onClose?: () => void;
}

export function CalendarEventView({
  event,
  display = "modal",
  open = false,
  onClose,
}: CalendarEventViewProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const handleClose = () => onClose?.();

  // All actions (copy link/duplicate/edit/delete/…) live in a single "more"
  // menu overlaid on the banner's top-right corner (mockup 12) — Close gets
  // its own icon there too when applicable. No separate header row anywhere.
  // Mobile's bottom sheet never shows Close — same swipe/backdrop-to-dismiss
  // convention every other vaul sheet in this app already follows.
  const bannerActions = (
    <EventActionsBar
      event={event}
      closeModal={handleClose}
      showClose={display === "modal" && !isMobile}
      showOpenInNew={display !== "page"}
    />
  );

  if (display === "page") {
    return (
      <Box sx={{ maxWidth: 800, margin: "0 auto", py: { xs: 2, sm: 3 } }}>
        <CalendarEvent event={event} bannerActions={bannerActions} />
      </Box>
    );
  }

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={handleClose}>
        <CalendarEvent event={event} bannerActions={bannerActions} />
      </BottomSheet>
    );
  }

  return (
    <Dialog fullWidth maxWidth="md" open={open} onClose={handleClose}>
      <DialogContent sx={{ p: 0 }}>
        <CalendarEvent event={event} bannerActions={bannerActions} />
      </DialogContent>
    </Dialog>
  );
}

export function CalendarEvent({
  event,
  bannerActions,
}: CalendarEventViewProps & { bannerActions?: React.ReactNode }) {
  const intl = useIntl();
  const title = getEventDisplayTitle(event, intl);
  const { calendars, moveEventToCalendar } = useCalendarLists();
  const { updateEvent } = useTimeBasedEvents();
  const { user } = useUser();
  const isDeviceEvent = event.source === "device";
  const eventCoordinate = isDeviceEvent
    ? ""
    : getCalendarEventCoordinate(event);

  const calendar = findCalendarForEvent(calendars, event);
  const isEditable = !!user && event.user === user.pubkey;

  // Subscribe once at this level so both the participants section and the
  // RSVP bar render off the same RSVP record set without duplicating relay
  // subscriptions.
  const {
    byPubkey: rsvpByPubkey,
    allParticipants: rsvpAllParticipants,
    myRsvp,
    isSubmitting: isRsvpSubmitting,
    submit: submitRsvp,
  } = useEventRsvps(event);
  const standaloneForms = calendar ? (event.forms ?? []) : [];

  const handleCalendarUpdate = async (nextCalendarId: string) => {
    if (!calendar) {
      throw new Error("Event is not in any calendar");
    }

    const currentEventRef = calendar.eventRefs.find(
      (ref) => ref[0] === eventCoordinate,
    );

    const eventRef =
      currentEventRef ||
      (event.viewKey
        ? buildEventRef({
            kind: event.kind,
            authorPubkey: event.user,
            eventDTag: event.id,
            relayUrl: event.relayHint ?? "",
            viewKey: event.viewKey,
          })
        : undefined);

    if (!eventRef) {
      throw new Error("Event reference not found");
    }

    await moveEventToCalendar(nextCalendarId, eventCoordinate, eventRef);
    updateEvent({
      ...event,
    });
  };

  const handleApplyRSVPSuggestion = async (record: RSVPRecord) => {
    if (
      !calendar ||
      !event.isPrivateEvent ||
      (record.suggestedStart === undefined && record.suggestedEnd === undefined)
    ) {
      return;
    }

    const eventStartSecs = Math.floor(event.begin / 1000);
    const eventDurationSecs = Math.floor((event.end - event.begin) / 1000);
    const nextStartSecs = record.suggestedStart ?? eventStartSecs;
    const updated = {
      ...event,
      begin: nextStartSecs * 1000,
      end: (record.suggestedEnd ?? nextStartSecs + eventDurationSecs) * 1000,
    };

    await editPrivateCalendarEvent(updated, calendar.id);
    updateEvent(updated);
  };

  return (
    <Box sx={{ overflowY: "auto" }}>
      <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
        <EventBanner event={event} actions={bannerActions} />
        <EventChipsRow event={event} calendar={calendar} />

        <Typography
          component="h1"
          variant="h5"
          sx={{ overflowWrap: "anywhere" }}
        >
          {title}
        </Typography>

        <EventMeta event={event} />

        {!isDeviceEvent && <EventHostRow hostPubkey={event.user} />}
        <Divider />

        {!calendar && !isDeviceEvent && (
          <>
            <RespondPanel event={event} />
            <Divider />
          </>
        )}

        {standaloneForms.length > 0 && (
          <>
            <EventFormsSection event={event} forms={standaloneForms} />
            <Divider />
          </>
        )}

        {!isDeviceEvent && (
          <EventRsvpSection
            event={event}
            isAuthor={event.user === user?.pubkey}
            showRsvpBar={!!calendar}
            byPubkey={rsvpByPubkey}
            allParticipants={rsvpAllParticipants}
            myRsvp={myRsvp}
            isSubmitting={isRsvpSubmitting}
            onSubmit={submitRsvp}
            canApplySuggestions={
              isEditable && !!event.isPrivateEvent && !!calendar
            }
            onApplySuggestion={handleApplyRSVPSuggestion}
          />
        )}

        {calendar ? (
          <>
            <Divider />
            <EventCalendarListManagement
              calendarId={calendar.id}
              onCalendarUpdate={handleCalendarUpdate}
            />
          </>
        ) : isDeviceEvent ? (
          <>
            <Divider />
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({ id: "event.deviceReadOnly" })}
            </Typography>
          </>
        ) : null}

        {!isDeviceEvent && <EventNotifications event={event} />}
      </Stack>
    </Box>
  );
}
