import { Preferences } from "@capacitor/preferences";
import { isNative } from "../utils/platform";

// Synchronous localStorage helpers (for non-sensitive UI prefs like settings, locale)
export const getItem = <T>(key: string, defaultValue: T) => {
  const item = localStorage.getItem(key);
  if (!item) {
    return defaultValue;
  }
  try {
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
};

export const setItem = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const removeItem = (key: string) => {
  localStorage.removeItem(key);
};

// Async secure storage helpers using Capacitor Preferences
// On native: stores in encrypted/sandboxed Preferences
// On desktop/web: no-op (no caching)
export const getSecureItem = async <T>(
  key: string,
  defaultValue: T,
): Promise<T> => {
  if (!isNative) return defaultValue;
  const { value } = await Preferences.get({ key });
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
};

export const setSecureItem = async (
  key: string,
  value: unknown,
): Promise<void> => {
  if (!isNative) return;
  await Preferences.set({ key, value: JSON.stringify(value) });
};

export const removeSecureItem = async (key: string): Promise<void> => {
  if (!isNative) return;
  await Preferences.remove({ key });
};

export const getDeviceItem = async <T>(
  key: string,
  defaultValue: T,
): Promise<T> => {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    if (!value) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }

  return getItem(key, defaultValue);
};

export const setDeviceItem = async (
  key: string,
  value: unknown,
): Promise<void> => {
  if (isNative) {
    await Preferences.set({ key, value: JSON.stringify(value) });
    return;
  }

  setItem(key, value);
};

export const removeDeviceItem = async (key: string): Promise<void> => {
  if (isNative) {
    await Preferences.remove({ key });
    return;
  }

  removeItem(key);
};
