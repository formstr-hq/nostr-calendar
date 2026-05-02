import { beforeEach, describe, expect, it, vi } from "vitest";

let storedItems: Record<string, unknown> = {};

vi.mock("../common/localStorage", () => ({
  getDeviceItem: vi.fn(async (key: string, defaultValue: unknown) =>
    key in storedItems ? storedItems[key] : defaultValue,
  ),
  setDeviceItem: vi.fn(async (key: string, value: unknown) => {
    storedItems[key] = value;
  }),
  removeDeviceItem: vi.fn(async (key: string) => {
    delete storedItems[key];
  }),
}));

const {
  DEFAULT_NOTIFICATION_OFFSETS,
  areNotificationOffsetsEqual,
  clearNotificationPreference,
  getNotificationOffsetsForEvent,
  getNotificationPreference,
  normalizeNotificationOffsets,
  normalizeNotificationPreference,
  resetNotificationPreferencesCache,
  resolveNotificationPreference,
  setNotificationPreference,
  shouldScheduleNotifications,
} = await import("./notificationPreferences");

describe("notificationPreferences", () => {
  beforeEach(() => {
    storedItems = {};
    resetNotificationPreferencesCache();
  });

  it("normalizes offsets by removing duplicates, negatives, and sorting descending", () => {
    expect(normalizeNotificationOffsets([0, 10, 10, -5, 30, 5.9])).toEqual([
      30, 10, 5, 0,
    ]);
  });

  it("treats equal offset lists as equal after normalization", () => {
    expect(areNotificationOffsetsEqual([0, 10, 30], [30, 10, 0])).toBe(true);
  });

  it("falls back to the default offsets when no explicit preference exists", async () => {
    await expect(getNotificationPreference("event-1")).resolves.toBeNull();
    await expect(getNotificationOffsetsForEvent("event-1")).resolves.toEqual(
      DEFAULT_NOTIFICATION_OFFSETS,
    );
  });

  it("stores and returns explicit offsets, including an empty list", async () => {
    await setNotificationPreference("event-1", [60, 10, 10, 0]);
    await expect(getNotificationPreference("event-1")).resolves.toEqual({
      offsetsMinutes: [60, 10, 0],
    });

    await setNotificationPreference("event-2", []);
    await expect(getNotificationOffsetsForEvent("event-2")).resolves.toEqual(
      [],
    );
  });

  it("clears a preference and falls back to the default reminder pattern", async () => {
    await setNotificationPreference("event-1", [15]);
    await clearNotificationPreference("event-1");

    await expect(getNotificationPreference("event-1")).resolves.toBeNull();
    await expect(getNotificationOffsetsForEvent("event-1")).resolves.toEqual(
      DEFAULT_NOTIFICATION_OFFSETS,
    );
  });
});

describe("notification preference resolution", () => {
  it("normalizes only supported list-level preference values", () => {
    expect(normalizeNotificationPreference("enabled")).toBe("enabled");
    expect(normalizeNotificationPreference("disabled")).toBe("disabled");
    expect(normalizeNotificationPreference("maybe")).toBeUndefined();
  });

  it("uses event preference when set", () => {
    expect(resolveNotificationPreference("disabled", "enabled")).toBe(
      "disabled",
    );
    expect(shouldScheduleNotifications("disabled", "enabled")).toBe(false);
  });

  it("falls back to list preference when event preference is undefined", () => {
    expect(resolveNotificationPreference(undefined, "disabled")).toBe(
      "disabled",
    );
    expect(shouldScheduleNotifications(undefined, "disabled")).toBe(false);
  });

  it("defaults to enabled when neither preference is set", () => {
    expect(resolveNotificationPreference(undefined, undefined)).toBe("enabled");
    expect(shouldScheduleNotifications(undefined, undefined)).toBe(true);
  });
});
