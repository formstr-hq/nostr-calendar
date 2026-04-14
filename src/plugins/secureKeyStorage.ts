import { registerPlugin } from "@capacitor/core";

export interface SecureKeyStoragePlugin {
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  remove(options: { key: string }): Promise<void>;
}

const secureKeyStoragePlugin = registerPlugin<SecureKeyStoragePlugin>(
  "SecureKeyStorage",
);

export const getSecureKeyStoragePlugin = () => secureKeyStoragePlugin;
