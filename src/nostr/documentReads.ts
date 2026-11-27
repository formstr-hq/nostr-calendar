import { matchFilters, type Event, type Filter } from "nostr-tools";
import type { DocumentReader } from "./documentDiscovery";

/** Reuse the initial owner snapshot and batch concurrent group lookups per stage. */
export function documentReads(
  reader: DocumentReader,
  ownEvents: Event[],
): DocumentReader {
  type Request = {
    filters: Filter[];
    resolve: (events: Event[]) => void;
    reject: (error: unknown) => void;
  };
  let pending: Request[] = [];
  const covered = (filter: Filter) =>
    filter.authors?.length === 1 &&
    filter.authors[0] === reader.pubkey &&
    !!filter.kinds?.length &&
    filter.kinds.every((kind) => [33457, 34579, 5].includes(kind));
  return {
    ...reader,
    fetch: async (filters) => {
      const local = filters.filter(covered);
      const remote = filters.filter((filter) => !covered(filter));
      const cached = local.length
        ? ownEvents.filter((event) => matchFilters(local, event))
        : [];
      if (!remote.length) return cached;
      const fetched = await new Promise<Event[]>((resolve, reject) => {
        pending.push({ filters: remote, resolve, reject });
        if (pending.length !== 1) return;
        queueMicrotask(async () => {
          const batch = pending;
          pending = [];
          try {
            const unique = new Map(
              batch
                .flatMap((r) => r.filters)
                .map((filter) => [JSON.stringify(filter), filter]),
            );
            const events = await reader.fetch([...unique.values()]);
            for (const request of batch)
              request.resolve(
                events.filter((event) => matchFilters(request.filters, event)),
              );
          } catch (error) {
            for (const request of batch) request.reject(error);
          }
        });
      });
      return [...cached, ...fetched];
    },
  };
}
