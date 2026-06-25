# Calendar by Form\*

A decentralized calendar app built on [Nostr](https://nostr.com). No accounts, no servers, no data harvesting — just your keys and your events.

**Web:** [calendar.formstr.app](https://calendar.formstr.app)
**Android:** [GitHub Releases](https://github.com/formstr-hq/nostr-calendar/releases)

## Why

Every calendar app today stores your schedule on someone else's server. Calendar by Form\* uses the Nostr protocol as its backend — your events live on relays you choose, signed with your keys, and only you control access.

Private events use **NIP-59 Gift Wrap encryption** — a three-layer envelope scheme where the event content is encrypted with a one-time view key, sealed with your identity, and wrapped for each recipient individually. Not even the relays can read your private events. This is a capability unique to Nostr that traditional calendar apps simply cannot offer.

## Features

- **Day / Week / Month views** — navigate with swipe gestures on mobile
- **Private events** — end-to-end encrypted using NIP-59 Gift Wrap, only visible to invited participants
- **Shareable view links** — share private events via URL with an embedded view key, no login required for recipients
- **Public events** — browse and create events visible to the global Nostr network
- **Participant invites** — add people by npub, they receive encrypted gift wraps with the event details
- **RSVP system**(Coming Soon) — accept, decline, or mark tentative, with encrypted RSVPs for private events
- **Recurring events** — daily, weekly, weekdays, monthly, quarterly, yearly
- **ICS export** — download any event as `.ics` for import into other calendar apps
- **Markdown descriptions** — full GitHub-flavored Markdown support in event descriptions
- **Multiple sign-in methods** — browser extensions (NIP-07), remote signers/bunkers (NIP-46), Android signer apps like Amber (NIP-55), or local keys
- **Guest mode** — browse public events without logging in
- **i18n** — English and German(Partial)

## How Private Events Work

Private events are the standout feature. Here's the flow:

1. A **one-time view key pair** is generated for the event
2. Event data (title, time, location, participants, description) is **encrypted with the view key** using NIP-44 and published as a kind `32678` event — the relay sees only an opaque blob
3. For each participant (including the creator), a **Gift Wrap** is created:
   - A **Rumor** (unsigned, kind 52) containing the event reference and the view key
   - A **Seal** (kind 13) encrypting the rumor with the recipient's public key, with a randomized timestamp to prevent timing analysis
   - A **Wrap** (kind 1052) encrypting the seal with an ephemeral key, tagged to the recipient for retrieval
4. Recipients fetch their gift wraps, decrypt through both layers to recover the view key, then decrypt the event content

Private RSVPs follow the same three-layer pattern (kinds 55 → 13 → 1055).

The view key can also be embedded in a shareable URL (`/event/{naddr}?viewKey={nsec}`), allowing anyone with the link to view the event without being a participant.

## Tech Stack

| Layer      | Technology            |
| ---------- | --------------------- |
| Framework  | React 19 + TypeScript |
| Build      | Vite 7                |
| UI         | Material UI 7         |
| State      | Zustand 5             |
| Routing    | React Router 7        |
| Nostr      | nostr-tools 2.15      |
| Mobile     | Capacitor 8 (Android) |
| Animations | Framer Motion         |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Development

```bash
pnpm install
pnpm dev
```

The app runs at `http://localhost:5173`.

### Build

```bash
pnpm build
pnpm preview    # preview the production build
```

### Android

```bash
pnpm simulate-android    # build + run in emulator
pnpm release-android     # signed APK + GitHub release
```

## Nostr Event Kinds

| Kind  | Purpose                           |
| ----- | --------------------------------- |
| 31923 | Public calendar event             |
| 31925 | Public RSVP                       |
| 32678 | Encrypted private calendar event  |
| 32679 | Encrypted private recurring event |
| 32069 | Encrypted private RSVP            |
| 1052  | Gift wrap for private events      |
| 1055  | Gift wrap for private RSVPs       |
| 31927 | Scheduling page                   |
| 32680 | Scheduling page key index         |
| 31926 | Public busy list                  |
| 1057  | Booking request gift wrap         |
| 1058  | Booking response gift wrap        |

## Protocol Proposals

The protocols used by this app are formalized as NIP proposals:

| Proposal | Description |
| -------- | ----------- |
| [NIP-52E](nips/NIP-52E.md) | Private Calendar Events, Gift Wraps, Calendar Lists, Busy Lists, Private RSVPs |
| [NIP-52R](nips/NIP-52R.md) | Recurring Calendar Events via RRULE (addendum to NIP-52) |
| [NIP-Appointment-Scheduling](nips/NIP-Appointment-Scheduling.md) | Scheduling pages and booking request/response flow |
| [nip09x](nips/NIP-09-PR.md) | Participant Self-Removal (kind `84`) |

For implementation details see [PROTOCOL.md](PROTOCOL.md) and [SCHEDULING_PROTOCOL.md](SCHEDULING_PROTOCOL.md).

## Contributing

Contributions are welcome. Fork the repo, create a branch, and open a PR.

```bash
pnpm lint       # run ESLint + Prettier checks
```

## License

[MIT](LICENSE)
