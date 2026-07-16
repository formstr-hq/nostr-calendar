import {
  Event,
  generateSecretKey,
  Relay,
  UnsignedEvent,
  nip44,
  getPublicKey,
  nip19,
  getEventHash,
  Filter,
} from "nostr-tools";
import { normalizeURL } from "nostr-tools/utils";
import { v4 as uuid } from "uuid";
import { ICalendarEvent } from "../stores/events";
import { AbstractRelay } from "nostr-tools/abstract-relay";
import * as nip59 from "./nip59";
import {
  AddressPointer,
  NAddr,
  NSec,
  decode,
  naddrEncode,
} from "nostr-tools/nip19";
import { signerManager } from "./signer";
import { RSVPStatus } from "../utils/types";
import { EventKinds } from "./EventConfigs";
import { nostrRuntime } from "./nostrRuntime";
import { useRelayStore } from "../stores/relays";
import { useCalendarLists } from "../stores/calendarLists";
import { buildEventRef } from "../utils/calendarListTypes";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  busyListToTags,
  busyListDTag,
  nostrEventToBusyList,
} from "../utils/parser";
import type { IBusyList } from "../utils/types";
import { createLogger } from "../utils/logger";
import { getPersistedCalendarEventId } from "../utils/calendarEventIdentity";

export const defaultRelays = [
  "wss://relay.damus.io/",
  "wss://relay.primal.net/",
  "wss://nos.lol",
  "wss://relay.nostr.wirednet.jp/",
  "wss://nostr-01.yakihonne.com",
  "wss://relay.snort.social",
  "wss://nostr21.com",
];

const logger = createLogger("NOSTR_CORE");

const _onAcceptedRelays = console.log.bind(
  console,
  "Successfully published to relay: ",
);

export const getRelays = (): string[] => {
  const userRelays = useRelayStore.getState().relays;
  return userRelays.length > 0 ? userRelays : defaultRelays;
};

const normalizeRelayList = (relays: string[]): string[] => {
  const normalized = new Set<string>();
  relays.forEach((url) => {
    try {
      normalized.add(normalizeURL(url));
    } catch {
      // Ignore malformed relay hints from external naddr/form links.
    }
  });
  return [...normalized];
};

const getDiscoveryRelays = (hintRelays: string[] = []): string[] => {
  // Query/discovery only: merge hints with broad fallback relays so fetches
  // survive stale or incomplete naddr relay hints. Do not reuse this helper
  // for publishing, where explicit relay targets must not be expanded to the
  // public default relay set.
  return normalizeRelayList([
    ...hintRelays,
    ...defaultRelays,
    ...useRelayStore.getState().relays,
  ]);
};

export const getPrivateRSVPPublishRelays = (relayHint?: string): string[] => {
  const hintedRelays = relayHint ? normalizeRelayList([relayHint]) : [];
  if (hintedRelays.length > 0) {
    return hintedRelays;
  }

  return getRelays().map(normalizeURL);
};

export async function getUserPublicKey() {
  const signer = await signerManager.getSigner();
  const pubKey = await signer.getPublicKey();
  return pubKey;
}

export const ensureRelay = async (url: string): Promise<AbstractRelay> => {
  const relay = new Relay(url);
  await relay.connect();
  return relay;
};

export interface RSVPPayload {
  status: RSVPStatus; // accepted | declined | tentative
  suggestedStart?: number; // unix seconds
  suggestedEnd?: number; // unix seconds
  comment?: string;
}

/**
 * Builds NIP-52-style RSVP tags carrying the questionnaire data:
 *
 *   ["a", "<kind>:<authorPubkey>:<dTag>", relayHint?]
 *   ["status", "accepted"|"declined"|"tentative"]
 *   ["start", "<unix>"]?
 *   ["end",   "<unix>"]?
 *
 * The free-text comment is placed in `content` by the public RSVP publisher.
 */
function buildRSVPTags(opts: {
  referenceKind: number;
  authorPubKey: string;
  eventDTag: string;
  relayHint?: string;
  payload: RSVPPayload;
}): string[][] {
  const aValue = `${opts.referenceKind}:${opts.authorPubKey}:${opts.eventDTag}`;
  const tags: string[][] = [
    opts.relayHint ? ["a", aValue, opts.relayHint] : ["a", aValue],
    ["status", opts.payload.status],
  ];
  if (opts.payload.suggestedStart) {
    tags.push(["start", String(opts.payload.suggestedStart)]);
  }
  if (opts.payload.suggestedEnd) {
    tags.push(["end", String(opts.payload.suggestedEnd)]);
  }
  return tags;
}

function getRsvpDTag(
  responderPubkey: string,
  authorPubKey: string,
  eventId: string,
) {
  return bytesToHex(
    sha256(utf8ToBytes(`${responderPubkey}:${authorPubKey}:${eventId}`)),
  ).substring(0, 30);
}

function normalizeRsvpPayload(
  payload: Partial<RSVPPayload> | null | undefined,
): Pick<
  RSVPRecord,
  "status" | "suggestedStart" | "suggestedEnd" | "comment"
> | null {
  if (!payload) return null;
  if (
    payload.status !== RSVPStatus.accepted &&
    payload.status !== RSVPStatus.declined &&
    payload.status !== RSVPStatus.tentative
  ) {
    return null;
  }

  const suggestedStart =
    payload.suggestedStart !== undefined
      ? Number(payload.suggestedStart)
      : undefined;
  const suggestedEnd =
    payload.suggestedEnd !== undefined
      ? Number(payload.suggestedEnd)
      : undefined;

  return {
    status: payload.status,
    suggestedStart: Number.isFinite(suggestedStart)
      ? suggestedStart
      : undefined,
    suggestedEnd: Number.isFinite(suggestedEnd) ? suggestedEnd : undefined,
    comment: payload.comment ?? "",
  };
}

function parsePrivateRSVPEvent(
  event: Event,
  viewKey: string,
): RSVPRecord | null {
  const aTag = event.tags.find((tag) => tag[0] === "a")?.[1];
  if (!aTag) return null;

  const viewPrivateKey = nip19.decode(viewKey as NSec).data;
  const decryptedContent = nip44.decrypt(
    event.content,
    nip44.getConversationKey(viewPrivateKey, getPublicKey(viewPrivateKey)),
  );

  const payload = normalizeRsvpPayload(
    JSON.parse(decryptedContent) as Partial<RSVPPayload>,
  );
  if (!payload) return null;

  return {
    pubkey: event.pubkey,
    status: payload.status,
    suggestedStart: payload.suggestedStart,
    suggestedEnd: payload.suggestedEnd,
    comment: payload.comment,
    createdAt: event.created_at,
    eventCoord: aTag,
  };
}

/**
 * Publishes an RSVP for a private calendar event.
 *
 * The RSVP is published as a private RSVP event (kind 32069) whose
 * payload is encrypted with the event's shared viewKey. Readers discover
 * it by the calendar-event "a" tag and can decrypt it only if they know
 * that viewKey.
 */
export async function publishPrivateRSVPEvent(params: {
  authorPubKey: string;
  eventId: string; // d-tag of the calendar event
  referenceKind: number; // EventKinds.PrivateCalendarEvent
  relayHint?: string;
  viewKey: string;
  payload: RSVPPayload;
}) {
  const responderPubkey = await getUserPublicKey();
  const tags: string[][] = [
    params.relayHint
      ? [
          "a",
          `${params.referenceKind}:${params.authorPubKey}:${params.eventId}`,
          params.relayHint,
        ]
      : [
          "a",
          `${params.referenceKind}:${params.authorPubKey}:${params.eventId}`,
        ],
    ["d", getRsvpDTag(responderPubkey, params.authorPubKey, params.eventId)],
  ];
  const viewPrivateKey = nip19.decode(params.viewKey as NSec).data;
  const encryptedContent = nip44.encrypt(
    JSON.stringify(params.payload),
    nip44.getConversationKey(viewPrivateKey, getPublicKey(viewPrivateKey)),
  );
  const unsigned: UnsignedEvent = {
    pubkey: responderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.PrivateRSVPEvent,
    content: encryptedContent,
    tags,
  };
  const signer = await signerManager.getSigner();
  const signed = await signer.signEvent(unsigned);
  signed.id = getEventHash(unsigned);

  await publishToRelays(
    signed,
    undefined,
    getPrivateRSVPPublishRelays(params.relayHint),
  );
  nostrRuntime.addEvent(signed);
}

/**
 * Publishes a NIP-52 RSVP (kind 31925) for a public calendar event.
 * Tags carry status + suggested times; comment goes in content.
 */
export async function publishPublicRSVPEvent(params: {
  authorPubKey: string;
  eventId: string;
  relayHint?: string;
  payload: RSVPPayload;
}) {
  const responderPubkey = await getUserPublicKey();
  const tags = buildRSVPTags({
    referenceKind: EventKinds.PublicCalendarEvent,
    authorPubKey: params.authorPubKey,
    eventDTag: params.eventId,
    relayHint: params.relayHint,
    payload: params.payload,
  });
  // The d-tag for the RSVP itself: deterministic per (responder, event)
  // so a single replaceable event holds the latest status per responder.
  const rsvpDTag = getRsvpDTag(
    responderPubkey,
    params.authorPubKey,
    params.eventId,
  );
  tags.push(["d", rsvpDTag]);

  const unsigned: UnsignedEvent = {
    pubkey: responderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.PublicRSVPEvent,
    content: params.payload.comment ?? "",
    tags,
  };
  const signer = await signerManager.getSigner();
  const signed = await signer.signEvent(unsigned);
  signed.id = getEventHash(unsigned);
  await publishToRelays(signed);
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
    // event \u2014 doing so would grant every recipient write access to the form.
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

  const viewPublicKey = getPublicKey(viewSecretKey);
  const eventContent = nip44.encrypt(
    JSON.stringify(eventData),
    nip44.getConversationKey(viewSecretKey, viewPublicKey),
  );

  const unsignedCalendarEvent: UnsignedEvent = {
    pubkey: userPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: eventKind,
    content: eventContent,
    tags: [["d", dTag]],
  };
  const signer = await signerManager.getSigner();
  const signedEvent = await signer.signEvent(unsignedCalendarEvent);
  const evtId = getEventHash(unsignedCalendarEvent);
  signedEvent.id = evtId;

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
    waitForAll = true,
  }: {
    onAcceptedRelays?: (url: string) => void;
    onRelayComplete?: (url: string, success: boolean) => void;
    /** Optional pre-generated d-tag (e.g. from a booking request) */
    existingDTag?: string;
    /** Optional nsec view key provided by the booker — reuse instead of generating a new one */
    existingViewKey?: string;
    /** Optional public tags to place on the invitation gift wraps. */
    invitationGiftWrapTags?: string[][];
    waitForAll?: boolean;
  },
) {
  const viewSecretKey = existingViewKey
    ? (nip19.decode(existingViewKey as `nsec1${string}`).data as Uint8Array)
    : generateSecretKey();
  const dTag =
    existingDTag ||
    getPersistedCalendarEventId(event.id) ||
    bytesToHex(
      sha256(utf8ToBytes(`${JSON.stringify(event)}-${Date.now()}`)),
    ).substring(0, 30);
  const { signedEvent, eventKind, userPublicKey } =
    await preparePrivateCalendarEvent(event, dTag, viewSecretKey);

  // Capture which relay accepts the event to use as a hint in invitations
  // and the creator's calendar list entry, so recipients can fetch from there.
  let publishedRelayHint = "";
  await publishToRelays(
    signedEvent,
    (url) => {
      if (!publishedRelayHint) publishedRelayHint = url;
      onAcceptedRelays?.(url);
    },
    undefined,
    { waitForAll, onRelayComplete },
  );

  nostrRuntime.addEvent(signedEvent);

  // Gift-wrap the event keys to each participant (including the creator).
  // These serve as invitations — recipients will see them as notifications
  // and can accept them into their own calendars.
  // Fetch all participants' relay lists in one query so each gift wrap is
  // published to the recipient's own relays — not the author's.
  const targetPubKeys = Array.from(new Set([...event.participants]));
  const [participantRelayMap, ...giftWraps] = await Promise.all([
    fetchRelayLists(targetPubKeys),
    ...targetPubKeys.map(async (participant) => {
      const giftWrap = await nip59.wrapEvent(
        {
          pubkey: userPublicKey,
          created_at: Math.floor(Date.now() / 1000),
          kind: EventKinds.CalendarEventRumor,
          content: "",
          tags: [
            [
              "a",
              `${eventKind}:${signedEvent.pubkey}:${dTag}`,
              publishedRelayHint,
            ],
            ["viewKey", nip19.nsecEncode(viewSecretKey)],
          ],
        },
        participant,
        EventKinds.CalendarEventGiftWrap,
        invitationGiftWrapTags,
      );
      return { giftWrap, participant };
    }),
  ]);
  await Promise.all(
    giftWraps.map(async ({ giftWrap, participant }) => {
      const relays = participantRelayMap.get(participant) ?? defaultRelays;
      await publishToRelays(giftWrap, undefined, relays);
    }),
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
    giftWraps: giftWraps.map(({ giftWrap }) => giftWrap),
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
  const { signedEvent, eventKind, userPublicKey } =
    await preparePrivateCalendarEvent(event, dTag, viewSecretKey);

  let publishedRelayHint = "";
  await publishToRelays(
    signedEvent,
    (url) => {
      if (!publishedRelayHint) publishedRelayHint = url;
      onAcceptedRelays?.(url);
    },
    undefined,
    { waitForAll: true, onRelayComplete },
  );

  // Add to local EventStore + offline cache immediately so the edited event
  // is available offline without waiting for the relay echo.
  nostrRuntime.addEvent(signedEvent);

  // Send gift wraps to participants that weren't in the previous version.
  const previousSet = new Set(previousParticipants);
  const newParticipants = event.participants.filter((p) => !previousSet.has(p));
  if (newParticipants.length > 0) {
    const [participantRelayMap, ...giftWraps] = await Promise.all([
      fetchRelayLists(newParticipants),
      ...newParticipants.map(async (participant) => {
        const giftWrap = await nip59.wrapEvent(
          {
            pubkey: userPublicKey,
            created_at: Math.floor(Date.now() / 1000),
            kind: EventKinds.CalendarEventRumor,
            content: "",
            tags: [
              [
                "a",
                `${eventKind}:${userPublicKey}:${dTag}`,
                publishedRelayHint,
              ],
              ["viewKey", nip19.nsecEncode(viewSecretKey)],
            ],
          },
          participant,
          EventKinds.CalendarEventGiftWrap,
        );
        return { giftWrap, participant };
      }),
    ]);
    await Promise.all(
      giftWraps.map(async ({ giftWrap, participant }) => {
        const relays = participantRelayMap.get(participant) ?? defaultRelays;
        console.log(`Publishing invitation for ${participant} to ${relays}`);
        await publishToRelays(giftWrap, undefined, relays);
      }),
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
    event,
    calendarId,
    signedEvent,
  };
}

export async function getDetailsFromGiftWrap(giftWrap: Event) {
  const rumor = await nip59.unwrapEvent(giftWrap);
  const aTag = rumor.tags.find((tag) => tag[0] === "a");
  if (!aTag) {
    console.log(rumor);
    throw new Error("invalid rumor. a tag not found");
  }
  const eventId = aTag[1].split(":")[2]; // Extract event id from the tag
  const authorPubkey = aTag[1].split(":")[1]; // Extract author pubkey from the tag
  const kind = Number(aTag[1].split(":")[0]); // Extract kind from the tag
  const relayHint = aTag[2] || ""; // Relay hint indicating where the main event is published
  const viewKey = rumor.tags.find((tag) => tag[0] === "viewKey")?.[1];
  if (!viewKey) {
    throw new Error("invalid rumor: viewKey not found");
  }
  return {
    eventId,
    viewKey,
    authorPubkey,
    kind,
    relayHint,
    createdAt: rumor.created_at,
  };
}

/**
 * Fetches gift-wrapped calendar event invitations via nostrRuntime.
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
  }) => void,
  onEose: () => void,
) => {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.CalendarEventGiftWrap],
    "#p": participants,
    ...(since && { since }),
    ...(until && { until }),
    ...(limit && { limit }),
  };

  // Use nostrRuntime for subscription management and deduplication
  return nostrRuntime.subscribe(relayList, filter, {
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

/**
 * RSVP record returned by RSVP fetch helpers. Carries the questionnaire
 * data (status + suggested times + free-text comment) along with the
 * responder's pubkey and the event coordinate the RSVP refers to.
 */
export interface RSVPRecord {
  pubkey: string; // responder
  status: RSVPStatus;
  suggestedStart?: number; // unix seconds
  suggestedEnd?: number; // unix seconds
  comment: string;
  createdAt: number;
  eventCoord: string; // "<kind>:<authorPubkey>:<dTag>"
}

const parseRSVPTags = (
  pubkey: string,
  tags: string[][],
  content: string,
  createdAt: number,
): RSVPRecord | null => {
  const aTag = tags.find((t) => t[0] === "a")?.[1];
  if (!aTag) return null;
  const payload = normalizeRsvpPayload({
    status: tags.find((t) => t[0] === "status")?.[1] as RSVPStatus | undefined,
    suggestedStart: tags.find((t) => t[0] === "start")?.[1]
      ? Number(tags.find((t) => t[0] === "start")?.[1])
      : undefined,
    suggestedEnd: tags.find((t) => t[0] === "end")?.[1]
      ? Number(tags.find((t) => t[0] === "end")?.[1])
      : undefined,
    comment: content || "",
  });
  if (!payload) return null;

  return {
    pubkey,
    status: payload.status,
    suggestedStart: payload.suggestedStart,
    suggestedEnd: payload.suggestedEnd,
    comment: payload.comment,
    createdAt,
    eventCoord: aTag,
  };
};

/**
 * Subscribes to current private RSVP events (kind 32069) and emits parsed
 * RSVP records that match the supplied event coordinate. Use this on the
 * event detail page to aggregate participant statuses for a private calendar
 * event.
 */
export const fetchPrivateEventRSVPs = (
  params: {
    eventCoord: string;
    viewKey: string;
    relayHint?: string;
  },
  onRSVP: (record: RSVPRecord) => void,
  onEose?: () => void,
) => {
  const privateRelayList = getDiscoveryRelays(
    params.relayHint ? [params.relayHint] : [],
  );
  const handles: Array<{ close?: () => void; unsubscribe?: () => void }> = [];
  handles.push(
    nostrRuntime.subscribe(
      privateRelayList,
      {
        kinds: [EventKinds.PrivateRSVPEvent],
        "#a": [params.eventCoord],
      },
      {
        onEvent: (event: Event) => {
          try {
            const record = parsePrivateRSVPEvent(event, params.viewKey);
            if (!record) return;
            if (record.eventCoord !== params.eventCoord) return;
            onRSVP(record);
          } catch (error) {
            console.error("Failed to process private RSVP:", error);
          }
        },
        onEose,
      },
    ),
  );

  return {
    close: () => {
      handles.forEach((handle) => handle.close?.());
    },
    unsubscribe: () => {
      handles.forEach((handle) => handle.unsubscribe?.());
    },
  };
};

/**
 * Subscribes to public NIP-52 RSVPs (kind 31925) for the given event
 * coordinate. Tags are read directly off the public event.
 */
export const fetchPublicEventRSVPs = (
  params: { eventCoord: string },
  onRSVP: (record: RSVPRecord) => void,
  onEose?: () => void,
) => {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.PublicRSVPEvent],
    "#a": [params.eventCoord],
  };
  return nostrRuntime.subscribe(relayList, filter, {
    onEvent: (event: Event) => {
      const record = parseRSVPTags(
        event.pubkey,
        event.tags,
        event.content,
        event.created_at,
      );
      if (!record) return;
      onRSVP(record);
    },
    onEose,
  });
};

export function viewPrivateEvent(calendarEvent: Event, viewKey: string) {
  const viewPrivateKey = nip19.decode(viewKey as NSec).data;
  try {
    const decryptedContent = nip44.decrypt(
      calendarEvent.content,
      nip44.getConversationKey(viewPrivateKey, getPublicKey(viewPrivateKey)),
    );

    return {
      ...calendarEvent,
      tags: JSON.parse(decryptedContent),
    }; // Return the decrypted event details
  } catch (error) {
    logger.error("Could not decrypt event", calendarEvent, viewKey, error);
  }
  return null;
}

/**
 * Fetches private calendar events by their d-tag IDs via nostrRuntime.
 * Subscribes to both regular and recurring event kinds.
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
) {
  // Merge hint relays first so they're tried with priority, then fall back to defaults
  const relayList = relays
    ? [...new Set([...relays, ...getRelays()])]
    : getRelays();
  const filter: Filter = {
    kinds: kinds,
    "#d": eventIds,
    ...(authors && authors.length > 0 && { authors }),
    ...(since && { since }),
    ...(until && { until }),
  };

  return nostrRuntime.subscribe(relayList, filter, {
    onEvent: (event: Event) => {
      onEvent(event);
    },
    onEose,
  });
}

export const publishToRelays = (
  event: Event,
  onAcceptedRelays: (url: string) => void = _onAcceptedRelays,
  relays?: string[],
  options: {
    waitForAll?: boolean;
    onRelayComplete?: (url: string, success: boolean) => void;
  } = {},
) => {
  const { onRelayComplete } = options;
  const relayList = Array.from(
    new Set((relays ?? getRelays()).map(normalizeURL)),
  );
  const publishPromises = relayList.map(async (url) => {
    let relay: AbstractRelay | null = null;
    try {
      relay = await ensureRelay(url);
      const reason = await Promise.race<string>([
        relay.publish(event).then((r) => {
          onAcceptedRelays(url);
          return r;
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject("timeout"), 5000),
        ),
      ]);
      onRelayComplete?.(url, true);
      return reason;
    } catch (e) {
      onRelayComplete?.(url, false);
      throw e;
    } finally {
      if (relay) {
        try {
          await relay.close();
        } catch {
          // Ignore closing errors
        }
      }
    }
  });

  if (options.waitForAll) {
    return Promise.allSettled(publishPromises).then((results) => {
      if (results.some((result) => result.status === "fulfilled")) {
        return results;
      }

      const rejectionReasons = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );

      throw new AggregateError(
        rejectionReasons,
        "No relays accepted the event",
      );
    });
  }

  return Promise.any(publishPromises);
};

/** Re-publish a signed event to a subset of relays (e.g. retry after partial failure). */
export const republishEventToRelays = (
  event: Event,
  relayUrls: string[],
  onAcceptedRelays?: (url: string) => void,
  onRelayComplete?: (url: string, success: boolean) => void,
) =>
  publishToRelays(event, onAcceptedRelays ?? (() => {}), relayUrls, {
    waitForAll: true,
    onRelayComplete,
  });

export const fetchCalendarEvents = (
  { since, until }: { since?: number; until?: number },
  onEvent: (event: Event) => void,
) => {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.PublicCalendarEvent],
    ...(since && { since }),
    ...(until && { until }),
  };

  return nostrRuntime.subscribe(relayList, filter, {
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
    ["name", event.title],
    ["d", id],
    ["start", String(Math.floor(event.begin / 1000))],
    ["end", String(Math.floor(event.end / 1000))],
  ];
  if (event.image) {
    tags.push(["image", event.image]);
  }

  if (event.location.length > 0) {
    event.location.map((location) => {
      tags.push(["image", location]);
    });
  }

  if (event.participants.length > 0) {
    event.participants.forEach((participant) => {
      tags.push(["p", participant]);
    });
  }
  const baseEvent: UnsignedEvent = {
    kind: EventKinds.PublicCalendarEvent,
    pubkey: pubKey,
    tags: tags,
    content: event.description,
    created_at: Math.floor(Date.now() / 1000),
  };
  const signer = await signerManager.getSigner();
  const fullEvent = await signer.signEvent(baseEvent);
  fullEvent.id = getEventHash(baseEvent);
  const result = await publishToRelays(fullEvent, onAcceptedRelays, undefined, {
    waitForAll: true,
    onRelayComplete,
  });

  return { result, id, pubKey, signedEvent: fullEvent };
};

/**
 * Publishes a NIP-09 deletion event (kind 5) to request deletion of events.
 *
 * @param coordinates - Array of "a" tag coordinates ("{kind}:{pubkey}:{d-tag}") for replaceable events
 * @param eventIds - Array of event IDs for non-replaceable events
 * @param reason - Optional human-readable reason for deletion
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

  const unsignedEvent: UnsignedEvent = {
    pubkey: userPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.DeletionEvent,
    content: reason,
    tags,
  };

  const signer = await signerManager.getSigner();
  const signedEvent = await signer.signEvent(unsignedEvent);
  signedEvent.id = getEventHash(unsignedEvent);

  await publishToRelays(signedEvent);
  nostrRuntime.addEvent(signedEvent);

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

  const unsignedEvent: UnsignedEvent = {
    pubkey: userPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.ParticipantRemoval,
    content: reason,
    tags,
  };

  const signer = await signerManager.getSigner();
  const signedEvent = await signer.signEvent(unsignedEvent);
  signedEvent.id = getEventHash(unsignedEvent);

  await publishToRelays(signedEvent);
  nostrRuntime.addEvent(signedEvent);

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
  const hintRelays = data.relays ?? [];
  let authorRelayHints: string[] = [];
  try {
    authorRelayHints = await fetchRelayList(data.pubkey);
  } catch {
    authorRelayHints = [];
  }
  const relays = getDiscoveryRelays([...hintRelays, ...authorRelayHints]);
  const filter: Filter = {
    "#d": [data.identifier],
    kinds: [data.kind],
    authors: [data.pubkey],
  };

  const event = await nostrRuntime.fetchOne(relays, filter);
  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }
  return { event, relayHint: data.relays?.[0] ?? "" };
};

export const fetchUserProfile = async (
  pubkey: string,
  relays: string[] = defaultRelays,
) => {
  return await nostrRuntime.fetchOne(relays, {
    kinds: [0],
    authors: [pubkey],
  });
};

export const fetchRelayList = async (pubkey: string): Promise<string[]> => {
  // Combine default relays with signer-provided relays for broader discovery
  const signerRelays = await signerManager.getSignerRelays();
  const queryRelays = [...new Set([...defaultRelays, ...signerRelays])];
  const event = await nostrRuntime.fetchOne(queryRelays, {
    kinds: [EventKinds.RelayList],
    authors: [pubkey],
  });
  if (!event) return [];
  return event.tags
    .filter((tag) => tag[0] === "r" && tag[1])
    .map((tag) => tag[1]);
};

/**
 * Fetches relay lists (kind 10002) for multiple pubkeys in a single query.
 * Returns a map of pubkey → relay URLs. Pubkeys with no relay list are omitted.
 */
export const fetchRelayLists = async (
  pubkeys: string[],
): Promise<Map<string, string[]>> => {
  if (pubkeys.length === 0) return new Map();
  const signerRelays = await signerManager.getSignerRelays();
  const queryRelays = [...new Set([...defaultRelays, ...signerRelays])];
  const events = await nostrRuntime.querySync(queryRelays, {
    kinds: [EventKinds.RelayList],
    authors: pubkeys,
  });
  const result = new Map<string, string[]>();
  for (const event of events) {
    const relays = event.tags
      .filter((tag) => tag[0] === "r" && tag[1])
      .map((tag) => tag[1]);
    if (relays.length > 0) result.set(event.pubkey, relays);
  }
  return result;
};

export const publishRelayList = async (relays: string[]): Promise<void> => {
  const pubKey = await getUserPublicKey();
  const tags = relays.map((url) => ["r", url]);
  const baseEvent: UnsignedEvent = {
    kind: EventKinds.RelayList,
    pubkey: pubKey,
    tags,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signer = await signerManager.getSigner();
  const fullEvent = await signer.signEvent(baseEvent);
  fullEvent.id = getEventHash(baseEvent);
  // Publish to both user relays and default relays so the list is discoverable
  const allRelays = [...new Set([...relays, ...defaultRelays])];
  await publishToRelays(fullEvent, () => {}, allRelays);
};

// --- Public Busy List (kind 31926) ---

/**
 * Publishes a public busy list event (kind 31926) for one calendar month.
 * Replaces any prior version (parameterized-replaceable per `(pubkey, d)`).
 */
export async function publishBusyList(list: IBusyList): Promise<Event> {
  const pubKey = await getUserPublicKey();
  const baseEvent: UnsignedEvent = {
    kind: EventKinds.PublicBusyList,
    pubkey: pubKey,
    tags: busyListToTags(list),
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signer = await signerManager.getSigner();
  const signedEvent = await signer.signEvent(baseEvent);
  signedEvent.id = getEventHash(baseEvent);
  await publishToRelays(signedEvent);
  nostrRuntime.addEvent(signedEvent);
  return signedEvent;
}

/**
 * Fetches a user's public busy lists for the given month partition keys.
 * Returns one IBusyList per month found (skipped silently if absent).
 */
export async function fetchBusyListsForUser(
  pubkey: string,
  monthKeys: string[],
): Promise<IBusyList[]> {
  if (monthKeys.length === 0) return [];
  const filter: Filter = {
    kinds: [EventKinds.PublicBusyList],
    authors: [pubkey],
    "#d": monthKeys.map(busyListDTag),
  };
  const events = await nostrRuntime.querySync(getRelays(), filter);
  const lists: IBusyList[] = [];
  for (const event of events) {
    const list = nostrEventToBusyList(event);
    if (list) lists.push(list);
  }
  return lists;
}

// --- Scheduling Pages List (kind 32680) ---

/**
 * Encrypted payload schema for kind 32680 events. The shape is versioned
 * so we can extend the schema without rotating the kind.
 */
interface SchedulingPageKeyPayload {
  v: 1;
  /** NIP-19 nsec encoding of the scheduling page's viewKey. */
  viewKey: string;
  /** d-tag of the scheduling page. */
  dTag: string;
  /** Unix-seconds timestamp of when the key was published. */
  createdAt: number;
}

/**
 * Publishes a self-encrypted kind-32680 event recording `viewKey` for one
 * scheduling page the current user authored. Replaces any prior version
 * (parameterized-replaceable per `(pubkey, page d-tag)`).
 *
 * `content === ""` is reserved for tombstones; callers wishing to revoke
 * a key should publish an empty payload via `publishEmptySchedulingPageKey`.
 */
export async function publishSchedulingPageKey(params: {
  dTag: string;
  viewKeyNsec: string;
}): Promise<Event> {
  const userPubkey = await getUserPublicKey();
  const signer = await signerManager.getSigner();
  if (!signer.nip44Encrypt) {
    throw new Error(
      "publishSchedulingPageKey requires a NIP-44-capable signer (none available)",
    );
  }
  const payload: SchedulingPageKeyPayload = {
    v: 1,
    viewKey: params.viewKeyNsec,
    dTag: params.dTag,
    createdAt: Math.floor(Date.now() / 1000),
  };
  const encrypted = await signer.nip44Encrypt(
    userPubkey,
    JSON.stringify(payload),
  );
  const baseEvent: UnsignedEvent = {
    kind: EventKinds.SchedulingPagesList,
    pubkey: userPubkey,
    tags: [["d", params.dTag]],
    content: encrypted,
    created_at: payload.createdAt,
  };
  const signedEvent = await signer.signEvent(baseEvent);
  signedEvent.id = getEventHash(baseEvent);
  await publishToRelays(signedEvent);
  nostrRuntime.addEvent(signedEvent);
  return signedEvent;
}

/**
 * Publishes a tombstone (empty-content) kind-32680 event for the given
 * d-tag. Used when the creator deletes the underlying scheduling page.
 */
export async function publishEmptySchedulingPageKey(
  dTag: string,
): Promise<Event> {
  const userPubkey = await getUserPublicKey();
  const signer = await signerManager.getSigner();
  const baseEvent: UnsignedEvent = {
    kind: EventKinds.SchedulingPagesList,
    pubkey: userPubkey,
    tags: [["d", dTag]],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signedEvent = await signer.signEvent(baseEvent);
  signedEvent.id = getEventHash(baseEvent);
  await publishToRelays(signedEvent);
  nostrRuntime.addEvent(signedEvent);
  return signedEvent;
}

/**
 * Fetches all kind-32680 scheduling-page-key events for the current user
 * and decrypts them. Returns a `Map<dTag, viewKeyNsec>`. Tombstones (empty
 * content) and entries the signer cannot decrypt are skipped.
 */
export async function fetchOwnSchedulingPageKeys(): Promise<
  Map<string, string>
> {
  const userPubkey = await getUserPublicKey();
  const filter: Filter = {
    kinds: [EventKinds.SchedulingPagesList],
    authors: [userPubkey],
  };
  const events = await nostrRuntime.querySync(getRelays(), filter);
  const signer = await signerManager.getSigner();
  if (!signer.nip44Decrypt) return new Map();

  const result = new Map<string, string>();
  for (const event of events) {
    const dTag = event.tags.find((t) => t[0] === "d")?.[1];
    if (!dTag) continue;
    if (!event.content) continue; // tombstone
    try {
      const decrypted = await signer.nip44Decrypt(userPubkey, event.content);
      const payload = JSON.parse(
        decrypted,
      ) as Partial<SchedulingPageKeyPayload>;
      if (
        payload &&
        typeof payload.viewKey === "string" &&
        payload.dTag === dTag
      ) {
        result.set(dTag, payload.viewKey);
      }
    } catch (err) {
      console.warn(
        `Failed to decrypt scheduling page key for d=${dTag}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}

/**
 * Looks up the most recent NIP-101 form response (kind 1069) authored by
 * `userPubkey` for the form addressed by `formCoordinate`
 * (`30168:<form_pubkey>:<dtag>`).
 *
 * Returns the latest matching response event, or null if none exist on
 * the queried relays.
 *
 * `extraRelays` lets callers pass relay hints embedded in the form's
 * naddr so the lookup reaches the same relays the form lives on.
 *
 * Note: this is the canonical relay-backed "has the user submitted?" check.
 * UI may layer a short-lived local fallback over this for relay-lag resilience,
 * but this function only reports events that exist on relays.
 */
export const fetchUserFormResponse = async (
  formCoordinate: string,
  userPubkey: string,
  extraRelays: string[] = [],
): Promise<Event | null> => {
  const relays = getDiscoveryRelays(extraRelays);
  const events = await nostrRuntime.querySync(relays, {
    kinds: [EventKinds.FormResponse],
    authors: [userPubkey],
    "#a": [formCoordinate],
    limit: 1,
  });
  if (!events || events.length === 0) return null;
  return events.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
};

export const getAllResponsesForForm = async (
  formCoordinate: string,
  extraRelays: string[] = [],
): Promise<Event[]> => {
  const relays = getDiscoveryRelays(extraRelays);
  const events = await nostrRuntime.querySync(relays, {
    kinds: [EventKinds.FormResponse],
    "#a": [formCoordinate],
  });
  return events;
};

export type ReportType =
  | "nudity"
  | "malware"
  | "profanity"
  | "illegal"
  | "spam"
  | "impersonation"
  | "other";

/**
 * Publishes a NIP-56 report event (kind 1984) for a calendar event.
 * Tags the author's pubkey and the addressable coordinate of the event.
 */
export async function publishReportEvent(params: {
  authorPubkey: string;
  eventCoordinate: string;
  relayHint?: string;
  reportType: ReportType;
  content?: string;
}): Promise<Event> {
  const userPublicKey = await getUserPublicKey();
  const tags: string[][] = [
    ["p", params.authorPubkey, params.reportType],
    params.relayHint
      ? ["a", params.eventCoordinate, params.relayHint, params.reportType]
      : ["a", params.eventCoordinate, params.reportType],
  ];

  const unsigned: UnsignedEvent = {
    pubkey: userPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.ReportEvent,
    content: params.content ?? "",
    tags,
  };

  const signer = await signerManager.getSigner();
  const signed = await signer.signEvent(unsigned);
  signed.id = getEventHash(unsigned);

  await publishToRelays(signed);
  nostrRuntime.addEvent(signed);

  return signed;
}

/**
 * Fetches the current user's NIP-56 report events (kind 1984) filtered
 * by a list of calendar event coordinates. Used to suppress already-reported
 * invitations on load.
 */
export async function fetchUserReports(
  userPubkey: string,
  eventCoordinates: string[],
): Promise<string[]> {
  if (eventCoordinates.length === 0) return [];
  const events = await nostrRuntime.querySync(getRelays(), {
    kinds: [EventKinds.ReportEvent],
    authors: [userPubkey],
    "#a": eventCoordinates,
  });
  return events.flatMap((event) =>
    event.tags.filter((t) => t[0] === "a" && t[1]).map((t) => t[1]),
  );
}
