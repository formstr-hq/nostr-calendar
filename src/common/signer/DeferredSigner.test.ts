import { describe, it, expect, vi } from "vitest";
import { DeferredSigner } from "./DeferredSigner";
import { NostrSigner } from "./types";
import { Event, EventTemplate } from "nostr-tools";

const FAKE_PUBKEY = "a".repeat(64);
const FAKE_PEER_PUBKEY = "b".repeat(64);

function makeMockSigner(overrides: Partial<NostrSigner> = {}): NostrSigner {
  return {
    getPublicKey: vi.fn().mockResolvedValue(FAKE_PUBKEY),
    signEvent: vi
      .fn()
      .mockResolvedValue({ id: "signed-id", sig: "sig" } as any),
    encrypt: vi.fn().mockResolvedValue("encrypted"),
    decrypt: vi.fn().mockResolvedValue("decrypted"),
    nip44Encrypt: vi.fn().mockResolvedValue("nip44-encrypted"),
    nip44Decrypt: vi.fn().mockResolvedValue("nip44-decrypted"),
    ...overrides,
  };
}

const FAKE_EVENT: EventTemplate = {
  kind: 1,
  created_at: 1000000,
  tags: [],
  content: "hello",
};

describe("DeferredSigner.getPublicKey", () => {
  it("returns the cached pubkey immediately without waiting for real signer", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const pubkey = await deferred.getPublicKey();
    expect(pubkey).toBe(FAKE_PUBKEY);
  });

  it("returns pubkey even before resolve() is called", async () => {
    const deferred = new DeferredSigner("my-pubkey");
    // Don't call resolve — pubkey should still be available
    const pubkey = await deferred.getPublicKey();
    expect(pubkey).toBe("my-pubkey");
  });
});

describe("DeferredSigner.isResolved", () => {
  it("returns false before resolve() is called", () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    expect(deferred.isResolved()).toBe(false);
  });

  it("returns true after resolve() is called", () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();
    deferred.resolve(realSigner);
    expect(deferred.isResolved()).toBe(true);
  });
});

describe("DeferredSigner.signEvent", () => {
  it("defers signing to the real signer after resolve", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();

    deferred.resolve(realSigner);
    await deferred.signEvent(FAKE_EVENT);

    expect(realSigner.signEvent).toHaveBeenCalledWith(FAKE_EVENT);
  });

  it("waits for the real signer if resolve is called asynchronously", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();

    // Start signing before resolve
    const signPromise = deferred.signEvent(FAKE_EVENT);

    // Resolve after a tick
    await Promise.resolve();
    deferred.resolve(realSigner);

    const result = await signPromise;
    expect(result).toBeDefined();
    expect(realSigner.signEvent).toHaveBeenCalledWith(FAKE_EVENT);
  });

  it("forwards the signed event returned by the real signer", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const fakeSignedEvent = {
      id: "event-id",
      pubkey: FAKE_PUBKEY,
      created_at: 1000000,
      kind: 1,
      tags: [],
      content: "hello",
      sig: "valid-sig",
    } as Event;
    const realSigner = makeMockSigner({
      signEvent: vi.fn().mockResolvedValue(fakeSignedEvent),
    });

    deferred.resolve(realSigner);
    const result = await deferred.signEvent(FAKE_EVENT);
    expect(result).toBe(fakeSignedEvent);
  });
});

describe("DeferredSigner.encrypt / decrypt (NIP-04)", () => {
  it("delegates encrypt to the real signer", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();
    deferred.resolve(realSigner);

    await deferred.encrypt(FAKE_PEER_PUBKEY, "plaintext");
    expect(realSigner.encrypt).toHaveBeenCalledWith(
      FAKE_PEER_PUBKEY,
      "plaintext",
    );
  });

  it("delegates decrypt to the real signer", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();
    deferred.resolve(realSigner);

    await deferred.decrypt(FAKE_PEER_PUBKEY, "ciphertext");
    expect(realSigner.decrypt).toHaveBeenCalledWith(
      FAKE_PEER_PUBKEY,
      "ciphertext",
    );
  });

  it("throws when real signer does not support encrypt", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner({ encrypt: undefined });
    deferred.resolve(realSigner);

    await expect(deferred.encrypt(FAKE_PEER_PUBKEY, "txt")).rejects.toThrow(
      "Signer does not support encrypt",
    );
  });

  it("throws when real signer does not support decrypt", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner({ decrypt: undefined });
    deferred.resolve(realSigner);

    await expect(deferred.decrypt(FAKE_PEER_PUBKEY, "ct")).rejects.toThrow(
      "Signer does not support decrypt",
    );
  });
});

describe("DeferredSigner NIP-44", () => {
  it("delegates nip44Encrypt to the real signer", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();
    deferred.resolve(realSigner);

    const result = await deferred.nip44Encrypt(FAKE_PEER_PUBKEY, "plaintext");
    expect(realSigner.nip44Encrypt).toHaveBeenCalledWith(
      FAKE_PEER_PUBKEY,
      "plaintext",
    );
    expect(result).toBe("nip44-encrypted");
  });

  it("delegates nip44Decrypt to the real signer", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();
    deferred.resolve(realSigner);

    const result = await deferred.nip44Decrypt(FAKE_PEER_PUBKEY, "ciphertext");
    expect(realSigner.nip44Decrypt).toHaveBeenCalledWith(
      FAKE_PEER_PUBKEY,
      "ciphertext",
    );
    expect(result).toBe("nip44-decrypted");
  });

  it("throws when real signer does not support nip44Encrypt", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner({ nip44Encrypt: undefined });
    deferred.resolve(realSigner);

    await expect(
      deferred.nip44Encrypt(FAKE_PEER_PUBKEY, "txt"),
    ).rejects.toThrow("Signer does not support nip44Encrypt");
  });

  it("throws when real signer does not support nip44Decrypt", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner({ nip44Decrypt: undefined });
    deferred.resolve(realSigner);

    await expect(deferred.nip44Decrypt(FAKE_PEER_PUBKEY, "ct")).rejects.toThrow(
      "Signer does not support nip44Decrypt",
    );
  });
});

describe("DeferredSigner.resolve", () => {
  it("can only effectively be resolved once (second resolve is ignored for state)", () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const signer1 = makeMockSigner();
    const signer2 = makeMockSigner();

    deferred.resolve(signer1);
    expect(deferred.isResolved()).toBe(true);

    // Second resolve — the internal realSigner is already set so the
    // realSignerPromise resolves to signer1, but isResolved stays true.
    deferred.resolve(signer2);
    expect(deferred.isResolved()).toBe(true);
  });

  it("concurrent operations all resolve once the real signer is provided", async () => {
    const deferred = new DeferredSigner(FAKE_PUBKEY);
    const realSigner = makeMockSigner();

    // Start multiple operations concurrently before resolve
    const p1 = deferred.signEvent(FAKE_EVENT);
    const p2 = deferred.encrypt(FAKE_PEER_PUBKEY, "a");
    const p3 = deferred.nip44Encrypt(FAKE_PEER_PUBKEY, "b");

    deferred.resolve(realSigner);

    await Promise.all([p1, p2, p3]);

    expect(realSigner.signEvent).toHaveBeenCalledTimes(1);
    expect(realSigner.encrypt).toHaveBeenCalledTimes(1);
    expect(realSigner.nip44Encrypt).toHaveBeenCalledTimes(1);
  });
});
