/**
 * Calendar List Protocol Layer (kind 32123)
 *
 * Handles creating, encrypting, decrypting, publishing, and fetching
 * private calendar list events. Calendar lists are parameterized replaceable
 * events that store references to calendar events.
 *
 * Self-encryption: The content is encrypted with the user's own pubkey
 * using NIP-44, so only the user's corresponding private key can decrypt it.
 * This ensures calendar lists remain private even on public relays.
 *
 * Event structure:
 *   kind: 32123
 *   tags: [["d", <uuid>]]
 *   content: nip44_encrypt_to_self(JSON.stringify([
 *     ["title", "..."],
 *     ["content", "..."],         // optional description
 *     ["color", "#4285f4"],       // optional hex color
 *     ["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"],
 *     ...more "a" tags
 *   ]))
 * read protocol.md for details
 */

import { Event, UnsignedEvent, getEventHash, Filter } from "nostr-tools";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { signerManager } from "./signer";
import { EventKinds } from "./EventConfigs";
import { nostrRuntime } from "./nostrRuntime";
import { getRelays, publishToRelays, getUserPublicKey } from "./nostr";
import type { ICalendarList } from "../utils/calendarListTypes";
import {
  DEFAULT_CALENDAR_COLOR,
  DEFAULT_CALENDAR_TITLE,
} from "../utils/calendarListTypes";
import type { SubscriptionHandle } from "./nostrRuntime";

/**
 * Encrypts a calendar list's content tags using self-encryption (NIP-44).
 * The user encrypts with their own pubkey so only they can decrypt.
 *
 * @param calendarList - The calendar list to encrypt
 * @returns Encrypted content string
 */
export async function encryptCalendarList(
  calendarList: ICalendarList,
): Promise<string> {
  const tags: string[][] = [
    ["title", calendarList.title],
    ["content", calendarList.description],
    ["color", calendarList.color],
  ];

  // Persist only non-default notification preference to minimize relay payload.
  if (calendarList.notificationPreference === "disabled") {
    tags.push(["notifications", "disabled"]);
  }

  // Add event references as "a" tags: ["a", coordinate, metadata]
  for (const ref of calendarList.eventRefs) {
    tags.push(["a", ...ref]);
  }

  const userPubkey = await getUserPublicKey();
  const signer = await signerManager.getSigner();

  // Self-encrypt: encrypt with our own pubkey so only we can decrypt
  const encrypted = await signer.nip44Encrypt!(
    userPubkey,
    JSON.stringify(tags),
  );
  return encrypted;
}

/**
 * Decrypts a calendar list Nostr event back into an ICalendarList.
 *
 * @param event - The kind 32123 Nostr event
 * @returns Decrypted ICalendarList object
 */
export async function decryptCalendarList(
  event: Event,
): Promise<ICalendarList> {
  const signer = await signerManager.getSigner();

  // Self-decrypt: the event was encrypted with our own pubkey
  const decryptedContent = await signer.nip44Decrypt!(
    event.pubkey,
    event.content,
  );

  const tags: string[][] = JSON.parse(decryptedContent);

  let title = DEFAULT_CALENDAR_TITLE;
  let description = "";
  let color = DEFAULT_CALENDAR_COLOR;
  let notificationPreference: "enabled" | "disabled" | undefined;
  const eventRefs: string[][] = [];

  for (const tag of tags) {
    switch (tag[0]) {
      case "title":
        title = tag[1];
        break;
      case "content":
        description = tag[1] || "";
        break;
      case "color":
        color = tag[1] || DEFAULT_CALENDAR_COLOR;
        break;
      case "notifications":
        notificationPreference = tag[1] === "disabled" ? "disabled" : "enabled";
        break;
      case "a":
        // a-tag format: ["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"]
        eventRefs.push([tag[1], tag[2], tag[3]]);
        break;
    }
  }

  // Extract the "d" tag (calendar ID) from the outer event tags
  const dTag = event.tags.find((t) => t[0] === "d")?.[1] || "";

  return {
    id: dTag,
    eventId: event.id,
    title,
    description,
    color,
    notificationPreference,
    eventRefs,
    createdAt: event.created_at,
    isVisible: true, // Default to visible; client-side state
  };
}

/**
 * Publishes a calendar list to relays as a kind 32123 parameterized replaceable event.
 * If the calendar already exists (same "d" tag), it will replace it on relays.
 *
 * @param calendarList - The calendar list to publish
 * @returns The signed Nostr event
 */
export async function publishCalendarList(
  calendarList: ICalendarList,
): Promise<Event> {
  const userPubkey = await getUserPublicKey();
  const encryptedContent = await encryptCalendarList(calendarList);

  const unsignedEvent: UnsignedEvent = {
    pubkey: userPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.PrivateCalendarList,
    content: encryptedContent,
    tags: [["d", calendarList.id]],
  };

  const signer = await signerManager.getSigner();
  const signedEvent = await signer.signEvent(unsignedEvent);
  signedEvent.id = getEventHash(unsignedEvent);

  await publishToRelays(signedEvent);

  // Also add to the local event store for cache
  nostrRuntime.addEvent(signedEvent);

  return signedEvent;
}

/**
 * Fetches all calendar lists for a given user from relays via nostrRuntime.
 * Subscribes to kind 32123 events authored by the user and decrypts each one.
 *
 * @param userPubkey - The user's public key
 * @param onList - Callback invoked for each decrypted calendar list
 * @returns SubscriptionHandle to unsubscribe when done
 */
export function fetchCalendarLists(
  userPubkey: string,
  onList: (list: ICalendarList) => void,
  onEose?: () => void,
): SubscriptionHandle {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.PrivateCalendarList],
    authors: [userPubkey],
  };

  return nostrRuntime.subscribe(relayList, [filter], {
    onEvent: async (event: Event) => {
      try {
        const list = await decryptCalendarList(event);
        onList(list);
      } catch (error) {
        console.error("Failed to decrypt calendar list:", error);
      }
    },
    onEose,
  });
}

export async function createCalendar(
  calendarData: Omit<ICalendarList, "id" | "createdAt">,
): Promise<ICalendarList> {
  const idRoot = `${JSON.stringify(calendarData)}-${Date.now}`;
  const id = bytesToHex(sha256(utf8ToBytes(idRoot))).substring(0, 30);
  const calendar: ICalendarList = {
    ...calendarData,
    id,
    eventId: "",
    createdAt: Math.floor(Date.now() / 1000),
  };

  const publishedEvent = await publishCalendarList(calendar);
  calendar.eventId = publishedEvent.id;

  return calendar;
}

/**
 * Creates a new default calendar list.
 * Used when a user has no calendars (first-time setup).
 *
 * @returns The newly created and published calendar list
 */
export async function createDefaultCalendar(): Promise<ICalendarList> {
  const newCalendar = {
    title: DEFAULT_CALENDAR_TITLE,
    description: "",
    color: DEFAULT_CALENDAR_COLOR,
    eventId: "",
    eventRefs: [],
    isVisible: true,
  };

  return createCalendar(newCalendar);
}

/**
 * Adds an event reference to a calendar list and republishes the updated list.
 *
 * @param calendarList - The calendar list to update
 * @param eventRef - Event reference array ["{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"]
 * @returns The updated calendar list
 */
export async function addEventToCalendarList(
  calendarList: ICalendarList,
  eventRef: string[],
): Promise<ICalendarList> {
  // Avoid duplicate refs (compare by coordinate, i.e. first element)
  if (calendarList.eventRefs.some((ref) => ref[0] === eventRef[0])) {
    return calendarList;
  }

  const updated: ICalendarList = {
    ...calendarList,
    eventRefs: [...calendarList.eventRefs, eventRef],
    createdAt: Math.floor(Date.now() / 1000),
  };

  await publishCalendarList(updated);
  return updated;
}

/**
 * Removes an event reference from a calendar list and republishes the updated list.
 *
 * @param calendarList - The calendar list to update
 * @param eventRef - Event reference array to remove (matched by coordinate)
 * @returns The updated calendar list
 */
export async function removeEventFromCalendarList(
  calendarList: ICalendarList,
  eventRef: string[],
): Promise<ICalendarList> {
  const updated: ICalendarList = {
    ...calendarList,
    eventRefs: calendarList.eventRefs.filter((ref) => ref[0] !== eventRef[0]),
    createdAt: Math.floor(Date.now() / 1000),
  };

  await publishCalendarList(updated);
  return updated;
}

/**
 * Moves an event from its current calendar list to a new one.
 * If the event is already in the target calendar, this is a no-op.
 * If the event is not found in any other calendar, it is simply added to the target.
 *
 * @param calendars - All calendar lists to search through
 * @param targetCalendarId - The ID of the calendar to move the event to
 * @param eventCoordinate - The event coordinate string ("{kind}:{authorPubkey}:{eventDTag}")
 * @param eventRef - The full event reference array to add to the target calendar
 * @returns Object with updated source and target calendars, or null if no move was needed
 */
export async function moveEventBetweenCalendarLists(
  calendars: ICalendarList[],
  targetCalendarId: string,
  eventCoordinate: string,
  eventRef: string[],
): Promise<{ source?: ICalendarList; target: ICalendarList } | null> {
  // Find which calendar currently contains the event
  const sourceCalendar = calendars.find(
    (cal) =>
      cal.id !== targetCalendarId &&
      cal.eventRefs.some((ref) => ref[0] === eventCoordinate),
  );

  const targetCalendar = calendars.find((cal) => cal.id === targetCalendarId);
  if (!targetCalendar) {
    throw new Error(`Target calendar not found: ${targetCalendarId}`);
  }

  // Event is already in the target calendar
  if (targetCalendar.eventRefs.some((ref) => ref[0] === eventCoordinate)) {
    return null;
  }

  // Remove from source calendar if found
  let updatedSource: ICalendarList | undefined;
  if (sourceCalendar) {
    updatedSource = await removeEventFromCalendarList(sourceCalendar, [
      eventCoordinate,
    ]);
  }

  // Add to target calendar
  const updatedTarget = await addEventToCalendarList(targetCalendar, eventRef);

  return { source: updatedSource, target: updatedTarget };
}
