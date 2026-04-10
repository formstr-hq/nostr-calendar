import { describe, expect, it } from "vitest";
import {
  resolveNotificationPreference,
  shouldScheduleNotifications,
} from "./notificationPreferences";

describe("notification preference resolution", () => {
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
