import { nip19 } from "nostr-tools";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
// Deep import for the same reason as `formLink.ts`: the calendar app has
// shipped against these helpers before, and this path is guaranteed stable.
import { encodeNKeys, decodeNKeys } from "@formstr/sdk/dist/utils/nkeys.js";

/**
 * Guest RSVP key + invite-link helpers (private events only).
 *
 * An email guest has no Nostr key, so they cannot sign an RSVP. To let them
 * respond without a signer, the organizer generates a one-time keypair per
 * email guest and hands the guest the secret in the invite link. The link
 * carries it in an `#nkeys1...` bech32-TLV fragment (the same envelope
 * Formstr uses), which browsers never send to a server — the secret stays
 * client-side, exactly like the event's own `?viewKey` share link.
 *
 * The guest's *pubkey* (never the secret) is what the organizer records on the
 * event (`["guest_email", address, guestNpub]`) so incoming RSVPs signed by
 * that key can be labelled with the guest's address.
 */

export interface GuestKey {
  email: string;
  /** hex pubkey of the guest's one-time identity. */
  pubkey: string;
  /** nsec of the guest's one-time identity. */
  nsec: string;
}

export interface GuestLinkPayload {
  nsec: string;
  email: string;
}

/** Generate a fresh one-time identity for an email guest. */
export function createGuestKey(email: string): GuestKey {
  const secretKey = generateSecretKey();
  return {
    email: email.trim().toLowerCase(),
    pubkey: getPublicKey(secretKey),
    nsec: nip19.nsecEncode(secretKey),
  };
}

/** Encode `{ nsec, email }` into an `nkeys1...` fragment value (no `#`). */
export function encodeGuestFragment(payload: GuestLinkPayload): string {
  return encodeNKeys({ nsec: payload.nsec, email: payload.email });
}

/** Decode an `nkeys1...` fragment back to its payload, or null if unusable. */
export function decodeGuestFragment(fragment: string): GuestLinkPayload | null {
  const match = fragment.trim().match(/nkeys1[0-9a-z]+/i);
  if (!match) return null;
  try {
    const decoded = decodeNKeys(match[0]) as Partial<GuestLinkPayload>;
    if (!decoded.nsec || !decoded.email) return null;
    return { nsec: decoded.nsec, email: decoded.email.toLowerCase() };
  } catch {
    return null;
  }
}

/** Append the guest fragment to an event URL (replacing any existing hash). */
export function withGuestFragment(url: string, fragment: string): string {
  const base = url.split("#")[0];
  return `${base}#${fragment}`;
}
