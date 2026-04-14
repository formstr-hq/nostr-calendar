import { Preferences } from "@capacitor/preferences";
import { getSecureKeyStoragePlugin } from "../plugins/secureKeyStorage";
import { isAndroidNative } from "./platform";

const NSEC_KEY = "nostr_nsec";
const secureStorage = getSecureKeyStoragePlugin();

async function setNsecValue(nsec: string) {
  if (isAndroidNative()) {
    await secureStorage.set({ key: NSEC_KEY, value: nsec });
    return;
  }

  await Preferences.set({
    key: NSEC_KEY,
    value: nsec,
  });
}

async function getNsecValue(): Promise<string | null> {
  if (isAndroidNative()) {
    const { value } = await secureStorage.get({ key: NSEC_KEY });
    return value;
  }

  const { value } = await Preferences.get({ key: NSEC_KEY });
  return value;
}

async function removeNsecValue() {
  if (isAndroidNative()) {
    await secureStorage.remove({ key: NSEC_KEY });
    return;
  }

  await Preferences.remove({ key: NSEC_KEY });
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
