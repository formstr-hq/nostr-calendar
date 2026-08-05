# Device Calendar Integration (Android + iOS) — nostr-calendar

## Context

The app has a half-built device-calendar feature: a working, read-only Android native plugin (`DeviceCalendarPlugin.java`) that already merges device events into the main calendar view via `useVisibleDeviceEvents`/`Calendar.tsx`, but the only UI that could request calendar permission (`DeviceCalendarsSection.tsx`) was never mounted anywhere — so in practice it's dead. iOS has zero native calendar code. The user wants this finished properly: full read **and write** support on both platforms, device events editable through the same editor Nostr events use, notifications working for them, and the sidebar/settings calendar lists reorganized into "Synced" vs "Device only" groups with matching functionality (including, per explicit decision, updatable calendar color that writes back to the OS calendar).

Two decisions were confirmed with the user up front:
- **Calendar color**: attempt a real native write-back to the OS calendar's color; if the OS/account rejects it (common for some Google-synced calendars), silently fall back to an app-side-only display override rather than failing visibly.
- **Recurring device events**: editing always applies to the **whole series** — no "this event vs. all events" prompt in v1.

Research (two rounds — initial exploration, then direct file verification) surfaced three load-bearing issues not obvious from the surface request, all confirmed by reading the actual code:
1. `EditEventPage.tsx:99,114` gates editing on `loadState.event.user === user?.pubkey`. Device events carry the OS event's organizer string in `user`, so this would silently reject every device-event edit. **Do not weaken this gate** (it's correct and security-relevant for real Nostr events) — route device edits through a new sibling page instead.
2. Reminders are **not** JS-scheduled end-to-end. `NotificationWorker.java` (Android) and `IOSNotificationScheduler.swift` (iOS) read `cal:events`/`cal:calendar_lists`/`cal:notification-preferences` directly out of native storage (`Preferences`/`setSecureItem`, confirmed in `src/common/localStorage.ts` and `src/stores/events.ts:57-60`) to do background reconciliation. Device events currently live only in plain `localStorage` (`getItem`/`setItem`, confirmed in `src/stores/deviceCalendars.ts:11`), which native code cannot see — this is *why* device events get zero reminders today, and fixing it requires a native-readable snapshot, not just calling the existing JS scheduling functions.
3. `CalendarListSelect.tsx` (used by both editor forms) sources exclusively from `useCalendarLists()` (Nostr calendars). For a device event, `calendarId` is `device:<nativeId>`, which matches nothing there — reusing the editor unmodified would let a user attempt to "move" a device event onto a Nostr calendar, which isn't a real operation. The picker must be locked to a static, read-only display when editing a device event.

## Scope decisions (explicit)

- Editing an **existing** device event is in scope. Creating a brand-new device-only event from within the app is **out of scope for v1** (not requested; would require exposing device calendars as create-flow targets, a separate can of worms). Note as a natural follow-up.
- The calendar picker is **locked/read-only** when editing a device event (name + color shown, no dropdown) — moving events between OS calendars/accounts isn't a safe portable operation on either platform.
- Recurring device events: writes always target the series (Android: `CalendarContract.Events` master row, never touching `Instances`/exception rows; iOS: `EKEvent.save(event:span:.futureEvents)`, never `.thisEvent`).
- Form-attachment UI is hidden entirely for device events (no forms concept on device calendars).

## 1. Native layer

### Android — `android/app/src/main/java/app/formstr/calendar/DeviceCalendarPlugin.java`
- Add `Manifest.permission.WRITE_CALENDAR` to the existing single `@Permission(alias = PERM_ALIAS, ...)` block (read+write requested together, no new alias, no TS-visible shape change). Add `<uses-permission android:name="android.permission.WRITE_CALENDAR"/>` to `AndroidManifest.xml`.
- Add a `parseEventId(String compositeId)` helper: `listEvents` returns ids as `"<instanceId>:<eventId>"` (confirmed at the `obj.put("id", instanceId + ":" + eventId)` line) — every write/delete must operate on the real `eventId` against `CalendarContract.Events`, never the instance id (Instances is a regenerable cache). Fail loudly if a bare/malformed id is passed.
- `createEvent` — insert into `CalendarContract.Events.CONTENT_URI` (`CALENDAR_ID`, `TITLE`, `DESCRIPTION`, `EVENT_LOCATION`, `DTSTART`, `EVENT_TIMEZONE`, and `DTEND` for non-recurring or `DURATION`+`RRULE` for recurring — Android requires RFC5545 `DURATION` instead of `DTEND` whenever `RRULE` is set). All-day events: `ALL_DAY=1`, UTC-midnight millis. Return the bare `eventId` (via `ContentUris.parseId`) — no instance id exists yet for a fresh row.
- `updateEvent` — parse id, build `ContentValues` from whatever fields are supplied, update via `ContentUris.withAppendedId(Events.CONTENT_URI, eventId)`. No exception-row handling (whole-series only).
- `deleteEvent` — parse id, delete the same URI (deletes the whole series for recurring events, matching scope).
- `updateCalendarColor` — re-check `CALENDAR_ACCESS_LEVEL >= CAL_ACCESS_CONTRIBUTOR` (same threshold `listCalendars` already uses for `canWrite`); if below, resolve `{ applied: false }` (not a throw). If allowed, `ContentResolver.update` the `CALENDAR_COLOR` field and resolve `{ applied: true }` on `rows > 0`. Note in comments: some sync adapters (notably some Google accounts) can silently revert this on next sync — that's exactly what the JS-side override fallback (§3) is for; don't try to verify the write "stuck," it's inherently racy.
- Add `colorHexToInt` (inverse of the existing `colorIntToHex`).
- Update the stale class comment ("Bridges the device's calendar database to the JS layer. Read-only.").

### iOS — new files, mirroring the existing plugin registration pattern (`KeyBackupPlugin.swift`/`NotificationSchedulerPlugin.swift`)
- `ios/App/App/DeviceCalendarPlugin.swift` (thin `CAPPlugin`/`CAPBridgedPlugin`, `jsName = "DeviceCalendar"` to match the TS `registerPlugin("DeviceCalendar")` call) + `ios/App/App/IOSDeviceCalendarStore.swift` (owns the `EKEventStore`, mirrors the existing scheduler split). Register in `AppDelegate.swift` via `CAPBridge.registerPlugin(DeviceCalendarPlugin.self)`.
- Permissions: iOS 17+ via `EKEventStore.authorizationStatus(for: .event)` + `requestFullAccessToEvents` (always request full access, never write-only, since read+write are both needed); pre-17 fallback via `requestAccess(to:completion:)` guarded by `if #available(iOS 17, *)`. Map to the existing 4-state contract: `.fullAccess`/granted → `"granted"`, `.denied`/`.restricted` → `"denied"`, `.notDetermined` → `"prompt"`, `.writeOnly` → `"prompt-with-rationale"` (signals a re-request is needed).
- `Info.plist`: add `NSCalendarsFullAccessUsageDescription` and `NSCalendarsUsageDescription` (pre-17 back-compat). Skip `NSCalendarsWriteOnlyAccessUsageDescription` (unused, since full access is always requested).
- `listCalendars` — `eventStore.calendars(for: .event)` → `{ id: calendarIdentifier, name: title, accountName: source.title, color: cgColor→hex, isPrimary, canWrite: allowsContentModifications }`.
- `listEvents` — `predicateForEvents(withStart:end:calendars:)` + `events(matching:)`. EventKit has no per-occurrence id concept the way Android's Instances table does (`eventIdentifier` is shared across a whole series), so synthesize the same composite shape the TS layer expects: `"\(startDate millis):\(eventIdentifier)"`. RRULE reconstruction from `EKRecurrenceRule` (and its inverse for writes) is the trickiest piece of this plugin — isolate it in a small pure function so its logic is self-contained and easy to reason about/verify independently of `EKEventStore`.
- `createEvent`/`updateEvent` — build/mutate `EKEvent` (`calendar`, `title`, `notes`, `location`, `startDate`/`endDate`, `isAllDay`, `recurrenceRules`), save with `span: .futureEvents` always (never `.thisEvent`, per whole-series-only scope). `updateEvent` first fetches via `eventStore.event(withIdentifier:)` using the real identifier parsed from the composite id.
- `deleteEvent` — `eventStore.remove(event, span: .futureEvents, commit: true)`.
- `updateCalendarColor` — `calendar.cgColor = ...; try eventStore.saveCalendar(calendar, commit: true)`, only when `allowsContentModifications` and not a birthday calendar; catch failures and resolve `{ applied: false }` (attempt-and-catch is the only reliable signal on iOS, unlike Android's access-level pre-check).

## 2. TS bridge — `src/plugins/deviceCalendar.ts`
- `isAvailable()`: `["android", "ios"].includes(Capacitor.getPlatform())`.
- Extend `DeviceCalendarPluginShape` with `createEvent`, `updateEvent`, `deleteEvent`, `updateCalendarColor` (new `CreateDeviceEventOptions`/`UpdateDeviceEventOptions` types: `calendarId`, `title`, `description`, `location`, `beginMs`, `endMs`, `allDay`, `rrule?`). Same `isAvailable()` guard pattern as existing read methods. Update the stale "iOS: not implemented yet" file comment.

## 3. Store — `src/stores/deviceCalendars.ts`
- New persisted state `colorOverrides: Record<string, string>` (`cal:device_color_overrides`, plain `getItem`/`setItem` — see note below on why this deliberately stays off the native-visible storage layer).
- `requestAccess()` → rename `requestWriteAccess()`, implementation unchanged (it already requests the combined read+write permission per §1). It was dead code only because nothing called it — wire it up in §7, don't rewrite it.
- New actions: `createDeviceEvent`, `updateDeviceEvent`, `deleteDeviceEvent` (thin wrappers calling the new bridge methods; on success, optimistically patch `events` in place rather than waiting for the next poll, matching how `useTimeBasedEvents.updateEvent()` behaves for Nostr saves). `setColorOverride`/`clearColorOverride` (local + persisted). `updateCalendarColor(nativeCalendarId, color)` — calls the native bridge; if `applied === true`, patch `calendars` state and clear any existing override for that id; if `false`, call `setColorOverride`. This single action is the only thing the color-picker UI needs to call — it owns the fallback branching internally.
- Add write-failure error message entries alongside the existing read ones.

## 4. Adapter — `src/utils/deviceCalendarAdapter.ts`
- `calendarEventToDeviceFields(event: ICalendarEvent)` — inverse mapping for writes: strip `DEVICE_CALENDAR_ID_PREFIX`, `begin`→`beginMs`, `end`→`endMs`, `location[0]`→`location` (joined if multiple), `repeat.rrule`→`rrule`.
- `deviceEventStableId(compositeOrBareId, nativeCalendarId)` → `` `device:${nativeCalendarId}:${eventIdPart}` `` — derived from the real-eventId half only (splitting off the unstable instance-id half). **Use this as the notification-scheduling key everywhere**, not the raw composite `event.id` (which stays as-is for React `key` props and as the argument to native write/delete calls, since those genuinely need the current id shape).
- `deviceCalendarColor(info, override?)` — extend with an optional override parameter checked first; both call sites (`eventChipColor.ts`, sidebar/settings rows) pass the store's `colorOverrides` entry in.

## 5. Editor / save flow
- **`src/features/event-editor/hooks/useEventSave.ts`**: at the top of `handleSave`, branch on `eventDetails.source === "device"` before any existing `isPrivate`/mode logic. This path must fully bypass all Nostr publish machinery (`publishPrivateCalendarEvent`/`editPrivateCalendarEvent`/`publishPublicCalendarEvent`, `PublishStepDefinition`/relay steps — no publish-progress UI), `useTimeBasedEvents` add/update, and `useCalendarLists` (no calendar move) — call `useDeviceCalendars.getState().updateDeviceEvent(...)` instead (mode is always "edit"; no device create path per scope). It **must still run** notification-preference persistence and `scheduleEventNotifications`/`cancelEventNotifications`, keyed by `deviceEventStableId(...)` instead of `savedEvent.id`. Verify `isBusyListRangeSupportedForEvent` already excludes device events (it should, via its existing `source` check) — busy-list support isn't requested.
- **`src/features/event-view/components/EventActionsBar.tsx`**: replace the current "ICS export + close only" early-return for `source === "device"` with a version that keeps ICS export but adds Edit (navigates to a new device-specific route, not `getEditEventPage`, which assumes Nostr identity) and Delete. Duplicate stays excluded.
- **`src/features/event-view/components/DeleteEventDialog.tsx`**: replace the defensive `if (event.source === "device") return null` with a real delete path. Recommend a small **new** `DeleteDeviceEventDialog.tsx` (simple "Delete from device calendar / Cancel", no `deleteForEveryone`/`removeFromCalendar`/`ignore` radio group — none of that Nostr-deletion machinery applies) rather than branching the existing 330-line dialog. Calls `deleteDeviceEvent` then cancels notifications keyed by `deviceEventStableId`.
- **New route**: `ROUTES.EditDeviceEventPage = "/event/edit/device/:eventId"` + `getEditDeviceEventPage()` in `routingHelper.ts`, registered in `Routing.tsx`. New `src/components/EditDeviceEventPage.tsx` — a small sibling of `EditEventPage.tsx`, **not** a branch inside it (keeps the Nostr pubkey-authorization gate at `EditEventPage.tsx:99,114` completely untouched). Reads event from location state, renders `<CalendarEventEdit>` directly with **no** pubkey check (device events are inherently local-only, "authorized author" doesn't apply).
- **Hide form UI**: in `EventEditDesktopForm.tsx`/`EventEditMobileForm.tsx`, wrap `<EventAttachmentsSection .../>` in `{eventDetails.source !== "device" && ...}`.
- **Lock the calendar picker**: in `CalendarLocationGroup.tsx` (mobile) and the desktop form's inline `CalendarListSelect` usage, when `source === "device"` render a static name+color row (reusing the existing `CircleIcon` pattern) instead of the `<Select>`, sourced from `useDeviceCalendars()` by stripping the `device:` prefix.

## 6. Notifications
- **Save-triggered** (covered in §5): immediate scheduling on edit, keyed by `deviceEventStableId`, gives parity with Nostr for the "edited inside this app" case.
- **Background reconciliation** (the actual gap — device events edited outside the app, or never opened in the editor, currently get zero reminders): extend `useDeviceCalendars.refreshEvents()` to, after each successful `listEvents`, write a rolling window of upcoming visible device events (reuse the existing `NOTIFICATION_SCHEDULE_WINDOW_MS` from `src/utils/notifications.ts`) to a **new native-readable key** via `setSecureItem("cal:device_events", ...)` — deliberately different from `visibility`/`colorOverrides`, which stay on plain `localStorage` since native code never needs to see them (visibility filtering already happens JS-side before anything reaches this snapshot). Shape: `{ id: deviceEventStableId(...), title, beginMs, calendarId, rrule? }[]`. Also call this write immediately after create/update/delete in the store, in addition to the `useEventSave.ts` call.
  - **Android**: extend `NotificationWorker.java`'s `doWork()` (near the existing `EVENTS_KEY` read at line ~97) to also read `cal:device_events` and feed it through the same `collectEventNotifications`/`desired` merge, using a fixed default reminder offset (no per-event/per-calendar preference concept for device events — don't try to look them up in the Nostr-only `NOTIFICATION_PREFERENCES_KEY`/`CALENDARS_KEY` maps).
  - **iOS**: symmetric change to `IOSNotificationScheduler.swift`'s reconciliation, reading the equivalent `UserDefaults` key.
  - Document as a known limitation: this snapshot is only as fresh as the last time the JS layer had that date range visible — not a live background poll of the OS calendar provider. Real improvement over today's zero reminders, but not "true" background freshness; call this out rather than overselling it.

## 7. UI

**Phone icon + "in your device calendar" text**
- `src/components/ui/EventChip.tsx`: add `isDevice?: boolean`, render a phone icon (`PhoneIphone`/`Smartphone` from `@mui/icons-material`) before the title using the same pattern as the existing `isPublic && <PublicIcon/>`. Plumb through from all call sites (`EventCard.tsx`'s `CalendarEventCard`/`AllDayEventChip`, `MonthView.tsx`, `EventQuickPeek.tsx`) via `isDevice={event.source === "device"}`.
- `src/features/event-view/components/EventChipsRow.tsx`: replace the current `if (event.source === "device") return null` with a chip showing the phone icon and text "in your device calendar" (new i18n key), styled like the existing calendar-name chip (not the public/private one, which doesn't apply).

**Sidebar — `src/components/SidebarContent.tsx`**
- New shared component `src/components/ui/CollapsibleGroup.tsx` (title, `defaultOpen`, children, optional trailing action slot) — neither existing ad-hoc pattern in the codebase (`SettingsNavigation.tsx`'s heavier animated MUI `Collapse`+chevron-button, or `styled.ts`'s `CollapseToggle` built for single-toggle form subsections) fits a "header row + checkbox-list body + action button" shape, so build one small reusable piece instead of hand-rolling twice.
- Replace the flat `calendars.map(...)` (lines 226-267) with two `CollapsibleGroup`s, both `defaultOpen`: **"Synced"** wraps the existing Nostr body unchanged; **"Device only"** is new, sourced from `useDeviceCalendars()` (`calendars`, `visibility`, `toggleVisibility`, `permission`, `requestWriteAccess` for the connect CTA — this is where the previously-dead permission request finally gets wired to reachable UI), grouped by `accountName`. Only rendered when `useDeviceCalendars((s) => s.available)` is true.
- **Delete `src/components/DeviceCalendarsSection.tsx` entirely** — it's dead/unused (never imported). Lift its two useful pieces (the `accountName`-grouping `Map`/`Array.from(...).sort()` logic, and the checkbox/color row JSX) directly into `SidebarContent.tsx`, re-themed to match the existing row styling for visual consistency between the two groups.
- `src/components/CalendarManageDialog.tsx`: add an optional `deviceCalendar?: DeviceCalendarInfo` prop (mutually exclusive with `calendar?: ICalendarList`) + `onSaveDeviceColor?`. When set: hide title/description fields and the notification-preference select (none of those concepts apply), show only the color picker plus read-only name/account subtitle, no delete action. Wired to `updateCalendarColor` from §3.

**Settings — `src/features/settings/CalendarsSettingsPage.tsx`**
- Same restructuring: wrap the existing "Calendar colors" card body in a `CollapsibleGroup` labeled "Synced", add a second card/group labeled "Device only" with the same row shape, gated on `available`, reusing `useDeviceCalendars()` and the device variant of `CalendarManageDialog` the same way as the sidebar.

## 8. Keep vs. discard

| Item | Verdict | Why |
|---|---|---|
| `DeviceCalendarsSection.tsx` | Delete | Dead, never imported; useful bits lifted inline into `SidebarContent.tsx` since the requirement folds it into one grouped list, not a separate section. |
| `useDeviceCalendars.requestAccess()` | Keep, rename, wire up | Implementation is correct; the bug was the missing call site, not the logic. |
| Composite `id` (`instanceId:eventId`) as `ICalendarEvent.id` | Keep for render/React-keys and native write/delete calls | Correct for its original purpose; instability issue is solved via `deviceEventStableId` for notification keys specifically, not by changing `.id`'s shape everywhere it's used. |
| `DeleteEventDialog.tsx` device bail-out | Replace with new small dedicated dialog | Its `DeleteOption` state machine has no device analog; a focused ~80-line sibling beats a fourth branch on an already-330-line component. |
| `EventActionsBar.tsx` device early-return | Adapt, don't discard | Keep ICS export + native gating; add Edit/Delete alongside. |
| `EditEventPage.tsx` pubkey gate | Do not touch | Correct and security-relevant for real Nostr events; route around it via `EditDeviceEventPage.tsx`. |

## 9. Verification

**Can run here:** `pnpm typecheck` and `pnpm lint` (both already required gates per the repo's `prebuild` script) across all TS changes. Any new pure helpers (`deviceEventStableId`, `calendarEventToDeviceFields`, id-parsing, and ideally the iOS RRULE↔`EKRecurrenceRule` logic as an isolated pure function) should be structured so they're unit-testable, though note the repo currently has **no JS test runner** (only Playwright e2e + one Android JUnit test) — relying on typecheck/lint plus manual verification matches existing repo convention.

**Android — verifiable in this environment.** The Android SDK, `adb`, and emulator AVDs (`Medium_Phone_API_36.1`, `tablet10`, `tablet7`) are installed locally, so the Android side of this feature can be built and exercised end-to-end, not just typechecked:
- Pure native logic (id parsing, color hex conversion) should follow the existing `android/app/src/test/java/.../RecurrenceUtilsTest.java` precedent (`./gradlew testDebugUnitTest`, JVM-only, fast).
- The full native plugin (`CalendarContract`/`ContentResolver` reads and writes, `WRITE_CALENDAR` permission prompt, `listCalendars`/`listEvents`/`createEvent`/`updateEvent`/`deleteEvent`/`updateCalendarColor`) can be built via `./gradlew assembleDebug`, installed on a booted AVD via `adb install`, and driven either manually or via `agent-browser`/`adb shell` automation. This includes seeding a test event/calendar on the emulator's own AOSP calendar provider (no external account needed for basic read/write checks; Google-account color-write-rejection behavior specifically would need a signed-in test Google account on the AVD, which may or may not be available — flag if not).
- The `cal:device_events` native-storage round-trip (§6, the single riskiest assumption in the plan) can be checked directly on the emulator: trigger the JS-side snapshot write, then inspect `SharedPreferences` via `adb shell run-as app.formstr.calendar cat /data/data/app.formstr.calendar/shared_prefs/*.xml` (or equivalent) to confirm `NotificationWorker.java` would actually see it, rather than assuming.
- Recurring whole-series-edit semantics can be confirmed by creating a recurring event on-device and verifying the provider's instance regeneration after a series-wide update.

**Cannot verify in this environment (no macOS/Xcode/iOS Simulator on this Linux machine):** every `EKEventStore`/EventKit call, iOS permission-prompt flows, the `Info.plist` usage-description keys taking effect, and `IOSNotificationScheduler.swift`'s `UserDefaults` read of the new device-events key. iOS work should be implemented carefully against documented EventKit APIs and reviewed closely, but functional verification will need to happen on an actual Mac/simulator outside this session.

### Critical files
- `android/app/src/main/java/app/formstr/calendar/DeviceCalendarPlugin.java`, `AndroidManifest.xml`
- `ios/App/App/DeviceCalendarPlugin.swift` (new), `ios/App/App/AppDelegate.swift`, `ios/App/App/Info.plist`
- `src/plugins/deviceCalendar.ts`, `src/stores/deviceCalendars.ts`, `src/utils/deviceCalendarAdapter.ts`
- `src/features/event-editor/hooks/useEventSave.ts`, `CalendarLocationGroup.tsx`, `EventEditDesktopForm.tsx`, `EventEditMobileForm.tsx`
- `src/components/EditEventPage.tsx` (reference only — do not modify), `src/components/EditDeviceEventPage.tsx` (new)
- `src/features/event-view/components/EventActionsBar.tsx`, `DeleteEventDialog.tsx`, `DeleteDeviceEventDialog.tsx` (new), `EventChipsRow.tsx`
- `src/components/ui/EventChip.tsx`, `src/components/ui/CollapsibleGroup.tsx` (new)
- `src/components/SidebarContent.tsx`, `CalendarManageDialog.tsx`, `src/features/settings/CalendarsSettingsPage.tsx`
- `src/components/DeviceCalendarsSection.tsx` (delete)
- `android/app/src/main/java/app/formstr/calendar/NotificationWorker.java`, `ios/App/App/IOSNotificationScheduler.swift`
