import { Event, generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import { LocalSigner, type ActiveSigner } from "@formstr/signer";
import { signerManager } from "../common/signer";
import { EventKinds } from "./kinds";
import {
  getUserPublicKey,
  selfDecrypt,
  getTagValue,
  wrapEvent,
  wrapEventAs,
  unwrapEvent,
  unwrapEventAs,
} from "./crypto";
import { publishSignedEvent, addGossipRelays, makeDTag } from "./core";
import { deleteGiftWrapAsRecipient, publishDeletionEvent } from "./events";
import { createSubscription, type StandingSubscription } from "./subscribe";
import { nostrEventToSchedulingPage } from "../utils/parser";
import type { ISchedulingPage } from "../utils/types";
import { fetchUserProfile } from "./profiles";

function getSenderDisplayName(profileEvent: Event | null, pubkey: string) {
  if (profileEvent) {
    try {
      const profile = JSON.parse(profileEvent.content);
      const name = profile.display_name || profile.name;
      if (name) return name as string;
    } catch {
      // Fall through to the public-key fallback for malformed profiles.
    }
  }
  return nip19.npubEncode(pubkey).slice(0, 12);
}

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

/**
 * Generates a fresh one-time keypair for an anonymous booker identity — never
 * derived from the real logged-in identity. Used to seal the NIP-59 seal
 * layer of an anonymous booking request so it cannot be linked back to the
 * booker's real pubkey, per the two-mode booking identity design.
 */
export function createAnonymousBookerIdentity(): {
  secretKey: Uint8Array;
  pubkey: string;
} {
  const secretKey = generateSecretKey();
  return { secretKey, pubkey: getPublicKey(secretKey) };
}

// --- Booking requests (NIP-59/NIP-17 kind 1059 gift wrap, k=1057; legacy 1057 read) ---

export async function sendBookingRequest({
  schedulingPageRef,
  creatorPubkey,
  start,
  end,
  title,
  pageName,
  note,
  dTag,
  viewKey,
  relayHints,
  identity = { mode: "self" },
}: {
  schedulingPageRef: string;
  creatorPubkey: string;
  start: number;
  end: number;
  title: string;
  pageName: string;
  note: string;
  dTag: string;
  viewKey: string;
  relayHints?: string[];
  /**
   * `"self"` (default) seals with the logged-in user's own signer, matching
   * pre-existing behavior. `"anonymous"` seals with a one-time `LocalSigner`
   * built from a fresh keypair (see `createAnonymousBookerIdentity`) so the
   * seal cannot be linked to the booker's real identity — required for
   * genuine unlinkability, since NIP-59 normally has the seal signed by the
   * real sender.
   */
  identity?: { mode: "self" } | { mode: "anonymous"; secretKey: Uint8Array };
}): Promise<Event> {
  const signer: ActiveSigner =
    identity.mode === "anonymous"
      ? new LocalSigner(identity.secretKey)
      : await signerManager.getSigner();
  const bookerPubkey = await signer.getPublicKey();
  const [bookerProfile] = await Promise.all([fetchUserProfile(bookerPubkey)]);
  const bookingRequestMessage = `${getSenderDisplayName(bookerProfile, bookerPubkey)} wants to book a slot with you for "${pageName}"`;
  const giftWrap = await wrapEventAs(
    (signingNsec) => ({
      pubkey: bookerPubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: EventKinds.Rumor,
      content: bookingRequestMessage,
      tags: [
        ["a", schedulingPageRef],
        ["start", String(Math.floor(start / 1000))],
        ["end", String(Math.floor(end / 1000))],
        ["title", title],
        ["page_name", pageName],
        ["note", note],
        ["d", dTag],
        ["viewKey", viewKey],
        ["signing_nsec", signingNsec],
      ],
    }),
    creatorPubkey,
    EventKinds.BookingRequestGiftWrap,
    [["k", EventKinds.BookingRequestOuterGiftWrap.toString()]],
    signer,
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
  pageName?: string;
  note: string;
  dTag: string;
  viewKey?: string;
  signingNsec?: string;
}> {
  const rumor = await unwrapEvent(giftWrap);
  const getTag = (name: string) => getTagValue(rumor.tags, name);
  return {
    schedulingPageRef: getTag("a"),
    bookerPubkey: rumor.pubkey,
    start: Number(getTag("start")) * 1000,
    end: Number(getTag("end")) * 1000,
    title: getTag("title"),
    pageName: getTag("page_name") || undefined,
    note: getTag("note"),
    dTag: getTag("d"),
    viewKey: getTag("viewKey") || undefined,
    signingNsec: getTag("signing_nsec") || undefined,
  };
}

/**
 * Hosts are always authenticated, so this dual-reads with a single pubkey —
 * unlike `createBookingResponsesSubscription`, which must also cover
 * locally-stored anonymous booker identities.
 */
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
        // New kind-1059 gift wraps can carry unrelated NIP-17 traffic. The
        // public classifier tag makes this subscription booking-specific.
        "#k": [EventKinds.BookingRequestOuterGiftWrap.toString()],
        limit: 50,
      },
      {
        kinds: [EventKinds.BookingRequestOuterGiftWrap],
        "#p": [pubkey],
        limit: 50,
      },
    ],
    { onEvent, onEose },
    { dedupeById: true },
  );
}

// --- Booking responses (NIP-59/NIP-17 kind 1059 gift wrap, k=1058; legacy 1058 read) ---

/**
 * `signer` defaults to the logged-in user's own signer. Pass a `LocalSigner`
 * built from a stored anonymous booking key when the response's `p` tag
 * addresses an anonymous booker identity rather than the real logged-in
 * pubkey (see `stores/bookingRequests.ts`'s per-wrap decrypt routing).
 */
export async function unwrapBookingResponse(
  giftWrap: Event,
  signer?: ActiveSigner,
): Promise<{
  schedulingPageRef: string;
  creatorPubkey: string;
  start: number;
  end: number;
  status: "approved" | "declined";
  eventRef?: string;
  viewKey?: string;
  reason?: string;
  signingNsec?: string;
}> {
  const rumor = signer
    ? await unwrapEventAs(giftWrap, signer)
    : await unwrapEvent(giftWrap);
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
    signingNsec: getTag("signing_nsec") || undefined,
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
  pageName,
  calendarEventUrl,
  onRelayComplete,
}: {
  schedulingPageRef: string;
  bookerPubkey: string;
  start: number;
  end: number;
  status: "approved" | "declined";
  eventRef?: string[];
  viewKey?: string;
  reason?: string;
  pageName: string;
  calendarEventUrl?: string;
  onRelayComplete?: (url: string, success: boolean) => void;
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
  const [creatorProfile] = await Promise.all([fetchUserProfile(userPublicKey)]);
  const creatorName = getSenderDisplayName(creatorProfile, userPublicKey);
  const bookingResponseMessage =
    status === "approved"
      ? `${creatorName} has accepted your booking request for "${pageName}". View the event in your calendar: ${calendarEventUrl}`
      : `${reason ? `${reason}. ` : ""}${creatorName} has denied your booking request for "${pageName}"`;
  const giftWrap = await wrapEvent(
    (signingNsec) => ({
      pubkey: userPublicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: EventKinds.Rumor,
      content: bookingResponseMessage,
      tags: [...tags, ["signing_nsec", signingNsec]],
    }),
    bookerPubkey,
    EventKinds.BookingResponseGiftWrap,
    [
      ["status", status],
      ["k", EventKinds.BookingResponseOuterGiftWrap.toString()],
    ],
  );
  await publishSignedEvent(giftWrap, { onRelayComplete });
  return giftWrap;
}

/**
 * `pubkeys` unions the logged-in user's pubkey (if any) with every locally-
 * stored anonymous booking pubkey, so a booker who booked anonymously still
 * receives the host's response — unlike `createBookingRequestsSubscription`,
 * which only ever needs the authenticated host's pubkey.
 */
export function createBookingResponsesSubscription(
  pubkeys: string[],
  onEvent: (giftWrap: Event) => void,
  onEose?: () => void,
): StandingSubscription {
  return createSubscription(
    () => [
      {
        kinds: [EventKinds.BookingResponseGiftWrap],
        "#p": pubkeys,
        "#k": [EventKinds.BookingResponseOuterGiftWrap.toString()],
        limit: 50,
      },
      {
        kinds: [EventKinds.BookingResponseOuterGiftWrap],
        "#p": pubkeys,
        limit: 50,
      },
    ],
    { onEvent, onEose },
    { dedupeById: true },
  );
}

// --- Dismiss (NIP-09), mirroring F-NOTIF's dismissInvitation pattern -------

/**
 * Deletes a booking-request gift wrap on behalf of its recipient (the host).
 * Uses the ephemeral signing key embedded in the rumor when available
 * (`signingNsec`); falls back to a signer-authored NIP-09 deletion request
 * for legacy wraps sent before that tag existed.
 */
export async function dismissBookingRequestWrap(
  giftWrapId: string,
  signingNsec?: string,
): Promise<void> {
  if (signingNsec) {
    await deleteGiftWrapAsRecipient(giftWrapId, signingNsec);
  } else {
    await publishDeletionEvent({
      kinds: [EventKinds.BookingRequestGiftWrap],
      eventIds: [giftWrapId],
    });
  }
}

/** Same as `dismissBookingRequestWrap`, for booking-response gift wraps. */
export async function dismissBookingResponseWrap(
  giftWrapId: string,
  signingNsec?: string,
): Promise<void> {
  if (signingNsec) {
    await deleteGiftWrapAsRecipient(giftWrapId, signingNsec);
  } else {
    await publishDeletionEvent({
      kinds: [EventKinds.BookingResponseGiftWrap],
      eventIds: [giftWrapId],
    });
  }
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
