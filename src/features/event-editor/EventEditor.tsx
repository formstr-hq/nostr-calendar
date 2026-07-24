import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  useMediaQuery,
  useTheme,
  Snackbar,
  Alert,
} from "@mui/material";
import dayjs from "dayjs";
import { ICalendarEvent } from "../../utils/types";
import { useCalendarLists } from "../../stores/calendarLists";
import { useTimeBasedEvents } from "../../stores/events";
import { useUser } from "../../stores/user";
import { findCalendarForEvent } from "../../utils/calendarListTypes";
import { isBusyListRangeSupportedForEvent } from "../../utils/busyList";
import {
  DEFAULT_NOTIFICATION_OFFSETS,
  getNotificationPreference,
} from "../../utils/notificationPreferences";
import { RelayPublishDialog } from "../../components/RelayPublishDialog";
import { getBusyListDefaultOptIn } from "../../stores/busyList";
import { uniqueParticipants } from "../../utils/participants";
import { CustomRecurrenceDialog } from "../../components/CustomRecurrenceDialog";
import { isAllDayEvent } from "../../utils/dateHelper";
import { parseRecurrenceRule } from "../../utils/repeatingEventsHelper";
import { useEventSave } from "./hooks/useEventSave";
import { useRecurrenceState } from "./hooks/useRecurrenceState";
import { useEventDateTime } from "./hooks/useEventDateTime";
import { EventEditDesktopForm } from "./components/EventEditDesktopForm";
import { EventEditMobileForm } from "./components/EventEditMobileForm";
import type { EventEditFormProps } from "./components/types";

interface EventEditorProps {
  open: boolean;
  event: ICalendarEvent | null;
  initialDateTime?: number;
  onClose: () => void;
  mode?: "create" | "edit";
  display?: "modal" | "page";
}

export function EventEditor({
  open,
  event: initialEvent,
  initialDateTime,
  onClose,
  mode = "create",
  display = "modal",
}: EventEditorProps) {
  const isPrivate = initialEvent?.isPrivateEvent ?? true;
  // Whether to publish a public busy entry (kind 31926) for this event.
  // Applies to creates and to edits where the time range changes; on edits
  // we also remove the previous range so the busy list stays in sync.
  const [publishBusy, setPublishBusy] = useState<boolean>(() =>
    getBusyListDefaultOptIn(),
  );
  const { user } = useUser();
  const existingEvents = useTimeBasedEvents((state) => state.events);
  const { calendars } = useCalendarLists();
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>(
    // Duplicates are drafts (without an event id), so they cannot be found
    // through calendar event refs. Preserve their explicitly supplied owner.
    initialEvent?.calendarId ||
      (initialEvent && findCalendarForEvent(calendars, initialEvent)?.id) ||
      calendars[0]?.id ||
      "",
  );

  useEffect(() => {
    if (!selectedCalendarId && calendars.length > 0) {
      setSelectedCalendarId(calendars[0].id);
    }
  }, [calendars.length, selectedCalendarId]);

  const [eventDetails, setEventDetails] = useState<ICalendarEvent>(() => {
    if (initialEvent) {
      return {
        ...initialEvent,
        participants: uniqueParticipants(initialEvent.participants),
      };
    }

    const begin = initialDateTime || Date.now();
    const end = begin + 60 * 60 * 1000;

    return {
      begin,
      end,
      id: "",
      eventId: "",
      kind: 0,
      title: "",
      createdAt: Date.now(),
      description: "",
      calendarId: selectedCalendarId,
      location: [],
      categories: [],
      reference: [],
      geoHash: [],
      participants: [],
      rsvpResponses: [],
      website: "",
      user: "",
      isPrivateEvent: true,
      repeat: {
        rrule: null,
      },
    };
  });
  const [notificationOffsets, setNotificationOffsets] = useState<number[]>(
    DEFAULT_NOTIFICATION_OFFSETS,
  );
  const [notificationPreferencesLoaded, setNotificationPreferencesLoaded] =
    useState(!initialEvent?.id);
  const [moreOpen, setMoreOpen] = useState<boolean>(() => {
    const rrule = initialEvent?.repeat.rrule ?? null;
    const initialIsCustom =
      !!rrule && parseRecurrenceRule(rrule).frequency === null;
    return (
      initialIsCustom ||
      (initialEvent
        ? isAllDayEvent(initialEvent.begin, initialEvent.end)
        : false)
    );
  });

  const updateField = <K extends keyof ICalendarEvent>(
    key: K,
    value: ICalendarEvent[K],
  ) => {
    setEventDetails((prev) => ({ ...prev, [key]: value }));
  };

  const recurrence = useRecurrenceState(
    initialEvent?.repeat.rrule ?? null,
    eventDetails.begin,
  );

  const dateTime = useEventDateTime({
    initialEvent,
    eventDetails,
    updateField,
    onBeginDateChanged: (beginDay) => {
      if (
        recurrence.recurrenceEndMode === "until" &&
        recurrence.recurrenceUntilDate &&
        recurrence.recurrenceUntilDate.isBefore(beginDay, "day")
      ) {
        recurrence.setRecurrenceUntilDate(beginDay);
      }
    },
  });

  const supportsBusyListPublish = isBusyListRangeSupportedForEvent(
    {
      begin: eventDetails.begin,
      end: eventDetails.end,
      id: eventDetails.id,
      repeat: { rrule: recurrence.draftRecurrenceRule },
      source: initialEvent?.source,
    },
    existingEvents,
    user?.pubkey,
  );
  const handleClose = () => {
    onClose();
  };

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    let active = true;

    if (!open) {
      return () => {
        active = false;
      };
    }

    if (!initialEvent?.id) {
      setNotificationOffsets(DEFAULT_NOTIFICATION_OFFSETS);
      setNotificationPreferencesLoaded(true);
      return () => {
        active = false;
      };
    }

    setNotificationPreferencesLoaded(false);
    getNotificationPreference(initialEvent.id)
      .then((preference) => {
        if (!active) return;
        setNotificationOffsets(
          preference ? preference.offsetsMinutes : DEFAULT_NOTIFICATION_OFFSETS,
        );
        setNotificationPreferencesLoaded(true);
      })
      .catch((error) => {
        console.warn("Failed to load notification preferences", error);
        if (!active) return;
        setNotificationOffsets(DEFAULT_NOTIFICATION_OFFSETS);
        setNotificationPreferencesLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [initialEvent?.id, open]);

  const notificationsValid =
    notificationPreferencesLoaded &&
    notificationOffsets.every(
      (offset) =>
        Number.isInteger(offset) && Number.isFinite(offset) && offset >= 0,
    );

  const {
    processing,
    saveError,
    setSaveError,
    handleSave,
    handleRetryFailedRelays,
    relayStatus,
    publishingRelays,
    signedEventForRetry,
    retryingRelays,
    relayDetailsOpen,
    setRelayDetailsOpen,
    partialSaveRelayIssues,
    relayDotsLabel,
    acceptedCount,
    failedCount,
    totalCount,
    showRelayDetailsButton,
    canShowRelayRetry,
  } = useEventSave({
    mode,
    initialEvent,
    eventDetails,
    selectedCalendarId,
    isPrivate,
    draftRecurrenceRule: recurrence.draftRecurrenceRule,
    notificationOffsets,
    publishBusy,
    supportsBusyListPublish,
    calendars,
    onClose: handleClose,
  });

  const buttonDisabled = !(
    !processing &&
    eventDetails.title &&
    selectedCalendarId &&
    eventDetails.begin &&
    eventDetails.end &&
    eventDetails.begin < eventDetails.end &&
    recurrence.recurrenceValid &&
    notificationsValid
  );

  if (!open || !eventDetails) {
    return null;
  }

  const formProps: EventEditFormProps = {
    mode,
    display,
    eventDetails,
    updateField,
    isPrivate,
    selectedCalendarId,
    setSelectedCalendarId,
    calendars,
    allDay: dateTime.allDay,
    onToggleAllDay: dateTime.handleToggleAllDay,
    beginDate: dateTime.beginDate,
    beginTime: dateTime.beginTime,
    endDate: dateTime.endDate,
    endTime: dateTime.endTime,
    onBeginDateChange: dateTime.onBeginDateChange,
    onBeginTimeChange: dateTime.onBeginTimeChange,
    onEndDateChange: dateTime.onEndDateChange,
    onEndTimeChange: dateTime.onEndTimeChange,
    recurrenceSelectValue: recurrence.recurrenceSelectValue,
    isCustomRecurrence: recurrence.isCustomRecurrence,
    customRule: recurrence.customRule,
    recurrenceEndMode: recurrence.recurrenceEndMode,
    recurrenceCount: recurrence.recurrenceCount,
    recurrenceUntilDate: recurrence.recurrenceUntilDate,
    onFrequencyChange: recurrence.handleFrequencyChange,
    onEndModeChange: recurrence.handleRecurrenceEndModeChange,
    onCountChange: recurrence.handleRecurrenceCountChange,
    onUntilDateChange: recurrence.setRecurrenceUntilDate,
    onEditCustom: () => recurrence.setCustomDialogOpen(true),
    moreOpen,
    onToggleMore: () => setMoreOpen((prev) => !prev),
    publishBusy,
    supportsBusyListPublish,
    onPublishBusyChange: setPublishBusy,
    notificationOffsets,
    setNotificationOffsets,
    processing,
    buttonDisabled,
    handleClose,
    handleSave,
    relayDotsLabel,
    publishingRelays,
    relayStatus,
    showRelayDetailsButton,
    partialSaveRelayIssues,
    setRelayDetailsOpen,
    hasSignedEventForRetry: !!signedEventForRetry,
    acceptedCount,
    failedCount,
    totalCount,
  };

  const customRecurrenceDialog = (
    <CustomRecurrenceDialog
      open={recurrence.customDialogOpen}
      baseDate={dayjs(eventDetails.begin)}
      initialRule={
        recurrence.isCustomRecurrence && recurrence.customRule
          ? recurrence.customRule
          : recurrence.initialIsCustom
            ? (initialEvent?.repeat.rrule ?? null)
            : null
      }
      onClose={recurrence.closeCustomDialog}
      onApply={recurrence.applyCustomRule}
    />
  );

  const relayPublishDialog = (
    <RelayPublishDialog
      open={relayDetailsOpen}
      relays={publishingRelays}
      relayStatus={relayStatus}
      onClose={() => setRelayDetailsOpen(false)}
      onRetry={handleRetryFailedRelays}
      retrying={retryingRelays}
      showRetry={canShowRelayRetry}
    />
  );

  const errorSnackbar = (
    <Snackbar
      open={!!saveError}
      onClose={() => setSaveError(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        severity="error"
        onClose={() => setSaveError(null)}
        sx={{ maxWidth: 600, wordBreak: "break-word" }}
      >
        {saveError}
      </Alert>
    </Snackbar>
  );

  const content = isMobile ? (
    <EventEditMobileForm {...formProps} />
  ) : (
    <EventEditDesktopForm {...formProps} />
  );

  if (display === "page") {
    return (
      <>
        {content}
        {customRecurrenceDialog}
        {relayPublishDialog}
        {errorSnackbar}
      </>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogContent sx={{ p: 0 }}>{content}</DialogContent>
      </Dialog>
      {customRecurrenceDialog}
      {relayPublishDialog}
      {errorSnackbar}
    </>
  );
}

export default EventEditor;
