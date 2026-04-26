/**
 * Invitations Store
 *
 * Manages gift-wrap invitations that haven't been accepted into a calendar yet.
 * Gift wraps (kind 1052) are treated as invitations/notifications rather than
 * direct event sources. Users must explicitly accept them to add events
 * to their calendars.
 *
 * Key behaviors:
 * - Fetches last 50 gift wraps from relays
 * - Deduplicates against events already in the user's calendars
 * - Resolves invitation events by fetching and decrypting private events
 * - Tracks pending/accepted/dismissed status
 * - Provides unread count for notification badge
 */

import { create } from "zustand";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";
import {
  fetchCalendarGiftWraps,
  fetchPrivateCalendarEvents,
  getUserPublicKey,
  publishParticipantRemovalEvent,
  viewPrivateEvent,
} from "../common/nostr";
import { nostrEventToCalendar } from "../utils/parser";
import { useCalendarLists } from "./calendarLists";
import { useTimeBasedEvents } from "./events";
import { buildEventRef } from "../utils/calendarListTypes";
import type { IInvitation } from "../utils/calendarListTypes";
import { EventKinds } from "../common/EventConfigs";
import type { SubscriptionHandle } from "../common/nostrRuntime";
import { getDTag } from "../common/nostrRuntime/utils/helpers";
import { BG_KEY_LAST_INVITATION_FETCH_TIME } from "../utils/constants";

const INVITATIONS_STORAGE_KEY = "cal:invitations";

const saveInvitationsToStorage = (invitations: IInvitation[]) => {
  setSecureItem(INVITATIONS_STORAGE_KEY, invitations);
};

let invitationSubHandle: SubscriptionHandle | undefined;
let processingTimer: ReturnType<typeof setInterval> | undefined;
let pendingBuffer: IInvitation[] = [];
let processedIds = new Set<string>();
let isListening = false;

interface InvitationsState {
  invitations: IInvitation[];
  unreadCount: number;
  isLoaded: boolean;

  loadCachedInvitations: () => Promise<void>;
  fetchInvitations: () => void;
  stopInvitations: () => void;
  acceptInvitation: (giftWrapId: string, calendarId: string) => Promise<void>;
  dismissInvitation: (giftWrapId: string) => void;
  clearCachedInvitations: () => Promise<void>;
}

export const useInvitations = create<InvitationsState>((set, get) => ({
  invitations: [],
  unreadCount: 0,
  isLoaded: false,

  /**
   * Loads cached invitations from secure storage for immediate display.
   */
  loadCachedInvitations: async () => {
    const cached = await getSecureItem<IInvitation[]>(
      INVITATIONS_STORAGE_KEY,
      [],
    );

    // Filter out already-accepted invitations from cache
    const pending = cached.filter((inv) => inv.status === "pending");
    set({
      invitations: pending,
      unreadCount: pending.length,
      isLoaded: true,
    });
  },

  /**
   * Fetches the last 50 gift wraps from relays.
   * For each gift wrap:
   * 1. Checks if the event is already in any calendar (deduplication)
   * 2. If not, fetches and decrypts the actual event
   * 3. Adds it as a pending invitation
   */
  fetchInvitations: async () => {
    // No-op if already listening
    if (isListening) return;

    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    isListening = true;

    // Process buffered invitations: fetch their private events and merge into store
    function processBuffer() {
      if (pendingBuffer.length === 0) return;

      // Update the last invitation fetch time for the background worker
      setSecureItem(
        BG_KEY_LAST_INVITATION_FETCH_TIME,
        Math.floor(Date.now() / 1000),
      );

      const batch = pendingBuffer.splice(0);

      // Merge raw invitations into store immediately
      set((state) => {
        const newEventIds = new Set(batch.map((i) => i.eventId));
        const updated = [
          ...state.invitations.filter((i) => !newEventIds.has(i.eventId)),
          ...batch,
        ];
        const unreadCount = updated.filter(
          (i) => i.status === "pending",
        ).length;
        saveInvitationsToStorage(updated);
        return { invitations: updated, unreadCount };
      });

      // Resolve private event details for the batch
      const kinds = new Set<number>();
      const pubkeys = new Set<string>();
      const eventIds = new Set<string>();
      batch.forEach((inv) => {
        if ([EventKinds.PrivateCalendarEvent].includes(inv.kind)) {
          kinds.add(inv.kind);
          pubkeys.add(inv.pubkey);
          eventIds.add(inv.eventId);
        }
      });

      if (eventIds.size === 0) return;

      const hintRelays = batch
        .map((inv) => inv.relayHint)
        .filter((r): r is string => !!r);

      fetchPrivateCalendarEvents(
        {
          eventIds: Array.from(eventIds),
          authors: Array.from(pubkeys),
          kinds: Array.from(kinds),
          relays: hintRelays.length > 0 ? hintRelays : undefined,
        },
        (event) => {
          const eventId = getDTag(event);
          const invitation = batch.find((inv) => inv.eventId === eventId);
          if (!invitation) return;
          const decrypted = viewPrivateEvent(event, invitation.viewKey);
          const parsed = nostrEventToCalendar(decrypted, {
            viewKey: invitation.viewKey,
            isPrivateEvent: true,
            relayHint: invitation.relayHint,
          });
          invitation.event = { ...parsed, isInvitation: true };
        },
        () => {
          // After private events are fetched, update store with resolved events
          set((state) => {
            const resolvedIds = new Set(batch.map((i) => i.eventId));
            const updated = [
              ...state.invitations.filter((i) => !resolvedIds.has(i.eventId)),
              ...batch,
            ];
            const unreadCount = updated.filter(
              (i) => i.status === "pending",
            ).length;
            saveInvitationsToStorage(updated);
            return { invitations: updated, unreadCount };
          });
        },
      );
    }

    // Start the periodic processing timer
    processingTimer = setInterval(processBuffer, 5000);

    // Start the persistent subscription
    invitationSubHandle = fetchCalendarGiftWraps(
      {
        participants: [userPubkey],
        limit: 50,
      },
      (rumor) => {
        // Get fresh existing event IDs for deduplication
        const existingEventIds = new Set(
          useCalendarLists.getState().getAllEventIds(),
        );

        // If already in a calendar, check if its viewKey needs updating
        if (existingEventIds.has(rumor.eventId)) {
          // Find if the ref has an empty viewKey (placeholder from booking flow)
          const calendars = useCalendarLists.getState().calendars;
          const hasEmptyViewKey = calendars.some((cal) =>
            cal.eventRefs.some(
              (ref) =>
                ref[0].split(":")[2] === rumor.eventId &&
                (!ref[2] || ref[2] === ""),
            ),
          );
          if (hasEmptyViewKey && rumor.viewKey) {
            useCalendarLists
              .getState()
              .updateEventViewKey(rumor.eventId, rumor.viewKey);
          }
          return;
        }
        // Skip if already processed
        if (processedIds.has(rumor.eventId)) return;
        processedIds.add(rumor.eventId);

        // Skip if already in store
        const { invitations: currentInvitations } = get();
        if (currentInvitations.some((inv) => inv.eventId === rumor.eventId))
          return;

        // Buffer for next processing cycle
        pendingBuffer.push({
          originalInvitationId: rumor.originalInvitationId,
          giftWrapId: rumor.eventId,
          eventId: rumor.eventId,
          viewKey: rumor.viewKey,
          relayHint: rumor.relayHint,
          receivedAt: rumor.createdAt,
          status: "pending",
          pubkey: rumor.authorPubkey,
          kind: rumor.kind,
        });
      },
      () => {}, // EOSE ignored — processing is timer-based
    );
  },

  /**
   * Stops the invitation listener and processing timer.
   * Call on app unmount.
   */
  stopInvitations: () => {
    if (processingTimer) {
      clearInterval(processingTimer);
      processingTimer = undefined;
    }
    if (invitationSubHandle) {
      invitationSubHandle.unsubscribe();
      invitationSubHandle = undefined;
    }
    pendingBuffer = [];
    processedIds = new Set();
    isListening = false;
  },

  /**
   * Accepts an invitation by adding the event to the specified calendar.
   * Builds the event reference from the invitation data and adds it
   * to the target calendar list.
   */
  acceptInvitation: async (giftWrapId, calendarId) => {
    const { invitations } = get();
    const invitation = invitations.find((i) => i.giftWrapId === giftWrapId);
    if (!invitation) return;

    // Guard: don't accept until the private event has been resolved,
    // otherwise the author pubkey is missing and the event coordinate
    // becomes malformed (e.g. "32678::dTag" instead of "32678:pubkey:dTag").
    if (!invitation.event?.user) {
      console.warn("Cannot accept invitation: event not yet resolved");
      return;
    }

    // Build the event reference for the calendar list, including the relay hint
    // so the event can be fetched from the correct relay after acceptance.
    const eventRef = buildEventRef({
      kind: invitation.kind,
      authorPubkey: invitation.event.user,
      eventDTag: invitation.eventId,
      relayUrl: invitation.relayHint,
      viewKey: invitation.viewKey,
    });

    // Add to the selected calendar
    await useCalendarLists.getState().addEventToCalendar(calendarId, eventRef);

    // Update the event in the events store so it reflects the calendar assignment
    // and is no longer treated as an invitation. This prevents duplication when
    // fetchPrivateEvents picks up the same event from the calendar ref.
    if (invitation.event) {
      useTimeBasedEvents.getState().updateEvent({
        ...invitation.event,
        calendarId,
        isInvitation: false,
      });
    }

    // Remove from invitations
    set((state) => {
      const updated = state.invitations.filter(
        (i) => i.giftWrapId !== giftWrapId,
      );
      const unreadCount = updated.filter((i) => i.status === "pending").length;
      saveInvitationsToStorage(updated);
      return { invitations: updated, unreadCount };
    });
  },

  /**
   * Dismisses an invitation without adding it to any calendar.
   */
  dismissInvitation: (giftWrapId) => {
    set((state) => {
      const updated = state.invitations.filter(
        (i) => i.giftWrapId !== giftWrapId,
      );
      const dismissedInvitation = state.invitations.find(
        (inv) => inv.giftWrapId === giftWrapId,
      );
      if (dismissedInvitation) {
        publishParticipantRemovalEvent({
          kinds: [EventKinds.CalendarEventGiftWrap],
          eventIds: [dismissedInvitation?.originalInvitationId],
        });
      }

      const unreadCount = updated.filter((i) => i.status === "pending").length;
      saveInvitationsToStorage(updated);
      return { invitations: updated, unreadCount };
    });
  },

  /**
   * Clears all cached invitation data. Called on logout.
   */
  clearCachedInvitations: async () => {
    get().stopInvitations();
    await removeSecureItem(INVITATIONS_STORAGE_KEY);
    set({ invitations: [], unreadCount: 0, isLoaded: false });
  },
}));
