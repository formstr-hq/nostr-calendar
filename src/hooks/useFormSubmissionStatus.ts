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

const FORM_SUBMITTED_SESSION_PREFIX = "cal:form-submitted:";

function getSubmissionSessionKey(formCoordinate: string, userPubkey: string) {
  return `${FORM_SUBMITTED_SESSION_PREFIX}${formCoordinate}:${userPubkey}`;
}

function readSessionSubmission(
  formCoordinate: string,
  userPubkey: string,
): number | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(
      getSubmissionSessionKey(formCoordinate, userPubkey),
    );
  } catch {
    return null;
  }
  if (!raw) return null;
  const submittedAt = Number(raw);
  return Number.isFinite(submittedAt) ? submittedAt : null;
}

function writeSessionSubmission(
  formCoordinate: string,
  userPubkey: string,
  submittedAt: number,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      getSubmissionSessionKey(formCoordinate, userPubkey),
      String(submittedAt),
    );
  } catch {
    // Storage can be blocked; relay-backed lookup still works.
  }
}

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
    const formAddress = getFormAddress(naddr);
    if (!formAddress) {
      setStatus({ state: "error", error: "Invalid form address" });
      return;
    }

    const sessionSubmittedAt = readSessionSubmission(coordinate, userPubkey);
    if (sessionSubmittedAt) {
      setStatus({
        state: "submitted",
        event: null,
        submittedAt: sessionSubmittedAt,
      });
    } else {
      setStatus({ state: "loading" });
    }

    try {
      const event = await fetchUserFormResponse(
        formAddress.coordinate,
        userPubkey,
        formAddress.relayHints,
      );
      if (event) {
        writeSessionSubmission(coordinate, userPubkey, event.created_at * 1000);
        setStatus({
          state: "submitted",
          event,
          submittedAt: event.created_at * 1000,
        });
      } else if (sessionSubmittedAt) {
        setStatus({
          state: "submitted",
          event: null,
          submittedAt: sessionSubmittedAt,
        });
      } else {
        setStatus({ state: "not-submitted" });
      }
    } catch (err) {
      if (sessionSubmittedAt) {
        setStatus({
          state: "submitted",
          event: null,
          submittedAt: sessionSubmittedAt,
        });
        return;
      }
      setStatus({
        state: "error",
        error: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }, [naddr, userPubkey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Mark submitted for UI and same-session fallback while relays catch up. */
  const markSubmitted = useCallback(
    (event: NostrEvent) => {
      const coordinate = naddr ? getFormCoordinate(naddr) : null;
      const submittedAt = event.created_at * 1000;
      if (coordinate && userPubkey) {
        writeSessionSubmission(coordinate, userPubkey, submittedAt);
      }
      setStatus({
        state: "submitted",
        event,
        submittedAt,
      });
    },
    [naddr, userPubkey],
  );

  return { status, refresh, markSubmitted };
}
