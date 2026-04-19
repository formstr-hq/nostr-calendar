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
import { getItem, setItem } from "../common/localStorage";
import {
  getUserPublicKey,
  publishPrivateCalendarEvent,
  getRelays,
  publishToRelays,
} from "../common/nostr";
import * as nip59 from "../common/nip59";
import { EventKinds } from "../common/EventConfigs";
import { nostrRuntime } from "../common/nostrRuntime";
import type {
  IBookingRequest,
  IOutgoingBooking,
  ICalendarEvent,
} from "../utils/types";
import { TEMP_CALENDAR_ID } from "./eventDetails";
import type { SubscriptionHandle } from "../common/nostrRuntime";
import { useSchedulingPages } from "./schedulingPages";
import { Event } from "nostr-tools";

function subscribeBookingRequests(
  pubkey: string,
  onEvent: (event: Event) => void,
  onEose?: () => void,
) {
  const relayList = getRelays();
  const filter = {
    kinds: [EventKinds.BookingRequestGiftWrap],
    "#p": [pubkey],
    limit: 50,
  };
  return nostrRuntime.subscribe(relayList, [filter], { onEvent, onEose });
}

function subscribeBookingResponses(
  pubkey: string,
  onEvent: (event: Event) => void,
  onEose?: () => void,
) {
  const relayList = getRelays();
  const filter = {
    kinds: [EventKinds.BookingResponseGiftWrap],
    "#p": [pubkey],
    limit: 50,
  };
  return nostrRuntime.subscribe(relayList, [filter], { onEvent, onEose });
}

async function unwrapBookingRequest(giftWrap: Event): Promise<{
  schedulingPageRef: string;
  bookerPubkey: string;
  start: number;
  end: number;
  title: string;
  note: string;
  dTag: string;
}> {
  const rumor = await nip59.unwrapEvent(giftWrap);
  const getTag = (name: string) =>
    rumor.tags.find((t) => t[0] === name)?.[1] ?? "";
  return {
    schedulingPageRef: getTag("a"),
    bookerPubkey: rumor.pubkey,
    start: Number(getTag("start")) * 1000,
    end: Number(getTag("end")) * 1000,
    title: getTag("title"),
    note: getTag("note"),
    dTag: getTag("d"),
  };
}

async function unwrapBookingResponse(giftWrap: Event): Promise<{
  schedulingPageRef: string;
  creatorPubkey: string;
  start: number;
  end: number;
  status: "approved" | "declined";
  eventRef?: string;
  viewKey?: string;
  reason?: string;
}> {
  const rumor = await nip59.unwrapEvent(giftWrap);
  const getTag = (name: string) =>
    rumor.tags.find((t) => t[0] === name)?.[1] ?? "";
  return {
    schedulingPageRef: getTag("a"),
    creatorPubkey: rumor.pubkey,
    start: Number(getTag("start")) * 1000,
    end: Number(getTag("end")) * 1000,
    status: getTag("status") as "approved" | "declined",
    eventRef: getTag("event_ref") || undefined,
    viewKey: getTag("viewKey") || undefined,
    reason: getTag("reason") || undefined,
  };
}

async function sendBookingResponse({
  schedulingPageRef,
  bookerPubkey,
  start,
  end,
  status,
  eventRef,
  viewKey,
  reason,
}: {
  schedulingPageRef: string;
  bookerPubkey: string;
  start: number;
  end: number;
  status: "approved" | "declined";
  eventRef?: string;
  viewKey?: string;
  reason?: string;
}): Promise<Event> {
  const userPublicKey = await getUserPublicKey();
  const tags: string[][] = [
    ["a", schedulingPageRef],
    ["start", String(Math.floor(start / 1000))],
    ["end", String(Math.floor(end / 1000))],
    ["status", status],
  ];
  if (status === "approved" && eventRef) tags.push(["event_ref", eventRef]);
  if (status === "approved" && viewKey) tags.push(["viewKey", viewKey]);
  if (status === "declined" && reason) tags.push(["reason", reason]);

  const giftWrap = await nip59.wrapEvent(
    {
      pubkey: userPublicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: EventKinds.BookingResponseRumor,
      content: "",
      tags,
    },
    bookerPubkey,
    EventKinds.BookingResponseGiftWrap,
    true,
  );
  await publishToRelays(giftWrap);
  return giftWrap;
}

const INCOMING_STORAGE_KEY = "cal:booking_requests_incoming";
const OUTGOING_STORAGE_KEY = "cal:booking_requests_outgoing";

const saveIncomingToStorage = (requests: IBookingRequest[]) => {
  setItem(INCOMING_STORAGE_KEY, requests);
};

const saveOutgoingToStorage = (bookings: IOutgoingBooking[]) => {
  setItem(OUTGOING_STORAGE_KEY, bookings);
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
  addOutgoingBooking: (booking: IOutgoingBooking) => void;
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
    const incoming = getItem<IBookingRequest[]>(INCOMING_STORAGE_KEY, []);
    const outgoing = getItem<IOutgoingBooking[]>(OUTGOING_STORAGE_KEY, []);

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
    if (incomingSubHandle) return;
    if (!get().isLoaded) await get().loadCached();

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
            dTag: details.dTag,
            receivedAt: giftWrap.created_at * 1000,
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

  addOutgoingBooking: (booking) => {
    set((state) => {
      // Avoid duplicates
      if (state.outgoingBookings.some((b) => b.id === booking.id)) return state;
      const outgoingBookings = [...state.outgoingBookings, booking];
      saveOutgoingToStorage(outgoingBookings);
      return { outgoingBookings };
    });
  },

  fetchOutgoingBookings: async () => {
    if (outgoingSubHandle) return;
    if (!get().isLoaded) await get().loadCached();

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
    // using the booker's pre-generated d-tag so the event
    // auto-appears in the booker's calendar list.
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

    // Pass the booker's d-tag so the published event uses it.
    // publishPrivateCalendarEvent already sends invitation gift wraps
    // with viewKey to all participants (including booker), so the
    // booker's calendar will pick it up automatically.
    const { calendarEvent, viewKey } = await publishPrivateCalendarEvent(
      event,
      calendarId,
      request.dTag || undefined,
    );

    // Update request status immediately so the UI reflects the approval
    // without waiting for the booking response relay round-trip.
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

    // Send a booking response so the booker's outgoing bookings
    // update from "pending" to "approved". Fire-and-forget: the
    // local status is already updated above regardless of relay success.
    const eventRef = `${calendarEvent.kind}:${calendarEvent.pubkey}:${request.dTag || ""}`;
    sendBookingResponse({
      schedulingPageRef: request.schedulingPageRef,
      bookerPubkey: request.bookerPubkey,
      start: request.start,
      end: request.end,
      status: "approved",
      eventRef,
      viewKey,
    }).catch((err) => {
      console.error("Failed to send booking approval response:", err);
    });
  },

  declineRequest: async (requestId, reason) => {
    const request = get().incomingRequests.find((r) => r.id === requestId);
    if (!request || request.status !== "pending") return;

    // Update status immediately for responsive UI.
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

    // Fire-and-forget: notify the booker via relay.
    sendBookingResponse({
      schedulingPageRef: request.schedulingPageRef,
      bookerPubkey: request.bookerPubkey,
      start: request.start,
      end: request.end,
      status: "declined",
      reason,
    }).catch((err) => {
      console.error("Failed to send booking decline response:", err);
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
    // Clear persisted storage so a different user logging in
    // doesn't see stale booking data.
    setItem(INCOMING_STORAGE_KEY, []);
    setItem(OUTGOING_STORAGE_KEY, []);
    set({
      incomingRequests: [],
      outgoingBookings: [],
      incomingUnreadCount: 0,
      outgoingUnreadCount: 0,
      isLoaded: false,
    });
  },
}));
