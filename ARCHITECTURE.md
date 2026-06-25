# Nostr Calendar - Full Application Flow

A step-by-step trace of the entire application from entry file to every user interaction, backed by code line references.

## Table of Contents

- [1. Entry Point](#1-entry-point)
- [2. Provider Wrapping (App component)](#2-provider-wrapping-app-component)
- [3. Application Initialization](#3-application-initialization)
- [4. New User vs Returning User](#4-new-user-vs-returning-user)
- [5. Signer Restoration (Returning User)](#5-signer-restoration-returning-user)
- [6. Login Flow (New User)](#6-login-flow-new-user)
- [7. Post-Login: Data Fetching Pipeline](#7-post-login-data-fetching-pipeline)
- [8. Routing and Navigation](#8-routing-and-navigation)
- [9. Calendar View Rendering](#9-calendar-view-rendering)
- [10. Event Creation Flow](#10-event-creation-flow)
- [11. Event Viewing Flow](#11-event-viewing-flow)
- [12. Invitation / Notification System](#12-invitation--notification-system)
- [13. Calendar List Management](#13-calendar-list-management)
- [14. Mobile vs Desktop Differences](#14-mobile-vs-desktop-differences)
- [15. Relay Management](#15-relay-management)
- [16. Logout Flow](#16-logout-flow)
- [17. Nostr Event Kinds Reference](#17-nostr-event-kinds-reference)

---

## 1. Entry Point

The app starts at `src/main.tsx`:

```tsx
// src/main.tsx:6-9
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

This mounts the root `<App />` component from `src/App.tsx` into the DOM element with id `"root"`.

> There is also a legacy `src/index.tsx` (from a CRA migration), but Vite uses `main.tsx` as the entry point.

---

## 2. Provider Wrapping (App component)

`src/App.tsx:142-160` — the exported `App` function wraps the entire application in four provider layers:

```tsx
// src/App.tsx:148-158
<IntlProvider locale={i18nLocale} messages={locale_dictionary}>     // i18n translations
  <LocalizationProvider dateAdapter={AdapterDayjs}>                  // MUI date pickers
    <ThemeProvider theme={theme}>                                    // MUI theme (colors, fonts)
      <CssBaseline />                                                // CSS reset
      <BrowserRouter>                                                // React Router
        <Application />                                              // The actual app logic
      </BrowserRouter>
    </ThemeProvider>
  </LocalizationProvider>
</IntlProvider>
```

### Locale detection (`src/App.tsx:29-33`)

```tsx
let _locale = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
_locale = ~Object.keys(dictionary).indexOf(_locale) ? _locale : "en-US";
```

Reads the browser's preferred language. Falls back to `"en-US"` if the language isn't in the dictionary. The dictionary (`src/common/dictionary.ts`) is merged via `flattenMessages()` (`src/common/utils.ts:4-26`) which flattens nested message objects into dot-delimited keys like `"login.signInWithExtension"`.

### Theme (`src/theme.ts:10-76`)

Black primary color (`#000000ff`), monospace font family (Menlo, Monaco, Consolas), custom `"highlighted"` IconButton variant, ripple disabled globally.

---

## 3. Application Initialization

The inner `Application` component (`src/App.tsx:35-139`) runs three `useEffect` hooks on mount. These fire simultaneously:

### 3a. User + cache initialization (`src/App.tsx:48-52`)

```tsx
useEffect(() => {
  initializeUser();                                    // starts signer restoration (async)
  useTimeBasedEvents.getState().loadCachedEvents();    // loads cached events from Capacitor Preferences
  useRelayStore.getState().loadCachedRelays();          // loads cached relay list from Capacitor Preferences
}, []);
```

- `initializeUser()` → calls `signerManager.onChange(onUserChange)` then `signerManager.restoreFromStorage()` (see Section 5)
- `loadCachedEvents()` (`src/stores/events.ts:177-191`) → reads `"cal:events"` from secure storage, populates the events store
- `loadCachedRelays()` (`src/stores/relays.ts:22-27`) → reads `"cal:relays"` from secure storage, populates the relay store

**Important:** On web (non-native), `getSecureItem()` returns the default value (empty array) immediately because Capacitor Preferences is a no-op on web (`src/common/localStorage.ts:28`). Caching only works on native.

### 3b. Notification click listener (`src/App.tsx:54-58`)

```tsx
useEffect(() => {
  return addNotificationClickListener((eventId) => {
    navigate(`/notification-event/${eventId}`);
  });
}, [navigate]);
```

`addNotificationClickListener` (`src/utils/notifications.ts:145-165`) does nothing on web (`if (!isNative) return () => {}`). On native, it registers a listener for `localNotificationActionPerformed` — when a user taps a notification, it extracts the `eventId` from the notification's extra data and navigates to the event page.

### 3c. Android back button handler (`src/App.tsx:62-82`)

```tsx
useEffect(() => {
  if (!isNative) return;    // web: do nothing
  import("@capacitor/app").then(({ App: CapApp }) => {
    const listener = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    });
    cleanup = () => { listener.then((l) => l.remove()); };
  });
  return () => { cleanup?.(); };
}, []);
```

Only runs on native. Dynamically imports `@capacitor/app` to avoid bundling issues on web. Uses `canGoBack` to decide between browser history navigation and exiting the app.

---

## 4. New User vs Returning User

After initialization completes (signer restore finishes), the app checks user state in this effect (`src/App.tsx:84-88`):

```tsx
useEffect(() => {
  if (!user && !appMode && isInitialized) {
    setShowModeSelection(true);    // No stored credentials → show welcome screen
  }
}, [user, isInitialized, appMode]);
```

### Diversion: Returning User

If `signerManager.restoreFromStorage()` found valid credentials:
1. `onUserChange` fires → `user` is set in the store
2. The condition `!user` is false → mode selection modal never opens
3. The app goes straight to the calendar view

### Diversion: New User

If no credentials are found:
1. `signerManager.restoreFromStorage()` completes without setting a signer
2. `onUserChange` fires with `cachedUser = null` → sets `isInitialized: true`, `user: null`
3. The condition `!user && !appMode && isInitialized` is true → `ModeSelectionModal` opens

### ModeSelectionModal (`src/components/ModeSelectionModal.tsx:11-138`)

Shows a blurred calendar in the background with an overlay containing:
- App title ("Calendar by Form*")
- Description text
- **"Sign In"** button → `onModeSelect("login")`
- **"Browse as Guest"** button → `onModeSelect("guest")`

When "Sign In" is clicked (`src/App.tsx:104-107`):
```tsx
const handleModeSelection = (mode: "login" | "guest") => {
  setAppMode(mode);              // "login"
  setShowModeSelection(false);    // close modal
};
```

This triggers the next effect (`src/App.tsx:90-102`):
```tsx
useEffect(() => {
  if (appMode === "login" && isInitialized && !user) {
    updateLoginModal(true);    // opens the LoginModal dialog
  }
}, [appMode, user, isInitialized, updateLoginModal]);
```

When "Browse as Guest" is clicked: `appMode = "guest"`, modal closes, no login. The app renders the calendar with no events (public events only if the filter is enabled).

---

## 5. Signer Restoration (Returning User)

Called from `initializeUser()` in the user store (`src/stores/user.ts:56-62`):

```tsx
initializeUser: async () => {
  if (!isInitializing) {
    isInitializing = true;
    signerManager.onChange(onUserChange);    // register callback for signer state changes
    signerManager.restoreFromStorage();       // begin async restore
  }
}
```

### Phase 1: Instant — DeferredSigner (`src/common/signer/index.ts:51-62`)

```tsx
async restoreFromStorage() {
  const cachedUser = getUserDataFromLocalStorage();
  if (cachedUser) this.user = cachedUser.user;
  const keys = getKeysFromLocalStorage();

  // If we have a cached pubkey, immediately create a DeferredSigner
  if (keys?.pubkey) {
    deferredSigner = new DeferredSigner(keys.pubkey);
    this.signer = deferredSigner;
    this.notify();    // fires onUserChange → user is set → app starts rendering
  }
```

A `DeferredSigner` (`src/common/signer/DeferredSigner.ts`) implements the `NostrSigner` interface but queues all `signEvent()`, `nip44Encrypt()`, etc. calls in a promise. Once the real signer is ready, `deferredSigner.resolve(realSigner)` flushes the queue. This lets the app start fetching events immediately.

### Phase 2: Background — Real signer (`src/common/signer/index.ts:65-93`)

Tries each signer type in order:

```tsx
if (isNative) {
  const nsec = await getNsec();        // from Capacitor secure storage
  if (nsec) {
    await this.loginWithNsec(nsec);    // creates LocalSigner from private key
    restored = true;
  }
}
if (!restored && nip55Creds) {
  await this.loginWithNip55(nip55Creds.packageName, nip55Creds.pubkey);  // Android Amber
} else if (!restored && bunkerUri?.bunkerUri) {
  await this.loginWithNip46(bunkerUri.bunkerUri);  // Remote signer over relays
} else if (!restored && window.nostr && Object.keys(keys).length != 0) {
  await this.loginWithNip07();          // Browser extension (Nos2x, Alby, etc.)
} else if (!restored && keys?.pubkey && keys?.secret) {
  await this.loginWithGuestKey(keys.pubkey, keys.secret);  // Local keypair (guest)
}
```

After the real signer is created (`src/common/signer/index.ts:96-100`):
```tsx
if (deferredSigner && this.signer !== deferredSigner && this.signer) {
  deferredSigner.resolve(this.signer);  // all queued operations now execute with the real signer
}
this.notify();  // fires onUserChange again with the fully-resolved signer
```

### onUserChange callback (`src/stores/user.ts:65-97`)

Every time `signerManager.notify()` fires:

```tsx
const onUserChange = async () => {
  const cachedUser = signerManager.getUser();
  if (cachedUser) {
    useUser.setState({ isInitialized: true, user: cachedUser });

    if (currentUser?.pubkey !== cachedUser.pubkey) {
      // New user or first login in this session
      eventManager.resetPrivateEvents();      // clear stale private events

      fetchRelayList(cachedUser.pubkey).then((relays) => {
        if (relays.length > 0) useRelayStore.getState().setRelays(relays);
      });

      useCalendarLists.getState().loadCachedCalendars();    // load calendars from cache
      useInvitations.getState().loadCachedInvitations();      // load invitations from cache
    }
  } else {
    useUser.setState({ isInitialized: true, user: null });
  }
};
```

`fetchRelayList()` (`src/common/nostr.ts:691-703`) fetches the user's kind 10002 relay list event from default relays + signer relays. If found, the relay store is updated so subsequent subscriptions use the user's preferred relays.

---

## 6. Login Flow (New User)

### LoginModal (`src/components/LoginModal.tsx:307-411`)

Opened when `showLoginModal` is `true`. Shows different options depending on platform:

### Desktop (web browser)

**Option 1: NIP-07 Browser Extension** (`LoginModal.tsx:330-345`)

```tsx
const handleNip07 = async () => {
  if (window.nostr) {
    await signerManager.loginWithNip07();    // signer/index.ts:164-173
    onClose();
  }
};
```

`loginWithNip07()` (`src/common/signer/index.ts:164-173`):
1. Sets `this.signer = nip07Signer` (thin wrapper calling `window.nostr.signEvent()`, etc.)
2. Gets pubkey via `window.nostr.getPublicKey()`
3. Saves keys to localStorage: `setKeysInLocalStorage(pubkey)`
4. Fetches kind 0 profile: `this.saveUser(pubkey)` → `fetchUserProfile(pubkey)` from relays
5. Calls `this.notify()` → triggers `onUserChange` → app starts

**Option 2: NIP-46 Remote Signer** (`LoginModal.tsx:37-202`)

Two sub-tabs:
- **Manual paste**: User enters a `bunker://` URI → `signerManager.loginWithNip46(bunkerUri)` (`src/common/signer/index.ts:175-185`)
- **QR Code**: Generates a `nostrconnect://` URI containing the app's client pubkey + relay list + secret. Displays as QR code. When scanned by a signer app (e.g., nsecBunker), it initiates the NIP-46 handshake. Simultaneously calls `connectToBunkerUri()` to listen for the response.

`loginWithNip46()`:
1. Creates a NIP-46 signer via `createNip46Signer(bunkerUri)` → establishes relay connection + handshake
2. Gets pubkey from remote signer
3. Saves keys + bunker URI to localStorage
4. Fetches profile + notifies

### Android Native

**Option 1: NIP-55 Signer Apps** (`LoginModal.tsx:261-305`)

```tsx
// On mount, discovers installed signer apps
const installedSigners = await NostrSignerPlugin.getInstalledSignerApps();
// Renders a button for each app (e.g., Amber)
await signerManager.loginWithNip55(app.packageName);
```

`loginWithNip55()` (`src/common/signer/index.ts:187-201`):
1. Creates a NIP-55 signer → uses Android intents to communicate with the signer app
2. Requests pubkey from the signer app (skipped if cached)
3. Fetches kind 0 profile
4. Saves credentials to Capacitor secure storage

**Option 2: NIP-46** — same as desktop

> NIP-07 is hidden on native (`LoginModal.tsx:372`: `{!isNative && <LoginOptionButton ... />}`)

---

## 7. Post-Login: Data Fetching Pipeline

Once a user is logged in, the `Calendar` component (`src/components/Calendar.tsx:16-59`) orchestrates all data fetching.

### 7a. Public events (optional, sync)

```tsx
// Calendar.tsx:24-26
if (filters?.showPublicEvents && !isMobile) {
  events.fetchEvents();
}
```

Only when the "Show Public Events" filter is enabled (default: `false` at `src/stores/settings.ts:8`) and not on mobile. Calls `fetchCalendarEvents()` (`src/common/nostr.ts:559-575`):

```tsx
const filter: Filter = {
  kinds: [EventKinds.PublicCalendarEvent],  // 31923
  ...(since && { since }),                   // -14 days
  ...(until && { until }),                   // +28 days
};
return nostrRuntime.subscribe(relayList, [filter], { onEvent });
```

Each arriving event goes through `nostrEventToCalendar()` (`src/utils/parser.ts:4-82`), which maps Nostr tags to an `ICalendarEvent` object. The event is normalized (deduplicated by ID, newer versions replace older), saved to secure storage, and notifications are scheduled.

### 7b. Calendar lists + invitations (async, on user change)

```tsx
// Calendar.tsx:30-35
useEffect(() => {
  if (user) {
    useCalendarLists.getState().fetchCalendars();
    useInvitations.getState().fetchInvitations();
  }
}, [user]);
```

**fetchCalendars()** (`src/stores/calendarLists.ts:123-198`):

1. `nostrRuntime.fetchDeletionEvents(relays, userPubkey)` — fetches kind 5 events first so the EventStore knows to reject deleted calendars
2. Subscribes to kind 32123 authored by the user via `fetchCalendarLists()` (`src/common/calendarList.ts:169-191`)
3. Each arriving event is decrypted: `decryptCalendarList()` (`src/common/calendarList.ts:78-126`):
   - `signer.nip44Decrypt!(event.pubkey, event.content)` — self-decryption (encrypted with own pubkey)
   - Parses tags: title, content (description), color, and `"a"` tags (event references)
   - Returns an `ICalendarList` with `id`, `title`, `description`, `color`, `eventRefs[]`, `isVisible`
4. Merged with existing state (keeps newer versions)
5. On EOSE + 5s timeout: if no calendars found, auto-creates a default via `createDefaultCalendar()` (`src/common/calendarList.ts:217-227`)

**fetchInvitations()** — see Section 12.

### 7c. Private events (reactive, depends on calendars)

```tsx
// Calendar.tsx:40-44
useEffect(() => {
  if (user && calendarsLoaded && calendars.length > 0) {
    events.fetchPrivateEvents();
  }
}, [user, calendarsLoaded, calendars]);
```

This fires **after** calendars are loaded because private events are referenced inside calendar lists. The flow (`src/stores/events.ts:212-285`):

1. **Get visible refs**: `useCalendarLists.getState().getVisibleEventRefs()` (`src/stores/calendarLists.ts:321-324`) returns all event references from calendars where `isVisible === true`

2. **Parse each ref**: `parseEventRef(ref)` extracts:
   - `eventDTag` — the d-tag identifier of the event
   - `authorPubkey` — who created the event
   - `viewKey` — the NIP-44 decryption key (nsec-encoded)
   - `beginTimeSecs` / `endTimeSecs` — time boundaries
   - `isRecurring` — whether this is a recurring event

3. **Filter by time range** (`src/stores/events.ts:251-263`):
   - Non-recurring events: only fetch if `beginTimeSecs` is within -14/+28 days
   - Recurring events: **always fetch** because an old event with an rrule might have future occurrences

4. **Fetch from relays** (`src/common/nostr.ts:496-524`):
   ```tsx
   const filter: Filter = { kinds: [32678], "#d": eventIds, authors };
   const recurringFilter: Filter = { kinds: [32679], "#d": eventIds, authors };
   return nostrRuntime.subscribe(relayList, [filter, recurringFilter], { onEvent });
   ```

5. **Decrypt each event** (`src/stores/events.ts:271-283`):
   ```tsx
   const decrypted = viewPrivateEvent(event, meta.viewKey);
   processPrivateEvent(decrypted, timeRange, meta.viewKey, meta.calendarId);
   ```

   `viewPrivateEvent()` (`src/common/nostr.ts:479-490`):
   ```tsx
   const viewPrivateKey = nip19.decode(viewKey).data;
   const decryptedContent = nip44.decrypt(
     calendarEvent.content,
     nip44.getConversationKey(viewPrivateKey, getPublicKey(viewPrivateKey)),
   );
   return { ...calendarEvent, tags: JSON.parse(decryptedContent) };
   ```

6. **Process and store** (`src/stores/events.ts:92-138`):
   - Parse via `nostrEventToCalendar()` with `viewKey` and `isPrivateEvent: true`
   - Attach `calendarId` for color theming
   - Validate begin/end times
   - Deduplicate (keep newer `createdAt`)
   - Schedule local notifications on native
   - Save to secure storage

### Data flow summary

```
User Login
    │
    ├─→ fetchRelayList() ──→ sets user's preferred relays (kind 10002)
    ├─→ loadCachedCalendars() ──→ immediate display from secure storage
    ├─→ loadCachedEvents() ──→ immediate display from secure storage
    │
    ├─→ fetchCalendars() (kind 32123, self-decrypted)
    │       │
    │       └─→ calendars loaded ──→ fetchPrivateEvents()
    │                                   └─→ kind 32678/32679, decrypted with viewKey
    │
    ├─→ fetchInvitations() (kind 1052 gift wraps → unwrap → fetch event)
    │
    └─→ fetchEvents() (kind 31923, if public filter enabled)
```

---

## 8. Routing and Navigation

Routes defined in `src/components/Routing.tsx:9-24`:

```tsx
<Routes>
  <Route path="/event/:naddr"                element={<ViewEventPage />} />
  <Route path="/notification-event/:eventId" element={<NotificationEventPage />} />
  <Route path="/notifications"               element={<InvitationPanel />} />
  <Route path="/w/:year/:weekNumber"         element={<Calendar />} />
  <Route path="/m/:year/:monthNumber"        element={<Calendar />} />
  <Route path="/d/:year/:month/:day"         element={<Calendar />} />
  <Route path="*"                            element={<Index />} />
</Routes>
```

| Route | Component | Purpose |
|-------|-----------|---------|
| `/event/:naddr` | `ViewEventPage` | View a single event via Nostr address |
| `/notification-event/:eventId` | `NotificationEventPage` | Deep link from notification tap |
| `/notifications` | `InvitationPanel` | Pending invitations list |
| `/w/:year/:weekNumber` | `Calendar` | Week view |
| `/m/:year/:monthNumber` | `Calendar` | Month view |
| `/d/:year/:month/:day` | `Calendar` | Day view |
| `*` | `Index` | Catch-all redirect |

### Index redirect (`src/components/Index.tsx:9-23`)

```tsx
const year = dayjs().get("year");
const weekNumber = dayjs().week();
navigate(ROUTES.WeekCalendar.replace(":year", year).replace(":weekNumber", weekNumber), { replace: true });
```

On any unknown route, immediately redirects to the current week's calendar view.

### Layout detection (`src/hooks/useLayout.ts:6-25`)

The current layout is derived from the URL prefix:
- `/m...` → `"month"`
- `/d...` → `"day"`
- anything else → `"week"`

`updateLayout()` converts the current date to the new layout's route format and navigates.

### Date with routing (`src/hooks/useDateWithRouting.ts`)

The `useDateWithRouting` hook reads the current date from URL params and provides a `setDate(newDate, layout)` function that navigates to the corresponding route.

---

## 9. Calendar View Rendering

The `Calendar` component (`src/components/Calendar.tsx:48-58`) renders:

```tsx
<CalendarHeader />
{layout === "day"   && <SwipeableView View={DayView} events={events.events} />}
{layout === "week"  && <SwipeableView View={WeekView} events={events.events} />}
{layout === "month" && <MonthView events={events.events} />}
```

### CalendarHeader (`src/components/CalendarHeader.tsx:31-159`)

- **Desktop only**: Hamburger menu (opens sidebar drawer), left/right arrows for date navigation
- **Both**: Date range label (e.g., "01-07 Mar 25"), notification bell with badge, "Today" button, layout switcher dropdown
- The notification bell (`CalendarHeader.tsx:88-101`) shows `unreadCount` from the invitations store
- Layout switcher dropdown: Day / Week / Month options → calls `updateLayout()` which navigates to the new route

### SwipeableView (`src/components/SwipeableView.tsx:33-89`)

```tsx
// SwipeableView.tsx:42-44
if (!isMobile) {
  return <View events={events} date={date} />;    // Desktop: render directly
}
```

On mobile, wraps the view in a `framer-motion` `<motion.div>` with `drag="x"`:
- Swipe left (offset < -50px) → `setDate(date.add(1, layout))` — next period
- Swipe right (offset > 50px) → `setDate(date.subtract(1, layout))` — previous period
- Uses `AnimatePresence` for slide-in/slide-out transitions (0.25s tween)

### WeekView (`src/components/WeekView.tsx:56-146`)

1. Calculates 7 days from start of week: `Array.from({ length: 7 }, (_, i) => start.add(i, "day"))`
2. For each day, filters events: `events.filter(e => isEventInDateRange(e, dayStart, dayEnd))`
   - `isEventInDateRange()` (`src/utils/repeatingEventsHelper.ts`) handles recurring events by expanding rrules
3. Lays out events: `layoutDayEvents()` (`src/common/calendarEngine.ts:20-60`):
   - Sorts by start time
   - Places into non-overlapping columns (greedy algorithm)
   - Calculates `top` = minutes from midnight, `height` = duration * PX_PER_MINUTE
4. Renders hour grid (24 rows of 60px each) with `<Divider>` per hour
5. Renders `<CalendarEventCard>` absolutely positioned based on `top`, `col`, `colSpan`
6. Shows `<TimeMarker>` (a red line indicating current time)
7. Clicking empty space → `getTimeFromCell()` calculates clicked date/time → opens `CalendarEventEdit` in create mode

### DayView (`src/components/DayView.tsx:19-90`)

Same as WeekView but for a single day. Shows time column on left (60px wide), events positioned in the remaining space.

### MonthView

Renders a month grid with events in cells.

---

## 10. Event Creation Flow

Triggered by clicking an empty time slot in any view. Opens `CalendarEventEdit` dialog (`src/components/CalendarEventEdit.tsx:59-457`).

### Form fields

- **Title** (required) — `TextField`
- **Image URL** — optional `TextField`
- **Start / End DateTime** — MUI `DateTimePicker` components
- **Location** — comma-separated text
- **Recurrence** — dropdown: None / Daily / Weekly / Weekdays / Monthly / Quarterly / Yearly → converted to RRULE string via `frequencyToRRule()` (`src/utils/repeatingEventsHelper.ts`)
- **Participants** — `ParticipantAdd` component: enter npub/hex pubkey → resolves NIP-05 addresses
- **Description** — multi-line `TextField`
- **Calendar selector** — for private events: dropdown of user's calendars with color dots
- **Privacy toggle** — "Private" (default, encrypted) or "Public" (plaintext)

### Save flow (`CalendarEventEdit.tsx:124-145`)

```tsx
const handleSave = async () => {
  setProcessing(true);
  const eventToSave = { ...eventDetails, isPrivateEvent: isPrivate };
  if (isPrivate) {
    await publishPrivateCalendarEvent(eventToSave, selectedCalendarId);
  } else {
    await publishPublicCalendarEvent(eventToSave);
  }
  onClose();
};
```

### Private event publish (`src/common/nostr.ts:219-322`)

Step by step:

1. **Generate view key**: `const viewSecretKey = generateSecretKey()` — random 32-byte key
2. **Generate event ID**: `const uniqueCalId = uuid()` — random UUID for the d-tag
3. **Determine kind**: `32679` if recurring (has rrule), `32678` otherwise
4. **Build event data** as tag arrays: `["title", title], ["description", description], ["start", start/1000], ["end", end/1000], ...`
5. **Encrypt**: `nip44.encrypt(JSON.stringify(eventData), nip44.getConversationKey(viewSecretKey, viewPublicKey))`
6. **Build unsigned event**: kind 32678/32679, encrypted content, tags: `[["d", uniqueCalId]]`
7. **Sign**: `signer.signEvent(unsignedCalendarEvent)`
8. **Publish**: `publishToRelays(signedEvent)` → connects to each relay, publishes, closes
9. **Gift-wrap for each participant** (+ creator):
   ```tsx
   const giftWrap = await nip59.wrapEvent({
     pubkey: userPublicKey,
     kind: EventKinds.CalendarEventRumor,  // 52
     tags: [
       ["a", `${eventKind}:${participant}:${uniqueCalId}`],
       ["viewKey", nip19.nsecEncode(viewSecretKey)],
     ],
   }, participant, EventKinds.CalendarEventGiftWrap);  // 1052
   ```
   The gift wrap uses NIP-59's three-layer scheme (rumor → seal → wrap).
10. **Publish all gift wraps** in parallel
11. **Add event reference to calendar**: `buildEventRef({...})` → `addEventToCalendar(calendarId, eventRef)` → this re-encrypts and republishes the calendar list

### Public event publish (`src/common/nostr.ts:577-615`)

Much simpler:
1. Build kind 31923 event with plaintext tags: `["name", title], ["d", id], ["start", ...], ["end", ...], ["p", participant], ...`
2. Content = description (plaintext)
3. Sign and publish

---

## 11. Event Viewing Flow

### From the calendar grid (clicking an event card)

`CalendarEventCard` (`src/components/CalendarEvent.tsx:88-173`):

1. Clicking the card sets `open = true` → renders a `Dialog`
2. Card color is determined by `getColorScheme()` (`CalendarEvent.tsx:53-86`):
   - Invitation: grey `#e0e0e0` + dashed border
   - Private with calendar color: `alpha(calendarColor, 0.7)`
   - Private without calendar: primary light
   - Public: `alpha(primary, 0.3)`
3. Dialog title shows event title + action buttons
4. Action buttons (`CalendarEvent.tsx:175-224`):
   - **Copy link** (desktop only) — encodes event as `naddr` + optional `viewKey` query param, copies URL
   - **Open in new tab** (desktop only) — links to `/event/:naddr?viewKey=...`
   - **Download .ics** (non-native only) — `exportICS()` generates ICS content and triggers download
   - **Close** button
5. Dialog body renders `CalendarEvent` component: time, description (Markdown via `react-markdown` + `remark-gfm`), location, participants (resolved via `Participant` component)

### From URL (`/event/:naddr`)

`ViewEventPage` (`src/components/ViewEventPage.tsx:111-168`):

```tsx
const { naddr } = useParams<{ naddr: string }>();
const viewKey = queryParams.get("viewKey");

fetchCalendarEvent(naddr as NAddr).then((event) => {
  if (viewKey) {
    const privateEvent = viewPrivateEvent(event, viewKey);
    parsedEvent = nostrEventToCalendar(privateEvent, { viewKey, isPrivateEvent: true });
  } else {
    parsedEvent = nostrEventToCalendar(event);
  }
});
```

1. Decodes the `naddr` to get `{pubkey, identifier, kind, relays}`
2. Fetches the event via `nostrRuntime.fetchOne()`
3. If `viewKey` in URL: decrypts → parses. Otherwise: parses as public event
4. Renders `EventRenderer` with title, time, participants, image, Markdown description

### From notification tap (`/notification-event/:eventId`)

The `NotificationEventPage` handles deep links from local notification clicks on native.

---

## 12. Invitation / Notification System

### How invitations are created

When a private event is published with participants (Section 10), each participant receives a **gift wrap** (kind 1052). Inside the gift wrap is an encrypted **rumor** (kind 52) containing:
- `["a", "{kind}:{pubkey}:{d-tag}"]` — reference to the encrypted event
- `["viewKey", "{nsec-encoded-view-key}"]` — key needed to decrypt the event

### Fetching invitations (`src/stores/invitations.ts:86-158`)

```tsx
invitationSubHandle = fetchCalendarGiftWraps(
  { participants: [userPubkey], limit: 50 },
  async (rumor) => {
    if (existingEventIds.has(rumor.eventId)) return;   // already in a calendar
    if (processedIds.has(rumor.eventId)) return;        // already processed
    // Fetch and decrypt the actual event...
    invitation.event = { ...parsed, isInvitation: true };
    // Add to store
  },
);
```

`fetchCalendarGiftWraps()` (`src/common/nostr.ts:348-377`):
1. Subscribes to kind 1052 events tagged with user's pubkey
2. For each gift wrap: `getDetailsFromGiftWrap()` → `nip59.unwrapEvent()` → extracts `eventId` and `viewKey`
3. Back in the store: fetches the event by d-tag, decrypts with viewKey, parses, adds to invitations list

### Invitation Panel (`src/components/InvitationPanel.tsx:30-153`)

Shows pending invitations as cards with:
- Event title, time, description preview
- **"Add to Calendar"** button → opens `AddToCalendarDialog` (choose which calendar)
- **"Dismiss"** button → marks as dismissed

### Accepting an invitation (`src/stores/invitations.ts:165-201`)

```tsx
acceptInvitation: async (giftWrapId, calendarId) => {
  // Build event reference
  const eventRef = buildEventRef({ kind, authorPubkey, eventDTag, viewKey, beginTimeSecs, endTimeSecs, isRecurring });
  // Add to the selected calendar
  await useCalendarLists.getState().addEventToCalendar(calendarId, eventRef);
  // Remove from invitations
};
```

This re-encrypts and republishes the calendar list with the new event reference.

### Native local notifications (`src/utils/notifications.ts:57-143`)

On native, `scheduleEventNotifications()` is called whenever an event is added to the store:

```tsx
if (!isNative) return;    // web: no-op

// For non-repeating: skip if started or >2 days away
// For recurring: find next occurrence within 2 days via rrule

// Schedule two notifications:
// 1. "Upcoming: {title}" — 10 minutes before
// 2. "{title} - Starting now" — at event time

await LocalNotifications.schedule({ notifications });
```

Notifications are deduplicated by `notificationKey` (eventId + occurrence start time for recurring events) stored in a `Set`. On app restart, `initScheduledIds()` reloads pending notification IDs.

---

## 13. Calendar List Management

Calendar lists are kind 32123 parameterized replaceable events. The content is self-encrypted with NIP-44 (encrypted to the user's own pubkey).

### CalendarSidebar (`src/components/CalendarSidebar.tsx:37-175`)

Opens from the hamburger menu (desktop only). Contains:
1. **DatePicker** — mini calendar for quick date navigation
2. **Calendar list** — each calendar shows:
   - Checkbox (toggle visibility) — calls `toggleVisibility(calendarId)` (`src/stores/calendarLists.ts:261-277`)
   - Color dot + title — clicking opens `CalendarManageDialog`
3. **"+" button** — create new calendar
4. **Filters** (desktop only) — "Show Public Events" toggle

### Creating a calendar

`CalendarSidebar.tsx:49-68` → `createCalendar()` (`src/stores/calendarLists.ts:203-219`):
1. Generates ID from sha256 hash of the title (first 30 hex chars)
2. Calls `publishCalendarList()` (`src/common/calendarList.ts:135-159`):
   - Encrypts tags with `encryptCalendarList()` → `signer.nip44Encrypt!(userPubkey, JSON.stringify(tags))`
   - Signs as kind 32123 with `["d", calendarId]` tag
   - Publishes to relays
3. Adds to local state and secure storage

### Visibility toggling

Toggling a calendar's checkbox calls `toggleVisibility()` which:
1. Flips `isVisible` on the calendar
2. Saves visibility state to separate secure storage key
3. The `Calendar` component's effect re-runs because `calendars` changed → `fetchPrivateEvents()` is called again, now filtering by the updated visible calendars

---

## 14. Mobile vs Desktop Differences

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Default layout | Week (`src/stores/settings.ts:15`) | Day (`src/stores/settings.ts:20-22`) |
| Swipe navigation | Disabled (`SwipeableView.tsx:42-44`) | Enabled (framer-motion drag) |
| Public events filter | Available in sidebar | Hidden |
| Nav arrows in header | Shown | Hidden (`CalendarHeader.tsx:63-74`) |
| .ics download | Available | Hidden on native (`CalendarEvent.tsx:212-218`) |
| Copy link / Open in new tab | Available | Hidden (`CalendarEvent.tsx:196-209`) |
| Login options | NIP-07 + NIP-46 | NIP-55 (Android) + NIP-46 |
| Back button | Browser default | Capacitor handler (`App.tsx:62-82`) |
| Secure storage (caching) | No-op (`localStorage.ts:28`) | Capacitor Preferences |
| Local notifications | No-op (`notifications.ts:60`) | Capacitor LocalNotifications |
| Event edit dialog | Regular dialog | Full-screen dialog |
| Relay manager dialog | Regular dialog | Full-screen dialog |

### Platform detection

- `isNative` = `Capacitor.isNativePlatform()` (`src/utils/platform.ts:4`)
- `isAndroidNative()` = `Capacitor.getPlatform() === "android"` (`src/utils/platform.ts:6-8`)
- `isMobile` (CSS) = `window.innerWidth <= 800 && window.innerHeight <= 1000` (`src/common/utils.ts:88`)
- MUI responsive = `useMediaQuery(theme.breakpoints.down("sm"))` (used throughout)

---

## 15. Relay Management

### Default relays (`src/common/nostr.ts:33-42`)

```tsx
export const defaultRelays = [
  "wss://relay.damus.io/", "wss://relay.primal.net/", "wss://nos.lol",
  "wss://relay.nostr.wirednet.jp/", "wss://nostr-01.yakihonne.com",
  "wss://relay.snort.social", "wss://relay.nostr.band", "wss://nostr21.com",
];
```

### Relay resolution (`src/common/nostr.ts:49-52`)

```tsx
export const getRelays = (): string[] => {
  const userRelays = useRelayStore.getState().relays;
  return userRelays.length > 0 ? userRelays : defaultRelays;
};
```

User's custom relay list takes full precedence over defaults.

### How user relays are set

1. **On login**: `fetchRelayList(pubkey)` (`src/common/nostr.ts:691-703`) fetches kind 10002 from relays
2. **Manually**: `RelayManager` dialog (`src/components/RelayManager.tsx:27-263`):
   - Add/remove relays, reset to defaults
   - Save → `useRelayStore.setRelays(localRelays)` + `publishRelayList(localRelays)` (kind 10002)

### NostrRuntime — the communication layer (`src/common/nostrRuntime/index.ts`)

All relay communication goes through a global singleton (`line 384: export const nostrRuntime = createNostrRuntime(new SimplePool())`):

- **SimplePool** (from nostr-tools) — manages WebSocket connections to relays
- **EventStore** — in-memory storage with indexes by ID, kind, pubkey, and d-tag. Handles kind 5 deletion event enforcement
- **SubscriptionManager** — deduplicates subscriptions with identical filters + relays. Reference counts subscriptions for cleanup
- **subscribe()** (`line 92-142`) — first delivers cached events from EventStore, then opens a network subscription
- **fetchOne()** / **querySync()** — one-shot queries with 10s timeout fallback
- **fetchBatched()** — batches multiple `fetchOne()` calls made within 50ms into a single relay query (reduces round-trips)

---

## 16. Logout Flow

Triggered from `Auth` component → "Logout" menu item → calls `useUser.getState().logout()`.

`src/stores/user.ts:45-54`:

```tsx
logout: async () => {
  signerManager.logout();                                    // 1. Clear signer + credentials
  cancelAllNotifications();                                   // 2. Cancel all native notifications
  useRelayStore.getState().resetRelays();                     // 3. Clear relay cache
  await useTimeBasedEvents.getState().clearCachedEvents();   // 4. Clear event cache
  await useCalendarLists.getState().clearCachedCalendars();  // 5. Clear calendar cache
  await useInvitations.getState().clearCachedInvitations();  // 6. Clear invitation cache
  set({ user: null });                                        // 7. Clear user state
  localStorage.removeItem(USER_STORAGE_KEY);                  // 8. Remove user from localStorage
}
```

`signerManager.logout()` (`src/common/signer/index.ts:203-216`) removes:
- nsec from Capacitor secure storage
- Keys from localStorage
- Bunker URI from localStorage
- App secret key from localStorage
- User data from localStorage
- NIP-55 credentials from Capacitor secure storage

After logout, `onUserChange` fires with `user = null` → `isInitialized = true` → mode selection modal shows on next render.

---

## 17. Nostr Event Kinds Reference

Defined in `src/common/EventConfigs.ts:1-24`:

| Kind | Name | Purpose |
|------|------|---------|
| 0 | UserProfile | User metadata (name, picture, about) |
| 5 | DeletionEvent | NIP-09 deletion requests |
| 52 | CalendarEventRumor | Rumor inside gift wrap (event ref + viewKey) |
| 55 | RSVPRumor | Rumor inside RSVP gift wrap |
| 1052 | CalendarEventGiftWrap | NIP-59 gift wrap for event invitations |
| 1055 | RSVPGiftWrap | Gift wrap for RSVP responses |
| 10002 | RelayList | NIP-65 user relay list |
| 31923 | PublicCalendarEvent | Public calendar event (plaintext, NIP-52) |
| 31925 | PublicRSVPEvent | Public RSVP response |
| 32069 | PrivateRSVPEvent | Encrypted RSVP response |
| 32123 | PrivateCalendarList | Encrypted calendar collection (self-encrypted) |
| 32678 | PrivateCalendarEvent | Encrypted one-time calendar event |
| 32679 | PrivateCalendarRecurringEvent | Encrypted recurring calendar event |
