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
} from "../common/nostr";
import { EventKinds } from "../common/EventConfigs";
import { naddrEncode } from "nostr-tools/nip19";
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

async function publishSchedulingPage(page: ISchedulingPage): Promise<{
  event: Event;
  viewKey?: string;
}> {
  const pubKey = await getUserPublicKey();
  const tags = schedulingPageToTags(page);

  let content = page.description;
  let publishTags = tags;
  let viewKeyHex: string | undefined;

  if (page.isPrivate) {
    const viewSecretKey = generateSecretKey();
    const viewPublicKey = getPublicKey(viewSecretKey);
    viewKeyHex = bytesToHex(viewSecretKey);
    const conversationKey = nip44.getConversationKey(
      viewSecretKey,
      viewPublicKey,
    );
    content = nip44.encrypt(JSON.stringify(tags), conversationKey);
    publishTags = [["d", page.id]];
  }

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

    subscriptionHandle = fetchUserSchedulingPages(
      userPubkey,
      (event) => {
        const page = nostrEventToSchedulingPage(event);

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
    if (viewKey) page.viewKey = viewKey;

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
      ...(viewKey ? { viewKey } : {}),
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
