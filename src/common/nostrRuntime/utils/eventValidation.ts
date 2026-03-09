import { Event } from "nostr-tools";

/**
 * Check if an event is a replaceable event (kind 0, 3, 10000-19999, 30000-39999)
 * Replaceable events should keep only the latest version
 */
export function isReplaceableEvent(kind: number): boolean {
  // Kind 0 (metadata), Kind 3 (contacts)
  if (kind === 0 || kind === 3) return true;

  // Replaceable events (10000-19999)
  if (kind >= 10000 && kind < 20000) return true;

  // Parameterized replaceable events (30000-39999)
  if (kind >= 30000 && kind < 40000) return true;

  return false;
}

/**
 * Check if an event is an ephemeral event (kind 20000-29999)
 * Ephemeral events should not be stored
 */
export function isEphemeralEvent(kind: number): boolean {
  return kind >= 20000 && kind < 30000;
}

/**
 * Get a unique key for replaceable events
 * For parameterized replaceable events, includes the 'd' tag
 */
export function getReplaceableKey(event: Event): string {
  // For parameterized replaceable events (30000-39999), include 'd' tag
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find((tag) => tag[0] === "d");
    const dValue = dTag?.[1] || "";
    return `${event.kind}:${event.pubkey}:${dValue}`;
  }

  // For regular replaceable events, just kind + pubkey
  return `${event.kind}:${event.pubkey}`;
}

/**
 * Compare two events to determine which should be kept for replaceable events
 * Returns true if eventA should replace eventB
 */
export function shouldReplaceEvent(eventA: Event, eventB: Event): boolean {
  // Keep the event with the latest created_at
  if (eventA.created_at > eventB.created_at) return true;
  if (eventA.created_at < eventB.created_at) return false;

  // If timestamps are equal, use ID as tiebreaker (lexicographically larger)
  return eventA.id > eventB.id;
}

/**
 * Check if an event is a deletion event (NIP-09, kind 5)
 */
export function isDeletionEvent(kind: number): boolean {
  return kind === 5;
}

/**
 * Get the coordinate string for a replaceable event: "{kind}:{pubkey}:{d-tag}"
 * Returns null for non-replaceable events.
 */
export function getEventCoordinate(event: Event): string | null {
  if (!isReplaceableEvent(event.kind)) return null;
  // For parameterized replaceable events (30000-39999), include d-tag
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find((tag) => tag[0] === "d");
    const dValue = dTag?.[1] || "";
    return `${event.kind}:${event.pubkey}:${dValue}`;
  }
  // For regular replaceable events
  return `${event.kind}:${event.pubkey}`;
}

/**
 * Validate that an event has required fields
 * Basic validation without signature verification
 */
export function isValidEventStructure(event: any): event is Event {
  if (!event || typeof event !== "object") return false;

  // Required fields
  if (typeof event.id !== "string") return false;
  if (typeof event.pubkey !== "string") return false;
  if (typeof event.created_at !== "number") return false;
  if (typeof event.kind !== "number") return false;
  if (!Array.isArray(event.tags)) return false;
  if (typeof event.content !== "string") return false;
  if (typeof event.sig !== "string") return false;

  return true;
}
