# Nostr Calendar

A decentralized calendar application built on the Nostr protocol. Users can create, view, and RSVP to calendar events with support for both public and private (encrypted) events.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **State Management**: Zustand
- **UI Library**: Material-UI (MUI) 7 with Emotion
- **Nostr networking**: `@formstr/local-relay` — a Web Worker "local relay" that owns
  every socket; the app only declares interests (`observe`) and publishes. Wiring in
  `src/dataLayer/`. nostr-tools is used for crypto/encoding only (NIP-44, NIP-19).
- **Mobile**: Capacitor 8 for iOS/Android deployment
- **Dates**: date-fns and dayjs
- **i18n**: react-intl

## Project Structure

```
src/
├── main.tsx              # React DOM entry point
├── App.tsx               # Root component with providers
├── theme.ts              # MUI theme configuration
├── components/           # React components
│   ├── Calendar.tsx      # Main calendar container
│   ├── DayView.tsx       # Day view layout
│   ├── WeekView.tsx      # Week view layout
│   ├── MonthView.tsx     # Month view layout
│   ├── CalendarEvent.tsx # Event display component
│   ├── CalendarEventEdit.tsx  # Event creation/editing
│   ├── ViewEventPage.tsx # Full event page view
│   ├── LoginModal.tsx    # Authentication modal
│   └── Routing.tsx       # React Router configuration
├── stores/               # Zustand state stores
│   ├── user.ts           # User authentication state
│   ├── events.ts         # Calendar events (main store)
│   ├── settings.ts       # App settings (layout, filters)
│   ├── participants.ts   # Participant profile cache
│   └── locale.ts         # Language/locale state
├── common/               # Core business logic
│   ├── nostr.ts          # Nostr domain logic (build/sign/encrypt events, observe/publish via dataLayer)
│   ├── nip59.ts          # NIP-59 gift wrap encryption
│   ├── EventConfigs.ts   # Nostr event kind definitions
│   ├── calendarEngine.ts # Event layout algorithm
│   ├── utils.ts          # Utility functions (ICS export)
│   ├── dictionary.ts     # i18n messages
│   └── signer/           # Nostr signing implementations
│       ├── NIP07Signer.ts   # Browser extension
│       ├── NIP46Signer.ts   # Remote signer (bunker)
│       └── LocalSigner.ts   # Local key storage
├── utils/                # Helper utilities
│   ├── types.ts          # Shared type definitions
│   ├── parser.ts         # Nostr event parsing
│   ├── repeatingEventsHelper.ts  # Recurring events
│   ├── dateHelper.ts     # Date manipulation
│   └── rsvpHelpers.ts    # RSVP utilities
└── hooks/                # Custom React hooks
    ├── useLayout.ts      # Calendar layout state
    └── useDateWithRouting.ts  # Date + URL sync
```

## Development Commands

```bash
pnpm dev              # Start dev server (localhost:5173)
pnpm build            # Production build to /dist
pnpm lint             # Run ESLint
pnpm preview          # Preview production build

# Mobile
pnpm simulate-android # Run Android emulator
pnpm build-android    # Build Android APK
pnpm simulate-ios     # Run iOS simulator
pnpm build-ios        # Build iOS app
```

## Key Concepts

### Nostr Event Kinds

```typescript
enum EventKinds {
  PublicCalendarEvent = 31923,
  PrivateCalendarEvent = 32678,
  PrivateCalendarRecurringEvent = 32679,
  CalendarEventGiftWrap = 1052,
  PublicRSVPEvent = 31925,
  PrivateRSVPEvent = 32069,
  RSVPGiftWrap = 1055,
  UserProfile = 0,
}
```

### Main Types

```typescript
interface ICalendarEvent {
  id: string;              // d tag identifier
  eventId: string;         // Nostr event ID
  title: string;
  description: string;
  begin: number;           // Timestamp (ms)
  end: number;
  user: string;            // Author pubkey
  participants: string[];
  isPrivateEvent: boolean;
  viewKey?: string;        // Decryption key
  repeat: { frequency: RepeatingFrequency | null };
}

enum RepeatingFrequency {
  None, Daily, Weekly, Weekday, Monthly, Quarterly, Yearly
}
```

### Authentication

Three signer implementations:
1. **NIP-07**: Browser extension (nos2x, Alby, etc.)
2. **NIP-46**: Remote signer via bunker URI
3. **Local**: Key stored in localStorage (guest mode)

### Private Events

Private events use NIP-59 gift wrap encryption:
- Events encrypted with NIP-44
- Wrapped in gift wrap envelope
- View keys enable selective visibility

## Routes

- `/event/:naddr` - Event detail page
- `/calendar/day/:date` - Day view
- `/calendar/week/:date` - Week view
- `/calendar/month/:date` - Month view
- `/` - Landing page

## Stores Pattern

All state in Zustand stores accessed via hooks:

```typescript
// User authentication
const { user, logout } = useUser();

// Calendar events
const { events, fetchEvents } = useTimeBasedEvents();

// Settings
const { settings, updateSetting } = useSettings();
```

## Conventions

- **Components**: PascalCase (Calendar.tsx)
- **Utilities**: camelCase (dateHelper.ts)
- **Stores**: camelCase (user.ts)
- **Hooks**: usePrefix (useLayout.ts)
- **Types**: IPrefix for interfaces (ICalendarEvent)

## Default Relays

Events are fetched from and published to:
- wss://relay.damus.io
- wss://relay.primal.net
- wss://relay.nos.lol
- wss://nostr-pub.wellorder.net
- wss://nostr.mom
- wss://nos.lol

## E2E Testing
- Run the script defined in package json to start the tests
- Always look at the test files and not the architecture documents. They might be outdated
