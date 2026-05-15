# NIP-52E

## Private Calendar Events and Private Calendar Lists

`draft` `optional`

This NIP extends [NIP-52](https://github.com/nostr-protocol/nips/blob/master/52.md) with a privacy layer, adding:

- **Private calendar events** visible only to invited participants (kind `32678`)
- **Calendar event gift wraps** that deliver decryption keys to participants (kind `1052`)
- **Private calendar lists** — self-encrypted personal collections of event references (kind `32123`)
- **Private RSVPs** encrypted with the same pattern as private events (kind `32069`)
- **Participant removal** events to opt out of a private event (kind `84`)

---

## Motivation

NIP-52 defines public calendar events visible to everyone. Many real-world scheduling needs — personal appointments, private meetings, sensitive bookings — require events that are invisible to relay operators and the general public.

NIP-52E uses a **view key** pattern: event content is encrypted with a randomly generated keypair. The secret key ("view key") is distributed to each intended participant. This separates content encryption from identity and makes it easy to edit events without re-keying recipients.

---

## Event Kinds

| Kind  | Name | Type |
|-------|------|------|
| 32678 | Private Calendar Event | Parameterized replaceable |
| 1052  | Calendar Event Gift Wrap | Regular (NIP-59) |
| 52    | Calendar Event Rumor | Unsigned (inside gift wrap) |
| 32123 | Private Calendar List | Parameterized replaceable |
| 32069 | Private RSVP | Parameterized replaceable |
| 1055  | RSVP Gift Wrap | Regular (NIP-59) |
| 55    | RSVP Rumor | Unsigned (inside RSVP gift wrap) |
| 84    | Participant Removal | Regular |

---

## View Key Pattern

Each private event is encrypted with an independent, randomly generated NIP-44 keypair:

1. Generate a random secret key: `viewSecretKey = generateSecretKey()`
2. Derive its public key: `viewPublicKey = getPublicKey(viewSecretKey)`
3. Compute a NIP-44 conversation key: `ck = nip44.getConversationKey(viewSecretKey, viewPublicKey)`
4. Encrypt content: `nip44.encrypt(JSON.stringify(innerTags), ck)`

This is a **self-encryption** pattern: the view key encrypts data to its own corresponding public key. Anyone who has `viewSecretKey` can derive `viewPublicKey` and decrypt.

The `viewSecretKey` is encoded as an `nsec` bech32 string (NIP-19) for storage and transfer.

Decryption:

```
viewSecretKey = nip19.decode(nsecViewKey).data
viewPublicKey = getPublicKey(viewSecretKey)
ck = nip44.getConversationKey(viewSecretKey, viewPublicKey)
innerTags = JSON.parse(nip44.decrypt(event.content, ck))
```

---

## 1. Private Calendar Event (kind `32678`)

A private time-based calendar event. The equivalent of NIP-52 kind `31923`, but fully encrypted.

### Event Structure

```json
{
  "kind": 32678,
  "pubkey": "<author hex pubkey>",
  "created_at": <unix timestamp>,
  "tags": [["d", "<event d-tag>"]],
  "content": "<NIP-44 encrypted blob>",
  "id": "<event id>",
  "sig": "<signature>"
}
```

Only the `d` tag is public. All event data lives in the encrypted `content`.

### Encrypted Content

The plaintext is a JSON array of tags, serialized and then encrypted:

```json
[
  ["title", "<event title>"],
  ["description", "<event description>"],
  ["start", <unix timestamp in seconds>],
  ["end", <unix timestamp in seconds>],
  ["image", "<optional image URL>"],
  ["d", "<event d-tag>"],
  ["location", "<optional location>"],
  ["p", "<author hex pubkey>"],
  ["p", "<participant hex pubkey>"],
  ["L", "rrule"],
  ["l", "<RRULE string, e.g. FREQ=WEEKLY;BYDAY=MO>"],
  ["notification", "<enabled|disabled>"]
]
```

Required inner tags: `title`, `start`, `d`.
Optional inner tags: `description`, `end`, `image`, `location`, `p` (participants), `L`/`l` (RRULE for recurring events), `notification`.

Both regular and recurring events use kind `32678`. Recurring events are identified by the presence of `L`/`l` (RRULE) tags in the decrypted payload.

### Example

Published event (only `d` tag visible):

```json
{
  "kind": 32678,
  "pubkey": "ab12cd34ef56...",
  "created_at": 1700000000,
  "tags": [["d", "7f3a2b1c0e"]],
  "content": "BpGtXz3...<NIP-44 ciphertext>...Qm9lR",
  "id": "...",
  "sig": "..."
}
```

Decrypted inner tags (after applying the view key):

```json
[
  ["title", "Team Sync"],
  ["description", "Weekly alignment meeting"],
  ["start", 1700002800],
  ["end", 1700006400],
  ["image", ""],
  ["d", "7f3a2b1c0e"],
  ["location", "https://meet.example.com/abc"],
  ["p", "ab12cd34ef56..."],
  ["p", "12ab34cd56ef..."]
]
```

---

## 2. Calendar Event Gift Wrap (kind `1052`)

When a private event is created, the author sends a [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) gift wrap to each participant (including themselves). The gift wrap carries the `viewKey` so participants can decrypt the event.

Recipients see incoming gift wraps as **invitations** — they must explicitly accept them to add the event to one of their calendars.

### Three-Layer NIP-59 Structure

**Layer 1 — Rumor** (kind `52`, unsigned, not broadcast):

```json
{
  "kind": 52,
  "pubkey": "<sender hex pubkey>",
  "created_at": <unix timestamp>,
  "tags": [
    ["a", "32678:<author hex pubkey>:<event d-tag>", "<relay hint URL>"],
    ["viewKey", "<nsec-encoded view secret key>"]
  ],
  "content": "",
  "id": "<rumor id>"
}
```

The `a` tag uses the standard NIP-01 parameterized address format: `kind:pubkey:d-tag`. The relay hint is the URL of a relay that accepted the private event, so the recipient can fetch it.

**Layer 2 — Seal** (kind `13`, signed by sender):
- `content`: `nip44Encrypt(recipientPubkey, JSON.stringify(rumor))`

**Layer 3 — Gift Wrap** (kind `1052`, signed by a random ephemeral key):
- `content`: `nip44Encrypt(ephemeralKey, recipientPubkey, JSON.stringify(seal))`
- `tags`: `[["p", "<recipient hex pubkey>"]]`

### Fetching Gift Wraps

Clients subscribe with:

```
{ "kinds": [1052], "#p": ["<user hex pubkey>"] }
```

Unwrap: gift wrap → seal → rumor → extract the `a` tag coordinate and `viewKey`.

### Invitation Acceptance

When the user accepts an invitation:

1. Build an event reference: `["{32678}:{authorPubkey}:{dTag}", "{relayHint}", "{nsecViewKey}"]`
2. Add the reference to the user's chosen calendar list (kind `32123`)
3. Re-publish the updated calendar list

When the user dismisses an invitation, it is hidden locally and not added to any calendar.

### Deduplication

Before displaying an invitation, check if the event's `d-tag` already exists in any of the user's calendar lists. If it does, skip the gift wrap silently (the user already has the event).

---

## 3. Private Calendar List (kind `32123`)

A private calendar list is a **self-encrypted**, parameterized replaceable event that organizes a user's private events into a named, colored collection. A user can have multiple calendar lists (e.g. "Work", "Personal", "Travel").

**Self-encryption**: The content is encrypted using NIP-44 with the user's own public key (via the signer). Only the user's private key can decrypt it. This keeps calendar lists private even on public relays.

### Event Structure

```json
{
  "kind": 32123,
  "pubkey": "<user hex pubkey>",
  "created_at": <unix timestamp>,
  "tags": [["d", "<calendar UUID>"]],
  "content": "<NIP-44 self-encrypted blob>",
  "id": "<event id>",
  "sig": "<signature>"
}
```

### Encryption and Decryption

```
// Encrypt
encryptedContent = signer.nip44Encrypt(userPubkey, JSON.stringify(innerTags))

// Decrypt
plaintext = signer.nip44Decrypt(event.pubkey, event.content)
// event.pubkey == userPubkey, completing the self-encryption round-trip
```

### Encrypted Inner Tags

```json
[
  ["title", "<calendar name>"],
  ["content", "<optional calendar description>"],
  ["color", "<hex color code, e.g. #4285f4>"],
  ["notifications", "disabled"],
  ["a", "32678:<authorPubkey>:<eventDTag>", "<relayUrl>", "<nsecViewKey>"],
  ["a", "32678:<authorPubkey>:<eventDTag>", "<relayUrl>", "<nsecViewKey>"]
]
```

**Inner tag reference:**

| Tag | Required | Description |
|-----|----------|-------------|
| `title` | Yes | Display name of the calendar |
| `content` | No | Calendar description (use empty string if omitted) |
| `color` | No | Hex color code for UI theming |
| `notifications` | No | `"disabled"` to mute all notifications for this calendar; omit to enable |
| `a` | Repeated | Event reference (see below) |

### Event Reference Format

Each `a` tag in the decrypted inner tags is an event reference with this structure:

```
["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{nsecViewKey}"]
```

| Position | Content |
|----------|---------|
| `[0]` | `"a"` |
| `[1]` | NIP-01 parameterized address: `kind:hex-pubkey:d-tag` |
| `[2]` | Relay hint URL (empty string if none) |
| `[3]` | `nsec`-encoded view secret key for decrypting the referenced event |

### Full Example

Raw event on relay (only `d` tag visible to anyone):

```json
{
  "kind": 32123,
  "pubkey": "ab12cd34...",
  "created_at": 1700000000,
  "tags": [["d", "550e8400-e29b-41d4-a716-446655440000"]],
  "content": "Bx7Tz2...<NIP-44 ciphertext>...kR3mP",
  "id": "...",
  "sig": "..."
}
```

Decrypted inner tags:

```json
[
  ["title", "Work"],
  ["content", "Work meetings and deadlines"],
  ["color", "#1a73e8"],
  ["a", "32678:ab12cd34...:7f3a2b1c0e", "wss://relay.damus.io/", "nsec1xyz..."],
  ["a", "32678:ab12cd34...:9d8e7f6a5b", "wss://relay.damus.io/", "nsec1abc..."]
]
```

### Deletion

Calendar lists are deleted with a NIP-09 kind `5` event that references both:
- The calendar list's event ID (`e` tag)
- The parameterized address `32123:<pubkey>:<d-tag>` (`a` tag)

### Visibility Toggle

Whether a calendar list is shown or hidden in the UI is **client-side only** and not stored in the Nostr event. Clients should persist visibility state locally.

---

## 4. Private RSVP (kind `32069`)

A private RSVP uses the same view-key encryption as kind `32678`. It is the private equivalent of NIP-52's kind `31925`.

### Event Structure

Same pattern as private calendar events — all RSVP data encrypted in `content`, only `d` tag public:

```json
{
  "kind": 32069,
  "pubkey": "<author hex pubkey>",
  "created_at": <unix timestamp>,
  "tags": [["d", "<rsvp d-tag>"]],
  "content": "<NIP-44 encrypted blob>",
  "id": "<event id>",
  "sig": "<signature>"
}
```

### RSVP Gift Wrap (kind `1055`) and Rumor (kind `55`)

The RSVP view key is distributed the same way as calendar event keys, using kind `1055` for the gift wrap and kind `55` for the rumor.

**Rumor** (kind `55`, unsigned):

```json
{
  "kind": 55,
  "pubkey": "<sender hex pubkey>",
  "created_at": <unix timestamp>,
  "tags": [
    ["a", "32069:<rsvp-author-pubkey>:<rsvp-d-tag>"],
    ["viewKey", "<nsec-encoded view secret key>"]
  ],
  "content": ""
}
```

**Gift Wrap**: kind `1055`, same three-layer NIP-59 structure as kind `1052`.

---

## 5. Participant Removal (kind `84`)

Published by a participant who opts out of a private event. This notifies the event author and other participants that this person is no longer attending.

```json
{
  "kind": 84,
  "pubkey": "<departing participant hex pubkey>",
  "created_at": <unix timestamp>,
  "tags": [
    ["a", "32678:<author-pubkey>:<event-d-tag>"],
    ["e", "<private event id>"],
    ["k", "32678"]
  ],
  "content": "<optional reason>",
  "id": "<event id>",
  "sig": "<signature>"
}
```

---

## Complete Protocol Flows

### Creating a Private Event

```
1. Generate viewSecretKey (random)
2. Build inner tags array: [["title", ...], ["start", ...], ...]
3. content = nip44.encrypt(JSON.stringify(innerTags),
             nip44.getConversationKey(viewSecretKey, getPublicKey(viewSecretKey)))
4. Publish: { kind: 32678, tags: [["d", dTag]], content }
5. Build event ref: ["32678:{authorPubkey}:{dTag}", "{relayHint}", "{nsec(viewSecretKey)}"]
6. Add event ref to creator's calendar list (kind 32123), re-encrypt, re-publish
7. For each participant (including creator):
   a. Create rumor (kind 52):
      tags: [["a", "32678:{authorPubkey}:{dTag}", "{relayHint}"],
             ["viewKey", "{nsec(viewSecretKey)}"]]
      content: ""
   b. Seal (kind 13): encrypt rumor for recipient using sender's key
   c. Gift Wrap (kind 1052): encrypt seal using ephemeral key, tag with recipient pubkey
   d. Publish gift wrap to recipient's relays
```

### Receiving and Accepting an Invitation

```
1. Subscribe: { kinds: [1052], "#p": [myPubkey] }
2. For each gift wrap received:
   a. Unwrap: gift wrap → seal → rumor
   b. Extract event coordinate and viewKey from rumor tags
   c. Check if event d-tag already exists in any calendar list → skip if so
   d. Fetch: { kinds: [32678], "#d": [eventDTag], authors: [authorPubkey] }
   e. Decrypt with viewKey → display as pending invitation
3. User accepts:
   a. Build event ref: [coordinate, relayHint, nsecViewKey]
   b. Add to chosen calendar list (kind 32123), re-publish
4. User dismisses: hide locally, do not add to calendar
```

### Loading Calendar Events at Startup

```
1. Fetch own calendar lists: { kinds: [32123], authors: [myPubkey] }
2. Self-decrypt each list → extract event refs
3. Parse each ref to get: kind, authorPubkey, eventDTag, relayUrl, viewKey
4. Fetch events: { kinds: [32678], "#d": [dTags], authors: [authorPubkeys] }
   (merge relay hints into the relay list for better fetch coverage)
5. Decrypt each event: viewPrivateKey = decode(nsecViewKey),
   innerTags = JSON.parse(nip44.decrypt(event.content,
                          getConversationKey(viewPrivateKey, getPublicKey(viewPrivateKey))))
6. Associate each event with its calendar (for color theming, visibility)
7. Deduplicate by event d-tag, keeping the higher created_at version
```

---

## Relationship to NIP-52 PR #2027

This NIP extends and corrects the proposal in [nostr-protocol/nips#2027](https://github.com/nostr-protocol/nips/pull/2027). Key differences:

| Topic | PR #2027 | NIP-52E |
|-------|----------|---------|
| `a` tag in rumor | `kind:viewerPubkey:dTag` (viewer pubkey) | `kind:authorPubkey:dTag` (standard NIP-01 format) |
| Content encryption | Description separate tag; rest in content | **All** tags encrypted in content; nothing plaintext except `d` |
| Private date-based event | kind `32677` | Not implemented; kind `32678` handles all time-based private events |
| Private Calendar List | Not mentioned | Fully specified (kind `32123`) |
| RSVP gift wrap kind | Same `1052` for all | Separate kinds: `1055` (RSVP) vs `1052` (event invitations) |
| RSVP rumor kind | Implied `1052` | Separate kind: `55` |

---

## Security Considerations

- **Relay metadata**: Even with encrypted content, relay operators can observe that a user publishes kind `32123` events and receives kind `1052` gift wraps. Event frequency and timing are not hidden.
- **View key distribution**: Once a `viewKey` is shared via gift wrap, the recipient can share it further. There is no technical enforcement of access control beyond key distribution.
- **Calendar list privacy**: Self-encryption (encrypted to own pubkey) means no one else can read the list — but it also means losing the private key means losing all calendar data.
- **Gift wrap sender privacy**: NIP-59 gift wraps use ephemeral keys for the outer wrap, obscuring the sender's identity from relay operators. The seal layer uses the sender's actual key to authenticate to the recipient.
- **No forward secrecy**: If a `viewKey` is compromised, all past and future versions of the event (same `d-tag`) are readable. Rotating the key requires publishing a new event with a new `viewKey` and re-sharing it.
