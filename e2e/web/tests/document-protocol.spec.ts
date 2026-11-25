import { test, expect } from "@playwright/test";
import {
  finalizeEvent,
  getPublicKey,
  nip19,
  nip44,
  matchFilters,
  type Event,
} from "nostr-tools";
import {
  documentTags,
  documentsFromTags,
  parseDocumentInput,
  buildDocumentUrl,
} from "../../../src/utils/documentLink";
import { encodeNKeys } from "../../../src/utils/documentKeys";
import {
  discoverDocuments,
  resolveDocument,
  type DocumentReader,
} from "../../../src/nostr/documentDiscovery";

const sk = new Uint8Array(32).fill(1),
  other = new Uint8Array(32).fill(2),
  vk = new Uint8Array(32).fill(3);
const owner = getPublicKey(sk),
  editor = getPublicKey(other);
const hex = Buffer.from(vk).toString("hex");
const encrypt = (s: string, key = sk) =>
  nip44.encrypt(s, nip44.getConversationKey(key, getPublicKey(key)));
const naddr = (d = "doc", pubkey = owner, relays: string[] = []) =>
  nip19.naddrEncode({ kind: 33457, pubkey, identifier: d, relays });
const event = (
  kind: number,
  d: string,
  content: string,
  key = sk,
  created_at = 100,
  extra: string[][] = [],
) =>
  finalizeEvent({ kind, tags: [["d", d], ...extra], content, created_at }, key);
const reader = (events: Event[]): DocumentReader => ({
  pubkey: owner,
  fetch: async (filters) => events.filter((e) => matchFilters(filters, e)),
  decryptOwn: async (content) =>
    nip44.decrypt(content, nip44.getConversationKey(sk, owner)),
});

test("Pages URLs validate addresses, reuse nkeys and discard edit secrets", () => {
  const doc = parseDocumentInput(
    `https://pages.formstr.app/doc/${naddr()}#${encodeNKeys({ viewKey: hex, editKey: "private-edit-secret" })}`,
  )!;
  expect(doc).toEqual({ naddr: naddr(), viewKey: hex });
  expect(buildDocumentUrl(doc, true)).toBe(
    `https://pages.formstr.app/doc/${naddr()}#${encodeNKeys({ viewKey: hex })}`,
  );
  for (const input of [
    "javascript:alert(1)",
    `https://evil.test/doc/${naddr()}`,
    `https://pages.formstr.app/device/${naddr()}`,
    `${naddr()}?viewKey=${hex}`,
    `${naddr()}#broken`,
    nip19.naddrEncode({ kind: 30168, pubkey: owner, identifier: "form" }),
    `${naddr()}#${encodeNKeys({ viewKey: "bad" })}`,
  ])
    expect(parseDocumentInput(input)).toBeNull();
});

test("public serialization and parsing cannot leak private titles or capabilities; private tags round-trip", () => {
  const docs = [
    { naddr: naddr(), title: "Secret title", viewKey: hex },
    { naddr: naddr("doc", owner, ["wss://relay.example"]), title: "Duplicate" },
  ];
  expect(documentTags(docs, false)).toEqual([["document", naddr()]]);
  expect(documentsFromTags(documentTags(docs, true), false)).toEqual([
    { naddr: naddr() },
  ]);
  expect(documentsFromTags(documentTags(docs, true), true)).toEqual([docs[0]]);
  expect(buildDocumentUrl(docs[0], false)).not.toContain("#");
  const ciphertext = encrypt(JSON.stringify(documentTags(docs, true)), vk);
  expect(ciphertext).not.toContain("Secret title");
  expect(
    documentsFromTags(
      JSON.parse(
        nip44.decrypt(
          ciphertext,
          nip44.getConversationKey(vk, getPublicKey(vk)),
        ),
      ),
      true,
    ),
  ).toEqual([docs[0]]);
});

test("personal discovery decrypts metadata, resolves latest, deduplicates and filters authorized deletions", async () => {
  const latest = event(33457, "doc", encrypt("# New title"), sk, 102);
  const deleted = event(33457, "gone", encrypt("# Deleted"));
  const rows = [
    event(33457, "doc", encrypt("# Old")),
    latest,
    event(
      34579,
      `33457:${owner}:doc`,
      encrypt(JSON.stringify({ title: "Renamed", tags: [] })),
    ),
    deleted,
    event(5, "delete", "", sk, 103, [["a", `33457:${owner}:gone`]]),
    event(5, "forgery", "", other, 104, [["e", latest.id]]),
  ];
  const result = await discoverDocuments(reader(rows));
  expect(result.documents).toEqual([
    { naddr: naddr(), title: "Renamed", source: "personal" },
  ]);
});

test("shared discovery follows encrypted metadata and restricted roster without exposing stored keys", async () => {
  const root = `33457:${editor}:shared`;
  const rows = [
    event(
      34579,
      root,
      encrypt(JSON.stringify({ viewKey: hex, editKey: "never-return" })),
    ),
    event(
      34579,
      root,
      encrypt(
        JSON.stringify({
          mode: "restricted",
          title: "Shared title",
          members: [{ pubkey: owner, role: "editor" }],
        }),
        vk,
      ),
      other,
    ),
    event(33457, "shared", encrypt("# Owner version", vk), other),
    event(33457, "shared", encrypt("# Editor version", vk), sk, 101),
  ];
  const result = await discoverDocuments(reader(rows));
  expect(
    result.documents.find((d) => d.naddr === naddr("shared", editor)),
  ).toEqual({
    naddr: naddr("shared", editor),
    title: "Shared title",
    source: "shared",
  });
  expect(JSON.stringify(result.documents)).not.toContain(hex);
  rows.push(event(5, "deleted", "", other, 102, [["a", root]]));
  expect(
    await resolveDocument(
      { naddr: naddr("shared", editor), viewKey: hex },
      reader(rows),
    ),
  ).toBeNull();
});

test("open roster resolves capability room, skips undecryptable spam and event-id deletions", async () => {
  const rows = [
    event(
      34579,
      `33457:${owner}:open`,
      encrypt(JSON.stringify({ mode: "open" }), vk),
    ),
    event(33457, "open", encrypt("# Open editor", vk), other, 101, [
      ["a", getPublicKey(vk)],
    ]),
    event(33457, "spam", encrypt("# Spam"), sk, 105, [["a", getPublicKey(vk)]]),
  ];
  const doc = { naddr: naddr("open"), viewKey: hex };
  expect((await resolveDocument(doc, reader(rows)))?.title).toBe("Open editor");
  rows.push(event(5, "deleted", "", other, 106, [["e", rows[1].id]]));
  expect(await resolveDocument(doc, reader(rows))).toBeNull();
});
