import { create } from "zustand";
import { createLogger } from "../utils/logger";

const logger = createLogger("USER STORE");
import {
  setItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";
import { signerManager } from "../common/signer";
import { useTimeBasedEvents } from "./events";
import { cancelAllNotifications } from "../utils/notifications";
import { fetchRelayList } from "../nostr/relays";
import { defaultRelays } from "../common/relayConfig";
import { useRelayStore } from "./relays";
import { useCalendarLists } from "./calendarLists";
import { useInvitations } from "./invitations";
import { useBookingRequests } from "./bookingRequests";
import { useSchedulingPages } from "./schedulingPages";
import { restartDataLayerWiped } from "../dataLayer/bootstrap";
import {
  BG_KEY_USER_PUBKEY,
  BG_KEY_RELAYS,
  BG_KEY_LAST_LOGIN_TIME,
  BG_KEY_LAST_INVITATION_FETCH_TIME,
  BG_KEY_LAST_BOOKING_REQUEST_FETCH_TIME,
  BG_KEY_LAST_BOOKING_RESPONSE_FETCH_TIME,
} from "../utils/constants";

export interface IUser {
  name?: string;
  picture?: string;
  pubkey: string;
  privateKey?: string;
  follows?: string[];
  webOfTrust?: Set<string>;
  about?: string;
}

let isInitializing = false;

const USER_STORAGE_KEY = "nostr_user";

export const useUser = create<{
  user: IUser | null;
  isInitialized: boolean;
  showLoginModal: boolean;
  updateLoginModal: (show: boolean) => void;
  updateUser: (user: IUser) => void;
  logout: () => void;
  initializeUser: () => Promise<void>;
}>((set) => ({
  showLoginModal: false,
  updateLoginModal: (show) => {
    set({ showLoginModal: show });
  },
  user: null,
  isInitialized: false,

  updateUser: (user) => {
    logger.log("updateUser", user.pubkey);
    set({ user });
    setItem(USER_STORAGE_KEY, user);
    logger.log("updateUser: complete");
  },
  logout: async () => {
    logger.log("logout: start");
    signerManager.logout();
    logger.log("logout: signer logged out");
    cancelAllNotifications();
    logger.log("logout: notifications cancelled");
    useRelayStore.getState().resetRelays();
    logger.log("logout: relays reset");
    await useTimeBasedEvents.getState().clearCachedEvents();
    logger.log("logout: cached events cleared");
    await useCalendarLists.getState().clearCachedCalendars();
    logger.log("logout: cached calendars cleared");
    await useInvitations.getState().clearCachedInvitations();
    await useBookingRequests.getState().clearCached();
    await useSchedulingPages.getState().clearCachedPages();
    // Clear background worker keys
    logger.log("logout: cached invitations cleared");
    await removeSecureItem(BG_KEY_USER_PUBKEY);
    await removeSecureItem(BG_KEY_RELAYS);
    await removeSecureItem(BG_KEY_LAST_LOGIN_TIME);
    await removeSecureItem(BG_KEY_LAST_INVITATION_FETCH_TIME);
    await removeSecureItem(BG_KEY_LAST_BOOKING_REQUEST_FETCH_TIME);
    await removeSecureItem(BG_KEY_LAST_BOOKING_RESPONSE_FETCH_TIME);
    logger.log("logout: background worker keys cleared");
    // Kill the relay worker and wipe its IndexedDB event cache — nothing of
    // the account's data survives logout on this device.
    await restartDataLayerWiped();
    logger.log("logout: local relay wiped and restarted");
    set({ user: null, isInitialized: false });
    localStorage.removeItem(USER_STORAGE_KEY);
    logger.log("logout: complete");
  },

  initializeUser: async () => {
    if (!isInitializing) {
      logger.log("initializeUser: start");
      isInitializing = true;
      signerManager.registerLoginModal(
        () =>
          new Promise<void>((resolve) => {
            useUser.getState().updateLoginModal(true);
            const unsubscribe = signerManager.onChange(() => {
              if (signerManager.getUser()) {
                unsubscribe();
                resolve();
              }
            });
          }),
      );
      signerManager.onChange(onUserChange);
      signerManager.restoreFromStorage();
      logger.log("initializeUser: signer restored from storage");
    } else {
      logger.log("initializeUser: already initializing, skipping");
    }
  },
}));

const onUserChange = async () => {
  logger.log("onUserChange: triggered");
  const currentUser = useUser.getState().user;
  const cachedUser = signerManager.getUser();
  if (cachedUser?.pubkey !== currentUser?.pubkey)
    useUser.setState({
      user: cachedUser,
    });
  if (cachedUser) {
    logger.log("onUserChange: cached user found", cachedUser.pubkey);
    if (currentUser?.pubkey !== cachedUser.pubkey) {
      logger.log("onUserChange: new user detected, resetting private events");
      const eventManager = useTimeBasedEvents.getState();
      eventManager.resetPrivateEvents();
      logger.log("onUserChange: loading cached calendars and invitations");
      await Promise.all([
        useRelayStore.getState().loadCachedRelays(),
        useCalendarLists.getState().loadCachedCalendars(),
        useTimeBasedEvents.getState().loadCachedEvents(),
      ]);
    } else {
      logger.log("onUserChange: same user, no re-initialization needed");
    }

    logger.log("onUserChange: setting initialized state from local cache");
    useUser.setState({ isInitialized: true });
    void syncUserNetworkState(cachedUser.pubkey);
  } else {
    logger.log("onUserChange: no cached user, clearing state");
    useUser.setState({
      isInitialized: true,
      user: null,
    });
    if (currentUser?.pubkey !== undefined) {
      logger.log("onUserChange: resetting private events for logged-out user");
      const eventManager = useTimeBasedEvents.getState();
      eventManager.resetPrivateEvents();
    }
  }
  logger.log("onUserChange: complete");
};

const syncUserNetworkState = async (pubkey: string) => {
  try {
    logger.log("syncUserNetworkState: fetching relay list");
    const relays = await fetchRelayList(pubkey);
    const userRelays = relays.length > 0 ? relays : defaultRelays;
    logger.log(
      "syncUserNetworkState: setting relays",
      userRelays.length,
      "relays",
    );
    useRelayStore.getState().setRelays(userRelays);
    // Deletion (kind 5) and participant-removal (kind 84) enforcement is a
    // standing interest owned by the dataLayer bootstrap — nothing to fetch.

    await setSecureItem(BG_KEY_USER_PUBKEY, pubkey);
    await setSecureItem(BG_KEY_RELAYS, userRelays);
    await setSecureItem(BG_KEY_LAST_LOGIN_TIME, Math.floor(Date.now() / 1000));
  } catch (error) {
    logger.warn("syncUserNetworkState: background sync failed", error);
  }
};
