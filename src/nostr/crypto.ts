import {
  EventTemplate,
  UnsignedEvent,
  NostrEvent,
  getEventHash,
  getPublicKey,
  generateSecretKey,
  finalizeEvent,
} from "nostr-tools";
import { getConversationKey, encrypt, decrypt } from "nostr-tools/nip44";
import { Seal } from "nostr-tools/kinds";
import { signerManager } from "../common/signer";

type Rumor = UnsignedEvent & { id: string };

const now = () => Math.round(Date.now() / 1000);

export async function getUserPublicKey() {
  const signer = await signerManager.getSigner();
  return signer.getPublicKey();
}

/** Reads the first value of a tag by name, or "" if absent. */
export function getTagValue(tags: string[][], name: string): string {
  return tags.find((t) => t[0] === name)?.[1] ?? "";
}

// --- "Conversation-key-with-a-raw-secret-key-you-hold" idiom -------------
//
// Used whenever the caller already has the raw secret key bytes in hand
// (a generated/derived viewKey), with no signer/login involved — e.g.
// private calendar events, private RSVPs, and scheduling-page viewKeys.
// Callers decode their own key material (nsec vs raw hex — these differ by
// domain and that distinction must NOT be normalized away) and pass the
// resulting Uint8Array in here.

export function selfEncrypt(secretKey: Uint8Array, data: unknown): string {
  const publicKey = getPublicKey(secretKey);
  return encrypt(
    JSON.stringify(data),
    getConversationKey(secretKey, publicKey),
  );
}

export function selfDecrypt<T>(secretKey: Uint8Array, content: string): T {
  const publicKey = getPublicKey(secretKey);
  const plaintext = decrypt(content, getConversationKey(secretKey, publicKey));
  return JSON.parse(plaintext) as T;
}

// --- "Ask the logged-in user's signer" idiom ------------------------------
//
// Requires a live NIP-07/nsec-session/bunker signer tied to the real
// identity. Used for NIP-59 seal/wrap layers, self-encrypted calendar
// lists, and self-encrypted scheduling-page keys.

// Gate for the first concurrent nip44_decrypt call.
// External signers (nos2x-fox, Amber) may show a permission popup on the
// first call and reject immediately while that popup is pending. Keeping a
// gate means all subsequent calls queue up behind the first request instead
// of each firing their own signer round-trip concurrently.
let decryptGate: Promise<void> | null = null;

export async function signerEncrypt(
  pubkey: string,
  data: unknown,
): Promise<string> {
  const signer = await signerManager.getSigner();
  if (!signer?.nip44Encrypt) {
    throw new Error("CANNOT_ENCRYPT");
  }
  return signer.nip44Encrypt(pubkey, JSON.stringify(data));
}

export async function signerDecrypt<T>(
  pubkey: string,
  content: string,
): Promise<T> {
  const signer = await signerManager.getSigner();
  if (!signer?.nip44Decrypt) {
    throw new Error("CANNOT_DECRYPT_EVENT");
  }

  const runDecrypt = async () =>
    signer.nip44Decrypt!(pubkey, content).then((raw) => JSON.parse(raw) as T);

  if (decryptGate === null) {
    // First concurrent call: send it immediately and hold the gate open until
    // it settles so queued callers don't each open their own permission popup.
    const result = runDecrypt();
    decryptGate = result.then(
      () => {},
      () => {},
    );
    void decryptGate.then(() => {
      decryptGate = null;
    });
    return result;
  }
  // Gate is active: wait for the in-flight call to settle, then run ours.
  // Awaiting here regardless of success/failure so that if the user grants
  // the permission in the popup, this call proceeds with it already cached.
  await decryptGate;
  return runDecrypt();
}

// --- NIP-59 gift wrap ------------------------------------------------------

async function createRumor(event: Partial<UnsignedEvent>): Promise<Rumor> {
  const rumor: Rumor = {
    created_at: now(),
    content: "",
    kind: 52,
    tags: [],
    ...event,
    id: "",
    pubkey: await getUserPublicKey(),
  };
  rumor.id = getEventHash(rumor);
  return rumor;
}

async function createSeal(
  rumor: Rumor,
  recipientPublicKey: string,
): Promise<NostrEvent> {
  const signer = await signerManager.getSigner();
  if (!signer?.nip44Encrypt) {
    throw new Error("CANNOT_ENCRYPT");
  }
  const content = await signer.nip44Encrypt(
    recipientPublicKey,
    JSON.stringify(rumor),
  );
  return signer.signEvent({
    kind: Seal,
    content,
    created_at: now(),
    tags: [],
    // manual typecasting as its a seal and seals do not contain pubkey
  } as unknown as UnsignedEvent);
}

function createWrap(
  seal: NostrEvent,
  recipientPublicKey: string,
  kind: number,
  extraTags: string[][] = [],
): NostrEvent {
  const randomKey = generateSecretKey();
  const template: EventTemplate = {
    kind,
    content: encrypt(
      JSON.stringify(seal),
      getConversationKey(randomKey, recipientPublicKey),
    ),
    created_at: now(),
    tags: [["p", recipientPublicKey], ...extraTags],
  };
  return finalizeEvent(template, randomKey);
}

export async function wrapEvent(
  event: Partial<UnsignedEvent>,
  recipientPublicKey: string,
  kind: number,
  extraTags: string[][] = [],
): Promise<NostrEvent> {
  const rumor = await createRumor(event);
  const seal = await createSeal(rumor, recipientPublicKey);
  return createWrap(seal, recipientPublicKey, kind, extraTags);
}

/**
 * Unwraps both NIP-59 layers (seal, then rumor) via the current user's own
 * signer. This works for the outer wrap layer too even though it was
 * *encrypted* with a random ephemeral key (see `createWrap`) because NIP-44
 * conversation keys are symmetric (ECDH): given the wrap's ephemeral
 * `pubkey` field, the receiver's signer derives the same key the sender used.
 */
export async function unwrapEvent(wrap: NostrEvent): Promise<Rumor> {
  const seal = await signerDecrypt<NostrEvent>(wrap.pubkey, wrap.content);
  return signerDecrypt<Rumor>(seal.pubkey, seal.content);
}
