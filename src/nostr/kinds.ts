export enum EventKinds {
  PrivateCalendarEvent = 32678,
  /** NIP-59/NIP-17 outer gift wrap for newly published invitations. */
  CalendarEventGiftWrap = 1059,
  /**
   * Pre-NIP-17 calendar invitation wraps. Read-only migration support for
   * invitations sent by older Calendar versions.
   */
  CalendarEventOuterGiftWrap = 1052,
  /** @deprecated superseded by Rumor (kind 14) — no longer written, kept for historical reference */
  CalendarEventRumor = 52,
  /** NIP-17 kind 14 ("chat message") reused as the invitation rumor kind so
   * the invite reads as a real DM in any NIP-17 client. The gift wrap that
   * carries it is additionally tagged `["k", "1052"]` so this app can pick
   * invitation wraps out from other NIP-59-wrapped content sharing the same
   * outer kind. */
  Rumor = 14,
  PrivateRSVPEvent = 32069,
  // Public Events
  PublicCalendarEvent = 31923,
  PublicRSVPEvent = 31925,

  // User Profile and NIP-02 contact list
  UserProfile = 0,
  ContactList = 3,

  // Calendar List (custom kind for private calendar collections)
  PrivateCalendarList = 32123,

  // Deletion (NIP-09)
  DeletionEvent = 5,

  // Legacy tombstone read support only. Never publish new kind-84 events.
  ParticipantRemoval = 84,

  // Relay List (NIP-65)
  RelayList = 10002,

  // Application-specific data (NIP-78)
  ApplicationData = 30078,

  // Appointment Scheduling
  SchedulingPage = 31927,
  /**
   * NIP-59/NIP-17 outer gift wrap for newly published booking requests.
   * Deliberately the same wire value as `CalendarEventGiftWrap` — every
   * NIP-59 wrap this app writes now shares one outer kind, differentiated by
   * the public `k` classifier tag (see `sendBookingRequest`).
   */
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  BookingRequestGiftWrap = 1059,
  /**
   * Pre-NIP-17 booking-request wraps. Read-only migration support for
   * requests sent by older Calendar versions.
   */
  BookingRequestOuterGiftWrap = 1057,
  /** @deprecated superseded by Rumor (kind 14) — no longer written, kept for historical reference */
  BookingRequestRumor = 57,
  /** NIP-59/NIP-17 outer gift wrap for newly published booking responses. */
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  BookingResponseGiftWrap = 1059,
  /**
   * Pre-NIP-17 booking-response wraps. Read-only migration support for
   * responses sent by older Calendar versions.
   */
  BookingResponseOuterGiftWrap = 1058,
  /** @deprecated superseded by Rumor (kind 14) — no longer written, kept for historical reference */
  BookingResponseRumor = 58,

  // Public Busy List (free/busy "I'm unavailable here" entries; one event per
  // user per calendar month, replacement key = ["d", "YYYY-MM"]).
  PublicBusyList = 31926,

  // Scheduling Pages List (per-page self-encrypted record holding the
  // viewKey for one scheduling page authored by the user). Parameterized-
  // replaceable per (pubkey, page d-tag); empty content = tombstone.
  SchedulingPagesList = 32680,

  // Formstr / NIP-101
  FormTemplate = 30168,
  FormResponse = 1069,

  // NIP-56 Reporting
  ReportEvent = 1984,
}
