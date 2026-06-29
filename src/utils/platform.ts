// utils/platform.ts
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const PUBLIC_APP_BASE_URL = "https://calendar.formstr.app";

export function isAndroidNative() {
  return Capacitor.getPlatform() === "android";
}

export function isIOSNative() {
  return Capacitor.getPlatform() === "ios";
}

export function getAppBaseUrl(): string {
  if (isNative) {
    return PUBLIC_APP_BASE_URL;
  }
  return window.location.origin;
}
