export enum RSVPStatus {
  accepted = "accepted",
  declined = "declined",
  tentative = "tentative",
  pending = "pending",
}

export enum RepeatingFrequency {
  None = "none",
  Daily = "daily",
  Weekly = "weekly",
  Weekday = "weekdays",
  Monthly = "monthly",
  Quarterly = "quarterly",
  Yearly = "yearly",
}

export enum RSVPResponse {
  accepted = "accepted",
  declined = "declined",
  tentative = "tentative",
  pending = "pending",
}

export interface IRSVPResponse {
  participantId: string;
  response: RSVPResponse;
  timestamp: number;
}

export interface IScheduledNotification {
  label: string;
  scheduledAt: number;
}

export type NotificationPreference = "enabled" | "disabled";

export interface ICalendarEvent {
  begin: number;
  description: string;
  kind: number;
  end: number;
  id: string;
  eventId: string;
  title: string;
  createdAt: number;
  categories: string[];
  participants: string[];
  rsvpResponses: IRSVPResponse[];
  reference: string[];
  image?: string;
  location: string[];
  geoHash: string[];
  website: string;
  user: string;
  isPrivateEvent: boolean;
  viewKey?: string;
  repeat: {
    rrule: string | null;
  };
  /**
   * Event-level notification preference.
   * If undefined, calendar-list preference should be used as fallback.
   */
  notificationPreference?: NotificationPreference;
  calendarId?: string;
  isInvitation?: boolean;
  relayHint?: string;
}

// --- Appointment Scheduling Types ---

export type DurationMode = "fixed" | "free";

export interface IAvailabilityWindow {
  /** "recurring" = weekly pattern, "date" = one-off date window */
  type: "recurring" | "date";
  /** Day of week 0 (Sunday) - 6 (Saturday). Only for type "recurring" */
  dayOfWeek?: number;
  /** Specific date string YYYY-MM-DD. Only for type "date" */
  date?: string;
  /** Start time in HH:MM format (24h) */
  startTime: string;
  /** End time in HH:MM format (24h) */
  endTime: string;
}

export interface ISchedulingPage {
  /** d-tag identifier */
  id: string;
  /** Nostr event ID (hash) */
  eventId: string;
  /** Creator's public key */
  user: string;
  /** Page title, e.g. "Schedule with Alice" */
  title: string;
  /** Description / booking instructions */
  description: string;
  /** Available fixed slot durations in minutes (e.g. [30, 60]) */
  slotDurations: number[];
  /** "fixed" = booker picks from slotDurations, "free" = booker picks any range */
  durationMode: DurationMode;
  /** Recurring and one-off availability windows */
  availabilityWindows: IAvailabilityWindow[];
  /** Blocked dates (YYYY-MM-DD) that override recurring availability */
  blockedDates: string[];
  /** IANA timezone string, e.g. "America/New_York" */
  timezone: string;
  /** Minimum seconds before a slot can be booked (e.g. 3600 = 1 hour) */
  minNotice: number;
  /** Maximum seconds into the future a slot can be booked (e.g. 2592000 = 30 days) */
  maxAdvance: number;
  /** Buffer seconds between adjacent appointments */
  buffer: number;
  /** Booking request expiry in seconds (0 = never) */
  expiry: number;
  /** Optional meeting location */
  location: string;
  /** Optional image URL */
  image?: string;
  /** Optional pre-defined event title for appointments */
  eventTitle?: string;
  /** Relay hints from the scheduling page event */
  relayHints?: string[];
  /** Whether this is a private (encrypted) scheduling page */
  isPrivate?: boolean;
  /** View key for decrypting private scheduling pages */
  viewKey?: string;
  /** Nostr event created_at */
  createdAt: number;
}

export type BookingRequestStatus =
  | "pending"
  | "approved"
  | "declined"
  | "expired"
  | "cancelled";

export interface IBookingRequest {
  /** Unique identifier for this request (derived from gift wrap) */
  id: string;
  /** Gift wrap event ID that delivered this request */
  giftWrapId: string;
  /** Scheduling page a-tag reference */
  schedulingPageRef: string;
  /** Booker's public key */
  bookerPubkey: string;
  /** Requested start time (ms) */
  start: number;
  /** Requested end time (ms) */
  end: number;
  /** Appointment title from booker */
  title: string;
  /** Optional note from booker */
  note: string;
  /** Pre-generated d-tag for the calendar event */
  dTag: string;
  /** When this request was received (ms) */
  receivedAt: number;
  /** Current status */
  status: BookingRequestStatus;
  /** When status last changed (ms) */
  respondedAt?: number;
  /** Decline reason from creator */
  declineReason?: string;
}

export interface IOutgoingBooking {
  /** Unique identifier */
  id: string;
  /** Gift wrap event ID of the original request */
  giftWrapId: string;
  /** Scheduling page a-tag reference */
  schedulingPageRef: string;
  /** Creator's public key (who owns the scheduling page) */
  creatorPubkey: string;
  /** Requested start time (ms) */
  start: number;
  /** Requested end time (ms) */
  end: number;
  /** Appointment title */
  title: string;
  /** Note sent with request */
  note: string;
  /** When request was sent (ms) */
  sentAt: number;
  /** Current status */
  status: BookingRequestStatus;
  /** When the creator responded (ms) */
  respondedAt?: number;
  /** Decline reason if declined */
  declineReason?: string;
  /** Reference to created private event (on approval) */
  eventRef?: string;
  /** Pre-generated d-tag the host will reuse when publishing the event */
  dTag?: string;
  /** View key for created private event (on approval) */
  viewKey?: string;
}

/** A concrete bookable time slot */
export interface ITimeSlot {
  /** Start time as Date */
  start: Date;
  /** End time as Date */
  end: Date;
}
