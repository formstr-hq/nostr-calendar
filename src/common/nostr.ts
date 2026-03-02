import {
  Event,
  generateSecretKey,
  Relay,
  SimplePool,
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

export const defaultRelays = [
  "wss://relay.damus.io/",
  "wss://relay.primal.net/",
  "wss://nos.lol",
  "wss://relay.nostr.wirednet.jp/",
  "wss://nostr-01.yakihonne.com",
  "wss://relay.snort.social",
  "wss://relay.nostr.band",
  "wss://nostr21.com",
];

const _onAcceptedRelays = console.log.bind(
  console,
  "Successfully published to relay: ",
);

export const pool = new SimplePool();

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
  referenceKind:
    | EventKinds.PrivateCalendarEvent
    | EventKinds.PrivateCalendarRecurringEvent;
}) {
  const uniqueRSVPId = uuid();
  const userPublicKey = await getUserPublicKey();

  const viewSecretKey = generateSecretKey();
  const viewPublicKey = getPublicKey(viewSecretKey);
  // Encrypt the RSVP data
  const eventData = [
    ["a", `${referenceKind}:${authorpubKey}:${eventId}`],
    ["d", uniqueRSVPId],
    ["L", "status"],
    ["l", `${status}`, "status"],
    ["L", "freebusy"],
    ["l", "free", "freebusy"],
  ];
  const eventContent = nip44.encrypt(
    JSON.stringify(eventData),
    nip44.getConversationKey(viewSecretKey, viewPublicKey),
  );
  const unsignedRSVPEvent: UnsignedEvent = {
    pubkey: userPublicKey, // Your public key here
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.PrivateRSVPEvent,
    content: eventContent,
    tags: [
      ["d", uniqueRSVPId], // Unique identifier for the RSVP event
    ],
  };
  const signer = await signerManager.getSigner();
  const signedRSVPEvent = await signer.signEvent(unsignedRSVPEvent);
  signedRSVPEvent.id = getEventHash(unsignedRSVPEvent);
  await publishToRelays(signedRSVPEvent);
  const giftWraps: Event[] = [];
  const allParticipants = Array.from(new Set([...participants, userPublicKey]));
  for (const participant of allParticipants) {
    // Create a rumor
    const giftWrap = await nip59.wrapEvent(
      {
        pubkey: nip19.npubEncode(userPublicKey),
        created_at: Math.floor(Date.now() / 1000),
        kind: EventKinds.RSVPRumor,
        content: "",
        tags: [
          [
            "a",
            `${EventKinds.PrivateRSVPEvent}:${participant}:${uniqueRSVPId}`,
          ],
          ["viewKey", nip19.nsecEncode(viewSecretKey)],
        ],
      },
      participant,
      EventKinds.RSVPGiftWrap,
    );
    giftWraps.push(giftWrap);
  }
  await Promise.all(
    giftWraps.map((gift) => {
      return publishToRelays(gift);
    }),
  );
  return {
    rsvpEvent: signedRSVPEvent,
    giftWraps,
  };
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
  const uniqueRSVPId = uuid();
  const userPublicKey = await getUserPublicKey();

  const unsignedRSVPEvent: UnsignedEvent = {
    pubkey: userPublicKey, // Your public key here
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.PublicRSVPEvent,
    content: "",
    tags: [
      ["d", uniqueRSVPId],
      ["a", `${EventKinds.PublicCalendarEvent}:${authorpubKey}:${eventId}`],
      ["d", uniqueRSVPId],
      ["L", "status"],
      ["l", `${status}`, "status"],
      ["L", "freebusy"],
      ["l", "free", "freebusy"],
    ],
  };
  const signer = await signerManager.getSigner();
  const signedRSVPEvent = await signer.signEvent(unsignedRSVPEvent);
  signedRSVPEvent.id = getEventHash(unsignedRSVPEvent);
  await publishToRelays(signedRSVPEvent);

  return {
    rsvpEvent: signedRSVPEvent,
  };
}

export const fetchPublicRSVPEvents = (
  { eventReference }: { eventReference?: string },
  onEvent: (event: Event) => void,
) => {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.PublicRSVPEvent],
    ...(eventReference && { "#a": [eventReference] }),
  };

  return pool.subscribeMany(relayList, [filter], {
    onevent: (event: Event) => {
      onEvent(event);
    },
  });
};

export async function publishPrivateCalendarEvent({
  title,
  description,
  begin: start,
  end,
  participants,
  repeat,
  image,
  location,
}: ICalendarEvent) {
  const viewSecretKey = generateSecretKey();
  const uniqueCalId = uuid();
  const eventKind = repeat.frequency
    ? EventKinds.PrivateCalendarRecurringEvent
    : EventKinds.PrivateCalendarEvent;
  const eventData = [
    ["title", title],
    ["description", description],
    ["start", start / 1000],
    ["end", end / 1000],
    ["image", image],
    ["d", uniqueCalId],
    ["location", location],
  ];
  if (repeat && repeat.frequency) {
    eventData.push(["L", "recurring"]);
    eventData.push(["l", repeat.frequency]);
  }

  participants.forEach((participant) => {
    eventData.push(["p", participant]);
  });

  const viewPublicKey = getPublicKey(viewSecretKey);
  const userPublicKey = await getUserPublicKey();
  const eventContent = nip44.encrypt(
    JSON.stringify(eventData),
    nip44.getConversationKey(viewSecretKey, viewPublicKey),
  );

  const unsignedCalendarEvent: UnsignedEvent = {
    pubkey: userPublicKey, // Your public key here
    created_at: Math.floor(Date.now() / 1000),
    kind: eventKind,
    content: eventContent,
    tags: [
      ["d", uniqueCalId], // Replace with a unique id for the event
    ],
  };
  const signer = await signerManager.getSigner();
  const signedEvent = await signer.signEvent(unsignedCalendarEvent);
  const evtId = getEventHash(unsignedCalendarEvent);
  signedEvent.id = evtId;
  // Publish the private event to a relay
  await publishToRelays(signedEvent);
  const giftWraps: Event[] = [];
  const targetPubKeys = Array.from(new Set([userPublicKey, ...participants]));
  for (const participant of targetPubKeys) {
    // Create a rumor
    const giftWrap = await nip59.wrapEvent(
      {
        pubkey: userPublicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: EventKinds.CalendarEventRumor,
        content: "",
        tags: [
          ["a", `${eventKind}:${participant}:${uniqueCalId}`],
          ["viewKey", nip19.nsecEncode(viewSecretKey)],
        ],
      },
      participant,
      EventKinds.CalendarEventGiftWrap,
    );
    giftWraps.push(giftWrap);
  }
  await Promise.all(
    giftWraps.map((gift) => {
      return publishToRelays(gift);
    }),
  );
  return {
    calendarEvent: signedEvent,
    giftWraps,
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
  const viewKey = rumor.tags.find((tag) => tag[0] === "viewKey")?.[1];
  if (!viewKey) {
    throw new Error("invalid rumor: viewKey not found");
  }
  return {
    eventId,
    viewKey,
  };
}

export const fetchCalendarGiftWraps = (
  {
    participants,
    since,
    until,
  }: { participants: string[]; since?: number; until?: number },
  onEvent: (event: { eventId: string; viewKey: string }) => void,
) => {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.CalendarEventGiftWrap],
    "#p": participants,
    ...(since && { since }),
    ...(until && { until }),
  };

  return pool.subscribeMany(relayList, [filter], {
    onevent: async (event: Event) => {
      const unWrappedEvent = await getDetailsFromGiftWrap(event);
      onEvent(unWrappedEvent);
    },
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
    const closer = pool.subscribeMany(relayList, [filter], {
      onevent: async (rsvpEvent: Event) => {
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

          closer.close();
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
          closer.close();
          reject(
            new Error(
              `Failed to process RSVP event: ${(error as Error).message}`,
            ),
          );
        }
      },
      oneose: () => {
        closer.close();
        // If no RSVP event is found, return tentative status
        resolve({
          rsvpEvent: null,
          eventId,
          viewKey,
          aTag: aTag[1],
          isPrivate: viewKey ? true : false,
          status: RSVPStatus.tentative, // Default status when no RSVP is present
        });
      },
    });

    setTimeout(() => {
      closer.close();
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

  return pool.subscribeMany(relayList, [filter], {
    onevent: async (giftWrap: Event) => {
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

export async function fetchPrivateCalendarEvents(
  {
    eventIds,
    since,
    until,
  }: { eventIds: string[]; since?: number; until?: number },
  onEvent: (event: Event) => void,
) {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.PrivateCalendarEvent],
    "#d": eventIds,
    ...(since && { since }),
    ...(until && { until }),
  };
  const recurringFilter: Filter = {
    kinds: [EventKinds.PrivateCalendarRecurringEvent],
    "#d": eventIds,
  };

  const closer = pool.subscribeMany(relayList, [filter, recurringFilter], {
    onevent: async (event: Event) => {
      onEvent(event);
      closer.close();
    },
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

  return pool.subscribeMany(relayList, [filter], {
    onevent: (event: Event) => {
      onEvent(event);
    },
  });
};

export const publishPublicCalendarEvent = async (
  event: ICalendarEvent,
  onAcceptedRelays?: (url: string) => void,
) => {
  const pubKey = await getUserPublicKey();
  const id = event.id !== TEMP_CALENDAR_ID ? event.id : uuid();
  const tags = [
    ["name", event.title],
    ["d", id],
    ["start", String(Math.floor(event.begin / 1000))],
    ["end", String(Math.floor(event.end / 1000))],
    ["image", event.image],
    ["location", event.location],
  ];
  if (event.image) {
    tags.push(["image", event.image]);
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
  return publishToRelays(fullEvent, onAcceptedRelays);
};

export const fetchUserInfo = (
  userPublicKeys: string[],
  onEvent: (event: Event) => void,
) => {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.UserProfile],
    authors: userPublicKeys,
  };

  return pool.subscribeMany(relayList, [filter], {
    onevent: (event: Event) => {
      onEvent(event);
    },
  });
};

export const encodeNAddr = (address: Omit<AddressPointer, "relays">) => {
  return naddrEncode({ ...address, relays: defaultRelays });
};

export const fetchCalendarEvent = (naddr: NAddr): Promise<Event> => {
  const { data } = decode(naddr as NAddr);
  console.log(data);
  return new Promise((resolve, reject) => {
    const relays = data.relays ?? defaultRelays;
    const filter: Filter = {
      ids: [data.identifier],
      kinds: [data.kind],
      authors: [data.pubkey],
    };

    const maxWait = 10000;

    const closer = pool.subscribeMany(relays, [filter], {
      maxWait,
      onevent: (event: Event) => {
        resolve(event);
        closer.close();
      },
    });
    setTimeout(() => {
      reject(new Error("EVENT_NOT_FOUND"));
      closer.close();
    }, maxWait);
  });
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
