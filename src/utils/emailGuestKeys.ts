import { getItem, setItem } from "../common/localStorage";
import { createGuestKey } from "./emailGuestLink";

/**
 * Local store for email guests' one-time RSVP identities.
 *
 * The event itself carries only each guest's *pubkey* (`guest_email` tag,
 * third element) so incoming RSVPs can be labelled. The matching *secret* can
 * never live on the event — every participant shares the viewKey — so it is
 * kept here, on the organizer's device, keyed by the guest's address. The
 * secret is only ever handed to the guest inside their invite link.
 *
 * This mirrors `anonBookingIdentity.ts`. Losing this store is recoverable: a
 * resend with no stored secret falls back to an invite without an RSVP key
 * rather than silently rotating to a new identity that would orphan the
 * guest's prior response.
 */
const STORAGE_KEY = "cal:email_guest_keys";

export interface GuestKeyEntry {
  pubkey: string;
  nsec: string;
}

type GuestKeyMap = Record<string, GuestKeyEntry>;

const entryKey = (email: string): string => email.trim().toLowerCase();

const loadAll = (): GuestKeyMap => getItem<GuestKeyMap>(STORAGE_KEY, {});

/**
 * Return the guest's stable identity, creating and persisting one on first
 * use. `expectedPubkey` (from the event, if any) detects a lost local secret:
 * when the stored key does not match, return null so the caller sends an
 * invite without an RSVP key instead of rotating identity.
 */
export function ensureGuestKey(
  email: string,
  expectedPubkey?: string,
): GuestKeyEntry | null {
  const key = entryKey(email);
  const all = loadAll();
  const existing = all[key];
  if (existing) {
    if (expectedPubkey && existing.pubkey !== expectedPubkey.toLowerCase()) {
      return null;
    }
    return existing;
  }

  const created = createGuestKey(email);
  all[key] = { pubkey: created.pubkey, nsec: created.nsec };
  setItem(STORAGE_KEY, all);
  return all[key];
}
