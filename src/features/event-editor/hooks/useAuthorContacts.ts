import { useEffect, useState } from "react";
import {
  observeContactList,
  type Contact,
  type ContactList,
} from "../../../nostr/contacts";

const EMPTY_CONTACTS: Contact[] = [];

const isNewer = (candidate: ContactList, current?: ContactList) =>
  !current ||
  candidate.createdAt > current.createdAt ||
  (candidate.createdAt === current.createdAt &&
    candidate.eventId > current.eventId);

export function useAuthorContacts(pubkey?: string | null): readonly Contact[] {
  const normalizedPubkey = pubkey?.toLowerCase() ?? null;
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    list: ContactList;
  } | null>(null);

  useEffect(() => {
    if (!normalizedPubkey) return;

    const handle = observeContactList(normalizedPubkey, {
      onContactList: (list) => {
        setSnapshot((current) =>
          current?.owner === normalizedPubkey && !isNewer(list, current.list)
            ? current
            : { owner: normalizedPubkey, list },
        );
      },
    });
    return () => handle.unobserve();
  }, [normalizedPubkey]);

  return snapshot?.owner === normalizedPubkey
    ? snapshot.list.contacts
    : EMPTY_CONTACTS;
}
