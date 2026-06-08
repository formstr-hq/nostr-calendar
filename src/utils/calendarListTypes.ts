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
   * ["{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}"]
   *
   * First element (a-tag coordinate):
   * - kind: Nostr event kind (32678)
   * - authorPubkey: hex public key of the event author
   * - eventDTag: the event's unique "d" tag identifier
   *
   * Second element (optional relay URL):
   * - Relay URL where the event can be found (empty string if not specified)
   *
   * Third element:
   * - viewKey: nsec-encoded key for decrypting the event
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
  /**
   * True when this entry is an access update rather than a fresh invitation:
   * the event is already in one of the user's calendars but the author has
   * rotated the view key and re-shared it. Accepting it updates the stored
   * view key instead of adding a new event.
   */
  isAccessUpdate?: boolean;
  /** For access updates: the calendar list that already holds this event. */
  calendarId?: string;
  /**
   * True when the referenced event could not be decrypted with the view key
   * carried by this gift wrap (e.g. the author rotated the key after sending).
   * The panel renders a "ask the author for access" state instead of looping
   * on "loading…" forever.
   */
  inaccessible?: boolean;
}

/**
 * An event reference the client knows about (from a calendar list) but cannot
 * currently decrypt — typically because the author rotated the view key and
 * has not (yet) re-shared it with this user. Surfaced on the "Events Without
 * Access" page so the user can ask the author for access or remove it.
 */
export interface IInaccessibleEvent {
  /** Canonical coordinate "{kind}:{authorPubkey}:{eventDTag}". */
  coordinate: string;
  /** Nostr event kind of the referenced event. */
  kind: number;
  /** Pubkey of the event's author (who can grant access). */
  authorPubkey: string;
  /** The event's d-tag identifier (shown to the user). */
  dTag: string;
  /** The calendar list id that holds this reference. */
  calendarId: string;
  /** Relay hint where the event was published, if known. */
  relayHint?: string;
  /** When this event was last seen as undecryptable (unix seconds). */
  lastSeenAt: number;
}

/** Default color for newly created calendars */
export const DEFAULT_CALENDAR_COLOR = "#4285f4";

/** Default title for the auto-created first calendar */
export const DEFAULT_CALENDAR_TITLE = "My Calendar";

/**
 * Parses an event reference array from a calendar list into its components.
 *
 * Format: ["{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}"]
 */
export function parseEventRef(ref: string[]): {
  kind: number;
  authorPubkey: string;
  eventDTag: string;
  relayUrl: string;
  viewKey: string;
} {
  const coordinateParts = ref[0].split(":");
  return {
    kind: parseInt(coordinateParts[0], 10),
    authorPubkey: coordinateParts[1],
    eventDTag: coordinateParts[2],
    relayUrl: ref[1] ?? "",
    viewKey: ref[2] ?? "",
  };
}

/**
 * Builds an event reference array for storage in a calendar list.
 *
 * Returns: ["{kind}:{authorPubkey}:{eventDTag}", "{relayUrl}", "{viewKey}"]
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
    params.viewKey,
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
 * Calendar list refs are authoritative for current membership and let the UI
 * react immediately after an accept/add/move flow without denormalizing the
 * calendar ID onto each event object.
 */
export function findCalendarForEvent(
  calendars: ICalendarList[],
  event: Pick<ICalendarEvent, "kind" | "user" | "id">,
): ICalendarList | undefined {
  const coordinate = getCalendarEventCoordinate(event);
  return calendars.find((calendar) =>
    calendar.eventRefs.some((ref) => ref[0] === coordinate),
  );
}

/**
 * Returns a new event-refs array with the view key (and optionally relay hint)
 * of the ref matching `coordinate` replaced. All other refs are returned
 * unchanged. If no ref matches, the original array is returned unchanged.
 *
 * Used by key rotation (author updating their own ref) and by access updates
 * (recipient receiving a rotated key). Kept pure so it can be unit-tested
 * without touching relays.
 */
export function replaceEventRefViewKey(
  eventRefs: string[][],
  coordinate: string,
  newViewKey: string,
  relayUrl?: string,
): string[][] {
  return eventRefs.map((ref) =>
    ref[0] === coordinate
      ? [ref[0], relayUrl ?? ref[1] ?? "", newViewKey]
      : ref,
  );
}

/**
 * Resolves the set of recipients that should receive a rotated view key.
 *
 * Always includes the invited participants. When `includeRsvpResponders` is
 * true, RSVP responders are added too (the issue lets the author choose
 * "invited" vs "invited + responders"). The author's own pubkey is always
 * excluded — the author updates their own calendar ref directly rather than
 * gift-wrapping a key to themselves.
 */
export function resolveRotationRecipients(params: {
  invitedParticipants: string[];
  rsvpResponders: string[];
  includeRsvpResponders: boolean;
  selfPubkey: string;
}): string[] {
  const recipients = new Set<string>(params.invitedParticipants);
  if (params.includeRsvpResponders) {
    params.rsvpResponders.forEach((pubkey) => recipients.add(pubkey));
  }
  recipients.delete(params.selfPubkey);
  return [...recipients];
}
