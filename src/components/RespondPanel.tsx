import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { FormattedMessage, useIntl } from "react-intl";
import { generateSecretKey } from "nostr-tools";
import { bytesToHex } from "nostr-tools/utils";
import { useAcceptWithFormsFlow } from "../hooks/useAcceptWithFormsFlow";
import { signerManager } from "../common/signer";
import { buildEventRef } from "../utils/calendarListTypes";
import type { ICalendarEvent } from "../utils/types";
import { useCalendarLists } from "../stores/calendarLists";
import { useInvitations } from "../stores/invitations";
import { useTimeBasedEvents } from "../stores/events";
import { useUser } from "../stores/user";
import {
  useBusyList,
  getBusyListDefaultOptIn,
  setBusyListDefaultOptIn,
} from "../stores/busyList";
import { isBusyListRangeSupportedForEvent } from "../utils/busyList";
import { CalendarListSelect } from "./CalendarListSelect";
import { FormAttachmentRow } from "./FormAttachmentRow";
import { FormFillerDialog } from "./FormFillerDialog";
import { Participant } from "./Participant";

export function RespondPanel({ event }: { event: ICalendarEvent }) {
  const intl = useIntl();
  const { user, updateLoginModal } = useUser();
  const {
    calendars,
    addEventToCalendar,
    isLoaded: calendarsLoaded,
    fetchCalendars,
  } = useCalendarLists();
  const { invitations, acceptInvitation } = useInvitations();
  const { updateEvent, events } = useTimeBasedEvents();
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    calendars[0]?.id || "",
  );
  const [accepting, setAccepting] = useState(false);
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState<boolean>(() =>
    getBusyListDefaultOptIn(),
  );
  const forms = event.forms ?? [];
  const supportsBusyListPublish = isBusyListRangeSupportedForEvent(
    event,
    events,
    user?.pubkey,
  );

  useEffect(() => {
    if (!selectedCalendarId && calendars[0]?.id) {
      setSelectedCalendarId(calendars[0].id);
    }
  }, [calendars, selectedCalendarId]);

  useEffect(() => {
    if (user && !calendarsLoaded) {
      fetchCalendars();
    }
  }, [user, calendarsLoaded, fetchCalendars]);

  const finalizeAccept = useCallback(
    async ({
      calendarId,
      giftWrapId,
    }: {
      calendarId: string;
      giftWrapId?: string;
      context: undefined;
    }) => {
      if (giftWrapId) {
        await acceptInvitation(giftWrapId, calendarId);
      } else {
        const eventRef = buildEventRef({
          kind: event.kind,
          authorPubkey: event.user,
          eventDTag: event.id,
          relayUrl: event.relayHint ?? "",
          viewKey: event.viewKey || "",
        });
        await addEventToCalendar(calendarId, eventRef);
        updateEvent({
          ...event,
          isInvitation: false,
        });
      }
      setBusyListDefaultOptIn(publishBusy);
      if (publishBusy && supportsBusyListPublish) {
        void useBusyList
          .getState()
          .addBusyRange({ start: event.begin, end: event.end });
      }
    },
    [
      acceptInvitation,
      addEventToCalendar,
      event,
      updateEvent,
      publishBusy,
      supportsBusyListPublish,
    ],
  );

  const {
    pendingAccept,
    pendingForm,
    formCount,
    startAccept,
    advanceAccept,
    cancelAccept,
  } = useAcceptWithFormsFlow<undefined>({
    onFinalize: finalizeAccept,
  });

  const handleAddToCalendar = async () => {
    if (!selectedCalendarId) return;
    setAccepting(true);
    try {
      const matchingInvitation = invitations.find(
        (inv) => inv.eventId === event.id && inv.pubkey === event.user,
      );
      await startAccept({
        calendarId: selectedCalendarId,
        giftWrapId: matchingInvitation?.giftWrapId,
        attachments: forms,
        context: undefined,
      });
    } catch {
      setErrorOpen(true);
    } finally {
      setAccepting(false);
    }
  };

  const handlePendingAcceptAdvance = async () => {
    setAccepting(true);
    try {
      await advanceAccept();
    } catch {
      setErrorOpen(true);
    } finally {
      setAccepting(false);
    }
  };

  const handleContinueAsGuest = async () => {
    setCreatingGuest(true);
    try {
      await signerManager.createAccount(bytesToHex(generateSecretKey()), {});
    } catch {
      setErrorOpen(true);
    } finally {
      setCreatingGuest(false);
    }
  };

  if (!user) {
    return (
      <>
        <Stack
          spacing={1.5}
          sx={{ backgroundColor: "action.hover", borderRadius: 1, p: 1.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "invitation.loginToAdd" })}
          </Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              variant="contained"
              size="small"
              onClick={() => updateLoginModal(true)}
            >
              {intl.formatMessage({ id: "message.modeSelection_loginButton" })}
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={creatingGuest}
              onClick={handleContinueAsGuest}
              startIcon={
                creatingGuest ? (
                  <CircularProgress size={14} color="inherit" />
                ) : undefined
              }
            >
              {intl.formatMessage({ id: "message.modeSelection_guestButton" })}
            </Button>
          </Box>
        </Stack>
        <Snackbar
          open={errorOpen}
          autoHideDuration={4000}
          onClose={() => setErrorOpen(false)}
        >
          <Alert severity="error" onClose={() => setErrorOpen(false)}>
            {intl.formatMessage({ id: "event.calendarMoveError" })}
          </Alert>
        </Snackbar>
      </>
    );
  }

  if (calendars.length === 0) {
    return (
      <Stack
        spacing={1.5}
        sx={{ backgroundColor: "action.hover", borderRadius: 1, p: 1.5 }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "startup.fetchingEvents" })}
          </Typography>
        </Box>
      </Stack>
    );
  }

  return (
    <>
      <Stack
        spacing={1.5}
        sx={{
          backgroundColor: "action.hover",
          borderRadius: 1,
          p: 1.5,
        }}
      >
        <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
          <Typography
            variant="body1"
            color="text.primary"
            sx={{
              display: "flex",
              gap: "4px",
              alignItems: "center",
            }}
            component="span"
          >
            <FormattedMessage
              id={
                event.isInvitation
                  ? "invitation.invitedBy"
                  : "invitation.createdBy"
              }
              values={{
                participant: (
                  <Participant pubKey={event.user} isAuthor={false} />
                ),
              }}
            />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "event.notInCalendar" })}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Box sx={{ flexGrow: 1, maxWidth: 400 }}>
            <CalendarListSelect
              value={selectedCalendarId}
              onChange={setSelectedCalendarId}
              size="small"
            />
          </Box>
          <Button
            variant="contained"
            size="small"
            disabled={!selectedCalendarId || accepting}
            onClick={() => void handleAddToCalendar()}
            startIcon={
              accepting ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
          >
            {intl.formatMessage({ id: "invitation.acceptInvitation" })}
          </Button>
        </Box>
        {supportsBusyListPublish && (
          <FormControlLabel
            control={
              <Checkbox
                checked={publishBusy}
                onChange={(e) => setPublishBusy(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                {intl.formatMessage({ id: "busyList.publishToggle" })}
              </Typography>
            }
          />
        )}
        {forms.length > 0 ? (
          <>
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2">
                {intl.formatMessage({ id: "event.forms" })}
              </Typography>
              {forms.map((form, index) => (
                <FormAttachmentRow
                  key={`${form.naddr}-${index}`}
                  attachment={form}
                  eventAuthor={event.user}
                />
              ))}
            </Stack>
          </>
        ) : null}
      </Stack>

      {pendingAccept && pendingForm && (
        <FormFillerDialog
          open
          attachment={pendingForm}
          index={pendingAccept.formIndex + 1}
          total={formCount}
          onClose={cancelAccept}
          onSubmitted={() => {
            void handlePendingAcceptAdvance();
          }}
        />
      )}

      <Snackbar
        open={errorOpen}
        autoHideDuration={4000}
        onClose={() => setErrorOpen(false)}
      >
        <Alert severity="error" onClose={() => setErrorOpen(false)}>
          {intl.formatMessage({ id: "event.calendarMoveError" })}
        </Alert>
      </Snackbar>
    </>
  );
}
