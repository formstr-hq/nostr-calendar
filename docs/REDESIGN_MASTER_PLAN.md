# Redesign & Refactor Master Plan

> **How to use this document:** This is the long-lived plan for the 2026 redesign of nostr-calendar.
> Work happens slowly, flow-by-flow, over many sessions. Each session, point Claude at this file,
> name the phase you're picking up, and paste the filled-in "Nostr layer inputs" for that flow
> (template in each flow section). See [Per-session protocol](#per-session-protocol) at the bottom.

---

## 1. Context

The app works but has four structural problems:

1. **UI is being redesigned.** New design lives in `designs/redesign/` — 24 self-contained HTML
   mockups exported from claude.ai/design, with a complete token system ("calm paper, loud ink":
   warm neutrals, ink-black accent, dark mode, accent presets, Inter, 8pt grid). The mockups are a
   **guideline**, not a spec — they show features that are _not_ to be built yet. Per-flow scope is
   specified by the user when a flow is picked up.
2. **Nostr layer is duplicated and hard to scale.** `src/common/nostr.ts` is a 1350-line hub;
   sign-and-hash, d-tag generation, self-encryption, fetcher shells, and subscription lifecycles are
   each copy-pasted 3–12×; `BookingPage.tsx` bypasses the protocol layer entirely.
3. **NIP deviations, including real bugs.** Public events emit `["name", title]` instead of
   `["title", …]`, and locations are written as `["image", location]` tags (copy-paste bug —
   public-event locations are silently lost). Gift wraps use kind 1052 instead of NIP-59's 1059.
   Custom kinds are documented in `nips/` (NIP-52E, NIP-52R, NIP-Appointment-Scheduling) but not
   all code matches the docs.
4. **Huge flat components breed bugs.** 56 flat files in `src/components/`;
   `CalendarEventEdit.tsx` 1808 lines, `SchedulingPageEdit.tsx` 1030, `CalendarEvent.tsx` 976,
   `LoginModal.tsx` 967, `BookingPage.tsx` 753.

**Non-negotiable constraint:** E2E tests must pass after every phase
(`pnpm test:e2e` — Playwright, 15 specs; Maestro native flows for release checks).

**What stays:** the 14 Zustand stores (`src/stores/`) are well-factored and are reused as-is; the
`@formstr/local-relay` DataLayer worker architecture stays; the signer stack stays; routing stays.

---

## 2. Key decisions (already made — do not re-litigate per session)

### D1. Theming: retrofit MUI v7, plus a small custom primitive kit (hybrid)

**Keep MUI**, do not build a component library from scratch. Rationale: 283 `sx` usages, MUI
`x-date-pickers` (rebuilding accessible date/time pickers is a project by itself), dialogs/menus
a11y for free, and — decisive for incremental migration — re-theming MUI means **screens that
haven't been migrated yet automatically inherit the new tokens** and look ~consistent during the
long transition.

Concretely:

- `src/theme/` (new folder, replaces `src/theme.ts`):
  - `tokens.ts` — the design tokens as plain TS objects, transcribed from the `Theme` object in the
    mockups' shared module + `designs/redesign/00-design-system.html`. Light + dark + `CalColor`
    calendar palette + accent presets (Ember/Ocean/Forest/Grape/Rose/Ink/custom).
  - `theme.ts` — `createTheme({ cssVariables: true, colorSchemes: { light, dark } })` mapping
    tokens into MUI palette/typography/shape, plus **component slot overrides** (border-only cards,
    radii scale 6–20, button heights 40/44, field styles, uppercase section labels).
  - Accent presets applied by overriding CSS variables at runtime (`--mui-palette-primary-*` /
    custom `--cal-accent`), persisted in the existing `stores/settings.ts`.
- `src/components/ui/` (new) — custom primitives MUI doesn't have or renders wrong for this design:
  `SegmentedControl`, `EventChip` (public = 12% tint + globe + colored bold text; private = solid
  fill + white text), `BottomSheet` (r20, grabber), `SectionLabel`, `TopBar`, `Sidebar`,
  `MobileTabBar`, `AvatarStack`, `RelayStatusDots`. All consume the same CSS variables.
- Fonts: self-host Inter in `public/fonts/` (folder exists), replace the Menlo-first stack.
- Dark mode: MUI `colorSchemes` + a mode setting (Light/Dark/System) in `stores/settings.ts`.

### D2. Migration strategy: incremental, per-flow — no parallel app, no big bang

Foundation phases (0–3) land first. Then one flow at a time is rebuilt in place. Because MUI is
re-themed globally, unmigrated screens remain acceptable-looking. Each flow phase ends with its
E2E specs green (updated in the same change when DOM legitimately changed).

### D3. Component architecture conventions

- **Feature folders:** `src/features/<flow>/` (e.g. `features/event-editor/`, `features/booking/`,
  `features/auth/`, `features/settings/`, `features/calendar-views/`), each with `components/`,
  `hooks/`, and an `index.ts` public surface. `src/components/` shrinks to shared bits + `ui/`.
- **Size discipline:** target ≤300 lines per file; hard alarm at 500. Split by concern:
  pure logic → `utils/` or feature `lib/`; side-effectful save/submit flows → feature hooks;
  dialogs embedded inline → own files. `docs/refactor-calendar-event-edit.md` is the worked
  example of this decomposition — follow its pattern for the other giants.
- **Container/presenter:** store-wiring and protocol calls live in the container/hook; presenters
  get props and are theme-only. Presenters must not import `dataLayer` or `common/nostr`.

### D4. Nostr layer: consolidate first (zero behavior change), protocol changes only per-flow

Phase 3 builds `src/nostr/` with shared builders and moves code — **no wire-format changes**.
Kind/tag changes happen only inside flow phases, driven by the flow's "Nostr layer inputs", so
each protocol change ships together with the UI that exercises it and its E2E spec.

### D5. E2E contract is API

The following are treated as public API and must not silently change:

- localStorage auth injection: `calendar:keys` (`{pubkey, secret}`) + `calendar:userData`, consumed
  by the legacy restore path in `src/common/signer/index.ts` (~lines 193–202). Keep working forever
  (or migrate tests in the same PR).
- `VITE_TEST_RELAY` env collapsing `src/common/relayConfig.ts` defaults to one relay.
- The ~16 `data-testid`s (`user-avatar`, `event-card`, `event-title`, `calendar-row`,
  `calendar-list-select`, `calendar-visibility-checkbox`, `day-hour-cell`, `booking-request-card`,
  `invitation-card`, `login-submit-nsec`, `recurrence-select`, `recurrence-end-mode`,
  `delete-option-*`, `rsvp-*`) plus `data-date` grid attributes.
- Role/label/text selectors: when a flow's visible text/roles change by design, update that flow's
  spec in the same change — never leave a spec red between phases.

---

## 3. Phase plan

### Phase 0 — Safety net (do first, small)

- Run and record a green baseline: `pnpm test:e2e` (note flakes).
- **Harden selectors:** the suite leans on MUI role/label/text. Before touching UI, add stable
  `data-testid`s to elements each spec depends on (grep specs in `e2e/web/tests/` for
  `getByText`/`getByLabel` that reference styling-coupled text) and switch the most fragile
  selectors over. This decouples specs from the redesign.
- Add a `docs/REDESIGN_PROGRESS.md` checklist (phase → status → date → notes) updated at the end
  of every session.

### Phase 1 — Design tokens & theme (foundation)

Build `src/theme/` per D1. Steps:

1. Extract the `Theme`/`CalColor` objects from the shared module inside
   `designs/redesign/01-month-view-desktop.html` (decode the `__bundler` payload; the tokens are
   listed in this plan's source exploration and in `00-design-system.html`).
2. `tokens.ts` + `theme.ts` with `colorSchemes` light/dark + typography (Inter) + shape + component
   overrides for: Button, Card/Paper, TextField/OutlinedInput, Dialog, Switch, Checkbox, Radio,
   Chip, Menu/Popover, Tabs.
3. Mode + accent settings in `stores/settings.ts` (persisted; "System" follows media query).
4. Wire into `src/App.tsx`; delete old `src/theme.ts`.
5. **Exit criteria:** app runs with new tokens globally, dark mode toggles (even with no settings
   UI yet — a temporary toggle is fine), all E2E green.

### Phase 2 — App shell & UI primitives

- Build `src/components/ui/` primitives (D1 list). Storybook is optional; at minimum a `/dev/ui`
  route behind `import.meta.env.DEV` to eyeball them in light/dark.
- Rebuild the shell: desktop `TopBar` (64px: logo, prev/next, date title, search ⌘K, ViewSwitcher,
  Today, notifications bell, relay dots, avatar) + `Sidebar` (268px: New event, mini calendar,
  MY CALENDARS toggles, BOOKING PAGES, footer settings/theme toggle); mobile `MobileTabBar`
  (Calendar / Bookings / Alerts / Settings). Refs: any of `01/03/04`, mobile `09/10`.
- Keyboard shortcuts: C, T, M/W/D, ←/→, ⌘K (a `useKeyboardShortcuts` hook in the shell).
- Routing: add `/settings` route now (empty page is fine until Phase F-SET).
- **Exit criteria:** navigation works desktop+mobile, existing views render inside new shell,
  `navigation.spec` + `mobile.spec` green.

### Phase 3 — Nostr layer consolidation (zero wire-format change)

Create `src/nostr/` and drain `src/common/nostr.ts` into it:

- `core.ts` — `buildAndSign(unsigned)` (kills the ~12× sign-and-hash copies), `makeDTag(input)`
  (sha256/30-char idiom, 4+ copies), monotonic `nextCreatedAt(prev)` (3 copies).
- `crypto.ts` — one self-encrypt/decrypt pair (currently **two different idioms** coexist:
  conversation-key-with-own-sk vs signer-based); one `getUserPublicKey` (currently defined in both
  `nostr.ts:46` and `nip59.ts:72`); NIP-59 gift wrap create/unwrap (merge `nip59.ts` + the
  duplicated rumor-building/`getTag` closures in `bookingRequests.ts` and `BookingPage.tsx`).
- `fetch.ts` — `fetchLatest(filters)` / `fetchAll(filters)` factory over `collectOnce` (kills the
  8× fetcher shells: profile, relay lists, scheduling keys, busy lists, form responses, reports).
- `subscribe.ts` — standing-subscription factory (handle + processedIds + re-observe guard),
  replacing the 4 reimplementations in `events.ts`, `invitations.ts`, `bookingRequests.ts`,
  `schedulingPages.ts`.
- Domain modules: `events.ts`, `rsvp.ts`, `calendars.ts`, `booking.ts`, `busy.ts`, `relays.ts`,
  `profiles.ts`, `invitations.ts` — thin, built on the above. `EventConfigs.ts` kinds enum moves
  here as `kinds.ts`.
- **Move `BookingPage.tsx`'s inline protocol code** (gift-wrap build, nip44 decrypt, gossip-relay
  loops, `sendBookingRequest`) into `nostr/booking.ts` + the store. Components stop importing
  `dataLayer`/`nip44` directly (lint rule: restrict imports of `dataLayer` to `src/nostr/` and
  `src/stores/`).
- **Bug fixes allowed in this phase** (write-side, parsers already tolerant — no migration needed):
  - `["image", location]` → `["location", …]` (data-loss bug, fix immediately).
  - `["name", title]` → emit `["title", …]` (keep parser reading both).
- **Exit criteria:** `common/nostr.ts` deleted or reduced to re-exports; full E2E green; published
  events byte-compatible except the two tag fixes above.

_Phases 1–2 and 3 are independent — can be done in either order or interleaved._

---

## 4. Flow phases (pick up one at a time, in any order after Phases 0–3)

Each flow phase = rebuild UI per redesign scope given that session + apply that flow's approved
protocol decisions + decompose its giant files + update its specs. **Do not start a flow until its
"Nostr layer inputs" section is filled in.**

Template for the inputs (copy into the session prompt):

```
## Nostr layer inputs — <flow>
- Scope: which parts of the mockups to build / explicitly skip
- Kinds/tags: keep as-is | change to <X> (migration: dual-read? dual-write? cutoff?)
- New protocol behavior: <e.g. add p/e tags to RSVPs, adopt 31922, tzid tags>
- Interop target: our clients only | other NIP-52 clients must read this
- nips/ doc to update: <file> (code and doc must match when the phase ends)
```

### F-VIEWS — Month / Week / Day views

- **Current:** `Calendar.tsx` → `MonthView.tsx` / `WeekView.tsx` / `DayView.tsx`, date routing in
  `utils/dateBasedRouting.ts`, `hooks/useDateWithRouting.ts`.
- **Design:** `01` `02` (interactions: hover popover, quick view, drag-move) `03` `04` `08` (dark)
  `09` `10` (mobile month/day).
- **E2E:** `calendar-management`, `navigation`, `mobile`, parts of `event-crud` (grid selectors:
  `day-hour-cell`, `data-date`).
- **Nostr layer inputs:** _(fill in — likely none, views are read-only over stores)_

### F-EVENT-VIEW — Event details + RSVP

- **Current:** `CalendarEvent.tsx` (976 — decompose), `RespondPanel.tsx`, `hooks/useEventRsvps.ts`.
- **Design:** `12` (mobile bottom sheet), event popovers in `02`.
- **E2E:** `rsvp`, `respond`, `event-delete`, `event-duplicate` (`rsvp-*`, `delete-option-*`).
- **Nostr layer inputs:** _this is a view only change. nostr layer should not need changing ideally. confirm and report back_

### F-EVENT-EDIT — Create / edit event

- **Current:** `CalendarEventEdit.tsx` (1808) — **follow `docs/refactor-calendar-event-edit.md`**,
  it already specifies the decomposition (recurrence utils, CustomRecurrenceDialog, section
  components, useEventSave hook, ~400-line composition root). Also `EditEventPage.tsx`,
  `DuplicateEventPage.tsx`, `utils/repeatingEventsHelper.ts`.
- **Design:** `05` (desktop modal: underline title, WHEN block, busy/free, public/private, people
  by npub/NIP-05, Formstr form attach, "More options"), `11` (mobile sheet).
  1. If an event spans the complee day, it should be displayed as an all day chip at the top of the week and day view just below the date bar. the designs do not exist strictly for this, but do it.
- **E2E:** `event-crud`, `event-edit`, `event-recurrence`, `event-participants`
  (`recurrence-select`, `recurrence-end-mode`).
- **Nostr layer inputs:** There are a few changes to be made:
  1. I want to change the participant invitation kind. Participant invitation kinds are now Nip 17 DMs. The content of the rumor should be the text: 'X has invited you to the <Event title> on <Date>'. The rest of the structured information should go into the tags as usual.
  2. The outer event(gift wrap) should contain a k tag with the value of 1052 to fetch only the invitation event kinds.
  3. Also add another tag inside the rumor: ['signing_nsec', <nsec with which the main gift wrap is signed>]. The main idea is that the invited user should be able to delete the gift wrap.
  4. There will need to be changes in the invitation flow. Add these changes as notes in the that phase in this document.

### F-LOGIN — Auth

- **Current:** `LoginModal.tsx` (967 — decompose into per-method panels), `Auth.tsx`,
  `UserMenu.tsx`, `common/signer/index.ts` (do not break legacy restore — E2E contract D5).
- **Design:** `22` `23` (method list → expandable panels: NIP-07, nsec+passphrase, NIP-46 QR,
  create account).
  1. add option to download and upload ncryptsec. next to the the i have saved it button, add a download button. for uploading, if the input is blank, add a upload button. The file saved should be key.txt. and only txt files should be upload allowed. it should also work in capacitor apps.
- **E2E:** `auth` (`login-submit-nsec`, injection contract). add an e2e test for upload/download nsec
- **Nostr layer inputs:** _no changes required_

### F-SET — Settings (NEW surface)

- **Current:** none (`/settings` route added in Phase 2; `stores/settings.ts`, `stores/relays.ts`,
  `RelayManager` UI exists somewhere in components).
- **Design:** `06` (general: week start, 12/24h, timezone, default view/duration, reminders, work
  hours), `07` (appearance: theme, accent presets, density, calendar colors), `13` (mobile).
  **Follow memory/feedback: no iOS-style settings — switches/chips for toggles, dropdowns for
  selects, on mobile too.**
- **E2E:** `relay-manager` (relays UI moves here); new spec for appearance.
- **Nostr layer inputs:** _(fill in — candidate: sync settings/appearance across devices via a
  self-encrypted replaceable event? Which kind? Or local-only for now?)_

### F-NOTIF — Notifications / invitations

- **Current:** `InvitationPanel.tsx`, `NotificationEventPage.tsx`, `stores/invitations.ts`,
  `stores/notifications.ts`, gift-wrap flow (kind 1052, rumor kind 14 as of F-EVENT-EDIT — see
  below), participant-removal kind 84.
- **Design:** no dedicated screen; bell in TopBar + Alerts tab in MobileTabBar.
- **E2E:** `invitations` (`invitation-card`).
- **Nostr layer inputs:** _(fill in — **the big one: gift-wrap kind 1052 → NIP-59-standard 1059?**
  Needs dual-read (accept both) + decide write cutoff, since old app versions won't see 1059
  wraps. Kind 84 removal stays per NIP-52E?)_
- **Notes carried over from F-EVENT-EDIT's invitation-flow rework** (per its nostr layer inputs
  item 4 — read before scoping this phase):
  - The invitation rumor is now kind `14` (NIP-17 chat message) with real content (`"{sender} has
invited you to the {title} on {date}"`), not empty-content kind `52`. `getDetailsFromGiftWrap`
    returns this as `message`; `IInvitation`/`InvitationPanel` don't surface it yet — F-NOTIF should
    decide whether to show it (mockups have no invitation-card spec either way).
  - The gift wrap gained a `["signing_nsec", ...]` rumor tag (the ephemeral key it's signed with)
    and a `["k", "1052"]` wrap tag. `dismissInvitation`/`reportInvitation` now also publish a NIP-09
    kind-5 deletion signed with that key when present (see `deleteGiftWrapAsRecipient` in
    `nostr/events.ts`) — this is additive to, not a replacement for, the kind-84 notice, since
    `InvitationWorker.java` (Android background worker) keys its own-notification suppression off
    kind 84 and never decrypts anything, so it needed no changes and must keep receiving kind 84.
  - If this phase moves the wrap kind to 1059, keep the `k=1052` tag semantics (it identifies the
    _invitation_ content, independent of the wrap's own kind) so old and new wraps stay
    distinguishable from booking/DM traffic sharing the same outer kind.
  - Old pending invitations (rumor kind `52`, no `signing_nsec`) still decode fine — nothing
    validates rumor kind, and `signingNsec`/`message` are optional — but they can't use the new
    NIP-09 deletion path; the kind-84 fallback still covers them.

### F-BOOK-EDIT — Booking page editor | F-BOOK-INBOX — Bookings inbox | F-BOOK-PUBLIC — Public booking link

- **Current:** `SchedulingPageEdit.tsx` (1030), `BookingNotifications.tsx` (571),
  `BookingPage.tsx` (753), `utils/availabilityHelper.ts` (596), stores `schedulingPages.ts`,
  `bookingRequests.ts`, `busyList.ts`. Kinds 31927/32680/31926 + rumors 57/1057/58/1058 per
  `SCHEDULING_PROTOCOL.md` / `nips/NIP-Appointment-Scheduling.md`.
- **Design:** `14`–`19` (editor w/ live preview, Incoming/Outgoing inbox, Calendly-style public
  page; mobile variants). Treat as three separately schedulable sub-flows.
- **E2E:** `booking`, `scheduling-builder` (`booking-request-card`).
- **Nostr layer inputs:** _(fill in per sub-flow — booking kinds stay custom per the NIP proposal?
  same 1052→1059 gift-wrap question applies to 1057/1058)_

### F-EVENT-LINK — Public event landing page

- **Current:** `ViewEventPage.tsx` (public naddr view). Design shows banner, going/maybe counts,
  guest RSVP, add-to-calendar (Formstr/.ics/Google), "Message host" — **most of this is
  in the not-yet bucket; scope strictly per session instructions.**
- **Design:** `20` `21`.
- **E2E:** `ics`, parts of `rsvp`.
- **Nostr layer inputs:** _(fill in — guest/unauthenticated RSVP? banner image tag (fixes the
  image tag properly)? counts require fetching all RSVPs)_

### F-CAL-MGMT — Calendar list management

- **Current:** `stores/calendarLists.ts`, `common/calendarList.ts` (kind 32123 self-encrypted),
  sidebar calendar toggles.
- **Design:** sidebar in `01`+, calendar color editors in `07`.
- **E2E:** `calendar-management` (`calendar-row`, `calendar-list-select`,
  `calendar-visibility-checkbox`).
- **Nostr layer inputs:** _(fill in — stay on 32123 per NIP-52E vs also publish public NIP-52
  31924 calendars for interop? calendar color as a tag?)_

---

## 5. NIP compliance track (cross-cutting)

| Change                                                      | Risk                                          | Strategy                                                                                                                              | When             |
| ----------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `image`→`location` tag bug                                  | none (bug fix)                                | write-side fix                                                                                                                        | Phase 3          |
| `name`→`title` tag                                          | none (parser reads both)                      | write `title`, read both                                                                                                              | Phase 3          |
| RSVP `p`/`e` tags                                           | none (additive)                               | just add                                                                                                                              | F-EVENT-VIEW     |
| `start_tzid`/`end_tzid`                                     | none (additive)                               | just add                                                                                                                              | F-EVENT-EDIT     |
| 31922 all-day events                                        | medium — new kind, old clients won't see them | decide in F-EVENT-EDIT inputs                                                                                                         | F-EVENT-EDIT     |
| Gift wrap 1052→1059 (and 1057/1058)                         | **high — breaks old clients' inboxes**        | dual-read first, dual-write or cutoff per user decision                                                                               | F-NOTIF / F-BOOK |
| Custom kinds (32678, 32069, 32123, 31926, 31927, 32680, 84) | interop-only                                  | keep, but keep `nips/NIP-52E.md`, `NIP-52R.md`, `NIP-Appointment-Scheduling.md` in lockstep with code; fix doc-vs-code drift as found | ongoing          |
| Public 31924 calendars                                      | optional interop win                          | decide in F-CAL-MGMT                                                                                                                  | F-CAL-MGMT       |

**Rule:** every wire-format change updates the matching doc in `nips/`/`PROTOCOL.md` in the same
change, and states its migration story (dual-read window, write cutoff, affected old versions).

---

## 6. Dependency graph

```
Phase 0 (safety net)
   ├── Phase 1 (theme) ──► Phase 2 (shell + primitives) ──► any F-* flow
   └── Phase 3 (nostr consolidation) ────────────────────► any F-* protocol change
F-VIEWS before F-EVENT-VIEW (popovers/sheets anchor in the views)
F-SET appearance section needs Phase 1 accent/mode plumbing
All other F-* flows are independent of each other
```

Suggested order: 0 → 1 → 3 → 2 → F-VIEWS → F-EVENT-VIEW → F-EVENT-EDIT → F-LOGIN → F-SET →
F-NOTIF → F-CAL-MGMT → bookings (3 sub-flows) → F-EVENT-LINK.

---

## 7. Per-session protocol

Prompt template to start a session:

```
Read docs/REDESIGN_MASTER_PLAN.md and docs/REDESIGN_PROGRESS.md.
We're doing <Phase N / F-XXX>.

Scope for this session: <exactly what to build; what shown in mockups to SKIP>

## Nostr layer inputs — <flow>
<filled-in template from the flow's section, if protocol work is involved>

Rules: follow the plan's decisions D1–D5; e2e for the touched specs must be green before we
finish; update REDESIGN_PROGRESS.md and any touched nips/ docs.
```

Per-session exit checklist:

- [ ] `pnpm typecheck && pnpm lint`
- [ ] `pnpm test:e2e` (at minimum the specs listed for the flow; full suite at phase completion)
- [ ] No component imports `dataLayer`/`nip44` directly (Phase 3 onward)
- [ ] New/changed UI uses tokens & primitives — no hardcoded colors/radii in `sx`
- [ ] `docs/REDESIGN_PROGRESS.md` updated
- [ ] Wire-format changes: matching `nips/`/`PROTOCOL.md` doc updated

---

## 8. Guardrails (repeat every session)

1. **Designs are guidelines.** Build only what the session scope says. Mockup features not in
   scope (Message host, add-to-Google, accent sync, search, drag to move …)
   are skipped without asking.
2. **E2E green is the definition of done** for every phase. A failing spec is either a real
   regression (fix the app) or an intentional DOM change (fix the spec in the same change).
3. **No wire-format changes outside an approved "Nostr layer inputs" block** — except the two
   Phase 3 bug fixes.
4. **Theming discipline:** every color/spacing/radius comes from `src/theme/tokens.ts` via the
   MUI theme or CSS variables. If a new value is needed, add a token, don't inline it.
   **Minimize inline `sx`:** when a style pattern repeats 3+ times in a file (or across the
   files touched in a phase), hoist it to a theme component-slot override (`src/theme/theme.ts`)
   if it's a MUI component variant, or a local `styled()` extraction if it's bespoke markup.
   Reserve `sx` for genuinely one-off/contextual overrides.
5. **File size discipline:** no new file over ~300 lines; when touching a giant file, carve out
   at least the piece you're working on into the feature folder.
6. **Settings controls:** switches/chips for toggles, dropdowns for selects — including mobile.
   No iOS-style settings lists.
7. **Design-decoding technique — use this instead of screenshotting.** Each
   `designs/redesign/*.html` mockup is a self-contained "bundler" export: a `<script
type="__bundler/manifest">` (shared runtime asset blobs, identical across mockups) plus a
   `<script type="__bundler/template">` whose text content is a **JSON-encoded string of the real
   page HTML**, including the unminified `<script type="text/babel">` JSX source (styles object,
   mock state, full component tree, interaction handlers). Decode with:

   ```python
   import re, json
   content = open("designs/redesign/NN-name.html").read()
   m = re.search(r'<script type="__bundler/template">(.*?)</script>', content, re.DOTALL)
   html_source = json.loads(m.group(1))  # contains the real <script type="text/babel"> JSX
   ```

   This recovers exact copy, state shapes, and interaction logic (collapse/toggle behavior, hover
   states, conditional rendering) that a screenshot can't show. Decode every mockup a flow phase
   touches before building against it.
