/**
 * Public Busy List Store (kind 31926)
 *
 * Tracks the current user's public free/busy entries and lets the booking
 * page consume other users' entries. One Nostr event per `(user, monthKey)`
 * (parameterized-replaceable, `["d", "YYYY-MM"]`).
 *
 * - `addBusyRange` / `removeBusyRange` mutate the user's own lists and
 *   republish each touched month.
 * - `fetchBusyListsForUser` returns another user's lists for a given set
 *   of months (used by `BookingPage` to grey out unavailable slots).
 *
 * The store does not persist to local storage — relays are the source of
 * truth and the data is cheap to refetch. The current user's lists are
 * fetched once on login and updated incrementally as ranges are added /
 * removed.
 */

import { create } from "zustand";
import {
  fetchBusyListsForUser as fetchBusyListsForUserNostr,
  getUserPublicKey,
  publishBusyList,
} from "../common/nostr";
import {
  busyListMonthKey,
  busyListMonthKeysForRange,
} from "../utils/dateHelper";
import type { IBusyList, IBusyRange } from "../utils/types";

const PREF_STORAGE_KEY = "cal:busy_list_default_optout";

/**
 * Read the user's "publish busy entries by default" preference.
 * `true` means the toggle is checked (publish). Default true.
 */
export function getBusyListDefaultOptIn(): boolean {
  try {
    const v = localStorage.getItem(PREF_STORAGE_KEY);
    if (v === null) return true;
    return v !== "false";
  } catch {
    return true;
  }
}

export function setBusyListDefaultOptIn(value: boolean) {
  try {
    localStorage.setItem(PREF_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // localStorage may be unavailable (private browsing, etc.) — best-effort.
  }
}

interface BusyListState {
  /** Current user's busy lists, keyed by `YYYY-MM`. */
  ownLists: Record<string, IBusyList>;
  isLoaded: boolean;

  /** Fetch the current user's busy lists for the given months. */
  loadOwnLists: (monthKeys: string[]) => Promise<void>;

  /**
   * Append a busy range (ms) to the user's lists and republish each
   * affected month. Idempotent: if an exact `[start,end]` already exists in
   * a month it is not duplicated.
   */
  addBusyRange: (range: IBusyRange) => Promise<void>;

  /**
   * Remove a busy range previously added via `addBusyRange`. Matches by
   * exact start/end pair so callers must pass the same values used at add
   * time. No-op if not found.
   */
  removeBusyRange: (range: IBusyRange) => Promise<void>;

  /**
   * Fetch another user's busy lists for the given months. Used by booking
   * pages to filter unavailable slots. Does not mutate the store.
   */
  fetchBusyListsForUser: (
    pubkey: string,
    monthKeys: string[],
  ) => Promise<IBusyList[]>;

  clear: () => void;
}

function rangesEqual(a: IBusyRange, b: IBusyRange): boolean {
  return a.start === b.start && a.end === b.end;
}

function splitRangeByMonth(range: IBusyRange): IBusyRange[] {
  // Keep the original [start,end] in every month it touches so removal
  // can match by exact pair regardless of which month list we look in.
  const keys = busyListMonthKeysForRange(range.start, range.end);
  return keys.map(() => ({ start: range.start, end: range.end }));
}

export const useBusyList = create<BusyListState>((set, get) => ({
  ownLists: {},
  isLoaded: false,

  loadOwnLists: async (monthKeys) => {
    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;
    const lists = await fetchBusyListsForUserNostr(userPubkey, monthKeys);
    set((state) => {
      const ownLists = { ...state.ownLists };
      for (const list of lists) {
        const existing = ownLists[list.monthKey];
        if (!existing || existing.createdAt < list.createdAt) {
          ownLists[list.monthKey] = list;
        }
      }
      return { ownLists, isLoaded: true };
    });
  },

  addBusyRange: async (range) => {
    if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return;
    if (range.end <= range.start) return;

    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    const monthKeys = busyListMonthKeysForRange(range.start, range.end);

    // Always sync with relays first so we don't accidentally replace the
    // remote list with a local subset.
    await get().loadOwnLists(monthKeys);

    const split = splitRangeByMonth(range);

    // Compute next state (snapshot) and republish each touched month.
    const updated: Record<string, IBusyList> = { ...get().ownLists };
    const toPublish: IBusyList[] = [];
    for (let i = 0; i < monthKeys.length; i++) {
      const monthKey = monthKeys[i];
      const existing = updated[monthKey];
      const ranges = existing ? [...existing.ranges] : [];
      if (!ranges.some((r) => rangesEqual(r, split[i]))) {
        ranges.push(split[i]);
        ranges.sort((a, b) => a.start - b.start || a.end - b.end);
      }
      const next: IBusyList = {
        user: userPubkey,
        monthKey,
        ranges,
        eventId: existing?.eventId ?? "",
        createdAt: Math.floor(Date.now() / 1000),
      };
      updated[monthKey] = next;
      toPublish.push(next);
    }

    set({ ownLists: updated });

    await Promise.all(
      toPublish.map(async (list) => {
        try {
          const event = await publishBusyList(list);
          set((state) => ({
            ownLists: {
              ...state.ownLists,
              [list.monthKey]: {
                ...state.ownLists[list.monthKey],
                eventId: event.id,
                createdAt: event.created_at,
              },
            },
          }));
        } catch (err) {
          console.error("Failed to publish busy list:", err);
        }
      }),
    );
  },

  removeBusyRange: async (range) => {
    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    const monthKeys = busyListMonthKeysForRange(range.start, range.end);
    await get().loadOwnLists(monthKeys);

    const updated: Record<string, IBusyList> = { ...get().ownLists };
    const toPublish: IBusyList[] = [];
    let changed = false;
    for (const monthKey of monthKeys) {
      const existing = updated[monthKey];
      if (!existing) continue;
      const filtered = existing.ranges.filter((r) => !rangesEqual(r, range));
      if (filtered.length === existing.ranges.length) continue;
      changed = true;
      const next: IBusyList = {
        ...existing,
        ranges: filtered,
        createdAt: Math.floor(Date.now() / 1000),
      };
      updated[monthKey] = next;
      toPublish.push(next);
    }
    if (!changed) return;

    set({ ownLists: updated });

    await Promise.all(
      toPublish.map(async (list) => {
        try {
          const event = await publishBusyList(list);
          set((state) => ({
            ownLists: {
              ...state.ownLists,
              [list.monthKey]: {
                ...state.ownLists[list.monthKey],
                eventId: event.id,
                createdAt: event.created_at,
              },
            },
          }));
        } catch (err) {
          console.error("Failed to republish busy list after removal:", err);
        }
      }),
    );
  },

  fetchBusyListsForUser: async (pubkey, monthKeys) => {
    return fetchBusyListsForUserNostr(pubkey, monthKeys);
  },

  clear: () => {
    set({ ownLists: {}, isLoaded: false });
  },
}));

/**
 * Convenience: collect all busy ranges across a set of pre-fetched lists,
 * intersected with `[fromMs, toMs]` so the caller can pass them to
 * `getBookableSlots`.
 */
export function collectBusyRanges(
  lists: IBusyList[],
  fromMs: number,
  toMs: number,
): IBusyRange[] {
  const out: IBusyRange[] = [];
  for (const list of lists) {
    for (const r of list.ranges) {
      if (r.end <= fromMs || r.start >= toMs) continue;
      out.push(r);
    }
  }
  return out;
}

// Re-export for convenience to call sites.
export { busyListMonthKey, busyListMonthKeysForRange };
