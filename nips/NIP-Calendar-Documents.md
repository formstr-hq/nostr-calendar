# Calendar document attachments

## Nostr layer inputs — Pages attachments (2026-11-24)

Scope authorized by the Pages integration feature request: read-only discovery,
manual existing share links, event create/edit/detail UI, public/private/recurring
attachment persistence. No Pages writes, key rotation, new sharing, or new kinds.
Interop target: Calendar clients; other NIP-52 clients ignore the additive tag.

A repeatable `document` tag points to the Pages root NIP-19 `naddr` (kind 33457),
not an individual version or editor slot:

- Public events: `["document", "<naddr>"]` only. Neither titles nor credentials
  are published, even if supplied on the in-memory attachment object.
- Private events: `["document", "<naddr>", "<viewKey or empty>", "<title or empty>"]`
  inside the existing NIP-44 encrypted content tag array. No document information
  is added to outer tags or invitation envelopes. Recurring events use the same
  payload and retain attachments when occurrences are edited.

`viewKey` is Pages' 32-byte hex capability. It is NOT necessarily read-only:
open-mode Pages documents permit writes by capability holders. Calendar only
includes it after the user pastes an existing link into a private event and
explicitly authorizes sharing with all recipients. Legacy edit keys, signing
secrets, arbitrary URL parameters, and unknown metadata are never persisted.
Picker selections are references without credentials. Attaching does not grant
access or mutate any Pages event, roster, key, or permission.

Readers validate document kind and URL shape, deduplicate by root coordinate,
and ignore secret/title fields on public events. URLs use
`https://pages.formstr.app/doc/<naddr>#<nkeys>` with the existing Pages/Formstr
bech32 TLV codec; only an authorized private capability produces a fragment.

## Discovery

Use the current Calendar signer and local-relay transport. Fetch authored 33457
content and 34579 metadata; resolve newest replaceable slots (ascending event-id
on equal timestamps). Self-decrypt per-user metadata; its address-indexed viewKey
entries identify received shares. Personal content self-decrypts with the signer.
Shared content and owner rosters decrypt using Pages' NIP-44 self-conversation
with the hex viewKey. Restricted groups query owner plus roster editors; open
groups query the capability-derived room (`getPublicKey(viewKey)`) in `a` tags.
Only decryptable authorized content contributes titles, with metadata/roster
renames preferred over the first nonempty Markdown line. Group tips follow
Pages' five-minute future timestamp clamp and ascending-id tie break.

Honor author-matched kind-5 event deletions and owner root tombstones. Shared
editor deletions cannot delete another author's document. Discovery is a bounded
relay snapshot, not a guarantee of availability or access at the time of opening.

## Migration

Additive read/write support starts with this change. No dual-write, backfill,
or cutoff is required. Old Calendar clients ignore `document` tags; old events
without them remain unchanged. Old clients may drop attachments when re-saving
an event, since they do not preserve unknown tags. Forms tags are unchanged.

## Reference audit and limitations

Reviewed nostr-docs commit `ad81b239bf3769582fd9ae0f0f325002af644c9f`:
ARCHITECTURE.md, NIP-multi-writer-documents.md, DocumentContext, SharedDocsContext,
fetchFile, fetchDelete, shareV2, sharedDoc, docMetadata, DocPage, encryption, nkeys.
The actual application uses bech32 nkeys (not the architecture document's older
base64 example) and room tags (not plaintext root tags for open discovery).
The protocol draft's author-key/epoch extension is not implemented by that app's
sharedDoc resolver; Calendar follows the actual implementation.

Reviewed common-packages commit `418ba2f65e6a4f90607f9303eaf089ecf57cff99`.
Its agent Pages service binds to `@formstr/core` signer/relay/runtime singletons
and `querySync`, incompatible with Calendar's existing observer-owned transport.
Calendar adapts its needed read-only resolution and reuses the identical nkeys
codec already shipped by installed `@formstr/sdk`. No dependency upgrade or
reference-repository modification is needed. Follow-up: extract a transport- and
signer-injected Pages reader into a small shared package.

Device-only documents and capabilities stored only in Pages' separate-origin
IndexedDB cannot be discovered. In particular an owner roster may replace their
self-encrypted metadata; without a synced viewKey the owner must paste an existing
share link. Unknown/revoked keys, signer refusal, and missing relay data can leave
partial results. References without credentials require existing access in Pages;
Calendar never promises participant access. Details retain saved private titles
and defer live availability checks to Pages, with an explicit notice.
