import type { FormsSigner } from "@formstr/sdk";
import type { ActiveSigner } from "@formstr/signer";

/**
 * Adapts an `@formstr/signer` `ActiveSigner` into the `FormsSigner` shape the
 * `@formstr/sdk` expects.
 *
 * The signer classes implement their crypto/signing methods as plain (unbound)
 * class methods that read private fields (`#secretKey`, `#delegate`, `#plugin`)
 * through `this`. The SDK calls those methods off the `FormsSigner` object —
 * sometimes detached from it — so we MUST bind each method to the original
 * signer instance. Copying bare method references instead detaches `this` and
 * throws "Cannot read private member ... from an object whose class did not
 * declare it" the moment the SDK invokes them.
 */
export function toFormsSigner(signer: ActiveSigner): FormsSigner {
  return {
    signEvent: signer.signEvent.bind(signer),
    getPublicKey: signer.getPublicKey.bind(signer),
    nip44Decrypt: signer.nip44Decrypt.bind(signer),
    nip44Encrypt: signer.nip44Encrypt.bind(signer),
  };
}
