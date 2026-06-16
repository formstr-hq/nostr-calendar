import { Filter, SimplePool } from "nostr-tools";
import { EventStore } from "./EventStore";
import { generateFilterHash, chunkFilter } from "./utils/filterUtils";
import {
  ManagedSubscription,
  EventCallback,
  EoseCallback,
  SubscriptionDebugInfo,
} from "./types";

/**
 * SubscriptionManager - Manages SimplePool subscriptions with deduplication
 *
 * Features:
 * - Automatic deduplication via filter hashing
 * - Reference counting (auto-close when refCount reaches 0)
 * - Automatic chunking for large author lists (>1000 authors)
 * - Event forwarding to EventStore and component callbacks
 */
export class SubscriptionManager {
  private subscriptions: Map<string, ManagedSubscription> = new Map();
  private pool: SimplePool;
  private eventStore: EventStore;

  constructor(pool: SimplePool, eventStore: EventStore) {
    this.pool = pool;
    this.eventStore = eventStore;
  }

  /**
   * Subscribe to events with automatic deduplication
   * If an identical subscription exists, increments refCount and adds callback
   * Returns subscription ID and unsubscribe function
   */
  subscribe(
    relays: string[],
    filter: Filter,
    onEvent?: EventCallback,
    onEose?: EoseCallback,
  ): { id: string; unsubscribe: () => void } {
    const subscriptionId = generateFilterHash(filter, relays);

    const existing = this.subscriptions.get(subscriptionId);

    if (existing) {
      existing.refCount++;

      if (onEvent) {
        existing.callbacks.add(onEvent);

        if (existing.eoseReceived && onEose) {
          onEose();
        } else if (onEose) {
          existing.eoseCallbacks.add(onEose);
        }
      }

      return {
        id: subscriptionId,
        unsubscribe: () => this.unsubscribe(subscriptionId, onEvent, onEose),
      };
    }

    const managedSub: ManagedSubscription = {
      id: subscriptionId,
      filter,
      relays,
      closer: null,
      refCount: 1,
      callbacks: new Set(onEvent ? [onEvent] : []),
      eoseCallbacks: new Set(onEose ? [onEose] : []),
      eoseReceived: false,
    };

    const chunks = chunkFilter(filter, 1000);

    if (chunks.length > 1) {
      managedSub.chunks = [];
      const eoseState = { count: 0 };

      for (const chunk of chunks) {
        const closer = this.pool.subscribeMany(relays, chunk, {
          onevent: (event) => {
            const added = this.eventStore.addEvent(event);
            if (added) {
              for (const callback of Array.from(managedSub.callbacks)) {
                callback(event);
              }
            }
          },
          oneose: () => {
            eoseState.count++;
            if (eoseState.count === chunks.length) {
              managedSub.eoseReceived = true;
              for (const eoseCallback of Array.from(managedSub.eoseCallbacks)) {
                eoseCallback();
              }
              managedSub.eoseCallbacks.clear();
            }
          },
        });
        managedSub.chunks.push(closer);
      }
    } else {
      managedSub.closer = this.pool.subscribeMany(relays, filter, {
        onevent: (event) => {
          const added = this.eventStore.addEvent(event);
          if (added) {
            for (const callback of Array.from(managedSub.callbacks)) {
              callback(event);
            }
          }
        },
        oneose: () => {
          managedSub.eoseReceived = true;
          for (const eoseCallback of Array.from(managedSub.eoseCallbacks)) {
            eoseCallback();
          }
          managedSub.eoseCallbacks.clear();
        },
      });
    }

    // Store subscription
    this.subscriptions.set(subscriptionId, managedSub);

    return {
      id: subscriptionId,
      unsubscribe: () => this.unsubscribe(subscriptionId, onEvent, onEose),
    };
  }

  /**
   * Unsubscribe from a subscription
   * Decrements refCount and closes if it reaches 0
   */
  private unsubscribe(
    subscriptionId: string,
    onEvent?: EventCallback,
    onEose?: EoseCallback,
  ): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Remove callbacks
    if (onEvent) {
      subscription.callbacks.delete(onEvent);
    }
    if (onEose) {
      subscription.eoseCallbacks.delete(onEose);
    }

    // Decrement reference count
    subscription.refCount--;

    // If no more references, close subscription
    if (subscription.refCount <= 0) {
      this.closeSubscription(subscriptionId);
    }
  }

  /**
   * Close a subscription and clean up
   */
  private closeSubscription(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Close SimplePool subscription(s)
    if (subscription.chunks) {
      for (const closer of subscription.chunks) {
        closer.close();
      }
    } else if (subscription.closer) {
      subscription.closer.close();
    }

    // Remove from map
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get active subscription count
   */
  getActiveCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get debug information about all subscriptions
   */
  listSubscriptions(): SubscriptionDebugInfo[] {
    const info: SubscriptionDebugInfo[] = [];

    for (const sub of Array.from(this.subscriptions.values())) {
      info.push({
        id: sub.id,
        filter: sub.filter,
        relays: sub.relays,
        refCount: sub.refCount,
        callbackCount: sub.callbacks.size,
        eoseReceived: sub.eoseReceived,
        isChunked: !!sub.chunks,
      });
    }

    return info;
  }

  /**
   * Close all subscriptions (useful for cleanup/testing)
   */
  closeAll(): void {
    for (const subscriptionId of Array.from(this.subscriptions.keys())) {
      this.closeSubscription(subscriptionId);
    }
  }
}
