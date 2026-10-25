import { useRef, useState } from "react";
import { useIntl } from "react-intl";
import { publishPrivateCalendarEvent } from "../../../nostr/events";
import { getUserPublicKey } from "../../../nostr/crypto";
import { useCalendarLists } from "../../../stores/calendarLists";
import { useTimeBasedEvents } from "../../../stores/events";
import type { DestinationCalendarDraft } from "../../../stores/bulkImport";
import { findMatchingCalendar } from "../utils/destinationCalendars";
import {
  DEFAULT_CALENDAR_TITLE,
  parseEventRef,
} from "../../../utils/calendarListTypes";
import { isAllDayEvent } from "../../../utils/dateHelper";
import type { ICalendarEvent } from "../../../utils/types";

export interface BulkImportProgress {
  current: number;
  total: number;
}

export function useBulkImportSave() {
  const intl = useIntl();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<BulkImportProgress>({
    current: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRequestedRef = useRef(false);

  const cancelImport = () => {
    if (isImporting) {
      cancelRequestedRef.current = true;
      setIsCancelling(true);
    }
  };

  const importEvents = async (
    events: ICalendarEvent[],
    targetCalendarId?: string,
    onSuccess?: () => void,
    onCancelled?: () => void,
    destinationCalendars?: DestinationCalendarDraft[],
  ) => {
    if (events.length === 0) return;
    cancelRequestedRef.current = false;
    setIsImporting(true);
    setIsCancelling(false);
    setError(null);
    setProgress({ current: 0, total: events.length });

    try {
      const userPublicKey = await getUserPublicKey();

      // Resolve destination calendars if present
      const eventIdToCalId = new Map<string, string>();
      let defaultCalId = targetCalendarId;

      if (destinationCalendars && destinationCalendars.length > 0) {
        const existingCalendars = [...useCalendarLists.getState().calendars];
        const nameToCalId = new Map<string, string>();

        for (const dest of destinationCalendars) {
          const existing = findMatchingCalendar(existingCalendars, dest.name);
          if (existing) {
            nameToCalId.set(dest.name, existing.id);
          } else {
            // Create calendar under the Synced group in sidebar
            const created = await useCalendarLists
              .getState()
              .createCalendar(dest.name, "", dest.color);
            nameToCalId.set(dest.name, created.id);
            existingCalendars.push(created);
          }
        }

        for (const dest of destinationCalendars) {
          const calId = nameToCalId.get(dest.name);
          if (calId) {
            for (const id of dest.eventIds) {
              eventIdToCalId.set(id, calId);
            }
          }
        }
      }

      if (!defaultCalId) {
        const existing = useCalendarLists.getState().calendars;
        if (existing.length > 0) {
          defaultCalId = existing[0].id;
        } else {
          const newCal = await useCalendarLists
            .getState()
            .createCalendar(DEFAULT_CALENDAR_TITLE);
          defaultCalId = newCal.id;
        }
      }

      const refsByCalId = new Map<string, string[][]>();
      const allSavedEvents: ICalendarEvent[] = [];
      let completedCount = 0;

      // Use moderate batch size to prevent saturating websocket/relay buffers
      const BATCH_SIZE = 6;

      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        if (cancelRequestedRef.current) break;

        const batch = events.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (event) => {
            const calId = eventIdToCalId.get(event.id) || defaultCalId;
            const eventToSave: ICalendarEvent = {
              ...event,
              calendarId: calId,
              isPrivateEvent: true,
              allDay: event.allDay || isAllDayEvent(event.begin, event.end),
            };

            // Look up existing viewKey if this event was previously imported or saved
            let existingKey: string | undefined = undefined;
            const cached = useTimeBasedEvents.getState().eventById[event.id];
            if (cached?.viewKey) {
              existingKey = cached.viewKey;
            } else {
              for (const cal of useCalendarLists.getState().calendars) {
                for (const ref of cal.eventRefs) {
                  const parsed = parseEventRef(ref);
                  if (parsed.eventDTag === event.id && parsed.viewKey) {
                    existingKey = parsed.viewKey;
                    break;
                  }
                }
                if (existingKey) break;
              }
            }

            const createResult = await publishPrivateCalendarEvent(
              eventToSave,
              {
                userPublicKey,
                existingDTag: event.id,
                existingViewKey: existingKey,
                timeoutMs: 3000,
              },
            );

            const { eventDTag, relayUrl, viewKey, kind } = parseEventRef(
              createResult.eventRef,
            );

            const savedEvent: ICalendarEvent = {
              ...eventToSave,
              id: eventDTag,
              kind,
              viewKey,
              relayHint: relayUrl,
              user: createResult.authorPubkey,
            };

            return { ref: createResult.eventRef, savedEvent, calId };
          }),
        );

        for (const res of results) {
          if (res.status === "fulfilled") {
            const { ref, savedEvent, calId } = res.value;
            const list = refsByCalId.get(calId) || [];
            list.push(ref);
            refsByCalId.set(calId, list);
            allSavedEvents.push(savedEvent);
          } else {
            console.warn("Failed to publish an imported event:", res.reason);
          }
          completedCount++;
        }

        setProgress({ current: completedCount, total: events.length });

        // Yield execution to the browser so UI updates and progress renders smoothly
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      if (allSavedEvents.length > 0) {
        for (const [calId, refs] of refsByCalId.entries()) {
          if (refs.length > 0) {
            await useCalendarLists.getState().addEventsToCalendar(calId, refs);
          }
        }
        useTimeBasedEvents.getState().addEvents(allSavedEvents);
      }

      if (cancelRequestedRef.current && completedCount < events.length) {
        onCancelled?.();
      } else if (allSavedEvents.length === events.length) {
        onSuccess?.();
      } else {
        setError(intl.formatMessage({ id: "bulkImport.importError" }));
      }
    } catch (err) {
      console.error("Bulk import failed:", err);
      setError(intl.formatMessage({ id: "bulkImport.importError" }));
    } finally {
      setIsImporting(false);
      setIsCancelling(false);
    }
  };

  return {
    isImporting,
    isCancelling,
    progress,
    error,
    importEvents,
    cancelImport,
  };
}
