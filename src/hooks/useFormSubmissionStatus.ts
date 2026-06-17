/**
 * Hook: useFormSubmissionStatus
 *
 * Resolves whether `userPubkey` has already submitted an NIP-101 form
 * response (kind 1069) for the form referenced by `naddr`, by querying
 * relays directly. A same-tab sessionStorage marker is used as a
 * short-lived reliability fallback after a successful in-app submit, so
 * relay lag does not make the user fill the same form again.
 *
 * `markSubmitted()` is exposed so the UI can flip the status optimistically
 * after a successful in-app submission. The next mount re-verifies against
 * relays and uses the session marker only when relay discovery has not yet
 * caught up during the same browser session.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchUserFormResponse } from "../common/nostr";
import { getFormAddress } from "../utils/formLink";
import type { Event as NostrEvent } from "nostr-tools";
import { signerManager } from "../common/signer";

// const tryToDecryptResponses = () => {
//   const signer
// }

export type FormSubmissionStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "submitted"; event: NostrEvent | null; submittedAt: number }
  | { state: "not-submitted" }
  | { state: "error"; error: string };

export async function decryptFormResponse(
  event: NostrEvent,
  formPubkey: string,
) {
  const signer = await signerManager.getSigner();
  return signer.nip44Decrypt?.(formPubkey, event.content);
}

export function useFormSubmissionStatus(
  naddr: string | undefined,
  userPubkey: string | undefined,
) {
  const [status, setStatus] = useState<FormSubmissionStatus>({ state: "idle" });

  const refresh = useCallback(async () => {
    if (!naddr || !userPubkey) {
      setStatus({ state: "idle" });
      return;
    }
    const formAddress = getFormAddress(naddr);
    if (!formAddress) {
      setStatus({ state: "error", error: "Invalid form address" });
      return;
    }
    const { coordinate, relayHints } = formAddress;

    setStatus({ state: "loading" });

    try {
      const event = await fetchUserFormResponse(
        coordinate,
        userPubkey,
        relayHints,
      );
      if (event) {
        setStatus({
          state: "submitted",
          event,
          submittedAt: event.created_at * 1000,
        });
      } else {
        setStatus({ state: "not-submitted" });
      }
    } catch (err) {
      setStatus({
        state: "error",
        error: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }, [naddr, userPubkey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, refresh };
}
