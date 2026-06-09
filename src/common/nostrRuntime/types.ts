import { Event, Filter } from "nostr-tools";

/**
 * Subscription closer returned from SimplePool.subscribeMany
 */
export type SubCloser = {
  close: (reason?: string) => void;
};

/**
 * Callback for when a new event is received
 */
export type EventCallback = (event: Event) => void;

/**
 * Callback for when a subscription reaches end-of-stored-events
 */
export type EoseCallback = () => void;

/**
 * Options for subscribing to events
 */
export interface SubscribeOptions {
  /** Callback invoked for each event (cached + new) */
  onEvent?: EventCallback;
  /** Callback invoked when EOSE is reached */
  onEose?: EoseCallback;
  /** If true, only query cache without creating network subscription */
  localOnly?: boolean;
}

/**
 * Handle returned from subscribe() to manage subscription lifecycle
 */
export interface SubscriptionHandle {
  /** Unique identifier for this subscription */
  id: string;
  /** Unsubscribe and clean up */
  unsubscribe: () => void;
}

/**
 * Internal representation of a managed subscription
 */
export interface ManagedSubscription {
  /** Hash of filter + relays */
  id: string;
  /** Nostr filter for this subscription */
  filter: Filter;
  /** Relay URLs */
  relays: string[];
  /** SimplePool closer function */
  closer: SubCloser | null;
  /** Number of active consumers */
  refCount: number;
  /** Callbacks to invoke on new events */
  callbacks: Set<EventCallback>;
  /** EOSE callbacks */
  eoseCallbacks: Set<EoseCallback>;
  /** For chunked subscriptions (large author lists) */
  chunks?: SubCloser[];
  /** Whether EOSE has been received */
  eoseReceived: boolean;
}

/**
 * Debug statistics about the runtime
 */
export interface RuntimeStats {
  /** Total events stored */
  totalEvents: number;
  /** Events by kind */
  eventsByKind: Record<number, number>;
  /** Number of active subscriptions */
  activeSubscriptions: number;
  /** Number of authors tracked */
  totalAuthors: number;
  /** Memory estimate (bytes) */
  estimatedMemory: number;
}

/**
 * Debug information about a subscription
 */
export interface SubscriptionDebugInfo {
  id: string;
  filter: Filter;
  relays: string[];
  refCount: number;
  callbackCount: number;
  eoseReceived: boolean;
  isChunked: boolean;
}
