import { nip19 } from "nostr-tools";
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
 *                    shareable links as `?viewKey=<hex>`. Safe to embed
 *                    in a calendar event so recipients can decrypt and
 *                    fill the form.
 *
 *   • responseKey  — the form *owner's* admin / edit key. Possessing
 *                    it allows modifying the form definition itself,
 *                    so it must NEVER be embedded in a calendar event
 *                    or any user-shared artifact.
 *
 * This module only ever extracts and persists viewKey. If a URL accidentally
 * contains a `responseKey=` query param it is ignored.
 */

const NADDR_REGEX = /naddr1[0-9a-z]+/i;
const VIEW_KEY_REGEX = /[?&]viewKey=([^&#\s]+)/i;

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
 * Extracts the optional `viewKey` query parameter from a Formstr URL.
 *
 * Only the `?viewKey=<value>` query form is recognized — this matches
 * Formstr's canonical share-link format, e.g.
 *
 *   https://formstr.app/f/naddr1...?viewKey=4155adc1f08a7c0d...
 *
 * Returns undefined when the input contains no viewKey. Any
 * `responseKey=` parameter is intentionally ignored, as it represents
 * the form owner's admin secret and must not propagate.
 */
export function extractViewKey(input: string): string | undefined {
  if (!input) return undefined;
  const match = input.trim().match(VIEW_KEY_REGEX);
  if (!match?.[1]) return undefined;
  return decodeURIComponent(match[1]).toLowerCase();
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
 * `viewKey` query parameter, matching Formstr's own share-link format.
 */
export function buildFormstrUrl(form: IFormAttachment): string {
  const base = `https://formstr.app/f/${form.naddr}`;
  if (!form.viewKey) return base;
  return `${base}?viewKey=${encodeURIComponent(form.viewKey)}`;
}
