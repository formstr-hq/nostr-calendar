import {
  EventTemplate,
  UnsignedEvent,
  NostrEvent,
  getEventHash,
  generateSecretKey,
  finalizeEvent,
} from "nostr-tools";
import { getConversationKey, encrypt } from "nostr-tools/nip44";
import { Seal } from "nostr-tools/kinds";
import { signerManager } from "./signer";

type Rumor = UnsignedEvent & { id: string };

const now = () => Math.round(Date.now() / 1000);

const nip44ConversationKey = (privateKey: Uint8Array, publicKey: string) =>
  getConversationKey(privateKey, publicKey);

const nip44Encrypt = (
  data: EventTemplate,
  privateKey: Uint8Array,
  publicKey: string,
) => encrypt(JSON.stringify(data), nip44ConversationKey(privateKey, publicKey));

// Gate for the first concurrent nip44_decrypt call.
// External signers (nos2x-fox, Amber) may show a permission popup on the
// first call and reject immediately while that popup is pending. Keeping a
// gate means all subsequent calls queue up behind the first request instead
// of each firing their own signer round-trip concurrently.
let decryptGate: Promise<void> | null = null;

export const nip44Decrypt = async (
  data: Pick<NostrEvent, "pubkey" | "content">,
): Promise<NostrEvent> => {
  const signer = await signerManager.getSigner();
  console.log("SIGNER-DECRYPT", "called");
  if (!signer?.nip44Decrypt) {
    throw new Error("CANNOT_DECRYPT_EVENT");
  }

  const runDecrypt = async () => {
    console.log("SIGNER-DECRYPT", "calling decrypt");
    return signer.nip44Decrypt!(data.pubkey, data.content).then((raw) => {
      console.log("SIGNER-DECRYPT", raw);
      return JSON.parse(raw) as NostrEvent;
    });
  };

  if (decryptGate === null) {
    // First concurrent call: send it immediately and hold the gate open until
    // it settles so queued callers don't each open their own permission popup.
    console.log("SIGNER-DECRYPT", "first call");
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
  console.log("SIGNER-DECRYPT", "general call");
  // Gate is active: wait for the in-flight call to settle, then run ours.
  // Awaiting here regardless of success/failure so that if the user grants
  // the permission in the popup, this call proceeds with it already cached.
  await decryptGate;
  return runDecrypt();
};

export async function getUserPublicKey() {
  const signer = await signerManager.getSigner();
  const pubKey = await signer.getPublicKey();
  return pubKey;
}

export async function createRumor(event: Partial<UnsignedEvent>) {
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

export async function createSeal(rumor: Rumor, recipientPublicKey: string) {
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

export function createWrap(
  seal: NostrEvent,
  recipientPublicKey: string,
  kind: number,
  extraTags: string[][] = [],
) {
  const randomKey = generateSecretKey();

  return finalizeEvent(
    {
      kind,
      content: nip44Encrypt(seal, randomKey, recipientPublicKey),
      created_at: now(),
      tags: [["p", recipientPublicKey], ...extraTags],
    },
    randomKey,
  );
}

export async function wrapEvent(
  event: Partial<UnsignedEvent>,
  recipientPublicKey: string,
  kind: number,
  extraTags: string[][] = [],
) {
  const rumor = await createRumor(event);

  const seal = await createSeal(rumor, recipientPublicKey);
  return createWrap(seal, recipientPublicKey, kind, extraTags);
}

export async function wrapManyEvents(
  event: Partial<UnsignedEvent>,
  recipientsPublicKeys: string[],
  kind: number,
) {
  if (!recipientsPublicKeys || recipientsPublicKeys.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  const senderPublicKey = await getUserPublicKey();

  const wrappeds = [wrapEvent(event, senderPublicKey, kind)];

  recipientsPublicKeys.forEach((recipientPublicKey) => {
    wrappeds.push(wrapEvent(event, recipientPublicKey, kind));
  });

  return wrappeds;
}

export async function unwrapEvent(wrap: NostrEvent) {
  const unwrappedSeal = await nip44Decrypt(wrap);
  return nip44Decrypt(unwrappedSeal);
}

export async function unwrapManyEvents(wrappedEvents: NostrEvent[]) {
  const unwrappedEventsPromise: Promise<Rumor>[] = [];

  wrappedEvents.forEach((e) => {
    unwrappedEventsPromise.push(unwrapEvent(e));
  });

  const unwrappedEvents = await Promise.all(unwrappedEventsPromise);

  unwrappedEvents.sort((a, b) => a.created_at - b.created_at);

  return unwrappedEvents;
}
