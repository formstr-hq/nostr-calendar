import { dataLayer, type ObserveHandle } from "@formstr/local-relay";
import type { Event } from "nostr-tools";
import { EventKinds } from "./kinds";

const HEX_PUBKEY = /^[0-9a-f]{64}$/i;

export interface Contact {
  pubkey: string;
  relay?: string;
  petname?: string;
}

export interface ContactList {
  pubkey: string;
  contacts: Contact[];
  createdAt: number;
  eventId: string;
}

const optionalTagValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

/** Parse the ordered, deduplicated p tags from an untrusted NIP-02 event. */
export function parseContactList(event: Event): ContactList | null {
  if (event.kind !== EventKinds.ContactList) return null;

  const contacts = new Map<string, Contact>();
  for (const tag of event.tags) {
    if (tag[0] !== "p" || !HEX_PUBKEY.test(tag[1] ?? "")) continue;
    const pubkey = tag[1].toLowerCase();
    if (contacts.has(pubkey)) continue;
    contacts.set(pubkey, {
      pubkey,
      relay: optionalTagValue(tag[2]),
      petname: optionalTagValue(tag[3]),
    });
  }

  return {
    pubkey: event.pubkey.toLowerCase(),
    contacts: Array.from(contacts.values()),
    createdAt: event.created_at,
    eventId: event.id,
  };
}

interface ContactListStreamHandlers {
  onContactList: (contactList: ContactList) => void;
  onEose?: () => void;
}

/** Observe the author's replaceable NIP-02 contact list on ordinary read relays. */
export function observeContactList(
  pubkey: string,
  handlers: ContactListStreamHandlers,
): ObserveHandle {
  return dataLayer.observe(
    [
      {
        kinds: [EventKinds.ContactList],
        authors: [pubkey.toLowerCase()],
        limit: 1,
      },
    ],
    {
      onEvent: (event) => {
        const contactList = parseContactList(event);
        if (contactList) handlers.onContactList(contactList);
      },
      onEose: handlers.onEose,
    },
  );
}
