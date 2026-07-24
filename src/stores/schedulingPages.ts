/**
 * Scheduling Pages Store
 *
 * Manages the user's appointment scheduling pages (kind 31927).
 * Each page defines availability windows that others can book.
 *
 * Key behaviors:
 * - Loads cached pages from secure storage on init
 * - Fetches pages from relays and merges with cache
 * - Publishes new/updated pages to relays
 * - Deletes pages via NIP-09 deletion events
 */

import { create } from "zustand";
import { dataLayer, type ObserveHandle } from "@formstr/local-relay";
import { getSecureItem, setSecureItem } from "../common/localStorage";
import { getUserPublicKey } from "../nostr/crypto";
import { publishSignedEvent, buildAndSign, makeDTag } from "../nostr/core";
import { publishDeletionEvent } from "../nostr/events";
import {
  publishSchedulingPageKey,
  publishEmptySchedulingPageKey,
  fetchOwnSchedulingPageKeys,
} from "../nostr/schedulingKeys";
import { EventKinds } from "../nostr/kinds";
import { naddrEncode, nsecEncode, decode } from "nostr-tools/nip19";
import {
  nostrEventToSchedulingPage,
  schedulingPageToTags,
} from "../utils/parser";
import type { ISchedulingPage } from "../utils/types";
import { getRelays } from "../common/relayConfig";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getAppBaseUrl, isNative } from "../utils/platform";
import type { Event, Filter } from "nostr-tools";
import { generateSecretKey, getPublicKey, nip44 } from "nostr-tools";

/**
 * Cached map of `dTag -> nsec-encoded viewKey` for the current user's own
 * scheduling pages, populated from kind-32680 self-encrypted records.
 * Used as the sole source of truth for decrypting pages this user
 * authored, on any device.
 */
let ownSchedulingPageKeyIndex: Map<string, string> | undefined;
let ownSchedulingPageKeyIndexLoadPromise: Promise<void> | undefined;

async function refreshOwnSchedulingPageKeyIndex(): Promise<void> {
  try {
    ownSchedulingPageKeyIndex = await fetchOwnSchedulingPageKeys();
  } catch (err) {
    console.warn(
      "Failed to load scheduling page key index (kind 32680):",
      err instanceof Error ? err.message : err,
    );
    ownSchedulingPageKeyIndex = ownSchedulingPageKeyIndex ?? new Map();
  }
}

async function ensureOwnSchedulingPageKeyIndexLoaded(): Promise<void> {
  if (ownSchedulingPageKeyIndex) return;
  if (!ownSchedulingPageKeyIndexLoadPromise) {
    ownSchedulingPageKeyIndexLoadPromise =
      refreshOwnSchedulingPageKeyIndex().finally(() => {
        ownSchedulingPageKeyIndexLoadPromise = undefined;
      });
  }
  await ownSchedulingPageKeyIndexLoadPromise;
}

function setOwnSchedulingPageKey(dTag: string, viewKeyNsec: string): void {
  if (!ownSchedulingPageKeyIndex) ownSchedulingPageKeyIndex = new Map();
  ownSchedulingPageKeyIndex.set(dTag, viewKeyNsec);
}

function deleteOwnSchedulingPageKey(dTag: string): void {
  ownSchedulingPageKeyIndex?.delete(dTag);
}

function getOwnSchedulingPageKeyIndex(): Map<string, string> {
  return ownSchedulingPageKeyIndex ?? new Map();
}

async function publishSchedulingPage(page: ISchedulingPage): Promise<{
  event: Event;
  viewKey: string;
}> {
  const pubKey = await getUserPublicKey();
  const tags = schedulingPageToTags(page);

  // All scheduling pages are encrypted as of vNEXT. Public scheduling
  // pages are no longer supported by this client; the page body is always
  // wrapped in a NIP-44 envelope keyed by an ephemeral viewKey shared
  // through the page's URL (?viewKey=...).
  const viewSecretKey = generateSecretKey();
  const viewPublicKey = getPublicKey(viewSecretKey);
  const viewKeyHex = bytesToHex(viewSecretKey);
  const conversationKey = nip44.getConversationKey(
    viewSecretKey,
    viewPublicKey,
  );
  const content = nip44.encrypt(JSON.stringify(tags), conversationKey);
  const publishTags = [["d", page.id]];

  const signedEvent = await buildAndSign({
    kind: EventKinds.SchedulingPage,
    pubkey: pubKey,
    tags: publishTags,
    content,
    // Replaceable events with equal created_at are tie-broken by lowest id
    // (NIP-01), so an update published in the same second as the previous
    // version could silently lose. Stay strictly after the version we replace.
    created_at: Math.max(
      Math.floor(Date.now() / 1000),
      (page.createdAt ?? 0) + 1,
    ),
  });

  await publishSignedEvent(signedEvent);

  // Publish a self-encrypted kind-32680 record so the page is recoverable
  // on a fresh device or after a refresh on web (where secure storage is
  // a no-op). Best-effort: failure is logged but non-fatal because the
  // creator can still copy the share URL from the current session.
  try {
    const viewKeyNsec = nsecEncode(viewSecretKey);
    await publishSchedulingPageKey({
      dTag: page.id,
      viewKeyNsec,
    });
    setOwnSchedulingPageKey(page.id, viewKeyNsec);
  } catch (err) {
    console.warn(
      "Failed to publish scheduling page key (kind 32680):",
      err instanceof Error ? err.message : err,
    );
  }

  return { event: signedEvent, viewKey: viewKeyHex };
}

function fetchUserSchedulingPages(
  pubkey: string,
  onEvent: (event: Event) => void,
  onEose?: () => void,
): ObserveHandle {
  const filter: Filter = {
    kinds: [EventKinds.SchedulingPage],
    authors: [pubkey],
  };

  return dataLayer.observe([filter], {
    onEvent,
    onEose,
  });
}

async function deleteSchedulingPageNostr(
  page: ISchedulingPage,
): Promise<Event> {
  return publishDeletionEvent({
    kinds: [EventKinds.SchedulingPage],
    coordinates: [`${EventKinds.SchedulingPage}:${page.user}:${page.id}`],
    eventIds: page.eventId ? [page.eventId] : [],
    reason: "",
  });
}

const STORAGE_KEY = "cal:scheduling_pages";

const saveToStorage = (pages: ISchedulingPage[]) => {
  setSecureItem(STORAGE_KEY, pages);
};

let subscriptionHandle: ObserveHandle | undefined;

interface SchedulingPagesState {
  pages: ISchedulingPage[];
  isLoaded: boolean;

  loadCachedPages: () => Promise<void>;
  fetchPages: () => Promise<void>;
  createPage: (
    page: Omit<ISchedulingPage, "id" | "eventId" | "user" | "createdAt">,
  ) => Promise<ISchedulingPage>;
  updatePage: (page: ISchedulingPage) => Promise<ISchedulingPage>;
  deletePage: (pageId: string) => Promise<void>;
  getPageById: (pageId: string) => ISchedulingPage | undefined;
  getNAddr: (page: ISchedulingPage) => string;
  getPageUrl: (page: ISchedulingPage) => string;
  clearCachedPages: () => Promise<void>;
}

export const useSchedulingPages = create<SchedulingPagesState>((set, get) => ({
  pages: [],
  isLoaded: false,

  loadCachedPages: async () => {
    if (!isNative) return;
    const cached = await getSecureItem<ISchedulingPage[]>(STORAGE_KEY, []);
    if (cached.length > 0) {
      set({ pages: cached, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  fetchPages: async () => {
    if (subscriptionHandle) return;

    const userPubkey = await getUserPublicKey();
    if (!userPubkey) return;

    // Make sure the kind-32680 scheduling-page-key index is loaded so we
    // can decrypt pages we authored on another device (or after a web
    // refresh, where secure storage is a no-op).
    await ensureOwnSchedulingPageKeyIndexLoaded();

    subscriptionHandle = fetchUserSchedulingPages(
      userPubkey,
      async (event) => {
        // All scheduling pages we publish are NIP-44 encrypted: the outer
        // event carries only `["d", id]` plus ciphertext in `content`.
        // Decrypt unconditionally via the kind-32680 page-key index.
        const dTag = event.tags.find((t) => t[0] === "d")?.[1];
        if (!dTag) return;
        const viewKey = getOwnSchedulingPageKeyIndex().get(dTag);
        if (!viewKey) {
          // Either someone else's encrypted page (we can't decrypt) or
          // a tombstoned record (entry deleted). Skip silently.
          return;
        }
        let parseSource: Event;
        let viewKeyHex: string;
        try {
          const decoded = decode(viewKey);
          if (decoded.type !== "nsec") {
            throw new Error(`unexpected viewKey encoding: ${decoded.type}`);
          }
          const sk = decoded.data as Uint8Array;
          viewKeyHex = bytesToHex(sk);
          const pk = getPublicKey(sk);
          const conversationKey = nip44.getConversationKey(sk, pk);
          const decryptedTags = JSON.parse(
            nip44.decrypt(event.content, conversationKey),
          ) as string[][];
          parseSource = { ...event, tags: decryptedTags };
        } catch (err) {
          console.warn(
            `Failed to decrypt own scheduling page d=${dTag}:`,
            err instanceof Error ? err.message : err,
          );
          return;
        }

        const page = nostrEventToSchedulingPage(parseSource);
        page.viewKey = viewKeyHex;

        set((state) => {
          const existing = state.pages.find((p) => p.id === page.id);
          if (existing && existing.createdAt >= page.createdAt) {
            return state;
          }

          const pages = existing
            ? state.pages.map((p) => (p.id === page.id ? page : p))
            : [...state.pages, page];

          saveToStorage(pages);
          return { pages, isLoaded: true };
        });
      },
      () => {
        set({ isLoaded: true });
      },
    );
  },

  createPage: async (pageData) => {
    const userPubkey = await getUserPublicKey();
    const id = makeDTag(`${JSON.stringify(pageData)}-${Date.now()}`);

    const page: ISchedulingPage = {
      ...pageData,
      id,
      eventId: "",
      user: userPubkey,
      createdAt: 0,
    };

    const { event: signedEvent, viewKey } = await publishSchedulingPage(page);
    page.eventId = signedEvent.id;
    page.viewKey = viewKey;
    page.createdAt = signedEvent.created_at;

    set((state) => {
      // Upsert: the local relay fans the published event out to the standing
      // pages observe before this resolves, so it may already be here — and
      // this local copy is the authoritative one (it carries the viewKey).
      const exists = state.pages.some((p) => p.id === page.id);
      const pages = exists
        ? state.pages.map((p) => (p.id === page.id ? page : p))
        : [...state.pages, page];
      saveToStorage(pages);
      return { pages };
    });

    return page;
  },

  updatePage: async (page) => {
    const { event: signedEvent, viewKey } = await publishSchedulingPage(page);
    const updated = {
      ...page,
      eventId: signedEvent.id,
      viewKey,
      createdAt: signedEvent.created_at,
    };

    set((state) => {
      const pages = state.pages.map((p) => (p.id === page.id ? updated : p));
      saveToStorage(pages);
      return { pages };
    });

    return updated;
  },

  deletePage: async (pageId) => {
    const page = get().pages.find((p) => p.id === pageId);
    if (!page) return;

    await deleteSchedulingPageNostr(page);

    // Tombstone the page-key index so other devices stop reconstructing
    // this page after deletion. Best-effort — failure is non-fatal because
    // the NIP-09 deletion event above is the canonical signal.
    try {
      await publishEmptySchedulingPageKey(page.id);
    } catch (err) {
      console.warn(
        "Failed to tombstone scheduling page key (kind 32680):",
        err instanceof Error ? err.message : err,
      );
    }
    deleteOwnSchedulingPageKey(page.id);

    set((state) => {
      const pages = state.pages.filter((p) => p.id !== pageId);
      saveToStorage(pages);
      return { pages };
    });
  },

  getPageById: (pageId) => {
    return get().pages.find((p) => p.id === pageId);
  },

  getNAddr: (page) => {
    return naddrEncode({
      kind: EventKinds.SchedulingPage,
      pubkey: page.user,
      identifier: page.id,
      relays: getRelays(),
    });
  },

  getPageUrl: (page) => {
    const naddr = get().getNAddr(page);
    const base = `${getAppBaseUrl()}/schedule/${naddr}`;
    // viewKey is mandatory after vNEXT. If it is missing (e.g. a stale
    // legacy entry surfaced before recovery completed), return the bare
    // naddr URL so the unsupported notice is shown rather than a literal
    // "?viewKey=undefined".
    return page.viewKey ? `${base}?viewKey=${page.viewKey}` : base;
  },

  clearCachedPages: async () => {
    if (subscriptionHandle) {
      subscriptionHandle.unobserve();
      subscriptionHandle = undefined;
    }
    set({ pages: [], isLoaded: false });
  },
}));
