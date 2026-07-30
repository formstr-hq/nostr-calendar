import { NIP05_REGEX } from "nostr-tools/nip05";

/** Resolve a NIP-05 identifier without treating an unverified profile field as proof. */
export async function resolveNip05(nip05: string): Promise<string | null> {
  const match = nip05.match(NIP05_REGEX);
  if (!match) return null;
  const [, name = "_", domain] = match;
  try {
    const response = await fetch(
      `https://${domain}/.well-known/nostr.json?name=${name}`,
      { redirect: "error" },
    );
    const body = await response.json();
    const pubkey = body.names?.[name];
    return typeof pubkey === "string" && /^[0-9a-f]{64}$/i.test(pubkey)
      ? pubkey.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export async function verifyNip05(
  nip05: string,
  pubkey: string,
): Promise<boolean> {
  return (await resolveNip05(nip05)) === pubkey.toLowerCase();
}
