import { EventKinds } from "../common/EventConfigs";
import type { ICalendarEvent } from "./types";

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
  /** Calendar display title */
  title: string;
  /** Optional description of the calendar */
  description: string;
  /** Hex color string for theming event cards, e.g. "#4285f4" */
  color: string;
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
  beginTimeSecs: number;
  endTimeSecs: number;
  isRecurring: boolean;
} {
  const coordinateParts = ref[0].split(":");
  const metadataParts = ref[2].split(":");
  return {
    kind: parseInt(coordinateParts[0], 10),
    authorPubkey: coordinateParts[1],
    eventDTag: coordinateParts[2],
    relayUrl: ref[1],
    viewKey: metadataParts[0],
    beginTimeSecs: parseInt(metadataParts[1], 10),
    endTimeSecs: parseInt(metadataParts[3], 10),
    isRecurring:
      Number(coordinateParts[0]) === EventKinds.PrivateCalendarRecurringEvent,
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
  beginTimeSecs: number;
  endTimeSecs: number;
}): string[] {
  return [
    `${params.kind}:${params.authorPubkey}:${params.eventDTag}`,
    params.relayUrl || "",
    `${params.viewKey}:${params.beginTimeSecs}::${params.endTimeSecs}`,
  ];
}
