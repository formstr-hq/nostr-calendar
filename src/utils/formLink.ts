import { nip19 } from "nostr-tools";
// Deep import: SDK doesn't re-export nkeys helpers from its main entry,
// but the file is shipped in dist/. Using the SDK's own implementation
// guarantees the decode matches what Formstr's app uses to encode.
import { decodeNKeys } from "@formstr/sdk/dist/utils/nkeys.js";
import type { IFormAttachment } from "./types";

/**
 * Helpers for converting between user-supplied form references
 * (raw `naddr1...` strings or Formstr URLs) and the canonical
 * `IFormAttachment` shape stored on a calendar event.
 *
 * IMPORTANT — viewKey vs. responseKey
 *
 * Formstr distinguishes two secrets per encrypted form:
 *
 *   • viewKey      — a read-only NIP-44 decryption key, surfaced in
 *                    shareable links as `?viewKey=<hex>` (legacy) or
 *                    inside an `#nkeys1...` bech32-TLV blob (modern).
 *                    Safe to embed in a calendar event so recipients
 *                    can decrypt and fill the form.
 *
 *   • responseKey  — the form *owner's* admin / edit key. Possessing
 *                    it allows modifying the form definition itself,
 *                    so it must NEVER be embedded in a calendar event
 *                    or any user-shared artifact.
 *
 * This module only ever extracts and persists viewKey. Any
 * `responseKey=` query param is intentionally ignored.
 */

const NADDR_REGEX = /naddr1[0-9a-z]+/i;
const NKEYS_REGEX = /nkeys1[0-9a-z]+/i;
const VIEW_KEY_REGEX = /[?&]viewKey=([^&#\s]+)/i;

export type FormAddress = {
  coordinate: string;
  relayHints: string[];
};

/**
 * Extracts an `naddr` from arbitrary user input.
 *
 * Accepts:
 *  - bare `naddr1...`
 *  - Formstr URLs (any path/hash/query variant) containing an `naddr1...`
 *  - leading/trailing whitespace
 *
 * Returns the lowercased naddr if it decodes to a valid Nostr address,
 * otherwise null.
 */
export function extractNaddr(input: string): string | null {
  if (!input) return null;
  const match = input.trim().match(NADDR_REGEX);
  if (!match) return null;
  const candidate = match[0].toLowerCase();
  try {
    const decoded = nip19.decode(candidate);
    if (decoded.type !== "naddr") return null;
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Extracts the optional viewKey from a Formstr URL or share string.
 *
 * Recognised, in priority order, matching Formstr's own URL parser:
 *  1. `nkeys1...` blob (typically a hash fragment) — Formstr's modern
 *     share format, a bech32-TLV envelope carrying `viewKey` (and
 *     optionally `editKey`). Decoded via the SDK's `decodeNKeys`.
 *  2. `?viewKey=<hex>` query param — Formstr's legacy / canonical
 *     query-string form, e.g.
 *       https://formstr.app/f/naddr1...?viewKey=4155adc1f08a7c0d...
 *
 * Any `responseKey=` query parameter is intentionally ignored — that
 * value is the form owner's admin secret and must never propagate
 * through this app.
 *
 * Returns undefined when no viewKey can be extracted.
 */
export function extractViewKey(input: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();

  // 1. nkeys1... blob (anywhere in the string, so naked
  //    "naddr#nkeys..." input without a scheme still works).
  const nkeysMatch = trimmed.match(NKEYS_REGEX);
  if (nkeysMatch) {
    try {
      const decoded = decodeNKeys(nkeysMatch[0]) as { viewKey?: string };
      if (decoded.viewKey) return decoded.viewKey.toLowerCase();
    } catch {
      // fall through to query-param extraction
    }
  }

  // 2. ?viewKey=<hex> query param.
  const queryMatch = trimmed.match(VIEW_KEY_REGEX);
  if (queryMatch?.[1]) {
    return decodeURIComponent(queryMatch[1]).toLowerCase();
  }

  return undefined;
}

/**
 * Parses a user-supplied string (naddr or Formstr URL) into a
 * canonical IFormAttachment. Returns null if no valid naddr is found.
 */
export function parseFormInput(input: string): IFormAttachment | null {
  const naddr = extractNaddr(input);
  if (!naddr) return null;
  const viewKey = extractViewKey(input);
  return viewKey ? { naddr, viewKey } : { naddr };
}

/**
 * Builds a canonical Formstr URL for a given form attachment.
 * Used for "open in Formstr" links.
 *
 * Path style is `https://formstr.app/f/<naddr>` because that is the
 * variant currently exposed by Formstr's public web app at the time of
 * writing. If the attachment carries a viewKey it is appended as the
 * `viewKey` query parameter, matching Formstr's own share-link format
 * and round-tripping through `extractViewKey`.
 */
export function buildFormstrUrl(form: IFormAttachment): string {
  const base = `https://formstr.app/f/${form.naddr}`;
  if (!form.viewKey) return base;
  return `${base}?viewKey=${encodeURIComponent(form.viewKey)}`;
}

/**
 * Builds the Formstr-hosted responses URL for a form attachment.
 *
 * Formstr's current responses route accepts the form `naddr` directly at
 * `/s/:naddr`. If we have a view key, pass it through using Formstr's
 * supported `viewKey` query parameter so encrypted form metadata can still
 * be opened by the Formstr app.
 */
export function buildFormstrResponsesUrl(form: IFormAttachment): string {
  const base = `https://formstr.app/s/${form.naddr}`;
  if (!form.viewKey) return base;
  return `${base}?viewKey=${encodeURIComponent(form.viewKey)}`;
}

/**
 * Decodes a form `naddr` into both pieces we need from the address:
 * the NIP-01 replaceable-event coordinate used for `#a` filters and
 * the relay hints embedded in the same naddr.
 */
export function getFormAddress(naddr: string): FormAddress | null {
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== "naddr") return null;
    const { kind, pubkey, identifier } = decoded.data;
    return {
      coordinate: `${kind}:${pubkey}:${identifier}`,
      relayHints: decoded.data.relays ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Decodes an `naddr` to its NIP-01 replaceable-event coordinate string
 * `<kind>:<pubkey>:<dtag>` used for `#a` filter lookups (NIP-101 form
 * responses tag the source form with this coordinate).
 *
 * Returns null if the input is not a valid naddr.
 */
export function getFormCoordinate(naddr: string): string | null {
  return getFormAddress(naddr)?.coordinate ?? null;
}

/**
 * Returns the relay hints encoded inside a form `naddr`, if any.
 * Useful so response-lookup queries reach the same relays that the
 * form template lives on.
 */
export function getFormRelayHints(naddr: string): string[] {
  return getFormAddress(naddr)?.relayHints ?? [];
}
