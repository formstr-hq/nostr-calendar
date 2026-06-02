import { Event, UnsignedEvent } from "nostr-tools";

export interface NostrSigner {
  getPublicKey: () => Promise<string>;
  signEvent: (event: UnsignedEvent) => Promise<Event>;
  encrypt?: (pubkey: string, plaintext: string) => Promise<string>;
  decrypt?: (pubkey: string, ciphertext: string) => Promise<string>;
  nip44Encrypt?: (pubkey: string, txt: string) => Promise<string>;
  nip44Decrypt?: (pubkey: string, ct: string) => Promise<string>;
  getRelays?: () => Promise<string[]>;
}
