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
import { TEMP_CALENDAR_ID } from "../stores/eventDetails";
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

export const defaultRelays = [
  "wss://relay.damus.io/",
  "wss://relay.primal.net/",
  "wss://nos.lol",
  "wss://relay.nostr.wirednet.jp/",
  "wss://nostr-01.yakihonne.com",
  "wss://relay.snort.social",
  "wss://nostr21.com",
];

const _onAcceptedRelays = console.log.bind(
  console,
  "Successfully published to relay: ",
);

export const getRelays = (): string[] => {
  const userRelays = useRelayStore.getState().relays;
  return userRelays.length > 0 ? userRelays : defaultRelays;
};

export async function getUserPublicKey() {
  const signer = await signerManager.getSigner();
  const pubKey = await signer.getPublicKey();
  return pubKey;
}

export const ensureRelay = async (
  url: string,
  params?: { connectionTimeout?: number },
): Promise<AbstractRelay> => {
  const relay = new Relay(url);
  if (params?.connectionTimeout)
    relay.connectionTimeout = params.connectionTimeout;
  await relay.connect();
  return relay;
};

export async function publishPrivateRSVPEvent({
  authorpubKey, // Public key of the event author
  eventId, // The dtag of the event
  status, // Status of the RSVP event
  participants, // List of participant public keys
  referenceKind,
}: {
  eventId: string;
  authorpubKey: string;
  status: string;
  participants: string[];
  referenceKind: EventKinds.PrivateCalendarEvent;
}) {
  // this function is noop
}

export async function publishPublicRSVPEvent({
  authorpubKey,
  eventId,
  status,
}: {
  authorpubKey: string;
  eventId: string;
  status: string;
}) {
  // this function is noop
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
 * The calendarId parameter specifies which calendar to add the event to.
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

export async function publishPrivateCalendarEvent(event: ICalendarEvent) {
  const viewSecretKey = generateSecretKey();
  const dTagRoot = `${JSON.stringify(event)}-${Date.now()}`;
  const dTag = bytesToHex(sha256(utf8ToBytes(dTagRoot))).substring(0, 30);
  const { signedEvent, eventKind, userPublicKey } =
    await preparePrivateCalendarEvent(event, dTag, viewSecretKey);

  // Capture which relay accepts the event to use as a hint in invitations
  // and the creator's calendar list entry, so recipients can fetch from there.
  let publishedRelayHint = "";
  await publishToRelays(signedEvent, (url) => {
    if (!publishedRelayHint) publishedRelayHint = url;
  });

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
  };
}

export async function editPrivateCalendarEvent(
  event: ICalendarEvent,
  calendarId: string,
) {
  const dTag = event.id;
  const viewSecretKey = nip19.decode(event.viewKey as NSec).data;
  const { signedEvent, eventKind, userPublicKey } =
    await preparePrivateCalendarEvent(event, dTag, viewSecretKey);

  await publishToRelays(signedEvent);

  const eventCoordinate = `${eventKind}:${userPublicKey}:${dTag}`;
  const eventRef = buildEventRef({
    kind: eventKind,
    authorPubkey: userPublicKey,
    eventDTag: dTag,
    viewKey: nip19.nsecEncode(viewSecretKey),
  });

  await useCalendarLists
    .getState()
    .moveEventToCalendar(calendarId, eventCoordinate, eventRef);

  return {
    event,
    calendarId,
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
  return nostrRuntime.subscribe(relayList, [filter], {
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

export async function getDetailsFromRSVPGiftWrap(giftWrap: Event) {
  const rumor = await nip59.unwrapEvent(giftWrap);
  const aTag = rumor.tags.find((tag) => tag[0] === "a");
  if (!aTag || !aTag[1]) {
    console.log(rumor);
    throw new Error("invalid rumor. a tag not found or malformed");
  }

  const parts = aTag[1].split(":");
  if (parts.length < 3) {
    throw new Error("invalid a tag format");
  }

  const eventId = parts[2];
  const viewKey = rumor.tags.find((tag) => tag[0] === "viewKey")?.[1];

  // Fetch the RSVP event using the a tag reference
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.PrivateRSVPEvent], // RSVP event kind
    "#d": [eventId], // Match the dtag
  };

  return new Promise((resolve, reject) => {
    const handle = nostrRuntime.subscribe(relayList, [filter], {
      onEvent: async (rsvpEvent: Event) => {
        try {
          const viewPrivateKey = nip19.decode(viewKey as NSec).data;
          const decryptedContent = nip44.decrypt(
            rsvpEvent.content,
            nip44.getConversationKey(
              viewPrivateKey,
              getPublicKey(viewPrivateKey),
            ),
          );
          const eventData = JSON.parse(decryptedContent);

          handle.unsubscribe();
          resolve({
            rsvpEvent: {
              ...rsvpEvent,
              decryptedData: eventData,
            },
            eventId,
            viewKey,
            aTag: aTag[1],
            isPrivate: true,
          });
        } catch (error: unknown) {
          handle.unsubscribe();
          reject(
            new Error(
              `Failed to process RSVP event: ${(error as Error).message}`,
            ),
          );
        }
      },
      onEose: () => {
        handle.unsubscribe();
        // If no RSVP event is found, return tentative status
        resolve({
          rsvpEvent: null,
          eventId,
          viewKey,
          aTag: aTag[1],
          isPrivate: viewKey ? true : false,
          status: RSVPStatus.tentative,
        });
      },
    });

    setTimeout(() => {
      handle.unsubscribe();
      reject(new Error("Timeout: RSVP event fetch timed out"));
    }, 10000);
  });
}

export const fetchAndDecryptPrivateRSVPEvents = (
  { participants }: { participants: string[] },
  onEvent: (decryptedRSVP: unknown) => void,
) => {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.RSVPGiftWrap],
    "#p": participants,
  };

  return nostrRuntime.subscribe(relayList, [filter], {
    onEvent: async (giftWrap: Event) => {
      try {
        const decryptedRSVP = await getDetailsFromRSVPGiftWrap(giftWrap);
        onEvent(decryptedRSVP);
      } catch (error) {
        console.error("Failed to process RSVP gift wrap:", error);
      }
    },
  });
};

export function viewPrivateEvent(calendarEvent: Event, viewKey: string) {
  const viewPrivateKey = nip19.decode(viewKey as NSec).data;
  const decryptedContent = nip44.decrypt(
    calendarEvent.content,
    nip44.getConversationKey(viewPrivateKey, getPublicKey(viewPrivateKey)),
  );

  return {
    ...calendarEvent,
    tags: JSON.parse(decryptedContent),
  }; // Return the decrypted event details
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

  return nostrRuntime.subscribe(relayList, [filter], {
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
) => {
  const relayList = (relays ?? getRelays()).map(normalizeURL);
  return Promise.any(
    relayList.map(async (url) => {
      let relay: AbstractRelay | null = null;
      try {
        relay = await ensureRelay(url, { connectionTimeout: 5000 });
        return await Promise.race<string>([
          relay.publish(event).then((reason) => {
            onAcceptedRelays(url);
            return reason;
          }),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject("timeout"), 5000),
          ),
        ]);
      } finally {
        if (relay) {
          try {
            await relay.close();
          } catch {
            // Ignore closing errors
          }
        }
      }
    }),
  );
};

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

  return nostrRuntime.subscribe(relayList, [filter], {
    onEvent: (event: Event) => {
      onEvent(event);
    },
  });
};

export const publishPublicCalendarEvent = async (
  event: ICalendarEvent,
  onAcceptedRelays?: (url: string) => void,
) => {
  const pubKey = await getUserPublicKey();
  const id = event?.id !== TEMP_CALENDAR_ID ? event.id : uuid();
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
  const result = await publishToRelays(fullEvent, onAcceptedRelays);

  return { result, id, pubKey };
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
  const relays = data.relays ?? defaultRelays;
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
 * Note: this is the canonical "has the user submitted?" check. UI must
 * not infer submission status from local memory across reloads.
 */
export const fetchUserFormResponse = async (
  formCoordinate: string,
  userPubkey: string,
  extraRelays: string[] = [],
): Promise<Event | null> => {
  const relays = [...new Set([...defaultRelays, ...extraRelays])];
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
