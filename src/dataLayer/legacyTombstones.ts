import type { DataLayer, Event, ObserveHandle } from "@formstr/local-relay";

/**
 * Legacy tombstone enforcement — the secluded backward-compat corner.
 *
 * The local relay's store enforces NIP-09 deletions by `e` tag only. Two older
 * calendar protocols need suppression it doesn't provide:
 *
 *   - kind-5 deletions of ADDRESSABLE events via `a` tags
 *     ("<kind>:<pubkey>:<d-tag>" coordinates)
 *   - kind-84 participant removals (the user opted out of an event they were
 *     invited to; both `e` and `a` targets)
 *
 * This module wraps the DataLayer once, in bootstrap, and is referenced nowhere
 * else. Tombstones are learned from two directions and any observed event
 * matching one is silently dropped:
 *
 *   - the publish boundary (`publish`/`publishEvent`) — deletions/removals
 *     made on THIS device. This is the only reliable source for kind 5: the
 *     local relay processes-but-never-stores kind-5, so they neither replay
 *     nor fan out to subscriptions.
 *   - a standing interest in the account's own kind-84 events (stored + fanned
 *     out normally), which also covers removals made on another device. The
 *     interest includes kind 5 for documentation value, but per the above no
 *     kind-5 event can arrive through it — a kind-5 `a`-tag deletion made on
 *     ANOTHER device is unenforceable here (its `e` tag is still honored by
 *     the store itself, which removes that version by id on every device).
 *
 * State is persisted per-account in localStorage so suppression also holds on
 * a cold offline start.
 *
 * Scope is deliberately the account's OWN deletions/removals — exact parity
 * with the login-time fetch the old runtime performed. Because every ingested
 * tombstone is self-authored, the old store's author checks (deleter must own
 * the coordinate; remover must be a `p`-tagged participant) are satisfied by
 * construction, so targets are ingested unconditionally.
 */
export function withLegacyTombstones(base: DataLayer): DataLayer {
  let account: string | null = null;
  let deletedIds = new Set<string>();
  let deletedCoords = new Set<string>();
  let sub: ObserveHandle | null = null;

  const storageKey = () => `cal:legacy-tombstones:v1:${account}`;

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey());
      const parsed = raw
        ? (JSON.parse(raw) as { ids?: string[]; coords?: string[] })
        : null;
      deletedIds = new Set(parsed?.ids ?? []);
      deletedCoords = new Set(parsed?.coords ?? []);
    } catch {
      deletedIds = new Set();
      deletedCoords = new Set();
    }
  };

  const save = () => {
    try {
      localStorage.setItem(
        storageKey(),
        JSON.stringify({ ids: [...deletedIds], coords: [...deletedCoords] }),
      );
    } catch {
      // Quota/private-mode failures only cost offline suppression durability.
    }
  };

  const coordinateOf = (event: Event): string | null => {
    if (event.kind < 30000 || event.kind >= 40000) return null;
    const dTag = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
    return `${event.kind}:${event.pubkey}:${dTag}`;
  };

  const isTombstoned = (event: Event): boolean => {
    if (deletedIds.has(event.id)) return true;
    const coord = coordinateOf(event);
    return coord !== null && deletedCoords.has(coord);
  };

  const ingest = (tombstone: Event) => {
    let changed = false;
    for (const tag of tombstone.tags) {
      if (tag[0] === "e" && tag[1] && !deletedIds.has(tag[1])) {
        deletedIds.add(tag[1]);
        changed = true;
      } else if (tag[0] === "a" && tag[1] && !deletedCoords.has(tag[1])) {
        // A deletion may only tombstone the author's own coordinates.
        if (tombstone.kind === 5 && tag[1].split(":")[1] !== tombstone.pubkey) {
          continue;
        }
        deletedCoords.add(tag[1]);
        changed = true;
      }
    }
    if (changed) save();
  };

  const retarget = (pubkey: string | null) => {
    if (pubkey === account) return;
    sub?.unobserve();
    sub = null;
    account = pubkey;
    deletedIds = new Set();
    deletedCoords = new Set();
    if (!pubkey) return;
    load();
    sub = base.observe([{ kinds: [5, 84], authors: [pubkey] }], {
      onEvent: ingest,
    });
  };

  const observe: DataLayer["observe"] = (filters, handlers, options) =>
    base.observe(
      filters,
      {
        ...handlers,
        onEvent: (event) => {
          if (!isTombstoned(event)) handlers.onEvent(event);
        },
      },
      options,
    );

  const setActiveAccount: DataLayer["setActiveAccount"] = (pubkey) => {
    base.setActiveAccount(pubkey);
    retarget(pubkey);
  };

  const publishEvent: DataLayer["publishEvent"] = (event) => {
    if (event.kind === 5 || event.kind === 84) ingest(event);
    return base.publishEvent(event);
  };

  const publish: DataLayer["publish"] = async (template) => {
    const out = await base.publish(template);
    if (out.event.kind === 5 || out.event.kind === 84) ingest(out.event);
    return out;
  };

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "observe") return observe;
      if (prop === "setActiveAccount") return setActiveAccount;
      if (prop === "publishEvent") return publishEvent;
      if (prop === "publish") return publish;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
