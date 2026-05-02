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

const nip44Decrypt = async (data: NostrEvent) => {
  const signer = await signerManager.getSigner();
  if (!signer?.nip44Decrypt) {
    throw new Error("CANNOT_DECRYPT_EVENT");
  }
  return JSON.parse(
    await signer.nip44Decrypt(data.pubkey, data.content),
  ) as NostrEvent;
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
  });
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
