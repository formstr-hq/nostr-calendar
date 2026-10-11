import { useRef, useState } from "react";
import { publishPrivateCalendarEvent } from "../../../nostr/events";
import { getUserPublicKey } from "../../../nostr/crypto";
import { useCalendarLists } from "../../../stores/calendarLists";
import { useTimeBasedEvents } from "../../../stores/events";
import { parseEventRef } from "../../../utils/calendarListTypes";
import { isAllDayEvent } from "../../../utils/dateHelper";
import type { ICalendarEvent } from "../../../utils/types";

export interface BulkImportProgress {
  current: number;
  total: number;
}

export function useBulkImportSave() {
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
    targetCalendarId: string,
    onSuccess?: () => void,
    onCancelled?: () => void,
  ) => {
    if (events.length === 0) return;
    cancelRequestedRef.current = false;
    setIsImporting(true);
    setIsCancelling(false);
    setError(null);
    setProgress({ current: 0, total: events.length });

    try {
      const userPublicKey = await getUserPublicKey();
      const allEventRefs: string[][] = [];
      const allSavedEvents: ICalendarEvent[] = [];
      let completedCount = 0;

      // Use moderate batch size to prevent saturating websocket/relay buffers
      const BATCH_SIZE = 6;

      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        if (cancelRequestedRef.current) break;

        const batch = events.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (event) => {
            const eventToSave: ICalendarEvent = {
              ...event,
              calendarId: targetCalendarId,
              isPrivateEvent: true,
              allDay: isAllDayEvent(event.begin, event.end),
            };

            const createResult = await publishPrivateCalendarEvent(
              eventToSave,
              {
                userPublicKey,
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

            return { ref: createResult.eventRef, savedEvent };
          }),
        );

        for (const res of results) {
          if (res.status === "fulfilled") {
            allEventRefs.push(res.value.ref);
            allSavedEvents.push(res.value.savedEvent);
          } else {
            console.warn("Failed to publish an imported event:", res.reason);
          }
          completedCount++;
        }

        setProgress({ current: completedCount, total: events.length });

        // Yield execution to the browser so UI updates and progress renders smoothly
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      if (allEventRefs.length > 0) {
        await useCalendarLists
          .getState()
          .addEventsToCalendar(targetCalendarId, allEventRefs);
        useTimeBasedEvents.getState().addEvents(allSavedEvents);
      }

      if (cancelRequestedRef.current && completedCount < events.length) {
        onCancelled?.();
      } else if (allSavedEvents.length === events.length) {
        onSuccess?.();
      } else {
        setError("Failed to import events");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
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
