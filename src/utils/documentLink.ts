import { nip19, getPublicKey } from "nostr-tools";
import { hexToBytes } from "nostr-tools/utils";
import { bech32 } from "bech32";
import { decodeNKeys, encodeNKeys } from "./documentKeys";
import type { IDocumentAttachment } from "./types";

export const PAGES_ORIGIN = "https://pages.formstr.app";
export function validDocumentKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) return false;
  try {
    getPublicKey(hexToBytes(value));
    return true;
  } catch {
    return false;
  }
}

export function documentPointer(naddr: string) {
  const decoded = nip19.decode(naddr);
  if (
    decoded.type !== "naddr" ||
    decoded.data.kind !== 33457 ||
    !decoded.data.identifier ||
    !/^[a-f0-9]{64}$/.test(decoded.data.pubkey)
  ) {
    throw new Error("INVALID_DOCUMENT");
  }
  return decoded.data;
}

export function documentAddress(naddr: string) {
  const p = documentPointer(naddr);
  return `33457:${p.pubkey}:${p.identifier}`;
}

/** Strict Pages URL (or bare naddr), never arbitrary hosts, queries or device paths. */
export function parseDocumentInput(input: string): IDocumentAttachment | null {
  try {
    const text = input.trim();
    const url = text.startsWith("naddr1")
      ? new URL(`/doc/${text}`, PAGES_ORIGIN)
      : new URL(text);
    if (
      url.origin !== PAGES_ORIGIN ||
      url.username ||
      url.password ||
      url.search
    )
      return null;
    const match = url.pathname.match(/^\/doc\/(naddr1[0-9a-z]+)$/);
    if (!match) return null;
    const pointer = documentPointer(match[1]);
    // Relay hints are retained only if they are safe websocket URLs.
    const relays = (pointer.relays ?? []).filter((r) => {
      try {
        const u = new URL(r);
        return (
          u.protocol === "wss:" &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash
        );
      } catch {
        return false;
      }
    });
    const naddr = nip19.naddrEncode({ ...pointer, relays });
    if (!url.hash) return { naddr };
    const fragment = url.hash.slice(1);
    const decoded = bech32.decode(fragment, 2048);
    if (decoded.prefix !== "nkeys") return null;
    const bytes = bech32.fromWords(decoded.words);
    let names = 0,
      values = 0;
    for (let i = 0; i < bytes.length; ) {
      if (i + 2 > bytes.length || i + 2 + bytes[i + 1] > bytes.length)
        return null;
      if (bytes[i] === 0) names++;
      else if (bytes[i] === 1) values++;
      else return null;
      i += 2 + bytes[i + 1];
    }
    if (!names || names !== values) return null;
    const keys = decodeNKeys(fragment);
    if (!validDocumentKey(keys.viewKey)) return null;
    // Never retain legacy edit/signing keys, or the original untrusted URL.
    return { naddr, viewKey: keys.viewKey.toLowerCase() };
  } catch {
    return null;
  }
}

export function buildDocumentUrl(doc: IDocumentAttachment, isPrivate: boolean) {
  const parsed = parseDocumentInput(doc.naddr);
  if (!parsed) return null;
  const fragment =
    isPrivate && validDocumentKey(doc.viewKey)
      ? `#${encodeNKeys({ viewKey: doc.viewKey })}`
      : "";
  return `${PAGES_ORIGIN}/doc/${parsed.naddr}${fragment}`;
}

/** Privacy boundary, used by BOTH writers and readers; never serialize arbitrary objects. */
export function documentTags(
  documents: IDocumentAttachment[] = [],
  isPrivate: boolean,
): string[][] {
  const seen = new Set<string>();
  return documents.flatMap((doc) => {
    const parsed = parseDocumentInput(doc.naddr);
    if (!parsed || parsed.viewKey) return [];
    const address = documentAddress(parsed.naddr);
    if (seen.has(address)) return [];
    seen.add(address);
    return [
      isPrivate
        ? [
            "document",
            parsed.naddr,
            validDocumentKey(doc.viewKey) ? doc.viewKey : "",
            typeof doc.title === "string" ? doc.title.slice(0, 200) : "",
          ]
        : ["document", parsed.naddr],
    ];
  });
}

export function documentsFromTags(
  tags: string[][],
  isPrivate: boolean,
): IDocumentAttachment[] {
  return documentTags(
    tags
      .filter((t) => t[0] === "document")
      .map((t) => ({ naddr: t[1], viewKey: t[2], title: t[3] })),
    isPrivate,
  ).map((t) => ({
    naddr: t[1],
    ...(t[2] ? { viewKey: t[2] } : {}),
    ...(t[3] ? { title: t[3] } : {}),
  }));
}
