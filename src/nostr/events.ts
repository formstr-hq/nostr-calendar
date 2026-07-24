import {
  Event,
  generateSecretKey,
  UnsignedEvent,
  nip19,
  Filter,
} from "nostr-tools";
import { v4 as uuid } from "uuid";
import dayjs from "dayjs";
import { dataLayer, type ObserveHandle } from "@formstr/local-relay";
import type { ICalendarEvent } from "../stores/events";
import { getPersistedCalendarEventId } from "../utils/calendarEventIdentity";
import {
  getUserPublicKey,
  selfEncrypt,
  selfDecrypt,
  getTagValue,
  wrapEvent,
  unwrapEvent,
  buildSelfSignedDeletion,
} from "./crypto";
import { fetchUserProfile } from "./profiles";
import {
  AddressPointer,
  NAddr,
  NSec,
  decode,
  naddrEncode,
} from "nostr-tools/nip19";
import { EventKinds } from "./kinds";
import { defaultRelays } from "../common/relayConfig";
import { useCalendarLists } from "../stores/calendarLists";
import { buildEventRef } from "../utils/calendarListTypes";
import { createLogger } from "../utils/logger";
import {
  buildAndSign,
  publishSignedEvent,
  addGossipRelays,
  nextCreatedAt,
  makeDTag,
} from "./core";
import { fetchLatest } from "./fetch";
import { fetchRelayList, fetchRelayLists } from "./relays";

const logger = createLogger("NOSTR_CORE");

function getSenderDisplayName(profileEvent: Event | null, pubkey: string) {
  if (profileEvent) {
    try {
      const profile = JSON.parse(profileEvent.content);
      const name = profile.display_name || profile.name;
      if (name) return name as string;
    } catch {
      // Malformed profile content — fall through to the pubkey fallback.
    }
  }
  return nip19.npubEncode(pubkey).slice(0, 12);
}

function buildInvitationMessage(
  senderName: string,
  title: string,
  beginMs: number,
) {
  return `${senderName} has invited you to the ${title} on ${dayjs(beginMs).format("MMM D, YYYY")}`;
}

/**
 * Publishes a private calendar event and sends gift-wrap invitations to participants.
 *
 * Flow:
 * 1. Generate a view secret key for encrypting the event content
 * 2. Encrypt event data with NIP-44 using the view key
 * 3. Sign and publish the encrypted event to relays
 * 4. Create gift-wrap invitations (NIP-59) for each participant
 * 5. Add the event reference to the user's selected calendar list
 *
 * The event reference includes the viewKey so it can be decrypted later
 * when loading events from the calendar list.
 */
async function preparePrivateCalendarEvent(
  event: ICalendarEvent,
  dTag: string,
  viewSecretKey: Uint8Array,
  previousCreatedAtSecs = 0,
) {
  const eventKind = EventKinds.PrivateCalendarEvent;
  const eventData: (string | number)[][] = [
    ["title", event.title],
    ["description", event.description],
    ["start", event.begin / 1000],
    ["end", event.end / 1000],
    ["image", event.image ?? ""],
    ["d", dTag],
  ];
  if (event.repeat?.rrule) {
    eventData.push(["L", "rrule"]);
    eventData.push(["l", event.repeat.rrule]);
  }
  if (event.notificationPreference) {
    eventData.push(["notification", event.notificationPreference]);
  }

  event.forms?.forEach((form) => {
    if (!form?.naddr) return;
    // viewKey is the form's read-only NIP-44 decryption key. We deliberately
    // never persist a Formstr `responseKey` (admin/edit secret) on a calendar
    // event — doing so would grant every recipient write access to the form.
    if (form.viewKey) {
      eventData.push(["form", form.naddr, form.viewKey]);
    } else {
      eventData.push(["form", form.naddr]);
    }
  });

  event.location.forEach((loc) => {
    eventData.push(["location", loc]);
  });

  const userPublicKey = await getUserPublicKey();
  eventData.push(["p", userPublicKey]);
  event.participants.forEach((participant) => {
    eventData.push(["p", participant]);
  });

  const eventContent = selfEncrypt(viewSecretKey, eventData);

  const signedEvent = await buildAndSign({
    pubkey: userPublicKey,
    created_at: nextCreatedAt(previousCreatedAtSecs),
    kind: eventKind,
    content: eventContent,
    tags: [["d", dTag]],
  });

  return {
    signedEvent,
    viewSecretKey,
    eventKind,
    dTag,
    userPublicKey,
  };
}

export async function publishPrivateCalendarEvent(
  event: ICalendarEvent,
  {
    onAcceptedRelays,
    onRelayComplete,
    existingDTag,
    existingViewKey,
    invitationGiftWrapTags = [],
  }: {
    onAcceptedRelays?: (url: string) => void;
    onRelayComplete?: (url: string, success: boolean) => void;
    /** Optional pre-generated d-tag (e.g. from a booking request) */
    existingDTag?: string;
    /** Optional nsec view key provided by the booker — reuse instead of generating a new one */
    existingViewKey?: string;
    /** Optional public tags to place on the invitation gift wraps. */
    invitationGiftWrapTags?: string[][];
  },
) {
  const viewSecretKey = existingViewKey
    ? (nip19.decode(existingViewKey as `nsec1${string}`).data as Uint8Array)
    : generateSecretKey();
  const dTag =
    existingDTag ||
    getPersistedCalendarEventId(event.id) ||
    makeDTag(`${JSON.stringify(event)}-${Date.now()}`);
  const { signedEvent, eventKind, userPublicKey } =
    await preparePrivateCalendarEvent(event, dTag, viewSecretKey);

  // Capture which relay accepts the event to use as a hint in invitations
  // and the creator's calendar list entry, so recipients can fetch from there.
  let publishedRelayHint = "";
  await publishSignedEvent(signedEvent, {
    onAcceptedRelays: (url) => {
      if (!publishedRelayHint) publishedRelayHint = url;
      onAcceptedRelays?.(url);
    },
    onRelayComplete,
  });

  // Gift-wrap the event keys to each participant (including the creator).
  // These serve as invitations — recipients will see them as notifications
  // and can accept them into their own calendars.
  // Warm the worker's outbox cache with the participants' relay lists first,
  // so each gift wrap (p-tagging its recipient) routes to the recipient's own
  // relays — not just the author's.
  const targetPubKeys = Array.from(new Set([...event.participants]));
  const [userProfile] = await Promise.all([
    fetchUserProfile(userPublicKey),
    fetchRelayLists(targetPubKeys),
  ]);
  const senderName = getSenderDisplayName(userProfile, userPublicKey);
  const invitationMessage = buildInvitationMessage(
    senderName,
    event.title,
    event.begin,
  );
  const giftWraps = await Promise.all(
    targetPubKeys.map(async (participant) => {
      const giftWrapEvent = await wrapEvent(
        (signingNsec) => ({
          pubkey: userPublicKey,
          created_at: Math.floor(Date.now() / 1000),
          kind: EventKinds.CalendarEventInvitationRumor,
          content: invitationMessage,
          tags: [
            ["p", participant],
            [
              "a",
              `${eventKind}:${signedEvent.pubkey}:${dTag}`,
              publishedRelayHint,
            ],
            ["viewKey", nip19.nsecEncode(viewSecretKey)],
            ["signing_nsec", signingNsec],
          ],
        }),
        participant,
        EventKinds.CalendarEventGiftWrap,
        [...invitationGiftWrapTags, ["k", "1052"]],
      );
      return { giftWrap: giftWrapEvent, participant };
    }),
  );
  await Promise.all(
    giftWraps.map(({ giftWrap: gw }) => publishSignedEvent(gw)),
  );

  // Add the event reference to the creator's calendar list.
  // The ref includes the viewKey and relay hint so the event can be
  // decrypted and fetched from the correct relay later.
  const eventRef = buildEventRef({
    kind: eventKind,
    authorPubkey: userPublicKey,
    eventDTag: dTag,
    relayUrl: publishedRelayHint,
    viewKey: nip19.nsecEncode(viewSecretKey),
  });

  return {
    eventRef,
    authorPubkey: userPublicKey,
    calendarEvent: signedEvent,
    giftWraps: giftWraps.map(({ giftWrap: gw }) => gw),
    dTag,
    viewKey: nip19.nsecEncode(viewSecretKey),
  };
}

export async function editPrivateCalendarEvent(
  event: ICalendarEvent,
  calendarId: string,
  previousParticipants: string[] = [],
  onAcceptedRelays?: (url: string) => void,
  onRelayComplete?: (url: string, success: boolean) => void,
) {
  const dTag = event.id;
  const viewSecretKey = nip19.decode(event.viewKey as NSec).data;
  // ICalendarEvent.createdAt is seconds when parsed from a relay event but
  // milliseconds for locally constructed drafts — only trust second-scale
  // values as the previous version's timestamp.
  const previousCreatedAtSecs =
    event.createdAt && event.createdAt < 1e12 ? event.createdAt : 0;
  const { signedEvent, eventKind, userPublicKey } =
    await preparePrivateCalendarEvent(
      event,
      dTag,
      viewSecretKey,
      previousCreatedAtSecs,
    );

  let publishedRelayHint = "";
  await publishSignedEvent(signedEvent, {
    onAcceptedRelays: (url) => {
      if (!publishedRelayHint) publishedRelayHint = url;
      onAcceptedRelays?.(url);
    },
    onRelayComplete,
  });

  // Send gift wraps to participants that weren't in the previous version.
  // Warm the worker's outbox cache first so the p-tagged wraps route to the
  // recipients' own relays.
  const previousSet = new Set(previousParticipants);
  const newParticipants = event.participants.filter((p) => !previousSet.has(p));
  if (newParticipants.length > 0) {
    const [userProfile] = await Promise.all([
      fetchUserProfile(userPublicKey),
      fetchRelayLists(newParticipants),
    ]);
    const senderName = getSenderDisplayName(userProfile, userPublicKey);
    const invitationMessage = buildInvitationMessage(
      senderName,
      event.title,
      event.begin,
    );
    const giftWraps = await Promise.all(
      newParticipants.map(async (participant) => {
        const giftWrapEvent = await wrapEvent(
          (signingNsec) => ({
            pubkey: userPublicKey,
            created_at: Math.floor(Date.now() / 1000),
            kind: EventKinds.CalendarEventInvitationRumor,
            content: invitationMessage,
            tags: [
              ["p", participant],
              [
                "a",
                `${eventKind}:${userPublicKey}:${dTag}`,
                publishedRelayHint,
              ],
              ["viewKey", nip19.nsecEncode(viewSecretKey)],
              ["signing_nsec", signingNsec],
            ],
          }),
          participant,
          EventKinds.CalendarEventGiftWrap,
          [["k", "1052"]],
        );
        return { giftWrap: giftWrapEvent, participant };
      }),
    );
    await Promise.all(
      giftWraps.map(({ giftWrap: gw }) => publishSignedEvent(gw)),
    );
  }

  const eventCoordinate = `${eventKind}:${userPublicKey}:${dTag}`;
  // Preserve the relay hint from the existing event so the updated ref still
  // points to the relay where the event lives.  Without this the relay URL is
  // dropped on every edit, making subsequent fetches miss the event.
  const eventRef = buildEventRef({
    kind: eventKind,
    authorPubkey: userPublicKey,
    eventDTag: dTag,
    relayUrl: event.relayHint ?? "",
    viewKey: nip19.nsecEncode(viewSecretKey),
  });

  await useCalendarLists
    .getState()
    .moveEventToCalendar(calendarId, eventCoordinate, eventRef);

  return {
    // Carry the published timestamp forward so a follow-up edit of this
    // in-memory event keeps the monotonic created_at chain.
    event: { ...event, createdAt: signedEvent.created_at },
    calendarId,
    signedEvent,
  };
}

export async function getDetailsFromGiftWrap(giftWrapEvent: Event) {
  const rumor = await unwrapEvent(giftWrapEvent);
  const aTag = rumor.tags.find((tag) => tag[0] === "a");
  if (!aTag) {
    console.log(rumor);
    throw new Error("invalid rumor. a tag not found");
  }
  const eventId = aTag[1].split(":")[2]; // Extract event id from the tag
  const authorPubkey = aTag[1].split(":")[1]; // Extract author pubkey from the tag
  const kind = Number(aTag[1].split(":")[0]); // Extract kind from the tag
  const relayHint = aTag[2] || ""; // Relay hint indicating where the main event is published
  const viewKey = getTagValue(rumor.tags, "viewKey");
  if (!viewKey) {
    throw new Error("invalid rumor: viewKey not found");
  }
  // Present on invitations sent after the NIP-17 rumor switch; absent on
  // older still-pending invitations decrypted from before that change.
  const signingNsec = getTagValue(rumor.tags, "signing_nsec") || undefined;
  return {
    eventId,
    viewKey,
    authorPubkey,
    kind,
    relayHint,
    createdAt: rumor.created_at,
    message: rumor.content || undefined,
    signingNsec,
  };
}

/**
 * Deletes a gift wrap on behalf of its recipient via NIP-09, using the
 * ephemeral signing key the sender embedded in the (encrypted) rumor —
 * see the `signing_nsec` tag added in `getDetailsFromGiftWrap`. Older
 * invitations sent before that change have no `signingNsec` and can't be
 * deleted this way; callers should fall back to the existing kind-84
 * participant-removal notice for those.
 */
export async function deleteGiftWrapAsRecipient(
  giftWrapId: string,
  signingNsec: string,
): Promise<void> {
  const secretKey = nip19.decode(signingNsec as NSec).data;
  const deletion = buildSelfSignedDeletion(secretKey, [giftWrapId]);
  await publishSignedEvent(deletion);
}

/**
 * Observes gift-wrapped calendar event invitations.
 * Each gift wrap contains an encrypted rumor with the event ID and view key.
 *
 * @param limit - Maximum number of gift wraps to fetch (for "last N" queries)
 */
export const fetchCalendarGiftWraps = (
  {
    participants,
    since,
    until,
    limit,
  }: { participants: string[]; since?: number; until?: number; limit?: number },
  onEvent: (event: {
    eventId: string;
    viewKey: string;
    authorPubkey: string;
    kind: number;
    relayHint: string;
    originalInvitationId: string;
    createdAt: number;
    message?: string;
    signingNsec?: string;
  }) => void,
  onEose: () => void,
): ObserveHandle => {
  const filter: Filter = {
    kinds: [EventKinds.CalendarEventGiftWrap],
    "#p": participants,
    ...(since && { since }),
    ...(until && { until }),
    ...(limit && { limit }),
  };

  return dataLayer.observe([filter], {
    onEvent: async (event: Event) => {
      try {
        const unWrappedEvent = await getDetailsFromGiftWrap(event);
        onEvent({ ...unWrappedEvent, originalInvitationId: event.id });
      } catch (error) {
        console.error("Failed to unwrap gift wrap:", error);
      }
    },
    onEose,
  });
};

export function viewPrivateEvent(calendarEvent: Event, viewKey: string) {
  const viewPrivateKey = nip19.decode(viewKey as NSec).data;
  try {
    const decryptedTags = selfDecrypt<string[][]>(
      viewPrivateKey,
      calendarEvent.content,
    );

    return {
      ...calendarEvent,
      tags: decryptedTags,
    }; // Return the decrypted event details
  } catch (error) {
    logger.error("Could not decrypt event", calendarEvent, viewKey, error);
  }
  return null;
}

/**
 * Observes private calendar events by their d-tag IDs. Relay hints (e.g. from
 * calendar-list refs) are fed to the worker's gossip pool for discovery.
 */
export function fetchPrivateCalendarEvents(
  {
    eventIds,
    authors,
    kinds,
    since,
    until,
    relays,
  }: {
    kinds: number[];
    eventIds: string[];
    authors?: string[];
    since?: number;
    until?: number;
    relays?: string[];
  },
  onEvent: (event: Event) => void,
  onEose?: () => void,
): ObserveHandle {
  addGossipRelays(relays ?? []);
  const filter: Filter = {
    kinds: kinds,
    "#d": eventIds,
    ...(authors && authors.length > 0 && { authors }),
    ...(since && { since }),
    ...(until && { until }),
  };

  return dataLayer.observe([filter], {
    onEvent: (event: Event) => {
      onEvent(event);
    },
    onEose,
  });
}

export const fetchCalendarEvents = (
  { since, until }: { since?: number; until?: number },
  onEvent: (event: Event) => void,
): ObserveHandle => {
  const filter: Filter = {
    kinds: [EventKinds.PublicCalendarEvent],
    ...(since && { since }),
    ...(until && { until }),
  };

  return dataLayer.observe([filter], {
    onEvent: (event: Event) => {
      onEvent(event);
    },
  });
};

export const publishPublicCalendarEvent = async (
  event: ICalendarEvent,
  onAcceptedRelays?: (url: string) => void,
  onRelayComplete?: (url: string, success: boolean) => void,
) => {
  const pubKey = await getUserPublicKey();
  const id = getPersistedCalendarEventId(event.id) ?? uuid();
  const tags = [
    ["title", event.title],
    ["d", id],
    ["start", String(Math.floor(event.begin / 1000))],
    ["end", String(Math.floor(event.end / 1000))],
  ];
  if (event.image) {
    tags.push(["image", event.image]);
  }

  if (event.location.length > 0) {
    event.location.map((location) => {
      tags.push(["location", location]);
    });
  }

  if (event.participants.length > 0) {
    event.participants.forEach((participant) => {
      tags.push(["p", participant]);
    });
  }
  const unsigned: UnsignedEvent = {
    kind: EventKinds.PublicCalendarEvent,
    pubkey: pubKey,
    tags: tags,
    content: event.description,
    created_at: Math.floor(Date.now() / 1000),
  };
  const fullEvent = await buildAndSign(unsigned);
  const result = await publishSignedEvent(fullEvent, {
    onAcceptedRelays,
    onRelayComplete,
  });

  return { result, id, pubKey, signedEvent: fullEvent };
};

/**
 * Publishes a NIP-09 deletion event (kind 5) to request deletion of events.
 */
export async function publishDeletionEvent({
  kinds,
  coordinates = [],
  eventIds = [],
  reason = "",
}: {
  kinds: number[];
  coordinates?: string[];
  eventIds?: string[];
  reason?: string;
}) {
  const userPublicKey = await getUserPublicKey();
  const tags: string[][] = [];

  for (const id of eventIds) {
    tags.push(["e", id]);
  }
  for (const coord of coordinates) {
    tags.push(["a", coord]);
  }
  for (const kind of kinds) {
    tags.push(["k", kind.toString()]);
  }

  const signedEvent = await buildAndSign({
    pubkey: userPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.DeletionEvent,
    content: reason,
    tags,
  });

  await publishSignedEvent(signedEvent);

  return signedEvent;
}

/**
 * Publishes a kind 84 participant removal event to signal the user
 * wants to opt out of an event they were invited to.
 * Same tag structure as a deletion event.
 */
export async function publishParticipantRemovalEvent({
  kinds,
  coordinates = [],
  eventIds = [],
  reason = "",
}: {
  kinds: number[];
  coordinates?: string[];
  eventIds?: string[];
  reason?: string;
}) {
  const userPublicKey = await getUserPublicKey();
  const tags: string[][] = [];

  for (const id of eventIds) {
    tags.push(["e", id]);
  }
  for (const coord of coordinates) {
    tags.push(["a", coord]);
  }
  for (const kind of kinds) {
    tags.push(["k", kind.toString()]);
  }

  const signedEvent = await buildAndSign({
    pubkey: userPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.ParticipantRemoval,
    content: reason,
    tags,
  });

  await publishSignedEvent(signedEvent);

  return signedEvent;
}

export const encodeNAddr = (
  address: Omit<AddressPointer, "relays">,
  relays?: string[],
) => {
  return naddrEncode({ ...address, relays: relays ?? defaultRelays });
};

export const fetchCalendarEvent = async (
  naddr: NAddr,
): Promise<{ event: Event; relayHint: string }> => {
  const { data } = decode(naddr as NAddr);
  addGossipRelays(data.relays ?? []);
  try {
    // Warming the author's relay list also teaches the worker their outbox.
    addGossipRelays(await fetchRelayList(data.pubkey));
  } catch {
    // Hints only — the user relays may already carry the event.
  }
  // No `limit`: local-relay 0.4.2's outbox fetch drops tag filters from the
  // wire REQ, so a limit would cap to the author's newest events rather than
  // this d-tag. The interest itself still matches by #d.
  const filter: Filter = {
    "#d": [data.identifier],
    kinds: [data.kind],
    authors: [data.pubkey],
  };

  const event = await fetchLatest([filter]);
  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }
  return { event, relayHint: data.relays?.[0] ?? "" };
};
