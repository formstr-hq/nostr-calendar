import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPreferencesGet = vi.fn();
const mockPreferencesSet = vi.fn();
const mockPreferencesRemove = vi.fn();
const mockSecureGet = vi.fn();
const mockSecureSet = vi.fn();
const mockSecureRemove = vi.fn();
const mockConsoleWarn = vi.fn();

let mockNative = false;

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: (...args: unknown[]) => mockPreferencesGet(...args),
    set: (...args: unknown[]) => mockPreferencesSet(...args),
    remove: (...args: unknown[]) => mockPreferencesRemove(...args),
  },
}));

vi.mock("../plugins/secureKeyStorage", () => ({
  default: {
    get: (...args: unknown[]) => mockSecureGet(...args),
    set: (...args: unknown[]) => mockSecureSet(...args),
    remove: (...args: unknown[]) => mockSecureRemove(...args),
  },
}));

vi.mock("./platform", () => ({
  get isNative() {
    return mockNative;
  },
}));

const { getNsec, saveNsec, removeNsec } = await import("./secureKeyStorage");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(mockConsoleWarn);
  mockNative = false;
  mockPreferencesGet.mockResolvedValue({ value: null });
  mockPreferencesSet.mockResolvedValue(undefined);
  mockPreferencesRemove.mockResolvedValue(undefined);
  mockSecureGet.mockResolvedValue({ value: null });
  mockSecureSet.mockResolvedValue(undefined);
  mockSecureRemove.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("secureKeyStorage", () => {
  it("uses secure native storage for nsec writes", async () => {
    mockNative = true;

    await saveNsec("nsec1secure");

    expect(mockSecureSet).toHaveBeenCalledWith({
      key: "nostr_nsec",
      value: "nsec1secure",
    });
    expect(mockPreferencesSet).not.toHaveBeenCalled();
  });

  it("reads the native nsec from secure storage", async () => {
    mockNative = true;
    mockSecureGet.mockResolvedValue({ value: "nsec1secure" });

    await expect(getNsec()).resolves.toBe("nsec1secure");

    expect(mockSecureGet).toHaveBeenCalledWith({
      key: "nostr_nsec",
    });
    expect(mockPreferencesGet).not.toHaveBeenCalled();
  });

  it("removes the native nsec from secure storage", async () => {
    mockNative = true;

    await removeNsec();

    expect(mockSecureRemove).toHaveBeenCalledWith({ key: "nostr_nsec" });
    expect(mockPreferencesRemove).not.toHaveBeenCalled();
  });

  it("falls back to Preferences outside native", async () => {
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

  it("falls back to Preferences when secure storage is unavailable on native", async () => {
    mockNative = true;
    mockSecureSet.mockRejectedValue(new Error("plugin unavailable"));
    mockSecureGet.mockRejectedValue(new Error("plugin unavailable"));
    mockSecureRemove.mockRejectedValue(new Error("plugin unavailable"));
    mockPreferencesGet.mockResolvedValue({ value: "nsec1fallback" });

    await saveNsec("nsec1fallback");
    await expect(getNsec()).resolves.toBe("nsec1fallback");
    await removeNsec();

    expect(mockPreferencesSet).toHaveBeenCalledWith({
      key: "nostr_nsec",
      value: "nsec1fallback",
    });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "nostr_nsec" });
    expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: "nostr_nsec" });
  });
});
