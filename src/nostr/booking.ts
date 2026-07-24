import { Event, generateSecretKey, nip19 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import { EventKinds } from "./kinds";
import {
  getUserPublicKey,
  selfDecrypt,
  getTagValue,
  wrapEvent,
  unwrapEvent,
} from "./crypto";
import { publishSignedEvent, addGossipRelays, makeDTag } from "./core";
import { createSubscription, type StandingSubscription } from "./subscribe";
import { nostrEventToSchedulingPage } from "../utils/parser";
import type { ISchedulingPage } from "../utils/types";

/**
 * Generates a fresh d-tag + nsec-encoded viewKey for a new booking request's
 * future calendar event, so the host can publish the appointment reusing the
 * exact same identifiers the booker already added to their own calendar.
 */
export function createBookingIdentity(
  schedulingPageRef: string,
  slotStartMs: number,
): { dTag: string; viewKey: string } {
  const dTag = makeDTag(
    `booking-${schedulingPageRef}-${slotStartMs}-${Date.now()}`,
  );
  const viewKey = nip19.nsecEncode(generateSecretKey());
  return { dTag, viewKey };
}

// --- Booking requests (kind 1057 gift wrap over a 57 rumor) ---------------

export async function sendBookingRequest({
  schedulingPageRef,
  creatorPubkey,
  start,
  end,
  title,
  note,
  dTag,
  viewKey,
  relayHints,
}: {
  schedulingPageRef: string;
  creatorPubkey: string;
  start: number;
  end: number;
  title: string;
  note: string;
  dTag: string;
  viewKey: string;
  relayHints?: string[];
}): Promise<Event> {
  const userPublicKey = await getUserPublicKey();
  const giftWrap = await wrapEvent(
    {
      pubkey: userPublicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: EventKinds.BookingRequestRumor,
      content: "",
      tags: [
        ["a", schedulingPageRef],
        ["start", String(Math.floor(start / 1000))],
        ["end", String(Math.floor(end / 1000))],
        ["title", title],
        ["note", note],
        ["d", dTag],
        ["viewKey", viewKey],
      ],
    },
    creatorPubkey,
    EventKinds.BookingRequestGiftWrap,
  );
  // The gift wrap p-tags its recipient; the worker routes delivery to their
  // relays. Hints from the scheduling page's naddr aid later reads.
  addGossipRelays(relayHints ?? []);
  await publishSignedEvent(giftWrap);
  return giftWrap;
}

export async function unwrapBookingRequest(giftWrap: Event): Promise<{
  schedulingPageRef: string;
  bookerPubkey: string;
  start: number;
  end: number;
  title: string;
  note: string;
  dTag: string;
  viewKey?: string;
}> {
  const rumor = await unwrapEvent(giftWrap);
  const getTag = (name: string) => getTagValue(rumor.tags, name);
  return {
    schedulingPageRef: getTag("a"),
    bookerPubkey: rumor.pubkey,
    start: Number(getTag("start")) * 1000,
    end: Number(getTag("end")) * 1000,
    title: getTag("title"),
    note: getTag("note"),
    dTag: getTag("d"),
    viewKey: getTag("viewKey") || undefined,
  };
}

export function createBookingRequestsSubscription(
  pubkey: string,
  onEvent: (giftWrap: Event) => void,
  onEose?: () => void,
): StandingSubscription {
  return createSubscription(
    () => [
      {
        kinds: [EventKinds.BookingRequestGiftWrap],
        "#p": [pubkey],
        limit: 50,
      },
    ],
    { onEvent, onEose },
    { dedupeById: true },
  );
}

// --- Booking responses (kind 1058 gift wrap over a 58 rumor) --------------

export async function unwrapBookingResponse(giftWrap: Event): Promise<{
  schedulingPageRef: string;
  creatorPubkey: string;
  start: number;
  end: number;
  status: "approved" | "declined";
  eventRef?: string;
  viewKey?: string;
  reason?: string;
}> {
  const rumor = await unwrapEvent(giftWrap);
  const getTag = (name: string) => getTagValue(rumor.tags, name);
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

export async function sendBookingResponse({
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
  eventRef?: string[];
  viewKey?: string;
  reason?: string;
}): Promise<Event> {
  const tags: string[][] = [
    ["a", schedulingPageRef],
    ["start", String(Math.floor(start / 1000))],
    ["end", String(Math.floor(end / 1000))],
    ["status", status],
  ];
  if (status === "approved" && eventRef) tags.push(["event_ref", ...eventRef]);
  if (status === "approved" && viewKey) tags.push(["viewKey", viewKey]);
  if (status === "declined" && reason) tags.push(["reason", reason]);

  const userPublicKey = await getUserPublicKey();
  const giftWrap = await wrapEvent(
    {
      pubkey: userPublicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: EventKinds.BookingResponseRumor,
      content: "",
      tags,
    },
    bookerPubkey,
    EventKinds.BookingResponseGiftWrap,
    [["status", status]],
  );
  await publishSignedEvent(giftWrap);
  return giftWrap;
}

export function createBookingResponsesSubscription(
  pubkey: string,
  onEvent: (giftWrap: Event) => void,
  onEose?: () => void,
): StandingSubscription {
  return createSubscription(
    () => [
      {
        kinds: [EventKinds.BookingResponseGiftWrap],
        "#p": [pubkey],
        limit: 50,
      },
    ],
    { onEvent, onEose },
    { dedupeById: true },
  );
}

// --- Scheduling page (kind 31927), self-encrypted with a raw hex viewKey --

/**
 * Observes a single scheduling page by naddr coordinates and decrypts it
 * with the page's viewKey (deliberately raw hex, not nsec-encoded — see
 * stores/schedulingPages.ts). Replaceable: only ever moves forward to newer
 * versions. Callers should `.stop()` on unmount/dep change.
 */
export function fetchSchedulingPage(
  {
    pubkey,
    dTag,
    viewKeyHex,
  }: { pubkey: string; dTag: string; viewKeyHex: string },
  onPage: (page: ISchedulingPage) => void,
  onError: () => void,
): StandingSubscription {
  let newestSeen = 0;
  return createSubscription(
    () => [
      {
        kinds: [EventKinds.SchedulingPage],
        authors: [pubkey],
        "#d": [dTag],
        // No `limit`: local-relay 0.4.2's outbox fetch drops tag filters from
        // the wire REQ, so a limit would cap to the author's newest events
        // rather than this d-tag. The interest itself still matches by #d.
      },
    ],
    {
      onEvent: (event) => {
        // Replaceable: only ever move forward to newer versions.
        if (event.created_at <= newestSeen) return;
        newestSeen = event.created_at;
        let eventToProcess = event;
        try {
          const decryptedTags = selfDecrypt<string[][]>(
            hexToBytes(viewKeyHex),
            event.content,
          );
          eventToProcess = { ...event, tags: decryptedTags };
        } catch {
          // Wrong/stale key for this version; a later good version may
          // still recover the page.
          onError();
          return;
        }
        onPage(nostrEventToSchedulingPage(eventToProcess));
      },
    },
    { dedupeById: false },
  );
}
