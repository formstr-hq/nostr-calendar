import { registerPlugin } from "@capacitor/core";

type SecureKeyStoragePlugin = {
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  remove(options: { key: string }): Promise<void>;
};

const SecureKeyStorage =
  registerPlugin<SecureKeyStoragePlugin>("SecureKeyStorage");

export default SecureKeyStorage;
