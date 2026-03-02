import { describe, it, expect, vi, beforeEach } from "vitest";

// Set up localStorage mock before importing the module
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  }),
};

vi.stubGlobal("localStorage", localStorageMock);

// Mock nostr-tools generateSecretKey since it's used in getAppSecretKeyFromLocalStorage
vi.mock("nostr-tools", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
  };
});

import {
  getAppSecretKeyFromLocalStorage,
  getBunkerUriInLocalStorage,
  setBunkerUriInLocalStorage,
  getKeysFromLocalStorage,
  setKeysInLocalStorage,
  setUserDataInLocalStorage,
  getUserDataFromLocalStorage,
  removeKeysFromLocalStorage,
  removeBunkerUriFromLocalStorage,
  removeAppSecretFromLocalStorage,
  removeUserDataFromLocalStorage,
} from "./utils";

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  // Clear the real store object
  Object.keys(store).forEach((k) => delete store[k]);
});

// ─── getAppSecretKeyFromLocalStorage ──────────────────────────────

describe("getAppSecretKeyFromLocalStorage", () => {
  it("generates a new secret key when none exists", () => {
    const key = getAppSecretKeyFromLocalStorage();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
    // Should have stored it
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "calendar:client-secret",
      expect.any(String),
    );
  });

  it("returns existing key from localStorage if present", () => {
    // First call generates a key
    const key1 = getAppSecretKeyFromLocalStorage();
    // Second call should return the same key
    const key2 = getAppSecretKeyFromLocalStorage();
    expect(key1).toEqual(key2);
  });

  it("returns a 32-byte Uint8Array", () => {
    const key = getAppSecretKeyFromLocalStorage();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });
});

// ─── BunkerUri ───────────────────────────────────────────────────

describe("getBunkerUriInLocalStorage / setBunkerUriInLocalStorage", () => {
  it("returns empty object when nothing is stored", () => {
    const result = getBunkerUriInLocalStorage();
    expect(result).toEqual({});
  });

  it("stores and retrieves bunker URI", () => {
    setBunkerUriInLocalStorage("bunker://abc123");
    const result = getBunkerUriInLocalStorage();
    expect(result).toEqual({ bunkerUri: "bunker://abc123" });
  });
});

describe("removeBunkerUriFromLocalStorage", () => {
  it("removes the bunker URI", () => {
    setBunkerUriInLocalStorage("bunker://abc");
    removeBunkerUriFromLocalStorage();
    const result = getBunkerUriInLocalStorage();
    expect(result).toEqual({});
  });
});

// ─── Keys ────────────────────────────────────────────────────────

describe("getKeysFromLocalStorage / setKeysInLocalStorage", () => {
  it("returns empty object when nothing is stored", () => {
    const result = getKeysFromLocalStorage();
    expect(result).toEqual({});
  });

  it("stores and retrieves pubkey only", () => {
    setKeysInLocalStorage("pubkey123");
    const result = getKeysFromLocalStorage();
    expect(result.pubkey).toBe("pubkey123");
  });

  it("stores and retrieves pubkey with secret", () => {
    setKeysInLocalStorage("pubkey123", "secret456");
    const result = getKeysFromLocalStorage();
    expect(result.pubkey).toBe("pubkey123");
    expect(result.secret).toBe("secret456");
  });
});

describe("removeKeysFromLocalStorage", () => {
  it("removes stored keys", () => {
    setKeysInLocalStorage("pubkey123", "secret456");
    removeKeysFromLocalStorage();
    const result = getKeysFromLocalStorage();
    expect(result).toEqual({});
  });
});

// ─── UserData ────────────────────────────────────────────────────

describe("setUserDataInLocalStorage / getUserDataFromLocalStorage", () => {
  it("stores and retrieves user data", () => {
    const user = { pubkey: "abc", name: "Alice", picture: "pic.jpg" };
    setUserDataInLocalStorage(user);
    const result = getUserDataFromLocalStorage();
    expect(result).not.toBeNull();
    expect(result!.user).toEqual(user);
  });

  it("returns null when nothing is stored", () => {
    const result = getUserDataFromLocalStorage();
    expect(result).toBeNull();
  });

  it("returns null when data is expired", () => {
    const user = { pubkey: "abc", name: "Alice" };
    // Store with a TTL of 0 hours (immediately expired)
    setUserDataInLocalStorage(user, 0);
    // We need to advance time slightly for expiration check
    const result = getUserDataFromLocalStorage();
    // With TTL 0, the expiresAt is set to now, so it might be equal
    // Let's manually set an expired entry
    store["calendar:userData"] = JSON.stringify({
      user,
      expiresAt: Date.now() - 1000,
    });
    const expired = getUserDataFromLocalStorage();
    expect(expired).toBeNull();
  });

  it("returns null for invalid JSON in localStorage", () => {
    store["calendar:userData"] = "not valid json";
    const result = getUserDataFromLocalStorage();
    expect(result).toBeNull();
  });
});

describe("removeUserDataFromLocalStorage", () => {
  it("removes stored user data", () => {
    const user = { pubkey: "abc", name: "Alice" };
    setUserDataInLocalStorage(user);
    removeUserDataFromLocalStorage();
    const result = getUserDataFromLocalStorage();
    expect(result).toBeNull();
  });
});

// ─── removeAppSecretFromLocalStorage ──────────────────────────────

describe("removeAppSecretFromLocalStorage", () => {
  it("removes the app secret key", () => {
    // Generate a key first
    getAppSecretKeyFromLocalStorage();
    removeAppSecretFromLocalStorage();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(
      "calendar:client-secret",
    );
  });
});
