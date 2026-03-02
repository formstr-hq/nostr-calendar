import { useState, useEffect, useCallback, useMemo } from "react";
import { RSVPStatus } from "../utils/types";
import {
  fetchPublicRSVPEvents,
  publishPublicRSVPEvent,
  fetchAndDecryptPrivateRSVPEvents,
  publishPrivateRSVPEvent,
} from "../common/nostr";
import { useRSVPTimeRange } from "./useRSVPTimeRange";
import { RSVPTimeRangeConfig } from "./useRSVPTimeRange";
import { EventKinds } from "../common/EventConfigs";

export const useRSVPManager = (
  calendarEvent: any,
  userPublicKey: string,
  timeRangeConfig?: RSVPTimeRangeConfig,
) => {
  const [rsvpStateByEvent, setRsvpStateByEvent] = useState<
    Record<string, RSVPStatus>
  >({});
  const [participantRSVPs, setParticipantRSVPs] = useState<
    Record<string, RSVPStatus>
  >({});
  const [isLoadingRSVPs, setIsLoadingRSVPs] = useState(false);
  const [isUpdatingRSVP, setIsUpdatingRSVP] = useState(false);
  const [rsvpTimestamps, setRsvpTimestamps] = useState<Record<string, number>>(
    {},
  );

  const { timeRange, config } = useRSVPTimeRange(timeRangeConfig);

  const eventKey = useMemo(
    () => (calendarEvent ? `${calendarEvent.id}-${calendarEvent.user}` : null),
    [calendarEvent?.id, calendarEvent?.user],
  );

  const eventReference = useMemo(() => {
    if (!calendarEvent) return null;
    const eventKind = calendarEvent.isPrivateEvent ? "32678" : "31923";
    return `${eventKind}:${calendarEvent.user}:${calendarEvent.id}`;
  }, [calendarEvent?.isPrivateEvent, calendarEvent?.user, calendarEvent?.id]);

  const initializeRSVPStates = useCallback(() => {
    if (!calendarEvent || !eventKey || !userPublicKey) return;

    const initialRsvpState: Record<string, RSVPStatus> = {};
    const initialParticipantRSVPs: Record<string, RSVPStatus> = {};
    const initialTimestamps: Record<string, number> = {};

    calendarEvent.participants.forEach((participant: string) => {
      initialParticipantRSVPs[participant] = RSVPStatus.pending;
    });

    if (calendarEvent.rsvpResponses?.length > 0) {
      calendarEvent.rsvpResponses.forEach((response: any) => {
        const timestamp = response.timestamp || 0;

        if (response.participantId === userPublicKey) {
          initialRsvpState[eventKey] = response.response as RSVPStatus;
          initialTimestamps[userPublicKey] = timestamp;
        }
        if (calendarEvent.participants.includes(response.participantId)) {
          initialParticipantRSVPs[response.participantId] =
            response.response as RSVPStatus;
          initialTimestamps[response.participantId] = timestamp;
        }
      });
    }

    setRsvpStateByEvent((prev) => ({ ...prev, ...initialRsvpState }));
    setParticipantRSVPs(initialParticipantRSVPs);
    setRsvpTimestamps(initialTimestamps);
  }, [calendarEvent, eventKey, userPublicKey]);

  const processRSVPEvent = useCallback(
    (rsvpEvent: any, decryptedTags?: any[]) => {
      if (!eventReference || !eventKey) return;

      const tags = decryptedTags || rsvpEvent.tags;

      const aTag = tags.find((tag: string[]) => tag[0] === "a");

      if (aTag?.[1] !== eventReference) return;

      let statusTag = tags.find(
        (tag: string[]) =>
          tag[0] === "l" && tag.length > 2 && tag[2] === "status",
      );

      if (!statusTag) {
        statusTag = tags.find((tag: string[]) => tag[0] === "status");
      }

      if (statusTag) {
        const rsvpStatus = statusTag[1] as RSVPStatus;
        const participantPubKey = rsvpEvent.pubkey;
        const eventTimestamp = rsvpEvent.created_at || 0;

        // Only update if this is a newer event
        setRsvpTimestamps((prev) => {
          const currentTimestamp = prev[participantPubKey] || 0;

          if (eventTimestamp <= currentTimestamp) {
            return prev; // Skip older events
          }

          // Update the RSVP states for newer events
          if (participantPubKey === userPublicKey) {
            setRsvpStateByEvent((state) => ({
              ...state,
              [eventKey]: rsvpStatus,
            }));
          }

          if (calendarEvent.participants.includes(participantPubKey)) {
            setParticipantRSVPs((state) => ({
              ...state,
              [participantPubKey]: rsvpStatus,
            }));
          }

          return {
            ...prev,
            [participantPubKey]: eventTimestamp,
          };
        });
      }
    },
    [eventReference, eventKey, userPublicKey, calendarEvent?.participants],
  );

  useEffect(() => {
    if (!calendarEvent || !userPublicKey || !eventKey || !eventReference)
      return;

    // Initialize states first
    initializeRSVPStates();
    setIsLoadingRSVPs(true);

    let subscription: any;

    if (calendarEvent.isPrivateEvent) {
      subscription = fetchAndDecryptPrivateRSVPEvents(
        {
          participants: calendarEvent.participants,
        },
        (decryptedRSVPData: any) => {
          try {
            if (decryptedRSVPData?.rsvpEvent?.decryptedData) {
              processRSVPEvent(
                decryptedRSVPData.rsvpEvent,
                decryptedRSVPData.rsvpEvent.decryptedData,
              );
            }
          } catch (error) {
            console.error("Error processing private RSVP data:", error);
          }
        },
      );
    } else {
      subscription = fetchPublicRSVPEvents(
        {
          eventReference,
        },
        (rsvpEvent: any) => {
          processRSVPEvent(rsvpEvent);
        },
      );
    }

    const loadingTimeout = setTimeout(() => {
      setIsLoadingRSVPs(false);
    }, 5000);

    return () => {
      subscription?.close();
      clearTimeout(loadingTimeout);
    };
  }, [
    calendarEvent,
    userPublicKey,
    eventKey,
    eventReference,
    timeRange.since,
    timeRange.until,
    initializeRSVPStates,
    processRSVPEvent,
  ]);

  const handleRSVPUpdate = useCallback(
    async (status: RSVPStatus) => {
      const currentStatus = eventKey
        ? rsvpStateByEvent[eventKey] || RSVPStatus.pending
        : RSVPStatus.pending;

      if (isUpdatingRSVP || status === currentStatus || !eventKey) return;

      setIsUpdatingRSVP(true);

      try {
        if (calendarEvent.isPrivateEvent) {
          await publishPrivateRSVPEvent({
            authorpubKey: calendarEvent.user,
            eventId: calendarEvent.id,
            status: status,
            participants: calendarEvent.participants || [],
            referenceKind: calendarEvent.repeat.rrule
              ? EventKinds.PrivateCalendarRecurringEvent
              : EventKinds.PrivateCalendarEvent,
          });
        } else {
          await publishPublicRSVPEvent({
            authorpubKey: calendarEvent.user,
            eventId: calendarEvent.id,
            status: status,
          });
        }

        // Optimistically update with current timestamp
        setRsvpStateByEvent((prev) => ({
          ...prev,
          [eventKey]: status,
        }));

        setRsvpTimestamps((prev) => ({
          ...prev,
          [userPublicKey]: Math.floor(Date.now() / 1000),
        }));
      } catch (error) {
        console.error("Failed to update RSVP:", error);
        const originalStatus = eventKey
          ? rsvpStateByEvent[eventKey] || RSVPStatus.pending
          : RSVPStatus.pending;
        setRsvpStateByEvent((prev) => ({
          ...prev,
          [eventKey]: originalStatus,
        }));
      } finally {
        setIsUpdatingRSVP(false);
      }
    },
    [calendarEvent, eventKey, rsvpStateByEvent, isUpdatingRSVP, userPublicKey],
  );

  return {
    currentRSVPStatus: eventKey
      ? rsvpStateByEvent[eventKey] || RSVPStatus.pending
      : RSVPStatus.pending,
    participantRSVPs,
    isLoadingRSVPs,
    isUpdatingRSVP,
    handleRSVPUpdate,
    timeRangeConfig: config,
    timeRange,
  };
};
