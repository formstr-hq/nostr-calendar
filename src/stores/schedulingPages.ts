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
import { getSecureItem, setSecureItem } from "../common/localStorage";
import {
  getUserPublicKey,
  getRelays,
  publishToRelays,
  publishDeletionEvent,
  publishSchedulingPageKey,
  publishEmptySchedulingPageKey,
  fetchOwnSchedulingPageKeys,
} from "../common/nostr";
import { EventKinds } from "../common/EventConfigs";
import { naddrEncode, nsecEncode, decode } from "nostr-tools/nip19";
import {
  nostrEventToSchedulingPage,
  schedulingPageToTags,
} from "../utils/parser";
import type { ISchedulingPage } from "../utils/types";
import type { SubscriptionHandle } from "../common/nostrRuntime";
import { nostrRuntime } from "../common/nostrRuntime";
import { signerManager } from "../common/signer";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { isNative } from "../utils/platform";
import type { Event, UnsignedEvent, Filter } from "nostr-tools";
import {
  generateSecretKey,
  getEventHash,
  getPublicKey,
  nip44,
} from "nostr-tools";

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

  const baseEvent: UnsignedEvent = {
    kind: EventKinds.SchedulingPage,
    pubkey: pubKey,
    tags: publishTags,
    content,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signer = await signerManager.getSigner();
  const signedEvent = await signer.signEvent(baseEvent);
  signedEvent.id = getEventHash(baseEvent);

  await publishToRelays(signedEvent);
  nostrRuntime.addEvent(signedEvent);

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
) {
  const relayList = getRelays();
  const filter: Filter = {
    kinds: [EventKinds.SchedulingPage],
    authors: [pubkey],
  };

  return nostrRuntime.subscribe(relayList, [filter], {
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

let subscriptionHandle: SubscriptionHandle | undefined;

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
    void ensureOwnSchedulingPageKeyIndexLoaded();

    subscriptionHandle = fetchUserSchedulingPages(
      userPubkey,
      async (event) => {
        // All scheduling pages we publish are NIP-44 encrypted: the outer
        // event carries only `["d", id]` plus ciphertext in `content`.
        // Decrypt unconditionally via the kind-32680 page-key index.
        await ensureOwnSchedulingPageKeyIndexLoaded();
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
    const dTagRoot = `${JSON.stringify(pageData)}-${Date.now()}`;
    const id = bytesToHex(sha256(utf8ToBytes(dTagRoot))).substring(0, 30);

    const page: ISchedulingPage = {
      ...pageData,
      id,
      eventId: "",
      user: userPubkey,
      createdAt: Math.floor(Date.now() / 1000),
    };

    const { event: signedEvent, viewKey } = await publishSchedulingPage(page);
    page.eventId = signedEvent.id;
    page.viewKey = viewKey;

    set((state) => {
      const pages = [...state.pages, page];
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
      createdAt: Math.floor(Date.now() / 1000),
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
    const base = `${window.location.origin}/schedule/${naddr}`;
    // viewKey is mandatory after vNEXT. If it is missing (e.g. a stale
    // legacy entry surfaced before recovery completed), return the bare
    // naddr URL so the unsupported notice is shown rather than a literal
    // "?viewKey=undefined".
    return page.viewKey ? `${base}?viewKey=${page.viewKey}` : base;
  },

  clearCachedPages: async () => {
    if (subscriptionHandle) {
      subscriptionHandle.unsubscribe();
      subscriptionHandle = undefined;
    }
    set({ pages: [], isLoaded: false });
  },
}));
