import { create } from "zustand";
import { nip19 } from "nostr-tools";
import { getPublicKey } from "nostr-tools/pure";
import { LocalSigner, type ActiveSigner } from "@formstr/signer";
import { decodeGuestFragment } from "../utils/emailGuestLink";

/**
 * Transient guest RSVP session for email guests on private events.
 *
 * An email guest who opens their invite link carries a one-time `nsec` in the
 * URL fragment. This store holds that identity in memory only (never
 * localStorage) so the app can sign their RSVP as that guest pubkey. It is
 * scoped to the browser tab and cleared when the tab closes — the guest can
 * always re-adopt it by reopening their link.
 *
 * Deliberately separate from `signerManager`: adopting a guest identity must
 * never become a full login or touch the user's real session.
 */
interface GuestSessionState {
  /** Guest pubkey (hex) for the active fragment, or null when none. */
  pubkey: string | null;
  /** Guest email from the fragment, for display. */
  email: string | null;
  /** The raw fragment value last adopted, to avoid redundant re-adoption. */
  fragment: string | null;
  adoptFromFragment: (fragment: string) => boolean;
  clear: () => void;
}

let guestSigner: ActiveSigner | null = null;

export const useGuestSession = create<GuestSessionState>((set) => ({
  pubkey: null,
  email: null,
  fragment: null,

  adoptFromFragment: (fragment) => {
    const payload = decodeGuestFragment(fragment);
    if (!payload) return false;
    try {
      const secretKey = nip19.decode(payload.nsec as `nsec1${string}`)
        .data as Uint8Array;
      guestSigner = new LocalSigner(secretKey);
      // Derive the pubkey synchronously here so `guestActive` is correct on
      // the very next render — an async resolve would briefly leave a guest
      // looking logged-out and hide the RSVP bar.
      set({
        pubkey: getPublicKey(secretKey).toLowerCase(),
        email: payload.email,
        fragment,
      });
      return true;
    } catch {
      return false;
    }
  },

  clear: () => {
    guestSigner = null;
    set({ pubkey: null, email: null, fragment: null });
  },
}));

/** Signer for the active guest session, or null when none is adopted. */
export function getGuestSigner(): ActiveSigner | null {
  return guestSigner;
}
