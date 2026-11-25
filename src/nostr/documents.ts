import type { Event } from "nostr-tools";
import { signerManager } from "../common/signer";
import { fetchAll } from "./fetch";
import {
  discoverDocuments,
  resolveDocument,
  type DocumentReader,
} from "./documentDiscovery";
import { documentPointer } from "../utils/documentLink";
import type { IDocumentAttachment } from "../utils/types";

async function reader(relays: string[]): Promise<DocumentReader> {
  const signer = await signerManager.getSigner();
  const pubkey = await signer.getPublicKey();
  if (!signer.nip44Decrypt) throw new Error("DOCUMENT_DECRYPT_UNAVAILABLE");
  const snapshots = new Map<string, Promise<Event[]>>();
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
    decryptOwn: (content) => signer.nip44Decrypt!(pubkey, content),
  };
}
export async function fetchMyDocuments(relays: string[]) {
  return discoverDocuments(await reader(relays));
}
export async function checkDocument(
  doc: IDocumentAttachment,
  relays: string[],
) {
  return resolveDocument(
    doc,
    await reader([...relays, ...(documentPointer(doc.naddr).relays ?? [])]),
  );
}
