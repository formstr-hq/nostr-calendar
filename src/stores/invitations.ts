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
  viewPrivateEvent,
} from "../common/nostr";
import { nostrEventToCalendar } from "../utils/parser";
import { useCalendarLists } from "./calendarLists";
import { buildEventRef, parseEventRef } from "../utils/calendarListTypes";
import type { IInvitation } from "../utils/calendarListTypes";
import { EventKinds } from "../common/EventConfigs";
import type { SubscriptionHandle } from "../common/nostrRuntime";

const INVITATIONS_STORAGE_KEY = "cal:invitations";

const saveInvitationsToStorage = (invitations: IInvitation[]) => {
  setSecureItem(INVITATIONS_STORAGE_KEY, invitations);
};

let invitationSubHandle: SubscriptionHandle | undefined;

interface InvitationsState {
  invitations: IInvitation[];
  unreadCount: number;
  isLoaded: boolean;

  loadCachedInvitations: () => Promise<void>;
  fetchInvitations: () => void;
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
    if (invitationSubHandle) {
      invitationSubHandle.unsubscribe();
    }

    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    // Get all event IDs already in calendars for deduplication
    const existingEventIds = new Set(
      useCalendarLists.getState().getAllEventIds(),
    );

    // Track processed IDs to avoid duplicate processing within this fetch
    const processedIds = new Set<string>();

    invitationSubHandle = fetchCalendarGiftWraps(
      {
        participants: [userPubkey],
        limit: 50,
      },
      async (rumor) => {
        // Skip if already in a calendar
        if (existingEventIds.has(rumor.eventId)) return;
        // Skip if already processed in this session
        if (processedIds.has(rumor.eventId)) return;
        processedIds.add(rumor.eventId);

        // Check if already in invitations list
        const { invitations } = get();
        if (invitations.some((inv) => inv.eventId === rumor.eventId)) return;

        // Create the invitation entry
        const invitation: IInvitation = {
          giftWrapId: rumor.eventId, // Using eventId as identifier
          eventId: rumor.eventId,
          viewKey: rumor.viewKey,
          receivedAt: Date.now(),
          status: "pending",
        };

        // Try to resolve the actual event data
        try {
          await fetchPrivateCalendarEvents(
            { eventIds: [rumor.eventId] },
            (event) => {
              const decrypted = viewPrivateEvent(event, rumor.viewKey);
              const parsed = nostrEventToCalendar(decrypted, {
                viewKey: rumor.viewKey,
                isPrivateEvent: true,
              });
              invitation.event = { ...parsed, isInvitation: true };
            },
          );
        } catch (error) {
          console.error(
            "Failed to resolve invitation event:",
            rumor.eventId,
            error,
          );
        }

        set((state) => {
          const updated = [...state.invitations, invitation];
          const unreadCount = updated.filter(
            (i) => i.status === "pending",
          ).length;
          saveInvitationsToStorage(updated);
          return { invitations: updated, unreadCount };
        });
      },
    );
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

    // Build the event reference for the calendar list
    const isRecurring = invitation.event?.repeat?.rrule != null;
    const beginTimeSecs = invitation.event
      ? Math.floor(invitation.event.begin / 1000)
      : 0;
    const endTimeSecs = invitation.event
      ? Math.floor(invitation.event.end / 1000)
      : 0;

    const eventRef = buildEventRef({
      kind: invitation.event?.kind || EventKinds.PrivateCalendarEvent,
      authorPubkey: invitation.event?.user || "",
      eventDTag: invitation.eventId,
      viewKey: invitation.viewKey,
      beginTimeSecs,
      endTimeSecs,
      isRecurring,
    });

    // Add to the selected calendar
    await useCalendarLists.getState().addEventToCalendar(calendarId, eventRef);

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
      const updated = state.invitations.map((i) =>
        i.giftWrapId === giftWrapId
          ? { ...i, status: "dismissed" as const }
          : i,
      );
      const unreadCount = updated.filter((i) => i.status === "pending").length;
      saveInvitationsToStorage(updated);
      return { invitations: updated, unreadCount };
    });
  },

  /**
   * Clears all cached invitation data. Called on logout.
   */
  clearCachedInvitations: async () => {
    if (invitationSubHandle) {
      invitationSubHandle.unsubscribe();
      invitationSubHandle = undefined;
    }
    await removeSecureItem(INVITATIONS_STORAGE_KEY);
    set({ invitations: [], unreadCount: 0, isLoaded: false });
  },
}));
