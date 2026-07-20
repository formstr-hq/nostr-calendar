import { Event, UnsignedEvent } from "nostr-tools";
import { EventKinds } from "./kinds";
import { getUserPublicKey } from "./crypto";
import { buildAndSign, publishSignedEvent } from "./core";
import { fetchAll } from "./fetch";
import {
  busyListToTags,
  busyListDTag,
  nostrEventToBusyList,
} from "../utils/parser";
import type { IBusyList } from "../utils/types";

/**
 * Publishes a public busy list event (kind 31926) for one calendar month.
 * Replaces any prior version (parameterized-replaceable per `(pubkey, d)`).
 */
export async function publishBusyList(list: IBusyList): Promise<Event> {
  const pubKey = await getUserPublicKey();
  const unsigned: UnsignedEvent = {
    kind: EventKinds.PublicBusyList,
    pubkey: pubKey,
    tags: busyListToTags(list),
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signedEvent = await buildAndSign(unsigned);
  await publishSignedEvent(signedEvent);
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
  const events = await fetchAll([
    {
      kinds: [EventKinds.PublicBusyList],
      authors: [pubkey],
      "#d": monthKeys.map(busyListDTag),
    },
  ]);
  const lists: IBusyList[] = [];
  for (const event of events) {
    const list = nostrEventToBusyList(event);
    if (list) lists.push(list);
  }
  return lists;
}
