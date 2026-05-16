import { Preferences } from "@capacitor/preferences";
import { isNative } from "./platform";
import SecureKeyStorage from "../plugins/secureKeyStorage";

const NSEC_KEY = "nostr_nsec";

async function trySecureStorage<T>(
  secureAction: () => Promise<T>,
  fallbackAction: () => Promise<T>,
): Promise<T> {
  if (!isNative) {
    return fallbackAction();
  }

  try {
    return await secureAction();
  } catch (error) {
    console.warn(
      "SecureKeyStorage unavailable, falling back to Preferences",
      error,
    );
    return fallbackAction();
  }
}

async function setNsecValue(nsec: string) {
  await trySecureStorage(
    () => SecureKeyStorage.set({ key: NSEC_KEY, value: nsec }),
    () =>
      Preferences.set({
        key: NSEC_KEY,
        value: nsec,
      }),
  );
}

async function getNsecValue(): Promise<string | null> {
  return trySecureStorage(
    async () => {
      const { value } = await SecureKeyStorage.get({ key: NSEC_KEY });
      return value;
    },
    async () => {
      const { value } = await Preferences.get({ key: NSEC_KEY });
      return value;
    },
  );
}

async function removeNsecValue() {
  await trySecureStorage(
    () => SecureKeyStorage.remove({ key: NSEC_KEY }),
    () => Preferences.remove({ key: NSEC_KEY }),
  );
}

export async function saveNsec(nsec: string) {
  await setNsecValue(nsec);
}

export async function getNsec(): Promise<string | null> {
  return getNsecValue();
}

export async function removeNsec() {
  await removeNsecValue();
}

const NIP55_PACKAGE_KEY = "nip55_package_name";
const NIP55_PUBKEY_KEY = "nip55_pubkey";

export async function saveNip55Credentials(
  packageName: string,
  pubkey: string,
) {
  await Preferences.set({ key: NIP55_PACKAGE_KEY, value: packageName });
  await Preferences.set({ key: NIP55_PUBKEY_KEY, value: pubkey });
}

export async function getNip55Credentials(): Promise<{
  packageName: string;
  pubkey: string;
} | null> {
  const { value: packageName } = await Preferences.get({
    key: NIP55_PACKAGE_KEY,
  });
  const { value: pubkey } = await Preferences.get({ key: NIP55_PUBKEY_KEY });

  if (packageName && pubkey) {
    return { packageName, pubkey };
  }
  return null;
}

export async function removeNip55Credentials() {
  await Preferences.remove({ key: NIP55_PACKAGE_KEY });
  await Preferences.remove({ key: NIP55_PUBKEY_KEY });
}
