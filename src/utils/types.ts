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

export type RelayLineStatus = "pending" | "ok" | "error";
export type RelayStatusMap = Record<string, RelayLineStatus>;

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
