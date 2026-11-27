import { nip19, type Event } from "nostr-tools";
import { signerManager } from "../common/signer";
import { fetchAll } from "./fetch";
import {
  discoverDocuments,
  type DocumentReader,
  type DocumentSummary,
} from "./documentDiscovery";
import { buildAndSign, publishSignedEvent } from "./core";
import type { IDocumentAttachment } from "../utils/types";

async function reader(relays: string[]): Promise<DocumentReader> {
  const signer = await signerManager.getSigner();
  const pubkey = await signer.getPublicKey();
  if (!signer.nip44Decrypt) throw new Error("DOCUMENT_DECRYPT_UNAVAILABLE");
  const snapshots = new Map<string, Promise<Event[]>>();
  let decryptQueue: Promise<unknown> = Promise.resolve();
  return {
    pubkey,
    fetch: (filters) => {
      const key = JSON.stringify(filters);
      let snapshot = snapshots.get(key);
      if (!snapshot) {
        snapshot = fetchAll(filters, { relays });
        snapshots.set(key, snapshot);
      }
      return snapshot;
    },
    decryptOwn: (content) => {
      const result = decryptQueue.then(() =>
        signer.nip44Decrypt!(pubkey, content),
      );
      decryptQueue = result.catch(() => undefined);
      return result;
    },
  };
}
export async function fetchMyDocuments(
  relays: string[],
  onDocument?: (document: DocumentSummary) => void,
) {
  return discoverDocuments(await reader(relays), onDocument);
}
/** Pages personal document: raw Markdown, NIP-44 encrypted to the owner. */
export async function createDocument(
  title: string,
  body: string,
  expectedPubkey: string,
) {
  const signer = await signerManager.getSigner();
  const pubkey = await signer.getPublicKey();
  if (pubkey !== expectedPubkey || !signer.nip44Encrypt)
    throw new Error("DOCUMENT_SIGNER_UNAVAILABLE");
  const safeTitle = title
    .trim()
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);
  if (!safeTitle) throw new Error("DOCUMENT_TITLE_REQUIRED");
  const markdown = `# ${safeTitle}\n\n${body}`;
  if (new TextEncoder().encode(markdown).length > 60000)
    throw new Error("DOCUMENT_TOO_LARGE");
  const identifier = crypto.randomUUID();
  const content = await signer.nip44Encrypt(pubkey, markdown);
  const signed = await buildAndSign(
    {
      kind: 33457,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", identifier]],
      content,
    },
    signer,
  );
  const result = await publishSignedEvent(signed);
  const relays = result.relayResults
    .filter((r) => r.status === "accepted")
    .map((r) => r.relay);
  return {
    document: {
      naddr: nip19.naddrEncode({ kind: 33457, pubkey, identifier, relays }),
      title: safeTitle,
    } satisfies IDocumentAttachment,
    queued: relays.length === 0,
  };
}
