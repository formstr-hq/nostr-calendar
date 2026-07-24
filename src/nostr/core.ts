import { Event, UnsignedEvent, getEventHash } from "nostr-tools";
import { dataLayer, type PublishResult } from "@formstr/local-relay";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { signerManager } from "../common/signer";

/**
 * Signs an unsigned event with the current signer and stamps the correct
 * event id (some signers return an id computed differently than the wire
 * format expects, so we always recompute it from the unsigned template).
 */
export async function buildAndSign(unsigned: UnsignedEvent): Promise<Event> {
  const signer = await signerManager.getSigner();
  const signed = await signer.signEvent(unsigned);
  signed.id = getEventHash(unsigned);
  return signed;
}

/** sha256/hex/30-char d-tag idiom shared by RSVPs, calendar lists, booking d-tags, etc. */
export function makeDTag(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input))).substring(0, 30);
}

/**
 * Replaceable events with equal created_at are tie-broken by lowest id
 * (NIP-01), so an edit published in the same second as the version it
 * replaces could silently lose. Stay strictly after the previous version.
 */
export function nextCreatedAt(previousCreatedAtSecs = 0): number {
  return Math.max(Math.floor(Date.now() / 1000), previousCreatedAtSecs + 1);
}

/**
 * Feed relay hints (from naddrs, gift wraps, form links…) to the worker's
 * gossip pool so discovery reads can reach them. Read-only routing input —
 * never a publish target. Malformed hints are ignored by the worker.
 */
export function addGossipRelays(hints: Array<string | undefined>) {
  for (const hint of hints) {
    if (hint) dataLayer.addGossipRelay(hint);
  }
}

/**
 * Publish an already-signed event through the local relay. The worker owns
 * relay routing (user relays ∪ author outbox ∪ p-tagged recipients' inbox)
 * and keeps re-delivering via its durable outbox, so zero acceptance means
 * "queued for retry", not "failed" — this never throws. Per-relay outcomes
 * feed the publish-status UI through the optional callbacks.
 */
export async function publishSignedEvent(
  signed: Event,
  callbacks?: {
    onAcceptedRelays?: (url: string) => void;
    onRelayComplete?: (url: string, success: boolean) => void;
  },
): Promise<PublishResult> {
  const result = await dataLayer.publishEvent(signed);
  for (const outcome of result.relayResults) {
    const ok = outcome.status === "accepted";
    if (ok) callbacks?.onAcceptedRelays?.(outcome.relay);
    callbacks?.onRelayComplete?.(outcome.relay, ok);
  }
  return result;
}
