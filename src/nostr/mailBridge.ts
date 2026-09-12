import { nip19 } from "nostr-tools";
import { signerManager } from "../common/signer";
import type { ActiveSigner } from "@formstr/signer";
import type { UnsignedEvent } from "nostr-tools";

/**
 * mailstr bridge / alias resolution.
 *
 * Email guests are delivered through a "mailstr"-style Nostr↔SMTP bridge.
 * The bridge is the only trusted component on the mail side: it authorizes
 * outgoing mail against the kind-13 seal's pubkey, so the app seals each
 * invite with the organizer's real key and may only use a From address whose
 * NIP-05 record maps to that key.
 *
 * The bridge for a domain is discovered at `_smtp@<domain>` over NIP-05,
 * mirroring the mailstr client (sister `nail` repo, docs/ARCHITECTURE.md §7).
 * There is no hard dependency on any HTTP API: aliases can always be typed
 * manually, and an account API is used only to suggest them when available.
 */

export const MAIL_BRIDGE_NIP05_NAME = "_smtp";

/** Default mail domain used to qualify bare aliases. */
export const DEFAULT_MAIL_DOMAIN =
  import.meta.env.VITE_MAIL_DOMAIN ?? "mailstr.app";

/**
 * Optional Formstr account API that lists a user's registered aliases.
 * Empty string disables the lookup entirely — the app then relies on manual
 * entry only.
 */
export const MAIL_API_BASE_URL = import.meta.env.VITE_MAIL_API_BASE_URL ?? "";

/** Where users go to claim a mail address when they own none yet. */
export const MAIL_LANDING_URL =
  import.meta.env.VITE_MAIL_LANDING_URL ?? `https://${DEFAULT_MAIL_DOMAIN}`;

const HEX_PUBKEY = /^[0-9a-f]{64}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True for a plain RFC-ish email address (no Nostr identity implied). */
export function isEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export interface MailAddressParts {
  localpart: string;
  domain: string;
}

/** Split and normalize an address; null when it isn't a usable address. */
export function splitMailAddress(value: string): MailAddressParts | null {
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");
  if (at < 1) return null;
  const localpart = trimmed.slice(0, at).toLowerCase();
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!localpart || !domain || !EMAIL_RE.test(trimmed)) return null;
  return { localpart, domain };
}

/** Lowercased, plus-tag stripped localpart — the mailbox an address owns. */
export function normalizeLocalpart(value: string): string {
  const parts = splitMailAddress(value);
  const local = parts ? parts.localpart : value.trim().toLowerCase();
  const plus = local.indexOf("+");
  return plus > 0 ? local.slice(0, plus) : local;
}

/**
 * Turn user input into a full address: a bare localpart (e.g. `alice`) is
 * qualified with the default mail domain, an address is lowercased/trimmed.
 * Applied at the send boundary so the UI can hold raw input without fighting
 * the controlled field mid-keystroke.
 */
export function qualifyMailAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) {
    const parts = splitMailAddress(trimmed);
    return parts ? `${parts.localpart}@${parts.domain}` : trimmed.toLowerCase();
  }
  return `${normalizeLocalpart(trimmed)}@${DEFAULT_MAIL_DOMAIN}`;
}

const BRIDGE_PROBE_TIMEOUT_MS = 4000;
const BRIDGE_CACHE_TTL_MS = 10 * 60 * 1000;
const bridgeCache = new Map<
  string,
  { pubkey: string | null; expires: number }
>();

/** Cached, bounded NIP-05 name→pubkey probe. Fail-closed (null on any error). */
export async function probeNip05Pubkey(
  address: string,
  timeoutMs = BRIDGE_PROBE_TIMEOUT_MS,
): Promise<string | null> {
  const parts = splitMailAddress(address);
  if (!parts) return null;
  const key = `${parts.localpart}@${parts.domain}`;
  const cached = bridgeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.pubkey;

  let pubkey: string | null = null;
  try {
    const response = await fetch(
      `https://${parts.domain}/.well-known/nostr.json?name=${encodeURIComponent(
        parts.localpart,
      )}`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (response.ok) {
      const body = (await response.json()) as {
        names?: Record<string, string>;
      };
      const value = body.names?.[parts.localpart];
      pubkey =
        typeof value === "string" && HEX_PUBKEY.test(value)
          ? value.toLowerCase()
          : null;
    }
  } catch {
    pubkey = null;
  }
  bridgeCache.set(key, {
    pubkey,
    expires: Date.now() + BRIDGE_CACHE_TTL_MS,
  });
  return pubkey;
}

/**
 * Resolve the bridge pubkey for a domain. An explicit override (npub, hex
 * pubkey, NIP-05 address, or bare domain) wins over discovery. Returns null
 * when nothing resolves — callers must then refuse to email rather than
 * silently dropping the invite.
 */
export async function resolveMailBridgePubkey(
  domain: string,
  override?: string,
): Promise<string | null> {
  const input = override?.trim();
  if (input) {
    if (HEX_PUBKEY.test(input)) return input.toLowerCase();
    if (input.startsWith("npub1")) {
      try {
        const decoded = nip19.decode(input);
        if (decoded.type === "npub") {
          return (decoded.data as string).toLowerCase();
        }
      } catch {
        return null;
      }
    }
    const target = input.includes("@")
      ? input
      : `${MAIL_BRIDGE_NIP05_NAME}@${input}`;
    return probeNip05Pubkey(target);
  }
  return probeNip05Pubkey(`${MAIL_BRIDGE_NIP05_NAME}@${domain}`);
}

/** Normalize any plausible get-nip05 response body into full addresses. */
export function normalizeOwnedAliases(body: unknown): string[] {
  const qualify = (alias: string) =>
    alias.includes("@")
      ? alias.trim().toLowerCase()
      : `${alias.trim().toLowerCase()}@${DEFAULT_MAIL_DOMAIN}`;

  let raw: string[] = [];
  if (typeof body === "string") raw = [body];
  else if (Array.isArray(body)) {
    raw = body.flatMap((entry): string[] => {
      if (typeof entry === "string") return [entry];
      if (entry && typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.nip05 === "string") return [obj.nip05];
        if (typeof obj.name === "string") return [obj.name];
      }
      return [];
    });
  } else if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.nip05 === "string") raw = [obj.nip05];
    else if (Array.isArray(obj.nip05Addresses)) {
      raw = obj.nip05Addresses.filter(
        (v): v is string => typeof v === "string",
      );
    }
  }

  return Array.from(new Set(raw.map(qualify).filter(isEmailAddress)));
}

async function buildNip98Header(
  signer: ActiveSigner,
  url: string,
): Promise<string> {
  const signed = await signer.signEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["u", url],
      ["method", "GET"],
    ],
    content: "",
  } as unknown as UnsignedEvent);
  return `Nostr ${btoa(JSON.stringify(signed))}`;
}

/**
 * Best-effort lookup of the signed-in account's registered aliases from the
 * Formstr account API (NIP-98 authenticated). Convenience only: aliases can
 * always be typed manually, and a deployment with no API configured simply
 * gets `{ ok: false }`. Never throws.
 */
export async function fetchOwnedMailAliases(): Promise<{
  ok: boolean;
  addresses: string[];
}> {
  if (!MAIL_API_BASE_URL) return { ok: false, addresses: [] };
  try {
    const signer = await signerManager.getSigner();
    const url = `${MAIL_API_BASE_URL}/api/nip-05/get-nip05`;
    const response = await fetch(url, {
      headers: { Authorization: await buildNip98Header(signer, url) },
    });
    if (!response.ok) return { ok: false, addresses: [] };
    return {
      ok: true,
      addresses: normalizeOwnedAliases(await response.json()),
    };
  } catch {
    return { ok: false, addresses: [] };
  }
}

/**
 * Does the signing key provably own this From address? True for
 * `<npub>@<domain>` (provable from the key itself) and for any address whose
 * NIP-05 record maps to the sender. This mirrors the bridge's own
 * authorization (nail `outbound.ts`) so the app can fail fast with a clear
 * message instead of earning a silent bounce.
 */
export async function senderOwnsFromAddress(
  from: string,
  senderPubkey: string,
): Promise<boolean> {
  const parts = splitMailAddress(from);
  if (!parts) return false;
  if (parts.localpart.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(parts.localpart);
      return (
        decoded.type === "npub" &&
        (decoded.data as string).toLowerCase() === senderPubkey.toLowerCase()
      );
    } catch {
      return false;
    }
  }
  return (await probeNip05Pubkey(from)) === senderPubkey.toLowerCase();
}
