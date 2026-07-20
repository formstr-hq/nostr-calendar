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
 *     ["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}"],
 *     ...more "a" tags
 *   ]))
 * read protocol.md for details
 */

import { Event, Filter } from "nostr-tools";
import { dataLayer, type ObserveHandle } from "@formstr/local-relay";

import { EventKinds } from "./kinds";
import { getUserPublicKey, signerEncrypt, signerDecrypt } from "./crypto";
import {
  buildAndSign,
  publishSignedEvent,
  nextCreatedAt,
  makeDTag,
} from "./core";
import type { ICalendarList } from "../utils/calendarListTypes";
import {
  DEFAULT_CALENDAR_COLOR,
  DEFAULT_CALENDAR_TITLE,
} from "../utils/calendarListTypes";

/**
 * Encrypts a calendar list's content tags using self-encryption (NIP-44).
 * The user encrypts with their own pubkey so only they can decrypt.
 */
async function encryptCalendarList(
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
  return signerEncrypt(userPubkey, tags);
}

/**
 * Decrypts a calendar list Nostr event back into an ICalendarList.
 */
async function decryptCalendarList(event: Event): Promise<ICalendarList> {
  if (event.kind !== EventKinds.PrivateCalendarList) {
    throw new Error(
      `Expected kind ${EventKinds.PrivateCalendarList}, got ${event.kind}`,
    );
  }

  if (!event.content) {
    throw new Error("Calendar list event has empty content");
  }

  // Self-decrypt: the event was encrypted with our own pubkey
  const decryptedContent = await signerDecrypt<unknown>(
    event.pubkey,
    event.content,
  );

  if (!Array.isArray(decryptedContent)) {
    throw new Error(
      `Calendar list payload is not a tags array (got ${typeof decryptedContent})`,
    );
  }
  const tags = decryptedContent as string[][];

  let title = DEFAULT_CALENDAR_TITLE;
  let description = "";
  let color = DEFAULT_CALENDAR_COLOR;
  let notificationPreference: "enabled" | "disabled" | undefined;
  const eventRefs: string[][] = [];

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length === 0) continue;
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
        // a-tag format: ["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}"]
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
 */
export async function publishCalendarList(
  calendarList: ICalendarList,
): Promise<Event> {
  const userPubkey = await getUserPublicKey();
  const encryptedContent = await encryptCalendarList(calendarList);

  const signedEvent = await buildAndSign({
    pubkey: userPubkey,
    created_at: nextCreatedAt(calendarList.createdAt),
    kind: EventKinds.PrivateCalendarList,
    content: encryptedContent,
    tags: [["d", calendarList.id]],
  });

  await publishSignedEvent(signedEvent);

  return signedEvent;
}

/**
 * Observes all calendar lists for a given user (kind 32123 events authored by
 * the user) and decrypts each one.
 */
export function fetchCalendarLists(
  userPubkey: string,
  onList: (list: ICalendarList) => void,
  onEose?: () => void,
): ObserveHandle {
  const filter: Filter = {
    kinds: [EventKinds.PrivateCalendarList],
    authors: [userPubkey],
  };
  return dataLayer.observe([filter], {
    onEvent: async (event: Event) => {
      // Guard: the subscription filter should ensure this, but relays can
      // occasionally deliver wrong-kind events (e.g. kind 31926 PublicBusyList,
      // which shares a similar d-tag shape and has empty content that
      // JSON.parse can't turn into a tags array).
      if (event.kind !== EventKinds.PrivateCalendarList) {
        console.warn(
          `Skipping unexpected kind ${event.kind} in calendar-list stream`,
        );
        return;
      }
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
  const id = makeDTag(`${JSON.stringify(calendarData)}-${Date.now()}`);
  const calendar: ICalendarList = {
    ...calendarData,
    id,
    eventId: "",
    createdAt: 0,
  };

  const publishedEvent = await publishCalendarList(calendar);
  calendar.eventId = publishedEvent.id;
  calendar.createdAt = publishedEvent.created_at;

  return calendar;
}

/**
 * Adds an event reference to a calendar list and republishes the updated list.
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
  };

  const publishedEvent = await publishCalendarList(updated);
  return { ...updated, createdAt: publishedEvent.created_at };
}

/**
 * Removes an event reference from a calendar list and republishes the updated list.
 */
export async function removeEventFromCalendarList(
  calendarList: ICalendarList,
  eventRef: string[],
): Promise<ICalendarList> {
  const updated: ICalendarList = {
    ...calendarList,
    eventRefs: calendarList.eventRefs.filter((ref) => ref[0] !== eventRef[0]),
  };

  const publishedEvent = await publishCalendarList(updated);
  return { ...updated, createdAt: publishedEvent.created_at };
}

/**
 * Moves an event from its current calendar list to a new one.
 * If the event is already in the target calendar, this is a no-op.
 * If the event is not found in any other calendar, it is simply added to the target.
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
