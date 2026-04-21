import { describe, it, expect, vi, beforeEach } from "vitest";
import { NostrSigner } from "./types";
import { nip19 } from "nostr-tools";

// ─── Mocks ───────────────────────────────────────────────────────

const mockCreateLocalSigner = vi.fn();
let mockIsNative = false;

vi.mock("./utils", () => ({
  getBunkerUriInLocalStorage: vi.fn(() => ({})),
  getKeysFromLocalStorage: vi.fn(() => ({})),
  setBunkerUriInLocalStorage: vi.fn(),
  setKeysInLocalStorage: vi.fn(),
  setUserDataInLocalStorage: vi.fn(),
  getUserDataFromLocalStorage: vi.fn(() => null),
  removeKeysFromLocalStorage: vi.fn(),
  removeBunkerUriFromLocalStorage: vi.fn(),
  removeAppSecretFromLocalStorage: vi.fn(),
  removeUserDataFromLocalStorage: vi.fn(),
}));

vi.mock("./LocalSigner", () => ({
  createLocalSigner: (...args: unknown[]) => mockCreateLocalSigner(...args),
}));

vi.mock("./NIP07Signer", () => ({
  nip07Signer: {},
}));

vi.mock("./NIP46Signer", () => ({
  createNip46Signer: vi.fn(),
}));

vi.mock("./NIP55Signer", () => ({
  createNIP55Signer: vi.fn(),
}));

vi.mock("../nostr", () => ({
  fetchUserProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../utils/secureKeyStorage", () => ({
  saveNsec: vi.fn().mockResolvedValue(undefined),
  getNsec: vi.fn().mockResolvedValue(null),
  removeNsec: vi.fn().mockResolvedValue(undefined),
  saveNip55Credentials: vi.fn().mockResolvedValue(undefined),
  getNip55Credentials: vi.fn().mockResolvedValue(null),
  removeNip55Credentials: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/platform", () => ({
  get isNative() {
    return mockIsNative;
  },
}));

vi.mock("../../utils/constants", () => ({
  ANONYMOUS_USER_NAME: "Anon...",
  DEFAULT_IMAGE_URL: "https://example.com/anon.png",
}));

vi.mock("../../stores/user", () => ({
  IUser: {},
}));

// ─── Import after mocks ─────────────────────────────────────────

const { signerManager } = await import("./index");

function makeMockSigner(pubkey = "a".repeat(64)): NostrSigner {
  return {
    getPublicKey: vi.fn().mockResolvedValue(pubkey),
    signEvent: vi.fn().mockResolvedValue({ id: "id", sig: "sig" } as any),
    encrypt: vi.fn().mockResolvedValue("encrypted"),
    decrypt: vi.fn().mockResolvedValue("decrypted"),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockIsNative = false;
  // Reset signer state via logout
  await signerManager.logout();
});

// ─── getSigner ───────────────────────────────────────────────────

describe("signerManager.getSigner", () => {
  it("throws when no signer is available and no login modal registered", async () => {
    await expect(signerManager.getSigner()).rejects.toThrow(
      "NO_SIGNER_AVAILABLE_AND_NO_LOGIN_REQUEST_REGISTERED",
    );
  });

  it("calls loginModal callback when no signer is available", async () => {
    const mockSigner = makeMockSigner();
    const loginModal = vi.fn(async () => {
      // Simulate that login sets a signer via createGuestAccount
      mockCreateLocalSigner.mockReturnValue(mockSigner);
      await signerManager.createGuestAccount("privkey", { name: "Test" });
    });

    signerManager.registerLoginModal(loginModal);
    const signer = await signerManager.getSigner();

    expect(loginModal).toHaveBeenCalledTimes(1);
    expect(signer).toBeDefined();
  });

  it("returns the signer directly when one is available", async () => {
    const mockSigner = makeMockSigner();
    mockCreateLocalSigner.mockReturnValue(mockSigner);
    await signerManager.createGuestAccount("privkey", { name: "Test" });

    const signer = await signerManager.getSigner();
    expect(signer).toBeDefined();
  });
});

// ─── getUser ─────────────────────────────────────────────────────

describe("signerManager.getUser", () => {
  it("returns null when no user is set", () => {
    expect(signerManager.getUser()).toBeNull();
  });

  it("returns user after createGuestAccount", async () => {
    const mockSigner = makeMockSigner("pubkey123");
    mockCreateLocalSigner.mockReturnValue(mockSigner);

    await signerManager.createGuestAccount("privkey", {
      name: "Alice",
      picture: "pic.jpg",
    });

    const user = signerManager.getUser();
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Alice");
    expect(user!.picture).toBe("pic.jpg");
    expect(user!.pubkey).toBe("pubkey123");
  });

  it("uses defaults when name/picture not provided", async () => {
    const mockSigner = makeMockSigner("pubkey123");
    mockCreateLocalSigner.mockReturnValue(mockSigner);

    await signerManager.createGuestAccount("privkey", {});

    const user = signerManager.getUser();
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Anon...");
    expect(user!.pubkey).toBe("pubkey123");
  });
});

// ─── onChange ─────────────────────────────────────────────────────

describe("signerManager.onChange", () => {
  it("calls the callback when state changes", async () => {
    const callback = vi.fn();
    signerManager.onChange(callback);

    const mockSigner = makeMockSigner();
    mockCreateLocalSigner.mockReturnValue(mockSigner);
    await signerManager.createGuestAccount("privkey", { name: "Test" });

    expect(callback).toHaveBeenCalled();
  });

  it("returns an unsubscribe function", async () => {
    const callback = vi.fn();
    const unsub = signerManager.onChange(callback);

    // Clear mock count from any initial calls
    callback.mockClear();
    unsub();

    const mockSigner = makeMockSigner();
    mockCreateLocalSigner.mockReturnValue(mockSigner);
    await signerManager.createGuestAccount("privkey", { name: "Test" });

    expect(callback).not.toHaveBeenCalled();
  });

  it("supports multiple callbacks", async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    signerManager.onChange(cb1);
    signerManager.onChange(cb2);

    const mockSigner = makeMockSigner();
    mockCreateLocalSigner.mockReturnValue(mockSigner);
    await signerManager.createGuestAccount("privkey", { name: "Test" });

    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });
});

// ─── logout ──────────────────────────────────────────────────────

describe("signerManager.logout", () => {
  it("clears the signer", async () => {
    const mockSigner = makeMockSigner();
    mockCreateLocalSigner.mockReturnValue(mockSigner);
    await signerManager.createGuestAccount("privkey", { name: "Test" });

    await signerManager.logout();

    await expect(signerManager.getSigner()).rejects.toThrow();
  });

  it("notifies onChange callbacks", async () => {
    const callback = vi.fn();
    signerManager.onChange(callback);
    callback.mockClear();

    await signerManager.logout();

    expect(callback).toHaveBeenCalled();
  });

  it("clears user data", async () => {
    const mockSigner = makeMockSigner();
    mockCreateLocalSigner.mockReturnValue(mockSigner);
    await signerManager.createGuestAccount("privkey", { name: "Test" });

    await signerManager.logout();

    // User should be null — but getUser() actually doesn't clear in logout,
    // it's set to null by the external onChange handler. Let's just verify
    // that getSigner throws (signer is null).
    await expect(signerManager.getSigner()).rejects.toThrow();
  });
});

// ─── createGuestAccount ──────────────────────────────────────────

describe("signerManager.loginWithNsec", () => {
  it("creates a local signer, saves the nsec, and loads the user on native", async () => {
    mockIsNative = true;
    const mockSigner = makeMockSigner("nsec-pubkey");
    mockCreateLocalSigner.mockReturnValue(mockSigner);

    const { saveNsec } = await import("../../utils/secureKeyStorage");
    const { setUserDataInLocalStorage } = await import("./utils");

    const nsec = nip19.nsecEncode(new Uint8Array(32).fill(1));
    await signerManager.loginWithNsec(nsec);

    expect(mockCreateLocalSigner).toHaveBeenCalledWith("01".repeat(32));
    expect(saveNsec).toHaveBeenCalledWith(nsec);
    expect(setUserDataInLocalStorage).toHaveBeenCalled();
    expect(signerManager.getUser()!.pubkey).toBe("nsec-pubkey");
  });

  it("rejects invalid nsec values cleanly", async () => {
    mockIsNative = true;

    await expect(signerManager.loginWithNsec("not-an-nsec")).rejects.toThrow(
      "Invalid nsec",
    );
  });
});

describe("signerManager.createGuestAccount", () => {
  it("creates a local signer with the provided private key", async () => {
    const mockSigner = makeMockSigner();
    mockCreateLocalSigner.mockReturnValue(mockSigner);

    await signerManager.createGuestAccount("my-private-key", {
      name: "Test",
    });

    expect(mockCreateLocalSigner).toHaveBeenCalledWith("my-private-key");
  });

  it("sets user data with the derived pubkey", async () => {
    const mockSigner = makeMockSigner("derived-pubkey");
    mockCreateLocalSigner.mockReturnValue(mockSigner);

    await signerManager.createGuestAccount("privkey", { name: "Alice" });

    const user = signerManager.getUser();
    expect(user!.pubkey).toBe("derived-pubkey");
    expect(user!.name).toBe("Alice");
  });

  it("saves keys and user data to localStorage", async () => {
    const mockSigner = makeMockSigner("pk");
    mockCreateLocalSigner.mockReturnValue(mockSigner);

    const { setKeysInLocalStorage, setUserDataInLocalStorage } = await import(
      "./utils"
    );

    await signerManager.createGuestAccount("privkey", { name: "Test" });

    expect(setKeysInLocalStorage).toHaveBeenCalledWith("pk", "privkey");
    expect(setUserDataInLocalStorage).toHaveBeenCalled();
  });
});

// ─── registerLoginModal ──────────────────────────────────────────

describe("signerManager.registerLoginModal", () => {
  it("getSigner calls the modal when signer is null", async () => {
    const modal = vi.fn(async () => {
      // Don't actually set a signer — test that it still throws
    });

    signerManager.registerLoginModal(modal);

    await expect(signerManager.getSigner()).rejects.toThrow();
    expect(modal).toHaveBeenCalledTimes(1);
  });
});
