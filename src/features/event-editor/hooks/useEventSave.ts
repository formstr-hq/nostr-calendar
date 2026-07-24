import { useState } from "react";
import { useIntl } from "react-intl";
import type { Event } from "nostr-tools";
import type { ICalendarEvent } from "../../../utils/types";
import type { ICalendarList } from "../../../utils/calendarListTypes";
import {
  editPrivateCalendarEvent,
  publishPrivateCalendarEvent,
  publishPublicCalendarEvent,
} from "../../../nostr/events";
import { publishSignedEvent } from "../../../nostr/core";
import { getRelays } from "../../../common/relayConfig";
import { EventKinds } from "../../../nostr/kinds";
import { useTimeBasedEvents } from "../../../stores/events";
import { useCalendarLists } from "../../../stores/calendarLists";
import { parseEventRef } from "../../../utils/calendarListTypes";
import { uniqueParticipants } from "../../../utils/participants";
import { isAllDayEvent } from "../../../utils/dateHelper";
import {
  areNotificationOffsetsEqual,
  clearNotificationPreference,
  DEFAULT_NOTIFICATION_OFFSETS,
  normalizeNotificationOffsets,
  setNotificationPreference,
  shouldScheduleNotifications,
} from "../../../utils/notificationPreferences";
import {
  cancelEventNotifications,
  scheduleEventNotifications,
} from "../../../utils/notifications";
import { useNotifications } from "../../../stores/notifications";
import { useRelayPublishStatus } from "./useRelayPublishStatus";
import { getRelayPublishCounts } from "../../../utils/relayPublishStatus";
import { useBusyList, setBusyListDefaultOptIn } from "../../../stores/busyList";

interface UseEventSaveOptions {
  mode: "create" | "edit";
  initialEvent: ICalendarEvent | null;
  eventDetails: ICalendarEvent;
  selectedCalendarId: string;
  isPrivate: boolean;
  draftRecurrenceRule: string | null;
  notificationOffsets: number[];
  publishBusy: boolean;
  supportsBusyListPublish: boolean;
  calendars: ICalendarList[];
  onClose: () => void;
}

export function useEventSave({
  mode,
  initialEvent,
  eventDetails,
  selectedCalendarId,
  isPrivate,
  draftRecurrenceRule,
  notificationOffsets,
  publishBusy,
  supportsBusyListPublish,
  calendars,
  onClose,
}: UseEventSaveOptions) {
  const intl = useIntl();
  const [processing, setProcessing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    relayStatus,
    publishingRelays,
    initRelays,
    onRelayComplete,
    getFailedRelays,
    setRelaysPending,
    hasRelayErrors,
    reset: resetRelayStatus,
  } = useRelayPublishStatus();
  const [relayDetailsOpen, setRelayDetailsOpen] = useState(false);
  const [signedEventForRetry, setSignedEventForRetry] = useState<Event | null>(
    null,
  );
  const [retryingRelays, setRetryingRelays] = useState(false);

  const handleSave = async () => {
    const relaysToPublish = getRelays();
    initRelays(relaysToPublish);
    setSignedEventForRetry(null);
    setRelayDetailsOpen(false);

    setProcessing(true);
    try {
      const normalizedNotificationOffsets =
        normalizeNotificationOffsets(notificationOffsets);
      const eventToSave = {
        ...eventDetails,
        calendarId: selectedCalendarId,
        isPrivateEvent: isPrivate,
        participants: uniqueParticipants(eventDetails.participants),
        repeat: { rrule: draftRecurrenceRule },
        allDay: isAllDayEvent(eventDetails.begin, eventDetails.end),
      };
      let savedEvent: ICalendarEvent = eventToSave;

      if (isPrivate) {
        if (mode === "edit") {
          const updates = await editPrivateCalendarEvent(
            eventToSave,
            selectedCalendarId,
            initialEvent?.participants ?? [],
            undefined,
            onRelayComplete,
          );
          setSignedEventForRetry(updates.signedEvent);

          useTimeBasedEvents.getState().updateEvent(updates.event);
          savedEvent = updates.event;
        } else {
          const { eventRef, authorPubkey, calendarEvent } =
            await publishPrivateCalendarEvent(eventToSave, {
              onRelayComplete,
            });

          setSignedEventForRetry(calendarEvent);
          await useCalendarLists
            .getState()
            .addEventToCalendar(selectedCalendarId, eventRef);
          const { eventDTag, relayUrl, viewKey, kind } =
            parseEventRef(eventRef);
          savedEvent = {
            ...eventToSave,
            id: eventDTag,
            kind,
            viewKey,
            relayHint: relayUrl,
            user: authorPubkey,
          };
          useTimeBasedEvents.getState().addEvent(savedEvent);
        }
      } else {
        const {
          id: savedId,
          pubKey,
          signedEvent,
        } = await publishPublicCalendarEvent(
          eventToSave,
          undefined,
          onRelayComplete,
        );
        setSignedEventForRetry(signedEvent);
        savedEvent = {
          ...eventToSave,
          id: savedId,
          kind: EventKinds.PublicCalendarEvent,
          user: pubKey,
          isPrivateEvent: false,
        };
        useTimeBasedEvents.getState().updateEvent(savedEvent);
      }

      if (
        areNotificationOffsetsEqual(
          normalizedNotificationOffsets,
          DEFAULT_NOTIFICATION_OFFSETS,
        )
      ) {
        await clearNotificationPreference(savedEvent.id);
      } else {
        await setNotificationPreference(
          savedEvent.id,
          normalizedNotificationOffsets,
        );
      }

      // Preferences are persisted after the event store update. Reconcile once
      // more here so iOS uses the newly saved offsets for creates and edits.
      await cancelEventNotifications(savedEvent.id);
      useNotifications.getState().removeNotifications(savedEvent.id);

      const calendarPreference = calendars.find(
        (calendar) => calendar.id === selectedCalendarId,
      )?.notificationPreference;

      if (
        shouldScheduleNotifications(
          savedEvent.notificationPreference,
          calendarPreference,
        )
      ) {
        const notifications = await scheduleEventNotifications({
          ...savedEvent,
          calendarId: selectedCalendarId,
        });
        useNotifications
          .getState()
          .setNotifications(savedEvent.id, notifications);
      }

      // Public busy list maintenance:
      //  - create + opted-in        -> publish a busy range for the new event.
      //  - edit + range changed     -> always remove the previous range
      //                                 (idempotent) and, if opted-in, publish
      //                                 the new one.
      //  - edit + range unchanged   -> do nothing.
      // Best-effort, don't block save UX on relay roundtrip.
      const rangeChanged =
        mode === "edit" &&
        !!initialEvent &&
        (initialEvent.begin !== savedEvent.begin ||
          initialEvent.end !== savedEvent.end);
      if (rangeChanged && initialEvent) {
        void useBusyList.getState().removeBusyRange({
          start: initialEvent.begin,
          end: initialEvent.end,
        });
      }
      if (
        publishBusy &&
        supportsBusyListPublish &&
        (mode === "create" || rangeChanged)
      ) {
        void useBusyList
          .getState()
          .addBusyRange({ start: savedEvent.begin, end: savedEvent.end });
      }

      // Persist preference so future events default to the user's last choice.
      setBusyListDefaultOptIn(publishBusy);
      resetRelayStatus();
      onClose();
    } catch (e) {
      let msg = e instanceof Error ? e.message : String(e);
      if (e instanceof AggregateError && e.errors.length > 0) {
        const details = e.errors.map((err) => String(err)).join("; ");
        msg = `${msg} — ${details}`;
      }
      console.error(msg);
      setSaveError(msg);
      const failedRelays = getFailedRelays(relaysToPublish);
      for (const relayUrl of failedRelays) {
        onRelayComplete(relayUrl, false);
      }
      setProcessing(false);
    }
  };

  const handleRetryFailedRelays = async () => {
    if (!signedEventForRetry) {
      return;
    }
    const failed = getFailedRelays();
    if (failed.length === 0) {
      return;
    }
    setRetryingRelays(true);
    setRelaysPending(failed);
    try {
      // Retry is just another publish — the worker owns reaching dead relays.
      await publishSignedEvent(signedEventForRetry, { onRelayComplete });
    } catch {
      // per-relay outcomes already set via onRelayComplete where applicable
    } finally {
      setRetryingRelays(false);
    }
    const retriedOk = getFailedRelays(failed).length === 0;
    if (retriedOk) {
      setRelayDetailsOpen(false);
      resetRelayStatus();
      onClose();
    }
  };

  const showRelayDetailsButton =
    hasRelayErrors && !processing && publishingRelays.length > 0;
  const { acceptedCount, failedCount, totalCount } = getRelayPublishCounts(
    publishingRelays,
    relayStatus,
  );
  const hasRelaySuccess = acceptedCount > 0;
  /** Save succeeded for the network, but at least one relay failed (event is already on the calendar). */
  const partialSaveRelayIssues =
    !processing &&
    publishingRelays.length > 0 &&
    hasRelayErrors &&
    hasRelaySuccess;
  const relayDotsLabel = partialSaveRelayIssues
    ? intl.formatMessage(
        { id: "event.relaysPartialPublishSummary" },
        { acceptedCount, totalCount },
      )
    : intl.formatMessage(
        { id: "event.publishingToRelays" },
        { count: getRelays().length },
      );
  const canShowRelayRetry =
    hasRelayErrors && !!signedEventForRetry && publishingRelays.length > 0;

  return {
    processing,
    saveError,
    setSaveError,
    handleSave,
    handleRetryFailedRelays,
    resetRelayStatus,
    relayStatus,
    publishingRelays,
    signedEventForRetry,
    retryingRelays,
    relayDetailsOpen,
    setRelayDetailsOpen,
    hasRelayErrors,
    partialSaveRelayIssues,
    relayDotsLabel,
    acceptedCount,
    failedCount,
    totalCount,
    showRelayDetailsButton,
    canShowRelayRetry,
  };
}
