import { create } from "zustand";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";

const RELAYS_STORAGE_KEY = "cal:relays";

export const useRelayStore = create<{
  relays: string[];
  isLoaded: boolean;
  showRelayModal: boolean;
  loadCachedRelays: () => Promise<void>;
  setRelays: (relays: string[]) => void;
  resetRelays: () => void;
  updateRelayModal: (show: boolean) => void;
}>((set) => ({
  relays: [],
  isLoaded: false,
  showRelayModal: false,
  loadCachedRelays: async () => {
    const cached = await getSecureItem<string[]>(RELAYS_STORAGE_KEY, []);
    if (cached.length > 0) {
      set({ relays: cached, isLoaded: true });
    }
  },
  setRelays: (relays) => {
    setSecureItem(RELAYS_STORAGE_KEY, relays);
    set({ relays, isLoaded: true });
  },
  resetRelays: () => {
    removeSecureItem(RELAYS_STORAGE_KEY);
    set({ relays: [], isLoaded: false });
  },
  updateRelayModal: (show) => set({ showRelayModal: show }),
}));
