import { Event, UnsignedEvent } from "nostr-tools";
import { EventKinds } from "./kinds";
import { getUserPublicKey, signerEncrypt, signerDecrypt } from "./crypto";
import { buildAndSign, publishSignedEvent } from "./core";
import { fetchAll } from "./fetch";

/**
 * Encrypted payload schema for kind 32680 events. The shape is versioned
 * so we can extend the schema without rotating the kind.
 */
export interface SchedulingPageKeyPayload {
  v: 1;
  /** NIP-19 nsec encoding of the scheduling page's viewKey. */
  viewKey: string;
  /** d-tag of the scheduling page. */
  dTag: string;
  /** Unix-seconds timestamp of when the key was published. */
  createdAt: number;
}

/**
 * Publishes a self-encrypted kind-32680 event recording `viewKey` for one
 * scheduling page the current user authored. Replaces any prior version
 * (parameterized-replaceable per `(pubkey, page d-tag)`).
 *
 * `content === ""` is reserved for tombstones; callers wishing to revoke
 * a key should publish an empty payload via `publishEmptySchedulingPageKey`.
 */
export async function publishSchedulingPageKey(params: {
  dTag: string;
  viewKeyNsec: string;
}): Promise<Event> {
  const userPubkey = await getUserPublicKey();
  const payload: SchedulingPageKeyPayload = {
    v: 1,
    viewKey: params.viewKeyNsec,
    dTag: params.dTag,
    createdAt: Math.floor(Date.now() / 1000),
  };
  const encrypted = await signerEncrypt(userPubkey, payload);
  const unsigned: UnsignedEvent = {
    kind: EventKinds.SchedulingPagesList,
    pubkey: userPubkey,
    tags: [["d", params.dTag]],
    content: encrypted,
    created_at: payload.createdAt,
  };
  const signedEvent = await buildAndSign(unsigned);
  await publishSignedEvent(signedEvent);
  return signedEvent;
}

/**
 * Publishes a tombstone (empty-content) kind-32680 event for the given
 * d-tag. Used when the creator deletes the underlying scheduling page.
 */
export async function publishEmptySchedulingPageKey(
  dTag: string,
): Promise<Event> {
  const userPubkey = await getUserPublicKey();
  const unsigned: UnsignedEvent = {
    kind: EventKinds.SchedulingPagesList,
    pubkey: userPubkey,
    tags: [["d", dTag]],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signedEvent = await buildAndSign(unsigned);
  await publishSignedEvent(signedEvent);
  return signedEvent;
}

/**
 * Fetches all kind-32680 scheduling-page-key events for the current user
 * and decrypts them. Returns a `Map<dTag, viewKeyNsec>`. Tombstones (empty
 * content) and entries the signer cannot decrypt are skipped.
 */
export async function fetchOwnSchedulingPageKeys(): Promise<
  Map<string, string>
> {
  const userPubkey = await getUserPublicKey();
  const events = await fetchAll([
    { kinds: [EventKinds.SchedulingPagesList], authors: [userPubkey] },
  ]);

  const result = new Map<string, string>();
  for (const event of events) {
    const dTag = event.tags.find((t) => t[0] === "d")?.[1];
    if (!dTag) continue;
    if (!event.content) continue; // tombstone
    try {
      const payload = await signerDecrypt<Partial<SchedulingPageKeyPayload>>(
        userPubkey,
        event.content,
      );
      if (
        payload &&
        typeof payload.viewKey === "string" &&
        payload.dTag === dTag
      ) {
        result.set(dTag, payload.viewKey);
      }
    } catch (err) {
      console.warn(
        `Failed to decrypt scheduling page key for d=${dTag}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}
