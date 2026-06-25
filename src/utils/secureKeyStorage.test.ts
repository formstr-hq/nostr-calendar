import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPreferencesGet = vi.fn();
const mockPreferencesSet = vi.fn();
const mockPreferencesRemove = vi.fn();
const mockSecureGet = vi.fn();
const mockSecureSet = vi.fn();
const mockSecureRemove = vi.fn();

let mockAndroidNative = false;

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: (...args: unknown[]) => mockPreferencesGet(...args),
    set: (...args: unknown[]) => mockPreferencesSet(...args),
    remove: (...args: unknown[]) => mockPreferencesRemove(...args),
  },
}));

vi.mock("@khadarvsk/capacitor-secure-storage", () => ({
  default: {
    get: (...args: unknown[]) => mockSecureGet(...args),
    set: (...args: unknown[]) => mockSecureSet(...args),
    remove: (...args: unknown[]) => mockSecureRemove(...args),
  },
}));

vi.mock("./platform", () => ({
  isAndroidNative: () => mockAndroidNative,
}));

const { getNsec, saveNsec, removeNsec } = await import("./secureKeyStorage");

beforeEach(() => {
  vi.clearAllMocks();
  mockAndroidNative = false;
  mockPreferencesGet.mockResolvedValue({ value: null });
  mockPreferencesSet.mockResolvedValue(undefined);
  mockPreferencesRemove.mockResolvedValue(undefined);
  mockSecureGet.mockResolvedValue({ value: null });
  mockSecureSet.mockResolvedValue(undefined);
  mockSecureRemove.mockResolvedValue(undefined);
});

describe("secureKeyStorage", () => {
  it("uses secure Android storage for nsec writes", async () => {
    mockAndroidNative = true;

    await saveNsec("nsec1secure");

    expect(mockSecureSet).toHaveBeenCalledWith({
      key: "nostr_nsec",
      value: "nsec1secure",
    });
    expect(mockPreferencesSet).not.toHaveBeenCalled();
  });

  it("reads the Android nsec from secure storage", async () => {
    mockAndroidNative = true;
    mockSecureGet.mockResolvedValue({ value: "nsec1secure" });

    await expect(getNsec()).resolves.toBe("nsec1secure");

    expect(mockSecureGet).toHaveBeenCalledWith({
      key: "nostr_nsec",
    });
    expect(mockPreferencesGet).not.toHaveBeenCalled();
  });

  it("removes the Android nsec from secure storage", async () => {
    mockAndroidNative = true;

    await removeNsec();

    expect(mockSecureRemove).toHaveBeenCalledWith({ key: "nostr_nsec" });
    expect(mockPreferencesRemove).not.toHaveBeenCalled();
  });

  it("falls back to Preferences outside Android native", async () => {
    mockPreferencesGet.mockResolvedValue({ value: "nsec1web" });

    await saveNsec("nsec1web");
    await expect(getNsec()).resolves.toBe("nsec1web");
    await removeNsec();

    expect(mockPreferencesSet).toHaveBeenCalledWith({
      key: "nostr_nsec",
      value: "nsec1web",
    });
    expect(mockSecureSet).not.toHaveBeenCalled();
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockSecureRemove).not.toHaveBeenCalled();
  });
});
