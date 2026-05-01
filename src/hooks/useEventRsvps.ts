/**
 * Hook: useEventRsvps
 *
 * Subscribes to RSVP responses for a calendar event and exposes a
 * deduplicated, pubkey-keyed map of the latest RSVP per responder.
 *
 * Private events: gift-wrapped kind RSVPRumor → unwrapped client-side.
 * Public events:  NIP-52 kind 31925, read directly off the event tags.
 *
 * Per the issue, all responders are treated as participants — even when
 * the responder's pubkey is not in the event's original participant list.
 * This lets shared-link viewers signal intent ("tentative") and surface
 * to other participants.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPrivateEventRSVPs,
  fetchPublicEventRSVPs,
  publishPrivateRSVPEvent,
  publishPublicRSVPEvent,
  RSVPPayload,
  RSVPRecord,
} from "../common/nostr";
import { EventKinds } from "../common/EventConfigs";
import { ICalendarEvent } from "../utils/types";
import { useUser } from "../stores/user";

export interface UseEventRsvpsResult {
  byPubkey: Record<string, RSVPRecord>;
  myRsvp?: RSVPRecord;
  isLoading: boolean;
  isSubmitting: boolean;
  submit: (payload: RSVPPayload) => Promise<void>;
  /** Union of original event participants and pubkeys that responded. */
  allParticipants: string[];
}

export function useEventRsvps(
  event: ICalendarEvent | null | undefined,
): UseEventRsvpsResult {
  const { user } = useUser();
  const myPubkey = user?.pubkey;
  const [byPubkey, setByPubkey] = useState<Record<string, RSVPRecord>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eventCoord = useMemo(() => {
    if (!event) return null;
    const kind = event.isPrivateEvent
      ? EventKinds.PrivateCalendarEvent
      : EventKinds.PublicCalendarEvent;
    return `${kind}:${event.user}:${event.id}`;
  }, [event]);

  // Reset on event change so stale state doesn't bleed between views.
  const lastCoordRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastCoordRef.current !== eventCoord) {
      setByPubkey({});
      lastCoordRef.current = eventCoord;
    }
  }, [eventCoord]);

  useEffect(() => {
    if (!event || !eventCoord) return;
    setIsLoading(true);
    const handleRecord = (record: RSVPRecord) => {
      setIsLoading(false);
      setByPubkey((prev) => {
        const existing = prev[record.pubkey];
        if (existing && existing.createdAt >= record.createdAt) return prev;
        return { ...prev, [record.pubkey]: record };
      });
    };

    let handle: { close?: () => void; unsubscribe?: () => void } | null = null;
    if (event.isPrivateEvent) {
      if (!myPubkey) {
        setIsLoading(false);
        return;
      }
      handle = fetchPrivateEventRSVPs(
        { eventCoord, recipientPubkey: myPubkey },
        handleRecord,
        () => setIsLoading(false),
      );
    } else {
      handle = fetchPublicEventRSVPs({ eventCoord }, handleRecord, () =>
        setIsLoading(false),
      );
    }

    const loadingTimer = setTimeout(() => setIsLoading(false), 4000);
    return () => {
      clearTimeout(loadingTimer);
      handle?.close?.();
      handle?.unsubscribe?.();
    };
  }, [event, eventCoord, myPubkey]);

  const submit = useCallback(
    async (payload: RSVPPayload) => {
      if (!event || !myPubkey) return;
      setIsSubmitting(true);
      try {
        if (event.isPrivateEvent) {
          await publishPrivateRSVPEvent({
            authorPubKey: event.user,
            eventId: event.id,
            participants: event.participants,
            additionalRecipients: Object.keys(byPubkey),
            referenceKind: EventKinds.PrivateCalendarEvent,
            relayHint: event.relayHint,
            payload,
          });
        } else {
          await publishPublicRSVPEvent({
            authorPubKey: event.user,
            eventId: event.id,
            relayHint: event.relayHint,
            payload,
          });
        }
        // Optimistic local update; relay subscription will reconcile.
        setByPubkey((prev) => ({
          ...prev,
          [myPubkey]: {
            pubkey: myPubkey,
            status: payload.status,
            suggestedStart: payload.suggestedStart,
            suggestedEnd: payload.suggestedEnd,
            comment: payload.comment ?? "",
            createdAt: Math.floor(Date.now() / 1000),
            eventCoord: eventCoord ?? "",
          },
        }));
      } finally {
        setIsSubmitting(false);
      }
    },
    [byPubkey, event, myPubkey, eventCoord],
  );

  const allParticipants = useMemo(() => {
    if (!event) return [];
    const set = new Set<string>(event.participants ?? []);
    Object.keys(byPubkey).forEach((p) => set.add(p));
    return [...set];
  }, [event, byPubkey]);

  const myRsvp = myPubkey ? byPubkey[myPubkey] : undefined;
  return {
    byPubkey,
    myRsvp,
    isLoading,
    isSubmitting,
    submit,
    allParticipants,
  };
}
