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

  // Text Note (Comments/Replies)
  TextNote = 1,

  // Relay List (NIP-65)
  RelayList = 10002,
}
