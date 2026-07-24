# Redesign Progress

Tracker for [REDESIGN_MASTER_PLAN.md](REDESIGN_MASTER_PLAN.md). Update at the end of every session.

| Phase                         | Status                       | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0 — Safety net          | done                         | 2026-07-19 | Baseline recorded, one fragile selector hardened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Phase 1 — Theme & tokens      | done                         | 2026-07-19 | `src/theme/` built, old `src/theme.ts` deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Phase 2 — Shell & primitives  | done                         | 2026-07-19 | `AppShell`/`TopBar`/`Sidebar`/`MobileTabBar` built, `Header`/`CalendarSidebar`/`CalendarHeader`/`TempThemeToggle` deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Phase 3 — Nostr consolidation | done                         | 2026-07-20 | `src/nostr/` built, `common/{nostr,nip59,EventConfigs,calendarList}.ts` deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F-VIEWS                       | done                         | 2026-07-20 | Month/Week/Day restyled on tokens + EventChip; quick-peek popover + day-agenda overflow added; mobile month dots+vaul sheet; drag-to-move deferred                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F-EVENT-VIEW                  | done                         | 2026-07-21 | Decomposed into `src/features/event-view/`, full RSVP UI, lazy participant/profile loading, delete/duplicate restyle. **Design-fidelity pass 2026-07-21**: exact match to mockups 02/12, full-detail sections ported from 20/21 (banner, chips, location card, host row, add-to-calendar), mobile quick-peek removed in favor of the full bottom sheet                                                                                                                                                                                                                                                                                                 |
| F-EVENT-EDIT                  | done                         | 2026-07-24 | Decomposed into `src/features/event-editor/`, exact match to mockups 05/11 (desktop modal / mobile sheet) per the approved deviation list. Nostr layer (NIP-17 invitation rumors, `signing_nsec`, `k=1052` wrap tag) was already on the branch prior to this session; `event-crud`, `event-edit`, and all recurrence specs validated green in the F-SET full-suite pass (`event-participants` remains the longstanding fixme)                                                                                                                                                                                                                               |
| F-LOGIN                       | in progress                  | 2026-07-24 | Rebuilt auth presentation and added `key.txt` ncryptsec backup/import; all current auth specs validated green in the F-SET full-suite pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F-SET                         | done                         | 2026-07-24 | General, Calendars placeholder, and Relays & Sync shipped as routed responsive sections; general preferences sync through self-encrypted NIP-78 kind 30078 and are applied throughout calendar views/editor defaults                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F-NOTIF                       | unblocked (0–3 done)         |            | nostr inputs: not provided (1052→1059 decision); "Message host" stays unbuilt until this is resolved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F-CAL-MGMT                    | unblocked (0–3 done)         |            | nostr inputs: not provided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F-BOOK-EDIT                   | unblocked (0–3 done)         |            | nostr inputs: not provided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F-BOOK-INBOX                  | unblocked (0–3 done)         |            | nostr inputs: not provided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F-BOOK-PUBLIC                 | unblocked (0–3 done)         |            | nostr inputs: not provided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F-EVENT-LINK                  | mostly done via F-EVENT-VIEW | 2026-07-21 | `ViewEventPage` shares `CalendarEventView`, so the 2026-07-21 design-fidelity pass carried its banner/chips/sections styling here too (user's explicit choice). Still open: guest/unauthenticated RSVP nostr-layer decision, "Message host", any F-EVENT-LINK-specific polish beyond what F-EVENT-VIEW needed                                                                                                                                                                                                                                                                                                                                          |

## Session log

<!-- newest first: date — phase — what was done — e2e status -->

- 2026-07-24 — F-SET — Replaced the `/settings` placeholder with the scoped
  Settings surface and deliberately omitted every section the master-plan
  scope says to nuke (Appearance, Notifications, Booking pages,
  Import/export, shortcuts, account/about). The resulting feature lives in
  `src/features/settings/` and has independent routes for
  `/settings/general`, `/settings/calendars`, and `/settings/relays`.
  Desktop uses the persistent settings rail; mobile uses a collapsible
  section panel with the same dropdown-based controls (no iOS-style rows).
  The Calendars section is intentionally empty for its later phase.
  - **NIP-78 sync:** added kind `30078` application-specific data support in
    `src/nostr/settings.ts`. General settings publish as a parameterized
    replaceable event with `d=calendar/general_settings` and NIP-44
    self-encrypted JSON content. Login initialization fetches/decrypts the
    newest event and applies it over defaults; missing/invalid/unavailable
    remote state leaves local defaults active. Writes are serialized so rapid
    changes preserve last-write order. The exact payload and local-only
    exclusions are documented in `PROTOCOL.md`.
  - **General behavior:** implemented week start (Monday/Sunday/Saturday),
    12/24-hour time, default calendar, event duration (25/30/55/60 minutes),
    default reminder, and working-hours start/end. Week start now drives
    month/week grid boundaries, headers, top-bar ranges, and native-device
    fetch windows. Time format drives hour gutters, event chips/details, and
    event-editor time fields. Working hours shade out-of-hours rows. New
    events inherit the configured calendar, duration, and reminder. The last
    calendar layout accessed remains local-only and is used by `/` on the
    next visit, per scope.
  - **Relay move:** deleted the global `RelayManager` dialog and moved its
    add/remove/validate/reset/save/publish behavior inline to Relays & Sync.
    The user-menu Relays item and event-editor antenna now navigate to that
    route. Existing NIP-65 relay publishing behavior is unchanged.
  - **E2E/API maintenance:** migrated `relay-manager.spec.ts` to the routed
    surface; added isolated-user general-settings coverage (including NIP-78
    reload persistence and event defaults) plus mobile collapse/navigation
    coverage. Hardened the redesigned auth helper/copy label, month
    navigation's rapid-click assertion, and a case-sensitive scheduling
    selector exposed by parallel full-suite execution.
  - `pnpm` was unavailable in this environment, so equivalent local binaries
    were used: `tsc --noEmit -p tsconfig.app.json` and `eslint . --quiet` are
    clean; Vite production/test build is clean apart from the existing
    chunk-size advisory. Full Playwright suite: **48 passed, 1 skipped**
    (the existing `event-participants` fixme), zero failures.

- 2026-07-24 — F-EVENT-EDIT — UI rebuild against mockups `05-event-create-modal`
  (desktop) and `11-mobile-event-create` (mobile), decoded via the
  `__bundler/template` JSON-decode technique (now documented in
  `REDESIGN_MASTER_PLAN.md` §8 guardrail 7, added this session as Step 0).
  Nostr-layer work (NIP-17 invitation rumors, `signing_nsec` rumor tag,
  `k=1052` wrap tag, `docs/refactor-calendar-event-edit.md`'s decomposition)
  was already present on the branch as an uncommitted diff before this
  session started — this session touched UI only, confirmed no wire-format
  changes were made.
  - **New `src/features/event-editor/`**: `EventEditor.tsx` (composition
    root — all state/hooks moved verbatim from the 1808-line
    `CalendarEventEdit.tsx`, plus new `allDay` state/handlers and the
    mobile/desktop presenter + Dialog/BottomSheet/page chrome switch). First
    cut landed at 596 lines (over the file-size guardrail's 500-line hard
    alarm) because it also carried the full recurrence and all-day/date-time
    state machines inline; split those into `hooks/useRecurrenceState.ts`
    and `hooks/useEventDateTime.ts` (pure logic, no JSX) before finishing
    the session, bringing the composition root to 403 lines — still above
    the ~300 target (inherent to fanning out one `EventEditFormProps` object
    to two large presenter trees plus the Dialog/BottomSheet/page chrome
    decision) but comfortably under the hard alarm.
    `components/{EventEditHeaderDesktop,EventEditHeaderMobile,
EventEditDesktopForm,EventEditMobileForm,EventEditFooter,WhenFields,
CalendarLocationGroup,EventAttachmentsSection,EventNotesSection,
EventNotificationsSection,styled,types}.tsx`,
    `hooks/{useEventSave,useRelayPublishStatus}.ts` (moved from `src/hooks/`,
    only consumer). `src/components/CalendarEventEdit.tsx` is now a 1-line
    re-export shim, so `WeekView`/`DayView`/`AppShell`/`ICSListener`/
    `EditEventPage`/`DuplicateEventPage` needed no import changes (same
    pattern F-EVENT-VIEW used). Deleted the now-unused
    `EventAttributeEditContainer` from `StyledComponents.tsx` (confirmed via
    grep it had no other consumer).
  - **Approved deviations from the literal mockups** (full list + rationale
    in the kickoff plan, `/home/rama/.claude/plans/magical-leaping-coral.md`):
    skip AI-detection hint + Timezone field (auto-detected, no UI); no
    Public/Private toggle (lock/Private indicator only rendered when
    `isPrivate` is actually true, so legacy public events don't lie about
    it); mobile Notes section added (mockup omits it); no file-attachment
    dropzone on either platform (Formstr-form-link attach only — the
    mockup's "Saved forms" quick-picker has no real data source anywhere in
    the app, dropped per guardrail 1); mobile Invitees is its own group
    section reusing `EventParticipants`; mobile Location is a tap-to-edit
    row inside the Calendar group; Calendar stays `CalendarListSelect`
    restyled as a pill trigger (desktop) / row (mobile); **"All day" is a
    real UI toggle** (confirmed with the user this session — see below);
    Notifications gets its own section on both platforms; Image URL kept
    under the title on both platforms; relay footer restyled but all
    existing functionality (retry, partial-publish note, error snackbar)
    preserved; mobile modal header adopts Cancel/title+lock/Save in the
    header bar, desktop and both platforms' `display="page"` keep
    back-arrow-header + bottom-action-row; mobile modal switched from
    `Dialog fullScreen` to `BottomSheet` (vaul).
  - **"All day" toggle mechanics** (deviation confirmed at kickoff: skip the
    mockup's separate "different end date" toggle, keep always-visible
    start **and** end date pickers on both platforms — more capable than
    the mockup's toggle-gated single date, zero regression risk): toggling
    on snaps `begin`→start of the selected day and `end`→start of the day
    after the selected end date, remembering the pre-toggle times in a ref
    so toggling off restores them (or a 09:00–10:00 default if there were
    none, e.g. a fresh page load). Initial state on edit is derived via
    the existing `isAllDayEvent(initialEvent.begin, initialEvent.end)`
    (built in a prior session); "More options" also auto-opens on load
    when the initial event is all-day or has a custom recurrence rule, so
    the active advanced settings aren't hidden by default. Storage shape is
    unchanged — `useEventSave` already recomputes `allDay` from `begin`/`end`
    at save time, untouched this session. Verified live: create → toggle
    all-day on → save → shows as a single-day all-day chip on the correct
    day (F-VIEWS' existing `AllDayEventChip`, already wired to
    `isAllDayEvent`, needed no changes) → re-open for edit → toggle
    correctly re-derives `true` and un-collapses More Options → toggle off
    → restores sensible default times.
  - **RecurrenceSelector restyle** (`src/components/RecurrenceSelector.tsx`,
    only consumer is this feature): added a `section?: "trigger" | "details"
| "full"` prop so the compact frequency pill (main WHEN row,
    `data-testid="recurrence-select"` preserved) and the
    custom-rule-summary/end-mode sub-controls (inside "More options",
    `data-testid="recurrence-end-mode"` preserved) can be placed in two
    different regions of the new layout while sharing one set of
    state/handlers — explicitly sanctioned by the kickoff plan's "pill-
    styled wrapper props" allowance, no behavior change, verified live via
    the Custom Rule flow (opens `CustomRecurrenceDialog`, applies, shows
    "Every week on Monday" pill + summary/edit-link in More Options).
  - **CalendarListSelect restyle** (`src/components/CalendarListSelect.tsx`,
    5 other call sites untouched — new `variant` prop is opt-in, default
    unset preserves their exact prior look): added `variant?: "pill" | "row"`
    for the desktop pill (next to Repeat) and mobile group-row placements.
  - **Bug found and fixed during live QA** (not present before this
    session): the desktop/mobile calendar-pill refactor above initially
    extracted the shared `<MenuItem>` list into a `<>...</>` Fragment
    variable reused across the three `<Select>` render branches — MUI's
    `Select`/`Menu` only recognize direct `MenuItem` children and silently
    treat a Fragment as one opaque, unrecognized child ("MUI: The Select
    component doesn't accept a Fragment as a child" console warning), which
    broke the calendar dropdown's option list and threw an "out-of-range
    value" warning for the selected calendar. Fixed by making `menuItems` a
    plain keyed array instead of a Fragment (MUI's own suggested fix).
    Caught by driving the real app via `agent-browser`, not by
    typecheck/lint (both clean throughout, since this is a runtime-only
    React children shape issue) — reinforces the standing lesson from prior
    sessions that live manual QA catches a different class of bug than
    static checks.
  - New dictionary keys, `en-US` only (`event.when/people/where/notesLabel/
allDay/showAs/busy/free/attachmentsToggle/save/invitees/repeatLabel/
dateLabel/startsLabel/endsLabel/endsOnLabel`).
  - F-EVENT-EDIT's design note "all-day events get a chip at the top of
    week/day view" was already implemented in the F-VIEWS session
    (`AllDayEventChip`, wired to `isAllDayEvent`) — confirmed via grep,
    no work needed this session.
  - `pnpm typecheck`: clean. `pnpm lint`: 0 errors, 9 warnings — same
    pre-existing warnings as prior sessions (`App.tsx`,
    `DuplicateEventPage.tsx`, `EditEventPage.tsx`, `Index.tsx`,
    `data/fakeEvents.ts`, `hooks/useEventRsvps.ts`, `utils/rsvpHelpers.ts`)
    plus one pre-existing `calendars` exhaustive-deps warning moved verbatim
    from the old `CalendarEventEdit.tsx` into `EventEditor.tsx` (not a new
    regression — same code, same warning, just a new file location).
  - **`pnpm test:e2e` not run** (explicit scope skip, per this session's
    instructions). `event-crud.spec.ts`, `event-edit.spec.ts`,
    `event-recurrence.spec.ts`, `event-participants.spec.ts` are expected to
    have broken selectors — mobile no longer uses a `Dialog fullScreen`
    (now `BottomSheet`), the mobile header moved Cancel/Save into the header
    bar instead of a bottom action row, and several role/text selectors
    around the WHEN section changed shape (date+time split into separate
    pickers, Repeat/Calendar became pills). A follow-up e2e-fix session
    should diff against this entry's actual DOM (not guess) per guardrail 2.
    E2E-contract testids preserved: `event-title`, `event-start-time` (now on
    the begin-time `TimePicker`'s input), `calendar-list-select` + "Add new
    calendar" menu item, `recurrence-select` + `recurrence-end-mode`,
    "Enter participant nPub" placeholder, "Save Event" text (desktop) — note
    mobile's compact header button now reads "Save" (new `event.save` key,
    space-constrained), not "Save Event".
  - **Manually verified live** via `run-app` skill + `agent-browser` against
    `pnpm dev`: desktop create (title/image/WHEN row/People/Where/
    Attachments/Notes/Notifications/footer all render and scroll correctly),
    all-day toggle on/off round-trip (see above), custom recurrence dialog
    end-to-end, calendar pill dropdown (post-fix), full edit round-trip via
    `display="page"` (`EditEventPage`, back-arrow header, More Options
    auto-expanded, All-day pre-checked), mobile create via `BottomSheet`
    (header Cancel/title+lock/Save, all group cards, location tap-to-edit
    commit-on-blur, calendar row dropdown, save-and-close), and both
    platforms in light **and** dark mode (desktop + mobile create dialogs
    screenshotted in dark, tokens read correctly with no hardcoded-color
    contrast issues). Not exercised live: relay-retry-after-failure (no way
    to force a relay failure in this sandboxed setup) and the
    Formstr-form-attach-link flow (component internals unchanged from the
    working original, chrome-only restyle, lower risk).

- 2026-07-21 — F-EVENT-VIEW design-fidelity pass — Closed the gap between the
  prior session's structural decomposition and the actual mockups. Scope:
  exact match to `02-month-interactions` (desktop quick-peek) and
  `12-mobile-event-details` (mobile full sheet), full-detail sections ported
  from `20-event-link-desktop`/`21-event-link-mobile`, mobile quick-peek
  removed entirely in favor of opening the full sheet directly. **Confirmed
  deviations** (user-approved, all intentional): location shown as a plain
  string (no map thumbnail/geocoding — `EventLocationCard` adds a
  maps-search "Directions" link built from the text, not a resolved
  address), no timezone label anywhere (already implicit — `TimeRenderer`
  only ever formatted in local time), description kept in its existing
  Markdown rendering (not in any of the four mockups, retained anyway),
  relay/publish-status footer removed (`EventRsvpSection`'s
  `RelayStatusDots` block deleted), and the mockups' "Message [host]"
  button omitted entirely — there is no DM/messaging feature anywhere in
  this codebase (no NIP-17 send flow), and F-NOTIF's gift-wrap kind
  decision is still unresolved, so a real button would need protocol
  work out of scope for a view-layer pass.
  - **New components** (`src/features/event-view/components/`):
    `EventBanner` (full-width banner, image or placeholder, optional
    overlaid actions for the mobile sheet), `EventChipsRow`
    (public/private + calendar-name + "in your calendar", derived from
    existing `isPrivateEvent`/`findCalendarForEvent` state, no new nostr
    calls), `EventLocationCard`, `EventHostRow` (always-visible "Hosted by
    X", reuses `Participant`), `EventAddToCalendarButton` (wraps the
    existing `exportICS`; there's no native calendar-insert API — Android's
    `DeviceCalendar` plugin is read-only — so ".ics export" _is_ "add to
    calendar" here, per mockup 12's literal "Add to device calendar"
    wording, which is also what avoided a button-label collision with
    `RespondPanel`'s unrelated "Add to Calendar" accept-into-my-calendar
    button — see gotcha below).
  - **New asset**: `src/components/ui/EventBannerPlaceholder.tsx` — calm
    generic banner for imageless events, inline SVG (not a static file) so
    it can react to live theme state. Deliberately built as a React
    component using `useColorScheme()` + `theme/tokens.ts`
    (`lightTokens`/`darkTokens`), not `theme.palette.mode` — this app
    themes via MUI CSS variables (`colorSchemeSelector: "class"`, see
    `theme.ts`), under which `theme.palette.*` reflects the _static
    default_ scheme, not the live toggle. `EventChip.tsx` already had to
    work around this the same way (`publicTint` via `useColorScheme`); a
    first cut of the placeholder used `theme.palette.mode` directly and
    rendered a bright white gradient in dark mode until live agent-browser
    QA caught it — screenshotting light AND dark before calling a
    theme-dependent visual "done" is the actual lesson here, not just this
    one component.
  - **Mobile bottom-sheet chrome**: `CalendarEventView`'s `display="modal"`
    branch now renders `BottomSheet` (vaul) on mobile instead of a
    fullScreen MUI `Dialog` — the title/chips moved into the shared body
    (under the banner) for both mobile and desktop so there's no duplicate
    title row; desktop's `Dialog` keeps an icon-only header bar
    (`EventActionsBar`, unchanged) above the body, mobile overlays the same
    `EventActionsBar` on the banner's top-right corner with a pill backdrop
    for legibility over photos. `CalendarEventCard`/`AllDayEventChip` now
    check `useMediaQuery` and skip `EventQuickPeek` on mobile entirely,
    calling `modal.open(event)` directly; `EventQuickPeek`'s now-dead mobile
    `BottomSheet` render branch was deleted (Month view's mobile day-agenda
    flow already bypassed quick-peek before this session, so it needed no
    changes). `EventQuickPeek`'s desktop popover gained an inline
    Yes/Maybe/No RSVP `ButtonGroup` (mockup 02 shows this; the prior
    session's "meta-only, no inline RSVP" note was itself a deliberate
    scope-cut for that session, not a permanent constraint).
  - **e2e regressions found and fixed in the same change**: (1) the new
    "Add to device calendar" button's original label ("Add to calendar")
    case-insensitively collided with `RespondPanel`'s pre-existing "Add to
    Calendar" button under Playwright's `getByRole` name matching — one
    failing assertion cascaded into stray test-event pollution that broke
    three unrelated specs via retries; fixed by renaming to "Add to device
    calendar" (matches mockup 12's literal wording anyway). (2)
    `EventChipsRow`'s new calendar-name chip duplicated text
    `calendar-management.spec.ts` was asserting via a bare `getByText`,
    an intentional-per-guardrail-#2 DOM change — added
    `data-testid="calendar-management-current-name"` to
    `EventCalendarListManagement`'s name `Typography` and scoped the test
    to it instead of the now-ambiguous text.
  - `pnpm typecheck`/`pnpm lint`: clean except the same pre-existing
    unrelated `StyledComponents.tsx` `theme.vars` error. `pnpm test:e2e`:
    45 passed, 1 skipped (same pre-existing `event-participants` fixme).
  - Manually verified live via `agent-browser` against `pnpm dev`: created a
    public event with a banner image and a private event with none, checked
    the desktop quick-peek (inline RSVP, no relay footer), the full desktop
    dialog (chips, location card, description, host row, RSVP, add-to-
    calendar), the mobile bottom sheet end-to-end (tap → full sheet
    directly, no intermediate peek), the standalone public page
    (`/event/:naddr`, confirms it inherited the same styling per this
    session's explicit scope choice), and both banner states in light AND
    dark mode (this is where the placeholder dark-mode bug above was
    caught).

- 2026-07-21 — F-EVENT-VIEW — Event details + RSVP, decomposed into
  `src/features/event-view/` (first feature folder in the codebase, per D3).
  **Nostr layer confirmation**: no kind/tag/protocol changes were needed or
  made — `src/nostr/rsvp.ts` (kinds 31925/32069, built in Phase 3) and the
  existing NIP-09 deletion path already cover everything in scope.
  - **Decomposition**: `CalendarEvent.tsx` (906 lines) split into
    `EventDetail.tsx` (composition root: `CalendarEventView` shell +
    `CalendarEvent` body, ~250 lines) plus `components/`: `EventCard`
    (grid-chip renderers, unchanged behavior), `EventActionsBar` (was
    `ActionButtons`), `EventMeta`, `EventFormsSection`, `EventNotifications`
    (was `ScheduledNotificationsSection`), `EventRsvpSection` (new),
    `RespondPanel`, `DeleteEventDialog`, `RSVPBar`, `RSVPParticipantList`
    (the last four moved from `src/components/` verbatim, restyle-only —
    they were already token/theme-driven, no hardcoded colors found).
    `src/components/CalendarEvent.tsx` is now a 7-line re-export shim so
    `WeekView`/`DayView`/`MonthView`/`ViewEventPage`/`NotificationEventPage`
    (which imports the `CalendarEvent` body component directly) needed no
    changes.
  - **Full RSVP UI**: `EventRsvpSection` adds a "N going · M maybe" summary
    (from `useEventRsvps`' already-fetched pubkey/status map, zero new nostr
    calls) and a relay-publish-status footer via the existing
    `RelayStatusDots`/`useRelayStatusPlaceholder` (same placeholder-data
    caveat as its other two call sites — no live per-relay tracking exists
    anywhere in the app yet).
  - **Lazy profile resolution** (per-session clarification): host/participant
    profile resolution (`Participant`/`useGetParticipant`, one relay
    subscription per pubkey) is deferred until the user clicks "Show
    participants" — the summary row shows only counts + initials-only
    avatars (raw pubkey, no fetch), mirroring the technique
    `EventQuickPeek` already used for the same reason. This matters because
    the same component tree is reachable unauthenticated from the public
    standalone event page (`ViewEventPage.tsx`) — any visitor opening a
    well-attended event must not trigger a burst of profile subscriptions.
    RespondPanel's single host-`Participant` line (shown only when the event
    isn't yet in the viewer's calendar) was deliberately left eager — it's
    one fetch per view regardless of attendee count, not the O(N) case the
    lazy-load guards against.
    **e2e updated in the same change**: `rsvp.spec.ts`'s two participant-list
    assertions ("view comment", "view suggested time") now click "Show
    participants" first before those become visible — an intentional DOM
    change per guardrail #2.
  - **Standalone/public page** (per-session clarification): confirmed
    `ViewEventPage.tsx` (`/event/:naddr`, F-EVENT-LINK territory) already
    renders `CalendarEventView` unauthenticated with no auth gate (fixed in
    the 2026-07-20 rebase), and `RespondPanel` already implements the
    logged-out → login/guest prompt → same screen + add-to-calendar-section
    flow. No new page was built; verified live via `agent-browser` (cleared
    localStorage, hit the naddr link logged out, saw the prompt render with
    no blocking modal, then injected a second identity and reloaded to
    confirm the same screen plus the add-to-calendar section appears).
  - **Delete/duplicate restyle**: `DeleteEventDialog`/`EventActionsBar`
    visuals only — all three `delete-option-*` testids and the "Duplicate
    Event"/"Delete Event"/"Edit Event" accessible names are byte-identical;
    no recurring single-occurrence-vs-series option was added (not in scope,
    would need its own nostr sign-off).
  - Two new dictionary keys added (`en-US` only): `event.publishedToRelays`,
    `rsvp.goingSummary`/`rsvp.showParticipants`/`rsvp.hideParticipants`.
  - `pnpm typecheck`: clean except one pre-existing, unrelated error
    (`StyledComponents.tsx` `theme.vars` — confirmed present on a clean
    stash of this same tree before any of this session's changes).
    `pnpm lint`: clean (0 errors; same pre-existing warnings elsewhere).
    `pnpm test:e2e`: 45 passed, 1 skipped (same pre-existing
    `event-participants` fixme), matching the Phase 0–3/F-VIEWS baseline.
  - Manually verified live via `agent-browser` (`run-app` skill): created a
    public + a private/invited-participant event as Alice, submitted RSVPs,
    expanded/collapsed the participant list, applied the delete dialog's
    three options, walked the duplicate flow into `CalendarEventEdit`
    create-mode with participants preserved, and drove the standalone-page
    logged-out/logged-in flow described above.

- 2026-07-20 — Rebase onto `main` — rebased `local-relay-migration` (this whole
  redesign, one squash commit) onto `origin/main`, which had moved 4 commits
  (duplicate-event dTag fix, Android notifications, iOS App/deep-links/secure-
  storage, iOS notifications) since this branch forked. 22 files conflicted;
  resolved by keeping the redesign's architecture and porting main's
  functional changes into it, not the reverse. Key decisions:
  - **`common/nostr.ts` vs `src/nostr/`**: main's dTag fix (route through
    `getPersistedCalendarEventId` instead of a raw `TEMP_CALENDAR_ID` check,
    so duplicated events get a fresh d-tag instead of colliding with the
    original) was ported into `src/nostr/events.ts` at the same two call
    sites; `common/nostr.ts` stays deleted (superseded by Phase 3).
  - **iOS safe-area handling**: main's `Header.tsx`/`CalendarHeader.tsx`/
    `theme.ts` had grown a `--safe-area-top`/`--safe-area-bottom` system
    (notch/home-indicator insets) that the redesign's `TopBar`/`MobileTabBar`
    never accounted for — a real regression for the iOS app, not just a
    conflict artifact. Ported: `TopBar`/`MobileTabBar` get
    `padding-top`/`padding-bottom: var(--safe-area-*)`; `StyledSecondaryHeader`
    (`WeekHeader`'s sticky offset) wraps its constant offset in
    `calc(var(--safe-area-top) + …)`; the theme's `MuiDialog`/
    `MuiDialogContent`/`MuiDialogTitle`/`MuiDialogActions` overrides gained
    main's mobile-fullscreen-dialog + safe-area-padded title/actions rules
    (`src/theme/theme.ts`). `main.css` keeps the `--safe-area-*` custom
    properties and `overscroll-behavior: none` on `html.ios-native`.
  - **Not ported**: main's `html.ios-native` internal-scroll-container model
    (`overflow: hidden` on `html`/`body`/`#root`/`.App` + a per-view `flex:1;
overflowY:auto` pane, used by the old `Header`+`CalendarHeader`+
    `Calendar.tsx` stack). This directly conflicts with the redesign's
    documented "the whole document scrolls, there is no internal scroll
    container" decision (see F-VIEWS entry below) — reintroducing it would
    silently re-break that. Kept the single-scroll model; dropped the ref'd
    scroll-container reset in `App.tsx` in favor of `window.scrollTo`.
    **Needs a real iOS-device check** — the redesign's mobile work was only
    verified via Playwright + `agent-browser`, never on-device, and this is
    exactly the kind of thing (momentum scroll, keyboard-avoidance, sticky
    header behavior in a WKWebView) that can differ from desktop-browser
    testing.
  - **Public routes were fully broken**: `App.tsx`'s Phase-2 rewrite gated
    all of `<Routing/>` on `{user && …}`, silently dropping main's
    `shouldRenderRouting` (renders for `Boolean(user) || publicRoute`) — so
    `/event/:naddr` and `/schedule/:id` rendered **nothing** for a logged-out
    visitor, pre-dating this rebase (bug already present on `local-relay-
migration` before main's commits were involved). Fixed while resolving
    the conflict: logged-in → `AppShell`, logged-out-but-public → bare
    `<Routing/>` (no chrome, matches these being standalone share links),
    else nothing (login modal shown). Removed the now-dead
    `usesStandaloneHeader`/`STANDALONE_HEADER_PATTERNS` (Header-era per-route
    header toggle, superseded by Phase 2's global `AppShell` wrap).
  - **`e2e/web/tests/respond.spec.ts`** had a test asserting the _old_,
    now-incorrect behavior (blocking login dialog, event never rendered for
    a logged-out visitor) — written against the pre-fix bug above, before
    this rebase pulled in main's real public-route feature. Rewrote it to
    assert the actual intended behavior: the event renders standalone, and
    `RespondPanel`'s inline "Login with Nostr" / "Continue as Guest" prompt
    shows instead of a blocking dialog (this also means the guest-continue
    path — previously called out in this same test as "currently
    unreachable on web" — is now reachable).
  - Dropped (not reconciled) 4 unit-test files main had extended
    (`duplicateEvent.test.ts`, `notifications.test.ts`,
    `secureKeyStorage.test.ts`, `calendarEventIdentity.test.ts`) — consistent
    with this branch's Phase-0/3 policy of deleting Vitest unit tests in
    favor of e2e coverage (`vitest.config.ts` is gone). Flagging since main
    added real assertions here (iOS secure-storage roundtrip, notification
    scheduling edge cases) that have no e2e equivalent yet — worth a look
    before this ships, not a rebase-mechanics call.
  - Fixed one bad auto-merge Git produced on its own (not a real conflict,
    so it built silently and only surfaced via `pnpm typecheck`):
    `SidebarContent.tsx` (renamed from `CalendarSidebar.tsx`) picked up an
    `isMobile`-gated safe-area padding hunk from main's non-conflicting diff
    context, but the redesign's `SidebarContent` has no `isMobile` in scope —
    added `useMediaQuery(theme.breakpoints.down("sm"))` locally and removed
    a resulting duplicate `p: 2` key.
  - Verified: `pnpm typecheck && pnpm lint` clean (0 errors, same
    pre-existing warnings). `pnpm test:e2e`: 45 passed, 1 skipped (same
    baseline). `pnpm build` succeeds.

- 2026-07-20 — F-VIEWS follow-up #2 — the actual root cause of the mobile layout complaints,
  found by finally driving a real browser (`agent-browser`, mobile viewport 390×844) instead of
  reasoning from screenshots: **`TopBar.tsx`'s mobile layout packed logo, date label, view
  switcher, Today button, bell, and avatar into one non-wrapping flex row that is simply wider
  than any phone viewport** — measured `scrollWidth: 591` vs `innerWidth: 390` before the fix.
  This predates F-VIEWS (built in Phase 2, never manually verified on mobile — sandboxed
  networking blocked it then too) but was surfaced by this phase's mobile month work and was
  the real reason the header/grid looked "overflowing"/"carried forward" across every view: three
  prior fixes this session (BottomSheet mount pattern, grid `minWidth:0`, scroll reset) were all
  independently correct but were treating symptoms of this one root cause.
  - Split `TopBar` into two rows on mobile: row 1 keeps logo/open-calendars/date/bell/avatar; the
    Month/Week/Day `SegmentedControl` + Today button move to a new second row below it — matching
    what mockup `09` (mobile month) actually specifies (segmented control + Today chip on their
    own row under the main bar), not an invented layout.
  - Added `MOBILE_TOPBAR_ROW2_HEIGHT` (48) alongside the existing `TOPBAR_HEIGHT` (64) export;
    `WeekHeader`'s sticky `topOffset` now adds it on mobile so the week day-header still sticks
    directly below the taller mobile header instead of being covered by it.
  - Verified with real measurements, not screenshots: `document.documentElement.scrollWidth ===
window.innerWidth` (390) on Month/Week/Day at 390px after the fix (was 591 before); desktop
    (1400px) screenshot confirms the single-row layout is unchanged. Also exercised the mobile
    agenda `BottomSheet` end-to-end in the real browser — opens, shows the day's events, closes
    cleanly with no leftover `document.body` style — confirming the earlier vaul mount-pattern fix
    holds up outside of reasoning-from-screenshots.
  - `pnpm typecheck && pnpm lint`: clean. `pnpm test:e2e`: 45 passed, 1 skipped (same baseline),
    including the `mobile` project which exercises this exact TopBar.

- 2026-07-20 — F-VIEWS follow-up #1 (post-session bug hunt with user) — three real bugs found via
  live mobile testing, all fixed, e2e re-confirmed green (45 passed, 1 skipped):
  1. **Removed the auto-scroll-to-8am effect** added earlier this session (`WeekView.tsx`/
     `DayView.tsx`). It used `scrollIntoView({block:"start"})` on an hour-cell ref, but the app has
     no internal scroll container for the hour grid — the whole document scrolls — so this scrolled
     the _entire window_ on every mount, independent of viewport width. Symptom reported by user:
     "the header is introducing scroll" and a large excess scroll region past the mobile tab bar.
     Not worth reintroducing without a real internal scroll container; dropped as a cosmetic nicety
     that caused more harm than it added.
  2. **`MonthView`'s mobile agenda `BottomSheet` was conditionally mounted/unmounted**
     (`{mobileAgendaDay && <BottomSheet open ...>}`) instead of staying mounted with `open` toggled
     — the wrong usage pattern for vaul (its body-scroll-lock cleanup runs on close, not on
     unmount). Split into two states (`mobileAgendaDay` for content, `mobileSheetOpen` for
     visibility) so `BottomSheet` renders once per mobile session and only toggles `open`, matching
     `AppShell`'s existing (correct) pattern for the sidebar sheet.
  3. **Grid day-columns had no `minWidth:0`** on `WeekView`'s/`DayView`'s flex/grid-item day
     columns — the classic flexbox/grid "min-width: auto" trap: an `EventChip`'s nowrap title could
     force its column wider than its track, cascading into real horizontal page overflow (user saw
     only 3 of 7 month columns on screen, with a huge blank area). Added `minWidth:0` +
     `overflow:"hidden"` to every day-column and to `EventChip`'s own title span (which had the same
     bug one level down — the ellipsis span wasn't shrinking either).
  4. Added a `useEffect` in `Calendar.tsx` resetting `window.scrollTo(0,0)` on `layout`/`date`
     change — previously nothing reset scroll position between view switches, so bug #3's overflow
     on one view was still visible (as leftover scroll offset) after switching to another view even
     once the overflow itself was fixed elsewhere, matching the user's "carried forward into month
     view" observation.
  - Diagnosed collaboratively with the user via live devtools inspection (checked the vaul
    Content's DOM parent — confirmed direct child of `<body>`, ruling out a transform-containing-
    block theory — and viewport width at the reported breakpoint) rather than guessing blind; two
    of the four fixes (`BottomSheet` mount pattern, grid `minWidth:0`) were identified by reasoning
    from the app's actual layout architecture once screenshots narrowed down where the scroll was
    coming from.

- 2026-07-20 — F-VIEWS — Restyled Month/Week/Day per mockups `01,02,03,04,08,09,10`. No nostr
  layer inputs (read-only views over existing stores, confirmed by user).
  - **Scope decisions** (see `docs/REDESIGN_MASTER_PLAN.md` F-VIEWS section for the discussion):
    quick-peek popover (mockup 02-B) and Month's day-agenda overflow popover (02-A) are **in**,
    meta-only (no inline RSVP buttons/relay-status footer — those stay in the full modal until
    F-EVENT-VIEW). Drag-to-move (02-C) is **deferred** to a later phase since it touches
    write/republish logic, not just view rendering — the inert `DndContext`/commented
    `useDraggable` scaffolding is untouched. Day view's persistent 400px detail rail (mockup 04)
    is **out of scope** (overlaps F-EVENT-VIEW). Kept the full 24h Week/Day grid (mockups show
    08:00–20:00) to avoid shifting `event-crud.spec.ts`'s `.nth(10)` hour-cell index — added an
    auto-scroll-to-8am on mount instead (`scrollIntoView` on a ref'd hour cell; a naive
    `scrollTo` on the grid container was tried first and silently did nothing, since the grid
    isn't its own scroll container — the page itself scrolls).
  - `EventChip` (`src/components/ui/EventChip.tsx`) extended with a `time` prop, an `sx` passthrough
    (array-merged, so callers can override height/alignment for the absolute-positioned Week/Day
    case), token-based radius, and `forwardRef` (needed to anchor the popover).
  - New `src/utils/eventChipColor.ts`: extracted `useResolvedCalendarColor` out of
    `CalendarEvent.tsx` (now shared by Month/Week/Day) plus a new plain-data
    `resolveCalendarColor`/`getEventChipColor` pair — the plain form exists specifically so
    Month's day-agenda popover can resolve colors for a whole list of events without calling a
    hook inside `.map()`.
  - New `src/hooks/useEventModal.ts`: one shared `{event, isOpen, open, close}` state instead of
    each card owning its own `CalendarEventView` dialog state.
  - New `src/components/ui/EventQuickPeek.tsx`: shared popover, `mode="event"` (title, time/
    location, calendar+recurrence icon, read-only RSVP avatar stack + "N going" via the existing
    `useEventRsvps` hook, "Open →" link) and `mode="agenda"` (Month's "+N more", lists the day's
    events as `EventChip` rows, "Open day view →"). RSVP avatars use raw pubkeys for initials, not
    resolved profile names/pictures — resolving per-avatar profile data would need a hook-per-item
    (not callable from a flat `.map()`), and this is explicitly meta-only per the user's call, not
    the full RSVP UI.
  - `CalendarEventCard`/`AllDayEventChip` in `CalendarEvent.tsx` rewritten on `EventChip` +
    `EventQuickPeek` + `useEventModal`, replacing their bespoke `Paper`/`Typography` markup and
    `getColorScheme()` (deleted — its hardcoded `#e0e0e0`/`#999`/`#fff`/dashed-border styling had
    no remaining callers once both were rewritten). Click now opens the quick-peek first, "Open"
    opens the full modal — same interaction across all three views. **Dropped**: the invitation
    dashed-border style and the device-source phone icon overlay (both were `getColorScheme`-only
    nuances with no test coverage) — invitations/device events still render distinctly via
    `EventChip`'s solid (non-public) variant, just without those two visual details.
  - `MonthView.tsx` rewritten: events render as `EventChip` (was plain unclickable `Typography`,
    silently truncated past 3 with no indicator — a real bug, now fixed with an explicit "+N more"
    opening the day-agenda popover). Today badge was already free (`DateLabel`'s existing
    `highlighted` IconButton variant, already used here). Mobile (`down('sm')`): dots instead of
    chip text, tapping a day opens a bottom sheet with that day's agenda.
  - **vaul replaces MUI Drawer in `BottomSheet.tsx`** (per your call): `src/components/ui/
BottomSheet.tsx` rewritten on `vaul`'s `Drawer.Root/Portal/Overlay/Content/Handle`, same
    external props (`open`, `onClose`, `children`) so its existing 4 call sites (`Sidebar.tsx`,
    `SidebarContent.tsx`, `AppShell.tsx`, `DevUiShowcase.tsx`) needed no changes. `vaul@1.1.2`
    added as a dependency (confirmed React 19 peer support before adding).
  - `WeekView.tsx`/`DayView.tsx`: hardcoded `#ddd`/`#eee`/`bgcolor="white"` replaced with
    `divider`/`background.paper` theme references; added `data-testid="day-hour-cell"` to
    WeekView's hour cells for parity with DayView (confirmed no spec depended on its absence).
  - Added master-plan guardrail #4 addendum generalizing the sx-cleanup rule (prefer theme slot
    overrides / local `styled()` over repeated inline `sx`) for all future phases, per your ask.
  - Removed a stray `console.log("ALL_EVENTS", ...)` in `Calendar.tsx` found during exploration.
  - **E2E regression found and fixed in the same change** (guardrail #2): quick-peek intercepting
    the first click broke every spec that clicked an event expecting the full modal to open
    directly. Fixed at the root — `e2e/web/helpers.ts`'s `openEventModal`/`openEventEditor`
    (already the single shared helper for 4 of the 6 affected specs) now click through the
    popover's "Open →" link. The other 2 specs (`event-duplicate.spec.ts`, `event-edit.spec.ts`)
    had duplicated the same inline click-then-expect-dialog pattern instead of using the helper —
    switched them onto `openEventModal` too, which incidentally de-duplicated that pattern rather
    than adding a third copy of the fix.
  - `pnpm typecheck && pnpm lint`: clean (0 errors; same pre-existing warnings). `pnpm test:e2e`:
    45 passed, 1 skipped (same pre-existing `event-participants` fixme) — matching the Phase 0–3
    baseline exactly, after the helper fix above. Not manually verified in a live browser this
    session (same sandboxed-networking constraint as Phase 2); relied on the full Playwright pass
    across chromium + mobile projects.

- 2026-07-20 — Phase 3 — Built `src/nostr/` and drained `common/nostr.ts` (1350
  lines), `common/nip59.ts`, `common/EventConfigs.ts`, and `common/calendarList.ts`
  into it; all four deleted. Zero wire-format changes except the two pre-approved
  bug fixes.
  - `kinds.ts` (moved `EventKinds` verbatim), `core.ts` (`buildAndSign`, `makeDTag`,
    `nextCreatedAt`, `publishSignedEvent`, `addGossipRelays` — kills the ~11
    sign-and-hash copies and the d-tag/relay-hint idioms), `fetch.ts`
    (`fetchLatest`/`fetchAll` over `collectOnce`, kills the 9 identical
    `collectOnce`-fetch shells), `subscribe.ts` (`createSubscription` standing-
    subscription factory: handle + start-guard + optional id-dedup Set).
  - `crypto.ts`: single `getUserPublicKey`; NIP-59 gift wrap
    (`wrapEvent`/`unwrapEvent`, moved from `nip59.ts`, dropping stray
    `console.log("SIGNER-DECRYPT", ...)` debug lines but keeping the
    `decryptGate` concurrency guard byte-for-byte — protects against duplicate
    permission popups on external signers); two **deliberately distinct**
    primitives instead of one merged pair, per investigation of the actual call
    sites: `selfEncrypt`/`selfDecrypt` (conversation-key with a raw secret key
    the caller already holds — private RSVPs, private calendar events,
    scheduling-page viewKeys) vs `signerEncrypt`/`signerDecrypt` (asks the
    logged-in user's own signer — calendar lists, scheduling-page keys, gift-wrap
    seal/wrap layers). `fetchOwnSchedulingPageKeys` previously called
    `signer.nip44Decrypt` directly, bypassing the concurrency gate — now routed
    through `signerDecrypt`, closing that gap. Confirmed scheduling-page
    viewKeys are deliberately raw hex (not nsec, unlike calendar-event/RSVP
    viewKeys) — call sites keep decoding their own key format; the shared
    primitives only take already-decoded `Uint8Array`.
  - Domain modules built on the above: `events.ts`, `rsvp.ts`, `calendars.ts`
    (from `calendarList.ts`), `busy.ts`, `relays.ts`, `profiles.ts`, `reports.ts`,
    `schedulingKeys.ts`, `forms.ts`, `booking.ts`.
  - **Bug fixes** (in `events.ts`'s `publishPublicCalendarEvent`): `["name", title]`
    → `["title", title]`; the location loop's `["image", location]` →
    `["location", location]` (confirmed via `utils/parser.ts` that the parser
    already read both `title`/`name` and already treated `location` as its own
    field — write-side-only fix, no migration needed).
  - `subscribe.ts`'s factory applied to `stores/bookingRequests.ts`'s two
    standing subscriptions (now in `nostr/booking.ts` as
    `createBookingRequestsSubscription`/`createBookingResponsesSubscription`,
    `dedupeById: true`) and to a newly-named `fetchSchedulingPage` in
    `nostr/booking.ts` covering `BookingPage.tsx`'s inline
    `dataLayer.observe`+decrypt effect (a 6th hand-rolled subscription found
    during exploration, not in the plan's original list of 4).
    `stores/invitations.ts`, `stores/schedulingPages.ts`, `stores/events.ts` keep
    their existing bespoke dedup/batching logic (buffer+timer, createdAt-based
    "newer wins") — deliberately not forced onto the factory, since their
    semantics differ from the simple id-dedup shape.
  - Moved `BookingPage.tsx`'s protocol code out: module-level `sendBookingRequest`,
    the inline gift-wrap/gossip-relay/nip44-decrypt `useEffect`, and the
    dTag/viewKey generation in `handleBookingSubmit` all now live in
    `nostr/booking.ts` (`sendBookingRequest`, `fetchSchedulingPage`,
    `createBookingIdentity`); the component no longer imports `dataLayer`,
    `nip44`, or any crypto primitives directly.
  - Deleted 3 confirmed-dead functions (zero callers anywhere, including
    internally), per user confirmation: `wrapManyEvents`, `unwrapManyEvents`
    (`nip59.ts`), `createDefaultCalendar` (`calendarList.ts`). Everything else
    initially flagged (`getDetailsFromGiftWrap`, `fetchRelayLists`, nip59's
    duplicate `getUserPublicKey`, `createRumor`/`createSeal`/`createWrap`,
    `encryptCalendarList`/`decryptCalendarList`) turned out to be used
    internally by other functions in the same file — kept, just made
    module-private in their new home.
  - Repointed all ~21 importers of `common/nostr`/`common/nip59`/
    `common/EventConfigs`/`common/calendarList` (stores, components, hooks,
    `dataLayer/relay.worker.ts`, `common/signer/index.ts`) to the new
    `src/nostr/*` modules. Mechanical import-path swap; no component was
    reclassified into container/presenter (that split is per-flow work, not
    Phase 3 scope).
  - Added `@typescript-eslint/no-restricted-imports` in `eslint.config.js`
    barring `@formstr/local-relay` and raw `nip44` imports outside
    `src/nostr/**`, `src/stores/**` (stores are explicitly allowed per D1 — "the
    14 Zustand stores are reused as-is"), `src/dataLayer/**` (implements the
    local-relay client itself), and `src/App.tsx` (pre-existing app-lifecycle
    pause/resume wiring, out of scope). Type-only imports (e.g. `ObserveHandle`)
    are exempt via `allowTypeImports`.
  - `pnpm typecheck && pnpm lint`: clean (0 errors; same pre-existing warnings
    as prior sessions). `pnpm test:e2e`: full suite green — 45 passed, 1 skipped
    (same pre-existing `event-participants` fixme), matching the Phase 0–2
    baseline exactly. Note: an early full-suite run in this session showed 11
    failures, traced to a stale process squatting on port 5173 that Playwright's
    `reuseExistingServer` silently reused instead of rebuilding — killing it and
    rerunning with `CI=true` (forcing a fresh build) reproduced the clean
    baseline; not a real regression.

- 2026-07-19 — Phase 2 — Built the app shell and `src/components/ui/` primitives per D1/D3:
  - Primitives: `SectionLabel` (wraps the theme's `overline` typography variant),
    `SegmentedControl` (generic pill switch, used for the ViewSwitcher), `EventChip`
    (public/private per `publicTint`/`calendarColors`, not yet wired into any view),
    `AvatarStack` (not yet consumed by the shell), `RelayStatusDots`, `BottomSheet` (MUI
    `Drawer anchor="bottom"`), `MiniCalendar` (wraps MUI's static `DateCalendar`, chosen over a
    hand-built grid so day cells keep the `gridcell` a11y role the e2e suite already depends on).
  - **Deviation from the mockups, by design:** the ViewSwitcher is a `SegmentedControl` pill
    (3 always-visible radio options) instead of the old button+dropdown-menu pattern — this
    matches what the mockup's TopBar literally shows. `navigation.spec.ts`/`mobile.spec.ts`
    were rewritten accordingly (`getByRole("radio", ...)` instead of button→menuitem).
  - **RelayStatusDots is a real, presentational component but not wired to live per-relay
    connection state** — no such plumbing exists anywhere in the app (only a publish-scoped
    status hook, `useRelayPublishStatus`). `useRelayStatusPlaceholder` reports every configured
    relay as `"ok"`. Deferred; flagged in the hook's own comment.
  - Search box in `TopBar` is rendered per the mockup (placeholder text, `⌘K` focuses it) but
    **not wired to real search** — no search backend exists anywhere in the app; out of scope
    for a shell phase.
  - `AppShell.tsx` composes `TopBar` + `Sidebar` (desktop, `useMediaQuery(down("sm"))`, the same
    breakpoint every other component already uses) + `MobileTabBar` (mobile) + the routed
    content, owns the "new event" dialog (same `<CalendarEventEdit open event={null}
mode="create"/>` shape `WeekView`/`DayView` already use for cell-click creation) and the
    mobile "open calendars" `BottomSheet`. `useKeyboardShortcuts` adds C/T/M/W/D/arrows/⌘K,
    ignored while focus is in a text field.
  - `SidebarContent.tsx` is shared verbatim between the desktop rail (`ui/Sidebar.tsx`) and the
    mobile `BottomSheet` — one component, not two. It absorbs `CalendarSidebar.tsx`'s calendar
    list (`data-testid="calendar-row"`/`"calendar-visibility-checkbox"` preserved) and
    `CalendarManageDialog` wiring, `SchedulingPagesList` for "BOOKING PAGES", and a Settings
    link + theme toggle (replaces `TempThemeToggle`, deleted). **Kept beyond the mockup, to avoid
    regressing existing features:** a second footer row with the About/Privacy/Contact links and
    `ICSUpload` that used to live in `Header`/`CalendarSidebar` — the mockup's sidebar footer
    only shows Settings + theme toggle.
  - `useCalendarTopBarProps`/`SidebarContent` derive the visible date **from the pathname
    directly** (new `getDateFromPathname`/`getLayoutFromPathname` in `dateBasedRouting.ts`), not
    via `useParams()`/`useLayout()`/`useDateWithRouting()` — those depend on `useParams()`, which
    only sees params from the closest _matched_ `<Route>`, and `TopBar`/`Sidebar` are mounted in
    `AppShell` **above** `<Routes>`. Missed this on the first pass (deep-linking to `/d/...` fell
    back to "today" everywhere in the shell); fixed before landing.
  - Deleted `Header.tsx`, `CalendarHeader.tsx`, `CalendarSidebar.tsx`, `theme/TempThemeToggle.tsx`.
    Five pages (`BookingPage`, `SchedulingPageEdit`, `NotificationEventPage`,
    `BookingNotifications`, `ViewEventPage`) each rendered their own extra `<Header/>` + spacer as
    a loading/error/standalone-page pattern — now redundant since `AppShell` wraps all of
    `<Routing/>` globally, so all five were stripped down to just their content `Box`.
    `CalendarHeader`'s in-view row is gone; `WeekView`'s `WeekHeader` (the weekday header strip)
    moved to render directly from `Calendar.tsx` instead, with its `topOffset` (`StyledSecondaryHeader`)
    reset from `40+8` to `0` since there's no more in-flow `CalendarHeader` box above it — the new
    global `TopBar` is a constant `TOPBAR_HEIGHT = 64` on all breakpoints, so
    `StyledComponents.tsx`'s old mobile-portrait/landscape (56/48) sticky offsets collapsed to one
    constant `64 + topOffset` too.
  - Added `/settings` route (`SettingsPage.tsx`, intentionally empty — real content is F-SET) and
    a `/dev/ui` route (gated by `import.meta.env.DEV`, no prior precedent for that idiom in the
    repo) showing each new primitive for light/dark eyeballing.
  - `e2e/web/helpers.ts`: `openSidebar`/`createCalendarViaSidebar`/`openBookingsViaSidebar` no
    longer click a hamburger or press Escape to close a drawer — the desktop Sidebar has no
    open/close state anymore. This helper is shared by `calendar-management`, `respond`, `rsvp`,
    and `booking` specs, all of which needed no other changes.
  - `pnpm typecheck && pnpm lint`: clean (0 errors; same 5 pre-existing warnings, confirmed
    unaffected by diffing against a stash). `pnpm test:e2e`: full suite green — 45 passed, 1
    skipped (pre-existing `event-participants` fixme, untouched).
  - Not manually verified in a live browser this session (sandboxed environment blocks
    localhost networking for a manual check) — verification relied on the full Playwright e2e
    pass across both the `chromium` and `mobile` projects, which exercises the shell end-to-end
    (desktop nav, mobile tab bar routing, the calendars bottom sheet, dark mode via existing
    theme-toggle-dependent specs).

- 2026-07-19 — Phase 1 — Built `src/theme/` per D1, transcribing tokens from
  `designs/redesign/00-design-system.html` (decoded the `__bundler` template payload):
  - `tokens.ts` — light/dark neutrals, border/text scales, calendar colors (Personal/Work/
    Family/Meetups/Deadlines), accent presets (Ember/Ocean/Forest/Grape/Rose/Ink — "Ember" is
    the design system's literal default hex `#111111`, not orange, despite the name; transcribed
    as shown, not corrected), typography scale, radius scale (6/10/12/14/16), button heights,
    shadows, 8pt spacing, and a `getContrastText` helper for the accent CSS-var override.
  - `theme.ts` — `createTheme({ cssVariables: { colorSchemeSelector: "class" }, colorSchemes:
{ light, dark } })` with component slot overrides for Button, Paper/Card, Dialog, Popover/
    Menu, OutlinedInput, Chip, Switch, Checkbox, Tabs per the mockup specs (border-only cards,
    1.5/1.8px border widths, 40px buttons, no ripple, tooltips with arrows).
  - `AppThemeProvider.tsx` — wraps `ThemeProvider` (`defaultMode="system"`), syncs
    `stores/settings.ts`'s `themeMode` into MUI's `useColorScheme().setMode` and the chosen
    `accent` preset into `--cal-accent` / `--mui-palette-primary-main` /
    `--mui-palette-primary-contrastText` at runtime, per D1's "override CSS variables" approach.
  - `stores/settings.ts` — added `themeMode: "light"|"dark"|"system"` and `accent` fields;
    existing users' stored settings (pre-dating these fields) are backfilled via a default-spread
    rather than `getItem`'s plain default, since `getItem` doesn't merge partial stored objects.
  - Self-hosted Inter via `@fontsource/inter` (400/500/600/700/800) imported in `main.tsx`;
    removed the old Menlo `@font-face` rules from `main.css` and deleted the now-unused
    `public/fonts/Menlo-*.ttf` files.
  - Wired `AppThemeProvider` into `App.tsx` in place of the old inline `ThemeProvider`/
    `CssBaseline`/`theme.ts`; deleted `src/theme.ts`.
  - Added `TempThemeToggle.tsx` — fixed-position dark/light icon button (Phase 1 exit criterion
    allows a temporary toggle; explicitly commented as removable once F-SET ships).
  - Found and fixed one regression during manual dark-mode verification (screenshotted via a
    throwaway Playwright script, not committed): `Header.tsx`'s `AppBar` hardcoded
    `backgroundColor: "white"` via inline `style`, which made its icons invisible in dark mode
    (icon color follows theme text, background didn't). Changed to
    `sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}` —
    a 1-line fix scoped to un-breaking dark mode, not a Phase 2 shell rebuild.
  - Did not touch Menu/Radio component overrides beyond Checkbox (radio has no MUI slot override
    needed — default styling reads acceptably against the new tokens).
  - `pnpm typecheck && pnpm lint`: clean (0 errors; only pre-existing `react-hooks/exhaustive-deps`
    / `no-explicit-any` warnings untouched by this session). `pnpm test:e2e`: 45 passed, 1 skipped
    (same pre-existing `event-participants` fixme) — no spec changes needed, DOM/selectors
    unaffected by the theme swap.

- 2026-07-19 — Phase 0 — Ran `pnpm test:e2e` for a green baseline: 45 passed, 1 skipped
  (`event-participants` is `test.fixme`, pre-existing failure unrelated to this work — "Bob" list
  item never appears; not touched). Audited all 16 specs for style/DOM-coupled selectors (grep for
  `.Mui*`/CSS-class/`nth()` locators): found one genuine risk in `scheduling-builder.spec.ts`,
  which located a booking-page day column via `.locator(".MuiPaper-root").filter({ hasText: ... })`
  — brittle against the F-BOOK-PUBLIC redesign. Added `data-testid="booking-day-column"` +
  `data-date="YYYY-MM-DD"` to the day `<Paper>` in `src/components/BookingPage.tsx` (matches the
  existing `data-date` convention in `WeekView.tsx`/`DayView.tsx`) and rewrote the spec to select
  by that attribute. The remaining ~230 `getByRole`/`getByText` selectors across specs are
  accessible-name/content based (button roles, visible date text) — left as-is; these are
  Playwright-idiomatic and any that break on intentional copy/DOM changes get fixed spec-by-spec
  per flow phase (guardrail #2), not preemptively. Full suite re-run green after the change: 45
  passed, 1 skipped. Progress doc already existed from a prior session — no changes needed there
  beyond this entry.
