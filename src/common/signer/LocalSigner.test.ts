import { describe, it, expect } from "vitest";
import { generateSecretKey, verifyEvent, getPublicKey } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { createLocalSigner } from "./LocalSigner";

// Use a fixed test keypair for deterministic tests
const privkeyBytes = generateSecretKey();
const privkey = bytesToHex(privkeyBytes);
const expectedPubkey = getPublicKey(hexToBytes(privkey));

// A second keypair for encrypt/decrypt peer
const peerPrivkeyBytes = generateSecretKey();
const peerPrivkey = bytesToHex(peerPrivkeyBytes);
const peerPubkey = getPublicKey(hexToBytes(peerPrivkey));

const BASE_EVENT = {
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: "hello world",
};

describe("createLocalSigner", () => {
  it("returns a signer object with the expected shape", () => {
    const signer = createLocalSigner(privkey);
    expect(typeof signer.getPublicKey).toBe("function");
    expect(typeof signer.signEvent).toBe("function");
    expect(typeof signer.encrypt).toBe("function");
    expect(typeof signer.decrypt).toBe("function");
    expect(typeof signer.nip44Encrypt).toBe("function");
    expect(typeof signer.nip44Decrypt).toBe("function");
  });
});

describe("LocalSigner.getPublicKey", () => {
  it("returns the correct public key for the private key", async () => {
    const signer = createLocalSigner(privkey);
    const pubkey = await signer.getPublicKey();
    expect(pubkey).toBe(expectedPubkey);
  });

  it("returns a 64-character hex string", async () => {
    const signer = createLocalSigner(privkey);
    const pubkey = await signer.getPublicKey();
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("derives different pubkeys for different privkeys", async () => {
    const signer1 = createLocalSigner(privkey);
    const signer2 = createLocalSigner(peerPrivkey);
    const pk1 = await signer1.getPublicKey();
    const pk2 = await signer2.getPublicKey();
    expect(pk1).not.toBe(pk2);
  });
});

describe("LocalSigner.signEvent", () => {
  it("signs an event with the correct pubkey", async () => {
    const signer = createLocalSigner(privkey);
    const signed = await signer.signEvent(BASE_EVENT);
    expect(signed.pubkey).toBe(expectedPubkey);
  });

  it("produces a valid cryptographic signature", async () => {
    const signer = createLocalSigner(privkey);
    const signed = await signer.signEvent(BASE_EVENT);
    expect(verifyEvent(signed)).toBe(true);
  });

  it("includes the id field in the signed event", async () => {
    const signer = createLocalSigner(privkey);
    const signed = await signer.signEvent(BASE_EVENT);
    expect(typeof signed.id).toBe("string");
    expect(signed.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes the sig field in the signed event", async () => {
    const signer = createLocalSigner(privkey);
    const signed = await signer.signEvent(BASE_EVENT);
    expect(typeof signed.sig).toBe("string");
    expect(signed.sig.length).toBeGreaterThan(0);
  });

  it("preserves the event kind and content", async () => {
    const signer = createLocalSigner(privkey);
    const event = { ...BASE_EVENT, kind: 31923, content: "calendar event" };
    const signed = await signer.signEvent(event);
    expect(signed.kind).toBe(31923);
    expect(signed.content).toBe("calendar event");
  });

  it("preserves event tags", async () => {
    const signer = createLocalSigner(privkey);
    const event = {
      ...BASE_EVENT,
      tags: [
        ["e", "some-event-id"],
        ["p", "some-pubkey"],
      ],
    };
    const signed = await signer.signEvent(event);
    expect(signed.tags).toEqual([
      ["e", "some-event-id"],
      ["p", "some-pubkey"],
    ]);
  });

  it("produces different signatures for different events", async () => {
    const signer = createLocalSigner(privkey);
    const signed1 = await signer.signEvent({ ...BASE_EVENT, content: "msg 1" });
    const signed2 = await signer.signEvent({ ...BASE_EVENT, content: "msg 2" });
    expect(signed1.sig).not.toBe(signed2.sig);
    expect(signed1.id).not.toBe(signed2.id);
  });
});

describe("LocalSigner NIP-04 encrypt/decrypt", () => {
  it("encrypts and decrypts a message successfully (roundtrip)", async () => {
    const signer = createLocalSigner(privkey);
    const peerSigner = createLocalSigner(peerPrivkey);

    const plaintext = "secret message";
    const ciphertext = await signer.encrypt!(peerPubkey, plaintext);

    // Peer should be able to decrypt with their own key
    const decrypted = await peerSigner.decrypt!(expectedPubkey, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (has randomness)", async () => {
    const signer = createLocalSigner(privkey);
    const ct1 = await signer.encrypt!(peerPubkey, "same message");
    const ct2 = await signer.encrypt!(peerPubkey, "same message");
    // NIP-04 uses random IV, so ciphertexts should differ
    expect(ct1).not.toBe(ct2);
  });

  it("ciphertext is a non-empty string", async () => {
    const signer = createLocalSigner(privkey);
    const ciphertext = await signer.encrypt!(peerPubkey, "test");
    expect(typeof ciphertext).toBe("string");
    expect(ciphertext.length).toBeGreaterThan(0);
  });

  it("decrypting with wrong key fails", async () => {
    const signer = createLocalSigner(privkey);
    const thirdPartyBytes = generateSecretKey();
    const thirdPartyKey = bytesToHex(thirdPartyBytes);
    const thirdPartySigner = createLocalSigner(thirdPartyKey);

    const ciphertext = await signer.encrypt!(peerPubkey, "secret");

    // Third party with wrong key should not decrypt correctly
    await expect(
      thirdPartySigner.decrypt!(expectedPubkey, ciphertext),
    ).rejects.toThrow();
  });
});

describe("LocalSigner NIP-44 encrypt/decrypt", () => {
  it("encrypts and decrypts a message successfully (roundtrip)", async () => {
    const signer = createLocalSigner(privkey);
    const peerSigner = createLocalSigner(peerPrivkey);

    const plaintext = "nip44 secret";
    const ciphertext = await signer.nip44Encrypt!(peerPubkey, plaintext);
    const decrypted = await peerSigner.nip44Decrypt!(
      expectedPubkey,
      ciphertext,
    );
    expect(decrypted).toBe(plaintext);
  });

  it("ciphertext is a non-empty string", async () => {
    const signer = createLocalSigner(privkey);
    const ciphertext = await signer.nip44Encrypt!(peerPubkey, "test");
    expect(typeof ciphertext).toBe("string");
    expect(ciphertext.length).toBeGreaterThan(0);
  });

  it("encrypts long messages correctly", async () => {
    const signer = createLocalSigner(privkey);
    const peerSigner = createLocalSigner(peerPrivkey);
    const longMessage = "a".repeat(1000);

    const ciphertext = await signer.nip44Encrypt!(peerPubkey, longMessage);
    const decrypted = await peerSigner.nip44Decrypt!(
      expectedPubkey,
      ciphertext,
    );
    expect(decrypted).toBe(longMessage);
  });

  it("rejects empty string (NIP-44 requires 1-65535 bytes)", async () => {
    const signer = createLocalSigner(privkey);

    await expect(signer.nip44Encrypt!(peerPubkey, "")).rejects.toThrow();
  });
});
