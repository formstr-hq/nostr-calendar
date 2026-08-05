# Limitations

## Private calendar-list capacity

Private calendar lists are kind `32123` parameterized-replaceable events. The
application stores the complete list in NIP-44-encrypted event `content`; an
add, removal, or move republishes the entire list. Calendar-event references
are decrypted inner tags in this form:

```json
["a", "{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{nsecViewKey}"]
```

The following estimates apply to the current private-event implementation:

- Event coordinates use a five-character kind, a 64-character hexadecimal
  public key, and a 30-character `d` tag. The coordinate is 101 characters.
- A NIP-19 `nsec` view key is 63 characters.
- With a 21-23 character relay hint, a reference is about 200-202 bytes in the
  JSON plaintext, including the tag syntax and separating comma.
- The calendar metadata (`title`, `content`, and `color`) adds about 60 bytes
  before optional title, description, or notification data.

Assuming a 65,536-byte serialized-event limit, the outer signed Nostr event
uses roughly 384 bytes before its encrypted `content`. NIP-44 padding and
Base64 encoding make the largest useful plaintext bucket about 40,960 bytes:

```text
typical plaintext = 60 + (200 to 202 * reference count)
```

At the next NIP-44 padding bucket, ciphertext alone is about 65,628 characters,
which exceeds the available event budget once the outer event is included.

| Reference data | Estimated maximum |
| --- | ---: |
| Empty relay hints | 228 |
| 21-character relay hints | 204 |
| 23-character relay hints | 202 |
| 37-character relay hints | about 189 |

Use **150 references per calendar list** as a safe operational limit. This
leaves room for longer calendar titles and descriptions, longer relay URLs or
identifiers, serialization differences, and relay-specific limits. Roughly
150-200 references is the realistic range for current lists; values above 200
are close to the encryption padding boundary.

This is an implementation estimate, not a universal Nostr guarantee. NIP-01
does not set a shared 64 KB event limit, and relays may limit serialized event
JSON, the enclosing WebSocket frame, or another internal representation. The
actual capacity also changes if the reference shape, `d` tag length, relay hint,
view-key encoding, or encryption implementation changes.

Relevant implementation: `src/nostr/calendars.ts`,
`src/utils/calendarListTypes.ts`, `src/nostr/core.ts`, and
`src/nostr/crypto.ts`. The private-calendar-list wire format is specified in
`nips/NIP-52E.md` and `docs/nostr-layer-reference.html`.
