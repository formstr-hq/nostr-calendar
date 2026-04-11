/**
 * Booking Requests Store
 *
 * Manages appointment booking requests for the scheduling feature.
 * Tracks both incoming requests (as scheduling page creator) and
 * outgoing bookings (as the person requesting an appointment).
 *
 * Key behaviors:
 * - Subscribes to booking request gift wraps (kind 1057) for incoming requests
 * - Subscribes to booking response gift wraps (kind 1058) for outgoing responses
 * - Handles approval: creates private event + sends invitation gift wrap + response
 * - Handles decline: sends decline response gift wrap
 * - Periodically checks for expired requests
 */

import { create } from "zustand";
import { getSecureItem, setSecureItem } from "../common/localStorage";
import {
  getUserPublicKey,
  subscribeBookingRequests,
  subscribeBookingResponses,
  unwrapBookingRequest,
  unwrapBookingResponse,
  sendBookingResponse,
  publishPrivateCalendarEvent,
} from "../common/nostr";
import type {
  IBookingRequest,
  IOutgoingBooking,
  ICalendarEvent,
} from "../utils/types";
import { TEMP_CALENDAR_ID } from "./eventDetails";
import type { SubscriptionHandle } from "../common/nostrRuntime";
import { useSchedulingPages } from "./schedulingPages";
import { Event } from "nostr-tools";

const INCOMING_STORAGE_KEY = "cal:booking_requests_incoming";
const OUTGOING_STORAGE_KEY = "cal:booking_requests_outgoing";

const saveIncomingToStorage = (requests: IBookingRequest[]) => {
  setSecureItem(INCOMING_STORAGE_KEY, requests);
};

const saveOutgoingToStorage = (bookings: IOutgoingBooking[]) => {
  setSecureItem(OUTGOING_STORAGE_KEY, bookings);
};

let incomingSubHandle: SubscriptionHandle | undefined;
let outgoingSubHandle: SubscriptionHandle | undefined;
let expiryTimer: ReturnType<typeof setInterval> | undefined;
const processedIncomingIds = new Set<string>();
const processedOutgoingIds = new Set<string>();

interface BookingRequestsState {
  incomingRequests: IBookingRequest[];
  outgoingBookings: IOutgoingBooking[];
  incomingUnreadCount: number;
  outgoingUnreadCount: number;
  isLoaded: boolean;

  loadCached: () => Promise<void>;
  fetchIncomingRequests: () => Promise<void>;
  fetchOutgoingBookings: () => Promise<void>;
  approveRequest: (requestId: string, calendarId: string) => Promise<void>;
  declineRequest: (requestId: string, reason?: string) => Promise<void>;
  checkExpiry: () => void;
  stopSubscriptions: () => void;
  clearCached: () => Promise<void>;
}

export const useBookingRequests = create<BookingRequestsState>((set, get) => ({
  incomingRequests: [],
  outgoingBookings: [],
  incomingUnreadCount: 0,
  outgoingUnreadCount: 0,
  isLoaded: false,

  loadCached: async () => {
    const incoming = await getSecureItem<IBookingRequest[]>(
      INCOMING_STORAGE_KEY,
      [],
    );
    const outgoing = await getSecureItem<IOutgoingBooking[]>(
      OUTGOING_STORAGE_KEY,
      [],
    );

    const pendingIncoming = incoming.filter((r) => r.status === "pending");
    const pendingOutgoing = outgoing.filter((b) => b.status === "pending");

    set({
      incomingRequests: incoming,
      outgoingBookings: outgoing,
      incomingUnreadCount: pendingIncoming.length,
      outgoingUnreadCount: pendingOutgoing.length,
      isLoaded: true,
    });
  },

  fetchIncomingRequests: async () => {
    if (incomingSubHandle) {
      incomingSubHandle.unsubscribe();
    }

    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    incomingSubHandle = subscribeBookingRequests(
      userPubkey,
      async (giftWrap: Event) => {
        if (processedIncomingIds.has(giftWrap.id)) return;
        processedIncomingIds.add(giftWrap.id);

        try {
          const details = await unwrapBookingRequest(giftWrap);

          // Check if we already have this request
          const existing = get().incomingRequests.find(
            (r) => r.giftWrapId === giftWrap.id,
          );
          if (existing) return;

          const request: IBookingRequest = {
            id: giftWrap.id,
            giftWrapId: giftWrap.id,
            schedulingPageRef: details.schedulingPageRef,
            bookerPubkey: details.bookerPubkey,
            start: details.start,
            end: details.end,
            title: details.title,
            note: details.note,
            receivedAt: Date.now(),
            status: "pending",
          };

          set((state) => {
            const incomingRequests = [...state.incomingRequests, request];
            const incomingUnreadCount = incomingRequests.filter(
              (r) => r.status === "pending",
            ).length;
            saveIncomingToStorage(incomingRequests);
            return { incomingRequests, incomingUnreadCount };
          });
        } catch (error) {
          console.error("Failed to unwrap booking request:", error);
        }
      },
    );

    // Start expiry check timer
    if (!expiryTimer) {
      expiryTimer = setInterval(
        () => {
          get().checkExpiry();
        },
        5 * 60 * 1000,
      ); // Every 5 minutes
      // Run immediately too
      get().checkExpiry();
    }
  },

  fetchOutgoingBookings: async () => {
    if (outgoingSubHandle) {
      outgoingSubHandle.unsubscribe();
    }

    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    outgoingSubHandle = subscribeBookingResponses(
      userPubkey,
      async (giftWrap: Event) => {
        if (processedOutgoingIds.has(giftWrap.id)) return;
        processedOutgoingIds.add(giftWrap.id);

        try {
          const details = await unwrapBookingResponse(giftWrap);

          // Find matching outgoing booking by scheduling page ref + time
          set((state) => {
            const outgoingBookings = state.outgoingBookings.map((booking) => {
              if (
                booking.schedulingPageRef === details.schedulingPageRef &&
                booking.start === details.start &&
                booking.end === details.end &&
                booking.status === "pending"
              ) {
                return {
                  ...booking,
                  status: details.status as IOutgoingBooking["status"],
                  respondedAt: Date.now(),
                  eventRef: details.eventRef,
                  viewKey: details.viewKey,
                  declineReason: details.reason,
                };
              }
              return booking;
            });

            const outgoingUnreadCount = outgoingBookings.filter(
              (b) => b.status === "pending",
            ).length;
            saveOutgoingToStorage(outgoingBookings);
            return { outgoingBookings, outgoingUnreadCount };
          });
        } catch (error) {
          console.error("Failed to unwrap booking response:", error);
        }
      },
    );
  },

  approveRequest: async (requestId, calendarId) => {
    const request = get().incomingRequests.find((r) => r.id === requestId);
    if (!request || request.status !== "pending") return;

    // Create a private calendar event for this appointment
    const event: ICalendarEvent = {
      id: TEMP_CALENDAR_ID,
      eventId: "",
      title: request.title,
      description: request.note || "",
      begin: request.start,
      end: request.end,
      kind: 0,
      user: "",
      participants: [request.bookerPubkey],
      categories: [],
      reference: [],
      location: [],
      geoHash: [],
      website: "",
      isPrivateEvent: true,
      createdAt: Math.floor(Date.now() / 1000),
      repeat: { rrule: null },
      rsvpResponses: [],
      image: undefined,
    };

    const result = await publishPrivateCalendarEvent(event, calendarId);

    // Extract event ref info from the published event
    const userPubkey = await getUserPublicKey();
    const dTag = result.calendarEvent.tags.find((t) => t[0] === "d")?.[1] ?? "";
    const eventRef = `32678:${userPubkey}:${dTag}`;

    // Find the view key from the gift wraps (it's encoded in the rumor)
    // The publishPrivateCalendarEvent already sent invitation gift wraps
    // Now send the booking response with approved status
    await sendBookingResponse({
      schedulingPageRef: request.schedulingPageRef,
      bookerPubkey: request.bookerPubkey,
      start: request.start,
      end: request.end,
      status: "approved",
      eventRef,
    });

    // Update request status
    set((state) => {
      const incomingRequests = state.incomingRequests.map((r) =>
        r.id === requestId
          ? { ...r, status: "approved" as const, respondedAt: Date.now() }
          : r,
      );
      const incomingUnreadCount = incomingRequests.filter(
        (r) => r.status === "pending",
      ).length;
      saveIncomingToStorage(incomingRequests);
      return { incomingRequests, incomingUnreadCount };
    });
  },

  declineRequest: async (requestId, reason) => {
    const request = get().incomingRequests.find((r) => r.id === requestId);
    if (!request || request.status !== "pending") return;

    await sendBookingResponse({
      schedulingPageRef: request.schedulingPageRef,
      bookerPubkey: request.bookerPubkey,
      start: request.start,
      end: request.end,
      status: "declined",
      reason,
    });

    set((state) => {
      const incomingRequests = state.incomingRequests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: "declined" as const,
              respondedAt: Date.now(),
              declineReason: reason,
            }
          : r,
      );
      const incomingUnreadCount = incomingRequests.filter(
        (r) => r.status === "pending",
      ).length;
      saveIncomingToStorage(incomingRequests);
      return { incomingRequests, incomingUnreadCount };
    });
  },

  checkExpiry: () => {
    const now = Date.now();
    const pages = useSchedulingPages.getState().pages;

    set((state) => {
      let changed = false;
      const incomingRequests = state.incomingRequests.map((request) => {
        if (request.status !== "pending") return request;

        // Find the scheduling page to get its expiry setting
        const pageRef = request.schedulingPageRef;
        // Extract the d-tag from the a-tag reference: "31927:pubkey:dtag"
        const pageDTag = pageRef.split(":")[2];
        const page = pages.find((p) => p.id === pageDTag);
        const expiry = page?.expiry ?? 172800; // Default 48h

        if (expiry > 0 && now - request.receivedAt > expiry * 1000) {
          changed = true;
          return { ...request, status: "expired" as const };
        }
        return request;
      });

      if (!changed) return state;

      const incomingUnreadCount = incomingRequests.filter(
        (r) => r.status === "pending",
      ).length;
      saveIncomingToStorage(incomingRequests);
      return { incomingRequests, incomingUnreadCount };
    });
  },

  stopSubscriptions: () => {
    if (incomingSubHandle) {
      incomingSubHandle.unsubscribe();
      incomingSubHandle = undefined;
    }
    if (outgoingSubHandle) {
      outgoingSubHandle.unsubscribe();
      outgoingSubHandle = undefined;
    }
    if (expiryTimer) {
      clearInterval(expiryTimer);
      expiryTimer = undefined;
    }
    processedIncomingIds.clear();
    processedOutgoingIds.clear();
  },

  clearCached: async () => {
    get().stopSubscriptions();
    set({
      incomingRequests: [],
      outgoingBookings: [],
      incomingUnreadCount: 0,
      outgoingUnreadCount: 0,
      isLoaded: false,
    });
  },
}));
