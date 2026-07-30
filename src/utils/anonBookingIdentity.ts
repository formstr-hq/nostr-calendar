/**
 * Local lookup table for anonymous booking identities.
 *
 * When a booker chooses "book anonymously", a fresh one-time keypair is
 * generated (`createAnonymousBookerIdentity` in `src/nostr/booking.ts`) and
 * never derived from the real logged-in identity. The booking's own
 * `IOutgoingBooking` record (persisted under `cal:booking_requests_outgoing`,
 * plain `localStorage`) already survives a logged-out session — this module
 * only needs to add the secret-key side, keyed by the booking's d-tag so a
 * later session can resolve which anonymous key to decrypt a given response
 * with.
 */
import { getItem, setItem } from "../common/localStorage";

const ANON_BOOKING_KEYS_STORAGE_KEY = "cal:anon_booking_keys";

interface AnonBookingKeyEntry {
  pubkey: string;
  secretKeyNsec: string;
}

type AnonBookingKeys = Record<string, AnonBookingKeyEntry>;

const loadAll = (): AnonBookingKeys =>
  getItem<AnonBookingKeys>(ANON_BOOKING_KEYS_STORAGE_KEY, {});

export function saveAnonBookingKey(
  dTag: string,
  pubkey: string,
  secretKeyNsec: string,
): void {
  const keys = loadAll();
  keys[dTag] = { pubkey, secretKeyNsec };
  setItem(ANON_BOOKING_KEYS_STORAGE_KEY, keys);
}

export function getAnonBookingKey(
  dTag: string,
): AnonBookingKeyEntry | undefined {
  return loadAll()[dTag];
}

export function getAllAnonBookingPubkeys(): string[] {
  return Object.values(loadAll()).map((entry) => entry.pubkey);
}
