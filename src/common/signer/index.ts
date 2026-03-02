import { nip07Signer } from "./NIP07Signer";
import { createNip46Signer } from "./NIP46Signer";

import {
  getBunkerUriInLocalStorage,
  getKeysFromLocalStorage,
  setBunkerUriInLocalStorage,
  setKeysInLocalStorage,
  removeKeysFromLocalStorage,
  removeBunkerUriFromLocalStorage,
  removeAppSecretFromLocalStorage,
  setUserDataInLocalStorage,
  getUserDataFromLocalStorage,
  removeUserDataFromLocalStorage,
} from "./utils";
import { createLocalSigner } from "./LocalSigner";
import { NostrSigner } from "./types";
import { DeferredSigner } from "./DeferredSigner";
import { createNIP55Signer } from "./NIP55Signer";
import { fetchUserProfile } from "../nostr";
import { ANONYMOUS_USER_NAME, DEFAULT_IMAGE_URL } from "../../utils/constants";
import { IUser } from "../../stores/user";
import {
  getNip55Credentials,
  getNsec,
  removeNip55Credentials,
  removeNsec,
  saveNip55Credentials,
  saveNsec,
} from "../../utils/secureKeyStorage";
import { isNative } from "../../utils/platform";
import { nip19 } from "nostr-tools";
import { bytesToHex } from "nostr-tools/utils";

class Signer {
  private signer: NostrSigner | null = null;
  private user: IUser | null = null;
  private onChangeCallbacks: Set<() => void> = new Set();
  private loginModalCallback: (() => Promise<void>) | null = null;

  constructor() {
    // restoreFromStorage() is called by initializeUser() in the user store
    // after the onUserChange callback is registered
  }

  registerLoginModal(callback: () => Promise<void>) {
    this.loginModalCallback = callback;
  }

  async restoreFromStorage() {
    const cachedUser = getUserDataFromLocalStorage();
    if (cachedUser) this.user = cachedUser.user;
    const keys = getKeysFromLocalStorage();

    // Phase 1: If we have a cached pubkey, set up a deferred signer
    // and notify immediately so the app can start fetching events
    let deferredSigner: DeferredSigner | null = null;
    if (keys?.pubkey) {
      deferredSigner = new DeferredSigner(keys.pubkey);
      this.signer = deferredSigner;
      this.notify();
    }

    // Phase 2: Restore the real signer in the background
    const bunkerUri = getBunkerUriInLocalStorage();
    const nip55Creds = await getNip55Credentials();
    try {
      let restored = false;
      if (isNative) {
        const nsec = await getNsec();
        if (nsec) {
          await this.loginWithNsec(nsec);
          restored = true;
        }
      }
      if (!restored && nip55Creds) {
        console.log(
          "Restoring NIP-55 session with cached pubkey:",
          nip55Creds.pubkey,
        );
        await this.loginWithNip55(nip55Creds.packageName, nip55Creds.pubkey);
      } else if (!restored && bunkerUri?.bunkerUri) {
        await this.loginWithNip46(bunkerUri.bunkerUri);
      } else if (!restored && window.nostr && Object.keys(keys).length != 0) {
        console.log("Restoring loginWithNip07");
        await this.loginWithNip07();
      } else if (!restored && keys?.pubkey && keys?.secret) {
        console.log("Restoring guest");
        await this.loginWithGuestKey(keys.pubkey, keys.secret);
      }
    } catch (e) {
      console.error("Signer restore failed:", e);
    }

    // Resolve the deferred signer now that the real one is ready
    if (deferredSigner && this.signer !== deferredSigner && this.signer) {
      deferredSigner.resolve(this.signer);
    }

    this.notify();
  }
  private async loginWithGuestKey(pubkey: string, privkey: string) {
    this.signer = createLocalSigner(privkey);

    // Restore user data from localStorage cache if not already set
    if (!this.user) {
      const cached = getUserDataFromLocalStorage();
      this.user = cached?.user ?? {
        pubkey,
        name: ANONYMOUS_USER_NAME,
        picture: DEFAULT_IMAGE_URL,
      };
    }
  }

  async loginWithNsec(nsec: string) {
    if (!isNative) throw new Error("NSEC login only allowed on native");

    const privkey = nip19.decode(nsec).data as Uint8Array;
    if (!privkey) throw new Error("Invalid nsec");

    this.signer = createLocalSigner(bytesToHex(privkey));

    const pubkey = await this.signer.getPublicKey();

    await this.saveUser(pubkey);
    await saveNsec(nsec);

    this.notify();
  }

  async createGuestAccount(
    privkey: string,
    userMetadata: { name?: string; picture?: string; about?: string },
  ) {
    this.signer = createLocalSigner(privkey);

    const pubkey = await this.signer.getPublicKey();

    const userData: IUser = {
      pubkey,
      name: userMetadata.name || ANONYMOUS_USER_NAME,
      picture: userMetadata.picture || DEFAULT_IMAGE_URL,
      about: userMetadata.about,
    };
    this.user = userData;

    // Save keys and user data
    setKeysInLocalStorage(pubkey, privkey);
    setUserDataInLocalStorage(userData);
    this.notify();
  }

  private async saveUser(pubkey: string) {
    const kind0 = await fetchUserProfile(pubkey);
    const userData = kind0
      ? { ...JSON.parse(kind0.content), pubkey }
      : { pubkey, name: ANONYMOUS_USER_NAME, picture: DEFAULT_IMAGE_URL };
    this.user = userData;
    setUserDataInLocalStorage(userData);
    return userData;
  }

  async loginWithNip07() {
    console.log("LOGGIN IN WITH NIP07");
    if (!window.nostr) throw new Error("NIP-07 extension not found");
    this.signer = nip07Signer;
    const pubkey = await window.nostr.getPublicKey();
    setKeysInLocalStorage(pubkey);
    await this.saveUser(pubkey);
    this.notify();
    console.log("LOGGIN IN WITH NIP07 IS NOW COMPLETE");
  }

  async loginWithNip46(bunkerUri: string) {
    const remoteSigner = await createNip46Signer(bunkerUri);
    const pubkey = await remoteSigner.getPublicKey();
    setKeysInLocalStorage(pubkey);
    setBunkerUriInLocalStorage(bunkerUri);
    await this.saveUser(pubkey);

    this.signer = remoteSigner;
    this.notify();
    console.log("LOGIN WITH BUNKER COMPLETE");
  }

  async loginWithNip55(packageName: string, cachedPubkey?: string) {
    const signer = createNIP55Signer(packageName, cachedPubkey);

    // Step 1: ask Amber for pubkey (skipped if cachedPubkey provided)
    const pubkey = await signer.getPublicKey();

    // Step 2: fetch kind0 profile
    await this.saveUser(pubkey);

    // Step 3: save signer and user
    this.signer = signer;

    await saveNip55Credentials(packageName, pubkey);
    this.notify();
  }

  async logout() {
    this.signer = null;
    this.user = null;
    this.loginModalCallback = null;
    removeNsec();
    removeKeysFromLocalStorage();
    removeBunkerUriFromLocalStorage();
    removeAppSecretFromLocalStorage();
    removeUserDataFromLocalStorage();
    await removeNip55Credentials();

    console.log("Logged out from everywhere");
    this.notify();
  }

  async getSigner(): Promise<NostrSigner> {
    if (this.signer) return this.signer;

    if (this.loginModalCallback) {
      await this.loginModalCallback();
      if (this.signer) return this.signer;
    }

    throw new Error("NO_SIGNER_AVAILABLE_AND_NO_LOGIN_REQUEST_REGISTERED");
  }

  async getSignerRelays(): Promise<string[]> {
    if (!this.signer?.getRelays) return [];
    try {
      return await this.signer.getRelays();
    } catch {
      return [];
    }
  }

  getUser() {
    return this.user;
  }

  onChange(cb: () => void) {
    this.onChangeCallbacks.add(cb);
    return () => this.onChangeCallbacks.delete(cb);
  }

  private notify() {
    this.onChangeCallbacks.forEach((cb) => cb());
  }
}

export const signerManager = new Signer();
