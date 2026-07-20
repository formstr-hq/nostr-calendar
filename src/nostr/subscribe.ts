import { Event, Filter } from "nostr-tools";
import { dataLayer, type ObserveHandle } from "@formstr/local-relay";

export interface StandingSubscription {
  /** Starts the subscription if not already running. Idempotent. */
  start: () => void;
  /** Stops the subscription and clears any dedup state. Idempotent. */
  stop: () => void;
  isActive: () => boolean;
}

/**
 * Factory for the "standing subscription" shape hand-rolled 4-6 times across
 * the stores (module-level ObserveHandle + start-guard + processedIds Set):
 * owns the handle lifecycle so each domain module only supplies filters and
 * an onEvent callback.
 *
 * `dedupeById: true` gives an internal `processedIds` Set keyed by
 * `event.id`, skipping events already seen (the shape bookingRequests.ts's
 * and invitations.ts's subscriptions want). `dedupeById: false` (default)
 * calls `onEvent` for every delivery — callers needing "newer version wins"
 * semantics (events.ts, schedulingPages.ts) keep that comparison inside
 * their own `onEvent`.
 */
export function createSubscription(
  buildFilters: () => Filter[],
  handlers: {
    onEvent: (event: Event) => void;
    onEose?: () => void;
  },
  opts: { dedupeById?: boolean } = {},
): StandingSubscription {
  let handle: ObserveHandle | undefined;
  const processedIds = opts.dedupeById ? new Set<string>() : undefined;

  return {
    start: () => {
      if (handle) return;
      handle = dataLayer.observe(buildFilters(), {
        onEvent: (event: Event) => {
          if (processedIds) {
            if (processedIds.has(event.id)) return;
            processedIds.add(event.id);
          }
          handlers.onEvent(event);
        },
        onEose: handlers.onEose,
      });
    },
    stop: () => {
      handle?.unobserve();
      handle = undefined;
      processedIds?.clear();
    },
    isActive: () => handle !== undefined,
  };
}
