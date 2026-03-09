# Nostr Calendar Protocol

This document describes the Nostr event kinds, encryption schemes, and data flows used by this calendar application for private events and calendars.

## Event Kinds

| Kind  | Name | Type | Description |
|-------|------|------|-------------|
| 31923 | Public Calendar Event | Parameterized replaceable | NIP-52 time-based calendar event. Content and tags are plaintext. |
| 32678 | Private Calendar Event | Parameterized replaceable | Single encrypted calendar event. Content is NIP-44 encrypted with a view key. |
| 32679 | Private Recurring Event | Parameterized replaceable | Encrypted recurring calendar event (has RRULE). Same encryption as 32678. |
| 32123 | Calendar List | Parameterized replaceable | Self-encrypted list of event references, organized into named colored collections. |
| 1052  | Calendar Event Gift Wrap | Regular | NIP-59 gift wrap containing a sealed rumor with a view key for a private event. Used for invitations. |
| 13    | Seal | Regular | NIP-59 seal. Intermediate layer: sender encrypts the rumor for the recipient, then signs it. |

### Rumor Kinds (unsigned, inside seals)

| Kind | Name | Description |
|------|------|-------------|
| 52   | Calendar Event Rumor | Unsigned event inside a gift wrap (kind 1052). Contains the event's `a`-tag reference and `viewKey`. |

---

## Private Event Encryption (kind 32678 / 32679)

Private events use **view-key encryption**: a randomly generated NIP-44 keypair that is independent of the author's Nostr identity.

### Creation

1. Generate a random secret key (`viewSecretKey`) using `generateSecretKey()`
2. Derive its public key (`viewPublicKey = getPublicKey(viewSecretKey)`)
3. Build the event data as a JSON array of tags:
   ```json
   [
     ["title", "Meeting"],
     ["description", "Weekly sync"],
     ["start", 1700000000],
     ["end", 1700003600],
     ["image", ""],
     ["d", "<uuid>"],
     ["location", "Office"],
     ["p", "<participant-hex-pubkey>"],
     ["L", "rrule"],
     ["l", "FREQ=WEEKLY;BYDAY=MO"]
   ]
   ```
4. Encrypt the JSON with NIP-44 using the view key's conversation key:
   ```
   conversationKey = nip44.getConversationKey(viewSecretKey, viewPublicKey)
   content = nip44.encrypt(JSON.stringify(eventData), conversationKey)
   ```
5. Publish as a signed Nostr event:
   ```
   kind: 32678 (or 32679 if recurring)
   tags: [["d", "<uuid>"]]
   content: <encrypted blob>
   ```

### Decryption

Anyone with the `viewKey` (nsec-encoded) can decrypt:

```
viewPrivateKey = nip19.decode(viewKey).data
conversationKey = nip44.getConversationKey(viewPrivateKey, getPublicKey(viewPrivateKey))
decryptedContent = nip44.decrypt(event.content, conversationKey)
tags = JSON.parse(decryptedContent)
```

The view key is never stored in the Nostr event itself — it is distributed via calendar lists (self-encrypted) and gift wraps (recipient-encrypted).

---

## Calendar List (kind 32123)

Calendar lists are **parameterized replaceable events** that organize a user's private events into named, colored collections (e.g., "Work", "Personal", "Travel").

### Structure

```
kind: 32123
tags: [["d", <uuid>]]
content: nip44_encrypt_to_self(JSON.stringify([
  ["title", "My Calendar"],
  ["content", "Optional description"],
  ["color", "#4285f4"],
  ["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"],
  ["a", ...],
  ...
]))
```

### Self-Encryption

The content is encrypted with the user's **own public key** using NIP-44 via the signer:

```
signer.nip44Encrypt(userPubkey, JSON.stringify(tags))
```

This ensures calendar lists remain private even on public relays — only the user's corresponding private key can decrypt them.

### Decryption

```
signer.nip44Decrypt(event.pubkey, event.content)
```

Since the event author is the user themselves, `event.pubkey` equals the user's pubkey, completing the self-encryption round-trip.

### Event Reference Format

Each `"a"` tag in the decrypted content follows a standard NIP `a`-tag coordinate with additional metadata:

```
["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"]
```

**First value** (standard `a`-tag coordinate):

| Field | Description |
|-------|-------------|
| `kind` | Nostr event kind (`32678` or `32679`) |
| `authorPubkey` | Hex public key of the event author |
| `eventDTag` | The event's unique `"d"` tag identifier |

**Second value** (optional relay URL):

| Field | Description |
|-------|-------------|
| `relayUrl` | Relay URL where the event can be found (empty string if not specified) |

**Third value** (colon-delimited metadata):

| Field | Description |
|-------|-------------|
| `viewKey` | nsec-encoded key for decrypting the event |
| `beginTimeSecs` | Event start time as unix timestamp (seconds) |
| *(empty)* | Reserved field (empty between the two `::`) |
| `endTimeSecs` | Event end time as unix timestamp (seconds) |
| `isRecurring` | `"true"` or `"false"` — recurring events bypass time-range filters |

### Visibility

Calendar visibility (show/hide toggle) is **client-side only** — it is not stored on relays. The app persists visibility state separately in local secure storage under the key `cal:calendar_visibility`.

---

## Gift Wrap Invitations (NIP-59)

When a user creates a private event with participants, the event's view key is sent to each participant via NIP-59 gift wrapping. Recipients receive these as **invitations** rather than events that auto-appear on their calendar.

### Gift Wrap Structure (kind 1052)

The three-layer NIP-59 structure:

1. **Rumor** (kind 52, unsigned):
   ```
   kind: 52
   pubkey: <sender's pubkey>
   tags: [
     ["a", "{eventKind}:{recipientPubkey}:{eventDTag}"],
     ["viewKey", "<nsec-encoded view secret key>"]
   ]
   content: ""
   ```
2. **Seal** (kind 13, signed by sender):
   - Content: `signer.nip44Encrypt(recipientPubkey, JSON.stringify(rumor))`
   - Created at a randomized timestamp (±2 days) for metadata privacy
3. **Gift Wrap** (kind 1052, signed by a random ephemeral key):
   - Content: `nip44.encrypt(JSON.stringify(seal), conversationKey(randomKey, recipientPubkey))`
   - Tags: `[["p", recipientPubkey]]` — so the recipient can filter for it
   - Created at a randomized timestamp (±2 days)

### Invitation Flow

1. **Creator** publishes a private event (kind 32678/32679) to relays
2. **Creator** adds the event reference (with viewKey) to their selected calendar list (kind 32123)
3. **Creator** gift-wraps the viewKey and sends a kind 1052 event to each participant (including themselves)
4. **Recipient** fetches recent gift wraps filtered by `#p` (limited to last 50)
5. **Recipient** unwraps: gift wrap → seal → rumor → extracts `eventId` and `viewKey`
6. **Recipient** sees pending invitations (displayed with grey/dashed styling)
7. **Recipient** can:
   - **Accept**: adds the event reference (including viewKey) to a chosen calendar list, removes from invitations
   - **Dismiss**: hides the invitation locally

### Deduplication

Invitations are deduplicated against all calendar lists. If an event's `eventDTag` already exists in any of the user's calendars, the corresponding gift wrap is silently skipped. Additionally, duplicate gift wraps within a single fetch session are tracked by `eventId` to prevent re-processing.

---

## Private Event Fetching

Private events are fetched based on **calendar list references**, not gift wraps. Gift wraps are only used for the initial invitation delivery.

### Fetch Strategy

1. Collect all event refs from **visible** calendar lists via `getVisibleEventRefs()`
2. Parse each ref to extract `eventDTag`, `authorPubkey`, `viewKey`, `beginTimeSecs`, and `isRecurring`
3. Split refs into two groups:
   - **Non-recurring** (`isRecurring=false`): include only if `beginTimeSecs` falls within the time range (default: −14 days to +28 days from now)
   - **Recurring** (`isRecurring=true`): **always include** regardless of time range, since old recurring events may have future occurrences
4. Skip any events already fetched in this session (tracked by `processedEventIds` set)
5. Fetch all matching events in a **single relay subscription** using filters:
   ```
   kinds: [32678], "#d": [eventIds], authors: [authorPubkeys]
   kinds: [32679], "#d": [eventIds], authors: [authorPubkeys]
   ```
6. For each received event, look up its `viewKey` from the ref map and decrypt
7. Parse the decrypted tags into an `ICalendarEvent` and attach the `calendarId` for color theming
8. Deduplicate by keeping the version with the newer `created_at` timestamp

---

## Data Flow Diagrams

### Event Creation (Private)

```
User creates private event
  → Generate random viewSecretKey
  → Encrypt event data with viewKey (NIP-44)
  → Sign and publish encrypted event to relays (kind 32678/32679)
  → Build event ref (includes viewKey, timestamps, recurring flag)
  → Add event ref to selected calendar list
  → Re-encrypt and republish calendar list to relays (kind 32123)
  → Gift-wrap viewKey to each participant + self (kind 1052)
  → Publish gift wraps to relays
```

### Invitation Acceptance

```
Recipient fetches gift wraps (kind 1052, #p filter, limit 50)
  → Unwrap: gift wrap → seal → rumor
  → Extract eventId and viewKey from rumor tags
  → Deduplicate against all calendar list event IDs
  → Skip if already in any calendar
  → Fetch and decrypt the actual event for preview
  → Display as pending invitation
  → User accepts:
      → Build event ref with viewKey and event metadata
      → Add ref to chosen calendar list
      → Republish calendar list (kind 32123)
      → Remove invitation from local state
```

### Calendar Load (App Startup)

```
App starts / user logs in
  → Load cached calendars from secure storage (instant display)
  → Fetch calendar lists from relays (kind 32123, author filter)
  → Decrypt each list (self-decrypt with signer)
  → Merge with cache (keep newer versions)
  → Auto-create default calendar if none exist (after 5s timeout)
  → Collect event refs from visible calendars
  → Split into recurring / non-recurring
  → Fetch private events by d-tag (kind 32678 + 32679)
  → Decrypt each with its viewKey
  → Fetch invitations from recent gift wraps (kind 1052)
  → Deduplicate against calendar contents
  → Display pending invitations
```

### Private Event Decryption Chain

```
Calendar List (kind 32123)
  │ self-encrypted with user's pubkey (NIP-44 via signer)
  │
  └─ contains event refs with viewKeys
       │
       └─ Private Event (kind 32678/32679)
            │ encrypted with viewKey (NIP-44, key-to-self pattern)
            │
            └─ Decrypted event tags (title, description, start, end, etc.)

Gift Wrap (kind 1052)
  │ encrypted with ephemeral key → recipient's pubkey (NIP-44)
  │
  └─ Seal (kind 13)
       │ encrypted with sender's key → recipient's pubkey (NIP-44 via signer)
       │
       └─ Rumor (kind 52)
            │ unsigned, contains:
            │   - a-tag: event coordinate
            │   - viewKey: nsec-encoded decryption key
            │
            └─ Used to build event ref when invitation is accepted
```

## Caching Strategy

All data is cached in secure storage for offline/instant access:

| Storage Key | Contents |
|-------------|----------|
| `cal:calendar_lists` | Array of `ICalendarList` objects (decrypted) |
| `cal:calendar_visibility` | Map of `calendarId → boolean` (client-side only) |
| `cal:events` | Array of `ICalendarEvent` objects (decrypted, parsed) |
| `cal:invitations` | Array of `IInvitation` objects (pending invitations) |

On startup, cached data is loaded first for immediate display, then relay fetches update the state by merging (newer versions win).

## Migration

Existing users who upgrade will have their events accessible only via gift wraps. On first load after upgrade, existing gift wraps appear as invitations. The user can accept them into their default calendar. This is intentional — it lets users organize events into calendars rather than auto-migrating everything.
