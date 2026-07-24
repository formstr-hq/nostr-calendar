export enum EventKinds {
  PrivateCalendarEvent = 32678,
  CalendarEventGiftWrap = 1052,
  /** @deprecated superseded by CalendarEventInvitationRumor (kind 14) — no longer written, kept for historical reference */
  CalendarEventRumor = 52,
  /** NIP-17 kind 14 ("chat message") reused as the invitation rumor kind so
   * the invite reads as a real DM in any NIP-17 client. The gift wrap that
   * carries it is additionally tagged `["k", "1052"]` so this app can pick
   * invitation wraps out from other NIP-59-wrapped content sharing the same
   * outer kind. */
  CalendarEventInvitationRumor = 14,
  PrivateRSVPEvent = 32069,
  // Public Events
  PublicCalendarEvent = 31923,
  PublicRSVPEvent = 31925,

  // User Profile
  UserProfile = 0,

  // Calendar List (custom kind for private calendar collections)
  PrivateCalendarList = 32123,

  // Deletion (NIP-09)
  DeletionEvent = 5,

  // Participant Removal (kind 84 - participant opts out of an event)
  ParticipantRemoval = 84,

  // Relay List (NIP-65)
  RelayList = 10002,

  // Application-specific data (NIP-78)
  ApplicationData = 30078,

  // Appointment Scheduling
  SchedulingPage = 31927,
  BookingRequestGiftWrap = 1057,
  BookingRequestRumor = 57,
  BookingResponseGiftWrap = 1058,
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
