import { create } from "zustand";
import { getItem, setItem } from "../common/localStorage";
import { fetchOwnedMailAliases, qualifyMailAddress } from "../nostr/mailBridge";

/**
 * Per-account mail identity used to send email-guest invitations.
 *
 * Kept local (never published to relays) because it is UI configuration, not
 * calendar state: the authoritative ownership proof is the From address's
 * NIP-05 record, checked against the signing key at send time — see
 * `senderOwnsFromAddress`. The cached `aliases` list is only a suggestion
 * source; a user with no account API can always type an address manually.
 */
const STORAGE_KEY = "cal:mail_identity";

interface MailIdentityState {
  /** From address chosen for email invites. */
  alias: string;
  /** Settings override for bridge discovery (npub, hex, address, or domain). */
  bridgeOverride: string;
  /** Last known owned aliases (from the API or manual entry). */
  aliases: string[];
  loadingAliases: boolean;
  aliasesError: string | null;
  setAlias: (alias: string) => void;
  setBridgeOverride: (value: string) => void;
  addAlias: (alias: string) => void;
  loadAliases: () => Promise<void>;
  reset: () => void;
}

const stored = getItem<Partial<MailIdentityState>>(STORAGE_KEY, {});

const persist = (state: {
  alias: string;
  bridgeOverride: string;
  aliases: string[];
}) => setItem(STORAGE_KEY, state);

const normalizeAlias = (alias: string): string => qualifyMailAddress(alias);

export const useMailIdentity = create<MailIdentityState>((set, get) => ({
  alias: stored.alias ?? "",
  bridgeOverride: stored.bridgeOverride ?? "",
  aliases: stored.aliases ?? [],
  loadingAliases: false,
  aliasesError: null,

  // Store what the user typed. Qualifying a bare localpart with the default
  // domain happens at the boundary (`qualifyMailAddress`) so typing a name
  // isn't fought by the controlled input rewriting it mid-keystroke.
  setAlias: (alias) => {
    set({ alias });
    persist({
      alias,
      bridgeOverride: get().bridgeOverride,
      aliases: get().aliases,
    });
  },

  setBridgeOverride: (value) => {
    set({ bridgeOverride: value });
    persist({
      alias: get().alias,
      bridgeOverride: value,
      aliases: get().aliases,
    });
  },

  addAlias: (alias) => {
    const normalized = normalizeAlias(alias);
    if (!normalized) return;
    const aliases = Array.from(new Set([...get().aliases, normalized]));
    set({ aliases });
    persist({
      alias: get().alias,
      bridgeOverride: get().bridgeOverride,
      aliases,
    });
  },
  loadAliases: async () => {
    set({ loadingAliases: true, aliasesError: null });
    const { ok, addresses } = await fetchOwnedMailAliases();
    if (!ok) {
      set({ loadingAliases: false });
      return;
    }
    const aliases = Array.from(new Set([...addresses, ...get().aliases]));
    const alias = get().alias || aliases[0] || "";
    set({ aliases, alias, loadingAliases: false });
    persist({ alias, bridgeOverride: get().bridgeOverride, aliases });
  },

  reset: () => {
    set({ alias: "", bridgeOverride: "", aliases: [], aliasesError: null });
    persist({ alias: "", bridgeOverride: "", aliases: [] });
  },
}));
