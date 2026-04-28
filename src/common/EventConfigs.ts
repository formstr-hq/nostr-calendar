export enum EventKinds {
  PrivateCalendarEvent = 32678,
  CalendarEventGiftWrap = 1052,
  CalendarEventRumor = 52,
  PrivateRSVPEvent = 32069,
  RSVPGiftWrap = 1055,
  RSVPRumor = 55,
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
}
