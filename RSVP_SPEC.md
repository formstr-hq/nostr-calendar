# Nostr Calendar — Form-Backed RSVP Specification

Status: Draft (matches stacked PRs `feat/rsvp-split-pr1` … `feat/rsvp-split-pr4`)
Owner: Calendar maintainers
Audience: Reviewers of the four stacked PRs and future maintainers
Last updated: rebase on master tip `60ae999` (v1.4.1)

---

## 1. Goal

Allow a private calendar event to ship with one or more **Formstr** forms so
that:

1. **Inviters** can attach an existing Formstr form (e.g. RSVP, dietary
   questions) when authoring an event.
2. **Invitees** see and complete that form *as part of accepting the
   invitation* — no second app, no extra tab.
3. **Inviters** can later see who responded, and invitees can see their own
   submitted answers.
4. None of the above leaks the form owner's edit/admin secret.

The feature is delivered as **four sequential, reviewable PRs** that build
on each other.

---

## 2. Background — Formstr keys (security-critical)

Formstr forms are NIP‑33 replaceable events whose answer schema is encrypted.
Two distinct secrets exist; they are NOT interchangeable:

| Key | Holder | Capability | Safe to share? |
|-----|--------|------------|----------------|
| `viewKey`     | any reader | NIP‑44 decrypt the form template; fill it in | **Yes** |
| `responseKey` | form owner | edit / republish the form, see all responses | **No — admin secret** |

Formstr surfaces the `viewKey` in two URL formats. The calendar must accept
both and expose neither key as `responseKey`:

```
https://formstr.app/f/<naddr>?viewKey=<hex>          # explicit query param
https://formstr.app/f/<naddr>#nkeys1...              # bech32-TLV "nkeys" hash
```

The `#nkeys1...` payload contains both the form `naddr` *and* the view key,
encoded by `@formstr/sdk` `encodeNKeys`. It is decoded with `decodeNKeys`.

> **Reviewer fix integrated into all four PRs:** the data model field is
> named `viewKey` everywhere (it used to be `responseKey`, which was both
> wrong and dangerous because it implied admin access).

---

## 3. Scope and out-of-scope

In scope:

- Parsing a Formstr `naddr` or share URL into a tagged attachment.
- Persisting the attachment on the encrypted (private) calendar event.
- Rendering and submitting the form during invitation acceptance and from
  the shared event view.
- Detecting whether an invitee has already submitted (relay-backed; with a
  local fallback marker for instant UI feedback).
- Showing form attachments in the event detail view with deep-links into
  Formstr.

Out of scope (for these four PRs):

- Public/discoverable calendar events.
- Server-side response aggregation.
- Server-rendered form previews (we render via `@formstr/sdk` in-browser).

---

## 4. Data model

### 4.1 `IFormAttachment` (`src/utils/types.ts`)

```ts
export interface IFormAttachment {
  /** Bech32 `naddr` of the Formstr form (NIP‑33 replaceable event coord). */
  naddr: string;

  /**
   * Hex-encoded NIP‑44 *view* key for the form, when known.
   *
   * Sources accepted by `extractViewKey`:
   *   1. The TLV-encoded key inside a `#nkeys1...` URL fragment.
   *   2. A `?viewKey=<hex>` query parameter.
   *
   * It must NEVER be confused with the form's `responseKey`
   * (a.k.a. admin / edit key), which grants write access to the form
   * owner. We deliberately do not parse, store, or transport
   * `responseKey` anywhere in calendar code.
   */
  viewKey?: string;
}
```

### 4.2 Wire format on the calendar event

Each form is serialized as a single tag on the encrypted calendar event:

```
["form", <naddr>, <viewKey?>]
```

- Tag name: `form` (lowercase).
- Position 1: `naddr` (required).
- Position 2: `viewKey` (optional, hex). Omitted entirely when unknown.

The reverse direction (`parseFormAttachment` in `src/utils/parser.ts`)
reads `event.tags[i][1]` as the `naddr` and `event.tags[i][2]` as the
`viewKey`. Anything in `[3..]` is reserved and ignored.

### 4.3 Why on the encrypted event only

The form tag and its `viewKey` are written to the **NIP‑59 sealed**
calendar event payload, not to the public outer wrapper. This keeps the
form reference visible only to invited participants.

---

## 5. PR breakdown

The feature is split across four stacked branches off `master` (`60ae999`).

### PR1 — `feat/rsvp-split-pr1` (`34f3df9`)
**Title:** `feat(forms): persist form attachments on private calendar events`

**Surface area:**

- `src/utils/types.ts` — adds `IFormAttachment` with the `viewKey` field
  and the security warning block.
- `src/utils/formLink.ts` — new module. Exports:
  - `extractNaddr(input)` — accepts a bare `naddr1...` or a Formstr URL.
  - `extractViewKey(input)` — TLV-aware, query-aware, ignores
    `responseKey=` entirely.
  - `parseFormInput(input): IFormAttachment | null` — fail-soft parser.
  - `buildFormstrUrl(att)` — emits `…?viewKey=<hex>` when present.
  - `getFormCoordinate`, `getFormRelayHints`, `getFormAuthorPubkey` —
    helpers used by later PRs.
- `src/utils/parser.ts` — handles the `form` tag inside
  `nostrEventToCalendar`.
- `src/common/nostr.ts` — emits `["form", form.naddr, form.viewKey]` from
  `event.forms` during event publishing.
- `CalendarEventEdit.tsx` UI — input field + chip list for attaching forms.
- Tests: `src/utils/formLink.test.ts` (29 cases incl. nkeys round-trip
  via the SDK, percent-encoded values, `responseKey=` rejection),
  `src/utils/parser.test.ts` form-tag cases.

**Constraints / non-goals:** No fetch, no rendering. Just data plumbing.

---

### PR2 — `feat/rsvp-split-pr2` (`0c43a1c`)
**Title:** `feat(rsvp): form-filler at invitation acceptance`

**Surface area:**

- New `src/components/FormFillerDialog.tsx` — Material UI dialog that:
  - Calls `sdk.fetchFormWithViewKey(naddr, viewKey)` if a `viewKey` is
    present, else `sdk.fetchForm(naddr)`.
  - Renders the SDK HTML in-place (`sdk.renderHtml`) and intercepts
    submit to publish the response event via the SDK.
  - Surfaces a "Open in Formstr" link built with `buildFormstrUrl`
    (always uses `?viewKey=`, never `responseKey=`).
- `InvitationPanel.tsx` — opens the dialog for each attached form before
  the invitee can finalize *Accept*. Acceptance is gated on
  *all* attached forms being submitted (or explicitly skipped where
  policy allows).
- Misc: parser hardening for the real-world URL shapes Formstr emits
  (commit `a549c44`).

**Reviewer fix:** the dialog passes `attachment.viewKey`, never
`attachment.responseKey` — matches the renamed model from PR1.

---

### PR3 — `feat/rsvp-split-pr3` (`3310448`)
**Title:** `feat(forms): improve submitted response handling`
(Stacked: also includes the relay-backed status detection that landed
in earlier review iterations.)

**Surface area:**

- `src/hooks/useFormSubmissionStatus.ts` — relay-backed detection. Given
  a form `naddr` and the current pubkey, queries the relays returned by
  `getDiscoveryRelays` (user-configured ⊕ form `naddr` hints ⊕ defaults)
  for a matching response event from that pubkey. Returns
  `{ status: "loading" | "submitted" | "not_submitted", refetch }`.
- `FormFillerDialog.tsx` — gates UI on `useFormSubmissionStatus`:
  - "Already submitted" state with the ability to re-open (read-only)
    or, if the SDK permits, edit and re-publish.
  - Disables the submit button while `status === "loading"`.
- `src/common/nostr.ts` — refactored relay discovery
  (`normalizeRelayList`, `getDiscoveryRelays`) so every form-related
  query uses the same merged relay set. Removed a stray
  participant-relay debug log.
- Removed: `src/components/FormResponsesDialog.tsx` and
  `src/common/fetchFormResponses.test.ts` — replaced by the per-form
  status hook + Formstr's own responses URL.
- `CalendarEvent.tsx` — shared-link accept now walks attached forms
  before finalizing, mirroring `InvitationPanel`.
- Tests: relay-merge expectations, `fetchUserFormResponse` cases,
  formLink/parser remain at 29/26 passing.

**Reviewer fix:** chore commit (`cb1730d`) explicitly reframes the
`IFormAttachment` field as `viewKey` and updates all comments. No
`issue.txt` / `sdk-improve.md` are committed (they were scratchpads
that briefly slipped in during a rebase and have been removed).

---

### PR4 — `feat/rsvp-split-pr4` (`05c7fa2`)
**Title:** `feat(rsvp): automatic RSVP questionnaire + status UI`

**Surface area:**

- Default RSVP questionnaire: when the event has no attached form and
  the invitee accepts/declines/tentatives, a built-in questionnaire is
  rendered (yes/no + free-text note) and stored as a Formstr response
  for parity.
- Status UI in event detail: each attached form gets a "submitted /
  pending" pill driven by `useFormSubmissionStatus`. A
  `sessionStorage` marker (`cal:form-submitted:<naddr>:<pubkey>`) is
  written on local submit so the UI flips instantly even before the
  relay round-trip completes; the marker is treated as a hint, not
  authority — the relay query still wins on conflict.
- `unify shared-link response flow` (`07ab362`): both the invitation
  panel and the public shared-link `CalendarEvent` view share the same
  acceptance pipeline, so a participant who follows an `nevent` link
  goes through the same form-filling gate.
- Several review follow-ups (decrypt-error UX, event-not-found state,
  relay-drop retry, picture-in-picture safety, restored dialog polish).
- `FormFillerDialog.tsx` keeps an "Open in Formstr" external button
  that emits `?viewKey=` (never `responseKey`).

**Constraints:** PR4 does NOT introduce a public-relay form-response
viewer (that idea was explored in earlier drafts and removed because
the discovery surface was too weak — see §7).

---

## 6. Component / module map

```
src/
├── common/
│   ├── nostr.ts                # serialize forms to ["form", naddr, viewKey],
│   │                           # normalizeRelayList, getDiscoveryRelays
│   └── fetchUserFormResponse.ts
├── components/
│   ├── CalendarEvent.tsx       # shared-link path; walks form gate
│   ├── CalendarEventEdit.tsx   # form attachment chip UI
│   ├── FormFillerDialog.tsx    # render + submit + already-submitted
│   └── InvitationPanel.tsx     # invite acceptance gate
├── hooks/
│   └── useFormSubmissionStatus.ts
└── utils/
    ├── formLink.ts             # extractNaddr/extractViewKey/parseFormInput
    ├── parser.ts               # nostrEventToCalendar reads "form" tag
    └── types.ts                # IFormAttachment
```

---

## 7. Open questions / known weaknesses

These are deliberately not blockers for the four PRs but are tracked for
follow-up:

1. **Public RSVP discovery.** `useFormSubmissionStatus` queries discovery
   relays merged from event hints and the user's relay list. For an
   invitee whose relay list does not overlap the form owner's, the
   status may falsely read `not_submitted`. The `sessionStorage` marker
   patches the *local* user's experience but not other readers.
2. **No integration tests** for the end-to-end accept-with-form flow;
   unit coverage exists at the `formLink` and relay-merge layers only.
3. **Deep SDK import.** `extractViewKey` reaches into
   `@formstr/sdk/dist/utils/nkeys.js` because `decodeNKeys` is not on
   the public entry. If the SDK reorganizes, the import breaks; we
   should request an exported helper upstream.
4. **`responseKey` parameter ignored silently.** If a user pastes a URL
   that contains only `?responseKey=...` (no `viewKey`), the form will
   render anonymously rather than showing an error. This is the safer
   default (we never want to absorb the admin secret), but a UI
   note ("this link is missing a viewKey") would be friendlier.

---

## 8. Manual test plan

| # | Scenario | Expected |
|---|---|---|
| 1 | Author event, paste `https://formstr.app/f/<naddr>?viewKey=<hex>` | Chip appears; on publish, encrypted event has `["form", naddr, hex]` |
| 2 | Author event, paste `https://formstr.app/f/<naddr>#nkeys1...` | Same as #1; `viewKey` extracted from TLV |
| 3 | Author event, paste a URL containing only `?responseKey=...` | Chip appears with naddr, **without** viewKey; no error, no leak |
| 4 | Invitee accepts an event with one form (PR2) | Dialog opens, form renders, submit publishes response |
| 5 | Invitee re-opens an event they already responded to (PR3) | Status pill = "submitted"; dialog shows "already submitted" |
| 6 | Invitee on shared-link `nevent` URL with form attached (PR4) | Same gate as the invitation panel |
| 7 | Invitee with no attached form (PR4) | Default RSVP questionnaire renders |
| 8 | Network failure mid-fetch (PR4) | Error state with retry; "Open in Formstr" link present |

---

## 9. Branch tips at submission

| PR | Branch | Tip |
|----|--------|-----|
| PR1 | `feat/rsvp-split-pr1` | `34f3df9` |
| PR2 | `feat/rsvp-split-pr2` | `0c43a1c` |
| PR3 | `feat/rsvp-split-pr3` | `3310448` |
| PR4 | `feat/rsvp-split-pr4` | `05c7fa2` |

All four branches build cleanly (`pnpm build`) and the relevant unit
suites (`formLink.test.ts`, `parser.test.ts`,
`fetchUserFormResponse.test.ts`) pass. Pre-existing failures in
`events.test.ts`, `calendarListTypes.test.ts`, and `invitations.test.ts`
are inherited from `master` and are out of scope for this feature.
