import { Event, Filter } from "nostr-tools";
import {
  isReplaceableEvent,
  isEphemeralEvent,
  getReplaceableKey,
  shouldReplaceEvent,
  isValidEventStructure,
  isDeletionEvent,
  getEventCoordinate,
} from "./utils/eventValidation";
import { eventMatchesFilter, extractTagKeys } from "./utils/filterUtils";
import { EventCallback } from "./types";

/**
 * EventStore - Multi-indexed event storage with reactive subscriptions
 *
 * Stores all Nostr events in memory with fast O(1) lookups by:
 * - Event ID (primary index)
 * - Kind
 * - Author (pubkey)
 * - Tags (e:id, p:pubkey, etc.)
 *
 * Features:
 * - Automatic deduplication
 * - Replaceable event handling (keeps latest)
 * - Reactive subscriptions (callbacks on new matching events)
 * - Synchronous queries (no network, cache only)
 */
export class EventStore {
  // Primary storage
  private eventsById: Map<string, Event> = new Map();

  // Secondary indexes
  private eventsByKind: Map<number, Set<string>> = new Map();
  private eventsByAuthor: Map<string, Set<string>> = new Map();
  private eventsByTag: Map<string, Set<string>> = new Map();

  // Replaceable event tracking
  private replaceableKeys: Map<string, string> = new Map(); // key -> event ID

  // Deletion tracking (NIP-09)
  private deletedEventIds: Set<string> = new Set();
  private deletedCoordinates: Set<string> = new Set();

  // Reactive subscriptions
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private listenerIdCounter = 0;

  /**
   * Add an event to the store
   * Returns true if event was added, false if rejected/duplicate
   */
  addEvent(event: Event): boolean {
    // Validate event structure
    if (!isValidEventStructure(event)) {
      console.warn("Invalid event structure:", event);
      return false;
    }

    // Don't store ephemeral events
    if (isEphemeralEvent(event.kind)) {
      // Still notify listeners even if not storing
      this.notifyListeners(event);
      return false;
    }

    // Handle deletion events (NIP-09, kind 5)
    if (isDeletionEvent(event.kind)) {
      this.processDeletionEvent(event);
      return true;
    }

    // Reject events that have been deleted
    if (this.isDeleted(event)) {
      return false;
    }

    // Handle replaceable events
    if (isReplaceableEvent(event.kind)) {
      const replaceableKey = getReplaceableKey(event);
      const existingEventId = this.replaceableKeys.get(replaceableKey);

      if (existingEventId) {
        const existingEvent = this.eventsById.get(existingEventId);
        if (existingEvent && !shouldReplaceEvent(event, existingEvent)) {
          // Existing event is newer, don't add
          return false;
        }

        // Remove old event
        if (existingEvent) {
          this.removeEvent(existingEventId);
        }
      }

      // Track new replaceable event
      this.replaceableKeys.set(replaceableKey, event.id);
    }

    // Check for exact duplicate
    if (this.eventsById.has(event.id)) {
      return false;
    }

    // Add to primary store
    this.eventsById.set(event.id, event);

    // Add to kind index
    if (!this.eventsByKind.has(event.kind)) {
      this.eventsByKind.set(event.kind, new Set());
    }
    this.eventsByKind.get(event.kind)!.add(event.id);

    // Add to author index
    if (!this.eventsByAuthor.has(event.pubkey)) {
      this.eventsByAuthor.set(event.pubkey, new Set());
    }
    this.eventsByAuthor.get(event.pubkey)!.add(event.id);

    // Add to tag indexes
    const tagKeys = extractTagKeys(event);
    for (const tagKey of tagKeys) {
      if (!this.eventsByTag.has(tagKey)) {
        this.eventsByTag.set(tagKey, new Set());
      }
      this.eventsByTag.get(tagKey)!.add(event.id);
    }

    // Notify reactive listeners
    this.notifyListeners(event);

    return true;
  }

  /**
   * Remove an event from the store
   */
  private removeEvent(eventId: string): void {
    const event = this.eventsById.get(eventId);
    if (!event) return;

    // Remove from primary store
    this.eventsById.delete(eventId);

    // Remove from kind index
    this.eventsByKind.get(event.kind)?.delete(eventId);

    // Remove from author index
    this.eventsByAuthor.get(event.pubkey)?.delete(eventId);

    // Remove from tag indexes
    const tagKeys = extractTagKeys(event);
    for (const tagKey of tagKeys) {
      this.eventsByTag.get(tagKey)?.delete(eventId);
    }
  }

  /**
   * Query events matching a filter (synchronous, cache only)
   * Returns events sorted by created_at (newest first)
   */
  query(filter: Filter): Event[] {
    let candidateIds: Set<string> | null = null;

    // Use indexes to narrow down candidates efficiently
    // Start with the most selective index

    // If IDs specified, that's the most selective
    if (filter.ids && filter.ids.length > 0) {
      candidateIds = new Set(filter.ids);
    }
    // If authors specified, use author index
    else if (filter.authors && filter.authors.length > 0) {
      const ids = new Set<string>();
      for (const author of filter.authors) {
        const authorEvents = this.eventsByAuthor.get(author);
        if (authorEvents) {
          authorEvents.forEach((id) => ids.add(id));
        }
      }
      candidateIds = ids;
    }
    // If kinds specified, use kind index
    else if (filter.kinds && filter.kinds.length > 0) {
      const ids = new Set<string>();
      for (const kind of filter.kinds) {
        const kindEvents = this.eventsByKind.get(kind);
        if (kindEvents) {
          kindEvents.forEach((id) => ids.add(id));
        }
      }
      candidateIds = ids;
    }
    // If tag filters, use tag index
    else {
      const tagFilters = Object.entries(filter).filter(([key]) =>
        key.startsWith("#"),
      );
      if (tagFilters.length > 0) {
        const [tagKey, tagValues] = tagFilters[0];
        const tagName = tagKey.slice(1);

        const ids = new Set<string>();
        for (const tagValue of tagValues as string[]) {
          const tagKey = `${tagName}:${tagValue}`;
          const tagEvents = this.eventsByTag.get(tagKey);
          if (tagEvents) {
            tagEvents.forEach((id) => ids.add(id));
          }
        }
        candidateIds = ids;
      }
    }

    // If no index could be used, scan all events
    if (candidateIds === null) {
      candidateIds = new Set(this.eventsById.keys());
    }

    // Filter candidates and collect matching events
    const matchingEvents: Event[] = [];

    for (const eventId of Array.from(candidateIds)) {
      const event = this.eventsById.get(eventId);
      if (event && eventMatchesFilter(event, filter)) {
        matchingEvents.push(event);
      }
    }

    // Sort by created_at (newest first)
    matchingEvents.sort((a, b) => b.created_at - a.created_at);

    // Apply limit if specified
    if (filter.limit && filter.limit > 0) {
      return matchingEvents.slice(0, filter.limit);
    }

    return matchingEvents;
  }

  /**
   * Get a single event by ID
   */
  getById(id: string): Event | undefined {
    return this.eventsById.get(id);
  }

  /**
   * Subscribe to events matching a filter
   * Callback is invoked immediately for cached events, then for new matching events
   * Returns unsubscribe function
   */
  subscribe(filter: Filter, callback: EventCallback): () => void {
    // Generate unique listener ID
    const listenerId = `listener-${this.listenerIdCounter++}`;

    // Store listener with its filter
    this.listeners.set(listenerId, new Set([callback]));

    // Store filter with listener for matching
    (callback as any).__filter = filter;
    (callback as any).__listenerId = listenerId;

    // Immediately invoke callback with cached events
    const cachedEvents = this.query(filter);
    for (const event of cachedEvents) {
      callback(event);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listenerId);
    };
  }

  /**
   * Notify all listeners about a new event
   */
  private notifyListeners(event: Event): void {
    for (const [, callbacks] of Array.from(this.listeners.entries())) {
      for (const callback of Array.from(callbacks)) {
        const filter = (callback as any).__filter;
        if (filter && eventMatchesFilter(event, filter)) {
          callback(event);
        }
      }
    }
  }

  /**
   * Get statistics about the store
   */
  getStats() {
    const eventsByKind: Record<number, number> = {};
    for (const [kind, events] of Array.from(this.eventsByKind.entries())) {
      eventsByKind[kind] = events.size;
    }

    return {
      totalEvents: this.eventsById.size,
      eventsByKind,
      totalAuthors: this.eventsByAuthor.size,
      totalListeners: this.listeners.size,
    };
  }

  /**
   * Process a kind 5 deletion event (NIP-09).
   * Extracts referenced event IDs ("e" tags) and coordinates ("a" tags),
   * adds them to the deleted sets, and removes matching events from the store.
   * Only honors deletions from the same author as the deleted event.
   */
  private processDeletionEvent(deletionEvent: Event): void {
    for (const tag of deletionEvent.tags) {
      if (tag[0] === "e" && tag[1]) {
        // Check that the deleted event was authored by the same pubkey
        const existing = this.eventsById.get(tag[1]);
        if (existing && existing.pubkey !== deletionEvent.pubkey) continue;

        this.deletedEventIds.add(tag[1]);
        if (existing) {
          this.removeEvent(tag[1]);
        }
      } else if (tag[0] === "a" && tag[1]) {
        // "a" tag format: "{kind}:{pubkey}:{d-tag}"
        // Only honor if the deletion author matches the coordinate author
        const parts = tag[1].split(":");
        if (parts.length >= 2 && parts[1] !== deletionEvent.pubkey) continue;

        this.deletedCoordinates.add(tag[1]);
        // Remove any matching event currently in the store
        for (const [eventId, event] of Array.from(this.eventsById.entries())) {
          if (getEventCoordinate(event) === tag[1]) {
            this.removeEvent(eventId);
          }
        }
      }
    }
  }

  /**
   * Check if an event has been marked as deleted.
   */
  private isDeleted(event: Event): boolean {
    if (this.deletedEventIds.has(event.id)) return true;
    const coordinate = getEventCoordinate(event);
    if (coordinate && this.deletedCoordinates.has(coordinate)) return true;
    return false;
  }

  /**
   * Clear all events (useful for testing)
   */
  clear(): void {
    this.eventsById.clear();
    this.eventsByKind.clear();
    this.eventsByAuthor.clear();
    this.eventsByTag.clear();
    this.replaceableKeys.clear();
    this.deletedEventIds.clear();
    this.deletedCoordinates.clear();
  }

  /**
   * Get all events of a specific kind (for debugging)
   */
  getEventsByKind(kind: number): Event[] {
    const eventIds = this.eventsByKind.get(kind);
    if (!eventIds) return [];

    const events: Event[] = [];
    for (const id of Array.from(eventIds)) {
      const event = this.eventsById.get(id);
      if (event) events.push(event);
    }

    return events.sort((a, b) => b.created_at - a.created_at);
  }

  /**
   * Prune old events (except profiles and contact lists)
   * Remove events older than the specified age in days
   */
  pruneOldEvents(maxAgeDays: number = 7): number {
    const cutoffTime =
      Math.floor(Date.now() / 1000) - maxAgeDays * 24 * 60 * 60;
    const eventsToRemove: string[] = [];

    for (const [eventId, event] of Array.from(this.eventsById.entries())) {
      // Don't prune profiles (kind 0) or contact lists (kind 3)
      if (event.kind === 0 || event.kind === 3) continue;

      // Remove if too old
      if (event.created_at < cutoffTime) {
        eventsToRemove.push(eventId);
      }
    }

    for (const eventId of eventsToRemove) {
      this.removeEvent(eventId);
    }

    return eventsToRemove.length;
  }
}
