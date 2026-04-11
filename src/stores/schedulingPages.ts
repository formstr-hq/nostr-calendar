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
  publishSchedulingPage,
  fetchUserSchedulingPages,
  deleteSchedulingPage as deleteSchedulingPageNostr,
  getUserPublicKey,
  encodeNAddr,
} from "../common/nostr";
import { EventKinds } from "../common/EventConfigs";
import { nostrEventToSchedulingPage } from "../utils/parser";
import type { ISchedulingPage } from "../utils/types";
import type { SubscriptionHandle } from "../common/nostrRuntime";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { isNative } from "../utils/platform";

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
    if (subscriptionHandle) {
      subscriptionHandle.unsubscribe();
    }

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

    const signedEvent = await publishSchedulingPage(page);
    page.eventId = signedEvent.id;

    set((state) => {
      const pages = [...state.pages, page];
      saveToStorage(pages);
      return { pages };
    });

    return page;
  },

  updatePage: async (page) => {
    const signedEvent = await publishSchedulingPage(page);
    const updated = {
      ...page,
      eventId: signedEvent.id,
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
    return encodeNAddr({
      kind: EventKinds.SchedulingPage,
      pubkey: page.user,
      identifier: page.id,
    });
  },

  clearCachedPages: async () => {
    if (subscriptionHandle) {
      subscriptionHandle.unsubscribe();
      subscriptionHandle = undefined;
    }
    set({ pages: [], isLoaded: false });
  },
}));
