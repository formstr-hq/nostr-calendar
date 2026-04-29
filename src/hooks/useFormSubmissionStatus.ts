/**
 * Hook: useFormSubmissionStatus
 *
 * Resolves whether `userPubkey` has already submitted an NIP-101 form
 * response (kind 1069) for the form referenced by `naddr`, by querying
 * relays directly. The relay-backed result is the canonical answer —
 * we do NOT cache "submitted" in local memory across reloads.
 *
 * `markSubmitted()` is exposed so the UI can flip the status optimistically
 * after a successful in-app submission. The next mount will re-verify
 * against relays so an optimistic flag never silently masks reality.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchUserFormResponse } from "../common/nostr";
import { getFormCoordinate, getFormRelayHints } from "../utils/formLink";
import type { Event as NostrEvent } from "nostr-tools";

export type FormSubmissionStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "submitted"; event: NostrEvent | null; submittedAt: number }
  | { state: "not-submitted" }
  | { state: "error"; error: string };

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
    const coordinate = getFormCoordinate(naddr);
    if (!coordinate) {
      setStatus({ state: "error", error: "Invalid form address" });
      return;
    }
    setStatus({ state: "loading" });
    try {
      const event = await fetchUserFormResponse(
        coordinate,
        userPubkey,
        getFormRelayHints(naddr),
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

  /** Mark optimistically submitted; relays remain the source of truth on reload. */
  const markSubmitted = useCallback((event: NostrEvent) => {
    setStatus({
      state: "submitted",
      event,
      submittedAt: event.created_at * 1000,
    });
  }, []);

  return { status, refresh, markSubmitted };
}
