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

## Protocol Proposals

The protocols used by this app are formalized as NIP proposals:

| Proposal | Description |
| -------- | ----------- |
| [NIP-52E](nips/NIP-52E.md) | Private Calendar Events, Gift Wraps, Calendar Lists, Busy Lists, Private RSVPs |
| [NIP-52R](nips/NIP-52R.md) | Recurring Calendar Events via RRULE (addendum to NIP-52) |
| [NIP-Appointment-Scheduling](nips/NIP-Appointment-Scheduling.md) | Scheduling pages and booking request/response flow |
| [nip09x](nips/NIP-09-PR.md) | Participant Self-Removal (kind `84`) |

For a current, code-derived breakdown of every flow's Nostr layer (event kinds, tags, encryption, relay routing), see [docs/nostr-layer-reference.html](docs/nostr-layer-reference.html).

## Contributing

Contributions are welcome. Fork the repo, create a branch, and open a PR.

```bash
pnpm lint       # run ESLint + Prettier checks
```

## License

[MIT](LICENSE)
