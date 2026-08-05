import { NIP05_REGEX } from "nostr-tools/nip05";

const RESOLUTION_TTL_MS = 5 * 60 * 1000;
const resolutionCache = new Map<
  string,
  { promise: Promise<string | null>; expiresAt: number }
>();

export function isNip05Identifier(value: string): boolean {
  return NIP05_REGEX.test(value.trim());
}

/** Resolve a NIP-05 identifier without treating an unverified profile field as proof. */
export function resolveNip05(nip05: string): Promise<string | null> {
  const normalized = nip05.trim().toLowerCase();
  const cached = resolutionCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const resolution = resolveUncached(normalized);
  const entry = { promise: resolution, expiresAt: Number.POSITIVE_INFINITY };
  resolutionCache.set(normalized, entry);
  void resolution.then((pubkey) => {
    if (resolutionCache.get(normalized) !== entry) return;
    if (pubkey) entry.expiresAt = Date.now() + RESOLUTION_TTL_MS;
    else resolutionCache.delete(normalized);
  });
  return resolution;
}

async function resolveUncached(nip05: string): Promise<string | null> {
  const match = nip05.match(NIP05_REGEX);
  if (!match) return null;
  const [, name = "_", domain] = match;
  try {
    const response = await fetch(
      `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
      { redirect: "error" },
    );
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    const names = (body as Record<string, unknown>).names;
    if (!names || typeof names !== "object" || Array.isArray(names)) {
      return null;
    }
    const pubkey = (names as Record<string, unknown>)[name];
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
