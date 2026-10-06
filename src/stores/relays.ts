import { create } from "zustand";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";
import type { RelayConnectionInfo } from "../nostr/relayConnection";

const RELAYS_STORAGE_KEY = "cal:relays";

export const useRelayStore = create<{
  relays: string[];
  isLoaded: boolean;
  connectionStatuses: Record<string, RelayConnectionInfo>;
  isTestingAll: boolean;
  loadCachedRelays: () => Promise<void>;
  setRelays: (relays: string[]) => void;
  resetRelays: () => void;
  setConnectionStatus: (url: string, info: RelayConnectionInfo) => void;
  setAllConnectionStatuses: (
    statuses: Record<string, RelayConnectionInfo>,
  ) => void;
  setIsTestingAll: (isTestingAll: boolean) => void;
}>((set) => ({
  relays: [],
  isLoaded: false,
  connectionStatuses: {},
  isTestingAll: false,
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
    set({ relays: [], isLoaded: false, connectionStatuses: {} });
  },
  setConnectionStatus: (url, info) => {
    set((state) => ({
      connectionStatuses: {
        ...state.connectionStatuses,
        [url]: info,
      },
    }));
  },
  setAllConnectionStatuses: (statuses) => {
    set((state) => ({
      connectionStatuses: {
        ...state.connectionStatuses,
        ...statuses,
      },
    }));
  },
  setIsTestingAll: (isTestingAll) => set({ isTestingAll }),
}));
