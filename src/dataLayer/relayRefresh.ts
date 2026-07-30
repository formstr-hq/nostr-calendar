/**
 * Relay "refresh" signal — a monotonic counter that bumps whenever the worker
 * becomes able to serve cached data it couldn't a moment ago: after IndexedDB
 * hydration completes (the worker emits `ready` from its constructor, BEFORE
 * `start()` loads the store, and hydration's `bulkLoad` suppresses change emits —
 * so an interest declared during that window EOSEs on an empty store and never
 * receives the hydrated events), or after a worker restart that lost its
 * in-memory interests.
 *
 * `bootstrap.ts` feeds it from the worker boundary; `resilientObserve.ts`
 * consumes it to re-declare every live interest. This module is framework-free
 * so non-React code can read it too.
 */

let refreshCount = 0;
const listeners = new Set<() => void>();

/** Bump the signal — call when the worker can newly serve more cached data. */
export function notifyRelayRefresh(): void {
  refreshCount++;
  listeners.forEach((l) => l());
}

/** Current signal value (changes identity-stably as a number). */
export function getRelayRefresh(): number {
  return refreshCount;
}

/** Subscribe to refreshes; returns an unsubscribe fn (useSyncExternalStore shape). */
export function subscribeRelayRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
