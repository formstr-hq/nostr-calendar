import { useState } from "react";
import { useIntl } from "react-intl";
import type { ICalendarEvent } from "../../../utils/types";
import type { ICalendarList } from "../../../utils/calendarListTypes";
import {
  editPrivateCalendarEvent,
  publishPrivateCalendarEvent,
  publishPublicCalendarEvent,
} from "../../../nostr/events";
import { publishSignedEvent } from "../../../nostr/core";
import { publishCalendarList } from "../../../nostr/calendars";
import { getRelays } from "../../../common/relayConfig";
import { EventKinds } from "../../../nostr/kinds";
import { useTimeBasedEvents } from "../../../stores/events";
import { useCalendarLists } from "../../../stores/calendarLists";
import { useDeviceCalendars } from "../../../stores/deviceCalendars";
import {
  deviceEventStableId,
  stripDeviceCalendarPrefix,
} from "../../../utils/deviceCalendarAdapter";
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
import {
  usePublishActivityStore,
  usePublishActivity,
  type PublishStepDefinition,
} from "../../../stores/publishActivity";
import { useBusyList, setBusyListDefaultOptIn } from "../../../stores/busyList";
import { getRelayPublishCounts } from "../../../utils/relayPublishStatus";

const EVENT_SAVE_FLOW_ID = "event-save";

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
  const [relayDetailsOpen, setRelayDetailsOpen] = useState(false);
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);
  const flow = usePublishActivity(EVENT_SAVE_FLOW_ID);
  const steps = flow?.steps ?? [];

  const handleSave = async () => {
    const relaysToPublish = getRelays();
    setRelayDetailsOpen(false);
    setSaveError(null);
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

      // Device events have no Nostr identity: fully bypass publish machinery,
      // useTimeBasedEvents, and useCalendarLists (no calendar move — the picker
      // is locked read-only for device events). Notification scheduling still
      // runs below, keyed by the stable device id rather than savedEvent.id.
      if (eventDetails.source === "device") {
        await useDeviceCalendars.getState().updateDeviceEvent(eventToSave);

        const stableId = deviceEventStableId(
          eventToSave.id,
          stripDeviceCalendarPrefix(eventToSave.calendarId),
        );

        if (
          areNotificationOffsetsEqual(
            normalizedNotificationOffsets,
            DEFAULT_NOTIFICATION_OFFSETS,
          )
        ) {
          await clearNotificationPreference(stableId);
        } else {
          await setNotificationPreference(
            stableId,
            normalizedNotificationOffsets,
          );
        }

        await cancelEventNotifications(stableId);
        useNotifications.getState().removeNotifications(stableId);
        const notifications = await scheduleEventNotifications({
          ...eventToSave,
          id: stableId,
        });
        useNotifications.getState().setNotifications(stableId, notifications);

        onClose();
        return;
      }

      const hasParticipants = eventToSave.participants.length > 0;

      const stepDefs: PublishStepDefinition[] = [];

      if (isPrivate) {
        if (mode === "edit") {
          // Cached across the initial run and any later per-step retries so
          // retrying never re-derives keys/tags — it only re-sends what was
          // already built and signed the first time.
          let editResult: Awaited<
            ReturnType<typeof editPrivateCalendarEvent>
          > | null = null;
          let inviteStepStarted = false;
          let calendarStepStarted = false;
          const previousParticipantSet = new Set(
            initialEvent?.participants ?? [],
          );
          const hasNewParticipants = eventToSave.participants.some(
            (p) => !previousParticipantSet.has(p),
          );

          stepDefs.push({
            id: "publish-event",
            labelId: "event.step.publishEvent",
            relays: relaysToPublish,
            blocking: true,
            run: async (callbacks) => {
              if (editResult) {
                await publishSignedEvent(editResult.signedEvent, {
                  onRelayComplete: callbacks.onRelayComplete,
                });
                return;
              }
              editResult = await editPrivateCalendarEvent(
                eventToSave,
                selectedCalendarId,
                initialEvent?.participants ?? [],
                undefined,
                callbacks.onRelayComplete,
                (url, ok) =>
                  callbacks.reportRelayOutcome("invite-participants", url, ok),
                (url, ok) =>
                  callbacks.reportRelayOutcome("add-to-calendar", url, ok),
              );
              // The calendar-list move is stored separately from the event
              // payload. Apply its authoritative destination locally so the
              // calendar grid updates without waiting for a relay replay.
              savedEvent = {
                ...editResult.event,
                calendarId: editResult.calendarId,
              };
              useTimeBasedEvents.getState().updateEvent(savedEvent);
            },
          });

          if (hasNewParticipants) {
            stepDefs.push({
              id: "invite-participants",
              labelId: "event.step.inviteParticipants",
              relays: relaysToPublish,
              blocking: true,
              run: async (callbacks) => {
                if (!inviteStepStarted) {
                  // Outcomes already arrive via publish-event's run above.
                  inviteStepStarted = true;
                  return;
                }
                if (!editResult || editResult.giftWraps.length === 0) return;
                await Promise.all(
                  editResult.giftWraps.map((gw) =>
                    publishSignedEvent(gw, {
                      onRelayComplete: callbacks.onRelayComplete,
                    }),
                  ),
                );
              },
            });
          }

          stepDefs.push({
            id: "add-to-calendar",
            labelId: "event.step.addToCalendar",
            relays: relaysToPublish,
            blocking: true,
            run: async (callbacks) => {
              if (!calendarStepStarted) {
                // Outcomes already arrive via publish-event's run above.
                calendarStepStarted = true;
                return;
              }
              // Retry: re-publish whichever calendar currently holds this
              // event (the move is a no-op once already applied locally, so
              // re-running the move itself wouldn't resend anything).
              const calendar = useCalendarLists
                .getState()
                .calendars.find((c) => c.id === selectedCalendarId);
              if (!calendar) return;
              await publishCalendarList(calendar, {
                onRelayComplete: callbacks.onRelayComplete,
              });
            },
          });
        } else {
          let createResult: Awaited<
            ReturnType<typeof publishPrivateCalendarEvent>
          > | null = null;
          let inviteStepStarted = false;
          let addToCalendarStarted = false;

          stepDefs.push({
            id: "publish-event",
            labelId: "event.step.publishEvent",
            relays: relaysToPublish,
            blocking: true,
            run: async (callbacks) => {
              if (createResult) {
                await publishSignedEvent(createResult.calendarEvent, {
                  onRelayComplete: callbacks.onRelayComplete,
                });
                return;
              }
              createResult = await publishPrivateCalendarEvent(eventToSave, {
                onRelayComplete: callbacks.onRelayComplete,
                onInviteRelayComplete: (url, ok) =>
                  callbacks.reportRelayOutcome("invite-participants", url, ok),
              });
              const { eventDTag, relayUrl, viewKey, kind } = parseEventRef(
                createResult.eventRef,
              );
              savedEvent = {
                ...eventToSave,
                id: eventDTag,
                kind,
                viewKey,
                relayHint: relayUrl,
                user: createResult.authorPubkey,
              };
              useTimeBasedEvents.getState().addEvent(savedEvent);
            },
          });

          if (hasParticipants) {
            stepDefs.push({
              id: "invite-participants",
              labelId: "event.step.inviteParticipants",
              relays: relaysToPublish,
              blocking: true,
              run: async (callbacks) => {
                if (!inviteStepStarted) {
                  inviteStepStarted = true;
                  return;
                }
                if (!createResult || createResult.giftWraps.length === 0)
                  return;
                await Promise.all(
                  createResult.giftWraps.map((gw) =>
                    publishSignedEvent(gw, {
                      onRelayComplete: callbacks.onRelayComplete,
                    }),
                  ),
                );
              },
            });
          }

          stepDefs.push({
            id: "add-to-calendar",
            labelId: "event.step.addToCalendar",
            relays: relaysToPublish,
            blocking: true,
            run: async (callbacks) => {
              if (!addToCalendarStarted) {
                addToCalendarStarted = true;
                if (!createResult) return;
                await useCalendarLists
                  .getState()
                  .addEventToCalendar(
                    selectedCalendarId,
                    createResult.eventRef,
                    {
                      onRelayComplete: callbacks.onRelayComplete,
                    },
                  );
                return;
              }
              // Retry: addEventToCalendar no-ops once the ref is already
              // present locally (set on the first attempt regardless of
              // relay outcome), so re-publish the calendar as it stands now.
              const calendar = useCalendarLists
                .getState()
                .calendars.find((c) => c.id === selectedCalendarId);
              if (!calendar) return;
              await publishCalendarList(calendar, {
                onRelayComplete: callbacks.onRelayComplete,
              });
            },
          });
        }
      } else {
        let publicResult: Awaited<
          ReturnType<typeof publishPublicCalendarEvent>
        > | null = null;

        stepDefs.push({
          id: "publish-event",
          labelId: "event.step.publishEvent",
          relays: relaysToPublish,
          blocking: true,
          run: async (callbacks) => {
            if (publicResult) {
              await publishSignedEvent(publicResult.signedEvent, {
                onRelayComplete: callbacks.onRelayComplete,
              });
              return;
            }
            publicResult = await publishPublicCalendarEvent(
              eventToSave,
              undefined,
              callbacks.onRelayComplete,
            );
            savedEvent = {
              ...eventToSave,
              id: publicResult.id,
              kind: EventKinds.PublicCalendarEvent,
              user: publicResult.pubKey,
              isPrivateEvent: false,
            };
            useTimeBasedEvents.getState().updateEvent(savedEvent);
          },
        });
      }

      // Notification preferences are local bookkeeping, not a relay publish
      // — kept outside the step list, same as before.
      if (
        areNotificationOffsetsEqual(
          normalizedNotificationOffsets,
          DEFAULT_NOTIFICATION_OFFSETS,
        )
      ) {
        await clearNotificationPreference(eventToSave.id);
      } else {
        await setNotificationPreference(
          eventToSave.id,
          normalizedNotificationOffsets,
        );
      }

      const rangeChanged =
        mode === "edit" &&
        !!initialEvent &&
        (initialEvent.begin !== eventToSave.begin ||
          initialEvent.end !== eventToSave.end);
      const shouldRemoveBusyRange = rangeChanged && !!initialEvent;
      const shouldAddBusyRange =
        publishBusy &&
        supportsBusyListPublish &&
        (mode === "create" || rangeChanged);
      if (shouldRemoveBusyRange || shouldAddBusyRange) {
        stepDefs.push({
          id: "update-availability",
          labelId: "event.step.updateAvailability",
          relays: relaysToPublish,
          blocking: false,
          run: async (callbacks) => {
            if (shouldRemoveBusyRange && initialEvent) {
              await useBusyList
                .getState()
                .removeBusyRange(
                  { start: initialEvent.begin, end: initialEvent.end },
                  { onRelayComplete: callbacks.onRelayComplete },
                );
            }
            if (shouldAddBusyRange) {
              await useBusyList
                .getState()
                .addBusyRange(
                  { start: eventToSave.begin, end: eventToSave.end },
                  { onRelayComplete: callbacks.onRelayComplete },
                );
            }
          },
        });
      }

      await usePublishActivityStore
        .getState()
        .runFlow(EVENT_SAVE_FLOW_ID, stepDefs);

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

      // Persist preference so future events default to the user's last choice.
      // Note: non-blocking steps (e.g. busy-list) may still be settling in the
      // background — don't clear the flow state here, or their outcomes would
      // have nowhere to land. The next handleSave call reseeds it fresh.
      setBusyListDefaultOptIn(publishBusy);
      onClose();
    } catch (e) {
      let msg = e instanceof Error ? e.message : String(e);
      if (e instanceof AggregateError && e.errors.length > 0) {
        const details = e.errors.map((err) => String(err)).join("; ");
        msg = `${msg} — ${details}`;
      }
      console.error(msg);
      setSaveError(msg);
      setProcessing(false);
    }
  };

  const handleRetryStep = async (stepId: string) => {
    setRetryingStepId(stepId);
    try {
      await usePublishActivityStore
        .getState()
        .retryStep(EVENT_SAVE_FLOW_ID, stepId);
    } catch {
      // per-relay outcomes already reflected in the store
    } finally {
      setRetryingStepId(null);
    }
    const stillFailing = usePublishActivityStore
      .getState()
      .flows[EVENT_SAVE_FLOW_ID]?.steps.some((s) => s.status === "error");
    if (!stillFailing) {
      setRelayDetailsOpen(false);
      onClose();
    }
  };

  const hasErrors = steps.some((s) => s.status === "error");
  const totals = steps.reduce(
    (acc, step) => {
      const counts = getRelayPublishCounts(step.relays, step.relayStatus);
      acc.accepted += counts.acceptedCount;
      acc.failed += counts.failedCount;
      acc.total += counts.totalCount;
      return acc;
    },
    { accepted: 0, failed: 0, total: 0 },
  );
  const partialSaveRelayIssues =
    !processing && hasErrors && totals.accepted > 0;
  const relayDotsLabel = partialSaveRelayIssues
    ? intl.formatMessage(
        { id: "event.relaysPartialPublishSummary" },
        { acceptedCount: totals.accepted, totalCount: totals.total },
      )
    : intl.formatMessage(
        { id: "event.publishingToRelays" },
        { count: getRelays().length },
      );
  const showRelayDetailsButton = hasErrors && !processing && steps.length > 0;

  return {
    processing,
    saveError,
    setSaveError,
    handleSave,
    handleRetryStep,
    steps,
    retryingStepId,
    relayDetailsOpen,
    setRelayDetailsOpen,
    hasRelayErrors: hasErrors,
    partialSaveRelayIssues,
    relayDotsLabel,
    showRelayDetailsButton,
    acceptedCount: totals.accepted,
    failedCount: totals.failed,
    totalCount: totals.total,
  };
}
