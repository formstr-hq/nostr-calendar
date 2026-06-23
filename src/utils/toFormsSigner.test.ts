import { describe, expect, it } from "vitest";
import type { EventTemplate } from "nostr-tools";
import type { ActiveSigner } from "@formstr/signer";
import { toFormsSigner } from "./toFormsSigner";

const sampleEvent: EventTemplate = {
  kind: 1069,
  tags: [],
  content: "",
  created_at: 0,
};

/**
 * Mimics how `@formstr/signer` implements its signer classes: crypto/signing
 * methods are plain (unbound) class methods that read a private field through
 * `this`. Copying such a method as a bare reference detaches it from its
 * instance, so calling it later throws "Cannot read private member ... from an
 * object whose class did not declare it". `toFormsSigner` must guard against
 * that by binding every method to the signer instance.
 */
class FakeSigner {
  #secret: string;

  constructor(secret: string) {
    this.#secret = secret;
  }

  async getPublicKey(): Promise<string> {
    return `pub:${this.#secret}`;
  }

  async signEvent(event: EventTemplate) {
    return { ...event, sig: this.#secret } as never;
  }

  async nip44Encrypt(_peer: string, plaintext: string): Promise<string> {
    return `enc(${this.#secret}):${plaintext}`;
  }

  async nip44Decrypt(_peer: string, ciphertext: string): Promise<string> {
    return `dec(${this.#secret}):${ciphertext}`;
  }
}

const makeSigner = () => new FakeSigner("s3cr3t") as unknown as ActiveSigner;

describe("toFormsSigner", () => {
  it("returns methods that stay bound to the signer when called detached", async () => {
    const formsSigner = toFormsSigner(makeSigner());

    // Detach the methods exactly the way the SDK does internally before calling.
    const { getPublicKey, signEvent, nip44Encrypt, nip44Decrypt } = formsSigner;

    await expect(getPublicKey()).resolves.toBe("pub:s3cr3t");
    await expect(nip44Encrypt("peer", "hello")).resolves.toBe(
      "enc(s3cr3t):hello",
    );
    await expect(nip44Decrypt("peer", "ct")).resolves.toBe("dec(s3cr3t):ct");
    await expect(signEvent(sampleEvent)).resolves.toMatchObject({
      sig: "s3cr3t",
    });
  });

  it("preserves private-member access even when invoked on a plain object", async () => {
    const formsSigner = toFormsSigner(makeSigner());

    // Re-host the bound method on an unrelated object: binding must win over
    // the call-site `this`, otherwise the private-field read throws.
    const host = { nip44Encrypt: formsSigner.nip44Encrypt };
    await expect(host.nip44Encrypt("peer", "x")).resolves.toBe("enc(s3cr3t):x");
  });
});
