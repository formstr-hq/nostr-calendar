import { documentReads } from "./documentReads";
// Read-only adaptation of nostr-docs DocumentContext, SharedDocsContext and sharedDoc.
import { getPublicKey, nip19, type Event, type Filter } from "nostr-tools";
import { decrypt, getConversationKey } from "nostr-tools/nip44";
import { hexToBytes } from "nostr-tools/utils";
import {
  documentPointer,
  documentAddress,
  validDocumentKey,
} from "../utils/documentLink";
import type { IDocumentAttachment } from "../utils/types";

export interface DocumentSummary extends IDocumentAttachment {
  source: "personal" | "shared";
}
export interface DocumentReader {
  pubkey: string;
  fetch: (filters: Filter[]) => Promise<Event[]>;
  decryptOwn: (content: string) => Promise<string>;
}
interface Metadata {
  title?: string;
  viewKey?: string;
  mode?: string;
  members?: { pubkey: string; role: string }[];
}
const tag = (e: Event, key: string) =>
  e.tags.find((t) => t[0] === key)?.[1] ?? "";
const address = (e: Event) => `${e.kind}:${e.pubkey}:${tag(e, "d")}`;
const newer = (a: Event, b: Event) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);
export function latestDocuments(events: Event[]) {
  const latest = new Map<string, Event>();
  for (const e of events) {
    const prev = latest.get(address(e));
    if (!prev || newer(e, prev)) latest.set(address(e), e);
  }
  return [...latest.values()];
}
export function documentDeleted(event: Event, deletions: Event[]) {
  return deletions.some(
    (d) =>
      d.kind === 5 &&
      d.pubkey === event.pubkey &&
      d.tags.some(
        (t) =>
          (t[0] === "e" && t[1] === event.id) ||
          (t[0] === "a" &&
            t[1] === address(event) &&
            d.created_at >= event.created_at),
      ),
  );
}
function decryptView(content: string, key: string) {
  const bytes = hexToBytes(key);
  return decrypt(content, getConversationKey(bytes, getPublicKey(bytes)));
}
function metadata(raw: string): Metadata {
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_METADATA");
  return value;
}
function titleOf(content: string) {
  return (content.split("\n").find((line) => line.trim()) ?? "")
    .replace(/^#+\s*/, "")
    .replace(/\\\s*$/, "")
    .trim()
    .slice(0, 200);
}
function fromAddress(value: string): string | null {
  const match = value.match(/^33457:([a-f0-9]{64}):(.+)$/);
  return match
    ? nip19.naddrEncode({ kind: 33457, pubkey: match[1], identifier: match[2] })
    : null;
}

/** Resolves access without publishing, changing a roster or returning discovered keys. */
export async function resolveDocument(
  doc: IDocumentAttachment,
  reader: DocumentReader,
  ownMeta?: Metadata,
): Promise<DocumentSummary | null> {
  const p = documentPointer(doc.naddr);
  const root = documentAddress(doc.naddr);
  const key = doc.viewKey ?? ownMeta?.viewKey;
  let roster: Metadata | undefined;
  if (validDocumentKey(key)) {
    const rows = latestDocuments(
      await reader.fetch([
        { kinds: [34579], authors: [p.pubkey], "#d": [root] },
      ]),
    );
    const row = rows.find((e) => e.pubkey === p.pubkey && tag(e, "d") === root);
    if (row) {
      try {
        roster = metadata(decryptView(row.content, key));
      } catch {
        /* legacy/no accessible roster */
      }
    }
  }
  const authors = new Set([p.pubkey]);
  if (Array.isArray(roster?.members))
    for (const m of roster.members) {
      if (m?.role === "editor" && /^[a-f0-9]{64}$/.test(m.pubkey))
        authors.add(m.pubkey);
    }
  const room = validDocumentKey(key)
    ? getPublicKey(hexToBytes(key))
    : undefined;
  const open = roster?.mode === "open" && !!room;
  const fetched = await reader.fetch([
    open
      ? { kinds: [33457], "#a": [room!] }
      : { kinds: [33457], authors: [...authors], "#d": [p.identifier] },
  ]);
  const versions = latestDocuments(
    fetched.filter(
      (e) =>
        e.kind === 33457 &&
        (open
          ? tag(e, "a") === room
          : authors.has(e.pubkey) && tag(e, "d") === p.identifier),
    ),
  );
  const deletions = await reader.fetch([
    {
      kinds: [5],
      authors: [...new Set([p.pubkey, ...versions.map((e) => e.pubkey)])],
    },
  ]);
  // Owner's root deletion hides all group versions, including editor-owned slots.
  if (
    deletions.some(
      (e) =>
        e.kind === 5 &&
        e.pubkey === p.pubkey &&
        e.tags.some((t) => t[0] === "a" && t[1] === root),
    )
  )
    return null;
  const max = Math.floor(Date.now() / 1000) + 300;
  versions.sort(
    (a, b) =>
      Math.min(b.created_at, max) - Math.min(a.created_at, max) ||
      a.id.localeCompare(b.id),
  );
  for (const version of versions) {
    if (documentDeleted(version, deletions)) continue;
    try {
      const content = validDocumentKey(key)
        ? decryptView(version.content, key)
        : version.pubkey === reader.pubkey
          ? await reader.decryptOwn(version.content)
          : null;
      if (content === null) continue;
      const title =
        typeof ownMeta?.title === "string"
          ? ownMeta.title
          : typeof roster?.title === "string"
            ? roster.title
            : titleOf(content);
      return {
        naddr: doc.naddr,
        title: title.slice(0, 200),
        source: p.pubkey === reader.pubkey ? "personal" : "shared",
      };
    } catch {
      /* inaccessible, revoked or malformed content */
    }
  }
  return null;
}

export async function discoverDocuments(
  reader: DocumentReader,
  onDocument?: (document: DocumentSummary) => void,
): Promise<{ documents: DocumentSummary[]; incomplete: boolean }> {
  const events = await reader.fetch([
    { kinds: [33457, 34579, 5], authors: [reader.pubkey] },
  ]);
  const candidates = new Map<string, { naddr: string; meta?: Metadata }>();
  let incomplete = false;
  for (const e of latestDocuments(events)) {
    if (e.pubkey !== reader.pubkey) continue;
    if (e.kind === 33457 && tag(e, "d")) {
      const root = address(e);
      const prev = candidates.get(root);
      candidates.set(root, { ...prev, naddr: fromAddress(root)! });
    } else if (e.kind === 34579) {
      const root = tag(e, "d");
      const naddr = fromAddress(root);
      if (!naddr) continue;
      try {
        const meta = metadata(await reader.decryptOwn(e.content));
        if (
          validDocumentKey(meta.viewKey) ||
          documentPointer(naddr).pubkey === reader.pubkey
        )
          candidates.set(root, { naddr, meta });
      } catch {
        incomplete = true;
      }
    }
  }
  const documents: DocumentSummary[] = [];
  const snapshotReader = documentReads(reader, events);
  await Promise.all(
    [...candidates.values()].map(async (candidate) => {
      try {
        const doc = await resolveDocument(
          { naddr: candidate.naddr },
          snapshotReader,
          candidate.meta,
        );
        if (doc) {
          documents.push(doc);
          onDocument?.(doc);
        } else incomplete = true;
      } catch {
        incomplete = true;
      }
    }),
  );
  return { documents, incomplete };
}
