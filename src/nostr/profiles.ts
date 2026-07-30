import { Event } from "nostr-tools";
import { EventKinds } from "./kinds";
import { fetchLatest } from "./fetch";

export const fetchUserProfile = async (
  pubkey: string,
): Promise<Event | null> => {
  return fetchLatest([
    { kinds: [EventKinds.UserProfile], authors: [pubkey], limit: 1 },
  ]);
};
