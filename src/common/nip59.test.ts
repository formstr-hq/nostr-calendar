import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip44,
  type UnsignedEvent,
  type NostrEvent,
} from "nostr-tools";
import { Seal } from "nostr-tools/kinds";

// A mutable "current signer" so a test can wrap as the sender and then unwrap
// as the recipient — both backed by real keypairs and real NIP-44 crypto.
const { signerRef } = vi.hoisted(() => ({
  signerRef: { current: null as ReturnType<typeof buildSigner> | null },
}));

vi.mock("./signer", () => ({
  signerManager: {
    getSigner: vi.fn(async () => signerRef.current),
  },
}));

import {
  createRumor,
  createSeal,
  createWrap,
  wrapEvent,
  unwrapEvent,
  wrapManyEvents,
  unwrapManyEvents,
  getUserPublicKey,
} from "./nip59";

function buildSigner(sk: Uint8Array) {
  const pk = getPublicKey(sk);
  return {
    pubkey: pk,
    getPublicKey: async () => pk,
    signEvent: async (e: UnsignedEvent) => finalizeEvent(e as never, sk),
    nip44Encrypt: async (peer: string, plaintext: string) =>
      nip44.encrypt(plaintext, nip44.getConversationKey(sk, peer)),
    nip44Decrypt: async (peer: string, ciphertext: string) =>
      nip44.decrypt(ciphertext, nip44.getConversationKey(sk, peer)),
  };
}

const senderSk = generateSecretKey();
const recipientSk = generateSecretKey();
const sender = buildSigner(senderSk);
const recipient = buildSigner(recipientSk);

const RUMOR = {
  kind: 52,
  content: "",
  tags: [
    ["a", "32678:author:dtag", "wss://relay.example"],
    ["viewKey", "nsec1example"],
  ],
};

beforeEach(() => {
  signerRef.current = sender;
});

describe("getUserPublicKey", () => {
  it("returns the current signer's public key", async () => {
    expect(await getUserPublicKey()).toBe(sender.pubkey);
  });
});

describe("createRumor", () => {
  it("fills defaults, stamps the author pubkey, and computes an id", async () => {
    const rumor = await createRumor({ kind: 52, tags: RUMOR.tags });
    expect(rumor.pubkey).toBe(sender.pubkey);
    expect(rumor.kind).toBe(52);
    expect(rumor.tags).toEqual(RUMOR.tags);
    expect(rumor.id).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof rumor.created_at).toBe("number");
  });

  it("defaults kind to 52 and content to empty when omitted", async () => {
    const rumor = await createRumor({});
    expect(rumor.kind).toBe(52);
    expect(rumor.content).toBe("");
    expect(rumor.tags).toEqual([]);
  });
});

describe("createSeal", () => {
  it("throws when the signer cannot NIP-44 encrypt", async () => {
    signerRef.current = {
      ...sender,
      nip44Encrypt: undefined,
    } as never;
    const rumor = await createRumor({ kind: 52 });
    await expect(createSeal(rumor, recipient.pubkey)).rejects.toThrow(
      "CANNOT_ENCRYPT",
    );
  });

  it("produces a kind-13 seal authored by the sender", async () => {
    const rumor = await createRumor({ kind: 52, tags: RUMOR.tags });
    const seal = await createSeal(rumor, recipient.pubkey);
    expect(seal.kind).toBe(Seal);
    expect(seal.pubkey).toBe(sender.pubkey);
    expect(seal.tags).toEqual([]);
  });
});

describe("createWrap", () => {
  it("wraps with an ephemeral key, tags the recipient, and carries extra tags", () => {
    const seal = {
      kind: Seal,
      content: "sealed",
      pubkey: sender.pubkey,
    } as unknown as NostrEvent;
    const extra = [["booking", "true"]];
    const wrap = createWrap(seal, recipient.pubkey, 1052, extra);

    expect(wrap.kind).toBe(1052);
    // Outer wrap is signed by a random ephemeral key, never the sender.
    expect(wrap.pubkey).not.toBe(sender.pubkey);
    expect(wrap.tags).toContainEqual(["p", recipient.pubkey]);
    expect(wrap.tags).toContainEqual(["booking", "true"]);
  });
});

describe("wrapEvent / unwrapEvent round trip", () => {
  it("recovers the original rumor when unwrapped by the recipient", async () => {
    signerRef.current = sender;
    const wrap = await wrapEvent(RUMOR, recipient.pubkey, 1052);

    expect(wrap.kind).toBe(1052);
    expect(wrap.tags).toContainEqual(["p", recipient.pubkey]);

    // Switch identity to the recipient to decrypt both envelope layers.
    signerRef.current = recipient;
    const rumor = await unwrapEvent(wrap);

    expect(rumor.kind).toBe(52);
    expect(rumor.pubkey).toBe(sender.pubkey);
    expect(rumor.tags).toEqual(RUMOR.tags);
  });

  it("forwards extra public tags onto the outer wrap", async () => {
    signerRef.current = sender;
    const wrap = await wrapEvent(RUMOR, recipient.pubkey, 1052, [
      ["booking", "true"],
    ]);
    expect(wrap.tags).toContainEqual(["booking", "true"]);
  });

  it("throws CANNOT_DECRYPT_EVENT when the signer cannot decrypt", async () => {
    signerRef.current = sender;
    const wrap = await wrapEvent(RUMOR, recipient.pubkey, 1052);

    signerRef.current = { ...recipient, nip44Decrypt: undefined } as never;
    await expect(unwrapEvent(wrap)).rejects.toThrow("CANNOT_DECRYPT_EVENT");
  });
});

describe("wrapManyEvents", () => {
  it("throws when no recipients are supplied", async () => {
    await expect(wrapManyEvents(RUMOR, [], 1052)).rejects.toThrow(
      "At least one recipient is required.",
    );
    await expect(
      wrapManyEvents(RUMOR, undefined as never, 1052),
    ).rejects.toThrow("At least one recipient is required.");
  });

  it("wraps once for the sender plus once per recipient", async () => {
    signerRef.current = sender;
    const wraps = await Promise.all(
      await wrapManyEvents(RUMOR, [recipient.pubkey], 1052),
    );
    // sender self-wrap + one recipient = 2
    expect(wraps).toHaveLength(2);
    wraps.forEach((w) => expect(w.kind).toBe(1052));
  });
});

describe("unwrapManyEvents", () => {
  it("unwraps all wraps and sorts them by created_at ascending", async () => {
    vi.useFakeTimers();
    try {
      signerRef.current = sender;
      vi.setSystemTime(new Date(2_000_000 * 1000));
      const older = await wrapEvent(
        { kind: 52, tags: [["n", "older"]] },
        recipient.pubkey,
        1052,
      );
      vi.setSystemTime(new Date(3_000_000 * 1000));
      const newer = await wrapEvent(
        { kind: 52, tags: [["n", "newer"]] },
        recipient.pubkey,
        1052,
      );

      signerRef.current = recipient;
      // Pass newest-first to prove the helper sorts ascending.
      const rumors = await unwrapManyEvents([newer, older]);
      expect(rumors.map((r) => r.tags[0][1])).toEqual(["older", "newer"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
