import { generateSecretKey } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { IUser } from "../../stores/user";
import { USER_DATA_TTL_HOURS } from "../../utils/constants";

const LOCAL_APP_SECRET_KEY = "calendar:client-secret";
const LOCAL_BUNKER_URI = "calendar:bunkerUri";
const LOCAL_STORAGE_KEYS = "calendar:keys";
const LOCAL_USER_DATA = "calendar:userData";

type BunkerUri = { bunkerUri: string };

type UserData = {
  user: IUser;
  expiresAt: number;
};

type Keys = { pubkey: string; secret?: string };

export const getAppSecretKeyFromLocalStorage = () => {
  let hexSecretKey = localStorage.getItem(LOCAL_APP_SECRET_KEY);
  if (!hexSecretKey) {
    const newSecret = generateSecretKey();
    hexSecretKey = bytesToHex(newSecret);
    localStorage.setItem(LOCAL_APP_SECRET_KEY, hexSecretKey);
    return newSecret;
  }
  return hexToBytes(hexSecretKey);
};

export const getBunkerUriInLocalStorage = () => {
  return JSON.parse(
    localStorage.getItem(LOCAL_BUNKER_URI) || "{}",
  ) as BunkerUri;
};

export const getKeysFromLocalStorage = () => {
  return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS) || "{}") as Keys;
};

export const setBunkerUriInLocalStorage = (bunkerUri: string) => {
  localStorage.setItem(LOCAL_BUNKER_URI, JSON.stringify({ bunkerUri }));
};

export const setKeysInLocalStorage = (pubkey: string, secret?: string) => {
  localStorage.setItem(LOCAL_STORAGE_KEYS, JSON.stringify({ pubkey, secret }));
};

export const setUserDataInLocalStorage = (
  user: IUser,
  ttlInHours = USER_DATA_TTL_HOURS,
) => {
  const now = new Date();
  const expiresAt = now.setHours(now.getHours() + ttlInHours);

  const userData: UserData = {
    user,
    expiresAt,
  };

  localStorage.setItem(LOCAL_USER_DATA, JSON.stringify(userData));
};

export const getUserDataFromLocalStorage = (): { user: IUser } | null => {
  const data = localStorage.getItem(LOCAL_USER_DATA);
  if (!data) return null;

  try {
    const { user, expiresAt } = JSON.parse(data) as UserData;
    const isExpired = Date.now() > expiresAt;

    // Remove expired data
    if (isExpired) {
      localStorage.removeItem(LOCAL_USER_DATA);
      return null;
    }

    return { user };
  } catch (error) {
    console.error("Failed to parse user data from localStorage", error);
    return null;
  }
};

export const removeUserDataFromLocalStorage = () => {
  localStorage.removeItem(LOCAL_USER_DATA);
};

export const removeKeysFromLocalStorage = () => {
  localStorage.removeItem(LOCAL_STORAGE_KEYS);
};

export const removeBunkerUriFromLocalStorage = () => {
  localStorage.removeItem(LOCAL_BUNKER_URI);
};

export const removeAppSecretFromLocalStorage = () => {
  localStorage.removeItem(LOCAL_APP_SECRET_KEY);
};
