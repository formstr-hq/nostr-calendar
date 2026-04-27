# Appointment Scheduling Protocol

This document defines the appointment scheduling protocol implemented in this repository. It covers scheduling pages (kind `31927`), booking requests/responses over NIP-59 gift wraps, and the approval handoff into the existing private calendar-event flow.

## Event Kinds

| Kind | Name | Type | Description |
|---|---|---|---|
| 31927 | Scheduling Page | Parameterized replaceable | Scheduling page definition and availability settings. Always private in this client. |
| 31926 | Public Busy List | Parameterized replaceable | Per-month list of opaque busy ranges published by a user. |
| 32680 | Creator Self-Key Index | Parameterized replaceable | Self-encrypted backup of view keys for the author's private events. |
| 1057 | Booking Request Gift Wrap | Regular | NIP-59 gift wrap addressed to scheduling-page owner. |
| 57 | Booking Request Rumor | Unsigned rumor | Inner request payload (inside kind `1057`). |
| 1058 | Booking Response Gift Wrap | Regular | NIP-59 gift wrap addressed to booker. |
| 58 | Booking Response Rumor | Unsigned rumor | Inner response payload (inside kind `1058`). |

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

## Creator Self-Key Index (Kind 32680)

A self-encrypted backup record that lets the author of a private calendar event recover its `viewKey` independently of the calendar list (kind `32123`). This makes the private-event flow robust to fresh devices, calendar-list desync, and removed calendar-list entries.

### Encoding

- Event kind: `32680`
- Author: the same pubkey that authored the underlying private calendar event.
- Tags: `[["d", "<eventDTag>"]]` — the d-tag matches the d-tag of the private calendar event being indexed.
- Content: NIP-44 ciphertext produced as a self-conversation under the author's own pubkey. Plaintext is JSON:

```json
{
  "v": 1,
  "viewKey": "<nsec1...>",
  "eventKind": 32678,
  "dTag": "<eventDTag>",
  "createdAt": <unixSeconds>
}
```

- The inner `dTag` MUST equal the outer `d` tag value; readers reject mismatches.
- A tombstone is encoded as the same outer event with empty content (no decryptable payload).

### Lifecycle

| Action | Effect |
|---|---|
| Author publishes a private calendar event | Publish a kind-32680 record alongside the event (best-effort, non-fatal on failure). |
| Author deletes the private event for everyone | Publish an empty-content kind-32680 record as a tombstone. |

### Consumption

At login the client calls `fetchOwnPrivateEventKeys()` (filter `{kinds:[32680], authors:[self]}`), self-decrypts each record, and caches a `Map<dTag, {viewKey, eventKind}>` in the events store. When `fetchPrivateEvents` walks calendar-list refs and finds an entry whose `viewKey` field is empty, it falls back to this map. If neither source provides a key, the event is skipped.

## Booking Request Flow (Booker -> Creator)

1. Booker opens a scheduling page and selects slot/title/note.
2. Booker derives a booking d-tag:
   - `sha256("booking-{schedulingPageRef}-{slotStartMs}-{Date.now()}").hex.slice(0, 30)`
3. Booker creates rumor kind `57` with tags:
   - `["a", "31927:<creatorPubkey>:<pageDTag>"]`
   - `["start", "<unixSeconds>"]`
   - `["end", "<unixSeconds>"]`
   - `["title", "<text>"]`
   - `["note", "<text>"]`
   - `["d", "<bookingDTag>"]`
4. Rumor is NIP-59 wrapped and published as gift wrap kind `1057` to the creator with `useRealTimestamp=true`.
5. Publish target relays are merged as:
   - `unique([...page.relayHints, ...getRelays()])` when relay hints exist
   - otherwise normal publish defaults are used
6. Booker immediately:
   - writes a placeholder private-event ref into first local calendar:
     - `["32678:<creatorPubkey>:<bookingDTag>", "", ""]`
   - persists outgoing booking record under `cal:booking_requests_outgoing` with status `pending`

## Booking Response Flow (Creator -> Booker)

### Incoming request subscription and decode

- Creator subscribes with:
  - `kinds: [1057]`
  - `#p: [creatorPubkey]`
  - `limit: 50`
- Each gift wrap is unwrapped via NIP-59; decoded request fields are taken from rumor tags:
  - `a`, `start`, `end`, `title`, `note`, `d`
- Requests are stored in `cal:booking_requests_incoming`.

### Approve path

1. Creator approves a pending request.
2. Creator publishes a private calendar event (existing private-event flow) using the request's `dTag` so coordinate matches the booker's placeholder reference.
3. Existing private-event publish path sends invitation gift wrap kind `1052` with a `viewKey`, allowing booker to resolve/decrypt the event.
4. Creator sends response rumor kind `58` wrapped as gift wrap kind `1058` to booker with tags:
   - `["a", "<schedulingPageRef>"]`
   - `["start", "<unixSeconds>"]`
   - `["end", "<unixSeconds>"]`
   - `["status", "approved"]`
   - `["event_ref", "<kind>:<creatorPubkey>:<dTag>"]`
   - `["viewKey", "<nsec-encoded-viewKey>"]`
5. Response wrap uses `useRealTimestamp=true`.

### Decline path

- Creator sends response rumor kind `58` wrapped as kind `1058` with tags:
  - `["a", "<schedulingPageRef>"]`
  - `["start", "<unixSeconds>"]`
  - `["end", "<unixSeconds>"]`
  - `["status", "declined"]`
  - optional `["reason", "<text>"]`

### Booker response subscription and matching

- Booker subscribes with:
  - `kinds: [1058]`
  - `#p: [bookerPubkey]`
  - `limit: 50`
- Unwrapped responses update outgoing bookings by matching:
  - `schedulingPageRef`
  - `start`
  - `end`
  - current status is `pending`

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
  - if unset, default `172800` seconds (48h)
  - if `expiry > 0` and `nowMs - receivedAtMs > expiry * 1000`, mark as `expired`

## Persisted Keys

- `cal:scheduling_pages` (secure storage path; native only)
- `cal:booking_requests_incoming` (local storage)
- `cal:booking_requests_outgoing` (local storage)

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
| `viewKey` | optional approved event view key |

## Migration Notes

- **Public scheduling pages (legacy):** Earlier versions of this client published `31927` events with plaintext tags. Such events remain parseable on the wire by other clients but are no longer rendered by this client; opening one without a `viewKey` shows an unsupported notice. New pages published by this client are always private.
- **Private events without a 32680 record (legacy):** Private calendar events authored before kind `32680` was introduced will not have a self-key index record. They continue to work via the `viewKey` carried in the author's calendar list (kind `32123`) ref. Re-publishing the event from this client will emit the missing 32680 record going forward.
- **Public busy list opt-in:** The toggle is shown on event creation and invitation accept; the user's choice is persisted locally under `cal:busy_list_default_optout` and applied to subsequent flows. Booking approvals always emit a busy entry regardless of the toggle.

## Implementation References

- [src/common/EventConfigs.ts](src/common/EventConfigs.ts)
- [src/utils/parser.ts](src/utils/parser.ts)
- [src/utils/types.ts](src/utils/types.ts)
- [src/utils/dateHelper.ts](src/utils/dateHelper.ts)
- [src/utils/availabilityHelper.ts](src/utils/availabilityHelper.ts)
- [src/stores/schedulingPages.ts](src/stores/schedulingPages.ts)
- [src/stores/busyList.ts](src/stores/busyList.ts)
- [src/stores/events.ts](src/stores/events.ts)
- [src/components/SchedulingPagePublic.tsx](src/components/SchedulingPagePublic.tsx)
- [src/stores/bookingRequests.ts](src/stores/bookingRequests.ts)
- [src/common/nip59.ts](src/common/nip59.ts)
- [src/common/nostr.ts](src/common/nostr.ts)
