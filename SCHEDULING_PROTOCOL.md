# Appointment Scheduling Protocol

This document defines the appointment scheduling protocol implemented in this repository. It covers scheduling pages (kind `31927`), booking requests/responses over NIP-59 gift wraps, and the approval handoff into the existing private calendar-event flow.

> **Protocol proposal:** This protocol is formalized in [NIP-Appointment-Scheduling](nips/NIP-Appointment-Scheduling.md). The private calendar event kinds used for confirmed appointments (`32678`, `1059`/legacy `1052`) are defined in [NIP-52E](nips/NIP-52E.md).

## Event Kinds

| Kind | Name | Type | Description |
|---|---|---|---|
| 31927 | Scheduling Page | Parameterized replaceable | Scheduling page definition and availability settings. Always private in this client. |
| 31926 | Public Busy List | Parameterized replaceable | Per-month list of opaque busy ranges published by a user. |
| 32680 | Scheduling Pages List | Parameterized replaceable | Self-encrypted backup of viewKeys for the author's scheduling pages. |
| 1059 | Booking Request Gift Wrap | Regular (NIP-59/NIP-17) | Gift wrap addressed to scheduling-page owner, tagged `["k", "1057"]`. Legacy kind `1057` is dual-read. |
| 57 | Booking Request Rumor | Unsigned rumor | Inner request payload. |
| 1059 | Booking Response Gift Wrap | Regular (NIP-59/NIP-17) | Gift wrap addressed to booker, tagged `["k", "1058"]`. Legacy kind `1058` is dual-read. |
| 58 | Booking Response Rumor | Unsigned rumor | Inner response payload. |

New wraps share outer kind `1059` with NIP-52E's calendar-invitation gift wrap; the public `k` tag is what a reader uses to pick out booking wraps from other NIP-59 traffic without decrypting first. Legacy kinds `1057`/`1058` are read-only migration support — this client never publishes them anymore.

## Scheduling Page (Kind 31927)

All scheduling pages are published privately in this client. There is no plaintext encoding on the wire — only the outer `d` tag is visible.

### Encoding

- Outer event kind: `31927`
- Outer tags: `[["d", "<pageId>"]]` only.
- Outer content: NIP-44 ciphertext produced as a self-conversation between an ephemeral view keypair and itself; the plaintext is the JSON-serialized full tag list (title, duration mode, availability windows, etc.) emitted by `schedulingPageToTags()`.
- Share URL appends the raw hex view secret key as a query param:
  - `/schedule/<naddr>?viewKey=<hex>`
- Without `viewKey`, the public viewer cannot decrypt the page and renders an unsupported notice.

### Plaintext payload tag reference

The NIP-44 plaintext is a JSON array of tags with the following shape:

| Tag | Shape | Meaning |
|---|---|---|
| `title` | `["title", "<text>"]` | Page title. |
| `duration_mode` | `["duration_mode", "fixed" \| "free"]` | Duration selection mode. |
| `slot_duration` | `["slot_duration", "<minutes>"]` (repeatable) | Allowed slot durations for fixed mode. |
| `avail` recurring | `["avail", "recurring", "<0-6>", "<HH:MM>", "<HH:MM>"]` | Weekly recurring window. |
| `avail` date | `["avail", "date", "<YYYY-MM-DD>", "<HH:MM>", "<HH:MM>"]` | One-off date window. |
| `blocked` | `["blocked", "<YYYY-MM-DD>"]` (repeatable) | Blocked dates. |
| `timezone` | `["timezone", "<IANA tz>"]` | Timezone (for slot expansion/display). |
| `min_notice` | `["min_notice", "<seconds>"]` | Minimum lead time before booking. |
| `max_advance` | `["max_advance", "<seconds>"]` | Maximum booking horizon. |
| `buffer` | `["buffer", "<seconds>"]` | Buffer between appointments. |
| `expiry` | `["expiry", "<seconds>"]` | Booking request expiry (`0` means never). |
| `location` | `["location", "<text>"]` | Optional meeting location. |
| `image` | `["image", "<url>"]` | Optional image URL. |
| `event_title` | `["event_title", "<text>"]` | Optional default title for resulting appointments. |
| `relay` | `["relay", "<relayUrl>"]` (repeatable) | Relay hints attached at publish time. |
| `form` | `["form", "<naddr>", "<viewKey>"?]` (repeatable) | Formstr form attachment bookers are expected to fill; same shape/semantics as `ICalendarEvent.forms`' `form` tag. |

## Discovery and Sharing

- NAddr for a scheduling page is encoded with:
  - `kind = 31927`
  - `pubkey = page.user`
  - `identifier = page.id` (d-tag)
  - `relays = getRelays()`
- Page route (always requires viewKey):
  - `/schedule/<naddr>?viewKey=<hex>`

## Public Busy List (Kind 31926)

A parameterized-replaceable record that exposes a user's already-committed time ranges within a single calendar month, without revealing event titles, participants, or any other detail. Used by scheduling-page viewers to filter slots that the host already has commitments for.

### Encoding

- Event kind: `31926`
- One event per (user, month). The month bucket is `YYYY-MM` in UTC.
- Tags:

| Tag | Shape | Meaning |
|---|---|---|
| `d` | `["d", "YYYY-MM"]` | Identifier — UTC month bucket. |
| `t` | `["t", "YYYY-MM"]`, `["t", "busy"]` | Hashtags for relay indexing/discovery. |
| `block` | `["block", "<startSec>", "<endSec>"]` (repeatable) | Opaque busy range in unix seconds. |

- Content is empty.
- Ranges crossing month boundaries are emitted into every month they overlap.

### Lifecycle triggers (this client)

The client offers an opt-out checkbox on event creation and on invitation accept; the default is persisted under `cal:busy_list_default_optout`. Booking approvals always emit a busy entry.

| Action | Effect |
|---|---|
| Author creates a new event with toggle on | `addBusyRange({start,end})` |
| Author accepts an invitation with toggle on | `addBusyRange({start,end})` |
| Host approves a booking request | `addBusyRange({start,end})` (always) |
| Author deletes the event for everyone | `removeBusyRange({start,end})` |
| Author removes the event from their calendar | `removeBusyRange({start,end})` |

`addBusyRange` and `removeBusyRange` always re-fetch the current month's record from relays before re-publishing to avoid clobbering ranges from other devices.

### Consumption

When rendering a scheduling page (`SchedulingPagePublic`), the client fetches the host's 31926 records covering the visible week's months and passes the union of `block` ranges to `getBookableSlots`, which discards any candidate slot whose `[start,end]` overlaps a busy range.

## Scheduling Pages List (Kind 32680)

A self-encrypted backup record that lets the author of a scheduling page recover its `viewKey` independently of any other state. This makes private scheduling pages robust to fresh devices and to web refreshes (where secure storage is a no-op).

### Encoding

- Event kind: `32680`
- Author: the same pubkey that authored the underlying scheduling page.
- Tags: `[["d", "<pageDTag>"]]` — the d-tag matches the d-tag of the scheduling page being indexed.
- Content: NIP-44 ciphertext produced as a self-conversation under the author's own pubkey. Plaintext is JSON:

```json
{
  "v": 1,
  "viewKey": "<nsec1...>",
  "dTag": "<pageDTag>",
  "createdAt": <unixSeconds>
}
```

- The inner `dTag` MUST equal the outer `d` tag value; readers reject mismatches.
- A tombstone is encoded as the same outer event with empty content (no decryptable payload).

### Lifecycle

| Action | Effect |
|---|---|
| Author publishes a scheduling page | Publish a kind-32680 record alongside the page (best-effort, non-fatal on failure). |
| Author deletes a scheduling page | Publish an empty-content kind-32680 record as a tombstone. |

### Consumption

When the scheduling-pages store fetches the user's pages it calls `fetchOwnSchedulingPageKeys()` (filter `{kinds:[32680], authors:[self]}`), self-decrypts each record, and caches a `Map<dTag, viewKeyNsec>`. Each fetched page's outer ciphertext is then decrypted with the matching `viewKey`. Pages without a matching key (e.g. tombstoned, or authored by another user) are skipped silently.

## Booking Request Flow (Booker -> Creator)

1. Booker opens a scheduling page and selects slot/title/note, and an identity mode: **self** (their logged-in identity — the only option previously available) or **anonymous** (a fresh one-time keypair via `createAnonymousBookerIdentity()`, never derived from the real identity; the only option offered when not logged in).
2. Booker derives a booking d-tag:
   - `sha256("booking-{schedulingPageRef}-{slotStartMs}-{Date.now()}").hex.slice(0, 30)`
3. Booker creates rumor kind `57` with tags:
   - `["a", "31927:<creatorPubkey>:<pageDTag>"]`
   - `["start", "<unixSeconds>"]`
   - `["end", "<unixSeconds>"]`
   - `["title", "<text>"]`
   - `["note", "<text>"]`
   - `["d", "<bookingDTag>"]`
   - `["viewKey", "<nsec-encoded-viewKey>"]`
   - `["signing_nsec", "<nsec-encoded ephemeral wrap-signing key>"]`
4. Rumor is NIP-59 wrapped and published as gift wrap kind `1059` (tagged `["k", "1057"]`) to the creator. In **self** mode the seal and wrap are signed by the booker's own signer, as before. In **anonymous** mode both the seal and wrap are signed by the one-time identity from step 1 — `wrapEventAs(..., signer)` takes an explicit `ActiveSigner` (a `LocalSigner` built from the fresh secret key) instead of the default logged-in signer, which is what makes the request unlinkable to the real identity.
5. Publish target relays are merged as:
   - `unique([...page.relayHints, ...getRelays()])` when relay hints exist
   - otherwise normal publish defaults are used
6. Booker immediately:
   - writes a placeholder private-event ref into first local calendar (skipped if not logged in — no calendar exists to add to):
     - `["32678:<creatorPubkey>:<bookingDTag>", "", ""]`
   - persists outgoing booking record under `cal:booking_requests_outgoing` with status `pending` and `bookerMode` set to `"self"` or `"anonymous"`
   - in anonymous mode, also persists the one-time `{pubkey, secretKeyNsec}` under `cal:anon_booking_keys`, keyed by the booking d-tag (`saveAnonBookingKey`) — this is the only new local state the anonymous path needs, since the outgoing-booking bucket above already survives a logged-out session via plain `localStorage`

## Booking Response Flow (Creator -> Booker)

### Incoming request subscription and decode

- Creator subscribes with a dual-read (new + legacy) filter pair:
  - `{ kinds: [1059], "#p": [creatorPubkey], "#k": ["1057"], limit: 50 }`
  - `{ kinds: [1057], "#p": [creatorPubkey], limit: 50 }` (legacy)
- Each gift wrap is unwrapped via NIP-59 (always with the creator's own signer — hosts are always authenticated); decoded request fields are taken from rumor tags:
  - `a`, `start`, `end`, `title`, `note`, `d`, `signing_nsec` (optional, absent on legacy wraps)
- Requests are stored in `cal:booking_requests_incoming`.

### Approve path

1. Creator approves a pending request.
2. Creator publishes a private calendar event (existing private-event flow) using the request's `dTag` so coordinate matches the booker's placeholder reference.
3. Existing private-event publish path sends invitation gift wrap kind `1059` (`["k", "1052"]`; legacy `1052` dual-read) with a `viewKey`, allowing booker to resolve/decrypt the event.
4. Creator sends response rumor kind `58` wrapped as gift wrap kind `1059` (tagged `["status", "approved"]` and `["k", "1058"]` on the outer event) to booker with rumor tags:
   - `["a", "<schedulingPageRef>"]`
   - `["start", "<unixSeconds>"]`
   - `["end", "<unixSeconds>"]`
   - `["status", "approved"]`
   - `["event_ref", "<kind>:<creatorPubkey>:<dTag>"]`
   - `["viewKey", "<nsec-encoded-viewKey>"]`
   - `["signing_nsec", "<nsec-encoded ephemeral wrap-signing key>"]`

### Decline path

- Creator sends response rumor kind `58` wrapped as kind `1059` (`["status", "declined"]`, `["k", "1058"]`) with rumor tags:
  - `["a", "<schedulingPageRef>"]`
  - `["start", "<unixSeconds>"]`
  - `["end", "<unixSeconds>"]`
  - `["status", "declined"]`
  - optional `["reason", "<text>"]`
  - `["signing_nsec", "<nsec-encoded ephemeral wrap-signing key>"]`

### Booker response subscription and matching

- Booker subscribes with a dual-read filter pair, `#p` set to the union of the logged-in pubkey (if any) and every locally-stored anonymous booking pubkey (`getAllAnonBookingPubkeys()`):
  - `{ kinds: [1059], "#p": pubkeys, "#k": ["1058"], limit: 50 }`
  - `{ kinds: [1058], "#p": pubkeys, limit: 50 }` (legacy)
- Before unwrapping, the outer `p` tag (plaintext) is read to decide which identity's signer can open the wrap: if it matches the logged-in pubkey, the default signer is used; otherwise the matching anonymous key is looked up by scanning pending outgoing bookings' stored `dTag`s via `getAnonBookingKey`, and a `LocalSigner` built from its secret key is passed to `unwrapBookingResponse` explicitly.
- Unwrapped responses update outgoing bookings by matching:
  - `schedulingPageRef`
  - `start`
  - `end`
  - current status is `pending`
- On match, the response's own gift-wrap id and `signing_nsec` are recorded on the booking (`responseGiftWrapId`, `signingNsec`) for later dismiss.
- This subscription runs independent of login state — an anonymous booker who never logs in still needs to receive the host's response.

## Dismiss (NIP-09)

Mirrors the invitations store's dismiss pattern (see NIP-52E §3 "Recipient Deletion"): exactly one NIP-09 deletion is published, using the wrap's own `signing_nsec` key when available (`deleteGiftWrapAsRecipient`) or a signer-authored deletion request otherwise (`publishDeletionEvent`).

- `dismissIncomingRequest(requestId)` deletes the incoming request's own gift wrap (`request.giftWrapId` / `request.signingNsec`).
- `dismissOutgoingBooking(bookingId)` deletes the booking's **response** gift wrap (`booking.responseGiftWrapId` / `booking.signingNsec`) — the wrap this client actually received. Bookings that expired without ever getting a response have no `responseGiftWrapId`; dismissing them is local-only.

## Status and Expiry

`BookingRequestStatus` values:

- `pending`
- `approved`
- `declined`
- `expired`
- `cancelled`

Expiry behavior:

- Incoming pending requests are periodically checked every 5 minutes.
- Expiry decision:
  - find page `expiry` by request `a`-tag page d-tag
  - `expiry === 0` or unset means **never expire** (not a 48h fallback — an earlier version of this doc described a default `172800`-second fallback that the code has never actually implemented; `bookingRequests.ts`'s `checkExpiry` only ever marks a request expired when the page's own `expiry` is a positive value)
  - if `expiry > 0` and `nowMs - receivedAtMs > expiry * 1000`, mark as `expired`

## Persisted Keys

- `cal:scheduling_pages` (secure storage path; native only)
- `cal:booking_requests_incoming` (local storage)
- `cal:booking_requests_outgoing` (local storage; already survives a logged-out session, since it's plain `localStorage` rather than the native-only secure storage)
- `cal:anon_booking_keys` (local storage; `Record<dTag, {pubkey, secretKeyNsec}>` for anonymous booking identities — see `src/utils/anonBookingIdentity.ts`)

## Field Reference

### ISchedulingPage

| Field | Description |
|---|---|
| `id` | d-tag identifier |
| `eventId` | Nostr event id |
| `user` | creator pubkey |
| `title` | page title |
| `description` | booking description/instructions |
| `slotDurations` | fixed durations (minutes) |
| `durationMode` | `fixed` or `free` |
| `availabilityWindows` | recurring/date windows |
| `blockedDates` | blocked `YYYY-MM-DD` dates |
| `timezone` | IANA timezone |
| `minNotice` | seconds |
| `maxAdvance` | seconds |
| `buffer` | seconds |
| `expiry` | seconds |
| `location` | optional location |
| `image` | optional image URL |
| `eventTitle` | optional default appointment title |
| `relayHints` | relay tag hints from page event |
| `isPrivate` | private page flag |
| `viewKey` | private-page view key (hex, URL query) |
| `createdAt` | Nostr `created_at` |
| `formAttachments` | optional forms bookers are expected to fill (Formstr-form-attach, same shape as `ICalendarEvent.forms`) |

### IBookingRequest

| Field | Description |
|---|---|
| `id` | local request id (gift wrap id) |
| `giftWrapId` | booking request wrap event id |
| `schedulingPageRef` | scheduling page `a` coordinate |
| `bookerPubkey` | requester pubkey |
| `start` | requested start (ms) |
| `end` | requested end (ms) |
| `title` | requested title |
| `note` | optional note |
| `dTag` | booker-generated event d-tag |
| `receivedAt` | received timestamp (ms) |
| `status` | booking request status |
| `respondedAt` | optional response timestamp (ms) |
| `declineReason` | optional decline reason |
| `signingNsec` | optional ephemeral wrap-signing key, for dismiss (absent on legacy wraps) |

### IOutgoingBooking

| Field | Description |
|---|---|
| `id` | local outgoing id |
| `giftWrapId` | original request gift wrap id |
| `schedulingPageRef` | scheduling page `a` coordinate |
| `creatorPubkey` | scheduling page owner pubkey |
| `start` | requested start (ms) |
| `end` | requested end (ms) |
| `title` | request title |
| `note` | optional note |
| `sentAt` | sent timestamp (ms) |
| `status` | booking request status |
| `respondedAt` | optional response timestamp (ms) |
| `declineReason` | optional decline reason |
| `eventRef` | optional approved event reference coordinate |
| `dTag` | booker-generated event d-tag (also the key into `cal:anon_booking_keys` for anonymous bookings) |
| `viewKey` | optional approved event view key |
| `responseGiftWrapId` | gift wrap id of the host's response, once one arrives; dismiss target |
| `signingNsec` | optional ephemeral wrap-signing key of the response wrap, for dismiss |
| `bookerMode` | `"self"` or `"anonymous"`; absent (treated as `"self"`) on bookings sent before this field existed |

## Migration Notes

- **Public scheduling pages (legacy):** Earlier versions of this client published `31927` events with plaintext tags. Such events remain parseable on the wire by other clients but are no longer rendered by this client; opening one without a `viewKey` shows an unsupported notice. New pages published by this client are always private.
- **Public busy list opt-in:** The toggle is shown on event creation and invitation accept; the user's choice is persisted locally under `cal:busy_list_default_optout` and applied to subsequent flows. Booking approvals always emit a busy entry regardless of the toggle.

## Implementation References

### NIP Proposals

- [NIP-Appointment-Scheduling](nips/NIP-Appointment-Scheduling.md) — Full protocol specification for scheduling pages, booking requests, and booking responses
- [NIP-52E](nips/NIP-52E.md) — Private calendar event kinds (`32678`, `1059`/legacy `1052`, `32123`, `31926`) used for confirmed appointments

### Source Files

- [src/nostr/booking.ts](src/nostr/booking.ts)
- [src/nostr/crypto.ts](src/nostr/crypto.ts)
- [src/nostr/kinds.ts](src/nostr/kinds.ts)
- [src/utils/parser.ts](src/utils/parser.ts)
- [src/utils/types.ts](src/utils/types.ts)
- [src/utils/anonBookingIdentity.ts](src/utils/anonBookingIdentity.ts)
- [src/utils/dateHelper.ts](src/utils/dateHelper.ts)
- [src/utils/availabilityHelper.ts](src/utils/availabilityHelper.ts)
- [src/stores/schedulingPages.ts](src/stores/schedulingPages.ts)
- [src/stores/busyList.ts](src/stores/busyList.ts)
- [src/stores/bookingRequests.ts](src/stores/bookingRequests.ts)
- [src/components/BookingPage.tsx](src/components/BookingPage.tsx)
- [android/app/src/main/java/app/formstr/calendar/BookingWorker.java](android/app/src/main/java/app/formstr/calendar/BookingWorker.java)
