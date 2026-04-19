import { create } from "zustand";
import {
  setItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";
import { signerManager } from "../common/signer";
import { useTimeBasedEvents } from "./events";
import { cancelAllNotifications } from "../utils/notifications";
import { defaultRelays, fetchRelayList } from "../common/nostr";
import { useRelayStore } from "./relays";
import { useCalendarLists } from "./calendarLists";
import { useInvitations } from "./invitations";
import { useBookingRequests } from "./bookingRequests";
import { useSchedulingPages } from "./schedulingPages";
import { nostrRuntime } from "../common/nostrRuntime";
import {
  BG_KEY_USER_PUBKEY,
  BG_KEY_RELAYS,
  BG_KEY_LAST_LOGIN_TIME,
  BG_KEY_LAST_INVITATION_FETCH_TIME,
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
    set({ user });
    setItem(USER_STORAGE_KEY, user);
  },
  logout: async () => {
    signerManager.logout();
    cancelAllNotifications();
    useRelayStore.getState().resetRelays();
    await useTimeBasedEvents.getState().clearCachedEvents();
    await useCalendarLists.getState().clearCachedCalendars();
    await useInvitations.getState().clearCachedInvitations();
    await useBookingRequests.getState().clearCached();
    await useSchedulingPages.getState().clearCachedPages();
    // Clear background worker keys
    await removeSecureItem(BG_KEY_USER_PUBKEY);
    await removeSecureItem(BG_KEY_RELAYS);
    await removeSecureItem(BG_KEY_LAST_LOGIN_TIME);
    await removeSecureItem(BG_KEY_LAST_INVITATION_FETCH_TIME);
    set({ user: null });
    localStorage.removeItem(USER_STORAGE_KEY);
  },

  initializeUser: async () => {
    if (!isInitializing) {
      isInitializing = true;
      signerManager.onChange(onUserChange);
      signerManager.restoreFromStorage();
    }
  },
}));

const onUserChange = async () => {
  const currentUser = useUser.getState().user;
  const cachedUser = signerManager.getUser();

  if (cachedUser) {
    if (currentUser?.pubkey !== cachedUser.pubkey) {
      const eventManager = useTimeBasedEvents.getState();
      eventManager.resetPrivateEvents();
      // Fetch user's relay list (NIP-65)
      const relays = await fetchRelayList(cachedUser.pubkey);
      const userRelays = relays.length > 0 ? relays : defaultRelays;
      useRelayStore.getState().setRelays(userRelays);
      // Persist pubkey, relays, and login time for the background invitation worker
      await setSecureItem(BG_KEY_USER_PUBKEY, cachedUser.pubkey);
      await setSecureItem(BG_KEY_RELAYS, userRelays);
      await setSecureItem(
        BG_KEY_LAST_LOGIN_TIME,
        Math.floor(Date.now() / 1000),
      );
      // Fetch deletion events first so the EventStore knows which events
      // to reject before calendar list events arrive.
      await nostrRuntime.fetchDeletionEvents(userRelays, cachedUser.pubkey);
      await nostrRuntime.fetchParticipantRemovalEvents(
        userRelays,
        cachedUser.pubkey,
      );
      // Initialize calendar lists and invitations for the new user
      useCalendarLists.getState().loadCachedCalendars();
      useInvitations.getState().loadCachedInvitations();
    }
    useUser.setState({
      isInitialized: true,
      user: cachedUser,
    });
  } else {
    useUser.setState({
      isInitialized: true,
      user: null,
    });
    if (currentUser?.pubkey !== undefined) {
      const eventManager = useTimeBasedEvents.getState();
      eventManager.resetPrivateEvents();
    }
  }
};
