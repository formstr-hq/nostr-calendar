import { getPublicKey } from "nostr-tools";
import { nsecEncode, npubEncode } from "nostr-tools/nip19";
import { encrypt as nip49Encrypt } from "nostr-tools/nip49";

export const TEST_PASSPHRASE = "e2e-test-passphrase";

const SEEDS: Record<string, string> = {
  alice: "aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0001",
  bob:   "bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0002",
  carol: "cccc0000cccc0000cccc0000cccc0000cccc0000cccc0000cccc0000cccc0003",
};

export type TestKey = {
  secretBytes: Uint8Array;
  secretHex: string;
  pubkey: string;
  nsec: string;
  npub: string;
  ncryptsec: string;
};

function deriveKey(hexSeed: string): TestKey {
  const secretBytes = Uint8Array.from(Buffer.from(hexSeed, "hex"));
  const pubkey = getPublicKey(secretBytes);
  return {
    secretBytes,
    secretHex: hexSeed,
    pubkey,
    nsec: nsecEncode(secretBytes),
    npub: npubEncode(pubkey),
    ncryptsec: nip49Encrypt(secretBytes, TEST_PASSPHRASE),
  };
}

export const TEST_KEYS = Object.fromEntries(
  Object.entries(SEEDS).map(([name, hex]) => [name, deriveKey(hex)]),
) as Record<"alice" | "bob" | "carol", TestKey>;
