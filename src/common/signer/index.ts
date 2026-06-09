import {
  createSigner,
  LocalSigner,
  hexToBytes,
  type ActiveSigner,
} from "@formstr/signer";
import { NostrSignerPlugin } from "nostr-signer-capacitor-plugin";
import { nip19 } from "nostr-tools";
import { fetchUserProfile } from "../nostr";
import { ANONYMOUS_USER_NAME, DEFAULT_IMAGE_URL } from "../../utils/constants";
import type { IUser } from "../../stores/user";
import { isNative } from "../../utils/platform";
import {
  getNip55Credentials,
  getNsec,
  removeNip55Credentials,
  removeNsec,
  saveNsec,
} from "../../utils/secureKeyStorage";

// ─── localStorage keys ──────────────────────────────────────────────────────

const USER_CACHE_KEY = "calendar:userData";
// Legacy keys from the old custom signer — read during migration, then deleted
const LEGACY_KEYS_KEY = "calendar:keys";
const LEGACY_BUNKER_URI_KEY = "calendar:bunkerUri";
const LEGACY_CLIENT_SECRET_KEY = "calendar:client-secret";

// ─── Package signer (extension / NIP-46 / Android accounts) ─────────────────

const packageSigner = createSigner(
  // Only pass the Android plugin on native — on web it initializes a bridge
  // that injects a cross-origin element React 19 crashes on during events.
  isNative ? { androidSignerPlugin: NostrSignerPlugin as any } : {}, // eslint-disable-line @typescript-eslint/no-explicit-any
);

// ─── Types ───────────────────────────────────────────────────────────────────

type LegacyKeys = { pubkey?: string; secret?: string };
type LegacyBunkerUri = { bunkerUri?: string };

// ─── SignerManager ────────────────────────────────────────────────────────────

class SignerManager {
  private localSigner: ActiveSigner | null = null;
  private user: IUser | null = null;
  private loginModalCallback: (() => Promise<void>) | null = null;
  private onChangeCallbacks = new Set<() => void>();

  registerLoginModal(cb: () => Promise<void>) {
    this.loginModalCallback = cb;
  }

  // Polls until window.nostr is injected by the browser extension, up to timeoutMs.
  // Extensions inject asynchronously on page load; without this wait we'd miss
  // them in the common case where restoreFromStorage runs before injection.
  private waitForWindowNostr(timeoutMs = 2000): Promise<boolean> {
    if (window.nostr) return Promise.resolve(true);
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        if (window.nostr) {
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(tick, 50);
        }
      };
      setTimeout(tick, 50);
    });
  }

  async restoreFromStorage() {
    const active = packageSigner.getActiveAccount();

    if (active) {
      try {
        switch (active.method) {
          case "extension":
            if (await this.waitForWindowNostr()) {
              await packageSigner.loginWithExtension();
              await this.fetchAndCacheUser(active.pubkey);
            }
            break;
          case "android":
            if (active.androidPackageName) {
              await packageSigner.loginWithAndroidSigner({
                packageName: active.androidPackageName,
              });
              await this.fetchAndCacheUser(active.pubkey);
            }
            break;
          case "nip46":
            if (active.nip46) {
              await packageSigner.loginWithBunkerUri(active.nip46.uri, {
                clientSecretKey: hexToBytes(active.nip46.clientSecretKey),
              });
              await this.fetchAndCacheUser(active.pubkey);
            }
            break;
          case "ncryptsec":
            // Requires a passphrase — user must log in manually
            break;
        }
      } catch (e) {
        console.error("Signer auto-unlock failed:", e);
      }
    } else {
      await this.tryLegacyRestore();
    }

    // If the signer couldn't be restored (ncryptsec needs passphrase, extension
    // never loaded, etc.) notify with no user so the app shows the login modal.
    if (!this.localSigner && !packageSigner.getActiveSigner()) {
      this.user = null;
    } else {
      // Restore cached profile for cases where fetchAndCacheUser wasn't called
      // (e.g. guest key in tryLegacyRestore sets localSigner but not this.user)
      if (!this.user) {
        const cachedData = localStorage.getItem(USER_CACHE_KEY);
        if (cachedData) {
          try {
            this.user = JSON.parse(cachedData) as IUser;
          } catch {}
        }
      }
    }

    this.notify();
  }

  // Migrates from the old custom-signer storage format on first launch after upgrade.
  private async tryLegacyRestore() {
    // Always discard the old NIP-46 client secret — no longer used
    localStorage.removeItem(LEGACY_CLIENT_SECRET_KEY);

    // Native nsec stored in secure storage (highest priority on mobile)
    if (isNative) {
      const nsec = await getNsec();
      if (nsec) {
        try {
          await this.loginWithNsec(nsec);
          localStorage.removeItem(LEGACY_KEYS_KEY);
          return;
        } catch (e) {
          console.error("Legacy nsec restore failed:", e);
        }
      }
    }

    // Old NIP-55 credentials (Capacitor Preferences)
    const nip55Creds = await getNip55Credentials();
    if (nip55Creds) {
      try {
        await this.loginWithNip55(nip55Creds.packageName, nip55Creds.pubkey);
        await removeNip55Credentials();
        localStorage.removeItem(LEGACY_KEYS_KEY);
        return;
      } catch (e) {
        console.error("Legacy NIP-55 restore failed:", e);
      }
    }

    // Old NIP-46 bunker URI
    const legacyBunker = JSON.parse(
      localStorage.getItem(LEGACY_BUNKER_URI_KEY) ?? "{}",
    ) as LegacyBunkerUri;
    if (legacyBunker.bunkerUri) {
      localStorage.removeItem(LEGACY_BUNKER_URI_KEY);
      try {
        await this.loginWithNip46(legacyBunker.bunkerUri);
        localStorage.removeItem(LEGACY_KEYS_KEY);
        return;
      } catch (e) {
        console.error("Legacy NIP-46 restore failed:", e);
      }
    }

    // Old guest key (pubkey + secret)
    const legacyKeys = JSON.parse(
      localStorage.getItem(LEGACY_KEYS_KEY) ?? "{}",
    ) as LegacyKeys;
    if (legacyKeys.pubkey && legacyKeys.secret) {
      this.localSigner = new LocalSigner(hexToBytes(legacyKeys.secret));
      return; // Keep LEGACY_KEYS_KEY so the guest session persists across reloads
    }

    // Old extension login (pubkey only, no secret)
    if (legacyKeys.pubkey && !legacyKeys.secret) {
      localStorage.removeItem(LEGACY_KEYS_KEY);
      if (await this.waitForWindowNostr()) {
        try {
          await this.loginWithNip07();
          return;
        } catch (e) {
          console.error("Legacy extension restore failed:", e);
        }
      }
    }
  }

  private async fetchAndCacheUser(pubkey: string): Promise<IUser> {
    try {
      const kind0 = await fetchUserProfile(pubkey);
      const profile = kind0 ? (JSON.parse(kind0.content) as object) : {};
      const userData: IUser = { ...profile, pubkey };
      this.user = userData;
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
      return userData;
    } catch {
      const userData: IUser = {
        pubkey,
        name: ANONYMOUS_USER_NAME,
        picture: DEFAULT_IMAGE_URL,
      };
      this.user = userData;
      return userData;
    }
  }

  private notify() {
    this.onChangeCallbacks.forEach((cb) => cb());
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async getSigner(): Promise<ActiveSigner> {
    const signer = this.localSigner ?? packageSigner.getActiveSigner();
    if (signer) return signer;

    if (this.loginModalCallback) {
      await this.loginModalCallback();
      const resolved = this.localSigner ?? packageSigner.getActiveSigner();
      if (resolved) return resolved;
    }

    throw new Error("NO_SIGNER_AVAILABLE_AND_NO_LOGIN_REQUEST_REGISTERED");
  }

  async getSignerRelays(): Promise<string[]> {
    if (this.localSigner) return [];
    const active = packageSigner.getActiveAccount();
    if (!active || active.method !== "nip46" || !active.nip46) return [];
    return active.nip46.relays;
  }

  getUser(): IUser | null {
    return this.user;
  }

  onChange(cb: () => void): () => void {
    this.onChangeCallbacks.add(cb);
    return () => this.onChangeCallbacks.delete(cb);
  }

  async loginWithNip07(): Promise<void> {
    this.localSigner = null;
    const account = await packageSigner.loginWithExtension();
    await this.fetchAndCacheUser(account.pubkey);
    this.notify();
  }

  async loginWithNip46(bunkerUri: string): Promise<void> {
    this.localSigner = null;
    const account = await packageSigner.loginWithBunkerUri(bunkerUri);
    await this.fetchAndCacheUser(account.pubkey);
    this.notify();
  }

  async loginWithNostrConnectQR(options: {
    relays: string[];
    onUri: (uri: string) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    this.localSigner = null;
    const account = await packageSigner.loginWithNostrConnect({
      ...options,
      metadata: { name: "Calendar", url: window.location.origin },
      perms: ["sign_event", "nip44_encrypt", "nip44_decrypt", "get_public_key"],
    });
    await this.fetchAndCacheUser(account.pubkey);
    this.notify();
  }

  async loginWithNip55(packageName: string, _cachedPubkey?: string): Promise<void> {
    this.localSigner = null;
    const account = await packageSigner.loginWithAndroidSigner({ packageName });
    await this.fetchAndCacheUser(account.pubkey);
    this.notify();
  }

  async loginWithNsec(nsec: string): Promise<void> {
    if (!isNative) throw new Error("NSEC login only allowed on native");

    let privkeyBytes: Uint8Array;
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      privkeyBytes = decoded.data as Uint8Array;
    } catch {
      throw new Error("Invalid nsec");
    }

    this.localSigner = new LocalSigner(privkeyBytes);
    const pubkey = await this.localSigner.getPublicKey();
    await this.fetchAndCacheUser(pubkey);
    await saveNsec(nsec);
    this.notify();
  }

  async createAccount(
    passphrase: string,
    userMetadata: { name?: string; picture?: string; about?: string },
  ): Promise<{ ncryptsec: string }> {
    this.localSigner = null;
    const { ncryptsec } = await packageSigner.createAccount(passphrase);
    const active = packageSigner.getActiveAccount()!;

    const userData: IUser = {
      pubkey: active.pubkey,
      name: userMetadata.name || ANONYMOUS_USER_NAME,
      picture: userMetadata.picture || DEFAULT_IMAGE_URL,
      about: userMetadata.about,
    };
    this.user = userData;
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
    this.notify();

    return { ncryptsec };
  }

  async loginWithNcryptsec(ncryptsec: string, passphrase: string): Promise<void> {
    this.localSigner = null;
    const account = await packageSigner.loginWithNcryptsec(ncryptsec, passphrase);
    await this.fetchAndCacheUser(account.pubkey);
    this.notify();
  }

  getStoredNcryptsec(): string | null {
    const active = packageSigner.getActiveAccount();
    if (active?.method === "ncryptsec") return active.ncryptsec ?? null;
    return null;
  }

  async logout(): Promise<void> {
    if (this.localSigner) {
      this.localSigner = null;
      localStorage.removeItem(LEGACY_KEYS_KEY);
      if (isNative) await removeNsec();
    } else {
      await packageSigner.logout();
    }

    this.user = null;
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(LEGACY_CLIENT_SECRET_KEY);
    localStorage.removeItem(LEGACY_BUNKER_URI_KEY);

    this.notify();
  }
}

export const signerManager = new SignerManager();
