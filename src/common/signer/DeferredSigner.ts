import { Event, UnsignedEvent } from "nostr-tools";
import { NostrSigner } from "./types";

/**
 * A signer that provides the pubkey immediately from cache,
 * but defers signing/encryption operations until the real signer is ready.
 */
export class DeferredSigner implements NostrSigner {
  private pubkey: string;
  private realSigner: NostrSigner | null = null;
  private resolveReal!: (signer: NostrSigner) => void;
  private realSignerPromise: Promise<NostrSigner>;

  constructor(pubkey: string) {
    this.pubkey = pubkey;
    this.realSignerPromise = new Promise((resolve) => {
      this.resolveReal = resolve;
    });
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }

  async signEvent(event: UnsignedEvent): Promise<Event> {
    const signer = await this.waitForReal();
    return signer.signEvent(event);
  }

  async encrypt(pubkey: string, plaintext: string): Promise<string> {
    const signer = await this.waitForReal();
    if (!signer.encrypt) throw new Error("Signer does not support encrypt");
    return signer.encrypt(pubkey, plaintext);
  }

  async decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const signer = await this.waitForReal();
    if (!signer.decrypt) throw new Error("Signer does not support decrypt");
    return signer.decrypt(pubkey, ciphertext);
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    const signer = await this.waitForReal();
    if (!signer.nip44Encrypt)
      throw new Error("Signer does not support nip44Encrypt");
    return signer.nip44Encrypt(pubkey, plaintext);
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const signer = await this.waitForReal();
    if (!signer.nip44Decrypt)
      throw new Error("Signer does not support nip44Decrypt");
    return signer.nip44Decrypt(pubkey, ciphertext);
  }

  resolve(realSigner: NostrSigner) {
    this.realSigner = realSigner;
    this.resolveReal(realSigner);
  }

  isResolved(): boolean {
    return this.realSigner !== null;
  }

  private async waitForReal(): Promise<NostrSigner> {
    if (this.realSigner) return this.realSigner;
    return this.realSignerPromise;
  }
}
