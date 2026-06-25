# CalendarEventEdit Refactoring Plan

## Context

`CalendarEventEdit.tsx` is 1,759 lines and mixes five distinct concerns in one file:
1. Complex custom-RRULE utility functions (pure logic)
2. A fully self-contained custom recurrence dialog (embedded inline)
3. Form-section UI fragments (participants, form attachments, privacy, recurrence)
4. A large async save handler + relay-retry flow (side-effect / business logic)
5. Top-level state orchestration and final layout composition

This makes it hard to find things, hard to test pieces in isolation, and dangerous to touch one section without accidentally breaking another.

**Goal**: reduce the main file to ~400 lines of glue/composition; everything else lives in focused files.

---

## Changes to Existing Utilities

### `src/utils/repeatingEventsHelper.ts` — add `summarizeRecurrenceRule`
Already exports `normalizeRule` (same job as the inline `toRRuleBody`), `parseRuleParts`, `parseRRuleDate`, and `formatRRuleDate`. The only missing general utility is a human-readable rule summary. Add and export:

```ts
export function summarizeRecurrenceRule(rule: string): string { … }
```

Uses `RRule.fromString().toText()` (already imported). No other additions needed — the custom-dialog types and helpers are dialog-local and belong in the component (see below).

---

## New Files to Create

### 1. `src/components/CustomRecurrenceDialog.tsx`
The inline `<Dialog open={customDialogOpen} …>` block (lines 979–1184) is a fully self-contained modal with its own draft state. Extract it.

```ts
interface CustomRecurrenceDialogProps {
  open: boolean;
  baseDate: Dayjs;            // min date for UNTIL picker
  initialRule: string | null; // populated when editing an existing custom rule
  onClose: () => void;        // cancel — caller decides whether to reset
  onApply: (rule: string) => void;
}
```

The component owns `customDraft` state internally. On open, it initialises draft from `initialRule` (via `getCustomDraftFromRule`) or from `createDefaultCustomDraft`.

The following currently-inline helpers are dialog-local (only used inside this dialog) and move with it rather than into a shared util:
- `CustomUnit`, `CustomEndMode`, `CustomRecurrenceDraft` types
- `WEEKDAY_OPTIONS` constant
- `createDefaultCustomDraft`, `getCustomDraftFromRule`, `buildCustomRecurrenceRule`
- `parseUntilDate` / `formatUntilDate` (return `Dayjs` — UI concern; the timestamp-based equivalents already exist in `repeatingEventsHelper.ts`)
- Replace all `toRRuleBody()` usages with the already-exported `normalizeRule` from `repeatingEventsHelper.ts`

---

### 2. `src/components/RecurrenceSelector.tsx`
The recurrence `<Select>` dropdown + end-mode controls (lines 1204–1364) extracted as a display component. The parent owns the actual recurrence state.

```ts
interface RecurrenceSelectorProps {
  value: RepeatingFrequency | typeof CUSTOM_RECURRENCE_VALUE;
  isCustomRecurrence: boolean;
  customRule: string | null;
  endMode: RecurrenceEndMode;
  count: number;
  untilDate: Dayjs | null;
  eventStart: number;                         // for minDate guard
  onFrequencyChange: (v: string) => void;
  onEndModeChange: (m: RecurrenceEndMode) => void;
  onCountChange: (n: number) => void;
  onUntilDateChange: (d: Dayjs | null) => void;
  onEditCustom: () => void;                   // open CustomRecurrenceDialog
}
```

Exports `CUSTOM_RECURRENCE_VALUE` so the parent can compare against it.

---

### 3. `src/components/EventParticipants.tsx`
The participants section (lines 1386–1436) extracted with its list management.

```ts
interface EventParticipantsProps {
  participants: string[];
  authorPubkey: string;
  onChange: (participants: string[]) => void;
}
```

Uses `ParticipantAdd` and `Participant` internally (already split). Move the `uniqueParticipants` pure helper to `src/utils/participants.ts` — it's unrelated to recurrence.

---

### 4. `src/components/EventFormAttachments.tsx`
The attached-forms section (lines 1438–1527) extracted with its local input state.

```ts
interface EventFormAttachmentsProps {
  attachedForms: IFormAttachment[];
  onAdd: (form: IFormAttachment) => void;
  onRemove: (naddr: string) => void;
}
```

Component owns `formInput` + `formInputError` state. Calls `parseFormInput` internally. Rendered only when `isPrivate` (the parent passes it conditionally).

---

### 5. `src/components/EventPrivacySettings.tsx`
The privacy toggle + busy-list checkbox (lines 1563–1613).

```ts
interface EventPrivacySettingsProps {
  isPrivate: boolean;
  publishBusy: boolean;
  supportsBusyListPublish: boolean;
  onPrivacyChange: (v: boolean) => void;
  onPublishBusyChange: (v: boolean) => void;
}
```

---

### 6. `src/hooks/useEventSave.ts`
The most important extraction: `handleSave` (lines 568–728) and `handleRetryFailedRelays` (lines 730–757) are ~190 lines of async business logic — Nostr publish, relay tracking, notification side effects, busy-list sync. This has nothing to do with form rendering.

```ts
interface UseEventSaveOptions {
  mode: "create" | "edit";
  initialEvent: ICalendarEvent | null;
  eventDetails: ICalendarEvent;
  selectedCalendarId: string;
  isPrivate: boolean;
  draftRecurrenceRule: string | null;
  notificationOffsets: number[];
  publishBusy: boolean;
  supportsBusyListPublish: boolean;
  calendars: CalendarList[];
  onSave?: (event: ICalendarEvent) => void;
  onClose: () => void;
}

// Returns
{
  processing: boolean;
  handleSave: () => Promise<void>;
  handleRetryFailedRelays: () => Promise<void>;
  relayStatus: RelayStatus;
  publishingRelays: string[];
  signedEventForRetry: Event | null;
  retryingRelays: boolean;
  relayDetailsOpen: boolean;
  setRelayDetailsOpen: (v: boolean) => void;
  hasRelayErrors: boolean;
  partialSaveRelayIssues: boolean;
  relayDotsLabel: string;
  acceptedCount: number;
  failedCount: number;
  totalCount: number;
  showRelayDetailsButton: boolean;
}
```

Internally uses `useRelayPublishStatus`. Moving this out removes ~200 lines from the main component and makes the save flow independently readable and testable.

---

## What Stays in `CalendarEventEdit.tsx`

After extraction, the main file becomes ~400 lines:

- `CalendarEventEditProps` interface
- Top-level state: `eventDetails`, `selectedCalendarId`, `isPrivate`, `notificationOffsets`, `notificationPreferencesLoaded`, recurrence state, `publishBusy`
- Derived values: `draftRecurrenceRule`, `supportsBusyListPublish`, `buttonDisabled`
- `useEffect` for notification preference loading
- `updateField` helper
- Date change handlers (`onChangeBeginDate`, `onChangeEndDate`) — still belong here because they cross-reference recurrence state
- `handleFrequencyChange` and recurrence-related date guards
- Layout composition: modal vs page, `titleBar`, `formContent`, `actions`, `partialPublishNote`
- Import of `useEventSave` hook

---

## Migration Order (safe, incremental)

1. **`repeatingEventsHelper.ts`** — add and export `summarizeRecurrenceRule`; update the main file's import.
2. **`CustomRecurrenceDialog`** — extract dialog with its local types/helpers; replace inline block, wire up `open`/`onApply`/`onClose`.
3. **`EventParticipants`** — simplest section component; move `uniqueParticipants` to `utils/participants.ts`.
4. **`EventFormAttachments`** — owns its own input state.
5. **`EventPrivacySettings`** — small, pure display.
6. **`RecurrenceSelector`** — slightly trickier because it needs `CUSTOM_RECURRENCE_VALUE` exported alongside it.
7. **`useEventSave`** — last, most impactful; extract save logic into the hook, remove the state it manages from the main component.

Each step is independently shippable and reviewable.

---

## Verification

- App still builds and type-checks: `tsc --noEmit`
- Manually test: create a new event, edit an existing one, toggle privacy, add participants, set recurrence (standard + custom), attach a form, save, trigger relay error and retry
- Existing E2E tests (Playwright) cover the happy path and should pass unchanged