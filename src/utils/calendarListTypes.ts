import type { ICalendarEvent } from "./types";
import type { NotificationPreference } from "./types";

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference =
  "enabled";

/**
 * Represents a private calendar list (kind 32123).
 * A user can have multiple calendars to organize events by purpose
 * (e.g., personal, work, travel).
 *
 * The calendar content is self-encrypted with the user's own pubkey
 * so only the user can read their calendar lists.
 */
export interface ICalendarList {
  /** Universally unique identifier, used as the Nostr "d" tag */
  id: string;
  /** Nostr event ID (hash) of the most recently seen version of this calendar list */
  eventId: string;
  /** Calendar display title */
  title: string;
  /** Optional description of the calendar */
  description: string;
  /** Hex color string for theming event cards, e.g. "#4285f4" */
  color: string;
  /**
   * Calendar-level notification preference.
   * Used when an event does not define its own preference.
   */
  notificationPreference?: NotificationPreference;
  /**
   * References to calendar events as standard NIP a-tag arrays:
   * ["{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"]
   *
   * First element (a-tag coordinate):
   * - kind: Nostr event kind (32678 or 32679)
   * - authorPubkey: hex public key of the event author
   * - eventDTag: the event's unique "d" tag identifier
   *
   * Second element (optional relay URL):
   * - Relay URL where the event can be found (empty string if not specified)
   *
   * Third element (metadata):
   * - viewKey: nsec-encoded key for decrypting the event
   * - beginTimeSecs: event start time as unix timestamp (seconds)
   * - (empty): reserved field
   * - endTimeSecs: event end time as unix timestamp (seconds)
   * - isRecurring: "true" or "false" — recurring events bypass time-range filters
   */
  eventRefs: string[][];
  /** Nostr event created_at timestamp */
  createdAt: number;
  /** Client-side only toggle for visibility in the calendar view (not stored on relay) */
  isVisible: boolean;
}

/**
 * Represents a gift-wrap invitation that hasn't been accepted into a calendar yet.
 * Gift wraps serve as invitations/notifications — the user must explicitly
 * accept them to add the event to one of their calendars.
 */
export interface IInvitation {
  originalInvitationId: string;
  /** kind of Invitation */
  kind: number;
  /** Event author's pubkey */
  pubkey: string;
  /** Nostr event ID of the gift wrap */
  giftWrapId: string;
  /** The referenced calendar event's d-tag */
  eventId: string;
  /** nsec-encoded view key for decrypting the event */
  viewKey: string;
  /** Relay hint indicating where the main event is published */
  relayHint?: string;
  /** Resolved event data (populated after fetching and decrypting) */
  event?: ICalendarEvent;
  /** Timestamp when the invitation was received */
  receivedAt: number;
  /** Current status of the invitation */
  status: "pending" | "accepted" | "dismissed";
}

/** Default color for newly created calendars */
export const DEFAULT_CALENDAR_COLOR = "#4285f4";

/** Default title for the auto-created first calendar */
export const DEFAULT_CALENDAR_TITLE = "My Calendar";

/**
 * Parses an event reference array from a calendar list into its components.
 *
 * Format: ["{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"]
 */
export function parseEventRef(ref: string[]): {
  kind: number;
  authorPubkey: string;
  eventDTag: string;
  relayUrl: string;
  viewKey: string;
} {
  const coordinateParts = ref[0].split(":");
  const metadataParts = ref[2].split(":");
  return {
    kind: parseInt(coordinateParts[0], 10),
    authorPubkey: coordinateParts[1],
    eventDTag: coordinateParts[2],
    relayUrl: ref[1],
    viewKey: metadataParts[0],
  };
}

/**
 * Builds an event reference array for storage in a calendar list.
 *
 * Returns: ["{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}:{beginTimeSecs}::{endTimeSecs}:{isRecurring}"]
 */
export function buildEventRef(params: {
  kind: number;
  authorPubkey: string;
  eventDTag: string;
  relayUrl?: string;
  viewKey: string;
}): string[] {
  return [
    `${params.kind}:${params.authorPubkey}:${params.eventDTag}`,
    params.relayUrl || "",
    `${params.viewKey}`,
  ];
}

/**
 * Builds the canonical coordinate used in calendar refs and Nostr "a" tags.
 * Format: "{kind}:{authorPubkey}:{eventDTag}"
 */
export function getCalendarEventCoordinate(event: {
  kind: number;
  user: string;
  id: string;
}): string {
  return `${event.kind}:${event.user}:${event.id}`;
}

/**
 * Resolves which calendar currently contains an event.
 *
 * Page views can hold a fetched event object that predates a local
 * add-to-calendar action, so `event.calendarId` is not always the latest
 * source of truth. Calendar list refs are authoritative for current
 * membership and let the UI react immediately after an accept/add flow.
 */
export function findCalendarForEvent(
  calendars: ICalendarList[],
  event: Pick<ICalendarEvent, "calendarId" | "kind" | "user" | "id">,
): ICalendarList | undefined {
  if (event.calendarId) {
    const explicitCalendar = calendars.find((c) => c.id === event.calendarId);
    if (explicitCalendar) {
      return explicitCalendar;
    }
  }

  const coordinate = getCalendarEventCoordinate(event);
  return calendars.find((calendar) =>
    calendar.eventRefs.some((ref) => ref[0] === coordinate),
  );
}
