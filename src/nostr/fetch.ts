import { Event, Filter } from "nostr-tools";
import { collectOnce } from "../dataLayer/collect";

/** Newest event of a batch (replaceable semantics for one-shot reads). */
export function latestOf(events: Event[]): Event | null {
  return events.reduce<Event | null>(
    (latest, current) =>
      !latest || current.created_at > latest.created_at ? current : latest,
    null,
  );
}

/** One-shot fetch of every matching event across the configured relays. */
export async function fetchAll(filters: Filter[]): Promise<Event[]> {
  return collectOnce(filters);
}

/** One-shot fetch of the newest matching event, or null if none exist. */
export async function fetchLatest(filters: Filter[]): Promise<Event | null> {
  return latestOf(await collectOnce(filters));
}
