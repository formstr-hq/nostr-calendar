# Appointment Scheduling Protocol

This document defines the appointment scheduling protocol implemented in this repository. It covers scheduling pages (kind `31927`), booking requests/responses over NIP-59 gift wraps, and the approval handoff into the existing private calendar-event flow.

## Event Kinds

| Kind | Name | Type | Description |
|---|---|---|---|
| 31927 | Scheduling Page | Parameterized replaceable | Scheduling page definition and availability settings. |
| 1057 | Booking Request Gift Wrap | Regular | NIP-59 gift wrap addressed to scheduling-page owner. |
| 57 | Booking Request Rumor | Unsigned rumor | Inner request payload (inside kind `1057`). |
| 1058 | Booking Response Gift Wrap | Regular | NIP-59 gift wrap addressed to booker. |
| 58 | Booking Response Rumor | Unsigned rumor | Inner response payload (inside kind `1058`). |

## Scheduling Page (Kind 31927)

### Public scheduling page encoding

- Event kind: `31927`
- Event content: page description string
- Tags are produced from `schedulingPageToTags()` and parsed by `nostrEventToSchedulingPage()`

| Tag | Shape | Meaning |
|---|---|---|
| `d` | `["d", "<pageId>"]` | Page identifier (d-tag). |
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

### Private scheduling page encoding

When `isPrivate` is enabled:

- Outer event kind is still `31927`.
- Outer tags are only: `["d", "<pageId>"]`.
- Full scheduling tags are JSON-serialized and NIP-44 encrypted into `content` using a generated view keypair in a self-conversation pattern.
- Share URL format appends the raw hex view key as query param:
  - `/schedule/<naddr>?viewKey=<hex>`

## Discovery and Sharing

- NAddr for a scheduling page is encoded with:
  - `kind = 31927`
  - `pubkey = page.user`
  - `identifier = page.id` (d-tag)
  - `relays = getRelays()`
- Public page route:
  - `/schedule/<naddr>`
- Private page route:
  - `/schedule/<naddr>?viewKey=<hex>`

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

## Implementation References

- [src/common/EventConfigs.ts](src/common/EventConfigs.ts)
- [src/utils/parser.ts](src/utils/parser.ts)
- [src/utils/types.ts](src/utils/types.ts)
- [src/stores/schedulingPages.ts](src/stores/schedulingPages.ts)
- [src/components/SchedulingPagePublic.tsx](src/components/SchedulingPagePublic.tsx)
- [src/stores/bookingRequests.ts](src/stores/bookingRequests.ts)
- [src/common/nip59.ts](src/common/nip59.ts)
- [src/common/nostr.ts](src/common/nostr.ts)
