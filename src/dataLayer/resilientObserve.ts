import type { DataLayer, Filter, ObserveHandle } from "@formstr/local-relay";
import { subscribeRelayRefresh } from "./relayRefresh";

type SubscribeHandlers = Parameters<DataLayer["observe"]>[1];
type ObserveOptions = Parameters<DataLayer["observe"]>[2];

interface Entry {
  filters: Filter[];
  handlers: SubscribeHandlers;
  options?: ObserveOptions;
  inner: ObserveHandle;
}

/**
 * Makes every `observe` survive the two moments the worker can newly serve
 * data an existing interest already missed: IndexedDB hydration finishing
 * after boot-time interests EOSE'd on an empty store, and a worker restart
 * (mobile suspend) that dropped its in-memory interests. On each relay-refresh
 * signal every live interest is silently re-declared — the extra cache replay
 * is harmless because all consumers key events by id.
 *
 * Stores and hooks stay ignorant of worker lifecycle: they observe once and
 * unobserve once.
 */
export function withResilientObserve(base: DataLayer): {
  dataLayer: DataLayer;
  dispose: () => void;
} {
  const entries = new Set<Entry>();

  const observe: DataLayer["observe"] = (filters, handlers, options) => {
    const entry: Entry = {
      filters,
      handlers,
      options,
      inner: base.observe(filters, handlers, options),
    };
    entries.add(entry);
    return {
      get id() {
        return entry.inner.id;
      },
      update(next: Filter[]) {
        entry.filters = next;
        entry.inner.update(next);
      },
      unobserve() {
        entries.delete(entry);
        entry.inner.unobserve();
      },
    };
  };

  const redeclareAll = () => {
    for (const entry of entries) {
      entry.inner.unobserve();
      entry.inner = base.observe(entry.filters, entry.handlers, entry.options);
    }
  };

  const dispose = subscribeRelayRefresh(redeclareAll);

  const dataLayer = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "observe") return observe;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return { dataLayer, dispose };
}
