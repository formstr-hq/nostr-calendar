import { Event } from "nostr-tools";
import { EventKinds } from "./kinds";
import { addGossipRelays } from "./core";
import { fetchAll, fetchLatest } from "./fetch";

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
 * Note: this is the canonical relay-backed "has the user submitted?" check.
 * UI may layer a short-lived local fallback over this for relay-lag resilience,
 * but this function only reports events that exist on relays.
 */
export const fetchUserFormResponse = async (
  formCoordinate: string,
  userPubkey: string,
  extraRelays: string[] = [],
): Promise<Event | null> => {
  addGossipRelays(extraRelays);
  // No `limit`: local-relay 0.4.2's outbox fetch drops tag filters from the
  // wire REQ, so a limit would cap to the author's newest events rather than
  // this form's responses. The interest itself still matches by #a.
  return fetchLatest([
    {
      kinds: [EventKinds.FormResponse],
      authors: [userPubkey],
      "#a": [formCoordinate],
    },
  ]);
};

export const getAllResponsesForForm = async (
  formCoordinate: string,
  extraRelays: string[] = [],
): Promise<Event[]> => {
  addGossipRelays(extraRelays);
  return fetchAll([
    {
      kinds: [EventKinds.FormResponse],
      "#a": [formCoordinate],
    },
  ]);
};
