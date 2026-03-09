import { create } from "zustand";
import { setItem } from "../common/localStorage";
import { signerManager } from "../common/signer";
import { useTimeBasedEvents } from "./events";
import { cancelAllNotifications } from "../utils/notifications";
import { fetchRelayList } from "../common/nostr";
import { useRelayStore } from "./relays";
import { useCalendarLists } from "./calendarLists";
import { useInvitations } from "./invitations";

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
    useUser.setState({
      isInitialized: true,
      user: cachedUser,
    });
    if (currentUser?.pubkey !== cachedUser.pubkey) {
      const eventManager = useTimeBasedEvents.getState();
      eventManager.resetPrivateEvents();
      // Fetch user's relay list (NIP-65)
      fetchRelayList(cachedUser.pubkey).then((relays) => {
        if (relays.length > 0) {
          useRelayStore.getState().setRelays(relays);
        }
      });
      // Initialize calendar lists and invitations for the new user
      useCalendarLists.getState().loadCachedCalendars();
      useInvitations.getState().loadCachedInvitations();
    }
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
