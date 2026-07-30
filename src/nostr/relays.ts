import { UnsignedEvent } from "nostr-tools";
import { signerManager } from "../common/signer";
import { EventKinds } from "./kinds";
import { getUserPublicKey } from "./crypto";
import { buildAndSign, publishSignedEvent, addGossipRelays } from "./core";
import { fetchAll, fetchLatest } from "./fetch";

export const fetchRelayList = async (pubkey: string): Promise<string[]> => {
  // NIP-46 signers know their bunker relays — useful discovery hints.
  addGossipRelays(await signerManager.getSignerRelays());
  const event = await fetchLatest([
    { kinds: [EventKinds.RelayList], authors: [pubkey], limit: 1 },
  ]);
  if (!event) return [];
  return event.tags
    .filter((tag) => tag[0] === "r" && tag[1])
    .map((tag) => tag[1]);
};

/**
 * Fetches relay lists (kind 10002) for multiple pubkeys in a single query.
 * Returns a map of pubkey → relay URLs. Pubkeys with no relay list are omitted.
 * The fetched lists also land in the worker's store, teaching its outbox
 * router the recipients' relays — call before publishing p-tagged events.
 */
export const fetchRelayLists = async (
  pubkeys: string[],
): Promise<Map<string, string[]>> => {
  if (pubkeys.length === 0) return new Map();
  addGossipRelays(await signerManager.getSignerRelays());
  const events = await fetchAll([
    { kinds: [EventKinds.RelayList], authors: pubkeys },
  ]);
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
  const unsigned: UnsignedEvent = {
    kind: EventKinds.RelayList,
    pubkey: pubKey,
    tags,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  await publishSignedEvent(await buildAndSign(unsigned));
};
